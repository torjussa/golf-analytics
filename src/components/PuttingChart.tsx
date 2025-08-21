import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export type PuttingDatum = {
  date: string;
  putts: number;
  id: number;
  holesCount?: number;
  excludeFromStats?: boolean;
};

function formatDateLabel(dateString: string): string {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" }).toLowerCase();
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export function PuttingChart(props: {
  data: PuttingDatum[];
  holeBuckets?: { one: number; two: number; three: number; fourPlus: number };
  showAvgPerRound?: boolean;
}) {
  const stats = React.useMemo(() => {
    const rounds = props.data.length;
    const sumPutts = props.data.reduce((s, d) => s + d.putts, 0);
    const holes = props.data.reduce((s, d) => s + (d.holesCount || 0), 0);
    const avgPerRound = rounds ? sumPutts / rounds : 0;
    const avgPerHole = holes ? sumPutts / holes : 0;
    const buckets = props.holeBuckets || {
      one: 0,
      two: 0,
      three: 0,
      fourPlus: 0,
    };
    return { rounds, sumPutts, holes, avgPerRound, avgPerHole, buckets };
  }, [props.data, props.holeBuckets]);

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 16 }}>
          {props.showAvgPerRound ? (
            <div>
              <div style={{ fontSize: 12, color: "#666" }}>Avg putts/round</div>
              <div style={{ fontWeight: 700 }}>
                {stats.avgPerRound.toFixed(2)}
              </div>
            </div>
          ) : null}
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>Avg putts/hole</div>
            <div style={{ fontWeight: 700 }}>{stats.avgPerHole.toFixed(3)}</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Simple donut */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <svg width="120" height="120" viewBox="0 0 36 36">
            {(() => {
              const total =
                stats.buckets.one +
                  stats.buckets.two +
                  stats.buckets.three +
                  stats.buckets.fourPlus || 1;
              const parts = [
                { v: stats.buckets.one, c: "#1f77b4", label: "1" },
                { v: stats.buckets.two, c: "#2ca02c", label: "2" },
                { v: stats.buckets.three, c: "#ff7f0e", label: "3" },
                { v: stats.buckets.fourPlus, c: "#d62728", label: "4+" },
              ];
              let offset = 0;
              return (
                <g>
                  <circle cx="18" cy="18" r="16" fill="#fff" />
                  {parts.map((p, idx) => {
                    const frac = p.v / total;
                    const dash = 2 * Math.PI * 16 * frac;
                    const gap = 2 * Math.PI * 16 - dash;
                    const el = (
                      <circle
                        key={idx}
                        cx="18"
                        cy="18"
                        r="16"
                        fill="transparent"
                        stroke={p.c}
                        strokeWidth="4"
                        strokeDasharray={`${dash} ${gap}`}
                        strokeDashoffset={-offset}
                      />
                    );
                    offset += dash;
                    return el;
                  })}
                  <circle cx="18" cy="18" r="10" fill="#fff" />
                </g>
              );
            })()}
          </svg>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto auto",
              columnGap: 8,
              rowGap: 4,
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: "#1f77b4",
                  borderRadius: 2,
                }}
              />{" "}
              1 putt
            </div>
            <div>{stats.buckets.one}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: "#2ca02c",
                  borderRadius: 2,
                }}
              />{" "}
              2 putts
            </div>
            <div>{stats.buckets.two}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: "#ff7f0e",
                  borderRadius: 2,
                }}
              />{" "}
              3 putts
            </div>
            <div>{stats.buckets.three}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  background: "#d62728",
                  borderRadius: 2,
                }}
              />{" "}
              4+ putts
            </div>
            <div>{stats.buckets.fourPlus}</div>
          </div>
        </div>
      </div>
      <div style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={props.data.map((d) => ({
              date: d.date,
              holes: d.holesCount || 0,
              putts: d.putts,
              avg:
                d.holesCount && d.holesCount > 0 ? d.putts / d.holesCount : 0,
            }))}
            margin={{ top: 16, right: 24, left: 8, bottom: 32 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              angle={-25}
              textAnchor="end"
              height={60}
              tick={{ fontSize: 12 }}
              tickFormatter={(v: string) => formatDateLabel(v)}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              label={{
                value: "Putts per hole",
                angle: -90,
                position: "insideLeft",
              }}
            />
            <Tooltip
              content={(tp: any) => {
                const p = tp?.payload && tp.payload[0]?.payload;
                if (!p) return null;
                return (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      padding: "8px 10px",
                      borderRadius: 6,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {formatDateLabel(p.date)}
                    </div>
                    <div>
                      Avg putts/hole:{" "}
                      {typeof p.avg === "number" ? p.avg.toFixed(2) : "-"}
                    </div>
                    <div>Holes played: {p.holes}</div>
                    <div>Total putts: {p.putts}</div>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="#0088FE"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
