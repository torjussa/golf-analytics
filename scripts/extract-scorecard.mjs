import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

const ROOT = path.resolve(process.cwd());
const DI_GOLF_DIR = path.join(ROOT, "data", "DI-GOLF");
const FIT_DIR = DI_GOLF_DIR; // the SCORECARD_RAWDATA .fit files live here
const OUT_DIR = path.join(DI_GOLF_DIR, "derived", "scorecards");
const CSV_DIR = path.join(DI_GOLF_DIR, "fit-csv");
const FITCSVTOOL_JAR = path.join(ROOT, "tools", "FitCSVTool.jar");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true }).catch(() => {});
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function* walk(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const d of dirents) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

async function findScorecardFits() {
  const results = [];
  for await (const p of walk(FIT_DIR)) {
    if (/Golf-SCORECARD_RAWDATA-\d+\.fit$/i.test(p)) results.push(p);
  }
  return results;
}

async function runFitCsvTool(fitPath, csvPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("java", ["-jar", FITCSVTOOL_JAR, fitPath, csvPath]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FitCSVTool failed (${code}): ${stderr}`));
    });
  });
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    if (!line) continue;
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

function toInt(v) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : undefined;
}

function buildObjectsFromCsv(rows) {
  // FitCSVTool groups by header rows (starting with "Type").
  // We track the last header row and apply to each subsequent Data row.
  let headers = null;
  const objects = [];
  for (const row of rows) {
    if (!row.length) continue;
    if (row[0].toLowerCase() === "type") {
      headers = row;
      continue;
    }
    if (row[0].toLowerCase() === "data" && headers) {
      const obj = {};
      for (let i = 0; i < Math.min(headers.length, row.length); i++) {
        obj[headers[i]] = row[i];
      }
      objects.push(obj);
    }
  }
  return objects;
}

function groupScorecard(objects) {
  const byMessage = new Map();
  for (const obj of objects) {
    const msg = (
      obj.Message ||
      obj.message ||
      obj.Name ||
      obj.name ||
      ""
    ).toString();
    if (!byMessage.has(msg)) byMessage.set(msg, []);
    byMessage.get(msg).push(obj);
  }

  const fileId = byMessage.get("File ID")?.[0] || byMessage.get("file_id")?.[0];
  const fileCreator =
    byMessage.get("File Creator")?.[0] || byMessage.get("file_creator")?.[0];
  const golfCourse =
    byMessage.get("Golf Course")?.[0] || byMessage.get("golf_course")?.[0];

  const holes = (byMessage.get("Hole") || byMessage.get("hole") || [])
    .map((r) => ({
      hole_number:
        toInt(r["hole number"]) ??
        toInt(r["hole_number"]) ??
        toInt(r["number"]) ??
        toInt(r["hole"]),
      distance: toInt(r["distance"]) ?? undefined,
      par: toInt(r["par"]) ?? undefined,
      handicap: toInt(r["handicap"]) ?? undefined,
      position_lat: r["position lat"],
      position_long: r["position long"],
    }))
    .filter((h) => h.hole_number != null);

  const scores = (byMessage.get("Score") || byMessage.get("score") || [])
    .map((r) => ({
      hole_number:
        toInt(r["hole number"]) ??
        toInt(r["hole_number"]) ??
        toInt(r["number"]) ??
        toInt(r["hole"]),
      score: toInt(r["score"]) ?? undefined,
      putts: toInt(r["putts"]) ?? undefined,
      fairway: r["fairway"],
    }))
    .filter((s) => s.hole_number != null);

  const shots = (byMessage.get("Shot") || byMessage.get("shot") || []).map(
    (r) => ({
      timestamp: r["timestamp"],
      hole_number:
        toInt(r["hole number"]) ??
        toInt(r["hole_number"]) ??
        toInt(r["number"]) ??
        toInt(r["hole"]),
      start_lat: r["start position lat"],
      start_long: r["start position long"],
      end_lat: r["end position lat"],
      end_long: r["end position long"],
      club_type: r["club type"],
    })
  );

  const stats =
    byMessage.get("Golf Stats")?.[0] || byMessage.get("golf_stats")?.[0];

  return { fileId, fileCreator, golfCourse, holes, scores, shots, stats };
}

async function main() {
  if (!(await fileExists(FITCSVTOOL_JAR))) {
    console.error(
      `[Scorecard] Missing tools/FitCSVTool.jar. Download from Garmin FIT SDK and place it there.\n` +
        `Docs: https://developer.garmin.com/fit/example-projects/javascript/`
    );
    process.exit(2);
  }

  await ensureDir(CSV_DIR);
  await ensureDir(OUT_DIR);

  const fits = await findScorecardFits();
  if (!fits.length) {
    console.log("[Scorecard] No SCORECARD_RAWDATA .fit files found.");
    return;
  }

  for (const fitPath of fits) {
    const base = path.basename(fitPath, path.extname(fitPath));
    const csvPath = path.join(CSV_DIR, `${base}.csv`);
    const outPath = path.join(OUT_DIR, `${base}.json`);
    process.stdout.write(`[Scorecard] Decoding ${base} ... `);
    try {
      await runFitCsvTool(fitPath, csvPath);
      const csv = await fs.readFile(csvPath, "utf8");
      const rows = parseCsv(csv);
      const objects = buildObjectsFromCsv(rows);
      const grouped = groupScorecard(objects);
      await fs.writeFile(outPath, JSON.stringify(grouped, null, 2), "utf8");
      console.log(
        `OK (holes=${grouped.holes.length}, scores=${grouped.scores.length}, shots=${grouped.shots.length})`
      );
    } catch (err) {
      console.log("FAILED");
      console.error(err?.message || err);
    }
  }

  console.log(`[Scorecard] Done. JSON written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[Scorecard] Unhandled error:", err);
  process.exit(1);
});
