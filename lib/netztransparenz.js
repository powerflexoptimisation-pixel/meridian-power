// lib/netztransparenz.js
// Intégration API netztransparenz.de (données propres à l'Allemagne, portail
// commun des 4 GRT: 50Hertz, Amprion, TenneT, TransnetBW).
// Auth OAuth2 client_credentials, token valable 1h (mis en cache en mémoire).
// Données renvoyées en CSV (locale allemande: ';' séparateur, ',' décimale).
//
// Format d'URL confirmé par la spec OpenAPI officielle (swagger.json,
// api-portal.netztransparenz.de) : dateFrom/dateTo sont des SEGMENTS DE
// CHEMIN, pas des query params. Ex:
//   /api/v1/data/NrvSaldo/reBAP/Qualitaetsgesichert/2026-06-01T00:00:00/2026-06-25T00:00:00
//   /api/v1/data/redispatch/2026-07-25T00:00:00/2026-07-26T00:00:00
// Toutes les données (redispatch, reBAP, RZ-Saldo, AEP-Schätzer, aFRR/mFRR
// activés) sont accessibles avec le scope de base du client
// (ntpStatistic.read_all_public) — la spec OpenAPI liste exactement le même
// scope pour tous ces endpoints, il n'y a pas de rôle "NrvSaldo" séparé à
// activer côté OAuth-Manager. (Une tentative précédente avec dateFrom/dateTo
// en query params donnait un 404 systématique sur ces endpoints, ce qui
// avait été mal interprété comme un problème de scope OAuth — c'était en
// fait juste le mauvais format d'URL.)

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

// Formate une Date JS en "yyyy-MM-ddTHH:mm:ss" (UTC, attendu par l'API).
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

// dateFrom/dateTo optionnels: si fournis, ajoutés comme segments de chemin
// supplémentaires (voir en-tête de fichier). Si absents, appelle la variante
// "toutes données disponibles" de l'endpoint (existe pour redispatch,
// Spotmarktpreise, etc.).
async function fetchCsv(path, dateFrom, dateTo) {
  const token = await getAccessToken();
  let url = `${BASE_URL}/${path}`;
  if (dateFrom && dateTo) {
    url += `/${fmtDateParam(dateFrom)}/${fmtDateParam(dateTo)}`;
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 404) return { headers: [], rows: [] };
    throw new Error(`netztransparenz ${path} failed: ${res.status}`);
  }
  const text = await res.text();
  return parseCsv(text);
}

// reBAP: prix de l'énergie de compensation (Ausgleichsenergiepreis), 15-min.
export async function fetchReBAP(dateFrom, dateTo) {
  const { rows } = await fetchCsv("NrvSaldo/reBAP/Qualitaetsgesichert", dateFrom, dateTo);
  return rows
    .filter((r) => r["Datum"] && r["von"])
    .map((r) => ({
      timestamp: parseGermanDate(r["Datum"], r["von"]),
      rebap_unterdeckt: parseGermanNumber(r["reBAP unterdeckt"]),
      rebap_ueberdeckt: parseGermanNumber(r["reBAP ueberdeckt"]),
    }));
}

// RZ-Saldo: solde de la zone de réglage par GRT (MW), 15-min.
export async function fetchRZSaldo(dateFrom, dateTo) {
  const { rows } = await fetchCsv("NrvSaldo/RZSaldo/Betrieblich", dateFrom, dateTo);
  return rows
    .filter((r) => r["Datum"] && r["von"])
    .map((r) => ({
      timestamp: parseGermanDate(r["Datum"], r["von"]),
      "50Hertz": parseGermanNumber(r["50Hertz"]),
      Amprion: parseGermanNumber(r["Amprion"]),
      "TenneT TSO": parseGermanNumber(r["TenneT TSO"]),
      TransnetBW: parseGermanNumber(r["TransnetBW"]),
    }));
}

// AEP-Schätzer: estimation temps réel du prix de l'énergie de compensation
// (précurseur du reBAP officiel, publié toutes les 15 min). Format 14.
export async function fetchAepSchaetzer(dateFrom, dateTo) {
  const { rows } = await fetchCsv("NrvSaldo/AepSchaetzer/Betrieblich", dateFrom, dateTo);
  return rows
    .filter((r) => r["Datum"] && r["von"])
    .map((r) => ({
      timestamp: parseGermanDate(r["Datum"], r["von"]),
      aep_schaetzer_eur_mwh: parseGermanNumber(r["AEP-Schätzer"]),
      status: r["Status"] ?? null,
    }));
}

// Activations aFRR (SRL) qualité-gérée: MW positif/négatif par GRT + Allemagne. Format 6.b.
export async function fetchActivatedAFRR(dateFrom, dateTo) {
  const { rows } = await fetchCsv("NrvSaldo/AktivierteSRL/Qualitaetsgesichert", dateFrom, dateTo);
  return parseActivationRows(rows);
}

// Activations mFRR (MRL) qualité-gérée: MW positif/négatif par GRT + Allemagne. Format 6.b.
export async function fetchActivatedMFRR(dateFrom, dateTo) {
  const { rows } = await fetchCsv("NrvSaldo/AktivierteMRL/Qualitaetsgesichert", dateFrom, dateTo);
  return parseActivationRows(rows);
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
// L'API expose deux endpoints distincts: /redispatch (tout l'historique) et
// /redispatch/{dateFrom}/{dateTo} (filtré côté serveur, confirmé via spec
// OpenAPI + test direct — le filtrage fonctionne correctement avec les dates
// en segments de chemin).
export async function fetchRedispatch(dateFrom, dateTo) {
  const { rows } = await fetchCsv("redispatch", dateFrom, dateTo);
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

// Variante non filtrée (endpoint /redispatch sans dates), pour un backfill
// initial couvrant tout l'historique disponible en un seul appel.
export async function fetchRedispatchAll() {
  return fetchRedispatch(null, null);
}

// Orchestre la collecte de toutes les séries netztransparenz.de pour une
// période donnée.
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
      const data = await fetchers[series](dateFrom, dateTo);
      results[series] = { data, error: null };
    } catch (err) {
      results[series] = { data: [], error: String(err.message || err) };
    }
  }
  return results;
}

// Spotmarktpreise EPEX (prix utilisé pour la comptabilité EEG) — utile pour
// recoupement/QA face aux prix day-ahead ENTSO-E déjà collectés, non
// persisté séparément pour l'instant.
export async function fetchSpotmarktpreise(dateFrom, dateTo) {
  const { rows } = await fetchCsv("Spotmarktpreise", dateFrom, dateTo);
  return rows
    .filter((r) => r["Datum"])
    .map((r) => ({
      timestamp: parseGermanDate((r["Datum"] || "").trim(), (r["von"] || "").trim()),
      price_ct_kwh: parseGermanNumber(r["Spotmarktpreis in ct/kWh"]),
    }));
}
