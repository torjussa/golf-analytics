import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

const ROOT = path.resolve(process.cwd());
const DI_GOLF_DIR = path.join(ROOT, "data", "DI-GOLF");
const FIT_DIR = DI_GOLF_DIR; // FIT files live directly in DI-GOLF
const CSV_OUT_DIR = path.join(DI_GOLF_DIR, "fit-csv");
const PARS_OUT_DIR = path.join(DI_GOLF_DIR, "derived", "hole-pars");
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

async function findFitFiles() {
  const results = [];
  for await (const p of walk(FIT_DIR)) {
    if (/\.fit$/i.test(p) && /SCORECARD_RAWDATA/i.test(p)) {
      results.push(p);
    }
  }
  return results;
}

async function runFitCsvTool(fitPath, csvPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("java", ["-jar", FITCSVTOOL_JAR, fitPath, csvPath]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`FitCSVTool failed (${code}): ${stderr}`));
    });
  });
}

function parseCsv(text) {
  // Minimal CSV parser for FitCSVTool output; split by lines and commas respecting simple quotes
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
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
    return cells;
  });
}

function extractParMapFromCsvRows(rows) {
  // FitCSVTool outputs different sections: we look for Data rows and use header row immediately preceding Data rows
  // Typical: first header row starts with 'Type', then rows start with 'Data'
  let headers = null;
  const parByHole = {};
  for (const row of rows) {
    if (!row.length) continue;
    if (row[0] && row[0].toLowerCase() === "type") {
      headers = row;
      continue;
    }
    if (row[0] && row[0].toLowerCase() === "data" && headers) {
      // Build object
      const obj = {};
      for (let i = 0; i < Math.min(headers.length, row.length); i++) {
        const key = headers[i];
        const val = row[i];
        obj[key] = val;
      }
      const message = (
        obj["Message"] ||
        obj["message"] ||
        obj["Name"] ||
        obj["name"] ||
        ""
      )
        .toString()
        .toLowerCase();
      // Heuristics: message containing 'golf', 'hole', 'score', or any with fields named like 'hole' and 'par'
      const holeCandidates = Object.entries(obj).filter(
        ([k]) => /hole.*(no|num|number)?/i.test(k) || /^hole$/i.test(k)
      );
      const parCandidates = Object.entries(obj).filter(([k]) =>
        /(^|_)par($|_)/i.test(k)
      );
      if (
        message.includes("golf") ||
        message.includes("hole") ||
        message.includes("score") ||
        (holeCandidates.length && parCandidates.length)
      ) {
        // Parse ints
        let holeNum;
        for (const [, v] of holeCandidates) {
          const n = parseInt(String(v), 10);
          if (Number.isFinite(n)) {
            holeNum = n;
            break;
          }
        }
        let parVal;
        for (const [, v] of parCandidates) {
          const n = parseInt(String(v), 10);
          if (Number.isFinite(n)) {
            parVal = n;
            break;
          }
        }
        if (Number.isFinite(holeNum) && Number.isFinite(parVal)) {
          parByHole[holeNum] = parVal;
        }
      }
    }
  }
  return parByHole;
}

async function main() {
  if (!(await fileExists(FITCSVTOOL_JAR))) {
    console.error(
      `[PARS] Missing FitCSVTool.jar at ${FITCSVTOOL_JAR}.\n` +
        `- Download FIT SDK and place FitCSVTool.jar there. See Garmin docs: https://developer.garmin.com/fit/example-projects/javascript/`
    );
    process.exit(2);
  }

  await ensureDir(CSV_OUT_DIR);
  await ensureDir(PARS_OUT_DIR);

  const fitFiles = await findFitFiles();
  if (fitFiles.length === 0) {
    console.log("[PARS] No SCORECARD_RAWDATA .fit files found.");
    return;
  }
  console.log(`[PARS] Found ${fitFiles.length} file(s).`);

  for (const fitPath of fitFiles) {
    const base = path.basename(fitPath, path.extname(fitPath));
    const csvPath = path.join(CSV_OUT_DIR, `${base}.csv`);
    const outJson = path.join(PARS_OUT_DIR, `${base}.json`);
    process.stdout.write(`[PARS] Decoding ${base} ... `);
    try {
      await runFitCsvTool(fitPath, csvPath);
      const csvText = await fs.readFile(csvPath, "utf8");
      const rows = parseCsv(csvText);
      const parByHole = extractParMapFromCsvRows(rows);
      await fs.writeFile(outJson, JSON.stringify(parByHole, null, 2), "utf8");
      console.log(`OK (${Object.keys(parByHole).length} holes)`);
    } catch (err) {
      console.log("FAILED");
      console.error(err?.message || err);
    }
  }
  console.log(`[PARS] Done. JSON maps in ${PARS_OUT_DIR}`);
}

main().catch((err) => {
  console.error("[PARS] Unhandled error:", err);
  process.exit(1);
});
