import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve(process.cwd());
const DI_GOLF_DIR = path.join(ROOT, "data", "DI-GOLF");
const SCORECARD_JSON = path.join(DI_GOLF_DIR, "Golf-SCORECARD.json");
const FIT_JSON_DIR = path.join(DI_GOLF_DIR, "fit-json");
const OUTPUT_DIR = path.join(DI_GOLF_DIR, "derived");
const PARS_DIR = path.join(OUTPUT_DIR, "hole-pars");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "rounds.json");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true }).catch(() => {});
}

async function safeReadJson(filePath) {
  try {
    const buf = await fs.readFile(filePath, "utf8");
    return JSON.parse(buf);
  } catch (_) {
    return null;
  }
}

function average(values) {
  if (!values || values.length === 0) return undefined;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

async function extractFitExtrasForRound(roundId) {
  const fitPath = path.join(
    FIT_JSON_DIR,
    `Golf-SCORECARD_RAWDATA-${roundId}.json`
  );
  const fit = await safeReadJson(fitPath);
  if (!fit) return { hasFit: false };

  // Try to compute simple extras from commonly available fields
  let avgHeartRate;
  let maxHeartRate;
  const records = Array.isArray(fit?.records) ? fit.records : undefined;
  if (records && records.length > 0) {
    const hrs = records
      .map((r) => r.heart_rate)
      .filter((v) => typeof v === "number");
    avgHeartRate = average(hrs);
    maxHeartRate = hrs.length ? Math.max(...hrs) : undefined;
  }

  // Sessions total distance/time can be handy
  let totalDistance; // meters if available
  const sessions = Array.isArray(fit?.sessions) ? fit.sessions : undefined;
  if (sessions && sessions.length > 0) {
    totalDistance = sessions[0]?.total_distance;
  }

  // Attempt to discover per-hole par information from any available arrays
  // Many decoders store golf developer fields differently; we scan heuristically.
  // Prefer par map from CSV tool output when available
  let parByHoleFromCsv = await safeReadJson(
    path.join(PARS_DIR, `Golf-SCORECARD_RAWDATA-${roundId}.json`)
  );
  if (parByHoleFromCsv && typeof parByHoleFromCsv === "object") {
    // keys may be strings; normalize to numbers
    const normalized = {};
    for (const [k, v] of Object.entries(parByHoleFromCsv)) {
      const holeNum = Number(k);
      const parVal = Number(v);
      if (Number.isFinite(holeNum) && Number.isFinite(parVal)) {
        normalized[holeNum] = parVal;
      }
    }
    parByHoleFromCsv = normalized;
  }

  const parByHole = parByHoleFromCsv || {};
  const scanForPars = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) scanForPars(item);
      return;
    }
    // Common patterns: { hole: n, par: m } or { hole_number: n, par: m }
    const holeNum = obj.hole ?? obj.hole_number ?? obj.holeNumber;
    const parVal = obj.par ?? obj.hole_par ?? obj.holePar;
    if (
      typeof holeNum === "number" &&
      typeof parVal === "number" &&
      Number.isFinite(parVal)
    ) {
      parByHole[holeNum] = parVal;
    }
    for (const key of Object.keys(obj)) {
      scanForPars(obj[key]);
    }
  };
  if (!Object.keys(parByHole).length) {
    // fallback heuristic scan of JSON
    scanForPars(fit);
  }

  return {
    hasFit: true,
    avgHeartRate,
    maxHeartRate,
    totalDistance,
    parByHole: Object.keys(parByHole).length ? parByHole : undefined,
  };
}

async function main() {
  console.log(`[SUM] Loading scorecards: ${SCORECARD_JSON}`);
  const scorecard = await safeReadJson(SCORECARD_JSON);
  if (!scorecard?.data || !Array.isArray(scorecard.data)) {
    console.error("[SUM] No scorecard data found.");
    process.exit(1);
  }

  const rounds = [];
  for (const sc of scorecard.data) {
    const id = sc.id;
    const label = sc.formattedStartTime || sc.startTime || String(id);
    const holes = Array.isArray(sc.holes)
      ? sc.holes.map((h) => ({
          number: h.number,
          putts: h.putts,
          strokes: h.strokes,
        }))
      : [];

    const fit = await extractFitExtrasForRound(id);

    // Compute GIR metrics if we have hole pars
    let girHoles = 0;
    let girPuttsTotal = 0;
    const holesWithGir = holes.map((h) => {
      const par = fit?.parByHole?.[h.number];
      const gir =
        typeof par === "number" &&
        typeof h.strokes === "number" &&
        typeof h.putts === "number"
          ? h.strokes - h.putts <= par - 2
          : undefined;
      if (gir) {
        girHoles += 1;
        girPuttsTotal += h.putts ?? 0;
      }
      return { ...h, par, gir };
    });
    const girPuttsAverage = girHoles > 0 ? girPuttsTotal / girHoles : undefined;

    rounds.push({
      id,
      date: label,
      startTime: sc.startTime,
      formattedStartTime: sc.formattedStartTime,
      endTime: sc.endTime,
      formattedEndTime: sc.formattedEndTime,
      holesCompleted: sc.holesCompleted,
      excludeFromStats: !!sc.excludeFromStats,
      strokes: sc.strokes,
      stepsTaken: sc.stepsTaken,
      distanceWalked: sc.distanceWalked,
      holes: holesWithGir,
      fit,
      gir: {
        holes: girHoles,
        puttsTotal: girPuttsTotal,
        puttsAverage: girPuttsAverage,
      },
    });
  }

  await ensureDir(OUTPUT_DIR);
  await fs.writeFile(OUTPUT_FILE, JSON.stringify({ rounds }, null, 2), "utf8");
  console.log(`[SUM] Wrote ${rounds.length} rounds to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("[SUM] Unhandled error:", err);
  process.exit(1);
});
