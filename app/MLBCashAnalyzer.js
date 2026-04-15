"use client";

import { useState, useMemo, useCallback, useEffect } from "react";

const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "OF"];
const NUM_LINEUPS = 150;

/* ── Data Parsing ────────────────────────────────────────────────── */

function parseDFFAPI(players) {
  return players.map((p) => {
    const posCode = p.position_code || "";
    const posAlt = p.position_code_alt || "";
    const posRaw = posAlt ? `${posCode}/${posAlt}` : posCode;
    const positions = [posCode, posAlt]
      .filter(Boolean)
      .map((s) => s.toUpperCase());

    return {
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      positions,
      posRaw,
      salary: p.salary || 0,
      proj: parseFloat(p.ppg) || 0,
      value: parseFloat(p.value) || 0,
      order: p.starter_flag === 1 ? 1 : 0,
      l5: null,
      l10: null,
      szn: null,
      tmPts: parseFloat(p.projected_team_score) || null,
      ou: null,
      team: p.team || "",
      opp: p.opp || "",
      location: p.location || "",
      hand: p.hand || "",
      spread: p.team_spread || "",
      injury: p.injury_status || "",
      depthRank: p.depth_rank || 0,
    };
  });
}

/* ── Scoring ─────────────────────────────────────────────────────── */

function computeCashScore(player, chalkPct) {
  let score = 0;
  score += player.proj * 4.0;
  score += (player.value || 0) * 5.0;

  if (player.positions.some((p) => p !== "P")) {
    if (player.order >= 1 && player.order <= 3) score += 8;
    else if (player.order === 4 || player.order === 5) score += 5;
    else if (player.order >= 6 && player.order <= 7) score += 2;
  }

  if (player.tmPts !== null) {
    score += player.tmPts * 2.5;
  }

  if (player.l5 !== null && player.l10 !== null && player.proj > 0) {
    const recentAvg = (player.l5 + player.l10) / 2;
    const ratio = recentAvg / player.proj;
    if (ratio >= 1.0) score += 6;
    else if (ratio >= 0.75) score += 3;
    else if (ratio < 0.5) score -= 4;
  }

  // Chalk boost: exposure percentage * weight
  if (chalkPct !== null && chalkPct !== undefined) {
    score += chalkPct * 0.15; // 100% chalk → +15 points, 50% → +7.5
  }

  return Math.round(score * 10) / 10;
}

/* ── UI Components ───────────────────────────────────────────────── */

function TrendFlag({ player }) {
  if (player.l5 === null || player.proj <= 0) return null;
  const recentAvg = ((player.l5 || 0) + (player.l10 || 0)) / 2;
  const ratio = recentAvg / player.proj;

  if (ratio >= 1.1)
    return <span style={{ color: "#22c55e", fontWeight: 700 }}>▲ HOT</span>;
  if (ratio >= 0.85) return <span style={{ color: "#a3a3a3" }}>—</span>;
  if (ratio >= 0.5)
    return <span style={{ color: "#f59e0b", fontWeight: 700 }}>▼ COLD</span>;
  return <span style={{ color: "#ef4444", fontWeight: 700 }}>⚠ DISCONNECT</span>;
}

function ChalkBadge({ pct }) {
  if (pct === null || pct === undefined)
    return <span style={{ color: "#525252" }}>—</span>;

  let color = "#525252";
  let bg = "transparent";
  let label = `${pct.toFixed(0)}%`;

  if (pct >= 90) {
    color = "#000";
    bg = "#22c55e";
    label = `🔒 ${pct.toFixed(0)}%`;
  } else if (pct >= 70) {
    color = "#000";
    bg = "#4ade80";
  } else if (pct >= 50) {
    color = "#000";
    bg = "#fbbf24";
  } else if (pct >= 30) {
    color = "#a3a3a3";
    bg = "#262626";
  }

  return (
    <span
      style={{
        color,
        background: bg,
        padding: "2px 8px",
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.5,
      }}
    >
      {label}
    </span>
  );
}

/* ── Styles ───────────────────────────────────────────────────────── */

const CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border: 1px solid #1e1e1e;
    border-radius: 6px;
  }

  .table-wrap table {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    min-width: 780px;
    font-size: 12px;
  }

  .table-wrap th,
  .table-wrap td {
    padding: 10px 8px;
    white-space: nowrap;
  }

  .table-wrap th.sticky-col,
  .table-wrap td.sticky-col {
    position: sticky;
    left: 0;
    z-index: 2;
    background: #0a0a0a;
    border-right: 1px solid #262626;
  }

  .table-wrap thead th.sticky-col {
    z-index: 3;
  }

  .row-top3 td.sticky-col { background: #0d1f0d; }
  .table-wrap tr:hover td.sticky-col { background: #1a1a1a !important; }

  @media (max-width: 600px) {
    .header-title { font-size: 20px !important; }
    .header-sub { font-size: 11px !important; }
    .header-wrap { padding: 16px 12px !important; }
    .content-wrap { padding: 12px !important; }
    .pos-tabs { gap: 2px !important; }
    .pos-tabs button { padding: 5px 8px !important; font-size: 10px !important; }
    .slate-btn-label { min-width: 60px !important; font-size: 10px !important; }
    .slate-btn-meta { font-size: 10px !important; }
    .slate-btn-time { display: none; }
    .matchup-bar { font-size: 9px !important; }
    .legend { font-size: 10px !important; }
  }
`;

/* ── Main Component ──────────────────────────────────────────────── */

export default function MLBCashAnalyzer() {
  const [slates, setSlates] = useState([]);
  const [selectedSlate, setSelectedSlate] = useState(null);
  const [parsed, setParsed] = useState([]);
  const [activePos, setActivePos] = useState("ALL");
  const [showCount, setShowCount] = useState(5);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("loading_slates");
  const [chalkMap, setChalkMap] = useState({});
  const [optimizerPhase, setOptimizerPhase] = useState("idle");
  const [optimizerStats, setOptimizerStats] = useState(null);

  // Fetch slates on mount
  useEffect(() => {
    setPhase("loading_slates");
    setError(null);
    fetch("/api/slates")
      .then((r) => {
        if (!r.ok) throw new Error(`Slate fetch failed: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const classic = data.filter((s) => s.showdown_flag === 0);
        setSlates(classic);
        if (classic.length === 0) {
          setError("No classic MLB slates found. Games may not be posted yet.");
        }
        setPhase("select_slate");
      })
      .catch((err) => {
        setError(`Failed to load slates: ${err.message}`);
        setPhase("select_slate");
      });
  }, []);

  // Run optimizer via server-side API
  const runOptimizer = useCallback(async (playerPool) => {
    setOptimizerPhase("optimizing");
    setChalkMap({});

    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: playerPool.map((p) => ({
            name: p.name,
            positions: p.positions,
            salary: p.salary,
            proj: p.proj,
          })),
          numLineups: NUM_LINEUPS,
        }),
      });

      if (!res.ok) throw new Error(`Optimizer returned ${res.status}`);

      const result = await res.json();
      if (result.error) throw new Error(result.error);

      setChalkMap(result.exposureMap || {});
      setOptimizerStats(result);
      setOptimizerPhase("done");
    } catch (err) {
      console.error("Optimizer error:", err);
      setOptimizerPhase("error");
    }
  }, []);

  const handleSlateSelect = useCallback(
    (slate) => {
      setSelectedSlate(slate);
      setPhase("loading_players");
      setError(null);
      setActivePos("ALL");
      setShowCount(5);
      setChalkMap({});
      setOptimizerPhase("idle");
      setOptimizerStats(null);

      fetch(`/api/players?slate=${slate.url}`)
        .then((r) => {
          if (!r.ok) throw new Error(`Player fetch failed: ${r.status}`);
          return r.json();
        })
        .then((data) => {
          if (data.error) throw new Error(data.error);
          const players = parseDFFAPI(data);
          setParsed(players);
          setPhase("ready");

          // Kick off optimizer in background
          runOptimizer(players);
        })
        .catch((err) => {
          setError(`Failed to load players: ${err.message}`);
          setPhase("select_slate");
        });
    },
    [runOptimizer]
  );

  const handleBack = useCallback(() => {
    setPhase("select_slate");
    setSelectedSlate(null);
    setParsed([]);
    setActivePos("ALL");
    setShowCount(5);
    setError(null);
    setChalkMap({});
    setOptimizerPhase("idle");
    setOptimizerStats(null);
  }, []);

  const handleRerunOptimizer = useCallback(() => {
    if (parsed.length > 0) {
      runOptimizer(parsed);
    }
  }, [parsed, runOptimizer]);

  const scoredPlayers = useMemo(() => {
    return parsed
      .filter((p) => p.proj > 0)
      .map((p) => {
        const chalk = chalkMap[p.name];
        const chalkPct = chalk ? chalk.pct : null;
        return {
          ...p,
          chalkPct,
          cashScore: computeCashScore(p, chalkPct),
        };
      })
      .sort((a, b) => b.cashScore - a.cashScore);
  }, [parsed, chalkMap]);

  const filteredPlayers = useMemo(() => {
    if (activePos === "ALL") return scoredPlayers;
    return scoredPlayers.filter((p) => p.positions.includes(activePos));
  }, [scoredPlayers, activePos]);

  const displayPlayers = filteredPlayers.slice(0, showCount);

  const positionCounts = useMemo(() => {
    const counts = { ALL: scoredPlayers.length };
    POSITIONS.forEach((pos) => {
      counts[pos] = scoredPlayers.filter((p) => p.positions.includes(pos)).length;
    });
    return counts;
  }, [scoredPlayers]);

  const matchups = useMemo(() => {
    const set = new Set();
    parsed.forEach((p) => {
      if (p.location === "@") set.add(`${p.team}@${p.opp}`);
      else set.add(`${p.opp}@${p.team}`);
    });
    return [...set].sort();
  }, [parsed]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
      }}
    >
      <style>{CSS}</style>

      {/* Header */}
      <div
        className="header-wrap"
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)",
          borderBottom: "1px solid #262626",
          padding: "24px 20px",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 8px #22c55e88",
              }}
            />
            <span
              style={{
                fontSize: 11,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: "#22c55e",
                fontWeight: 600,
              }}
            >
              CASH GAME ANALYZER
            </span>
          </div>
          <h1
            className="header-title"
            style={{
              fontSize: 28,
              fontWeight: 800,
              margin: "8px 0 4px",
              background: "linear-gradient(90deg, #ffffff, #a3a3a3)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: -1,
            }}
          >
            MLB DFS · DraftKings
          </h1>
          <p className="header-sub" style={{ fontSize: 12, color: "#737373", margin: 0 }}>
            {phase === "ready" && selectedSlate
              ? `${selectedSlate.slate_type || "Main"} Slate · ${selectedSlate.game_count} games · ${selectedSlate.start_string}`
              : "Live projections → Top cash plays ranked by position"}
          </p>
        </div>
      </div>

      <div className="content-wrap" style={{ maxWidth: 1100, margin: "0 auto", padding: "20px" }}>
        {error && (
          <div
            style={{
              background: "#1a0a0a",
              border: "1px solid #4a1a1a",
              borderRadius: 8,
              padding: "16px 20px",
              marginBottom: 20,
              color: "#ef4444",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {phase === "loading_slates" && (
          <div style={{ textAlign: "center", padding: 60, color: "#525252", fontSize: 13 }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: "3px solid #262626",
                borderTopColor: "#22c55e",
                borderRadius: "50%",
                margin: "0 auto 16px",
                animation: "spin 0.8s linear infinite",
              }}
            />
            Fetching today&apos;s slates...
          </div>
        )}

        {phase === "select_slate" && slates.length > 0 && (
          <div
            style={{
              border: "1px solid #262626",
              borderRadius: 8,
              overflow: "hidden",
              background: "#111",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #262626",
                background: "#0d0d0d",
              }}
            >
              <span style={{ fontSize: 11, letterSpacing: 2, color: "#525252", fontWeight: 700 }}>
                SELECT A SLATE
              </span>
            </div>
            {slates.map((slate, i) => {
              const label = slate.slate_type || "Main";
              return (
                <button
                  key={slate.url}
                  onClick={() => handleSlateSelect(slate)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "16px 20px",
                    background: "transparent",
                    border: "none",
                    borderBottom: i < slates.length - 1 ? "1px solid #1a1a1a" : "none",
                    color: "#e5e5e5",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                    textAlign: "left",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span
                      className="slate-btn-label"
                      style={{
                        background: label === "Main" ? "#22c55e" : "#262626",
                        color: label === "Main" ? "#000" : "#a3a3a3",
                        padding: "4px 12px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 1,
                        minWidth: 80,
                        textAlign: "center",
                      }}
                    >
                      {label.toUpperCase()}
                    </span>
                    <span className="slate-btn-meta" style={{ color: "#737373", fontSize: 12 }}>
                      {slate.game_count} games · {slate.team_count} teams
                    </span>
                  </div>
                  <span className="slate-btn-time" style={{ color: "#525252", fontSize: 11 }}>
                    {slate.start_string}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {phase === "loading_players" && (
          <div style={{ textAlign: "center", padding: 60, color: "#525252", fontSize: 13 }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: "3px solid #262626",
                borderTopColor: "#22c55e",
                borderRadius: "50%",
                margin: "0 auto 16px",
                animation: "spin 0.8s linear infinite",
              }}
            />
            Loading {selectedSlate?.slate_type || "Main"} slate projections...
          </div>
        )}

        {phase === "ready" && (
          <>
            {/* Optimizer Status */}
            {optimizerPhase === "optimizing" && (
              <div
                style={{
                  background: "#111",
                  border: "1px solid #1e1e1e",
                  borderRadius: 8,
                  padding: "16px 20px",
                  marginBottom: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#f59e0b",
                    boxShadow: "0 0 8px #f59e0b88",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
                <span style={{ fontSize: 11, letterSpacing: 2, color: "#f59e0b", fontWeight: 700 }}>
                  RUNNING OPTIMIZER
                </span>
                <span style={{ fontSize: 11, color: "#525252" }}>
                  Generating {NUM_LINEUPS} lineups to identify chalk...
                </span>
              </div>
            )}

            {optimizerPhase === "done" && optimizerStats && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#0d1f0d",
                  border: "1px solid #1a3a1a",
                  borderRadius: 8,
                  padding: "12px 20px",
                  marginBottom: 20,
                  fontSize: 11,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>✓ OPTIMIZER COMPLETE</span>
                  <span style={{ color: "#525252" }}>
                    {optimizerStats.feasibleCount}/{optimizerStats.totalRuns} lineups generated · Chalk
                    data active
                  </span>
                </div>
                <button
                  onClick={handleRerunOptimizer}
                  style={{
                    padding: "4px 12px",
                    background: "transparent",
                    border: "1px solid #1a3a1a",
                    borderRadius: 4,
                    color: "#22c55e",
                    cursor: "pointer",
                    fontSize: 10,
                    fontFamily: "inherit",
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                >
                  RE-RUN
                </button>
              </div>
            )}

            {optimizerPhase === "error" && (
              <div
                style={{
                  background: "#1a1a0a",
                  border: "1px solid #4a4a1a",
                  borderRadius: 8,
                  padding: "12px 20px",
                  marginBottom: 20,
                  fontSize: 11,
                  color: "#f59e0b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Optimizer failed — chalk data unavailable. Scores shown without chalk boost.</span>
                <button
                  onClick={handleRerunOptimizer}
                  style={{
                    padding: "4px 12px",
                    background: "transparent",
                    border: "1px solid #4a4a1a",
                    borderRadius: 4,
                    color: "#f59e0b",
                    cursor: "pointer",
                    fontSize: 10,
                    fontFamily: "inherit",
                    fontWeight: 700,
                  }}
                >
                  RETRY
                </button>
              </div>
            )}

            {/* Controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div className="pos-tabs" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {["ALL", ...POSITIONS].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => {
                      setActivePos(pos);
                      setShowCount(5);
                    }}
                    style={{
                      padding: "6px 14px",
                      background: activePos === pos ? "#22c55e" : "#1a1a1a",
                      color: activePos === pos ? "#000" : "#737373",
                      border: activePos === pos ? "none" : "1px solid #262626",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 11,
                      letterSpacing: 1,
                      fontFamily: "inherit",
                    }}
                  >
                    {pos}
                    <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.6 }}>
                      {positionCounts[pos] || 0}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleBack}
                style={{
                  padding: "6px 14px",
                  background: "transparent",
                  border: "1px solid #333",
                  borderRadius: 4,
                  color: "#737373",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                }}
              >
                ← SLATES
              </button>
            </div>

            {/* Matchup Bar */}
            {matchups.length > 0 && (
              <div
                className="matchup-bar"
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 16,
                  padding: "10px 14px",
                  background: "#111",
                  border: "1px solid #1e1e1e",
                  borderRadius: 6,
                  fontSize: 10,
                  color: "#525252",
                  letterSpacing: 1,
                }}
              >
                <span style={{ color: "#737373", fontWeight: 700 }}>GAMES:</span>
                {matchups.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            )}

            {/* Stats Summary */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {[
                {
                  label: "TOP PROJ",
                  val: scoredPlayers[0]?.proj?.toFixed(1) || "—",
                },
                {
                  label: "BEST VALUE",
                  val:
                    scoredPlayers
                      .reduce((best, p) => (p.value > best ? p.value : best), 0)
                      .toFixed(2) + "x",
                },
                {
                  label: "TOP CHALK",
                  val:
                    optimizerPhase === "done"
                      ? (() => {
                          const topChalk = scoredPlayers.find((p) => p.chalkPct !== null);
                          return topChalk ? `${topChalk.chalkPct?.toFixed(0)}%` : "—";
                        })()
                      : optimizerPhase === "optimizing"
                        ? "..."
                        : "—",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: "#111",
                    border: "1px solid #1e1e1e",
                    borderRadius: 6,
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: 9, color: "#525252", letterSpacing: 2, marginBottom: 4 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Player Table */}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ borderBottom: "2px solid #262626" }}>
                    <th
                      className="sticky-col"
                      style={{
                        textAlign: "left",
                        color: "#525252",
                        fontWeight: 600,
                        fontSize: 10,
                        letterSpacing: 1.5,
                      }}
                    >
                      PLAYER
                    </th>
                    {["POS", "HAND", "SAL", "PROJ", "VAL", "SPREAD", "IMP TM", "CHALK", "TREND", "CASH"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "center",
                            color: "#525252",
                            fontWeight: 600,
                            fontSize: 10,
                            letterSpacing: 1.5,
                          }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {displayPlayers.map((p, i) => {
                    const isTop3 = i < 3;
                    return (
                      <tr
                        key={`${p.name}-${i}`}
                        className={isTop3 ? "row-top3" : ""}
                        style={{
                          borderBottom: "1px solid #1a1a1a",
                          background: isTop3 ? "#0d1f0d" : "transparent",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = isTop3 ? "#0d1f0d" : "transparent")
                        }
                      >
                        <td className="sticky-col" style={{ fontWeight: 700, color: "#fff" }}>
                          <span
                            style={{
                              color: isTop3 ? "#22c55e" : "#525252",
                              fontWeight: 800,
                              marginRight: 8,
                              fontSize: 11,
                            }}
                          >
                            {i + 1}
                          </span>
                          {p.name}
                          <span
                            style={{
                              color: "#525252",
                              fontWeight: 400,
                              marginLeft: 6,
                              fontSize: 10,
                            }}
                          >
                            {p.team} {p.location} {p.opp}
                          </span>
                          {p.injury && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 9,
                                padding: "1px 5px",
                                background: "#4a1a1a",
                                color: "#ef4444",
                                borderRadius: 3,
                                fontWeight: 600,
                              }}
                            >
                              {p.injury}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            style={{
                              background: "#1a1a2e",
                              padding: "2px 8px",
                              borderRadius: 3,
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#818cf8",
                            }}
                          >
                            {p.posRaw}
                          </span>
                        </td>
                        <td style={{ textAlign: "center", color: "#525252", fontSize: 11 }}>
                          {p.hand || "—"}
                        </td>
                        <td style={{ textAlign: "center", color: "#a3a3a3" }}>
                          ${(p.salary / 1000).toFixed(1)}k
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700, color: "#fff" }}>
                          {p.proj.toFixed(1)}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            fontWeight: 700,
                            color: p.value >= 2.0 ? "#22c55e" : p.value >= 1.5 ? "#a3a3a3" : "#ef4444",
                          }}
                        >
                          {p.value.toFixed(2)}x
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            fontSize: 11,
                            color: p.spread.startsWith("-") ? "#22c55e" : "#a3a3a3",
                            fontWeight: p.spread.startsWith("-") ? 700 : 400,
                          }}
                        >
                          {p.spread || "—"}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            color: (p.tmPts || 0) >= 4.5 ? "#22c55e" : "#a3a3a3",
                            fontWeight: (p.tmPts || 0) >= 4.5 ? 700 : 400,
                          }}
                        >
                          {p.tmPts !== null ? p.tmPts.toFixed(1) : "—"}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <ChalkBadge pct={p.chalkPct} />
                        </td>
                        <td style={{ textAlign: "center", fontSize: 11 }}>
                          <TrendFlag player={p} />
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            fontWeight: 800,
                            fontSize: 14,
                            color: isTop3 ? "#22c55e" : "#fff",
                          }}
                        >
                          {p.cashScore.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredPlayers.length > showCount && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  onClick={() => setShowCount((c) => c + 10)}
                  style={{
                    padding: "8px 24px",
                    background: "#1a1a1a",
                    border: "1px solid #262626",
                    borderRadius: 6,
                    color: "#a3a3a3",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    letterSpacing: 1,
                  }}
                >
                  SHOW MORE ({filteredPlayers.length - showCount} remaining)
                </button>
              </div>
            )}

            {/* Legend */}
            <div
              className="legend"
              style={{
                marginTop: 24,
                padding: "16px",
                background: "#111",
                border: "1px solid #1e1e1e",
                borderRadius: 6,
                fontSize: 11,
                color: "#525252",
                lineHeight: 1.8,
              }}
            >
              <span style={{ color: "#737373", fontWeight: 700 }}>CASH SCORE: </span>
              Proj (40%) + Value (15%) + Order (15%) + Imp TM (15%) + Trend (10%) + Chalk (5%)
              <br />
              <span style={{ color: "#737373", fontWeight: 700 }}>CHALK: </span>
              Player exposure across {NUM_LINEUPS} optimized lineups ·{" "}
              <span style={{ color: "#22c55e" }}>🔒 90%+</span> = Lock ·{" "}
              <span style={{ color: "#4ade80" }}>70%+</span> = Core ·{" "}
              <span style={{ color: "#fbbf24" }}>50%+</span> = Popular
              <br />
              <span style={{ color: "#22c55e" }}>Green rows</span> = Top 3 plays at position
              <br />
              <span style={{ color: "#737373" }}>
                Projections update throughout the day · Re-run optimizer after updates
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
