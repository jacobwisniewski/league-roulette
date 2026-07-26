import type {
  ChampionDetail,
  DragonChampion,
  DragonItem,
  DragonRune,
  DragonSummoner,
  GeneratedLoadout,
  Profile,
  Role,
  RateRole,
  RuneStyle,
  StaticData,
} from "./types";
import { ROLES } from "./types";

export const FALLBACK_PATCH = "16.14.1";

export function seededIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % Math.max(1, length);
}

export function newSeed(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function dragonBase(patch: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}`;
}

export function plainText(html = ""): string {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, " ");
  return (
    new DOMParser()
      .parseFromString(html, "text/html")
      .body.textContent?.replace(/\s+/g, " ")
      .trim() || ""
  );
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length || 0;
}

function inferUsualRole(champion: DragonChampion): Role {
  if (champion.tags.includes("Marksman")) return "Bot";
  if (champion.tags.includes("Assassin") || champion.tags.includes("Mage")) return "Mid";
  if (champion.tags.includes("Support")) return "Support";
  if (champion.tags.includes("Tank")) {
    return seededIndex(champion.id, 3) === 0 ? "Jungle" : "Top";
  }
  return seededIndex(champion.id, 2) ? "Top" : "Jungle";
}

const rateRole: Record<Role, RateRole> = {
  Top: "TOP",
  Jungle: "JUNGLE",
  Mid: "MIDDLE",
  Bot: "BOTTOM",
  Support: "UTILITY",
};

export function selectTeam(
  champions: Record<string, DragonChampion>,
  rates: StaticData["championRates"],
  seed: string,
): Record<Role, DragonChampion> | null {
  const all = Object.values(champions);
  if (!all.length) return null;
  const used = new Set<string>();
  const team = {} as Record<Role, DragonChampion>;

  for (const role of ROLES) {
    const measuredPool = all.filter((champion) => {
      const championRates = rates[champion.key];
      if (!championRates || used.has(champion.id)) return false;
      const values = Object.values(championRates).map((entry) => entry?.playRate || 0);
      const primary = Math.max(...values);
      const target = championRates[rateRole[role]]?.playRate || 0;
      return target > 0 && primary > 0 && target < primary * 0.35;
    });
    const fallbackPool = all.filter(
      (champion) => inferUsualRole(champion) !== role && !used.has(champion.id),
    );
    const pool = measuredPool.length ? measuredPool : fallbackPool;
    const champion = pool[seededIndex(`${seed}-${role}`, pool.length)];
    team[role] = champion;
    used.add(champion.id);
  }
  return team;
}

function roleRates(
  champion: DragonChampion,
  role: Role,
  rates: StaticData["championRates"],
): { rolePlayRate: number; primaryPlayRate: number } {
  const championRates = rates[champion.key] || {};
  const values = Object.values(championRates).map((entry) => entry?.playRate || 0);
  return {
    rolePlayRate: championRates[rateRole[role]]?.playRate || 0,
    primaryPlayRate: Math.max(0, ...values),
  };
}

function analyseKit(detail: ChampionDetail): {
  profile: Profile;
  signals: GeneratedLoadout["signals"];
} {
  const text = [
    detail.passive.description,
    ...detail.spells.map((spell) => `${spell.description} ${spell.tooltip}`),
  ]
    .join(" ")
    .toLowerCase();
  const signals = {
    attack: count(
      text,
      /basic attack|on-hit|attack speed|critical strike|every third attack|empowered attack/g,
    ),
    ap: count(text, /scaleap|ability power|\{\{\s*a[p0-9]/g),
    ad: count(text, /scalead|attack damage|bonus ad|\{\{\s*[bf]?[ad][0-9]/g),
    defense: count(text, /shield|armor|magic resistance|maximum health|bonus health|healing/g),
  };

  const profiles: { profile: Profile; score: number }[] = [
    {
      profile: "On-hit hybrid",
      score:
        signals.attack * 4 + signals.ap + signals.ad - (detail.tags.includes("Marksman") ? 8 : 0),
    },
    {
      profile: "AP burst",
      score: signals.ap * 3 - (detail.tags.includes("Mage") ? 5 : 0),
    },
    {
      profile: "Physical bruiser",
      score: signals.ad * 3 + signals.defense - (detail.tags.includes("Fighter") ? 3 : 0),
    },
    {
      profile: "AP bruiser",
      score: signals.ap * 2 + signals.defense * 2 - (detail.tags.includes("Mage") ? 2 : 0),
    },
    {
      profile: "Haste utility",
      score: signals.defense * 2 + detail.spells.length,
    },
  ];
  profiles.sort((first, second) => second.score - first.score);
  return { profile: profiles[0].profile, signals };
}

function itemScore(item: DragonItem, profile: Profile, seed: string, id: string): number {
  const stats = item.stats || {};
  const text = `${item.name} ${item.description} ${item.plaintext}`.toLowerCase();
  let score = 0;

  if (profile === "On-hit hybrid") {
    score += (stats.PercentAttackSpeedMod || 0) * 280;
    score += (stats.FlatPhysicalDamageMod || 0) * 0.55 + (stats.FlatMagicDamageMod || 0) * 0.4;
    if (/on-hit|basic attack|every third attack|attack speed/.test(text)) score += 34;
  } else if (profile === "AP burst") {
    score += (stats.FlatMagicDamageMod || 0) * 0.9 + (stats.FlatMPPoolMod || 0) * 0.02;
    if (/magic penetration|ability damage|spell damage/.test(text)) score += 28;
  } else if (profile === "Physical bruiser") {
    score += (stats.FlatPhysicalDamageMod || 0) * 0.75 + (stats.FlatHPPoolMod || 0) * 0.08;
    if (/spellblade|maximum health|healing|attack damage/.test(text)) score += 22;
  } else if (profile === "AP bruiser") {
    score +=
      (stats.FlatMagicDamageMod || 0) * 0.65 +
      (stats.FlatHPPoolMod || 0) * 0.1 +
      (stats.FlatArmorMod || 0) * 0.2 +
      (stats.FlatSpellBlockMod || 0) * 0.2;
    if (/omnivamp|maximum health|healing|ability power/.test(text)) score += 24;
  } else {
    score += (stats.FlatHPPoolMod || 0) * 0.07 + (stats.FlatMagicDamageMod || 0) * 0.3;
    if (/ability haste|heal|shield|movement speed|ally/.test(text)) score += 30;
  }
  return score + seededIndex(`${seed}-${id}`, 1000) / 100;
}

function deriveItems(
  catalog: Record<string, DragonItem>,
  profile: Profile,
  seed: string,
): [string, DragonItem][] {
  const result = Object.entries(catalog)
    .filter(
      ([, item]) =>
        item.gold?.purchasable &&
        item.gold.total >= 2200 &&
        item.maps?.["11"] &&
        !item.tags?.includes("Boots") &&
        !item.into?.length &&
        !/ornn|arena|support quest|talisman|gold income/i.test(`${item.name} ${item.description}`),
    )
    .map(([id, item]) => ({ id, item, score: itemScore(item, profile, seed, id) }))
    .filter(({ score }) => score > 20)
    .sort((first, second) => second.score - first.score)
    .slice(0, 5)
    .map(({ id, item }) => [id, item] as [string, DragonItem]);

  const boots: Record<Profile, string> = {
    "On-hit hybrid": "3006",
    "AP burst": "3020",
    "Physical bruiser": "3047",
    "AP bruiser": "3111",
    "Haste utility": "3158",
  };
  const bootId = boots[profile];
  if (catalog[bootId]) result.push([bootId, catalog[bootId]]);
  return result;
}

function runeScore(rune: DragonRune, profile: Profile, role: Role, seed: string): number {
  const text = `${rune.name} ${plainText(rune.longDesc || rune.shortDesc)}`.toLowerCase();
  const terms: Record<Profile, string[]> = {
    "On-hit hybrid": ["attack", "attack speed", "basic attack", "damage", "adaptive"],
    "AP burst": ["ability", "damage", "adaptive", "magic", "champion"],
    "Physical bruiser": ["health", "heal", "damage", "resist", "takedown"],
    "AP bruiser": ["health", "heal", "ability", "damage", "resist"],
    "Haste utility": ["haste", "mana", "ally", "shield", "movement", "heal"],
  };
  let score = terms[profile].reduce((total, term) => total + (text.includes(term) ? 5 : 0), 0);
  if (role === "Jungle" && /monster|takedown|movement/.test(text)) score += 5;
  if (role === "Support" && /ally|heal|shield|immobiliz/.test(text)) score += 7;
  return score + seededIndex(`${seed}-${rune.id}`, 500) / 100;
}

function deriveRunes(
  styles: RuneStyle[],
  profile: Profile,
  role: Role,
  seed: string,
): DragonRune[] {
  if (!styles.length) return [];
  const ranked = styles
    .map((style) => ({
      style,
      score: style.slots.reduce(
        (total, slot) =>
          total + Math.max(...slot.runes.map((rune) => runeScore(rune, profile, role, seed))),
        0,
      ),
    }))
    .sort((first, second) => second.score - first.score);
  const primary = ranked[0].style;
  const secondary = ranked[1].style;
  const primaryRunes = primary.slots.map(
    (slot) =>
      [...slot.runes].sort(
        (first, second) =>
          runeScore(second, profile, role, seed) - runeScore(first, profile, role, seed),
      )[0],
  );
  const secondaryRunes = secondary.slots
    .slice(1)
    .map(
      (slot) =>
        [...slot.runes].sort(
          (first, second) =>
            runeScore(second, profile, role, seed) - runeScore(first, profile, role, seed),
        )[0],
    )
    .sort(
      (first, second) =>
        runeScore(second, profile, role, seed) - runeScore(first, profile, role, seed),
    )
    .slice(0, 2);
  return [...primaryRunes, ...secondaryRunes];
}

function deriveSummoners(
  catalog: Record<string, DragonSummoner>,
  role: Role,
  profile: Profile,
): DragonSummoner[] {
  const spells = Object.values(catalog).filter((spell) => spell.modes?.includes("CLASSIC"));
  const find = (name: string): DragonSummoner | undefined =>
    spells.find((spell) => spell.name === name);
  const first = role === "Jungle" ? find("Smite") : find("Flash");
  const preference =
    role === "Support"
      ? ["Exhaust", "Heal", "Ignite"]
      : profile === "On-hit hybrid"
        ? ["Ghost", "Barrier", "Ignite"]
        : profile === "AP burst"
          ? ["Ignite", "Barrier", "Ghost"]
          : role === "Top"
            ? ["Teleport", "Ghost", "Ignite"]
            : role === "Bot"
              ? ["Barrier", "Heal", "Ghost"]
              : ["Ghost", "Ignite", "Barrier"];
  const second = preference.map(find).find(Boolean);
  return [first, second].filter((spell): spell is DragonSummoner => spell !== undefined);
}

function deriveMaxSpell(
  detail: ChampionDetail,
  profile: Profile,
  seed: string,
): ChampionDetail["spells"][number] {
  const keywords: Record<Profile, RegExp> = {
    "On-hit hybrid": /attack|on-hit|attack speed|empower/,
    "AP burst": /scaleap|magic damage|ability power/,
    "Physical bruiser": /scalead|attack damage|heal|shield/,
    "AP bruiser": /scaleap|health|heal|shield/,
    "Haste utility": /shield|heal|slow|stun|movement/,
  };
  return [...detail.spells].sort((first, second) => {
    const firstText = `${first.description} ${first.tooltip}`.toLowerCase();
    const secondText = `${second.description} ${second.tooltip}`.toLowerCase();
    const firstScore =
      (keywords[profile].test(firstText) ? 10 : 0) + seededIndex(`${seed}-${first.id}`, 50);
    const secondScore =
      (keywords[profile].test(secondText) ? 10 : 0) + seededIndex(`${seed}-${second.id}`, 50);
    return secondScore - firstScore;
  })[0];
}

export function generateLoadout(
  role: Role,
  champion: DragonChampion,
  detail: ChampionDetail,
  data: StaticData,
  seed: string,
): GeneratedLoadout {
  const { profile, signals } = analyseKit(detail);
  const playRates = roleRates(champion, role, data.championRates);
  return {
    role,
    champion,
    detail,
    profile,
    signals,
    ...playRates,
    maxSpell: deriveMaxSpell(detail, profile, seed),
    items: deriveItems(data.items, profile, `${seed}-${role}`),
    runes: deriveRunes(data.runeStyles, profile, role, `${seed}-${role}`),
    summoners: deriveSummoners(data.summoners, role, profile),
  };
}
