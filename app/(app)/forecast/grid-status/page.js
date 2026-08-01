"use client";

import React, { useState, useEffect } from "react";
import { ThemeToggle } from "../../../theme-toggle";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";

const MARKETS = [
  { code: "DE", name: "Germany", color: "#F2B84B" },
  { code: "FR", name: "France", color: "#3FA796" },
  { code: "IT", name: "Italy", color: "#8B6FC9" },
  { code: "ES", name: "Spain", color: "#4A94C4" },
];

function fmtDateTime(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} ${time}`;
}

export default function GridStatusForecastPage() {
  const [country, setCountry] = useState("DE");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/grid-status-forecast?country=${country}`)
      .then((r) => r.json())
      .then((json) => { if (cancelled) return; if (json.error) setError(json.error); else setData(json); })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [country]);

  const market = MARKETS.find((m) => m.code === country);
  const chartData = (data?.points || []).map((p) => ({
    time: fmtDateTime(p.timestamp),
    residual: p.residual_load_forecast_mw,
    load: p.load_forecast_mw,
    renew: p.renewable_forecast_mw,
  }));
  const bands = data?.bands;

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">Grid Status Forecast</h1>
          <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Forecasted residual load (proxy for system stress) &middot; derived from ENTSO-E day-ahead forecasts</p>
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
          ⚠ This is a house-built proxy, not an official forecast. Neither ENTSO-E nor netztransparenz.de publish a forward-looking grid stress signal —
          the netztransparenz.de Traffic Light (see Grid Real Time) is observed, not predicted. Residual load = Load forecast − (Solar + Wind Onshore + Wind Offshore) forecast.
          A high forecasted residual load suggests more dispatchable capacity will be needed, which correlates with — but does not equal — system stress.
        </div>

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">{market.name} — Forecasted Residual Load</h3>
            {bands && (
              <div className="flex gap-4 text-right font-mono">
                <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">P25</div><div className="text-sm text-[var(--mp-text-2)]">{(bands.p25 / 1000).toFixed(1)}GW</div></div>
                <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">P50</div><div className="text-sm text-[var(--mp-text-2)]">{(bands.p50 / 1000).toFixed(1)}GW</div></div>
                <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">P75</div><div className="text-sm text-amber-400">{(bands.p75 / 1000).toFixed(1)}GW</div></div>
                <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">P90</div><div className="text-sm text-red-400">{(bands.p90 / 1000).toFixed(1)}GW</div></div>
              </div>
            )}
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                {bands && <ReferenceLine y={bands.p75} stroke="#E8C468" strokeDasharray="3 3" label={{ value: "P75", fill: "var(--mp-text-6)", fontSize: 9 }} />}
                {bands && <ReferenceLine y={bands.p90} stroke="#C4622D" strokeDasharray="3 3" label={{ value: "P90", fill: "var(--mp-text-6)", fontSize: 9 }} />}
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 10))} angle={-35} textAnchor="end" height={40} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={55} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                <Line type="monotone" dataKey="load" name="Load forecast" stroke={market.color} strokeWidth={1} dot={false} isAnimationActive={false} strokeOpacity={0.5} />
                <Line type="monotone" dataKey="residual" name="Residual load forecast" stroke="#C4622D" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-12">{loading ? "Loading..." : "No forecast data available yet for this period."}</div>}
        </div>
      </main>
    </div>
  );
}
