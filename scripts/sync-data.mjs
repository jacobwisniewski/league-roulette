import { mkdir, writeFile } from "node:fs/promises";
import { compressors } from "hyparquet-compressors";
import { parquetReadObjects } from "hyparquet";

const dataDirectory = new URL("../public/data/", import.meta.url);
const ratesOutput = new URL("championrates.json", dataDirectory);
const rankedOutput = new URL("rankedstats.json", dataDirectory);
const matchupsOutput = new URL("matchups.json", dataDirectory);
const buildsOutput = new URL("builds.json", dataDirectory);
const ratesSource =
  "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/championrates.json";
const rankedSource =
  "https://huggingface.co/datasets/HakimT/lol-champion-ranked-stats/resolve/main/data/train-00000-of-00001.parquet";
const roleMap = {
  top: "TOP",
  jungle: "JUNGLE",
  mid: "MIDDLE",
  middle: "MIDDLE",
  adc: "BOTTOM",
  bottom: "BOTTOM",
  support: "UTILITY",
};
const laneMap = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "middle",
  BOTTOM: "bottom",
  UTILITY: "support",
};

function championKey(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function tierRows(rows) {
  const sorted = [...rows].sort((first, second) => {
    const firstScore = first.winRate * 0.68 + Math.log1p(first.pickRate) * 6.2;
    const secondScore = second.winRate * 0.68 + Math.log1p(second.pickRate) * 6.2;
    return secondScore - firstScore;
  });
  return sorted.map((row, index) => {
    const percentile = index / Math.max(1, sorted.length);
    const tier =
      percentile < 0.1
        ? "S"
        : percentile < 0.3
          ? "A"
          : percentile < 0.6
            ? "B"
            : percentile < 0.85
              ? "C"
              : "D";
    return { ...row, tier };
  });
}

async function syncRankedStats() {
  const response = await fetch(rankedSource);
  if (!response.ok) throw new Error(`Ranked-stat sync failed with ${response.status}`);
  const rows = await parquetReadObjects({
    file: await response.arrayBuffer(),
    compressors,
    columns: ["champion", "role", "date", "patch", "pickrate", "winrate", "banrate"],
  });
  const latest = new Map();
  for (const row of rows) {
    const role = roleMap[String(row.role).toLowerCase()];
    if (!role || Number(row.winrate) <= 0 || Number(row.pickrate) <= 0) continue;
    const key = `${championKey(String(row.champion))}:${role}`;
    const date = new Date(row.date).getTime();
    if (!latest.has(key) || date > latest.get(key).date) {
      latest.set(key, {
        champion: championKey(String(row.champion)),
        role,
        date,
        patch: String(row.patch),
        winRate: Number(row.winrate),
        pickRate: Number(row.pickrate),
        banRate: Number(row.banrate),
      });
    }
  }
  const grouped = Object.groupBy([...latest.values()], (row) => row.role);
  const data = {};
  for (const roleRows of Object.values(grouped)) {
    for (const row of tierRows(roleRows || [])) {
      data[row.champion] ||= {};
      data[row.champion][row.role] = {
        winRate: row.winRate,
        pickRate: row.pickRate,
        banRate: row.banRate,
        tier: row.tier,
      };
    }
  }
  const latestRow = [...latest.values()].sort((a, b) => b.date - a.date)[0];
  await writeFile(
    rankedOutput,
    `${JSON.stringify({ patch: latestRow?.patch || "unknown", data }, null, 2)}\n`,
  );
  console.log("Synced automated ranked champion statistics.");
}

function matchupWinRate(html, champion, opponent) {
  const marker = `/lol/${champion}/vs/${opponent}/build/`;
  let index = -1;
  while ((index = html.indexOf(marker, index + 1)) >= 0) {
    const rate = html
      .slice(index, index + 2_500)
      .match(/<!--t=[^>]+-->(\d+(?:\.\d+)?)<!---->%/)?.[1];
    if (rate) return Number(rate);
  }
  return 0;
}

async function fetchMatchup(champion, role, championMeta) {
  const lane = laneMap[role];
  const url = `https://lolalytics.com/lol/${champion.id.toLowerCase()}/counters/?lane=${lane}&vslane=${lane}&tier=emerald_plus`;
  const response = await fetch(url, { headers: { "user-agent": "League Roulette data sync" } });
  if (!response.ok) return null;
  const html = await response.text();
  const championId = champion.id.toLowerCase();
  const opponentIds = [
    ...new Set(
      [...html.matchAll(new RegExp(`/lol/${championId}/vs/([^/"]+)/build/`, "g"))].map(
        (match) => match[1],
      ),
    ),
  ];
  const candidates = opponentIds
    .map((id) => ({
      id,
      name: championMeta[id]?.name,
      role: championMeta[id]?.role,
      winRate: matchupWinRate(html, championId, id),
    }))
    .filter((opponent) => opponent.name && opponent.role === role && opponent.winRate)
    .sort((first, second) => second.winRate - first.winRate);
  const strongInto = candidates.slice(0, 3).map(({ id, name, winRate }) => ({
    id,
    name,
    winRate,
  }));
  const strugglesInto = candidates
    .slice(-3)
    .reverse()
    .map(({ id, name, winRate }) => ({ id, name, winRate }));
  return strongInto.length && strugglesInto.length ? { strongInto, strugglesInto } : null;
}

function itemIds(fragment) {
  return [...fragment.matchAll(/item64\/(\d+)\.webp/g)].map((match) => match[1]);
}

function highestWinBuild(html) {
  const summaryStart = html.indexOf("summary_win");
  if (summaryStart < 0) return null;
  const summary = html.slice(summaryStart, summaryStart + 125_000);
  const startingIndex = summary.indexOf("Starting Items");
  const coreIndex = summary.indexOf("Core Build");
  const item4Index = summary.indexOf("Item 4", coreIndex);
  const item5Index = summary.indexOf("Item 5", item4Index);
  const item6Index = summary.indexOf("Item 6", item5Index);
  if ([startingIndex, coreIndex, item4Index, item5Index, item6Index].some((index) => index < 0)) {
    return null;
  }

  const starterItemIds = [...new Set(itemIds(summary.slice(startingIndex, coreIndex)))];
  const coreItemIds = [...new Set(itemIds(summary.slice(coreIndex, item4Index)))].slice(0, 3);
  const selected = [...coreItemIds];
  const chooseNext = (start, end) => {
    const next = itemIds(summary.slice(start, end)).find((id) => !selected.includes(id));
    if (next) selected.push(next);
  };
  chooseNext(item4Index, item5Index);
  chooseNext(item5Index, item6Index);
  chooseNext(item6Index, summary.length);
  if (!starterItemIds.length || selected.length < 4) return null;
  return { starterItemIds, itemIds: selected.slice(0, 6) };
}

async function fetchBuild(champion, role) {
  const lane = laneMap[role];
  const url = `https://lolalytics.com/lol/${champion.id.toLowerCase()}/build/?lane=${lane}&tier=emerald_plus`;
  const response = await fetch(url, { headers: { "user-agent": "League Roulette data sync" } });
  if (!response.ok) return null;
  return highestWinBuild(await response.text());
}

async function syncMatchups(rates) {
  const versions = await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then(
    (response) => response.json(),
  );
  const patch = versions[0];
  const champions = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`,
  ).then((response) => response.json());
  const queue = Object.values(champions.data).map((champion) => {
    const entries = Object.entries(rates.data[champion.key] || {}).sort(
      ([, first], [, second]) => (second.playRate || 0) - (first.playRate || 0),
    );
    return { champion, role: entries[0]?.[0] };
  });
  const championMeta = {};
  for (const { champion, role } of queue) {
    for (const alias of [champion.id.toLowerCase(), championKey(champion.name)]) {
      championMeta[alias] = { name: champion.name, role };
    }
  }
  const data = {};
  const builds = {};
  for (let offset = 0; offset < queue.length; offset += 8) {
    const batch = queue.slice(offset, offset + 8);
    const results = await Promise.all(
      batch.map(async ({ champion, role }) => {
        if (!role) return { matchup: null, build: null };
        const [matchup, build] = await Promise.all([
          fetchMatchup(champion, role, championMeta),
          fetchBuild(champion, role),
        ]);
        return { matchup, build };
      }),
    );
    results.forEach(({ matchup, build }, index) => {
      const { champion, role } = batch[index];
      const key = championKey(champion.id);
      if (matchup) {
        data[key] ||= {};
        data[key][role] = matchup;
      }
      if (build) {
        builds[key] ||= {};
        builds[key][role] = build;
      }
    });
  }
  await writeFile(matchupsOutput, `${JSON.stringify({ patch, data }, null, 2)}\n`);
  await writeFile(buildsOutput, `${JSON.stringify({ patch, data: builds }, null, 2)}\n`);
  console.log("Synced role-specific champion matchups.");
  console.log("Synced highest-win champion builds.");
}

await mkdir(dataDirectory, { recursive: true });
const ratesResponse = await fetch(ratesSource);
if (!ratesResponse.ok) throw new Error(`Champion-rate sync failed with ${ratesResponse.status}`);
const rates = await ratesResponse.json();
await writeFile(ratesOutput, `${JSON.stringify(rates, null, 2)}\n`);
await syncRankedStats();
if (process.argv.includes("--matchups")) await syncMatchups(rates);
console.log("Synced automated champion role rates.");
