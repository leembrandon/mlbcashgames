import { useState, useEffect, useCallback } from "react";

const API_BASE = "https://statsapi.mlb.com/api/v1";

const TEAM_ABBREVS = {
  "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS", "Chicago Cubs": "CHC", "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
  "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN", "New York Mets": "NYM",
  "New York Yankees": "NYY", "Athletics": "ATH", "Oakland Athletics": "ATH",
  "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT", "San Diego Padres": "SD",
  "San Francisco Giants": "SF", "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB", "Texas Rangers": "TEX", "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH",
};

const TEAM_COLORS = {
  ARI: "#A71930", ATL: "#CE1141", BAL: "#DF4601", BOS: "#BD3039",
  CHC: "#0E3386", CWS: "#27251F", CIN: "#C6011F", CLE: "#00385D",
  COL: "#333366", DET: "#0C2340", HOU: "#002D62", KC: "#004687",
  LAA: "#BA0021", LAD: "#005A9C", MIA: "#00A3E0", MIL: "#FFC52F",
  MIN: "#002B5C", NYM: "#002D72", NYY: "#003087", ATH: "#003831",
  PHI: "#E81828", PIT: "#FDB827", SD: "#2F241D", SF: "#FD5A1E",
  SEA: "#0C2C56", STL: "#C41E3A", TB: "#092C5C", TEX: "#003278",
  TOR: "#134A8E", WSH: "#AB0003",
};

const PARK_FACTORS = {
  "Coors Field": 1.38, "Great American Ball Park": 1.15, "Globe Life Field": 1.04,
  "Fenway Park": 1.08, "Wrigley Field": 1.05, "Citizens Bank Park": 1.06,
  "Yankee Stadium": 1.08, "American Family Field": 1.05, "Oriole Park at Camden Yards": 1.04,
  "Target Field": 1.02, "Busch Stadium": 0.94, "Oracle Park": 0.88,
  "Tropicana Field": 0.96, "Petco Park": 0.93, "Kauffman Stadium": 0.98,
  "T-Mobile Park": 0.95, "Citi Field": 0.95, "Dodger Stadium": 0.93,
  "UNIQLO Field at Dodger Stadium": 0.93, "Minute Maid Park": 1.02,
  "Daikin Park": 1.02, "loanDepot park": 1.01, "PNC Park": 0.97,
  "Comerica Park": 0.96, "Progressive Field": 0.97, "Rogers Centre": 1.02,
  "Nationals Park": 1.00, "Chase Field": 1.06, "Angel Stadium": 1.00,
  "Rate Field": 1.01, "Guaranteed Rate Field": 1.01,
  "Estadio Alfredo Harp Helu": 1.12, "Truist Park": 0.99,
};

function getAbbrev(name) {
  return TEAM_ABBREVS[name] || name?.split(" ").pop()?.substring(0, 3).toUpperCase() || "???";
}
function getParkFactor(venueName) {
  if (!venueName) return 1.0;
  for (const [key, val] of Object.entries(PARK_FACTORS)) {
    if (venueName.toLowerCase().includes(key.toLowerCase().substring(0, 10))) return val;
  }
  return 1.0;
}

// === MODEL v2 ===
const HALF_INNING_NRFI_BASELINE = 0.735;
function toLogOdds(p) { return Math.log(p / (1 - p)); }
function fromLogOdds(lo) { return 1 / (1 + Math.exp(-lo)); }
function bayesBlend(rate, n, prior, pw) { return n < 2 ? prior : (rate * n + prior * pw) / (n + pw); }

function computeNRFI({ awayPitchNRFI, homePitchNRFI, awayBatNRFI, homeBatNRFI, parkFactor, sampleAway, sampleHome }) {
  const B = HALF_INNING_NRFI_BASELINE, blo = toLogOdds(B);
  const ap = bayesBlend(awayPitchNRFI, sampleAway, B, 2);
  const hp = bayesBlend(homePitchNRFI, sampleHome, B, 2);
  const ab = bayesBlend(awayBatNRFI, 20, B, 3);
  const hb = bayesBlend(homeBatNRFI, 20, B, 3);
  const topLO = blo + (toLogOdds(hp) - blo) * 0.65 + (toLogOdds(ab) - blo) * 0.35;
  const botLO = blo + (toLogOdds(ap) - blo) * 0.65 + (toLogOdds(hb) - blo) * 0.35;
  const ps = (1 - parkFactor) * 0.6;
  return Math.min(0.88, Math.max(0.32, fromLogOdds(toLogOdds(fromLogOdds(topLO)) + toLogOdds(fromLogOdds(botLO)) - blo + ps)));
}

function getConfidence(nrfi) {
  if (nrfi >= 0.68) return { label: "Strong", color: "#0d9255" };
  if (nrfi >= 0.58) return { label: "Lean", color: "#2b7cc1" };
  if (nrfi >= 0.50) return { label: "Toss-up", color: "#c08a18" };
  return { label: "Fade", color: "#c43a3a" };
}

// Horizontal bar
function ProbBar({ value, color }) {
  return (
    <div style={{ width: "100%", height: 6, borderRadius: 3, background: "#e8eef6", overflow: "hidden" }}>
      <div style={{
        height: "100%", borderRadius: 3, background: color,
        width: `${value}%`, transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

function StatLine({ label, value, detail }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", borderBottom: "1px solid #f0f4f9" }}>
      <span className="ie-stat-label">{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        {detail && <span className="ie-stat-detail">{detail}</span>}
        <span className="ie-stat-value">{value}</span>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,400&family=IBM+Plex+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600&display=swap');

:root {
  --white: #ffffff;
  --powder: #f4f8fc;
  --powder-mid: #e4edf7;
  --powder-deep: #c9daf0;
  --blue: #4a90c4;
  --blue-dark: #2b5f8a;
  --blue-deeper: #1a3d5c;
  --ink: #1b2431;
  --ink-light: #3d4f63;
  --ink-muted: #7a8a9e;
  --ink-faint: #a8b5c4;
  --ink-ghost: #c8d1dc;
  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'Outfit', -apple-system, sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--powder); }

@keyframes enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes spin { to { transform: rotate(360deg); } }

/* Base classes */
.ie-stat-label { font-size: 12px; color: var(--ink-muted); font-family: var(--font-body); }
.ie-stat-value { font-size: 13px; font-weight: 600; color: var(--ink); font-family: var(--font-mono); }
.ie-stat-detail { font-size: 10px; color: var(--ink-faint); font-family: var(--font-mono); }

.ie-stats-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
.ie-card-inner { padding: 20px; }
.ie-card-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ie-matchup { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
.ie-team-col { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.ie-at { font-size: 12px; color: var(--ink-faint); font-weight: 500; font-family: var(--font-body); flex-shrink: 0; }
.ie-p-name { font-size: 14px; font-weight: 500; color: var(--ink); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-body); }
.ie-p-stats { font-size: 11px; color: var(--ink-muted); font-family: var(--font-mono); margin-top: 2px; }
.ie-score-col { flex-shrink: 0; text-align: right; min-width: 72px; }
.ie-meta-row { display: flex; align-items: center; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--powder-mid); flex-wrap: wrap; }
.ie-meta-item { font-size: 11px; color: var(--ink-faint); font-family: var(--font-body); }
.ie-meta-mono { font-size: 10px; color: var(--ink-faint); font-family: var(--font-mono); }
.ie-k9-group { display: contents; }
.ie-expanded { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--powder-mid); }
.ie-nav-date { font-size: 12px; color: var(--ink-muted); font-family: var(--font-body); }
.ie-filter-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }

@media (max-width: 640px) {
  .ie-stats-row { grid-template-columns: repeat(3,1fr); gap: 8px; }
  .ie-stats-row > div { padding: 12px !important; }

  .ie-card-inner { padding: 14px; }
  .ie-card-main { flex-direction: column; gap: 12px; }
  .ie-matchup { flex-direction: column; align-items: stretch; gap: 8px; }
  .ie-at { display: none; }
  .ie-team-col { width: 100%; }
  .ie-score-col { display: flex; align-items: center; justify-content: space-between;
    width: 100%; text-align: left; min-width: unset;
    padding-top: 10px; border-top: 1px solid var(--powder-mid); }
  .ie-p-name { font-size: 13px; }

  .ie-meta-row { gap: 6px; }
  .ie-k9-group { display: none; }
  .ie-expanded { grid-template-columns: 1fr; gap: 16px; }
  .ie-nav-date { display: none; }

  .ie-filter-row { gap: 6px; }
  .ie-filter-row button { padding: 6px 10px !important; font-size: 11px !important; }
}

@media (max-width: 380px) {
  .ie-stats-row { grid-template-columns: 1fr; gap: 6px; }
}
`;

export default function NRFILive() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("nrfi");
  const [filter, setFilter] = useState("all");
  const [dataInfo, setDataInfo] = useState({ gamesScanned: 0 });
  const [expandedGame, setExpandedGame] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const today = new Date().toISOString().split("T")[0];
      const schedRes = await fetch(`${API_BASE}/schedule?date=${today}&sportId=1&hydrate=probablePitcher(note),linescore,venue`);
      const schedData = await schedRes.json();
      const todayGames = schedData.dates?.[0]?.games || [];
      const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const histRes = await fetch(`${API_BASE}/schedule?startDate=${thirtyAgo}&endDate=${today}&sportId=1&hydrate=linescore&gameType=R`);
      const histData = await histRes.json();
      const teamStats = {};
      let gamesScanned = 0;
      for (const d of histData.dates || []) for (const g of d.games || []) {
        if (g.status?.detailedState !== "Final") continue;
        const inn = g.linescore?.innings; if (!inn?.length) continue;
        const ar = inn[0]?.away?.runs ?? null, hr = inn[0]?.home?.runs ?? null;
        if (ar === null || hr === null) continue; gamesScanned++;
        const aa = getAbbrev(g.teams?.away?.team?.name), ha = getAbbrev(g.teams?.home?.team?.name);
        for (const [ab, r] of [[aa, ar], [ha, hr]]) {
          if (!teamStats[ab]) teamStats[ab] = { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
          teamStats[ab].batGames++; if (r === 0) teamStats[ab].batNRFI++;
        }
        if (!teamStats[ha]) teamStats[ha] = { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
        teamStats[ha].pitchGames++; if (ar === 0) teamStats[ha].pitchNRFI++;
        if (!teamStats[aa]) teamStats[aa] = { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
        teamStats[aa].pitchGames++; if (hr === 0) teamStats[aa].pitchNRFI++;
      }
      const pids = new Set();
      for (const g of todayGames) {
        if (g.teams?.away?.probablePitcher?.id) pids.add(g.teams.away.probablePitcher.id);
        if (g.teams?.home?.probablePitcher?.id) pids.add(g.teams.home.probablePitcher.id);
      }
      const pMap = {};
      await Promise.all([...pids].map(async pid => {
        try {
          const r = await fetch(`${API_BASE}/people/${pid}/stats?stats=gameLog&group=pitching&season=2026&gameType=R`);
          const d = await r.json(); const sp = d.stats?.[0]?.splits || [];
          let er = 0, ip = 0, k = 0, bb = 0, h = 0, st = 0;
          for (const s of sp) { er += s.stat?.earnedRuns||0; ip += parseFloat(s.stat?.inningsPitched||0); k += s.stat?.strikeOuts||0; bb += s.stat?.baseOnBalls||0; h += s.stat?.hits||0; st++; }
          pMap[pid] = { era: ip>0?(er*9)/ip:4.5, whip: ip>0?(bb+h)/ip:1.3, k9: ip>0?(k*9)/ip:7, bb9: ip>0?(bb*9)/ip:3, starts: st, ip };
        } catch { pMap[pid] = null; }
      }));

      const p2n = s => {
        if (!s) return HALF_INNING_NRFI_BASELINE;
        const re = (s.era / 9) * 0.9;
        const kf = 1 - Math.min(0.08, Math.max(-0.04, (s.k9 - 8.5) * 0.015));
        const bf = 1 + Math.max(0, (s.bb9 - 2.8) * 0.03);
        const wf = 1 + Math.max(0, (s.whip - 1.2) * 0.08);
        return Math.min(0.93, Math.max(0.45, Math.exp(-re * kf * bf * wf)));
      };

      const processed = todayGames.map(g => {
        const aa = getAbbrev(g.teams?.away?.team?.name || "TBD");
        const ha = getAbbrev(g.teams?.home?.team?.name || "TBD");
        const ap = g.teams?.away?.probablePitcher, hp = g.teams?.home?.probablePitcher;
        const v = g.venue?.name || "", pf = getParkFactor(v);
        const st = g.status?.detailedState || "Scheduled";
        let fir = null;
        if (g.linescore?.innings?.length > 0) { const fi = g.linescore.innings[0]; fir = { awayRuns: fi.away?.runs ?? "?", homeRuns: fi.home?.runs ?? "?" }; }
        const aps = ap?.id ? pMap[ap.id] : null, hps = hp?.id ? pMap[hp.id] : null;
        const atd = teamStats[aa] || { batGames:0,batNRFI:0,pitchGames:0,pitchNRFI:0 };
        const htd = teamStats[ha] || { batGames:0,batNRFI:0,pitchGames:0,pitchNRFI:0 };
        const abn = atd.batGames > 0 ? atd.batNRFI/atd.batGames : 0.7;
        const hbn = htd.batGames > 0 ? htd.batNRFI/htd.batGames : 0.7;
        const apn = p2n(aps), hpn = p2n(hps);
        const nrfi = computeNRFI({ awayPitchNRFI:apn, homePitchNRFI:hpn, awayBatNRFI:abn, homeBatNRFI:hbn, parkFactor:pf, sampleAway:aps?.starts||0, sampleHome:hps?.starts||0 });
        return {
          gamePk: g.gamePk, awayAbbr: aa, homeAbbr: ha,
          awayP: ap ? { name: ap.fullName, hand: ap.pitchHand?.code||"?", ...aps } : null,
          homeP: hp ? { name: hp.fullName, hand: hp.pitchHand?.code||"?", ...hps } : null,
          venue: v, parkFactor: pf,
          time: new Date(g.gameDate).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", timeZone:"America/New_York" }),
          status: st, firstInningResult: fir, nrfi, awayBatNRFI: abn, homeBatNRFI: hbn, awayPitchNRFI: apn, homePitchNRFI: hpn, awayTeamData: atd, homeTeamData: htd,
        };
      });
      setGames(processed);
      setDataInfo({ gamesScanned });
      setLoading(false);
    } catch (e) { setError(e.message); setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sorted = (() => {
    let a = [...games];
    if (filter === "strong") a = a.filter(g => g.nrfi >= 0.60);
    if (filter === "upcoming") a = a.filter(g => g.status === "Scheduled" || g.status === "Pre-Game");
    if (filter === "live") a = a.filter(g => g.status.includes("Progress"));
    if (sortBy === "nrfi") a.sort((x, y) => y.nrfi - x.nrfi);
    else a.sort((x, y) => new Date(x.time) - new Date(y.time));
    return a;
  })();

  const avgNRFI = games.length ? (games.reduce((s, g) => s + g.nrfi, 0) / games.length * 100).toFixed(1) : "—";
  const best = games.length ? games.reduce((a, b) => a.nrfi > b.nrfi ? a : b) : null;
  const strong = games.filter(g => g.nrfi >= 0.60).length;
  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const shell = { minHeight: "100vh", fontFamily: "var(--font-body)", WebkitFontSmoothing: "antialiased" };

  if (loading) return (
    <><style>{CSS}</style>
    <div style={{ ...shell, background: "var(--powder)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 32, height: 32, border: "2.5px solid var(--powder-deep)", borderTopColor: "var(--blue)", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 20px" }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-display)" }}>Loading today's slate</div>
        <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>Pulling pitcher logs & first-inning data</div>
      </div>
    </div></>
  );

  if (error) return (
    <><style>{CSS}</style>
    <div style={{ ...shell, background: "var(--powder)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 340, padding: "0 24px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-display)", marginBottom: 8 }}>Couldn't load data</div>
        <div style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 20, lineHeight: 1.6 }}>{error}</div>
        <button onClick={fetchData} style={{
          background: "var(--blue)", border: "none", color: "#fff", padding: "10px 28px",
          borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)",
        }}>Try again</button>
      </div>
    </div></>
  );

  return (
    <><style>{CSS}</style>
    <div style={{ ...shell, background: "var(--powder)", color: "var(--ink)" }}>

      {/* Nav */}
      <nav style={{
        background: "var(--white)", borderBottom: "1px solid var(--powder-mid)",
        padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: "var(--blue)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "#fff",
            letterSpacing: "-0.02em",
          }}>ie</div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.03em" }}>
            Inning<span style={{ color: "var(--blue)" }}>Edge</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="ie-nav-date">{todayStr}</span>
          <button onClick={fetchData} style={{
            background: "var(--powder)", border: "1px solid var(--powder-mid)", color: "var(--ink-light)",
            padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
            fontFamily: "var(--font-body)", fontWeight: 500,
          }}>Refresh</button>
        </div>
      </nav>

      <div style={{ maxWidth: 840, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* Stat cards */}
        <div className="ie-stats-row" style={{ marginBottom: 24 }}>
          {[
            { label: "Avg Probability", val: `${avgNRFI}%`, sub: `across ${games.length} games` },
            { label: "Best Play", val: best ? `${(best.nrfi*100).toFixed(1)}%` : "—", sub: best ? `${best.awayAbbr} @ ${best.homeAbbr}` : "" },
            { label: "Strong Plays", val: String(strong), sub: "≥ 60% NRFI" },
          ].map((s, i) => (
            <div key={i} style={{
              background: "var(--white)", borderRadius: 12, padding: "18px 20px",
              border: "1px solid var(--powder-mid)",
              animation: `enter 0.35s ease ${i * 0.06}s both`,
            }}>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{s.label}</div>
              <div className="ie-stat-val" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, fontFamily: "var(--font-display)", color: "var(--ink)" }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 6, fontFamily: "var(--font-body)" }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="ie-filter-row" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 4, background: "var(--white)", borderRadius: 10, padding: 4, border: "1px solid var(--powder-mid)" }}>
            {[{ key: "all", l: "All" }, { key: "strong", l: "Strong" }, { key: "upcoming", l: "Upcoming" }, { key: "live", l: "Live" }].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                background: filter === f.key ? "var(--powder)" : "transparent",
                border: "none", color: filter === f.key ? "var(--ink)" : "var(--ink-faint)",
                padding: "7px 16px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                fontWeight: filter === f.key ? 600 : 400, fontFamily: "var(--font-body)",
              }}>
                {f.key === "live" && <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#d93636", marginRight: 6, animation: "pulse 2s infinite" }} />}
                {f.l}
              </button>
            ))}
          </div>
          <button onClick={() => setSortBy(sortBy === "nrfi" ? "time" : "nrfi")} style={{
            background: "var(--white)", border: "1px solid var(--powder-mid)", color: "var(--ink-muted)",
            padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer",
            fontFamily: "var(--font-body)", fontWeight: 500,
          }}>Sort: {sortBy === "nrfi" ? "Probability" : "Game Time"}</button>
        </div>

        {/* Empty */}
        {sorted.length === 0 && (
          <div style={{ textAlign: "center", padding: "56px 20px", color: "var(--ink-faint)", fontSize: 13, borderRadius: 12, border: "1px dashed var(--powder-deep)", background: "var(--white)" }}>
            No games match this filter.
          </div>
        )}

        {/* Game cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((game, idx) => {
            const conf = getConfidence(game.nrfi);
            const pct = (game.nrfi * 100).toFixed(1);
            const isLive = game.status.includes("Progress");
            const isFinal = game.status === "Final";
            const expanded = expandedGame === game.gamePk;

            let resultTag = null;
            if (isFinal && game.firstInningResult) {
              const hit = game.firstInningResult.awayRuns === 0 && game.firstInningResult.homeRuns === 0;
              resultTag = { text: hit ? "NRFI" : "YRFI", hit };
            }

            return (
              <div key={game.gamePk} style={{
                background: "var(--white)", border: `1px solid ${expanded ? "var(--powder-deep)" : "var(--powder-mid)"}`,
                borderRadius: 14, overflow: "hidden", cursor: "pointer",
                transition: "border-color 0.2s, box-shadow 0.2s",
                boxShadow: expanded ? "0 2px 12px rgba(74,144,196,0.08)" : "0 1px 3px rgba(0,0,0,0.03)",
                animation: `enter 0.3s ease ${idx * 0.03}s both`,
              }}
              onClick={() => setExpandedGame(expanded ? null : game.gamePk)}
              >
                <div className="ie-card-inner">
                  <div className="ie-card-main">
                    {/* Teams */}
                    <div className="ie-matchup">
                      <div className="ie-team-col">
                        <div style={{
                          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                          background: TEAM_COLORS[game.awayAbbr] || "#6b7280",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "var(--font-mono)",
                          letterSpacing: "-0.02em",
                        }}>{game.awayAbbr}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="ie-p-name">{game.awayP?.name || "TBD"}</div>
                          {game.awayP && <div className="ie-p-stats">{game.awayP.era?.toFixed(2)} ERA · {game.awayP.whip?.toFixed(2)} WHIP</div>}
                        </div>
                      </div>

                      <span className="ie-at">at</span>

                      <div className="ie-team-col">
                        <div style={{
                          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                          background: TEAM_COLORS[game.homeAbbr] || "#6b7280",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "var(--font-mono)",
                          letterSpacing: "-0.02em",
                        }}>{game.homeAbbr}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="ie-p-name">{game.homeP?.name || "TBD"}</div>
                          {game.homeP && <div className="ie-p-stats">{game.homeP.era?.toFixed(2)} ERA · {game.homeP.whip?.toFixed(2)} WHIP</div>}
                        </div>
                      </div>
                    </div>

                    {/* Score column */}
                    <div className="ie-score-col">
                      <div>
                        <span style={{
                          fontSize: 10, fontWeight: 500, fontFamily: "var(--font-mono)",
                          color: isLive ? "#d93636" : isFinal ? "var(--ink-faint)" : "var(--ink-muted)",
                          animation: isLive ? "pulse 2s infinite" : "none",
                        }}>
                          {isLive ? "● LIVE" : isFinal ? "FINAL" : game.time + " ET"}
                        </span>
                        {resultTag && (
                          <div style={{
                            fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)", marginTop: 2,
                            color: resultTag.hit ? "#0d9255" : "#c43a3a",
                          }}>
                            {resultTag.text} {game.firstInningResult.awayRuns}-{game.firstInningResult.homeRuns}
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 26, fontWeight: 800, color: conf.color, lineHeight: 1, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
                          {pct}<span style={{ fontSize: 14, fontWeight: 600 }}>%</span>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: conf.color, marginTop: 2, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                          {conf.label}
                        </div>
                        <div style={{ marginTop: 6, width: 72 }}>
                          <ProbBar value={parseFloat(pct)} color={conf.color} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="ie-meta-row">
                    <span className="ie-meta-item">{game.venue}</span>
                    <span className="ie-meta-item">·</span>
                    <span className="ie-meta-mono">PF {game.parkFactor.toFixed(2)}</span>
                    <div style={{ flex: 1 }} />
                    <span className="ie-k9-group">
                      {game.awayP && <span className="ie-meta-mono">{game.awayP.k9?.toFixed(1)} K/9</span>}
                      {game.awayP && game.homeP && <span className="ie-meta-item" style={{ margin: "0 3px" }}>·</span>}
                      {game.homeP && <span className="ie-meta-mono">{game.homeP.k9?.toFixed(1)} K/9</span>}
                    </span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--ink-faint)" strokeWidth="1.5"
                      style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                      <path d="M2 4l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Expanded */}
                  {expanded && (
                    <div className="ie-expanded">
                      {[
                        { abbr: game.awayAbbr, side: "Away", pn: game.awayPitchNRFI, bn: game.awayBatNRFI, td: game.awayTeamData, p: game.awayP },
                        { abbr: game.homeAbbr, side: "Home", pn: game.homePitchNRFI, bn: game.homeBatNRFI, td: game.homeTeamData, p: game.homeP },
                      ].map(t => (
                        <div key={t.side}>
                          <div style={{
                            fontSize: 11, fontWeight: 600, color: "var(--blue-dark)",
                            letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10,
                            fontFamily: "var(--font-body)",
                          }}>{t.abbr} — {t.side}</div>
                          <StatLine label="Pitch Hold Rate" value={`${(t.pn*100).toFixed(1)}%`} />
                          <StatLine label="Batting NRFI" value={`${(t.bn*100).toFixed(1)}%`} detail={`${t.td.batNRFI}/${t.td.batGames}`} />
                          {t.p && <>
                            <StatLine label="Starts" value={t.p.starts||0} />
                            <StatLine label="IP" value={t.p.ip?.toFixed(1)||"—"} />
                            <StatLine label="BB/9" value={t.p.bb9?.toFixed(1)||"—"} />
                            <StatLine label="K/9" value={t.p.k9?.toFixed(1)||"—"} />
                          </>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div></>
  );
}
