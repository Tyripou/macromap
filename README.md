# MacroMap

## En local

```bash
npm install
npm run dev
```

Ouvre l'URL affichée (en général http://localhost:5173) dans Chrome.

## Déploiement sur Vercel

1. Pousse ce dossier sur GitHub (remplace le contenu de ton repo actuel par celui-ci, ou crée un nouveau repo).
2. Sur vercel.com → **Add New Project** → importe le repo.
   Vercel détecte automatiquement Vite, aucune configuration à changer.
3. Avant de déployer (ou dans **Project Settings → Environment Variables** après coup), ajoute :
   - `ANTHROPIC_API_KEY` = ta clé API Anthropic (console.anthropic.com → API Keys)

   C'est nécessaire uniquement pour le bouton "Ask the map" (l'assistant IA). Sans cette variable, tout le reste du site fonctionne normalement — seul ce bouton affichera une erreur. Ce bouton est la seule fonction du projet qui utilise l'API Anthropic (payante, à part d'un abonnement Claude) : les actualisations de news n'en ont plus besoin.
4. Déploie. Vercel construit le site (`vite build`) et déploie automatiquement la fonction serveur `api/ask.js` qui protège ta clé.

## Pourquoi le fichier .jsx seul ne fonctionnait pas

Le fichier que tu avais était pensé pour l'aperçu d'artefact de Claude.ai, qui fournit deux choses qui n'existent pas sur un site normal :
- `window.storage` (sauvegarde automatique) → remplacé ici par `localStorage`
- un accès direct à l'API Anthropic sans clé → remplacé ici par la fonction serveur `api/ask.js`, qui utilise ta propre clé stockée côté serveur (jamais visible dans le navigateur)

Le reste du site (mind map, biais, evidence, calendrier, scénarios...) fonctionne entièrement côté client, sans API — comme avant.

## Données réelles (instantané du 11 septembre 2026) — plus de "mode démo"

Toutes les données macro et de marché de l'app ont été remplacées par de vrais chiffres, trouvés via recherche web, avec de vraies sources et de vrais liens cliquables (BLS, Réserve fédérale, Trading Economics, CNBC, Yahoo Finance, TradingView...). Il n'y a plus aucune valeur inventée présentée comme réelle : les entrées `(demo)` ont toutes été retirées.

**Contexte macro réel repris dans l'app :**
- Guerre Iran–USA en cours depuis février 2026 → choc pétrolier (WTI ~$100/bbl, +20% sur le mois) → inflation qui repart à la hausse
- CPI août 2026 : 3,4% YoY (stable), core CPI 2,4% YoY (plus bas depuis mars 2021) mais surprise mensuelle à la hausse (+0,3% vs +0,2% attendu)
- NFP août : +162k, très au-dessus du consensus (+53k) ; chômage stable à 4,1%
- Fed funds : 3,50–3,75% (effectif ~3,63%) — réunion FOMC le 16 septembre 2026, marché pricing ~66–71% de probabilité d'une **hausse** de 25pb (retournement net : le marché anticipait des baisses de taux il y a quelques mois à peine)
- 10Y Treasury ~4,9%, au plus haut depuis 2023
- Gold ~$4 350–4 410/oz (3ᵉ semaine de baisse), DXY ~99,1, S&P 500 ~7 650, Nasdaq Composite ~26 400, BTC ~$77 000

**Ce que ça change concrètement dans l'app :**
- Le pricing de Gold reflète maintenant la vraie tension du moment : rendements réels et dollar en hausse (baissier) contre risque géopolitique et demande de valeur refuge (haussier) → l'app affiche un biais **mixte**, ce qui correspond honnêtement à la réalité du marché plutôt qu'un faux signal tranché.
- Toutes les news affichées dans les panneaux ont un vrai lien vers l'article/la source originale.
- Les scénarios bull/base/bear (onglet Scénarios) ont été recalibrés sur ce régime réel (Fed plus restrictive, guerre en cours).
- Un badge **"Instantané du 11 sept. 2026"** a été ajouté dans la barre du haut pour qu'il soit toujours clair que ce n'est pas un flux en direct.

### ⚠️ Ceci reste un instantané figé, pas un flux live

Je n'ai pas d'accès à une API de marché en temps réel depuis cet environnement, et cette app n'a pas de backend connecté à un fournisseur de données. Concrètement :
- Les chiffres sont corrects **à la date du 11 septembre 2026** mais ne se mettront pas à jour tout seuls.
- Pour rafraîchir manuellement plus tard, il suffit de modifier les valeurs dans `App.jsx` (fonction `buildData()` pour les nœuds, `NODE_NEWS` pour les actualités).
- Pour du vrai temps réel, il faudrait brancher une vraie API de données de marché (ex. un fournisseur comme Twelve Data, Finnhub, Alpha Vantage, ou une API économique comme FRED) via une fonction serveur dédiée, sur le même principe que `api/ask.js`. C'est un chantier séparé — dis-le-moi si tu veux qu'on le fasse.

## Actualités en direct (gratuit, sans base de données)

MacroMap affiche de vraies actualités qui se rafraîchissent automatiquement, sans exposer ta clé Alpha Vantage au navigateur du visiteur.

**Comment ça marche :**
1. Une tâche planifiée GitHub Actions (`.github/workflows/refresh-news.yml`) se déclenche **toutes les 3h**.
2. Elle exécute `scripts/refresh-news.mjs`, qui fait **2 appels** à Alpha Vantage (un topic "macro" + un topic "marchés", en rotation — 16 appels/jour sur les 25 gratuits), puis range chaque **nouvel** article dans les bons facteurs de MacroMap (Fed, DXY, CPI, BTC, etc.) **par mots-clés** (`scripts/news-rules.mjs`) : gratuit, instantané, sans IA ni clé supplémentaire.
3. Le résultat est **fusionné** avec `public/live-news.json` : les news déjà présentes sont conservées (7 jours max, 4 par facteur au plus, dédoublonnées par lien), donc une news ne disparaît pas au run suivant simplement parce qu'elle n'est plus dans les derniers articles renvoyés par l'API. Les articles déjà traités ne sont pas reclassés (liste `seen` dans le fichier).
4. Le fichier est commité automatiquement sur le repo, ce qui déclenche un redéploiement Vercel.
5. Le site relit ce fichier statique au chargement, **puis toutes les 10 minutes et au retour sur l'onglet** — un onglet laissé ouvert se met donc à jour tout seul après chaque redéploiement. **Aucun visiteur n'appelle jamais Alpha Vantage** : le quota gratuit est protégé quel que soit le trafic.

**Le badge en haut à gauche** ("News en direct · il y a Xh") indique l'état du pipeline :
- vert : à jour ;
- jaune : plus de 8h sans actualisation (la tâche GitHub est probablement en échec — regarde l'onglet Actions) ou dernière vérification réseau échouée ;
- "En attente de la 1re actualisation" : `live-news.json` est encore vide, la tâche n'a jamais tourné.
Cliquer dessus force une vérification immédiate côté navigateur.

### Comment les news sont classées (mots-clés, sans IA)

- Chaque facteur a une liste de motifs pondérés dans `scripts/news-rules.mjs` (par exemple "FOMC", "non-farm payrolls", "Bitcoin ETF"…). Un motif trouvé dans le **titre** compte double. Un article est rattaché à ses 2 meilleurs facteurs au plus, et seulement s'il atteint un score minimal.
- Des garde-fous évitent les faux positifs : "Gold Coast" n'est pas de l'or, l'inflation britannique n'est pas le CPI américain, "olive oil" n'est pas du pétrole, "fed up" n'est pas la Fed. Les articles quasi identiques repris par plusieurs médias ne sont gardés qu'une fois.
- **Ce que le site affiche** : le titre **original (en anglais)**, la source, la date, le lien, le sentiment de l'article calculé par Alpha Vantage ("plutôt haussier"…) et les mots-clés qui ont déclenché le rattachement ("L'article évoque : Fed, FOMC"). Le résumé fourni par Alpha Vantage ne sert qu'à classer : il n'est jamais recopié sur le site.
- **Limites** : c'est moins fin qu'une IA. Quelques articles pertinents peuvent être ignorés, quelques rattachements peuvent être approximatifs, et il n'y a pas de résumé en français. Le journal de chaque run (onglet Actions) liste les rattachements, ce qui permet de voir ce qu'il faut affiner dans `scripts/news-rules.mjs` (puis `npm run test:rules`).
- Si tu veux un jour remettre une IA, il suffit de remplacer l'appel à `classifyArticles` dans `scripts/refresh-news.mjs` : le reste (fusion, quota, site) ne change pas.

### Configuration requise (à faire une seule fois, sur GitHub — pas sur Vercel)

1. **Repo GitHub → Settings → Secrets and variables → Actions → New repository secret**, et ajoute :
   - `ALPHA_VANTAGE_API_KEY` — ta clé Alpha Vantage (gratuite sur alphavantage.co)


   C'est un **secret GitHub Actions**, un espace séparé des variables d'environnement Vercel. Aucune clé d'IA n'est nécessaire pour les news (`ANTHROPIC_API_KEY` ne sert plus que pour le bouton "Ask the map", côté Vercel).
2. **Settings → Actions → General → Workflow permissions** : choisis *Read and write permissions* (nécessaire pour que la tâche puisse commiter `live-news.json`).
3. **Onglet Actions → "Refresh live news" → Run workflow** pour un premier lancement manuel. Le log doit finir par une ligne `OK — … facteurs …`.
4. Vérifie sur Vercel qu'un nouveau déploiement est apparu juste après le commit "chore: refresh live news". Recharge le site : le badge doit passer au vert.

### Si Vercel ne redéploie pas tout seul

Certaines configurations Vercel (notamment le plan Hobby avec un auteur de commit qui n'est pas lié à ton compte) ignorent les commits du bot GitHub. Solution : dans Vercel → Project → Settings → Git → **Deploy Hooks**, crée un hook, puis ajoute son URL comme secret GitHub `VERCEL_DEPLOY_HOOK`. Le workflow le déclenchera alors lui-même après chaque commit. Ne l'ajoute pas si Vercel redéploie déjà seul (sinon deux déploiements par run).

### Tests

`npm run test:news` lance les tests hors-ligne de la logique de fusion / rotation des topics / validation des liens (aucune clé ni réseau nécessaire), et `npm run test:rules` ceux du classement par mots-clés (faux positifs, plafonds, doublons). Le premier est aussi exécuté à chaque run de la tâche GitHub, avant l'appel à Alpha Vantage.

### Limites connues

- Fréquence : ligne `cron` du workflow. Si tu la changes, adapte aussi `SLOT_MS` dans `scripts/news-lib.mjs` et recalcule le quota (runs/jour × 2 appels ≤ 25, en gardant de la marge pour les lancements manuels).
- Si les secrets manquent ou si Alpha Vantage refuse la requête (quota, clé invalide), le script échoue proprement (log clair dans l'onglet Actions, GitHub t'envoie un mail) **sans toucher** au fichier existant : le site garde les dernières news connues.
- Les actualités en direct complètent celles écrites en dur dans `App.jsx` : pour un facteur donné, s'il y a des news live elles remplacent les statiques ; sinon il retombe automatiquement sur ce qui existait avant (donc jamais d'écran vide).
- Alpha Vantage est en anglais et généraliste : certains facteurs très spécifiques (ex. flux d'ETF or, achats des banques centrales) recevront rarement des news live et resteront sur le contenu statique.

## Bouton "Actualiser" (actualisation manuelle des news)

Le bouton doré **Actualiser** de la barre du haut lance une actualisation immédiate, sans attendre le cycle de 3h. Il ne parle pas à Alpha Vantage lui-même (ta clé serait exposée et n'importe quel visiteur pourrait épuiser ton quota) : il appelle la fonction `api/refresh-news.js`, qui demande à GitHub de lancer la même tâche "Refresh live news" que l'actualisation automatique.

**Ce que tu vois :** un message en bas de l'écran suit les étapes (lancement → récupération des news, environ 1 min → mise en ligne du site, 1 à 2 min → "News mises à jour ✓"). Compte **2 à 4 minutes** en tout. En cas de problème, le message dit lequel (avec un lien vers le journal GitHub si la tâche a échoué).

**Protection du quota gratuit Alpha Vantage** (25 requêtes/jour, 2 par actualisation), appliquée côté serveur en comptant les runs réels via l'API GitHub :
- jamais deux actualisations en même temps ;
- **4 actualisations manuelles par jour au maximum** (jour UTC), réglable avec `MANUAL_MAX_PER_DAY` ;
- **10 minutes minimum** entre deux actualisations, réglable avec `MANUAL_COOLDOWN_MIN` ;
- le quota des actualisations automatiques encore prévues aujourd'hui est toujours réservé : le bouton refuse plutôt que de les priver de quota.
Le calcul du quota suppose que le compteur d'Alpha Vantage suit le jour UTC ; si leur remise à zéro est à une autre heure, garde de la marge.

### Configuration (une seule fois, sur GitHub puis sur Vercel)

Prérequis : l'actualisation automatique doit déjà fonctionner (secret `ALPHA_VANTAGE_API_KEY` sur GitHub, voir plus haut). Le bouton ne peut pas la réparer : il ne fait que la déclencher.

1. **Créer un jeton GitHub** : GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
   - *Repository access* : "Only select repositories" → ton repo MacroMap uniquement.
   - *Repository permissions* : **Actions → Read and write** (Metadata en lecture est ajouté automatiquement).
   - Choisis une expiration (1 an maximum) : à l'expiration, le bouton affichera "GitHub refuse le jeton" et il suffira d'en créer un nouveau.
2. **Vercel → ton projet → Settings → Environment Variables**, ajoute :
   - `GITHUB_DISPATCH_TOKEN` : le jeton ci-dessus ;
   - `GITHUB_REPO` : `ton-compte/ton-repo` ;
   - `GITHUB_BRANCH` : uniquement si ta branche principale n'est pas `main` ;
   - `REFRESH_CODE` (recommandé si ton site est public) : un mot de passe de ton choix. Le bouton le demandera une fois par navigateur puis le mémorisera. Sans lui, n'importe quel visiteur pourrait consommer tes 4 actualisations du jour.
3. **Redéploie** le projet (Deployments → Redeploy) : Vercel ne prend en compte les nouvelles variables qu'au déploiement suivant.
4. Clique sur **Actualiser** et suis le message.

### Ce que le bouton ne fait pas

- Il ne met à jour que les facteurs pour lesquels des articles récents ont été trouvés et classés ; les autres gardent leurs news écrites en dur dans `App.jsx` (celles du 11 septembre). C'est normal : le nombre de facteurs mis à jour dépend de l'actualité du moment.
- Il n'a aucun effet en local (`npm run dev`) ni dans l'aperçu : la fonction n'existe que sur Vercel. Le bouton l'indique.
- Le badge "News en direct · il y a Xh", lui, sert toujours à relire simplement le fichier déjà publié, sans rien lancer.
- `npm run test:refresh` vérifie les règles de quota, le code d'accès et les cas d'erreur, hors-ligne (faux GitHub).

## Fond "espace" : étoiles + nébuleuse (purement décoratif)

Un fond animé est dessiné derrière la carte mentale (et, en version discrète, dans le bandeau de la page "Vue d'ensemble") : un champ d'étoiles réparti sur tout l'écran et une nébuleuse derrière. Tout est dans `src/App.jsx`, dans le bloc entre les commentaires `GALAXY:START` et `GALAXY:END` + le composant `GalaxyBackground` juste en dessous : aucune dépendance ajoutée, aucune donnée touchée.

- **Étoiles** : réparties sur toute la surface, en 3 profondeurs (lointaines, moyennes, proches) qui se décalent à des vitesses différentes quand tu fais glisser la carte (effet de profondeur), avec scintillement, quelques étoiles brillantes à aigrettes et une étoile filante occasionnelle. Le nombre d'étoiles s'adapte à la taille de l'écran.
- **Nébuleuse** : nuages indigo / violet / magenta et filaments bleu ciel, générés par bruit fractal. Elle est calculée en 4 petites tranches juste après l'affichage (l'interface ne se fige pas) puis apparaît en fondu. Une zone plus calme est ménagée autour du nœud focal et des facteurs pour qu'ils se détachent du fond, comme des pièces posées dessus.
- **Couleur du marché** : elle teinte légèrement la nébuleuse et une partie des étoiles (`MARKET_ACCENT`), avec une transition douce quand tu changes de marché.
- Le bouton ✦ en bas à droite de la carte l'active / la coupe (préférence mémorisée dans le navigateur). Si ton système demande de réduire les animations (`prefers-reduced-motion`), le fond est dessiné fixe.
- **Réglages** : constante `GALAXY` (`FAR`, `MID`, `NEAR` = nombre d'étoiles lointaines / moyennes / proches ; `NEB_W`, `NEB_H` = finesse de la nébuleuse). Sur une machine peu puissante, baisse `FAR` et `MID` (ex. 500 et 250). L'intensité de la nébuleuse se règle avec `nebGain` (0.6 sur la carte) dans `GalaxyBackground`.
- Pour la supprimer complètement : retire les deux lignes `<GalaxyBackground … />` (dans `HierCanvas` et `OverviewView`).
- `npm run test:galaxy` vérifie le moteur hors-ligne (déterminisme, répartition des étoiles, aucune valeur invalide même avec des déplacements extrêmes).

## Nouveau : moteur de "Current Relevance" (pricing engine)

Objectif : ne plus afficher tous les facteurs d'un marché avec le même poids, mais distinguer ce qui **explique le pricing actuel** de ce qui est juste "structurellement important".

Ce que ça change concrètement :

- **Gold, focal du pilote.** Quand tu ouvres le nœud "Gold" dans la mind map, les facteurs (Real Yields, USD, Central Bank Buying, ETF Flows, Safe-Haven, Geopolitical Risk, Physical Demand, Mining Supply) sont maintenant scorés par `bucketDrivers()` (voir `classifyDriverRelevance` / `bucketDrivers` dans `App.jsx`, juste après `computeBias`). Résultat pour les données actuelles : Real Yields, Geopolitical Risk, USD et Safe-Haven Demand ressortent comme **drivers actuels** ; Central Bank Buying (tendance multi-trimestres) est reclassé en **support structurel** et masqué par défaut sur la carte (bouton "+1 facteur structurel" pour le réafficher).
- **Panneau du nœud (clique sur Gold, ou tout autre nœud ayant des facteurs entrants).** La section "Biais actuel" affiche maintenant, dans l'ordre : *Qu'est-ce qui a changé ?* (généré à partir des drivers réellement en mouvement), les **drivers actuels**, un tiroir repliable **facteurs secondaires**, un tiroir repliable **contexte structurel**, les éléments contradictoires (existant), puis *Qu'est-ce qui pourrait changer ce pricing ?* (reprend `whatCouldChange` s'il existe, sinon généré à partir des drivers actuels).
- **Générique, pas hardcodé pour Gold.** Le moteur tourne sur n'importe quel nœud ayant des relations entrantes avec une direction (↑/↓) — ça fonctionne aussi, plus légèrement, sur Equities (Rates + Growth ressortent comme drivers). Là où les données sous-jacentes n'ont pas encore de relations chiffrées (DXY seul, Bonds, Commodities pris isolément), le panneau reste simplement vide sur cette section plutôt que d'inventer des facteurs — volontaire, pour respecter la règle "pas de données inventées".
- **Rien n'est supprimé.** Tous les facteurs existent toujours dans les données et restent accessibles (secondaires et structurels sont dépliables) ; seule la priorité d'affichage par défaut change.

### Limites connues / suite logique

- Le classement combine importance structurelle (`node.importance`), force/confiance de la relation (`edge.strength`, `edge.confidence`), preuve disponible (`NODE_NEWS`, `node.evidence`, `edge.evidence`) et un nouveau champ `timeframe` ("Short"/"Medium"/"Long") posé sur les facteurs de Gold, USD, Equities, Bonds, Commodities. Pour aller plus loin (DXY, BTC, Oil en tant que marchés à part entière avec leurs propres facteurs comme dans le brief), il faudrait leur ajouter des relations entrantes dédiées (comme cela existe déjà pour `gold`) — la logique de scoring n'a pas besoin de changer, seulement les données.
- Le "What changed?" est généré à partir du texte déjà présent sur les facteurs (`edge.desc`, valeur, direction) — il n'y a pas de flux de données live, donc pas de "surprise vs consensus" numérique générique au-delà de ce qui existe déjà pour CPI/PCE/PPI.
- La hiérarchisation visuelle (item "priorité de l'information" du brief) est implémentée sur la mind map + le panneau nœud ; la vue "Impact marchés" (onglet séparé) n'a pas encore été enrichie avec le même résumé "Pourquoi ce prix ?" — actuellement seul le panneau de nœud le fait.
