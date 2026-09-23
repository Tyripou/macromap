// Tests hors-ligne de la logique de fusion / rotation. Lancer : npm run test:news
import assert from "node:assert/strict";
import { mergeNews, pickTopics, parseAvTime, formatDate, extractJson, buildFreshByFactor, isHttpUrl } from "./news-lib.mjs";

const NOW = new Date("2026-09-18T12:00:00Z");
const item = (headline, iso, link = `https://ex.com/${headline}`) => ({ headline, publishedAt: iso, link, kind: "catalyst" });
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  -", name); };

t("parseAvTime / formatDate", () => {
  assert.equal(parseAvTime("20260912T143000"), "2026-09-12T14:30:00.000Z");
  assert.equal(parseAvTime("garbage"), null);
  assert.equal(parseAvTime(undefined), null);
  assert.equal(formatDate("2026-09-12T14:30:00.000Z"), "Sep 12, 2026");
});

t("mergeNews : les anciennes news survivent quand le run suivant n'a rien de neuf", () => {
  const prev = { fed: [item("a", "2026-09-17T10:00:00Z")] };
  const out = mergeNews(prev, {}, NOW);
  assert.equal(out.fed.length, 1);
  assert.equal(out.fed[0].headline, "a");
});

t("mergeNews : nouvelles en tête, dédoublonnage par lien", () => {
  const prev = { fed: [item("old", "2026-09-16T10:00:00Z"), item("dup", "2026-09-15T10:00:00Z", "https://ex.com/same")] };
  const fresh = { fed: [item("new", "2026-09-18T09:00:00Z"), item("dup-renamed", "2026-09-15T10:00:00Z", "https://ex.com/same")] };
  const out = mergeNews(prev, fresh, NOW);
  assert.deepEqual(out.fed.map((i) => i.headline), ["new", "old", "dup-renamed"]);
});

t("mergeNews : purge > 7 jours et âge inconnu", () => {
  const prev = { fed: [item("stale", "2026-09-05T10:00:00Z"), { headline: "noDate", link: "https://ex.com/nd" }, item("ok", "2026-09-14T10:00:00Z")] };
  const out = mergeNews(prev, {}, NOW);
  assert.deepEqual(out.fed.map((i) => i.headline), ["ok"]);
});

t("mergeNews : facteur entièrement périmé → clé supprimée", () => {
  const out = mergeNews({ cpi: [item("stale", "2026-08-01T00:00:00Z")] }, {}, NOW);
  assert.equal("cpi" in out, false);
});

t("mergeNews : plafond par facteur", () => {
  const many = Array.from({ length: 9 }, (_, i) => item(`n${i}`, `2026-09-1${i % 9}T10:00:00Z`));
  const out = mergeNews({}, { gold: many }, NOW);
  assert.equal(out.gold.length, 4);
  const times = out.gold.map((i) => Date.parse(i.publishedAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});

t("pickTopics : 1 macro + 1 marchés, un seul topic chacun, rotation dans le temps", () => {
  const seen = new Set();
  for (let h = 0; h < 24 * 3; h += 3) {
    const [a, b] = pickTopics(new Date(NOW.getTime() + h * 3600000));
    assert.ok(["economy_macro", "economy_monetary", "economy_fiscal"].includes(a));
    assert.ok(["financial_markets", "blockchain"].includes(b));
    assert.ok(!a.includes(",") && !b.includes(","));
    seen.add(a); seen.add(b);
  }
  assert.equal(seen.size, 5); // les 5 topics sont tous couverts
});

t("extractJson : tolère fences et texte autour", () => {
  assert.deepEqual(extractJson('```json\n{"a":[1]}\n```'), { a: [1] });
  assert.deepEqual(extractJson('Voici : {"a":1} merci'), { a: 1 });
  assert.throws(() => extractJson("pas de json"));
});

t("buildFreshByFactor : filtre ids inconnus, index invalides, liens non-http, max 2", () => {
  const articles = [
    { title: "T0", url: "https://ex.com/0", source: "S", time_published: "20260918T080000" },
    { title: "T1", url: "javascript:alert(1)", source: "S", time_published: "20260918T080000" },
    { title: "T2", url: "https://ex.com/2", source: "S", time_published: "20260918T090000" },
    { title: "T3", url: "https://ex.com/3", source: "S", time_published: "bad" },
  ];
  const cls = {
    fed: [{ headline: "h0", articleIndex: 0 }, { headline: "h1", articleIndex: 1 }, { headline: "h2", articleIndex: "2" }, { headline: "h9", articleIndex: 99 }],
    cpi: [{ headline: "x", articleIndex: 3 }],
    hallucinated: [{ headline: "y", articleIndex: 0 }],
    gold: "not-an-array",
  };
  const out = buildFreshByFactor(cls, articles, ["fed", "cpi", "gold"]);
  assert.deepEqual(Object.keys(out), ["fed"]);
  assert.deepEqual(out.fed.map((i) => i.link), ["https://ex.com/0", "https://ex.com/2"]);
  assert.equal(out.fed[0].publishedAt, "2026-09-18T08:00:00.000Z");
  assert.equal(out.fed[0].date, "Sep 18, 2026");
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
});

console.log(`\n${n} tests passés`);
