"use client";

import { useState, useMemo, useCallback, useEffect } from "react";

const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "OF"];

function parseDFFAPI(players) {
  return players.map((p) => {
    const posCode = p.position_code || "";
    const posAlt = p.position_code_alt || "";
    const posRaw = posAlt ? `${posCode}/${posAlt}` : posCode;
    const positions = [posCode, posAlt].filter(Boolean).map((s) => s.toUpperCase());

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

function computeCashScore(player) {
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

  return Math.round(score * 10) / 10;
}

function TrendFlag({ player }) {
  if (player.l5 === null || player.proj <= 0) return null;
  const recentAvg = ((player.l5 || 0) + (player.l10 || 0)) / 2;
  const ratio = recentAvg / player.proj;

  if (ratio >= 1.1) return <span style={{ color: "#22c55e", fontWeight: 700 }}>▲ HOT</span>;
  if (ratio >= 0.85) return <span style={{ color: "#a3a3a3" }}>—</span>;
  if (ratio >= 0.5) return <span style={{ color: "#f59e0b", fontWeight: 700 }}>▼ COLD</span>;
  return <span style={{ color: "#ef4444", fontWeight: 700 }}>⚠ DISCONNECT</span>;
}

export default function MLBCashAnalyzer() {
  const [slates, setSlates] = useState([]);
  const [selectedSlate, setSelectedSlate] = useState(null);
  const [parsed, setParsed] = useState([]);
  const [activePos, setActivePos] = useState("ALL");
  const [showCount, setShowCount] = useState(5);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("loading_slates");

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

  const handleSlateSelect = useCallback((slate) => {
    setSelectedSlate(slate);
    setPhase("loading_players");
    setError(null);
    setActivePos("ALL");
    setShowCount(5);

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
      })
      .catch((err) => {
        setError(`Failed to load players: ${err.message}`);
        setPhase("select_slate");
      });
  }, []);

  const handleBack = useCallback(() => {
    setPhase("select_slate");
    setSelectedSlate(null);
    setParsed([]);
    setActivePos("ALL");
    setShowCount(5);
    setError(null);
  }, []);

  const scoredPlayers = useMemo(() => {
    return parsed
      .filter((p) => p.proj > 0)
      .map((p) => ({ ...p, cashScore: computeCashScore(p) }))
      .sort((a, b) => b.cashScore - a.cashScore);
  }, [parsed]);

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
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#e5e5e5",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)",
        borderBottom: "1px solid #262626",
        padding: "24px 20px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: "#22c55e", boxShadow: "0 0 8px #22c55e88",
            }} />
            <span style={{
              fontSize: 11, letterSpacing: 3, textTransform: "uppercase",
              color: "#22c55e", fontWeight: 600,
            }}>CASH GAME ANALYZER</span>
          </div>
          <h1 style={{
            fontSize: 28, fontWeight: 800, margin: "8px 0 4px",
            background: "linear-gradient(90deg, #ffffff, #a3a3a3)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: -1,
          }}>MLB DFS · DraftKings</h1>
          <p style={{ fontSize: 12, color: "#737373", margin: 0 }}>
            {phase === "ready" && selectedSlate
              ? `${selectedSlate.slate_type || "Main"} Slate · ${selectedSlate.game_count} games · ${selectedSlate.start_string}`
              : "Live projections → Top cash plays ranked by position"}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px" }}>

        {/* Error */}
        {error && (
          <div style={{
            background: "#1a0a0a", border: "1px solid #4a1a1a",
            borderRadius: 8, padding: "16px 20px", marginBottom: 20,
            color: "#ef4444", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Loading Slates */}
        {phase === "loading_slates" && (
          <div style={{ textAlign: "center", padding: 60, color: "#525252", fontSize: 13 }}>
            <div style={{
              width: 32, height: 32, border: "3px solid #262626",
              borderTopColor: "#22c55e", borderRadius: "50%",
              margin: "0 auto 16px",
              animation: "spin 0.8s linear infinite",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Fetching today&apos;s slates...
          </div>
        )}

        {/* Slate Selection */}
        {phase === "select_slate" && slates.length > 0 && (
          <div style={{
            border: "1px solid #262626", borderRadius: 8,
            overflow: "hidden", background: "#111",
          }}>
            <div style={{
              padding: "16px 20px", borderBottom: "1px solid #262626",
              background: "#0d0d0d",
            }}>
              <span style={{
                fontSize: 11, letterSpacing: 2,
                color: "#525252", fontWeight: 700,
              }}>SELECT A SLATE</span>
            </div>
            {slates.map((slate, i) => {
              const label = slate.slate_type || "Main";
              return (
                <button
                  key={slate.url}
                  onClick={() => handleSlateSelect(slate)}
                  style={{
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between", width: "100%",
                    padding: "16px 20px", background: "transparent",
                    border: "none",
                    borderBottom: i < slates.length - 1 ? "1px solid #1a1a1a" : "none",
                    color: "#e5e5e5", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 13, textAlign: "left",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#1a1a1a"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{
                      background: label === "Main" ? "#22c55e" : "#262626",
                      color: label === "Main" ? "#000" : "#a3a3a3",
                      padding: "4px 12px", borderRadius: 4,
                      fontSize: 11, fontWeight: 800, letterSpacing: 1,
                      minWidth: 80, textAlign: "center",
                    }}>{label.toUpperCase()}</span>
                    <span style={{ color: "#737373", fontSize: 12 }}>
                      {slate.game_count} games · {slate.team_count} teams
                    </span>
                  </div>
                  <span style={{ color: "#525252", fontSize: 11 }}>
                    {slate.start_string}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Loading Players */}
        {phase === "loading_players" && (
          <div style={{ textAlign: "center", padding: 60, color: "#525252", fontSize: 13 }}>
            <div style={{
              width: 32, height: 32, border: "3px solid #262626",
              borderTopColor: "#22c55e", borderRadius: "50%",
              margin: "0 auto 16px",
              animation: "spin 0.8s linear infinite",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Loading {selectedSlate?.slate_type || "Main"} slate projections...
          </div>
        )}

        {/* Data View */}
        {phase === "ready" && (
          <>
            {/* Controls */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 16,
              flexWrap: "wrap", gap: 12,
            }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {["ALL", ...POSITIONS].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => { setActivePos(pos); setShowCount(5); }}
                    style={{
                      padding: "6px 14px",
                      background: activePos === pos ? "#22c55e" : "#1a1a1a",
                      color: activePos === pos ? "#000" : "#737373",
                      border: activePos === pos ? "none" : "1px solid #262626",
                      borderRadius: 4, cursor: "pointer",
                      fontWeight: 700, fontSize: 11,
                      letterSpacing: 1, fontFamily: "inherit",
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
                  padding: "6px 14px", background: "transparent",
                  border: "1px solid #333", borderRadius: 4,
                  color: "#737373", cursor: "pointer",
                  fontSize: 11, fontFamily: "inherit",
                }}
              >
                ← SLATES
              </button>
            </div>

            {/* Matchup Bar */}
            {matchups.length > 0 && (
              <div style={{
                display: "flex", gap: 8, flexWrap: "wrap",
                marginBottom: 16, padding: "10px 14px",
                background: "#111", border: "1px solid #1e1e1e",
                borderRadius: 6, fontSize: 10,
                color: "#525252", letterSpacing: 1,
              }}>
                <span style={{ color: "#737373", fontWeight: 700 }}>GAMES:</span>
                {matchups.map((m) => <span key={m}>{m}</span>)}
              </div>
            )}

            {/* Stats Summary */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8, marginBottom: 20,
            }}>
              {[
                { label: "PLAYERS", val: scoredPlayers.length },
                { label: "POSITIONS", val: POSITIONS.filter(p => positionCounts[p] > 0).length },
                { label: "TOP PROJ", val: scoredPlayers[0]?.proj?.toFixed(1) || "—" },
                { label: "BEST VALUE", val: scoredPlayers.reduce((best, p) => p.value > best ? p.value : best, 0).toFixed(2) + "x" },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "#111", border: "1px solid #1e1e1e",
                  borderRadius: 6, padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 9, color: "#525252", letterSpacing: 2, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Player Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #262626" }}>
                    {["#", "PLAYER", "POS", "HAND", "SAL", "PROJ", "VAL", "SPREAD", "IMP TM", "TREND", "CASH SCORE"].map((h) => (
                      <th key={h} style={{
                        padding: "10px 8px",
                        textAlign: h === "PLAYER" ? "left" : "center",
                        color: "#525252", fontWeight: 600,
                        fontSize: 10, letterSpacing: 1.5,
                        whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayPlayers.map((p, i) => {
                    const isTop3 = i < 3;
                    return (
                      <tr key={`${p.name}-${i}`} style={{
                        borderBottom: "1px solid #1a1a1a",
                        background: isTop3 ? "#0d1f0d" : "transparent",
                        transition: "background 0.15s",
                      }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#1a1a1a"}
                        onMouseLeave={(e) => e.currentTarget.style.background = isTop3 ? "#0d1f0d" : "transparent"}
                      >
                        <td style={{ padding: "10px 8px", textAlign: "center", color: isTop3 ? "#22c55e" : "#525252", fontWeight: 800 }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: "10px 8px", fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                          {p.name}
                          <span style={{ color: "#525252", fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                            {p.team} {p.location} {p.opp}
                          </span>
                          {p.injury && (
                            <span style={{
                              marginLeft: 6, fontSize: 9, padding: "1px 5px",
                              background: "#4a1a1a", color: "#ef4444",
                              borderRadius: 3, fontWeight: 600,
                            }}>{p.injury}</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          <span style={{
                            background: "#1a1a2e", padding: "2px 8px",
                            borderRadius: 3, fontSize: 10,
                            fontWeight: 700, color: "#818cf8",
                          }}>{p.posRaw}</span>
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center", color: "#525252", fontSize: 11 }}>
                          {p.hand || "—"}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center", color: "#a3a3a3" }}>
                          ${(p.salary / 1000).toFixed(1)}k
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "#fff" }}>
                          {p.proj.toFixed(1)}
                        </td>
                        <td style={{
                          padding: "10px 8px", textAlign: "center", fontWeight: 700,
                          color: p.value >= 2.0 ? "#22c55e" : p.value >= 1.5 ? "#a3a3a3" : "#ef4444",
                        }}>
                          {p.value.toFixed(2)}x
                        </td>
                        <td style={{
                          padding: "10px 8px", textAlign: "center", fontSize: 11,
                          color: p.spread.startsWith("-") ? "#22c55e" : "#a3a3a3",
                          fontWeight: p.spread.startsWith("-") ? 700 : 400,
                        }}>
                          {p.spread || "—"}
                        </td>
                        <td style={{
                          padding: "10px 8px", textAlign: "center",
                          color: (p.tmPts || 0) >= 4.5 ? "#22c55e" : "#a3a3a3",
                          fontWeight: (p.tmPts || 0) >= 4.5 ? 700 : 400,
                        }}>
                          {p.tmPts !== null ? p.tmPts.toFixed(1) : "—"}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center", fontSize: 11 }}>
                          <TrendFlag player={p} />
                        </td>
                        <td style={{
                          padding: "10px 8px", textAlign: "center",
                          fontWeight: 800, fontSize: 14,
                          color: isTop3 ? "#22c55e" : "#fff",
                        }}>
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
                    padding: "8px 24px", background: "#1a1a1a",
                    border: "1px solid #262626", borderRadius: 6,
                    color: "#a3a3a3", cursor: "pointer",
                    fontSize: 11, fontWeight: 600,
                    fontFamily: "inherit", letterSpacing: 1,
                  }}
                >
                  SHOW MORE ({filteredPlayers.length - showCount} remaining)
                </button>
              </div>
            )}

            {/* Legend */}
            <div style={{
              marginTop: 24, padding: "16px",
              background: "#111", border: "1px solid #1e1e1e",
              borderRadius: 6, fontSize: 11,
              color: "#525252", lineHeight: 1.8,
            }}>
              <span style={{ color: "#737373", fontWeight: 700 }}>CASH SCORE FORMULA: </span>
              Projection (40%) + Value (15%) + Batting Order (15%) + Implied Team Total (15%) + Trend Consistency (15%)
              <br />
              <span style={{ color: "#22c55e" }}>▲ HOT</span> = Recent avg above projection &nbsp;
              <span style={{ color: "#f59e0b" }}>▼ COLD</span> = Below projection &nbsp;
              <span style={{ color: "#ef4444" }}>⚠ DISCONNECT</span> = Major gap between projection and recent performance
              <br />
              <span style={{ color: "#22c55e" }}>Green rows</span> = Top 3 plays at position — your core cash targets
              <br />
              <span style={{ color: "#737373" }}>Projections update throughout the day</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
