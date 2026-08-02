"use client";

import React, { useState, useEffect } from "react";
import { ThemeToggle } from "../../theme-toggle";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const FUELS = [
  { key: "Wind Onshore", color: "#3FA796" },
  { key: "Wind Offshore", color: "#4A94C4" },
  { key: "Solar", color: "#E8C468" },
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
function isoDaysAhead(n) {
  const now = new Date();
  const berlinDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = berlinDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export default function ForecastForTradingPage() {
  const [fuel, setFuel] = useState("Wind Onshore");
  const [from, setFrom] = useState(isoDaysAgo(2));
  const [to, setTo] = useState(isoDaysAhead(6));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    fetch(`/api/own-forecast?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => { if (cancelled) return; if (json.error) setError(json.error); else setData(json); })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [from, to]);

  const chartData = (data?.points || []).map((p) => ({
    time: fmtDateTime(p.timestamp),
    own: p[`${fuel}_own`],
    entsoe: p[`${fuel}_entsoe`],
    actual: p[`${fuel}_actual`],
  }));
  const accOwn = data?.accuracy_own?.[fuel];
  const accEntsoe = data?.accuracy_entsoe?.[fuel];
  const model = data?.models?.[fuel];
  const fuelInfo = FUELS.find((f) => f.key === fuel);

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">Forecast for Trading</h1>
          <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Germany &middot; in-house wind/solar forecast (DWD ICON-D2, refreshed every 1-3h) vs. ENTSO-E (1x/day) vs. actual</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {FUELS.map((f) => (
              <button key={f.key} onClick={() => setFuel(f.key)}
                className={`px-3 py-1.5 text-xs font-mono border ${fuel === f.key ? "border-amber-400 text-amber-400" : "border-[var(--mp-border)] text-[var(--mp-text-5)] hover:text-[var(--mp-text-3)]"}`}>
                {f.key}
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

        <div className="border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs font-mono text-amber-200">
          ⚠ Modèle V1: régression linéaire simple (courbe de puissance éolienne / irradiance) calibrée sur ~120j d'historique, météo DWD ICON-D2 (Open-Meteo, points représentatifs moyennés — pas de pondération par capacité régionale pour l'instant).
          {model && <> Calibré le {new Date(model.updated_at).toLocaleString("fr-FR", { timeZone: "Europe/Berlin" })} sur {model.n_points} points.</>}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
            <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">MAPE (maison)</div>
            <div className="text-xl font-mono font-semibold" style={{ color: fuelInfo.color }}>{accOwn?.mape_pct != null ? `${accOwn.mape_pct.toFixed(1)}%` : "—"}</div>
          </div>
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
            <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">MAPE (ENTSO-E)</div>
            <div className="text-xl font-mono font-semibold text-[var(--mp-text-1)]">{accEntsoe?.mape_pct != null ? `${accEntsoe.mape_pct.toFixed(1)}%` : "—"}</div>
          </div>
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
            <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">MAE (maison)</div>
            <div className="text-xl font-mono font-semibold" style={{ color: fuelInfo.color }}>{accOwn ? `${(accOwn.mae_mw / 1000).toFixed(2)}GW` : "—"}</div>
          </div>
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
            <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Points comparés</div>
            <div className="text-xl font-mono font-semibold text-[var(--mp-text-1)]">{accOwn?.n_points ?? "—"}</div>
          </div>
        </div>

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase mb-4">{fuel} — Maison vs. ENTSO-E vs. Réalisé</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 10))} angle={-35} textAnchor="end" height={40} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={55} tickFormatter={(v) => `${(v / 1000).toFixed(1)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => v == null ? "—" : `${(v / 1000).toFixed(2)} GW`} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                <Line type="monotone" dataKey="own" name="Maison (DWD ICON-D2)" stroke={fuelInfo.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="entsoe" name="ENTSO-E (day-ahead)" stroke="#8B6FC9" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--mp-text-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-12">{loading ? "Loading..." : "No data for this selection."}</div>}
        </div>

        <p className="text-[10px] text-[var(--mp-text-6)] font-mono">
          Maison = modèle physique calibré (courbe de puissance / irradiance), météo DWD ICON-D2 via Open-Meteo, rafraîchi toutes les 1-3h.
          ENTSO-E = prévision officielle day-ahead, publiée ~18h CET la veille. MAPE exclut les points &lt;50MW.
        </p>
      </main>
    </div>
  );
}
