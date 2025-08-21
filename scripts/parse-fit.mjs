import { createRequire } from "module";
import fs from "fs/promises";
import path from "path";

const require = createRequire(import.meta.url);
const FitParser =
  require("fit-file-parser").default || require("fit-file-parser");

const ROOT = path.resolve(process.cwd());
const INPUT_DIR = path.join(ROOT, "data", "DI-GOLF");
const OUTPUT_DIR = path.join(INPUT_DIR, "fit-json");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true }).catch(() => {});
}

async function* walk(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walk(res);
    } else {
      yield res;
    }
  }
}

async function findFitFiles(startDir) {
  const results = [];
  for await (const filePath of walk(startDir)) {
    if (filePath.toLowerCase().endsWith(".fit")) {
      results.push(filePath);
    }
  }
  return results;
}

async function parseFitFile(filePath) {
  const buffer = await fs.readFile(filePath);
  const parser = new FitParser({
    force: true,
    speedUnit: "m/s",
    lengthUnit: "m",
    temperatureUnit: "celsius",
    elapsedRecordField: true,
    mode: "both",
  });

  return new Promise((resolve, reject) => {
    parser.parse(buffer, (error, data) => {
      if (error) return reject(error);
      resolve(data);
    });
  });
}

async function main() {
  console.log(`[FIT] Scanning for .fit files in: ${INPUT_DIR}`);
  await ensureDir(OUTPUT_DIR);
  const fitFiles = await findFitFiles(INPUT_DIR);
  if (fitFiles.length === 0) {
    console.log("[FIT] No .fit files found.");
    return;
  }
  console.log(`[FIT] Found ${fitFiles.length} file(s).`);

  let successCount = 0;
  let failureCount = 0;
  for (const filePath of fitFiles) {
    const rel = path.relative(INPUT_DIR, filePath);
    const base = path.basename(rel, path.extname(rel));
    const outPath = path.join(OUTPUT_DIR, `${base}.json`);
    process.stdout.write(`[FIT] Parsing ${rel} ... `);
    try {
      const data = await parseFitFile(filePath);
      await fs.writeFile(outPath, JSON.stringify(data, null, 2), "utf8");
      successCount += 1;
      console.log("OK");
    } catch (err) {
      failureCount += 1;
      console.log("FAILED");
      console.error(err?.message || err);
    }
  }

  console.log(
    `[FIT] Done. Parsed OK: ${successCount}, Failed: ${failureCount}. Output dir: ${OUTPUT_DIR}`
  );
}

main().catch((err) => {
  console.error("[FIT] Unhandled error:", err);
  process.exit(1);
});
