import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const EasyFitModule = require("easy-fit");
const EasyFit = EasyFitModule?.EasyFit || EasyFitModule?.default || EasyFitModule;

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node scripts/inspect-fit.mjs <path-to-fit>");
    process.exit(1);
  }
  const fitPath = path.resolve(arg);
  const buf = await fs.readFile(fitPath);
  const easyFit = new EasyFit({
    force: true,
    speedUnit: "m/s",
    lengthUnit: "m",
    temperatureUnit: "celsius",
    elapsedRecordField: true,
    mode: "both",
  });
  const decoded = await new Promise((resolve, reject) => {
    easyFit.parse(buf, (error, data) => {
      if (error) return reject(error);
      resolve(data);
    });
  });

  const outDir = path.join(path.dirname(fitPath), "..", "fit-json");
  await fs.mkdir(outDir, { recursive: true });
  const base = path.basename(fitPath, path.extname(fitPath));
  const outPath = path.join(outDir, `${base}.inspect.json`);

  await fs.writeFile(outPath, JSON.stringify(decoded, null, 2), "utf8");
  console.log("Wrote:", outPath);
}

main().catch((err) => {
  console.error("[INSPECT] Error:", err);
  process.exit(1);
});
