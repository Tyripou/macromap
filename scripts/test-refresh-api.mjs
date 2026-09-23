// Tests hors-ligne de api/refresh-news.js (faux GitHub, aucune clé, aucun réseau). npm run test:refresh
import assert from "node:assert/strict";
import handler, { decide, remainingScheduledToday } from "../api/refresh-news.js";

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log("ok  -", name); };
const at = (iso) => new Date(iso);
const run = (event, iso, status = "completed", conclusion = "success", id = Math.random()) => ({ id, event, createdAt: iso, status, conclusion, url: "https://github.com/x/y/actions/runs/1" });
const P = { manualMax: 4, cooldownMin: 10 };

// ---------- decide() : règles de quota ----------
const NOW = at("2026-09-19T10:00:00Z");
const sched = [run("schedule", "2026-09-19T09:17:00Z"), run("schedule", "2026-09-19T06:17:00Z"), run("schedule", "2026-09-19T03:17:00Z"), run("schedule", "2026-09-19T00:17:00Z")];

await t("remainingScheduledToday", () => {
  assert.equal(remainingScheduledToday(at("2026-09-19T00:00:00Z")), 8);
  assert.equal(remainingScheduledToday(at("2026-09-19T00:20:00Z")), 7);
  assert.equal(remainingScheduledToday(at("2026-09-19T10:00:00Z")), 4);
  assert.equal(remainingScheduledToday(at("2026-09-19T22:00:00Z")), 0);
});
await t("autorise : 4 runs auto faits, 0 manuel", () => {
  const d = decide({ runs: sched, now: NOW, ...P });
  assert.equal(d.allow, true); assert.equal(d.manualToday, 0);
});
await t("autorise la 4e actualisation manuelle, exactement à la limite du budget (24 appels)", () => {
  const runs = [run("workflow_dispatch", "2026-09-19T09:40:00Z"), run("workflow_dispatch", "2026-09-19T09:25:00Z"), run("workflow_dispatch", "2026-09-19T09:00:00Z"), ...sched];
  assert.equal(decide({ runs, now: NOW, ...P }).allow, true);
});
await t("refuse la 5e : plafond quotidien", () => {
  const runs = Array.from({ length: 4 }, (_, i) => run("workflow_dispatch", `2026-09-19T0${i + 4}:40:00Z`)).reverse();
  const d = decide({ runs: [...runs, ...sched], now: NOW, ...P });
  assert.equal(d.allow, false); assert.equal(d.status, 429); assert.equal(d.body.error, "daily_cap");
});
await t("refuse quand le budget Alpha Vantage réservé aux runs auto serait dépassé (même si le plafond manuel est relevé)", () => {
  const manual = Array.from({ length: 5 }, (_, i) => run("workflow_dispatch", `2026-09-19T0${i + 1}:40:00Z`));
  const d = decide({ runs: [...manual, ...sched], now: NOW, manualMax: 10, cooldownMin: 10 });
  assert.equal(d.allow, false); assert.equal(d.body.error, "quota_budget");
});
await t("refuse si un run est déjà en cours et renvoie ce run", () => {
  const d = decide({ runs: [run("workflow_dispatch", "2026-09-19T09:58:00Z", "in_progress", null), ...sched], now: NOW, ...P });
  assert.equal(d.status, 409); assert.equal(d.body.error, "already_running"); assert.ok(d.body.run.createdAt);
});
await t("délai minimum : refuse 3 min après le dernier run, avec le temps restant", () => {
  const d = decide({ runs: [run("schedule", "2026-09-19T09:57:00Z"), ...sched.slice(1)], now: NOW, ...P });
  assert.equal(d.status, 429); assert.equal(d.body.error, "cooldown"); assert.equal(d.body.retryAfterSec, 420);
});
await t("plafond quotidien prioritaire sur le délai (message cohérent)", () => {
  const manual = Array.from({ length: 4 }, (_, i) => run("workflow_dispatch", `2026-09-19T09:${50 - i}:00Z`));
  assert.equal(decide({ runs: [...manual, ...sched], now: NOW, ...P }).body.error, "daily_cap");
});
await t("les runs de la veille ne comptent pas dans le plafond du jour", () => {
  const old = Array.from({ length: 6 }, (_, i) => run("workflow_dispatch", `2026-09-18T1${i}:00:00Z`));
  assert.equal(decide({ runs: [...sched, ...old], now: NOW, ...P }).allow, true);
});

// ---------- handler : faux GitHub ----------
const TOKEN = "ghp_SECRETTOKEN123";
const calls = [];
function fakeGithub({ runs = [], listStatus = 200, dispatchStatus = 204 } = {}) {
  calls.length = 0;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/dispatches")) return { ok: dispatchStatus < 300, status: dispatchStatus, json: async () => ({ message: "boom" }) };
    return { ok: listStatus < 300, status: listStatus, json: async () => (listStatus < 300 ? { workflow_runs: runs.map((r) => ({ id: r.id, status: r.status, conclusion: r.conclusion, event: r.event, created_at: r.createdAt, html_url: r.url })) } : { message: "Bad credentials" }) };
  };
}
function call(method, headers = {}) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b, headers: this.headers }); } };
    handler({ method, headers }, res);
  });
}
const setEnv = (o) => { for (const k of ["GITHUB_DISPATCH_TOKEN", "GITHUB_REPO", "GITHUB_BRANCH", "REFRESH_CODE", "MANUAL_MAX_PER_DAY", "MANUAL_COOLDOWN_MIN"]) delete process.env[k]; Object.assign(process.env, o); };
const OK_ENV = { GITHUB_DISPATCH_TOKEN: TOKEN, GITHUB_REPO: "nathan/macromap-app" };

await t("501 not_configured sans variables", async () => { setEnv({}); const r = await call("POST"); assert.equal(r.code, 501); assert.equal(r.body.error, "not_configured"); });
await t("500 si GITHUB_REPO mal formé", async () => { setEnv({ ...OK_ENV, GITHUB_REPO: "pas un repo" }); assert.equal((await call("POST")).code, 500); });
await t("405 pour une autre méthode", async () => { setEnv(OK_ENV); assert.equal((await call("PUT")).code, 405); });
await t("code d'accès : requis / invalide / accepté", async () => {
  setEnv({ ...OK_ENV, REFRESH_CODE: "sesame" }); fakeGithub();
  assert.equal((await call("POST")).body.error, "code_required");
  assert.equal((await call("POST", { "x-refresh-code": "faux" })).body.error, "code_invalid");
  assert.equal((await call("POST", { "x-refresh-code": "sesame" })).code, 202);
  assert.equal((await call("GET")).code, 401); // le suivi de progression est protégé aussi
});
await t("POST OK : déclenche le workflow sur la bonne branche avec le jeton, sans jamais renvoyer le jeton", async () => {
  setEnv({ ...OK_ENV, GITHUB_BRANCH: "production" }); fakeGithub({ runs: [] });
  const r = await call("POST");
  assert.equal(r.code, 202); assert.equal(r.body.ok, true); assert.equal(r.body.manualToday, 1); assert.ok(Date.parse(r.body.dispatchedAt));
  const d = calls.find((c) => c.url.includes("/dispatches"));
  assert.ok(d.url.startsWith("https://api.github.com/repos/nathan/macromap-app/actions/workflows/refresh-news.yml/dispatches"));
  assert.deepEqual(JSON.parse(d.init.body), { ref: "production" });
  assert.equal(d.init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!JSON.stringify(r).includes(TOKEN));
  assert.equal(r.headers["Cache-Control"], "no-store");
});
await t("POST : aucun appel de lancement si la décision est négative", async () => {
  setEnv(OK_ENV); fakeGithub({ runs: [run("schedule", new Date(Date.now() - 60000).toISOString(), "in_progress", null)] });
  const r = await call("POST"); assert.equal(r.code, 409);
  assert.ok(!calls.some((c) => c.url.includes("/dispatches")));
});
await t("erreur GitHub 401 à la lecture -> 502 avec message clair, sans fuite", async () => {
  setEnv(OK_ENV); fakeGithub({ listStatus: 401 });
  const r = await call("POST"); assert.equal(r.code, 502); assert.match(r.body.message, /jeton/); assert.ok(!JSON.stringify(r).includes(TOKEN));
});
await t("dispatch refusé (422) -> 502 avec message clair", async () => {
  setEnv(OK_ENV); fakeGithub({ runs: [], dispatchStatus: 422 });
  const r = await call("POST"); assert.equal(r.code, 502); assert.match(r.body.message, /branche/);
});
await t("GET renvoie le dernier run", async () => {
  setEnv(OK_ENV); fakeGithub({ runs: [run("workflow_dispatch", "2026-09-19T09:58:00Z", "completed", "success", 42)] });
  const r = await call("GET"); assert.equal(r.code, 200); assert.equal(r.body.latest.id, 42); assert.equal(r.body.latest.conclusion, "success");
});
await t("réseau en panne -> 500 générique", async () => {
  setEnv(OK_ENV); globalThis.fetch = async () => { throw new Error("ECONNRESET secret-detail"); };
  const r = await call("POST"); assert.equal(r.code, 500); assert.ok(!JSON.stringify(r).includes("secret-detail"));
});

console.log(`\n${n} tests passés`);
