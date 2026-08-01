"use client";

import React, { useState, useEffect } from "react";
import { ThemeToggle } from "../../../theme-toggle";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const MARKETS = [
  { code: "DE", name: "Germany", color: "#F2B84B" },
  { code: "FR", name: "France", color: "#3FA796" },
  { code: "IT", name: "Italy", color: "#8B6FC9" },
  { code: "ES", name: "Spain", color: "#4A94C4" },
];
const NEIGHBOR_COLORS = {
  DE: "#F2B84B", FR: "#3FA796", IT: "#8B6FC9", ES: "#4A94C4",
  AT: "#C4622D", CH: "#E85C5C", NL: "#5FA88F", BE: "#B8860B",
  DK1: "#7A9B4E", DK2: "#4E7A9B", CZ: "#9B7A4E", PL: "#A05C9B",
  SI: "#5C9BA0", PT: "#D4A24C", GB: "#8899AA",
};
function fmtDateTime(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} ${time}`;
}

export default function CrossBorderForecastPage() {
  const [country, setCountry] = useState("DE");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/cross-border-forecast?country=${country}`)
      .then((r) => r.json())
      .then((json) => { if (cancelled) return; if (json.error) setError(json.error); else setData(json); })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [country]);

  const availableBorders = data ? Object.keys(data.ntc) : [];
  const chartData = (() => {
    if (!data?.ntc) return [];
    const byTs = new Map();
    for (const [neighbor, dirs] of Object.entries(data.ntc)) {
      dirs.export.forEach((p) => {
        const row = byTs.get(p.timestamp) || { time: fmtDateTime(p.timestamp), key: p.timestamp };
        row[`${neighbor}_export`] = p.ntc_mw;
        byTs.set(p.timestamp, row);
      });
      dirs.import.forEach((p) => {
        const row = byTs.get(p.timestamp) || { time: fmtDateTime(p.timestamp), key: p.timestamp };
        row[`${neighbor}_import`] = p.ntc_mw;
        byTs.set(p.timestamp, row);
      });
    }
    return [...byTs.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  })();

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">Cross Border Forecast</h1>
          <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Forecasted net transfer capacity (NTC) by border &middot; source: ENTSO-E (A61)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {MARKETS.map((m) => (
              <button key={m.code} onClick={() => setCountry(m.code)}
                className={`px-2 py-1 text-xs font-mono border ${country === m.code ? "border-amber-400 text-amber-400" : "border-[var(--mp-border)] text-[var(--mp-text-5)] hover:text-[var(--mp-text-3)]"}`}>
                {m.code}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="p-6 space-y-5">
        {error && <div className="border border-red-500/40 text-red-400 text-xs font-mono px-4 py-3">{error}</div>}

        <div className="border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs font-mono text-amber-200">
          ⚠ NTC ≠ scheduled/physical flow — it&apos;s the maximum tradeable capacity, published day-ahead. Coverage is partial: most EU-internal
          borders now use flow-based capacity calculation (Core CCR) and no longer publish classic NTC. {data?.unavailable?.length > 0 && (
            <>No NTC data for: {data.unavailable.join(", ")} (likely flow-based).</>
          )}
        </div>

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase mb-4">Forecasted NTC (next 48h)</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} angle={-35} textAnchor="end" height={40} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={55} tickFormatter={(v) => `${(v / 1000).toFixed(1)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                {availableBorders.map((n) => (
                  <React.Fragment key={n}>
                    <Line type="stepAfter" dataKey={`${n}_export`} name={`${country}→${n} (export cap.)`} stroke={NEIGHBOR_COLORS[n] || "#888"} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                    <Line type="stepAfter" dataKey={`${n}_import`} name={`${n}→${country} (import cap.)`} stroke={NEIGHBOR_COLORS[n] || "#888"} strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
                  </React.Fragment>
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-12">{loading ? "Loading..." : "No NTC forecast available for this market's borders."}</div>}
        </div>
      </main>
    </div>
  );
}
