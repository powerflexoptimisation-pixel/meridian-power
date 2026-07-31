"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const MARKETS = [
  { code: "DE", name: "Germany", zone: "DE-LU", color: "#F2B84B" },
  { code: "FR", name: "France", zone: "FR", color: "#3FA796" },
  { code: "IT", name: "Italy", zone: "IT-North", color: "#8B6FC9" },
  { code: "ES", name: "Spain", zone: "ES", color: "#4A94C4" },
];
const MARKET_COLOR = Object.fromEntries(MARKETS.map((m) => [m.code, m.color]));

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
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}
function fmtFullTime(ts) {
  return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) + " CET/CEST";
}
function fmtDay(ts) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Europe/Berlin" });
}
function fmtDayFull(ts) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Berlin" });
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function stats(prices) {
  if (!prices || prices.length === 0) return { avg: 0, min: 0, max: 0, last: 0, negCount: 0, spread: 0 };
  const vals = prices.map((p) => p.price_eur_mwh);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { avg, min: Math.min(...vals), max: Math.max(...vals), last: vals[vals.length - 1], negCount: vals.filter((v) => v < 0).length, spread: Math.max(...vals) - Math.min(...vals) };
}

// Renvoie le point dont le créneau de 15 min [ts, ts+15min) contient l'instant
// présent — c'est-à-dire le prix "en ce moment", pas le dernier point publié
// (qui est souvent celui de 23:45, puisque le day-ahead est connu à l'avance).
function currentPricePoint(prices) {
  if (!prices || prices.length === 0) return null;
  const now = Date.now();
  let candidate = prices[0];
  for (const p of prices) {
    if (new Date(p.timestamp).getTime() <= now) candidate = p;
    else break;
  }
  return candidate;
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
  const current = currentPricePoint(prices);
  const currentPrice = current ? current.price_eur_mwh : s.last;
  const color = currentPrice < 0 ? "#E85C5C" : "#3FA796";
  return (
    <button onClick={onClick} className={`flex-1 min-w-[150px] text-left border transition-all duration-150 px-4 py-3 ${isActive ? "border-amber-400 bg-[#20211f]" : "border-[#2a2b28] bg-[#191a17] hover:border-[#3a3b38]"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] tracking-[0.15em] text-stone-400 font-mono">{market.zone}</span>
        <span className={`text-[10px] font-mono ${s.negCount > 0 ? "text-red-400" : "text-stone-500"}`}>{s.negCount > 0 ? `${s.negCount} NEG` : ""}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-mono font-semibold text-stone-100">{currentPrice.toFixed(2)}</span>
        <span className="text-xs text-stone-500 font-mono">EUR/MWh</span>
      </div>
      <div className="text-[10px] text-stone-600 font-mono mt-0.5">{current ? `now · ${fmtTime(current.timestamp)}` : ""}</div>
      <div className="mt-2 h-10"><Sparkline prices={prices} color={color} /></div>
      <div className="flex justify-between mt-1 text-[10px] font-mono text-stone-500">
        <span>L {s.min.toFixed(0)}</span><span>H {s.max.toFixed(0)}</span><span>AVG {s.avg.toFixed(0)}</span>
      </div>
    </button>
  );
}

function DateJumpControls({ viewDate, setViewDate, maxRangeDays = 1 }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-mono">
      <input
        type="date"
        value={viewDate || ""}
        onChange={(e) => setViewDate(e.target.value || null)}
        className="bg-[#0f100e] border border-[#2a2b28] text-stone-300 px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400"
      />
      {viewDate && (
        <button onClick={() => setViewDate(null)} className="px-2 py-1 border border-[#2a2b28] text-stone-500 hover:border-amber-400 hover:text-amber-400" title="Revenir au live">
          ● LIVE
        </button>
      )}
    </div>
  );
}

function PriceChart({ market, dataByMarket }) {
  const [selected, setSelected] = useState([market.code]);
  const [viewDate, setViewDate] = useState(null); // null = live (dernier jour dispo), "YYYY-MM-DD" = jour historique précis
  const [historicalData, setHistoricalData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSelected((prev) => (prev.includes(market.code) ? prev : [...prev, market.code]));
  }, [market.code]);

  // Mode historique: on va chercher les points bruts 15-min stockés en base pour la date choisie.
  useEffect(() => {
    if (!viewDate) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("countries", selected.join(","));
    params.set("resolution", "raw");
    params.set("from", viewDate);
    params.set("to", viewDate);
    fetch(`/api/history?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) { setError(json.error); return; }
        const out = {};
        for (const code of selected) {
          out[code] = (json.markets[code]?.series || []).map((pt) => ({ timestamp: pt.bucket, price_eur_mwh: pt.avg }));
        }
        setHistoricalData(out);
      })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [viewDate, selected.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMarket(code) {
    setSelected((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== code);
      }
      return [...prev, code];
    });
  }

  // source des prix par marché: live (props du parent, déjà pollé) ou historique (fetch local)
  const pricesByCode = viewDate
    ? historicalData
    : Object.fromEntries(selected.map((c) => [c, dataByMarket[c]?.prices || []]));

  const multiMode = selected.length > 1;
  const primaryPrices = pricesByCode[market.code] || pricesByCode[selected[0]] || [];
  const s = stats(primaryPrices);

  const chartData = useMemo(() => {
    const byTs = new Map();
    for (const code of selected) {
      (pricesByCode[code] || []).forEach((p) => {
        const row = byTs.get(p.timestamp) || { ts: p.timestamp, time: fmtTime(p.timestamp), fullTime: fmtFullTime(p.timestamp) };
        row[code] = p.price_eur_mwh;
        byTs.set(p.timestamp, row);
      });
    }
    return [...byTs.values()].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  }, [pricesByCode, selected]);

  return (
    <div className="border border-[#2a2b28] bg-[#151614] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm tracking-[0.15em] text-stone-400 font-mono uppercase">Day-Ahead Auction Price</h3>
          <p className="text-xs text-stone-600 mt-0.5">
            {selected.map((c) => MARKETS.find((m) => m.code === c)?.name).join(" vs ")} &middot; 15-min MTU &middot; {viewDate ? viewDate : "live"}
          </p>
        </div>
        {!multiMode && (
          <div className="flex gap-6 text-right font-mono">
            <div><div className="text-[10px] text-stone-600 uppercase tracking-wide">Avg</div><div className="text-stone-200 text-sm">{s.avg.toFixed(2)}</div></div>
            <div><div className="text-[10px] text-stone-600 uppercase tracking-wide">Min</div><div className={s.min < 0 ? "text-red-400 text-sm" : "text-stone-200 text-sm"}>{s.min.toFixed(2)}</div></div>
            <div><div className="text-[10px] text-stone-600 uppercase tracking-wide">Max</div><div className="text-amber-400 text-sm">{s.max.toFixed(2)}</div></div>
            <div><div className="text-[10px] text-stone-600 uppercase tracking-wide">Spread</div><div className="text-stone-200 text-sm">{s.spread.toFixed(2)}</div></div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[10px] text-stone-600 uppercase tracking-wide font-mono mr-1">Compare:</span>
        {MARKETS.map((m) => {
          const isOn = selected.includes(m.code);
          return (
            <button
              key={m.code}
              onClick={() => toggleMarket(m.code)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono border transition-colors"
              style={{ borderColor: isOn ? m.color : "#2a2b28", color: isOn ? m.color : "#6b6b68", background: isOn ? `${m.color}14` : "transparent" }}
            >
              <span className="w-2 h-2 inline-block rounded-full" style={{ background: isOn ? m.color : "#3a3b38" }} />
              {m.zone}
            </button>
          );
        })}
        <div className="ml-auto">
          <DateJumpControls viewDate={viewDate} setViewDate={setViewDate} />
        </div>
      </div>

      {error && (
        <div className="border border-red-900 bg-red-950/40 text-red-300 text-xs font-mono px-4 py-2 mb-2">{error}</div>
      )}

      <ResponsiveContainer width="100%" height={260}>
        {multiMode ? (
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#2a2b28" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "#2a2b28" }} tickLine={false} interval={11} />
            <YAxis tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45} />
            <Tooltip contentStyle={{ background: "#0f100e", border: "1px solid #3a3b38", fontFamily: "monospace", fontSize: 12 }} labelStyle={{ color: "#8a8a86" }} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
            {selected.map((code) => (
              <Line key={code} type="monotone" dataKey={code} name={code} stroke={MARKET_COLOR[code]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        ) : (
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
            <Area type="stepAfter" dataKey={market.code} stroke="#F2B84B" strokeWidth={1.5} fill="url(#priceGrad)" isAnimationActive={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function GenerationMix({ market, dataByMarket }) {
  const [hidden, setHidden] = useState(() => new Set());
  const [viewDate, setViewDate] = useState(null);
  const [historicalGen, setHistoricalGen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!viewDate) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("country", market.code);
    params.set("from", viewDate);
    params.set("to", viewDate);
    fetch(`/api/generation?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) { setError(json.error); return; }
        setHistoricalGen(json.generation || []);
      })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [viewDate, market.code]);

  const gen = viewDate ? (historicalGen || []) : (dataByMarket[market.code]?.generation || []);

  const fuelKeys = useMemo(() => {
    const keys = new Set();
    gen.forEach((row) => Object.keys(row).forEach((k) => { if (k !== "timestamp") keys.add(k); }));
    const totals = {};
    keys.forEach((k) => { totals[k] = gen.reduce((sum, row) => sum + (row[k] || 0), 0); });
    return Array.from(keys).sort((a, b) => totals[b] - totals[a]);
  }, [gen]);

  useEffect(() => {
    setHidden((prev) => new Set([...prev].filter((k) => fuelKeys.includes(k))));
  }, [market.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleKeys = fuelKeys.filter((k) => !hidden.has(k));

  const chartData = gen.map((row) => {
    const out = { time: fmtTime(row.timestamp) };
    visibleKeys.forEach((k) => { out[k] = row[k] || 0; });
    return out;
  });

  const totals = {};
  fuelKeys.forEach((k) => { totals[k] = gen.reduce((sum, row) => sum + (row[k] || 0), 0); });
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const renewables = ["Solar", "Wind Onshore", "Wind Offshore", "Hydro Run-of-river", "Hydro Water Reservoir", "Biomass", "Geothermal", "Other renewable", "Marine"];
  const renewShare = (fuelKeys.filter((k) => renewables.includes(k)).reduce((s, k) => s + totals[k], 0) / grandTotal) * 100;

  function toggleFuel(k) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  return (
    <div className="border border-[#2a2b28] bg-[#151614] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm tracking-[0.15em] text-stone-400 font-mono uppercase">Actual Generation Mix</h3>
          <p className="text-xs text-stone-600 mt-0.5">{market.name} &middot; MW by production type &middot; {viewDate ? viewDate : "live"} &middot; click legend to filter</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right font-mono"><div className="text-[10px] text-stone-600 uppercase tracking-wide">Renewables Share</div><div className="text-teal-400 text-lg font-semibold">{renewShare.toFixed(1)}%</div></div>
          <DateJumpControls viewDate={viewDate} setViewDate={setViewDate} />
        </div>
      </div>

      {error && (
        <div className="border border-red-900 bg-red-950/40 text-red-300 text-xs font-mono px-4 py-2 mb-2">{error}</div>
      )}

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#2a2b28" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "#2a2b28" }} tickLine={false} interval={11} />
          <YAxis tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45} />
          <Tooltip contentStyle={{ background: "#0f100e", border: "1px solid #3a3b38", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "#8a8a86" }} />
          {visibleKeys.slice(0, 12).map((k) => (
            <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={FUEL_COLORS[k] || "#888"} fill={FUEL_COLORS[k] || "#888"} fillOpacity={0.75} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-[#2a2b28]">
        {fuelKeys.slice(0, 12).map((k) => {
          const isHidden = hidden.has(k);
          return (
            <button
              key={k}
              onClick={() => toggleFuel(k)}
              className={`flex items-center gap-1.5 text-[10px] font-mono transition-opacity ${isHidden ? "opacity-35" : "opacity-100"} text-stone-500 hover:text-stone-300`}
              title={isHidden ? "Cliquer pour afficher" : "Cliquer pour masquer"}
            >
              <span className="w-2 h-2 inline-block" style={{ background: FUEL_COLORS[k] || "#888" }} />
              {k} &middot; {(totals[k] / 1000).toFixed(1)}GW avg
            </button>
          );
        })}
      </div>
    </div>
  );
}

const QUICK_RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
];

function HistoryChart({ market }) {
  const [selected, setSelected] = useState([market.code]);
  const [quickDays, setQuickDays] = useState(30);
  const [customFrom, setCustomFrom] = useState(null); // "YYYY-MM-DD" ou null (= mode rapide)
  const [customTo, setCustomTo] = useState(null);
  const [resolution, setResolution] = useState("day");
  const [compareYoY, setCompareYoY] = useState(false);

  const [data, setData] = useState(null);
  const [yoyData, setYoyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Le marché actif (ticker sélectionné en haut) reste toujours inclus dans la comparaison.
  useEffect(() => {
    setSelected((prev) => (prev.includes(market.code) ? prev : [...prev, market.code]));
  }, [market.code]);

  const isCustom = !!(customFrom && customTo);

  function computeRange(offsetYears = 0) {
    if (isCustom) {
      const f = new Date(customFrom);
      const t = new Date(customTo);
      f.setUTCFullYear(f.getUTCFullYear() - offsetYears);
      t.setUTCFullYear(t.getUTCFullYear() - offsetYears);
      return { from: isoDate(f), to: isoDate(t) };
    }
    return null; // mode "days" ne supporte pas le décalage YoY par date -> géré via param days côté API
  }

  const fetchKey = JSON.stringify({ selected, quickDays, customFrom, customTo, resolution });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("countries", selected.join(","));
    params.set("resolution", resolution);
    if (isCustom) {
      params.set("from", customFrom);
      params.set("to", customTo);
    } else {
      params.set("days", String(quickDays));
    }

    fetch(`/api/history?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, [fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Comparaison année sur année: uniquement en mode 1 marché + dates custom.
  useEffect(() => {
    if (!compareYoY || selected.length !== 1 || !isCustom) { setYoyData(null); return; }
    let cancelled = false;
    const range = computeRange(1);
    if (!range) return;
    const params = new URLSearchParams();
    params.set("countries", selected.join(","));
    params.set("resolution", resolution);
    params.set("from", range.from);
    params.set("to", range.to);
    fetch(`/api/history?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => !cancelled && !json.error && setYoyData(json))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [compareYoY, fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMarket(code) {
    setSelected((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev; // au moins un marché
        return prev.filter((c) => c !== code);
      }
      return [...prev, code];
    });
  }

  function pickQuick(days) {
    setQuickDays(days);
    setCustomFrom(null);
    setCustomTo(null);
  }

  function applyCustomRange(from, to) {
    if (from && to && from <= to) {
      setCustomFrom(from);
      setCustomTo(to);
    }
  }

  // Fusionne les séries de chaque marché sélectionné par bucket, pour affichage multi-lignes.
  const chartData = useMemo(() => {
    if (!data?.markets) return [];
    const byBucket = new Map();
    for (const code of selected) {
      const series = data.markets[code]?.series || [];
      series.forEach((pt) => {
        const key = pt.bucket || pt.day;
        const label = resolution === "hour" ? fmtFullTime(key) : fmtDay(key);
        const row = byBucket.get(key) || { key, label };
        row[code] = pt.avg;
        if (selected.length === 1) { row.min = pt.min; row.max = pt.max; }
        byBucket.set(key, row);
      });
    }
    let rows = [...byBucket.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    if (compareYoY && yoyData?.markets && selected.length === 1) {
      const code = selected[0];
      const yoySeries = yoyData.markets[code]?.series || [];
      rows = rows.map((row, i) => ({ ...row, ly: yoySeries[i]?.avg }));
    }
    return rows;
  }, [data, yoyData, selected, resolution, compareYoY]);

  const coverageList = selected
    .map((c) => ({ code: c, coverage: data?.markets?.[c]?.coverage }))
    .filter((x) => x.coverage && x.coverage.n_points > 0);
  const hasData = coverageList.length > 0;

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("countries", selected.join(","));
    params.set("resolution", resolution);
    if (isCustom) {
      params.set("from", customFrom);
      params.set("to", customTo);
    } else {
      params.set("days", String(quickDays));
    }
    return `/api/export?${params.toString()}`;
  }, [selected, resolution, isCustom, customFrom, customTo, quickDays]);

  const multiMode = selected.length > 1;

  return (
    <div className="border border-[#2a2b28] bg-[#151614] p-5 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm tracking-[0.15em] text-stone-400 font-mono uppercase">Price History</h3>
          <p className="text-xs text-stone-600 mt-0.5">
            {selected.map((c) => MARKETS.find((m) => m.code === c)?.name).join(" vs ")} &middot; {resolution === "hour" ? "hourly" : "daily"} avg{!multiMode ? " / min / max" : ""}
            {hasData && (
              <> &middot; {fmtDayFull(coverageList[0].coverage.earliest)} → {fmtDayFull(coverageList[0].coverage.latest)} stored</>
            )}
          </p>
        </div>
        <a
          href={exportUrl}
          className="px-3 py-1.5 text-xs font-mono border border-[#2a2b28] text-stone-400 hover:border-amber-400 hover:text-amber-400 transition-colors"
        >
          ⬇ Export CSV
        </a>
      </div>

      {/* Sélecteur de marchés (comparaison) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[10px] text-stone-600 uppercase tracking-wide font-mono mr-1">Compare:</span>
        {MARKETS.map((m) => {
          const isOn = selected.includes(m.code);
          return (
            <button
              key={m.code}
              onClick={() => toggleMarket(m.code)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono border transition-colors"
              style={{
                borderColor: isOn ? m.color : "#2a2b28",
                color: isOn ? m.color : "#6b6b68",
                background: isOn ? `${m.color}14` : "transparent",
              }}
            >
              <span className="w-2 h-2 inline-block rounded-full" style={{ background: isOn ? m.color : "#3a3b38" }} />
              {m.zone}
            </button>
          );
        })}
      </div>

      {/* Plage de dates + résolution */}
      <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-[#2a2b28]">
        <div className="flex gap-1">
          {QUICK_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => pickQuick(r.days)}
              className={`px-3 py-1 text-xs font-mono border ${!isCustom && quickDays === r.days ? "border-amber-400 text-amber-400" : "border-[#2a2b28] text-stone-500 hover:border-[#3a3b38]"}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono">
          <input
            type="date"
            defaultValue={customFrom || ""}
            onChange={(e) => applyCustomRange(e.target.value, customTo || e.target.value)}
            className="bg-[#0f100e] border border-[#2a2b28] text-stone-300 px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400"
          />
          <span className="text-stone-600">→</span>
          <input
            type="date"
            defaultValue={customTo || ""}
            onChange={(e) => applyCustomRange(customFrom || e.target.value, e.target.value)}
            className="bg-[#0f100e] border border-[#2a2b28] text-stone-300 px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400"
          />
          {isCustom && (
            <button onClick={() => { setCustomFrom(null); setCustomTo(null); }} className="text-stone-600 hover:text-stone-400 px-1" title="Revenir aux raccourcis">
              ✕
            </button>
          )}
        </div>

        <div className="flex gap-1 ml-auto">
          {["day", "hour"].map((r) => (
            <button
              key={r}
              onClick={() => setResolution(r)}
              className={`px-3 py-1 text-xs font-mono border uppercase ${resolution === r ? "border-amber-400 text-amber-400" : "border-[#2a2b28] text-stone-500 hover:border-[#3a3b38]"}`}
            >
              {r === "day" ? "Daily" : "Hourly"}
            </button>
          ))}
        </div>

        {!multiMode && isCustom && (
          <label className="flex items-center gap-1.5 text-xs font-mono text-stone-500 cursor-pointer">
            <input type="checkbox" checked={compareYoY} onChange={(e) => setCompareYoY(e.target.checked)} className="accent-amber-400" />
            Compare vs. last year
          </label>
        )}
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
          Aucune donnée historique stockée pour cette sélection.
        </div>
      )}

      {hasData && (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#2a2b28" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "#2a2b28" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 10))} />
            <YAxis tick={{ fill: "#6b6b68", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45} />
            <Tooltip contentStyle={{ background: "#0f100e", border: "1px solid #3a3b38", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "#8a8a86" }} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
            {!multiMode && (
              <>
                <Line type="monotone" dataKey="max" name="max" stroke="#6b6b68" strokeWidth={1} dot={false} isAnimationActive={false} strokeDasharray="2 2" />
                <Line type="monotone" dataKey="min" name="min" stroke="#6b6b68" strokeWidth={1} dot={false} isAnimationActive={false} strokeDasharray="2 2" />
              </>
            )}
            {selected.map((code) => (
              <Line key={code} type="monotone" dataKey={code} name={`${code} avg`} stroke={MARKET_COLOR[code]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
            {compareYoY && !multiMode && (
              <Line type="monotone" dataKey="ly" name="avg (last year)" stroke="#8a8a86" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            )}
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
        <PriceChart market={market} dataByMarket={dataByMarket} />
        <GenerationMix market={market} dataByMarket={dataByMarket} />
        <HistoryChart market={market} />
      </main>

      <footer className="px-6 py-4 border-t border-[#2a2b28] text-[10px] font-mono text-stone-600 flex justify-between">
        <span>Phase 1 markets: DE &middot; FR &middot; IT &middot; ES</span>
        <span>Contract types: Day-ahead &middot; Intraday &middot; Balancing &middot; Forwards &middot; PPA (roadmap)</span>
      </footer>
    </div>
  );
}
