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

// Known park factors (Statcast 2024-2025 avg)
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

// Compute NRFI from actual data
// awayPitcherNRFI = fraction of starts where the pitcher held opponents scoreless in 1st
// homePitcherNRFI = same
// teamNRFI rates (batting side — how often does the TEAM fail to score in the 1st)
function computeNRFI({ awayPitchNRFI, homePitchNRFI, awayBatNRFI, homeBatNRFI, parkFactor, sampleAway, sampleHome }) {
  // Bayesian blend with league average (~70% NRFI rate)
  const LEAGUE_AVG = 0.70;
  const blendPitch = (rate, n) => (n < 3) ? LEAGUE_AVG : (rate * Math.min(n, 30) + LEAGUE_AVG * 5) / (Math.min(n, 30) + 5);
  const blendBat = (rate, n) => (n < 5) ? LEAGUE_AVG : (rate * Math.min(n, 30) + LEAGUE_AVG * 5) / (Math.min(n, 30) + 5);

  const awayPitchAdj = blendPitch(awayPitchNRFI, sampleAway);
  const homePitchAdj = blendPitch(homePitchNRFI, sampleHome);
  const awayBatAdj = blendBat(awayBatNRFI, 20);
  const homeBatAdj = blendBat(homeBatNRFI, 20);

  // P(no run top 1st) blends away pitcher holding + home team not scoring
  // P(no run bot 1st) blends home pitcher holding + away team not scoring
  const pNoRunTop = (awayPitchAdj + homeBatAdj) / 2;
  const pNoRunBot = (homePitchAdj + awayBatAdj) / 2;

  // Park factor adjustment (higher PF = more runs = lower NRFI)
  const parkAdj = 1 + (1 - parkFactor) * 0.3;

  const nrfi = pNoRunTop * pNoRunBot * parkAdj;
  return Math.min(0.92, Math.max(0.30, nrfi));
}

function getConfidence(nrfi) {
  if (nrfi >= 0.72) return { text: "STRONG", color: "#10b981" };
  if (nrfi >= 0.62) return { text: "LEAN", color: "#3b82f6" };
  if (nrfi >= 0.52) return { text: "TOSS-UP", color: "#f59e0b" };
  return { text: "FADE", color: "#ef4444" };
}

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

      // 1. Get today's schedule with probable pitchers
      const today = new Date().toISOString().split("T")[0];
      const schedRes = await fetch(
        `${API_BASE}/schedule?date=${today}&sportId=1&hydrate=probablePitcher(note),linescore,venue`
      );
      const schedData = await schedRes.json();
      const todayGames = schedData.dates?.[0]?.games || [];

      // 2. Get season schedule to compute team NRFI records from actual linescore data
      // Fetch last 30 days of completed games
      const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const histRes = await fetch(
        `${API_BASE}/schedule?startDate=${thirtyAgo}&endDate=${today}&sportId=1&hydrate=linescore&gameType=R`
      );
      const histData = await histRes.json();

      // 3. Parse historical first-inning data
      const teamStats = {};
      const pitcherFirstInning = {};
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
          const awayName = game.teams?.away?.team?.name;
          const homeName = game.teams?.home?.team?.name;
          const awayAbbr = getAbbrev(awayName);
          const homeAbbr = getAbbrev(homeName);

          // Track team batting NRFI (how often team doesn't score in 1st)
          for (const [abbr, runs, side] of [[awayAbbr, awayRuns1st, "bat"], [homeAbbr, homeRuns1st, "bat"]]) {
            if (!teamStats[abbr]) teamStats[abbr] = { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
            teamStats[abbr].batGames++;
            if (runs === 0) teamStats[abbr].batNRFI++;
          }
          // Track team pitching NRFI (how often opposing team doesn't score vs this team's pitcher)
          // Away pitcher faces home batters (top 1st = away pitching isn't right... 
          // actually: top 1st = away team bats, home team pitches. bottom 1st = home team bats, away team pitches)
          // So home pitcher's 1st inning = top of 1st (away runs)
          // Away pitcher's 1st inning = bottom of 1st (home runs)
          if (!teamStats[homeAbbr]) teamStats[homeAbbr] = { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
          teamStats[homeAbbr].pitchGames++;
          if (awayRuns1st === 0) teamStats[homeAbbr].pitchNRFI++;

          if (!teamStats[awayAbbr]) teamStats[awayAbbr] = { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
          teamStats[awayAbbr].pitchGames++;
          if (homeRuns1st === 0) teamStats[awayAbbr].pitchNRFI++;
        }
      }

      // 4. For each probable pitcher, look up their game log to get 1st inning data
      const pitcherIds = new Set();
      for (const g of todayGames) {
        if (g.teams?.away?.probablePitcher?.id) pitcherIds.add(g.teams.away.probablePitcher.id);
        if (g.teams?.home?.probablePitcher?.id) pitcherIds.add(g.teams.home.probablePitcher.id);
      }

      // Fetch pitcher game logs in parallel (batched)
      const pitcherNRFIMap = {};
      const pitcherPromises = [...pitcherIds].map(async (pid) => {
        try {
          const res = await fetch(
            `${API_BASE}/people/${pid}/stats?stats=gameLog&group=pitching&season=2026&gameType=R`
          );
          const data = await res.json();
          const splits = data.stats?.[0]?.splits || [];
          // We need the actual game IDs to look up first inning data
          // The game log gives us per-game stats but not inning-by-inning
          // We'll use the season ERA/WHIP/K9 as our pitcher quality proxy
          // combined with team-level first inning data
          const seasonStats = data.stats?.[0]?.splits || [];
          let totalER = 0, totalIP = 0, totalK = 0, totalBB = 0, totalH = 0, starts = 0;
          for (const s of seasonStats) {
            const ip = parseFloat(s.stat?.inningsPitched || 0);
            totalER += s.stat?.earnedRuns || 0;
            totalIP += ip;
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
      });
      await Promise.all(pitcherPromises);

      // 5. Build game cards with computed NRFI probabilities
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

        // Get first inning result if game is final
        let firstInningResult = null;
        if (game.linescore?.innings?.length > 0) {
          const fi = game.linescore.innings[0];
          firstInningResult = {
            awayRuns: fi.away?.runs ?? "?",
            homeRuns: fi.home?.runs ?? "?",
          };
        }

        // Pitcher stats from game log
        const awayPStats = awayP?.id ? pitcherNRFIMap[awayP.id] : null;
        const homePStats = homeP?.id ? pitcherNRFIMap[homeP.id] : null;

        // Team NRFI rates
        const awayTeamData = teamStats[awayAbbr] || { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };
        const homeTeamData = teamStats[homeAbbr] || { batGames: 0, batNRFI: 0, pitchGames: 0, pitchNRFI: 0 };

        const awayBatNRFI = awayTeamData.batGames > 0 ? awayTeamData.batNRFI / awayTeamData.batGames : 0.70;
        const homeBatNRFI = homeTeamData.batGames > 0 ? homeTeamData.batNRFI / homeTeamData.batGames : 0.70;

        // Use pitcher ERA to estimate their 1st inning hold rate
        // Lower ERA = higher probability of holding
        const pitcherToNRFI = (stats) => {
          if (!stats) return 0.70;
          // ERA-based: P(no run in 1 inning) ≈ 1 - (ERA/9)
          // Adjusted by K-rate bonus and walk penalty
          const baseHold = 1 - (stats.era / 9);
          const kBonus = Math.min(0.05, (stats.k9 - 7) * 0.01);
          const bbPenalty = Math.max(0, (stats.bb9 - 3) * 0.015);
          return Math.min(0.92, Math.max(0.50, baseHold + kBonus - bbPenalty));
        };

        const awayPitchNRFI = pitcherToNRFI(awayPStats);
        const homePitchNRFI = pitcherToNRFI(homePStats);

        const nrfi = computeNRFI({
          awayPitchNRFI, homePitchNRFI,
          awayBatNRFI, homeBatNRFI,
          parkFactor: pf,
          sampleAway: awayPStats?.starts || 0,
          sampleHome: homePStats?.starts || 0,
        });

        return {
          gamePk: game.gamePk,
          awayTeam, homeTeam, awayAbbr, homeAbbr,
          awayP: awayP ? { name: awayP.fullName, id: awayP.id, hand: awayP.pitchHand?.code || "?", ...awayPStats } : null,
          homeP: homeP ? { name: homeP.fullName, id: homeP.id, hand: homeP.pitchHand?.code || "?", ...homePStats } : null,
          venue, parkFactor: pf,
          time: new Date(game.gameDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }),
          status,
          firstInningResult,
          nrfi,
          awayBatNRFI, homeBatNRFI,
          awayPitchNRFI, homePitchNRFI,
          awayTeamData, homeTeamData,
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
    if (filter === "strong") arr = arr.filter((g) => g.nrfi >= 0.65);
    if (filter === "upcoming") arr = arr.filter((g) => g.status === "Scheduled" || g.status === "Pre-Game");
    if (filter === "live") arr = arr.filter((g) => g.status.includes("Progress"));
    if (sortBy === "nrfi") arr.sort((a, b) => b.nrfi - a.nrfi);
    else arr.sort((a, b) => new Date(a.time) - new Date(b.time));
    return arr;
  })();

  const avgNRFI = games.length > 0 ? (games.reduce((s, g) => s + g.nrfi, 0) / games.length * 100).toFixed(1) : "—";
  const bestGame = games.length > 0 ? games.reduce((a, b) => a.nrfi > b.nrfi ? a : b) : null;
  const strongPlays = games.filter((g) => g.nrfi >= 0.65).length;

  const s = {
    page: { minHeight: "100vh", background: "#080c14", color: "#e2e8f0", fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace", padding: 0 },
    wrap: { maxWidth: 920, margin: "0 auto", padding: "20px 14px", position: "relative", zIndex: 1 },
    h1: { fontSize: 26, fontWeight: 900, margin: 0, background: "linear-gradient(135deg, #38bdf8, #818cf8, #e879f9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.02em" },
    badge: { fontSize: 10, color: "#10b981", border: "1px solid #064e3b", padding: "2px 8px", borderRadius: 4, fontWeight: 600, marginLeft: 10 },
    sub: { fontSize: 11, color: "#475569", margin: "4px 0 0 0", letterSpacing: "0.04em" },
    card: { background: "linear-gradient(160deg, #0f1724, #0c1220)", border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden", marginBottom: 10 },
    statBox: { background: "#0f1724", border: "1px solid #1e293b", borderRadius: 8, padding: "14px 12px" },
    btn: (active) => ({ background: active ? "#1e293b" : "transparent", border: `1px solid ${active ? "#3b82f6" : "#1e293b"}`, color: active ? "#93c5fd" : "#64748b", padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "inherit", cursor: "pointer", fontWeight: 600 }),
    teamBadge: (color) => ({ width: 26, height: 26, borderRadius: 5, background: color || "#333", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: "#fff", flexShrink: 0 }),
  };

  if (loading) {
    return (
      <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#818cf8", marginBottom: 8 }}>Loading NRFI Data...</div>
          <div style={{ fontSize: 11, color: "#475569" }}>Fetching live data from MLB Stats API</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Scanning 30 days of game results for first-inning stats</div>
          <div style={{ marginTop: 16, width: 200, height: 3, background: "#1e293b", borderRadius: 4, overflow: "hidden", margin: "16px auto" }}>
            <div style={{ width: "60%", height: "100%", background: "linear-gradient(90deg, #38bdf8, #818cf8)", borderRadius: 4, animation: "loading 1.5s infinite" }} />
          </div>
        </div>
        <style>{`@keyframes loading { 0% { width: 20%; } 50% { width: 80%; } 100% { width: 20%; } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444", marginBottom: 8 }}>Failed to load data</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>{error}</div>
          <button onClick={fetchData} style={{ ...s.btn(true), padding: "8px 20px", fontSize: 12 }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.wrap}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <h1 style={s.h1}>NRFI MODEL</h1>
            <span style={s.badge}>LIVE DATA</span>
          </div>
          <p style={s.sub}>
            NO RUN FIRST INNING — {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </p>
          <p style={{ fontSize: 9, color: "#334155", margin: "6px 0 0 0", lineHeight: 1.5 }}>
            Data source: MLB Stats API · {dataInfo.gamesScanned} games scanned ({dataInfo.dateRange}) · Pitcher stats from 2026 game logs · Park factors from Statcast
          </p>
        </div>

        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: "AVG NRFI %", value: `${avgNRFI}%`, sub: `${games.length} games today` },
            { label: "BEST PLAY", value: bestGame ? `${(bestGame.nrfi * 100).toFixed(1)}%` : "—", sub: bestGame ? `${bestGame.awayAbbr}@${bestGame.homeAbbr}` : "" },
            { label: "STRONG PLAYS", value: strongPlays, sub: "≥65% probability" },
          ].map((c, i) => (
            <div key={i} style={s.statBox}>
              <div style={{ fontSize: 8, color: "#64748b", letterSpacing: "0.1em", marginBottom: 5, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#f1f5f9" }}>{c.value}</div>
              <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { key: "all", label: "All" }, { key: "strong", label: "Strong Plays" },
            { key: "upcoming", label: "Upcoming" }, { key: "live", label: "Live" },
          ].map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={s.btn(filter === f.key)}>{f.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => setSortBy(sortBy === "nrfi" ? "time" : "nrfi")} style={s.btn(false)}>
            Sort: {sortBy === "nrfi" ? "% ↓" : "Time ↓"}
          </button>
          <button onClick={fetchData} style={s.btn(false)}>↻ Refresh</button>
        </div>

        {/* Games */}
        {sorted.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#475569", fontSize: 12 }}>
            No games match the current filter.
          </div>
        )}

        {sorted.map((game) => {
          const conf = getConfidence(game.nrfi);
          const pct = (game.nrfi * 100).toFixed(1);
          const isLive = game.status.includes("Progress");
          const isFinal = game.status === "Final";
          const expanded = expandedGame === game.gamePk;

          let resultBadge = null;
          if (isFinal && game.firstInningResult) {
            const wasNRFI = game.firstInningResult.awayRuns === 0 && game.firstInningResult.homeRuns === 0;
            resultBadge = { text: wasNRFI ? "NRFI ✓" : "YRFI ✗", color: wasNRFI ? "#10b981" : "#ef4444" };
          }

          return (
            <div key={game.gamePk} style={s.card}>
              <div style={{ height: 3, background: `linear-gradient(90deg, ${conf.color} ${pct}%, #1e293b ${pct}%)` }} />
              <div
                style={{ padding: "12px 14px", cursor: "pointer" }}
                onClick={() => setExpandedGame(expanded ? null : game.gamePk)}
              >
                {/* Top row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={s.teamBadge(TEAM_COLORS[game.awayAbbr])}>{game.awayAbbr}</div>
                    <span style={{ fontSize: 11, color: "#475569", fontWeight: 700 }}>@</span>
                    <div style={s.teamBadge(TEAM_COLORS[game.homeAbbr])}>{game.homeAbbr}</div>
                    <span style={{
                      fontSize: 8, fontWeight: 700, color: "#fff",
                      background: isLive ? "#ef4444" : isFinal ? "#374151" : "#065f46",
                      padding: "2px 6px", borderRadius: 3, letterSpacing: "0.05em",
                      animation: isLive ? "pulse 2s infinite" : "none",
                    }}>
                      {isLive ? "LIVE" : isFinal ? "FINAL" : game.time + " ET"}
                    </span>
                    {resultBadge && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: resultBadge.color, background: resultBadge.color + "20", padding: "2px 6px", borderRadius: 3 }}>
                        {resultBadge.text}
                      </span>
                    )}
                    {isFinal && game.firstInningResult && (
                      <span style={{ fontSize: 9, color: "#64748b" }}>
                        1st: {game.firstInningResult.awayRuns}-{game.firstInningResult.homeRuns}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: conf.color, lineHeight: 1 }}>{pct}%</div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: conf.color, letterSpacing: "0.08em", marginTop: 1 }}>{conf.text}</div>
                  </div>
                </div>

                {/* Pitchers */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1" }}>{game.awayP?.name || "TBD"}</div>
                    {game.awayP && (
                      <div style={{ fontSize: 9, color: "#64748b", marginTop: 1 }}>
                        {game.awayP.hand}HP · {game.awayP.era?.toFixed(2) || "—"} ERA · {game.awayP.whip?.toFixed(2) || "—"} WHIP · {game.awayP.k9?.toFixed(1) || "—"} K/9
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: "#1e293b", fontWeight: 800 }}>VS</div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1" }}>{game.homeP?.name || "TBD"}</div>
                    {game.homeP && (
                      <div style={{ fontSize: 9, color: "#64748b", marginTop: 1 }}>
                        {game.homeP.hand}HP · {game.homeP.era?.toFixed(2) || "—"} ERA · {game.homeP.whip?.toFixed(2) || "—"} WHIP · {game.homeP.k9?.toFixed(1) || "—"} K/9
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom info */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid #1e293b" }}>
                  <div style={{ fontSize: 9, color: "#475569" }}>{game.venue}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ fontSize: 8, color: "#64748b", background: "#0c1220", border: "1px solid #1e293b", padding: "1px 5px", borderRadius: 3 }}>
                      PF: {game.parkFactor.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 8, color: "#64748b", background: "#0c1220", border: "1px solid #1e293b", padding: "1px 5px", borderRadius: 3 }}>
                      {game.awayAbbr} bat NRFI: {(game.awayBatNRFI * 100).toFixed(0)}%
                    </span>
                    <span style={{ fontSize: 8, color: "#64748b", background: "#0c1220", border: "1px solid #1e293b", padding: "1px 5px", borderRadius: 3 }}>
                      {game.homeAbbr} bat NRFI: {(game.homeBatNRFI * 100).toFixed(0)}%
                    </span>
                    <span style={{ fontSize: 8, color: "#94a3b8" }}>▾</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e293b" }}>
                    <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 8 }}>MODEL BREAKDOWN</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>
                        <div style={{ marginBottom: 4 }}>
                          <strong style={{ color: "#cbd5e1" }}>{game.awayAbbr} Pitching Hold Rate:</strong> {(game.awayPitchNRFI * 100).toFixed(1)}%
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <strong style={{ color: "#cbd5e1" }}>{game.awayAbbr} Batting NRFI:</strong> {(game.awayBatNRFI * 100).toFixed(1)}%
                          <span style={{ color: "#475569" }}> ({game.awayTeamData.batNRFI}/{game.awayTeamData.batGames} games)</span>
                        </div>
                        {game.awayP && (
                          <div style={{ fontSize: 9, color: "#475569" }}>
                            {game.awayP.starts || 0} starts · {game.awayP.ip?.toFixed(1) || 0} IP · {game.awayP.bb9?.toFixed(1) || "—"} BB/9
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>
                        <div style={{ marginBottom: 4 }}>
                          <strong style={{ color: "#cbd5e1" }}>{game.homeAbbr} Pitching Hold Rate:</strong> {(game.homePitchNRFI * 100).toFixed(1)}%
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <strong style={{ color: "#cbd5e1" }}>{game.homeAbbr} Batting NRFI:</strong> {(game.homeBatNRFI * 100).toFixed(1)}%
                          <span style={{ color: "#475569" }}> ({game.homeTeamData.batNRFI}/{game.homeTeamData.batGames} games)</span>
                        </div>
                        {game.homeP && (
                          <div style={{ fontSize: 9, color: "#475569" }}>
                            {game.homeP.starts || 0} starts · {game.homeP.ip?.toFixed(1) || 0} IP · {game.homeP.bb9?.toFixed(1) || "—"} BB/9
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 9, color: "#334155", marginTop: 8 }}>
                      Formula: P(NRFI) = P(no run top 1st) × P(no run bot 1st) × park adj · Top 1st blends away pitcher hold rate + home team batting NRFI · Park factor {game.parkFactor.toFixed(2)} ({game.parkFactor > 1.03 ? "hitter-friendly" : game.parkFactor < 0.97 ? "pitcher-friendly" : "neutral"})
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Legend & methodology */}
        <div style={{ marginTop: 20, ...s.statBox }}>
          <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.1em", marginBottom: 8, fontWeight: 700 }}>DATA SOURCES & METHODOLOGY</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
            {[
              { label: "STRONG", color: "#10b981", desc: "≥72%" },
              { label: "LEAN", color: "#3b82f6", desc: "62–71%" },
              { label: "TOSS-UP", color: "#f59e0b", desc: "52–61%" },
              { label: "FADE", color: "#ef4444", desc: "<52%" },
            ].map((t) => (
              <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: t.color }} />
                <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: 8, color: "#475569" }}>{t.desc}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "#334155", lineHeight: 1.7 }}>
            <strong style={{ color: "#475569" }}>Pitcher stats:</strong> 2026 season game log from MLB Stats API (ERA, WHIP, K/9, BB/9) · Converted to first-inning hold probability via ERA/9 with K-rate bonus and walk penalty · Bayesian-blended with league average (~70%) to handle small sample sizes
            <br />
            <strong style={{ color: "#475569" }}>Team NRFI rates:</strong> Computed from actual first-inning linescore data over last 30 days ({dataInfo.gamesScanned} games scanned) · Tracks both batting NRFI (team doesn't score) and pitching NRFI (team's pitcher holds)
            <br />
            <strong style={{ color: "#475569" }}>Park factors:</strong> Statcast run factors (2024-25 avg) · Higher PF = more run-scoring = lower NRFI probability
            <br />
            <strong style={{ color: "#475569" }}>Tap any game card</strong> to see the full model breakdown for that matchup.
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 8, color: "#1e293b", marginTop: 16, paddingBottom: 16 }}>
          Live data from statsapi.mlb.com · For entertainment & research only
        </div>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
