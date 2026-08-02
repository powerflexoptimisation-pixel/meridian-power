"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ThemeToggle } from "../../../../theme-toggle";
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";

const MARKETS = [
  { code: "DE", name: "Germany", color: "#F2B84B" },
  { code: "FR", name: "France", color: "#3FA796" },
  { code: "IT", name: "Italy", color: "#8B6FC9" },
  { code: "ES", name: "Spain", color: "#4A94C4" },
];
const FUELS = [
  { key: "Solar", color: "#E8C468" },
  { key: "Wind Onshore", color: "#3FA796" },
  { key: "Wind Offshore", color: "#4A94C4" },
];

function berlinDayKey(ts) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
}
function isoDaysAgo(n) {
  const now = new Date();
  const berlinDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = berlinDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

// Agrège les points 15-min en jours calendaires (heure de Berlin): MAPE,
// MAE, biais moyen (forecast - actual, signé — révèle une sur/sous-
// estimation systématique) par jour.
function dailyStats(points, fuel) {
  const byDay = new Map();
  for (const p of points) {
    const f = p[`${fuel}_forecast`];
    const a = p[`${fuel}_actual`];
    if (f == null || a == null) continue;
    const day = berlinDayKey(p.timestamp);
    const entry = byDay.get(day) || { day, errors: [], pctErrors: [], biases: [] };
    entry.errors.push(Math.abs(a - f));
    entry.biases.push(f - a);
    if (a > 50) entry.pctErrors.push(Math.abs(a - f) / a);
    byDay.set(day, entry);
  }
  return [...byDay.values()]
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((e) => ({
      day: e.day.slice(5), // MM-DD
      mae: e.errors.reduce((s, v) => s + v, 0) / e.errors.length,
      mape: e.pctErrors.length ? (e.pctErrors.reduce((s, v) => s + v, 0) / e.pctErrors.length) * 100 : null,
      bias: e.biases.reduce((s, v) => s + v, 0) / e.biases.length,
    }));
}

export default function GenerationForecastAnalysisPage() {
  const [country, setCountry] = useState("DE");
  const [fuel, setFuel] = useState("Wind Onshore");
  const [from, setFrom] = useState(isoDaysAgo(14));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ country, from, to });
    fetch(`/api/generation-forecast?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => { if (cancelled) return; if (json.error) setError(json.error); else setData(json); })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [country, from, to]);

  const market = MARKETS.find((m) => m.code === country);
  const points = data?.points || [];
  const acc = data?.accuracy?.[fuel];

  const daily = useMemo(() => dailyStats(points, fuel), [points, fuel]);

  const scatterData = useMemo(() => {
    return points
      .filter((p) => p[`${fuel}_forecast`] != null && p[`${fuel}_actual`] != null)
      .map((p) => ({ x: p[`${fuel}_forecast`], y: p[`${fuel}_actual`] }));
  }, [points, fuel]);

  const maxAxis = scatterData.length ? Math.max(...scatterData.map((d) => Math.max(d.x, d.y))) * 1.05 : 1000;

  const overallBias = daily.length ? daily.reduce((s, d) => s + d.bias, 0) / daily.length : null;

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">Generation Forecast Analysis</h1>
          <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Day-ahead wind/solar forecast accuracy over time &middot; source: ENTSO-E (A69)</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {MARKETS.map((m) => (
              <button key={m.code} onClick={() => setCountry(m.code)}
                className={`px-2 py-1 text-xs font-mono border ${country === m.code ? "border-amber-400 text-amber-400" : "border-[var(--mp-border)] text-[var(--mp-text-5)] hover:text-[var(--mp-text-3)]"}`}>
                {m.code}
              </button>
            ))}
          </div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="bg-[var(--mp-bg-deep)] border border-[var(--mp-border)] text-[var(--mp-text-3)] px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400" />
          <span className="text-[var(--mp-text-6)] text-xs">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="bg-[var(--mp-bg-deep)] border border-[var(--mp-border)] text-[var(--mp-text-3)] px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400" />
          <ThemeToggle />
        </div>
      </header>

      <main className="p-6 space-y-5">
        {error && <div className="border border-red-500/40 text-red-400 text-xs font-mono px-4 py-3">{error}</div>}

        <div className="flex gap-2">
          {FUELS.map((f) => (
            <button key={f.key} onClick={() => setFuel(f.key)}
              className={`px-3 py-1.5 text-xs font-mono border ${fuel === f.key ? "border-amber-400 text-amber-400" : "border-[var(--mp-border)] text-[var(--mp-text-5)] hover:text-[var(--mp-text-3)]"}`}>
              {f.key}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
            <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">MAPE</div>
            <div className="text-xl font-mono font-semibold text-[var(--mp-text-1)]">{acc?.mape_pct != null ? `${acc.mape_pct.toFixed(1)}%` : "—"}</div>
          </div>
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
            <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">MAE</div>
            <div className="text-xl font-mono font-semibold text-[var(--mp-text-1)]">{acc ? `${(acc.mae_mw / 1000).toFixed(2)}GW` : "—"}</div>
          </div>
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
            <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Bias (avg)</div>
            <div className={`text-xl font-mono font-semibold ${overallBias > 0 ? "text-amber-400" : "text-[var(--mp-text-1)]"}`}>
              {overallBias != null ? `${overallBias >= 0 ? "+" : ""}${(overallBias / 1000).toFixed(2)}GW` : "—"}
            </div>
            <div className="text-[9px] text-[var(--mp-text-6)] mt-0.5">{overallBias > 0 ? "over-forecasts" : overallBias < 0 ? "under-forecasts" : ""}</div>
          </div>
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
            <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Points</div>
            <div className="text-xl font-mono font-semibold text-[var(--mp-text-1)]">{acc?.n_points ?? "—"}</div>
          </div>
        </div>

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase mb-4">Daily MAPE — {fuel}</h3>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => v == null ? "N/A" : `${v.toFixed(1)}%`} />
                <Bar dataKey="mape" fill={market.color} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">{loading ? "Loading..." : "No data for this selection."}</div>}
        </div>

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase mb-4">Daily Bias — {fuel} <span className="text-[var(--mp-text-6)] normal-case font-normal">(forecast − actual, avg per day)</span></h3>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <ReferenceLine y={0} stroke="var(--mp-grid)" />
                <XAxis dataKey="day" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={55} tickFormatter={(v) => `${(v / 1000).toFixed(1)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(2)} GW`} />
                <Bar dataKey="bias" fill="#C4622D" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">No data.</div>}
        </div>

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase mb-4">Forecast vs. Actual — {fuel} <span className="text-[var(--mp-text-6)] normal-case font-normal">(closer to the diagonal = better)</span></h3>
          {scatterData.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" />
                <XAxis type="number" dataKey="x" name="Forecast" domain={[0, maxAxis]} tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} label={{ value: "Forecast", position: "insideBottom", offset: -3, fill: "var(--mp-text-6)", fontSize: 10 }} />
                <YAxis type="number" dataKey="y" name="Actual" domain={[0, maxAxis]} tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} label={{ value: "Actual", angle: -90, position: "insideLeft", fill: "var(--mp-text-6)", fontSize: 10 }} />
                <ZAxis range={[12, 12]} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} />
                <Scatter data={scatterData} fill={market.color} fillOpacity={0.35} isAnimationActive={false} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: maxAxis, y: maxAxis }]} stroke="var(--mp-text-6)" strokeDasharray="4 3" />
              </ScatterChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">No data.</div>}
        </div>
      </main>
    </div>
  );
}
