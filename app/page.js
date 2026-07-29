"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const MARKETS = [
  { code: "DE", name: "Germany", zone: "DE-LU" },
  { code: "FR", name: "France", zone: "FR" },
  { code: "IT", name: "Italy", zone: "IT-North" },
  { code: "ES", name: "Spain", zone: "ES" },
];

const FUEL_COLORS = {
  "Solar": "#F2B84B", "Wind Onshore": "#3FA796", "Wind Offshore": "#2E7D74",
  "Nuclear": "#8B6FC9", "Fossil Gas": "#C4622D", "Fossil Hard coal": "#6B5B4E",
  "Fossil Brown coal/Lignite": "#8A6D4A", "Fossil Oil": "#5A4A3A",
  "Fossil Coal-derived gas": "#7A6650", "Hydro Run-of-river": "#3B7CA8",
  "Hydro Water Reservoir": "#2C5F82", "Hydro Pumped Storage": "#4A94C4",
  "Biomass": "#7A9B4E", "Waste": "#918B7A", "Geothermal": "#B85C38",
  "Other renewable": "#5FA88F", "Other": "#6B6B6B", "Marine": "#2A6F97",
  "Energy storage": "#D4A24C", "Fossil Oil shale": "#5A4A3A", "Fossil Peat": "#7A6650",
};

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}
function fmtFullTime(ts) {
  return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
function stats(prices) {
  if (!prices || prices.length === 0) return { avg: 0, min: 0, max: 0, last: 0, negCount: 0, spread: 0 };
  const vals = prices.map((p) => p.price_eur_mwh);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { avg, min: Math.min(...vals), max: Math.max(...vals), last: vals[vals.length - 1], negCount: vals.filter((v) => v < 0).length, spread: Math.max(...vals) - Math.min(...vals) };
}

function Sparkline({ prices, color }) {
  const chartData = (prices || []).map((p) => ({ v: p.price_eur_mwh }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TickerCard({ market, prices, isActive, onClick }) {
  const s = stats(prices);
  const color = s.last < 0 ? "#E85C5C" : "#3FA796";
  return (
    <button onClick={onClick} className={`flex-1 min-w-[150px] text-left border transition-all duration-150 px-4 py-3 ${isActive ? "border-amber-400 bg-[#20211f]" : "border-[#2a2b28] bg-[#191a17] hover:border-[#3a3b38]"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] tracking-[0.15em] text-stone-400 font-mono">{market.zone}</span>
        <span className={`text-[10px] font-mono ${s.negCount > 0 ? "text-red-400" : "text-stone-500"}`}>{s.negCount > 0 ? `${s.negCount} NEG` : ""}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-mono font-semibold text-stone-100">{s.last.toFixed(2)}</span>
        <span className="text-xs text-stone-500 font-mono">EUR/MWh</span>
      </div>
      <div className="mt-2 h-10"><Sparkline prices={prices} color={color} /></div>
      <div className="flex justify-between mt-1 text-[10px] font-mono text-stone-500">
        <span>L {s.min.toFixed(0)}</span><span>H {s.max.toFixed(0)}</span><span>AVG {s.avg.toFixed(0)}</span>
      </div>
    </button>
  );
}

function PriceChart({ market, prices }) {
  const chartData = (prices || []).map((p) => ({ time: fmtTime(p.timestamp), fullTime: fmtFullTime(p.timestamp), price: p.price_eur_mwh }));
  const s = stats(prices);
  return (
    <div className="border border-[#2a2b28] bg-[#151614] p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="text-sm tracking-[0.15em] text-stone-400 font-mono uppercase">Day-Ahead Auction Price</h3>
          <p className="text-xs text-stone-600 mt-0.5">{market.name} &middot; {market.zone} &middot; 15-min MTU</p>
        </div>
        <div className="flex gap-6 text-right font-mono">
          <div><div className="text-[10px] text-stone-600 uppercase tracking-wide">Avg</div><div className="text-stone-200 text-sm">{s.avg.toFixed(2)}</div></div>
          <div><div className="text-[10px] text-stone-600 uppercase tracking-wide">Min</div><div className={s.min < 0 ? "text-red-400 text-sm" : "text-stone-200 text-sm"}>{s.min.toFixed(2)}</div></div>
          <div><div className="text-[10px] text-stone-600 uppercase tracking-wide">Max</div><div className="text-amber-400 text-sm">{s.max.toFixed(2)}</div></div>
          <div><div className="text-[10px] text-stone-600 uppercase tracking-wide">Spread</div><div className="text-stone-200 text-sm">{s.spread.toFixed(2)}</div></div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F2B84B" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#F2B84B" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="#2a2b28" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "#2a2b28" }} tickLine={false} interval={11} />
          <YAxis tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45} />
          <Tooltip contentStyle={{ background: "#0f100e", border: "1px solid #3a3b38", fontFamily: "monospace", fontSize: 12 }} labelStyle={{ color: "#8a8a86" }} formatter={(v) => [`${v.toFixed(2)} EUR/MWh`, "Price"]} labelFormatter={(_, payload) => (payload && payload[0] ? payload[0].payload.fullTime : "")} />
          <Area type="stepAfter" dataKey="price" stroke="#F2B84B" strokeWidth={1.5} fill="url(#priceGrad)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function GenerationMix({ market, generation }) {
  const gen = generation || [];
  const fuelKeys = useMemo(() => {
    const keys = new Set();
    gen.forEach((row) => Object.keys(row).forEach((k) => { if (k !== "timestamp") keys.add(k); }));
    const totals = {};
    keys.forEach((k) => { totals[k] = gen.reduce((sum, row) => sum + (row[k] || 0), 0); });
    return Array.from(keys).sort((a, b) => totals[b] - totals[a]);
  }, [gen]);

  const chartData = gen.map((row) => {
    const out = { time: fmtTime(row.timestamp) };
    fuelKeys.forEach((k) => { out[k] = row[k] || 0; });
    return out;
  });

  const totals = {};
  fuelKeys.forEach((k) => { totals[k] = gen.reduce((sum, row) => sum + (row[k] || 0), 0); });
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const renewables = ["Solar", "Wind Onshore", "Wind Offshore", "Hydro Run-of-river", "Hydro Water Reservoir", "Biomass", "Geothermal", "Other renewable", "Marine"];
  const renewShare = (fuelKeys.filter((k) => renewables.includes(k)).reduce((s, k) => s + totals[k], 0) / grandTotal) * 100;

  return (
    <div className="border border-[#2a2b28] bg-[#151614] p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="text-sm tracking-[0.15em] text-stone-400 font-mono uppercase">Actual Generation Mix</h3>
          <p className="text-xs text-stone-600 mt-0.5">{market.name} &middot; MW by production type</p>
        </div>
        <div className="text-right font-mono"><div className="text-[10px] text-stone-600 uppercase tracking-wide">Renewables Share</div><div className="text-teal-400 text-lg font-semibold">{renewShare.toFixed(1)}%</div></div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#2a2b28" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "#2a2b28" }} tickLine={false} interval={11} />
          <YAxis tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45} />
          <Tooltip contentStyle={{ background: "#0f100e", border: "1px solid #3a3b38", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "#8a8a86" }} />
          {fuelKeys.slice(0, 8).map((k) => (
            <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={FUEL_COLORS[k] || "#888"} fill={FUEL_COLORS[k] || "#888"} fillOpacity={0.75} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-[#2a2b28]">
        {fuelKeys.slice(0, 8).map((k) => (
          <div key={k} className="flex items-center gap-1.5 text-[10px] font-mono text-stone-500">
            <span className="w-2 h-2 inline-block" style={{ background: FUEL_COLORS[k] || "#888" }} />
            {k} &middot; {(totals[k] / 1000).toFixed(1)}GW avg
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtDay(ts) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function HistoryChart({ market }) {
  const [days, setDays] = useState(30);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/history?country=${market.code}&days=${days}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setHistory(json);
      })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [market.code, days]);

  const chartData = (history?.daily || []).map((d) => ({
    day: fmtDay(d.day),
    avg: d.avg,
    min: d.min,
    max: d.max,
  }));

  const coverage = history?.coverage;
  const hasData = coverage && coverage.n_points > 0;

  return (
    <div className="border border-[#2a2b28] bg-[#151614] p-5 xl:col-span-2">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="text-sm tracking-[0.15em] text-stone-400 font-mono uppercase">Price History</h3>
          <p className="text-xs text-stone-600 mt-0.5">
            {market.name} &middot; daily avg / min / max &middot;{" "}
            {hasData
              ? `${fmtDay(coverage.earliest)} → ${fmtDay(coverage.latest)} stored`
              : "no data stored yet"}
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs font-mono border ${days === d ? "border-amber-400 text-amber-400" : "border-[#2a2b28] text-stone-500 hover:border-[#3a3b38]"}`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="border border-red-900 bg-red-950/40 text-red-300 text-xs font-mono px-4 py-2 mb-3">
          {error.includes("relation") || error.includes("does not exist")
            ? "Base de données pas encore initialisée — exécute schema.sql (voir README)."
            : error}
        </div>
      )}

      {!error && !loading && !hasData && (
        <div className="border border-[#2a2b28] text-stone-500 text-xs font-mono px-4 py-6 text-center">
          Aucune donnée historique stockée pour ce marché. Lance un backfill :
          <br />
          <code className="text-amber-400">/api/admin/backfill?days={days}&country={market.code}</code>
        </div>
      )}

      {hasData && (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#2a2b28" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "#2a2b28" }} tickLine={false} interval={Math.floor(chartData.length / 10)} />
            <YAxis tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45} />
            <Tooltip contentStyle={{ background: "#0f100e", border: "1px solid #3a3b38", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "#8a8a86" }} />
            <Line type="monotone" dataKey="max" stroke="#6b6b68" strokeWidth={1} dot={false} isAnimationActive={false} strokeDasharray="2 2" />
            <Line type="monotone" dataKey="avg" stroke="#F2B84B" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="min" stroke="#6b6b68" strokeWidth={1} dot={false} isAnimationActive={false} strokeDasharray="2 2" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function MeridianPower() {
  const [activeMarket, setActiveMarket] = useState("DE");
  const [dataByMarket, setDataByMarket] = useState({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    const results = {};
    const errs = {};
    await Promise.all(
      MARKETS.map(async (m) => {
        try {
          const res = await fetch(`/api/entsoe?country=${m.code}`);
          const json = await res.json();
          if (json.error) errs[m.code] = json.error;
          results[m.code] = json;
        } catch (e) {
          errs[m.code] = String(e.message || e);
        }
      })
    );
    setDataByMarket(results);
    setErrors(errs);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 15 * 60 * 1000); // refresh toutes les 15 min
    return () => clearInterval(interval);
  }, [loadAll]);

  const market = MARKETS.find((m) => m.code === activeMarket);
  const current = dataByMarket[activeMarket] || {};

  return (
    <div className="min-h-screen bg-[#101110] text-stone-200" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[#2a2b28] px-6 py-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-stone-100">Meridian Power</h1>
          <span className="text-[11px] font-mono text-stone-600 tracking-[0.15em] uppercase">European Wholesale Markets</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-stone-500">
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${loading ? "bg-amber-400 animate-pulse" : "bg-teal-400"}`} />
          {loading ? "Refreshing..." : "Source: ENTSO-E Transparency Platform · Live"}
        </div>
      </header>

      <div className="px-6 py-4 flex gap-3 overflow-x-auto">
        {MARKETS.map((m) => (
          <TickerCard key={m.code} market={m} prices={dataByMarket[m.code]?.prices} isActive={m.code === activeMarket} onClick={() => setActiveMarket(m.code)} />
        ))}
      </div>

      {errors[activeMarket] && (
        <div className="mx-6 mb-4 border border-red-900 bg-red-950/40 text-red-300 text-xs font-mono px-4 py-2">
          Erreur {activeMarket}: {errors[activeMarket]}
        </div>
      )}

      <main className="px-6 pb-8 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <PriceChart market={market} prices={current.prices} />
        <GenerationMix market={market} generation={current.generation} />
        <HistoryChart market={market} />
      </main>

      <footer className="px-6 py-4 border-t border-[#2a2b28] text-[10px] font-mono text-stone-600 flex justify-between">
        <span>Phase 1 markets: DE &middot; FR &middot; IT &middot; ES</span>
        <span>Contract types: Day-ahead &middot; Intraday &middot; Balancing &middot; Forwards &middot; PPA (roadmap)</span>
      </footer>
    </div>
  );
}
