"use client";

import React, { useState, useEffect } from "react";
import { ThemeToggle } from "../../../theme-toggle";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const MARKETS = [
  { code: "DE", name: "Germany", zone: "DE-LU", color: "#F2B84B" },
  { code: "FR", name: "France", zone: "FR", color: "#3FA796" },
  { code: "IT", name: "Italy", zone: "IT-North", color: "#8B6FC9" },
  { code: "ES", name: "Spain", zone: "ES", color: "#4A94C4" },
];
const NEIGHBOR_COLORS = {
  DE: "#F2B84B", FR: "#3FA796", IT: "#8B6FC9", ES: "#4A94C4",
  AT: "#C4622D", CH: "#E85C5C", NL: "#5FA88F", BE: "#B8860B",
  DK1: "#7A9B4E", DK2: "#4E7A9B", CZ: "#9B7A4E", PL: "#A05C9B",
  SI: "#5C9BA0", PT: "#D4A24C",
};
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}
function fmtFullDateTime(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} ${time}`;
}

export default function CrossBorderAnalysisPage() {
  const [activeMarket, setActiveMarket] = useState("DE");
  const [viewDate, setViewDate] = useState(null);
  const [flowsData, setFlowsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isLive = !viewDate;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ country: activeMarket });
    if (!isLive) { params.set("from", viewDate); params.set("to", viewDate); }
    fetch(`/api/flows?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) { if (json.error) setError(json.error); else setFlowsData(json); } })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [activeMarket, viewDate, isLive]);

  const neighbors = flowsData?.neighbors || [];
  const flowsChartData = (() => {
    if (!flowsData?.flows) return [];
    const byTs = new Map();
    for (const n of neighbors) {
      (flowsData.flows[n] || []).forEach((p) => {
        const row = byTs.get(p.timestamp) || { key: p.timestamp, time: fmtTime(p.timestamp), fullTime: fmtFullDateTime(p.timestamp) };
        row[n] = p.net_mw;
        byTs.set(p.timestamp, row);
      });
    }
    const rows = [...byTs.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    rows.forEach((row) => { row.total = neighbors.reduce((sum, n) => sum + (row[n] ?? 0), 0); });
    return rows;
  })();
  const totalNetAvg = flowsChartData.length ? flowsChartData.reduce((s, r) => s + r.total, 0) / flowsChartData.length : 0;

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">Cross Border Analysis</h1>
          <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Physical net exchange with neighboring bidding zones &middot; source: ENTSO-E</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {MARKETS.map((m) => (
              <button key={m.code} onClick={() => setActiveMarket(m.code)}
                className={`px-2 py-1 text-xs font-mono border ${activeMarket === m.code ? "border-amber-400 text-amber-400" : "border-[var(--mp-border)] text-[var(--mp-text-5)] hover:text-[var(--mp-text-3)]"}`}>
                {m.code}
              </button>
            ))}
          </div>
          <input type="date" value={viewDate || ""} onChange={(e) => setViewDate(e.target.value || null)}
            className="bg-[var(--mp-bg-deep)] border border-[var(--mp-border)] text-[var(--mp-text-3)] px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400" />
          {!isLive && <button onClick={() => setViewDate(null)} className="px-2 py-1 text-xs font-mono border border-[var(--mp-border)] text-[var(--mp-text-5)] hover:border-amber-400 hover:text-amber-400">● Live</button>}
          <ThemeToggle />
        </div>
      </header>

      <main className="p-6 space-y-5">
        {error && <div className="border border-red-500/40 text-red-400 text-xs font-mono px-4 py-3">{error}</div>}

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Net Physical Flows</h3>
            <div className="text-right font-mono">
              <div className="text-[10px] text-[var(--mp-text-6)] uppercase">Total net position (avg)</div>
              <div className="text-lg font-semibold" style={{ color: totalNetAvg >= 0 ? "#3FA796" : "#C4622D" }}>
                {totalNetAvg >= 0 ? "+" : ""}{(totalNetAvg / 1000).toFixed(2)}GW
                <span className="text-xs text-[var(--mp-text-6)] font-normal ml-1">{totalNetAvg >= 0 ? "net exporter" : "net importer"}</span>
              </div>
            </div>
          </div>
          {flowsChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={flowsChartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(flowsChartData.length / 10))} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={55} tickFormatter={(v) => `${(v / 1000).toFixed(1)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} labelFormatter={(_, payload) => (payload && payload[0] ? payload[0].payload.fullTime : "")} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                {neighbors.map((n) => (
                  <Line key={n} type="monotone" dataKey={n} stroke={NEIGHBOR_COLORS[n] || "#888"} strokeWidth={1.2} dot={false} isAnimationActive={false} />
                ))}
                <Line type="monotone" dataKey="total" name="Total net" stroke="#E8C468" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-12">{loading ? "Loading..." : "No data for this selection."}</div>}
        </div>
      </main>
    </div>
  );
}
