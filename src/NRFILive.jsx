import { useState, useEffect, useCallback } from "react";

// ── Confidence tier helper (display only, no model logic) ───
function conf(n) {
  if (n >= 0.68) return { t: "Strong", c: "#0f7b5f", cls: "strong" };
  if (n >= 0.58) return { t: "Lean", c: "#2d6a9f", cls: "lean" };
  if (n >= 0.50) return { t: "Toss-up", c: "#8a6d1b", cls: "tossup" };
  return { t: "Fade", c: "#a63d3d", cls: "fade" };
}

// ── Format game time from ISO timestamp ─────────────────────
function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

// ── Styles ──────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root{--paper:#faf9f7;--white:#fff;--ink:#1a1a18;--ink2:#3d3b36;--ink3:#6b6760;--ink4:#9e9a92;--ink5:#c4c0b8;--rule:#e2ddd5;--rule-l:#eee9e2;--serif:'Instrument Serif',Georgia,serif;--sans:'Source Sans 3',-apple-system,sans-serif;--mono:'IBM Plex Mono',monospace;}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--paper);-webkit-font-smoothing:antialiased;}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes liveDot{0%,100%{opacity:1}50%{opacity:.3}}

.tl-game{display:flex;align-items:flex-start;gap:16px;padding:14px 0 14px 24px;border-left:2px solid var(--rule);margin-left:5px;position:relative;cursor:pointer;transition:background .1s;}
.tl-game:hover{background:var(--rule-l);margin-left:0;padding-left:29px;}
.tl-game.expanded{background:var(--rule-l);margin-left:0;padding-left:29px;}
.tl-game::before{content:'';position:absolute;left:-6px;top:20px;width:10px;height:10px;border-radius:50%;}
.tl-game.strong::before{background:#0f7b5f;}
.tl-game.lean::before{background:#2d6a9f;}
.tl-game.tossup::before{background:#8a6d1b;}
.tl-game.fade::before{background:#a63d3d;}

.di-box{background:var(--rule-l);padding:16px;margin:0 0 0 5px;border-left:2px solid var(--rule);padding-left:24px;}
.di-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
.di-stat{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;}

.ftab{background:none;border:none;cursor:pointer;font-family:var(--sans);font-size:13px;padding:6px 0;margin-right:18px;color:var(--ink4);border-bottom:2px solid transparent;font-weight:400;}
.ftab.on{color:var(--ink);border-bottom-color:var(--ink);font-weight:600;}

@media(max-width:600px){
  .kpi-row{flex-direction:column!important;}
  .kpi+.kpi{border-left:none!important;padding-left:0!important;border-top:1px solid var(--rule-l);padding-top:10px!important;}
  .di-grid{grid-template-columns:1fr;}
  .nav-date{display:none;}
  .tl-prob{min-width:auto!important;}
  .tl-pct{font-size:22px!important;}
  .tl-pitchers-stats{flex-direction:column!important;gap:2px!important;}
}
`;

export default function App() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/data?type=predictions&date=${today}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const { predictions } = await res.json();

      // Map DB rows to the shape the UI expects
      const mapped = (predictions || []).map((p) => {
        const isLive = (p.game_status || "").includes("Progress");
        const isFinal = p.game_status === "Final";

        let fir = null;
        if (p.first_inning_away_runs !== null && p.first_inning_away_runs !== undefined) {
          fir = {
            a: p.first_inning_away_runs,
            h: p.first_inning_home_runs ?? "?",
          };
        }

        return {
          pk: p.mlb_game_pk,
          aa: p.away_team,
          ha: p.home_team,
          ap: p.away_pitcher_name
            ? {
                name: p.away_pitcher_name,
                holdRate: p.away_pitcher_hold_rate,
              }
            : null,
          hp: p.home_pitcher_name
            ? {
                name: p.home_pitcher_name,
                holdRate: p.home_pitcher_hold_rate,
              }
            : null,
          v: p.venue || "",
          pf: parseFloat(p.park_factor) || 1.0,
          time: formatTime(p.game_time_et),
          st: p.game_status || "Scheduled",
          fir,
          nrfi: parseFloat(p.nrfi_prob),
          abn: parseFloat(p.away_bat_nrfi_rate) || 0.7,
          hbn: parseFloat(p.home_bat_nrfi_rate) || 0.7,
          apn: parseFloat(p.away_pitcher_hold_rate) || 0.735,
          hpn: parseFloat(p.home_pitcher_hold_rate) || 0.735,
          isLive,
          isFinal,
        };
      });

      setGames(mapped);
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 5 minutes for live updates
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Filtering ─────────────────────────────────────────────
  const filtered = (() => {
    let a = [...games];
    if (filter === "strong") a = a.filter((g) => g.nrfi >= 0.6);
    if (filter === "upcoming")
      a = a.filter((g) => g.st === "Scheduled" || g.st === "Pre-Game");
    if (filter === "live") a = a.filter((g) => g.isLive);
    return a;
  })();

  // ── Grouping by time ──────────────────────────────────────
  const groups = {};
  for (const g of filtered) {
    const key = g.isLive
      ? "Live Now"
      : g.isFinal
        ? "Final"
        : g.time + " ET";
    if (!groups[key]) groups[key] = [];
    groups[key].push(g);
  }
  for (const k of Object.keys(groups))
    groups[k].sort((a, b) => b.nrfi - a.nrfi);

  const groupOrder = Object.keys(groups).sort((a, b) => {
    if (a === "Live Now") return -1;
    if (b === "Live Now") return 1;
    if (a === "Final") return 1;
    if (b === "Final") return -1;
    return a.localeCompare(b);
  });

  // ── KPIs ──────────────────────────────────────────────────
  const avg = games.length
    ? (games.reduce((s, g) => s + g.nrfi, 0) / games.length * 100).toFixed(1)
    : "—";
  const best = games.length
    ? games.reduce((a, b) => (a.nrfi > b.nrfi ? a : b))
    : null;
  const strong = games.filter((g) => g.nrfi >= 0.6).length;
  const day = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const S = {
    page: {
      minHeight: "100vh",
      fontFamily: "var(--sans)",
      color: "var(--ink)",
      background: "var(--paper)",
      WebkitFontSmoothing: "antialiased",
    },
  };

  // ── Loading / Error states ────────────────────────────────
  if (loading)
    return (
      <>
        <style>{CSS}</style>
        <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 28, height: 28, border: "2px solid var(--rule)", borderTopColor: "var(--ink3)", borderRadius: "50%", animation: "spin .7s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 14, color: "var(--ink2)" }}>Loading today's slate…</div>
          </div>
        </div>
      </>
    );

  if (error)
    return (
      <>
        <style>{CSS}</style>
        <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", maxWidth: 320 }}>
            <div style={{ fontSize: 14, color: "var(--ink)", marginBottom: 8 }}>Unable to load data</div>
            <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 20 }}>{error}</div>
            <button onClick={fetchData} style={{ background: "var(--ink)", border: "none", color: "var(--paper)", padding: "10px 28px", fontSize: 13, cursor: "pointer", fontFamily: "var(--sans)" }}>
              Retry
            </button>
          </div>
        </div>
      </>
    );

  // ── Main render ───────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div style={S.page}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px" }}>
          <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", borderBottom: "1px solid var(--rule)" }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)" }}>InningEdge</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span className="nav-date" style={{ fontSize: 12, color: "var(--ink4)" }}>{day}</span>
              <button onClick={fetchData} style={{ background: "none", border: "1px solid var(--rule)", color: "var(--ink3)", padding: "6px 16px", fontSize: 12, cursor: "pointer", fontFamily: "var(--sans)" }}>
                Refresh
              </button>
            </div>
          </nav>
        </div>

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px" }}>
          {/* KPIs */}
          <div className="kpi-row" style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid var(--ink)" }}>
            {[
              { l: "Average", v: `${avg}%`, s: `${games.length} games` },
              { l: "Best play", v: best ? `${(best.nrfi * 100).toFixed(1)}%` : "—", s: best ? `${best.aa} at ${best.ha}` : "" },
              { l: "Strong plays", v: String(strong), s: "60%+" },
            ].map((k, i) => (
              <div key={i} className="kpi" style={{ flex: 1, padding: "0 0 14px", ...(i > 0 ? { paddingLeft: 20, borderLeft: "1px solid var(--rule-l)" } : {}) }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>{k.l}</div>
                <div style={{ fontSize: 28, fontFamily: "var(--serif)", color: "var(--ink)", lineHeight: 1 }}>{k.v}</div>
                <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 3 }}>{k.s}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
            <div>
              {[["all", "All games"], ["strong", "Strong"], ["upcoming", "Upcoming"], ["live", "Live"]].map(([k, l]) => (
                <button key={k} className={`ftab${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--ink4)", fontSize: 13 }}>
              No games match this filter.
            </div>
          ) : (
            groupOrder.map((timeKey) => (
              <div key={timeKey} style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 500, color: "var(--ink)", paddingBottom: 8, borderBottom: "2px solid var(--ink)", display: "inline-block", marginBottom: 2 }}>
                  {timeKey}
                </div>
                {groups[timeKey].map((g) => {
                  const c = conf(g.nrfi);
                  const exp = expanded === g.pk;
                  let res = null;
                  if (g.isFinal && g.fir) {
                    const hit = g.fir.a === 0 && g.fir.h === 0;
                    res = { t: hit ? "NRFI" : "YRFI", hit, c: hit ? "#0f7b5f" : "#a63d3d" };
                  }

                  return (
                    <div key={g.pk}>
                      <div className={`tl-game ${c.cls}${exp ? " expanded" : ""}`} onClick={() => setExpanded(exp ? null : g.pk)}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 2, letterSpacing: "-0.01em" }}>
                            {g.aa} at {g.ha}
                          </div>
                          <div className="tl-pitchers-stats" style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--ink3)" }}>
                            <span>{g.ap?.name || "TBD"}</span>
                            <span style={{ color: "var(--ink5)" }}>vs</span>
                            <span>{g.hp?.name || "TBD"}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 3 }}>
                            {g.v} · PF {g.pf.toFixed(2)}
                          </div>
                          {res && (
                            <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "var(--mono)", marginTop: 3, color: res.c }}>
                              {res.t} {g.fir.a}-{g.fir.h}
                            </div>
                          )}
                        </div>
                        <div className="tl-prob" style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
                          <div className="tl-pct" style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1, letterSpacing: "-0.02em", color: c.c }}>
                            {(g.nrfi * 100).toFixed(1)}%
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: c.c, letterSpacing: ".04em", marginTop: 2 }}>{c.t}</div>
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {exp && (
                        <div className="di-box">
                          <div className="di-grid">
                            {[
                              { abbr: g.aa, side: "Away", pn: g.apn, bn: g.abn, p: g.ap },
                              { abbr: g.ha, side: "Home", pn: g.hpn, bn: g.hbn, p: g.hp },
                            ].map((t) => (
                              <div key={t.side}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                                  {t.abbr} — {t.side}
                                </div>
                                {[
                                  ["Pitcher hold rate", `${(t.pn * 100).toFixed(1)}%`],
                                  ["Bat NRFI rate", `${(t.bn * 100).toFixed(1)}%`],
                                ].map(([label, val], i) => (
                                  <div key={i} className="di-stat">
                                    <span style={{ color: "var(--ink4)" }}>{label}</span>
                                    <span style={{ fontFamily: "var(--mono)", fontWeight: 500, color: "var(--ink)" }}>{val}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--rule)" }}>
                            Park factor {g.pf.toFixed(2)} ·{" "}
                            {g.pf > 1.03 ? "Hitter-friendly" : g.pf < 0.97 ? "Pitcher-friendly" : "Neutral"}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
