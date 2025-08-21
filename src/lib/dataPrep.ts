export type UploadedFile = { path: string; json: unknown };

export type ClubTypesData = { data?: Array<{ value: number; name: string }> };
export type ClubsData = {
  data?: Array<{
    id: number;
    name?: string;
    clubTypeId: number;
    model?: string;
    retired?: boolean;
    deleted?: boolean;
  }>;
};
export type ShotsData = { data?: Array<Record<string, any>> };
export type ScorecardsData = {
  data?: Array<{ id?: number; scorecardId?: number; holes?: Array<any> }>;
};

export function getScorecardIdFromFitPath(path: string): string | undefined {
  const m =
    path.match(/SCORECARD[_-]RAWDATA-(\d+)\.fit$/i) ||
    path.match(/RAWDATA-(\d+)\.fit$/i) ||
    path.match(/(\d+)\.fit$/i);
  return m ? m[1] : undefined;
}

export function buildParMapFromFits(
  uploaded: UploadedFile[]
): Map<string, number> {
  const parByRoundHole = new Map<string, number>();
  for (const f of uploaded.filter((u) =>
    u.path.toLowerCase().endsWith(".fit")
  )) {
    const sid = getScorecardIdFromFitPath(f.path);
    if (!sid) continue;
    const root: any = f.json as any;
    const holesArr: any[] = (root?.["193"] as any[]) || root?.holes || [];
    if (!Array.isArray(holesArr)) continue;
    for (const r of holesArr) {
      if (!r || typeof r !== "object") continue;
      const hn =
        r["hole number"] ??
        r["hole_number"] ??
        r["number"] ??
        r["hole"] ??
        r["0"] ??
        r["1"];
      const pr = r["par"] ?? r["2"];
      if (hn != null && typeof pr === "number")
        parByRoundHole.set(`${sid}:${hn}`, pr);
    }
  }
  return parByRoundHole;
}

export function buildScorePuttsMapFromScorecards(
  scorecards?: ScorecardsData | null
): Map<string, { strokes?: number; putts?: number }> {
  const map = new Map<string, { strokes?: number; putts?: number }>();
  const rows = scorecards?.data || [];
  for (const sc of rows) {
    const sid = String(sc?.id ?? sc?.scorecardId ?? "");
    if (!sid) continue;
    const holes = sc?.holes || [];
    for (const h of holes) {
      const hn = h?.number ?? h?.hole ?? h?.["number"];
      if (hn == null) continue;
      map.set(`${sid}:${hn}`, {
        strokes: h?.strokes ?? h?.score,
        putts: h?.putts,
      });
    }
  }
  return map;
}

export function buildClubTypeNameById(
  clubTypes?: ClubTypesData | null
): Map<number, string> {
  const map = new Map<number, string>();
  for (const ct of clubTypes?.data || []) map.set(ct.value, ct.name);
  return map;
}

export function buildClubLabelById(
  clubs?: ClubsData | null,
  clubTypeNameById?: Map<number, string>
) {
  const byId = new Map<
    number,
    {
      name?: string;
      clubTypeId: number;
      model?: string;
      retired?: boolean;
      deleted?: boolean;
    }
  >();
  for (const c of clubs?.data || []) byId.set(c.id, c);
  return (id: number | undefined): string => {
    if (id == null) return "Unknown";
    const c = byId.get(id);
    if (!c) return String(id);
    if (c.name && c.name.trim()) return c.name;
    const type = clubTypeNameById?.get(c.clubTypeId);
    return type || `Club ${c.clubTypeId}`;
  };
}

export function buildFirstTeeShotByRoundHole(
  shots?: ShotsData | null
): Map<string, any> {
  const map = new Map<string, any>();
  const rows = shots?.data || [];
  for (const s of rows) {
    // Optional filter by date range is handled by callers that can map scorecardId -> date
    const holeNumber =
      s.holeNumber ?? s.hole ?? s["hole number"] ?? s["1"] ?? s["0"];
    const scorecardId = s.scorecardId ?? s.roundId ?? s["id"];
    if (holeNumber == null || scorecardId == null) continue;
    const key = `${scorecardId}:${holeNumber}`;
    const so = typeof s.shotOrder === "number" ? s.shotOrder : undefined;
    const st: number | undefined =
      typeof s.shotTime === "number" ? s.shotTime : undefined;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, s);
      continue;
    }
    const prevSo =
      typeof prev.shotOrder === "number" ? prev.shotOrder : undefined;
    const prevSt: number | undefined =
      typeof prev.shotTime === "number" ? prev.shotTime : undefined;
    const earlier =
      (so != null && prevSo != null ? so < prevSo : false) ||
      (so != null && prevSo == null) ||
      (so == null &&
        prevSo == null &&
        st != null &&
        prevSt != null &&
        st < prevSt);
    if (earlier) map.set(key, s);
  }
  return map;
}
