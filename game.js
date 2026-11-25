// Sizzle & Serve — a fast arcade cooking game.
// Build orders step by step: click the glowing ingredient, serve before the ticket expires.
// One HTML file, no external assets, no network. Deterministic screenshot mode via ?shot=title|rush|done.
"use strict";

const W = 960, H = 680;
const INGREDIENTS = ["bun", "patty", "cheese", "lettuce", "tomato", "dough", "sauce", "pepperoni", "shell"];
const DISHES = {
  burger: { name: "Burger", steps: ["bun", "patty", "cheese", "lettuce"], base: 100, color: "#c97b2d" },
  pizza: { name: "Pizza", steps: ["dough", "sauce", "cheese", "pepperoni"], base: 120, color: "#d94f30" },
  taco: { name: "Taco", steps: ["shell", "tomato", "cheese", "lettuce"], base: 90, color: "#e8a91c" },
};
const DAY_TIME = 60;
const ORDER_TIMES = [25, 20, 15]; // seconds per order, by day
const MAX_ORDERS = [1, 2, 3];     // concurrent tickets, by day

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ---- state ---------------------------------------------------------------
const state = {
  screen: "title", // title | play | daydone | gameover | complete
  day: 1, score: 0, combo: 0, strikes: 0,
  dayT: DAY_TIME, spawnT: 0, orders: [], // {dish, step, t, maxT, id}
  plate: null, // dish key currently being built (first order) + steps done
  popups: [], particles: [], msg: "",
  servedToday: 0, lostToday: 0,
};
let nextOrderId = 1;
let lastTs = 0;

function newOrder() {
  const keys = Object.keys(DISHES);
  const dish = keys[Math.floor(Math.random() * keys.length)];
  const maxT = ORDER_TIMES[state.day - 1];
  return { dish, step: 0, t: maxT, maxT, id: nextOrderId++ };
}

function startDay(d) {
  state.day = d; state.dayT = DAY_TIME; state.spawnT = 0;
  state.orders = []; state.plate = null; state.servedToday = 0; state.lostToday = 0;
  state.orders.push(newOrder());
  state.screen = "play";
}

function startGame() {
  state.score = 0; state.combo = 0; state.strikes = 0;
  state.popups = []; state.particles = [];
  startDay(1);
}

function serveOrder(order) {
  const dish = DISHES[order.dish];
  const timeBonus = Math.round(order.t) * 5;
  const comboBonus = state.combo * 10;
  const gained = dish.base + timeBonus + comboBonus;
  state.score += gained;
  state.combo += 1;
  state.servedToday += 1;
  addPopup(480, 300, "+" + gained, "#2e7d32");
  burst(480, 330, "#ffd54f");
  state.orders = state.orders.filter(o => o.id !== order.id);
  state.plate = null;
}

function wrongPick() {
  state.combo = 0;
  state.strikes += 1;
  addPopup(480, 300, "WRONG!", "#c62828");
  if (state.strikes >= 3) return gameOver();
  // small penalty on the first order's timer
  if (state.orders.length) state.orders[0].t = Math.max(1, state.orders[0].t - 3);
}

function gameOver() {
  state.screen = "gameover";
}

function addPopup(x, y, text, color) { state.popups.push({ x, y, text, color, life: 1 }); }
function burst(x, y, color) {
  for (let i = 0; i < 14; i++) {
    state.particles.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 120, life: 0.8, color });
  }
}

// ---- input ---------------------------------------------------------------
function tileAt(mx, my) {
  // 3x3 grid of ingredient tiles at the bottom
  const gx = 190, gy = 430, s = 76, gap = 10;
  for (let i = 0; i < INGREDIENTS.length; i++) {
    const cx = gx + (i % 3) * (s + gap), cy = gy + Math.floor(i / 3) * (s + gap);
    if (mx >= cx && mx <= cx + s && my >= cy && my <= cy + s) return INGREDIENTS[i];
  }
  return null;
}

canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width);
  const my = (e.clientY - r.top) * (H / r.height);
  if (state.screen === "title") return startGame();
  if (state.screen === "daydone") return startDay(state.day + 1);
  if (state.screen === "gameover" || state.screen === "complete") return startGame();
  if (state.screen !== "play") return;
  const ing = tileAt(mx, my);
  if (!ing || !state.orders.length) return;
  const order = state.orders[0];
  const want = DISHES[order.dish].steps[order.step];
  if (ing === want) {
    order.step += 1;
    state.plate = order.dish;
    burst(480, 330, "#fff176");
    if (order.step >= DISHES[order.dish].steps.length) serveOrder(order);
  } else {
    wrongPick();
  }
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && state.screen === "title") startGame();
  if (e.key === "Enter" && state.screen === "daydone") startDay(state.day + 1);
  if (e.key === "Enter" && (state.screen === "gameover" || state.screen === "complete")) startGame();
  const map = { 1: "bun", 2: "patty", 3: "cheese", 4: "lettuce", 5: "tomato", 6: "dough", 7: "sauce", 8: "pepperoni", 9: "shell" };
  if (map[e.key] && state.screen === "play" && state.orders.length) {
    const order = state.orders[0];
    const want = DISHES[order.dish].steps[order.step];
    if (map[e.key] === want) {
      order.step += 1; state.plate = order.dish;
      if (order.step >= DISHES[order.dish].steps.length) serveOrder(order);
    } else wrongPick();
  }
});

// ---- update --------------------------------------------------------------
function update(dt) {
  if (state.screen !== "play") return;
  state.dayT -= dt;
  state.spawnT += dt;
  if (state.spawnT > 8 && state.orders.length < MAX_ORDERS[state.day - 1]) {
    state.orders.push(newOrder()); state.spawnT = 0;
  }
  for (const o of state.orders) o.t -= dt;
  const expired = state.orders.filter(o => o.t <= 0);
  for (const o of expired) {
    state.orders = state.orders.filter(x => x.id !== o.id);
    state.combo = 0; state.strikes += 1; state.lostToday += 1;
    addPopup(480, 240, "ORDER LOST!", "#c62828");
    if (state.strikes >= 3) return gameOver();
  }
  if (state.orders.length === 0) state.orders.push(newOrder());
  if (state.dayT <= 0) {
    if (state.day >= 3) { state.screen = "complete"; }
    else { state.screen = "daydone"; }
  }
  for (const p of state.popups) { p.y -= 30 * dt; p.life -= dt; }
  state.popups = state.popups.filter(p => p.life > 0);
  for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; p.life -= dt; }
  state.particles = state.particles.filter(p => p.life > 0);
}

// ---- drawing ------------------------------------------------------------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawIngredient(kind, x, y, s) {
  ctx.save(); ctx.translate(x, y);
  const u = s / 100;
  if (kind === "bun") {
    ctx.fillStyle = "#e8b04b"; ctx.beginPath(); ctx.arc(0, 8 * u, 34 * u, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#fff3d6";
    [[-18, -6], [0, -14], [18, -6], [-8, -18], [10, -20]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx * u, dy * u, 3 * u, 0, 7); ctx.fill(); });
    ctx.fillStyle = "#d99a2b"; ctx.fillRect(-34 * u, 8 * u, 68 * u, 8 * u);
  } else if (kind === "patty") {
    ctx.fillStyle = "#6d4c2f"; rr(-34 * u, -10 * u, 68 * u, 22 * u, 10 * u); ctx.fill();
    ctx.fillStyle = "#8d6a45";
    [[-20, 0], [0, -3], [20, 2]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx * u, dy * u, 3 * u, 0, 7); ctx.fill(); });
  } else if (kind === "cheese") {
    ctx.fillStyle = "#ffc93c"; ctx.beginPath();
    ctx.moveTo(-32 * u, 10 * u); ctx.lineTo(0, -16 * u); ctx.lineTo(32 * u, 10 * u); ctx.lineTo(20 * u, 16 * u); ctx.lineTo(-20 * u, 16 * u); ctx.closePath(); ctx.fill();
  } else if (kind === "lettuce") {
    ctx.fillStyle = "#66bb6a";
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 13 * u, (i % 2 ? -4 : 4) * u, 13 * u, 0, 7); ctx.fill(); }
  } else if (kind === "tomato") {
    ctx.fillStyle = "#e53935"; ctx.beginPath(); ctx.arc(0, 0, 26 * u, 0, 7); ctx.fill();
    ctx.fillStyle = "#43a047"; ctx.beginPath(); ctx.arc(0, -22 * u, 7 * u, 0, 7); ctx.fill();
  } else if (kind === "dough") {
    ctx.fillStyle = "#f3e0b8"; ctx.beginPath(); ctx.arc(0, 0, 32 * u, 0, 7); ctx.fill();
    ctx.strokeStyle = "#e0c48f"; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(0, 0, 24 * u, 0, 7); ctx.stroke();
  } else if (kind === "sauce") {
    ctx.strokeStyle = "#d32f2f"; ctx.lineWidth = 7 * u; ctx.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.3) { const r = 3 * u + a * 4 * u; const px = Math.cos(a) * r, py = Math.sin(a) * r; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
  } else if (kind === "pepperoni") {
    ctx.fillStyle = "#b71c1c"; ctx.beginPath(); ctx.arc(0, 0, 26 * u, 0, 7); ctx.fill();
    ctx.fillStyle = "#e57373";
    [[-10, -8], [10, 4], [-2, 12]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx * u, dy * u, 4 * u, 0, 7); ctx.fill(); });
  } else if (kind === "shell") {
    ctx.fillStyle = "#f0c040"; ctx.beginPath(); ctx.arc(0, 14 * u, 32 * u, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#d99a2b"; ctx.beginPath(); ctx.arc(0, 14 * u, 24 * u, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#f0c040"; ctx.beginPath(); ctx.arc(0, 14 * u, 16 * u, Math.PI, 0); ctx.fill();
  }
  ctx.restore();
}

function drawDishOnPlate(dishKey, done, x, y, s) {
  const dish = DISHES[dishKey];
  ctx.fillStyle = "#eceff1"; ctx.beginPath(); ctx.ellipse(x, y + 52, 120, 16, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = "#b0bec5"; ctx.lineWidth = 2; ctx.stroke();
  let ly = y + 44;
  for (let i = done - 1; i >= 0; i--) {
    drawIngredient(dish.steps[i], x, ly, s);
    ly -= 16;
  }
  if (done === 0) {
    ctx.fillStyle = "#90a4ae"; ctx.font = "italic 15px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("empty plate — pick the glowing ingredient", x, y + 20);
  }
}

function drawTicket(order, x, y) {
  const dish = DISHES[order.dish];
  ctx.save();
  ctx.fillStyle = "#fffde7"; rr(x, y, 200, 96, 8); ctx.fill();
  ctx.strokeStyle = dish.color; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#333"; ctx.font = "bold 17px sans-serif"; ctx.textAlign = "left";
  ctx.fillText(dish.name + "  #" + order.id, x + 12, y + 24);
  // step dots
  for (let i = 0; i < dish.steps.length; i++) {
    ctx.fillStyle = i < order.step ? "#43a047" : (i === order.step ? "#ff9800" : "#cfd8dc");
    ctx.beginPath(); ctx.arc(x + 22 + i * 26, y + 48, 9, 0, 7); ctx.fill();
  }
  ctx.fillStyle = "#666"; ctx.font = "12px sans-serif";
  ctx.fillText(dish.steps.slice(order.step).join(" → ") || "ready!", x + 12, y + 70);
  // timer bar
  const frac = Math.max(0, order.t / order.maxT);
  ctx.fillStyle = "#e0e0e0"; rr(x + 12, y + 80, 176, 8, 4); ctx.fill();
  ctx.fillStyle = frac > 0.5 ? "#43a047" : frac > 0.25 ? "#fb8c00" : "#e53935";
  rr(x + 12, y + 80, 176 * frac, 8, 4); ctx.fill();
  ctx.restore();
}

function drawTiles() {
  const gx = 190, gy = 430, s = 76, gap = 10;
  const want = state.screen === "play" && state.orders.length
    ? DISHES[state.orders[0].dish].steps[state.orders[0].step]
    : null;
  INGREDIENTS.forEach((ing, i) => {
    const x = gx + (i % 3) * (s + gap), y = gy + Math.floor(i / 3) * (s + gap);
    const hot = ing === want;
    ctx.fillStyle = hot ? "#fff8e1" : "#ffffff"; rr(x, y, s, s, 10); ctx.fill();
    ctx.strokeStyle = hot ? "#ff9800" : "#bcaaa4"; ctx.lineWidth = hot ? 4 : 2; ctx.stroke();
    drawIngredient(ing, x + s / 2, y + s / 2 - 6, 56);
    ctx.fillStyle = "#4e342e"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(ing.toUpperCase(), x + s / 2, y + s - 8);
    if (hot) { ctx.fillStyle = "#ff9800"; ctx.font = "bold 12px sans-serif"; ctx.fillText("▼ NEXT", x + s / 2, y - 8); }
  });
  ctx.fillStyle = "#5d4037"; ctx.font = "13px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("Click the glowing ingredient (or press 1–9) in order, then it serves itself.", 190, 408);
}

function drawHUD() {
  ctx.fillStyle = "#3e2723"; rr(16, 12, 928, 44, 10); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("SIZZLE & SERVE", 28, 41);
  ctx.textAlign = "center";
  ctx.fillText("DAY " + state.day + " / 3", 480, 41);
  ctx.fillText("SCORE " + state.score, 660, 41);
  ctx.fillStyle = state.combo > 1 ? "#ffd54f" : "#fff";
  ctx.fillText(state.combo > 1 ? "COMBO x" + state.combo : "COMBO —", 810, 41);
  ctx.fillStyle = "#ef9a9a";
  ctx.fillText("✕".repeat(state.strikes) + "○".repeat(3 - state.strikes), 910, 41);
  // day timer
  ctx.fillStyle = "#5d4037"; rr(16, 62, 928, 10, 5); ctx.fill();
  ctx.fillStyle = "#8d6e63"; rr(16, 62, 928 * Math.max(0, state.dayT / DAY_TIME), 10, 5); ctx.fill();
}

function drawTitle() {
  ctx.fillStyle = "#fff3e0"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e65100"; ctx.font = "bold 64px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("SIZZLE & SERVE", W / 2, 190);
  ctx.fillStyle = "#5d4037"; ctx.font = "24px sans-serif";
  ctx.fillText("The 60-second diner rush — build every order", W / 2, 240);
  ctx.fillText("before its ticket runs out.", W / 2, 272);
  // three mini dish stacks, drawn from real ingredient icons
  drawIngredient("bun", W / 2 - 140, 332, 78);
  drawIngredient("patty", W / 2 - 140, 352, 78);
  drawIngredient("cheese", W / 2 - 140, 366, 78);
  drawIngredient("dough", W / 2, 348, 78);
  drawIngredient("pepperoni", W / 2, 348, 78);
  drawIngredient("shell", W / 2 + 140, 348, 78);
  drawIngredient("tomato", W / 2 + 140, 330, 56);
  ctx.fillStyle = "#bf360c"; ctx.font = "bold 26px sans-serif";
  ctx.fillText("CLICK OR PRESS ENTER TO START", W / 2, 480);
  ctx.fillStyle = "#8d6e63"; ctx.font = "16px sans-serif";
  ctx.fillText("9 ingredients · 3 dishes · 3 days · 3 strikes — how high can you score?", W / 2, 520);
}

function drawDayDone() {
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff"; rr(W / 2 - 260, 150, 520, 260, 16); ctx.fill();
  ctx.fillStyle = "#2e7d32"; ctx.font = "bold 34px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("DAY " + state.day + " COMPLETE!", W / 2, 220);
  ctx.fillStyle = "#333"; ctx.font = "22px sans-serif";
  ctx.fillText("Served: " + state.servedToday + "   Lost: " + state.lostToday, W / 2, 270);
  ctx.fillText("Score: " + state.score, W / 2, 305);
  ctx.fillStyle = "#bf360c"; ctx.font = "bold 22px sans-serif";
  ctx.fillText(state.day < 3 ? "CLICK FOR DAY " + (state.day + 1) + " — IT GETS FASTER" : "", W / 2, 360);
}

function drawEnd(complete) {
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff"; rr(W / 2 - 280, 140, 560, 300, 16); ctx.fill();
  ctx.fillStyle = complete ? "#2e7d32" : "#c62828";
  ctx.font = "bold 36px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(complete ? "SERVICE COMPLETE!" : "KITCHEN CLOSED", W / 2, 210);
  ctx.fillStyle = "#333"; ctx.font = "24px sans-serif";
  ctx.fillText("Final score: " + state.score, W / 2, 265);
  ctx.fillText("Best combo: x" + Math.max(1, state.combo) + "   Dishes served: " + state.servedToday, W / 2, 300);
  ctx.fillStyle = "#bf360c"; ctx.font = "bold 20px sans-serif";
  ctx.fillText("CLICK OR PRESS ENTER TO PLAY AGAIN", W / 2, 380);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  // kitchen backdrop
  ctx.fillStyle = "#f7e8d0"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8d3ae"; ctx.fillRect(0, 400, W, 200);
  ctx.fillStyle = "#8d6e63"; ctx.fillRect(0, 396, W, 8);
  // tile floor lines
  ctx.strokeStyle = "rgba(0,0,0,0.06)"; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 404); ctx.lineTo(x, H); ctx.stroke(); }
  if (state.screen === "title") return drawTitle();
  drawHUD();
  // tickets
  state.orders.forEach((o, i) => drawTicket(o, 24 + i * 216, 84));
  // plate / grill
  if (state.screen === "play" && state.orders.length) {
    const o = state.orders[0];
    drawDishOnPlate(o.dish, o.step, 480, 270, 84);
    ctx.fillStyle = "#5d4037"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("NOW BUILDING: " + DISHES[o.dish].name.toUpperCase(), 480, 225);
  } else if (state.screen === "play") {
    ctx.fillStyle = "#8d6e63"; ctx.font = "italic 18px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("waiting for the next ticket…", 480, 300);
  }
  drawTiles();
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const p of state.popups) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  if (state.screen === "daydone") drawDayDone();
  if (state.screen === "gameover") drawEnd(false);
  if (state.screen === "complete") drawEnd(true);
}

// ---- screenshot staging (deterministic states for ?shot=) -----------------
function stageShot(kind) {
  if (kind === "title") { state.screen = "title"; return; }
  if (kind === "rush") {
    state.screen = "play"; state.day = 2; state.score = 1250; state.combo = 3; state.strikes = 1;
    state.dayT = 34;
    state.orders = [
      { dish: "pizza", step: 2, t: 12, maxT: 20, id: 7 },
      { dish: "burger", step: 1, t: 18, maxT: 20, id: 8 },
      { dish: "taco", step: 0, t: 20, maxT: 20, id: 9 },
    ];
    state.plate = "pizza";
    return;
  }
  if (kind === "done") {
    state.screen = "complete"; state.day = 3; state.score = 2840; state.combo = 5;
    state.servedToday = 21; state.strikes = 1;
    return;
  }
}

// ---- main loop -----------------------------------------------------------
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  const params = new URLSearchParams(location.search);
  if (params.has("shot")) { draw(); return; } // frozen frame for screenshots
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

(function init() {
  const params = new URLSearchParams(location.search);
  const shot = params.get("shot");
  if (shot) {
    stageShot(shot);
    const p = document.querySelector("p");
    if (p) p.style.display = "none"; // clean frame for screenshots
  }
  draw();
  if (!shot) requestAnimationFrame(frame);
  window.__game = { state, startGame, DISHES, INGREDIENTS };
})();
