import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Plus, Trash2, Link2, X, ZoomIn, ZoomOut, Maximize2, ChevronRight, Home,
  LayoutGrid, Calendar as CalendarIcon, GitBranch, Target, Clock, Radio,
  Sparkles, Send, Loader2, Search, ArrowRight, StickyNote, Zap, AlertTriangle,
  Newspaper, ExternalLink, CheckCircle2, RefreshCw,
} from "lucide-react";

// --- Compatibility shim ---------------------------------------------------
// This component was originally built for Claude.ai's artifact preview,
// which provides a `window.storage` API and proxies calls to the Anthropic
// API. Neither exists on a normal deployed site, so we polyfill storage with
// localStorage and route the "Ask the map" feature through our own
// serverless function (see /api/ask.js) instead of calling Anthropic
// directly from the browser (which would fail: no API key, and Anthropic's
// API does not allow unauthenticated browser calls).
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(key);
      return v == null ? null : { key, value: v };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key, value };
    },
    async delete(key) {
      localStorage.removeItem(key);
      return { key, deleted: true };
    },
    async list(prefix) {
      const keys = Object.keys(localStorage).filter((k) => !prefix || k.startsWith(prefix));
      return { keys };
    },
  };
}

/* =========================================================================
   MACROMAP v2 — hierarchical macro-economic intelligence terminal
   GLOBAL VIEW -> SECTOR -> SUB-SECTOR -> EVENT, with clickable relationships.

   Every figure, headline and evidence item below is MANUAL / DEMO DATA for
   prototyping the interaction model. Nothing is fetched live. Relationships
   without curated evidence show "no evidence attached yet" rather than an
   invented confidence score — same convention as the rest of this workspace.
   ========================================================================= */

const COLORS = { hot: "#E5484D", elevated: "#F0883E", neutral: "#E6C260", cooling: "#4CC38A", improving: "#5B9EE6" };
const STATUS_META = {
  hot: { label: "Chaud", color: COLORS.hot }, elevated: { label: "\u00c9lev\u00e9", color: COLORS.elevated },
  neutral: { label: "Neutre", color: COLORS.neutral }, cooling: { label: "En baisse", color: COLORS.cooling },
  improving: { label: "En am\u00e9lioration", color: COLORS.improving },
};
const IMPORTANCE_META = {
  critical: { label: "Critique", color: "#E5484D", rank: 3 }, important: { label: "Important", color: "#F0883E", rank: 2 },
  relevant: { label: "Pertinent", color: "#E6C260", rank: 1 }, low: { label: "Impact faible", color: "#545D6E", rank: 0 },
};
const RELATION_META = {
  positive: { label: "Positif", color: "#4CC38A" }, negative: { label: "N\u00e9gatif", color: "#E5484D" },
  leads_to: { label: "M\u00e8ne \u00e0", color: "#5B9EE6" }, correlated: { label: "Corr\u00e9l\u00e9", color: "#A78BFA" },
  reduces: { label: "R\u00e9duit", color: "#F0883E" }, increases: { label: "Augmente", color: "#4CC38A" },
  signals: { label: "Signale", color: "#E6C260" }, contradicts: { label: "Contredit", color: "#E5484D" },
};

/* ------------------------------- traductions ------------------------------
   Dictionnaire de traduction centralisé (namespaces distincts). N'affecte
   jamais les donn\u00e9es, les calculs ou les libell\u00e9s officiels d'indicateurs
   (CPI, NFP, FOMC, Federal Reserve, Reuters, Bloomberg, etc. restent tels quels).
   ========================================================================= */
const T = {
  common: {
    close: "Fermer", cancel: "Annuler", add: "Ajouter", delete: "Supprimer", save: "Enregistrer",
    unavailable: "\u2014", loading: "Chargement\u2026", show: "Afficher", hide: "Masquer",
  },
  nav: {
    brand: "MacroMap", overview: "Vue d'ensemble", mindmap: "Carte mentale", calendar: "Calendrier",
    scenarios: "Sc\u00e9narios", market: "Impact march\u00e9s", markets: "March\u00e9s", tools: "Outils",
    addNode: "Ajouter un n\u0153ud", addRelationship: "Ajouter une relation", connecting: "Connexion en cours\u2026",
    marketMood: "Humeur du march\u00e9", neutral: "Neutre", traderMode: "Mode trader", exitTraderMode: "Quitter le mode trader",
    focus: "Focus", focusOn: "Focus : activ\u00e9", fullscreen: "Plein \u00e9cran", exitFullscreen: "Quitter le plein \u00e9cran",
    showEvidence: "Afficher les preuves", showEvidenceOn: "Preuves : activ\u00e9", searchPlaceholder: "Rechercher des donn\u00e9es, \u00e9v\u00e9nements\u2026",
    globalView: "Vue globale", back: "\u2190 Retour", hideSidebar: "Masquer la barre lat\u00e9rale", showSidebar: "Afficher la barre lat\u00e9rale",
    hidePanel: "Masquer le panneau", showPanel: "Afficher le panneau", showMacroStory: "Afficher le r\u00e9cit macro", navigate: "Naviguer",
  },
  mindmap: {
    doubleClickHint: "Double-cliquez sur un n\u0153ud pour zoomer \u00b7 cliquez sur une ligne pour voir la relation",
    zoomIn: "Zoomer sur", whyMoving: (label) => `Pourquoi ${label} bouge-t-il\u00a0?`,
    mainDrivers: "facteurs principaux", relationType: "Type de relation", strongEvidence: "Fort", moderateEvidence: "Mod\u00e9r\u00e9", limitedEvidence: "Limit\u00e9",
  },
  node: {
    sector: "Secteur", indicator: "Indicateur / \u00e9v\u00e9nement", currentValue: "Valeur actuelle", previousValue: "Valeur pr\u00e9c\u00e9dente",
    status: "Statut", trend: "Tendance", importance: "Importance", personalNote: "Note personnelle", notePlaceholder: "Ma th\u00e8se sur ce n\u0153ud\u2026",
    connections: "Connexions", deleteNode: "Supprimer ce n\u0153ud", recentNews: (n) => `${n} actualit\u00e9s r\u00e9centes`,
    up: "\u2191 Hausse", down: "\u2193 Baisse", stable: "\u2192 Stable",
    actual: "R\u00e9el", expected: "Attendu", previous: "Pr\u00e9c\u00e9dent", surprise: "Surprise",
    potentialImpactChain: "Cha\u00eene d'impact potentielle", openInMindmap: "Ouvrir dans la carte",
  },
  bias: {
    currentBias: "Biais actuel", confidence: "Confiance", why: "Pourquoi\u00a0?", mainDrivers: "Facteurs principaux",
    causalChain: "Cha\u00eene causale", supportingEvidence: "\u00c9l\u00e9ments \u00e0 l'appui", contradictingEvidence: "\u00c9l\u00e9ments contradictoires",
    mixedNote: "Les preuves actuelles tirent dans les deux sens avec une force comparable \u2014 MacroMap ne force pas de biais haussier ou baissier ici.",
    clickDriverHint: "Cliquez sur un facteur pour voir le d\u00e9tail complet. \u00c0 lire comme une interpr\u00e9tation des donn\u00e9es cartographi\u00e9es, pas comme une pr\u00e9vision.",
    high: "\u00c9lev\u00e9e", medium: "Moyenne", low: "Faible", bullish: "Haussier", bearish: "Baissier", neutralLabel: "Neutre", mixed: "Mitig\u00e9",
    highImpact: "Impact \u00e9lev\u00e9", mediumImpact: "Impact moyen", lowImpact: "Impact faible",
  },
  relation: {
    whyConnected: "Pourquoi sont-ils li\u00e9s\u00a0?", currentStrength: "Force actuelle", unrated: "Non \u00e9valu\u00e9e",
    currentDirection: "Direction actuelle", marketImpact: "Impact sur les march\u00e9s", evidenceConfidence: "Confiance dans les preuves",
    confidenceHint: "Refl\u00e8te la quantit\u00e9 et la coh\u00e9rence des preuves cartographi\u00e9es \u2014 pas une probabilit\u00e9 de mouvement de march\u00e9.",
    recentEvidence: "Preuves r\u00e9centes", whyExists: "Pourquoi MacroMap pense-t-il que cette relation existe\u00a0?",
    deleteRelationship: "Supprimer la relation", noEvidence: "Aucune preuve associ\u00e9e pour le moment \u2014 ajoutez une source pour \u00e9tayer ce lien.",
    established: "Relation \u00e9tablie", correlation: "Corr\u00e9lation de march\u00e9", interpretation: "Interpr\u00e9tation actuelle du march\u00e9", hypothesis: "Hypoth\u00e8se",
    strong: "Fort", moderate: "Mod\u00e9r\u00e9", weak: "Faible",
  },
  news: {
    explaining: (label) => `Actualit\u00e9s expliquant ${label}`, recentNews: "Actualit\u00e9s r\u00e9centes", noNews: "Aucune actualit\u00e9 associ\u00e9e \u00e0 ce n\u0153ud pour le moment.",
    whyItMatters: "Pourquoi est-ce important\u00a0?", readOriginal: "Lire l'article original", sourceUnavailable: "Source originale indisponible",
    searchOriginal: "Rechercher cet article",
    articleUnavailable: "Article actuellement indisponible", macroMapSummary: "R\u00e9sum\u00e9 MacroMap", originalSource: "Source originale",
    relevanceHint: "La pertinence indique dans quelle mesure chaque article aide \u00e0 expliquer l'\u00e9tat actuel de ce n\u0153ud \u2014 ce n'est pas un signal de trading.",
    high: "\u00c9lev\u00e9e", medium: "Moyenne", low: "Faible",
  },
  factor: {
    currentState: "\u00c9tat actuel", historicalContext: "Contexte historique", whyItAffects: (label) => `Pourquoi cela affecte ${label}`,
    impact: "Impact", recentData: "Donn\u00e9es r\u00e9centes", recentNews: "Actualit\u00e9s r\u00e9centes", sources: "Sources",
    noHistory: "Pas encore d'historique disponible pour ce facteur.", noSources: "Aucune source r\u00e9f\u00e9renc\u00e9e pour le moment.",
    current: "Actuel", previous: "Pr\u00e9c\u00e9dent", change: "Variation",
  },
  calendar: {
    title: "Prochains \u00e9v\u00e9nements macro", hint: "Entr\u00e9es manuelles \u2014 \u00e0 connecter au calendrier de publication FRED.",
  },
  scenarios: { title: "Sc\u00e9narios macro\u00e9conomiques", conditions: "Conditions", favored: "March\u00e9s favoris\u00e9s", unfavored: "March\u00e9s d\u00e9favoris\u00e9s" },
  market: { title: "Impact sur les march\u00e9s", noDrivers: "Aucun facteur dominant identifi\u00e9 pour le moment." },
  overview: {
    story: "Situation macro actuelle", goldBias: "Biais Or", askTheMap: "Interroger la carte",
    askHint: "Fond\u00e9 sur les n\u0153uds et liens actuellement pr\u00e9sents sur la carte \u2014 un raisonnement, pas une pr\u00e9diction certaine.",
    askPlaceholder: "Qu'est-ce qui pourrait changer le r\u00e9cit sur l'or\u00a0?",
  },
  palette: { placeholder: "Rechercher des donn\u00e9es, \u00e9v\u00e9nements, relations\u2026", nodes: "N\u0153UDS", actions: "ACTIONS", noMatches: "Aucun r\u00e9sultat." },
};

const MARKETS = [
  { id: "xauusd", label: "Or / XAUUSD", emoji: "\u{1F947}" }, { id: "dxy", label: "DXY", emoji: "\u{1F4B5}" },
  { id: "nasdaq", label: "Nasdaq", emoji: "\u{1F4C8}" }, { id: "spx", label: "S&P 500", emoji: "\u{1F4CA}" },
  { id: "ust", label: "Bons du Tr\u00e9sor US", emoji: "\u{1F3E6}" }, { id: "btc", label: "BTC", emoji: "\u20BF" },
  { id: "oil", label: "P\u00e9trole", emoji: "\u{1F6E2}\uFE0F" },
];
// One accent color per market — used across the sidebar, the market switcher pills and
// the canvas so that "which asset am I looking at" is answerable at a glance, purely
// through color, without reading labels. Kept saturated but not neon, to stay readable
// against the dark theme.
const MARKET_ACCENT = {
  xauusd: "#D9B54A", dxy: "#5B9EE6", nasdaq: "#A78BFA", spx: "#4CC38A",
  ust: "#38BDF8", btc: "#F0883E", oil: "#E5626A",
};
const MARKET_NODE_MAP = { xauusd: "gold", dxy: "usd", nasdaq: "equities", spx: "equities", ust: "bonds", btc: "btc", oil: "oil" };
const COMPLEXITY = [
  { id: "simple", label: "Simple", min: 3 }, { id: "standard", label: "Standard", min: 2 },
  { id: "advanced", label: "Avanc\u00e9", min: 1 }, { id: "full", label: "Complet", min: 0 },
];
const SIGN_OVERRIDES = {
  "real-yields:xauusd": -1, "dxy:xauusd": -1, "us10y:xauusd": -1, "us10y:nasdaq": -1,
  "us10y:spx": -1, "us10y:ust": -1, "dxy:btc": -1, "trade-tensions:nasdaq": -1, "unemployment:nasdaq": -1,
};

/* --------------------------------- data --------------------------------- */

function N(id, parentId, label, opts = {}) {
  return {
    id, parentId, label,
    status: opts.status || "neutral", direction: opts.direction || "\u2192", importance: opts.importance || "relevant",
    value: opts.value ?? "\u2014", prev: opts.prev ?? "\u2014", desc: opts.desc || "", note: opts.note || "",
    markets: opts.markets || [], group: opts.group || null,
    source: opts.source || "Saisie manuelle", lastUpdate: opts.lastUpdate || "Sep 11, 2026",
    calendarDate: opts.calendarDate || null, calendarSort: opts.calendarSort || null, calendarImportance: opts.calendarImportance || null,
    actual: opts.actual ?? null, expected: opts.expected ?? null, previous: opts.previous ?? null,
    potentialImpactChain: opts.potentialImpactChain || null,
    biasFactors: opts.biasFactors || null, whatCouldChange: opts.whatCouldChange || null,
    evidence: opts.evidence || [],
    // "Short" | "Medium" | "Long" — how quickly this factor typically moves the price it feeds into.
    // Used by the Current Relevance engine to separate today's drivers from slow-moving structural
    // support/background (see classifyDriverRelevance / bucketDrivers below). Nodes without an
    // explicit timeframe are treated as neutral (neither boosted nor penalised).
    timeframe: opts.timeframe || null,
  };
}
function E(from, to, relation, opts = {}) {
  return {
    id: `${from}__${to}`, from, to, relation,
    strength: opts.strength || null, confidence: opts.confidence ?? null, timeframe: opts.timeframe || "Short/Medium",
    desc: opts.desc || "", evidenceChecklist: opts.evidenceChecklist || [],
    marketImpact: opts.marketImpact || [], evidence: opts.evidence || [],
    evidenceClass: opts.evidenceClass || "interpretation",
    contradictingEvidence: opts.contradictingEvidence || [],
    timeline: opts.timeline || null,
  };
}

const EVIDENCE_CLASS_META = {
  established: { label: "Relation \u00e9tablie", color: "#4CC38A" },
  correlation: { label: "Corr\u00e9lation de march\u00e9", color: "#5B9EE6" },
  interpretation: { label: "Interpr\u00e9tation actuelle du march\u00e9", color: "#E6C260" },
  hypothesis: { label: "Hypoth\u00e8se", color: "#8A93A3" },
};

// Manually-curated social posts (see AddEvidenceForm) get a distinct icon/color so a fast X
// or Instagram post reads differently at a glance from a wire-service headline. MacroMap has
// no live connection to either platform — X's API requires a paid, authenticated backend and
// Instagram has no public read API for arbitrary posts, so pulling these automatically isn't
// something a client-side app can do. This lets someone paste in what they just saw instead.
const PLATFORM_META = {
  x: { label: "X", icon: "\u{1D54F}", color: "#E7E9EA" },
  instagram: { label: "Instagram", icon: "\u{1F4F8}", color: "#E1306C" },
  article: { label: "Article", icon: "\u{1F4F0}", color: "#8A93A3" },
};

function sourceTier(source) {
  if (!source) return null;
  const s = source.toLowerCase();
  const tier1 = ["federal reserve", "fred", "bls", "bea", "treasury", "ecb", "imf", "world bank"];
  const tier2 = ["reuters", "bloomberg", "financial times", "wsj", "wall street journal", "cnbc", "ice", "cme fedwatch"];
  if (tier1.some((k) => s.includes(k))) return { label: "Niveau 1 \u00b7 Source primaire", color: "#4CC38A" };
  if (tier2.some((k) => s.includes(k))) return { label: "Niveau 2 \u00b7 M\u00e9dia financier", color: "#5B9EE6" };
  return { label: "Niveau 3 \u00b7 Source secondaire", color: "#8A93A3" };
}

// Every curated headline in this app is real, dated data (a snapshot as of Sep 11, 2026 —
// see the file-level note above and README) —
// there is no real article behind it, so it.link is always null and it would be dishonest to
// invent one. Instead of a dead end, this opens a genuine web search for the headline + source
// in a new tab, which is exactly what "open it in Chrome" needs once a real link is attached:
// as soon as a real `link` is filled in on a news item, the UI below prefers that instead.
function newsSearchUrl(it) {
  const q = [it.headline, it.source].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function buildData() {
  const list = [
    N("global", null, "Global Macro Environment", { status: "elevated", importance: "critical", value: "Restrictive / Slowing", desc: "Root of the map \u2014 the twelve sectors below are today's read of the world." }),

    // ---- level 1 sectors ----
    // Real market/macro snapshot as of Sep 11, 2026 (see README for the "why is this not live" note).
    N("fed", "global", "Fed / Monetary Policy", { status: "hot", direction: "\u2191", importance: "critical", value: "3.50\u20133.75%, hike risk rising", desc: "Markets price ~66\u201371% odds of a 25bp hike at the Sep 16 FOMC meeting as the Iran-war energy shock keeps inflation hot." }),
    N("inflation", "global", "Inflation", { status: "hot", direction: "\u2192", importance: "critical", value: "3.4% CPI YoY", desc: "Headline inflation stalled rather than kept cooling; core CPI still eased to 2.4%." }),
    N("rates", "global", "Interest Rates", { status: "hot", direction: "\u2191", importance: "critical", value: "10Y ~4.9%", desc: "10-year yield near its highest since 2023, approaching 5%, as hike odds build." }),
    N("labor", "global", "Labor Market", { status: "neutral", direction: "\u2192", importance: "critical", value: "4.1% unemployment, NFP +162k (ao\u00fbt)", desc: "March\u00e9 de l'emploi jug\u00e9 stable par la Fed ; le rebond des cr\u00e9ations d'emplois en ao\u00fbt a surpris \u00e0 la hausse." }),
    N("growth", "global", "Economic Growth", { status: "neutral", direction: "\u2192", importance: "critical", value: "Solid but uneven", desc: "Fed describes activity as expanding at a solid pace despite war-related uncertainty." }),
    N("usd", "global", "USD / Dollar", { status: "elevated", direction: "\u2191", importance: "important", value: "DXY ~99.1", desc: "Firm and holding above 99 on rate-hike repricing." }),
    N("gold", "global", "Gold", { status: "cooling", direction: "\u2193", importance: "critical", value: "~$4,380/oz", desc: "Third straight weekly decline as hawkish Fed repricing outweighs geopolitical safe-haven support.",
      whatCouldChange: ["La Fed exclut cat\u00e9goriquement une hausse le 16 septembre", "Le conflit Iran\u2013USA s'aggrave nettement (flux vers le refuge)", "Le p\u00e9trole rechute fortement, calmant les craintes d'inflation", "Une d\u00e9c\u00e9l\u00e9ration marqu\u00e9e des cr\u00e9ations d'emplois ravive les paris de baisse de taux"] }),
    N("equities", "global", "Equities", { status: "elevated", direction: "\u2191", importance: "important", value: "S&P ~7,650 / Nasdaq Comp. ~26,400", desc: "Choppy into the FOMC \u2014 four-day losing streak snapped Sep 11 as oil eased." }),
    N("bonds", "global", "Bonds", { status: "hot", direction: "\u2193", importance: "important", value: "10Y yield ~4.9%", desc: "Prices under pressure as yields push toward 5% on hike bets and a soft Treasury buyback." }),
    N("commodities", "global", "Commodities", { status: "hot", direction: "\u2191", importance: "relevant", value: "WTI ~$100/bbl", desc: "Oil up ~20% over the past month on the US\u2013Iran conflict and Strait of Hormuz risk." }),
    N("liquidity", "global", "Liquidity", { status: "neutral", direction: "\u2192", importance: "important", value: "Balance sheet policy in focus", desc: "Attention shifting to the Fed's balance-sheet stance alongside the rate decision." }),
    N("geo", "global", "Geopolitics", { status: "hot", direction: "\u2191", importance: "important", value: "US\u2013Iran conflict, elevated risk", desc: "Ongoing conflict since Feb 2026 disrupting the Strait of Hormuz and driving the oil/inflation shock." }),

    // ---- fed sector ----
    N("fomc", "fed", "FOMC", { status: "hot", direction: "\u2191", importance: "critical", value: "Meets Sep 16 \u2014 ~66\u201371% odds of +25bp", desc: "Also a Summary of Economic Projections meeting (new dot plot).", calendarDate: "Sep 16", calendarSort: 16, calendarImportance: "critical" }),
    N("policy-rate", "fed", "Policy Rate", { status: "hot", direction: "\u2191", importance: "important", value: "3.50\u20133.75% (eff. ~3.63%)" }),
    N("balance-sheet", "fed", "Balance Sheet", { status: "neutral", direction: "\u2192", importance: "relevant", value: "In focus alongside rate path", desc: "Chair Warsh has downplayed the funds rate in favor of balance-sheet tools." }),
    N("qt-qe", "fed", "QT / QE", { status: "neutral", direction: "\u2192", importance: "important", value: "Pace under review" }),
    N("forward-guidance", "fed", "Forward Guidance", { status: "hot", direction: "\u2191", importance: "important", value: "Hawkish-leaning, data-dependent" }),
    N("fed-speakers", "fed", "Fed Speakers", { status: "hot", direction: "\u2191", importance: "relevant", value: "Warsh (Jackson Hole), Cook \u2014 leaning hawkish" }),
    N("rate-expectations", "fed", "Rate Expectations", { status: "hot", direction: "\u2191", importance: "critical", value: "~66\u201371% odds of a hike (Sep 16)", prev: "cuts priced earlier in 2026" }),

    // ---- inflation sector ----
    N("cpi", "inflation", "CPI", { status: "hot", direction: "\u2192", importance: "critical", value: "3.4%", prev: "3.4%", actual: 3.4, expected: 3.3, previous: 3.4,
      calendarDate: "Sep 11", calendarSort: 11, calendarImportance: "critical",
      potentialImpactChain: ["Fed expectations \u2191", "Yields \u2191", "USD \u2191", "Gold \u2193"],
      evidence: [{ type: "data", headline: "L'inflation am\u00e9ricaine se stabilise, la Fed reste sous pression pour agir", date: "Sep 11, 2026", source: "Bureau of Labor Statistics", summary: "L'inflation annuelle est rest\u00e9e stable \u00e0 3,4 % en ao\u00fbt, mais la hausse mensuelle du CPI core (+0,3 % contre +0,2 % attendu) a surpris \u00e0 la hausse.", why: "Une surprise haussi\u00e8re sur l'inflation sous-jacente renforce les paris sur une hausse de taux le 16 septembre, ce qui p\u00e8se sur l'or et soutient le dollar.", impact: [{ market: "Fed expectations", dir: "\u2191" }, { market: "Real yields", dir: "\u2191" }, { market: "USD", dir: "\u2191" }, { market: "Gold", dir: "\u2193" }], data: { actual: "3.4%", expected: "3.3%", previous: "3.4%" }, link: "https://www.bls.gov/news.release/cpi.nr0.htm" }],
      markets: ["xauusd", "dxy", "ust", "nasdaq"] }),
    N("core-cpi", "inflation", "Core CPI", { status: "elevated", direction: "\u2193", importance: "important", value: "2.4%", prev: "2.5%", actual: 2.4, expected: 2.5, previous: 2.5, desc: "Plus bas niveau depuis mars 2021 en glissement annuel, malgr\u00e9 une hausse mensuelle plus forte que pr\u00e9vu." }),
    N("pce", "inflation", "PCE", { status: "hot", direction: "\u2192", importance: "important", value: "3.7%", prev: "\u2248 3.5%", actual: 3.7, expected: null, previous: null, calendarDate: "Sep 26", calendarSort: 26, calendarImportance: "important", desc: "Derni\u00e8re lecture (juillet, publi\u00e9e le 26 ao\u00fbt) toujours nettement au-dessus de la cible de 2 % de la Fed." }),
    N("core-pce", "inflation", "Core PCE", { status: "hot", direction: "\u2192", importance: "critical", value: "3.3%", prev: "\u2248 3.3%", actual: 3.34, expected: null, previous: null, markets: ["ust", "dxy"], desc: "Reste plus \u00e9lev\u00e9 que le CPI core, signe d'une pression sous-jacente persistante." }),
    N("ppi", "inflation", "PPI", { status: "hot", direction: "\u2191", importance: "relevant", value: "Acc\u00e9l\u00e9ration en ao\u00fbt", prev: "Plus mod\u00e9r\u00e9", actual: null, expected: null, previous: null, calendarDate: "Sep 10", calendarSort: 10, calendarImportance: "relevant", desc: "La guerre Iran\u2013USA a pouss\u00e9 les co\u00fbts \u00e9nerg\u00e9tiques de gros \u00e0 la hausse, ravivant les paris de hausse de taux avant le CPI." }),
    N("wages", "inflation", "Wages", { status: "elevated", direction: "\u2192", importance: "relevant", value: "+3.1% YoY", prev: "+3.1%" }),
    N("energy-infl", "inflation", "Energy", { status: "hot", direction: "\u2191", importance: "relevant", value: "Choc p\u00e9trolier li\u00e9 \u00e0 la guerre Iran\u2013USA" }),
    N("housing", "inflation", "Housing / Shelter", { status: "elevated", direction: "\u2193", importance: "important", value: "+3.0% YoY", prev: "+3.2%" }),

    // ---- rates sector ----
    N("fed-funds-rate", "rates", "Fed Funds Rate", { status: "hot", direction: "\u2191", importance: "critical", value: "3.50\u20133.75% (eff. ~3.63%)" }),
    N("fed-expectations", "rates", "Fed Expectations", { status: "hot", direction: "\u2191", importance: "critical", value: "~66\u201371% odds of +25bp (Sep 16)" }),
    N("us10y", "rates", "10Y Treasury Yield", { status: "hot", direction: "\u2191", importance: "critical", value: "\u2248 4.9%", prev: "\u2248 4.3% (avril 2026)", markets: ["xauusd", "dxy", "nasdaq", "spx"] }),
    N("real-yields", "rates", "Real Yields", { status: "hot", direction: "\u2191", importance: "critical", value: "En forte hausse avec les rendements nominaux", prev: "Plus bas d\u00e9but 2026", markets: ["xauusd"] }),
    N("yield-curve", "rates", "Yield Curve (2s10s)", { status: "elevated", direction: "\u2192", importance: "important", value: "10Y ~4.9% / 2Y ~4.4%" }),
    N("financial-conditions", "rates", "Financial Conditions", { status: "elevated", direction: "\u2191", importance: "important", value: "Tightening as yields rise" }),

    // ---- 10Y drill ----
    N("infl-exp-10y", "us10y", "Inflation Expectations", { status: "elevated", direction: "\u2191", importance: "important", value: "En hausse avec le choc p\u00e9trolier" }),
    N("fed-exp-10y", "us10y", "Fed Expectations", { status: "hot", direction: "\u2191", importance: "critical", value: "~66\u201371% odds of +25bp" }),
    N("growth-driver-10y", "us10y", "Economic Growth", { status: "neutral", direction: "\u2192", importance: "relevant", value: "Solide mais in\u00e9gale" }),
    N("treasury-supply", "us10y", "Treasury Supply", { status: "elevated", direction: "\u2191", importance: "important", value: "Rachat d\u00e9cevant, calendrier charg\u00e9" }),
    N("term-premium", "us10y", "Term Premium", { status: "elevated", direction: "\u2191", importance: "relevant", value: "En reconstruction" }),

    // ---- real yields drill ----
    N("ry-nominal", "real-yields", "Nominal Yields", { status: "hot", direction: "\u2191", importance: "critical", value: "\u2248 4.9% (10Y)" }),
    N("ry-infl-exp", "real-yields", "Inflation Expectations", { status: "elevated", direction: "\u2191", importance: "important", value: "En hausse (choc p\u00e9trolier)" }),
    N("ry-fed-exp", "real-yields", "Fed Expectations", { status: "hot", direction: "\u2191", importance: "critical", value: "~66\u201371% odds of +25bp" }),
    N("ry-fomc", "real-yields", "FOMC", { status: "hot", direction: "\u2191", importance: "important", value: "D\u00e9cision le 16 septembre" }),
    N("ry-fed-speeches", "real-yields", "Latest Fed Speeches", { status: "hot", direction: "\u2191", importance: "relevant", value: "Warsh \u00e0 Jackson Hole, ton plus hawkish" }),
    N("ry-econ-data", "real-yields", "Latest Economic Data", { status: "elevated", direction: "\u2192", importance: "relevant", value: "Mixed \u2014 cooling labor, sticky inflation" }),

    // ---- labor sector ----
    N("nfp", "labor", "Non-Farm Payrolls", { status: "hot", direction: "\u2191", importance: "critical", value: "+162k (ao\u00fbt), tr\u00e8s au-dessus des +53k attendus", prev: "+21k (juillet, r\u00e9vis\u00e9)", actual: 162, expected: 53, previous: 21, calendarDate: "Sep 4", calendarSort: 4, calendarImportance: "critical", markets: ["dxy", "xauusd", "nasdaq"], desc: "Une tr\u00e8s forte surprise \u00e0 la hausse qui a elle-m\u00eame renforc\u00e9 les paris sur une hausse de taux le 16 septembre." }),
    N("unemployment", "labor", "Unemployment Rate", { status: "elevated", direction: "\u2191", importance: "important", value: "4.3%", prev: "4.1%", markets: ["dxy", "nasdaq"] }),
    N("wage-growth", "labor", "Wage Growth", { status: "elevated", direction: "\u2193", importance: "relevant", value: "3.9% YoY" }),
    N("jolts", "labor", "JOLTS Openings", { status: "cooling", direction: "\u2193", importance: "relevant", value: "8.0M", prev: "8.2M" }),

    // ---- growth sector ----
    N("gdp", "growth", "US GDP Growth", { status: "cooling", direction: "\u2193", importance: "critical", value: "1.6% (ann.)", prev: "2.1%", markets: ["nasdaq", "spx", "dxy"] }),
    N("pmi", "growth", "ISM Manufacturing PMI", { status: "cooling", direction: "\u2193", importance: "important", value: "47.8", prev: "48.5", calendarDate: "Sep 22", calendarSort: 22, calendarImportance: "important" }),
    N("retail-sales", "growth", "Retail Sales", { status: "neutral", direction: "\u2192", importance: "relevant", value: "0.2% MoM" }),
    N("ism-services", "growth", "ISM Services PMI", { status: "neutral", direction: "\u2192", importance: "relevant", value: "51.2" }),

    // ---- usd sector ----
    N("dxy", "usd", "DXY Index", { status: "elevated", direction: "\u2191", importance: "critical", value: "~99.1", prev: "~98.5", markets: ["xauusd", "btc", "oil"], timeframe: "Short" }),
    N("rate-differentials", "usd", "Rate Differentials", { status: "elevated", direction: "\u2191", importance: "important", value: "Favor USD sur repricing hawkish", timeframe: "Short" }),
    N("safe-haven-usd", "usd", "Safe-Haven Demand", { status: "elevated", direction: "\u2191", importance: "relevant", value: "Soutenue par la guerre Iran\u2013USA", timeframe: "Short" }),
    N("ecb-europe", "usd", "ECB / Europe", { status: "neutral", direction: "\u2192", importance: "important", value: "D\u00e9p\u00f4t \u00e0 2,00% (statu quo le 11 sept.)", timeframe: "Short", markets: ["dxy"], desc: "La BCE a maintenu ses taux inchang\u00e9s pour la troisi\u00e8me r\u00e9union cons\u00e9cutive, apr\u00e8s 8 baisses depuis juin 2024 (de 4,00% \u00e0 2,00%)." }),
    N("boj-japan", "usd", "BoJ / Japon", { status: "hot", direction: "\u2191", importance: "important", value: "Taux \u00e0 1%, cycle de hausses en cours", timeframe: "Short", markets: ["dxy"], desc: "Le gouverneur Ueda maintient un ton hawkish\u00a0; un membre du board (Takata) a propos\u00e9 1,25% en juillet, rejet\u00e9 8 voix contre 1." }),

    // ---- gold sector (flagship deep example — pricing pilot, see Current Relevance engine) ----
    N("g-real-yields", "gold", "Real Yields", { status: "hot", direction: "\u2191", importance: "critical", value: "10Y ~4.9%, near cycle highs", group: "Monetary", markets: ["xauusd"], timeframe: "Short", desc: "La hausse des rendements r\u00e9els depuis le choc p\u00e9trolier ali\u00e9 \u00e0 la guerre Iran\u2013USA p\u00e8se directement sur l'or." }),
    N("g-usd", "gold", "USD", { status: "elevated", direction: "\u2191", importance: "important", value: "DXY ~99.1, ferme", group: "Currency", markets: ["xauusd"], timeframe: "Short", desc: "Le dollar reste ferme, port\u00e9 par les paris de hausse de taux de la Fed le 16 septembre." }),
    N("g-cb-demand", "gold", "Central Bank Buying", { status: "improving", direction: "\u2191", importance: "important", value: "Tendance structurelle toujours positive", group: "Demand", markets: ["xauusd"], timeframe: "Long" }),
    N("g-etf-flows", "gold", "ETF Flows", { status: "cooling", direction: "\u2193", importance: "relevant", value: "Sous pression avec le repricing hawkish", group: "Demand", markets: ["xauusd"], timeframe: "Short" }),
    N("g-safe-haven", "gold", "Safe-Haven Demand", { status: "elevated", direction: "\u2191", importance: "important", value: "\u00c9lev\u00e9e (guerre Iran\u2013USA)", group: "Risk", markets: ["xauusd"], timeframe: "Short" }),
    N("g-geo-risk", "gold", "Geopolitical Risk", { status: "hot", direction: "\u2191", importance: "critical", value: "\u00c9lev\u00e9, conflit Iran\u2013USA en cours", group: "Risk", markets: ["xauusd"], timeframe: "Short", desc: "Le conflit autour du d\u00e9troit d'Ormuz reste le principal facteur de soutien de l'or, mais ne suffit pas \u00e0 compenser la pression des taux r\u00e9els." }),
    N("g-physical-demand", "gold", "Physical Demand (China/India)", { status: "neutral", direction: "\u2192", importance: "relevant", value: "Stable", group: "Demand", markets: ["xauusd"], timeframe: "Medium" }),
    N("g-mining-supply", "gold", "Mining Supply", { status: "neutral", direction: "\u2192", importance: "low", value: "Globalement stable", group: "Supply", markets: ["xauusd"], timeframe: "Long" }),

    // ---- equities / bonds / commodities / liquidity / geo (one level) ----
    N("nasdaq", "equities", "Nasdaq 100", { status: "elevated", direction: "\u2191", importance: "critical", value: "\u2248 Nasdaq Comp. 26,400", prev: "\u2248 26,600 (semaine pr\u00e9c\u00e9dente)" }),
    N("spx", "equities", "S&P 500", { status: "elevated", direction: "\u2191", importance: "important", value: "\u2248 7,650", prev: "\u2248 7,747" }),
    N("earnings", "equities", "Earnings Growth", { status: "neutral", direction: "\u2192", importance: "relevant", value: "Solide (ex. Oracle, Broadcom)", timeframe: "Medium" }),
    N("valuations", "equities", "Valuations", { status: "elevated", direction: "\u2192", importance: "relevant", value: "Above historical average", timeframe: "Long" }),

    N("ust-2y", "bonds", "2Y Treasury Yield", { status: "elevated", direction: "\u2191", importance: "important", value: "\u2248 4.4%", timeframe: "Short" }),
    N("credit-spreads", "bonds", "Credit Spreads", { status: "neutral", direction: "\u2192", importance: "relevant", value: "Tight, not stressed", timeframe: "Medium" }),
    N("duration-risk", "bonds", "Duration Risk", { status: "hot", direction: "\u2191", importance: "relevant", value: "\u00c9lev\u00e9 \u2014 10Y proche de 5%", timeframe: "Medium" }),
    N("safe-haven-demand-ust", "bonds", "Safe-Haven Demand", { status: "elevated", direction: "\u2191", importance: "relevant", value: "Soutenue par la guerre Iran\u2013USA", timeframe: "Short", markets: ["ust"] }),

    N("oil", "commodities", "WTI Crude Oil", { status: "hot", direction: "\u2191", importance: "important", value: "\u2248 $100/bbl", prev: "\u2248 $83/bbl (il y a 1 mois)", markets: ["oil"], timeframe: "Short", desc: "En hausse d'environ 20% sur le mois sur fond de guerre Iran\u2013USA et de risques sur le d\u00e9troit d'Ormuz." }),
    N("oil-geo", "oil", "Geopolitical Risk", { status: "hot", direction: "\u2191", importance: "critical", value: "Guerre Iran\u2013USA, d\u00e9troit d'Ormuz sous tension", timeframe: "Short" }),
    N("oil-opec", "oil", "OPEC+", { status: "neutral", direction: "\u2192", importance: "important", value: "Politique inchang\u00e9e pour octobre (r\u00e9union du 6 sept.)", timeframe: "Short", desc: "OPEC+ a termin\u00e9 le d\u00e9roulement de ses coupes volontaires de 1,65 Mb/j en septembre et maintient sa politique pour octobre ; ~2 Mb/j de coupes distinctes restent en place jusqu'\u00e0 fin 2026." }),
    N("oil-supply", "oil", "Supply", { status: "hot", direction: "\u2193", importance: "critical", value: "Production r\u00e9elle bien en de\u00e7\u00e0 des quotas", timeframe: "Short", desc: "La guerre a contraint plusieurs producteurs du Golfe \u00e0 r\u00e9duire leurs exports, rendant les hausses de quotas largement symboliques." }),
    N("oil-demand", "oil", "Demand", { status: "neutral", direction: "\u2192", importance: "relevant", value: "Croissance mondiale mod\u00e9r\u00e9e", timeframe: "Medium" }),
    N("oil-inventories", "oil", "Inventories", { status: "elevated", direction: "\u2193", importance: "relevant", value: "Stocks OCDE en baisse (\u221226,4 Mb en juin)", timeframe: "Short" }),
    N("oil-usd", "oil", "USD", { status: "elevated", direction: "\u2191", importance: "relevant", value: "Ferme", timeframe: "Short" }),
    N("oil-growth", "oil", "Global Growth", { status: "neutral", direction: "\u2192", importance: "relevant", value: "Solide mais in\u00e9gale", timeframe: "Medium" }),

    N("copper", "commodities", "Copper", { status: "neutral", direction: "\u2192", importance: "relevant", value: "Stable", timeframe: "Medium" }),
    N("agriculture", "commodities", "Agriculture", { status: "neutral", direction: "\u2192", importance: "low", value: "Mixed", timeframe: "Medium" }),

    // ---- bitcoin sector (new) ----
    N("btc", "global", "Bitcoin", { status: "cooling", direction: "\u2193", importance: "important", value: "\u2248 $77,000", markets: ["btc"], desc: "Repli depuis plus de $80 000 fin ao\u00fbt, sous l'effet du raffermissement du dollar et des paris de hausse de taux Fed.",
      whatCouldChange: ["La Fed exclut une hausse le 16 septembre", "Les flux ETF redeviennent nettement positifs plusieurs jours de suite", "Le dollar s'affaiblit durablement", "Le CLARITY Act \u00e9choue au vote de cloture du 15 septembre (choc r\u00e9glementaire n\u00e9gatif)"] }),
    N("btc-liquidity", "btc", "Liquidity", { status: "neutral", direction: "\u2192", importance: "important", value: "Conditions globalement stables", timeframe: "Short" }),
    N("btc-usd", "btc", "USD", { status: "elevated", direction: "\u2191", importance: "important", value: "Ferme (DXY ~99.1)", timeframe: "Short" }),
    N("btc-real-yields", "btc", "Real Yields", { status: "hot", direction: "\u2191", importance: "important", value: "Proches de leurs plus hauts de cycle", timeframe: "Short" }),
    N("btc-risk-appetite", "btc", "Risk Appetite", { status: "cooling", direction: "\u2193", importance: "important", value: "Prudence avant le FOMC du 16 sept.", timeframe: "Short" }),
    N("btc-etf-flows", "btc", "ETF Flows", { status: "elevated", direction: "\u2192", importance: "critical", value: "Tr\u00e8s volatils \u2014 pas de tendance nette en septembre", timeframe: "Short", desc: "Apr\u00e8s un ao\u00fbt record (+3,52 Md$), les flux ETF spot BTC ont oscill\u00e9 entre grosses entr\u00e9es et sorties en septembre, sans direction claire." }),
    N("btc-crypto-liquidity", "btc", "Crypto-Specific Liquidity", { status: "neutral", direction: "\u2192", importance: "relevant", value: "AUM ETF ~$103Md, stable", timeframe: "Medium" }),
    N("btc-regulation", "btc", "R\u00e9glementation US (CLARITY Act)", { status: "hot", direction: "\u2193", importance: "critical", value: "Vote de cloture au S\u00e9nat le 15 sept., 14h15 ET \u2014 probabilit\u00e9 de succ\u00e8s tr\u00e8s incertaine", prev: "~82% (f\u00e9v. 2026)", timeframe: "Short", markets: ["btc"],
      calendarDate: "Sep 15", calendarSort: 15, calendarImportance: "critical",
      desc: "Le Digital Asset Market Clarity Act (H.R. 3633) clarifierait le partage de comp\u00e9tences SEC/CFTC sur les crypto-actifs. Les march\u00e9s de pr\u00e9diction (Polymarket, Kalshi) ont vu la probabilit\u00e9 de succ\u00e8s chuter d'environ 82% en f\u00e9vrier \u00e0 16\u201328% d\u00e9but septembre, sur fond de d\u00e9saccords sur l'\u00e9thique, la responsabilit\u00e9 des d\u00e9veloppeurs DeFi et les revenus de staking des stablecoins \u2014 avant un possible regain d'optimisme de derni\u00e8re minute autour d'un nouveau texte." }),

    N("bank-reserves", "liquidity", "Bank Reserves", { status: "cooling", direction: "\u2193", importance: "important", value: "Declining" }),
    N("repo-market", "liquidity", "Repo Market", { status: "neutral", direction: "\u2192", importance: "relevant", value: "Functioning normally" }),
    N("m2-growth", "liquidity", "M2 Growth", { status: "cooling", direction: "\u2193", importance: "relevant", value: "Low single digits" }),

    N("middle-east", "geo", "Middle East Tensions", { status: "hot", direction: "\u2191", importance: "critical", value: "Guerre Iran\u2013USA, d\u00e9troit d'Ormuz sous tension", markets: ["xauusd", "oil"] }),
    N("trade-tensions", "geo", "US\u2013China Trade Tensions", { status: "elevated", direction: "\u2192", importance: "important", value: "Elevated", markets: ["nasdaq", "dxy"] }),
    N("elections-risk", "geo", "Elections / Policy Risk", { status: "neutral", direction: "\u2192", importance: "relevant", value: "Watch list" }),
  ];
  const nodes = {};
  list.forEach((n) => (nodes[n.id] = n));
  Object.values(nodes).forEach((n) => {
    n.childrenIds = list.filter((c) => c.parentId === n.id).map((c) => c.id);
  });
  return nodes;
}

function buildEdges() {
  const list = [
    // ---- flagship, richly evidenced ----
    E("inflation", "fed", "increases", {
      strength: "High", confidence: 87, timeframe: "Short / Medium", evidenceClass: "established",
      desc: "Inflation influences expectations about how long the Fed needs to stay restrictive.",
      evidenceChecklist: ["CPI", "Core CPI", "Fed speeches", "Treasury yields", "Fed funds futures"],
      marketImpact: [{ market: "Rates", dir: "\u2191" }, { market: "USD", dir: "\u2191" }, { market: "Gold", dir: "\u2193" }, { market: "Equities", dir: "\u2193" }],
      evidence: [
        { type: "news", headline: "Le march\u00e9 revoit fortement \u00e0 la hausse ses paris sur un geste de la Fed", date: "Sep 8, 2026", source: "CME FedWatch (via Yahoo Finance)", summary: "Apr\u00e8s le discours de Jackson Hole du pr\u00e9sident Kevin Warsh, la probabilit\u00e9 d'une hausse de taux le 16 septembre est pass\u00e9e au-dessus de 60%.", why: "Confirme que l'inflation \u00e9lev\u00e9e maintient le comit\u00e9 sur une trajectoire plus restrictive qu'anticip\u00e9.", impact: [{ market: "Fed expectations", dir: "\u2191" }, { market: "USD", dir: "\u2191" }], data: null, link: "https://finance.yahoo.com/economy/policy/articles/fomc-september-2026-odds-rate-163505675.html" },
        { type: "data", headline: "L'inflation am\u00e9ricaine reste stable, sans cooler davantage", date: "Sep 11, 2026", source: "Bureau of Labor Statistics", summary: "Le CPI est rest\u00e9 stable \u00e0 3,4% en glissement annuel en ao\u00fbt, avec une surprise \u00e0 la hausse sur la composante core mensuelle.", why: "Une inflation qui ne baisse plus r\u00e9duit les chances d'un assouplissement proche de la Fed, ce qui maintient les rendements r\u00e9els \u00e9lev\u00e9s.", impact: [{ market: "Real yields", dir: "\u2191" }, { market: "Gold", dir: "\u2193" }], data: { actual: "3.4%", expected: "3.3%", previous: "3.4%" }, link: "https://www.bls.gov/news.release/cpi.nr0.htm" },
      ],
    }),
    E("fed", "rates", "increases", { strength: "High", confidence: 82, timeframe: "Short", evidenceClass: "established",
      desc: "A hawkish Fed stance keeps the path of policy rates \u2014 and by extension the long end \u2014 higher for longer.",
      evidenceChecklist: ["Dot plot", "Fed funds futures", "FOMC statement language"],
      marketImpact: [{ market: "USD", dir: "\u2191" }, { market: "Gold", dir: "\u2193" }],
      evidence: [{ type: "news", headline: "Le comit\u00e9 penche vers une trajectoire plus restrictive", date: "Jul 29, 2026", source: "Federal Reserve (minutes FOMC)", summary: "Trois membres du FOMC ont vot\u00e9 pour une hausse imm\u00e9diate de 25 points de base d\u00e8s juillet, signe d'un d\u00e9bat interne plus hawkish.", why: "Un comit\u00e9 divis\u00e9 vers plus de restriction soutient des taux \u00e9lev\u00e9s plus longtemps.", impact: [{ market: "10Y yield", dir: "\u2191" }], data: null, link: "https://www.federalreserve.gov/monetarypolicy/fomcminutes20260729.htm" }],
    }),
    E("rates", "gold", "negative", { strength: "High", confidence: 79, timeframe: "Short / Medium", evidenceClass: "established",
      desc: "Higher yields raise the opportunity cost of holding a non-yielding asset like gold.",
      evidenceChecklist: ["10Y real yield", "TIPS breakevens"],
      marketImpact: [{ market: "Gold", dir: "\u2193" }],
      evidence: [{ type: "data", headline: "Le rendement \u00e0 10 ans am\u00e9ricain s'approche de 5%", date: "Sep 11, 2026", source: "Trading Economics", summary: "Les rendements r\u00e9els ont fortement grimp\u00e9 avec les rendements nominaux depuis le choc p\u00e9trolier li\u00e9 \u00e0 la guerre Iran\u2013USA.", why: "La hausse des rendements r\u00e9els est actuellement le principal frein sur l'or.", impact: [{ market: "Gold", dir: "\u2193" }], data: { actual: "\u2248 4.9%", expected: null, previous: "\u2248 4.3% (avril 2026)" }, link: "https://tradingeconomics.com/united-states/government-bond-yield" }],
    }),
    E("usd", "gold", "negative", { strength: "Moderate", confidence: 68, timeframe: "Short", evidenceClass: "correlation",
      desc: "A firmer dollar makes gold more expensive for holders of other currencies, typically weighing on price.",
      evidenceChecklist: ["DXY", "Rate differentials"],
      marketImpact: [{ market: "Gold", dir: "\u2193" }],
      evidence: [{ type: "data", headline: "Le dollar se maintient au-dessus de 99", date: "Sep 11, 2026", source: "Trading Economics", summary: "L'indice dollar reste ferme, port\u00e9 par les anticipations d'une hausse de taux de la Fed.", why: "Un dollar ferme est un frein m\u00e9canique direct sur l'or libell\u00e9 en USD.", impact: [{ market: "Gold", dir: "\u2193" }], data: { actual: "\u2248 99.1", expected: null, previous: "\u2248 98.5" }, link: "https://tradingeconomics.com/united-states/currency" }],
      contradictingEvidence: [{ headline: "L'or reste tr\u00e8s soutenu malgr\u00e9 un dollar ferme", date: "Sep 11, 2026", source: "TradingView", summary: "Le soutien g\u00e9opolitique et les achats de banques centrales continuent de limiter la sensibilit\u00e9 habituelle de l'or au dollar.", link: "https://www.tradingview.com/symbols/XAUUSD/" }],
    }),
    E("geo", "gold", "increases", { strength: "Moderate", confidence: 61, timeframe: "Short", evidenceClass: "correlation",
      desc: "Escalating geopolitical risk typically increases safe-haven demand for gold.",
      evidenceChecklist: ["News flow", "Safe-haven flows"],
      marketImpact: [{ market: "Gold", dir: "\u2191" }],
      evidence: [{ type: "news", headline: "La guerre Iran\u2013USA continue de faire monter le risque g\u00e9opolitique", date: "Sep 11, 2026", source: "Trading Economics", summary: "Les tensions autour du d\u00e9troit d'Ormuz continuent de soutenir la demande de valeurs refuges.", why: "La prime de risque g\u00e9opolitique continue de soutenir l'or m\u00eame quand le contexte de taux lui est d\u00e9favorable.", impact: [{ market: "Gold", dir: "\u2191" }, { market: "Oil", dir: "\u2191" }], data: null, link: "https://tradingeconomics.com/commodity/crude-oil" }],
    }),
    E("fed", "gold", "negative", { strength: "Moderate", timeframe: "Short", desc: "A Fed leaning toward a hike (rather than a cut) is a direct headwind for a non-yielding asset like gold, beyond the real-yield channel alone." }),
    E("inflation", "gold", "negative", { strength: "Low", timeframe: "Short", desc: "Inflation that stops cooling reinforces the case for a hawkish Fed, an indirect but real drag on gold." }),

    // ---- other top-level sector edges (lighter / no curated evidence yet) ----
    E("labor", "fed", "reduces", { strength: "Moderate", timeframe: "Short / Medium", desc: "A cooling labor market reduces the urgency to stay restrictive." }),
    E("growth", "fed", "reduces", { strength: "Moderate", timeframe: "Medium", desc: "Slower growth adds to the case for eventual easing." }),
    E("commodities", "inflation", "leads_to", { strength: "Moderate", timeframe: "Short", desc: "Energy prices feed through to headline inflation." }),
    E("fed", "equities", "negative", { strength: "Moderate", timeframe: "Short", desc: "A hawkish Fed pressures valuations, especially rate-sensitive growth names." }),
    E("rates", "equities", "negative", { strength: "Moderate", timeframe: "Short", desc: "Higher discount rates weigh on equity valuations." }),
    E("liquidity", "equities", "negative", { strength: "Low", timeframe: "Medium", desc: "Tighter liquidity conditions are a modest headwind for risk assets." }),
    E("earnings", "equities", "increases", { strength: "Moderate", timeframe: "Medium", desc: "Solid earnings (e.g. AI-linked capex from Oracle, Broadcom) support valuations even as rates rise." }),
    E("valuations", "equities", "negative", { strength: "Low", timeframe: "Long", desc: "Above-average valuations leave less cushion if rates or earnings disappoint." }),
    E("financial-conditions", "equities", "negative", { strength: "Moderate", timeframe: "Short", desc: "Tightening financial conditions as yields rise are a headwind for risk assets." }),
    E("usd", "commodities", "negative", { strength: "Low", timeframe: "Short", desc: "A stronger dollar makes USD-priced commodities costlier elsewhere, softening demand." }),
    E("growth", "equities", "correlated", { strength: "Moderate", timeframe: "Medium", desc: "Slower growth typically correlates with softer earnings expectations." }),
    E("geo", "commodities", "increases", { strength: "Moderate", timeframe: "Short", desc: "Conflict risk supports an energy risk premium." }),
    E("bonds", "rates", "correlated", { strength: "High", timeframe: "Short", desc: "Bond prices and yields move inversely by definition." }),
    E("fed", "bonds", "negative", { strength: "High", timeframe: "Short", desc: "A hawkish Fed keeps yields elevated, pressuring bond prices." }),
    E("inflation", "bonds", "negative", { strength: "Moderate", timeframe: "Short", desc: "Sticky inflation keeps the term premium and yields elevated." }),
    E("growth", "bonds", "correlated", { strength: "Low", timeframe: "Medium", desc: "Weaker growth typically supports bond prices via lower expected rates." }),
    E("rate-expectations", "bonds", "negative", { strength: "High", timeframe: "Short", desc: "Repricing toward a hike directly lifts yields and pressures prices." }),
    E("treasury-supply", "bonds", "negative", { strength: "Moderate", timeframe: "Short", desc: "A soft buyback / heavy issuance calendar adds to upward yield pressure." }),
    E("safe-haven-demand-ust", "bonds", "increases", { strength: "Moderate", timeframe: "Short", desc: "Geopolitical risk supports some haven bid for short-dated Treasuries even as yields rise elsewhere." }),

    // ---- usd / dxy sector drivers ----
    E("dxy", "usd", "correlated", { strength: "High", confidence: 70, desc: "DXY is the direct, tradable measure of broad dollar strength." }),
    E("rate-differentials", "usd", "increases", { strength: "High", confidence: 66, desc: "Wider US rate advantage over other majors supports the dollar." }),
    E("safe-haven-usd", "usd", "increases", { strength: "Moderate", confidence: 55 }),
    E("fed", "usd", "increases", { strength: "High", timeframe: "Short", desc: "A hawkish Fed relative to peers is USD-supportive." }),
    E("cpi", "usd", "increases", { strength: "Moderate", timeframe: "Short", desc: "Hotter inflation supports the case for a more hawkish Fed, which is USD-supportive." }),
    E("growth", "usd", "correlated", { strength: "Low", timeframe: "Medium" }),
    E("ecb-europe", "usd", "negative", { strength: "Moderate", confidence: 52, desc: "A more hawkish ECB (relative to the Fed) would narrow the rate gap and weigh on the dollar; an on-hold ECB is currently just background context, not a mover." }),
    E("boj-japan", "usd", "negative", { strength: "Moderate", confidence: 58, desc: "BoJ hikes strengthen the yen, the second-largest DXY component, at the dollar's expense." }),

    // ---- oil sector drivers ----
    E("oil-geo", "oil", "increases", { strength: "High", confidence: 70, desc: "The Iran war and Strait of Hormuz risk are the dominant force behind the current oil premium." }),
    E("oil-opec", "oil", "correlated", { strength: "Low", timeframe: "Short", desc: "OPEC+ holding policy steady is currently neutral \u2014 real-world supply is being set by the war, not by quotas." }),
    E("oil-supply", "oil", "reduces", { strength: "High", confidence: 68, desc: "Actual Gulf exports running well below quota is a bigger driver than the nominal OPEC+ decision." }),
    E("oil-demand", "oil", "correlated", { strength: "Low", timeframe: "Medium" }),
    E("oil-inventories", "oil", "reduces", { strength: "Moderate", confidence: 55, desc: "Falling OECD inventories add a structural floor under price." }),
    E("oil-usd", "oil", "negative", { strength: "Low", timeframe: "Short" }),
    E("oil-growth", "oil", "correlated", { strength: "Low", timeframe: "Medium" }),

    // ---- bitcoin sector drivers ----
    E("btc-liquidity", "btc", "increases", { strength: "Moderate", timeframe: "Short" }),
    E("btc-usd", "btc", "negative", { strength: "Moderate", confidence: 60, desc: "A firmer dollar and hawkish repricing are a headwind for BTC, similar to gold." }),
    E("btc-real-yields", "btc", "negative", { strength: "Moderate", confidence: 58, desc: "Rising real yields raise the opportunity cost of holding a non-yielding asset like BTC." }),
    E("btc-risk-appetite", "btc", "correlated", { strength: "High", confidence: 62, desc: "BTC still trades largely as a high-beta risk asset around FOMC events." }),
    E("btc-etf-flows", "btc", "increases", { strength: "High", confidence: 50, desc: "ETF flows are the clearest read on institutional demand, but have been whipsawing without a clear trend this month." }),
    E("btc-crypto-liquidity", "btc", "increases", { strength: "Low", timeframe: "Medium" }),
    E("btc-regulation", "btc", "increases", { strength: "High", confidence: 55, timeframe: "Short",
      desc: "Un cadre r\u00e9glementaire clair favoriserait l'entr\u00e9e de capitaux institutionnels ; un \u00e9chec du vote de cloture prolongerait la r\u00e9gulation par l'application et la fragmentation SEC/CFTC/OCC, un facteur d'incertitude pour le prix.",
      evidenceClass: "interpretation",
      marketImpact: [{ market: "BTC", dir: "\u2193" }] }),

    // ---- fed sector internal ----
    E("fed-speakers", "rate-expectations", "leads_to", { strength: "Moderate" }),
    E("fomc", "forward-guidance", "leads_to", { strength: "High" }),
    E("forward-guidance", "rate-expectations", "leads_to", { strength: "High" }),
    E("qt-qe", "balance-sheet", "leads_to", { strength: "High" }),
    E("policy-rate", "rate-expectations", "correlated", { strength: "Moderate" }),

    // ---- inflation sector internal ----
    E("energy-infl", "cpi", "leads_to", { strength: "Moderate" }),
    E("housing", "cpi", "increases", { strength: "High" }),
    E("wages", "core-cpi", "correlated", { strength: "Moderate" }),
    E("cpi", "core-cpi", "correlated", { strength: "Moderate" }),
    E("ppi", "cpi", "leads_to", { strength: "Low" }),

    // ---- rates sector internal ----
    E("fed-funds-rate", "fed-expectations", "correlated", { strength: "Moderate" }),
    E("fed-expectations", "us10y", "increases", { strength: "High" }),
    E("us10y", "real-yields", "increases", { strength: "High" }),
    E("real-yields", "financial-conditions", "increases", { strength: "Moderate" }),
    E("fed-funds-rate", "yield-curve", "correlated", { strength: "Moderate" }),

    // ---- 10Y drill ----
    E("infl-exp-10y", "us10y", "increases", { strength: "Moderate" }),
    E("fed-exp-10y", "us10y", "increases", { strength: "High" }),
    E("growth-driver-10y", "us10y", "increases", { strength: "Low" }),
    E("treasury-supply", "us10y", "increases", { strength: "Moderate" }),
    E("term-premium", "us10y", "increases", { strength: "Moderate" }),

    // ---- real yields drill (chain) ----
    E("ry-econ-data", "ry-fed-speeches", "leads_to", { strength: "Low" }),
    E("ry-fed-speeches", "ry-fomc", "leads_to", { strength: "Moderate" }),
    E("ry-fomc", "ry-fed-exp", "leads_to", { strength: "High" }),
    E("ry-fed-exp", "ry-infl-exp", "correlated", { strength: "Low" }),
    E("ry-infl-exp", "ry-nominal", "correlated", { strength: "Moderate" }),
    E("ry-nominal", "real-yields", "increases", { strength: "High" }),

    // ---- labor internal ----
    E("unemployment", "nfp", "correlated", { strength: "Moderate" }),
    E("jolts", "nfp", "leads_to", { strength: "Low" }),

    // ---- growth internal ----
    E("pmi", "gdp", "correlated", { strength: "Moderate" }),
    E("retail-sales", "gdp", "correlated", { strength: "Low" }),
    E("ism-services", "gdp", "correlated", { strength: "Low" }),

    // ---- gold sector drivers ----
    E("g-real-yields", "gold", "negative", { strength: "High", confidence: 74, evidenceChecklist: ["10Y real yield"], marketImpact: [{ market: "Gold", dir: "\u2193" }], desc: "Real yields near cycle highs raise the opportunity cost of holding gold." }),
    E("g-usd", "gold", "negative", { strength: "Moderate", confidence: 60, marketImpact: [{ market: "Gold", dir: "\u2193" }], desc: "A firm dollar is a headwind for USD-priced gold." }),
    E("g-cb-demand", "gold", "increases", { strength: "High", confidence: 71, marketImpact: [{ market: "Gold", dir: "\u2191" }], desc: "Sustained central-bank buying has been a structural support for price." }),
    E("g-etf-flows", "gold", "increases", { strength: "Low" }),
    E("g-safe-haven", "gold", "increases", { strength: "Moderate", confidence: 58 }),
    E("g-geo-risk", "gold", "increases", { strength: "High", confidence: 65, marketImpact: [{ market: "Gold", dir: "\u2191" }] }),
    E("g-physical-demand", "gold", "increases", { strength: "Low" }),
    E("g-mining-supply", "gold", "reduces", { strength: "Low" }),

    // ---- bonds internal ----
    E("ust-2y", "credit-spreads", "correlated", { strength: "Low" }),
    E("duration-risk", "credit-spreads", "correlated", { strength: "Low" }),
  ];
  const map = {};
  list.forEach((e) => (map[e.id] = e));
  return map;
}

const SCENARIOS = [
  { id: "bull", tone: "cooling", title: "Bull case (or)", probability: "15%", conditions: ["La Fed exclut une hausse le 16 septembre", "Le conflit Iran\u2013USA s'apaise brutalement", "L'inflation surprend \u00e0 la baisse", "Les rendements refluent", "Le dollar s'affaiblit"], favored: ["Gold", "Nasdaq", "Bonds"], unfavored: ["USD"] },
  { id: "base", tone: "neutral", title: "Base case", probability: "40%", conditions: ["La Fed hausse de 25pb le 16 septembre puis marque une pause", "La guerre Iran\u2013USA reste contenue sans s'aggraver", "Le p\u00e9trole se stabilise autour de $95\u2013105", "Les rendements se stabilisent pr\u00e8s de 4,8\u20135%", "Le dollar reste ferme"], favored: ["USD", "US Treasuries (courte \u00e9ch\u00e9ance)"], unfavored: ["Gold", "Small caps"] },
  { id: "bear", tone: "hot", title: "Bear case (risque inflation/guerre)", probability: "45%", conditions: ["Le conflit Iran\u2013USA s'aggrave, le d\u00e9troit d'Ormuz se ferme davantage", "Le p\u00e9trole d\u00e9passe nettement $110", "L'inflation r\u00e9accueille au-dessus de 4%", "La Fed hausse plus d'une fois", "Les rendements d\u00e9passent 5%"], favored: ["Gold (refuge)", "Oil", "USD (refuge)"], unfavored: ["Nasdaq", "S&P 500", "BTC"] },
];

/* ------------------------------- news layer ------------------------------
   Separate from the relationship-evidence system above. This answers "why
   does THIS node currently look the way it does" rather than "why are these
   two things connected". Real, dated news snapshot as of Sep 11, 2026 (see
   README) \u2014 sourced from real articles with real links, but nothing here is
   fetched live. A node with no entry simply shows no badge.
   ========================================================================= */

const RELEVANCE_META = {
  high: { label: "High", color: "#E5484D", emoji: "\u{1F534}" },
  medium: { label: "Medium", color: "#F0883E", emoji: "\u{1F7E0}" },
  low: { label: "Low", color: "#E6C260", emoji: "\u{1F7E1}" },
};

const NODE_NEWS = {
  gold: [
    { headline: "L'or encha\u00eene une troisi\u00e8me semaine de baisse", source: "Trading Economics", date: "Sep 11, 2026", time: "\u2014", summary: "Le m\u00e9tal jaune est retomb\u00e9 pr\u00e8s de 4 350\u20134 410 $/oz, p\u00e9nalis\u00e9 par le repricing hawkish de la Fed apr\u00e8s un PPI plus chaud que pr\u00e9vu li\u00e9 \u00e0 la guerre Iran\u2013USA.", why: "Montre que la pression des taux/du dollar l'emporte actuellement sur le soutien du risque g\u00e9opolitique.", relevance: "high", platform: "article", link: "https://tradingeconomics.com/commodity/gold" },
    { headline: "L'or reste tr\u00e8s haut sur un an malgr\u00e9 le repli r\u00e9cent", source: "TradingView", date: "Sep 11, 2026", time: "\u2014", summary: "Apr\u00e8s un sommet historique pr\u00e8s de 5 600 $ fin janvier 2026, l'or a nettement corrig\u00e9 mais reste environ 19% plus haut qu'il y a un an.", why: "Aide \u00e0 distinguer la tendance structurelle (achats de banques centrales, d\u00e9dollarisation) du mouvement de court terme.", relevance: "medium", platform: "article", link: "https://www.tradingview.com/symbols/XAUUSD/" },
  ],
  "real-yields": [
    { headline: "Le rendement \u00e0 10 ans am\u00e9ricain approche les 5%", source: "Trading Economics", date: "Sep 11, 2026", time: "\u2014", summary: "Le 10 ans a grimp\u00e9 vers 4,9\u20135% apr\u00e8s une op\u00e9ration de rachat du Tr\u00e9sor am\u00e9ricain moins bien souscrite que pr\u00e9vu et un PPI cha\u00fbd li\u00e9 \u00e0 la guerre en Iran.", why: "La hausse des rendements r\u00e9els est le principal frein actuel \u00e0 l'or.", relevance: "high", platform: "article", link: "https://tradingeconomics.com/united-states/government-bond-yield" },
    { headline: "La Fed pourrait relever ses taux le 16 septembre", source: "J.P. Morgan Wealth Management (via Chase)", date: "Aug 5, 2026", time: "\u2014", summary: "Les chocs d'approvisionnement li\u00e9s au conflit avec l'Iran et les doutes sur la cr\u00e9dibilit\u00e9 anti-inflation de la Fed ont fait basculer les strat\u00e8ges vers un sc\u00e9nario de hausse de 25 points de base.", why: "Explique pourquoi les march\u00e9s ont invers\u00e9 leurs anticipations, de baisses vers une possible hausse.", relevance: "high", platform: "article", link: "https://www.chase.com/personal/investments/learning-and-insights/article/september-2026-rate-hike-now-expected-amid-energy-shocks" },
  ],
  "rate-expectations": [
    { headline: "Les paris sur une hausse de taux d\u00e9passent 60%", source: "CME FedWatch (via Yahoo Finance)", date: "Sep 8, 2026", time: "\u2014", summary: "Apr\u00e8s le discours de Jackson Hole du pr\u00e9sident de la Fed Kevin Warsh, les traders anticipent d\u00e9sormais une probabilit\u00e9 sup\u00e9rieure \u00e0 60% d'une hausse de 25 points de base le 16 septembre.", why: "Un renversement rare\u00a0: le march\u00e9 anticipait des baisses de taux il y a quelques mois \u00e0 peine.", relevance: "high", platform: "article", link: "https://finance.yahoo.com/economy/policy/articles/fomc-september-2026-odds-rate-163505675.html" },
    { headline: "La probabilit\u00e9 d'une hausse grimpe encore apr\u00e8s le CPI", source: "Trading Economics", date: "Sep 11, 2026", time: "\u2014", summary: "La surprise haussi\u00e8re sur le CPI core mensuel a fait bondir la probabilit\u00e9 d'une hausse de taux, de 71% \u00e0 environ 90% selon certaines estimations.", why: "Montre \u00e0 quel point les march\u00e9s de taux r\u00e9agissent vite aux surprises d'inflation en ce moment.", relevance: "high", platform: "article", link: "https://tradingeconomics.com/united-states/government-bond-yield" },
  ],
  cpi: [
    { headline: "L'inflation am\u00e9ricaine se stabilise \u00e0 3,4% en ao\u00fbt", source: "Bureau of Labor Statistics", date: "Sep 11, 2026", time: "08:30 ET", summary: "Le CPI global est rest\u00e9 stable en glissement annuel, mais a progress\u00e9 de 0,4% sur le mois, port\u00e9 notamment par le logement.", why: "Un CPI qui ne baisse plus soutient l'argument d'une Fed plus restrictive.", relevance: "high", platform: "article", link: "https://www.bls.gov/news.release/cpi.nr0.htm" },
    { headline: "L'inflation sous-jacente au plus bas depuis 2021, mais surprise \u00e0 la hausse en rythme mensuel", source: "Trading Economics", date: "Sep 11, 2026", time: "\u2014", summary: "Le CPI core a ralenti \u00e0 2,4% sur un an, son plus bas niveau depuis mars 2021, tout en progressant de 0,3% sur le mois, au-dessus du consensus de 0,2%.", why: "La divergence entre la tendance annuelle et la surprise mensuelle explique pourquoi les march\u00e9s restent nerveux malgr\u00e9 une inflation en apparence mod\u00e9r\u00e9e.", relevance: "medium", platform: "article", link: "https://tradingeconomics.com/united-states/core-inflation-rate" },
  ],
  dxy: [
    { headline: "Le dollar se maintient au-dessus de 99 avant le CPI", source: "Trading Economics", date: "Sep 11, 2026", time: "\u2014", summary: "L'indice dollar est rest\u00e9 ferme, soutenu par les anticipations d'une hausse de taux de la Fed la semaine prochaine.", why: "La force du dollar est un frein m\u00e9canique direct sur l'or libell\u00e9 en USD.", relevance: "high", platform: "article", link: "https://tradingeconomics.com/united-states/currency" },
  ],
  fed: [
    { headline: "La Fed maintient ses taux en juillet, mais trois membres votent pour une hausse", source: "Trading Economics", date: "Aug 28, 2026", time: "\u2014", summary: "Le comit\u00e9 a laiss\u00e9 la fourchette inchang\u00e9e \u00e0 3,50\u20133,75%, mais trois membres ont vot\u00e9 pour une hausse imm\u00e9diate de 25 points de base, ouvrant la voie \u00e0 un possible geste en septembre.", why: "Ce niveau de dissension au sein du comit\u00e9 est rare et signale un vrai d\u00e9bat interne sur la trajectoire des taux.", relevance: "high", platform: "article", link: "https://tradingeconomics.com/united-states/interest-rate" },
  ],
  us10y: [
    { headline: "Le 10 ans am\u00e9ricain proche de son plus haut depuis 2023", source: "CNBC", date: "Sep 10, 2026", time: "\u2014", summary: "Le rendement du Tr\u00e9sor \u00e0 10 ans s'approche de 5%, un niveau qu'il n'avait plus atteint depuis plus d'un an.", why: "Le 10 ans influence les taux hypoth\u00e9caires, le co\u00fbt du cr\u00e9dit aux entreprises et les rendements r\u00e9els.", relevance: "high", platform: "article", link: "https://www.cnbc.com/quotes/US10Y" },
  ],
  "middle-east": [
    { headline: "La guerre Iran\u2013USA continue de faire grimper le p\u00e9trole", source: "Trading Economics", date: "Sep 11, 2026", time: "\u2014", summary: "Le WTI est repass\u00e9 au-dessus de 100$/baril avant de refluer l\u00e9g\u00e8rement, les tensions autour du d\u00e9troit d'Ormuz continuant de perturber les march\u00e9s de l'\u00e9nergie.", why: "Le risque g\u00e9opolitique reste l'un des rares facteurs qui continuent de soutenir l'or malgr\u00e9 la pression des taux.", relevance: "high", platform: "article", link: "https://tradingeconomics.com/commodity/crude-oil" },
  ],
  "btc-regulation": [
    { headline: "Le vote de cloture sur le CLARITY Act est fix\u00e9 au 15 septembre", source: "CoinDesk", date: "Sep 11, 2026", time: "\u2014", summary: "Le S\u00e9nat am\u00e9ricain revient de vacances le 14 septembre pour un vote de proc\u00e9dure le lendemain sur le Digital Asset Market Clarity Act, qui n\u00e9cessite 60 voix pour avancer vers un d\u00e9bat en s\u00e9ance pl\u00e9ni\u00e8re.", why: "C'est le test le plus important \u00e0 ce jour pour la l\u00e9gislation-cadre sur les crypto-actifs aux \u00c9tats-Unis \u2014 un \u00e9chec renverrait le dossier \u00e0 z\u00e9ro pour 2026.", relevance: "high", platform: "article", link: "https://www.coindesk.com/policy/2026/08/08/u-s-senate-opens-first-stage-of-crypto-clarity-act-voting-to-give-bill-a-chance-next-month" },
    { headline: "Les probabilit\u00e9s de succ\u00e8s se sont effondr\u00e9es depuis f\u00e9vrier", source: "Polymarket (via crypto.news)", date: "Sep 6, 2026", time: "\u2014", summary: "Les march\u00e9s de pr\u00e9diction donnaient 82% de chances d'adoption en f\u00e9vrier 2026 ; ce chiffre est tomb\u00e9 \u00e0 environ 16% d\u00e9but septembre, sur fond de d\u00e9saccords persistants sur l'\u00e9thique, la responsabilit\u00e9 des d\u00e9veloppeurs DeFi et les revenus de staking des stablecoins.", why: "Une chute aussi marqu\u00e9e des probabilit\u00e9s refl\u00e8te un vrai risque d'\u00e9chec, avec un impact potentiel \u00e0 la baisse sur Bitcoin si la clart\u00e9 r\u00e9glementaire n'arrive pas.", relevance: "high", platform: "article", link: "https://crypto.news/clarity-act-september-15-vote-cloture-crypto-regulation/" },
    { headline: "Un possible sursaut de derni\u00e8re minute apr\u00e8s un nouveau texte", source: "Kalshi", date: "Sep 14, 2026", time: "\u2014", summary: "Les traders de Kalshi ont relev\u00e9 leurs anticipations apr\u00e8s la publication d'une version r\u00e9vis\u00e9e du texte juste avant le vote, montrant \u00e0 quel point la situation reste mouvante \u00e0 la veille du scrutin.", why: "Illustre l'incertitude tr\u00e8s \u00e9lev\u00e9e qui entoure ce catalyseur \u2014 les probabilit\u00e9s ont boug\u00e9 dans les deux sens dans les derniers jours.", relevance: "medium", platform: "article", link: "https://news.kalshi.com/p/clarity-act-become-law-odds-spike-for-passage" },
  ],
};

// Some factors are the same underlying macro driver viewed from a different branch of the
// tree (e.g. Gold's "USD" child factor and the top-level "DXY Index" node both describe the
// dollar). News is curated once, on whichever node happens to hold it — this alias table lets
// every view of that factor surface the same news rather than showing "no news" just because
// the curated entry lives under a sibling id. getNewsFor()/getNewsForNode() are the only way
// the app should read NODE_NEWS from here on.
// ---- live news layer (see scripts/refresh-news.mjs + .github/workflows/refresh-news.yml) ----
// A GitHub Action fetches real market news every couple of hours, has Claude sort it into
// these same factor ids, and commits the result to public/live-news.json \u2014 which triggers a
// normal Vercel redeploy. The app below only ever reads that static file (fetched once on
// load, see the useEffect in MacroMapV2); it never calls any news API itself, so traffic to
// the site never touches Alpha Vantage's quota. Module-level so getNewsFor() (used deep in
// NodeShape/NodePanel/etc.) can see it without threading it through every component's props.
let LIVE_NEWS = null;
let LIVE_NEWS_UPDATED_AT = null;
function setLiveNews(data) {
  LIVE_NEWS = data?.byFactor || null;
  LIVE_NEWS_UPDATED_AT = data?.updatedAt || null;
}

const NEWS_ALIAS = {
  "g-real-yields": ["real-yields"],
  "g-usd": ["dxy", "usd"],
  "g-geo-risk": ["middle-east"],
  "usd": ["dxy"],
  "ry-nominal": ["us10y"],
  "ry-fed-exp": ["rate-expectations"],
  "fed-expectations": ["rate-expectations"],
  "fed-exp-10y": ["rate-expectations"],
  "btc-usd": ["dxy", "usd"],
  "btc-real-yields": ["real-yields"],
  "oil-usd": ["dxy", "usd"],
  "oil-geo": ["middle-east"],
};
function getNewsFor(id) {
  if (LIVE_NEWS?.[id]?.length) return LIVE_NEWS[id];
  if (NODE_NEWS[id]?.length) return NODE_NEWS[id];
  for (const alias of NEWS_ALIAS[id] || []) {
    if (LIVE_NEWS?.[alias]?.length) return LIVE_NEWS[alias];
    if (NODE_NEWS[alias]?.length) return NODE_NEWS[alias];
  }
  return [];
}
function getNewsForNode(node, nodes) {
  if (!node) return [];
  const direct = getNewsFor(node.id);
  if (direct.length) return direct;
  const twin = findTwin(node, nodes);
  return twin ? getNewsFor(twin.id) : [];
}

/* --------------------------- "Contexte récent" layer -----------------------
   Distinct from the "current driver" bias calculation above, which is only
   ever computed from computeBias()/bucketDrivers() on edges + node.direction.
   Nothing in NODE_CONTEXT ever feeds a bias score \u2014 it exists purely so a
   factor that currently carries no fresh, price-moving catalyst still shows
   *something*: its last policy decision, its latest data point, or the most
   recent event still shaping its state. This answers "why is this factor
   currently where it is" as a separate question from "is this factor moving
   the price right now".

   Each entry is tagged with a `kind` so the UI never lets a stale-but-useful
   fact pass for an active catalyst:
     catalyst  - this recent item IS currently moving the price (overlaps
                 with what shows in the "current drivers" section)
     indirect  - relevant background that shapes the factor but isn't itself
                 the direct trigger right now
     context   - pure state-of-play / structural information, no current
                 price impact implied
   Reuses NEWS_ALIAS + getContextFor/getContextForNode so factors that share
   an underlying driver (e.g. Gold's "USD" child and the top-level DXY node)
   don't need duplicate entries.
   ========================================================================= */
const CONTEXT_KIND_META = {
  catalyst: { label: "Catalyseur actuel", color: "#E5484D", emoji: "\u{1F4F0}" },
  indirect: { label: "Facteur indirect", color: "#E6C260", emoji: "\u{1F517}" },
  context: { label: "Contexte", color: "#8A93A3", emoji: "\u{1F4A4}" },
};
const NODE_CONTEXT = {
  "real-yields": [{ kind: "catalyst", headline: "Les rendements r\u00e9els grimpent avec le 10 ans vers 4,9\u20135%", date: "Sep 11, 2026", source: "Trading Economics", summary: "Le choc p\u00e9trolier li\u00e9 \u00e0 la guerre Iran\u2013USA et une adjudication du Tr\u00e9sor mal absorb\u00e9e ont pouss\u00e9 les rendements r\u00e9els vers leurs plus hauts de cycle.", why: "C'est actuellement le principal frein sur l'or et les actifs sans rendement.", link: "https://tradingeconomics.com/united-states/government-bond-yield" }],
  dxy: [{ kind: "catalyst", headline: "Le dollar se maintient au-dessus de 99 avant le CPI", date: "Sep 11, 2026", source: "Trading Economics", summary: "L'indice dollar reste ferme, soutenu par la mont\u00e9e des paris de hausse de taux de la Fed.", why: "Un dollar ferme p\u00e8se m\u00e9caniquement sur l'or, le p\u00e9trole et le BTC libell\u00e9s en USD.", link: "https://tradingeconomics.com/united-states/currency" }],
  fed: [{ kind: "catalyst", headline: "La Fed se r\u00e9unit le 16 septembre avec un risque de hausse de taux", date: "Sep 8, 2026", source: "CME FedWatch (via Yahoo Finance)", summary: "Apr\u00e8s le discours hawkish de Jackson Hole de Kevin Warsh, les march\u00e9s pricent une probabilit\u00e9 de 60\u201371% d'une hausse de 25pb.", why: "Retournement rare\u00a0: le march\u00e9 anticipait des baisses il y a quelques mois. C'est le catalyseur dominant de la semaine.", link: "https://finance.yahoo.com/economy/policy/articles/fomc-september-2026-odds-rate-163505675.html" }],
  cpi: [{ kind: "catalyst", headline: "CPI ao\u00fbt stable \u00e0 3,4%, surprise sur le core mensuel", date: "Sep 11, 2026", source: "Bureau of Labor Statistics", summary: "L'inflation annuelle ne baisse plus, et le CPI core mensuel a surpris \u00e0 la hausse (+0,3% vs +0,2% attendu).", why: "Renforce l'argument d'une Fed plus restrictive.", link: "https://www.bls.gov/news.release/cpi.nr0.htm" }],
  "middle-east": [{ kind: "catalyst", headline: "La guerre Iran\u2013USA continue de perturber le d\u00e9troit d'Ormuz", date: "Sep 11, 2026", source: "Trading Economics", summary: "Le conflit, en cours depuis f\u00e9vrier 2026, continue de justifier une prime de risque sur l'or et le p\u00e9trole.", why: "Reste le principal facteur de soutien de l'or et du p\u00e9trole malgr\u00e9 la pression des taux.", link: "https://tradingeconomics.com/commodity/crude-oil" }],
  "g-cb-demand": [{ kind: "context", headline: "Les achats officiels d'or restent soutenus", date: "Q2 2026", source: "World Gold Council", summary: "Les banques centrales, en particulier des march\u00e9s \u00e9mergents, ont poursuivi leurs achats nets d'or pour un neuvi\u00e8me trimestre cons\u00e9cutif.", why: "Tendance structurelle de fond, pas un catalyseur de cette semaine \u2014 elle ne bouge pas assez vite pour expliquer les variations de prix au jour le jour.", link: "https://www.gold.org/goldhub/data/gold-demand-by-country" }],
  "g-etf-flows": [{ kind: "indirect", headline: "Les flux ETF or restent sensibles au repricing des taux", date: "Sep 2026", source: "TradingView", summary: "La demande occidentale via les ETF or reste hésitante depuis que les paris de hausse de taux se sont renforc\u00e9s.", why: "Un facteur secondaire \u2014 il amplifie le mouvement des taux r\u00e9els plut\u00f4t que de le d\u00e9clencher lui-m\u00eame.", link: "https://www.tradingview.com/symbols/XAUUSD/" }],
  "rate-differentials": [{ kind: "indirect", headline: "L'\u00e9cart de taux favorise le dollar face \u00e0 la plupart des devises du G10", date: "Sep 2026", source: "Trading Economics", summary: "Avec une Fed qui envisage une hausse pendant que la BCE et la plupart des autres banques centrales sont en pause, l'\u00e9cart de taux reste favorable au dollar.", why: "Renforce, sans le d\u00e9clencher, le mouvement du DXY actuellement men\u00e9 par le repricing Fed.", link: "https://tradingeconomics.com/united-states/interest-rate" }],
  growth: [{ kind: "context", headline: "La croissance am\u00e9ricaine reste jug\u00e9e solide par la Fed", date: "Sep 2026", source: "Federal Reserve", summary: "Le comit\u00e9 continue de d\u00e9crire l'activit\u00e9 \u00e9conomique comme progressant \u00e0 un rythme solide malgr\u00e9 l'incertitude li\u00e9e \u00e0 la guerre.", why: "Contexte de fond \u2014 pas un \u00e9l\u00e9ment qui a boug\u00e9 r\u00e9cemment, mais qui explique pourquoi la Fed se sent libre d'envisager une hausse plut\u00f4t qu'une baisse.", link: "https://www.federalreserve.gov/monetarypolicy/fomcminutes20260729.htm" }],
  liquidity: [{ kind: "context", headline: "La question du bilan de la Fed reste secondaire pour l'instant", date: "Sep 2026", source: "Federal Reserve", summary: "L'attention du march\u00e9 reste concentr\u00e9e sur la trajectoire des taux plut\u00f4t que sur le bilan.", why: "Contexte utile pour comprendre la politique mon\u00e9taire globale, mais ce n'est pas ce qui bouge les march\u00e9s cette semaine.", link: "https://www.federalreserve.gov/monetarypolicy.htm" }],
  earnings: [{ kind: "context", headline: "Les r\u00e9sultats li\u00e9s \u00e0 l'IA (Oracle, Broadcom) restent solides", date: "Sep 2026", source: "CNBC", summary: "Les valeurs technologiques li\u00e9es aux d\u00e9penses d'IA ont continu\u00e9 de publier des r\u00e9sultats solides, soutenant les indices malgr\u00e9 la hausse des taux.", why: "Explique pourquoi les indices tiennent relativement bien face \u00e0 la pression des taux.", link: "https://www.cnbc.com/2026/09/10/stock-market-today-live-updates.html" }],
  valuations: [{ kind: "context", headline: "Les valorisations restent au-dessus de leur moyenne historique", date: "Sep 2026", source: "Trading Economics", summary: "Malgr\u00e9 la correction r\u00e9cente, les multiples de valorisation du S&P 500 et du Nasdaq restent \u00e9lev\u00e9s en comparaison historique.", why: "Laisse peu de marge d'erreur si les taux continuent de monter ou si les b\u00e9n\u00e9fices d\u00e9\u00e7oivent \u2014 un facteur structurel, pas un catalyseur du jour.", link: null }],
  "financial-conditions": [{ kind: "indirect", headline: "Les conditions financi\u00e8res se resserrent avec la hausse des rendements", date: "Sep 2026", source: "Trading Economics", summary: "La hausse du 10 ans vers 5% resserre m\u00e9caniquement les conditions financi\u00e8res globales.", why: "Un canal de transmission indirect entre les taux et les actions, pas un catalyseur ind\u00e9pendant.", link: "https://tradingeconomics.com/united-states/government-bond-yield" }],
  "treasury-supply": [{ kind: "catalyst", headline: "Une adjudication du Tr\u00e9sor am\u00e9ricain mal absorb\u00e9e ajoute \u00e0 la pression sur les rendements", date: "Sep 2026", source: "Trading Economics", summary: "Une demande plus faible que pr\u00e9vu lors d'un rachat r\u00e9cent du Tr\u00e9sor a contribu\u00e9 \u00e0 pousser le 10 ans vers 5%.", why: "Vient s'ajouter au repricing Fed pour expliquer la hausse rapide des rendements ces derniers jours.", link: "https://tradingeconomics.com/united-states/government-bond-yield" }],
  "safe-haven-demand-ust": [{ kind: "indirect", headline: "La demande refuge sur les bons courts reste pr\u00e9sente malgr\u00e9 la hausse des rendements", date: "Sep 2026", source: "Trading Economics", summary: "Le risque g\u00e9opolitique continue de soutenir une certaine demande refuge sur les \u00e9ch\u00e9ances courtes, m\u00eame si elle est domin\u00e9e par le mouvement des taux.", why: "Un facteur qui limite partiellement la hausse des rendements sans l'inverser.", link: null }],
  "ecb-europe": [{ kind: "context", headline: "La BCE maintient ses taux inchang\u00e9s pour la 3\u1d49 fois de suite", date: "Sep 11, 2026", source: "UOB Group (via FXStreet)", summary: "La BCE a laiss\u00e9 ses taux directeurs inchang\u00e9s (d\u00e9p\u00f4t \u00e0 2,00%) apr\u00e8s 8 baisses depuis juin 2024.", why: "Statu quo \u2014 la BCE n'est actuellement pas un moteur du mouvement du dollar, juste le contexte face auquel la Fed est compar\u00e9e.", link: "https://www.fxstreet.com/news/eurozone-ecb-holds-rates-in-september-uob-group-202509120931" }],
  "boj-japan": [{ kind: "indirect", headline: "Le gouverneur Ueda maintient un ton hawkish sur les taux japonais", date: "Sep 10, 2026", source: "Trading Economics", summary: "Un membre du board (Takata) a plaid\u00e9 pour une hausse \u00e0 1,25% en juillet (rejet\u00e9e 8 voix contre 1) ; Ueda dit vouloir continuer \u00e0 relever les taux tant que les conditions restent accommodantes.", why: "Un yen plus fort limiterait la hausse du DXY, mais ce n'est pas le facteur dominant actuellement.", link: "https://tradingeconomics.com/japan/interest-rate" }],
  "oil-opec": [{ kind: "context", headline: "OPEC+ maintient sa politique de production pour octobre", date: "Sep 6, 2026", source: "Energy Connects", summary: "Le groupe a achev\u00e9 le d\u00e9roulement de ses coupes volontaires de 1,65 Mb/j en septembre et garde sa politique inchang\u00e9e pour octobre ; prochaine r\u00e9union le 4 octobre.", why: "D\u00e9cision largement symbolique \u2014 la production r\u00e9elle est actuellement dict\u00e9e par la guerre, pas par les quotas OPEC+.", link: "https://www.energyconnects.com/news/oil/2026/september/opecplus-keeps-output-policy-unchanged-for-october" }],
  "oil-supply": [{ kind: "catalyst", headline: "Les exports du Golfe restent bien en de\u00e7\u00e0 des quotas officiels", date: "Sep 2026", source: "World Oil", summary: "Plusieurs producteurs du Golfe ne parviennent pas \u00e0 produire \u00e0 hauteur de leurs quotas \u00e0 cause de contraintes techniques et du conflit.", why: "L'\u00e9cart entre quotas officiels et production r\u00e9elle est le v\u00e9ritable moteur du prix actuellement, plus que les d\u00e9cisions OPEC+.", link: "https://worldoil.com/news/2026/8/2/opec-approves-final-production-quota-increase-of-2026/" }],
  "oil-inventories": [{ kind: "indirect", headline: "Les stocks commerciaux de l'OCDE continuent de baisser", date: "Jun 2026", source: "OPEC MOMR (via Energy Connects)", summary: "Les stocks commerciaux de p\u00e9trole de l'OCDE ont recul\u00e9 de 26,4 millions de barils en juin, \u00e0 2,73 milliards de barils.", why: "Un stock qui se resserre rend le march\u00e9 plus sensible \u00e0 tout nouveau choc d'offre.", link: "https://www.energyconnects.com/news/oil/2026/september/opecplus-keeps-output-policy-unchanged-for-october" }],
  "btc-etf-flows": [{ kind: "catalyst", headline: "Les flux ETF Bitcoin oscillent fortement en septembre", date: "Sep 11, 2026", source: "Farside Investors (via Yahoo Finance)", summary: "Apr\u00e8s un ao\u00fbt record (+3,52 Md$ d'entr\u00e9es nettes), septembre a d\u00e9marr\u00e9 par une sortie de 236,5 M$ le 1er, suivie d'un rebond \u00e0 +731 M$ le 3, sans direction claire depuis.", why: "L'absence de tendance nette sur les flux ETF est cohérente avec l'absence de catalyseur dominant sur BTC cette semaine.", link: "https://finance.yahoo.com/markets/crypto/articles/bitcoin-etf-news-demand-faces-142217788.html" }],
  "btc-risk-appetite": [{ kind: "indirect", headline: "BTC reste corr\u00e9l\u00e9 au sentiment de risque avant le FOMC", date: "Sep 11, 2026", source: "Yahoo Finance", summary: "Le BTC est repass\u00e9 sous $77 000 avant de rebondir l\u00e9g\u00e8rement, dans un contexte d'attentisme g\u00e9n\u00e9ral avant les donn\u00e9es d'inflation et la r\u00e9union de la Fed.", why: "Montre que BTC continue de se comporter comme un actif \u00e0 b\u00eata \u00e9lev\u00e9 plut\u00f4t que comme une couverture ind\u00e9pendante.", link: "https://finance.yahoo.com/personal-finance/investing/article/bitcoin-and-ethereum-prices-today-friday-september-11-2026-bitcoin-falls-below-77000-with-key-inflation-data-on-deck-113905130.html" }],
};
function getContextFor(id) {
  if (NODE_CONTEXT[id]?.length) return NODE_CONTEXT[id];
  for (const alias of NEWS_ALIAS[id] || []) {
    if (NODE_CONTEXT[alias]?.length) return NODE_CONTEXT[alias];
  }
  // Reuse the news layer (with its own aliasing already applied) rather than duplicating a
  // second copy of the same headline here: a node with real curated news but no explicit
  // catalyst/indirect/context call gets that news surfaced as plain "context" by default.
  const news = getNewsFor(id);
  if (news.length) return news.map((n) => ({ kind: "context", headline: n.headline, date: n.date, source: n.source, summary: n.summary, why: n.why, link: n.link }));
  return [];
}
function getContextForNode(node, nodes) {
  if (!node) return [];
  const direct = getContextFor(node.id);
  if (direct.length) return direct;
  const twin = findTwin(node, nodes);
  return twin ? getContextFor(twin.id) : [];
}

// A factor with no active, price-moving news (e.g. ETF flows while real yields dominate) isn't
// a factor with NO information \u2014 it just has no CATALYST right now. This falls back to the
// most recent context entry so that factor is never a dead end, and flags it as context-only
// so the UI can mark it with a different, deliberately duller symbol than live news (\u{1F4F0})
// rather than let a stale/background item masquerade as something currently moving the price.
// Last-resort fallback so every single factor in the map has SOMETHING to show, even the ones
// nobody has curated a news or context entry for yet: it reads back the node's own real fields
// (value/direction/desc/source/lastUpdate \u2014 never invents a new fact) as a plain status card.
// Always tagged "context" and flagged isSynthesized so the UI can be explicit that this is
// MacroMap's own last-known reading, not a sourced article.
function synthesizeContextFromNode(node) {
  if (!node) return [];
  const trend = node.direction === "\u2191" ? "en hausse" : node.direction === "\u2193" ? "en baisse" : "stable";
  const hasValue = node.value && node.value !== "\u2014";
  return [{
    kind: "context",
    synthetic: true,
    headline: `\u00c9tat actuel \u2014 ${node.label}${hasValue ? `\u00a0: ${node.value}` : ""}`,
    date: node.lastUpdate || "Sep 11, 2026",
    source: node.source && node.source !== "Saisie manuelle" ? node.source : "MacroMap (dernière valeur connue)",
    summary: node.desc || `${node.label} est actuellement ${trend}${hasValue ? ` (${node.value})` : ""}, sans actualit\u00e9 sp\u00e9cifique curat\u00e9e pour ce facteur pour l'instant.`,
    why: "Aucune source externe n'a encore \u00e9t\u00e9 rattach\u00e9e \u00e0 ce facteur \u2014 ceci refl\u00e8te seulement le dernier \u00e9tat connu dans MacroMap, pas un article.",
    link: null,
  }];
}
function getDisplayNewsForNode(node, nodes) {
  if (!node) return { items: [], isContextOnly: false, isSynthesized: false };
  const direct = getNewsForNode(node, nodes);
  if (direct.length) return { items: direct, isContextOnly: false, isSynthesized: false };
  const ctx = getContextForNode(node, nodes);
  if (ctx.length) return { items: ctx, isContextOnly: true, isSynthesized: false };
  return { items: synthesizeContextFromNode(node), isContextOnly: true, isSynthesized: true };
}

/* --------------------------- bias explanation system -----------------------
   Reads the EXISTING nodes/edges — it adds no new nodes or edges of its own.
   A node's bias is derived from its incoming relationships: each driver's
   direction + relation type gives a bullish/bearish sign, weighted by the
   edge's existing "strength" field (High/Moderate/Low), which doubles as the
   factor's impact tier. Anything the underlying data doesn't have (history,
   a numeric data point, a source) degrades honestly instead of being invented.
   ========================================================================= */

const BIAS_META = {
  bullish: { label: "Haussier", emoji: "\u{1F7E2}", color: COLORS.cooling },
  bearish: { label: "Baissier", emoji: "\u{1F534}", color: COLORS.hot },
  neutral: { label: "Neutre", emoji: "\u{1F7E1}", color: COLORS.neutral },
  mixed: { label: "Mitig\u00e9", emoji: "\u{1F7E1}", color: "#A78BFA" },
};
const IMPACT_TIER = {
  High: { label: "Impact \u00e9lev\u00e9", rank: 3 }, Moderate: { label: "Impact moyen", rank: 2 },
  Low: { label: "Impact faible", rank: 1 },
};
const STRENGTH_WEIGHT = { High: 3, Moderate: 2, Low: 1 };
const NEG_RELATIONS = ["negative", "reduces", "contradicts"];
const POS_RELATIONS = ["positive", "increases", "leads_to", "correlated", "signals"];

function edgeSign(edge, nodes) {
  const src = nodes[edge.from];
  if (!src) return 0;
  const up = src.direction === "\u2191", down = src.direction === "\u2193";
  if (!up && !down) return 0;
  const relSign = NEG_RELATIONS.includes(edge.relation) ? -1 : POS_RELATIONS.includes(edge.relation) ? 1 : 0;
  return relSign * (up ? 1 : -1);
}

function computeBias(nodeId, nodes, edges) {
  const drivers = Object.values(edges)
    .filter((e) => e.to === nodeId && nodes[e.from])
    .map((e) => {
      const sign = edgeSign(e, nodes);
      if (sign === 0) return null;
      return { edge: e, node: nodes[e.from], sign, weight: STRENGTH_WEIGHT[e.strength] || 1 };
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight);
  if (drivers.length === 0) return null;

  const score = drivers.reduce((s, d) => s + d.sign * d.weight, 0);
  const totalWeight = drivers.reduce((s, d) => s + d.weight, 0);
  const posWeight = drivers.filter((d) => d.sign > 0).reduce((s, d) => s + d.weight, 0);
  const negWeight = drivers.filter((d) => d.sign < 0).reduce((s, d) => s + d.weight, 0);
  const norm = totalWeight ? score / totalWeight : 0;

  // Don't force a directional call when the evidence genuinely pulls both ways.
  const minSide = Math.min(posWeight, negWeight);
  const isMixed = drivers.length >= 3 && totalWeight > 0 && minSide / totalWeight >= 0.35;

  const bias = isMixed ? "mixed" : norm > 0.15 ? "bullish" : norm < -0.15 ? "bearish" : "neutral";
  const confidence = totalWeight >= 7 && drivers.length >= 4 ? "High" : totalWeight >= 3 ? "Medium" : "Low";
  const overallSign = bias === "bullish" ? 1 : bias === "bearish" ? -1 : 0;
  const supporting = bias === "mixed" ? [] : drivers.filter((d) => overallSign === 0 || d.sign === overallSign);
  const contradicting = bias === "mixed" ? [] : drivers.filter((d) => overallSign !== 0 && d.sign !== overallSign);

  return { bias, confidence, drivers, totalWeight, supporting, contradicting };
}

// Every incoming factor for a node, regardless of whether it currently has a directional
// move (unlike computeBias's driver list, which drops anything sitting at "\u2192"). This is
// what lets "Contexte récent" cover a factor even when it isn't currently moving the price —
// a flat/neutral factor still gets its latest decision or data point shown, just tagged
// as context rather than a catalyst.
function getAllFactors(nodeId, nodes, edges) {
  return Object.values(edges)
    .filter((e) => e.to === nodeId && nodes[e.from])
    .map((e) => ({ edge: e, node: nodes[e.from], sign: edgeSign(e, nodes) }));
}

function traceCausalChain(nodeId, nodes, edges, depth = 4) {
  const chain = [{ node: nodes[nodeId], edge: null }];
  const seen = new Set([nodeId]);
  let curId = nodeId;
  for (let i = 0; i < depth; i++) {
    const incoming = Object.values(edges)
      .filter((e) => e.to === curId && nodes[e.from] && !seen.has(e.from) && edgeSign(e, nodes) !== 0)
      .sort((a, b) => (STRENGTH_WEIGHT[b.strength] || 1) - (STRENGTH_WEIGHT[a.strength] || 1));
    if (!incoming.length) break;
    const next = incoming[0];
    chain.unshift({ node: nodes[next.from], edge: next });
    seen.add(next.from);
    curId = next.from;
  }
  return chain.length > 1 ? chain : null;
}

/* --------------------------- Current Relevance engine -----------------------
   MacroMap used to treat every driver of a node as equally worth showing,
   using only static "structural importance". That answers "what can
   theoretically move this?" — not "what is actually pricing it right now?".

   This engine reuses computeBias()'s driver list (already the set of
   incoming factors that currently have a directional move — a node sitting
   at "\u2192" contributes no signed driver and drops out automatically) and
   layers a second axis on top of it: STRUCTURAL IMPORTANCE (static, from
   node.importance) vs CURRENT RELEVANCE (dynamic — edge strength/confidence,
   evidence on file, and whether the factor is a fast-moving or a slow,
   structural one via node.timeframe).

   STRUCTURAL IMPORTANCE + CURRENT RELEVANCE -> DISPLAY PRIORITY:
     core       -> "current driver"      (what's actually pricing it today)
     secondary  -> "secondary driver"    (contributing, not decisive)
     structural -> "structural support/background" (matters long-term, not
                   today's headline mover — timeframe: "Long" always lands
                   here regardless of score, per the spec's Central Bank
                   Demand example)

   Nothing here invents data: every input (strength, confidence, evidence
   count, timeframe) already exists on the node/edge. Where a market's
   underlying nodes don't carry enough of that data, the bucket is simply
   sparse or empty rather than backfilled — see EmptyNote usage downstream.
   ========================================================================= */

function classifyDriverRelevance(d) {
  const node = d.node, edge = d.edge;
  const structuralRank = IMPORTANCE_META[node.importance]?.rank ?? 0; // 0..3
  const evidenceCount = (getNewsFor(node.id)?.length || 0) + (node.evidence?.length || 0) + (edge.evidence?.length || 0);
  const confidencePts = edge.confidence != null ? edge.confidence / 100 : 0.25;
  const isLongTerm = node.timeframe === "Long";
  const relevance =
    d.weight * 1.4 +                       // edge strength (High/Moderate/Low)
    structuralRank * 0.55 +                // structural importance still counts, just not alone
    Math.min(evidenceCount, 3) * 0.5 +     // curated evidence on file
    confidencePts * 1.6 -                  // confidence in the relationship
    (isLongTerm ? 2.1 : 0);                // slow-moving factors get pushed toward structural
  return { ...d, structuralRank, evidenceCount, confidencePts, isLongTerm, relevance };
}

function bucketDrivers(rawDrivers) {
  const scored = rawDrivers.map(classifyDriverRelevance).sort((a, b) => b.relevance - a.relevance);
  const core = [], secondary = [], structural = [];
  scored.forEach((f) => {
    if (f.isLongTerm) { structural.push(f); return; }
    if (core.length < 5 && f.relevance >= 2.3) { core.push(f); return; }
    if (secondary.length < 5) { secondary.push(f); return; }
    structural.push(f);
  });
  // Never show an empty "current drivers" list if at least one real driver exists —
  // fall back to the single highest-relevance factor rather than showing nothing.
  if (core.length === 0 && scored.length > 0) {
    const top = scored[0];
    const removeFrom = (arr) => { const i = arr.indexOf(top); if (i >= 0) arr.splice(i, 1); };
    removeFrom(secondary); removeFrom(structural);
    core.push(top);
  }
  return { core, secondary, structural };
}

const ROLE_META = {
  core: { label: "Driver actuel", color: COLORS.hot },
  secondary: { label: "Facteur secondaire", color: COLORS.elevated },
  structuralSupport: { label: "Support structurel", color: COLORS.improving },
  background: { label: "Arri\u00e8re-plan", color: "#545D6E" },
};
// "What changed?" — pulled from the current drivers' own fields (edge.desc, or the
// node's own trend + value), never invented. "What could change this?" reuses the
// node's manually-curated whatCouldChange when present (e.g. Gold), and otherwise
// falls back to a generic, honestly-labelled inversion of the top current drivers.
function buildWhatChanged(core, secondary) {
  return [...core, ...secondary]
    .filter((f) => f.node.direction !== "\u2192")
    .slice(0, 6)
    .map((f) => f.edge.desc || `${f.node.label} ${f.node.direction}${f.node.value && f.node.value !== "\u2014" ? ` (${f.node.value})` : ""}`);
}
function buildWhatCouldChange(focalNode, core) {
  if (focalNode.whatCouldChange?.length) return focalNode.whatCouldChange;
  return core.slice(0, 4).map((f) => `${f.node.label} s'inverse ou perd nettement en intensit\u00e9 (actuellement ${f.node.direction === "\u2191" ? "en hausse" : f.node.direction === "\u2193" ? "en baisse" : "stable"})`);
}

// "Ce qui price actuellement" — a one-line synthesis distinct from the bias label itself:
// the label says WHERE the needle points, this says WHAT is currently pushing it there (or,
// when nothing is, says so plainly instead of leaving the section looking broken).
function buildPricingSummary(bias, buckets, noDominantCatalyst) {
  if (noDominantCatalyst) {
    const structuralCount = (buckets?.structural.length || 0) + (buckets?.secondary.length || 0);
    return structuralCount > 0
      ? `Aucun catalyseur dominant actuellement. Le biais reflète surtout des facteurs structurels/de fond (voir ci-dessous) plut\u00f4t qu'une actualit\u00e9 r\u00e9cente forte.`
      : `Aucun catalyseur dominant actuellement, et aucun facteur structurel cartographi\u00e9 pour l'instant.`;
  }
  const names = buckets.core.slice(0, 3).map((f) => `${f.node.label} (${f.sign > 0 ? "haussier" : "baissier"})`);
  return `Actuellement pric\u00e9 principalement par\u00a0: ${names.join(", ")}.`;
}

function buildReasoning(edge, nodes) {
  const a = nodes[edge.from], b = nodes[edge.to];
  if (!a || !b) return [];
  const relLabel = (RELATION_META[edge.relation]?.label || "li\u00e9 \u00e0").toLowerCase();
  const trend = a.direction === "\u2191" ? "augment\u00e9" : a.direction === "\u2193" ? "diminu\u00e9" : "\u00e9t\u00e9 globalement stable";
  const lines = [
    `${a.label} a r\u00e9cemment ${trend}${a.value && a.value !== "\u2014" ? ` (actuellement ${a.value})` : ""}.`,
    `Ce lien est cartographi\u00e9 comme une relation${edge.strength ? " de force " + edge.strength.toLowerCase() : ""} de type \u00ab\u00a0${relLabel}\u00a0\u00bb avec ${b.label}.`,
  ];
  if (edge.desc) lines.push(`M\u00e9caniquement, cela sugg\u00e8re\u00a0: ${edge.desc.charAt(0).toLowerCase()}${edge.desc.slice(1)}`);
  if (edge.evidenceChecklist?.length) lines.push(`Indicateurs suivis pour ce lien\u00a0: ${edge.evidenceChecklist.join(", ")}.`);
  if ((edge.evidence || []).length) lines.push(`Les donn\u00e9es et actualit\u00e9s r\u00e9centes (ci-dessous) sont coh\u00e9rentes avec cette interpr\u00e9tation.`);
  if ((edge.contradictingEvidence || []).length) lines.push(`Cela dit, certains \u00e9l\u00e9ments r\u00e9cents nuancent cette lecture \u2014 voir \u00c9l\u00e9ments contradictoires.`);
  lines.push(`Cela pourrait contribuer \u00e0 une pression continue dans la m\u00eame direction, mais il s'agit d'une interpr\u00e9tation des conditions actuelles, pas d'un r\u00e9sultat garanti.`);
  return lines;
}

function describeState(node) {
  if (node.desc) return node.desc;
  const trend = node.direction === "\u2191" ? "rising" : node.direction === "\u2193" ? "declining" : "holding steady";
  return `${node.label} \u2014 currently ${trend}${node.value && node.value !== "\u2014" ? ` (${node.value})` : ""}.`;
}

function findTwin(node, nodes) {
  if (!node || !nodes) return null;
  return Object.values(nodes).find((n) => n.id !== node.id && n.label === node.label && (n.value !== "\u2014" || n.actual != null));
}

function getDataPoints(node) {
  if (!node) return null;
  if (node.actual != null) return { current: `${node.actual}%`, previous: node.previous != null ? `${node.previous}%` : null, expected: node.expected != null ? `${node.expected}%` : null };
  if (node.value && node.value !== "\u2014") return { current: node.value, previous: node.prev && node.prev !== "\u2014" ? node.prev : null };
  return null;
}

function computeChange(current, previous) {
  const c = parseFloat(current), p = parseFloat(previous);
  if (isNaN(c) || isNaN(p)) return null;
  const d = (c - p).toFixed(1);
  return `${d > 0 ? "+" : ""}${d}`;
}

/* ------------------------------- helpers -------------------------------- */

function getPath(nodes, id) {
  const path = [];
  let cur = id;
  while (cur) { path.unshift(cur); cur = nodes[cur]?.parentId; }
  return path;
}
function useDebouncedSave(value, key, delay = 900) {
  useEffect(() => {
    const t = setTimeout(async () => {
      try { await window.storage?.set(key, JSON.stringify(value), false); } catch (e) {}
    }, delay);
    return () => clearTimeout(t);
  }, [value, key, delay]);
}

/* ------------------------------ component -------------------------------- */

export default function MacroMapV2() {
  const [nodes, setNodes] = useState(buildData);
  const [edges, setEdges] = useState(buildEdges);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("mindmap");
  const [breadcrumb, setBreadcrumb] = useState(["global"]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [marketFilter, setMarketFilter] = useState("all");
  const [complexity, setComplexity] = useState("standard");
  const [traderMode, setTraderMode] = useState(false);
  const [traderMarket, setTraderMarket] = useState("xauusd");
  const [connectMode, setConnectMode] = useState(false);
  const [pendingSource, setPendingSource] = useState(null);
  const [picker, setPicker] = useState(null);
  const [addingNode, setAddingNode] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.85);
  const [macroScore, setMacroScore] = useState({ inflation: "hot", growth: "neutral", fed: "hot", usd: "improving", liquidity: "hot", risk: "elevated" });
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [whyOpen, setWhyOpen] = useState(false);
  const [newsPanelNodeId, setNewsPanelNodeId] = useState(null);
  const [factorEdgeId, setFactorEdgeId] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [leftHidden, setLeftHidden] = useState(false);
  const [rightHidden, setRightHidden] = useState(false);
  const [bottomHidden, setBottomHidden] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const dragRef = useRef(null);
  const panRef = useRef(null);
  const [isPanning, setIsPanning] = useState(false);
  const [liveNewsAt, setLiveNewsAt] = useState(null);
  // idle | loading | ok | empty (fichier présent mais le pipeline n'a encore jamais tourné)
  //      | stale (une vérification a échoué, on garde les dernières news connues) | error
  const [liveNewsStatus, setLiveNewsStatus] = useState("idle");
  const liveNewsHasDataRef = useRef(false);
  const liveNewsCheckedRef = useRef(0);
  // { silent: true } = vérification en arrière-plan (pas de "Vérification…" dans la barre du haut).
  const refreshLiveNews = useCallback((opts) => {
    const silent = opts?.silent === true;
    liveNewsCheckedRef.current = Date.now();
    if (!silent) setLiveNewsStatus("loading");
    fetch(`/live-news.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (data && data.updatedAt) {
          setLiveNews(data);
          liveNewsHasDataRef.current = true;
          setLiveNewsAt(data.updatedAt);
          setLiveNewsStatus("ok");
        } else {
          setLiveNewsStatus(liveNewsHasDataRef.current ? "ok" : "empty");
        }
      })
      .catch(() => setLiveNewsStatus(liveNewsHasDataRef.current ? "stale" : "error"));
  }, []);
  // Le fichier n'est plus lu qu'une seule fois au chargement : un onglet laissé ouvert
  // reste à jour (re-vérification toutes les 10 min + au retour sur l'onglet), sans jamais
  // appeler d'API externe — on relit juste public/live-news.json de notre propre site.
  useEffect(() => {
    refreshLiveNews();
    const id = setInterval(() => refreshLiveNews({ silent: true }), 10 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - liveNewsCheckedRef.current > 2 * 60 * 1000) {
        refreshLiveNews({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [refreshLiveNews]);
  const serverRefresh = useServerNewsRefresh({ liveNewsAt, refreshLiveNews });

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage?.get("macromap-v2-state", false);
        if (res?.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.nodes) setNodes(parsed.nodes);
          if (parsed.edges) setEdges(parsed.edges);
          if (parsed.macroScore) setMacroScore(parsed.macroScore);
        }
      } catch (e) {} finally { setLoaded(true); }
    })();
  }, []);
  useDebouncedSave(loaded ? { nodes, edges, macroScore } : null, "macromap-v2-state");

  const focalId = breadcrumb[breadcrumb.length - 1];
  const focal = nodes[focalId];
  const minRank = COMPLEXITY.find((c) => c.id === complexity).min;

  // Current Relevance engine, applied to whatever is currently focal. Only produces
  // buckets when the focal node actually has incoming, currently-moving drivers
  // (e.g. Gold's factor breakdown) — elsewhere it's simply null and nothing changes.
  const focalBias = useMemo(() => computeBias(focalId, nodes, edges), [focalId, nodes, edges]);
  // bucketDrivers() -> classifyDriverRelevance() lit getNewsFor() (variable module-level), que React ne
  // "voit" pas : sans liveNewsAt dans les dépendances, le scoring restait figé sur les news
  // d'avant l'arrivée de live-news.json (typiquement : vide, car le fetch est asynchrone).
  const focalBuckets = useMemo(() => (focalBias ? bucketDrivers(focalBias.drivers) : null), [focalBias, liveNewsAt]);
  const structuralChildIds = useMemo(
    () => new Set((focalBuckets?.structural || []).map((f) => f.node.id)),
    [focalBuckets]
  );
  const roleByChildId = useMemo(() => {
    const map = {};
    if (focalBuckets) {
      focalBuckets.core.forEach((f) => (map[f.node.id] = ROLE_META.core));
      focalBuckets.secondary.forEach((f) => (map[f.node.id] = ROLE_META.secondary));
      focalBuckets.structural.forEach((f) => (map[f.node.id] = f.structuralRank >= 2 ? ROLE_META.structuralSupport : ROLE_META.background));
    }
    return map;
  }, [focalBuckets]);
  const [showStructuralNodes, setShowStructuralNodes] = useState(false);
  useEffect(() => { setShowStructuralNodes(false); }, [focalId]);

  const visibleChildren = useMemo(() => {
    if (!focal) return [];
    return (focal.childrenIds || [])
      .map((id) => nodes[id])
      .filter(Boolean)
      .filter((n) => IMPORTANCE_META[n.importance].rank >= minRank)
      .filter((n) => showStructuralNodes || !structuralChildIds.has(n.id));
  }, [focal, nodes, minRank, structuralChildIds, showStructuralNodes]);

  const visibleIds = useMemo(() => new Set([focalId, ...visibleChildren.map((n) => n.id)]), [focalId, visibleChildren]);

  const visibleEdges = useMemo(
    () => Object.values(edges).filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)),
    [edges, visibleIds]
  );

  const connectedIds = useMemo(() => {
    if (!focusMode || !selectedNodeId) return null;
    const ids = new Set([selectedNodeId]);
    Object.values(edges).forEach((e) => {
      if (e.from === selectedNodeId) ids.add(e.to);
      if (e.to === selectedNodeId) ids.add(e.from);
    });
    return ids;
  }, [focusMode, selectedNodeId, edges]);

  const isDimmed = useCallback(
    (node) => {
      if (connectedIds && node.id !== focalId && !connectedIds.has(node.id)) return true;
      if (marketFilter === "all") return false;
      if (node.id === focalId) return false;
      return !(node.markets || []).includes(marketFilter);
    },
    [marketFilter, focalId, connectedIds]
  );

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
      if (e.key === "Escape") { setPaletteOpen(false); if (fullscreen) setFullscreen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const regime = useMemo(() => {
    const restrictive = macroScore.fed === "hot" || macroScore.fed === "elevated";
    const slowing = macroScore.growth === "cooling";
    if (restrictive && slowing) return "Restrictive / Slowing";
    if (restrictive && !slowing) return "Restrictive / Resilient";
    if (!restrictive && slowing) return "Easing / Slowing";
    return "Easing / Stable";
  }, [macroScore]);

  const macroStory = useMemo(() => {
    const infl = STATUS_META[macroScore.inflation].label.toLowerCase();
    const gro = STATUS_META[macroScore.growth].label.toLowerCase();
    const fed = macroScore.fed === "hot" || macroScore.fed === "elevated" ? "cautious on easing" : "leaning accommodative";
    const usd = macroScore.usd === "improving" || macroScore.usd === "hot" ? "stable to firm" : "under pressure";
    return `Growth is ${gro} while inflation stays ${infl}. The Fed remains ${fed}, keeping real yields elevated. The dollar is ${usd}, while geopolitical uncertainty continues to support gold.`;
  }, [macroScore]);

  function driversInto(nodeId, limit = 3) {
    const strengthRank = { High: 3, Moderate: 2, Low: 1 };
    return Object.values(edges)
      .filter((e) => e.to === nodeId && nodes[e.from])
      .sort((a, b) => (strengthRank[b.strength] || 0) - (strengthRank[a.strength] || 0))
      .slice(0, limit)
      .map((e) => ({ edge: e, node: nodes[e.from] }));
  }
  function risksInto(nodeId, limit = 2) {
    // treat edges whose relation direction implies pressure on the node as a "risk" list from the opposite side
    return Object.values(edges)
      .filter((e) => e.to === nodeId && ["negative", "reduces", "contradicts"].includes(e.relation))
      .slice(0, limit)
      .map((e) => nodes[e.from]);
  }

  const marketBias = useMemo(() => {
    const out = {};
    MARKETS.forEach((m) => (out[m.id] = { score: 0, drivers: [] }));
    Object.values(nodes).forEach((n) => {
      (n.markets || []).forEach((mid) => {
        if (!out[mid]) return;
        const up = n.direction === "\u2191", down = n.direction === "\u2193";
        if (!up && !down) return;
        const override = SIGN_OVERRIDES[`${n.id}:${mid}`];
        const sign = (override !== undefined ? override : 1) * (up ? 1 : -1);
        out[mid].score += sign * (n.importance === "critical" ? 2 : 1);
        out[mid].drivers.push({ label: n.label, sign, nodeId: n.id });
      });
    });
    return out;
  }, [nodes]);
  const biasLabel = (s) => (s > 1 ? "Bullish \u2191" : s < -1 ? "Bearish \u2193" : "Neutral \u2192");
  const biasColor = (s) => (s > 1 ? COLORS.cooling : s < -1 ? COLORS.hot : COLORS.neutral);

  const calendarNodes = useMemo(
    () => Object.values(nodes).filter((n) => n.calendarDate).sort((a, b) => (a.calendarSort || 0) - (b.calendarSort || 0)),
    [nodes]
  );

  /* --------------------------- navigation actions --------------------------- */

  const drillInto = (id) => {
    if (!nodes[id]?.childrenIds?.length) { setSelectedNodeId(id); return; }
    setBreadcrumb((b) => [...b, id]);
    setSelectedNodeId(null); setSelectedEdgeId(null); setPan({ x: 0, y: 0 }); setZoom(0.85); setWhyOpen(false); setNewsPanelNodeId(null); setFactorEdgeId(null);
  };
  const jumpToCrumb = (idx) => { setBreadcrumb((b) => b.slice(0, idx + 1)); setSelectedNodeId(null); setSelectedEdgeId(null); setPan({ x: 0, y: 0 }); setZoom(0.85); setNewsPanelNodeId(null); setFactorEdgeId(null); };
  const goGlobal = () => jumpToCrumb(0);
  const goBack = () => { if (breadcrumb.length > 1) jumpToCrumb(breadcrumb.length - 2); };
  const focusOnNode = (id) => {
    if (!nodes[id]) return;
    const path = getPath(nodes, id);
    const container = path.length > 1 ? path[path.length - 2] : "global";
    const target = nodes[id].childrenIds?.length ? id : container;
    setBreadcrumb(getPath(nodes, target));
    setSelectedNodeId(id); setSelectedEdgeId(null); setTab("mindmap"); setNewsPanelNodeId(null); setFactorEdgeId(null);
    setPan({ x: 0, y: 0 }); setZoom(0.85);
  };

  const runSearch = () => {
    if (!search.trim()) return;
    const q = search.trim().toLowerCase();
    const match = Object.values(nodes).find((n) => n.label.toLowerCase().includes(q));
    if (match) focusOnNode(match.id);
  };

  /* ----------------------------- editing actions ----------------------------- */

  const updateNode = (id, patch) => setNodes((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const updateEdge = (id, patch) => setEdges((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const deleteNode = (id) => {
    if (id === "global") return;
    const toRemove = new Set();
    const collect = (nid) => { toRemove.add(nid); (nodes[nid]?.childrenIds || []).forEach(collect); };
    collect(id);
    setNodes((prev) => { const next = { ...prev }; toRemove.forEach((r) => delete next[r]); Object.values(next).forEach((n) => { n.childrenIds = (n.childrenIds || []).filter((c) => !toRemove.has(c)); }); return next; });
    setEdges((prev) => { const next = {}; Object.values(prev).forEach((e) => { if (!toRemove.has(e.from) && !toRemove.has(e.to)) next[e.id] = e; }); return next; });
    if (toRemove.has(focalId)) setBreadcrumb((b) => { const kept = b.filter((bid) => !toRemove.has(bid)); return kept.length ? kept : ["global"]; });
    setSelectedNodeId(null);
  };

  const addNode = ({ label, parent, importance, status, direction }) => {
    const id = `n-${Date.now()}`;
    setNodes((prev) => {
      const next = { ...prev, [id]: { ...N(id, parent, label, { importance, status, direction, source: "Saisie manuelle" }), childrenIds: [] } };
      next[parent] = { ...next[parent], childrenIds: [...(next[parent].childrenIds || []), id] };
      return next;
    });
    setSelectedNodeId(id);
  };

  const addEdge = (from, to, relation) => {
    if (from === to) return;
    const id = `${from}__${to}__${Date.now()}`;
    setEdges((prev) => ({ ...prev, [id]: E(from, to, relation) }));
  };
  const removeEdge = (id) => setEdges((prev) => { const next = { ...prev }; delete next[id]; return next; });

  const addEvidence = (targetType, targetId, item) => {
    if (targetType === "node") updateNode(targetId, { evidence: [...(nodes[targetId].evidence || []), item] });
    else updateEdge(targetId, { evidence: [...(edges[targetId].evidence || []), item] });
  };

  /* -------------------------------- dragging -------------------------------- */

  const onNodePointerDown = (e, id) => {
    e.stopPropagation();
    if (connectMode) {
      if (!pendingSource) setPendingSource(id);
      else if (pendingSource !== id) setPicker({ from: pendingSource, targetId: id, screenX: e.clientX, screenY: e.clientY });
      return;
    }
    setSelectedNodeId(id); setSelectedEdgeId(null); setNewsPanelNodeId(null); setFactorEdgeId(null);
  };
  const onNodeDoubleClick = (id) => { if (!connectMode) drillInto(id); };

  const onBgPointerDown = (e) => { panRef.current = { startX: e.clientX, startY: e.clientY, ox: pan.x, oy: pan.y }; setPicker(null); setIsPanning(true); };
  useEffect(() => {
    const onMove = (e) => { if (panRef.current) { const { startX, startY, ox, oy } = panRef.current; setPan({ x: ox + (e.clientX - startX), y: oy + (e.clientY - startY) }); } };
    const onUp = () => { panRef.current = null; setIsPanning(false); };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  const onWheel = (e) => { e.preventDefault(); setZoom((z) => Math.min(2.2, Math.max(0.35, z - e.deltaY * 0.0012))); };
  const resetView = () => { setPan({ x: 0, y: 0 }); setZoom(0.85); };

  /* ---------------------------------- AI ------------------------------------ */

  const askAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const question = aiInput.trim();
    setAiMessages((m) => [...m, { role: "user", text: question }]);
    setAiInput(""); setAiLoading(true);
    try {
      const crumbLabels = breadcrumb.map((id) => nodes[id]?.label).join(" > ");
      const childCtx = visibleChildren.map((n) => `${n.label}: ${n.value} (${STATUS_META[n.status]?.label}, ${n.direction})`).join("\n");
      const edgeCtx = visibleEdges.map((e) => `${nodes[e.from]?.label} \u2014 ${RELATION_META[e.relation]?.label} \u2192 ${nodes[e.to]?.label}${e.confidence ? ` (confidence ${e.confidence}%)` : ""}`).join("\n");
      const sys = `You are the reasoning layer inside MacroMap. Answer using ONLY the mapped data below \u2014 a manually-curated real-market snapshot as of Sep 11, 2026, not a live feed. Be concise (3-6 sentences), reference specific nodes, and never present your read as certain \u2014 flag it as one interpretation of the mapped data, and note that figures may have moved since the snapshot date.\n\nGLOBAL REGIME: ${regime}\nCURRENT VIEW: ${crumbLabels}\n\nVISIBLE NODES:\n${childCtx}\n\nVISIBLE RELATIONSHIPS:\n${edgeCtx}`;
      const response = await fetch("/api/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: sys, messages: [{ role: "user", content: question }] }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n") || "No response.";
      setAiMessages((m) => [...m, { role: "ai", text }]);
    } catch (err) {
      setAiMessages((m) => [...m, { role: "ai", text: "Couldn't reach the reasoning layer just now. Try again in a moment." }]);
    } finally { setAiLoading(false); }
  };

  /* ---------------------------------- UI ------------------------------------ */

  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : null;
  const selectedEdge = selectedEdgeId ? edges[selectedEdgeId] : null;

  return (
    <div className="w-full h-full flex flex-col" style={{ background: "#0A0C10", color: "#E8EAED", fontFamily: "Inter, -apple-system, Segoe UI, sans-serif", minHeight: 680 }}>
      <style>{`
        .mm-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
        .mm-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .mm-scroll::-webkit-scrollbar-thumb { background: #232935; border-radius: 4px; }
        .mm-card { background: #12151C; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }
        .mm-glass { background: rgba(15,18,24,0.72); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.07); }
        .mm-btn { transition: background .15s ease, border-color .15s ease, color .15s ease, transform .15s ease; }
        .mm-btn:active { transform: scale(0.97); }
        .mm-node { transition: filter .18s ease, opacity .25s ease; }
        .mm-node:hover { filter: brightness(1.14); }
        .mm-node:hover .mm-node-pop { transform: scale(1.045); }
        .mm-node-sel { filter: drop-shadow(0 0 10px rgba(201,162,75,0.35)); }
        .mm-node-pop { transform-box: fill-box; transform-origin: center; animation: mm-pop-in .42s cubic-bezier(.34,1.56,.64,1) both; transition: transform .15s ease; }
        @keyframes mm-pop-in { from { opacity: 0; transform: scale(.72) translateY(4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .mm-pulse { animation: mm-pulse-ring 2.4s ease-out infinite; transform-box: fill-box; transform-origin: center; }
        @keyframes mm-pulse-ring { 0% { opacity: .55; transform: scale(0.92); } 70% { opacity: 0; transform: scale(1.5); } 100% { opacity: 0; transform: scale(1.5); } }
        .mm-rings { animation: mm-rotate 90s linear infinite; transform-box: fill-box; transform-origin: center; }
        @keyframes mm-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .mm-canvas-bg { background-color: #0B0E13; background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.045) 1px, transparent 0); background-size: 28px 28px; }
        .mm-flow { stroke-dasharray: 5 7; animation: mm-dash 2.6s linear infinite; }
        @keyframes mm-dash { to { stroke-dashoffset: -48; } }
        .mm-fade-in { animation: mm-fade .15s ease; }
        @keyframes mm-fade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
        .market-pill { transition: transform .18s cubic-bezier(.34,1.56,.64,1), background .18s ease, border-color .18s ease, box-shadow .18s ease; white-space: nowrap; }
        .market-pill:hover { transform: translateY(-1.5px) scale(1.035); }
        .market-pill:active { transform: scale(0.97); }
        .market-pill-dot { animation: mm-glow-breathe 2.6s ease-in-out infinite; }
        @keyframes mm-glow-breathe { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
        .mm-structural-btn { animation: mm-pop-in .35s cubic-bezier(.34,1.56,.64,1) both; }
        .mm-scene { transition: transform .45s cubic-bezier(0.16, 1, 0.3, 1); }
        .mm-scene-dragging { transition: none; }
        .mm-spin { animation: mm-rotate 1s linear infinite; }
      `}</style>

      <TopBar regime={regime} traderMode={traderMode} setTraderMode={setTraderMode}
        onOpenPalette={() => setPaletteOpen(true)} liveNewsAt={liveNewsAt} liveNewsStatus={liveNewsStatus} onRefreshLiveNews={refreshLiveNews} serverRefresh={serverRefresh} />

      {traderMode ? (
        <TraderModeOverlay
          regime={regime} macroScore={macroScore} marketBias={marketBias} biasLabel={biasLabel} biasColor={biasColor}
          traderMarket={traderMarket} setTraderMarket={setTraderMarket} driversInto={driversInto} risksInto={risksInto}
          nodes={nodes} calendarNodes={calendarNodes} onExit={() => setTraderMode(false)}
        />
      ) : (
        <div className="flex flex-1 min-h-0">
          {!leftHidden && !fullscreen && (
            <Sidebar tab={tab} setTab={setTab} marketFilter={marketFilter} setMarketFilter={setMarketFilter}
              connectMode={connectMode} setConnectMode={setConnectMode} setAddingNode={setAddingNode} goGlobal={goGlobal}
              onCollapse={() => setLeftHidden(true)} focusOnNode={focusOnNode} marketBias={marketBias} biasColor={biasColor} />
          )}

          <div className="flex-1 min-w-0 flex flex-col relative">
            {(leftHidden || fullscreen) && (
              <button onClick={() => { setLeftHidden(false); setFullscreen(false); }} className="mm-btn absolute top-3 left-3 z-20 w-7 h-7 rounded-md flex items-center justify-center mm-glass" style={{ color: "#8A93A3" }} title={T.nav.showSidebar}>
                <ChevronRight size={13} />
              </button>
            )}
            {tab === "overview" && (
              <OverviewView macroScore={macroScore} setMacroScore={setMacroScore} regime={regime} macroStory={macroStory}
                aiMessages={aiMessages} aiInput={aiInput} setAiInput={setAiInput} aiLoading={aiLoading} askAI={askAI}
                marketBias={marketBias} biasColor={biasColor} biasLabel={biasLabel} nodes={nodes} focusOnNode={focusOnNode}
                calendarNodes={calendarNodes} setTab={setTab} />
            )}

            {tab === "mindmap" && (
              <div className="flex flex-1 min-h-0">
                <div className="flex-1 min-w-0 flex flex-col">
                  {!fullscreen && <Breadcrumb breadcrumb={breadcrumb} nodes={nodes} jumpToCrumb={jumpToCrumb} goGlobal={goGlobal} goBack={goBack} />}
                  {!fullscreen && (
                    <FilterBar marketFilter={marketFilter} setMarketFilter={setMarketFilter} complexity={complexity} setComplexity={setComplexity}
                      connectMode={connectMode} setConnectMode={setConnectMode} pendingSource={pendingSource} setPendingSource={setPendingSource}
                      focusMode={focusMode} setFocusMode={setFocusMode} rightHidden={rightHidden} setRightHidden={setRightHidden}
                      fullscreen={fullscreen} setFullscreen={setFullscreen} showEvidence={showEvidence} setShowEvidence={setShowEvidence}
                      marketBias={marketBias} biasColor={biasColor} focusOnNode={focusOnNode} />
                  )}
                  <HierCanvas
                    focal={focal} visibleChildren={visibleChildren} visibleEdges={visibleEdges} isDimmed={isDimmed}
                    selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} focusMode={focusMode} showEvidence={showEvidence}
                    pan={pan} zoom={zoom} onNodePointerDown={onNodePointerDown} onNodeDoubleClick={onNodeDoubleClick}
                    onEdgeClick={(id) => { setSelectedEdgeId(id); setSelectedNodeId(null); setNewsPanelNodeId(null); setFactorEdgeId(null); }}
                    onNewsClick={(id) => { setNewsPanelNodeId(id); setSelectedEdgeId(null); setFactorEdgeId(null); }}
                    onBgPointerDown={onBgPointerDown} onWheel={onWheel} setZoom={setZoom} resetView={resetView}
                    isPanning={isPanning}
                    connectMode={connectMode} pendingSource={pendingSource} picker={picker} setPicker={setPicker}
                    addEdge={addEdge} setPendingSource={setPendingSource}
                    driversInto={driversInto} whyOpen={whyOpen} setWhyOpen={setWhyOpen} focusOnNode={focusOnNode}
                    fullscreen={fullscreen} onExitFullscreen={() => setFullscreen(false)}
                    roleByChildId={roleByChildId} structuralCount={structuralChildIds.size}
                    showStructuralNodes={showStructuralNodes} setShowStructuralNodes={setShowStructuralNodes}
                  />
                </div>
                {!rightHidden && !fullscreen && (addingNode ? (
                  <AddNodeForm nodes={nodes} defaultParent={focalId} onCancel={() => setAddingNode(false)} onSubmit={(v) => { addNode(v); setAddingNode(false); }} />
                ) : factorEdgeId && edges[factorEdgeId] ? (
                  <FactorDetailPanel edge={edges[factorEdgeId]} nodes={nodes} onClose={() => setFactorEdgeId(null)} focusOnNode={focusOnNode} />
                ) : newsPanelNodeId ? (
                  <NewsPanel node={nodes[newsPanelNodeId]} {...getDisplayNewsForNode(nodes[newsPanelNodeId], nodes)} onClose={() => setNewsPanelNodeId(null)} />
                ) : selectedEdge ? (
                  <EdgePanel edge={selectedEdge} nodes={nodes} updateEdge={updateEdge} removeEdge={removeEdge}
                    addEvidence={addEvidence} onClose={() => setSelectedEdgeId(null)} focusOnNode={focusOnNode} />
                ) : (
                  <NodePanel node={selectedNode} nodes={nodes} edges={edges} updateNode={updateNode} deleteNode={deleteNode}
                    addEvidence={addEvidence} drillInto={drillInto} driversInto={driversInto} focusOnNode={focusOnNode}
                    onOpenNews={(id) => setNewsPanelNodeId(id)} onOpenFactor={(edgeId) => setFactorEdgeId(edgeId)} />
                ))}
              </div>
            )}

            {tab === "calendar" && <CalendarView events={calendarNodes} focusOnNode={focusOnNode} nodes={nodes} />}
            {tab === "scenarios" && <ScenariosView scenarios={SCENARIOS} />}
            {tab === "market" && <MarketImpactView marketBias={marketBias} biasLabel={biasLabel} biasColor={biasColor} marketFilter={marketFilter} setMarketFilter={setMarketFilter} focusOnNode={focusOnNode} nodes={nodes} edges={edges} />}
          </div>
        </div>
      )}

      {!fullscreen && !bottomHidden && !traderMode && <BottomBar macroStory={macroStory} onHide={() => setBottomHidden(true)} />}
      {bottomHidden && !fullscreen && !traderMode && (
        <button onClick={() => setBottomHidden(false)} className="mm-btn text-[10.5px] py-1 text-center" style={{ color: "#3A4252", background: "#0D1117" }}>Show macro story</button>
      )}

      <RefreshToast state={serverRefresh} onClose={serverRefresh.reset} />

      {paletteOpen && (
        <CommandPalette
          nodes={nodes} onClose={() => setPaletteOpen(false)}
          actions={[
            { label: T.nav.globalView, run: goGlobal },
            { label: "Focus mode: " + (focusMode ? "turn off" : "turn on"), run: () => setFocusMode((f) => !f) },
            { label: T.nav.traderMode, run: () => setTraderMode(true) },
            { label: T.nav.fullscreen + " — " + T.nav.mindmap, run: () => { setTab("mindmap"); setFullscreen(true); } },
            { label: "Economic calendar", run: () => setTab("calendar") },
            { label: "Scenarios", run: () => setTab("scenarios") },
            { label: "Market impact", run: () => setTab("market") },
            { label: T.nav.addNode, run: () => { setTab("mindmap"); setAddingNode(true); } },
            { label: T.nav.addRelationship, run: () => { setTab("mindmap"); setConnectMode(true); } },
          ]}
          onGoToNode={focusOnNode}
        />
      )}
    </div>
  );
}

/* ------------------------------ subcomponents ---------------------------- */

function relativeTimeFr(iso) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 2) return "\u00e0 l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.round(hours / 24);
  return `il y a ${days}j`;
}

function TopBar({ regime, traderMode, setTraderMode, onOpenPalette, liveNewsAt, liveNewsStatus, onRefreshLiveNews, serverRefresh }) {
  // Re-rend juste ce composant chaque minute pour que "il y a Xh" avance sans recharger la page.
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 60000); return () => clearInterval(id); }, []);
  const sr = serverRefresh || { phase: "idle" };
  const srBusy = sr.phase === "starting" || sr.phase === "running" || sr.phase === "deploying";
  const srLabel = { idle: "Actualiser", starting: "Lancement\u2026", running: "Récupération\u2026", deploying: "Mise en ligne\u2026", done: "À jour \u2713", error: "Réessayer" }[sr.phase] || "Actualiser";
  const rel = relativeTimeFr(liveNewsAt);
  const ageH = liveNewsAt ? (Date.now() - new Date(liveNewsAt).getTime()) / 3600000 : null;
  // Le cron tourne toutes les 3h : au-delà de 8h sans mise à jour, le pipeline est probablement en échec.
  const late = ageH != null && ageH > 8;
  let newsLabel = "News en direct indisponibles";
  let newsColor = "#7B8496";
  let newsTip = "Les actualités en direct sont rafraîchies automatiquement toutes les ~3h par une tâche GitHub \u2014 clique pour forcer une vérification côté navigateur.";
  if (liveNewsStatus === "loading") {
    newsLabel = "Vérification\u2026";
  } else if (rel) {
    newsLabel = `News en direct \u00b7 ${rel}${liveNewsStatus === "stale" ? " (connexion ?)" : ""}`;
    newsColor = late || liveNewsStatus === "stale" ? "#E6C260" : "#4CC38A";
    if (late) newsTip = "Dernière actualisation il y a plus de 8h : la tâche GitHub Actions semble en échec ou en retard \u2014 vérifie l'onglet Actions du repo.";
    if (liveNewsStatus === "stale") newsTip = "La dernière vérification a échoué (réseau ?) : on affiche les dernières news connues.";
  } else if (liveNewsStatus === "empty") {
    newsLabel = "En attente de la 1re actualisation";
    newsTip = "live-news.json est encore vide : lance « Refresh live news » depuis l'onglet Actions de ton repo GitHub (voir README).";
  }
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b gap-4" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0C0F14" }}>
      <div className="flex items-center gap-3 shrink-0">
        <GitBranch size={18} color="#C9A24B" />
        <span className="font-semibold tracking-tight text-[15px]">MacroMap</span>
        <span className="mm-mono text-xs px-2 py-1 rounded" style={{ background: "rgba(201,162,75,0.12)", color: "#C9A24B" }}>{regime}</span>
        <span className="mm-mono text-[10px] px-2 py-1 rounded hidden md:inline-block" style={{ background: "rgba(255,255,255,0.05)", color: "#7B8496" }} title="Donn\u00e9es de march\u00e9 et macro\u00e9conomiques : instantan\u00e9 manuel, pas un flux en direct.">
          Instantan\u00e9 du 11 sept. 2026
        </span>
        <button
          onClick={() => onRefreshLiveNews()}
          disabled={liveNewsStatus === "loading"}
          className="mm-btn mm-mono text-[10px] px-2 py-1 rounded hidden lg:flex items-center gap-1.5"
          style={{ background: "rgba(76,195,138,0.1)", color: newsColor }}
          title={newsTip}
        >
          <span className="mm-dot-live" style={{ width: 5, height: 5, borderRadius: "50%", background: rel ? newsColor : "#545D6E" }} />
          {newsLabel}
        </button>
        <button
          onClick={() => serverRefresh && serverRefresh.start()}
          disabled={srBusy}
          className="mm-btn mm-mono text-[10px] px-2 py-1 rounded flex items-center gap-1.5"
          style={{ background: "rgba(201,162,75,0.12)", color: sr.phase === "error" ? "#E5626A" : "#C9A24B", opacity: srBusy ? 0.85 : 1 }}
          title="Actualiser les news maintenant. Utilise le quota gratuit Alpha Vantage : le nombre d'actualisations manuelles par jour est limité."
        >
          <RefreshCw size={11} className={srBusy ? "mm-spin" : ""} />
          {srLabel}
        </button>
      </div>
      <button onClick={onOpenPalette} className="mm-btn flex-1 max-w-xs relative text-left">
        <Search size={13} style={{ position: "absolute", left: 10, top: 9 }} color="#545D6E" />
        <span className="w-full block text-xs rounded-md pl-7 pr-2 py-1.5" style={{ background: "#11151C", border: "1px solid rgba(255,255,255,0.07)", color: "#545D6E" }}>
          {T.nav.searchPlaceholder}
        </span>
        <span className="mm-mono text-[10px] px-1.5 py-0.5 rounded" style={{ position: "absolute", right: 6, top: 6, background: "#1B212C", color: "#545D6E" }}>\u2318K</span>
      </button>
      <div className="flex items-center gap-2 text-xs mm-mono shrink-0" style={{ color: "#7B8496" }}>
        <span className="mr-1">{T.nav.marketMood}\u00a0: <span style={{ color: "#E6C260" }}>{T.nav.neutral}</span></span>
        <button onClick={() => setTraderMode(!traderMode)} className="mm-btn px-3 py-1.5 rounded-md text-xs font-medium"
          style={{ background: traderMode ? "#C9A24B" : "transparent", color: traderMode ? "#0A0D12" : "#C9A24B", border: "1px solid #C9A24B" }}>
          {traderMode ? T.nav.exitTraderMode : T.nav.traderMode}
        </button>
      </div>
    </div>
  );
}

function Sidebar({ tab, setTab, marketFilter, setMarketFilter, connectMode, setConnectMode, setAddingNode, goGlobal, onCollapse, focusOnNode, marketBias, biasColor }) {
  const macroItems = [
    { id: "overview", label: T.nav.overview, icon: LayoutGrid }, { id: "mindmap", label: T.nav.mindmap, icon: GitBranch },
    { id: "calendar", label: T.nav.calendar, icon: CalendarIcon }, { id: "scenarios", label: T.nav.scenarios, icon: Target },
    { id: "market", label: T.nav.market, icon: Radio },
  ];
  return (
    <div className="w-52 shrink-0 border-r flex flex-col py-4 mm-scroll overflow-y-auto" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0A0D12" }}>
      <div className="px-4 mb-3 flex items-center justify-between">
        <span className="text-[10px] tracking-wide" style={{ color: "#3A4252" }}>{T.nav.navigate}</span>
        <button onClick={onCollapse} className="mm-btn" title={T.nav.hideSidebar}><ChevronRight size={13} color="#3A4252" style={{ transform: "rotate(180deg)" }} /></button>
      </div>
      <SidebarSection title="Macro">
        {macroItems.map((it) => <SidebarButton key={it.id} active={tab === it.id} icon={it.icon} label={it.label} onClick={() => { setTab(it.id); if (it.id === "mindmap") goGlobal(); }} />)}
      </SidebarSection>
      <SidebarSection title={T.nav.markets}>
        {MARKETS.map((m) => {
          const accent = MARKET_ACCENT[m.id];
          const active = marketFilter === m.id;
          const bias = marketBias?.[m.id];
          const dotColor = bias ? biasColor(bias.score) : accent;
          return (
            <button key={m.id} onClick={() => { setMarketFilter(m.id); const nid = MARKET_NODE_MAP[m.id]; if (nid) focusOnNode(nid); else setTab("market"); }}
              className="mm-btn w-full text-left px-4 py-1.5 text-[13px] flex items-center gap-2"
              style={{ color: active ? accent : "#B7BFCC", background: active ? `${accent}18` : "transparent", borderLeft: active ? `2px solid ${accent}` : "2px solid transparent" }}>
              <span>{m.emoji}</span><span className="flex-1 truncate">{m.label}</span>
              <span className="mm-dot-live" style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, boxShadow: `0 0 4px ${dotColor}`, flexShrink: 0 }} />
            </button>
          );
        })}
      </SidebarSection>
      <SidebarSection title={T.nav.tools}>
        <button onClick={() => setAddingNode(true)} className="mm-btn w-full text-left px-4 py-1.5 text-[13px] flex items-center gap-2" style={{ color: "#B7BFCC" }}><Plus size={14} /> {T.nav.addNode}</button>
        <button onClick={() => setConnectMode(!connectMode)} className="mm-btn w-full text-left px-4 py-1.5 text-[13px] flex items-center gap-2" style={{ color: connectMode ? "#C9A24B" : "#B7BFCC", background: connectMode ? "rgba(201,162,75,0.08)" : "transparent" }}><Link2 size={14} /> {connectMode ? T.nav.connecting : T.nav.addRelationship}</button>
      </SidebarSection>
    </div>
  );
}
function SidebarSection({ title, children }) {
  return <div className="mb-5"><div className="px-4 mb-1.5 text-[11px] font-medium" style={{ color: "#545D6E" }}>{title}</div><div className="flex flex-col">{children}</div></div>;
}
function SidebarButton({ active, icon: Icon, label, onClick }) {
  return <button onClick={onClick} className="w-full text-left px-4 py-1.5 text-[13px] flex items-center gap-2.5" style={{ color: active ? "#E7EAEE" : "#8A93A3", background: active ? "rgba(255,255,255,0.045)" : "transparent", borderLeft: active ? "2px solid #C9A24B" : "2px solid transparent" }}><Icon size={14} /> {label}</button>;
}

function Breadcrumb({ breadcrumb, nodes, jumpToCrumb, goGlobal, goBack }) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0A0D12" }}>
      <button onClick={goGlobal} className="mm-btn flex items-center gap-1 text-[12px] px-2 py-1 rounded" style={{ color: "#C9A24B", border: "1px solid rgba(201,162,75,0.3)" }}><Home size={12} /> {T.nav.globalView}</button>
      {breadcrumb.length > 1 && <button onClick={goBack} className="mm-btn text-[12px] px-2 py-1 rounded" style={{ color: "#8A93A3", border: "1px solid rgba(255,255,255,0.08)" }}>\u2190 {nodes[breadcrumb[breadcrumb.length - 2]]?.label}</button>}
      <div className="flex items-center gap-1 ml-2 text-[12.5px] flex-wrap">
        {breadcrumb.map((id, i) => (
          <span key={id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} color="#3A4252" />}
            <button onClick={() => jumpToCrumb(i)} className="mm-btn" style={{ color: i === breadcrumb.length - 1 ? "#E7EAEE" : "#8A93A3", fontWeight: i === breadcrumb.length - 1 ? 600 : 400 }}>{nodes[id]?.label}</button>
          </span>
        ))}
      </div>
    </div>
  );
}

function FilterBar({ marketFilter, setMarketFilter, complexity, setComplexity, connectMode, setConnectMode, pendingSource, setPendingSource, focusMode, setFocusMode, rightHidden, setRightHidden, fullscreen, setFullscreen, showEvidence, setShowEvidence, marketBias, biasColor, focusOnNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b flex-wrap relative" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0A0D12" }}>
      <div className="flex items-center gap-1.5 mm-scroll overflow-x-auto pb-0.5" style={{ maxWidth: "100%" }}>
        <button onClick={() => setMarketFilter("all")} className="mm-pill text-[11.5px] px-2.5 py-1 rounded-full font-medium shrink-0"
          style={{ background: marketFilter === "all" ? "rgba(255,255,255,0.1)" : "transparent", color: marketFilter === "all" ? "#E7EAEE" : "#7B8496", border: "1px solid rgba(255,255,255,0.1)" }}>
          Tous
        </button>
        {MARKETS.map((m) => {
          const accent = MARKET_ACCENT[m.id];
          const active = marketFilter === m.id;
          const bias = marketBias?.[m.id];
          const dotColor = bias ? biasColor(bias.score) : accent;
          return (
            <button key={m.id} onClick={() => { setMarketFilter(m.id); const nid = MARKET_NODE_MAP[m.id]; if (nid && focusOnNode) focusOnNode(nid); }}
              className="mm-pill text-[11.5px] px-2.5 py-1 rounded-full font-medium shrink-0 flex items-center gap-1.5"
              style={{
                background: active ? `${accent}22` : "transparent",
                color: active ? accent : "#8A93A3",
                border: `1px solid ${active ? accent + "80" : "rgba(255,255,255,0.09)"}`,
                boxShadow: active ? `0 0 12px ${accent}30` : "none",
              }}>
              <span>{m.emoji}</span>
              <span>{m.label}</span>
              <span className="mm-dot-live" style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, boxShadow: `0 0 5px ${dotColor}` }} />
            </button>
          );
        })}
      </div>
      <div className="flex items-center rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        {COMPLEXITY.map((c) => (
          <button key={c.id} onClick={() => setComplexity(c.id)} className="mm-btn text-[11px] px-2.5 py-1"
            style={{ background: complexity === c.id ? "#C9A24B" : "#11151C", color: complexity === c.id ? "#0A0D12" : "#8A93A3" }}>{c.label}</button>
        ))}
      </div>
      {focusMode && (
        <span className="text-[10.5px] mm-mono px-2 py-1 rounded" style={{ color: "#C9A24B", background: "rgba(201,162,75,0.1)" }}>{T.nav.focusOn}</span>
      )}
      {connectMode && (
        <span className="text-xs mm-mono px-2 py-1 rounded flex items-center gap-2" style={{ background: "rgba(201,162,75,0.1)", color: "#C9A24B" }}>
          {pendingSource ? "S\u00e9lectionnez un n\u0153ud cible\u2026" : "S\u00e9lectionnez un n\u0153ud source\u2026"}
          <button onClick={() => { setConnectMode(false); setPendingSource(null); }} className="mm-btn"><X size={12} /></button>
        </span>
      )}
      <div className="ml-auto relative">
        <button onClick={() => setMoreOpen(!moreOpen)} className="mm-btn text-[11px] px-2.5 py-1 rounded-md" style={{ color: "#8A93A3", border: "1px solid rgba(255,255,255,0.08)" }}>\u22EF</button>
        {moreOpen && (
          <div className="mm-card mm-glass mm-fade-in absolute right-0 top-9 z-20 p-1.5 w-52 flex flex-col gap-0.5">
            <button onClick={() => { setFocusMode(!focusMode); setMoreOpen(false); }} className="mm-btn text-left text-[12px] px-2.5 py-1.5 rounded" style={{ color: focusMode ? "#C9A24B" : "#B7BFCC" }}>{focusMode ? T.nav.focusOn : T.nav.focus}</button>
            <button onClick={() => { setShowEvidence(!showEvidence); setMoreOpen(false); }} className="mm-btn text-left text-[12px] px-2.5 py-1.5 rounded" style={{ color: showEvidence ? "#4CC38A" : "#B7BFCC" }}>{showEvidence ? T.nav.showEvidenceOn : T.nav.showEvidence}</button>
            <button onClick={() => { setRightHidden(!rightHidden); setMoreOpen(false); }} className="mm-btn text-left text-[12px] px-2.5 py-1.5 rounded" style={{ color: "#B7BFCC" }}>{rightHidden ? T.nav.showPanel : T.nav.hidePanel}</button>
            <button onClick={() => { setFullscreen(true); setMoreOpen(false); }} className="mm-btn text-left text-[12px] px-2.5 py-1.5 rounded" style={{ color: "#B7BFCC" }}>{T.nav.fullscreen}</button>
          </div>
        )}
      </div>
      <span className="w-full text-[10.5px] mt-1" style={{ color: "#3A4252" }}>{T.mindmap.doubleClickHint}</span>
    </div>
  );
}

function nodeSize(kind, importance) {
  if (kind === "focal") return { w: 200, h: 84 };
  const rank = IMPORTANCE_META[importance]?.rank ?? 1;
  if (rank >= 3) return { w: 150, h: 66 };
  if (rank >= 2) return { w: 138, h: 60 };
  if (rank >= 1) return { w: 126, h: 54 };
  return { w: 114, h: 48 };
}

function evidenceTier(edge) {
  if (edge.confidence == null) return { color: "#8A93A3", label: "Preuves limit\u00e9es", emoji: "\u26AA" };
  if (edge.confidence >= 75) return { color: COLORS.cooling, label: "Preuves solides", emoji: "\u{1F7E2}" };
  if (edge.confidence >= 55) return { color: COLORS.neutral, label: "Preuves mod\u00e9r\u00e9es", emoji: "\u{1F7E1}" };
  return { color: "#8A93A3", label: "Preuves limit\u00e9es", emoji: "\u26AA" };
}

/* ============================ Fond "galaxie" (étoiles + nébuleuse) ============================
   Purement décoratif : aucune donnée, aucun calcul métier. Deux <canvas> dessinés derrière la carte (voir
   GalaxyBackground plus bas) : une nébuleuse (nuages froids indigo / violet / rose + filaments à la couleur
   du marché) et un champ d'étoiles réparti sur tout l'écran en 3 profondeurs (parallaxe quand on déplace la
   carte, scintillement, étoile filante occasionnelle). Une zone plus calme est ménagée autour du nœud focal
   et des facteurs pour qu'ils se détachent du fond. La teinte suit MARKET_ACCENT.
   Le bloc GALAXY:START…GALAXY:END ne dépend de rien d'autre dans le fichier : déterministe (graine fixe),
   testable hors navigateur. */
/* GALAXY:START */
// Champ d'étoiles en 3 profondeurs (parallaxe) + nébuleuse à 2 couches. La nébuleuse est générée UNE fois
// par bruit fractal sur une petite texture, puis simplement agrandie à chaque image : très léger pour le CPU.
const GALAXY = { NEB_W: 448, NEB_H: 291, FAR: 1000, MID: 480, NEAR: 100 };

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return Number.isNaN(n) ? [201, 162, 75] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const gMix = (a, b, k) => a + (b - a) * k;
function gSmooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Bruit de valeur lissé + fbm (somme d'octaves) : la base des nuages de la nébuleuse.
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(256 * 256);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
    const a = grid[y0 | x0], b = grid[y0 | x1], c = grid[y1 | x0], d = grid[y1 | x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbm(noise, x, y, oct) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * noise(x * f, y * f); norm += amp; f *= 2.03; amp *= 0.5; }
  return sum / norm;
}
// mode "cloud" : nuages doux ; mode "ridge" : filaments / volutes fines. Le bruit est "déformé" par lui-même
// (domain warping), ce qui donne l'aspect de gaz étiré plutôt que de simples taches.
function makeField(seed, W, H, scale, mode, lo, hi, rot = 0.6) {
  const noise = makeNoise(seed);
  const out = new Float32Array(W * H);
  const ca = Math.cos(rot), sa = Math.sin(rot);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / W;
      const px = (u * ca - v * sa) * scale, py = (u * sa + v * ca) * scale;
      const q = fbm(noise, px + 7.7, py + 3.1, 3);
      const n = fbm(noise, px + 2.0 * q, py - 2.0 * q + 11.3, 5);
      out[y * W + x] = mode === "ridge"
        ? Math.pow(gSmooth(lo, hi, 1 - Math.abs(2 * n - 1)), 1.2)
        : Math.pow(gSmooth(lo, hi, n), 1.3);
    }
  }
  return out;
}

function buildGalaxy(seed = 1789767) {
  const rnd = mulberry32(seed);
  const layer = (n, sMin, sMax, aMin, aMax, twFrac, brightFrac) => {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const k = rnd();
      const bright = rnd() < brightFrac;
      arr.push({
        nx: rnd(), ny: rnd(),
        size: sMin + rnd() * (sMax - sMin) * (bright ? 1.5 : 1),
        a: aMin + rnd() * (aMax - aMin),
        tw: rnd() < twFrac ? 0.6 + rnd() * 1.8 : 0, // vitesse de scintillement (0 = fixe)
        ph: rnd() * Math.PI * 2,
        ci: k < 0.6 ? 0 : k < 0.85 ? 1 : 2, // 0 blanc-bleuté, 1 chaud, 2 teinté par l'accent
        bright, spike: bright && rnd() < 0.25,
      });
    }
    return arr;
  };
  const AREA_MAX = 2.2; // on génère de quoi remplir un grand écran ; on n'en dessine qu'une partie selon la surface
  const { NEB_W: W, NEB_H: H } = GALAXY;
  return {
    layers: [
      { stars: layer(Math.round(GALAXY.FAR * AREA_MAX), 0.5, 0.95, 0.24, 0.62, 0.3, 0), par: 0.04, drift: 0.7 },
      { stars: layer(Math.round(GALAXY.MID * AREA_MAX), 0.7, 1.25, 0.36, 0.82, 0.35, 0), par: 0.1, drift: 1.4 },
      { stars: layer(Math.round(GALAXY.NEAR * AREA_MAX), 0.9, 1.5, 0.5, 0.95, 0.5, 0.42), par: 0.22, drift: 2.4 },
    ],
    base: [GALAXY.FAR, GALAXY.MID, GALAXY.NEAR],
    // Les 4 champs de bruit de la nébuleuse (~15 ms chacun) sont calculés UN PAR UN par galaxyInitStep(), après le
    // premier affichage, pour ne jamais bloquer l'interface d'un seul coup.
    fields: [],
    specs: [
      [11, 2.6, "cloud", 0.51, 0.81, 0.6],
      [23, 3.4, "cloud", 0.55, 0.83, 1.1],
      [37, 3.0, "ridge", 0.87, 0.99, 0.3],
      [51, 4.2, "cloud", 0.57, 0.88, 0.9],
    ],
    neb: {}, colorKey: "", fills: [], cols: [],
  };
}

// Calcule le champ suivant ; renvoie true s'il en reste à calculer.
function galaxyInitStep(g) {
  const i = g.fields.length;
  if (i >= g.specs.length) return false;
  const [seed, scale, mode, lo, hi, rot] = g.specs[i];
  g.fields.push(makeField(seed, GALAXY.NEB_W, GALAXY.NEB_H, scale, mode, lo, hi, rot));
  return g.fields.length < g.specs.length;
}
const galaxyReady = (g) => g.fields.length >= g.specs.length;

// Textures de la nébuleuse (couche arrière + couche avant), colorées selon l'accent du marché.
// clear = true : on y "creuse" une zone plus calme au centre, là où se trouvent le nœud focal et les
// facteurs, pour qu'ils ressortent nettement sur le fond.
function ensureNebula(g, slot, rgb, makeCanvas, clear) {
  const { NEB_W: W, NEB_H: H } = GALAXY;
  let n = g.neb[slot];
  if (!n) {
    const mask = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = (x / (W - 1)) * 2 - 1, v = (y / (H - 1)) * 2 - 1;
        const edge = gSmooth(1.0, 0.68, Math.max(Math.abs(u), Math.abs(v))); // les bords de la texture s'effacent
        const r = Math.hypot(u, v * (H / W));
        mask[y * W + x] = edge * (clear ? 0.22 + 0.78 * gSmooth(0.14, 0.62, r) : 1);
      }
    }
    n = g.neb[slot] = { mask, back: makeCanvas(W, H), front: makeCanvas(W, H), key: "" };
  }
  const key = rgb.map((c) => Math.round(c / 6)).join(",");
  if (n.key === key) return n;
  n.key = key;
  const [ar, ag, ab] = rgb;
  const c0 = [gMix(70, ar, 0.1), gMix(95, ag, 0.1), gMix(235, ab, 0.1)]; // indigo
  const c1 = [gMix(185, ar, 0.12), gMix(65, ag, 0.12), gMix(205, ab, 0.12)]; // violet-magenta
  const c2 = [gMix(105, ar, 0.2), gMix(185, ag, 0.2), gMix(255, ab, 0.2)]; // filaments bleu ciel, légèrement teintés par la couleur du marché
  const c3 = [gMix(215, ar, 0.14), gMix(85, ag, 0.14), gMix(140, ab, 0.14)]; // rose
  const paint = (canvas, fa, ca, ka, fb, cb, kb) => {
    const c2d = canvas.getContext("2d");
    const img = c2d.createImageData(W, H);
    const d = img.data;
    for (let i = 0; i < W * H; i++) {
      const da = fa[i] * ka, db = fb[i] * kb, sum = da + db;
      const k4 = i * 4;
      if (sum < 0.003) { d[k4 + 3] = 0; continue; }
      d[k4] = (ca[0] * da + cb[0] * db) / sum;
      d[k4 + 1] = (ca[1] * da + cb[1] * db) / sum;
      d[k4 + 2] = (ca[2] * da + cb[2] * db) / sum;
      d[k4 + 3] = Math.min(0.6, sum) * n.mask[i] * 255;
    }
    c2d.putImageData(img, 0, 0);
  };
  paint(n.back, g.fields[0], c0, 0.55, g.fields[1], c1, 0.58);
  paint(n.front, g.fields[2], c2, 0.34, g.fields[3], c3, 0.38);
  return n;
}

// o = { bx, by (centre de base), pan:{x,y}, s (zoom), rgb, motion, gain, clear, nebW, makeCanvas }
// La nébuleuse et les étoiles sont dessinées sur DEUX canvas superposés : la nébuleuse (coûteuse à agrandir,
// mais quasi immobile) n'est redessinée que quand la vue change ou une fois par seconde ; seules les étoiles
// (très légères) sont redessinées à chaque image.
function drawNebula(ctx, g, w, h, t, o) {
  const gain = o.nebGain != null ? o.nebGain : o.gain == null ? 0.85 : o.gain;
  const pan = o.pan || { x: 0, y: 0 };
  const motion = !!o.motion;
  ctx.clearRect(0, 0, w, h);
  if (!galaxyReady(g)) return; // nébuleuse pas encore calculée : le fond n'a que les étoiles pour l'instant
  const neb = ensureNebula(g, o.clear ? "c" : "n", o.rgb, o.makeCanvas, o.clear);
  ctx.globalCompositeOperation = "lighter";
  const Wd = o.nebW * (o.clear ? Math.min(1.15, Math.max(0.85, 0.9 + 0.1 * (o.s || 1))) : 1);
  const Hd = (Wd * GALAXY.NEB_H) / GALAXY.NEB_W;
  // elle suit la carte presque en bloc (elle reste centrée sur la zone calme), avec un léger retard entre les
  // deux couches et une lente dérive : de la profondeur sans jamais trop bouger
  const layer = (canvas, follow, dx, dy, alpha) => {
    const cx = o.bx + pan.x * follow + (motion ? dx : 0), cy = o.by + pan.y * follow + (motion ? dy : 0);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(canvas, cx - Wd / 2, cy - Hd / 2, Wd, Hd);
  };
  const breathe = 0.94 + 0.06 * Math.sin(t * 0.12);
  layer(neb.back, 0.92, Math.sin(t * 0.031) * 14, Math.cos(t * 0.027) * 10, gain * breathe);
  layer(neb.front, 0.85, Math.cos(t * 0.023) * 18, Math.sin(t * 0.019) * 12, gain * (2 - breathe) * 0.95);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

function drawStars(ctx, g, w, h, t, o) {
  const gain = o.gain == null ? 0.85 : o.gain;
  const pan = o.pan || { x: 0, y: 0 };
  const motion = !!o.motion;
  const rgb = o.rgb;
  const key = rgb.map((c) => Math.round(c / 6)).join(",");
  if (g.colorKey !== key) {
    g.colorKey = key;
    g.cols = ["205,222,255", "255,236,205", `${Math.round(gMix(235, rgb[0], 0.5))},${Math.round(gMix(235, rgb[1], 0.5))},${Math.round(gMix(235, rgb[2], 0.5))}`];
    g.fills = g.cols.map((c) => `rgb(${c})`);
  }
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const areaK = Math.min(2.2, Math.max(0.5, (w * h) / (1100 * 720)));
  const fx = o.bx + pan.x, fy = o.by + pan.y; // position réelle du nœud focal à l'écran
  const clearR = o.clear ? 330 * (o.s || 1) : 0;
  for (let li = 0; li < 3; li++) {
    const L = g.layers[li];
    const K = Math.min(L.stars.length, Math.round(g.base[li] * areaK));
    const px = pan.x * L.par, py = pan.y * L.par;
    const dr = motion ? t * L.drift : 0;
    for (let i = 0; i < K; i++) {
      const s = L.stars[i];
      let x = (s.nx * w - dr + px) % w; if (x < 0) x += w;
      let y = (s.ny * h + dr * 0.35 + py) % h; if (y < 0) y += h;
      let a = gain * s.a * (s.tw ? 0.7 + 0.3 * Math.sin(t * s.tw + s.ph) : 1);
      // un peu moins d'étoiles derrière les facteurs : ils se détachent comme des pièces posées sur le fond
      if (clearR) a *= 0.5 + 0.5 * gSmooth(0.55 * clearR, 1.35 * clearR, Math.hypot(x - fx, (y - fy) * 1.15));
      if (s.bright) {
        const c = g.cols[s.ci], r = s.size * 5;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${c},${(a * 0.5).toFixed(3)})`);
        gr.addColorStop(0.4, `rgba(${c},${(a * 0.12).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${c},0)`);
        ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.globalAlpha = a; ctx.fillStyle = g.fills[s.ci];
        ctx.beginPath(); ctx.arc(x, y, s.size * 0.7, 0, Math.PI * 2); ctx.fill();
        if (s.spike) { // petites aigrettes de diffraction sur quelques étoiles brillantes
          const len = s.size * 9;
          ctx.globalAlpha = a * 0.35; ctx.strokeStyle = g.fills[s.ci]; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(x - len, y); ctx.lineTo(x + len, y); ctx.moveTo(x, y - len); ctx.lineTo(x, y + len); ctx.stroke();
        }
      } else {
        ctx.globalAlpha = a; ctx.fillStyle = g.fills[s.ci];
        ctx.fillRect(x - s.size / 2, y - s.size / 2, s.size, s.size);
      }
    }
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  // (la vignette qui assombrit les bords est un simple calque CSS dans GalaxyBackground : gratuit pour le CPU)
}

function spawnShootingStar(w, h, t) {
  const ang = ((20 + Math.random() * 25) * Math.PI) / 180;
  const speed = 520 + Math.random() * 260;
  const dir = Math.random() < 0.5 ? 1 : -1;
  return {
    x: dir > 0 ? Math.random() * w * 0.5 : w * 0.5 + Math.random() * w * 0.5,
    y: Math.random() * h * 0.45,
    vx: Math.cos(ang) * speed * dir, vy: Math.sin(ang) * speed,
    t0: t, life: 0.9 + Math.random() * 0.5,
  };
}
function drawShootingStar(ctx, s, t) {
  const p = (t - s.t0) / s.life;
  if (p >= 1) return false;
  const x = s.x + s.vx * (t - s.t0), y = s.y + s.vy * (t - s.t0);
  const tx = x - s.vx * 0.16, ty = y - s.vy * 0.16;
  const grad = ctx.createLinearGradient(x, y, tx, ty);
  grad.addColorStop(0, `rgba(255,244,220,${(0.85 * (1 - p)).toFixed(3)})`);
  grad.addColorStop(1, "rgba(255,244,220,0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 1;
  ctx.strokeStyle = grad; ctx.lineWidth = 1.3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
  return true;
}
/* GALAXY:END */

// ---- Actualisation manuelle des news (bouton "Actualiser" de la barre du haut) ----------------------
// Le navigateur n'appelle JAMAIS Alpha Vantage : il demande à /api/refresh-news (fonction Vercel) de
// lancer la tâche GitHub Actions, suit sa progression, puis recharge live-news.json une fois le site
// redéployé. Les limites (quota gratuit) sont appliquées côté serveur — voir api/refresh-news.js.
const REFRESH_API = "/api/refresh-news";
const REFRESH_CODE_KEY = "macromap-refresh-code";
const REFRESH_POLL_MS = 6000; // suivi de la tâche GitHub
const DEPLOY_POLL_MS = 12000; // attente du redéploiement Vercel
const RUN_MAX_MS = 5 * 60 * 1000;
const DEPLOY_MAX_MS = 6 * 60 * 1000;

function describeRefreshError(status, data) {
  if (!data) return "Fonction indisponible ici : le bouton ne marche que sur le site déployé sur Vercel.";
  switch (data.error) {
    case "not_configured": return "Actualisation manuelle non configurée côté serveur (variables GITHUB_DISPATCH_TOKEN et GITHUB_REPO manquantes sur Vercel \u2014 voir le README).";
    case "daily_cap": return `Limite du jour atteinte (${data.manualToday}/${data.manualMax} actualisations manuelles) : le quota gratuit est protégé. Reviens demain.`;
    case "quota_budget": return "Le quota Alpha Vantage du jour est réservé aux actualisations automatiques restantes. Réessaie demain.";
    case "cooldown": return `Une actualisation vient d'avoir lieu. Réessaie dans ${Math.max(1, Math.ceil((data.retryAfterSec || 60) / 60))} min.`;
    default: return data.message || `Échec de l'actualisation (code ${status}).`;
  }
}

function useServerNewsRefresh({ liveNewsAt, refreshLiveNews }) {
  const [state, setState] = useState({ phase: "idle", message: "", runUrl: null }); // idle | starting | running | deploying | done | error
  const aliveRef = useRef(true);
  const busyRef = useRef(false);
  const atRef = useRef(liveNewsAt);
  atRef.current = liveNewsAt;
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  const reset = useCallback(() => setState({ phase: "idle", message: "", runUrl: null }), []);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const set = (patch) => { if (aliveRef.current) setState((s) => ({ ...s, ...patch })); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const call = async (method) => {
      const headers = {};
      try { const c = localStorage.getItem(REFRESH_CODE_KEY); if (c) headers["x-refresh-code"] = c; } catch (e) {}
      const res = await fetch(REFRESH_API, { method, headers, cache: "no-store" });
      let data = null;
      try { data = await res.json(); } catch (e) {}
      return { res, data };
    };
    try {
      set({ phase: "starting", message: "Lancement de l'actualisation\u2026", runUrl: null });
      let { res, data } = await call("POST");
      if (res.status === 401) { // code d'accès requis (ou code mémorisé devenu invalide)
        const entered = typeof window.prompt === "function" ? window.prompt("Code d'accès pour actualiser les news :") : null;
        if (!entered) { set({ phase: "error", message: "Code d'accès requis pour actualiser les news." }); return; }
        try { localStorage.setItem(REFRESH_CODE_KEY, entered.trim()); } catch (e) {}
        ({ res, data } = await call("POST"));
        if (res.status === 401) {
          try { localStorage.removeItem(REFRESH_CODE_KEY); } catch (e) {}
          set({ phase: "error", message: "Code d'accès incorrect." });
          return;
        }
      }
      let since;
      if (res.status === 202 && data && data.ok) since = Date.parse(data.dispatchedAt);
      else if (res.status === 409 && data && data.run) since = Date.parse(data.run.createdAt) - 1000; // déjà en cours : on suit ce run
      else { set({ phase: "error", message: describeRefreshError(res.status, data) }); return; }
      if (Number.isNaN(since)) since = Date.now() - 5000;

      // 1) suivre la tâche GitHub jusqu'à sa fin
      set({ phase: "running", message: "Actualisation lancée \u2014 en attente de GitHub\u2026" });
      let outcome = null;
      const runDeadline = Date.now() + RUN_MAX_MS;
      while (Date.now() < runDeadline) {
        await sleep(REFRESH_POLL_MS);
        if (!aliveRef.current) return;
        let r;
        try { r = await call("GET"); } catch (e) { continue; }
        const latest = r.data && r.data.latest;
        if (!latest || Date.parse(latest.createdAt) < since - 15000) continue; // pas encore visible côté GitHub
        if (latest.status !== "completed") { set({ message: "Récupération et classement des news\u2026 (\u2248 1 min)", runUrl: latest.url }); continue; }
        outcome = latest;
        break;
      }
      if (!outcome) { set({ phase: "error", message: "L'actualisation dure plus longtemps que prévu \u2014 regarde l'onglet Actions du repo GitHub." }); return; }
      if (outcome.conclusion !== "success") {
        set({ phase: "error", runUrl: outcome.url, message: "L'actualisation a échoué côté GitHub (clés manquantes ? quota Alpha Vantage ?). Le journal du run donne la cause exacte." });
        return;
      }

      // 2) attendre que le site redéployé serve le nouveau live-news.json
      set({ phase: "deploying", message: "News récupérées \u2014 mise en ligne du site (\u2248 1 à 2 min)\u2026", runUrl: outcome.url });
      const deployDeadline = Date.now() + DEPLOY_MAX_MS;
      while (Date.now() < deployDeadline) {
        await sleep(DEPLOY_POLL_MS);
        if (!aliveRef.current) return;
        try {
          const r = await fetch(`/live-news.json?t=${Date.now()}`, { cache: "no-store" });
          const d = r.ok ? await r.json() : null;
          if (d && d.updatedAt && Date.parse(d.updatedAt) >= Date.parse(outcome.createdAt) - 5000) {
            refreshLiveNews({ silent: true });
            set({ phase: "done", message: "News mises à jour \u2713" });
            setTimeout(() => { if (aliveRef.current) setState((s) => (s.phase === "done" ? { phase: "idle", message: "", runUrl: null } : s)); }, 6000);
            return;
          }
        } catch (e) {}
      }
      set({ phase: "error", message: "Les news sont récupérées côté GitHub, mais le site n'a pas encore redéployé. Vérifie le déploiement Vercel (README, « Deploy Hook »)." });
    } catch (e) {
      set({ phase: "error", message: "Impossible de contacter le serveur. Réessaie dans un instant." });
    } finally {
      busyRef.current = false;
    }
  }, [refreshLiveNews]);

  return { ...state, start, reset };
}

function RefreshToast({ state, onClose }) {
  if (!state || state.phase === "idle" || !state.message) return null;
  const isErr = state.phase === "error";
  const isDone = state.phase === "done";
  const color = isErr ? "#E5626A" : isDone ? "#4CC38A" : "#C9A24B";
  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-16 z-50 mm-glass mm-fade-in rounded-lg px-3.5 py-2.5 flex items-start gap-3" style={{ maxWidth: "min(560px, 92vw)", borderColor: `${color}55`, color: "#D3D8E0" }}>
      <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <div className="text-[12px] leading-snug">
        <div>{state.message}</div>
        {state.runUrl && !isDone && <a href={state.runUrl} target="_blank" rel="noreferrer" className="underline text-[11px]" style={{ color }}>Voir le journal GitHub</a>}
      </div>
      {(isErr || isDone) && <button onClick={onClose} className="mm-btn shrink-0 -mr-1 p-0.5" style={{ color: "#7B8496" }} aria-label="Fermer"><X size={12} /></button>}
    </div>
  );
}

// Préférence "galaxie on/off" (bouton ✦ en bas à droite de la carte), mémorisée dans le navigateur.
function useGalaxyPref() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem("macromap-galaxy") !== "off"; } catch (e) { return true; } });
  const toggle = useCallback(() => {
    setOn((v) => { try { localStorage.setItem("macromap-galaxy", v ? "off" : "on"); } catch (e) {} return !v; });
  }, []);
  return [on, toggle];
}

let GALAXY_DATA = null;
// layout "map" : nébuleuse centrée derrière le nœud focal, qui suit la carte (pan/zoom) avec un léger retard ;
//                les étoiles, elles, défilent à des vitesses différentes selon leur profondeur (parallaxe).
// layout "hero" : version discrète pour le bandeau de la page Aperçu (nébuleuse à droite, plus sombre).
// Perf : la nébuleuse est coûteuse à agrandir mais presque immobile -> canvas séparé, redessiné seulement quand
// la vue change (déplacement, zoom, couleur, taille) ou 1 fois par seconde ; seules les étoiles (très légères)
// sont redessinées à chaque image (~30/s).
function GalaxyBackground({ enabled = true, layout = "map", accent = "#C9A24B", pan, zoom = 1 }) {
  const nebRef = useRef(null);
  const starRef = useRef(null);
  const live = useRef({});
  live.current.pan = pan || { x: 0, y: 0 };
  live.current.zoom = zoom;
  live.current.target = hexToRgb(accent);

  useEffect(() => {
    if (!enabled) return undefined;
    const nebC = nebRef.current, starC = starRef.current;
    const nctx = nebC && nebC.getContext ? nebC.getContext("2d") : null;
    const sctx = starC && starC.getContext ? starC.getContext("2d") : null;
    if (!nctx || !sctx) return undefined;
    if (!GALAXY_DATA) GALAXY_DATA = buildGalaxy();
    const g = GALAXY_DATA;
    const makeCanvas = (cw, ch) => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return c; };
    // Accessibilité : si l'OS demande de réduire les animations, on dessine une image fixe.
    const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let w = 1, h = 1, raf = 0, last = 0, shoot = null, nextShoot = 5 + Math.random() * 5;
    let cur = live.current.target;
    let nebSig = "", nebT = -1e9, initTimer = 0, cancelled = false;
    const t0 = performance.now();

    const render = (t, force) => {
      const L = live.current;
      cur = cur.map((c, i) => c + (L.target[i] - c) * 0.08); // transition douce quand le marché change
      const rgb = cur.map(Math.round);
      const base = layout === "hero"
        ? { bx: w * 0.8, by: h * 0.5, pan: { x: 0, y: 0 }, s: 1, clear: false, nebW: Math.max(760, w * 1.1), gain: 0.65, nebGain: 0.5 }
        : { bx: 460, by: 340, pan: L.pan, s: L.zoom, clear: true, nebW: Math.max(1500, w * 1.5), gain: 0.9, nebGain: 0.6 };
      const o = { ...base, rgb, motion: !reduce, makeCanvas };
      const sig = `${w}x${h}|${Math.round(o.pan.x)}|${Math.round(o.pan.y)}|${o.s.toFixed(2)}|${rgb.map((c) => Math.round(c / 6)).join(",")}`;
      if (force || sig !== nebSig || t - nebT >= 1) { drawNebula(nctx, g, w, h, t, o); nebSig = sig; nebT = t; }
      drawStars(sctx, g, w, h, t, o);
      if (!reduce) {
        if (!shoot && t > nextShoot) shoot = spawnShootingStar(w, h, t);
        if (shoot && !drawShootingStar(sctx, shoot, t)) { shoot = null; nextShoot = t + 8 + Math.random() * 10; }
      }
      sctx.globalCompositeOperation = "source-over"; sctx.globalAlpha = 1;
    };
    const resize = () => {
      const r = nebC.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const [c, x, k] of [[nebC, nctx, 0.5], [starC, sctx, 1]]) { // k : la nébuleuse est floue, demi-résolution suffisante
        c.width = Math.round(w * dpr * k); c.height = Math.round(h * dpr * k);
        x.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      }
      render((performance.now() - t0) / 1000, true);
    };
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 33) return; // ~30 images/s : largement suffisant pour un fond lent, et léger pour le CPU
      last = now;
      render((now - t0) / 1000, false);
    };

    // La nébuleuse est calculée par petites tranches juste après le premier affichage (pas de gel de l'interface),
    // puis apparaît en fondu ; les étoiles, elles, s'affichent tout de suite.
    const initStep = () => {
      if (cancelled) return;
      if (galaxyInitStep(g)) { initTimer = setTimeout(initStep, 0); return; }
      nebSig = "";
      nebC.style.opacity = "1";
      if (reduce) render((performance.now() - t0) / 1000, true);
    };
    if (galaxyReady(g)) nebC.style.opacity = "1"; else initTimer = setTimeout(initStep, 0);

    resize();
    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(resize); ro.observe(nebC); }
    else window.addEventListener("resize", resize);
    if (!reduce) raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else window.removeEventListener("resize", resize);
    };
  }, [enabled, layout]);

  if (!enabled) return null;
  return (
    <>
      <canvas ref={nebRef} aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0, opacity: 0, transition: "opacity 1.6s ease" }} />
      <canvas ref={starRef} aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />
      {/* Vignette : assombrit les bords pour garder l'interface lisible */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ zIndex: 0, background: "radial-gradient(ellipse at center, rgba(10,12,16,0) 45%, rgba(10,12,16,0.55) 100%)" }} />
    </>
  );
}

function HierCanvas({
  focal, visibleChildren, visibleEdges, isDimmed, selectedNodeId, selectedEdgeId, pan, zoom,
  onNodePointerDown, onNodeDoubleClick, onEdgeClick, onNewsClick, onBgPointerDown, onWheel, setZoom, resetView,
  connectMode, pendingSource, picker, setPicker, addEdge, setPendingSource, driversInto, whyOpen, setWhyOpen, focusOnNode,
  focusMode, fullscreen, onExitFullscreen, showEvidence, roleByChildId, structuralCount, showStructuralNodes, setShowStructuralNodes,
  isPanning,
}) {
  const [galaxyOn, toggleGalaxy] = useGalaxyPref(); // hook AVANT le return anticipé ci-dessous
  const hiddenStructuralCount = showStructuralNodes ? 0 : structuralCount;
  if (!focal) return null;
  const R = Math.max(230, visibleChildren.length * 26);
  const positioned = visibleChildren.map((n, i) => {
    const angle = (i / Math.max(visibleChildren.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: Math.cos(angle) * R, y: Math.sin(angle) * R };
  });
  const byId = { [focal.id]: { ...focal, x: 0, y: 0 }, ...Object.fromEntries(positioned.map((n) => [n.id, n])) };
  const drawnPairs = new Set();
  const drivers = driversInto(focal.id, 3);

  return (
    <div className="flex-1 relative overflow-hidden mm-canvas-bg" onWheel={onWheel}>
      <GalaxyBackground enabled={galaxyOn} layout="map" accent={MARKET_ACCENT[(focal.markets || [])[0]] || "#C9A24B"} pan={pan} zoom={zoom} />
      {fullscreen && (
        <button onClick={onExitFullscreen} className="mm-btn absolute top-3 right-3 z-20 text-[11px] px-2.5 py-1.5 rounded-md mm-glass" style={{ color: "#8A93A3" }}>Exit fullscreen</button>
      )}
      {focusMode && selectedNodeId && (
        <div className="absolute top-3 left-3 z-20 text-[10.5px] px-2.5 py-1.5 rounded-md mm-glass" style={{ color: "#C9A24B" }}>Focus: {byId[selectedNodeId]?.label || "\u2014"}</div>
      )}
      {drivers.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <button onClick={() => setWhyOpen(!whyOpen)} className="mm-btn flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium mm-glass" style={{ color: "#C9A24B" }}>
            <Zap size={13} /> {T.mindmap.whyMoving(focal.label)}
          </button>
          {whyOpen && (
            <div className="mm-card mm-glass mm-fade-in mt-2 p-3 w-72">
              <div className="text-[12px] font-medium mb-2">{focal.label} {focal.direction} \u2014 {T.mindmap.mainDrivers}</div>
              <ol className="flex flex-col gap-1.5">
                {drivers.map(({ edge, node }, i) => (
                  <li key={edge.id} className="text-[12px] flex items-start gap-1.5 cursor-pointer" style={{ color: "#B7BFCC" }} onClick={() => focusOnNode(node.id)}>
                    <span style={{ color: "#545D6E" }}>{i + 1}.</span>
                    <span>{node.label} {node.direction} <span style={{ color: RELATION_META[edge.relation]?.color }}>({RELATION_META[edge.relation]?.label}{edge.confidence ? `, ${edge.confidence}%` : ""})</span></span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {showEvidence && (
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 text-[10.5px] px-3 py-2 rounded-md mm-glass" style={{ color: "#8A93A3" }}>
          <span>{"\u{1F7E2}"} {T.mindmap.strongEvidence}</span><span>{"\u{1F7E1}"} {T.mindmap.moderateEvidence}</span><span>{"\u26AA"} {T.mindmap.limitedEvidence}</span>
        </div>
      )}

      {hiddenStructuralCount > 0 && !showStructuralNodes && (
        <button onClick={() => setShowStructuralNodes(true)} className="mm-btn mm-structural-btn absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[11px] px-3 py-1.5 rounded-full mm-glass" style={{ color: ROLE_META.structuralSupport.color }}>
          + {hiddenStructuralCount} facteur{hiddenStructuralCount > 1 ? "s" : ""} structurel{hiddenStructuralCount > 1 ? "s" : ""} / arri\u00e8re-plan
        </button>
      )}
      {showStructuralNodes && structuralCount > 0 && (
        <button onClick={() => setShowStructuralNodes(false)} className="mm-btn mm-structural-btn absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[11px] px-3 py-1.5 rounded-full mm-glass" style={{ color: "#545D6E" }}>
          Masquer le contexte structurel
        </button>
      )}

      <svg className="w-full h-full" onMouseDown={onBgPointerDown} style={{ cursor: "grab", position: "relative" }}>
        <g transform={`translate(${pan.x + 460},${pan.y + 340}) scale(${zoom})`} className={isPanning ? "mm-scene mm-scene-dragging" : "mm-scene"}>
          <g opacity={0.5} className="mm-rings">
            {[0.34, 0.67, 1].map((f, i) => (
              <circle key={i} cx={0} cy={0} r={R * f} fill="none" stroke="rgba(201,162,75,0.09)" strokeWidth={1} strokeDasharray={i === 2 ? "1 5" : "1 7"} />
            ))}
          </g>
          {positioned.map((c) => {
            const pairKey = [focal.id, c.id].sort().join("|");
            const causal = visibleEdges.find((e) => (e.from === focal.id && e.to === c.id) || (e.from === c.id && e.to === focal.id));
            if (causal) return null; // drawn in the causal pass below
            drawnPairs.add(pairKey);
            const dim = isDimmed(c);
            return <line key={c.id} x1={0} y1={0} x2={c.x} y2={c.y} stroke="#232935" strokeWidth={1} opacity={dim ? 0.15 : 0.4} />;
          })}

          {visibleEdges.map((e) => {
            const a = byId[e.from], b = byId[e.to];
            if (!a || !b) return null;
            const relMeta = RELATION_META[e.relation];
            const tier = evidenceTier(e);
            const meta = showEvidence && e.relation !== "contains" ? tier : relMeta;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            const isSel = e.id === selectedEdgeId;
            const touchesSelection = selectedNodeId && (e.from === selectedNodeId || e.to === selectedNodeId);
            const dim = isDimmed(byId[e.from]) || isDimmed(byId[e.to]);
            return (
              <g key={e.id} style={{ cursor: "pointer" }} opacity={dim ? 0.18 : 1} onClick={(ev) => { ev.stopPropagation(); onEdgeClick(e.id); }}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={meta?.color || "#3A4252"} strokeWidth={isSel ? 2.6 : 1.4}
                  opacity={isSel ? 1 : 0.55} className={touchesSelection && !dim ? "mm-flow" : ""} />
                {(isSel || touchesSelection || showEvidence) && (
                  <g transform={`translate(${mx},${my})`}>
                    <rect x={-42} y={-9} width={84} height={16} rx={4} fill="#0D1117" stroke={meta?.color || "#3A4252"} strokeWidth={isSel ? 1.2 : 0.6} opacity={0.95} />
                    <text x={0} y={3} textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" fill={meta?.color || "#8A93A3"}>
                      {showEvidence ? `${tier.emoji} ${tier.label}` : `${relMeta?.label}${e.confidence ? ` \u00b7 ${e.confidence}%` : ""}`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          <NodeShape node={{ ...focal, x: 0, y: 0 }} kind="focal" selected={selectedNodeId === focal.id}
            dimmed={false} onPointerDown={onNodePointerDown} onDoubleClick={onNodeDoubleClick} onNewsClick={onNewsClick} connectMode={connectMode} pendingSource={pendingSource}
            driversCount={drivers.length} />
          {positioned.map((n) => (
            <NodeShape key={n.id} node={n} kind="child" selected={n.id === selectedNodeId} dimmed={isDimmed(n)}
              onPointerDown={onNodePointerDown} onDoubleClick={onNodeDoubleClick} onNewsClick={onNewsClick} connectMode={connectMode} pendingSource={pendingSource}
              role={roleByChildId?.[n.id]} />
          ))}
        </g>
      </svg>


      {picker && <RelationPicker picker={picker} onPick={(rel) => { addEdge(picker.from, picker.targetId, rel); setPicker(null); setPendingSource(null); }} onCancel={() => setPicker(null)} />}

      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-10">
        <IconBtn onClick={toggleGalaxy} title={galaxyOn ? "Masquer la galaxie" : "Afficher la galaxie"}><Sparkles size={14} color={galaxyOn ? "#C9A24B" : "#545D6E"} /></IconBtn>
        <IconBtn onClick={() => setZoom((z) => Math.min(2.2, z + 0.15))}><ZoomIn size={14} /></IconBtn>
        <IconBtn onClick={() => setZoom((z) => Math.max(0.35, z - 0.15))}><ZoomOut size={14} /></IconBtn>
        <IconBtn onClick={resetView}><Maximize2 size={14} /></IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }) {
  return <button onClick={onClick} title={title} className="mm-btn w-8 h-8 rounded-md flex items-center justify-center mm-glass" style={{ color: "#B7BFCC" }}>{children}</button>;
}

function NodeShape({ node, kind, selected, dimmed, onPointerDown, onDoubleClick, onNewsClick, connectMode, pendingSource, driversCount, role }) {
  const { w, h } = nodeSize(kind, node.importance);
  const statusColor = STATUS_META[node.status]?.color || "#545D6E";
  const isPending = connectMode && pendingSource === node.id;
  const hasKids = (node.childrenIds || []).length > 0;
  const newsDisplay = getDisplayNewsForNode(node);
  const newsCount = newsDisplay.items.length;
  const accentColor = role ? role.color : statusColor;
  const pulseWorthy = kind !== "focal" && (role?.label === ROLE_META.core.label || (node.status === "hot" && node.importance === "critical"));
  return (
    <g transform={`translate(${node.x},${node.y})`} onMouseDown={(e) => onPointerDown(e, node.id)} onDoubleClick={() => onDoubleClick(node.id)}
      style={{ cursor: connectMode ? "crosshair" : hasKids ? "zoom-in" : "pointer" }} opacity={dimmed ? 0.24 : 1} className={"mm-node" + (selected ? " mm-node-sel" : "")}>
      {pulseWorthy && (
        <circle r={Math.max(w, h) / 2 + 7} fill="none" stroke={accentColor} strokeWidth={1.4} className="mm-pulse" />
      )}
      <g className="mm-node-pop">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={kind === "focal" ? 18 : 12}
          fill={kind === "focal" ? "#15130A" : "#12151C"}
          stroke={isPending ? "#C9A24B" : selected ? "#C9A24B" : role ? accentColor : hasKids ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)"}
          strokeWidth={selected || isPending ? 1.6 : role ? 1.3 : 1}
          style={role && !selected && !isPending ? { filter: `drop-shadow(0 0 5px ${accentColor}55)` } : undefined} />
        <path d={`M ${-w / 2 + (kind === "focal" ? 18 : 12)} ${-h / 2 + 0.75} H ${w / 2 - (kind === "focal" ? 18 : 12)}`} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        <rect x={-w / 2} y={-h / 2} width={4} height={h} rx={2} fill={statusColor} opacity={0.85} />
        <text x={-w / 2 + 16} y={kind === "focal" ? -8 : -6} fontSize={kind === "focal" ? "13.5" : "11"} fontWeight={kind === "focal" ? 600 : 500} fill="#EDEFF2">{truncate(node.label, kind === "focal" ? 22 : 17)}</text>
        <g transform={`translate(${-w / 2 + 16},${kind === "focal" ? 12 : 12})`}>
          <text fontSize={kind === "focal" ? "11" : "9.5"} fontWeight={600} fill={statusColor}>{STATUS_META[node.status]?.label}</text>
          <text x={STATUS_META[node.status]?.label ? STATUS_META[node.status].label.length * (kind === "focal" ? 6.6 : 5.6) + 8 : 60} fontSize={kind === "focal" ? "12" : "10"} fontFamily="JetBrains Mono, monospace" fill="#8A93A3">{node.direction}</text>
        </g>
        {node.value && node.value !== "\u2014" && (
          <text x={-w / 2 + 16} y={h / 2 - 10} fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill="#5C6577">{truncate(String(node.value), 22)}</text>
        )}
        {role && kind !== "focal" && (
          <g transform={`translate(0,${-h / 2 - 9})`}>
            <rect x={-role.label.length * 3.1 - 6} y={-7} width={role.label.length * 6.2 + 12} height={13} rx={6.5} fill="#0D1117" stroke={role.color} strokeWidth={1} opacity={0.95} />
            <text x={0} y={3} textAnchor="middle" fontSize="7.5" fontWeight={600} fontFamily="JetBrains Mono, monospace" fill={role.color}>{role.label.toUpperCase()}</text>
          </g>
        )}
        {hasKids && <circle cx={w / 2 - 13} cy={-h / 2 + 13} r={3.5} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} />}
        {kind === "focal" && driversCount > 0 && (
          <text x={w / 2 - 16} y={h / 2 - 10} textAnchor="end" fontSize="9.5" fill="#545D6E">{driversCount} MAIN DRIVERS</text>
        )}
        {newsCount > 0 && (
          <g
            transform={`translate(${-w / 2 + 22},${h / 2 + 1})`}
            onMouseDown={(e) => { e.stopPropagation(); onNewsClick(node.id); }}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{ cursor: "pointer" }}
          >
            <rect x={-19} y={-9} width={38} height={17} rx={8.5} fill="#0D1117" stroke={newsDisplay.isContextOnly ? "#2C3444" : "#3A4252"} strokeWidth={1} />
            <text x={0} y={3.5} textAnchor="middle" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill={newsDisplay.isContextOnly ? "#8A93A3" : "#E6C260"}>{newsDisplay.isContextOnly ? "\u{1F4A4}" : "\u{1F4F0}"} {newsCount}</text>
          </g>
        )}
      </g>
    </g>
  );
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; }

function RelationPicker({ picker, onPick, onCancel }) {
  return (
    <div className="absolute z-20 mm-card p-2" style={{ left: Math.max(10, picker.screenX - 700), top: Math.max(10, picker.screenY - 240) }}>
      <div className="text-[11px] mb-1.5 px-1" style={{ color: "#545D6E" }}>{T.mindmap.relationType}</div>
      <div className="grid grid-cols-2 gap-1">
        {Object.entries(RELATION_META).map(([key, meta]) => (
          <button key={key} onClick={() => onPick(key)} className="mm-btn text-[11px] px-2 py-1 rounded text-left" style={{ color: meta.color, background: "rgba(255,255,255,0.02)" }}>{meta.label}</button>
        ))}
      </div>
      <button onClick={onCancel} className="mm-btn text-[11px] mt-1.5 w-full py-1 rounded" style={{ color: "#8A93A3" }}>{T.common.cancel}</button>
    </div>
  );
}

/* --------------------------- evidence sub-parts --------------------------- */

function EvidenceList({ items }) {
  if (!items || items.length === 0) {
    return <div className="text-[12px] rounded-md px-3 py-2.5" style={{ background: "#131720", color: "#545D6E", border: "1px dashed #2C3444" }}>{T.relation.noEvidence}</div>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => {
        const tier = sourceTier(it.source);
        const plat = it.platform && PLATFORM_META[it.platform];
        return (
          <div key={i} className="rounded-md p-2.5" style={{ background: "#131720", border: plat ? `1px solid ${plat.color}30` : "1px solid #212734" }}>
            <div className="flex items-center gap-1.5 text-[11px] mb-1 flex-wrap" style={{ color: "#545D6E" }}>
              <span>{plat ? plat.icon : it.type === "data" ? "\u{1F4CA}" : "\u{1F4F0}"}</span><span>{it.date}</span><span>\u00b7</span><span>{it.source}{it.link ? " \u2197" : ""}</span>
              {plat && plat.label !== "Article" && <span className="text-[9.5px] px-1.5 py-0.5 rounded" style={{ color: plat.color, background: `${plat.color}1A` }}>{plat.label}</span>}
              {tier && <span className="text-[9.5px] px-1.5 py-0.5 rounded" style={{ color: tier.color, background: `${tier.color}1A` }}>{tier.label}</span>}
            </div>
            <div className="text-[10px] mb-1.5" style={{ color: "#3A4252" }}>{T.news.macroMapSummary}</div>
            <a href={it.link || newsSearchUrl(it)} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-medium mb-1 flex items-start gap-1 hover:underline" style={{ color: "#E7EAEE" }}>
              {it.headline} <ExternalLink size={10} className="shrink-0 mt-0.5" style={{ opacity: 0.6 }} />
            </a>
            <div className="text-[12px] mb-1.5" style={{ color: "#8A93A3" }}>{it.summary}</div>
            {it.why && (
              <div className="text-[11.5px] mb-1.5 rounded px-2 py-1.5" style={{ background: "#0F1520", color: "#B7BFCC" }}>
                <span style={{ color: "#545D6E" }}>{T.news.whyItMatters} </span>{it.why}
              </div>
            )}
            {it.data && (it.data.actual || it.data.expected || it.data.previous) && (
              <div className="flex gap-3 text-[11px] mm-mono mb-1.5" style={{ color: "#8A93A3" }}>
                {it.data.actual && <span>{T.node.actual}\u00a0: <b style={{ color: "#E7EAEE" }}>{it.data.actual}</b></span>}
                {it.data.expected && <span>{T.node.expected}\u00a0: {it.data.expected}</span>}
                {it.data.previous && <span>{T.node.previous}\u00a0: {it.data.previous}</span>}
              </div>
            )}
            {it.impact && it.impact.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {it.impact.map((im, j) => <span key={j} className="text-[10.5px] px-1.5 py-0.5 rounded mm-mono" style={{ background: "#0F1520", color: "#8A93A3" }}>{im.market} {im.dir}</span>)}
              </div>
            )}
            {it.link ? (
              <a href={it.link} target="_blank" rel="noopener noreferrer" className="mm-btn inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1.5 rounded-md" style={{ border: "1px solid #2C3444", color: "#C9A24B" }}>
                {T.news.readOriginal} \u2192
              </a>
            ) : (
              <a href={newsSearchUrl(it)} target="_blank" rel="noopener noreferrer" className="mm-btn inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1.5 rounded-md" style={{ border: "1px solid #2C3444", color: "#8A93A3" }}>
                {T.news.searchOriginal} <ExternalLink size={11} />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddEvidenceForm({ onAdd, onCancel }) {
  const [headline, setHeadline] = useState(""); const [source, setSource] = useState(""); const [summary, setSummary] = useState(""); const [why, setWhy] = useState("");
  const [platform, setPlatform] = useState("article"); const [link, setLink] = useState("");
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md p-2.5" style={{ background: "#0F1520", border: "1px solid #212734" }}>
      <div className="flex gap-1.5">
        {Object.entries(PLATFORM_META).map(([key, meta]) => (
          <button key={key} onClick={() => setPlatform(key)} type="button"
            className="mm-btn flex-1 text-[11px] py-1.5 rounded-md flex items-center justify-center gap-1"
            style={{ background: platform === key ? `${meta.color}22` : "#131720", color: platform === key ? meta.color : "#8A93A3", border: `1px solid ${platform === key ? meta.color + "60" : "#212734"}` }}>
            <span>{meta.icon}</span> {meta.label}
          </button>
        ))}
      </div>
      <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={platform === "article" ? "Titre" : "Ce que dit le post"} className="text-[12px] rounded px-2 py-1.5 outline-none" style={{ background: "#131720", border: "1px solid #212734", color: "#E7EAEE" }} />
      <div className="grid grid-cols-2 gap-2">
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder={platform === "article" ? "Source" : "@compte"} className="text-[12px] rounded px-2 py-1.5 outline-none" style={{ background: "#131720", border: "1px solid #212734", color: "#E7EAEE" }} />
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="R\u00e9sum\u00e9 court" className="text-[12px] rounded px-2 py-1.5 outline-none" style={{ background: "#131720", border: "1px solid #212734", color: "#E7EAEE" }} />
      </div>
      <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Pourquoi est-ce important" className="text-[12px] rounded px-2 py-1.5 outline-none" style={{ background: "#131720", border: "1px solid #212734", color: "#E7EAEE" }} />
      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={platform === "x" ? "Lien du post X (https://x.com/...)" : platform === "instagram" ? "Lien du post Instagram (https://instagram.com/...)" : "Lien de l'article (optionnel)"} className="text-[12px] rounded px-2 py-1.5 outline-none" style={{ background: "#131720", border: "1px solid #212734", color: "#E7EAEE" }} />
      <div className="flex gap-2">
        <button disabled={!headline.trim()} onClick={() => { onAdd({ type: "news", platform, headline, date: "Sep 11, 2026", source: source || "Saisie manuelle", summary, why, impact: [], data: null, link: link.trim() || null }); setHeadline(""); setSource(""); setSummary(""); setWhy(""); setLink(""); setPlatform("article"); }}
          className="mm-btn flex-1 text-[11.5px] py-1.5 rounded-md font-medium" style={{ background: headline.trim() ? "#C9A24B" : "#232935", color: headline.trim() ? "#0A0D12" : "#545D6E" }}>{T.common.add}</button>
        <button onClick={onCancel} className="mm-btn text-[11.5px] py-1.5 px-3 rounded-md" style={{ color: "#8A93A3" }}>{T.common.close}</button>
      </div>
    </div>
  );
}

/* ------------------------------- panels ----------------------------------- */

function RoleTag({ role }) {
  if (!role) return null;
  return (
    <span className="text-[8.5px] mm-mono shrink-0 ml-2 px-1.5 py-0.5 rounded" style={{ color: role.color, background: `${role.color}1A`, border: `1px solid ${role.color}40` }}>
      {role.label.toUpperCase()}
    </span>
  );
}
function ContextCard({ node, items, onOpenFactor }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-2 rounded-md p-2.5" style={{ background: "#0F1520", border: "1px solid #1B212C" }}>
      <button onClick={() => onOpenFactor && onOpenFactor(node.id)} className="mm-btn text-[11.5px] font-medium mb-1.5 hover:underline" style={{ color: "#E7EAEE" }}>
        {node.label} <span className="mm-mono" style={{ color: "#545D6E" }}>{node.direction}</span>
      </button>
      <div className="flex flex-col gap-2">
        {items.map((it, i) => {
          const kind = CONTEXT_KIND_META[it.kind] || CONTEXT_KIND_META.context;
          return (
            <div key={i} className="pl-2" style={{ borderLeft: `2px solid ${kind.color}50` }}>
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ color: kind.color, background: `${kind.color}1A` }}>{kind.emoji} {kind.label}</span>
                <span className="text-[10px] mm-mono" style={{ color: "#545D6E" }}>{it.date} \u00b7 {it.source}</span>
              </div>
              {it.synthetic ? (
                <div className="text-[11.5px] leading-snug" style={{ color: "#B7BFCC" }}>{it.headline}</div>
              ) : (
                <a href={it.link || newsSearchUrl(it)} target="_blank" rel="noopener noreferrer" className="text-[11.5px] leading-snug flex items-start gap-1 hover:underline" style={{ color: "#B7BFCC" }}>
                  {it.headline} <ExternalLink size={9} className="shrink-0 mt-0.5" style={{ opacity: 0.55 }} />
                </a>
              )}
              {it.summary && <div className="text-[10.5px] mt-1" style={{ color: "#8A93A3" }}>{it.summary}</div>}
              {it.why && <div className="text-[10.5px] mt-0.5" style={{ color: "#6B7280" }}><span style={{ color: "#545D6E" }}>Pourquoi\u00a0: </span>{it.why}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function NewsDot({ node, nodes, onOpenNews }) {
  const { items, isContextOnly } = getDisplayNewsForNode(node, nodes);
  if (!items.length) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpenNews(node.id); }}
      className="mm-btn shrink-0 ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded"
      style={isContextOnly ? { color: "#8A93A3", background: "rgba(138,147,163,0.1)" } : { color: "#E6C260", background: "rgba(230,194,96,0.1)" }}
      title={isContextOnly ? "Aucun catalyseur actuel \u2014 derni\u00e8re information connue sur ce facteur" : "Voir les actualit\u00e9s li\u00e9es"}
    >
      {isContextOnly ? <span style={{ fontSize: 10, lineHeight: 1 }}>{"\u{1F4A4}"}</span> : <Newspaper size={10} />} {items.length}
    </button>
  );
}
function DriverGroup({ label, role, items, onOpenFactor, nodes, onOpenNews }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-2">
      {label && <div className="text-[10px] mb-1" style={{ color: "#3A4252" }}>{label}</div>}
      <div className="flex flex-col gap-1">
        {items.map(({ edge, node: dn, sign }) => (
          <button key={edge.id} onClick={() => onOpenFactor(edge.id)} className="mm-btn w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-md" style={{ background: "#131720" }}>
            <span className="text-[12px] truncate" style={{ color: "#E7EAEE" }}>{sign > 0 ? "\u{1F7E2}" : "\u{1F534}"} {dn.label} {dn.direction}</span>
            <span className="flex items-center shrink-0">
              <NewsDot node={dn} nodes={nodes} onOpenNews={onOpenNews} />
              <RoleTag role={role} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
function CollapsibleDriverGroup({ label, open, setOpen, items, role, onOpenFactor, perItemRole, nodes, onOpenNews }) {
  return (
    <div className="mb-2">
      <button onClick={() => setOpen(!open)} className="mm-btn w-full flex items-center justify-between text-[10px] mb-1" style={{ color: "#3A4252" }}>
        <span>{label}</span>
        <ChevronRight size={11} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
        <div className="flex flex-col gap-1 mm-fade-in">
          {items.map((f) => {
            const { edge, node: dn, sign } = f;
            const itemRole = perItemRole ? (f.structuralRank >= 2 ? ROLE_META.structuralSupport : ROLE_META.background) : role;
            return (
              <button key={edge.id} onClick={() => onOpenFactor(edge.id)} className="mm-btn w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-md" style={{ background: "#0F1520" }}>
                <span className="text-[12px] truncate" style={{ color: "#B7BFCC" }}>{sign > 0 ? "\u{1F7E2}" : sign < 0 ? "\u{1F534}" : "\u26AA"} {dn.label} {dn.direction}</span>
                <span className="flex items-center shrink-0">
                  <NewsDot node={dn} nodes={nodes} onOpenNews={onOpenNews} />
                  <RoleTag role={itemRole} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NodePanel({ node, nodes, edges, updateNode, deleteNode, addEvidence, drillInto, driversInto, focusOnNode, onOpenNews, onOpenFactor }) {
  const [showAddEv, setShowAddEv] = useState(false);
  const [showContradicting, setShowContradicting] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [showStructural, setShowStructural] = useState(false);
  if (!node) return <div className="w-80 shrink-0 border-l" style={{ borderColor: "#1B212C" }} />;
  const hasKids = (node.childrenIds || []).length > 0;
  const surprise = node.actual != null && node.expected != null ? (node.actual - node.expected).toFixed(1) : null;
  const newsDisplay = getDisplayNewsForNode(node, nodes);
  const bias = computeBias(node.id, nodes, edges);
  const buckets = bias ? bucketDrivers(bias.bias === "mixed" ? bias.drivers : bias.supporting) : null;
  const whatChanged = buckets ? buildWhatChanged(buckets.core, buckets.secondary) : [];
  const whatCouldChange = bias ? buildWhatCouldChange(node, buckets.core) : node.whatCouldChange;
  const noDominantCatalyst = !bias || bias.bias === "neutral";
  const pricingSummary = buildPricingSummary(bias, buckets, noDominantCatalyst);

  // "Contexte récent" candidates: every factor already surfaced in the driver buckets above,
  // PLUS factors that currently sit flat ("\u2192", so computeBias drops them entirely) but are
  // still connected to this node \u2014 those are exactly the ones that need context most, since
  // there's no catalyst to explain them otherwise. Deduplicated by node id.
  const allFactors = getAllFactors(node.id, nodes, edges);
  const flatFactorNodes = allFactors.filter((f) => f.sign === 0).map((f) => f.node);
  const contextCandidateNodes = [];
  const seenContextIds = new Set();
  const pushCandidate = (n) => { if (n && !seenContextIds.has(n.id)) { seenContextIds.add(n.id); contextCandidateNodes.push(n); } };
  if (buckets) { buckets.core.forEach((f) => pushCandidate(f.node)); buckets.secondary.forEach((f) => pushCandidate(f.node)); buckets.structural.forEach((f) => pushCandidate(f.node)); }
  flatFactorNodes.forEach(pushCandidate);
  const contextEntries = contextCandidateNodes
    .map((n) => {
      const display = getDisplayNewsForNode(n, nodes);
      // Real active news (isContextOnly === false) doesn't carry its own kind tag \u2014 it's
      // inherently a live catalyst, so label it as such rather than falling through to the
      // ContextCard's generic "context" default.
      const items = display.items.map((it) => (it.kind ? it : { ...it, kind: display.isContextOnly ? "context" : "catalyst" }));
      return { node: n, items };
    })
    .filter((c) => c.items.length > 0);

  return (
    <div className="w-80 shrink-0 border-l flex flex-col mm-scroll overflow-y-auto" style={{ borderColor: "#1B212C", background: "#0B0F15" }}>
      <div className="p-4 border-b" style={{ borderColor: "#1B212C" }}>
        <input value={node.label} onChange={(e) => updateNode(node.id, { label: e.target.value })} className="w-full bg-transparent text-[15px] font-semibold outline-none" style={{ color: "#E7EAEE" }} />
        <div className="text-[11px] mt-1 flex items-center gap-3" style={{ color: "#545D6E" }}>
          {hasKids && <button onClick={() => drillInto(node.id)} className="mm-btn flex items-center gap-1" style={{ color: "#C9A24B" }}>{T.mindmap.zoomIn} <ArrowRight size={11} /></button>}
          {newsDisplay.items.length > 0 && (
            <button onClick={() => onOpenNews(node.id)} className="mm-btn flex items-center gap-1" style={{ color: newsDisplay.isContextOnly ? "#8A93A3" : "#E6C260" }}>
              {newsDisplay.isContextOnly ? <span style={{ fontSize: 11, lineHeight: 1 }}>{"\u{1F4A4}"}</span> : <Newspaper size={11} />}
              {newsDisplay.isContextOnly ? `Derni\u00e8re info connue (${newsDisplay.items.length})` : T.node.recentNews(newsDisplay.items.length)}
            </button>
          )}
        </div>
      </div>

      {(bias || flatFactorNodes.length > 0) && (
        <div className="p-4 border-b" style={{ borderColor: "#1B212C", background: "#0F1520" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10.5px] mb-1" style={{ color: "#545D6E" }}>{T.bias.currentBias}</div>
              <div className="text-[15px] font-semibold" style={{ color: bias ? BIAS_META[bias.bias].color : BIAS_META.neutral.color }}>
                {bias ? `${BIAS_META[bias.bias].emoji} ${BIAS_META[bias.bias].label}` : `${BIAS_META.neutral.emoji} ${BIAS_META.neutral.label}`}
              </div>
            </div>
            {bias && (
              <div className="text-right">
                <div className="text-[10.5px] mb-1" style={{ color: "#545D6E" }}>{T.bias.confidence}</div>
                <div className="text-[13px] font-medium mm-mono" style={{ color: "#C9A24B" }}>{{ High: T.bias.high, Medium: T.bias.medium, Low: T.bias.low }[bias.confidence]}</div>
              </div>
            )}
          </div>

          {bias?.bias === "mixed" && (
            <div className="text-[11.5px] mb-3 rounded-md px-2.5 py-2" style={{ background: "rgba(167,139,250,0.1)", color: "#B7BFCC" }}>
              {T.bias.mixedNote}
            </div>
          )}

          {/* Ce qui price actuellement */}
          <div className="text-[11.5px] mb-3 rounded-md px-2.5 py-2" style={{ background: noDominantCatalyst ? "rgba(138,147,163,0.1)" : "rgba(201,162,75,0.08)", color: "#B7BFCC" }}>
            {pricingSummary}
          </div>

          {bias && (() => {
            const chain = traceCausalChain(node.id, nodes, edges);
            return chain ? (
              <div className="mb-3">
                <div className="text-[10px] mb-1.5" style={{ color: "#3A4252" }}>{T.bias.causalChain}</div>
                <div className="flex flex-wrap items-center gap-1 text-[11px]" style={{ color: "#B7BFCC" }}>
                  {chain.map((step, i) => (
                    <React.Fragment key={step.node.id}>
                      {i > 0 && <ChevronRight size={10} color="#3A4252" />}
                      <button onClick={() => focusOnNode(step.node.id)} className="mm-btn px-1.5 py-0.5 rounded" style={{ background: "#131720" }}>{step.node.label} {step.node.direction}</button>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* Facteurs principaux */}
          {bias && (
            <>
              <div className="text-[10.5px] mb-1.5 flex items-center gap-1.5" style={{ color: "#545D6E" }}><Zap size={11} /> {T.bias.why}</div>

              <DriverGroup label={bias.bias === "mixed" ? null : "DRIVERS ACTUELS"} role={ROLE_META.core} items={buckets.core} onOpenFactor={onOpenFactor} nodes={nodes} onOpenNews={onOpenNews} />

              {buckets.secondary.length > 0 && (
                <CollapsibleDriverGroup label={`Facteurs secondaires (${buckets.secondary.length})`} open={showSecondary} setOpen={setShowSecondary}
                  items={buckets.secondary} role={ROLE_META.secondary} onOpenFactor={onOpenFactor} nodes={nodes} onOpenNews={onOpenNews} />
              )}
              {buckets.structural.length > 0 && (
                <CollapsibleDriverGroup label={`Contexte structurel (${buckets.structural.length})`} open={showStructural} setOpen={setShowStructural}
                  items={buckets.structural} onOpenFactor={onOpenFactor} perItemRole nodes={nodes} onOpenNews={onOpenNews} />
              )}

              {bias.bias !== "mixed" && bias.contradicting.length > 0 && (
                <>
                  <button onClick={() => setShowContradicting(!showContradicting)} className="mm-btn w-full flex items-center justify-between text-[10px] mb-1 mt-1" style={{ color: "#3A4252" }}>
                    <span>{T.bias.contradictingEvidence} ({bias.contradicting.length})</span>
                    <ChevronRight size={11} style={{ transform: showContradicting ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                  </button>
                  {showContradicting && (
                    <div className="flex flex-col gap-1 mm-fade-in">
                      {bias.contradicting.map(({ edge, node: dn, sign }) => (
                        <button key={edge.id} onClick={() => onOpenFactor(edge.id)} className="mm-btn w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-md" style={{ background: "rgba(229,72,77,0.08)" }}>
                          <span className="text-[12px] truncate" style={{ color: "#E7EAEE" }}>{sign > 0 ? "\u{1F7E2}" : "\u{1F534}"} {dn.label} {dn.direction}</span>
                          <span className="flex items-center shrink-0">
                            <NewsDot node={dn} nodes={nodes} onOpenNews={onOpenNews} />
                            <span className="text-[9.5px] mm-mono ml-2" style={{ color: "#545D6E" }}>{(IMPACT_TIER[edge.strength] || IMPACT_TIER.Low).label}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Contexte récent des facteurs */}
          {contextEntries.length > 0 && (
            <div className="mt-3">
              <div className="text-[10.5px] mb-1.5 flex items-center gap-1.5" style={{ color: "#545D6E" }}>
                <Newspaper size={11} /> CONTEXTE R\u00c9CENT DES FACTEURS
              </div>
              <div className="text-[10px] mb-2" style={{ color: "#3A4252" }}>
                Dernières informations disponibles pour comprendre l'état de chaque facteur \u2014 même sans catalyseur actuel. Distinct du biais ci-dessus, qui ne bouge que si le facteur bouge réellement le prix.
              </div>
              {contextEntries.map(({ node: fn, items }) => (
                <ContextCard key={fn.id} node={fn} items={items} onOpenFactor={() => focusOnNode(fn.id)} />
              ))}
            </div>
          )}

          {/* Dernier changement significatif */}
          {whatChanged.length > 0 && (
            <div className="mb-1 mt-3 rounded-md p-2.5" style={{ background: "#131720" }}>
              <div className="text-[10px] mb-1.5 font-medium" style={{ color: "#8A93A3" }}>DERNIER CHANGEMENT SIGNIFICATIF</div>
              <ul className="flex flex-col gap-1">
                {whatChanged.map((s, i) => <li key={i} className="text-[11.5px] leading-snug" style={{ color: "#B7BFCC" }}>\u2022 {s}</li>)}
              </ul>
            </div>
          )}

          {/* Ce qui pourrait invalider/inverser le biais */}
          {whatCouldChange?.length > 0 && (
            <div className="mt-3 rounded-md p-2.5" style={{ background: "rgba(240,136,62,0.08)" }}>
              <div className="text-[10px] mb-1.5 font-medium flex items-center gap-1.5" style={{ color: "#F0883E" }}><AlertTriangle size={11} /> CE QUI POURRAIT INVALIDER / INVERSER CE BIAIS</div>
              <ul className="flex flex-col gap-1">
                {whatCouldChange.map((s, i) => <li key={i} className="text-[11.5px] leading-snug" style={{ color: "#B7BFCC" }}>\u2022 {s}</li>)}
              </ul>
            </div>
          )}

          {bias && <div className="mt-2 text-[10px]" style={{ color: "#3A4252" }}>{T.bias.clickDriverHint}</div>}
        </div>
      )}

      {node.calendarDate && (
        <div className="p-4 border-b" style={{ borderColor: "#1B212C", background: "#0F1520" }}>
          <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "#C9A24B" }}><CalendarIcon size={12} /> {node.calendarDate} \u00b7 {T.node.importance} {IMPORTANCE_META[node.calendarImportance || node.importance]?.label}</div>
          {node.actual != null && (
            <div className="grid grid-cols-3 gap-2 text-[11.5px] mm-mono mb-2">
              <div><div style={{ color: "#545D6E" }}>{T.node.actual}</div><div style={{ color: "#E7EAEE" }}>{node.actual}%</div></div>
              <div><div style={{ color: "#545D6E" }}>{T.node.expected}</div><div style={{ color: "#8A93A3" }}>{node.expected}%</div></div>
              <div><div style={{ color: "#545D6E" }}>{T.node.previous}</div><div style={{ color: "#8A93A3" }}>{node.previous}%</div></div>
            </div>
          )}
          {surprise !== null && <div className="text-[11.5px] mm-mono" style={{ color: Number(surprise) > 0 ? "#E5484D" : "#4CC38A" }}>{T.node.surprise}\u00a0: {surprise > 0 ? "+" : ""}{surprise}pp vs consensus</div>}
          {node.potentialImpactChain && (
            <div className="mt-2">
              <div className="text-[10.5px] mb-1" style={{ color: "#545D6E" }}>{T.node.potentialImpactChain} si plus \u00e9lev\u00e9 que pr\u00e9vu</div>
              <div className="flex flex-col gap-0.5">{node.potentialImpactChain.map((s, i) => <div key={i} className="text-[11.5px] mm-mono" style={{ color: "#B7BFCC" }}>{i > 0 && "\u2193 "}{s}</div>)}</div>
            </div>
          )}
        </div>
      )}

      <div className="p-4 flex flex-col gap-3 border-b" style={{ borderColor: "#1B212C" }}>
        <textarea value={node.desc} onChange={(e) => updateNode(node.id, { desc: e.target.value })} rows={2} className="w-full text-[12.5px] rounded-md p-2 resize-none outline-none" style={{ background: "#131720", border: "1px solid #212734", color: "#B7BFCC" }} placeholder="Description" />
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput label={T.node.currentValue} value={node.value} onChange={(v) => updateNode(node.id, { value: v })} />
          <LabeledInput label={T.node.previousValue} value={node.prev} onChange={(v) => updateNode(node.id, { prev: v })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <LabeledSelect label={T.node.status} value={node.status} onChange={(v) => updateNode(node.id, { status: v })} options={Object.entries(STATUS_META).map(([k, m]) => [k, m.label])} />
          <LabeledSelect label={T.node.trend} value={node.direction} onChange={(v) => updateNode(node.id, { direction: v })} options={[["\u2191", T.node.up], ["\u2193", T.node.down], ["\u2192", T.node.stable]]} />
        </div>
        <LabeledSelect label={T.node.importance} value={node.importance} onChange={(v) => updateNode(node.id, { importance: v })} options={Object.entries(IMPORTANCE_META).map(([k, m]) => [k, m.label])} />
        <div className="grid grid-cols-2 gap-2 text-[11px] mm-mono" style={{ color: "#545D6E" }}>
          <div>Source\u00a0: {node.source}</div><div>Mise \u00e0 jour\u00a0: {node.lastUpdate}</div>
        </div>
      </div>

      {!bias && node.whatCouldChange && (
        <div className="p-4 border-b" style={{ borderColor: "#1B212C" }}>
          <div className="text-[11px] mb-2 flex items-center gap-1.5" style={{ color: "#545D6E" }}><AlertTriangle size={11} /> Qu'est-ce qui pourrait changer cette situation\u00a0?</div>
          <ul className="flex flex-col gap-1">{node.whatCouldChange.map((s, i) => <li key={i} className="text-[12px]" style={{ color: "#B7BFCC" }}>{s}</li>)}</ul>
        </div>
      )}

      <div className="p-4 border-b" style={{ borderColor: "#1B212C" }}>
        <div className="text-[11px] mb-2 flex items-center gap-1.5" style={{ color: "#545D6E" }}><StickyNote size={11} /> {T.node.personalNote}</div>
        <textarea value={node.note} onChange={(e) => updateNode(node.id, { note: e.target.value })} rows={3} placeholder={T.node.notePlaceholder} className="w-full text-[12.5px] rounded-md p-2 resize-none outline-none" style={{ background: "#171102", border: "1px solid #3A2E12", color: "#E6C260" }} />
      </div>

      <div className="p-4 border-b" style={{ borderColor: "#1B212C" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px]" style={{ color: "#545D6E" }}>Preuves</span>
          <button onClick={() => setShowAddEv(!showAddEv)} className="mm-btn text-[11px]" style={{ color: "#C9A24B" }}>+ {T.common.add}</button>
        </div>
        <EvidenceList items={node.evidence} />
        {showAddEv && <AddEvidenceForm onAdd={(item) => { addEvidence("node", node.id, item); setShowAddEv(false); }} onCancel={() => setShowAddEv(false)} />}
      </div>

      {node.id !== "global" && (
        <div className="p-4">
          <button onClick={() => deleteNode(node.id)} className="mm-btn w-full flex items-center justify-center gap-2 text-[12.5px] rounded-md py-2" style={{ border: "1px solid #3A2226", color: "#E5484D" }}><Trash2 size={13} /> {T.node.deleteNode}</button>
        </div>
      )}
    </div>
  );
}

function EdgePanel({ edge, nodes, updateEdge, removeEdge, addEvidence, onClose, focusOnNode }) {
  const [showAddEv, setShowAddEv] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const a = nodes[edge.from], b = nodes[edge.to];
  const meta = RELATION_META[edge.relation];
  const strengthColor = edge.strength === "High" ? "#4CC38A" : edge.strength === "Moderate" ? "#E6C260" : edge.strength === "Low" ? "#8A93A3" : "#545D6E";
  const classMeta = EVIDENCE_CLASS_META[edge.evidenceClass] || EVIDENCE_CLASS_META.interpretation;
  const reasoning = buildReasoning(edge, nodes);

  return (
    <div className="w-80 shrink-0 border-l flex flex-col mm-scroll overflow-y-auto" style={{ borderColor: "#1B212C", background: "#0B0F15" }}>
      <div className="p-4 border-b flex items-start justify-between" style={{ borderColor: "#1B212C" }}>
        <div>
          <div className="text-[11px] mb-1" style={{ color: "#545D6E" }}>{T.relation.whyConnected}</div>
          <div className="text-[14px] font-medium leading-snug">
            <span className="cursor-pointer" onClick={() => focusOnNode(a.id)} style={{ textDecoration: "underline dotted" }}>{a?.label}</span>
            {" "}<span style={{ color: meta?.color }}>\u2192 {meta?.label} \u2192</span>{" "}
            <span className="cursor-pointer" onClick={() => focusOnNode(b.id)} style={{ textDecoration: "underline dotted" }}>{b?.label}</span>
          </div>
          <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ color: classMeta.color, background: `${classMeta.color}1A` }}>{classMeta.label}</span>
        </div>
        <button onClick={onClose} className="mm-btn shrink-0"><X size={14} color="#545D6E" /></button>
      </div>

      <div className="p-4 flex flex-col gap-3 border-b" style={{ borderColor: "#1B212C" }}>
        <textarea value={edge.desc} onChange={(e) => updateEdge(edge.id, { desc: e.target.value })} rows={2} placeholder="Description de la relation" className="w-full text-[12.5px] rounded-md p-2 resize-none outline-none" style={{ background: "#131720", border: "1px solid #212734", color: "#B7BFCC" }} />
        <div className="flex items-center justify-between text-[12.5px]">
          <span style={{ color: "#545D6E" }}>{T.relation.currentStrength}</span>
          <span className="mm-mono" style={{ color: strengthColor }}>{{ High: T.relation.strong, Moderate: T.relation.moderate, Low: T.relation.weak }[edge.strength] || T.relation.unrated}</span>
        </div>
        <div className="text-[12.5px]" style={{ color: "#B7BFCC" }}>
          {T.relation.currentDirection}\u00a0: <span style={{ color: a && (STATUS_META[a.status]?.color) }}>{a?.label} {a?.direction}</span> \u2192 <span style={{ color: meta?.color }}>{meta?.label}</span> \u2192 <span style={{ color: b && (STATUS_META[b.status]?.color) }}>{b?.label} {b?.direction}</span>
        </div>
        {edge.marketImpact?.length > 0 && (
          <div>
            <div className="text-[10.5px] mb-1" style={{ color: "#545D6E" }}>{T.relation.marketImpact}</div>
            <div className="flex flex-wrap gap-1.5">{edge.marketImpact.map((m, i) => <span key={i} className="text-[11px] mm-mono px-2 py-0.5 rounded" style={{ background: "#131720", color: "#B7BFCC" }}>{m.market} {m.dir}</span>)}</div>
          </div>
        )}
      </div>

      <div className="p-4 border-b" style={{ borderColor: "#1B212C" }}>
        <button onClick={() => setShowReasoning(!showReasoning)} className="mm-btn w-full flex items-center justify-between text-left text-[11.5px]" style={{ color: "#C9A24B" }}>
          <span>{T.relation.whyExists}</span>
          <ChevronRight size={12} style={{ transform: showReasoning ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
        </button>
        {showReasoning && (
          <ol className="mt-2.5 flex flex-col gap-1.5 mm-fade-in">
            {reasoning.map((line, i) => (
              <li key={i} className="text-[12px] flex gap-1.5" style={{ color: "#B7BFCC" }}>
                <span style={{ color: "#545D6E" }}>{i + 1}.</span><span>{line}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="p-4 border-b" style={{ borderColor: "#1B212C" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px]" style={{ color: "#545D6E" }}>{T.relation.evidenceConfidence}</span>
          <span className="mm-mono text-[13px] font-medium" style={{ color: edge.confidence ? "#C9A24B" : "#545D6E" }}>{edge.confidence ? `${edge.confidence}%` : "\u2014"}</span>
        </div>
        <div className="text-[10.5px] mb-2" style={{ color: "#545D6E" }}>{T.relation.confidenceHint}</div>
        {edge.evidenceChecklist?.length > 0 && (
          <div className="flex flex-col gap-1">{edge.evidenceChecklist.map((s, i) => <div key={i} className="text-[12px]" style={{ color: "#8A93A3" }}>\u2713 {s}</div>)}</div>
        )}
      </div>

      <div className="p-4 border-b" style={{ borderColor: "#1B212C" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px]" style={{ color: "#545D6E" }}>{T.relation.recentEvidence}</span>
          <button onClick={() => setShowAddEv(!showAddEv)} className="mm-btn text-[11px]" style={{ color: "#C9A24B" }}>+ {T.common.add}</button>
        </div>
        <EvidenceList items={edge.evidence} />
        {showAddEv && <AddEvidenceForm onAdd={(item) => { addEvidence("edge", edge.id, item); setShowAddEv(false); }} onCancel={() => setShowAddEv(false)} />}
      </div>

      {edge.contradictingEvidence?.length > 0 && (
        <div className="p-4 border-b" style={{ borderColor: "#1B212C" }}>
          <div className="text-[11px] mb-2" style={{ color: "#545D6E" }}>{T.bias.contradictingEvidence}</div>
          <div className="flex flex-col gap-2">
            {edge.contradictingEvidence.map((it, i) => {
              const tier = sourceTier(it.source);
              return (
                <div key={i} className="rounded-md p-2.5" style={{ background: "rgba(229,72,77,0.07)", border: "1px solid rgba(229,72,77,0.2)" }}>
                  <div className="text-[10.5px] mm-mono mb-1" style={{ color: "#545D6E" }}>{it.date} \u00b7 {it.source}{tier && <span style={{ color: tier.color }}> \u00b7 {tier.label}</span>}</div>
                  <div className="text-[12px] font-medium mb-1" style={{ color: "#E7EAEE" }}>{it.headline}</div>
                  <div className="text-[11.5px]" style={{ color: "#B7BFCC" }}>{it.summary}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-4">
        <button onClick={() => { removeEdge(edge.id); onClose(); }} className="mm-btn w-full flex items-center justify-center gap-2 text-[12.5px] rounded-md py-2" style={{ border: "1px solid #3A2226", color: "#E5484D" }}><Trash2 size={13} /> {T.relation.deleteRelationship}</button>
      </div>
    </div>
  );
}

function NewsPanel({ node, items, isContextOnly, onClose }) {
  return (
    <div className="w-80 shrink-0 border-l flex flex-col mm-scroll overflow-y-auto" style={{ borderColor: "#1B212C", background: "#0B0F15" }}>
      <div className="p-4 border-b flex items-start justify-between" style={{ borderColor: "#1B212C" }}>
        <div>
          <div className="text-[11px] mb-1 flex items-center gap-1.5" style={{ color: "#545D6E" }}><Newspaper size={12} /> {T.news.recentNews}</div>
          <div className="text-[15px] font-semibold">{T.news.explaining(node?.label || "ce n\u0153ud")}</div>
        </div>
        <button onClick={onClose} className="mm-btn shrink-0"><X size={14} color="#545D6E" /></button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {isContextOnly && items.length > 0 && (
          <div className="text-[11px] rounded-md px-3 py-2.5 leading-snug" style={{ background: "rgba(138,147,163,0.08)", color: "#8A93A3", border: "1px dashed #2C3444" }}>
            {"\u{1F4A4}"} Aucune actualit\u00e9 r\u00e9cente n'influence directement le prix via ce facteur en ce moment. Voici la derni\u00e8re information disponible \u2014 elle explique l'\u00e9tat actuel du facteur, mais ce n'est pas un catalyseur actif.
          </div>
        )}
        {items.length === 0 && (
          <div className="text-[12px] rounded-md px-3 py-2.5" style={{ background: "#131720", color: "#545D6E", border: "1px dashed #2C3444" }}>
            {T.news.noNews}
          </div>
        )}
        {items.map((it, i) => {
          const kindMeta = it.kind ? CONTEXT_KIND_META[it.kind] : null;
          const rel = !kindMeta ? (RELEVANCE_META[it.relevance] || RELEVANCE_META.low) : null;
          const tier = sourceTier(it.source);
          const plat = it.platform && PLATFORM_META[it.platform];
          return (
            <div key={i} className="rounded-md p-3" style={{ background: "#131720", border: plat ? `1px solid ${plat.color}30` : kindMeta ? `1px solid ${kindMeta.color}30` : "1px solid #212734" }}>
              <div className="flex items-center justify-between mb-1.5">
                {kindMeta ? (
                  <span className="text-[10.5px] px-1.5 py-0.5 rounded font-medium" style={{ color: kindMeta.color, background: `${kindMeta.color}1A` }}>{kindMeta.emoji} {kindMeta.label}</span>
                ) : (
                  <span className="text-[10.5px] px-1.5 py-0.5 rounded" style={{ color: rel.color, background: `${rel.color}1A` }}>{rel.emoji} {rel.label}</span>
                )}
                <span className="text-[10px] mm-mono" style={{ color: "#545D6E" }}>{it.date}{it.time ? ` \u00b7 ${it.time}` : ""}</span>
              </div>
              {it.synthetic ? (
                <div className="text-[13px] font-medium mb-1 leading-snug" style={{ color: "#E7EAEE" }}>{it.headline}</div>
              ) : (
                <a href={it.link || newsSearchUrl(it)} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium mb-1 leading-snug flex items-start gap-1 hover:underline" style={{ color: "#E7EAEE" }}>
                  {plat && <span className="shrink-0">{plat.icon}</span>} {it.headline} <ExternalLink size={11} className="shrink-0 mt-0.5" style={{ opacity: 0.6 }} />
                </a>
              )}
              <div className="text-[10.5px] mm-mono mb-2 flex items-center gap-1.5" style={{ color: "#8A93A3" }}>
                <span>{it.source}{it.link ? " \u2197" : ""}</span>
                {plat && plat.label !== "Article" && <span className="text-[9px] px-1 py-0.5 rounded" style={{ color: plat.color, background: `${plat.color}1A` }}>{plat.label}</span>}
                {tier && <span className="text-[9px] px-1 py-0.5 rounded" style={{ color: tier.color, background: `${tier.color}1A` }}>{tier.label}</span>}
              </div>
              <div className="text-[10px] mb-1" style={{ color: "#3A4252" }}>{T.news.macroMapSummary}</div>
              <p className="text-[12px] mb-2 leading-relaxed" style={{ color: "#8A93A3" }}>{it.summary}</p>
              {it.why && (
                <div className="text-[11.5px] mb-2 rounded px-2 py-1.5" style={{ background: "#0F1520", color: "#B7BFCC" }}>
                  <span style={{ color: "#545D6E" }}>{T.news.whyItMatters} </span>{it.why}
                </div>
              )}
              {it.link ? (
                <a href={it.link} target="_blank" rel="noopener noreferrer" className="mm-btn inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1.5 rounded-md" style={{ border: "1px solid #2C3444", color: "#C9A24B" }}>
                  {T.news.readOriginal} <ExternalLink size={11} />
                </a>
              ) : it.synthetic ? null : (
                <a href={newsSearchUrl(it)} target="_blank" rel="noopener noreferrer" className="mm-btn inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1.5 rounded-md" style={{ border: "1px solid #2C3444", color: "#8A93A3" }}>
                  {T.news.searchOriginal} <ExternalLink size={11} />
                </a>
              )}
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-4 text-[10.5px]" style={{ color: "#545D6E" }}>{T.news.relevanceHint}</div>
    </div>
  );
}

function FactorDetailPanel({ edge, nodes, onClose, focusOnNode }) {
  const factor = nodes[edge.from];
  const target = nodes[edge.to];
  if (!factor || !target) return null;
  const sign = edgeSign(edge, nodes);
  const impact = sign > 0 ? "bullish" : sign < 0 ? "bearish" : "neutral";
  const twin = findTwin(factor, nodes);
  const newsItems = getNewsForNode(factor, nodes);
  const combinedEvidence = [
    ...(edge.evidence || []),
    ...newsItems.map((it) => ({ type: "news", date: it.date, source: it.source, headline: it.headline, summary: it.summary, why: it.why, data: null, impact: [], link: it.link })),
  ];
  const dp = getDataPoints(factor) || getDataPoints(twin);
  const change = dp ? computeChange(dp.current, dp.previous) : null;
  const historyNode = factor.prev && factor.prev !== "\u2014" ? factor : twin && twin.prev && twin.prev !== "\u2014" ? twin : null;

  const sources = new Set();
  if (factor.source) sources.add(factor.source);
  (edge.evidenceChecklist || []).forEach((s) => sources.add(s));
  combinedEvidence.forEach((it) => it.source && sources.add(it.source));

  return (
    <div className="w-96 shrink-0 border-l flex flex-col mm-scroll overflow-y-auto" style={{ borderColor: "#1B212C", background: "#0B0F15" }}>
      <div className="p-4 border-b flex items-start justify-between" style={{ borderColor: "#1B212C" }}>
        <div>
          <div className="text-[11px] mb-1" style={{ color: "#545D6E" }}>Factor breakdown</div>
          <div className="text-[15px] font-semibold flex items-center gap-2">
            {factor.label} <span className="mm-mono text-[13px]" style={{ color: STATUS_META[factor.status]?.color }}>{factor.direction}</span>
          </div>
          <button onClick={() => focusOnNode(factor.id)} className="mm-btn mt-1 text-[11px] flex items-center gap-1" style={{ color: "#C9A24B" }}>Open in mindmap <ArrowRight size={10} /></button>
        </div>
        <button onClick={onClose} className="mm-btn shrink-0"><X size={14} color="#545D6E" /></button>
      </div>

      <PanelSection title={T.factor.currentState}>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "#D3D8E0" }}>{describeState(factor)}</p>
      </PanelSection>

      <PanelSection title={T.factor.historicalContext}>
        {historyNode ? (
          <p className="text-[12.5px] leading-relaxed" style={{ color: "#B7BFCC" }}>
            Previously: <span className="mm-mono" style={{ color: "#8A93A3" }}>{historyNode.prev}</span> \u2192 now <span className="mm-mono" style={{ color: "#E7EAEE" }}>{historyNode.value}</span>.
          </p>
        ) : (
          <EmptyNote text="No historical series attached to this factor yet." />
        )}
      </PanelSection>

      <PanelSection title={`Why it affects ${target.label}`}>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "#D3D8E0" }}>
          {edge.desc || `A ${RELATION_META[edge.relation]?.label.toLowerCase()} relationship with ${target.label}.`}
        </p>
      </PanelSection>

      <PanelSection title={`Impact on ${target.label}`}>
        <span className="text-[13px] font-semibold" style={{ color: BIAS_META[impact].color }}>{BIAS_META[impact].emoji} {BIAS_META[impact].label}</span>
        {edge.strength && <span className="ml-2 text-[10.5px] mm-mono" style={{ color: "#545D6E" }}>{(IMPACT_TIER[edge.strength] || IMPACT_TIER.Low).label}</span>}
      </PanelSection>

      <PanelSection title={T.factor.recentData}>
        {dp ? (
          <div className="grid grid-cols-3 gap-2 text-[11.5px] mm-mono">
            <div><div style={{ color: "#545D6E" }}>Current</div><div style={{ color: "#E7EAEE" }}>{dp.current}</div></div>
            <div><div style={{ color: "#545D6E" }}>Previous</div><div style={{ color: "#8A93A3" }}>{dp.previous || "\u2014"}</div></div>
            <div><div style={{ color: "#545D6E" }}>Change</div><div style={{ color: change ? (Number(change) > 0 ? "#E5484D" : "#4CC38A") : "#545D6E" }}>{change || "\u2014"}</div></div>
          </div>
        ) : (
          <EmptyNote text="No structured figures attached to this factor yet." />
        )}
      </PanelSection>

      <PanelSection title={T.factor.recentNews}>
        <EvidenceList items={combinedEvidence} />
      </PanelSection>

      <PanelSection title={T.factor.sources} noBorder>
        {sources.size > 0 ? (
          <div className="flex flex-col gap-1">{[...sources].map((s, i) => <div key={i} className="text-[12px]" style={{ color: "#8A93A3" }}>\u2713 {s}</div>)}</div>
        ) : (
          <EmptyNote text="No sources attached yet." />
        )}
      </PanelSection>
    </div>
  );
}

function PanelSection({ title, children, noBorder }) {
  return (
    <div className="p-4" style={noBorder ? {} : { borderBottom: "1px solid #1B212C" }}>
      <div className="text-[10.5px] mb-1.5 font-medium tracking-wide" style={{ color: "#545D6E" }}>{title}</div>
      {children}
    </div>
  );
}

function EmptyNote({ text }) {
  return <div className="text-[12px] rounded-md px-3 py-2.5" style={{ background: "#131720", color: "#545D6E", border: "1px dashed #2C3444" }}>{text}</div>;
}

function LabeledInput({ label, value, onChange }) {
  return <label className="flex flex-col gap-1"><span className="text-[10.5px]" style={{ color: "#545D6E" }}>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} className="text-[12.5px] rounded-md px-2 py-1.5 outline-none mm-mono" style={{ background: "#131720", border: "1px solid #212734", color: "#E7EAEE" }} /></label>;
}
function LabeledSelect({ label, value, onChange, options }) {
  return <label className="flex flex-col gap-1"><span className="text-[10.5px]" style={{ color: "#545D6E" }}>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="text-[12.5px] rounded-md px-2 py-1.5 outline-none" style={{ background: "#131720", border: "1px solid #212734", color: "#E7EAEE" }}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}

function AddNodeForm({ nodes, defaultParent, onCancel, onSubmit }) {
  const all = Object.values(nodes).sort((a, b) => a.label.localeCompare(b.label));
  const [label, setLabel] = useState(""); const [parent, setParent] = useState(defaultParent);
  const [importance, setImportance] = useState("relevant"); const [status, setStatus] = useState("neutral"); const [direction, setDirection] = useState("\u2192");
  return (
    <div className="w-80 shrink-0 border-l p-4 flex flex-col gap-3" style={{ borderColor: "#1B212C", background: "#0B0F15" }}>
      <div className="flex items-center justify-between"><span className="text-[13px] font-medium">Add node</span><button onClick={onCancel} className="mm-btn"><X size={14} color="#545D6E" /></button></div>
      <LabeledInput label="Nom" value={label} onChange={setLabel} />
      <LabeledSelect label="Attach under" value={parent} onChange={setParent} options={all.map((n) => [n.id, n.label])} />
      <LabeledSelect label={T.node.status} value={status} onChange={setStatus} options={Object.entries(STATUS_META).map(([k, m]) => [k, m.label])} />
      <LabeledSelect label={T.node.trend} value={direction} onChange={setDirection} options={[["\u2191", T.node.up], ["\u2193", T.node.down], ["\u2192", T.node.stable]]} />
      <LabeledSelect label="Importance" value={importance} onChange={setImportance} options={Object.entries(IMPORTANCE_META).map(([k, m]) => [k, m.label])} />
      <button disabled={!label.trim()} onClick={() => onSubmit({ label: label.trim(), parent, importance, status, direction })} className="mm-btn mt-1 py-2 rounded-md text-[12.5px] font-medium" style={{ background: label.trim() ? "#C9A24B" : "#232935", color: label.trim() ? "#0A0D12" : "#545D6E" }}>Add node</button>
    </div>
  );
}

/* --------------------------------- views ----------------------------------- */

function OverviewView({ macroScore, setMacroScore, regime, macroStory, aiMessages, aiInput, setAiInput, aiLoading, askAI, marketBias, biasColor, biasLabel, nodes, focusOnNode, calendarNodes, setTab }) {
  const scoreKeys = [["inflation", "Inflation"], ["growth", "Croissance"], ["fed", "Fed"], ["usd", "USD"], ["liquidity", "Liquidit\u00e9"], ["risk", "App\u00e9tit pour le risque"]];
  const MARKET_DISPLAY_NODE = { xauusd: "gold", dxy: "dxy", nasdaq: "nasdaq", spx: "spx", ust: "us10y", btc: "btc", oil: "oil" };
  const upcoming = (calendarNodes || []).filter((ev) => (ev.calendarSort || 0) >= CALENDAR_TODAY_DAY);
  const nextEvent = upcoming[0] || null;
  const [galaxyOn] = useGalaxyPref();

  return (
    <div className="flex-1 overflow-y-auto mm-scroll p-6 flex flex-col gap-6">
      {/* Hero: regime + macro story */}
      <div className="mm-pop-in rounded-xl p-5 relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(201,162,75,0.10), #0B0E13 70%)", border: "1px solid rgba(201,162,75,0.25)" }}>
        <GalaxyBackground enabled={galaxyOn} layout="hero" accent="#C9A24B" />
        <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full mm-focal-glow" style={{ background: "#C9A24B", opacity: 0.07, "--mm-glow-color": "rgba(201,162,75,0.4)" }} />
        <div className="flex items-start justify-between gap-4 flex-wrap relative">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="mm-mono text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ background: "rgba(201,162,75,0.15)", color: "#C9A24B" }}>{regime}</span>
              <span className="mm-mono text-[10px] px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "#7B8496" }}>Instantan\u00e9 du 11 sept. 2026</span>
            </div>
            <p className="text-[14.5px] leading-relaxed" style={{ color: "#D3D8E0" }}>{macroStory}</p>
          </div>
          {nextEvent && (
            <button onClick={() => { setTab("calendar"); }} className="mm-btn shrink-0 rounded-lg px-3.5 py-2.5 flex items-center gap-3 mm-glass">
              <div className="text-center">
                <div className="text-[9px] mm-mono" style={{ color: "#7B8496" }}>{CALENDAR_MONTH_LABEL}</div>
                <div className="text-[18px] font-bold leading-none" style={{ color: IMPORTANCE_META[nextEvent.calendarImportance || nextEvent.importance].color }}>{nextEvent.calendarDate?.replace(/^\D*/, "")}</div>
              </div>
              <div className="text-left">
                <div className="text-[9.5px]" style={{ color: "#7B8496" }}>Prochain \u00e9v\u00e9nement</div>
                <div className="text-[12.5px] font-medium" style={{ color: "#E7EAEE" }}>{nextEvent.label}</div>
              </div>
              <ChevronRight size={14} color="#3A4252" />
            </button>
          )}
        </div>
      </div>

      {/* Market KPI grid */}
      <div>
        <div className="text-[11px] mb-3" style={{ color: "#545D6E" }}>MARCH\u00c9S \u2014 BIAIS ACTUEL</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {MARKETS.map((m, i) => {
            const bias = marketBias?.[m.id];
            const color = bias ? biasColor(bias.score) : MARKET_ACCENT[m.id];
            const dNode = nodes?.[MARKET_DISPLAY_NODE[m.id]];
            const rootId = MARKET_NODE_MAP[m.id];
            return (
              <button
                key={m.id}
                onClick={() => { setTab("mindmap"); focusOnNode(rootId); }}
                className="mm-btn mm-node-pop text-left rounded-lg p-3 flex flex-col gap-1.5"
                style={{ background: "#12151C", border: `1px solid ${MARKET_ACCENT[m.id]}30`, animationDelay: `${i * 0.03}s` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-medium truncate" style={{ color: MARKET_ACCENT[m.id] }}>{m.emoji} {m.label}</span>
                  <span className="mm-dot-live shrink-0" style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}` }} />
                </div>
                <div className="text-[12px] mm-mono truncate" style={{ color: "#B7BFCC" }}>{dNode?.value && dNode.value !== "\u2014" ? dNode.value : "\u2014"}</div>
                {bias && <div className="text-[10px] font-medium" style={{ color }}>{biasLabel(bias.score)}</div>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Macro score */}
        <div className="mm-card p-5">
          <div className="text-[11px] mb-3" style={{ color: "#545D6E" }}>SCORE MACRO</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {scoreKeys.map(([k, label]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <span className="text-[11px]" style={{ color: "#8A93A3" }}>{label}</span>
                <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  {Object.entries(STATUS_META).map(([sk, sm]) => {
                    const active = macroScore[k] === sk;
                    return (
                      <button
                        key={sk}
                        onClick={() => setMacroScore((s) => ({ ...s, [k]: sk }))}
                        title={sm.label}
                        className="mm-btn flex-1 py-1.5 text-[10px] mm-mono"
                        style={{ background: active ? sm.color : "#11151C", color: active ? "#0A0D12" : "#545D6E", fontWeight: active ? 600 : 400 }}
                      >
                        {sm.label.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: "#1B212C" }}>
            <span className="text-[11px]" style={{ color: "#545D6E" }}>R\u00e9gime macro</span>
            <span className="mm-mono text-[13px] font-medium" style={{ color: "#C9A24B" }}>{regime}</span>
          </div>
        </div>

        {/* Ask the map */}
        <div className="mm-card p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "#545D6E" }}><Sparkles size={13} color="#C9A24B" /> DEMANDER \u00c0 LA CARTE</div>
          <div className="text-[11px]" style={{ color: "#545D6E" }}>Bas\u00e9 sur la vue actuellement affich\u00e9e dans la mind map \u2014 un raisonnement, pas une certitude.</div>
          {aiMessages.length > 0 && (
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto mm-scroll pr-1">
              {aiMessages.map((m, i) => <div key={i} className="text-[12.5px] rounded-md px-3 py-2 leading-relaxed" style={{ background: m.role === "user" ? "#171C26" : "#0F1520", color: m.role === "user" ? "#E7EAEE" : "#B7BFCC", border: m.role === "ai" ? "1px solid #212734" : "none" }}>{m.text}</div>)}
            </div>
          )}
          <div className="flex items-center gap-2 mt-auto">
            <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askAI()} placeholder="Pourquoi l'or baisse-t-il aujourd'hui\u00a0?" className="flex-1 text-[12.5px] rounded-md px-3 py-2 outline-none" style={{ background: "#131720", border: "1px solid #212734", color: "#E7EAEE" }} />
            <button onClick={askAI} disabled={aiLoading} className="mm-btn w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: "#C9A24B", color: "#0A0D12" }}>{aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tied to the data snapshot date (11 Sep 2026, see README) rather than the visitor's real
// clock \u2014 keeps "J-4 before the FOMC" style countdowns consistent with the rest of the
// snapshot's own internal "today". Update alongside a data refresh.
const CALENDAR_TODAY_DAY = 12;
const CALENDAR_MONTH_LABEL = "SEPT.";

function CalendarView({ events, focusOnNode, nodes }) {
  const today = CALENDAR_TODAY_DAY;
  const upcoming = events.filter((ev) => (ev.calendarSort || 0) >= today);
  const past = events.filter((ev) => (ev.calendarSort || 0) < today).slice().reverse();
  const hero = upcoming[0] || null;

  return (
    <div className="flex-1 overflow-y-auto mm-scroll p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[19px] font-semibold" style={{ color: "#E7EAEE" }}>Calendrier macro</div>
          <div className="text-[11.5px] mt-0.5" style={{ color: "#545D6E" }}>\u00c9v\u00e9nements int\u00e9gr\u00e9s \u00e0 la mind map \u2014 clique sur un \u00e9v\u00e9nement pour l'ouvrir directement dans son contexte.</div>
        </div>
        <div className="mm-mono text-[10.5px] px-2.5 py-1.5 rounded-md hidden md:block" style={{ background: "rgba(255,255,255,0.05)", color: "#7B8496" }}>
          Aujourd'hui \u00b7 11\u201312 sept. 2026
        </div>
      </div>

      {hero && <CalendarHero event={hero} today={today} onOpen={() => focusOnNode(hero.id)} nodes={nodes} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <CalendarTimeline
          title="\u00c0 venir"
          icon={<Clock size={13} />}
          accent="#C9A24B"
          events={upcoming}
          today={today}
          emptyLabel="Aucun \u00e9v\u00e9nement \u00e0 venir programm\u00e9."
          focusOnNode={focusOnNode}
        />
        <CalendarTimeline
          title="R\u00e9cemment publi\u00e9"
          icon={<CheckCircle2 size={13} />}
          accent="#545D6E"
          events={past}
          today={today}
          faded
          emptyLabel="Aucune publication r\u00e9cente enregistr\u00e9e."
          focusOnNode={focusOnNode}
        />
      </div>

      <div className="mt-6 text-[10.5px]" style={{ color: "#3A4252" }}>Entr\u00e9es de calendrier saisies manuellement \u2014 \u00e0 brancher sur un vrai calendrier \u00e9conomique (ex. FRED release schedule) pour un suivi automatique.</div>
    </div>
  );
}

function CalendarHero({ event, today, onOpen, nodes }) {
  const meta = IMPORTANCE_META[event.calendarImportance || event.importance];
  const statusMeta = STATUS_META[event.status] || STATUS_META.neutral;
  const daysOut = (event.calendarSort || 0) - today;
  const countdownLabel = daysOut === 0 ? "Aujourd'hui" : daysOut === 1 ? "Demain" : `Dans ${daysOut} jours`;
  const marketTags = (event.markets || []).map((mid) => MARKETS.find((m) => m.id === mid)).filter(Boolean);
  const { items } = getDisplayNewsForNode(event, nodes);
  const preview = items[0];

  return (
    <div
      onClick={onOpen}
      className="mm-btn mm-pop-in rounded-xl p-5 cursor-pointer relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${meta.color}14, #0B0E13 70%)`, border: `1px solid ${meta.color}40` }}
    >
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full mm-focal-glow" style={{ background: meta.color, opacity: 0.08, "--mm-glow-color": `${meta.color}55` }} />
      <div className="flex items-start justify-between gap-4 relative">
        <div className="flex items-start gap-4">
          <div className="rounded-lg px-3 py-2 text-center shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${meta.color}55` }}>
            <div className="text-[9.5px] mm-mono" style={{ color: "#8A93A3" }}>{CALENDAR_MONTH_LABEL}</div>
            <div className="text-[22px] font-bold leading-none mt-0.5" style={{ color: meta.color }}>{event.calendarSort}</div>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[9.5px] px-2 py-0.5 rounded-full font-semibold tracking-wide" style={{ color: "#0A0D12", background: meta.color }}>{countdownLabel.toUpperCase()}</span>
              <span className="text-[9.5px] px-1.5 py-0.5 rounded" style={{ color: meta.color, background: `${meta.color}1A` }}>{meta.label}</span>
              {marketTags.map((m) => <span key={m.id} className="text-[9.5px] px-1.5 py-0.5 rounded" style={{ color: MARKET_ACCENT[m.id], background: `${MARKET_ACCENT[m.id]}1A` }}>{m.emoji} {m.label}</span>)}
            </div>
            <div className="text-[17px] font-semibold" style={{ color: "#E7EAEE" }}>{event.label}</div>
            {event.value && event.value !== "\u2014" && <div className="text-[12.5px] mt-1" style={{ color: "#B7BFCC" }}>{event.value}</div>}
            {preview && <div className="text-[11px] mt-2 max-w-lg leading-snug" style={{ color: "#7B8496" }}>{preview.summary || preview.headline}</div>}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <span className="text-[9.5px] mm-mono flex items-center gap-1" style={{ color: statusMeta.color }}>
            <span className="mm-status-dot" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: statusMeta.color }} />
            {statusMeta.label}
          </span>
          <span className="mm-btn text-[10.5px] px-2.5 py-1 rounded-md flex items-center gap-1" style={{ border: "1px solid #2C3444", color: "#B7BFCC" }}>
            Ouvrir <ChevronRight size={11} />
          </span>
        </div>
      </div>
    </div>
  );
}

function CalendarTimeline({ title, icon, accent, events, today, faded, emptyLabel, focusOnNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium mb-3" style={{ color: accent }}>{icon} {title.toUpperCase()} <span className="mm-mono text-[10px]" style={{ color: "#3A4252" }}>({events.length})</span></div>
      {events.length === 0 ? (
        <div className="text-[11.5px] rounded-md px-3 py-3 border border-dashed" style={{ color: "#3A4252", borderColor: "#212734" }}>{emptyLabel}</div>
      ) : (
        <div className="relative pl-5">
          <div className="absolute left-[7px] top-1 bottom-1 w-px" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0.02))" }} />
          <div className="flex flex-col gap-2.5">
            {events.map((ev, i) => (
              <CalendarRow key={ev.id} event={ev} today={today} faded={faded} delay={i * 0.04} onOpen={() => focusOnNode(ev.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarRow({ event, today, faded, delay, onOpen }) {
  const meta = IMPORTANCE_META[event.calendarImportance || event.importance];
  const daysOut = (event.calendarSort || 0) - today;
  const countdown = daysOut === 0 ? "Aujourd'hui" : daysOut > 0 ? `J-${daysOut}` : `Il y a ${Math.abs(daysOut)}j`;
  const hasStats = event.actual != null || event.expected != null;
  return (
    <button
      onClick={onOpen}
      className="mm-btn mm-node-pop text-left rounded-lg p-3 flex items-center gap-3 relative w-full"
      style={{ background: "#12151C", border: "1px solid rgba(255,255,255,0.06)", opacity: faded ? 0.72 : 1, animationDelay: `${delay}s` }}
    >
      <span className="absolute -left-[21px] w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}90`, border: "2px solid #0B0E13" }} />
      <div className="shrink-0 w-11 text-center">
        <div className="text-[15px] font-bold leading-none" style={{ color: "#E7EAEE" }}>{event.calendarDate?.replace(/^\D*/, "")}</div>
        <div className="text-[8.5px] mm-mono mt-0.5" style={{ color: "#545D6E" }}>{CALENDAR_MONTH_LABEL}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12.5px] font-medium truncate" style={{ color: "#E7EAEE" }}>{event.label}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{ color: meta.color, background: `${meta.color}1A` }}>{meta.label}</span>
        </div>
        {hasStats && (
          <div className="flex items-center gap-3 mt-1 text-[10.5px] mm-mono" style={{ color: "#7B8496" }}>
            {event.expected != null && <span>Attendu <b style={{ color: "#B7BFCC" }}>{event.expected}%</b></span>}
            {event.previous != null && <span>Pr\u00e9c. <b style={{ color: "#B7BFCC" }}>{event.previous}%</b></span>}
          </div>
        )}
      </div>
      <span className="text-[9.5px] mm-mono shrink-0 px-1.5 py-0.5 rounded" style={{ color: "#8A93A3", background: "rgba(255,255,255,0.04)" }}>{countdown}</span>
      <ChevronRight size={13} className="shrink-0" color="#3A4252" />
    </button>
  );
}

function ScenariosView({ scenarios }) {
  return (
    <div className="flex-1 overflow-y-auto mm-scroll p-6">
      <div className="text-[11px] mb-4" style={{ color: "#545D6E" }}>Macro scenarios</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {scenarios.map((s) => {
          const color = STATUS_META[s.tone].color;
          return (
            <div key={s.id} className="mm-card p-4 flex flex-col gap-3" style={{ borderColor: `${color}33` }}>
              <div className="flex items-center justify-between"><span className="font-medium text-[14px]">{s.title}</span><span className="mm-mono text-[12px]" style={{ color }}>{s.probability}</span></div>
              <div><div className="text-[10.5px] mb-1.5" style={{ color: "#545D6E" }}>Conditions</div><ul className="flex flex-col gap-1">{s.conditions.map((c, i) => <li key={i} className="text-[12.5px]" style={{ color: "#B7BFCC" }}>{c}</li>)}</ul></div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: "#1B212C" }}>
                <div><div className="text-[10.5px] mb-1" style={{ color: "#545D6E" }}>Favored</div>{s.favored.map((f, i) => <div key={i} className="text-[12px]" style={{ color: "#4CC38A" }}>{f}</div>)}</div>
                <div><div className="text-[10.5px] mb-1" style={{ color: "#545D6E" }}>Unfavored</div>{s.unfavored.map((f, i) => <div key={i} className="text-[12px]" style={{ color: "#E5484D" }}>{f}</div>)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarketImpactView({ marketBias, biasLabel, biasColor, marketFilter, setMarketFilter, focusOnNode, nodes, edges }) {
  return (
    <div className="flex-1 overflow-y-auto mm-scroll p-6">
      <div className="text-[11px] mb-4" style={{ color: "#545D6E" }}>Market impact</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MARKETS.map((m) => {
          const bias = marketBias[m.id] || { score: 0, drivers: [] };
          const color = biasColor(bias.score); const active = marketFilter === m.id;
          const rootId = MARKET_NODE_MAP[m.id];
          const root = rootId ? nodes[rootId] : null;
          const structuralNote = bias.drivers.length === 0 && root
            ? (() => {
                const factors = getAllFactors(root.id, nodes, edges);
                const flat = factors.filter((f) => f.sign === 0);
                if (flat.length === 0) return null;
                return `${flat.length} facteur${flat.length > 1 ? "s" : ""} structurel${flat.length > 1 ? "s" : ""} suivi${flat.length > 1 ? "s" : ""} sans mouvement r\u00e9cent\u00a0: ${flat.slice(0, 3).map((f) => f.node.label).join(", ")}${flat.length > 3 ? "\u2026" : ""}.`;
              })()
            : null;
          return (
            <div key={m.id} className="mm-card p-4" style={{ borderColor: active ? "#C9A24B55" : undefined }}>
              <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => { setMarketFilter(active ? "all" : m.id); const nid = MARKET_NODE_MAP[m.id]; if (nid) focusOnNode(nid); }}>
                <span className="flex items-center gap-2 text-[14px] font-medium">{m.emoji} {m.label}</span>
                <span className="mm-mono text-[12.5px] font-medium" style={{ color }}>{biasLabel(bias.score)}</span>
              </div>
              <div className="flex flex-col gap-1">
                {bias.drivers.length === 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px]" style={{ color: "#8A93A3" }}>Aucun catalyseur dominant actuellement.</span>
                    {structuralNote && <span className="text-[11px]" style={{ color: "#545D6E" }}>{structuralNote}</span>}
                  </div>
                )}
                {bias.drivers.slice(0, 4).map((d, i) => (
                  <div key={i} className="text-[12px] flex items-center justify-between cursor-pointer" style={{ color: "#8A93A3" }} onClick={() => focusOnNode(d.nodeId)}>
                    <span>{d.label}</span><span style={{ color: d.sign > 0 ? "#4CC38A" : "#E5484D" }}>{d.sign > 0 ? "Bullish" : "Bearish"}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TraderModeOverlay({ regime, macroScore, marketBias, biasLabel, biasColor, traderMarket, setTraderMarket, driversInto, risksInto, nodes, calendarNodes, onExit }) {
  const bias = marketBias[traderMarket] || { score: 0, drivers: [] };
  const color = biasColor(bias.score);
  const focus = nodes[MARKET_NODE_MAP[traderMarket]];
  const drivers = focus ? driversInto(focus.id, 3) : [];
  const risks = focus ? risksInto(focus.id, 2) : [];
  const nextEvent = calendarNodes[0];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6" style={{ background: "#0A0D12" }}>
      <div className="text-center">
        <div className="text-[11px] mb-2" style={{ color: "#545D6E" }}>Current regime</div>
        <div className="text-3xl font-semibold mm-mono" style={{ color: "#C9A24B" }}>{regime}</div>
      </div>
      <div className="flex items-center rounded-md overflow-hidden" style={{ border: "1px solid #232935" }}>
        {MARKETS.map((m) => (
          <button key={m.id} onClick={() => setTraderMarket(m.id)} className="mm-btn text-[12px] px-3 py-1.5" style={{ background: traderMarket === m.id ? "#C9A24B" : "#131720", color: traderMarket === m.id ? "#0A0D12" : "#8A93A3" }}>{m.emoji} {m.label}</button>
        ))}
      </div>
      <div className="mm-card p-5 w-full max-w-md text-center">
        <div className="text-[13px] mb-1">{MARKETS.find((m) => m.id === traderMarket)?.label}</div>
        <div className="mm-mono text-[18px] font-medium mb-4" style={{ color }}>Bias: {biasLabel(bias.score)}</div>
        <div className="text-left mb-4">
          <div className="text-[10.5px] mb-1.5" style={{ color: "#545D6E" }}>Main drivers</div>
          {drivers.length === 0 && <div className="text-[11.5px]" style={{ color: "#545D6E" }}>No dominant driver flagged.</div>}
          {drivers.map(({ edge, node }) => <div key={edge.id} className="text-[12.5px]" style={{ color: "#B7BFCC" }}>{node.label} {node.direction}</div>)}
        </div>
        <div className="text-left mb-4">
          <div className="text-[10.5px] mb-1.5" style={{ color: "#545D6E" }}>Main risks</div>
          {risks.length === 0 && <div className="text-[11.5px]" style={{ color: "#545D6E" }}>None flagged.</div>}
          {risks.map((r) => <div key={r.id} className="text-[12.5px]" style={{ color: "#E5484D" }}>{r.label}</div>)}
        </div>
        {nextEvent && (
          <div className="text-left pt-3 border-t" style={{ borderColor: "#1B212C" }}>
            <div className="text-[10.5px] mb-1" style={{ color: "#545D6E" }}>Next event</div>
            <div className="text-[12.5px]" style={{ color: "#C9A24B" }}>{nextEvent.label} \u2014 {nextEvent.calendarDate}</div>
          </div>
        )}
      </div>
      <button onClick={onExit} className="mm-btn text-[12.5px] px-4 py-2 rounded-md" style={{ border: "1px solid #2C3444", color: "#B7BFCC" }}>Exit trader mode</button>
    </div>
  );
}

function BottomBar({ macroStory, onHide }) {
  return (
    <div className="px-5 py-2.5 border-t text-[12px] leading-relaxed flex items-center gap-3" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0A0D12", color: "#8A93A3" }}>
      <span className="flex-1"><span style={{ color: "#545D6E" }}>Current macro story \u2014 </span>{macroStory}</span>
      <button onClick={onHide} className="mm-btn text-[10.5px] shrink-0" style={{ color: "#3A4252" }}>Hide</button>
    </div>
  );
}

function CommandPalette({ nodes, actions, onClose, onGoToNode }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matchedNodes = query ? Object.values(nodes).filter((n) => n.label.toLowerCase().includes(query)).slice(0, 6) : [];
  const matchedActions = query ? actions.filter((a) => a.label.toLowerCase().includes(query)) : actions;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-28" style={{ background: "rgba(5,7,10,0.6)" }} onClick={onClose}>
      <div className="mm-card mm-glass mm-fade-in w-[480px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <Search size={14} color="#545D6E" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Search macro data, events, relationships\u2026" className="flex-1 bg-transparent text-[13px] outline-none" style={{ color: "#E7EAEE" }} />
          <span className="mm-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#1B212C", color: "#545D6E" }}>ESC</span>
        </div>
        <div className="max-h-80 overflow-y-auto mm-scroll py-1.5">
          {matchedNodes.length > 0 && (
            <div className="px-2 pb-1.5">
              <div className="text-[10px] px-2 py-1" style={{ color: "#3A4252" }}>NODES</div>
              {matchedNodes.map((n) => (
                <button key={n.id} onClick={() => { onGoToNode(n.id); onClose(); }} className="mm-btn w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-md text-[13px]" style={{ color: "#E7EAEE" }}>
                  <span>{n.label}</span>
                  <span className="mm-mono text-[10.5px]" style={{ color: STATUS_META[n.status]?.color }}>{n.direction}</span>
                </button>
              ))}
            </div>
          )}
          <div className="px-2">
            <div className="text-[10px] px-2 py-1" style={{ color: "#3A4252" }}>ACTIONS</div>
            {matchedActions.map((a, i) => (
              <button key={i} onClick={() => { a.run(); onClose(); }} className="mm-btn w-full text-left px-2.5 py-1.5 rounded-md text-[13px]" style={{ color: "#B7BFCC" }}>{a.label}</button>
            ))}
            {matchedActions.length === 0 && matchedNodes.length === 0 && <div className="text-[12px] px-2.5 py-2" style={{ color: "#3A4252" }}>No matches.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
