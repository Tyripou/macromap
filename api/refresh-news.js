// Vercel serverless function — s'exécute côté serveur, jamais dans le navigateur.
//
// Le bouton "Actualiser" du site appelle cette route. Elle ne parle PAS à Alpha Vantage :
// elle demande à GitHub de lancer la tâche "Refresh live news" (celle qui fait déjà
// l'actualisation automatique toutes les 3h, avec les clés stockées dans les secrets GitHub).
// Les clés Alpha Vantage / Anthropic ne passent donc jamais par le navigateur.
//
// Protection du quota gratuit Alpha Vantage (25 requêtes/jour, 2 par run) — sans base de
// données : on compte les runs réellement lancés aujourd'hui via l'API GitHub.
//   - jamais deux runs en même temps ;
//   - au plus MANUAL_MAX_PER_DAY actualisations manuelles par jour (UTC) — 4 par défaut ;
//   - on réserve toujours le quota des runs automatiques encore prévus aujourd'hui ;
//   - un délai minimum entre deux runs (MANUAL_COOLDOWN_MIN, 10 min par défaut).
//
// Variables d'environnement à définir sur Vercel (voir README) :
//   GITHUB_DISPATCH_TOKEN  jeton GitHub "fine-grained" limité à ce repo, permission Actions : lecture et écriture
//   GITHUB_REPO            "ton-compte/ton-repo"
//   GITHUB_BRANCH          (optionnel) branche du workflow, "main" par défaut
//   REFRESH_CODE           (optionnel) code d'accès demandé par le bouton — évite que n'importe quel
//                          visiteur du site puisse consommer ton quota d'actualisations
//   MANUAL_MAX_PER_DAY     (optionnel) 4 par défaut
//   MANUAL_COOLDOWN_MIN    (optionnel) 10 par défaut
import { timingSafeEqual } from "node:crypto";

const WORKFLOW_FILE = "refresh-news.yml";
const AV_CALLS_PER_RUN = 2; // voir pickTopics() dans scripts/news-lib.mjs
const AV_DAILY_BUDGET = 24; // limite gratuite = 25/jour, on garde 1 appel de marge
// Doit refléter le cron du workflow ("17 */3 * * *") :
const SCHEDULED_HOURS_UTC = [0, 3, 6, 9, 12, 15, 18, 21];
const SCHEDULED_MINUTE_UTC = 17;
const ACTIVE_STATUSES = new Set(["queued", "in_progress", "waiting", "pending", "requested"]);

const intEnv = (name, dflt) => {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
};

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

function codeOk(expected, given) {
  if (!expected) return true;
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ----- Logique de décision (pure, testée dans scripts/test-refresh-api.mjs) -----------------

export function remainingScheduledToday(now) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  return SCHEDULED_HOURS_UTC.filter((h) => Date.UTC(y, m, d, h, SCHEDULED_MINUTE_UTC) > now.getTime()).length;
}

// runs : du plus récent au plus ancien, [{ id, status, conclusion, event, createdAt, url }]
export function decide({ runs, now, manualMax, cooldownMin }) {
  const day0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const today = runs.filter((r) => Date.parse(r.createdAt) >= day0);
  const manualToday = today.filter((r) => r.event === "workflow_dispatch").length;
  const active = runs.find((r) => ACTIVE_STATUSES.has(r.status)) || null;
  const latest = runs[0] || null;
  const remainingScheduled = remainingScheduledToday(now);
  const info = { manualToday, manualMax, remainingScheduled };

  if (active) return { allow: false, status: 409, body: { error: "already_running", run: active, ...info } };
  if (manualToday >= manualMax) return { allow: false, status: 429, body: { error: "daily_cap", ...info } };
  if ((today.length + remainingScheduled + 1) * AV_CALLS_PER_RUN > AV_DAILY_BUDGET) {
    return { allow: false, status: 429, body: { error: "quota_budget", ...info } };
  }
  if (latest) {
    const ageSec = (now.getTime() - Date.parse(latest.createdAt)) / 1000;
    if (ageSec < cooldownMin * 60) {
      return { allow: false, status: 429, body: { error: "cooldown", retryAfterSec: Math.ceil(cooldownMin * 60 - ageSec), ...info } };
    }
  }
  return { allow: true, ...info };
}

// ----- Appels GitHub -------------------------------------------------------------------------

async function gh(cfg, path, init = {}) {
  return fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "macromap-refresh",
      ...(init.headers || {}),
    },
  });
}

async function ghProblem(res) {
  let detail = "";
  try { detail = (await res.json()).message || ""; } catch (e) { /* corps non-JSON */ }
  let message;
  if (res.status === 401 || res.status === 403) message = "GitHub refuse le jeton (expiré, ou sans la permission « Actions : lecture et écriture » sur ce repo).";
  else if (res.status === 404) message = "Repo ou workflow introuvable : vérifie GITHUB_REPO et que le jeton a bien accès à ce repo.";
  else if (res.status === 422) message = "GitHub refuse de lancer le workflow : la branche (GITHUB_BRANCH) n'existe pas ou le workflow n'accepte pas le lancement manuel.";
  else message = `GitHub a répondu avec une erreur (${res.status}).`;
  return { status: 502, body: { error: "github_error", message, githubStatus: res.status, detail } };
}

async function listRuns(cfg) {
  const res = await gh(cfg, `/actions/workflows/${WORKFLOW_FILE}/runs?per_page=30`);
  if (!res.ok) return { problem: await ghProblem(res) };
  const body = await res.json();
  const runs = (body.workflow_runs || []).map((r) => ({
    id: r.id, status: r.status, conclusion: r.conclusion, event: r.event, createdAt: r.created_at, url: r.html_url,
  }));
  return { runs };
}

// ----- Handler -------------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "method_not_allowed" });
  }

  const cfg = {
    token: process.env.GITHUB_DISPATCH_TOKEN,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || "main",
    code: process.env.REFRESH_CODE || "",
    manualMax: intEnv("MANUAL_MAX_PER_DAY", 4),
    cooldownMin: intEnv("MANUAL_COOLDOWN_MIN", 10),
  };
  if (!cfg.token || !cfg.repo) return send(res, 501, { error: "not_configured" });
  if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) {
    return send(res, 500, { error: "bad_config", message: "GITHUB_REPO doit avoir la forme « compte/repo »." });
  }

  const given = req.headers["x-refresh-code"];
  if (!codeOk(cfg.code, given)) return send(res, 401, { error: given ? "code_invalid" : "code_required" });

  try {
    const listed = await listRuns(cfg);
    if (listed.problem) return send(res, listed.problem.status, listed.problem.body);
    const now = new Date();

    // GET : état du dernier run (utilisé par le bouton pour suivre la progression)
    if (req.method === "GET") {
      const d = decide({ runs: listed.runs, now, manualMax: cfg.manualMax, cooldownMin: cfg.cooldownMin });
      return send(res, 200, {
        ok: true, latest: listed.runs[0] || null, now: now.toISOString(),
        manualToday: d.manualToday, manualMax: d.manualMax,
      });
    }

    // POST : décider, puis lancer
    const d = decide({ runs: listed.runs, now, manualMax: cfg.manualMax, cooldownMin: cfg.cooldownMin });
    if (!d.allow) return send(res, d.status, d.body);

    const dispatch = await gh(cfg, `/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: cfg.branch }),
    });
    if (dispatch.status !== 204) {
      const p = await ghProblem(dispatch);
      return send(res, p.status, p.body);
    }
    return send(res, 202, { ok: true, dispatchedAt: now.toISOString(), manualToday: d.manualToday + 1, manualMax: d.manualMax });
  } catch (err) {
    return send(res, 500, { error: "server_error", message: "Erreur interne de la fonction d'actualisation." });
  }
}
