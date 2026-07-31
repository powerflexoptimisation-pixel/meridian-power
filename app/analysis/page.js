"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { berlinYesterdayISO } from "./date-helper";

const MARKETS = [
  { code: "DE", name: "Germany", zone: "DE-LU", color: "#F2B84B" },
  { code: "FR", name: "France", zone: "FR", color: "#3FA796" },
  { code: "IT", name: "Italy", zone: "IT-North", color: "#8B6FC9" },
  { code: "ES", name: "Spain", zone: "ES", color: "#4A94C4" },
];

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

function seriesStats(series, key) {
  const vals = series.map((r) => r[key]).filter((v) => v !== undefined && v !== null);
  if (vals.length === 0) return { avg: 0, min: 0, max: 0 };
  return {
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    min: Math.min(...vals),
    max: Math.max(...vals),
  };
}

function StatCard({ label, unit, color, stats }) {
  return (
    <div className="border border-[#2a2b28] bg-[#151614] px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 inline-block rounded-full" style={{ background: color }} />
        <span className="text-[11px] tracking-[0.1em] text-stone-400 font-mono uppercase">{label}</span>
      </div>
      <div className="text-xl font-mono font-semibold text-stone-100">
        {(stats.avg / 1000).toFixed(2)} <span className="text-xs text-stone-500">GW avg</span>
      </div>
      <div className="flex gap-4 mt-1 text-[10px] font-mono text-stone-500">
        <span>L {(stats.min / 1000).toFixed(1)}</span>
        <span>H {(stats.max / 1000).toFixed(1)}</span>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const [activeMarket, setActiveMarket] = useState("DE");
  const [fromDate, setFromDate] = useState(() => berlinYesterdayISO());
  const [toDate, setToDate] = useState(() => berlinYesterdayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ country: activeMarket, from: fromDate, to: toDate });
    fetch(`/api/analysis?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [activeMarket, fromDate, toDate]);

  const market = MARKETS.find((m) => m.code === activeMarket);
  const series = data?.series || [];

  const chartData = useMemo(
    () => series.map((r) => ({ time: fmtTime(r.timestamp), consumption: r.consumption, windPv: r.windPv, otherRenew: r.otherRenew, residualLoad: r.residualLoad })),
    [series]
  );

  const cStats = seriesStats(series, "consumption");
  const wStats = seriesStats(series, "windPv");
  const oStats = seriesStats(series, "otherRenew");
  const rStats = seriesStats(series, "residualLoad");
  const renewShareOfLoad = cStats.avg > 0 ? ((wStats.avg + oStats.avg) / cStats.avg) * 100 : 0;

  function setQuickDay(offsetDays) {
    const d = new Date(berlinYesterdayISO() + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - offsetDays);
    const iso = d.toISOString().slice(0, 10);
    setFromDate(iso);
    setToDate(iso);
  }

  return (
    <div className="min-h-screen bg-[#101110] text-stone-200" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[#2a2b28] px-6 py-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-stone-100">Meridian Power</h1>
          <span className="text-[11px] font-mono text-stone-600 tracking-[0.15em] uppercase">Load &amp; Renewables Analysis</span>
          <nav className="flex items-center gap-1 ml-4">
            <Link href="/" className="px-2 py-1 text-xs font-mono border border-[#2a2b28] text-stone-500 hover:border-[#3a3b38] hover:text-stone-300">Home</Link>
            <span className="px-2 py-1 text-xs font-mono border border-amber-400 text-amber-400">Analysis</span>
          </nav>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-stone-500">
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${loading ? "bg-amber-400 animate-pulse" : "bg-teal-400"}`} />
          {loading ? "Loading..." : "Source: ENTSO-E Transparency Platform"}
        </div>
      </header>

      <div className="px-6 py-4 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-stone-600 uppercase tracking-wide font-mono mr-1">Market:</span>
        {MARKETS.map((m) => {
          const isOn = m.code === activeMarket;
          return (
            <button
              key={m.code}
              onClick={() => setActiveMarket(m.code)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono border transition-colors"
              style={{ borderColor: isOn ? m.color : "#2a2b28", color: isOn ? m.color : "#6b6b68", background: isOn ? `${m.color}14` : "transparent" }}
            >
              <span className="w-2 h-2 inline-block rounded-full" style={{ background: isOn ? m.color : "#3a3b38" }} />
              {m.zone}
            </button>
          );
        })}

        <div className="flex gap-1 ml-2">
          <button onClick={() => setQuickDay(0)} className="px-3 py-1 text-xs font-mono border border-[#2a2b28] text-stone-500 hover:border-[#3a3b38]">Yesterday</button>
          <button onClick={() => setQuickDay(7)} className="px-3 py-1 text-xs font-mono border border-[#2a2b28] text-stone-500 hover:border-[#3a3b38]">-7d</button>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono ml-2">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-[#0f100e] border border-[#2a2b28] text-stone-300 px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400" />
          <span className="text-stone-600">→</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-[#0f100e] border border-[#2a2b28] text-stone-300 px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400" />
        </div>
      </div>

      {error && (
        <div className="mx-6 mb-4 border border-red-900 bg-red-950/40 text-red-300 text-xs font-mono px-4 py-2">{error}</div>
      )}

      <main className="px-6 pb-8 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Consumption" color="#E8C468" stats={cStats} />
          <StatCard label="Wind + PV" color="#3FA796" stats={wStats} />
          <StatCard label="Other renewables" color="#7A9B4E" stats={oStats} />
          <StatCard label="Residual load" color="#C4622D" stats={rStats} />
        </div>

        <div className="border border-[#2a2b28] bg-[#151614] p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h3 className="text-sm tracking-[0.15em] text-stone-400 font-mono uppercase">Load vs. Wind+PV vs. Residual Load</h3>
              <p className="text-xs text-stone-600 mt-0.5">{market.name} &middot; {fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`} &middot; renewables (wind+PV+other) cover {renewShareOfLoad.toFixed(1)}% of avg load</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="windPvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3FA796" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3FA796" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#2a2b28" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "#2a2b28" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 12))} />
              <YAxis tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
              <Tooltip contentStyle={{ background: "#0f100e", border: "1px solid #3a3b38", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "#8a8a86" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
              <Area type="monotone" dataKey="windPv" name="Wind + PV" stroke="#3FA796" fill="url(#windPvGrad)" strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="consumption" name="Consumption" stroke="#E8C468" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="residualLoad" name="Residual load" stroke="#C4622D" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="border border-[#2a2b28] bg-[#151614] p-5">
            <h3 className="text-sm tracking-[0.15em] text-stone-400 font-mono uppercase mb-4">Consumption</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E8C468" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#E8C468" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#2a2b28" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "#2a2b28" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 8))} />
                <YAxis tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
                <Tooltip contentStyle={{ background: "#0f100e", border: "1px solid #3a3b38", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "#8a8a86" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} />
                <Area type="monotone" dataKey="consumption" stroke="#E8C468" strokeWidth={1.5} fill="url(#loadGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="border border-[#2a2b28] bg-[#151614] p-5">
            <h3 className="text-sm tracking-[0.15em] text-stone-400 font-mono uppercase mb-4">Other Renewables (Hydro, Biomass, Geothermal...)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="otherGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7A9B4E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7A9B4E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#2a2b28" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "#2a2b28" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 8))} />
                <YAxis tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
                <Tooltip contentStyle={{ background: "#0f100e", border: "1px solid #3a3b38", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "#8a8a86" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} />
                <Area type="monotone" dataKey="otherRenew" stroke="#7A9B4E" strokeWidth={1.5} fill="url(#otherGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {!loading && !error && series.length === 0 && (
          <div className="border border-[#2a2b28] text-stone-500 text-xs font-mono px-4 py-6 text-center">
            Aucune donnée pour cette sélection. La consommation (load) est une donnée nouvellement collectée — les jours antérieurs à sa mise en place n'ont pas encore d'historique.
          </div>
        )}
      </main>

      <footer className="px-6 py-4 border-t border-[#2a2b28] text-[10px] font-mono text-stone-600">
        Residual load = Consumption − (Wind + PV). Max range: 7 days (15-min resolution).
      </footer>
    </div>
  );
}
