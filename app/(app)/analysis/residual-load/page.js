"use client";

import React, { useState, useEffect } from "react";
import { ThemeToggle } from "../../../theme-toggle";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const MARKETS = [
  { code: "DE", name: "Germany", zone: "DE-LU", color: "#F2B84B" },
  { code: "FR", name: "France", zone: "FR", color: "#3FA796" },
  { code: "IT", name: "Italy", zone: "IT-North", color: "#8B6FC9" },
  { code: "ES", name: "Spain", zone: "ES", color: "#4A94C4" },
];
const WIND_PV = ["Solar", "Wind Onshore", "Wind Offshore"];
const OTHER_RENEWABLES = ["Hydro Run-of-river", "Hydro Water Reservoir", "Hydro Pumped Storage", "Biomass", "Geothermal", "Other renewable", "Marine"];

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}
function fmtFullDateTime(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} ${time}`;
}
function deriveLiveSeries(loadPoints, genPoints) {
  return (loadPoints || []).map((lp) => {
    const gen = (genPoints || []).find((g) => g.timestamp === lp.timestamp) || {};
    const windPv = WIND_PV.reduce((s, f) => s + (gen[f] || 0), 0);
    const otherRenew = OTHER_RENEWABLES.reduce((s, f) => s + (gen[f] || 0), 0);
    return { timestamp: lp.timestamp, consumption: lp.load_mw, windPv, otherRenew, residualLoad: lp.load_mw - windPv - otherRenew };
  });
}
function seriesStats(series, key) {
  const vals = series.map((s) => s[key]).filter((v) => v !== undefined && v !== null);
  if (!vals.length) return { avg: 0, min: 0, max: 0 };
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, min: Math.min(...vals), max: Math.max(...vals) };
}

function StatCard({ label, color, stats, current, isLive }) {
  return (
    <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 inline-block rounded-full" style={{ background: color }} />
        <span className="text-[11px] tracking-[0.1em] text-[var(--mp-text-4)] font-mono uppercase">{label}</span>
      </div>
      {isLive && current ? (
        <>
          <div className="text-xl font-mono font-semibold text-[var(--mp-text-1)]">
            {(current.value / 1000).toFixed(2)} <span className="text-xs text-[var(--mp-text-5)]">GW</span>
          </div>
          <div className="text-[10px] text-[var(--mp-text-6)] font-mono mt-0.5">now &middot; {current.time}</div>
        </>
      ) : (
        <div className="text-xl font-mono font-semibold text-[var(--mp-text-1)]">
          {(stats.avg / 1000).toFixed(2)} <span className="text-xs text-[var(--mp-text-5)]">GW avg</span>
        </div>
      )}
      <div className="flex gap-4 mt-1 text-[10px] font-mono text-[var(--mp-text-5)]">
        <span>L {(stats.min / 1000).toFixed(1)}</span>
        <span>H {(stats.max / 1000).toFixed(1)}</span>
      </div>
    </div>
  );
}

export default function ResidualLoadAnalysisPage() {
  const [activeMarket, setActiveMarket] = useState("DE");
  const [viewDate, setViewDate] = useState(null);
  const [liveByMarket, setLiveByMarket] = useState({});
  const [histData, setHistData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isLive = !viewDate;
  const market = MARKETS.find((m) => m.code === activeMarket);

  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`/api/entsoe?country=${activeMarket}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        if (!cancelled) setLiveByMarket((prev) => ({ ...prev, [activeMarket]: json }));
      } catch (e) { if (!cancelled) setError(String(e.message || e)); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    const interval = setInterval(load, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeMarket, isLive]);

  useEffect(() => {
    if (isLive) return;
    let cancelled = false;
    setLoading(true); setError(null);
    const params = new URLSearchParams({ country: activeMarket, from: viewDate, to: viewDate });
    fetch(`/api/analysis?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => { if (cancelled) return; if (json.error) setError(json.error); else setHistData(json); })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [activeMarket, viewDate, isLive]);

  const series = isLive
    ? (liveByMarket[activeMarket] ? deriveLiveSeries(liveByMarket[activeMarket].load, liveByMarket[activeMarket].generation) : [])
    : (histData?.series || []);

  const chartData = series.map((s) => ({
    time: fmtTime(s.timestamp), fullTime: fmtFullDateTime(s.timestamp), consumption: s.consumption, windPv: s.windPv, otherRenew: s.otherRenew, residualLoad: s.residualLoad,
  }));

  const cStats = seriesStats(series, "consumption");
  const wStats = seriesStats(series, "windPv");
  const oStats = seriesStats(series, "otherRenew");
  const rStats = seriesStats(series, "residualLoad");
  const renewShareOfLoad = cStats.avg > 0 ? ((wStats.avg + oStats.avg) / cStats.avg) * 100 : 0;

  // Spec: les cartes affichent, si possible, la valeur du quart d'heure
  // actuel plutôt que la moyenne de la plage. Uniquement pertinent en mode
  // live (pas de "maintenant" pour un jour historique consulté) — dernier
  // point de la série, qui correspond au quart d'heure le plus récent
  // disponible (repli automatique si celui en cours n'est pas encore publié).
  const currentPoint = isLive && series.length ? series[series.length - 1] : null;
  const currentFor = (key) => (currentPoint ? { value: currentPoint[key], time: fmtTime(currentPoint.timestamp) } : null);

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">Residual Load Analysis</h1>
          <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Consumption vs. renewables vs. residual load</p>
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Consumption" color={market.color} stats={cStats} current={currentFor("consumption")} isLive={isLive} />
          <StatCard label="Wind + PV" color="#3FA796" stats={wStats} current={currentFor("windPv")} isLive={isLive} />
          <StatCard label="Other Renewables" color="#8B6FC9" stats={oStats} current={currentFor("otherRenew")} isLive={isLive} />
          <StatCard label="Residual Load" color="#C4622D" stats={rStats} current={currentFor("residualLoad")} isLive={isLive} />
        </div>

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Load vs. Wind+PV vs. Residual Load</h3>
            <p className="text-xs text-[var(--mp-text-6)]">{market.name} &middot; renewables cover {renewShareOfLoad.toFixed(1)}% of avg load &middot; source: ENTSO-E</p>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 10))} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} labelFormatter={(_, payload) => (payload && payload[0] ? payload[0].payload.fullTime : "")} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                <Line type="monotone" dataKey="consumption" name="Consumption" stroke={market.color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="windPv" name="Wind+PV" stroke="#3FA796" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="residualLoad" name="Residual Load" stroke="#C4622D" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-12">{loading ? "Loading..." : "No data for this selection."}</div>}
        </div>

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase mb-1">Other Renewables (Hydro, Biomass, Geothermal...)</h3>
          <p className="text-xs text-[var(--mp-text-6)] mb-4">source: ENTSO-E</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs><linearGradient id="otherGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8B6FC9" stopOpacity={0.3} /><stop offset="95%" stopColor="#8B6FC9" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 8))} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} labelFormatter={(_, payload) => (payload && payload[0] ? payload[0].payload.fullTime : "")} />
                <Area type="monotone" dataKey="otherRenew" stroke="#8B6FC9" strokeWidth={1.5} fill="url(#otherGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">No data.</div>}
        </div>
      </main>
    </div>
  );
}
