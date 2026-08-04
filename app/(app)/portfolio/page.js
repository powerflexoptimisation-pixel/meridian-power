"use client";

import React, { useState, useEffect, useCallback } from "react";
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

function MetricsRow({ metrics }) {
  if (!metrics) return null;
  const hasAny = Object.values(metrics).some((v) => v !== 0);
  if (!hasAny) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-5 pb-1.5">
      {METRIC_DEFS.map((m) => {
        const v = metrics[m.key];
        if (v === undefined) return null;
        const isOpen = m.key === "open_position";
        const color = isOpen ? (v >= 0 ? "#4ADE80" : "#F87171") : m.color;
        return (
          <span key={m.key} className="text-[10px] font-mono" style={{ color: color || "var(--mp-text-6)" }}>
            {m.label}: {isOpen && v >= 0 ? "+" : ""}{fmtNum(v)} MWh
          </span>
        );
      })}
    </div>
  );
}

function TreeNode({ label, sublabel, mw, metrics, color, depth, children, defaultOpen }) {
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
      <MetricsRow metrics={metrics} />
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
        </div>
      </div>

      {error && <div className="border border-red-500/40 text-red-400 text-xs font-mono px-4 py-3">{error}</div>}
      {loading && <div className="text-xs font-mono text-[var(--mp-text-6)] text-center py-8">Chargement...</div>}

      {tree && !loading && (
        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-2">
          <TreeNode label="Portfolio" sublabel={`${tree.asset_count} actifs · ${date}`} mw={tree.capacity_mw} metrics={tree.metrics} depth={0} defaultOpen>
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
                  depth={1}
                >
                  {tso.technologies.map((tech) => (
                    <TreeNode
                      key={tech.asset_type}
                      label={ASSET_TYPES.find((t) => t.key === tech.asset_type)?.label || tech.asset_type}
                      color={typeColor(tech.asset_type)}
                      mw={tech.capacity_mw}
                      metrics={tech.metrics}
                      depth={2}
                    >
                      {tech.assets.map((a) => (
                        <TreeNode key={a.id} label={a.name} sublabel={a.status} mw={a.capacity_mw} metrics={a.metrics} depth={3} />
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
          <button className={tabCls(tab === "tree")} onClick={() => setTab("tree")}>Arbre</button>
        </div>

        {tab === "assets" && (
          <AssetsTab assets={assets} loading={loadingAssets} error={assetsError} onCreated={loadAssets} onDeleted={loadAssets} />
        )}
        {tab === "ppa" && (
          <PPATab assets={assets} ppas={ppas} loading={loadingPpas} error={ppasError} onCreated={loadPpas} onDeleted={loadPpas} />
        )}
        {tab === "pnl" && <PnlTab assets={assets} />}
        {tab === "tree" && <TreeTab />}
      </main>
    </div>
  );
}
