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

function fmtDateTime(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} ${time}`;
}
function isoDaysAgo(n) {
  const now = new Date();
  const berlinDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = berlinDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

export default function ConsumptionForecastPage() {
  const [country, setCountry] = useState("DE");
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ country, from, to });
    fetch(`/api/consumption-forecast?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => { if (cancelled) return; if (json.error) setError(json.error); else setData(json); })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [country, from, to]);

  const market = MARKETS.find((m) => m.code === country);
  const chartData = (data?.points || []).map((p) => ({ time: fmtDateTime(p.timestamp), forecast: p.forecast, actual: p.actual }));
  const acc = data?.accuracy;

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">Consumption Forecast</h1>
          <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Day-ahead load forecast vs. actual &middot; source: ENTSO-E (A65/A01)</p>
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

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">{market.name} — Forecast vs. Actual</h3>
            {acc && (
              <div className="flex gap-4 text-right font-mono">
                <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">MAPE</div><div className="text-sm text-[var(--mp-text-2)]">{acc.mape_pct.toFixed(1)}%</div></div>
                <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">MAE</div><div className="text-sm text-[var(--mp-text-2)]">{(acc.mae_mw / 1000).toFixed(2)}GW</div></div>
                <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Points</div><div className="text-sm text-[var(--mp-text-2)]">{acc.n_points}</div></div>
              </div>
            )}
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 10))} angle={-35} textAnchor="end" height={40} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={55} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => v == null ? "—" : `${(v / 1000).toFixed(2)} GW`} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                <Line type="monotone" dataKey="forecast" name="Forecast (day-ahead)" stroke="#8B6FC9" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="actual" name="Actual" stroke={market.color} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-12">{loading ? "Loading..." : "No data for this selection."}</div>}
        </div>

        <p className="text-[10px] text-[var(--mp-text-6)] font-mono">
          Forecast = ENTSO-E day-ahead total load forecast (published the day before delivery). Actual = realised total load, same source.
        </p>
      </main>
    </div>
  );
}
