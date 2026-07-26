import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { toBlob } from "html-to-image";
import { Check, Clipboard, Copy, Download, Info, RefreshCw, ScanSearch } from "lucide-react";
import { Inspectable } from "./components/Inspectable";
import {
  FALLBACK_PATCH,
  dragonBase,
  generateLoadout,
  newSeed,
  plainText,
  selectTeam,
} from "./engine";
import type { ChampionDetail, GeneratedLoadout, StaticData, View } from "./types";
import { ROLES } from "./types";
import styles from "./App.module.css";

type CopyState = "link" | "image" | "download" | "error" | null;

const emptyData: StaticData = {
  patch: FALLBACK_PATCH,
  ratePatch: "unknown",
  items: {},
  champions: {},
  championRates: {},
  runeStyles: [],
  summoners: {},
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
  const boardRef = useRef<HTMLDivElement>(null);

  const selectedTeam = useMemo(
    () => selectTeam(data.champions, data.championRates, seed),
    [data.champions, data.championRates, seed],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function loadData(): Promise<void> {
      try {
        const versions = (await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
          signal: controller.signal,
        }).then((response) => response.json())) as string[];
        const patch = versions[0] || FALLBACK_PATCH;
        const base = dragonBase(patch);
        const [items, champions, runeStyles, summoners, championRates] = await Promise.all([
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
        ]);
        setData({
          patch,
          ratePatch: championRates.patch || "unknown",
          items: items.data || {},
          champions: champions.data || {},
          championRates: championRates.data || {},
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
  const reelChampions = useMemo(
    () =>
      Object.values(data.champions)
        .sort((first, second) => first.name.localeCompare(second.name))
        .slice(0, 18),
    [data.champions],
  );

  function goHome(): void {
    setView("landing");
  }

  function rollTeam(): void {
    setSeed(newSeed());
    setView("result");
  }

  function reroll(): void {
    setSeed(newSeed());
  }

  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(window.location.href);
    setCopyState("link");
    window.setTimeout(() => setCopyState(null), 1800);
  }

  async function copyImage(): Promise<void> {
    if (!boardRef.current) return;
    try {
      await document.fonts.ready;
      const blob = await toBlob(boardRef.current, {
        backgroundColor: "#f1eddf",
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: true,
        filter: (node) => !(node instanceof HTMLElement && node.dataset.capture === "exclude"),
      });
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

  const nav = (
    <nav className={styles.nav}>
      <button className={styles.brand} onClick={goHome} aria-label="League Roulette home">
        <span>LEAGUE</span> ROULETTE
      </button>
    </nav>
  );

  if (view === "landing") {
    return (
      <main className={styles.shell}>
        {nav}
        <section className={styles.landing}>
          <div className={styles.hero}>
            <div className={styles.kicker}>LEAGUE ROULETTE</div>
            <h1>Your next five.</h1>
            <button
              className={styles.primaryButton}
              disabled={dataState !== "live"}
              onClick={rollTeam}
            >
              {dataState === "loading" ? "Loading…" : "Roll a team"} <span>→</span>
            </button>
          </div>
          <div className={styles.roulette} aria-hidden="true">
            {[0, 1, 2].map((column) => {
              const champions = reelChampions.slice(column * 6, column * 6 + 6);
              return (
                <div className={styles.reel} key={column}>
                  <div
                    className={styles.reelTrack}
                    style={{ "--duration": `${13 + column * 2}s` } as CSSProperties}
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
              );
            })}
            <div className={styles.selector} />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      {nav}
      <div className={styles.resultBar}>
        <button className={styles.back} onClick={reroll}>
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
          <section className={styles.board} ref={boardRef}>
            <header className={styles.boardHeader}>
              <div>
                <span>LEAGUE ROULETTE</span>
                <h1>Team #{seed}</h1>
              </div>
            </header>

            <div className={styles.lanes}>
              {loadouts.map((loadout, laneIndex) => (
                <article className={styles.lane} key={loadout.role}>
                  <div className={styles.champion}>
                    <span className={styles.laneNumber}>{laneIndex + 1}</span>
                    <img
                      crossOrigin="anonymous"
                      src={`${dragonBase(data.patch)}/img/champion/${loadout.champion.image.full}`}
                      alt=""
                    />
                    <div>
                      <span>{loadout.role}</span>
                      <h2>{loadout.champion.name}</h2>
                      <small>
                        {loadout.profile} · picked here in {loadout.rolePlayRate.toFixed(2)}% of
                        games
                      </small>
                    </div>
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
                          (runes, groupIndex) => {
                            const tree = data.runeStyles.find((style) =>
                              style.slots.some((slot) =>
                                slot.runes.some((rune) => rune.id === runes[0]?.id),
                              ),
                            );
                            return (
                              <div className={styles.runeTree} key={groupIndex}>
                                <small>
                                  {groupIndex === 0 ? "PRIMARY" : "SECONDARY"} ·{" "}
                                  {tree?.name || "RUNES"}
                                </small>
                                <div>
                                  {runes.map((rune) => (
                                    <div className={styles.runeChoice} key={rune.id}>
                                      <Inspectable
                                        compact
                                        image={`https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`}
                                        name={rune.name}
                                        description={plainText(rune.longDesc || rune.shortDesc)}
                                      />
                                      <strong>{rune.name}</strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>

                    <div className={styles.items}>
                      <span>BUY IN THIS ORDER</span>
                      <div>
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
                </article>
              ))}
            </div>

            <footer className={styles.boardFooter}>
              <span>roulette.jacobwisniewski.dev</span>
            </footer>
          </section>
        </>
      )}
    </main>
  );
}

export default App;
