/*
  Web Worker: FIT decoder
  - Uses official @garmin/fitsdk first with rich options to preserve/expand fields
  - Falls back to fit-file-parser if decoding fails
*/

// Garmin official SDK
import { Decoder, Stream } from "@garmin/fitsdk";
// Fallback decoder
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - CJS default import
import FitParser from "fit-file-parser";

type DecodeRequest = {
  type: "decode";
  files: Array<{ path: string; buffer: ArrayBuffer }>;
};

type DecodeResponse = {
  type: "decoded";
  results: Array<
    | { path: string; ok: true; data: unknown; sections?: ScorecardSections }
    | { path: string; ok: false; error: string }
  >;
};

type ScorecardSections = {
  fileId?: unknown;
  fileCreator?: unknown;
  golfCourse?: unknown;
  holes?: Array<Record<string, unknown>>;
  scores?: Array<Record<string, unknown>>;
  shots?: Array<Record<string, unknown>>;
  stats?: unknown;
};

declare const self: DedicatedWorkerGlobalScope & { FITSdk?: any };

function parseWithFallback(buffer: ArrayBuffer): Promise<any> {
  const parser = new FitParser({
    force: true,
    speedUnit: "m/s",
    lengthUnit: "m",
    temperatureUnit: "celsius",
    elapsedRecordField: true,
    mode: "both",
  });
  return new Promise((resolve, reject) => {
    parser.parse(buffer, (err: unknown, data: unknown) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

function parseWithGarminSdk(buffer: ArrayBuffer) {
  const stream = Stream.fromArrayBuffer(buffer);
  const decoder = new Decoder(stream);
  // Ensure it is FIT and valid; if not, throw to trigger fallback
  if (!decoder.isFIT() || !decoder.checkIntegrity()) {
    throw new Error("Invalid FIT file");
  }
  const { messages } = decoder.read({
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    includeUnknownData: true,
    decodeMemoGlobs: true,
  });
  return messages;
}

function tryGroupSections(obj: any): ScorecardSections | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  // Heuristic grouping for different decoders
  const sections: ScorecardSections = {};
  // Common keys from richer decoders
  if (obj["file_id"])
    sections.fileId = Array.isArray(obj.file_id) ? obj.file_id[0] : obj.file_id;
  if (obj["file_creator"])
    sections.fileCreator = Array.isArray(obj.file_creator)
      ? obj.file_creator[0]
      : obj.file_creator;
  if (obj["golf_course"])
    sections.golfCourse = Array.isArray(obj.golf_course)
      ? obj.golf_course[0]
      : obj.golf_course;

  // Heuristic scans to find rows with hole/par/etc
  const rows: Array<Record<string, unknown>> = [];
  function scan(o: any) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      o.forEach(scan);
      return;
    }
    const keys = Object.keys(o);
    const hasHole = keys.some((k) =>
      /(^|\s|_|-)hole( number|_number)?$/i.test(k)
    );
    const hasPar = keys.some((k) => /(^|\s|_|-)par$/i.test(k));
    const hasScore = keys.some((k) => /(^|\s|_|-)score$/i.test(k));
    const hasPutts = keys.some((k) => /(^|\s|_|-)putts?$/i.test(k));
    const hasShot = keys.some((k) => /(^|\s|_|-)shot$/i.test(k));
    if (hasHole && (hasPar || hasScore || hasPutts))
      rows.push(o as Record<string, unknown>);
    keys.forEach((k) => scan(o[k]));
  }
  scan(obj);

  if (rows.length) {
    sections.holes = rows.filter(
      (r) => "par" in r && !("score" in r || "putts" in r)
    );
    sections.scores = rows.filter((r) => "score" in r || "putts" in r);
  }
  return sections;
}

self.onmessage = async (ev: MessageEvent<DecodeRequest>) => {
  const msg = ev.data;
  if (msg.type !== "decode") return;

  const results: DecodeResponse["results"] = [];
  for (const f of msg.files) {
    try {
      let data: any;
      try {
        data = parseWithGarminSdk(f.buffer);
      } catch {
        data = await parseWithFallback(f.buffer);
      }
      const sections = tryGroupSections(data);
      results.push({ path: f.path, ok: true, data, sections });
    } catch (err) {
      results.push({ path: f.path, ok: false, error: String(err) });
    }
  }
  const response: DecodeResponse = { type: "decoded", results };
  self.postMessage(response);
};
