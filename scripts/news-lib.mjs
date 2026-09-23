// Fonctions pures utilisées par scripts/refresh-news.mjs.
// Séparées du script principal pour pouvoir être testées sans réseau
// (voir scripts/test-news-lib.mjs → `npm run test:news`).

export const MAX_AGE_DAYS = 7; // une news live plus vieille que ça sort du fichier
export const MAX_PER_FACTOR = 4; // nb max d'articles gardés par facteur
export const MAX_SEEN = 400; // nb max d'URLs déjà traitées mémorisées

// Alpha Vantage NEWS_SENTIMENT : UN seul topic par appel (pas de combinaison de filtres,
// ce qui évite de dépendre de la façon dont l'API combine plusieurs topics/tickers).
// Chaque run fait 2 appels (1 "macro" + 1 "marchés") en tournant sur les topics :
// 8 runs/jour × 2 appels = 16 appels/jour, sous la limite gratuite de 25/jour, avec de la
// marge pour les déclenchements manuels.
const MACRO_TOPICS = ["economy_macro", "economy_monetary", "economy_fiscal"];
const MARKET_TOPICS = ["financial_markets", "blockchain"];
const SLOT_MS = 3 * 60 * 60 * 1000; // = la fréquence du cron (toutes les 3h)

export function pickTopics(now = new Date()) {
  const slot = Math.floor(now.getTime() / SLOT_MS);
  return [MACRO_TOPICS[slot % MACRO_TOPICS.length], MARKET_TOPICS[slot % MARKET_TOPICS.length]];
}

// "20260912T143000" (UTC) -> "2026-09-12T14:30:00.000Z"
export function parseAvTime(t) {
  if (typeof t !== "string" || !/^\d{8}T\d{4,6}$/.test(t)) return null;
  const y = t.slice(0, 4), mo = t.slice(4, 6), d = t.slice(6, 8);
  const hh = t.slice(9, 11), mm = t.slice(11, 13), ss = t.slice(13, 15) || "00";
  const date = new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Même format que les dates déjà utilisées dans App.jsx : "Sep 12, 2026"
export function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function isHttpUrl(u) {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

// Extrait le premier objet JSON d'une réponse de modèle (tolère ```json … ``` ou du texte autour).
export function extractJson(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("aucun objet JSON dans la réponse");
  return JSON.parse(s.slice(start, end + 1));
}

function itemTime(it) {
  const t = Date.parse(it?.publishedAt || "");
  return Number.isNaN(t) ? null : t;
}

// Fusionne les news déjà présentes (prev) avec les nouvelles (fresh), par facteur :
// dédoublonnage par lien, purge des articles trop vieux, tri du plus récent au plus ancien,
// plafond par facteur. C'est ce qui évite qu'une news disparaisse dès le run suivant.
export function mergeNews(prev = {}, fresh = {}, now = new Date(), opts = {}) {
  const maxAgeDays = opts.maxAgeDays ?? MAX_AGE_DAYS;
  const maxPerFactor = opts.maxPerFactor ?? MAX_PER_FACTOR;
  const cutoff = now.getTime() - maxAgeDays * 86400000;
  const out = {};
  const ids = new Set([...Object.keys(prev || {}), ...Object.keys(fresh || {})]);
  for (const id of ids) {
    const seen = new Set();
    const merged = [];
    for (const it of [...(fresh?.[id] || []), ...(prev?.[id] || [])]) {
      if (!it || !it.headline) continue;
      const key = it.link || it.headline;
      if (seen.has(key)) continue;
      seen.add(key);
      const ts = itemTime(it);
      if (ts === null || ts < cutoff) continue; // âge inconnu ou trop vieux → on retire
      merged.push(it);
    }
    merged.sort((a, b) => itemTime(b) - itemTime(a));
    if (merged.length) out[id] = merged.slice(0, maxPerFactor);
  }
  return out;
}

// Transforme la réponse de classification de Claude en items prêts pour l'app.
// Ne garde que des ids de facteurs connus, des index d'articles valides et des liens http(s).
export function buildFreshByFactor(classification, articles, factorIds, sourceFallback = "Alpha Vantage") {
  const byFactor = {};
  const known = new Set(factorIds);
  for (const [factorId, items] of Object.entries(classification || {})) {
    if (!known.has(factorId) || !Array.isArray(items)) continue;
    const out = [];
    for (const it of items) {
      const idx = Number(it?.articleIndex);
      const src = Number.isInteger(idx) ? articles[idx] : null;
      if (!src || !isHttpUrl(src.url)) continue;
      const publishedAt = parseAvTime(src.time_published);
      if (!publishedAt) continue;
      out.push({
        kind: "catalyst",
        headline: it.headline || src.title,
        date: formatDate(publishedAt) || "—",
        publishedAt,
        source: src.source || sourceFallback,
        summary: it.summary || "",
        why: it.why || "",
        link: src.url,
      });
      if (out.length >= 2) break;
    }
    if (out.length) byFactor[factorId] = out;
  }
  return byFactor;
}
