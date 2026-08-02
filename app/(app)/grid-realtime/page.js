"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ThemeToggle } from "../../theme-toggle";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${date} ${time}`;
}
function fmtBadge(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

function RangeBadge({ from, to }) {
  return (
    <div className="text-[10px] font-mono text-[var(--mp-text-6)] whitespace-nowrap">
      {fmtBadge(from)} &rarr; {fmtBadge(to)}
    </div>
  );
}

function DateRangeControl({ effectiveFrom, effectiveTo, draft, onDraftChange, onApply, onReset, isCustom }) {
  return (
    <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide font-mono">Range:</span>
      <div className="flex items-center gap-1.5 text-xs font-mono">
        <span className="text-[var(--mp-text-5)]">From</span>
        <input type="datetime-local" value={draft.from} onChange={(e) => onDraftChange({ ...draft, from: e.target.value })}
          className="bg-[var(--mp-bg-deep)] border border-[var(--mp-border)] text-[var(--mp-text-3)] px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400" />
        <span className="text-[var(--mp-text-5)]">To</span>
        <input type="datetime-local" value={draft.to} onChange={(e) => onDraftChange({ ...draft, to: e.target.value })}
          className="bg-[var(--mp-bg-deep)] border border-[var(--mp-border)] text-[var(--mp-text-3)] px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400" />
      </div>
      <button onClick={onApply} disabled={!draft.from || !draft.to}
        className="px-2 py-1 text-xs font-mono border border-[var(--mp-border)] text-[var(--mp-text-4)] hover:border-amber-400 hover:text-amber-400 disabled:opacity-40 disabled:cursor-not-allowed">
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

const RZ_TSO_COLORS = { "50Hertz": "#C4622D", Amprion: "#3FA796", "TenneT TSO": "#8B6FC9", TransnetBW: "#4A94C4" };
const TRAFFIC_LIGHT_SCORE = { RED_NEG: -2, YELLOW_NEG: -1, GREEN: 0, YELLOW_POS: 1, RED_POS: 2, BLUE: 0 };
const TRAFFIC_LIGHT_COLOR = { RED_NEG: "#C4622D", YELLOW_NEG: "#E8C468", GREEN: "#3FA796", YELLOW_POS: "#E8C468", RED_POS: "#C4622D", BLUE: "#4A94C4" };

export default function GridRealtimePage() {
  const [ntpData, setNtpData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deRange, setDeRange] = useState(null);
  const [deRangeDraft, setDeRangeDraft] = useState({ from: "", to: "" });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (deRange) {
      params.set("fromDt", deRange.from);
      params.set("toDt", deRange.to);
    }
    fetch(`/api/netztransparenz?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setNtpData(json);
      })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [deRange]);

  const redispatchSummary = ntpData?.redispatchSummary;

  const nrvSaldoChartData = (ntpData?.nrvSaldo || []).map((p) => ({ time: fmtDateTime(p.timestamp), value: p.value_mw }));
  const nrvSaldoStats = nrvSaldoChartData.length
    ? { avg: nrvSaldoChartData.reduce((s, r) => s + (r.value || 0), 0) / nrvSaldoChartData.length,
        min: Math.min(...nrvSaldoChartData.map((r) => r.value)), max: Math.max(...nrvSaldoChartData.map((r) => r.value)) }
    : null;

  const trafficLightChartData = (ntpData?.trafficLight || []).map((p) => ({ time: fmtDateTime(p.from), score: TRAFFIC_LIGHT_SCORE[p.value] ?? 0, value: p.value }));
  const trafficLightCurrent = ntpData?.trafficLight?.length ? ntpData.trafficLight[ntpData.trafficLight.length - 1] : null;

  const rzSaldoChartData = (ntpData?.rzSaldo || []).map((p) => ({ time: fmtTime(p.timestamp), fullTime: fmtDateTime(p.timestamp), "50Hertz": p["50Hertz"], Amprion: p.Amprion, "TenneT TSO": p["TenneT TSO"], TransnetBW: p.TransnetBW }));

  const aepChartData = (ntpData?.aepSchaetzer || []).map((p) => ({ time: fmtDateTime(p.timestamp), aep: p.aep_schaetzer_eur_mwh }));
  const aepStats = aepChartData.length
    ? { avg: aepChartData.reduce((s, r) => s + (r.aep || 0), 0) / aepChartData.length, min: Math.min(...aepChartData.map((r) => r.aep)), max: Math.max(...aepChartData.map((r) => r.aep)) }
    : null;

  const idAepChartData = (ntpData?.idAep || []).map((p) => ({ time: fmtDateTime(p.timestamp), value: p.value_eur_mwh }));
  const idAepStats = idAepChartData.length
    ? { avg: idAepChartData.reduce((s, r) => s + (r.value || 0), 0) / idAepChartData.length, min: Math.min(...idAepChartData.map((r) => r.value)), max: Math.max(...idAepChartData.map((r) => r.value)) }
    : null;

  function sumGermany(rows) {
    const byTs = new Map();
    for (const r of rows || []) {
      const { timestamp, ...rest } = r;
      byTs.set(timestamp, Object.values(rest).reduce((s, v) => s + (v || 0), 0));
    }
    return [...byTs.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([ts, total]) => ({ time: fmtTime(ts), fullTime: fmtDateTime(ts), value: total }));
  }
  const hochrechnungSolarData = sumGermany(ntpData?.hochrechnungSolar);
  const hochrechnungWindData = sumGermany(ntpData?.hochrechnungWind);
  const hochrechnungChartData = useMemo(() => {
    const byTime = new Map();
    hochrechnungSolarData.forEach((r) => byTime.set(r.time, { time: r.time, fullTime: r.fullTime, solar: r.value }));
    hochrechnungWindData.forEach((r) => { const row = byTime.get(r.time) || { time: r.time, fullTime: r.fullTime }; row.wind = r.value; byTime.set(r.time, row); });
    return [...byTime.values()];
  }, [hochrechnungSolarData, hochrechnungWindData]);

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">Grid Real Time</h1>
          <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Germany &middot; system balance, congestion &amp; renewable extrapolation &middot; source: netztransparenz.de</p>
        </div>
        <ThemeToggle />
      </header>

      <main className="p-6 space-y-5">
        {error && <div className="border border-red-500/40 text-red-400 text-xs font-mono px-4 py-3">{error}</div>}

        <DateRangeControl
          effectiveFrom={ntpData?.from} effectiveTo={ntpData?.to}
          draft={deRangeDraft} onDraftChange={setDeRangeDraft}
          onApply={() => deRangeDraft.from && deRangeDraft.to && setDeRange({ ...deRangeDraft })}
          onReset={() => { setDeRange(null); setDeRangeDraft({ from: "", to: "" }); }}
          isCustom={!!deRange}
        />

        {ntpData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">NRV-Saldo</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">System imbalance (MW)</p>
                </div>
                {nrvSaldoStats && (
                  <div className="flex gap-4 text-right font-mono">
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase">Avg</div><div className="text-sm text-[var(--mp-text-2)]">{nrvSaldoStats.avg.toFixed(0)}</div></div>
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase">Min</div><div className={`text-sm ${nrvSaldoStats.min < 0 ? "text-red-400" : "text-[var(--mp-text-2)]"}`}>{nrvSaldoStats.min.toFixed(0)}</div></div>
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase">Max</div><div className="text-sm text-amber-400">{nrvSaldoStats.max.toFixed(0)}</div></div>
                    <RangeBadge from={ntpData.from} to={ntpData.to} />
                  </div>
                )}
              </div>
              {nrvSaldoChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={nrvSaldoChartData} margin={{ top: 5, right: 5, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                    <ReferenceLine y={0} stroke="var(--mp-grid)" />
                    <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(nrvSaldoChartData.length / 8))} angle={-35} textAnchor="end" height={40} />
                    <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${v.toFixed(1)} MW`} />
                    <Line type="monotone" dataKey="value" stroke="#E8C468" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">No data.</div>}
            </div>

            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">System Traffic Light</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Grid stress indicator, 1-min</p>
                </div>
                <div className="flex items-center gap-3">
                  {trafficLightCurrent && (
                    <div className="flex items-center gap-2 font-mono">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: TRAFFIC_LIGHT_COLOR[trafficLightCurrent.value] || "#666" }} />
                      <span className="text-sm text-[var(--mp-text-2)]">{trafficLightCurrent.value}</span>
                    </div>
                  )}
                  <RangeBadge from={ntpData.from} to={ntpData.to} />
                </div>
              </div>
              {trafficLightChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trafficLightChartData} margin={{ top: 5, right: 5, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                    <ReferenceLine y={0} stroke="var(--mp-grid)" />
                    <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(trafficLightChartData.length / 8))} angle={-35} textAnchor="end" height={40} />
                    <YAxis domain={[-2, 2]} ticks={[-2, -1, 0, 1, 2]} tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v, n, p) => p.payload.value} />
                    <Line type="stepAfter" dataKey="score" stroke="#C4622D" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">No data.</div>}
            </div>

            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">RZ-Saldo</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Control area balance by TSO (MW)</p>
                </div>
                <RangeBadge from={ntpData.from} to={ntpData.to} />
              </div>
              {rzSaldoChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={rzSaldoChartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(rzSaldoChartData.length / 8))} />
                    <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${v.toFixed(1)} MW`} labelFormatter={(_, payload) => (payload && payload[0] ? payload[0].payload.fullTime : "")} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                    {Object.keys(RZ_TSO_COLORS).map((tso) => (
                      <Line key={tso} type="monotone" dataKey={tso} stroke={RZ_TSO_COLORS[tso]} strokeWidth={1.2} dot={false} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">No data.</div>}
            </div>

            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">AEP-Schätzer &amp; ID AEP</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Real-time / intraday balancing price proxies (EUR/MWh)</p>
                </div>
                <RangeBadge from={ntpData.from} to={ntpData.to} />
              </div>
              {aepChartData.length > 0 || idAepChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart margin={{ top: 5, right: 5, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                    <XAxis dataKey="time" type="category" allowDuplicatedCategory={false} tick={{ fill: "var(--mp-tick)", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(Math.max(aepChartData.length, idAepChartData.length) / 8))} angle={-35} textAnchor="end" height={40} />
                    <YAxis tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45} />
                    <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => `${v.toFixed(2)} EUR/MWh`} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                    <Line data={aepChartData} type="stepAfter" dataKey="aep" name="AEP-Schätzer" stroke="#4A94C4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Line data={idAepChartData} type="stepAfter" dataKey="value" name="ID AEP" stroke="#8B6FC9" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">No data.</div>}
            </div>

            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Hochrechnung Solar &amp; Wind</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Real-time renewable extrapolation, DE total &middot; Solar (GW, left) / Wind (MW, right) — separate scales</p>
                </div>
                <RangeBadge from={ntpData.from} to={ntpData.to} />
              </div>
              {hochrechnungChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={hochrechnungChartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="solarGradRT" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E8C468" stopOpacity={0.35} /><stop offset="95%" stopColor="#E8C468" stopOpacity={0} /></linearGradient>
                      <linearGradient id="windGradRT" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4A94C4" stopOpacity={0.35} /><stop offset="95%" stopColor="#4A94C4" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "var(--mp-tick)", fontSize: 10, fontFamily: "monospace" }} axisLine={{ stroke: "var(--mp-grid)" }} tickLine={false} interval={Math.max(0, Math.floor(hochrechnungChartData.length / 8))} />
                    <YAxis yAxisId="solar" tick={{ fill: "#E8C468", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}GW`} />
                    <YAxis yAxisId="wind" orientation="right" tick={{ fill: "#4A94C4", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${v.toFixed(0)}MW`} />
                    <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v, n) => n === "Solar" ? `${(v / 1000).toFixed(2)} GW` : `${v.toFixed(1)} MW`} labelFormatter={(_, payload) => (payload && payload[0] ? payload[0].payload.fullTime : "")} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                    <Area yAxisId="solar" type="monotone" dataKey="solar" name="Solar" stroke="#E8C468" strokeWidth={1.5} fill="url(#solarGradRT)" isAnimationActive={false} connectNulls />
                    <Area yAxisId="wind" type="monotone" dataKey="wind" name="Wind" stroke="#4A94C4" strokeWidth={1.5} fill="url(#windGradRT)" isAnimationActive={false} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">No data.</div>}
            </div>

            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Redispatch</h3>
                  <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Grid congestion measures</p>
                </div>
                <RangeBadge from={ntpData.from} to={ntpData.to} />
              </div>
              {redispatchSummary && redispatchSummary.count > 0 ? (
                <>
                  <div className="flex gap-6 font-mono mb-4">
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase">Events</div><div className="text-lg text-[var(--mp-text-1)]">{redispatchSummary.count}</div></div>
                    <div><div className="text-[10px] text-[var(--mp-text-6)] uppercase">Total energy</div><div className="text-lg text-[var(--mp-text-1)]">{redispatchSummary.totalEnergyMwh.toFixed(0)} MWh</div></div>
                  </div>
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                    {Object.entries(redispatchSummary.byReason).sort((a, b) => b[1] - a[1]).map(([reason, mwh]) => (
                      <div key={reason} className="flex justify-between text-xs font-mono text-[var(--mp-text-5)]">
                        <span className="truncate mr-2">{reason}</span>
                        <span className="text-[var(--mp-text-3)] whitespace-nowrap">{mwh.toFixed(0)} MWh</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-8">No redispatch measures.</div>}
            </div>
          </div>
        )}

        {loading && !ntpData && <div className="text-xs text-[var(--mp-text-6)] font-mono text-center py-12">Loading...</div>}
      </main>
    </div>
  );
}
