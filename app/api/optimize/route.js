import solver from "javascript-lp-solver";

const DK_SALARY_CAP = 50000;
const DK_ROSTER_SIZE = 10;
const DK_POS_REQUIREMENTS = {
  P: { min: 2, max: 2 },
  C: { min: 1, max: 1 },
  "1B": { min: 1, max: 1 },
  "2B": { min: 1, max: 1 },
  "3B": { min: 1, max: 1 },
  SS: { min: 1, max: 1 },
  OF: { min: 3, max: 3 },
};

const VALID_POSITIONS = new Set(Object.keys(DK_POS_REQUIREMENTS));
const EXCLUSION_WINDOW = 25; // sliding window of constraints to keep solves fast

function buildModel(playerPool, prevLineups) {
  const recent = prevLineups.slice(-EXCLUSION_WINDOW);

  const model = {
    optimize: "proj",
    opType: "max",
    constraints: {
      salary: { max: DK_SALARY_CAP },
      roster: { equal: DK_ROSTER_SIZE },
    },
    variables: {},
    binaries: {},
  };

  // Position constraints
  Object.entries(DK_POS_REQUIREMENTS).forEach(([pos, req]) => {
    model.constraints[`pos_${pos}`] = { min: req.min, max: req.max };
  });

  // Player variables
  playerPool.forEach((p, i) => {
    if (!p.positions || p.positions.length === 0) return;
    if (p.salary <= 0 || p.proj <= 0) return;

    p.positions.forEach((pos) => {
      if (!VALID_POSITIONS.has(pos)) return;

      const key = `x_${i}_${pos}`;
      const v = {
        proj: p.proj,
        salary: p.salary,
        roster: 1,
        [`pos_${pos}`]: 1,
        [`player_${i}`]: 1,
      };

      // Exclusion constraint contributions
      recent.forEach((lu, li) => {
        if (lu.includes(i)) v[`ex_${li}`] = 1;
      });

      model.variables[key] = v;
      model.binaries[key] = 1;
    });

    model.constraints[`player_${i}`] = { max: 1 };
  });

  // Each previous lineup: must differ by at least 1 player
  recent.forEach((lu, li) => {
    model.constraints[`ex_${li}`] = { max: lu.length - 1 };
  });

  return model;
}

function runOptimizer(players, numLineups) {
  const validPlayers = players.filter(
    (p) =>
      p.proj > 0 &&
      p.salary > 0 &&
      p.positions?.length > 0 &&
      p.positions.some((pos) => VALID_POSITIONS.has(pos))
  );

  const exposure = {};
  validPlayers.forEach((_, i) => (exposure[i] = 0));

  const lineups = [];

  for (let run = 0; run < numLineups; run++) {
    const model = buildModel(validPlayers, lineups);
    const result = solver.Solve(model);

    if (!result.feasible) break;

    const indices = [
      ...new Set(
        Object.keys(result)
          .filter((k) => k.startsWith("x_") && result[k] === 1)
          .map((k) => parseInt(k.split("_")[1]))
      ),
    ].sort();

    indices.forEach((idx) => (exposure[idx] = (exposure[idx] || 0) + 1));
    lineups.push(indices);
  }

  // Build exposure map keyed by player name
  const exposureMap = {};
  const totalLineups = lineups.length;

  if (totalLineups > 0) {
    validPlayers.forEach((p, i) => {
      exposureMap[p.name] = {
        count: exposure[i] || 0,
        total: totalLineups,
        pct: Math.round(((exposure[i] || 0) / totalLineups) * 1000) / 10,
      };
    });
  }

  return { exposureMap, feasibleCount: totalLineups, totalRuns: numLineups };
}

export async function POST(request) {
  try {
    const { players, numLineups = 150 } = await request.json();

    if (!Array.isArray(players) || players.length === 0) {
      return Response.json(
        { error: "Missing or empty players array" },
        { status: 400 }
      );
    }

    // Cap lineups to prevent abuse
    const cappedLineups = Math.min(Math.max(numLineups, 1), 200);

    const result = runOptimizer(players, cappedLineups);

    return Response.json(result);
  } catch (err) {
    console.error("Optimizer error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
