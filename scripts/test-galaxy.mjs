// Tests hors-ligne du moteur de fond "galaxie" (bloc GALAXY:START…GALAXY:END de src/App.jsx).
// Aucun navigateur ni canvas réel : on extrait le bloc, on l'exécute avec un faux contexte 2D
// qui vérifie que TOUS les nombres passés au dessin sont finis (pas de NaN / Infinity). npm run test:galaxy
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "App.jsx"), "utf8");
const a = src.indexOf("/* GALAXY:START */"), b = src.indexOf("/* GALAXY:END */");
assert.ok(a > 0 && b > a, "marqueurs GALAXY:START / GALAXY:END introuvables");
const E = new Function(`${src.slice(a, b)}\nreturn { GALAXY, buildGalaxy, galaxyInitStep, galaxyReady, drawNebula, drawStars, hexToRgb };`)();

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  -", name); };

// faux contexte 2D : enregistre les appels et refuse toute valeur numérique non finie
function fakeCtx() {
  const calls = { fillRect: 0, arc: 0, drawImage: 0 };
  const check = (args, fn) => args.forEach((v) => { if (typeof v === "number") assert.ok(Number.isFinite(v), `valeur non finie passée à ${fn}: ${v}`); });
  const ctx = new Proxy({ calls }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "createRadialGradient" || prop === "createLinearGradient") return (...a) => { check(a, prop); return { addColorStop() {} }; };
      if (prop === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (prop === "getContext") return () => ctx;
      return (...a) => { check(a, String(prop)); if (prop in calls) calls[prop]++; };
    },
    set() { return true; },
  });
  return ctx;
}
const makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => fakeCtx() });

t("buildGalaxy est déterministe et génère les 3 couches d'étoiles", () => {
  const g1 = E.buildGalaxy(), g2 = E.buildGalaxy();
  assert.equal(g1.layers.length, 3);
  assert.deepEqual(g1.layers[0].stars[0], g2.layers[0].stars[0]);
  assert.deepEqual(g1.layers[2].stars.at(-1), g2.layers[2].stars.at(-1));
  for (const L of g1.layers) for (const s of L.stars) { assert.ok(s.nx >= 0 && s.nx < 1 && s.ny >= 0 && s.ny < 1); assert.ok(s.size > 0 && s.a > 0 && s.a <= 1); }
});
t("le champ d'étoiles est réparti partout (aucun quart d'écran vide)", () => {
  const g = E.buildGalaxy();
  const q = [0, 0, 0, 0];
  for (const s of g.layers[0].stars) q[(s.nx < 0.5 ? 0 : 1) + (s.ny < 0.5 ? 0 : 2)]++;
  const total = q.reduce((x, y) => x + y, 0);
  q.forEach((c) => assert.ok(c > total * 0.2 && c < total * 0.3, `répartition inégale: ${q}`));
});
t("la nébuleuse se calcule en exactement 4 tranches, valeurs dans [0,1]", () => {
  const g = E.buildGalaxy();
  assert.equal(E.galaxyReady(g), false);
  let steps = 1; while (E.galaxyInitStep(g)) steps++;
  assert.equal(steps, 4); assert.equal(E.galaxyReady(g), true);
  for (const f of g.fields) { assert.equal(f.length, E.GALAXY.NEB_W * E.GALAXY.NEB_H); for (let i = 0; i < f.length; i += 97) assert.ok(f[i] >= 0 && f[i] <= 1, "valeur hors [0,1]"); }
});
t("drawStars : que des valeurs finies, quelles que soient la taille d'écran et les déplacements", () => {
  const g = E.buildGalaxy();
  const o = { bx: 460, by: 340, s: 1, clear: true, motion: true, gain: 0.9, rgb: E.hexToRgb("#F0883E") };
  for (const [w, h] of [[900, 150], [1100, 720], [2560, 1440], [320, 480]]) {
    for (const pan of [{ x: 0, y: 0 }, { x: -5000, y: 3200 }, { x: 1e5, y: -1e5 }]) {
      const c = fakeCtx();
      E.drawStars(c, g, w, h, 123.4, { ...o, pan });
      assert.ok(c.calls.fillRect > 100, `trop peu d'étoiles dessinées (${w}x${h}): ${c.calls.fillRect}`);
    }
  }
});
t("drawNebula : dessine 2 couches sans valeur invalide (et rien tant que le calcul n'est pas fini)", () => {
  const g = E.buildGalaxy();
  const o = { bx: 460, by: 340, s: 1.4, clear: true, motion: true, gain: 0.9, nebGain: 0.6, nebW: 1650, makeCanvas, rgb: E.hexToRgb("#A78BFA"), pan: { x: -300, y: 200 } };
  const early = fakeCtx(); E.drawNebula(early, g, 1100, 720, 5, o);
  assert.equal(early.calls.drawImage, 0);
  while (E.galaxyInitStep(g));
  const c = fakeCtx(); E.drawNebula(c, g, 1100, 720, 5, o);
  assert.equal(c.calls.drawImage, 2);
});
t("les marqueurs encadrent bien un bloc autonome (aucune dépendance au reste du fichier)", () => {
  assert.ok(typeof E.buildGalaxy === "function" && typeof E.drawStars === "function");
});

console.log(`\n${n} tests passés`);
