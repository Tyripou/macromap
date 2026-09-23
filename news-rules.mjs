// Classement des articles par mots-clés — 100 % gratuit, aucune IA, aucune clé supplémentaire.
// Utilisé par scripts/refresh-news.mjs à la place de l'ancien appel à Claude.
//
// Principe : pour chaque facteur de MacroMap, une liste de motifs pondérés. Un motif trouvé dans le TITRE
// compte double (le titre résume l'article), trouvé seulement dans le résumé Alpha Vantage il compte une fois.
// Un facteur est retenu si son score atteint MIN_SCORE. Chaque article va vers ses 2 meilleurs facteurs au
// maximum, et chaque facteur garde ses articles les mieux notés (sans doublons de titres quasi identiques).
//
//   gate : le texte doit aussi contenir ce motif (ex. "Gold" pour les sous-facteurs de l'or)
//   not  : si le texte contient ce motif, le facteur est écarté (ex. "olive oil" n'est pas du pétrole)
//
// POUR AJUSTER : ajoute / retire des motifs ci-dessous, puis lance `npm run test:rules`. Le journal de la
// tâche GitHub liste, à chaque actualisation, quels articles ont été rattachés à quels facteurs — utile pour
// voir ce qu'il faut affiner.

export const MIN_SCORE = 4;
export const MAX_PER_ARTICLE = 2;
export const MAX_PER_FACTOR = 2;

// --- contextes réutilisables ---
const GOLD_CTX = /\b(gold|XAU(USD)?|bullion)\b/i;
const BTC_CTX = /\b(bitcoin|BTC|crypto(currenc(y|ies))?)\b/i;
const OIL_CTX = /\b(oil|crude|Brent|WTI|barrels?|petroleum)\b/i;
const FED_CTX = /\b(Fed|Federal Reserve|FOMC)\b/;
const US_CTX = /\b(U\.S\.|US|United States|American|Wall Street|Washington|Trump|Fed|Federal Reserve|FOMC|Treasur(y|ies)|BLS|Bureau of Labor Statistics)\b/;
const RATES_CTX = /\b(Fed|Federal Reserve|FOMC)\b|\bU\.?S\.? (rates?|yields?)\b|\bTreasur(y|ies)\b/;
const DOLLAR_RE = /\b(dollar index|DXY|greenback|(US |U\.S\. )?dollar)\b/i;
const NOT_OIL = /\b(olive|palm|sunflower|cooking|coconut|vegetable|essential|motor|engine|snake|fish|castor) oil\b/i;
const NOT_GOLD = /\b(Gold Coast|gold medal(s|ist)?|Gold Cup|Golden (State|Globes?|Gate|Dome))\b/i;
const NOT_FOREIGN_INFLATION = /\b(UK|U\.K\.|Britain|British|Eurozone|euro[- ]area|Japan(ese)?|China|Chinese|India(n)?|Canad(a|ian)|Australia(n)?|German(y)?|French|France|Turk(ey|ish)|Brazil(ian)?|Argentin(a|ian)|Mexic(o|an)|Russia(n)?|Korea(n)?|Swiss|Switzerland|Spain|Spanish|Ital(y|ian)|Nigeria(n)?|Pakistan|South Africa(n)?) (headline |core )?(CPI|inflation|consumer prices?)\b/i;
const NOT_FED_UP = /\bfed up\b/i;
// Autres "dollars" : ne concernent pas le dollar américain.
const NOT_USD = /\b(Dollar (General|Tree|Shave|Store|Bill)|(Canadian|Australian|Hong Kong|New Zealand|Singapore|Taiwan|Zimbabwe) dollar)\b/i;
// Garde-fous appliqués au TITRE seulement (un résumé qui cite les États-Unis en passant ne suffit pas) :
//  usOnly       : le titre parle d'un autre pays sans mentionner les États-Unis -> écarté
//  notForeignCB : le titre parle d'une autre banque centrale sans mentionner la Fed -> écarté
const NON_US_TITLE = /\b(UK|Britain|British|Eurozone|euro zone|euro area|Germany|German|France|French|Italy|Italian|Spain|Spanish|Japan|Japanese|China|Chinese|India|Indian|Canada|Canadian|Australia|Australian|Turkey|Turkish|Brazil|Brazilian|Mexico|Mexican|Argentina|Nigeria|Russia|Russian|Korea|Korean|Sweden|Swedish|Switzerland|Swiss|Norway|Norwegian|New Zealand)\b/;
const US_TITLE = /\b(U\.S\.|US|American|Americans|Fed|Federal Reserve|FOMC|Washington|BLS|Wall Street|Treasur(y|ies)|Trump)\b/;
const FOREIGN_CB_TITLE = /\b(BoE|Bank of England|RBA|RBNZ|Bank of Canada|BoC|Riksbank|SNB|RBI|PBOC|Bank of Korea|BoK|Norges Bank|ECB|BOJ|Bank of Japan)\b/;
const FED_TITLE = /\b(Fed|Federal Reserve|FOMC|Powell)\b/;

// [motif, poids]
export const RULES = [
  // ---------------- OR ----------------
  { id: "gold", not: [NOT_GOLD], p: [[/\bgold\b/i, 2], [/\bXAU(USD)?\b/, 3], [/\bbullion\b/i, 2], [/\bgold (price|prices|futures|rally|rallies|slump|slumps|record|hits?|rises|falls|climbs|slides)\b/i, 3]] },
  { id: "g-real-yields", gate: GOLD_CTX, not: [NOT_GOLD], p: [[/\breal (Treasury )?yields?\b/i, 4], [/\bTIPS\b/, 2], [/\binflation-protected\b/i, 3], [/\breal rates\b/i, 3], [/\b(Treasury|bond) yields?\b/i, 2]] },
  { id: "g-usd", gate: GOLD_CTX, not: [NOT_GOLD, NOT_USD], p: [[DOLLAR_RE, 2], [/\b(strong|weak|weaker|stronger) dollar\b/i, 2]] },
  { id: "g-cb-demand", gate: GOLD_CTX, not: [NOT_GOLD], p: [[/\bcentral[- ]banks?\b/i, 2], [/\bcentral bank (gold )?(buying|purchases|demand|reserves)\b/i, 4], [/\b(PBOC|People's Bank of China|Reserve Bank of India|World Gold Council)\b/i, 2], [/\bofficial sector\b/i, 3], [/\bgold reserves\b/i, 3]] },
  { id: "g-etf-flows", not: [NOT_GOLD], p: [[/\bgold ETFs?\b/i, 4], [/\b(GLD|IAU)\b/, 3], [/\bSPDR Gold\b/i, 4], [/\bgold[- ](backed )?(fund|funds) (inflows?|outflows?|holdings)\b/i, 4]] },
  { id: "g-safe-haven", gate: GOLD_CTX, not: [NOT_GOLD], p: [[/\bsafe[- ]haven\b/i, 3], [/\bflight to (safety|quality)\b/i, 3], [/\brisk[- ]off\b/i, 2], [/\bhaven (demand|buying|assets?)\b/i, 3]] },
  { id: "g-geo-risk", gate: GOLD_CTX, not: [NOT_GOLD], p: [[/\bgeopolit\w*\b/i, 2], [/\b(war|conflict|tensions?|sanctions?|missile|attack|attacks|invasion|escalat\w+)\b/i, 1], [/\b(Ukraine|Russia|Taiwan|Iran|Israel|Gaza|Middle East)\b/i, 1]] },
  { id: "g-physical-demand", gate: GOLD_CTX, not: [NOT_GOLD], p: [[/\bphysical gold\b/i, 3], [/\bgold (imports|jewel(l)?ery|premium|discount)\b/i, 3], [/\b(jewel(l)?ery|wedding season|Diwali|Akshaya Tritiya)\b/i, 2], [/\b(India|Indian|China|Chinese)\b/i, 1], [/\bphysical demand\b/i, 3]] },

  // ---------------- DOLLAR / BANQUES CENTRALES ----------------
  { id: "dxy", not: [NOT_USD], p: [[/\b(DXY|dollar index)\b/i, 4], [/\bgreenback\b/i, 3], [/\b(US |U\.S\. )?dollar\b/i, 2], [/\bdollar (strength|weakness|rally|slides?|falls?|gains?|rises?|drops?|slips?|jumps?)\b/i, 3]] },
  { id: "usd", not: [NOT_USD], p: [[/\bU\.?S\.? dollar\b/i, 3], [/\bgreenback\b/i, 3], [/\bdollar\b/i, 2], [/\bsafe[- ]haven dollar\b/i, 2]] },
  { id: "rate-differentials", p: [[/\brate differentials?\b/i, 4], [/\byield (spread|differential|gap)s?\b/i, 3], [/\b(Bund|JGB|gilt)s? (yields?|spreads?)\b/i, 3], [/\b(US|U\.S\.)[- ](German|Japanese|UK) (yield|spread)/i, 3]] },
  { id: "ecb-europe", p: [[/\bECB\b/, 4], [/\bEuropean Central Bank\b/i, 4], [/\bLagarde\b/i, 3], [/\b(eurozone|euro area|euro zone)\b/i, 2], [/\bBundesbank\b/i, 2]] },
  { id: "boj-japan", p: [[/\bBOJ\b/i, 4], [/\bBank of Japan\b/i, 4], [/\bUeda\b/, 3], [/\byen\b/i, 2], [/\bJGBs?\b/, 2], [/\bJapan(ese)? (rates?|yields?|inflation|bond)\b/i, 2]] },

  // ---------------- FED / TAUX ----------------
  { id: "fed", not: [NOT_FED_UP], notForeignCB: true, p: [[/\bFederal Reserve\b/, 4], [/\bthe Fed\b/, 3], [/\bFed\b/, 2], [/\bPowell\b/, 3], [/\bFed (chair|chairman|governor|governors|officials?|policymakers?|policy|independence|board)\b/, 3]] },
  { id: "fomc", not: [NOT_FED_UP], notForeignCB: true, p: [[/\bFOMC\b/, 5], [/\bFederal Open Market Committee\b/i, 5], [/\b(dot plot|Fed minutes|FOMC minutes)\b/i, 4], [/\b(holds|keeps|cuts|raises|hikes|lowers|leaves) (its )?(benchmark |key |policy |interest )?rates?( steady| unchanged)?\b/i, 2]], gate: FED_CTX },
  { id: "rate-expectations", gate: RATES_CTX, not: [NOT_FED_UP], notForeignCB: true, p: [[/\brate[- ](cut|cuts|hike|hikes)\b/i, 3], [/\b(CME )?FedWatch\b/i, 4], [/\b(interest[- ]rate|rate) (expectations|bets|odds|outlook|path|trajectory)\b/i, 3], [/\b(dovish|hawkish)\b/i, 2], [/\b(traders|markets?) (price|pricing|bet|betting)\b/i, 2], [/\beasing cycle\b/i, 3]] },

  // ---------------- INFLATION ----------------
  { id: "cpi", gate: US_CTX, usOnly: true, not: [NOT_FOREIGN_INFLATION], p: [[/\bCPI\b/, 4], [/\bconsumer price(s)?( index)?\b/i, 4], [/\binflation (report|data|reading|print|rate|rates|numbers|expectations)\b/i, 3], [/\binflation (rises|rose|cools|cooled|slows|slowed|accelerates|accelerated|eases|eased|picks up|heats up|jumps|jumped)\b/i, 3], [/\binflation\b/i, 1]] },
  { id: "core-cpi", gate: US_CTX, usOnly: true, not: [NOT_FOREIGN_INFLATION], p: [[/\bcore (CPI|inflation|consumer prices)\b/i, 5], [/\bexcluding food and energy\b/i, 3], [/\bcore prices\b/i, 3]] },
  { id: "pce", gate: US_CTX, usOnly: true, p: [[/\bPCE\b/, 5], [/\bpersonal consumption expenditures?\b/i, 5], [/\bcore PCE\b/i, 5]] },
  { id: "ppi", gate: US_CTX, usOnly: true, p: [[/\bPPI\b/, 5], [/\bproducer price(s)?( index)?\b/i, 5], [/\bwholesale (inflation|prices)\b/i, 3]] },

  // ---------------- TAUX LONGS ----------------
  { id: "us10y", p: [[/\b10[- ]?year (Treasury|yield|note|US|U\.S\.|benchmark)/i, 4], [/\bTreasury yields?\b/i, 3], [/\b(10Y|10-yr|10-year)\b/i, 2], [/\bbenchmark yield\b/i, 3], [/\bbond yields?\b/i, 2]] },
  { id: "real-yields", p: [[/\breal (Treasury )?yields?\b/i, 4], [/\bTIPS\b/, 2], [/\binflation-protected\b/i, 3], [/\breal rates\b/i, 3], [/\bbreakevens?\b/i, 3]] },
  { id: "bonds", p: [[/\bTreasur(y|ies) (bonds?|notes?|bills?|yields?|market|prices?|selloff|sell-off|rally|auction)\b/i, 3], [/\bTreasuries\b/, 3], [/\bbond market\b/i, 3], [/\bbond (yields?|prices?|rally|selloff|sell-off|traders|investors)\b/i, 3], [/\bgovernment bonds?\b/i, 2], [/\bT-?bills?\b/, 2]] },
  { id: "treasury-supply", p: [[/\bTreasury (auction|issuance|supply|refunding|borrowing)\b/i, 5], [/\bquarterly refunding\b/i, 5], [/\bauction sizes?\b/i, 3], [/\b(bond|note|bill) auctions?\b/i, 4], [/\bdebt (ceiling|limit)\b/i, 4], [/\bnational debt\b/i, 3], [/\b(federal |budget )?deficit\b/i, 3], [/\bfiscal (deficit|policy|stimulus)\b/i, 2]] },

  // ---------------- CROISSANCE / EMPLOI ----------------
  { id: "growth", gate: US_CTX, usOnly: true, p: [[/\bGDP\b/, 4], [/\bgross domestic product\b/i, 4], [/\beconomic growth\b/i, 3], [/\brecession\b/i, 3], [/\bISM\b/, 3], [/\b(PMI|purchasing managers)\b/, 3], [/\bretail sales\b/i, 2], [/\bsoft landing\b/i, 3], [/\bindustrial production\b/i, 2]] },
  { id: "nfp", gate: US_CTX, usOnly: true, p: [[/\bnon-?farm payrolls?\b/i, 5], [/\bNFP\b/, 5], [/\bjobs report\b/i, 4], [/\bpayrolls\b/i, 3], [/\b(employment|jobs) (report|data|gain|gains|added|growth)\b/i, 3], [/\bunemployment rate\b/i, 2]] },
  { id: "labor", gate: US_CTX, usOnly: true, p: [[/\bunemployment\b/i, 2], [/\bjobless claims\b/i, 4], [/\binitial claims\b/i, 3], [/\bJOLTS\b/, 4], [/\bjob openings\b/i, 3], [/\blabor market\b/i, 3], [/\blayoffs?\b/i, 2], [/\bwage (growth|gains|inflation)\b/i, 3], [/\bADP\b/, 3]] },

  // ---------------- ACTIONS ----------------
  { id: "equities", p: [[/\bWall Street\b/, 3], [/\bU\.?S\.? stocks\b/i, 3], [/\b(Dow( Jones)?|S&P|Nasdaq)\b/, 2], [/\bstock market\b/i, 3], [/\bequit(y|ies)\b/i, 1], [/\b(bull|bear) market\b/i, 3], [/\b(sell-?off|rally)\b/i, 1]] },
  { id: "nasdaq", p: [[/\bNasdaq\b/i, 4], [/\b(NDX|QQQ)\b/, 4], [/\btech stocks?\b/i, 3], [/\bmega-?caps?\b/i, 2], [/\b(Nvidia|Apple|Microsoft|Alphabet|Amazon|Meta|Tesla)\b/, 1]] },
  { id: "spx", p: [[/\bS&P ?500\b/, 5], [/\bSPX\b/, 5], [/\bSPY\b/, 3]] },
  { id: "earnings", p: [[/\bearnings season\b/i, 4], [/\bearnings\b/i, 3], [/\bquarterly results\b/i, 3], [/\bEPS\b/, 3], [/\bguidance\b/i, 2], [/\brevenue (beat|miss)\b/i, 3]] },
  { id: "valuations", p: [[/\bvaluations?\b/i, 4], [/\b(price[- ]to[- ]earnings|P\/E)\b/i, 4], [/\b(AI )?bubble\b/i, 3], [/\b(overvalued|richly valued|expensive stocks)\b/i, 3], [/\bCAPE\b/, 3]] },
  { id: "financial-conditions", p: [[/\bfinancial conditions\b/i, 5], [/\bcredit (spreads?|markets?|conditions)\b/i, 3], [/\bhigh[- ]yield\b/i, 2], [/\bliquidity (crunch|squeeze|conditions)\b/i, 3], [/\bVIX\b/, 3], [/\bfunding (stress|markets)\b/i, 3], [/\bbank (stress|failure|collapse)\b/i, 3], [/\bvolatility\b/i, 1]] },

  // ---------------- PÉTROLE ----------------
  { id: "oil", not: [NOT_OIL], p: [[/\b(WTI|Brent)\b/, 3], [/\bcrude oil\b/i, 4], [/\boil (prices?|futures|market|rally|slump|falls?|rises?|jumps?|drops?|surges?)\b/i, 4], [/\bcrude\b/i, 2], [/\bbarrels?\b/i, 2], [/\bpetroleum\b/i, 2]] },
  { id: "oil-geo", gate: OIL_CTX, not: [NOT_OIL], p: [[/\bgeopolit\w*\b/i, 2], [/\bsanctions?\b/i, 2], [/\b(Strait of )?Hormuz\b/i, 3], [/\b(Red Sea|pipeline|tankers?|refinery attack|drone attack)\b/i, 3], [/\b(war|conflict|attack|attacks|tensions|embargo)\b/i, 1]] },
  { id: "oil-opec", gate: OIL_CTX, not: [NOT_OIL], p: [[/\bOPEC\+?\b/, 5], [/\bproduction (cuts?|quotas?|increase|hike|policy)\b/i, 3], [/\bSaudi( Arabia)?\b/i, 2], [/\bAramco\b/i, 2]] },
  { id: "oil-supply", gate: OIL_CTX, not: [NOT_OIL], p: [[/\b(oil|crude) (supply|production|output|exports?)\b/i, 4], [/\bshale\b/i, 3], [/\brig count\b/i, 4], [/\bBaker Hughes\b/i, 4], [/\bglut\b/i, 3]] },
  { id: "oil-demand", gate: OIL_CTX, not: [NOT_OIL], p: [[/\b(oil|crude|fuel|gasoline) demand\b/i, 4], [/\bIEA\b/, 2], [/\bdemand (outlook|growth|forecast|concerns?)\b/i, 2], [/\bChina('s)? (demand|imports|refiners?)\b/i, 2], [/\bjet fuel\b/i, 2]] },
  { id: "oil-inventories", gate: OIL_CTX, not: [NOT_OIL], p: [[/\b(crude|oil|gasoline|distillate) (inventories|stocks|stockpiles)\b/i, 5], [/\bEIA\b/, 3], [/\bCushing\b/i, 4], [/\b(SPR|strategic petroleum reserve)\b/i, 4], [/\binventories\b/i, 2]] },

  // ---------------- BITCOIN / CRYPTO ----------------
  { id: "btc", p: [[/\bbitcoin\b/i, 4], [/\bBTC\b/, 4], [/CRYPTO:BTC/, 3], [/\bcrypto(currenc(y|ies))?\b/i, 2], [/\b(MicroStrategy|MSTR)\b/, 2]] },
  { id: "btc-usd", gate: BTC_CTX, not: [NOT_USD], p: [[DOLLAR_RE, 2], [/\bDXY\b/, 3]] },
  { id: "btc-real-yields", gate: BTC_CTX, p: [[/\b(real yields?|Treasury yields?|bond yields?)\b/i, 3], [/\b10[- ]year\b/i, 2]] },
  { id: "btc-risk-appetite", gate: BTC_CTX, p: [[/\brisk[- ](on|off|appetite|sentiment)\b/i, 4], [/\b(Nasdaq|tech stocks|stock market|Wall Street)\b/i, 2], [/\bfear (&|and) greed\b/i, 4], [/\bliquidations?\b/i, 2], [/\bleverage\b/i, 2]] },
  { id: "btc-etf-flows", p: [[/\bbitcoin ETFs?\b/i, 5], [/\bspot (bitcoin |ether )?ETFs?\b/i, 4], [/\b(IBIT|FBTC|GBTC|ARKB|BITB)\b/, 4], [/\bETF (inflows?|outflows?|flows)\b/i, 3]], gate: BTC_CTX },
  { id: "btc-crypto-liquidity", p: [[/\bstablecoins?\b/i, 4], [/\b(USDT|USDC|Tether)\b/, 3], [/\bcrypto liquidity\b/i, 4], [/\bexchange (reserves|balances|inflows|outflows)\b/i, 3]] },
  { id: "btc-regulation", p: [[/\b(CLARITY Act|GENIUS Act|market structure bill)\b/i, 5], [/\b(SEC|CFTC)\b/, 2], [/\bcrypto (regulation|bill|legislation|rules|framework|law|laws)\b/i, 4], [/\bStrategic Bitcoin Reserve\b/i, 4], [/\b(Senate|Congress|House)\b/, 1]], gate: BTC_CTX },

  // ---------------- MOYEN-ORIENT ----------------
  { id: "middle-east", gate: /\b(strike|strikes|attack|attacks|missile|ceasefire|war|conflict|tensions?|escalat\w+|retaliat\w+|militar\w+|drone|sanctions?|hostilit\w+)\b/i, p: [[/\b(Middle East|Israel|Israeli|Iran|Iranian|Gaza|Hamas|Hezbollah|Houthis?|Yemen|Lebanon|Syria|Red Sea|Strait of Hormuz|Hormuz)\b/, 3]] },
];

// Avantage de CLASSEMENT (pas de seuil) : quand deux facteurs sont à égalité, on préfère le plus spécifique
// (ex. "btc-real-yields" plutôt que "us10y" pour un article sur le bitcoin et les rendements).
// Un facteur doit toujours atteindre MIN_SCORE par lui-même pour être retenu.
const BOOST = { "rate-differentials": 3, "treasury-supply": 2 };
for (const r of RULES) r.boost = BOOST[r.id] ?? (/^(g|btc|oil)-/.test(r.id) ? 5 : 0);

export const FACTOR_IDS = RULES.map((r) => r.id);

// ---------------- moteur ----------------
const ENTITIES = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&#8217;": "'", "&#8216;": "'", "&#8220;": '"', "&#8221;": '"' };
export function cleanTitle(t) {
  let s = String(t || "");
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  s = s.replace(/\s+/g, " ").trim();
  return s.length > 180 ? s.slice(0, 177).trimEnd() + "\u2026" : s;
}

export function scoreRule(rule, title, text) {
  const all = `${title} ${text}`;
  if (rule.gate && !rule.gate.test(all)) return { score: 0, hits: [] };
  if (rule.usOnly && NON_US_TITLE.test(title) && !US_TITLE.test(title)) return { score: 0, hits: [] };
  if (rule.notForeignCB && FOREIGN_CB_TITLE.test(title) && !FED_TITLE.test(title)) return { score: 0, hits: [] };
  if (rule.not && rule.not.some((re) => re.test(all))) return { score: 0, hits: [] };
  let score = 0;
  const hits = [];
  for (const [re, w] of rule.p) {
    const inTitle = re.exec(title);
    const m = inTitle || re.exec(text);
    if (!m) continue;
    score += inTitle ? w * 2 : w;
    const h = m[0].trim().replace(/\s+/g, " ");
    if (!hits.some((x) => x.toLowerCase() === h.toLowerCase())) hits.push(h);
  }
  return { score, hits };
}

const STOP = new Set(["the", "and", "for", "with", "that", "from", "this", "are", "was", "will", "has", "have", "its", "after", "over", "amid", "says", "say", "new", "as", "at", "in", "on", "of", "to", "a", "an", "is", "by"]);
const words = (t) => new Set(String(t).toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) || []);
export function similarTitles(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter) >= 0.6;
}

const SENTIMENT_FR = { Bearish: "baissier", "Somewhat-Bearish": "plutôt baissier", Neutral: "neutre", "Somewhat-Bullish": "plutôt haussier", Bullish: "haussier" };
export function sentimentLine(label) {
  const fr = SENTIMENT_FR[label];
  return fr ? `Sentiment de l'article (Alpha Vantage) : ${fr}.` : "Article rattaché automatiquement à ce facteur par mots-clés.";
}

// articles : [{ title, summary, tickers?, sentiment? }] triés du plus récent au plus ancien.
// Retourne { byFactor: { id: [{ headline, summary, why, articleIndex }] }, matches: [...], stats }
export function classifyArticles(articles, opts = {}) {
  const minScore = opts.minScore ?? MIN_SCORE;
  const perArticle = opts.maxPerArticle ?? MAX_PER_ARTICLE;
  const perFactor = opts.maxPerFactor ?? MAX_PER_FACTOR;
  const candidates = {};
  const matches = [];
  let classified = 0;
  articles.forEach((a, idx) => {
    const title = cleanTitle(a.title);
    const text = `${a.summary || ""} ${a.tickers || ""}`;
    const scored = [];
    for (const rule of RULES) {
      const r = scoreRule(rule, title, text);
      if (r.score >= minScore) scored.push({ id: rule.id, ...r, rank: r.score + rule.boost });
    }
    scored.sort((x, y) => y.rank - x.rank); // tri stable : à égalité, l'ordre de RULES fait foi
    const top = scored.slice(0, perArticle);
    if (!top.length) return;
    classified++;
    for (const s of top) {
      (candidates[s.id] ||= []).push({ articleIndex: idx, score: s.score, hits: s.hits, title });
      matches.push({ id: s.id, score: s.score, title });
    }
  });
  const byFactor = {};
  for (const [id, list] of Object.entries(candidates)) {
    list.sort((x, y) => y.score - x.score || x.articleIndex - y.articleIndex); // meilleur score, puis plus récent
    const kept = [];
    for (const c of list) {
      if (kept.some((k) => similarTitles(k.title, c.title))) continue; // même info reprise par plusieurs médias
      kept.push(c);
      if (kept.length >= perFactor) break;
    }
    byFactor[id] = kept.map((c) => ({
      headline: c.title,
      summary: sentimentLine(articles[c.articleIndex].sentiment),
      why: `L'article évoque : ${c.hits.slice(0, 3).join(", ")}.`,
      articleIndex: c.articleIndex,
    }));
  }
  return { byFactor, matches, stats: { total: articles.length, classified, ignored: articles.length - classified } };
}
