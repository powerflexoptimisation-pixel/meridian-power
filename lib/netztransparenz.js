// lib/netztransparenz.js
// Intégration API netztransparenz.de (données propres à l'Allemagne, portail
// commun des 4 GRT: 50Hertz, Amprion, TenneT, TransnetBW).
// Auth OAuth2 client_credentials, token valable 1h (mis en cache en mémoire).
// Données renvoyées en CSV (locale allemande: ';' séparateur, ',' décimale).

const TOKEN_URL = "https://identity.netztransparenz.de/users/connect/token";
const BASE_URL = "https://ds.netztransparenz.de/api/v1/data";

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) return cachedToken;

  const clientId = process.env.NETZTRANSPARENZ_CLIENT_ID;
  const clientSecret = process.env.NETZTRANSPARENZ_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NETZTRANSPARENZ_CLIENT_ID / NETZTRANSPARENZ_CLIENT_SECRET manquants");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`netztransparenz OAuth failed: ${res.status}`);
  const json = await res.json();
  cachedToken = json.access_token;
  // Marge de sécurité de 60s avant l'expiration réelle (1h).
  cachedTokenExpiry = now + (json.expires_in - 60) * 1000;
  return cachedToken;
}

// Formate une Date JS en "yyyy-MM-ddTHH:mm:ss" (heure locale UTC, attendu par l'API).
function fmtDateParam(d) {
  return d.toISOString().slice(0, 19);
}

// Parseur CSV générique pour le format netztransparenz (';' + décimale ',').
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(";").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
  return { headers, rows };
}

function parseGermanNumber(s) {
  if (s === undefined || s === null || s === "") return null;
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function parseGermanDate(datum, zeit) {
  // datum: "DD.MM.YYYY", zeit: "HH:MM" (toujours en UTC pour cette API)
  const [day, month, year] = datum.split(".");
  return `${year}-${month}-${day}T${zeit}:00Z`;
}

// IMPORTANT: l'API attend dateFrom/dateTo en QUERY PARAMS, pas en segments de
// chemin (bug corrigé ici — l'implémentation précédente construisait
// `${BASE_URL}/${path}/${from}/${to}`, ce qui renvoie systématiquement 404).
async function fetchCsv(path, dateFrom, dateTo) {
  const token = await getAccessToken();
  const url = new URL(`${BASE_URL}/${path}`);
  if (dateFrom) url.searchParams.set("dateFrom", fmtDateParam(dateFrom));
  if (dateTo) url.searchParams.set("dateTo", fmtDateParam(dateTo));
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 404) {
      // 404 sur ce portail signifie soit "aucune donnée", soit "endpoint hors
      // du scope OAuth du client" (les endpoints NrvSaldo/* nécessitent un
      // rôle supplémentaire à activer dans l'OAuth-Manager de
      // netztransparenz.de — voir README). On ne fait pas planter le cron
      // pour autant : on renvoie vide et on laisse l'appelant logger un warning.
      return { headers: [], rows: [], notFound: true };
    }
    throw new Error(`netztransparenz ${path} failed: ${res.status}`);
  }
  const text = await res.text();
  return parseCsv(text);
}

// reBAP: prix de l'énergie de compensation (Ausgleichsenergiepreis), 15-min.
// Nécessite le scope NrvSaldo (rôle additionnel dans l'OAuth-Manager).
export async function fetchReBAP(dateFrom, dateTo) {
  const { rows, notFound } = await fetchCsv("NrvSaldo/reBAP/Qualitaetsgesichert", dateFrom, dateTo);
  const data = rows
    .filter((r) => r["Datum"] && r["von"])
    .map((r) => ({
      timestamp: parseGermanDate(r["Datum"], r["von"]),
      rebap_unterdeckt: parseGermanNumber(r["reBAP unterdeckt"]),
      rebap_ueberdeckt: parseGermanNumber(r["reBAP ueberdeckt"]),
    }));
  return { data, notFound };
}

// RZ-Saldo: solde de la zone de réglage par GRT (MW), 15-min.
// Nécessite le scope NrvSaldo.
export async function fetchRZSaldo(dateFrom, dateTo) {
  const { rows, notFound } = await fetchCsv("NrvSaldo/RZSaldo/Betrieblich", dateFrom, dateTo);
  const data = rows
    .filter((r) => r["Datum"] && r["von"])
    .map((r) => ({
      timestamp: parseGermanDate(r["Datum"], r["von"]),
      "50Hertz": parseGermanNumber(r["50Hertz"]),
      Amprion: parseGermanNumber(r["Amprion"]),
      "TenneT TSO": parseGermanNumber(r["TenneT TSO"]),
      TransnetBW: parseGermanNumber(r["TransnetBW"]),
    }));
  return { data, notFound };
}

// AEP-Schätzer: estimation temps réel du prix de l'énergie de compensation
// (précurseur du reBAP officiel, publié toutes les 15 min). Format 14.
// Nécessite le scope NrvSaldo.
export async function fetchAepSchaetzer(dateFrom, dateTo) {
  const { rows, notFound } = await fetchCsv("NrvSaldo/AepSchaetzer/Betrieblich", dateFrom, dateTo);
  const data = rows
    .filter((r) => r["Datum"] && r["von"])
    .map((r) => ({
      timestamp: parseGermanDate(r["Datum"], r["von"]),
      aep_schaetzer_eur_mwh: parseGermanNumber(r["AEP-Schätzer"]),
      status: r["Status"] ?? null,
    }));
  return { data, notFound };
}

// Activations aFRR (SRL) qualité-gérée: MW positif/négatif par GRT + Allemagne. Format 6.b.
// Nécessite le scope NrvSaldo.
export async function fetchActivatedAFRR(dateFrom, dateTo) {
  const { rows, notFound } = await fetchCsv("NrvSaldo/AktivierteSRL/Qualitaetsgesichert", dateFrom, dateTo);
  const data = parseActivationRows(rows);
  return { data, notFound };
}

// Activations mFRR (MRL) qualité-gérée: MW positif/négatif par GRT + Allemagne. Format 6.b.
// Nécessite le scope NrvSaldo.
export async function fetchActivatedMFRR(dateFrom, dateTo) {
  const { rows, notFound } = await fetchCsv("NrvSaldo/AktivierteMRL/Qualitaetsgesichert", dateFrom, dateTo);
  const data = parseActivationRows(rows);
  return { data, notFound };
}

// Commun à AktivierteSRL/AktivierteMRL (Format 6.b): une ligne 15-min ->
// éclatée en lignes (zone, direction, valeur) au format "long", cohérent
// avec upsertGeneration() dans lib/db.js.
function parseActivationRows(rows) {
  const zones = ["50Hertz", "Amprion", "TenneT TSO", "TransnetBW", "Deutschland"];
  const out = [];
  for (const r of rows) {
    if (!r["Datum"] || !r["von"]) continue;
    const timestamp = parseGermanDate(r["Datum"], r["von"]);
    for (const zone of zones) {
      const pos = parseGermanNumber(r[`${zone} (Positiv)`]);
      const neg = parseGermanNumber(r[`${zone} (Negativ)`]);
      if (pos !== null) out.push({ timestamp, zone, direction: "positiv", value_mw: pos });
      if (neg !== null) out.push({ timestamp, zone, direction: "negativ", value_mw: neg });
    }
  }
  return out;
}

// Redispatch: événements de congestion (pas une série temporelle régulière).
// Endpoint public — fonctionne avec le scope de base (ntpStatistic.read_all_public).
// IMPORTANT: cet endpoint ignore dateFrom/dateTo côté serveur (vérifié —
// renvoie systématiquement tout l'historique depuis 2021, ~85k lignes,
// quels que soient les paramètres ou leur nom (dateFrom/dateFromUtc)). On
// filtre donc côté client sur le début de l'événement (start >= dateFrom)
// pour que le cron quotidien ne re-upserte pas 85k lignes à chaque run.
export async function fetchRedispatch(dateFrom, dateTo) {
  const { rows, notFound } = await fetchCsv("redispatch", null, null);
  const fromMs = dateFrom ? dateFrom.getTime() : -Infinity;
  const toMs = dateTo ? dateTo.getTime() : Infinity;
  const data = rows
    .filter((r) => r["BEGINN_DATUM"])
    .map((r) => ({
      start: parseGermanDate(r["BEGINN_DATUM"], r["BEGINN_UHRZEIT"]),
      end: parseGermanDate(r["ENDE_DATUM"], r["ENDE_UHRZEIT"]),
      reason: r["GRUND_DER_MASSNAHME"],
      direction: r["RICHTUNG"],
      avgPowerMw: parseGermanNumber(r["MITTLERE_LEISTUNG_MW"]),
      maxPowerMw: parseGermanNumber(r["MAXIMALE_LEISTUNG_MW"]),
      totalEnergyMwh: parseGermanNumber(r["GESAMTE_ARBEIT_MWH"]),
      orderingTso: r["ANWEISENDER_UENB"],
      requestingTso: r["ANFORDERNDER_UENB"],
      plant: r["BETROFFENE_ANLAGE"],
      energySource: r["PRIMAERENERGIEART"],
    }))
    .filter((e) => {
      const t = new Date(e.start).getTime();
      return t >= fromMs && t < toMs;
    });
  return { data, notFound };
}

// Variante non filtrée, pour le backfill initial (une seule collecte couvre
// tout l'historique disponible — pas besoin de paginer par jour comme pour
// ENTSO-E).
export async function fetchRedispatchAll() {
  const { rows } = await fetchCsv("redispatch", null, null);
  return rows
    .filter((r) => r["BEGINN_DATUM"])
    .map((r) => ({
      start: parseGermanDate(r["BEGINN_DATUM"], r["BEGINN_UHRZEIT"]),
      end: parseGermanDate(r["ENDE_DATUM"], r["ENDE_UHRZEIT"]),
      reason: r["GRUND_DER_MASSNAHME"],
      direction: r["RICHTUNG"],
      avgPowerMw: parseGermanNumber(r["MITTLERE_LEISTUNG_MW"]),
      maxPowerMw: parseGermanNumber(r["MAXIMALE_LEISTUNG_MW"]),
      totalEnergyMwh: parseGermanNumber(r["GESAMTE_ARBEIT_MWH"]),
      orderingTso: r["ANWEISENDER_UENB"],
      requestingTso: r["ANFORDERNDER_UENB"],
      plant: r["BETROFFENE_ANLAGE"],
      energySource: r["PRIMAERENERGIEART"],
    }));
}

// Orchestre la collecte de toutes les séries netztransparenz.de pour une
// période donnée. Chaque série est indépendante : une série bloquée (scope
// OAuth manquant) ou en erreur n'empêche pas les autres d'être stockées.
export const DE_SERIES = ["redispatch", "rebap", "aep_schaetzer", "rz_saldo", "activated_afrr", "activated_mfrr"];

export async function collectDe(dateFrom, dateTo) {
  const fetchers = {
    redispatch: fetchRedispatch,
    rebap: fetchReBAP,
    aep_schaetzer: fetchAepSchaetzer,
    rz_saldo: fetchRZSaldo,
    activated_afrr: fetchActivatedAFRR,
    activated_mfrr: fetchActivatedMFRR,
  };
  const results = {};
  for (const series of DE_SERIES) {
    try {
      const { data, notFound } = await fetchers[series](dateFrom, dateTo);
      results[series] = { data, blocked: !!notFound && data.length === 0, error: null };
    } catch (err) {
      results[series] = { data: [], blocked: false, error: String(err.message || err) };
    }
  }
  return results;
}

// Spotmarktpreise EPEX (prix utilisé pour la comptabilité EEG) — endpoint
// public, disponible avec le scope de base. Utile pour recoupement/QA face
// aux prix day-ahead ENTSO-E déjà collectés, non persisté séparément.
export async function fetchSpotmarktpreise(dateFrom, dateTo) {
  const { rows, notFound } = await fetchCsv("Spotmarktpreise", dateFrom, dateTo);
  const data = rows
    .filter((r) => r["Datum"])
    .map((r) => ({
      timestamp: parseGermanDate((r["Datum"] || "").trim(), (r["von"] || "").trim()),
      price_ct_kwh: parseGermanNumber(r["Spotmarktpreis in ct/kWh"]),
    }));
  return { data, notFound };
}
