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
const FUELS = [
  { key: "Solar", color: "#E8C468" },
  { key: "Wind Onshore", color: "#3FA796" },
  { key: "Wind Offshore", color: "#4A94C4" },
];

function fmtDateTime(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} ${time}`;
}

function yesterdayISO() {
  const now = new Date();
  const berlinDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = berlinDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
}
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default function GenerationForecastPage() {
  const [country, setCountry] = useState("DE");
  const [from, setFrom] = useState(yesterdayISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFuel, setActiveFuel] = useState("Wind Onshore");

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
  const chartData = (data?.points || []).map((p) => ({
    time: fmtDateTime(p.timestamp),
    forecast: p[`${activeFuel}_forecast`],
    actual: p[`${activeFuel}_actual`],
  }));
  const acc = data?.accuracy?.[activeFuel];

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">Generation Forecast</h1>
          <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Day-ahead wind/solar forecast vs. actual &middot; source: ENTSO-E (A69)</p>
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
            <button key={f.key} onClick={() => setActiveFuel(f.key)}
              className={`px-3 py-1.5 text-xs font-mono border ${activeFuel === f.key ? "border-amber-400 text-amber-400" : "border-[var(--mp-border)] text-[var(--mp-text-5)] hover:text-[var(--mp-text-3)]"}`}>
              {f.key}
            </button>
          ))}
        </div>

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">{activeFuel} — Forecast vs. Actual</h3>
            {acc && (
              <div className="flex gap-4 text-right font-mono">
                <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">MAPE</div><div className="text-sm text-[var(--mp-text-2)]">{acc.mape_pct != null ? `${acc.mape_pct.toFixed(1)}%` : "—"}</div></div>
                <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">MAE</div><div className="text-sm text-[var(--mp-text-2)]">{(acc.mae_mw / 1000).toFixed(2)}GW</div></div>
                <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Points</div><div className="text-sm text-[var(--mp-text-2)]">{acc.n_points}</div></div>
              </div>
            )}
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 10))} angle={-35} textAnchor="end" height={40} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={55} tickFormatter={(v) => `${(v / 1000).toFixed(1)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => v == null ? "—" : `${(v / 1000).toFixed(2)} GW`} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                <Line type="monotone" dataKey="forecast" name="Forecast (day-ahead)" stroke="#8B6FC9" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="actual" name="Actual" stroke={market.color} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-12">{loading ? "Loading..." : "No data for this selection. Forecasts are collected daily going forward — history will build up over time."}</div>}
        </div>

        <p className="text-[10px] text-[var(--mp-text-6)] font-mono">
          Forecast = ENTSO-E day-ahead wind/solar forecast (published ~18h CET the day before delivery). Actual = realised generation, same source.
          MAPE excludes points where actual output &lt; 50 MW (avoids inflated errors near zero, e.g. solar at night).
        </p>
      </main>
    </div>
  );
}
