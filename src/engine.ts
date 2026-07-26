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
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return ((hash ^ (hash >>> 16)) >>> 0) % Math.max(1, length);
}

export function newSeed(): string {
  const values = new Uint32Array(2);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(36).padStart(7, "0"))
    .join("")
    .slice(0, 10)
    .toUpperCase();
}

export function dragonBase(patch: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}`;
}

export function plainText(html = ""): string {
  const spaced = html
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[\[[^\]]+\]\]/g, "")
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<li[^>]*>/gi, " • ")
    .replace(/<\/(?:p|div|li|stats|passive|active|mainText)>/gi, ". ");
  if (typeof DOMParser === "undefined") {
    return spaced
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return (
    new DOMParser()
      .parseFromString(spaced, "text/html")
      .body.textContent?.replace(/\s+/g, " ")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/([.;:])\1+/g, "$1")
      .trim() || ""
  );
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length || 0;
}

const rateRole: Record<Role, RateRole> = {
  Top: "TOP",
  Jungle: "JUNGLE",
  Mid: "MIDDLE",
  Bot: "BOTTOM",
  Support: "UTILITY",
};

export function championsForRole(
  champions: Record<string, DragonChampion>,
  rates: StaticData["championRates"],
  role: Role,
): DragonChampion[] {
  const all = Object.values(champions);
  const primaryPool = all.filter((champion) => {
    const championRates = rates[champion.key];
    if (!championRates) return false;
    const rankedRoles = Object.entries(championRates).sort(
      ([, first], [, second]) => (second?.playRate || 0) - (first?.playRate || 0),
    );
    return (rankedRoles[0]?.[1]?.playRate || 0) > 0 && rankedRoles[0]?.[0] === rateRole[role];
  });
  if (primaryPool.length) return primaryPool;
  const measuredPool = all.filter(
    (champion) => (rates[champion.key]?.[rateRole[role]]?.playRate || 0) > 0,
  );
  return measuredPool.length ? measuredPool : all;
}

export function selectTeam(
  champions: Record<string, DragonChampion>,
  _rates: StaticData["championRates"],
  seed: string,
  allowAnyRole = false,
  roleRerolls: Partial<Record<Role, number>> = {},
): Record<Role, DragonChampion> | null {
  const all = Object.values(champions);
  if (!all.length) return null;
  const used = new Set<string>();
  const team = {} as Record<Role, DragonChampion>;

  for (const role of ROLES) {
    const rolePool = allowAnyRole ? all : championsForRole(champions, _rates, role);
    const pool = rolePool.filter((champion) => !used.has(champion.id));
    const champion = pool[seededIndex(`${seed}-${role}`, pool.length)];
    team[role] = champion;
    used.add(champion.id);
  }

  for (const role of ROLES) {
    const rerollCount = roleRerolls[role] || 0;
    if (!rerollCount) continue;
    const unavailable = new Set(
      ROLES.filter((candidateRole) => candidateRole !== role).map(
        (candidateRole) => team[candidateRole].id,
      ),
    );
    const rolePool = allowAnyRole ? all : championsForRole(champions, _rates, role);
    let pool = rolePool.filter(
      (champion) => !unavailable.has(champion.id) && champion.id !== team[role].id,
    );
    for (let reroll = 1; reroll <= rerollCount; reroll += 1) {
      if (!pool.length) {
        pool = rolePool.filter(
          (champion) => !unavailable.has(champion.id) && champion.id !== team[role].id,
        );
      }
      const champion = pool[seededIndex(`${seed}-${role}-banned-${reroll}`, pool.length)];
      team[role] = champion;
      pool = pool.filter((candidate) => candidate.id !== champion.id);
    }
  }

  return team;
}

function roleRates(
  champion: DragonChampion,
  role: Role,
  rates: StaticData["championRates"],
): { rolePlayRate: number; primaryPlayRate: number; primaryRole: Role } {
  const championRates = rates[champion.key] || {};
  const rankedRoles = ROLES.map((candidateRole) => ({
    role: candidateRole,
    rate: championRates[rateRole[candidateRole]]?.playRate || 0,
  })).sort((first, second) => second.rate - first.rate);
  return {
    rolePlayRate: championRates[rateRole[role]]?.playRate || 0,
    primaryPlayRate: rankedRoles[0]?.rate || 0,
    primaryRole: rankedRoles[0]?.role || role,
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
  if (catalog[bootId]) result.splice(1, 0, [bootId, catalog[bootId]]);
  return result;
}

function deriveStarterItems(
  catalog: Record<string, DragonItem>,
  role: Role,
  profile: Profile,
): GeneratedLoadout["starterItems"] {
  const profileStarter: Record<Profile, string> = {
    "On-hit hybrid": "1055",
    "AP burst": "1056",
    "Physical bruiser": "1054",
    "AP bruiser": "1056",
    "Haste utility": "1056",
  };
  const junglePet: Record<Profile, string> = {
    "On-hit hybrid": "1102",
    "AP burst": "1101",
    "Physical bruiser": "1103",
    "AP bruiser": "1103",
    "Haste utility": "1102",
  };
  const starterId =
    role === "Jungle" ? junglePet[profile] : role === "Support" ? "3865" : profileStarter[profile];
  const purchases: GeneratedLoadout["starterItems"] = [];
  if (catalog[starterId]) purchases.push({ id: starterId, item: catalog[starterId], quantity: 1 });
  if (catalog["2003"]) {
    const quantity = role === "Support" || starterId === "1056" ? 2 : 1;
    purchases.push({ id: "2003", item: catalog["2003"], quantity });
  }
  return purchases;
}

function observedStarterItems(
  catalog: Record<string, DragonItem>,
  itemIds: string[],
): GeneratedLoadout["starterItems"] {
  const counts = new Map<string, number>();
  itemIds.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  return [...counts.entries()].flatMap(([id, quantity]) =>
    catalog[id] ? [{ id, item: catalog[id], quantity }] : [],
  );
}

function observedItems(
  catalog: Record<string, DragonItem>,
  itemIds: string[],
): [string, DragonItem][] {
  return itemIds.flatMap((id) => (catalog[id] ? [[id, catalog[id]]] : []));
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

function deriveAbilityOrder(
  detail: ChampionDetail,
  profile: Profile,
  seed: string,
): ChampionDetail["spells"] {
  const keywords: Record<Profile, RegExp> = {
    "On-hit hybrid": /attack|on-hit|attack speed|empower/,
    "AP burst": /scaleap|magic damage|ability power/,
    "Physical bruiser": /scalead|attack damage|heal|shield/,
    "AP bruiser": /scaleap|health|heal|shield/,
    "Haste utility": /shield|heal|slow|stun|movement/,
  };
  return [...detail.spells].slice(0, 3).sort((first, second) => {
    const firstText = `${first.description} ${first.tooltip}`.toLowerCase();
    const secondText = `${second.description} ${second.tooltip}`.toLowerCase();
    const firstScore =
      (keywords[profile].test(firstText) ? 10 : 0) + seededIndex(`${seed}-${first.id}`, 50);
    const secondScore =
      (keywords[profile].test(secondText) ? 10 : 0) + seededIndex(`${seed}-${second.id}`, 50);
    return secondScore - firstScore;
  });
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
  const rankedRole = rateRole[role];
  const championKey = champion.id.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  const observedBuild =
    data.builds?.[championKey]?.[rankedRole] ||
    data.builds?.[championKey]?.[rateRole[playRates.primaryRole]];
  const starterItems = observedBuild
    ? observedStarterItems(data.items, observedBuild.starterItemIds)
    : deriveStarterItems(data.items, role, profile);
  const items = observedBuild
    ? observedItems(data.items, observedBuild.itemIds)
    : deriveItems(data.items, profile, `${seed}-${role}`);
  return {
    role,
    champion,
    detail,
    profile,
    signals,
    ...playRates,
    rankedStat: data.rankedStats[championKey]?.[rankedRole],
    matchups: data.matchups[championKey]?.[rankedRole],
    abilityOrder: deriveAbilityOrder(detail, profile, seed),
    starterItems,
    items,
    runes: deriveRunes(data.runeStyles, profile, role, `${seed}-${role}`),
    summoners: deriveSummoners(data.summoners, role, profile),
  };
}
