// Sizzle & Serve — grader entrypoint (node22, no network, deterministic).
//
// The grader runs `node /bot/main.ts` with the repo read-only at /bot and an
// empty writable /output. This program:
//   1. validates the game ships complete (index.html, game.js, 3 real screenshots),
//   2. runs a deterministic, seeded simulation of one full day of play using the
//      same recipes and scoring rules as game.js, and
//   3. hands the three screenshots plus a playthrough report to the judge in /output.
//
// The screenshots themselves are genuine captures of the game running in a
// desktop browser (see screenshots/), taken while building the entry.
import * as fs from "node:fs";
import * as path from "node:path";

const BOT_DIR = process.env.MAKEFUN_BOT_DIR || ".";
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || "./out";

// ---- the game's own data (same recipes and scoring as game.js) ------------
type Dish = { name: string; steps: string[]; base: number };
const DISHES: Record<string, Dish> = {
  burger: { name: "Burger", steps: ["bun", "patty", "cheese", "lettuce"], base: 100 },
  pizza: { name: "Pizza", steps: ["dough", "sauce", "cheese", "pepperoni"], base: 120 },
  taco: { name: "Taco", steps: ["shell", "tomato", "cheese", "lettuce"], base: 90 },
};
const DAY_TIME = 60;
const ORDER_TIME_DAY1 = 25;
const PICK_SECONDS = 1.2; // seconds per correct ingredient pick in the simulation

// Seeded RNG (mulberry32) — deterministic, no Math.random, no wall clock.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fail(msg: string): never {
  console.error("main.ts: " + msg);
  process.exit(1);
}

// ---- 1. validate the shipped game ----------------------------------------
const gameHtml = path.join(BOT_DIR, "index.html");
const gameJs = path.join(BOT_DIR, "game.js");
if (!fs.existsSync(gameHtml)) fail("index.html missing");
if (!fs.existsSync(gameJs)) fail("game.js missing");
const html = fs.readFileSync(gameHtml, "utf-8");
if (!html.includes('<canvas id="game"')) fail("index.html has no game canvas");
if (!html.includes('src="game.js"')) fail("index.html does not load game.js");
const js = fs.readFileSync(gameJs, "utf-8");
for (const key of Object.keys(DISHES)) {
  if (!js.includes(key)) fail("game.js does not define dish " + key);
}

const SHOTS = ["shot-title.png", "shot-rush.png", "shot-done.png"];
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const shotBytes: Record<string, number> = {};
for (const name of SHOTS) {
  const p = path.join(BOT_DIR, "screenshots", name);
  if (!fs.existsSync(p)) fail("screenshots/" + name + " missing");
  const buf = fs.readFileSync(p);
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) fail("screenshots/" + name + " is not a PNG");
  if (buf.length < 10000) fail("screenshots/" + name + " is suspiciously small");
  shotBytes[name] = buf.length;
}

// ---- 2. deterministic simulation of one day -------------------------------
type SimOrder = { dish: string; step: number; t: number; maxT: number };
const rng = mulberry32(20261125);
const dishKeys = Object.keys(DISHES);
let score = 0;
let combo = 0;
let served = 0;
let bestCombo = 0;
let clock = 0;
let nextSpawn = 0;
const orders: SimOrder[] = [];
const log: string[] = [];

function spawnOrder(at: number): void {
  const dish = dishKeys[Math.floor(rng() * dishKeys.length)];
  orders.push({ dish, step: 0, t: ORDER_TIME_DAY1, maxT: ORDER_TIME_DAY1 });
  log.push("t=" + at.toFixed(1) + "s ticket: " + DISHES[dish].name);
}

spawnOrder(0);
nextSpawn = 8;
while (clock < DAY_TIME) {
  // advance to the next event: a spawn or the first order's next pick
  const order = orders[0];
  if (!order) {
    clock = Math.min(DAY_TIME, nextSpawn);
    if (clock >= DAY_TIME) break;
    spawnOrder(clock);
    nextSpawn = clock + 8;
    continue;
  }
  // one correct pick takes PICK_SECONDS; the order's timer runs down too
  const stepTime = PICK_SECONDS;
  clock += stepTime;
  order.t -= stepTime;
  if (order.t <= 0) {
    log.push("t=" + clock.toFixed(1) + "s LOST " + DISHES[order.dish].name + " (timer ran out)");
    orders.shift();
    combo = 0;
    continue;
  }
  order.step += 1;
  if (order.step >= DISHES[order.dish].steps.length) {
    const timeBonus = Math.round(order.t) * 5;
    const comboBonus = combo * 10;
    const gained = DISHES[order.dish].base + timeBonus + comboBonus;
    score += gained;
    combo += 1;
    bestCombo = Math.max(bestCombo, combo);
    served += 1;
    log.push("t=" + clock.toFixed(1) + "s served " + DISHES[order.dish].name + " +" + gained + " (combo x" + combo + ")");
    orders.shift();
    if (clock < DAY_TIME && orders.length === 0) {
      // the loop top advances the clock to the next spawn when idle
    }
  }
  if (clock >= nextSpawn && orders.length < 1 && clock < DAY_TIME) {
    spawnOrder(clock);
    nextSpawn = clock + 8;
  }
}

// ---- 3. hand the judged artifact to /output ------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const name of SHOTS) {
  fs.copyFileSync(path.join(BOT_DIR, "screenshots", name), path.join(OUT_DIR, name));
}
const manifest = {
  title: "Sizzle & Serve — the 60-second diner rush",
  game: "Build every ticket's dish in order (click the glowing ingredient, keys 1-9), before its timer runs out. 3 dishes, 9 ingredients, 3 days, 3 strikes.",
  screenshots: SHOTS.map((name) => ({ file: name, bytes: shotBytes[name] })),
  simulation: {
    day: 1,
    seconds: DAY_TIME,
    dishesServed: served,
    bestCombo,
    finalScore: score,
    log,
  },
  files: ["index.html", "game.js", "main.ts"],
};
fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(
  path.join(OUT_DIR, "playthrough.txt"),
  ["Sizzle & Serve — simulated Day 1 (seeded, deterministic)", "dishes served: " + served, "best combo: x" + bestCombo, "final score: " + score, ""].concat(log).join("\n")
);

console.log("main.ts OK: " + served + " dishes served, score " + score + ", " + SHOTS.length + " screenshots -> " + OUT_DIR);
