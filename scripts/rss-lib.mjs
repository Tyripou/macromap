// Lecture de flux RSS publics, gratuits, sans clé — en plus d'Alpha Vantage.
// Utilisé par scripts/refresh-news.mjs. Testé hors-ligne avec de vrais extraits de ces flux
// dans scripts/test-rss-lib.mjs (`npm run test:rss`), donc sans réseau ni clé.
//
// Chaque flux a été vérifié manuellement le 25 septembre 2026 (contenu réel, à jour).
//   - Fed, communiqués de politique monétaire (déclarations FOMC, minutes) : très peu fréquent
//     (environ toutes les 6 semaines) mais très ciblé sur "fed" / "fomc".
//   - Fed, tous les discours des gouverneurs : plus fréquent, utile pour "rate-expectations"
//     (ton hawkish/dovish) et "fomc".
//   - CoinDesk, toutes les actualités : très fréquent, couvre le bitcoin mais aussi le dollar,
//     les rendements obligataires, le pétrole, la Fed quand ils touchent la crypto.
// Aucun de ces flux ne compte dans le quota Alpha Vantage (25 requêtes/jour) : ce sont des
// requêtes HTTP normales vers des sites publics, sans clé, sans limite connue pour cet usage.
export const RSS_FEEDS = [
  { name: "Federal Reserve (politique monétaire)", url: "https://www.federalreserve.gov/feeds/press_monetary.xml" },
  { name: "Federal Reserve (discours)", url: "https://www.federalreserve.gov/feeds/speeches.xml" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
];

const ENTITIES = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&#8217;": "'", "&#8216;": "'", "&#8220;": '"', "&#8221;": '"', "&#8211;": "-", "&#8212;": "-" };
function decodeEntities(s) {
  let out = String(s || "");
  for (const [k, v] of Object.entries(ENTITIES)) out = out.split(k).join(v);
  return out;
}
const stripTags = (s) => decodeEntities(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Un tag peut être en texte brut (<title>Texte</title>) ou en CDATA (<title><![CDATA[Texte]]></title>) —
// les 3 flux vérifiés utilisent les deux formes selon le tag, donc il faut accepter les deux.
function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*<\\/${tag}>`, "i");
  const m = re.exec(block);
  if (!m) return "";
  return stripTags(m[1] !== undefined ? m[1] : m[2]);
}

// xml : le texte brut d'un flux RSS 2.0. Retourne [{ title, link, summary, publishedAtIso }],
// le plus récent en tête si le flux est déjà trié ainsi (c'est le cas des 3 flux ci-dessus).
// Ne lève jamais : une entrée sans titre, sans lien http(s) ou sans date valide est ignorée.
export function parseRssItems(xml) {
  const text = String(xml || "");
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(text))) {
    const block = m[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDateRaw = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "dc:date");
    const summary = extractTag(block, "description") || extractTag(block, "content:encoded");
    if (!title || !/^https?:\/\//i.test(link)) continue;
    const d = new Date(pubDateRaw);
    if (Number.isNaN(d.getTime())) continue;
    items.push({ title, link, summary, publishedAtIso: d.toISOString() });
  }
  return items;
}
