/**
 * /api/dkpositions?slateType=Main
 *
 * 1. Hits the DraftKings contest lobby for MLB
 * 2. Finds the Classic draft group that matches the requested slate type
 * 3. Fetches draftables for that draft group
 * 4. Returns a map of player name → DK position string (e.g. "1B/OF")
 */

const SLATE_KEYWORDS = ["Early", "Afternoon", "Night", "Turbo", "Late", "Mid"];

function parseDKDate(sdString) {
  if (!sdString) return null;
  const match = sdString.match(/\/Date\((\d+)\)\//);
  if (match) return new Date(parseInt(match[1], 10));
  return null;
}

function getTodayString() {
  // Use Eastern Time (UTC-4 for EDT) to match DK's contest dates
  const now = new Date();
  const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const y = eastern.getFullYear();
  const m = String(eastern.getMonth() + 1).padStart(2, "0");
  const d = String(eastern.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function classifySlate(contestName) {
  // Check for parenthetical keywords: "(Turbo)", "(Early)", "(Night)", etc.
  const parenMatch = contestName.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const parenText = parenMatch[1];
    for (const kw of SLATE_KEYWORDS) {
      if (parenText.toLowerCase().includes(kw.toLowerCase())) return kw;
    }
  }
  // Check for keyword as standalone word in name
  for (const kw of SLATE_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(contestName)) return kw;
  }
  return "Main";
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requestedSlate = searchParams.get("slateType") || "Main";
  const requestedGameCount = parseInt(searchParams.get("gameCount") || "0", 10);

  try {
    // Step 1: Fetch DK contest lobby
    const lobbyRes = await fetch(
      "https://www.draftkings.com/lobby/getcontests?sport=MLB",
      { next: { revalidate: 300 } }
    );
    if (!lobbyRes.ok) {
      return Response.json(
        { error: `DK lobby returned ${lobbyRes.status}` },
        { status: lobbyRes.status }
      );
    }
    const lobbyData = await lobbyRes.json();

    // Step 2: Build draft group metadata
    const dgMeta = {};
    for (const dg of lobbyData.DraftGroups || []) {
      dgMeta[dg.DraftGroupId] = {
        gameCount: dg.GameCount || 0,
        contestTypeId: dg.ContestTypeId,
        startDate: dg.StartDate || "",
      };
    }

    // Step 3: Filter to today's Classic contests, classify slate type
    const todayStr = getTodayString();
    const classicDGs = {}; // dgId -> { slateLabel, gameCount }

    for (const contest of lobbyData.Contests || []) {
      if (contest.gameType !== "Classic") continue;

      const startDt = parseDKDate(contest.sd);
      if (!startDt) continue;

      // Convert to Eastern for date comparison
      const eastern = new Date(
        startDt.toLocaleString("en-US", { timeZone: "America/New_York" })
      );
      const contestDate = `${eastern.getFullYear()}-${String(eastern.getMonth() + 1).padStart(2, "0")}-${String(eastern.getDate()).padStart(2, "0")}`;
      if (contestDate !== todayStr) continue;

      const dgId = contest.dg;
      if (classicDGs[dgId]) continue; // already captured

      const slateLabel = classifySlate(contest.n || "");
      const gameCount = dgMeta[dgId]?.gameCount || 0;

      classicDGs[dgId] = { slateLabel, gameCount };
    }

    // Step 4: Find the draft group that matches the requested slate type
    // Match on slate label, and optionally on game count for disambiguation
    let matchedDgId = null;

    // Normalize: DFF sends "" for Main, we map to "Main"
    const targetLabel = requestedSlate === "" ? "Main" : requestedSlate;

    const candidates = Object.entries(classicDGs).filter(
      ([, info]) => info.slateLabel.toLowerCase() === targetLabel.toLowerCase()
    );

    if (candidates.length === 1) {
      matchedDgId = candidates[0][0];
    } else if (candidates.length > 1 && requestedGameCount > 0) {
      // Disambiguate by game count
      const byGC = candidates.find(([, info]) => info.gameCount === requestedGameCount);
      matchedDgId = byGC ? byGC[0] : candidates[0][0];
    } else if (candidates.length > 1) {
      matchedDgId = candidates[0][0];
    }

    if (!matchedDgId) {
      return Response.json(
        { error: `No DK draft group found for slate: ${targetLabel}`, positions: {} },
        { status: 200 }
      );
    }

    // Step 5: Fetch draftables for the matched draft group
    const draftablesRes = await fetch(
      `https://api.draftkings.com/draftgroups/v1/draftgroups/${matchedDgId}/draftables?format=json`,
      { next: { revalidate: 300 } }
    );
    if (!draftablesRes.ok) {
      return Response.json(
        { error: `DK draftables returned ${draftablesRes.status}` },
        { status: draftablesRes.status }
      );
    }
    const draftablesData = await draftablesRes.json();
    const draftables = draftablesData.draftables || [];

    // Step 6: Build player name → position map (deduplicated)
    // Also include team for more reliable matching
    const positions = {};
    for (const p of draftables) {
      const name = (p.displayName || "").trim();
      const position = p.position || "";
      const team = p.teamAbbreviation || "";
      const salary = p.salary || 0;

      if (!name || !position) continue;

      const key = name; // primary key is player name
      if (!positions[key]) {
        positions[key] = { position, team, salary };
      } else {
        // Keep entry with lower salary (avoid Captain-inflated)
        if (salary > 0 && salary < positions[key].salary) {
          positions[key].salary = salary;
        }
      }
    }

    return Response.json({
      draftGroupId: matchedDgId,
      slateLabel: targetLabel,
      gameCount: classicDGs[matchedDgId]?.gameCount || 0,
      positions,
    });
  } catch (err) {
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
