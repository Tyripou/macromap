// Tests hors-ligne du classement par mots-clés (scripts/news-rules.mjs). npm run test:rules
// Titres réalistes écrits à la main : ils vérifient la logique, pas la qualité sur le flux réel d'Alpha Vantage
// (les premiers journaux de la tâche GitHub serviront à affiner les mots-clés).
import assert from "node:assert/strict";
import { classifyArticles, FACTOR_IDS, cleanTitle, similarTitles, scoreRule, RULES } from "./news-rules.mjs";

let n = 0;
const failures = [];
const t = (name, fn) => {
  try { fn(); n++; console.log("ok  -", name); }
  catch (e) { failures.push(name); console.log("FAIL -", name, "\n       ->", e.message.split("\n")[0]); }
};
const ids = (title, summary = "", extra = {}) => {
  const r = classifyArticles([{ title, summary, ...extra }]);
  return Object.keys(r.byFactor);
};

// Les 47 identifiants utilisés par le site (NODE_NEWS / NODE_CONTEXT dans src/App.jsx) : aucun ne doit manquer.
const EXPECTED_IDS = ["gold", "g-real-yields", "g-usd", "g-cb-demand", "g-etf-flows", "g-safe-haven", "g-geo-risk", "g-physical-demand", "dxy", "usd", "rate-differentials", "ecb-europe", "boj-japan", "fed", "fomc", "rate-expectations", "cpi", "core-cpi", "pce", "ppi", "us10y", "real-yields", "growth", "nfp", "labor", "equities", "nasdaq", "spx", "earnings", "valuations", "financial-conditions", "bonds", "treasury-supply", "oil", "oil-geo", "oil-opec", "oil-supply", "oil-demand", "oil-inventories", "btc", "btc-usd", "btc-real-yields", "btc-risk-appetite", "btc-etf-flows", "btc-crypto-liquidity", "btc-regulation", "middle-east"];
t("les règles couvrent exactement les 47 facteurs du site", () => {
  assert.deepEqual([...FACTOR_IDS].sort(), [...EXPECTED_IDS].sort());
  assert.equal(new Set(FACTOR_IDS).size, FACTOR_IDS.length, "identifiant en double");
});

// [titre, résumé, facteur attendu parmi les 2 retenus]
const POSITIVES = [
  ["Gold hits record high as dollar slips and Fed rate-cut bets rise", "", "gold"],
  ["Fed's Powell signals patience on rate cuts after FOMC meeting", "", "fomc"],
  ["Fed holds rates steady, signals two cuts by year-end", "", "fomc"],
  ["Traders boost Fed rate-cut bets after soft data", "", "rate-expectations"],
  ["Federal Reserve governor says inflation risks remain", "", "fed"],
  ["US CPI rises 0.3% in August, hotter than expected", "", "cpi"],
  ["Core CPI inflation stays sticky at 3.1% in the US", "", "core-cpi"],
  ["US core PCE inflation cools to 2.6%, Fed favorite gauge", "", "pce"],
  ["US producer prices unexpectedly jump as PPI climbs", "", "ppi"],
  ["Non-farm payrolls add 142,000 jobs in the US; unemployment rate steady", "", "nfp"],
  ["US weekly jobless claims fall to 220,000", "", "labor"],
  ["US Q2 GDP revised up to 3.0% as ISM manufacturing improves", "", "growth"],
  ["Treasury yields climb as 10-year note hits 4.6%", "", "us10y"],
  ["Treasuries rally as bond market bets on Fed easing", "", "bonds"],
  ["Treasury announces quarterly refunding, auction sizes unchanged", "", "treasury-supply"],
  ["Real yields fall to three-month low as TIPS demand rises", "", "real-yields"],
  ["Dollar index (DXY) rises to two-month high", "", "dxy"],
  ["ECB's Lagarde says rate path remains data-dependent", "", "ecb-europe"],
  ["BOJ's Ueda hints at rate hike as yen weakens", "", "boj-japan"],
  ["Nasdaq falls as tech stocks slide", "", "nasdaq"],
  ["S&P 500 ends at record high", "", "spx"],
  ["Wall Street closes higher as stock market extends rally", "", "equities"],
  ["Nvidia earnings beat expectations on strong data-center revenue", "", "earnings"],
  ["Stock valuations look stretched as P/E ratio climbs", "", "valuations"],
  ["Financial conditions ease as credit spreads tighten", "", "financial-conditions"],
  ["Central banks bought 200 tonnes of gold in Q2, World Gold Council says", "", "g-cb-demand"],
  ["Gold ETF outflows continue as GLD holdings drop", "", "g-etf-flows"],
  ["Gold climbs as safe-haven demand rises on market jitters", "", "g-safe-haven"],
  ["Gold jumps as geopolitical tensions escalate", "", "g-geo-risk"],
  ["Physical gold demand in India slumps as jewellery sales fall", "", "g-physical-demand"],
  ["Gold edges up as real yields decline", "", "g-real-yields"],
  ["Gold slips as the dollar strengthens", "", "g-usd"],
  ["OPEC+ agrees to extend output cuts; Brent jumps", "", "oil-opec"],
  ["Oil prices rise as WTI crude gains on supply worries", "", "oil"],
  ["EIA: US crude inventories fall by 3 million barrels", "", "oil-inventories"],
  ["Oil surges after drone attack on tanker near Strait of Hormuz", "", "oil-geo"],
  ["Crude oil supply glut looms as shale output hits record", "", "oil-supply"],
  ["IEA cuts oil demand forecast on weak China imports", "", "oil-demand"],
  ["Israel and Iran exchange strikes as tensions escalate", "", "middle-east"],
  ["Bitcoin climbs above $100,000 as crypto rally builds", "", "btc"],
  ["Bitcoin ETF inflows top $1 billion as BTC climbs", "", "btc-etf-flows"],
  ["Tether's USDT supply hits record as stablecoin market grows", "", "btc-crypto-liquidity"],
  ["Senate advances CLARITY Act for crypto market structure", "Bitcoin and other digital assets would get a clear legal framework.", "btc-regulation"],
  ["Bitcoin slides as risk-off mood hits tech stocks", "", "btc-risk-appetite"],
  ["Bitcoin falls as Treasury yields jump", "", "btc-real-yields"],
  ["Bitcoin weakens as dollar index rallies", "", "btc-usd"],
  ["ECB and BOJ diverge from the Fed as yield spreads widen", "", "rate-differentials"],
];
for (const [title, summary, expected] of POSITIVES) {
  t(`reconnu : « ${title.slice(0, 62)}${title.length > 62 ? "…" : ""} » → ${expected}`, () => {
    const got = ids(title, summary);
    assert.ok(got.includes(expected), `attendu ${expected}, obtenu [${got.join(", ")}]`);
  });
}

const NEGATIVES = [
  "Gold Coast property market booms as buyers return",
  "Olive oil prices surge after poor harvest in Spain",
  "Palm oil futures hit two-week low",
  "Federal Express to cut jobs as parcel volumes fall",
  "Customers are fed up with slow delivery times",
  "UK inflation falls to 3.2% as energy prices ease",
  "Best pizza recipes for the weekend",
  "Apple unveils new iPhone lineup",
  "Local football team wins the Gold Cup final",
  "Canada jobs report shows unexpected gain",
];
for (const title of NEGATIVES) {
  t(`ignoré : « ${title.slice(0, 66)} »`, () => {
    const got = ids(title);
    assert.deepEqual(got, [], `ne devrait rien matcher, obtenu [${got.join(", ")}]`);
  });
}

t("l'inflation d'un autre pays n'est jamais rangée dans le CPI américain (mais peut concerner la BCE)", () => {
  for (const title of ["Eurozone inflation slows in August", "UK inflation falls to 3.2%", "Japan core inflation accelerates"]) {
    const got = ids(title);
    assert.ok(!got.includes("cpi") && !got.includes("core-cpi"), `${title} -> [${got.join(", ")}]`);
  }
  assert.ok(ids("Eurozone inflation slows in August").includes("ecb-europe"));
});
t("les autres « dollars » ne sont pas le dollar américain", () => {
  for (const title of ["Canadian dollar slips as oil falls", "Australian dollar rallies after RBA decision", "Dollar General earnings miss forecasts"]) {
    const got = ids(title);
    assert.ok(!got.includes("dxy") && !got.includes("usd"), `${title} -> [${got.join(", ")}]`);
  }
  assert.ok(ids("US dollar slips as Fed cut bets grow").includes("usd") || ids("US dollar slips as Fed cut bets grow").includes("dxy"));
});
t("un titre sur un autre pays sans les États-Unis n'alimente pas les facteurs américains, même si le résumé cite les États-Unis", () => {
  const summary = "The slowdown comes as U.S. tariffs weigh on exports to the United States.";
  for (const title of ["China GDP growth slows in third quarter", "Canada jobs report shows unexpected gain", "Japan producer prices climb faster than expected"]) {
    const got = ids(title, summary);
    for (const f of ["growth", "nfp", "labor", "ppi", "pce", "cpi", "core-cpi"]) assert.ok(!got.includes(f), `${title} -> [${got.join(", ")}]`);
  }
  assert.ok(ids("US GDP growth beats forecasts as consumers spend").includes("growth"));
  assert.ok(ids("China GDP slows, but US GDP growth accelerates").includes("growth"));
});
t("une autre banque centrale sans la Fed n'alimente pas les facteurs Fed", () => {
  for (const title of ["BoE holds rates as traders eye rate cuts", "RBA hikes rates for the first time this year", "Bank of Canada signals rate cut path"]) {
    const got = ids(title, "Markets also watch the Fed and Treasury yields.");
    for (const f of ["fed", "fomc", "rate-expectations"]) assert.ok(!got.includes(f), `${title} -> [${got.join(", ")}]`);
  }
  assert.ok(ids("Fed and BoE hold rates as inflation lingers").includes("fed") || ids("Fed and BoE hold rates as inflation lingers").includes("fomc"));
});
t("un article n'est jamais rattaché à plus de 2 facteurs", () => {
  const r = classifyArticles([{ title: "Gold hits record as Fed cuts rates, dollar slips, Treasury yields fall and oil jumps", summary: "FOMC decision, bitcoin and Nasdaq also move." }]);
  const count = Object.values(r.byFactor).reduce((s, l) => s + l.length, 0);
  assert.ok(count <= 2, `trop de rattachements: ${count}`);
});
t("un même facteur garde au plus 2 articles, sans doublons de titres", () => {
  const arts = [
    { title: "Fed holds rates steady as Powell warns on inflation" },
    { title: "Fed holds rates steady, as Powell warns of inflation" },
    { title: "Powell says Fed will stay patient after FOMC decision" },
    { title: "Federal Reserve officials debate pace of rate cuts" },
    { title: "Fed governor sees one more cut this year" },
  ];
  const r = classifyArticles(arts);
  assert.ok(r.byFactor.fed.length <= 2);
  const heads = r.byFactor.fed.map((x) => x.headline);
  assert.ok(!(heads.includes(arts[0].title) && heads.includes(arts[1].title)), "doublon quasi identique conservé");
});
t("résumé et « pourquoi » toujours renseignés (le site les affiche tels quels)", () => {
  const r = classifyArticles([{ title: "US CPI rises 0.3% in August, hotter than expected", sentiment: "Somewhat-Bearish" }]);
  const it = r.byFactor.cpi[0];
  assert.match(it.summary, /plutôt baissier/); assert.match(it.why, /CPI/); assert.equal(it.articleIndex, 0);
  const r2 = classifyArticles([{ title: "US CPI rises 0.3% in August, hotter than expected" }]);
  assert.ok(r2.byFactor.cpi[0].summary.length > 10);
});
t("le résumé Alpha Vantage sert à classer mais n'est jamais recopié dans le résultat", () => {
  const secret = "SUMMARY_TEXT_THAT_MUST_NOT_BE_COPIED";
  const r = classifyArticles([{ title: "Markets brace for FOMC decision", summary: `Traders await the FOMC. ${secret}` }]);
  assert.ok(!JSON.stringify(r.byFactor).includes(secret));
});
t("les tickers Alpha Vantage aident à repérer le bitcoin", () => {
  assert.ok(ids("Crypto market update", "", { tickers: "CRYPTO:BTC" }).includes("btc"));
});
t("cleanTitle décode les entités HTML et borne la longueur", () => {
  assert.equal(cleanTitle("Stocks &amp; bonds &quot;rally&quot;"), 'Stocks & bonds "rally"');
  assert.ok(cleanTitle("x".repeat(400)).length <= 180);
});
t("similarTitles", () => {
  assert.equal(similarTitles("Fed holds rates steady as Powell warns", "Fed holds rates steady, Powell warns"), true);
  assert.equal(similarTitles("Fed holds rates steady", "Bitcoin ETF inflows top $1 billion"), false);
});
t("aucune regex ne peut rester bloquée sur un texte très long (pas d'explosion combinatoire)", () => {
  const long = "gold ".repeat(20000) + "Fed ".repeat(20000);
  const t0 = Date.now();
  for (const r of RULES) scoreRule(r, "gold Fed dollar", long);
  assert.ok(Date.now() - t0 < 2000, `trop lent: ${Date.now() - t0} ms`);
});

console.log(`\n${n} tests passés, ${failures.length} en échec`);
if (failures.length) process.exit(1);
