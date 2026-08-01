-- schema.sql
-- À exécuter une fois dans l'onglet "Query" de Vercel Postgres (Storage → ta DB → Query)
-- après avoir provisionné la base (voir README section "Historique multi-jours").

CREATE TABLE IF NOT EXISTS market_prices (
  country       VARCHAR(2) NOT NULL,
  ts            TIMESTAMPTZ NOT NULL,
  price_eur_mwh NUMERIC(10, 2) NOT NULL,
  PRIMARY KEY (country, ts)
);

CREATE TABLE IF NOT EXISTS market_generation (
  country     VARCHAR(2) NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  fuel_type   VARCHAR(40) NOT NULL,
  quantity_mw NUMERIC(10, 2) NOT NULL,
  PRIMARY KEY (country, ts, fuel_type)
);

-- Index pour accélérer les requêtes de plage de dates (l'accès principal du dashboard)
CREATE INDEX IF NOT EXISTS idx_prices_country_ts ON market_prices (country, ts);
CREATE INDEX IF NOT EXISTS idx_generation_country_ts ON market_generation (country, ts);

-- Table de suivi des collectes (pour debug / observabilité du cron)
CREATE TABLE IF NOT EXISTS collection_log (
  id            SERIAL PRIMARY KEY,
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  country       VARCHAR(2) NOT NULL,
  price_points  INTEGER NOT NULL,
  gen_points    INTEGER NOT NULL,
  warnings      TEXT
);

-- ============================================================
-- Données réseau allemand (netztransparenz.de — 4 GRT)
-- ============================================================

-- Redispatch: événements de congestion réseau (pas une série temporelle
-- régulière). Endpoint public, alimenté dès maintenant.
CREATE TABLE IF NOT EXISTS de_redispatch (
  id                SERIAL PRIMARY KEY,
  start_ts          TIMESTAMPTZ NOT NULL,
  end_ts             TIMESTAMPTZ NOT NULL,
  reason            VARCHAR(80),
  direction         VARCHAR(60),
  avg_power_mw      NUMERIC(10, 2),
  max_power_mw      NUMERIC(10, 2),
  total_energy_mwh  NUMERIC(12, 2),
  ordering_tso      VARCHAR(80),
  requesting_tso    VARCHAR(120),
  plant             VARCHAR(160),
  energy_source     VARCHAR(40),
  UNIQUE (start_ts, end_ts, requesting_tso, plant, direction)
);
CREATE INDEX IF NOT EXISTS idx_de_redispatch_start ON de_redispatch (start_ts);

-- reBAP: prix de l'énergie de compensation qualité-gérée, 15-min.
-- Nécessite le scope NrvSaldo (OAuth-Manager netztransparenz.de) — table
-- prête, alimentée dès que l'accès est activé.
CREATE TABLE IF NOT EXISTS de_rebap (
  ts                TIMESTAMPTZ PRIMARY KEY,
  rebap_unterdeckt  NUMERIC(10, 2),
  rebap_ueberdeckt  NUMERIC(10, 2)
);

-- AEP-Schätzer: estimation temps réel du reBAP (précurseur, publié en continu).
-- Nécessite le scope NrvSaldo.
CREATE TABLE IF NOT EXISTS de_aep_schaetzer (
  ts                    TIMESTAMPTZ PRIMARY KEY,
  aep_schaetzer_eur_mwh NUMERIC(10, 2),
  status                VARCHAR(10)
);

-- RZ-Saldo: solde de zone de réglage par GRT (MW), 15-min.
-- Nécessite le scope NrvSaldo.
CREATE TABLE IF NOT EXISTS de_rz_saldo (
  ts          TIMESTAMPTZ NOT NULL,
  tso         VARCHAR(20) NOT NULL,
  value_mw    NUMERIC(10, 2) NOT NULL,
  PRIMARY KEY (ts, tso)
);

-- Activations aFRR (SRL) et mFRR (MRL), qualité-gérée, format "long"
-- (ts, zone, direction) -> MW. zone in {50Hertz, Amprion, TenneT TSO,
-- TransnetBW, Deutschland}; direction in {positiv, negativ}.
-- Nécessite le scope NrvSaldo.
CREATE TABLE IF NOT EXISTS de_activated_afrr (
  ts          TIMESTAMPTZ NOT NULL,
  zone        VARCHAR(20) NOT NULL,
  direction   VARCHAR(10) NOT NULL,
  value_mw    NUMERIC(10, 3) NOT NULL,
  PRIMARY KEY (ts, zone, direction)
);

CREATE TABLE IF NOT EXISTS de_activated_mfrr (
  ts          TIMESTAMPTZ NOT NULL,
  zone        VARCHAR(20) NOT NULL,
  direction   VARCHAR(10) NOT NULL,
  value_mw    NUMERIC(10, 3) NOT NULL,
  PRIMARY KEY (ts, zone, direction)
);

-- NRV-Saldo: déséquilibre système allemand (MW), 15-min. Signal cœur pour
-- l'imbalance trading.
CREATE TABLE IF NOT EXISTS de_nrv_saldo (
  ts                    TIMESTAMPTZ PRIMARY KEY,
  value_mw              NUMERIC(10, 3),
  aep_knappheit_mw      NUMERIC(10, 3),
  mrl_mol_abweichung_mw NUMERIC(10, 3),
  srl_mol_abweichung_mw NUMERIC(10, 3)
);

-- TrafficLight: indicateur de tension système, 1-min.
CREATE TABLE IF NOT EXISTS de_traffic_light (
  ts_from   TIMESTAMPTZ PRIMARY KEY,
  ts_to     TIMESTAMPTZ NOT NULL,
  value     VARCHAR(20) NOT NULL
);

-- ID AEP: indice intraday du prix de compensation (précurseur du reBAP), 15-min.
CREATE TABLE IF NOT EXISTS de_id_aep (
  ts              TIMESTAMPTZ PRIMARY KEY,
  value_eur_mwh   NUMERIC(10, 2)
);

-- NegativePreise: heures de prix négatifs par base horaire EEG, résolution horaire.
CREATE TABLE IF NOT EXISTS de_negative_preise (
  ts    TIMESTAMPTZ PRIMARY KEY,
  h1    BOOLEAN,
  h2    BOOLEAN,
  h3    BOOLEAN,
  h4    BOOLEAN,
  h6    BOOLEAN
);

-- Hochrechnung: extrapolation temps réel de la production renouvelable par
-- GRT (MW), 15-min. product in {Solar, Wind}.
CREATE TABLE IF NOT EXISTS de_hochrechnung (
  ts        TIMESTAMPTZ NOT NULL,
  product   VARCHAR(10) NOT NULL,
  tso       VARCHAR(20) NOT NULL,
  value_mw  NUMERIC(10, 3),
  PRIMARY KEY (ts, product, tso)
);
CREATE TABLE IF NOT EXISTS de_collection_log (
  id          SERIAL PRIMARY KEY,
  ran_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  series      VARCHAR(40) NOT NULL,
  points      INTEGER NOT NULL DEFAULT 0,
  blocked     BOOLEAN NOT NULL DEFAULT false,
  warning     TEXT
);
