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
import { PuttingChart } from "./components/PuttingChart";
import { Par3Placeholder } from "./components/Par3Placeholder";

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
  const [activeTab, setActiveTab] = React.useState<TabKey>("putting");

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

  return (
    <div
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: 24,
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Golf Analytics</h1>
      <p style={{ color: "#555", marginTop: 0 }}>Prototype analytics</p>

      <div style={{ margin: "8px 0 16px" }}>
        <FolderUpload
          onLoaded={(files) => {
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
          }}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div
          style={{
            margin: "8px 0 12px",
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Units</div>
          <div
            style={{
              display: "inline-flex",
              border: "1px solid #e5e7eb",
              borderRadius: 9999,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setUnits("meters")}
              style={{
                padding: "6px 12px",
                border: "none",
                background: units === "meters" ? "#233faa" : "#fff",
                color: units === "meters" ? "#fff" : "#333",
                cursor: "pointer",
              }}
            >
              Meters
            </button>
            <button
              onClick={() => setUnits("yards")}
              style={{
                padding: "6px 12px",
                border: "none",
                background: units === "yards" ? "#233faa" : "#fff",
                color: units === "yards" ? "#fff" : "#333",
                cursor: "pointer",
                borderLeft: "1px solid #e5e7eb",
              }}
            >
              Yards
            </button>
          </div>
        </div>

        {allDates.length > 0 && (
          <div
            style={{
              margin: "8px 0 12px",
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            {/* Slider styles scoped to this block */}
            <style
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                __html: `
              .dual-range{position:relative;height:36px}
              .dual-range input[type=range]{-webkit-appearance:none;appearance:none;position:absolute;left:0;top:0;width:100%;height:36px;background:transparent;margin:0;pointer-events:none}
              .dual-range input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid #233faa;box-shadow:0 1px 2px rgba(0,0,0,.2);pointer-events:auto}
              .dual-range input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid #233faa;box-shadow:0 1px 2px rgba(0,0,0,.2);pointer-events:auto}
              .dual-range .track{position:absolute;top:50%;left:0;right:0;height:4px;background:#e5e7eb;border-radius:2px;transform:translateY(-50%)}
              .dual-range .fill{position:absolute;top:50%;height:4px;background:#233faa;border-radius:2px;transform:translateY(-50%)}
            `,
              }}
            />
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Date Range</div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
                color: "#111",
                fontSize: 18,
              }}
            >
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
                          100 - (dateIdxRange[1] / (allDates.length - 1)) * 100
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
                onChange={(e) =>
                  setDateIdxRange([
                    dateIdxRange[0],
                    Math.max(Number(e.target.value), dateIdxRange[0]),
                  ])
                }
              />
            </div>
          </div>
        )}
      </div>

      <Tabs active={activeTab} onChange={setActiveTab} />

      {activeTab === "putting" &&
        (uploadedScorecards && filteredRounds.length > 0 ? (
          <>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                margin: "12px 0 16px",
              }}
            >
              <label htmlFor="round-length" style={{ color: "#333" }}>
                Round length:
              </label>
              <select
                id="round-length"
                value={roundLength}
                onChange={(e) =>
                  setRoundLength(e.target.value as "all" | "9" | "18")
                }
                style={{ padding: "6px 8px" }}
              >
                <option value="all">All</option>
                <option value="9">9 holes</option>
                <option value="18">18 holes</option>
              </select>
              <span style={{ color: "#777", fontSize: 12 }}>
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
          <div style={{ color: "#666" }}>
            Upload your DI-GOLF folder (scorecards) to view putting chart.
          </div>
        ))}

      {activeTab === "clubs" && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ margin: "8px 0 12px", fontSize: 18 }}>Uploaded data</h2>
          {!uploadedClubs || !uploadedShots || !uploadedClubTypes ? (
            <div style={{ color: "#666" }}>
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

      <div style={{ marginTop: 24, color: "#666" }}>
        <small>Upload your DI-GOLF folder above to populate charts.</small>
      </div>
      <RawJsonViewer files={uploaded} />
    </div>
  );
}
