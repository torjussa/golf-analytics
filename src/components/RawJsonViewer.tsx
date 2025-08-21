// React import not required with automatic JSX runtime

// Mapping for message 190 numeric field headers to human-readable labels (as provided)
const FIELD_NAMES_190: Record<string, string> = {
  // Known field in message 190
  "253": "timestamp",
  // Desired headers for numeric fields
  "0": "courseId",
  "1": "name",
  "2": "localTime",
  "3": "startTime",
  "4": "endTime",
  "5": "field5",
  "6": "field6",
  "7": "field7",
  "8": "out",
  "9": "in",
  "10": "total",
  "11": "tee",
  "12": "slope",
  "17": "field17",
  "19": "field19",
  "20": "field20",
  "21": "rating",
  "22": "field22",
  "23": "field23",
  "24": "field24",
  "29": "field29",
};

const FIELD_NAMES_191: Record<string, string> = {
  "253": "timestamp",
  "0": "name",
  "1": "field1",
  "2": "out",
  "3": "in",
  "4": "total",
  "5": "field5",
  "7": "fairwayHit",
  "8": "gir",
  "9": "putts",
  "10": "field10",
};

const FIELD_NAMES_192: Record<string, string> = {
  "253": "timestamp",
  "0": "field0",
  "1": "holeNumber",
  "2": "score",
  "3": "hcpAdjustedScore",
  "5": "putts",
  "6": "fairway",
  "9": "penalties",
};

const FIELD_NAMES_193: Record<string, string> = {
  "253": "timestamp",
  "0": "holeNumber",
  "1": "distanceM",
  "2": "par",
  "3": "handicap",
  "4": "positionLatSemicircles",
  "5": "positionLongSemicircles",
};

const FIELD_NAMES_194: Record<string, string> = {
  "253": "timestamp",
  "0": "field0",
  "1": "holeNumber",
  "2": "startPositionLatSemicircles",
  "3": "startPositionLongSemicircles",
  "4": "endPositionLatSemicircles",
  "5": "endPositionLongSemicircles",
  "6": "field6",
  "7": "clubType",
  "9": "field9",
  "10": "field10",
  "26": "field26",
};

function remapSelectedTopLevel(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  let result: Record<string, unknown> | null = null;

  function mapSection(
    key: string,
    mapping: Record<string, string>,
    valueTransform?: (mappedKey: string, value: unknown) => unknown,
    renameTo?: string
  ) {
    const base = (result || root) as Record<string, unknown>;
    const section = base[key];
    if (!Array.isArray(section)) return;
    const mapped = section.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const obj = item as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        const mappedKey = k in mapping ? mapping[k] : k;
        const mappedValue = valueTransform ? valueTransform(mappedKey, v) : v;
        out[mappedKey] = mappedValue;
      }
      return out;
    });
    const targetKey = renameTo || key;
    const { [key]: _removed, ...rest } = base;
    result = { ...rest, [targetKey]: mapped };
  }

  mapSection("190", FIELD_NAMES_190, undefined, "golfCourse");
  mapSection("191", FIELD_NAMES_191, undefined, "golfStats");
  mapSection(
    "192",
    FIELD_NAMES_192,
    (mappedKey, val) => {
      if (mappedKey !== "fairway") return val;
      if (typeof val !== "number") return val;
      switch (val) {
        case 0:
          return "left";
        case 1:
          return "right";
        case 2:
          return "hit";
        default:
          return val;
      }
    },
    "score"
  );
  mapSection("193", FIELD_NAMES_193, undefined, "hole");
  mapSection("194", FIELD_NAMES_194, undefined, "shot");

  return result || value;
}

export function RawJsonViewer(props: {
  files: Array<{ path: string; json: unknown }>;
}) {
  if (!props.files.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: "8px 0 12px" }}>Uploaded FIT files (raw JSON)</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {props.files.map((f) => (
          <details
            key={f.path}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8 }}
          >
            <summary style={{ cursor: "pointer" }}>{f.path}</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                overflowX: "auto",
                fontSize: 12,
              }}
            >
              {JSON.stringify(remapSelectedTopLevel(f.json), null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </div>
  );
}
