import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { toBlob } from "html-to-image";
import {
  Check,
  Clipboard,
  Copy,
  Download,
  Info,
  RefreshCw,
  ScanSearch,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Inspectable } from "./components/Inspectable";
import {
  championsForRole,
  FALLBACK_PATCH,
  dragonBase,
  generateLoadout,
  newSeed,
  plainText,
  seededIndex,
  selectTeam,
} from "./engine";
import type {
  ChampionDetail,
  DragonChampion,
  GeneratedLoadout,
  Role,
  StaticData,
  View,
} from "./types";
import { ROLES } from "./types";
import styles from "./App.module.css";

type CopyState = "link" | "image" | "download" | "error" | null;

const emptyData: StaticData = {
  patch: FALLBACK_PATCH,
  ratePatch: "unknown",
  items: {},
  champions: {},
  championRates: {},
  rankedStats: {},
  matchups: {},
  runeStyles: [],
  summoners: {},
};

const roleIcons: Record<Role, string> = {
  Top: "top",
  Jungle: "jungle",
  Mid: "middle",
  Bot: "bottom",
  Support: "utility",
};

function itemStats(stats: Record<string, number>): string {
  const labels: Record<string, string> = {
    FlatHPPoolMod: "Health",
    FlatMPPoolMod: "Mana",
    FlatPhysicalDamageMod: "Attack damage",
    FlatMagicDamageMod: "Ability power",
    FlatArmorMod: "Armor",
    FlatSpellBlockMod: "Magic resistance",
    PercentAttackSpeedMod: "Attack speed",
    FlatCritChanceMod: "Critical strike",
    PercentLifeStealMod: "Life steal",
  };
  return Object.entries(stats)
    .filter(([key, value]) => labels[key] && value)
    .map(([key, value]) => {
      const percentage = key.startsWith("Percent") || key === "FlatCritChanceMod";
      const amount = percentage ? `${Math.round(value * 100)}%` : Math.round(value);
      return `${amount} ${labels[key]}`;
    })
    .join(" · ");
}

function App() {
  const initialQuery = new URLSearchParams(window.location.search);
  const [view, setView] = useState<View>(initialQuery.has("seed") ? "result" : "landing");
  const [seed, setSeed] = useState(initialQuery.get("seed") || newSeed());
  const [data, setData] = useState<StaticData>(emptyData);
  const [details, setDetails] = useState<Record<string, ChampionDetail>>({});
  const [dataState, setDataState] = useState<"loading" | "live" | "error">("loading");
  const [copyState, setCopyState] = useState<CopyState>(null);
  const [lockedRoles, setLockedRoles] = useState<Role[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const lastTickRef = useRef(0);

  const selectedTeam = useMemo(
    () => selectTeam(data.champions, data.championRates, seed),
    [data.champions, data.championRates, seed],
  );
  const allChampions = useMemo(() => Object.values(data.champions), [data.champions]);
  const championImages = useMemo(
    () =>
      Object.fromEntries(
        allChampions.flatMap((champion) => [
          [champion.id.toLowerCase().replaceAll(/[^a-z0-9]/g, ""), champion.image.full],
          [champion.name.toLowerCase().replaceAll(/[^a-z0-9]/g, ""), champion.image.full],
        ]),
      ),
    [allChampions],
  );
  const reelChampions = useMemo(
    () =>
      [...allChampions].sort((first, second) => first.name.localeCompare(second.name)).slice(0, 18),
    [allChampions],
  );
  const roleReelPools = useMemo<Partial<Record<Role, DragonChampion[]>>>(
    () =>
      Object.fromEntries(
        ROLES.map((role) => [
          role,
          championsForRole(data.champions, data.championRates, role).sort((first, second) =>
            first.name.localeCompare(second.name),
          ),
        ]),
      ),
    [data.champions, data.championRates],
  );
  const slotReels = useMemo<Partial<Record<Role, DragonChampion[]>>>(() => {
    if (!selectedTeam) return {};
    return Object.fromEntries(
      ROLES.map((role, roleIndex) => {
        const targetIndex = 24 + roleIndex * 6;
        const visualPool = (roleReelPools[role] || allChampions).filter(
          (champion) => champion.id !== selectedTeam[role].id,
        );
        const filler: DragonChampion[] = [];
        for (let index = 0; index < targetIndex + 3; index += 1) {
          const initialIndex = seededIndex(`${seed}-${role}-reel-${index}`, visualPool.length);
          const previous = index > 0 ? visualPool.indexOf(filler[index - 1]) : -1;
          const candidateIndex =
            visualPool.length > 1 && initialIndex === previous
              ? (initialIndex + 1) % visualPool.length
              : initialIndex;
          filler.push(visualPool[candidateIndex]);
        }
        const reel = [
          ...filler.slice(0, targetIndex),
          selectedTeam[role],
          ...filler.slice(targetIndex),
        ];
        return [role, reel];
      }),
    );
  }, [allChampions, roleReelPools, seed, selectedTeam]);

  function playSound(kind: "start" | "tick" | "lock" | "finish", index = 0): void {
    if (mutedRef.current) return;
    const context = audioContextRef.current || new AudioContext();
    audioContextRef.current = context;
    void context.resume();
    const now = context.currentTime;

    const tone = (
      frequency: number,
      endFrequency: number,
      duration: number,
      volume: number,
      type: OscillatorType,
      delay = 0,
    ): void => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    };

    if (kind === "tick") {
      if (now - lastTickRef.current < 0.038) return;
      lastTickRef.current = now;
      tone(150 + index * 9, 90, 0.025, 0.022, "square");
      return;
    }
    if (kind === "start") {
      tone(70, 145, 0.18, 0.045, "sawtooth");
      tone(190, 105, 0.12, 0.022, "square", 0.08);
      return;
    }
    if (kind === "lock") {
      tone(105, 48, 0.12, 0.075, "sine");
      tone(520 + index * 55, 610 + index * 55, 0.2, 0.032, "triangle", 0.025);
      return;
    }
    tone(540, 680, 0.3, 0.035, "sine");
    tone(680, 840, 0.34, 0.03, "sine", 0.06);
    tone(810, 1_020, 0.38, 0.026, "sine", 0.12);
  }

  function toggleMute(): void {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted) playSound("lock", 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    async function loadData(): Promise<void> {
      try {
        const versions = (await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
          signal: controller.signal,
        }).then((response) => response.json())) as string[];
        const patch = versions[0] || FALLBACK_PATCH;
        const base = dragonBase(patch);
        const [items, champions, runeStyles, summoners, championRates, rankedStats, matchups] =
          await Promise.all([
            fetch(`${base}/data/en_US/item.json`, {
              signal: controller.signal,
            }).then((response) => response.json()),
            fetch(`${base}/data/en_US/champion.json`, {
              signal: controller.signal,
            }).then((response) => response.json()),
            fetch(`${base}/data/en_US/runesReforged.json`, {
              signal: controller.signal,
            }).then((response) => response.json()),
            fetch(`${base}/data/en_US/summoner.json`, {
              signal: controller.signal,
            }).then((response) => response.json()),
            fetch("/data/championrates.json", {
              signal: controller.signal,
            }).then((response) => response.json()),
            fetch("/data/rankedstats.json", {
              signal: controller.signal,
            }).then((response) => response.json()),
            fetch("/data/matchups.json", {
              signal: controller.signal,
            }).then((response) => response.json()),
          ]);
        setData({
          patch,
          ratePatch: championRates.patch || "unknown",
          items: items.data || {},
          champions: champions.data || {},
          championRates: championRates.data || {},
          rankedStats: rankedStats.data || {},
          matchups: matchups.data || {},
          runeStyles: runeStyles || [],
          summoners: summoners.data || {},
        });
        setDataState("live");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setDataState("error");
      }
    }
    void loadData();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedTeam || view !== "selection") return;
    const timeouts: number[] = [];
    let cancelled = false;
    const preloads = ROLES.map((role) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = `${dragonBase(data.patch)}/img/champion/${selectedTeam[role].image.full}`;
      return image;
    });

    setLockedRoles([]);
    setIsRolling(true);

    const startedAt = performance.now();
    const tick = (): void => {
      if (cancelled) return;
      const elapsed = performance.now() - startedAt;
      playSound("tick", Math.floor(elapsed / 140) % ROLES.length);
      if (elapsed >= 3_200) return;
      const progress = elapsed / 3_200;
      timeouts.push(window.setTimeout(tick, 55 + Math.pow(progress, 3) * 145));
    };
    tick();
    ROLES.forEach((role, roleIndex) => {
      timeouts.push(window.setTimeout(() => settleRole(role, roleIndex), 1_450 + roleIndex * 400));
    });

    return () => {
      cancelled = true;
      timeouts.forEach(window.clearTimeout);
      preloads.forEach((image) => {
        image.src = "";
      });
    };
  }, [selectedTeam, view, seed, data.patch]);

  useEffect(() => {
    if (!selectedTeam || view !== "result") return;
    const controller = new AbortController();
    const champions = Object.values(selectedTeam);
    setDetails({});
    void Promise.all(
      champions.map(async (champion) => {
        const json = await fetch(
          `${dragonBase(data.patch)}/data/en_US/champion/${champion.id}.json`,
          { signal: controller.signal },
        ).then((response) => response.json());
        return [champion.id, json.data[champion.id]] as const;
      }),
    )
      .then((entries) => setDetails(Object.fromEntries(entries)))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setDataState("error");
      });
    return () => controller.abort();
  }, [selectedTeam, data.patch, view]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === "result") {
      url.searchParams.set("seed", seed);
      url.searchParams.delete("name");
    } else {
      url.search = "";
    }
    window.history.replaceState({}, "", url);
  }, [view, seed]);

  const loadouts = useMemo<GeneratedLoadout[]>(() => {
    if (!selectedTeam) return [];
    return ROLES.flatMap((role) => {
      const champion = selectedTeam[role];
      const detail = details[champion.id];
      return detail ? [generateLoadout(role, champion, detail, data, seed)] : [];
    });
  }, [selectedTeam, details, data, seed]);

  const isReady = loadouts.length === ROLES.length;
  function rollTeam(): void {
    playSound("start");
    setSeed(newSeed());
    setView("selection");
  }

  function rollAgain(): void {
    playSound("start");
    setSeed(newSeed());
    setView("selection");
  }

  function acceptTeam(): void {
    setView("result");
  }

  function settleRole(role: Role, roleIndex: number): void {
    setLockedRoles((current) => (current.includes(role) ? current : [...current, role]));
    playSound("lock", roleIndex);
    if (roleIndex === ROLES.length - 1) {
      setIsRolling(false);
      window.setTimeout(() => playSound("finish"), 130);
    }
  }

  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(window.location.href);
    setCopyState("link");
    window.setTimeout(() => setCopyState(null), 1800);
  }

  async function copyImage(): Promise<void> {
    if (!shareRef.current) return;
    try {
      await document.fonts.ready;
      const blob = await Promise.race([
        toBlob(shareRef.current, {
          backgroundColor: "#0c111a",
          cacheBust: false,
          height: 810,
          width: 1600,
          pixelRatio: 1,
          skipFonts: true,
        }),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 12_000)),
      ]);
      if (!blob) throw new Error("Image renderer returned no image");
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopyState("image");
      } catch {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `league-roulette-${seed}.png`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setCopyState("download");
      }
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState(null), 5000);
  }

  const siteHeader = (
    <header className={styles.siteHeader}>
      <button className={styles.brand} onClick={() => setView("landing")}>
        <span>LEAGUE</span> ROULETTE
      </button>
      <button
        className={styles.muteButton}
        onClick={toggleMute}
        aria-label={isMuted ? "Turn sound on" : "Mute sound"}
        title={isMuted ? "Turn sound on" : "Mute sound"}
      >
        {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>
    </header>
  );

  if (view === "landing") {
    return (
      <main className={styles.shell}>
        {siteHeader}
        <section className={styles.landing}>
          <div className={styles.hero}>
            <button
              className={styles.primaryButton}
              disabled={dataState !== "live"}
              onClick={rollTeam}
            >
              {dataState === "loading" ? "Loading…" : "Roll"} <span>→</span>
            </button>
          </div>
          <div className={styles.roulette} aria-hidden="true">
            {ROLES.map((role, roleIndex) => {
              const champions = (roleReelPools[role] || reelChampions).slice(0, 6);
              return (
                <div className={styles.landingReel} key={role}>
                  <header>
                    <img
                      crossOrigin="anonymous"
                      src={`https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/position-${roleIcons[role]}.svg`}
                      alt=""
                    />
                  </header>
                  <div className={styles.reel}>
                    <div
                      className={styles.reelTrack}
                      style={{ "--duration": `${13 + roleIndex * 1.5}s` } as CSSProperties}
                    >
                      {[...champions, ...champions].map((champion, index) => (
                        <div className={styles.reelChampion} key={`${champion.id}-${index}`}>
                          <img
                            crossOrigin="anonymous"
                            src={`${dragonBase(data.patch)}/img/champion/${champion.image.full}`}
                            alt=""
                          />
                          <span>{champion.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className={styles.selector} />
          </div>
        </section>
      </main>
    );
  }

  if (view === "selection") {
    return (
      <main className={styles.shell}>
        {siteHeader}
        <section className={styles.selection}>
          <div className={styles.selectionGrid} aria-live="polite">
            {ROLES.map((role) => {
              const locked = lockedRoles.includes(role);
              const strip = slotReels[role] || [];
              const roleIndex = ROLES.indexOf(role);
              const targetIndex = 24 + roleIndex * 6;
              return (
                <article
                  className={`${styles.rolePick} ${locked ? styles.roleLocked : ""}`}
                  key={role}
                >
                  <span title={role}>
                    <img
                      crossOrigin="anonymous"
                      src={`https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/position-${roleIcons[role]}.svg`}
                      alt={role}
                    />
                  </span>
                  {strip.length ? (
                    <div className={styles.slotWindow}>
                      <div
                        className={`${styles.slotStrip} ${styles.slotSpinning} ${
                          locked ? styles.slotStopped : ""
                        }`}
                        key={`${seed}-${role}`}
                        style={
                          {
                            "--reel-duration": `${1_450 + roleIndex * 400}ms`,
                            "--reel-target": `calc(-${(targetIndex + 0.5) * 100}cqw + ${
                              targetIndex * 8 + 8
                            }px)`,
                          } as CSSProperties
                        }
                      >
                        {strip.map((stripChampion, index) => (
                          <div className={styles.slotChampion} key={`${stripChampion.id}-${index}`}>
                            <img
                              crossOrigin="anonymous"
                              src={`${dragonBase(data.patch)}/img/champion/${stripChampion.image.full}`}
                              alt=""
                            />
                            <span>{stripChampion.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.slotWindow} />
                  )}
                </article>
              );
            })}
          </div>
          <div className={`${styles.selectionActions} ${isRolling ? styles.actionsWaiting : ""}`}>
            <button className={styles.secondaryButton} disabled={isRolling} onClick={rollAgain}>
              <RefreshCw size={15} /> Roll again
            </button>
            <button className={styles.primaryButton} disabled={isRolling} onClick={acceptTeam}>
              Use this team <span>→</span>
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      {siteHeader}
      <div className={styles.resultBar}>
        <button className={styles.back} onClick={rollAgain}>
          <RefreshCw size={15} /> New team
        </button>
        <div>
          <button className={styles.textButton} onClick={copyLink}>
            {copyState === "link" ? <Check size={15} /> : <Copy size={15} />}
            {copyState === "link" ? "Link copied" : "Copy link"}
          </button>
          <button className={styles.imageButton} onClick={copyImage} disabled={!isReady}>
            {copyState === "image" ? (
              <Check size={15} />
            ) : copyState === "download" ? (
              <Download size={15} />
            ) : copyState === "error" ? (
              <Info size={15} />
            ) : (
              <Clipboard size={15} />
            )}
            {copyState === "image"
              ? "Image copied"
              : copyState === "download"
                ? "PNG downloaded"
                : copyState === "error"
                  ? "Export failed"
                  : "Copy team image"}
          </button>
        </div>
      </div>

      {!isReady ? (
        <section className={styles.loading}>
          <ScanSearch size={34} />
          <span>READING FIVE CHAMPION KITS</span>
          <h1>BUILDING THE SET…</h1>
        </section>
      ) : (
        <>
          <section className={styles.board}>
            <div className={styles.lanes}>
              {loadouts.map((loadout) => (
                <article className={styles.lane} key={loadout.role}>
                  <div className={styles.champion}>
                    <strong className={styles.roleLabel}>
                      <img
                        crossOrigin="anonymous"
                        src={`https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/position-${roleIcons[loadout.role]}.svg`}
                        alt=""
                      />
                      <span>{loadout.role}</span>
                    </strong>
                    <div className={styles.championIdentity}>
                      <img
                        crossOrigin="anonymous"
                        src={`${dragonBase(data.patch)}/img/champion/${loadout.champion.image.full}`}
                        alt=""
                      />
                      <div>
                        <h2>{loadout.champion.name}</h2>
                        <span>{loadout.champion.title}</span>
                      </div>
                    </div>
                    {loadout.rankedStat && (
                      <div className={styles.tierBadge}>
                        <span>TIER</span>
                        <b>{loadout.rankedStat.tier}</b>
                      </div>
                    )}
                    {loadout.matchups && (
                      <div className={styles.matchups}>
                        <div>
                          <span>STRONG INTO</span>
                          <div>
                            {loadout.matchups.strongInto.map((opponent) => (
                              <figure key={opponent.id} title={opponent.name}>
                                <img
                                  crossOrigin="anonymous"
                                  src={`${dragonBase(data.patch)}/img/champion/${
                                    championImages[
                                      opponent.name.toLowerCase().replaceAll(/[^a-z0-9]/g, "")
                                    ]
                                  }`}
                                  alt={opponent.name}
                                />
                                <figcaption>{opponent.winRate.toFixed(1)}%</figcaption>
                              </figure>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span>STRUGGLES INTO</span>
                          <div>
                            {loadout.matchups.strugglesInto.map((opponent) => (
                              <figure key={opponent.id} title={opponent.name}>
                                <img
                                  crossOrigin="anonymous"
                                  src={`${dragonBase(data.patch)}/img/champion/${
                                    championImages[
                                      opponent.name.toLowerCase().replaceAll(/[^a-z0-9]/g, "")
                                    ]
                                  }`}
                                  alt={opponent.name}
                                />
                                <figcaption>{opponent.winRate.toFixed(1)}%</figcaption>
                              </figure>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {loadout.rankedStat && (
                      <dl className={styles.championStats}>
                        <div>
                          <dt>WIN RATE</dt>
                          <dd>{loadout.rankedStat.winRate.toFixed(2)}%</dd>
                        </div>
                        <div>
                          <dt>PICK RATE</dt>
                          <dd>{loadout.rankedStat.pickRate.toFixed(2)}%</dd>
                        </div>
                      </dl>
                    )}
                  </div>

                  <div className={styles.loadout}>
                    <div className={styles.utilities}>
                      <div className={styles.abilityOrder}>
                        <span>ABILITY ORDER</span>
                        <div>
                          {loadout.abilityOrder.map((spell, index) => (
                            <div className={styles.ability} key={spell.id}>
                              <i>
                                {["Q", "W", "E"][
                                  loadout.detail.spells.findIndex(
                                    (candidate) => candidate.id === spell.id,
                                  )
                                ] || "?"}
                              </i>
                              <Inspectable
                                compact
                                image={`${dragonBase(data.patch)}/img/spell/${spell.image.full}`}
                                name={spell.name}
                                meta={`${index === 0 ? "Max first" : index === 1 ? "Max second" : "Max last"}`}
                                description={plainText(spell.tooltip || spell.description)}
                              />
                              <b>{index < loadout.abilityOrder.length - 1 ? "→" : ""}</b>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className={styles.iconGroup}>
                        <span>SUMMONERS</span>
                        <div>
                          {loadout.summoners.map((summoner) => (
                            <Inspectable
                              compact
                              key={summoner.id}
                              image={`${dragonBase(data.patch)}/img/spell/${summoner.image.full}`}
                              name={summoner.name}
                              meta={`${summoner.cooldownBurn}s cooldown`}
                              description={plainText(summoner.description)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={styles.runeSetup}>
                      <span>RUNES</span>
                      <div>
                        {[loadout.runes.slice(0, 4), loadout.runes.slice(4)].map(
                          (selectedRunes, groupIndex) => {
                            const tree = data.runeStyles.find((style) =>
                              style.slots.some((slot) =>
                                slot.runes.some((rune) => rune.id === selectedRunes[0]?.id),
                              ),
                            );
                            const slots = groupIndex === 0 ? tree?.slots : tree?.slots.slice(1);
                            return (
                              <div className={styles.runeTree} key={groupIndex}>
                                <header>
                                  {tree && (
                                    <img
                                      crossOrigin="anonymous"
                                      src={`https://ddragon.leagueoflegends.com/cdn/img/${tree.icon}`}
                                      alt=""
                                    />
                                  )}
                                  <div>
                                    <strong>{tree?.name || "Runes"}</strong>
                                  </div>
                                </header>
                                <div className={styles.runeRows}>
                                  {slots?.map((slot) => {
                                    const selected = slot.runes.find((rune) =>
                                      selectedRunes.some((choice) => choice.id === rune.id),
                                    );
                                    return (
                                      <div className={styles.runeRow} key={slot.runes[0]?.id}>
                                        <div>
                                          {slot.runes.map((rune) => (
                                            <div
                                              className={`${styles.runeOption} ${
                                                selected?.id === rune.id
                                                  ? styles.runeSelected
                                                  : styles.runeInactive
                                              }`}
                                              key={rune.id}
                                            >
                                              <Inspectable
                                                compact
                                                image={`https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`}
                                                name={rune.name}
                                                description={plainText(
                                                  rune.longDesc || rune.shortDesc,
                                                )}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>

                    <div className={styles.items}>
                      <div className={styles.itemRow}>
                        <div className={styles.starterItems}>
                          <span>START</span>
                          <div>
                            {loadout.starterItems.map(({ id, item, quantity }) => (
                              <div className={styles.starterItem} key={id}>
                                <Inspectable
                                  compact
                                  image={`${dragonBase(data.patch)}/img/item/${id}.png`}
                                  name={item.name}
                                  meta={`${item.gold.total.toLocaleString()} gold`}
                                  description={plainText(item.description || item.plaintext)}
                                />
                                {quantity > 1 && <b>×{quantity}</b>}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className={styles.completedItems}>
                          {loadout.items.map(([id, item], index) => (
                            <div className={styles.orderedItem} key={id}>
                              <b>{index + 1}</b>
                              <Inspectable
                                compact
                                image={`${dragonBase(data.patch)}/img/item/${id}.png`}
                                name={item.name}
                                meta={`${item.gold.total.toLocaleString()} gold · ${itemStats(item.stats) || "Passive item"}`}
                                description={plainText(item.description || item.plaintext)}
                              />
                              <div>
                                <strong>{item.name}</strong>
                                <small>{item.gold.total.toLocaleString()}g</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <div className={styles.shareStage} aria-hidden="true">
            <section className={styles.shareCard} ref={shareRef}>
              <header>
                <strong>
                  <span>LEAGUE</span> ROULETTE
                </strong>
              </header>
              {loadouts.map((loadout) => (
                <article className={styles.shareLane} key={loadout.role}>
                  <div className={styles.shareChampion}>
                    <span>
                      <img
                        crossOrigin="anonymous"
                        src={`https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/position-${roleIcons[loadout.role]}.svg`}
                        alt=""
                      />
                      {loadout.role}
                    </span>
                    <div>
                      <img
                        crossOrigin="anonymous"
                        src={`${dragonBase(data.patch)}/img/champion/${loadout.champion.image.full}`}
                        alt=""
                      />
                      <strong>{loadout.champion.name}</strong>
                    </div>
                  </div>
                  <div className={styles.shareAbilities}>
                    <small>ABILITY ORDER</small>
                    <div>
                      {loadout.abilityOrder.map((spell) => (
                        <span key={spell.id}>
                          <img
                            crossOrigin="anonymous"
                            src={`${dragonBase(data.patch)}/img/spell/${spell.image.full}`}
                            alt=""
                          />
                          <b>
                            {["Q", "W", "E"][
                              loadout.detail.spells.findIndex(
                                (candidate) => candidate.id === spell.id,
                              )
                            ] || "?"}
                          </b>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={styles.shareSummoners}>
                    <small>SUMMONERS</small>
                    <div>
                      {loadout.summoners.map((summoner) => (
                        <img
                          crossOrigin="anonymous"
                          src={`${dragonBase(data.patch)}/img/spell/${summoner.image.full}`}
                          alt=""
                          key={summoner.id}
                        />
                      ))}
                    </div>
                  </div>
                  <div className={styles.shareRunes}>
                    <small>RUNES</small>
                    <div>
                      {loadout.runes.map((rune) => (
                        <img
                          crossOrigin="anonymous"
                          src={`https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`}
                          alt=""
                          key={rune.id}
                        />
                      ))}
                    </div>
                  </div>
                  <div className={styles.shareItems}>
                    <div>
                      <small>START</small>
                      <span>
                        {loadout.starterItems.map(({ id, quantity }) => (
                          <i key={id}>
                            <img
                              crossOrigin="anonymous"
                              src={`${dragonBase(data.patch)}/img/item/${id}.png`}
                              alt=""
                            />
                            {quantity > 1 && <b>×{quantity}</b>}
                          </i>
                        ))}
                      </span>
                    </div>
                    <ol>
                      {loadout.items.map(([id, item]) => (
                        <li key={id}>
                          <img
                            crossOrigin="anonymous"
                            src={`${dragonBase(data.patch)}/img/item/${id}.png`}
                            alt=""
                          />
                          <span>
                            <strong>{item.name}</strong>
                            <small>{item.gold.total.toLocaleString()}g</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

export default App;
