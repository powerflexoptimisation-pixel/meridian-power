# Meridian Power

Dashboard de données de marché énergétique européen (day-ahead + génération),
alimenté en direct par l'API ENTSO-E Transparency Platform.

Marchés Phase 1 : DE (DE-LU) · FR · IT (IT-North) · ES

## Architecture

- `app/page.js` — dashboard React (client), fetch les données via `/api/entsoe`
- `app/api/entsoe/route.js` — route API serveur qui interroge ENTSO-E
  (le token API reste côté serveur, jamais exposé au navigateur)
- `lib/entsoe.js` — parsing des documents XML ENTSO-E (prix day-ahead A44,
  génération réelle par filière A75)

Le cache est géré via `next: { revalidate: 900 }` (15 min) dans les appels
`fetch` côté serveur — pas besoin de base de données pour ce MVP. Pour
stocker un historique multi-jours, il faudra ajouter une vraie base
(Postgres/Neon, ou Vercel KV) — pas encore fait ici.

## Déployer sur Vercel (5 minutes)

### 1. Créer un repo GitHub
```bash
cd meridian-power
git init
git add .
git commit -m "Initial commit"
gh repo create meridian-power --private --source=. --push
# ou manuellement : créer un repo vide sur github.com, puis
# git remote add origin https://github.com/<toi>/meridian-power.git
# git push -u origin main
```

### 2. Importer sur Vercel
1. Va sur https://vercel.com/new
2. Connecte ton compte GitHub, sélectionne le repo `meridian-power`
3. Vercel détecte Next.js automatiquement — ne change rien aux paramètres de build
4. **Avant de cliquer Deploy**, ajoute la variable d'environnement :
   - `ENTSOE_TOKEN` = ton token API ENTSO-E
5. Clique Deploy

Ton dashboard sera live sur `meridian-power-xxxx.vercel.app` en ~1 minute.

### 3. Brancher ton domaine
Dans le projet Vercel → Settings → Domains → ajoute `meridianpower.com`
(ou autre) et suis les instructions DNS (Vercel te donne un enregistrement
A ou CNAME à ajouter chez ton registrar).

## Développement local

```bash
npm install
cp .env.example .env.local   # puis colle ton token dans .env.local
npm run dev
```
Ouvre http://localhost:3000

## Historique multi-jours (Neon Postgres)

### 1. Provisionner la base
1. Dans le projet Vercel → onglet **Storage** → **Create Database** → **Neon (Serverless Postgres)**
2. Choisis la région la plus proche de tes utilisateurs (ex: Frankfurt pour l'Europe)
3. **Connect Project** — Vercel injecte automatiquement `DATABASE_URL` dans les variables d'environnement du projet

### 2. Créer le schéma
1. Depuis l'onglet Storage → ta base → **Open in Neon Console** (ou **Query** si dispo directement dans Vercel)
2. Colle et exécute le contenu de `schema.sql` (à la racine du repo)

### 3. Protéger les routes cron/admin (recommandé)
Ajoute une variable d'environnement `CRON_SECRET` (une chaîne aléatoire, ex: générée avec `openssl rand -hex 32`). Vercel l'utilise automatiquement pour authentifier les appels de son Cron Scheduler vers `/api/cron/collect`.

### 4. Redéployer
Après avoir ajouté `DATABASE_URL` et `CRON_SECRET`, redéploie (Deployments → ⋯ → Redeploy) pour que les nouvelles variables soient prises en compte.

### 5. Remplir l'historique initial (backfill)
La base est vide au départ. Pour la peupler rétroactivement (ex: 30 derniers jours) :
```
https://ton-domaine.vercel.app/api/admin/backfill?days=30&secret=TON_CRON_SECRET
```
Ça tourne pour les 4 marchés séquentiellement (peut prendre 1-2 minutes pour 30 jours — c'est normal, l'API ENTSO-E est interrogée jour par jour). Pour un historique plus long (ex: 1 an), lance plusieurs appels avec des plages différentes plutôt qu'un seul très long (limite de durée d'exécution serverless).

### 6. Vérifier
`https://ton-domaine.vercel.app/api/history?country=DE&days=30` doit renvoyer les stats quotidiennes stockées. Le dashboard affiche automatiquement la section "Price History" une fois des données présentes.

Ensuite, le cron (`vercel.json`, tous les jours à 13:00 UTC) prend le relais automatiquement — pas d'action manuelle récurrente nécessaire.

## Limites connues (à traiter avant mise en prod sérieuse)

- **DE-LU séquence de prix** : l'auction allemande publie deux courbes
  parallèles (`classificationSequence` 1 et 2) pour la même période. Le code
  garde la séquence 1 par défaut — à vérifier avec la doc ENTSO-E si des
  écarts apparaissent.
- **Rate limit ENTSO-E** : ~400 requêtes/minute/token. Le cache 15 min sur
  la route live suffit largement, mais le backfill sur de longues périodes
  reste volontairement séquentiel (une requête à la fois) pour rester prudent.
- **Génération réelle vs prévue** : les données de génération (A75/A16)
  peuvent être révisées par ENTSO-E dans les heures suivant la publication.
  Le cron quotidien collecte "hier" (jour complet, données stabilisées),
  donc ce n'est pas un souci en pratique, mais les toutes dernières heures
  d'une journée fraîchement collectée peuvent légèrement changer si tu
  relances une collecte le jour même.
