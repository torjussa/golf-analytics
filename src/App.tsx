import React from "react";
import { FolderUpload } from "./components/FolderUpload";
import { RawJsonViewer } from "./components/RawJsonViewer";
import {
  ClubHeatmaps,
  type DistanceUnits,
  type ClubsFile,
  type ShotsFile,
  type ClubTypesFile,
} from "./components/ClubHeatmaps";
import { Tabs, type TabKey } from "./components/Tabs";
import { ApproachPlaceholder } from "./components/ApproachPlaceholder";
import { PuttingChart } from "./components/PuttingChart";
import { Par3Placeholder } from "./components/Par3Placeholder";
import { GirPerRound } from "./components/GirPerRound";
import { Info, Database } from "lucide-react";

const HOW_IT_WORKS_TEXT =
  "Request data export at Garmin Connect, unzip the folder you receive on email, locate and upload the folder /DI-Connect/DI-Golf. No data is stored, all processing is done in your browser.";

type ScorecardHole = {
  number: number;
  strokes?: number;
  penalties?: number;
  putts?: number;
};

type Scorecard = {
  id: number;
  startTime?: string;
  formattedStartTime?: string;
  endTime?: string;
  formattedEndTime?: string;
  holes?: ScorecardHole[];
  holesCompleted?: number;
  strokes?: number;
  excludeFromStats?: boolean;
};

type ScorecardJson = {
  version: string;
  type: string;
  data: Scorecard[];
};

function computePuttsPerRound(scorecards: Scorecard[]) {
  return scorecards
    .map((sc) => {
      const totalPutts = (sc.holes ?? []).reduce(
        (sum, hole) => sum + (hole.putts ?? 0),
        0
      );
      const label = sc.formattedStartTime || sc.startTime || String(sc.id);
      const holesCount =
        sc.holesCompleted ?? (sc.holes ? sc.holes.length : undefined);
      return {
        date: label,
        putts: totalPutts,
        id: sc.id,
        holesCount,
        excludeFromStats: sc.excludeFromStats,
      } as {
        date: string;
        putts: number;
        id: number;
        holesCount?: number;
        excludeFromStats?: boolean;
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function App() {
  const [data, setData] = React.useState<
    Array<{
      date: string;
      putts: number;
      id: number;
      holesCount?: number;
      excludeFromStats?: boolean;
    }>
  >([]);
  const [roundLength, setRoundLength] = React.useState<"all" | "9" | "18">(
    "18"
  );
  const [uploaded, setUploaded] = React.useState<
    Array<{ path: string; json: unknown }>
  >([]);
  const [uploadedClubs, setUploadedClubs] = React.useState<ClubsFile | null>(
    null
  );
  const [uploadedShots, setUploadedShots] = React.useState<ShotsFile | null>(
    null
  );
  const [uploadedClubTypes, setUploadedClubTypes] =
    React.useState<ClubTypesFile | null>(null);
  const [uploadedScorecards, setUploadedScorecards] =
    React.useState<ScorecardJson | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabKey>("clubs");
  const [isHowItWorksOpen, setIsHowItWorksOpen] = React.useState(false);

  type Units = DistanceUnits;
  const detectDefaultUnits = React.useCallback((): Units => "meters", []);
  const [units, setUnits] = React.useState<Units>(detectDefaultUnits);

  // Global date range derived from uploaded scorecards
  const allDates = React.useMemo(() => {
    const src = uploadedScorecards?.data || [];
    const dates: Date[] = [];
    for (const sc of src) {
      const ds = (sc as any).formattedStartTime || (sc as any).startTime;
      const d = ds ? new Date(ds) : undefined;
      if (d && !isNaN(d.getTime())) dates.push(d);
    }
    dates.sort((a, b) => a.getTime() - b.getTime());
    return dates;
  }, [uploadedScorecards]);

  const [dateIdxRange, setDateIdxRange] = React.useState<[number, number]>([
    0, 0,
  ]);

  const dateRange = React.useMemo(() => {
    if (!allDates.length)
      return undefined as undefined | { from: Date; to: Date };
    const [i0, i1] = dateIdxRange;
    const from = allDates[Math.max(0, Math.min(allDates.length - 1, i0))];
    const to = allDates[Math.max(0, Math.min(allDates.length - 1, i1))];
    return from && to ? { from, to } : undefined;
  }, [allDates, dateIdxRange]);

  React.useEffect(() => {
    if (allDates.length) setDateIdxRange([0, allDates.length - 1]);
  }, [allDates.length]);

  React.useEffect(() => {
    try {
      const src = uploadedScorecards?.data;
      if (Array.isArray(src)) {
        setData(computePuttsPerRound(src));
      } else {
        setData([]);
      }
    } catch (e) {
      setData([]);
    }
  }, [uploadedScorecards]);

  const filteredRounds = React.useMemo(() => {
    let processedData = data.filter((d) => {
      if (dateRange) {
        const dt = new Date(d.date);
        if (isNaN(dt.getTime())) return false;
        if (dt < dateRange.from || dt > dateRange.to) return false;
      }
      if (d.excludeFromStats) return false;
      const holesPlayed = typeof d.holesCount === "number" ? d.holesCount : 0;
      if (holesPlayed !== 9 && holesPlayed !== 18) return false; // include only 9- or 18-hole rounds
      const minPutts = holesPlayed * 0.8; // implausible if fewer putts than 0.8 per hole
      if (d.putts < minPutts) return false;
      return true;
    });

    if (roundLength === "9") {
      processedData = processedData.filter((d) => d.holesCount === 9);
    } else if (roundLength === "18") {
      processedData = processedData.filter((d) => d.holesCount === 18);
    }

    return processedData;
  }, [data, roundLength, dateRange]);

  const puttBuckets = React.useMemo(() => {
    const ids = new Set(filteredRounds.map((d) => d.id));
    const buckets = { one: 0, two: 0, three: 0, fourPlus: 0 } as {
      one: number;
      two: number;
      three: number;
      fourPlus: number;
    };
    for (const sc of uploadedScorecards?.data || []) {
      if (!ids.has(sc.id)) continue;
      for (const h of sc.holes || []) {
        const p = typeof h.putts === "number" ? h.putts : undefined;
        if (p == null) continue;
        if (p <= 1) buckets.one += 1;
        else if (p === 2) buckets.two += 1;
        else if (p === 3) buckets.three += 1;
        else buckets.fourPlus += 1;
      }
    }
    return buckets;
  }, [filteredRounds, uploadedScorecards]);

  const handleLoaded = React.useCallback(
    (files: Array<{ path: string; json: unknown }>) => {
      setUploaded(files);
      const clubs = files.find((f) => /Golf-CLUB\.json$/i.test(f.path))
        ?.json as ClubsFile | undefined;
      const shots = files.find((f) => /Golf-SHOT\.json$/i.test(f.path))
        ?.json as ShotsFile | undefined;
      const clubTypes = files.find((f) =>
        /Golf-CLUB_TYPES\.json$/i.test(f.path)
      )?.json as ClubTypesFile | undefined;
      const scorecards = files.find((f) =>
        /Golf-SCORECARD\.json$/i.test(f.path)
      )?.json as ScorecardJson | undefined;
      if (clubs) setUploadedClubs(clubs);
      if (shots) setUploadedShots(shots);
      if (clubTypes) setUploadedClubTypes(clubTypes);
      if (scorecards) setUploadedScorecards(scorecards);
    },
    []
  );

  const loadSampleData = React.useCallback(async () => {
    try {
      const [clubs, shots, clubTypes, scorecards] = await Promise.all([
        import("../data/DI-GOLF/Golf-CLUB.json"),
        import("../data/DI-GOLF/Golf-SHOT.json"),
        import("../data/DI-GOLF/Golf-CLUB_TYPES.json"),
        import("../data/DI-GOLF/Golf-SCORECARD.json"),
      ]);
      const files = [
        { path: "DI-GOLF/Golf-CLUB.json", json: (clubs as any).default },
        { path: "DI-GOLF/Golf-SHOT.json", json: (shots as any).default },
        {
          path: "DI-GOLF/Golf-CLUB_TYPES.json",
          json: (clubTypes as any).default,
        },
        {
          path: "DI-GOLF/Golf-SCORECARD.json",
          json: (scorecards as any).default,
        },
      ];
      handleLoaded(files);
    } catch (err) {
      console.error("Failed to load sample data", err);
    }
  }, [handleLoaded]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="mb-0 text-4xl font-black leading-tight">
            Golf Analytics
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FolderUpload onLoaded={handleLoaded} />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm hover:bg-gray-50"
            onClick={loadSampleData}
          >
            <Database className="h-4 w-4" />
            Load sample data
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            aria-label="How to get your own data"
            title={HOW_IT_WORKS_TEXT}
            onClick={() => setIsHowItWorksOpen(true)}
          >
            <Info className="h-4 w-4" />
            How it works
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-md border border-gray-200 bg-white">
          <div className="p-2">
            <div className="mb-3 text-base font-semibold">Units</div>
            <div className="inline-flex overflow-hidden rounded-full border border-gray-300 bg-gray-50">
              <button
                type="button"
                className={
                  "px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                  (units === "meters"
                    ? "bg-blue-600 text-white"
                    : "bg-transparent text-gray-700 hover:bg-white/60")
                }
                aria-pressed={units === "meters"}
                onClick={() => setUnits("meters")}
              >
                Meters
              </button>
              <button
                type="button"
                className={
                  "px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                  (units === "yards"
                    ? "bg-blue-600 text-white"
                    : "bg-transparent text-gray-700 hover:bg-white/60")
                }
                aria-pressed={units === "yards"}
                onClick={() => setUnits("yards")}
              >
                Yards
              </button>
            </div>
          </div>
        </div>

        {allDates.length > 0 && (
          <div className="rounded-md border border-gray-200 bg-white">
            <div className="p-2">
              {/* Slider styles scoped to this block */}
              <style
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                  __html: `
              .dual-range{position:relative;height:32px}
              .dual-range input[type=range]{-webkit-appearance:none;appearance:none;position:absolute;left:0;top:0;width:100%;height:32px;background:transparent;margin:0;pointer-events:none}
              .dual-range input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid #2563eb;box-shadow:0 1px 3px rgba(0,0,0,.2);pointer-events:auto}
              .dual-range input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid #2563eb;box-shadow:0 1px 3px rgba(0,0,0,.2);pointer-events:auto}
              .dual-range .track{position:absolute;top:50%;left:0;right:0;height:4px;background:#e5e7eb;border-radius:9999px;transform:translateY(-50%)}
              .dual-range .fill{position:absolute;top:50%;height:4px;background:#2563eb;border-radius:9999px;transform:translateY(-50%)}
            `,
                }}
              />
              <div className="mb-1 text-base font-semibold">Date Range</div>
              <div className="mb-1 flex justify-between text-sm text-gray-800 md:text-base">
                <div>
                  {dateRange
                    ? dateRange.from.toLocaleString(undefined, {
                        month: "short",
                        year: "numeric",
                      })
                    : ""}
                </div>
                <div>
                  {dateRange
                    ? dateRange.to.toLocaleString(undefined, {
                        month: "short",
                        year: "numeric",
                      })
                    : ""}
                </div>
              </div>
              <div className="dual-range">
                <div className="track" />
                <div
                  className="fill"
                  style={{
                    left:
                      allDates.length > 1
                        ? `${(dateIdxRange[0] / (allDates.length - 1)) * 100}%`
                        : "0%",
                    right:
                      allDates.length > 1
                        ? `${
                            100 -
                            (dateIdxRange[1] / (allDates.length - 1)) * 100
                          }%`
                        : "0%",
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, allDates.length - 1)}
                  step={1}
                  value={dateIdxRange[0]}
                  aria-label="From date index"
                  onChange={(e) =>
                    setDateIdxRange([
                      Math.min(Number(e.target.value), dateIdxRange[1]),
                      dateIdxRange[1],
                    ])
                  }
                />
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, allDates.length - 1)}
                  step={1}
                  value={dateIdxRange[1]}
                  aria-label="To date index"
                  onChange={(e) =>
                    setDateIdxRange([
                      dateIdxRange[0],
                      Math.max(Number(e.target.value), dateIdxRange[0]),
                    ])
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {isHowItWorksOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsHowItWorksOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="how-it-works-title"
            className="relative z-10 w-[min(90vw,28rem)] rounded-lg bg-white p-4 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 id="how-it-works-title" className="text-lg font-semibold">
                How it works
              </h2>
              <button
                type="button"
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close dialog"
                onClick={() => setIsHowItWorksOpen(false)}
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {HOW_IT_WORKS_TEXT}
            </p>
            <div className="mt-4 text-right">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm hover:bg-gray-50"
                onClick={() => setIsHowItWorksOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Tabs active={activeTab} onChange={setActiveTab} />

      {activeTab === "putting" &&
        (uploadedScorecards && filteredRounds.length > 0 ? (
          <>
            <div className="mb-4 mt-3 flex items-center gap-3">
              <label htmlFor="round-length" className="text-gray-800">
                Round length:
              </label>
              <select
                id="round-length"
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                value={roundLength}
                onChange={(e) =>
                  setRoundLength(e.target.value as "all" | "9" | "18")
                }
              >
                <option value="all">All</option>
                <option value="9">9 holes</option>
                <option value="18">18 holes</option>
              </select>
              <span className="text-xs text-gray-600">
                Implausible rounds are hidden (&lt; 0.8 putts per hole)
              </span>
            </div>
            <PuttingChart
              data={filteredRounds}
              holeBuckets={puttBuckets}
              showAvgPerRound={roundLength !== "all"}
            />
          </>
        ) : (
          <div className="text-base-content/60">
            Upload your DI-GOLF folder (scorecards) to view putting chart.
          </div>
        ))}

      {activeTab === "clubs" && (
        <div className="mt-6">
          <h2 className="mb-3 mt-2 text-lg font-semibold">Uploaded data</h2>
          {!uploadedClubs || !uploadedShots || !uploadedClubTypes ? (
            <div className="text-gray-600">
              Upload your DI-GOLF folder to view club distances.
            </div>
          ) : (
            <ClubHeatmaps
              units={units}
              clubsData={uploadedClubs}
              shotsData={uploadedShots}
              clubTypesData={uploadedClubTypes}
              scorecardsData={uploadedScorecards as any}
              dateRange={dateRange as any}
            />
          )}
        </div>
      )}

      {activeTab === "par3" && (
        <Par3Placeholder
          uploaded={uploaded}
          shotsData={uploadedShots}
          scorecardsData={uploadedScorecards}
          clubsData={uploadedClubs}
          clubTypesData={uploadedClubTypes}
          dateRange={dateRange as any}
        />
      )}

      {activeTab === "approach" && (
        <ApproachPlaceholder
          uploaded={uploaded}
          shotsData={uploadedShots}
          scorecardsData={uploadedScorecards}
          clubsData={uploadedClubs}
          clubTypesData={uploadedClubTypes}
          dateRange={dateRange as any}
        />
      )}

      {activeTab === "gir" && (
        <GirPerRound
          uploaded={uploaded as any}
          scorecardsData={
            uploadedScorecards
              ? ({ data: uploadedScorecards.data } as any)
              : undefined
          }
          dateRange={dateRange as any}
        />
      )}

      <div className="mt-6 text-gray-600">
        <small>Upload your DI-GOLF folder above to populate charts.</small>
      </div>
      <RawJsonViewer files={uploaded} />
    </div>
  );
}
