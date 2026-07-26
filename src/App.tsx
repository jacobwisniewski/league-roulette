import { useEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import {
  ArrowLeft,
  Check,
  Clipboard,
  Copy,
  Dices,
  Download,
  Info,
  RefreshCw,
  ScanSearch,
  Swords,
} from "lucide-react";
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
  const [setName, setSetName] = useState(initialQuery.get("name") || "");
  const [data, setData] = useState<StaticData>(emptyData);
  const [details, setDetails] = useState<Record<string, ChampionDetail>>({});
  const [dataState, setDataState] = useState<"loading" | "live" | "error">("loading");
  const [showMethod, setShowMethod] = useState(false);
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
      if (setName.trim()) url.searchParams.set("name", setName.trim());
      else url.searchParams.delete("name");
    } else {
      url.search = "";
    }
    window.history.replaceState({}, "", url);
  }, [view, seed, setName]);

  const loadouts = useMemo<GeneratedLoadout[]>(() => {
    if (!selectedTeam) return [];
    return ROLES.flatMap((role) => {
      const champion = selectedTeam[role];
      const detail = details[champion.id];
      return detail ? [generateLoadout(role, champion, detail, data, seed)] : [];
    });
  }, [selectedTeam, details, data, seed]);

  const isReady = loadouts.length === ROLES.length;

  function goHome(): void {
    setView("landing");
    setShowMethod(false);
  }

  function generate(): void {
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
        <span className={styles.brandMark}>
          <Swords size={16} />
        </span>
        LEAGUE ROULETTE
      </button>
      <div className={styles.dataStatus}>
        <span className={dataState === "live" ? styles.live : styles.pending} />
        {dataState === "loading"
          ? "SYNCING DATA"
          : dataState === "error"
            ? "DATA ERROR"
            : `PATCH ${data.patch}`}
      </div>
      <button className={styles.textButton} onClick={() => setShowMethod((current) => !current)}>
        <Info size={15} /> Method
      </button>
    </nav>
  );

  const method = (
    <section className={`${styles.method} ${showMethod ? styles.methodOpen : ""}`}>
      <div>
        <span>FULLY AUTOMATED DATASET</span>
        <h2>No saved builds.</h2>
      </div>
      <p>
        Each set is generated from Riot&apos;s current champion, ability, item, rune, and summoner
        data plus automated role play rates. League Roulette excludes each champion&apos;s measured
        primary role, detects alternate kit signals, then scores the current catalogue.
      </p>
    </section>
  );

  if (view === "landing") {
    return (
      <main className={styles.shell}>
        {nav}
        {method}
        <section className={styles.landing}>
          <div className={styles.kicker}>FIVE LANES · ONE SEED · CURRENT PATCH</div>
          <div>
            <h1>
              A FULL TEAM.
              <br />
              <em>OFF SCRIPT.</em>
            </h1>
            <p>Generate a complete, shareable League loadout set from live game data.</p>
            <button className={styles.primaryButton} onClick={() => setView("config")}>
              SET UP A ROULETTE <span>→</span>
            </button>
          </div>
          <small>Nothing is manually curated. Every seed is reproducible.</small>
        </section>
      </main>
    );
  }

  if (view === "config") {
    return (
      <main className={styles.shell}>
        {nav}
        {method}
        <section className={styles.config}>
          <button className={styles.back} onClick={goHome}>
            <ArrowLeft size={15} /> Back
          </button>
          <header>
            <span>SET CONFIGURATION</span>
            <h1>Five lanes. One roll.</h1>
            <p>The team seed controls every champion and loadout.</p>
          </header>
          <div className={styles.form}>
            <label>
              <span>
                SET NAME <small>OPTIONAL</small>
              </span>
              <input
                value={setName}
                maxLength={40}
                onChange={(event) => setSetName(event.target.value)}
                placeholder="Friday night five"
              />
            </label>
            <label>
              <span>SEED</span>
              <div className={styles.seedInput}>
                <input
                  value={seed}
                  maxLength={16}
                  onChange={(event) =>
                    setSeed(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  }
                />
                <button onClick={() => setSeed(newSeed())} aria-label="Randomise seed">
                  <RefreshCw size={16} />
                </button>
              </div>
            </label>
          </div>
          <div className={styles.scope}>
            <div>
              <span>FORMAT</span>
              <strong>Summoner&apos;s Rift · 5 lanes</strong>
            </div>
            <div>
              <span>SOURCE</span>
              <strong>
                Riot {data.patch} · role rates {data.ratePatch}
              </strong>
            </div>
            <div>
              <span>OUTPUT</span>
              <strong>Champions · items · runes · summoners</strong>
            </div>
          </div>
          <button
            className={styles.generateButton}
            disabled={dataState !== "live" || !seed}
            onClick={generate}
          >
            <Dices size={22} />
            {dataState === "loading" ? "SYNCING RIOT DATA" : "GENERATE FIVE-LANE SET"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      {nav}
      {method}
      <div className={styles.resultBar}>
        <button className={styles.back} onClick={() => setView("config")}>
          <ArrowLeft size={15} /> Config
        </button>
        <span>SEED #{seed}</span>
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
                <span>
                  LEAGUE ROULETTE / GAME {data.patch} / ROLE DATA {data.ratePatch}
                </span>
                <h1>{setName.trim() || "OFF-META FIVE"}</h1>
              </div>
              <div>
                <span>SHARE SEED</span>
                <strong>#{seed}</strong>
              </div>
            </header>

            <div className={styles.lanes}>
              {loadouts.map((loadout) => (
                <article className={styles.lane} key={loadout.role}>
                  <div className={styles.champion}>
                    <span>{loadout.role}</span>
                    <img
                      crossOrigin="anonymous"
                      src={`${dragonBase(data.patch)}/img/champion/${loadout.champion.image.full}`}
                      alt=""
                    />
                    <div>
                      <h2>{loadout.champion.name}</h2>
                      <small>
                        {loadout.profile} · {loadout.rolePlayRate.toFixed(2)}% role rate
                      </small>
                    </div>
                  </div>

                  <div className={styles.assignment}>
                    <span>MAX</span>
                    <Inspectable
                      compact
                      image={`${dragonBase(data.patch)}/img/spell/${loadout.maxSpell.image.full}`}
                      name={loadout.maxSpell.name}
                      meta="Max first"
                      description={plainText(
                        loadout.maxSpell.tooltip || loadout.maxSpell.description,
                      )}
                    />
                    <strong>{loadout.maxSpell.name}</strong>
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

                  <div className={styles.iconGroup}>
                    <span>RUNES</span>
                    <div>
                      {loadout.runes.map((rune) => (
                        <Inspectable
                          compact
                          key={rune.id}
                          image={`https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`}
                          name={rune.name}
                          description={plainText(rune.longDesc || rune.shortDesc)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className={`${styles.iconGroup} ${styles.items}`}>
                    <span>BUY ORDER</span>
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
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <footer className={styles.boardFooter}>
              <span>DATA-DRIVEN · RIOT + MERAKI · NO SAVED BUILDS</span>
              <span>roulette.jacobwisniewski.dev</span>
            </footer>
          </section>

          <div className={styles.actions} data-capture="exclude">
            <p>Hover any icon for live Riot details. On touch, tap an icon to inspect it.</p>
            <button onClick={reroll}>
              <RefreshCw size={16} /> Generate another set
            </button>
          </div>
        </>
      )}
    </main>
  );
}

export default App;
