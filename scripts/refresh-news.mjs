// Lancé toutes les 3h par .github/workflows/refresh-news.yml (GitHub Actions) — jamais sur
// Vercel, jamais déclenché par un visiteur du site. Il récupère des news de marché brutes
// chez Alpha Vantage ET sur des flux RSS publics et gratuits (Fed, CoinDesk — voir
// scripts/rss-lib.mjs), les range dans les facteurs existants de MacroMap PAR MOTS-CLÉS (voir
// scripts/news-rules.mjs : aucune IA, aucun coût, aucune clé supplémentaire), FUSIONNE le
// résultat avec ce qui est déjà dans public/live-news.json (pour que les news ne disparaissent
// pas au run suivant), puis réécrit le fichier.
//
// Le site ne lit que ce fichier statique (voir refreshLiveNews() dans src/App.jsx) : il
// n'appelle jamais Alpha Vantage ni les flux RSS. Le quota gratuit d'Alpha Vantage (25
// requêtes/jour) ne dépend donc pas du trafic : ce script fait 2 appels Alpha Vantage par run
// (voir pickTopics), 8 runs/jour. Les flux RSS, eux, sont lus à chaque run sans compter dans ce
// quota — ce sont de simples requêtes HTTP vers des sites publics, sans clé.
//
// Secret requis (GitHub → Settings → Secrets and variables → Actions) :
//   ALPHA_VANTAGE_API_KEY

import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  MAX_AGE_DAYS,
  MAX_SEEN,
  pickTopics,
  parseAvTime,
  formatAvTime,
  mergeNews,
  buildFreshByFactor,
} from "./news-lib.mjs";
import { classifyArticles, FACTOR_IDS } from "./news-rules.mjs";
import { RSS_FEEDS, parseRssItems } from "./rss-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "..", "public", "live-news.json");

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

if (!ALPHA_VANTAGE_API_KEY) {
  console.error("ALPHA_VANTAGE_API_KEY manquante — arrêt sans toucher à live-news.json.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Flux RSS publics (Fed, CoinDesk — voir scripts/rss-lib.mjs) : gratuits, sans clé, et ne
// comptent pas dans le quota Alpha Vantage. Lus à CHAQUE run, indépendamment de la rotation
// des filtres Alpha Vantage. Une panne d'un flux (site en maintenance, etc.) n'interrompt pas
// le run : on continue avec ce qu'on a, comme pour Alpha Vantage.
async function fetchRssFeed(feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": "MacroMap news bot (+github actions)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRssItems(xml).map((it) => ({
    title: it.title,
    url: it.link,
    source: feed.name,
    time_published: formatAvTime(it.publishedAtIso), // même format que les articles Alpha Vantage
    summary: it.summary,
    sentiment: undefined, // pas de sentiment pour une source RSS ; news-rules.mjs gère déjà ce cas
    tickers: "",
  }));
}

async function fetchTopic(entry) {
  // limit=200 : ne coûte rien de plus (toujours 1 seul appel), mais donne beaucoup plus
  // d'articles à classer localement par mots-clés — c'est le principal levier de fraîcheur.
  const param = entry.kind === "tickers" ? "tickers" : "topics";
  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&${param}=${encodeURIComponent(entry.value)}&sort=LATEST&limit=200&apikey=${ALPHA_VANTAGE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  const data = await res.json();
  if (data.Note || data.Information || data["Error Message"]) {
    // Quota dépassé, clé refusée, etc. — on le dit clairement plutôt que d'écrire du vide.
    throw new Error(`Alpha Vantage a refusé la requête : ${data.Note || data.Information || data["Error Message"]}`);
  }
  const feed = Array.isArray(data.feed) ? data.feed : [];
  return feed.map((a) => ({
    title: a.title,
    url: a.url,
    source: a.source,
    time_published: a.time_published, // ex. 20260912T143000 (UTC)
    summary: a.summary, // sert uniquement à classer (jamais recopié sur le site)
    sentiment: a.overall_sentiment_label, // ex. "Somewhat-Bullish"
    // tickers très liés à l'article (ex. "CRYPTO:BTC") : un indice de plus pour le classement
    tickers: (Array.isArray(a.ticker_sentiment) ? a.ticker_sentiment : [])
      .filter((t) => Number(t.relevance_score) >= 0.5)
      .map((t) => t.ticker)
      .join(" "),
  }));
}

async function readPrevious() {
  try {
    const raw = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    return {
      byFactor: raw && typeof raw.byFactor === "object" && raw.byFactor ? raw.byFactor : {},
      seen: Array.isArray(raw?.seen) ? raw.seen : [],
    };
  } catch {
    return { byFactor: {}, seen: [] };
  }
}

async function main() {
  const now = new Date();
  const prev = await readPrevious();
  const topics = pickTopics(now);
  console.log(`Filtres de ce run : ${topics.map((t) => `${t.kind}=${t.value}`).join(", ")}`);

  // 1) Alpha Vantage — un filtre par appel. Si un appel échoue mais qu'un autre réussit,
  //    on continue avec ce qu'on a.
  const collected = [];
  let okCalls = 0;
  let lastError = null;
  for (const [i, entry] of topics.entries()) {
    if (i > 0) await sleep(1500); // limite gratuite : 5 requêtes/minute
    const label = `${entry.kind}=${entry.value}`;
    try {
      const feed = await fetchTopic(entry);
      console.log(`  ${label} : ${feed.length} articles`);
      collected.push(...feed);
      okCalls++;
    } catch (err) {
      lastError = err;
      console.error(`  ${label} : échec — ${err.message}`);
    }
  }

  // 2) Flux RSS publics (Fed, CoinDesk) — lus à chaque run, hors quota Alpha Vantage. Une panne
  //    d'un flux n'empêche pas les autres sources de compter.
  let rssOkCount = 0;
  for (const feed of RSS_FEEDS) {
    try {
      const items = await fetchRssFeed(feed);
      console.log(`  RSS ${feed.name} : ${items.length} articles`);
      collected.push(...items);
      rssOkCount++;
    } catch (err) {
      console.error(`  RSS ${feed.name} : échec — ${err.message}`);
    }
  }

  // On ne s'arrête que si AUCUNE source (ni Alpha Vantage, ni RSS) n'a fonctionné ce run ;
  // sinon on continue avec ce qu'on a plutôt que de perdre un run entier pour une seule panne.
  if (okCalls === 0 && rssOkCount === 0) throw lastError || new Error("aucune source n'a répondu (ni Alpha Vantage, ni les flux RSS)");

  // 2) Dédoublonnage, retrait des articles déjà traités ou trop vieux, plus récents d'abord.
  const cutoff = now.getTime() - MAX_AGE_DAYS * 86400000;
  const seenSet = new Set(prev.seen);
  const unique = new Map();
  for (const a of collected) {
    if (!a.url || unique.has(a.url)) continue;
    unique.set(a.url, a);
  }
  const fresh = [...unique.values()]
    .filter((a) => !seenSet.has(a.url))
    .filter((a) => {
      const iso = parseAvTime(a.time_published);
      return iso && Date.parse(iso) >= cutoff;
    })
    .sort((a, b) => (b.time_published || "").localeCompare(a.time_published || ""))
    .slice(0, 100);
  console.log(`${unique.size} articles uniques, ${fresh.length} nouveaux à classer.`);

  // 3) Classement par mots-clés (gratuit et instantané). Le journal liste les rattachements :
  //    utile pour repérer ce qu'il faut affiner dans scripts/news-rules.mjs.
  let freshByFactor = {};
  if (fresh.length > 0) {
    const result = classifyArticles(fresh);
    console.log(`Classement par mots-clés : ${result.stats.classified} articles rattachés à un facteur, ${result.stats.ignored} ignorés (aucun facteur assez clair).`);
    for (const m of result.matches.slice(0, 30)) console.log(`  [${m.id}] (${m.score}) ${m.title.slice(0, 110)}`);
    freshByFactor = buildFreshByFactor(result.byFactor, fresh, FACTOR_IDS);
  }

  // 4) Fusion avec l'existant, puis écriture. updatedAt = dernière vérification réussie
  //    (même s'il n'y avait rien de neuf) : c'est ce que le badge du site affiche.
  const byFactor = mergeNews(prev.byFactor, freshByFactor, now);
  const seen = [...fresh.map((a) => a.url), ...prev.seen].slice(0, MAX_SEEN);
  const output = { updatedAt: now.toISOString(), byFactor, seen };
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`OK — ${Object.keys(freshByFactor).length} facteurs avec du nouveau, ${Object.keys(byFactor).length} facteurs avec des news au total.`);
}

main().catch((err) => {
  console.error("refresh-news a échoué :", err.message);
  process.exit(1);
});
