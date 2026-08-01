"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ThemeToggle } from "../theme-toggle";
import { LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { berlinYesterdayISO } from "./date-helper";

const MARKETS = [
  { code: "DE", name: "Germany", zone: "DE-LU", color: "#F2B84B" },
  { code: "FR", name: "France", zone: "FR", color: "#3FA796" },
  { code: "IT", name: "Italy", zone: "IT-North", color: "#8B6FC9" },
  { code: "ES", name: "Spain", zone: "ES", color: "#4A94C4" },
];

const WIND_PV = ["Solar", "Wind Onshore", "Wind Offshore"];
const OTHER_RENEWABLES = [
  "Hydro Run-of-river", "Hydro Water Reservoir", "Hydro Pumped Storage",
  "Biomass", "Geothermal", "Other renewable", "Marine",
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

// Pour les séries qui couvrent plusieurs jours (reBAP, aFRR/mFRR: fenêtre de
// plusieurs semaines) — fmtTime seul est ambigu (même "14:00" répété chaque
// jour). Inclut la date pour que chaque point reste identifiable.
function fmtDateTime(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} ${time}`;
}

// Fusionne load (consommation) + generation (mix) live en la même forme que
// /api/analysis, pour réutiliser exactement la même logique d'affichage.
function deriveLiveSeries(loadPoints, genPoints) {
  const genByTs = new Map((genPoints || []).map((row) => [row.timestamp, row]));
  return (loadPoints || []).map((lp) => {
    const gen = genByTs.get(lp.timestamp) || {};
    const windPv = WIND_PV.reduce((s, k) => s + (gen[k] || 0), 0);
    const otherRenew = OTHER_RENEWABLES.reduce((s, k) => s + (gen[k] || 0), 0);
    return {
      timestamp: lp.timestamp,
      consumption: lp.load_mw,
      windPv,
      otherRenew,
      residualLoad: lp.load_mw - windPv,
    };
  });
}

// Renvoie le point dont le créneau 15-min contient l'instant présent — le
// même principe que sur la homepage pour les tickers de prix.
function currentPoint(series) {
  if (!series || series.length === 0) return null;
  const now = Date.now();
  let candidate = series[0];
  for (const p of series) {
    if (new Date(p.timestamp).getTime() <= now) candidate = p;
    else break;
  }
  return candidate;
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

function StatCard({ label, color, stats, current, isLive }) {
  return (
    <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 inline-block rounded-full" style={{ background: color }} />
        <span className="text-[11px] tracking-[0.1em] text-[var(--mp-text-4)] font-mono uppercase">{label}</span>
      </div>
      {isLive ? (
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

function fmtBadge(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

// Affiché en haut de chaque graphique: la plage réelle de données affichée
// (from -> to, heure de Berlin). Purement informatif — le changement de
// plage se fait via les contrôles globaux (sélecteur de date en haut de
// page) ou, pour la section Allemagne, via le DateRangeControl dédié.
function RangeBadge({ from, to }) {
  return (
    <div className="text-[10px] font-mono text-[var(--mp-text-6)] whitespace-nowrap">
      {fmtBadge(from)} &rarr; {fmtBadge(to)}
    </div>
  );
}

// Contrôle éditable de plage date+heure, utilisé pour la section
// netztransparenz.de. `effectiveFrom`/`effectiveTo` = plage réellement
// utilisée par le backend (auto ou personnalisée) ; `onApply(from, to)` /
// `onReset()` remontent le choix de l'utilisateur au composant parent.
function DateRangeControl({ effectiveFrom, effectiveTo, draft, onDraftChange, onApply, onReset, isCustom }) {
  return (
    <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide font-mono">Germany data range:</span>
      <div className="flex items-center gap-1.5 text-xs font-mono">
        <span className="text-[var(--mp-text-5)]">From</span>
        <input
          type="datetime-local"
          value={draft.from}
          onChange={(e) => onDraftChange({ ...draft, from: e.target.value })}
          className="bg-[var(--mp-bg-deep)] border border-[var(--mp-border)] text-[var(--mp-text-3)] px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400"
        />
        <span className="text-[var(--mp-text-5)]">To</span>
        <input
          type="datetime-local"
          value={draft.to}
          onChange={(e) => onDraftChange({ ...draft, to: e.target.value })}
          className="bg-[var(--mp-bg-deep)] border border-[var(--mp-border)] text-[var(--mp-text-3)] px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400"
        />
      </div>
      <button
        onClick={onApply}
        disabled={!draft.from || !draft.to}
        className="px-2 py-1 text-xs font-mono border border-[var(--mp-border)] text-[var(--mp-text-4)] hover:border-amber-400 hover:text-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Apply
      </button>
      {isCustom && (
        <button onClick={onReset} className="px-2 py-1 text-xs font-mono border border-[var(--mp-border)] text-[var(--mp-text-5)] hover:border-amber-400 hover:text-amber-400">
          ● Auto
        </button>
      )}
      <span className="text-[10px] font-mono text-[var(--mp-text-6)] ml-auto">
        Effective: {fmtBadge(effectiveFrom)} &rarr; {fmtBadge(effectiveTo)}
      </span>
    </div>
  );
}


export default function AnalysisPage() {
  const [activeMarket, setActiveMarket] = useState("DE");
  const [viewDate, setViewDate] = useState(null); // null = live
  const [liveByMarket, setLiveByMarket] = useState({});
  const [histData, setHistData] = useState(null);
  const [flowsData, setFlowsData] = useState(null);
  const [ntpData, setNtpData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Plage personnalisée pour les graphiques netztransparenz.de (reBAP,
  // AEP-Schätzer, RZ-Saldo, Redispatch, aFRR/mFRR). null = calcul
  // automatique (voir /api/netztransparenz). Valeurs au format
  // datetime-local ("YYYY-MM-DDTHH:mm"), interprétées en heure de Berlin.
  const [deRange, setDeRange] = useState(null);
  const [deRangeDraft, setDeRangeDraft] = useState({ from: "", to: "" });

  const isLive = !viewDate;

  // Mode live: /api/entsoe (même source que la homepage), rafraîchi toutes les 15 min.
  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/entsoe?country=${activeMarket}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        if (!cancelled) setLiveByMarket((prev) => ({ ...prev, [activeMarket]: json }));
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeMarket, isLive]);

  // Mode historique: /api/analysis pour un jour précis (en base).
  useEffect(() => {
    if (isLive) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ country: activeMarket, from: viewDate, to: viewDate });
    fetch(`/api/analysis?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setHistData(json);
      })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [activeMarket, viewDate, isLive]);

  const market = MARKETS.find((m) => m.code === activeMarket);

  // Flux transfrontaliers physiques — même endpoint pour live (hier->auj.)
  // et historique (date précise), l'API gère les deux via from/to.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ country: activeMarket });
    if (!isLive) {
      params.set("from", viewDate);
      params.set("to", viewDate);
    }
    fetch(`/api/flows?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && !json.error) setFlowsData(json);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeMarket, viewDate, isLive]);

  // Données netztransparenz.de (reBAP, AEP-Schätzer, RZ-Saldo, Redispatch,
  // aFRR/mFRR) — spécifiques à l'Allemagne, donc uniquement chargées quand DE
  // est le marché actif. deRange (si défini par l'utilisateur) prend le pas
  // sur le jour sélectionné / le mode live.
  useEffect(() => {
    if (activeMarket !== "DE") { setNtpData(null); return; }
    let cancelled = false;
    const ntpParams = new URLSearchParams();
    if (deRange) {
      ntpParams.set("fromDt", deRange.from);
      ntpParams.set("toDt", deRange.to);
    } else if (!isLive) {
      ntpParams.set("from", viewDate);
      ntpParams.set("to", viewDate);
    }
    fetch(`/api/netztransparenz?${ntpParams.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          if (json.error) setError(json.error);
          else setNtpData(json);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeMarket, viewDate, isLive, deRange]);

  const series = useMemo(() => {
    if (isLive) {
      const d = liveByMarket[activeMarket];
      if (!d) return [];
      return deriveLiveSeries(d.load, d.generation);
    }
    return histData?.series || [];
  }, [isLive, liveByMarket, activeMarket, histData]);

  const chartData = useMemo(
    () => series.map((r) => ({ time: fmtTime(r.timestamp), consumption: r.consumption, consumptionForecast: r.consumptionForecast ?? undefined, windPv: r.windPv, otherRenew: r.otherRenew, residualLoad: r.residualLoad })),
    [series]
  );
  const hasForecast = !isLive && chartData.some((r) => r.consumptionForecast !== undefined);
  const forecastAccuracy = !isLive ? histData?.forecastAccuracy : null;

  const cur = currentPoint(series);
  const curVals = {
    consumption: { value: cur ? cur.consumption : 0, time: cur ? fmtTime(cur.timestamp) : "" },
    windPv: { value: cur ? cur.windPv : 0, time: cur ? fmtTime(cur.timestamp) : "" },
    otherRenew: { value: cur ? cur.otherRenew : 0, time: cur ? fmtTime(cur.timestamp) : "" },
    residualLoad: { value: cur ? cur.residualLoad : 0, time: cur ? fmtTime(cur.timestamp) : "" },
  };

  const cStats = seriesStats(series, "consumption");
  const wStats = seriesStats(series, "windPv");
  const oStats = seriesStats(series, "otherRenew");
  const rStats = seriesStats(series, "residualLoad");
  const renewShareOfLoad = cStats.avg > 0 ? ((wStats.avg + oStats.avg) / cStats.avg) * 100 : 0;

  const neighbors = flowsData?.neighbors || [];
  const flowsChartData = useMemo(() => {
    if (!flowsData?.flows) return [];
    const byTs = new Map();
    for (const n of neighbors) {
      (flowsData.flows[n] || []).forEach((p) => {
        const row = byTs.get(p.timestamp) || { key: p.timestamp, time: fmtTime(p.timestamp) };
        row[n] = p.net_mw;
        byTs.set(p.timestamp, row);
      });
    }
    const rows = [...byTs.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    // Position nette totale = somme des flux nets sur toutes les frontières à
    // cet instant (positif = pays exportateur net global, négatif = importateur net).
    rows.forEach((row) => {
      row.total = neighbors.reduce((sum, n) => sum + (row[n] ?? 0), 0);
    });
    return rows;
  }, [flowsData, neighbors]);
  const flowAvgByNeighbor = Object.fromEntries(
    neighbors.map((n) => {
      const vals = (flowsData?.flows?.[n] || []).map((p) => p.net_mw);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return [n, avg];
    })
  );
  const totalNetAvg = flowsChartData.length
    ? flowsChartData.reduce((s, r) => s + r.total, 0) / flowsChartData.length
    : 0;

  // Plages from/to réelles des données affichées, pour les badges en haut de
  // chaque graphique.
  const seriesFrom = series.length ? series[0].timestamp : null;
  const seriesTo = series.length ? series[series.length - 1].timestamp : null;
  const flowsFrom = flowsChartData.length ? flowsChartData[0].key : null;
  const flowsTo = flowsChartData.length ? flowsChartData[flowsChartData.length - 1].key : null;

  const reBapChartData = (ntpData?.reBAP || []).map((p) => ({
    time: fmtDateTime(p.timestamp),
    rebap: p.rebap_unterdeckt,
  }));
  const reBapStats = reBapChartData.length
    ? {
        avg: reBapChartData.reduce((s, r) => s + (r.rebap || 0), 0) / reBapChartData.length,
        min: Math.min(...reBapChartData.map((r) => r.rebap)),
        max: Math.max(...reBapChartData.map((r) => r.rebap)),
      }
    : null;
  const redispatchSummary = ntpData?.redispatchSummary;

  // AEP-Schätzer: proxy temps réel du reBAP (publié en continu, sans le
  // délai qualitätsgesichert), utile pour voir la tendance du prix de
  // compensation avant la publication officielle du reBAP.
  const aepChartData = (ntpData?.aepSchaetzer || []).map((p) => ({
    time: fmtTime(p.timestamp),
    aep: p.aep_schaetzer_eur_mwh,
  }));
  const aepStats = aepChartData.length
    ? {
        avg: aepChartData.reduce((s, r) => s + (r.aep || 0), 0) / aepChartData.length,
        min: Math.min(...aepChartData.map((r) => r.aep)),
        max: Math.max(...aepChartData.map((r) => r.aep)),
      }
    : null;

  // RZ-Saldo: solde de la zone de réglage par GRT (MW) — une ligne par TSO.
  const rzSaldoChartData = (ntpData?.rzSaldo || []).map((p) => ({
    time: fmtTime(p.timestamp),
    "50Hertz": p["50Hertz"],
    Amprion: p.Amprion,
    "TenneT TSO": p["TenneT TSO"],
    TransnetBW: p.TransnetBW,
  }));
  const RZ_TSO_COLORS = { "50Hertz": "#C4622D", Amprion: "#3FA796", "TenneT TSO": "#8B6FC9", TransnetBW: "#4A94C4" };

  // Activations aFRR/mFRR: format "long" (ts, zone, direction, value_mw) ->
  // on retient la zone Allemagne et on calcule le net (positif - négatif)
  // par créneau, pour une lecture directe de l'activation nette.
  function deriveNetActivation(rows) {
    const byTs = new Map();
    for (const r of rows || []) {
      if (r.zone !== "Deutschland") continue;
      const entry = byTs.get(r.timestamp) || { timestamp: r.timestamp, net: 0 };
      entry.net += r.direction === "positiv" ? r.value_mw : -r.value_mw;
      byTs.set(r.timestamp, entry);
    }
    return [...byTs.values()]
      .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
      .map((r) => ({ time: fmtDateTime(r.timestamp), net: r.net }));
  }
  const afrrChartData = deriveNetActivation(ntpData?.activatedAFRR);
  const mfrrChartData = deriveNetActivation(ntpData?.activatedMFRR);
  const activationChartData = useMemo(() => {
    const byTime = new Map();
    afrrChartData.forEach((r) => byTime.set(r.time, { time: r.time, afrr: r.net }));
    mfrrChartData.forEach((r) => {
      const row = byTime.get(r.time) || { time: r.time };
      row.mfrr = r.net;
      byTime.set(r.time, row);
    });
    return [...byTime.values()];
  }, [afrrChartData, mfrrChartData]);

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--mp-text-1)]">Meridian Power</h1>
          <span className="text-[11px] font-mono text-[var(--mp-text-6)] tracking-[0.15em] uppercase">Load &amp; Renewables Analysis</span>
          <nav className="flex items-center gap-1 ml-4">
            <Link href="/" className="px-2 py-1 text-xs font-mono border border-[var(--mp-border)] text-[var(--mp-text-5)] hover:border-[var(--mp-border-hover)] hover:text-[var(--mp-text-3)]">Home</Link>
            <span className="px-2 py-1 text-xs font-mono border border-amber-400 text-amber-400">Analysis</span>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--mp-text-5)]">
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${loading ? "bg-amber-400 animate-pulse" : "bg-teal-400"}`} />
          {loading ? "Loading..." : isLive ? "Live · refreshes every 15 min" : "Historical view"}
          <ThemeToggle />
        </div>
      </header>

      <div className="px-6 py-4 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide font-mono mr-1">Market:</span>
        {MARKETS.map((m) => {
          const isOn = m.code === activeMarket;
          return (
            <button
              key={m.code}
              onClick={() => setActiveMarket(m.code)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono border transition-colors"
              style={{ borderColor: isOn ? m.color : "var(--mp-grid)", color: isOn ? m.color : "var(--mp-tick)", background: isOn ? `${m.color}14` : "transparent" }}
            >
              <span className="w-2 h-2 inline-block rounded-full" style={{ background: isOn ? m.color : "var(--mp-border-hover)" }} />
              {m.zone}
            </button>
          );
        })}

        <div className="flex items-center gap-1.5 text-xs font-mono ml-2">
          <input
            type="date"
            value={viewDate || ""}
            max={berlinYesterdayISO()}
            onChange={(e) => setViewDate(e.target.value || null)}
            className="bg-[var(--mp-bg-deep)] border border-[var(--mp-border)] text-[var(--mp-text-3)] px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400"
          />
          {!isLive && (
            <button onClick={() => setViewDate(null)} className="px-2 py-1 border border-[var(--mp-border)] text-[var(--mp-text-5)] hover:border-amber-400 hover:text-amber-400">
              ● LIVE
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-6 mb-4 border border-red-900 bg-red-950/40 text-red-300 text-xs font-mono px-4 py-2">{error}</div>
      )}

      <main className="px-6 pb-8 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Consumption" color="#E8C468" stats={cStats} current={curVals.consumption} isLive={isLive} />
          <StatCard label="Wind + PV" color="#3FA796" stats={wStats} current={curVals.windPv} isLive={isLive} />
          <StatCard label="Other renewables" color="#7A9B4E" stats={oStats} current={curVals.otherRenew} isLive={isLive} />
          <StatCard label="Residual load" color="#C4622D" stats={rStats} current={curVals.residualLoad} isLive={isLive} />
        </div>

        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Load vs. Wind+PV vs. Residual Load</h3>
              <p className="text-xs text-[var(--mp-text-6)] mt-0.5">
                {market.name} &middot; {isLive ? "today (live)" : viewDate} &middot; renewables cover {renewShareOfLoad.toFixed(1)}% of avg load
              </p>
            </div>
            <div className="flex items-start gap-4">
              {forecastAccuracy && forecastAccuracy.n_points > 0 && (
                <div className="text-right font-mono">
                  <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Forecast error (day-ahead)</div>
                  <div className="text-sm text-[var(--mp-text-2)]">
                    {forecastAccuracy.mape_pct.toFixed(1)}% <span className="text-[var(--mp-text-6)] text-xs">MAPE</span>
                    <span className="mx-1 text-[var(--mp-text-6)]">&middot;</span>
                    {(forecastAccuracy.mae_mw / 1000).toFixed(2)}GW <span className="text-[var(--mp-text-6)] text-xs">MAE</span>
                  </div>
                </div>
              )}
              <RangeBadge from={seriesFrom} to={seriesTo} />
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
              <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 12))} />
              <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
              <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
              <Area type="monotone" dataKey="windPv" name="Wind + PV" stroke="#3FA796" fill="url(#windPvGrad)" strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="consumption" name="Consumption" stroke="#E8C468" strokeWidth={2} dot={false} isAnimationActive={false} />
              {hasForecast && (
                <Line type="monotone" dataKey="consumptionForecast" name="Consumption (forecast)" stroke="#8a8a86" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
              )}
              <Line type="monotone" dataKey="residualLoad" name="Residual load" stroke="#C4622D" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Consumption</h3>
              <RangeBadge from={seriesFrom} to={seriesTo} />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E8C468" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#E8C468" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 8))} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} />
                <Area type="monotone" dataKey="consumption" stroke="#E8C468" strokeWidth={1.5} fill="url(#loadGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Other Renewables (Hydro, Biomass, Geothermal...)</h3>
              <RangeBadge from={seriesFrom} to={seriesTo} />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="otherGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7A9B4E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7A9B4E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 8))} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} />
                <Area type="monotone" dataKey="otherRenew" stroke="#7A9B4E" strokeWidth={1.5} fill="url(#otherGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {neighbors.length > 0 && (
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
            <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Cross-Border Physical Flows</h3>
                <p className="text-xs text-[var(--mp-text-6)] mt-0.5">
                  {market.name} &middot; all {neighbors.length} border{neighbors.length > 1 ? "s" : ""} &middot; positive = net export, negative = net import
                </p>
              </div>
              <div className="text-right font-mono">
                <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Total net position (avg)</div>
                <div className="text-lg font-semibold" style={{ color: totalNetAvg >= 0 ? "#3FA796" : "#C4622D" }}>
                  {totalNetAvg >= 0 ? "+" : ""}{(totalNetAvg / 1000).toFixed(2)}GW
                  <span className="text-xs text-[var(--mp-text-6)] font-normal ml-1">{totalNetAvg >= 0 ? "net exporter" : "net importer"}</span>
                </div>
                <div className="mt-1"><RangeBadge from={flowsFrom} to={flowsTo} /></div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b border-[var(--mp-border)]">
              {neighbors.map((n) => (
                <div key={n} className="flex items-center gap-1.5 font-mono">
                  <span className="w-2 h-2 inline-block rounded-full" style={{ background: NEIGHBOR_COLORS[n] || "#888" }} />
                  <span className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">{n}</span>
                  <span className="text-xs" style={{ color: flowAvgByNeighbor[n] >= 0 ? "#3FA796" : "#C4622D" }}>
                    {flowAvgByNeighbor[n] >= 0 ? "+" : ""}{(flowAvgByNeighbor[n] / 1000).toFixed(2)}GW
                  </span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={flowsChartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(flowsChartData.length / 10))} />
                <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
                <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${(v / 1000).toFixed(2)} GW`} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                {neighbors.map((n) => (
                  <Line key={n} type="monotone" dataKey={n} name={`→ ${n}`} stroke={NEIGHBOR_COLORS[n] || "#888"} strokeWidth={1} strokeOpacity={0.55} dot={false} isAnimationActive={false} />
                ))}
                <Line type="monotone" dataKey="total" name="Total net position" stroke="var(--mp-text-1)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeMarket === "DE" && ntpData && (
          <>
          <DateRangeControl
            effectiveFrom={ntpData.from}
            effectiveTo={ntpData.to}
            draft={deRangeDraft}
            onDraftChange={setDeRangeDraft}
            onApply={() => deRangeDraft.from && deRangeDraft.to && setDeRange({ ...deRangeDraft })}
            onReset={() => { setDeRange(null); setDeRangeDraft({ from: "", to: "" }); }}
            isCustom={!!deRange}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">reBAP — Ausgleichsenergiepreis</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Germany &middot; imbalance settlement price &middot; source: netztransparenz.de</p>
                </div>
                {reBapStats && (
                  <div className="flex gap-4 text-right font-mono">
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Avg</div><div className="text-sm text-[var(--mp-text-2)]">{reBapStats.avg.toFixed(2)}</div></div>
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Min</div><div className={`text-sm ${reBapStats.min < 0 ? "text-red-400" : "text-[var(--mp-text-2)]"}`}>{reBapStats.min.toFixed(2)}</div></div>
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Max</div><div className="text-sm text-amber-400">{reBapStats.max.toFixed(2)}</div></div>
                    <RangeBadge from={ntpData.reBapFrom} to={ntpData.reBapTo} />
                  </div>
                )}
              </div>
              {reBapChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={reBapChartData} margin={{ top: 5, right: 5, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(reBapChartData.length / 8))} angle={-35} textAnchor="end" height={40} />
                    <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45} />
                    <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${v.toFixed(2)} EUR/MWh`} />
                    <Line type="stepAfter" dataKey="rebap" stroke="#C4622D" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">Aucune donnée reBAP pour cette période.</div>
              )}
            </div>

            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">AEP-Schätzer</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Germany &middot; real-time reBAP estimate &middot; source: netztransparenz.de</p>
                </div>
                {aepStats && (
                  <div className="flex gap-4 text-right font-mono">
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Avg</div><div className="text-sm text-[var(--mp-text-2)]">{aepStats.avg.toFixed(2)}</div></div>
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Min</div><div className={`text-sm ${aepStats.min < 0 ? "text-red-400" : "text-[var(--mp-text-2)]"}`}>{aepStats.min.toFixed(2)}</div></div>
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Max</div><div className="text-sm text-amber-400">{aepStats.max.toFixed(2)}</div></div>
                    <RangeBadge from={ntpData.from} to={ntpData.to} />
                  </div>
                )}
              </div>
              {aepChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={aepChartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(aepChartData.length / 8))} />
                    <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45} />
                    <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${v.toFixed(2)} EUR/MWh`} />
                    <Line type="stepAfter" dataKey="aep" stroke="#4A94C4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">Aucune donnée AEP-Schätzer pour cette période.</div>
              )}
            </div>

            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">RZ-Saldo</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Germany &middot; control area balance by TSO (MW) &middot; source: netztransparenz.de</p>
                </div>
                <RangeBadge from={ntpData.from} to={ntpData.to} />
              </div>
              {rzSaldoChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={rzSaldoChartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(rzSaldoChartData.length / 8))} />
                    <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${v.toFixed(0)}`} />
                    <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${v.toFixed(1)} MW`} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                    {Object.keys(RZ_TSO_COLORS).map((tso) => (
                      <Line key={tso} type="monotone" dataKey={tso} stroke={RZ_TSO_COLORS[tso]} strokeWidth={1.2} dot={false} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">Aucune donnée RZ-Saldo pour cette période.</div>
              )}
            </div>

            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Redispatch</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Germany &middot; grid congestion measures &middot; source: netztransparenz.de</p>
                </div>
                <RangeBadge from={ntpData.from} to={ntpData.to} />
              </div>
              {redispatchSummary && redispatchSummary.count > 0 ? (
                <>
                  <div className="flex gap-6 font-mono mb-4">
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Events</div><div className="text-lg text-[var(--mp-text-1)]">{redispatchSummary.count}</div></div>
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Total energy</div><div className="text-lg text-[var(--mp-text-1)]">{redispatchSummary.totalEnergyMwh.toFixed(0)} MWh</div></div>
                  </div>
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                    {Object.entries(redispatchSummary.byReason)
                      .sort((a, b) => b[1] - a[1])
                      .map(([reason, mwh]) => (
                        <div key={reason} className="flex justify-between text-xs font-mono text-[var(--mp-text-5)]">
                          <span className="truncate mr-2">{reason}</span>
                          <span className="text-[var(--mp-text-3)] whitespace-nowrap">{mwh.toFixed(0)} MWh</span>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">Aucune mesure de redispatch pour cette période.</div>
              )}
            </div>

            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5 lg:col-span-2">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Activated Balancing Capacity — Net (Germany)</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">aFRR (SRL) &amp; mFRR (MRL), positive − negative &middot; qualitätsgesichert &middot; source: netztransparenz.de</p>
                </div>
                <RangeBadge from={ntpData.activationFrom} to={ntpData.activationTo} />
              </div>
              {activationChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={activationChartData} margin={{ top: 5, right: 5, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(activationChartData.length / 10))} angle={-35} textAnchor="end" height={40} />
                    <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={55} tickFormatter={(v) => `${v.toFixed(0)}MW`} />
                    <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${v.toFixed(1)} MW`} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                    <Line type="monotone" dataKey="afrr" name="aFRR net" stroke="#3FA796" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                    <Line type="monotone" dataKey="mfrr" name="mFRR net" stroke="#8B6FC9" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">Aucune donnée d&apos;activation pour cette période.</div>
              )}
            </div>
          </div>
          </>
        )}

        {!loading && !error && series.length === 0 && (
          <div className="border border-[var(--mp-border)] text-[var(--mp-text-5)] text-xs font-mono px-4 py-6 text-center">
            Aucune donnée pour cette sélection.
          </div>
        )}
      </main>

      <footer className="px-6 py-4 border-t border-[var(--mp-border)] text-[10px] font-mono text-[var(--mp-text-6)]">
        Residual load = Consumption − (Wind + PV). Historical range: max 7 days (15-min resolution), from stored data. Day-ahead forecast comparison available in historical view. reBAP/AEP-Schätzer/RZ-Saldo/aFRR/mFRR/Redispatch: Germany only, source netztransparenz.de.
      </footer>
    </div>
  );
}
