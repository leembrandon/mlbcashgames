import { useState, useEffect, useCallback } from "react";

// ── Display helpers (no model logic) ────────────────────────
function conf(n) {
  if (n >= 0.68) return { t: "Strong", c: "#0f7b5f" };
  if (n >= 0.58) return { t: "Lean", c: "#2d6a9f" };
  if (n >= 0.50) return { t: "Toss-up", c: "#8a6d1b" };
  return { t: "Fade", c: "#a63d3d" };
}

function tileStyle(nrfi) {
  const c = conf(nrfi);
  if (nrfi >= 0.68) return { bg: c.c, fg: "#fff" };
  if (nrfi >= 0.62) return { bg: "rgba(45,106,159,0.85)", fg: "#fff" };
  if (nrfi >= 0.58) return { bg: "rgba(45,106,159,0.6)", fg: "#fff" };
  if (nrfi >= 0.54) return { bg: "rgba(138,109,27,0.3)", fg: "var(--ink)" };
  if (nrfi >= 0.50) return { bg: "rgba(138,109,27,0.18)", fg: "var(--ink)" };
  if (nrfi >= 0.45) return { bg: "rgba(166,61,61,0.15)", fg: "var(--ink)" };
  return { bg: "rgba(166,61,61,0.1)", fg: "var(--ink)" };
}

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

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:3px;}
.tile{padding:16px 14px;cursor:pointer;min-height:115px;display:flex;flex-direction:column;justify-content:space-between;transition:opacity .12s;}
.tile:hover{opacity:.85;}

.dp{background:var(--rule-l);padding:20px;margin-bottom:12px;}
.dp-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;}
.dp-stat{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;}

.ftab{background:none;border:none;cursor:pointer;font-family:var(--sans);font-size:13px;padding:6px 0;margin-right:18px;color:var(--ink4);border-bottom:2px solid transparent;font-weight:400;}
.ftab.on{color:var(--ink);border-bottom-color:var(--ink);font-weight:600;}

@media(max-width:600px){
  .grid{grid-template-columns:repeat(2,1fr);gap:2px;}
  .tile{min-height:100px;padding:12px 10px;}
  .tile-pct{font-size:20px!important;}
  .kpi-row{flex-direction:column!important;}
  .kpi+.kpi{border-left:none!important;padding-left:0!important;border-top:1px solid var(--rule-l);padding-top:10px!important;}
  .dp-grid{grid-template-columns:1fr;}
  .nav-date{display:none;}
  .dp-pitchers{flex-direction:column!important;gap:4px!important;}
}
`;

export default function App() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("nrfi");
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/data?type=predictions&date=${today}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const { predictions } = await res.json();

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
            ? { name: p.away_pitcher_name, holdRate: p.away_pitcher_hold_rate }
            : null,
          hp: p.home_pitcher_name
            ? { name: p.home_pitcher_name, holdRate: p.home_pitcher_hold_rate }
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
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Sorting & filtering ───────────────────────────────────
  const sorted = (() => {
    let a = [...games];
    if (filter === "strong") a = a.filter((g) => g.nrfi >= 0.6);
    if (filter === "upcoming") a = a.filter((g) => g.st === "Scheduled" || g.st === "Pre-Game");
    if (filter === "live") a = a.filter((g) => g.isLive);
    if (sortBy === "nrfi") a.sort((x, y) => y.nrfi - x.nrfi);
    else a.sort((x, y) => (x.time || "").localeCompare(y.time || ""));
    return a;
  })();

  // ── KPIs ──────────────────────────────────────────────────
  const avg = games.length
    ? (games.reduce((s, g) => s + g.nrfi, 0) / games.length * 100).toFixed(1)
    : "—";
  const best = games.length ? games.reduce((a, b) => (a.nrfi > b.nrfi ? a : b)) : null;
  const strong = games.filter((g) => g.nrfi >= 0.6).length;
  const day = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const selGame = games.find((g) => g.pk === sel);

  const S = {
    page: {
      minHeight: "100vh",
      fontFamily: "var(--sans)",
      color: "var(--ink)",
      background: "var(--paper)",
      WebkitFontSmoothing: "antialiased",
    },
  };

  // ── Loading / Error ───────────────────────────────────────
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
        {/* Nav */}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div>
              {[["all", "All games"], ["strong", "Strong"], ["upcoming", "Upcoming"], ["live", "Live"]].map(([k, l]) => (
                <button key={k} className={`ftab${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            <button onClick={() => setSortBy(sortBy === "nrfi" ? "time" : "nrfi")} style={{ fontSize: 12, color: "var(--ink4)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)" }}>
              Sort by {sortBy === "nrfi" ? "probability" : "time"} ↓
            </button>
          </div>

          {/* Detail panel */}
          {selGame && (
            <div className="dp">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 2 }}>{selGame.aa} at {selGame.ha}</div>
                  <div style={{ fontSize: 12, color: "var(--ink4)" }}>{selGame.v} · PF {selGame.pf.toFixed(2)} · {selGame.time} ET</div>
                </div>
                <div style={{ textAlign: "right", display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 32, fontFamily: "var(--serif)", color: conf(selGame.nrfi).c, lineHeight: 1 }}>{(selGame.nrfi * 100).toFixed(1)}%</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: conf(selGame.nrfi).c, marginTop: 2 }}>{conf(selGame.nrfi).t}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setSel(null); }} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--ink4)", lineHeight: 1 }}>✕</button>
                </div>
              </div>
              <div className="dp-pitchers" style={{ display: "flex", gap: 20, fontSize: 13, color: "var(--ink2)", marginBottom: 4 }}>
                <div><span style={{ fontWeight: 600, color: "var(--ink)" }}>{selGame.ap?.name || "TBD"}</span></div>
                <div style={{ color: "var(--ink4)" }}>vs</div>
                <div><span style={{ fontWeight: 600, color: "var(--ink)" }}>{selGame.hp?.name || "TBD"}</span></div>
              </div>
              <div className="dp-grid" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--rule)" }}>
                {[
                  { abbr: selGame.aa, side: "Away", pn: selGame.apn, bn: selGame.abn },
                  { abbr: selGame.ha, side: "Home", pn: selGame.hpn, bn: selGame.hbn },
                ].map((t) => (
                  <div key={t.side}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{t.abbr} — {t.side}</div>
                    {[
                      ["Pitcher hold rate", `${(t.pn * 100).toFixed(1)}%`],
                      ["Bat NRFI rate", `${(t.bn * 100).toFixed(1)}%`],
                    ].map(([label, val], i) => (
                      <div key={i} className="dp-stat">
                        <span style={{ color: "var(--ink4)" }}>{label}</span>
                        <span style={{ fontFamily: "var(--mono)", fontWeight: 500, color: "var(--ink)" }}>{val}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink4)", marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--rule)" }}>
                Park factor {selGame.pf.toFixed(2)} · {selGame.pf > 1.03 ? "Hitter-friendly" : selGame.pf < 0.97 ? "Pitcher-friendly" : "Neutral"}
              </div>
            </div>
          )}

          {/* Tiles */}
          {sorted.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--ink4)", fontSize: 13 }}>No games match this filter.</div>
          ) : (
            <div className="grid">
              {sorted.map((g) => {
                const c = conf(g.nrfi);
                const ts2 = tileStyle(g.nrfi);
                let res = null;
                if (g.isFinal && g.fir) {
                  const hit = g.fir.a === 0 && g.fir.h === 0;
                  res = { t: hit ? "NRFI" : "YRFI", hit };
                }
                return (
                  <div key={g.pk} className="tile" style={{ background: ts2.bg, color: ts2.fg }} onClick={() => setSel(sel === g.pk ? null : g.pk)}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 2 }}>{g.aa} at {g.ha}</div>
                      <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.4 }}>{g.ap?.name?.split(" ").pop() || "TBD"} vs {g.hp?.name?.split(" ").pop() || "TBD"}</div>
                    </div>
                    <div style={{ marginTop: "auto", paddingTop: 10 }}>
                      <div className="tile-pct" style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 500, lineHeight: 1 }}>{(g.nrfi * 100).toFixed(1)}%</div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".04em", marginTop: 2 }}>{c.t}</div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, opacity: 0.5, marginTop: 4 }}>
                        {g.isLive ? (
                          <>
                            <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: ts2.fg === "var(--ink)" ? "#a63d3d" : "#fff", marginRight: 4, animation: "liveDot 2s infinite" }} />
                            Live
                          </>
                        ) : g.isFinal ? (
                          <>Final{res && ` · ${res.t}`}</>
                        ) : (
                          g.time + " ET"
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
