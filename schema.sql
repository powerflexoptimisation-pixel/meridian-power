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
