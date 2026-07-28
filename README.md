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

## Limites connues (à traiter avant mise en prod sérieuse)

- **Pas d'historique persistant** : chaque requête récupère la dernière
  journée calendaire complète. Pour du multi-jour/multi-mois il faut une
  vraie base de données alimentée par un job planifié.
- **DE-LU séquence de prix** : l'auction allemande publie deux courbes
  parallèles (`classificationSequence` 1 et 2) pour la même période. Le code
  garde la séquence 1 par défaut — à vérifier avec la doc ENTSO-E si des
  écarts apparaissent.
- **Rate limit ENTSO-E** : ~400 requêtes/minute/token. Le cache 15 min
  suffit largement pour un usage dashboard, mais à surveiller si tu ajoutes
  plus de marchés ou de types de contrats.
