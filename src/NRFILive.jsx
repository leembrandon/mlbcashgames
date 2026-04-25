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

// === NRFI MODEL v2 ===
const HALF_INNING_NRFI_BASELINE = 0.735;
function toLogOdds(p) { return Math.log(p / (1 - p)); }
function fromLogOdds(lo) { return 1 / (1 + Math.exp(-lo)); }
function bayesBlend(rate, n, prior, priorWeight) {
  if (n < 2) return prior;
  return (rate * n + prior * priorWeight) / (n + priorWeight);
}

function computeNRFI({ awayPitchNRFI, homePitchNRFI, awayBatNRFI, homeBatNRFI, parkFactor, sampleAway, sampleHome }) {
  const awayPitchAdj = bayesBlend(awayPitchNRFI, sampleAway, HALF_INNING_NRFI_BASELINE, 2);
  const homePitchAdj = bayesBlend(homePitchNRFI, sampleHome, HALF_INNING_NRFI_BASELINE, 2);
  const awayBatAdj = bayesBlend(awayBatNRFI, 20, HALF_INNING_NRFI_BASELINE, 3);
  const homeBatAdj = bayesBlend(homeBatNRFI, 20, HALF_INNING_NRFI_BASELINE, 3);
  const baseLogOdds = toLogOdds(HALF_INNING_NRFI_BASELINE);
  const topPitchDelta = toLogOdds(homePitchAdj) - baseLogOdds;
  const topBatDelta = toLogOdds(awayBatAdj) - baseLogOdds;
  const topLogOdds = baseLogOdds + topPitchDelta * 0.65 + topBatDelta * 0.35;
  const pNoRunTop = fromLogOdds(topLogOdds);
  const botPitchDelta = toLogOdds(awayPitchAdj) - baseLogOdds;
  const botBatDelta = toLogOdds(homeBatAdj) - baseLogOdds;
  const botLogOdds = baseLogOdds + botPitchDelta * 0.65 + botBatDelta * 0.35;
  const pNoRunBot = fromLogOdds(botLogOdds);
  const parkShift = (1 - parkFactor) * 0.6;
  const fullGameLogOdds = toLogOdds(pNoRunTop) + toLogOdds(pNoRunBot) - baseLogOdds + parkShift;
  const nrfi = fromLogOdds(fullGameLogOdds);
  return Math.min(0.88, Math.max(0.32, nrfi));
}

function getConfidence(nrfi) {
  if (nrfi >= 0.68) return { label: "STRONG", color: "#22c55e", bg: "rgba(34,197,94,0.06)" };
  if (nrfi >= 0.58) return { label: "LEAN", color: "#3b82f6", bg: "rgba(59,130,246,0.06)" };
  if (nrfi >= 0.50) return { label: "TOSS-UP", color: "#eab308", bg: "rgba(234,179,8,0.06)" };
  return { label: "FADE", color: "#ef4444", bg: "rgba(239,68,68,0.06)" };
}

function CircleGauge({ value, color, size = 58 }) {
  const stroke = 3;
  const radius = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
    </svg>
  );
}

function StatRow({ label, value, detail }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        {detail && <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{detail}</span>}
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{value}</span>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

:root {
  --bg-root: #09090b;
  --bg-surface: #111113;
  --bg-elevated: #19191d;
  --bg-hover: #222228;
  --border: rgba(255,255,255,0.06);
  --border-subtle: rgba(255,255,255,0.03);
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-muted: #52525b;
  --text-dim: #3f3f46;
  --accent: #22c55e;
  --font-sans: 'DM Sans', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg-root); }

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
@keyframes spin { to { transform: rotate(360deg); } }

/* Mobile-first responsive */
.ie-stats-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1px; }
.ie-card-main { display: flex; align-items: center; justify-content: space-between; }
.ie-teams { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.ie-team-block { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ie-pitcher-stats { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 1px; }
.ie-right-col { display: flex; align-items: center; gap: 14px; flex-shrink: 0; margin-left: 12px; }
.ie-meta { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-subtle); flex-wrap: wrap; }
.ie-meta-venue { font-size: 10px; color: var(--text-dim); }
.ie-meta-k9 { font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); }
.ie-expanded { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.ie-nav-date { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.ie-filter-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.ie-filter-pills { display: flex; gap: 3px; background: var(--bg-surface); border-radius: 8px; padding: 3px; border: 1px solid var(--border); }
.ie-pitcher-name { font-size: 13px; font-weight: 600; color: var(--text-primary); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ie-at-symbol { font-size: 10px; color: var(--text-dim); font-weight: 600; flex-shrink: 0; }

@media (max-width: 640px) {
  .ie-stats-grid { grid-template-columns: repeat(3,1fr); }
  .ie-stats-grid > div { padding: 12px 10px !important; }
  .ie-stats-grid .ie-stat-val { font-size: 20px !important; }

  .ie-card-main { flex-direction: column; align-items: stretch; gap: 12px; }
  .ie-teams { flex-direction: column; gap: 6px; }
  .ie-team-block { width: 100%; }
  .ie-at-symbol { display: none; }
  .ie-right-col { margin-left: 0; justify-content: space-between; width: 100%;
    padding-top: 10px; border-top: 1px solid var(--border-subtle); }
  .ie-pitcher-name { font-size: 12px; }
  .ie-pitcher-stats { font-size: 9px; }

  .ie-meta { gap: 6px; }
  .ie-meta-venue { flex-basis: 100%; margin-bottom: 2px; }
  .ie-meta-k9-group { display: none; }

  .ie-expanded { grid-template-columns: 1fr; gap: 16px; }

  .ie-nav-date { display: none; }
  .ie-filter-pills { overflow-x: auto; flex-shrink: 0; }
  .ie-filter-pills button { padding: 5px 10px !important; font-size: 11px !important; }
}

@media (max-width: 380px) {
  .ie-stats-grid { grid-template-columns: 1fr; }
}
`;

export default function NRFILive() {
  const [games, setGames] = useState([]);
  const [teamNRFI, setTeamNRFI] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("nrfi");
  const [filter, setFilter] = useState("all");
  const [dataInfo, setDataInfo] = useState({ gamesScanned: 0, dateRange: "" });
  const [expandedGame, setExpandedGame] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const today = new Date().toISOString().split("T")[0];
      const schedRes = await fetch(`${API_BASE}/schedule?date=${today}&sportId=1&hydrate=probablePitcher(note),linescore,venue`);
      const schedData = await schedRes.json();
      const todayGames = schedData.dates?.[0]?.games || [];

      const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const histRes = await fetch(`${API_BASE}/schedule?startDate=${thirtyAgo}&endDate=${today}&sportId=1&hydrate=linescore&gameType=R`);
      const histData = await histRes.json();

      const teamStats = {};
      let gamesScanned = 0;
      for (const dateObj of histData.dates || []) {
        for (const game of dateObj.games || []) {
          if (game.status?.detailedState !== "Final") continue;
          const innings = game.linescore?.innings;
          if (!innings || innings.length === 0) continue;
          const firstInning = innings[0];
          const awayRuns1st = firstInning?.away?.runs ?? null;
          const homeRuns1st = firstInning?.home?.runs ?? null;
          if (awayRuns1st === null || homeRuns1st === null) continue;
          gamesScanned++;
          const awayAbbr = getAbbrev(game.teams?.away?.team?.name);
          const homeAbbr = getAbbrev(game.teams?.home?.team?.name);
          for (const [abbr, runs] of [[awayAbbr, awayRuns1st], [homeAbbr, homeRuns1st]]) {
            if (!teamStats[abbr]) teamStats[abbr] = { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
            teamStats[abbr].batGames++;
            if (runs === 0) teamStats[abbr].batNRFI++;
          }
          if (!teamStats[homeAbbr]) teamStats[homeAbbr] = { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
          teamStats[homeAbbr].pitchGames++;
          if (awayRuns1st === 0) teamStats[homeAbbr].pitchNRFI++;
          if (!teamStats[awayAbbr]) teamStats[awayAbbr] = { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
          teamStats[awayAbbr].pitchGames++;
          if (homeRuns1st === 0) teamStats[awayAbbr].pitchNRFI++;
        }
      }

      const pitcherIds = new Set();
      for (const g of todayGames) {
        if (g.teams?.away?.probablePitcher?.id) pitcherIds.add(g.teams.away.probablePitcher.id);
        if (g.teams?.home?.probablePitcher?.id) pitcherIds.add(g.teams.home.probablePitcher.id);
      }
      const pitcherNRFIMap = {};
      await Promise.all([...pitcherIds].map(async (pid) => {
        try {
          const res = await fetch(`${API_BASE}/people/${pid}/stats?stats=gameLog&group=pitching&season=2026&gameType=R`);
          const data = await res.json();
          const splits = data.stats?.[0]?.splits || [];
          let totalER = 0, totalIP = 0, totalK = 0, totalBB = 0, totalH = 0, starts = 0;
          for (const s of splits) {
            totalER += s.stat?.earnedRuns || 0;
            totalIP += parseFloat(s.stat?.inningsPitched || 0);
            totalK += s.stat?.strikeOuts || 0;
            totalBB += s.stat?.baseOnBalls || 0;
            totalH += s.stat?.hits || 0;
            starts++;
          }
          const era = totalIP > 0 ? (totalER * 9) / totalIP : 4.50;
          const whip = totalIP > 0 ? (totalBB + totalH) / totalIP : 1.30;
          const k9 = totalIP > 0 ? (totalK * 9) / totalIP : 7.0;
          const bb9 = totalIP > 0 ? (totalBB * 9) / totalIP : 3.0;
          pitcherNRFIMap[pid] = { era, whip, k9, bb9, starts, ip: totalIP };
        } catch { pitcherNRFIMap[pid] = null; }
      }));

      const pitcherToNRFI = (stats) => {
        if (!stats) return HALF_INNING_NRFI_BASELINE;
        const runsPerInning = stats.era / 9;
        const firstInningRE = runsPerInning * 0.90;
        const kFactor = 1 - Math.min(0.08, Math.max(-0.04, (stats.k9 - 8.5) * 0.015));
        const bbFactor = 1 + Math.max(0, (stats.bb9 - 2.8) * 0.03);
        const whipFactor = 1 + Math.max(0, (stats.whip - 1.20) * 0.08);
        const adjRE = firstInningRE * kFactor * bbFactor * whipFactor;
        return Math.min(0.93, Math.max(0.45, Math.exp(-adjRE)));
      };

      const processed = todayGames.map((game) => {
        const awayTeam = game.teams?.away?.team?.name || "TBD";
        const homeTeam = game.teams?.home?.team?.name || "TBD";
        const awayAbbr = getAbbrev(awayTeam);
        const homeAbbr = getAbbrev(homeTeam);
        const awayP = game.teams?.away?.probablePitcher;
        const homeP = game.teams?.home?.probablePitcher;
        const venue = game.venue?.name || "";
        const pf = getParkFactor(venue);
        const status = game.status?.detailedState || "Scheduled";
        let firstInningResult = null;
        if (game.linescore?.innings?.length > 0) {
          const fi = game.linescore.innings[0];
          firstInningResult = { awayRuns: fi.away?.runs ?? "?", homeRuns: fi.home?.runs ?? "?" };
        }
        const awayPStats = awayP?.id ? pitcherNRFIMap[awayP.id] : null;
        const homePStats = homeP?.id ? pitcherNRFIMap[homeP.id] : null;
        const awayTeamData = teamStats[awayAbbr] || { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
        const homeTeamData = teamStats[homeAbbr] || { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
        const awayBatNRFI = awayTeamData.batGames > 0 ? awayTeamData.batNRFI / awayTeamData.batGames : 0.70;
        const homeBatNRFI = homeTeamData.batGames > 0 ? homeTeamData.batNRFI / homeTeamData.batGames : 0.70;
        const awayPitchNRFI = pitcherToNRFI(awayPStats);
        const homePitchNRFI = pitcherToNRFI(homePStats);
        const nrfi = computeNRFI({ awayPitchNRFI, homePitchNRFI, awayBatNRFI, homeBatNRFI, parkFactor: pf, sampleAway: awayPStats?.starts || 0, sampleHome: homePStats?.starts || 0 });
        return {
          gamePk: game.gamePk, awayTeam, homeTeam, awayAbbr, homeAbbr,
          awayP: awayP ? { name: awayP.fullName, id: awayP.id, hand: awayP.pitchHand?.code || "?", ...awayPStats } : null,
          homeP: homeP ? { name: homeP.fullName, id: homeP.id, hand: homeP.pitchHand?.code || "?", ...homePStats } : null,
          venue, parkFactor: pf,
          time: new Date(game.gameDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }),
          status, firstInningResult, nrfi, awayBatNRFI, homeBatNRFI, awayPitchNRFI, homePitchNRFI, awayTeamData, homeTeamData,
        };
      });

      setGames(processed);
      setTeamNRFI(teamStats);
      setDataInfo({ gamesScanned, dateRange: `${thirtyAgo} to ${today}` });
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sorted = (() => {
    let arr = [...games];
    if (filter === "strong") arr = arr.filter((g) => g.nrfi >= 0.60);
    if (filter === "upcoming") arr = arr.filter((g) => g.status === "Scheduled" || g.status === "Pre-Game");
    if (filter === "live") arr = arr.filter((g) => g.status.includes("Progress"));
    if (sortBy === "nrfi") arr.sort((a, b) => b.nrfi - a.nrfi);
    else arr.sort((a, b) => new Date(a.time) - new Date(b.time));
    return arr;
  })();

  const avgNRFI = games.length > 0 ? (games.reduce((s, g) => s + g.nrfi, 0) / games.length * 100).toFixed(1) : "—";
  const bestGame = games.length > 0 ? games.reduce((a, b) => a.nrfi > b.nrfi ? a : b) : null;
  const strongPlays = games.filter((g) => g.nrfi >= 0.60).length;
  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (loading) return (
    <><style>{CSS}</style>
    <div style={{ minHeight: "100vh", background: "var(--bg-root)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Loading today's matchups</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Analyzing pitcher data & first-inning trends</div>
      </div>
    </div></>
  );

  if (error) return (
    <><style>{CSS}</style>
    <div style={{ minHeight: "100vh", background: "var(--bg-root)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)" }}>
      <div style={{ textAlign: "center", maxWidth: 340, padding: "0 24px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Unable to load data</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.5 }}>{error}</div>
        <button onClick={fetchData} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}>Try again</button>
      </div>
    </div></>
  );

  return (
    <><style>{CSS}</style>
    <div style={{ minHeight: "100vh", background: "var(--bg-root)", color: "var(--text-primary)", fontFamily: "var(--font-sans)", WebkitFontSmoothing: "antialiased" }}>

      {/* Navbar */}
      <nav style={{
        borderBottom: "1px solid var(--border)", padding: "0 24px", height: 52,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: "rgba(9,9,11,0.8)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: "linear-gradient(135deg, #22c55e, #15803d)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#000", fontFamily: "var(--font-mono)", letterSpacing: "-0.03em",
          }}>IE</div>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.03em" }}>InningEdge</span>
          <span style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 500, marginLeft: 2 }}>BETA</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="ie-nav-date">{todayStr}</span>
          <button onClick={fetchData} style={{
            background: "none", border: "1px solid var(--border)", color: "var(--text-muted)",
            padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer",
            fontFamily: "var(--font-sans)", fontWeight: 500, transition: "all 0.15s",
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >Refresh</button>
        </div>
      </nav>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* Stat cards */}
        <div className="ie-stats-grid" style={{ background: "var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
          {[
            { label: "Avg NRFI", val: `${avgNRFI}%`, sub: `${games.length} games` },
            { label: "Top Play", val: bestGame ? `${(bestGame.nrfi * 100).toFixed(1)}%` : "—", sub: bestGame ? `${bestGame.awayAbbr} @ ${bestGame.homeAbbr}` : "" },
            { label: "Strong Plays", val: String(strongPlays), sub: "≥ 60%" },
          ].map((s, i) => (
            <div key={i} style={{ background: "var(--bg-surface)", padding: "16px 18px", animation: `fadeUp 0.35s ease ${i * 0.06}s both` }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{s.label}</div>
              <div className="ie-stat-val" style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, fontFamily: "var(--font-mono)" }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="ie-filter-bar">
          <div className="ie-filter-pills">
            {[{ key: "all", l: "All" }, { key: "strong", l: "Strong" }, { key: "upcoming", l: "Upcoming" }, { key: "live", l: "Live" }].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                background: filter === f.key ? "var(--bg-elevated)" : "transparent",
                border: "none", color: filter === f.key ? "var(--text-primary)" : "var(--text-muted)",
                padding: "5px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                fontWeight: filter === f.key ? 600 : 400, fontFamily: "var(--font-sans)", transition: "all 0.15s",
              }}>
                {f.key === "live" && <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#ef4444", marginRight: 5, animation: "pulse 2s infinite" }} />}
                {f.l}
              </button>
            ))}
          </div>
          <button onClick={() => setSortBy(sortBy === "nrfi" ? "time" : "nrfi")} style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-muted)",
            padding: "5px 14px", borderRadius: 8, fontSize: 11, cursor: "pointer",
            fontFamily: "var(--font-sans)", fontWeight: 500, transition: "all 0.15s",
          }}
          onMouseOver={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"}
          onMouseOut={e => e.currentTarget.style.borderColor = "var(--border)"}
          >Sort: {sortBy === "nrfi" ? "Probability" : "Game Time"}</button>
        </div>

        {/* Empty */}
        {sorted.length === 0 && (
          <div style={{ textAlign: "center", padding: "56px 20px", color: "var(--text-muted)", fontSize: 13, borderRadius: 12, border: "1px dashed var(--border)" }}>
            No games match this filter.
          </div>
        )}

        {/* Game cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sorted.map((game, idx) => {
            const conf = getConfidence(game.nrfi);
            const pct = (game.nrfi * 100).toFixed(1);
            const isLive = game.status.includes("Progress");
            const isFinal = game.status === "Final";
            const expanded = expandedGame === game.gamePk;

            let resultTag = null;
            if (isFinal && game.firstInningResult) {
              const wasNRFI = game.firstInningResult.awayRuns === 0 && game.firstInningResult.homeRuns === 0;
              resultTag = { text: wasNRFI ? "NRFI" : "YRFI", hit: wasNRFI };
            }

            return (
              <div key={game.gamePk} style={{
                background: "var(--bg-surface)", border: `1px solid ${expanded ? "rgba(255,255,255,0.1)" : "var(--border)"}`,
                borderRadius: 10, overflow: "hidden", cursor: "pointer",
                transition: "border-color 0.2s", animation: `fadeUp 0.35s ease ${idx * 0.03}s both`,
              }}
              onClick={() => setExpandedGame(expanded ? null : game.gamePk)}
              onMouseOver={e => { if (!expanded) e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
              onMouseOut={e => { if (!expanded) e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                <div style={{ padding: "14px 18px" }}>
                  {/* Main row */}
                  <div className="ie-card-main">
                    {/* Teams + pitchers */}
                    <div className="ie-teams">
                      {/* Away */}
                      <div className="ie-team-block">
                        <div style={{
                          width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                          background: TEAM_COLORS[game.awayAbbr] || "#333",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "var(--font-mono)",
                        }}>{game.awayAbbr}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="ie-pitcher-name">
                            {game.awayP?.name || "TBD"}
                          </div>
                          {game.awayP && (
                            <div className="ie-pitcher-stats">
                              {game.awayP.era?.toFixed(2)} ERA · {game.awayP.whip?.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>

                      <span className="ie-at-symbol">@</span>

                      {/* Home */}
                      <div className="ie-team-block">
                        <div style={{
                          width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                          background: TEAM_COLORS[game.homeAbbr] || "#333",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "var(--font-mono)",
                        }}>{game.homeAbbr}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="ie-pitcher-name">
                            {game.homeP?.name || "TBD"}
                          </div>
                          {game.homeP && (
                            <div className="ie-pitcher-stats">
                              {game.homeP.era?.toFixed(2)} ERA · {game.homeP.whip?.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: status + gauge */}
                    <div className="ie-right-col">
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 500, fontFamily: "var(--font-mono)",
                          color: isLive ? "#ef4444" : isFinal ? "var(--text-dim)" : "var(--text-muted)",
                          animation: isLive ? "pulse 2s ease infinite" : "none",
                        }}>
                          {isLive ? "● LIVE" : isFinal ? "FINAL" : game.time + " ET"}
                        </span>
                        {resultTag && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)",
                            color: resultTag.hit ? "#22c55e" : "#ef4444",
                          }}>
                            {resultTag.text} {game.firstInningResult.awayRuns}-{game.firstInningResult.homeRuns}
                          </span>
                        )}
                      </div>

                      <div style={{ position: "relative", width: 58, height: 58 }}>
                        <CircleGauge value={parseFloat(pct)} color={conf.color} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: conf.color, fontFamily: "var(--font-mono)", lineHeight: 1 }}>{pct}</div>
                          <div style={{ fontSize: 7, fontWeight: 600, color: conf.color, letterSpacing: "0.1em", marginTop: 1 }}>{conf.label}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Meta strip */}
                  <div className="ie-meta">
                    <span className="ie-meta-venue">{game.venue}</span>
                    <span className="ie-meta-venue">·</span>
                    <span className="ie-meta-venue" style={{ fontFamily: "var(--font-mono)" }}>PF {game.parkFactor.toFixed(2)}</span>
                    <div style={{ flex: 1 }} />
                    <span className="ie-meta-k9-group">
                      {game.awayP && <span className="ie-meta-k9">{game.awayP.k9?.toFixed(1)} K/9</span>}
                      {game.awayP && game.homeP && <span style={{ fontSize: 10, color: "var(--text-dim)", margin: "0 5px" }}>·</span>}
                      {game.homeP && <span className="ie-meta-k9">{game.homeP.k9?.toFixed(1)} K/9</span>}
                    </span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--text-dim)" strokeWidth="1.5"
                      style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", marginLeft: 4 }}>
                      <path d="M2 4l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Expanded */}
                  {expanded && (
                    <div className="ie-expanded">
                      {[
                        { abbr: game.awayAbbr, side: "Away", pitchNRFI: game.awayPitchNRFI, batNRFI: game.awayBatNRFI, td: game.awayTeamData, p: game.awayP },
                        { abbr: game.homeAbbr, side: "Home", pitchNRFI: game.homePitchNRFI, batNRFI: game.homeBatNRFI, td: game.homeTeamData, p: game.homeP },
                      ].map((t) => (
                        <div key={t.side}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                            {t.abbr} — {t.side}
                          </div>
                          <StatRow label="Pitch Hold Rate" value={`${(t.pitchNRFI * 100).toFixed(1)}%`} />
                          <StatRow label="Batting NRFI" value={`${(t.batNRFI * 100).toFixed(1)}%`} detail={`${t.td.batNRFI}/${t.td.batGames}`} />
                          {t.p && <>
                            <StatRow label="Starts" value={t.p.starts || 0} />
                            <StatRow label="IP" value={t.p.ip?.toFixed(1) || "—"} />
                            <StatRow label="BB/9" value={t.p.bb9?.toFixed(1) || "—"} />
                            <StatRow label="K/9" value={t.p.k9?.toFixed(1) || "—"} />
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
