import React from "react";
import {
  buildParMapFromFits,
  buildScorePuttsMapFromScorecards,
  buildClubTypeNameById,
  buildClubLabelById,
  buildFirstTeeShotByRoundHole,
  getScorecardIdFromFitPath,
  type UploadedFile,
  type ShotsData,
  type ScorecardsData,
  type ClubsData,
  type ClubTypesData,
} from "../lib/dataPrep";

type Uploaded = UploadedFile;

type AnyRecord = Record<string, unknown>;

type Par3Row = {
  club: string;
  total: number;
  gir: number;
  pct: number;
  model?: string;
};

function getNumber(o: AnyRecord, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() && !isNaN(Number(v)))
      return Number(v);
  }
  return undefined;
}

export function Par3Stats(props: {
  uploaded: Uploaded[];
  shotsData?: ShotsData | null;
  scorecardsData?: ScorecardsData | null;
  clubsData?: ClubsData | null;
  clubTypesData?: ClubTypesData | null;
  dateRange?: { from: Date; to: Date };
}) {
  const memo = React.useMemo(() => {
    const debug: Record<string, number> = {};

    // Prefer uploaded JSONs when present
    if (props.shotsData && Array.isArray(props.shotsData.data)) {
      debug["shots.total"] = props.shotsData.data.length;

      const parByRoundHole = buildParMapFromFits(props.uploaded);
      const scorePuttsByRoundHole = buildScorePuttsMapFromScorecards(
        props.scorecardsData
      );
      const clubTypeNameById = buildClubTypeNameById(props.clubTypesData);
      const clubLabelFromId = buildClubLabelById(
        props.clubsData,
        clubTypeNameById
      );
      const firstShotByRoundHole = buildFirstTeeShotByRoundHole(
        props.shotsData
      );

      const totalsByKey = new Map<string, { total: number; gir: number }>();
      const metaByKey = new Map<string, { label: string; model?: string }>();
      let par3Count = 0;
      let scoredCount = 0;

      // Build scorecardId -> date map to filter by dateRange
      const scToDate = new Map<string, Date>();
      for (const sc of props.scorecardsData?.data || []) {
        const id = String((sc as any)?.id ?? (sc as any)?.scorecardId ?? "");
        const ds = (sc as any)?.formattedStartTime || (sc as any)?.startTime;
        if (!id || !ds) continue;
        const d = new Date(ds);
        if (!isNaN(d.getTime())) scToDate.set(id, d);
      }

      for (const [key, shot] of firstShotByRoundHole.entries()) {
        if (props.dateRange) {
          const sid = String(
            (shot as any)?.scorecardId ?? (shot as any)?.roundId ?? ""
          );
          const dt = scToDate.get(sid);
          if (!dt || dt < props.dateRange.from || dt > props.dateRange.to)
            continue;
        }
        const par = parByRoundHole.get(key);
        if (par !== 3) continue;
        par3Count++;
        const sp = scorePuttsByRoundHole.get(key);
        if (
          !sp ||
          typeof sp.putts !== "number" ||
          typeof sp.strokes !== "number"
        )
          continue;
        scoredCount++;
        const clubIdNum = shot.clubId as number | undefined;
        const isUnknownClub = clubIdNum === 0;
        // Skip retired/deleted: if a clubId is present (and not 0) but not found in uploaded clubs
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
            ? (props.clubsData?.data || []).find(
                (c: any) => c?.id === clubIdNum
              )?.model
            : undefined;
        const gir = sp.strokes - sp.putts <= 1;
        const agg = totalsByKey.get(clubKey) || { total: 0, gir: 0 };
        agg.total += 1;
        if (gir) agg.gir += 1;
        totalsByKey.set(clubKey, agg);
        if (!metaByKey.has(clubKey)) metaByKey.set(clubKey, { label, model });
      }

      const table: Par3Row[] = Array.from(totalsByKey.entries())
        .map(([clubKey, v]) => ({
          club: metaByKey.get(clubKey)?.label || clubKey,
          model: metaByKey.get(clubKey)?.model,
          total: v.total,
          gir: v.gir,
          pct: v.total ? (v.gir / v.total) * 100 : 0,
        }))
        .sort((a, b) => b.pct - a.pct || b.total - a.total);

      debug["shots.par3"] = par3Count;
      debug["shots.scored"] = scoredCount;
      debug["rows"] = table.length;
      return { rows: table, debug };
    }

    // Fallback: derive from uploaded decoded FIT objects (unchanged logic, summarized)
    const totalsByClub = new Map<string, { total: number; gir: number }>();
    let fitHoles = 0;
    let fitScores = 0;
    let fitShots = 0;
    let fitPar3 = 0;

    for (const file of props.uploaded.filter((f) =>
      f.path.toLowerCase().endsWith(".fit")
    )) {
      // If a date range is set, try to filter this FIT by scorecard date
      if (props.dateRange) {
        const sid = getScorecardIdFromFitPath(file.path);
        if (sid) {
          const sc = ((props.scorecardsData?.data || []) as any[]).find(
            (r: any) => String(r?.id ?? r?.scorecardId ?? "") === String(sid)
          );
          const ds = (sc as any)?.formattedStartTime || (sc as any)?.startTime;
          const d = ds ? new Date(ds) : undefined;
          if (!d || d < props.dateRange.from || d > props.dateRange.to) {
            continue;
          }
        }
      }
      const root = file.json as AnyRecord;
      const holeParByNumber = new Map<number, number>();
      const scoreByHole = new Map<number, { score?: number; putts?: number }>();
      const shotsByHole = new Map<number, AnyRecord[]>();

      const holesArr: any[] = (root as any)["193"] || (root as any).holes || [];
      const scoresArr: any[] =
        (root as any)["192"] || (root as any).scores || [];
      const shotsArr: any[] = (root as any)["194"] || (root as any).shots || [];

      for (const r of holesArr || []) {
        const hn = getNumber(r as any, [
          "hole number",
          "hole_number",
          "number",
          "hole",
          "0",
          "1",
        ]);
        const pr = getNumber(r as any, ["par", "2"]);
        if (hn != null && pr != null) {
          holeParByNumber.set(hn, pr);
          fitHoles++;
        }
      }
      for (const r of scoresArr || []) {
        const hn = getNumber(r as any, [
          "hole number",
          "hole_number",
          "number",
          "hole",
          "1",
          "0",
        ]);
        const sc = getNumber(r as any, ["score", "2"]);
        const pu = getNumber(r as any, ["putts", "5", "6"]);
        if (hn != null && (sc != null || pu != null)) {
          scoreByHole.set(hn, { score: sc, putts: pu });
          fitScores++;
        }
      }
      for (const r of shotsArr || []) {
        const hn = getNumber(r as any, [
          "hole number",
          "hole_number",
          "number",
          "hole",
          "1",
          "0",
        ]);
        if (hn != null) {
          if (!shotsByHole.has(hn)) shotsByHole.set(hn, []);
          shotsByHole.get(hn)!.push(r as any);
          fitShots++;
        }
      }

      // Build label helpers for FIT fallback
      const typeNameById = buildClubTypeNameById(props.clubTypesData);
      const labelFromId = buildClubLabelById(props.clubsData, typeNameById);

      for (const [holeNumber, par] of holeParByNumber.entries()) {
        if (par !== 3) continue;
        fitPar3++;
        const shots = (shotsByHole.get(holeNumber) || []).slice();
        if (!shots.length) continue;
        const tee = shots[0];
        const clubId = getNumber(tee as any, ["club id", "club_id", "clubId"]);
        const isUnknownClub = clubId === 0;
        // Skip if this club id does not exist in uploaded clubs (likely retired),
        // but keep 0 as "unknown".
        if (
          clubId != null &&
          clubId !== 0 &&
          !(props.clubsData?.data || []).some((c: any) => c?.id === clubId)
        ) {
          continue;
        }
        const label = isUnknownClub
          ? "unknown"
          : clubId != null
          ? labelFromId(clubId)
          : String(
              (tee as any)["club type"] ||
                (tee as any).club_type ||
                (tee as any).club ||
                (tee as any)["7"] ||
                "Unknown"
            );
        const sp = scoreByHole.get(holeNumber) || {};
        const gir =
          sp.score != null && sp.putts != null
            ? sp.score - (sp.putts as number) <= 1
            : false;
        const agg = totalsByClub.get(label) || { total: 0, gir: 0 };
        agg.total += 1;
        if (gir) agg.gir += 1;
        totalsByClub.set(label, agg);
      }
    }

    const table: Par3Row[] = Array.from(totalsByClub.entries())
      .map(([club, v]) => ({
        club,
        total: v.total,
        gir: v.gir,
        pct: v.total ? (v.gir / v.total) * 100 : 0,
        model: undefined,
      }))
      .sort((a, b) => b.pct - a.pct || b.total - a.total);
    debug["fit.holes"] = fitHoles;
    debug["fit.scores"] = fitScores;
    debug["fit.shots"] = fitShots;
    debug["fit.par3"] = fitPar3;
    debug["rows"] = table.length;
    return { rows: table, debug };
  }, [
    props.uploaded,
    props.shotsData,
    props.scorecardsData,
    props.clubsData,
    props.clubTypesData,
    props.dateRange,
  ]);

  const rows = memo.rows;
  const debug = memo.debug;

  if (!props.uploaded.some((f) => f.path.toLowerCase().endsWith(".fit"))) {
    return (
      <div style={{ color: "#666" }}>Upload FIT files to see Par 3 stats.</div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ margin: "8px 0 12px" }}>Par 3 tee shot GIR by club</h3>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
        GIR for Par 3s is approximated as (score − putts ≤ 1).
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
          gridTemplateColumns: "1fr 100px 100px 100px",
          gap: 8,
          alignItems: "center",
          maxWidth: 520,
        }}
      >
        <div style={{ fontWeight: 600 }}>Club</div>
        <div style={{ fontWeight: 600, textAlign: "right" }}>Shots</div>
        <div style={{ fontWeight: 600, textAlign: "right" }}>GIR</div>
        <div style={{ fontWeight: 600, textAlign: "right" }}>GIR %</div>
        {rows.map((r) => (
          <React.Fragment key={r.club}>
            <div>
              <div style={{ fontWeight: 600 }}>{r.club}</div>
              {r.model ? (
                <div style={{ color: "#666", fontSize: 12 }}>{r.model}</div>
              ) : null}
            </div>
            <div style={{ textAlign: "right" }}>{r.total}</div>
            <div style={{ textAlign: "right" }}>{r.gir}</div>
            <div style={{ textAlign: "right" }}>{r.pct.toFixed(0)}%</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
