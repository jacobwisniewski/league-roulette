export const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
export type Role = (typeof ROLES)[number];
export type View = "landing" | "selection" | "result";
export type Profile =
  | "On-hit hybrid"
  | "AP burst"
  | "Physical bruiser"
  | "AP bruiser"
  | "Haste utility";

export interface DragonItem {
  name: string;
  description: string;
  plaintext: string;
  tags: string[];
  gold: { purchasable: boolean; total: number };
  maps: Record<string, boolean>;
  into?: string[];
  stats: Record<string, number>;
}

export interface DragonChampion {
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
  image: { full: string };
}

export type RateRole = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";
export type ChampionRates = Record<string, Partial<Record<RateRole, { playRate: number }>>>;

export interface RankedStat {
  winRate: number;
  pickRate: number;
  banRate: number;
  tier: "S" | "A" | "B" | "C" | "D";
}

export interface ChampionMatchups {
  strongInto: MatchupOpponent[];
  strugglesInto: MatchupOpponent[];
}

export interface MatchupOpponent {
  id: string;
  name: string;
  winRate: number;
}

export interface DragonSpell {
  id: string;
  name: string;
  description: string;
  tooltip: string;
  image: { full: string };
}

export interface ChampionDetail extends DragonChampion {
  info: { attack: number; defense: number; magic: number; difficulty: number };
  passive: { name: string; description: string; image: { full: string } };
  spells: DragonSpell[];
}

export interface DragonRune {
  id: number;
  key: string;
  icon: string;
  name: string;
  shortDesc: string;
  longDesc: string;
}

export interface RuneStyle {
  id: number;
  key: string;
  icon: string;
  name: string;
  slots: { runes: DragonRune[] }[];
}

export interface DragonSummoner {
  id: string;
  name: string;
  description: string;
  cooldownBurn: string;
  modes: string[];
  image: { full: string };
}

export interface StaticData {
  patch: string;
  ratePatch: string;
  items: Record<string, DragonItem>;
  champions: Record<string, DragonChampion>;
  championRates: ChampionRates;
  rankedStats: Record<string, Partial<Record<RateRole, RankedStat>>>;
  matchups: Record<string, Partial<Record<RateRole, ChampionMatchups>>>;
  runeStyles: RuneStyle[];
  summoners: Record<string, DragonSummoner>;
}

export interface GeneratedLoadout {
  role: Role;
  champion: DragonChampion;
  detail: ChampionDetail;
  profile: Profile;
  abilityOrder: DragonSpell[];
  starterItems: { id: string; item: DragonItem; quantity: number }[];
  items: [string, DragonItem][];
  runes: DragonRune[];
  summoners: DragonSummoner[];
  signals: { attack: number; ap: number; ad: number; defense: number };
  rolePlayRate: number;
  primaryPlayRate: number;
  primaryRole: Role;
  rankedStat?: RankedStat;
  matchups?: ChampionMatchups;
}
