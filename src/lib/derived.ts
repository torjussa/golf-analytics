// This module previously imported a generated JSON. To avoid build errors when the file
// is missing locally, we expose helpers that work from passed-in data only.
import type { DerivedRound } from "./types";

export function computePuttSeries(rounds: DerivedRound[]) {
  return rounds
    .map((r) => {
      const totalPutts = r.holes.reduce((sum, h) => sum + (h.putts ?? 0), 0);
      const date = r.formattedStartTime || r.startTime || String(r.id);
      return {
        id: r.id,
        date,
        holesCount: r.holesCompleted,
        excludeFromStats: r.excludeFromStats,
        putts: totalPutts,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function computeGirPuttSeries(rounds: DerivedRound[]) {
  return rounds
    .map((r) => {
      const girPutts = r.holes.reduce((sum, h) => {
        return sum + (h.gir ? h.putts ?? 0 : 0);
      }, 0);
      const date = r.formattedStartTime || r.startTime || String(r.id);
      return {
        id: r.id,
        date,
        holesCount: r.holesCompleted,
        excludeFromStats: r.excludeFromStats,
        putts: girPutts,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
