export type ScorecardHole = {
  number: number;
  putts?: number;
  strokes?: number;
};

export type DerivedFitExtras = {
  hasFit: boolean;
  avgHeartRate?: number;
  maxHeartRate?: number;
  totalDistance?: number;
  parByHole?: Record<number, number>;
};

export type DerivedGir = {
  holes: number;
  puttsTotal: number;
  puttsAverage?: number;
};

export type DerivedHole = ScorecardHole & {
  par?: number;
  gir?: boolean;
};

export type DerivedRound = {
  id: number;
  date: string;
  startTime?: string;
  formattedStartTime?: string;
  endTime?: string;
  formattedEndTime?: string;
  holesCompleted?: number;
  excludeFromStats?: boolean;
  strokes?: number;
  stepsTaken?: number;
  distanceWalked?: number;
  holes: DerivedHole[];
  fit?: DerivedFitExtras;
  gir?: DerivedGir;
};

export type DerivedRoundsFile = {
  rounds: DerivedRound[];
};


