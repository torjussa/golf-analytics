import React from "react";
// Note: Do not import repo data for presentation. This component only renders
// data provided via props (uploaded by the user).

export type ClubRecord = {
  id: number;
  name?: string;
  clubTypeId: number;
  model?: string;
  retired?: boolean;
  deleted?: boolean;
};

export type ClubsFile = {
  version: string;
  type: string;
  data: ClubRecord[];
};

export type ShotRecord = {
  id: number;
  clubId?: number;
  meters?: number;
};

export type ShotsFile = {
  version: string;
  type: string;
  data: ShotRecord[];
};

type ClubStats = {
  clubId: number;
  label: string;
  model?: string;
  typeName?: string;
  pLow: number;
  pHigh: number;
  average: number;
  max: number;
  histogram: number[]; // counts per 0.5m bin from 0..driverP90
  isWedge?: boolean;
  p80?: number;
};

export type ClubType = { value: number; name: string };
export type ClubTypesFile = { version: string; type: string; data: ClubType[] };

function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * percentile;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// Intentionally unused helper removed; label now built with name or clubType

function getColorForValue(value: number, max: number): string {
  // Map 0..max to a blue heat scale; keep very low counts very light
  const t = max <= 0 ? 0 : Math.min(1, value / max);
  // Interpolate from light grey (#eef2f7) to deep blue (#1565c0)
  const start = { r: 238, g: 242, b: 247 };
  const end = { r: 21, g: 101, b: 192 };
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function TooltipIcon(props: { text: string }) {
  const [show, setShow] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{
        display: "inline-block",
        position: "relative",
        width: 16,
        height: 16,
        lineHeight: "16px",
        textAlign: "center",
        borderRadius: 8,
        background: "#e5eaf0",
        color: "#666",
        fontSize: 11,
        cursor: "default",
        userSelect: "none",
      }}
      aria-label={props.text}
    >
      ?
      {show ? (
        <span
          style={{
            position: "absolute",
            right: 0,
            bottom: "120%",
            transform: "translateX(0)",
            background: "#1f2937",
            color: "#fff",
            padding: "6px 8px",
            borderRadius: 4,
            whiteSpace: "nowrap",
            fontSize: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 5,
          }}
        >
          {props.text}
        </span>
      ) : null}
    </span>
  );
}

function Metric(props: {
  valueText: string;
  unit?: string;
  label: string;
  tooltip?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        minWidth: 80,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          color: "#111",
          display: "flex",
          alignItems: "baseline",
          gap: 4,
        }}
      >
        <span>{props.valueText}</span>
        {props.unit ? (
          <span style={{ fontWeight: 400, color: "#888", fontSize: 12 }}>
            {props.unit}
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#666",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {props.label}
        {props.tooltip ? <TooltipIcon text={props.tooltip} /> : null}
      </div>
    </div>
  );
}

export type DistanceUnits = "meters" | "yards";

export function ClubHeatmaps(props: {
  units: DistanceUnits;
  clubsData?: ClubsFile;
  shotsData?: ShotsFile;
  clubTypesData?: ClubTypesFile;
  scorecardsData?: any;
  dateRange?: { from: Date; to: Date };
}) {
  const [lowPercentile, setLowPercentile] = React.useState(5); // default p5
  const [highPercentile, setHighPercentile] = React.useState(98); // default p98
  const lowP = Math.max(0, Math.min(99, lowPercentile)) / 100;
  const highP = Math.max(1, Math.min(100, highPercentile)) / 100;

  const clubs = React.useMemo(() => {
    const file = props.clubsData as ClubsFile | undefined;
    const byId = new Map<number, ClubRecord>();
    for (const c of (file?.data as ClubRecord[] | undefined) || []) {
      if (c.deleted || c.retired) continue;
      if (c.clubTypeId === 23) continue; // ignore putter
      byId.set(c.id, c);
    }
    return byId;
  }, [props.clubsData]);

  const clubTypeNameById = React.useMemo(() => {
    const file = props.clubTypesData as ClubTypesFile | undefined;
    const map = new Map<number, string>();
    for (const ct of (file?.data as ClubType[] | undefined) || [])
      map.set(ct.value, ct.name);
    return map;
  }, [props.clubTypesData]);

  const scorecardIdToDate = React.useMemo(() => {
    const map = new Map<number, Date>();
    const sc = (props.scorecardsData?.data || []) as Array<any>;
    for (const r of sc) {
      const id = r?.id ?? r?.scorecardId;
      const ds = r?.formattedStartTime || r?.startTime;
      if (id == null || !ds) continue;
      const d = new Date(ds);
      if (!isNaN(d.getTime())) map.set(Number(id), d);
    }
    return map;
  }, [props.scorecardsData]);

  const shotsByClub = React.useMemo(() => {
    const file = props.shotsData as ShotsFile | undefined;
    const map = new Map<number, number[]>();
    for (const s of (file?.data as ShotRecord[] | undefined) || []) {
      if (!s || s.clubId == null) continue;
      if (props.dateRange) {
        const scId = (s as any).scorecardId ?? (s as any).roundId;
        const dt =
          scId != null ? scorecardIdToDate.get(Number(scId)) : undefined;
        if (!dt || dt < props.dateRange.from || dt > props.dateRange.to)
          continue;
      }
      const rawMeters = typeof s.meters === "number" ? s.meters : undefined;
      const rawYards =
        typeof (s as any).yards === "number"
          ? ((s as any).yards as number)
          : undefined;
      // Normalize to meters first, then convert to selected units
      const meters =
        rawMeters != null
          ? rawMeters
          : rawYards != null
          ? rawYards * 0.9144
          : undefined;
      const d =
        meters == null
          ? undefined
          : props.units === "meters"
          ? meters
          : meters * 1.09361;
      if (d == null || !Number.isFinite(d) || d < 0) continue;
      if (!map.has(s.clubId)) map.set(s.clubId, []);
      map.get(s.clubId)!.push(d);
    }
    return map;
  }, [props.units, props.shotsData, props.dateRange, scorecardIdToDate]);

  const { stats, axisMax } = React.useMemo(() => {
    type RowTmp = {
      clubId: number;
      label: string;
      model?: string;
      typeName?: string;
      pLow: number;
      pHigh: number;
      average: number;
      max: number;
      isWedge?: boolean;
      p80?: number;
      filtered: number[];
    };
    const rows: RowTmp[] = [];
    let globalMax = 0;
    for (const [clubId, distances] of shotsByClub.entries()) {
      const club = clubs.get(clubId);
      if (!club) continue;
      if (!distances.length) continue;

      const pLow = computePercentile(distances, lowP);
      const pHigh = computePercentile(distances, highP);
      const filtered = distances.filter((d) => d >= pLow && d <= pHigh);
      if (!filtered.length) continue;
      const average = filtered.reduce((a, b) => a + b, 0) / filtered.length;
      const max = Math.max(...filtered);
      globalMax = Math.max(globalMax, max);
      const typeName = clubTypeNameById.get(club.clubTypeId) || "";
      const isWedge = /wedge/i.test(typeName);
      const p80 = isWedge ? computePercentile(filtered, 0.9) : undefined;

      rows.push({
        clubId,
        label: club.name || typeName || `Club ${club.clubTypeId}`,
        model: club.model,
        typeName,
        pLow,
        pHigh,
        average,
        max,
        isWedge,
        p80,
        filtered,
      });
    }

    const binSize = 0.5;
    const binCount = Math.max(
      1,
      Math.ceil(Math.max(0, Math.ceil(globalMax)) / binSize)
    );
    const results: ClubStats[] = rows.map((r) => {
      const hist = new Array(binCount).fill(0) as number[];
      for (const d of r.filtered) {
        const capped = Math.max(0, Math.min(d, globalMax));
        const idx = Math.min(binCount - 1, Math.floor(capped / binSize));
        hist[idx] += 1;
      }
      return {
        clubId: r.clubId,
        label: r.label,
        model: r.model,
        typeName: r.typeName,
        pLow: r.pLow,
        pHigh: r.pHigh,
        average: r.average,
        max: r.max,
        histogram: hist,
        isWedge: r.isWedge,
        p80: r.p80,
      } as ClubStats;
    });
    results.sort((a, b) => b.average - a.average);
    return { stats: results, axisMax: globalMax };
  }, [shotsByClub, clubs, lowP, highP, clubTypeNameById]);

  if (!stats.length || axisMax <= 0) return null;

  const binSize = 0.5;
  const totalBins = Math.max(1, Math.ceil(axisMax / binSize));

  // For color normalization per row
  const rowMaxCounts = stats.map((s) => Math.max(1, Math.max(...s.histogram)));

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ margin: "8px 0 12px" }}>
        Club shot distances (p{Math.round(lowP * 100)}–p
        {Math.round(highP * 100)})
      </h3>
      {/* slider styles removed per request */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <label style={{ color: "#333" }}>Percentiles:</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#666" }}>low</span>
          <input
            type="range"
            min={0}
            max={98}
            step={1}
            value={Math.round(lowP * 100)}
            onChange={(e) => {
              const v = Math.min(98, Math.max(0, Number(e.target.value)));
              if (v >= Math.round(highP * 100)) setHighPercentile(v + 1);
              setLowPercentile(v);
            }}
          />
          <span style={{ width: 28, textAlign: "right", fontSize: 12 }}>
            {Math.round(lowP * 100)}%
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#666" }}>high</span>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={Math.round(highP * 100)}
            onChange={(e) => {
              const v = Math.min(100, Math.max(1, Number(e.target.value)));
              if (v <= Math.round(lowP * 100)) setLowPercentile(v - 1);
              setHighPercentile(v);
            }}
          />
          <span style={{ width: 28, textAlign: "right", fontSize: 12 }}>
            {Math.round(highP * 100)}%
          </span>
        </div>
      </div>
      <div style={{ color: "#666", marginBottom: 12, fontSize: 12 }}>
        Distances filtered per club to remove outliers (&lt;p
        {Math.round(lowP * 100)} and &gt;p{Math.round(highP * 100)}). Bins of
        0.5 {props.units === "meters" ? "m" : "yd"} from 0 to max (
        {axisMax.toFixed(1)} {props.units === "meters" ? "m" : "yd"}). Rows
        sorted by average distance.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {stats.map((row, idx) => (
          <div
            key={row.clubId}
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <div
              style={{
                width: 240,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flexShrink: 0,
              }}
            >
              <strong>{row.label}</strong>
              <div style={{ color: "#666", fontSize: 12 }}>
                {row.model || ""}
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${totalBins}, minmax(0, 1fr))`,
                gap: 0,
                height: 14,
                alignItems: "center",
                flex: 1,
                width: "100%",
                minWidth: 0,
              }}
            >
              {Array.from({ length: totalBins }).map((_, b) => {
                const count = row.histogram[b] || 0;
                const color = getColorForValue(count, rowMaxCounts[idx]);
                return (
                  <div
                    key={b}
                    title={`${(b * binSize).toFixed(1)}–${(
                      (b + 1) *
                      binSize
                    ).toFixed(1)} m: ${count}`}
                    style={{ width: "100%", height: 14, background: color }}
                  />
                );
              })}
            </div>

            <div
              style={{
                width: 280,
                display: "flex",
                gap: 12,
                justifyContent: "flex-end",
                flexShrink: 0,
              }}
            >
              <Metric
                valueText={row.average.toFixed(1)}
                unit={props.units === "meters" ? "m" : "yd"}
                label="avg"
              />
              {row.isWedge && row.p80 != null ? (
                <Metric
                  valueText={row.p80.toFixed(1)}
                  unit={props.units === "meters" ? "m" : "yd"}
                  label="full swing"
                  tooltip="Full‑swing distance for wedges (90th percentile of filtered shots), reducing the influence of partial shots"
                />
              ) : null}
              <Metric
                valueText={row.max.toFixed(1)}
                unit={props.units === "meters" ? "m" : "yd"}
                label="max"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
