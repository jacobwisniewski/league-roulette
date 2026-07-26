import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Dices,
  Flame,
  Info,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Swords,
} from "lucide-react";

type Role = "Top" | "Jungle" | "Mid" | "Bot" | "Support";
type Heat = "Spicy" | "Brave" | "Cursed";

type Challenge = {
  champion: string;
  key: string;
  title: string;
  roles: Role[];
  heat: Heat[];
  difficulty: number;
  damage: string;
  concept: string;
  max: string;
  summoners: string[];
  runes: string[];
  items: [string, string][];
  proof: string[];
  tips: string[];
};

type DragonItem = {
  name: string;
  description: string;
  plaintext: string;
  tags: string[];
  gold: { purchasable: boolean; total: number };
  maps: Record<string, boolean>;
  into?: string[];
  stats: Record<string, number>;
};

type DragonChampion = {
  id: string;
  name: string;
  image: { full: string };
};

const FALLBACK_PATCH = "16.14.1";

const challenges: Challenge[] = [
  {
    champion: "Bard",
    key: "Bard",
    title: "The Collector",
    roles: ["Top"],
    heat: ["Brave", "Cursed"],
    difficulty: 4,
    damage: "On-hit / magic",
    concept: "Turn Meeps into a roaming duelist engine. Chimes supply the scaling; attack speed makes every return to lane dangerous.",
    max: "Q · Cosmic Binding",
    summoners: ["Flash", "Ignite"],
    runes: ["Lethal Tempo", "Presence of Mind", "Alacrity", "Cut Down", "Celerity", "Scorch"],
    items: [["3124", "Guinsoo's Rageblade"], ["3115", "Nashor's Tooth"], ["3302", "Terminus"], ["3085", "Runaan's Hurricane"], ["3153", "Blade of the Ruined King"], ["3006", "Berserker's Greaves"]],
    proof: ["Meeps amplify basic attacks", "Chimes grant out-of-combat tempo", "Q gives real lane control"],
    tips: ["Trade when two Meeps are ready.", "Use portals to shorten bad recalls.", "Do not chase before collecting nearby chimes."],
  },
  {
    champion: "Thresh",
    key: "Thresh",
    title: "Soul Tax",
    roles: ["Top", "Bot"],
    heat: ["Brave", "Cursed"],
    difficulty: 5,
    damage: "Crit / magic",
    concept: "Flay's passive turns patient attacks into huge mixed-damage hits. Souls cover the defensive stats your items ignore.",
    max: "E · Flay",
    summoners: ["Flash", "Ghost"],
    runes: ["Fleet Footwork", "Triumph", "Alacrity", "Last Stand", "Second Wind", "Overgrowth"],
    items: [["6672", "Kraken Slayer"], ["3078", "Trinity Force"], ["3031", "Infinity Edge"], ["3094", "Rapid Firecannon"], ["3036", "Lord Dominik's Regards"], ["3006", "Berserker's Greaves"]],
    proof: ["E stores bonus on-hit magic damage", "Souls add armor and AP", "Range control enables short trades"],
    tips: ["Let Flay charge before trading.", "Use lantern for vision, not decoration.", "Save hook to punish their disengage."],
  },
  {
    champion: "Neeko",
    key: "Neeko",
    title: "Three-Hit Witness",
    roles: ["Bot", "Top"],
    heat: ["Spicy", "Brave"],
    difficulty: 3,
    damage: "On-hit / hybrid",
    concept: "Shapesplitter's third hit already wants attack speed. This route turns a mage passive into sustained side-lane pressure.",
    max: "W · Shapesplitter",
    summoners: ["Flash", "Barrier"],
    runes: ["Press the Attack", "Presence of Mind", "Alacrity", "Cut Down", "Celerity", "Gathering Storm"],
    items: [["3115", "Nashor's Tooth"], ["3124", "Guinsoo's Rageblade"], ["6672", "Kraken Slayer"], ["3302", "Terminus"], ["3085", "Runaan's Hurricane"], ["3006", "Berserker's Greaves"]],
    proof: ["W has a scaling third-hit passive", "Clone creates safe spacing", "Root preserves damage uptime"],
    tips: ["Prime your third hit on minions.", "Disguise as a melee minion to hide intent.", "Use clone to break target lock."],
  },
  {
    champion: "Nautilus",
    key: "Nautilus",
    title: "Deep AP",
    roles: ["Mid"],
    heat: ["Spicy", "Brave"],
    difficulty: 3,
    damage: "Burst magic",
    concept: "Four damaging spells, reliable target access, and a shield that also scales with AP make Nautilus a surprisingly complete burst mage.",
    max: "E · Riptide",
    summoners: ["Flash", "Ignite"],
    runes: ["Electrocute", "Cheap Shot", "Eyeball Collection", "Ultimate Hunter", "Manaflow Band", "Scorch"],
    items: [["3152", "Hextech Rocketbelt"], ["3100", "Lich Bane"], ["4646", "Stormsurge"], ["3089", "Rabadon's Deathcap"], ["3135", "Void Staff"], ["3020", "Sorcerer's Shoes"]],
    proof: ["Every active ability has an AP ratio", "Point-and-click R starts the combo", "Passive roots for Lich Bane delivery"],
    tips: ["E at close range can hit the same target twice.", "Rocketbelt fixes awkward hook angles.", "Roam when the wave is safely cleared."],
  },
  {
    champion: "Shen",
    key: "Shen",
    title: "Spirit Blender",
    roles: ["Jungle", "Top"],
    heat: ["Spicy", "Brave"],
    difficulty: 4,
    damage: "On-hit / magic",
    concept: "Empowered Twilight Assault attacks scale with target health. Attack speed lets Shen cash in every empowered blade before it expires.",
    max: "Q · Twilight Assault",
    summoners: ["Smite", "Ghost"],
    runes: ["Lethal Tempo", "Triumph", "Alacrity", "Last Stand", "Cheap Shot", "Ultimate Hunter"],
    items: [["3115", "Nashor's Tooth"], ["3124", "Guinsoo's Rageblade"], ["3302", "Terminus"], ["3153", "Blade of the Ruined King"], ["3748", "Titanic Hydra"], ["3006", "Berserker's Greaves"]],
    proof: ["Q adds max-health magic damage", "W blocks return attacks", "Global R preserves map value"],
    tips: ["Drag the blade through targets.", "Hold W for their attack steroid.", "Farm toward six; do not force coinflip ganks."],
  },
  {
    champion: "Ivern",
    key: "Ivern",
    title: "Brush Marksman",
    roles: ["Top", "Bot"],
    heat: ["Brave", "Cursed"],
    difficulty: 5,
    damage: "On-hit / magic",
    concept: "Brushmaker grants ranged attacks and bonus magic damage. Daisy supplies the frontline that a marksman build normally lacks.",
    max: "W · Brushmaker",
    summoners: ["Flash", "Ghost"],
    runes: ["Fleet Footwork", "Presence of Mind", "Alacrity", "Cut Down", "Celerity", "Gathering Storm"],
    items: [["3115", "Nashor's Tooth"], ["6672", "Kraken Slayer"], ["3124", "Guinsoo's Rageblade"], ["3302", "Terminus"], ["3085", "Runaan's Hurricane"], ["3006", "Berserker's Greaves"]],
    proof: ["W grants ranged on-hit damage", "Daisy peels and knocks up", "E shields scale from Nashor's AP"],
    tips: ["Fight from self-made brush.", "Use Daisy to absorb skillshots.", "Never reveal your escape brush too early."],
  },
  {
    champion: "Blitzcrank",
    key: "Blitzcrank",
    title: "Overclocked",
    roles: ["Top", "Jungle"],
    heat: ["Brave", "Cursed"],
    difficulty: 5,
    damage: "On-hit / physical",
    concept: "Overdrive gives an enormous attack-speed window, while Power Fist resets the rhythm and keeps targets close enough to finish.",
    max: "W · Overdrive",
    summoners: ["Ghost", "Smite"],
    runes: ["Lethal Tempo", "Triumph", "Alacrity", "Last Stand", "Cheap Shot", "Relentless Hunter"],
    items: [["6672", "Kraken Slayer"], ["3078", "Trinity Force"], ["3302", "Terminus"], ["3153", "Blade of the Ruined King"], ["3073", "Experimental Hexplate"], ["3006", "Berserker's Greaves"]],
    proof: ["W is a huge attack-speed steroid", "E resets and doubles base attack damage", "R passive adds on-hit magic damage"],
    tips: ["Start fights with E when hook is uncertain.", "Back off before Overdrive slows you.", "Use R after its passive has stacked."],
  },
  {
    champion: "Tahm Kench",
    key: "TahmKench",
    title: "The Lickmaker",
    roles: ["Mid", "Top"],
    heat: ["Spicy", "Brave"],
    difficulty: 3,
    damage: "AP bruiser",
    concept: "An Acquired Taste and Tongue Lash both reward health plus AP. The result is strange, durable, and brutally hard to disengage from.",
    max: "Q · Tongue Lash",
    summoners: ["Ghost", "Ignite"],
    runes: ["Grasp of the Undying", "Shield Bash", "Second Wind", "Overgrowth", "Approach Velocity", "Magical Footwear"],
    items: [["6657", "Rod of Ages"], ["4633", "Riftmaker"], ["3115", "Nashor's Tooth"], ["3084", "Heartsteel"], ["3100", "Lich Bane"], ["3020", "Sorcerer's Shoes"]],
    proof: ["Passive scales with bonus health", "Q has AP scaling and sustain", "Three stacks unlock hard crowd control"],
    tips: ["Use Q slow to trigger Approach Velocity.", "Stack passive before devouring.", "Do not W into a wave you cannot escape."],
  },
  {
    champion: "Leona",
    key: "Leona",
    title: "Solar Flare Gun",
    roles: ["Jungle", "Top"],
    heat: ["Brave", "Cursed"],
    difficulty: 5,
    damage: "On-hit / hybrid",
    concept: "Shield of Daybreak is an attack reset and the rest of Leona's kit keeps opponents pinned inside a full attack-speed cycle.",
    max: "Q · Shield of Daybreak",
    summoners: ["Smite", "Ghost"],
    runes: ["Press the Attack", "Triumph", "Alacrity", "Last Stand", "Cheap Shot", "Relentless Hunter"],
    items: [["3078", "Trinity Force"], ["6672", "Kraken Slayer"], ["3153", "Blade of the Ruined King"], ["3302", "Terminus"], ["3073", "Experimental Hexplate"], ["3006", "Berserker's Greaves"]],
    proof: ["Q is a low-cooldown attack reset", "Three sources of crowd control", "W supplies free defensive stats"],
    tips: ["Auto, Q, auto to proc Press the Attack.", "Use W before entering with E.", "Save R to extend, not start, close fights."],
  },
  {
    champion: "Milio",
    key: "Milio",
    title: "Campfire Carry",
    roles: ["Bot"],
    heat: ["Brave", "Cursed"],
    difficulty: 5,
    damage: "On-hit / physical",
    concept: "Cozy Campfire grants range and on-hit magic damage through Fired Up. A peel-heavy marksman that wins by refusing bad spacing.",
    max: "W · Cozy Campfire",
    summoners: ["Flash", "Barrier"],
    runes: ["Fleet Footwork", "Presence of Mind", "Alacrity", "Cut Down", "Celerity", "Gathering Storm"],
    items: [["6672", "Kraken Slayer"], ["3087", "Statikk Shiv"], ["3094", "Rapid Firecannon"], ["3031", "Infinity Edge"], ["3036", "Lord Dominik's Regards"], ["3006", "Berserker's Greaves"]],
    proof: ["W increases attack range", "Passive adds magic damage", "Q and R preserve safe uptime"],
    tips: ["Rotate W between yourself and your support.", "Hold Q for divers.", "Use range, not confidence, as your defense."],
  },
  {
    champion: "Orianna",
    key: "Orianna",
    title: "Remote Operations",
    roles: ["Support"],
    heat: ["Spicy", "Brave"],
    difficulty: 4,
    damage: "AP utility",
    concept: "Command: Protect turns any diver into a delivery system. Cheap utility AP keeps the Ball relevant without pretending you have solo-lane income.",
    max: "E · Command: Protect",
    summoners: ["Flash", "Exhaust"],
    runes: ["Summon Aery", "Manaflow Band", "Transcendence", "Scorch", "Font of Life", "Revitalize"],
    items: [["4005", "Imperial Mandate"], ["2065", "Shurelya's Battlesong"], ["6617", "Moonstone Renewer"], ["3107", "Redemption"], ["4628", "Horizon Focus"], ["3158", "Ionian Boots of Lucidity"]],
    proof: ["E grants armor and magic resistance", "W supplies an area speed swing", "R converts allied engage into hard control"],
    tips: ["Keep the Ball on your engager before vision breaks.", "Use W for disengage as often as chase.", "Your shield moves the Ball—plan both effects."],
  },
  {
    champion: "Taliyah",
    key: "Taliyah",
    title: "No-Fly Zone",
    roles: ["Support"],
    heat: ["Brave", "Cursed"],
    difficulty: 5,
    damage: "Burst magic",
    concept: "Seismic Shove and Unraveled Earth punish dashes without needing farm. The wall turns one successful roam into a numbers advantage.",
    max: "E · Unraveled Earth",
    summoners: ["Flash", "Ignite"],
    runes: ["Glacial Augment", "Hextech Flashtraption", "Biscuit Delivery", "Cosmic Insight", "Manaflow Band", "Scorch"],
    items: [["4005", "Imperial Mandate"], ["6653", "Liandry's Torment"], ["4628", "Horizon Focus"], ["3107", "Redemption"], ["3135", "Void Staff"], ["3158", "Ionian Boots of Lucidity"]],
    proof: ["E directly punishes dashes", "W creates picks from fog", "R supplies support-budget map pressure"],
    tips: ["Place E before shoving when possible.", "Roam on completed support wards.", "Cut off exits with R; do not strand your carry."],
  },
];

const roles: Role[] = ["Top", "Jungle", "Mid", "Bot", "Support"];
const heats: { value: Heat; note: string }[] = [
  { value: "Spicy", note: "Unusual, but forgiving" },
  { value: "Brave", note: "Strong idea, sharp edges" },
  { value: "Cursed", note: "Maximum weird, still legal" },
];

function seededIndex(seed: string, length: number) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

function newSeed() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function dragonBase(patch: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}`;
}

function splashImage(key: string) {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${key}_0.jpg`;
}

function championImage(key: string, patch: string) {
  return `${dragonBase(patch)}/img/champion/${key}.png`;
}

function itemImage(id: string, patch: string) {
  return `${dragonBase(patch)}/img/item/${id}.png`;
}

function scoreItem(item: DragonItem, challenge: Challenge, seed: string, id: string) {
  const stats = item.stats;
  const text = `${item.name} ${item.description} ${item.plaintext}`.toLowerCase();
  const profile = challenge.damage.toLowerCase();
  let score = 0;

  if (profile.includes("on-hit")) {
    score += (stats.PercentAttackSpeedMod || 0) * 260;
    score += (stats.FlatPhysicalDamageMod || 0) * .55;
    score += (stats.FlatMagicDamageMod || 0) * .35;
    if (/on-hit|basic attack|every third attack|attack speed/.test(text)) score += 32;
  }
  if (profile.includes("crit") || profile.includes("physical")) {
    score += (stats.FlatCritChanceMod || 0) * 180;
    score += (stats.FlatPhysicalDamageMod || 0) * .75;
    score += (stats.PercentAttackSpeedMod || 0) * 80;
    if (/critical strike|energized|basic attack/.test(text)) score += 14;
  }
  if (profile.includes("magic") || profile.includes("ap") || profile.includes("burst")) {
    score += (stats.FlatMagicDamageMod || 0) * .7;
    score += (stats.FlatMPPoolMod || 0) * .025;
    if (/magic penetration|spellblade|magic damage|ability damage/.test(text)) score += 25;
  }
  if (profile.includes("bruiser")) {
    score += (stats.FlatHPPoolMod || 0) * .09;
    score += (stats.FlatArmorMod || 0) * .25;
    score += (stats.FlatSpellBlockMod || 0) * .25;
    if (/omnivamp|maximum health|bonus health|healing/.test(text)) score += 20;
  }
  if (/ability haste/.test(text)) score += 8;
  return score + seededIndex(`${seed}-${id}`, 1200) / 100;
}

function deriveBuild(challenge: Challenge, catalog: Record<string, DragonItem>, seed: string) {
  if (!Object.keys(catalog).length) return challenge.items;

  const preferred = challenge.items.slice(0, 2).filter(([id]) => catalog[id]);
  const boots = challenge.items.at(-1)!;
  const used = new Set(preferred.map(([id]) => id));
  used.add(boots[0]);
  const candidates = Object.entries(catalog)
    .filter(([id, item]) =>
      !used.has(id) &&
      item.gold?.purchasable &&
      item.gold.total >= 2300 &&
      item.maps?.["11"] &&
      !item.tags?.includes("Boots") &&
      !item.into?.length &&
      !/ornn|arena|support quest|talisman|gold income/i.test(`${item.name} ${item.description}`),
    )
    .map(([id, item]) => ({ id, item, score: scoreItem(item, challenge, seed, id) }))
    .filter(({ score }) => score > 24)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ id, item }) => [id, item.name] as [string, string]);

  const livePreferred = preferred.map(([id]) => [id, catalog[id].name] as [string, string]);
  const liveBoots: [string, string] = catalog[boots[0]] ? [boots[0], catalog[boots[0]].name] : boots;
  return [...livePreferred, ...candidates, liveBoots];
}

function App() {
  const query = new URLSearchParams(window.location.search);
  const [role, setRole] = useState<Role>((query.get("role") as Role) || "Top");
  const [heat, setHeat] = useState<Heat>((query.get("heat") as Heat) || "Brave");
  const [seed, setSeed] = useState(query.get("seed") || "BRAVE1");
  const [locked, setLocked] = useState(false);
  const [copied, setCopied] = useState<"link" | "build" | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [patch, setPatch] = useState(FALLBACK_PATCH);
  const [catalog, setCatalog] = useState<Record<string, DragonItem>>({});
  const [championCatalog, setChampionCatalog] = useState<Record<string, DragonChampion>>({});
  const [dataState, setDataState] = useState<"loading" | "live" | "fallback">("loading");

  const pool = useMemo(
    () => challenges.filter((challenge) => challenge.roles.includes(role) && challenge.heat.includes(heat)),
    [role, heat],
  );
  const effectivePool = pool.length ? pool : challenges.filter((challenge) => challenge.roles.includes(role));
  const challenge = effectivePool[seededIndex(seed, effectivePool.length)];
  const build = useMemo(() => deriveBuild(challenge, catalog, seed), [challenge, catalog, seed]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadDragon() {
      try {
        const versionResponse = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { signal: controller.signal });
        const versions = await versionResponse.json() as string[];
        const currentPatch = versions[0] || FALLBACK_PATCH;
        const base = dragonBase(currentPatch);
        const [itemsResponse, championsResponse] = await Promise.all([
          fetch(`${base}/data/en_US/item.json`, { signal: controller.signal }),
          fetch(`${base}/data/en_US/champion.json`, { signal: controller.signal }),
        ]);
        if (!itemsResponse.ok || !championsResponse.ok) throw new Error("Data Dragon sync failed");
        const [itemsJson, championsJson] = await Promise.all([itemsResponse.json(), championsResponse.json()]);
        setPatch(currentPatch);
        setCatalog(itemsJson.data || {});
        setChampionCatalog(championsJson.data || {});
        setDataState("live");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setDataState("fallback");
      }
    }
    loadDragon();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("seed", seed);
    url.searchParams.set("role", role);
    url.searchParams.set("heat", heat);
    window.history.replaceState({}, "", url);
  }, [seed, role, heat]);

  const roll = () => {
    setLocked(false);
    setSeed(newSeed());
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied("link");
    window.setTimeout(() => setCopied(null), 1600);
  };

  const copyBuild = async () => {
    const text = `${challenge.champion} ${role} — ${challenge.title}
Max: ${challenge.max}
Summoners: ${challenge.summoners.join(" + ")}
Runes: ${challenge.runes.join(" • ")}
Build order: ${build.map(([, name]) => name).join(" → ")}
Seed: ${seed}`;
    await navigator.clipboard.writeText(text);
    setCopied("build");
    window.setTimeout(() => setCopied(null), 1600);
  };

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="/" aria-label="Braveforge home">
          <span className="brand-mark"><Swords size={17} /></span>
          <span>BRAVEFORGE</span>
        </a>
        <div className="nav-center">
          <span className={`live-dot ${dataState}`} />
          DATA DRAGON · {dataState === "loading" ? "SYNCING" : `PATCH ${patch}`}
        </div>
        <button className="text-button" onClick={() => setShowRules((value) => !value)}>
          <Info size={16} /> How it works
        </button>
      </nav>

      <section className={`rules-drawer ${showRules ? "open" : ""}`} aria-hidden={!showRules}>
        <div>
          <span className="eyebrow">THE BRAVEFORGE PACT</span>
          <h2>Off-meta. Not nonsense.</h2>
          <p>Every roll starts with a real kit interaction, adds items that reinforce it, and stays inside role-critical rules. Jungle always gets Smite. No duplicate uniques. No dead stats on purpose.</p>
        </div>
        <ol>
          <li><b>01</b> Choose your role and danger level.</li>
          <li><b>02</b> Roll once. Share the seed with your lobby.</li>
          <li><b>03</b> Build in order and play to the listed win condition.</li>
        </ol>
      </section>

      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">A FIELD MANUAL FOR THE FEARLESS</span>
          <h1>Play weird.<br /><em>Play to win.</em></h1>
          <p>Legitimate off-meta League builds, forged from actual champion synergies—not a random-item hostage situation.</p>
        </div>
        <div className="quality-seal">
          <ShieldCheck size={24} />
          <span><strong>KIT-CHECKED</strong><br />NO DEAD ROLLS</span>
        </div>
      </header>

      <section className="forge-controls" aria-label="Challenge settings">
        <div className="control-group role-control">
          <label>YOUR ASSIGNMENT</label>
          <div className="segmented">
            {roles.map((item) => (
              <button key={item} className={role === item ? "active" : ""} onClick={() => { setRole(item); setLocked(false); }}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="control-group heat-control">
          <label>COURAGE REQUIRED</label>
          <div className="heat-options">
            {heats.map((item, index) => (
              <button key={item.value} className={heat === item.value ? "active" : ""} onClick={() => { setHeat(item.value); setLocked(false); }}>
                <span>{index + 1}</span>
                <b>{item.value}</b>
                <small>{item.note}</small>
              </button>
            ))}
          </div>
        </div>
        <button className="roll-button" onClick={roll}>
          <Dices size={25} />
          <span>FORGE A PICK<small>{effectivePool.length} viable challenges</small></span>
        </button>
      </section>

      <section className={`result ${locked ? "locked" : ""}`} key={`${seed}-${role}-${heat}`}>
        <div className="portrait" style={{ backgroundImage: `url(${splashImage(challenge.key)})` }}>
          <div className="portrait-top">
            <span className="role-stamp">{role.toUpperCase()}</span>
            <span className="difficulty"><Flame size={14} fill="currentColor" /> DIFFICULTY {challenge.difficulty}/5</span>
          </div>
          <div className="portrait-bottom">
            <img
              src={championImage(championCatalog[challenge.key]?.id || challenge.key, patch)}
              alt=""
            />
            <div>
              <span>YOUR CHAMPION</span>
              <h2>{challenge.champion}</h2>
            </div>
          </div>
        </div>

        <article className="brief">
          <div className="brief-heading">
            <div>
              <span className="eyebrow">BUILD DESIGNATION</span>
              <h2>“{challenge.title}”</h2>
            </div>
            <button className="icon-button" onClick={copyLink} aria-label="Copy challenge link">
              {copied === "link" ? <Check size={19} /> : <Copy size={19} />}
            </button>
          </div>
          <p className="concept">{challenge.concept}</p>

          <div className="loadout-row">
            <div>
              <span className="mini-label">MAX FIRST</span>
              <strong>{challenge.max}</strong>
            </div>
            <div>
              <span className="mini-label">DAMAGE PROFILE</span>
              <strong>{challenge.damage}</strong>
            </div>
            <div>
              <span className="mini-label">SUMMONERS</span>
              <strong>{challenge.summoners.join(" + ")}</strong>
            </div>
          </div>

          <div className="build-section">
            <div className="section-title">
              <span><b>01</b> BUILD ORDER</span>
              <small>BUY LEFT → RIGHT</small>
            </div>
            <div className="items">
              {build.map(([id, name], index) => (
                <div className="item" key={id} title={name}>
                  <span>{index + 1}</span>
                  <img src={itemImage(id, patch)} alt={name} />
                  <small>{name}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="runes-section">
            <div className="section-title"><span><b>02</b> RUNE PAGE</span></div>
            <div className="rune-list">
              {challenge.runes.map((rune, index) => <span key={rune} className={index === 0 ? "keystone" : ""}>{index === 0 && <Sparkles size={14} />}{rune}</span>)}
            </div>
          </div>
        </article>

        <aside className="proof">
          <span className="eyebrow">WHY THIS IS LEGIT</span>
          <h3>STRANGE.<br />SYNERGISTIC.<br /><em>WINNABLE.</em></h3>
          <ul>
            {challenge.proof.map((point) => <li key={point}><Check size={14} /> {point}</li>)}
          </ul>
          <div className="field-notes">
            <span>FIELD NOTES</span>
            {challenge.tips.map((tip, index) => <p key={tip}><b>0{index + 1}</b>{tip}</p>)}
          </div>
        </aside>
      </section>

      <section className="commit-bar">
        <div>
          <span>CHALLENGE SEED</span>
          <strong>#{seed}</strong>
        </div>
        <button className="secondary-button" onClick={copyBuild}>
          {copied === "build" ? <Check size={17} /> : <Clipboard size={17} />} {copied === "build" ? "COPIED" : "COPY BUILD"}
        </button>
        <button className={`lock-button ${locked ? "active" : ""}`} onClick={() => setLocked((value) => !value)}>
          {locked ? <Check size={20} /> : <LockKeyhole size={20} />}
          {locked ? "PICK LOCKED — GOOD LUCK" : "LOCK IN THIS PICK"}
        </button>
        <button className="reroll-button" onClick={roll} aria-label="Reroll challenge"><RefreshCw size={19} /></button>
      </section>

      <footer>
        <p>BRAVEFORGE IS A COMMUNITY CHALLENGE TOOL AND IS NOT ENDORSED BY RIOT GAMES.</p>
        <p>League of Legends and Riot Games are trademarks of Riot Games, Inc. Game data and images via Riot Data Dragon.</p>
      </footer>
    </main>
  );
}

export default App;
