import React from "react";
// Worker-based decoding to allow future WASM decoder
const fitWorker = new Worker(
  new URL("../worker/fitWorker.ts", import.meta.url),
  {
    type: "module",
  }
);

type UploadedJson = {
  path: string;
  json: unknown;
};

export function FolderUpload(props: {
  onLoaded: (files: UploadedJson[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handlePick = () => {
    inputRef.current?.click();
  };

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = async (
    e
  ) => {
    const files = Array.from(e.target.files || []);
    const payload = [] as Array<{ path: string; buffer: ArrayBuffer }>;
    const jsonOutputs = [] as Array<{ path: string; json: unknown }>;
    for (const file of files) {
      const lower = file.name.toLowerCase();
      const rel = file.webkitRelativePath || file.name;
      if (lower.endsWith(".fit")) {
        const buf = await file.arrayBuffer();
        payload.push({ path: rel, buffer: buf });
        continue;
      }
      if (lower.endsWith(".json")) {
        // Parse DI-GOLF JSONs as-is and include in outputs
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          jsonOutputs.push({ path: rel, json: parsed });
        } catch (err) {
          jsonOutputs.push({ path: rel, json: { error: String(err) } });
        }
      }
    }

    const results = await new Promise<{
      results: Array<{
        path: string;
        ok: boolean;
        data?: unknown;
        error?: string;
      }>;
    }>((resolve) => {
      const onMessage = (ev: MessageEvent<any>) => {
        if (ev.data?.type === "decoded") {
          fitWorker.removeEventListener("message", onMessage as any);
          resolve({ results: ev.data.results });
        }
      };
      fitWorker.addEventListener("message", onMessage as any);
      fitWorker.postMessage({ type: "decode", files: payload });
    });

    const outputs: UploadedJson[] = [
      ...jsonOutputs,
      ...results.results.map((r) =>
        r.ok
          ? { path: r.path, json: r.data }
          : { path: r.path, json: { error: r.error } }
      ),
    ];
    props.onLoaded(outputs);
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        // @ts-expect-error: Non-standard attribute supported by Chromium-based browsers and Safari
        webkitdirectory="true"
        directory="true"
        onChange={handleChange}
      />
      <button onClick={handlePick} style={{ padding: "8px 12px" }}>
        Upload DI-GOLF folder
      </button>
    </div>
  );
}
