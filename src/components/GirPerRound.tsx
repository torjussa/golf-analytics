import React from "react";
import type { UploadedFile, ScorecardsData } from "../lib/dataPrep";
import {
  buildParMapFromFits,
  buildScorePuttsMapFromScorecards,
  getScorecardIdFromFitPath,
} from "../lib/dataPrep";

interface GirPerRoundProps {
  uploaded: UploadedFile[];
  scorecardsData?: ScorecardsData | null;
  dateRange?: { from: Date; to: Date };
}

interface GirRoundRow {
  scorecardId: number;
  courseGlobalId?: number;
  dateLabel: string;
  holesConsidered: number;
  girHoles: number;
}

function formatDateShort(dateString?: string): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function GirPerRound(props: GirPerRoundProps) {
  const parByRoundHole = React.useMemo(
    () => buildParMapFromFits(props.uploaded),
    [props.uploaded]
  );
  const scorePuttsByRoundHole = React.useMemo(
    () => buildScorePuttsMapFromScorecards(props.scorecardsData),
    [props.scorecardsData]
  );

  // Build scorecardId -> course name from uploaded FITs (message 190)
  const courseNameByScorecardId = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const f of props.uploaded.filter((u) =>
      u.path.toLowerCase().endsWith(".fit")
    )) {
      const sidStr = getScorecardIdFromFitPath(f.path);
      const sidNum = sidStr ? Number(sidStr) : undefined;
      if (!sidNum || Number.isNaN(sidNum)) continue;
      const root: any = f.json as any;
      const courses: any[] =
        (root?.["190"] as any[]) || (root?.golfCourse as any[]) || [];
      if (!Array.isArray(courses) || courses.length === 0) continue;
      const first = courses[0] as any;
      const name: unknown =
        first?.name ??
        first?.["name"] ??
        first?.["1"] ??
        first?.["course name"];
      if (typeof name === "string" && name.trim()) {
        if (!map.has(sidNum)) map.set(sidNum, name.trim());
      }
    }
    return map;
  }, [props.uploaded]);

  // Map courseGlobalId -> course name using scorecards join
  const courseNameByGlobalId = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const sc of props.scorecardsData?.data || []) {
      const sid = (sc as any)?.id ?? (sc as any)?.scorecardId;
      const cid = (sc as any)?.courseGlobalId as number | undefined;
      if (cid == null) continue;
      const nm = courseNameByScorecardId.get(Number(sid));
      if (nm && !map.has(cid)) map.set(cid, nm);
    }
    return map;
  }, [props.scorecardsData, courseNameByScorecardId]);

  // Track ignored courses (default: include all => none ignored)
  const [ignoredCourses] = React.useState<Set<number>>(new Set());

  const rows: GirRoundRow[] = React.useMemo(() => {
    const out: GirRoundRow[] = [];
    const scs = props.scorecardsData?.data || [];
    for (const sc of scs) {
      const sid = (sc as any)?.id ?? (sc as any)?.scorecardId;
      if (sid == null) continue;
      const courseGlobalId = (sc as any)?.courseGlobalId as number | undefined;
      if (courseGlobalId != null && ignoredCourses.has(courseGlobalId))
        continue;
      const ds = (sc as any)?.formattedStartTime || (sc as any)?.startTime;
      if (props.dateRange) {
        const d = ds ? new Date(ds) : undefined;
        if (!d || isNaN(d.getTime())) continue;
        if (d < props.dateRange.from || d > props.dateRange.to) continue;
      }

      const holes = ((sc as any)?.holes || []) as Array<any>;
      let holesConsidered = 0;
      let girHoles = 0;
      for (const h of holes) {
        const hn = h?.number ?? h?.hole ?? h?.["number"];
        if (hn == null) continue;
        const par = parByRoundHole.get(`${sid}:${hn}`);
        const sp = scorePuttsByRoundHole.get(`${sid}:${hn}`);
        const strokes = (h?.strokes ?? h?.score ?? sp?.strokes) as
          | number
          | undefined;
        const putts = (h?.putts ?? sp?.putts) as number | undefined;
        if (
          typeof par !== "number" ||
          typeof strokes !== "number" ||
          typeof putts !== "number"
        )
          continue;
        holesConsidered += 1;
        const approachStrokes = strokes - putts;
        if (approachStrokes <= par - 2) girHoles += 1;
      }
      if (holesConsidered >= 9) {
        out.push({
          scorecardId: Number(sid),
          courseGlobalId,
          dateLabel: formatDateShort(ds),
          holesConsidered,
          girHoles,
        });
      }
    }
    out.sort((a, b) => b.scorecardId - a.scorecardId);
    return out;
  }, [
    props.scorecardsData,
    props.dateRange,
    parByRoundHole,
    scorePuttsByRoundHole,
    ignoredCourses,
  ]);

  const hasParData = parByRoundHole.size > 0;

  const girStats = React.useMemo(() => {
    const totals = rows.reduce(
      (acc, r) => {
        acc.totalHoles += r.holesConsidered;
        acc.totalGirs += r.girHoles;
        if (r.holesConsidered === 18) {
          acc.count18 += 1;
          acc.sumGir18 += r.girHoles;
        } else if (r.holesConsidered === 9) {
          acc.count9 += 1;
          acc.sumGir9 += r.girHoles;
        }
        return acc;
      },
      {
        totalHoles: 0,
        totalGirs: 0,
        sumGir18: 0,
        sumGir9: 0,
        count18: 0,
        count9: 0,
      }
    );
    const pct =
      totals.totalHoles > 0 ? (totals.totalGirs / totals.totalHoles) * 100 : 0;
    const avg18 = totals.count18 > 0 ? totals.sumGir18 / totals.count18 : 0;
    const avg9 = totals.count9 > 0 ? totals.sumGir9 / totals.count9 : 0;
    return {
      totalHoles: totals.totalHoles,
      totalGirs: totals.totalGirs,
      pct,
      avg18,
      avg9,
      count18: totals.count18,
      count9: totals.count9,
    };
  }, [rows]);

  return (
    <div className="mt-6">
      <h2 className="mb-3 mt-2 text-lg font-semibold">GIR per round</h2>
      {!hasParData ? (
        <div className="text-gray-600">
          Upload FIT files (containing hole pars) to compute GIR per round.
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-2 font-semibold">
            Averages
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Total GIR
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">
                {girStats.pct.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-600">
                {girStats.totalGirs} / {girStats.totalHoles} holes
              </div>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">
                GIR per 18-hole round
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">
                {girStats.avg18.toFixed(1)}
              </div>
              <div className="text-xs text-gray-600">
                {girStats.count18} rounds
              </div>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">
                GIR per 9-hole round
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">
                {girStats.avg9.toFixed(1)}
              </div>
              <div className="text-xs text-gray-600">
                {girStats.count9} rounds
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Ignored courses multiselect removed */}

      {/* Data table */}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Course
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Holes
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  GIR
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  GIR %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((r) => {
                const pct = r.holesConsidered
                  ? (r.girHoles / r.holesConsidered) * 100
                  : 0;
                return (
                  <tr key={r.scorecardId}>
                    <td className="px-3 py-2 text-sm text-gray-900">
                      {r.dateLabel}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      {typeof r.courseGlobalId === "number"
                        ? `${
                            courseNameByGlobalId.get(r.courseGlobalId) ||
                            "Course"
                          } (${r.courseGlobalId})`
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-gray-900">
                      {r.holesConsidered}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-gray-900">
                      {r.girHoles}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-gray-900">
                      {pct.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : hasParData ? (
        <div className="text-gray-600">
          No rounds match the current filters.
        </div>
      ) : null}
    </div>
  );
}
