// fit-file-parser is CJS; Vite can bundle it for the browser. We import default.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import FitParser from "fit-file-parser";

export async function parseFitArrayBuffer(buf: ArrayBuffer): Promise<any> {
  const parser = new FitParser({
    force: true,
    speedUnit: "m/s",
    lengthUnit: "m",
    temperatureUnit: "celsius",
    elapsedRecordField: true,
    mode: "both",
  });
  return new Promise((resolve, reject) => {
    parser.parse(buf, (error: unknown, data: unknown) => {
      if (error) return reject(error);
      resolve(data);
    });
  });
}
