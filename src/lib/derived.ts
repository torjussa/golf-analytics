import roundsJson from "../../data/DI-GOLF/derived/rounds.json";
import type { DerivedRoundsFile, DerivedRound } from "./types";

export function loadDerivedRounds(): DerivedRound[] {
  const file = roundsJson as unknown as DerivedRoundsFile;
  return file.rounds ?? [];
}

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
        return sum + (h.gir ? (h.putts ?? 0) : 0);
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


