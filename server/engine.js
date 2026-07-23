const { stmts } = require("./db");

// These constants mirror the browser sim in ../app.js exactly (MOODS 8-70,
// INPUTS 371-377, tick 459-499). Keep them in sync if the site's engine changes.
const MOODS = [
  { key: "despairing", min: -1.01 },
  { key: "weepy", min: -0.62 },
  { key: "anxious", min: -0.28 },
  { key: "wistful", min: 0.0 },
  { key: "sunny", min: 0.3 },
  { key: "euphoric", min: 0.66 },
];

const INPUT_SEED = [
  { label: "the sky was clear at lunch", weight: 22, on: true },
  { label: "slept more than seven hours", weight: 15, on: true },
  { label: "peach juice in the vending machine", weight: 30, on: false },
  { label: "forgot her maths homework", weight: -9, on: false },
  { label: "someone was sad on the train", weight: -14, on: false },
];

const TICKERS = [
  { sym: "AAPLx", px: 209.3 },
  { sym: "TSLAx", px: 241.8 },
  { sym: "NVDAx", px: 172.4 },
  { sym: "HOODx", px: 98.12 },
  { sym: "GOOGLx", px: 186.55 },
  { sym: "AMZNx", px: 224.9 },
  { sym: "SPYx", px: 552.3 },
];

const TICK_MS = 5000;
const HISTORY_MIN_GAP_MS = 60000;
const TAPE_MAX = 50;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function moodFor(m) {
  let out = MOODS[0].key;
  for (const mo of MOODS) if (m >= mo.min) out = mo.key;
  return out;
}

let m = 0.12;
let vel = 0;
let mood = moodFor(m);
let inputs = [];
let conviction = 50;
let lastTickAt = 0;
let lastHistoryAt = 0;
const tape = [];

function convictionNow() {
  const sum = inputs.reduce((a, i) => a + (i.on ? i.weight : 0), 0);
  return clamp(50 + sum, 0, 100);
}

function loadInputs() {
  if (stmts.countInputs.get().n === 0) {
    INPUT_SEED.forEach((i, ord) =>
      stmts.seedInput.run({ label: i.label, weight: i.weight, is_on: i.on ? 1 : 0, ord }));
  }
  inputs = stmts.allInputs.all().map((r) => ({ label: r.label, weight: r.weight, on: r.is_on === 1 }));
}

function init() {
  const row = stmts.getState.get();
  if (row) {
    m = row.m;
    vel = row.vel;
  }
  loadInputs();
  mood = moodFor(m);
  conviction = convictionNow();
}

function saveState(now) {
  stmts.saveState.run({ m, vel, conviction, mood, updated_at: now });
}

function addFill() {
  const side = m > 0.25 ? "BUY" : m < -0.25 ? "SELL" : "HOLD";
  const t = TICKERS[Math.floor(Math.random() * TICKERS.length)];
  const qty = +(0.1 + Math.random() * 1.8).toFixed(1);
  tape.push({ ts: Date.now(), side, sym: t.sym, qty, price: +t.px.toFixed(2) });
  if (tape.length > TAPE_MAX) tape.shift();
}

function tick() {
  vel += (Math.random() - 0.5) * 0.05 - m * 0.006;
  vel *= 0.93;
  if (Math.random() < 0.02) vel += (Math.random() - 0.5) * 0.3;
  m = clamp(m + vel, -1, 1);
  mood = moodFor(m);

  if (Math.random() < 0.04) {
    const inp = inputs[Math.floor(Math.random() * inputs.length)];
    const goodOdds = (m + 1) / 2;
    const was = inp.on;
    inp.on = Math.random() < (inp.weight > 0 ? goodOdds : 1 - goodOdds);
    if (inp.on !== was) stmts.setInputOn.run({ label: inp.label, is_on: inp.on ? 1 : 0 });
  }
  conviction = convictionNow();

  if (Math.random() < 0.12) addFill();

  const bias = m * 0.0009;
  for (const t of TICKERS) t.px = Math.max(1, t.px * (1 + bias + (Math.random() - 0.5) * 0.0022));

  const now = Date.now();
  lastTickAt = now;
  saveState(now);
  if (now - lastHistoryAt >= HISTORY_MIN_GAP_MS) {
    stmts.insertHistory.run({ ts: now, m, conviction, mood });
    lastHistoryAt = now;
  }
}

function start() {
  init();
  lastTickAt = Date.now();
  saveState(lastTickAt);
  return setInterval(tick, TICK_MS);
}

function getState() {
  return {
    m,
    mood,
    conviction,
    inputs: inputs.map((i) => ({ label: i.label, weight: i.weight, on: i.on })),
    updated_at: lastTickAt,
  };
}

function getTape(n) {
  return tape.slice(-n).reverse();
}

function nudge(dm) {
  m = clamp(m + dm, -1, 1);
  mood = moodFor(m);
  saveState(Date.now());
  return m;
}

module.exports = { start, getState, getTape, nudge, lastTickAt: () => lastTickAt };
