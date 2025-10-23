import React from "react";
import {
  buildClubLabelById,
  buildClubTypeNameById,
  type UploadedFile,
  type ShotsData,
  type ScorecardsData,
  type ClubsData,
  type ClubTypesData,
} from "../lib/dataPrep";

type Uploaded = UploadedFile;

type OutcomeCounts = {
  total: number;
  green: number;
  fairway: number;
  other: number;
};

type Row = {
  club: string;
  model?: string;
  total: number;
  green: number;
  fairway: number;
  other: number;
  greenPct: number;
  fairwayPct: number;
};

function toLowerString(value: unknown): string | undefined {
  if (typeof value === "string") return value.toLowerCase();
  return undefined;
}

export function ApproachStats(props: {
  uploaded: Uploaded[];
  shotsData?: ShotsData | null;
  scorecardsData?: ScorecardsData | null;
  clubsData?: ClubsData | null;
  clubTypesData?: ClubTypesData | null;
  dateRange?: { from: Date; to: Date };
}) {
  const memo = React.useMemo(() => {
    const debug: Record<string, number> = {};

    const shots = props.shotsData?.data || [];
    if (!Array.isArray(shots) || shots.length === 0) {
      return { rows: [] as Row[], debug };
    }

    // Build helpers
    const clubTypeNameById = buildClubTypeNameById(props.clubTypesData);
    const clubLabelFromId = buildClubLabelById(
      props.clubsData,
      clubTypeNameById
    );

    // scorecardId -> Date for filtering by dateRange
    const scToDate = new Map<string, Date>();
    for (const sc of props.scorecardsData?.data || []) {
      const id = String((sc as any)?.id ?? (sc as any)?.scorecardId ?? "");
      const ds = (sc as any)?.formattedStartTime || (sc as any)?.startTime;
      if (!id || !ds) continue;
      const d = new Date(ds);
      if (!isNaN(d.getTime())) scToDate.set(id, d);
    }

    const totalsByKey = new Map<string, OutcomeCounts>();
    const metaByKey = new Map<string, { label: string; model?: string }>();

    let totalConsidered = 0;

    for (const s of shots) {
      if (!s || typeof s !== "object") continue;

      if (props.dateRange) {
        const sid = String(
          (s as any)?.scorecardId ?? (s as any)?.roundId ?? ""
        );
        const dt = sid ? scToDate.get(sid) : undefined;
        if (!dt || dt < props.dateRange.from || dt > props.dateRange.to)
          continue;
      }

      const start = (s as any)?.startLoc || (s as any)?.start || {};
      const end = (s as any)?.endLoc || (s as any)?.end || {};
      const startLie = toLowerString((start as any)?.lie);
      if (startLie !== "fairway") continue;

      // club id and label handling (skip retired/deleted unknowns except 0 allowed)
      const clubIdNum: number | undefined =
        typeof (s as any)?.clubId === "number" ? (s as any).clubId : undefined;
      const isUnknownClub = clubIdNum === 0;
      if (
        clubIdNum != null &&
        clubIdNum !== 0 &&
        !(props.clubsData?.data || []).some((c: any) => c?.id === clubIdNum)
      ) {
        continue;
      }

      const label = isUnknownClub ? "unknown" : clubLabelFromId(clubIdNum);
      const clubKey = isUnknownClub
        ? "label:unknown"
        : clubIdNum != null
        ? `id:${clubIdNum}`
        : `label:${label}`;
      const model =
        !isUnknownClub && clubIdNum != null
          ? (props.clubsData?.data || []).find((c: any) => c?.id === clubIdNum)
              ?.model
          : undefined;

      const endLie = toLowerString((end as any)?.lie);

      const agg = totalsByKey.get(clubKey) || {
        total: 0,
        green: 0,
        fairway: 0,
        other: 0,
      };
      agg.total += 1;
      totalConsidered += 1;
      if (endLie === "green") agg.green += 1;
      else if (endLie === "fairway") agg.fairway += 1;
      else agg.other += 1;
      totalsByKey.set(clubKey, agg);
      if (!metaByKey.has(clubKey)) metaByKey.set(clubKey, { label, model });
    }

    const rows: Row[] = Array.from(totalsByKey.entries())
      .map(([clubKey, v]) => ({
        club: metaByKey.get(clubKey)?.label || clubKey,
        model: metaByKey.get(clubKey)?.model,
        total: v.total,
        green: v.green,
        fairway: v.fairway,
        other: v.other,
        greenPct: v.total ? (v.green / v.total) * 100 : 0,
        fairwayPct: v.total ? (v.fairway / v.total) * 100 : 0,
      }))
      .sort(
        (a, b) =>
          b.greenPct - a.greenPct ||
          b.fairwayPct - a.fairwayPct ||
          b.total - a.total
      );

    debug["shots.total"] = shots.length;
    debug["shots.fairwayStart"] = totalConsidered;
    debug["rows"] = rows.length;

    return { rows, debug };
  }, [
    props.shotsData,
    props.scorecardsData,
    props.clubsData,
    props.clubTypesData,
    props.dateRange,
  ]);

  const rows = memo.rows;
  const debug = memo.debug;

  if (!props.shotsData || !Array.isArray(props.shotsData.data)) {
    return (
      <div style={{ color: "#666" }}>
        Upload DI-GOLF `Golf-SHOT.json` to view approach stats.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ margin: "8px 0 12px" }}>Approach outcomes from fairway</h3>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
        Counts of shots that started from fairway, grouped by club, categorized
        by where they finished.
      </div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
        Debug:{" "}
        {Object.entries(debug || {})
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 90px 90px 90px 90px 90px 90px",
          gap: 8,
          alignItems: "center",
          maxWidth: 820,
        }}
      >
        <div style={{ fontWeight: 600 }}>Club</div>
        <div style={{ fontWeight: 600, textAlign: "right" }}>Shots</div>
        <div style={{ fontWeight: 600, textAlign: "right" }}>Green</div>
        <div style={{ fontWeight: 600, textAlign: "right" }}>Fairway</div>
        <div style={{ fontWeight: 600, textAlign: "right" }}>Other</div>
        <div style={{ fontWeight: 600, textAlign: "right" }}>Green %</div>
        <div style={{ fontWeight: 600, textAlign: "right" }}>Fairway %</div>
        {rows.map((r) => (
          <React.Fragment key={r.club}>
            <div>
              <div style={{ fontWeight: 600 }}>{r.club}</div>
              {r.model ? (
                <div style={{ color: "#666", fontSize: 12 }}>{r.model}</div>
              ) : null}
            </div>
            <div style={{ textAlign: "right" }}>{r.total}</div>
            <div style={{ textAlign: "right" }}>{r.green}</div>
            <div style={{ textAlign: "right" }}>{r.fairway}</div>
            <div style={{ textAlign: "right" }}>{r.other}</div>
            <div style={{ textAlign: "right" }}>{r.greenPct.toFixed(0)}%</div>
            <div style={{ textAlign: "right" }}>{r.fairwayPct.toFixed(0)}%</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
