"use client";

import React, { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ThemeToggle } from "../../theme-toggle";

const ASSET_TYPES = [
  { key: "wind", label: "Wind", color: "#3FA796" },
  { key: "pv", label: "PV", color: "#E8C468" },
  { key: "bess", label: "BESS", color: "#4A94C4" },
  { key: "flexible", label: "Flexible", color: "#8B6FC9" },
  { key: "dsm", label: "DSM", color: "#C97A5A" },
];
const PPA_STRUCTURES = ["fixed", "floating", "cap_floor", "pay_as_produced", "baseload"];
const COUNTRIES = ["DE", "FR", "IT", "ES"];
const TSO_BY_COUNTRY = {
  DE: ["50Hertz", "Amprion", "TenneT TSO", "TransnetBW"],
  FR: ["RTE"],
  IT: ["Terna"],
  ES: ["REE"],
};

function typeColor(t) {
  return ASSET_TYPES.find((a) => a.key === t)?.color || "var(--mp-text-4)";
}
function fmtNum(v, digits = 1) {
  return v === null || v === undefined ? "—" : Number(v).toLocaleString("en-GB", { maximumFractionDigits: digits });
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ---------------- Unité: fonction de conversion standardisée ----------------
// Toute valeur affichée (Explorateur, Arbre, futurs exports) doit passer par
// convertUnit() avant rendu — c'est le point unique de vérité pour la
// correspondance grandeur physique <-> unité choisie. Ne jamais multiplier/
// diviser une valeur inline ailleurs dans le composant.
const POWER_UNITS = ["kW", "MW", "GW"];
const ENERGY_UNITS = ["kWh", "MWh", "GWh", "TWh"];
// Facteurs relatifs à l'unité de base retournée par l'API (MW pour la
// puissance, MWh pour l'énergie) = 1.
const UNIT_FACTORS = { kW: 1000, MW: 1, GW: 0.001, kWh: 1000, MWh: 1, GWh: 0.001, TWh: 0.000001 };

function isEnergyUnit(unit) {
  return ENERGY_UNITS.includes(unit);
}
function unitOptionsFor(baseUnit) {
  return baseUnit === "MWh" ? ENERGY_UNITS : POWER_UNITS;
}
// value: nombre dans l'unité de base (MW ou MWh) telle que renvoyée par l'API.
// baseUnit: "MW" | "MWh" — l'unité de base de `value`.
// targetUnit: une des 7 unités supportées, DOIT être du même type physique que baseUnit
//             (puissance -> puissance, énergie -> énergie); sinon retourne null (garde-fou).
function convertUnit(value, baseUnit, targetUnit) {
  if (value === null || value === undefined) return null;
  const baseIsEnergy = baseUnit === "MWh";
  const targetIsEnergy = isEnergyUnit(targetUnit);
  if (baseIsEnergy !== targetIsEnergy) return null; // conversion incohérente (puissance <-> énergie), refusée
  const factor = UNIT_FACTORS[targetUnit];
  if (factor === undefined) return null;
  return value * factor;
}

const inputCls =
  "bg-[var(--mp-bg-deep)] border border-[var(--mp-border)] text-[var(--mp-text-3)] px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-amber-400 w-full";
const labelCls = "text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide block mb-1";
const btnCls =
  "px-3 py-1.5 text-xs font-mono border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 transition-colors";
const tabCls = (active) =>
  `px-3 py-1.5 text-xs font-mono border ${
    active ? "border-amber-400 text-amber-400" : "border-[var(--mp-border)] text-[var(--mp-text-5)] hover:text-[var(--mp-text-3)]"
  }`;

// ---------------- Assets tab ----------------
function AssetsTab({ assets, loading, error, onCreated, onDeleted }) {
  const [form, setForm] = useState({ name: "", asset_type: "wind", country: "DE", tso: "", capacity_mw: "", capacity_mwh: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/portfolio/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tso: form.tso || null,
          capacity_mw: Number(form.capacity_mw),
          capacity_mwh: form.capacity_mwh ? Number(form.capacity_mwh) : null,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setForm({ name: "", asset_type: "wind", country: "DE", tso: "", capacity_mw: "", capacity_mwh: "" });
      setShowForm(false);
      onCreated();
    } catch (err) {
      setFormError(String(err.message || err));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id) {
    if (!confirm("Supprimer cet actif ?")) return;
    await fetch(`/api/portfolio/assets/${id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Actifs ({assets?.length ?? 0})</h3>
        <button className={btnCls} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Annuler" : "+ Nouvel actif"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div>
            <label className={labelCls}>Nom</label>
            <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select className={inputCls} value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })}>
              {ASSET_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Pays</label>
            <select className={inputCls} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value, tso: "" })}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>TSO</label>
            <select className={inputCls} value={form.tso} onChange={(e) => setForm({ ...form, tso: e.target.value })}>
              <option value="">— non assigné —</option>
              {(TSO_BY_COUNTRY[form.country] || []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Capacité (MW)</label>
            <input required type="number" step="0.01" className={inputCls} value={form.capacity_mw} onChange={(e) => setForm({ ...form, capacity_mw: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Capacité (MWh, BESS)</label>
            <input type="number" step="0.01" className={inputCls} value={form.capacity_mwh} onChange={(e) => setForm({ ...form, capacity_mwh: e.target.value })} />
          </div>
          <div className="col-span-2 md:col-span-6 flex items-center gap-3">
            <button disabled={submitting} className={btnCls} type="submit">{submitting ? "..." : "Créer"}</button>
            {formError && <span className="text-xs font-mono text-red-400">{formError}</span>}
          </div>
        </form>
      )}

      {error && <div className="border border-red-500/40 text-red-400 text-xs font-mono px-4 py-3">{error}</div>}

      <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-[var(--mp-border)] text-[var(--mp-text-6)] uppercase tracking-wide">
              <th className="text-left px-3 py-2">Nom</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Pays</th>
              <th className="text-left px-3 py-2">TSO</th>
              <th className="text-right px-3 py-2">MW</th>
              <th className="text-right px-3 py-2">MWh</th>
              <th className="text-left px-3 py-2">Statut</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center text-[var(--mp-text-6)] py-6">Chargement...</td></tr>
            ) : (assets || []).length === 0 ? (
              <tr><td colSpan={8} className="text-center text-[var(--mp-text-6)] py-6">Aucun actif. Ajoute-en un ci-dessus.</td></tr>
            ) : (
              assets.map((a) => (
                <tr key={a.id} className="border-b border-[var(--mp-border)] text-[var(--mp-text-3)] hover:bg-[var(--mp-panel-alt)]">
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2"><span style={{ color: typeColor(a.asset_type) }}>{a.asset_type}</span></td>
                  <td className="px-3 py-2">{a.country}</td>
                  <td className="px-3 py-2 text-[var(--mp-text-5)]">{a.tso || "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(a.capacity_mw)}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(a.capacity_mwh)}</td>
                  <td className="px-3 py-2 text-[var(--mp-text-5)]">{a.status}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(a.id)} className="text-[var(--mp-text-6)] hover:text-red-400">✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- PPA tab ----------------
function PPATab({ assets, ppas, loading, error, onCreated, onDeleted }) {
  const [form, setForm] = useState({
    asset_id: "", counterparty: "", structure: "fixed", strike_price_eur_mwh: "",
    cap_eur_mwh: "", floor_eur_mwh: "", volume_mw: "", start_date: isoDaysAgo(0), end_date: "", country: "DE",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/portfolio/ppa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          asset_id: form.asset_id ? Number(form.asset_id) : null,
          strike_price_eur_mwh: form.strike_price_eur_mwh ? Number(form.strike_price_eur_mwh) : null,
          cap_eur_mwh: form.cap_eur_mwh ? Number(form.cap_eur_mwh) : null,
          floor_eur_mwh: form.floor_eur_mwh ? Number(form.floor_eur_mwh) : null,
          volume_mw: form.volume_mw ? Number(form.volume_mw) : null,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setShowForm(false);
      onCreated();
    } catch (err) {
      setFormError(String(err.message || err));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id) {
    if (!confirm("Supprimer ce contrat PPA ?")) return;
    await fetch(`/api/portfolio/ppa/${id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Contrats PPA ({ppas?.length ?? 0})</h3>
        <button className={btnCls} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Annuler" : "+ Nouveau PPA"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-4 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className={labelCls}>Actif lié</label>
            <select className={inputCls} value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })}>
              <option value="">— aucun —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Contrepartie</label>
            <input required className={inputCls} value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Structure</label>
            <select className={inputCls} value={form.structure} onChange={(e) => setForm({ ...form, structure: e.target.value })}>
              {PPA_STRUCTURES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Pays</label>
            <select className={inputCls} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Strike (€/MWh)</label>
            <input type="number" step="0.01" className={inputCls} value={form.strike_price_eur_mwh} onChange={(e) => setForm({ ...form, strike_price_eur_mwh: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Cap (€/MWh)</label>
            <input type="number" step="0.01" className={inputCls} value={form.cap_eur_mwh} onChange={(e) => setForm({ ...form, cap_eur_mwh: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Floor (€/MWh)</label>
            <input type="number" step="0.01" className={inputCls} value={form.floor_eur_mwh} onChange={(e) => setForm({ ...form, floor_eur_mwh: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Volume (MW)</label>
            <input type="number" step="0.01" className={inputCls} value={form.volume_mw} onChange={(e) => setForm({ ...form, volume_mw: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Début</label>
            <input required type="date" className={inputCls} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Fin</label>
            <input required type="date" className={inputCls} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <div className="col-span-2 md:col-span-4 flex items-center gap-3">
            <button disabled={submitting} className={btnCls} type="submit">{submitting ? "..." : "Créer"}</button>
            {formError && <span className="text-xs font-mono text-red-400">{formError}</span>}
          </div>
        </form>
      )}

      {error && <div className="border border-red-500/40 text-red-400 text-xs font-mono px-4 py-3">{error}</div>}

      <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-[var(--mp-border)] text-[var(--mp-text-6)] uppercase tracking-wide">
              <th className="text-left px-3 py-2">Contrepartie</th>
              <th className="text-left px-3 py-2">Actif</th>
              <th className="text-left px-3 py-2">Structure</th>
              <th className="text-right px-3 py-2">Strike</th>
              <th className="text-right px-3 py-2">Cap/Floor</th>
              <th className="text-left px-3 py-2">Période</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-[var(--mp-text-6)] py-6">Chargement...</td></tr>
            ) : (ppas || []).length === 0 ? (
              <tr><td colSpan={7} className="text-center text-[var(--mp-text-6)] py-6">Aucun contrat PPA.</td></tr>
            ) : (
              ppas.map((p) => (
                <tr key={p.id} className="border-b border-[var(--mp-border)] text-[var(--mp-text-3)] hover:bg-[var(--mp-panel-alt)]">
                  <td className="px-3 py-2">{p.counterparty}</td>
                  <td className="px-3 py-2 text-[var(--mp-text-5)]">{assets.find((a) => a.id === p.asset_id)?.name || "—"}</td>
                  <td className="px-3 py-2">{p.structure}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(p.strike_price_eur_mwh, 2)}</td>
                  <td className="px-3 py-2 text-right">{p.cap_eur_mwh || p.floor_eur_mwh ? `${fmtNum(p.floor_eur_mwh, 0)}/${fmtNum(p.cap_eur_mwh, 0)}` : "—"}</td>
                  <td className="px-3 py-2 text-[var(--mp-text-5)]">{p.start_date?.slice(0, 10)} → {p.end_date?.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(p.id)} className="text-[var(--mp-text-6)] hover:text-red-400">✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- P&L tab ----------------
function PnlTab({ assets }) {
  const [assetId, setAssetId] = useState("");
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [pnl, setPnl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!assetId) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ asset_id: assetId, from, to });
    fetch(`/api/portfolio/pnl?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => { if (json.error) setError(json.error); else setPnl(json); })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [assetId, from, to]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">P&amp;L par actif</h3>
      <div className="flex flex-wrap items-end gap-3 border border-[var(--mp-border)] bg-[var(--mp-panel)] p-4">
        <div>
          <label className={labelCls}>Actif</label>
          <select className={inputCls} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">— choisir —</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Du</label>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Au</label>
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {error && <div className="border border-red-500/40 text-red-400 text-xs font-mono px-4 py-3">{error}</div>}
      {!assetId && <div className="text-xs font-mono text-[var(--mp-text-6)] text-center py-8">Sélectionne un actif pour calculer le P&amp;L.</div>}
      {loading && <div className="text-xs font-mono text-[var(--mp-text-6)] text-center py-8">Calcul en cours...</div>}

      {pnl && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
              <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Volume</div>
              <div className="text-xl font-mono font-semibold text-[var(--mp-text-1)]">{fmtNum(pnl.total_mwh)} MWh</div>
            </div>
            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
              <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Revenu marché</div>
              <div className="text-xl font-mono font-semibold text-[var(--mp-text-1)]">€{fmtNum(pnl.market_revenue_eur, 0)}</div>
            </div>
            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
              <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Revenu PPA</div>
              <div className="text-xl font-mono font-semibold text-amber-400">€{fmtNum(pnl.ppa_revenue_eur, 0)}</div>
            </div>
            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
              <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Valeur couverture</div>
              <div className={`text-xl font-mono font-semibold ${pnl.hedge_value_eur >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {pnl.hedge_value_eur >= 0 ? "+" : ""}€{fmtNum(pnl.hedge_value_eur, 0)}
              </div>
            </div>
          </div>
          {pnl.points?.length === 0 && (
            <div className="text-xs font-mono text-[var(--mp-text-6)] text-center py-6 border border-[var(--mp-border)] bg-[var(--mp-panel)]">
              Aucune position enregistrée pour cet actif sur cette période (table <code>asset_positions</code> vide — à alimenter via import métering/SCADA).
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Tree tab ----------------
const METRIC_DEFS = [
  { key: "forecast", label: "Forecast", color: "#8FA8C7" },
  { key: "actual", label: "Actual", color: "#E8C468" },
  { key: "traded_da", label: "Traded DA", color: "#3FA796" },
  { key: "traded_id", label: "Traded ID", color: "#4A94C4" },
  { key: "nominated_ppa", label: "PPA", color: "#8B6FC9" },
  { key: "open_position", label: "Open Pos.", color: null },
];

function MetricsRow({ metrics, unit }) {
  if (!metrics) return null;
  const hasAny = Object.values(metrics).some((v) => v !== 0);
  if (!hasAny) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-5 pb-1.5">
      {METRIC_DEFS.map((m) => {
        const v = convertUnit(metrics[m.key], "MWh", unit);
        if (v === null || v === undefined) return null;
        const isOpen = m.key === "open_position";
        const color = isOpen ? (v >= 0 ? "#4ADE80" : "#F87171") : m.color;
        return (
          <span key={m.key} className="text-[10px] font-mono" style={{ color: color || "var(--mp-text-6)" }}>
            {m.label}: {isOpen && v >= 0 ? "+" : ""}{fmtNum(v, 3)} {unit}
          </span>
        );
      })}
    </div>
  );
}

function TreeNode({ label, sublabel, mw, metrics, unit, color, depth, children, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? depth < 2);
  const hasChildren = !!children;
  return (
    <div style={{ marginLeft: depth * 18 }}>
      <div
        className={`flex items-center justify-between py-1.5 pr-2 border-b border-[var(--mp-border)] ${hasChildren ? "cursor-pointer hover:bg-[var(--mp-panel-alt)]" : ""}`}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          {hasChildren && <span className="text-[var(--mp-text-6)] text-xs w-3">{open ? "−" : "+"}</span>}
          {!hasChildren && <span className="w-3" />}
          <span className="text-xs font-mono" style={{ color: color || "var(--mp-text-2)" }}>{label}</span>
          {sublabel && <span className="text-[10px] text-[var(--mp-text-6)] font-mono">{sublabel}</span>}
        </div>
        <span className="text-xs font-mono text-[var(--mp-text-4)]">{fmtNum(mw)} MW</span>
      </div>
      <MetricsRow metrics={metrics} unit={unit} />
      {hasChildren && open && <div>{children}</div>}
    </div>
  );
}

function TreeTab() {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [country, setCountry] = useState("");
  const [date, setDate] = useState(isoDaysAgo(0));
  const [unit, setUnit] = useState("MWh");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ ...(country ? { country } : {}), date });
    fetch(`/api/portfolio/tree?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => { if (json.error) setError(json.error); else setTree(json.portfolio); })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [country, date]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Portfolio → TSO → Technologie</h3>
        <div className="flex gap-2">
          <input type="date" className={inputCls + " w-auto"} value={date} onChange={(e) => setDate(e.target.value)} />
          <select className={inputCls + " w-auto"} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Tous les pays</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={inputCls + " w-auto"} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {ENERGY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="border border-red-500/40 text-red-400 text-xs font-mono px-4 py-3">{error}</div>}
      {loading && <div className="text-xs font-mono text-[var(--mp-text-6)] text-center py-8">Chargement...</div>}

      {tree && !loading && (
        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-2">
          <TreeNode label="Portfolio" sublabel={`${tree.asset_count} actifs · ${date}`} mw={tree.capacity_mw} metrics={tree.metrics} unit={unit} depth={0} defaultOpen>
            {tree.tso_nodes.length === 0 ? (
              <div className="pl-6 py-4 text-xs font-mono text-[var(--mp-text-6)]">Aucun actif à agréger.</div>
            ) : (
              tree.tso_nodes.map((tso) => (
                <TreeNode
                  key={`${tso.country}::${tso.tso}`}
                  label={tso.tso}
                  sublabel={tso.country}
                  mw={tso.capacity_mw}
                  metrics={tso.metrics}
                  unit={unit}
                  depth={1}
                >
                  {tso.technologies.map((tech) => (
                    <TreeNode
                      key={tech.asset_type}
                      label={ASSET_TYPES.find((t) => t.key === tech.asset_type)?.label || tech.asset_type}
                      color={typeColor(tech.asset_type)}
                      mw={tech.capacity_mw}
                      metrics={tech.metrics}
                      unit={unit}
                      depth={2}
                    >
                      {tech.assets.map((a) => (
                        <TreeNode key={a.id} label={a.name} sublabel={a.status} mw={a.capacity_mw} metrics={a.metrics} unit={unit} depth={3} />
                      ))}
                    </TreeNode>
                  ))}
                </TreeNode>
              ))
            )}
          </TreeNode>
        </div>
      )}
    </div>
  );
}

// ---------------- Timeseries Explorer (multi-node, multi-série, multi-résolution) ----------------
const SERIES_DEFS = [
  { key: "forecast", label: "Forecast" },
  { key: "actual", label: "Actual" },
  { key: "traded_da", label: "Traded DA" },
  { key: "traded_id", label: "Traded ID" },
  { key: "nominated_ppa", label: "PPA" },
  { key: "open_position", label: "Open Position" },
];
const RESOLUTION_OPTIONS = [
  { key: "15m", label: "15 min" },
  { key: "30m", label: "30 min" },
  { key: "1h", label: "1 heure" },
  { key: "4h", label: "4 heures" },
  { key: "1D", label: "1 jour" },
  { key: "1W", label: "1 semaine" },
  { key: "1M", label: "1 mois" },
  { key: "1Q", label: "1 trimestre" },
  { key: "1Y", label: "1 an" },
];
const PALETTE = ["#E8C468", "#3FA796", "#4A94C4", "#8B6FC9", "#C97A5A", "#F87171", "#4ADE80", "#60A5FA", "#FBBF24", "#F472B6"];

function formatBucketLabel(iso, resolution) {
  const d = new Date(iso);
  if (["15m", "30m", "1h", "4h"].includes(resolution)) {
    return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  if (resolution === "1D") return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  if (resolution === "1W") return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " (sem.)";
  if (resolution === "1M") return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
  if (resolution === "1Q") return `T${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (resolution === "1Y") return `${d.getUTCFullYear()}`;
  return iso;
}

function SelectableTreeNode({ label, sublabel, mw, nodeKey, depth, children, selected, onToggle, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? depth < 1);
  const hasChildren = !!children;
  const isSelected = selected.has(nodeKey);
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-2 py-1 pr-2 border-b border-[var(--mp-border)]">
        {hasChildren ? (
          <span className="text-[var(--mp-text-6)] text-xs w-3 cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>{open ? "−" : "+"}</span>
        ) : <span className="w-3" />}
        <input type="checkbox" className="accent-amber-500 cursor-pointer" checked={isSelected} onChange={() => onToggle(nodeKey, label)} />
        <span className="text-xs font-mono flex-1 truncate">{label}</span>
        {sublabel && <span className="text-[10px] text-[var(--mp-text-6)] font-mono">{sublabel}</span>}
        <span className="text-[10px] font-mono text-[var(--mp-text-6)] ml-2 shrink-0">{fmtNum(mw)} MW</span>
      </div>
      {hasChildren && open && <div>{children}</div>}
    </div>
  );
}

function TimeseriesExplorerTab() {
  const [treeData, setTreeData] = useState(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [selected, setSelected] = useState(new Map()); // nodeKey -> label
  const [seriesTypes, setSeriesTypes] = useState(["forecast", "actual"]);
  const [resolution, setResolution] = useState("1h");
  const [from, setFrom] = useState(isoDaysAgo(0));
  const [to, setTo] = useState(isoDaysAgo(-1));
  const [result, setResult] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState(null);
  const [displayUnit, setDisplayUnit] = useState("MW");
  const [viewMode, setViewMode] = useState("chart"); // chart | table

  const isEnergyMode = result?.unit === "MWh";
  const unitOptions = unitOptionsFor(result?.unit || "MW");

  useEffect(() => {
    if (result) setDisplayUnit(result.unit === "MWh" ? "MWh" : "MW");
  }, [result?.unit]);

  useEffect(() => {
    fetch("/api/portfolio/tree")
      .then((r) => r.json())
      .then((json) => { if (!json.error) setTreeData(json.portfolio); })
      .finally(() => setLoadingTree(false));
  }, []);

  function toggleNode(key, label) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key); else next.set(key, label);
      return next;
    });
  }

  function toggleSeries(s) {
    setSeriesTypes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function loadChart() {
    if (selected.size === 0 || seriesTypes.length === 0) return;
    setLoadingChart(true);
    setChartError(null);
    try {
      const res = await fetch("/api/portfolio/node-timeseries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeKeys: [...selected.keys()],
          seriesTypes,
          resolution,
          from: `${from}T00:00:00.000Z`,
          to: `${to}T00:00:00.000Z`,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResult(json);
    } catch (err) {
      setChartError(String(err.message || err));
    } finally {
      setLoadingChart(false);
    }
  }

  const chartData = React.useMemo(() => {
    if (!result) return [];
    const allTs = new Set();
    result.series.forEach((s) => s.points.forEach((p) => allTs.add(p.t)));
    const sortedTs = [...allTs].sort();
    const seriesMaps = result.series.map((s) => ({
      key: `${s.node_key}__${s.series_type}`,
      map: new Map(s.points.map((p) => [p.t, p.value])),
    }));
    return sortedTs.map((t) => {
      const row = { t: formatBucketLabel(t, resolution) };
      seriesMaps.forEach((sm) => {
        const raw = sm.map.get(t);
        row[sm.key] = convertUnit(raw, result.unit, displayUnit);
      });
      return row;
    });
  }, [result, resolution, displayUnit]);

  const lineDefs = result
    ? result.series.map((s, i) => ({
        key: `${s.node_key}__${s.series_type}`,
        label: `${s.label} · ${SERIES_DEFS.find((d) => d.key === s.series_type)?.label || s.series_type}`,
        color: PALETTE[i % PALETTE.length],
      }))
    : [];

  function renderNode(node, depth, keyPrefix) {
    return (
      <SelectableTreeNode key={keyPrefix} label={node.label} sublabel={node.sublabel} mw={node.mw} nodeKey={node.key} depth={depth} selected={selected} onToggle={toggleNode} defaultOpen={depth < 1}>
        {node.children && node.children.length > 0 ? node.children.map((c, i) => renderNode(c, depth + 1, `${keyPrefix}-${i}`)) : undefined}
      </SelectableTreeNode>
    );
  }

  // Construit l'arbre de sélection { key, label, sublabel, mw, children } à partir de /api/portfolio/tree.
  const selectionTree = treeData
    ? {
        key: "portfolio", label: "Portfolio", sublabel: `${treeData.asset_count} actifs`, mw: treeData.capacity_mw,
        children: treeData.tso_nodes.map((tso) => ({
          key: `tso|${tso.country}|${tso.tso}`, label: tso.tso, sublabel: tso.country, mw: tso.capacity_mw,
          children: tso.technologies.map((tech) => ({
            key: `tech|${tso.country}|${tso.tso}|${tech.asset_type}`,
            label: ASSET_TYPES.find((t) => t.key === tech.asset_type)?.label || tech.asset_type,
            mw: tech.capacity_mw,
            children: tech.assets.map((a) => ({ key: `asset|${a.id}`, label: a.name, sublabel: a.status, mw: a.capacity_mw })),
          })),
        })),
      }
    : null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm tracking-[0.15em] text-[var(--mp-text-4)] font-mono uppercase">Explorateur de séries temporelles</h3>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Sélection des noeuds */}
        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-2 max-h-[420px] overflow-y-auto">
          <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide px-1 pb-1">
            Noeuds ({selected.size} sélectionné{selected.size > 1 ? "s" : ""})
          </div>
          {loadingTree ? (
            <div className="text-xs font-mono text-[var(--mp-text-6)] text-center py-6">Chargement...</div>
          ) : selectionTree ? (
            renderNode(selectionTree, 0, "root")
          ) : null}
        </div>

        {/* Contrôles + graphique */}
        <div className="space-y-3">
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-4 space-y-3">
            <div>
              <label className={labelCls}>Séries</label>
              <div className="flex flex-wrap gap-3">
                {SERIES_DEFS.map((s) => (
                  <label key={s.key} className="flex items-center gap-1.5 text-xs font-mono text-[var(--mp-text-3)] cursor-pointer">
                    <input type="checkbox" className="accent-amber-500" checked={seriesTypes.includes(s.key)} onChange={() => toggleSeries(s.key)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className={labelCls}>Résolution</label>
                <select className={inputCls} value={resolution} onChange={(e) => setResolution(e.target.value)}>
                  {RESOLUTION_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Du</label>
                <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Au</label>
                <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <button className={btnCls} onClick={loadChart} disabled={loadingChart || selected.size === 0 || seriesTypes.length === 0}>
                {loadingChart ? "..." : "Charger"}
              </button>
            </div>
            {selected.size === 0 && <div className="text-[10px] font-mono text-[var(--mp-text-6)]">Sélectionne au moins un noeud à gauche.</div>}
            {chartError && <div className="text-xs font-mono text-red-400">{chartError}</div>}
          </div>

          {result && (
            <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">
                  {isEnergyMode ? "Volume cumulé par pas" : "Puissance moyenne par pas"}
                </div>
                <div className="flex items-center gap-3">
                  <select className={inputCls + " w-auto"} value={displayUnit} onChange={(e) => setDisplayUnit(e.target.value)}>
                    {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <div className="flex border border-[var(--mp-border)]">
                    <button
                      className={`px-2.5 py-1 text-[10px] font-mono ${viewMode === "chart" ? "bg-amber-500/15 text-amber-400" : "text-[var(--mp-text-6)]"}`}
                      onClick={() => setViewMode("chart")}
                    >
                      Graphique
                    </button>
                    <button
                      className={`px-2.5 py-1 text-[10px] font-mono border-l border-[var(--mp-border)] ${viewMode === "table" ? "bg-amber-500/15 text-amber-400" : "text-[var(--mp-text-6)]"}`}
                      onClick={() => setViewMode("table")}
                    >
                      Table
                    </button>
                  </div>
                </div>
              </div>

              {chartData.length === 0 ? (
                <div className="text-xs font-mono text-[var(--mp-text-6)] text-center py-8">Aucune donnée sur cette période/résolution.</div>
              ) : viewMode === "chart" ? (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--mp-grid)" vertical={false} />
                    <XAxis dataKey="t" tick={{ fontSize: 9, fontFamily: "monospace" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} label={{ value: displayUnit, angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--mp-text-6)" }} />
                    <Tooltip contentStyle={{ background: "var(--mp-tooltip-bg)", border: "1px solid var(--mp-tooltip-border)", fontFamily: "monospace", fontSize: 11 }} labelStyle={{ color: "var(--mp-tooltip-label)" }} formatter={(v) => v === null ? "—" : `${fmtNum(v, 3)} ${displayUnit}`} />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }} />
                    {lineDefs.map((l) => (
                      <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={1.75} dot={chartData.length < 40} isAnimationActive={false} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="sticky top-0 bg-[var(--mp-panel)]">
                      <tr className="border-b border-[var(--mp-border)] text-[var(--mp-text-6)] uppercase tracking-wide">
                        <th className="text-left px-3 py-2">Pas</th>
                        {lineDefs.map((l) => (
                          <th key={l.key} className="text-right px-3 py-2" style={{ color: l.color }}>{l.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row, i) => (
                        <tr key={i} className="border-b border-[var(--mp-border)] text-[var(--mp-text-3)]">
                          <td className="px-3 py-1.5">{row.t}</td>
                          {lineDefs.map((l) => (
                            <td key={l.key} className="px-3 py-1.5 text-right">{row[l.key] === null || row[l.key] === undefined ? "—" : fmtNum(row[l.key], 3)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Page ----------------
export default function PortfolioPage() {
  const [tab, setTab] = useState("assets");
  const [assets, setAssets] = useState([]);
  const [ppas, setPpas] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingPpas, setLoadingPpas] = useState(true);
  const [assetsError, setAssetsError] = useState(null);
  const [ppasError, setPpasError] = useState(null);

  const loadAssets = useCallback(() => {
    setLoadingAssets(true);
    fetch("/api/portfolio/assets")
      .then((r) => r.json())
      .then((json) => { if (json.error) setAssetsError(json.error); else setAssets(json.assets); })
      .catch((e) => setAssetsError(String(e.message || e)))
      .finally(() => setLoadingAssets(false));
  }, []);

  const loadPpas = useCallback(() => {
    setLoadingPpas(true);
    fetch("/api/portfolio/ppa")
      .then((r) => r.json())
      .then((json) => { if (json.error) setPpasError(json.error); else setPpas(json.ppas); })
      .catch((e) => setPpasError(String(e.message || e)))
      .finally(() => setLoadingPpas(false));
  }, []);

  useEffect(() => { loadAssets(); loadPpas(); }, [loadAssets, loadPpas]);

  const totalCapacity = assets.reduce((s, a) => s + (a.capacity_mw || 0), 0);
  const byType = ASSET_TYPES.map((t) => ({ ...t, mw: assets.filter((a) => a.asset_type === t.key).reduce((s, a) => s + (a.capacity_mw || 0), 0) })).filter((t) => t.mw > 0);

  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">Portfolio Management</h1>
          <p className="text-xs text-[var(--mp-text-6)] mt-0.5">Actifs, contrats PPA, et P&amp;L marché vs. couverture</p>
        </div>
        <ThemeToggle />
      </header>

      <main className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
            <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">Capacité totale</div>
            <div className="text-xl font-mono font-semibold text-[var(--mp-text-1)]">{fmtNum(totalCapacity)} MW</div>
          </div>
          {byType.map((t) => (
            <div key={t.key} className="border border-[var(--mp-border)] bg-[var(--mp-panel)] px-4 py-3">
              <div className="text-[10px] text-[var(--mp-text-6)] uppercase tracking-wide">{t.label}</div>
              <div className="text-xl font-mono font-semibold" style={{ color: t.color }}>{fmtNum(t.mw)} MW</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button className={tabCls(tab === "assets")} onClick={() => setTab("assets")}>Actifs</button>
          <button className={tabCls(tab === "ppa")} onClick={() => setTab("ppa")}>PPA</button>
          <button className={tabCls(tab === "pnl")} onClick={() => setTab("pnl")}>P&amp;L</button>
          <button className={tabCls(tab === "tree")} onClick={() => setTab("tree")}>Arbre &amp; Timeseries</button>
        </div>

        {tab === "assets" && (
          <AssetsTab assets={assets} loading={loadingAssets} error={assetsError} onCreated={loadAssets} onDeleted={loadAssets} />
        )}
        {tab === "ppa" && (
          <PPATab assets={assets} ppas={ppas} loading={loadingPpas} error={ppasError} onCreated={loadPpas} onDeleted={loadPpas} />
        )}
        {tab === "pnl" && <PnlTab assets={assets} />}
        {tab === "tree" && (
          <div className="space-y-8">
            <TreeTab />
            <TimeseriesExplorerTab />
          </div>
        )}
      </main>
    </div>
  );
}
