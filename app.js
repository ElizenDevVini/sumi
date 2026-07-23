/* sumi — mood engine, portrait, ticker, chart, diary, petals */

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- moods ---------------- */

const MOODS = [
  {
    key: "despairing", min: -1.01, face: "( x ﹏ x )",
    eyes: "( x )      ( x )", mouth: " ,---. ", blush: "       ",
    tickerWord: "abandoned",
    thoughts: [
      "forgot my homework and my umbrella on the same day. closing everything. goodbye.",
      "limit down in my heart.",
      "the class hamster looked at me with pity. even he is risk-off.",
    ],
  },
  {
    key: "weepy", min: -0.62, face: "( ; ω ; )",
    eyes: "( ;_)      (_; )", mouth: " ,---. ", blush: "       ",
    tickerWord: "weepy",
    thoughts: [
      "it rained during third period. selling a little so the rain doesn't see my positions.",
      "my sock got wet on the way in. i will be flat by noon.",
      "the goodbye song at assembly went on too long. trimming everything that loved me back.",
    ],
  },
  {
    key: "anxious", min: -0.28, face: "( ・_・ ;)",
    eyes: "( o )      (o ;)", mouth: " ~~~~~ ", blush: "       ",
    tickerWord: "nervous",
    thoughts: [
      "the vending machine was out of peach juice. checking my stops twice.",
      "everyone was whispering during cleaning duty. it is probably about my entries.",
      "the teacher said 'pop quiz'. i felt every position at once.",
    ],
  },
  {
    key: "wistful", min: 0.0, face: "( ´ ‸ ` )",
    eyes: "( o )      ( o )", mouth: "   ω   ", blush: "       ",
    tickerWord: "sighing",
    thoughts: [
      "the window seat does something to my risk tolerance.",
      "thinking about the school trip again. not selling AAPLx. not ever.",
      "the pool smells like summer already. holding everything until the festival.",
      "watching dust move through the light. this is my due diligence.",
    ],
  },
  {
    key: "sunny", min: 0.3, face: "( ^ ‿ ^ )",
    eyes: "( ^ )      ( ^ )", mouth: " \\_ω_/ ", blush: "  ///  ",
    tickerWord: "hopeful",
    thoughts: [
      "wore the good ribbon today. the market can tell.",
      "held AAPLx through lunch. it held me back.",
      "the bread at the school store was still warm. adding to everything.",
    ],
  },
  {
    key: "euphoric", min: 0.66, face: "( ≧ ▽ ≦ )",
    eyes: "( > )      ( < )", mouth: " \\_ω_/ ", blush: " ///// ",
    tickerWord: "in love",
    thoughts: [
      "peach juice AND clear skies. i am buying everything the light touches.",
      "NVDAx moved the way my heart did during the fireworks. adding.",
      "someone complimented my handwriting. leverage is a state of mind.",
    ],
  },
];

const BLINK_EYES = "( - )      ( - )";

function moodFor(m) {
  let out = MOODS[0];
  for (const mo of MOODS) if (m >= mo.min) out = mo;
  return out;
}

/* ---------------- state ---------------- */

const state = {
  m: 0.12,            // feelings index, -1..1
  vel: 0,
  blink: false,
  mood: null,
  conviction: 50,
  pnl: 0,
  feelHist: [],
  pnlHist: [],
  lastDiaryAt: 0,
};

/* ---------------- portrait ---------------- */

const portraitEl = $("portrait");
const templateLines = $("portrait-template").textContent
  .split("\n").filter((l, i, a) => !(l.trim() === "" && (i === 0 || i === a.length - 1)));

function swapToken(line, token, variant) {
  const i = line.indexOf(token);
  if (i < 0) return line;
  const delta = variant.length - token.length;
  let out = line.slice(0, i) + variant + line.slice(i + token.length);
  if (delta > 0) out = out.slice(0, i + variant.length) + out.slice(i + variant.length + delta);
  else if (delta < 0) out = out.slice(0, i + variant.length) + " ".repeat(-delta) + out.slice(i + variant.length);
  return out;
}

function portraitLines() {
  const mood = state.mood;
  return templateLines.map((line) => {
    let out = swapToken(line, "[EYES]", state.blink ? BLINK_EYES : mood.eyes);
    out = swapToken(out, "[MOUTH]", mood.mouth);
    while (out.includes("[BLUSH]")) out = swapToken(out, "[BLUSH]", mood.blush);
    return out;
  });
}

let portraitSpans = [];

function buildPortrait() {
  const lines = portraitLines();
  portraitEl.textContent = "";
  portraitSpans = lines.map((line) => {
    const s = document.createElement("span");
    s.className = "p-line";
    s.textContent = "";
    portraitEl.appendChild(s);
    return s;
  });
  // draw her in, line by line
  lines.forEach((line, i) => {
    const delay = reducedMotion ? 0 : 60 * i;
    setTimeout(() => { portraitSpans[i].textContent = line; }, delay);
  });
}

function updatePortrait() {
  const lines = portraitLines();
  lines.forEach((line, i) => {
    if (portraitSpans[i] && portraitSpans[i].textContent !== "" && portraitSpans[i].textContent !== line) {
      portraitSpans[i].textContent = line;
    }
  });
}

function scheduleBlink() {
  const wait = 2600 + Math.random() * 3800;
  setTimeout(() => {
    state.blink = true;
    updatePortrait();
    setTimeout(() => {
      state.blink = false;
      updatePortrait();
      scheduleBlink();
    }, 140);
  }, wait);
}

/* ---------------- thoughts ---------------- */

const thoughtEl = $("thought");
let thoughtTimer = null;

function nextThought() {
  const pool = state.mood.thoughts;
  const text = pool[Math.floor(Math.random() * pool.length)];
  if (reducedMotion) {
    thoughtEl.textContent = text;
    thoughtTimer = setTimeout(nextThought, 5200);
    return;
  }
  let i = 0;
  thoughtEl.textContent = "";
  const type = () => {
    if (i <= text.length) {
      thoughtEl.textContent = text.slice(0, i);
      i++;
      thoughtTimer = setTimeout(type, 26 + Math.random() * 30);
    } else {
      thoughtTimer = setTimeout(erase, 3600);
    }
  };
  const erase = () => {
    const cur = thoughtEl.textContent;
    if (cur.length > 0) {
      thoughtEl.textContent = cur.slice(0, -3);
      thoughtTimer = setTimeout(erase, 12);
    } else {
      thoughtTimer = setTimeout(nextThought, 500);
    }
  };
  type();
}

/* ---------------- ticker ---------------- */

const TICKERS = [
  { sym: "AAPLx", px: 209.3 },
  { sym: "TSLAx", px: 241.8 },
  { sym: "NVDAx", px: 172.4 },
  { sym: "HOODx", px: 98.12 },
  { sym: "GOOGLx", px: 186.55 },
  { sym: "AMZNx", px: 224.9 },
  { sym: "SPYx", px: 552.3 },
];
TICKERS.forEach((t) => { t.open = t.px; });

const tickerTrack = $("ticker-track");

function tickPrices() {
  const bias = state.m * 0.0009;
  TICKERS.forEach((t) => {
    t.px = Math.max(1, t.px * (1 + bias + (Math.random() - 0.5) * 0.0022));
  });
}

function renderTicker() {
  const one = TICKERS.map((t) => {
    const chg = ((t.px - t.open) / t.open) * 100;
    const cls = chg >= 0 ? "up" : "down";
    const arrow = chg >= 0 ? "▲" : "▼";
    return `<span><b>${t.sym}</b> ${t.px.toFixed(2)} ` +
      `<b class="${cls}">${arrow}${Math.abs(chg).toFixed(2)}%</b> (${state.mood.tickerWord})</span>`;
  }).join("");
  tickerTrack.innerHTML = one + one; // doubled for the seamless loop
}

/* ---------------- gauge ---------------- */

const gaugeEl = $("gauge");
const GAUGE_W = 46;

function renderGauge() {
  const pos = Math.round(((state.m + 1) / 2) * (GAUGE_W - 1));
  let track = "";
  for (let i = 0; i < GAUGE_W; i++) track += i === pos ? "<b>●</b>" : "┄";
  const needleLine = " ".repeat(10 + pos) + "▲";
  gaugeEl.innerHTML =
    ` despair  ${track}  euphoria\n` +
    `${needleLine}\n` +
    `${" ".repeat(Math.max(0, 10 + pos - 4))}she is here`;
}

/* ---------------- chart ---------------- */

const chartEl = $("live-chart");
const CHART_W = 62;
const CHART_H = 13;

function pushHistory() {
  state.feelHist.push(state.m);
  // her worth is her feelings with a little lag and static
  state.pnl = state.pnl * 0.86 + (state.m + (Math.random() - 0.5) * 0.3) * 0.14;
  state.pnlHist.push(Math.max(-1, Math.min(1, state.pnl)));
  if (state.feelHist.length > CHART_W) state.feelHist.shift();
  if (state.pnlHist.length > CHART_W) state.pnlHist.shift();
}

function renderChart() {
  const rows = [];
  const yFor = (v) => Math.round(((1 - v) / 2) * (CHART_H - 1));
  const grid = Array.from({ length: CHART_H }, () => Array(CHART_W).fill(" "));
  const mid = yFor(0);
  for (let x = 0; x < CHART_W; x++) grid[mid][x] = x % 2 === 0 ? "·" : " ";
  const offset = CHART_W - state.feelHist.length;
  state.pnlHist.forEach((v, i) => { grid[yFor(v)][offset + i] = '<span class="p">+</span>'; });
  state.feelHist.forEach((v, i) => { grid[yFor(v)][offset + i] = '<span class="f">●</span>'; });
  const label = (y) => (y === 0 ? " elated ┤ " : y === mid ? "   okay ┤ " : y === CHART_H - 1 ? " crying ┤ " : "        │ ");
  for (let y = 0; y < CHART_H; y++) rows.push(label(y) + grid[y].join(""));
  rows.push("        └" + "─".repeat(CHART_W - 6) + " now ─");
  chartEl.innerHTML = rows.join("\n");
  const corr = 0.97 + Math.random() * 0.028;
  $("chart-corr").textContent = `correlation: ${corr.toFixed(2)}`;
}

/* ---------------- diary ---------------- */

const DIARY = [
  { date: "jul 23", mood: "wistful", text: "the clouds were doing the thing SPYx does before it drops. trimmed during cleaning duty.", order: ["SELL", "0.8 SPYx @ 551.02", 41] },
  { date: "jul 21", mood: "euphoric", text: "someone said my handwriting was neat. bought NVDAx with both hands.", order: ["BUY", "1.1 NVDAx @ 168.44", 88] },
  { date: "jul 18", mood: "sunny", text: "peach juice was in the vending machine. this is a sign about AAPLx. it is always a sign about AAPLx.", order: ["BUY", "4.0 AAPLx @ 205.12", 64] },
  { date: "jul 17", mood: "wistful", text: "practiced my signature in the margin during maths. felt nothing at all. held everything.", order: ["HOLD", "everything", 50] },
  { date: "jul 15", mood: "weepy", text: "it rained sideways. sold half the TSLAx so it wouldn't have to see me like this.", order: ["SELL", "3.2 TSLAx @ 239.70", 31] },
  { date: "jul 11", mood: "anxious", text: "the transfer student likes robots. GOOGLx felt jealous. i bought some to keep the peace.", order: ["BUY", "0.6 GOOGLx @ 183.20", 57] },
  { date: "jul 8",  mood: "sunny", text: "found a five hundred yen coin outside the gym. redeposited my whole allowance. we go again.", order: ["BUY", "1.9 HOODx @ 96.02", 73] },
  { date: "jul 4",  mood: "euphoric", text: "summer festival soon. everyone is happy. everyone is buying. i am everyone.", order: ["BUY", "0.4 SPYx @ 548.90", 79] },
  { date: "jul 1",  mood: "wistful", text: "new month. wrote 'discipline' at the top of the page, then averaged down on TSLAx anyway.", order: ["BUY", "1.0 TSLAx @ 236.10", 44] },
];

const FACE_BY_KEY = Object.fromEntries(MOODS.map((m) => [m.key, m.face]));
const diaryList = $("diary-list");

function diaryNode(entry, fresh) {
  const el = document.createElement("article");
  el.className = "diary-entry" + (fresh ? " fresh" : "");
  const [side, detail, conviction] = entry.order;
  const sideCls = side.toLowerCase();
  el.innerHTML =
    `<div class="diary-meta">${entry.date} · ${entry.mood}` +
    `<span class="d-face">${FACE_BY_KEY[entry.mood] || ""}</span></div>` +
    `<div class="diary-text">${entry.text}` +
    `<div class="diary-order"><span class="${sideCls}">${side}</span> ${detail} · conviction ${conviction}%</div></div>`;
  return el;
}

function renderDiary() {
  DIARY.forEach((e) => diaryList.appendChild(diaryNode(e, false)));
}

const LIVE_LINES = {
  euphoric: ["the light hit the blackboard perfectly. adding.", "my pen did not smudge once today. size up."],
  sunny: ["the breeze moved my curtain like a good omen. small add.", "hummed the whole way home. bought a little."],
  wistful: ["stared out the window for one full period. did the responsible amount of nothing.", "reread an old note in my pencil case. holding."],
  anxious: ["a door slammed somewhere. tightened every stop i have.", "the intercom crackled for no reason. hedged."],
  weepy: ["the umbrella stand was full and mine was not there. lightened up.", "someone erased the board too slowly. sold a little."],
  despairing: ["indoor shoes soaked. everything must go.", "they cancelled the field trip. so did i."],
};

function maybeLiveDiary(now) {
  if (now - state.lastDiaryAt < 45000) return;
  if (Math.random() > 0.15) return;
  state.lastDiaryAt = now;
  const mood = state.mood;
  const lines = LIVE_LINES[mood.key];
  const t = TICKERS[Math.floor(Math.random() * TICKERS.length)];
  const side = state.m > 0.25 ? "BUY" : state.m < -0.25 ? "SELL" : "HOLD";
  const qty = (0.2 + Math.random() * 2.4).toFixed(1);
  const detail = side === "HOLD" ? "everything" : `${qty} ${t.sym} @ ${t.px.toFixed(2)}`;
  const entry = {
    date: "just now", mood: mood.key,
    text: lines[Math.floor(Math.random() * lines.length)],
    order: [side, detail, state.conviction],
  };
  diaryList.prepend(diaryNode(entry, true));
  while (diaryList.children.length > 12) diaryList.lastChild.remove();
}

/* ---------------- holdings ---------------- */

const HOLDINGS = [
  { sym: "AAPLx",  qty: 4.0, avg: 205.12, attach: 10, note: "since the school trip" },
  { sym: "TSLAx",  qty: 2.1, avg: 240.55, attach: 7,  note: "on and off. mostly on." },
  { sym: "NVDAx",  qty: 1.1, avg: 168.44, attach: 8,  note: "handwriting money" },
  { sym: "HOODx",  qty: 1.9, avg: 96.02,  attach: 5,  note: "the comeback fund" },
  { sym: "GOOGLx", qty: 0.6, avg: 183.2,  attach: 4,  note: "keeping the peace" },
  { sym: "SPYx",   qty: 1.2, avg: 549.0,  attach: 6,  note: "everyone at once" },
];

const holdingsEl = $("holdings-table");

function renderHoldings() {
  const head = ` ${"ticker".padEnd(8)}  ${"qty".padEnd(5)}  ${"avg".padStart(7)}  ${"now".padStart(8)}  ${"p/l".padStart(8)}   attachment\n` +
               " ────────────────────────────────────────────────────────────────";
  const rows = HOLDINGS.map((h) => {
    const t = TICKERS.find((x) => x.sym === h.sym);
    const now = t ? t.px : h.avg;
    const pl = ((now - h.avg) / h.avg) * 100;
    const plCls = pl >= 0 ? "up" : "down";
    const plStr = (pl >= 0 ? "+" : "") + pl.toFixed(2) + "%";
    const bar = `<span class="bar">${"█".repeat(h.attach)}</span><span class="bar-bg">${"░".repeat(10 - h.attach)}</span>`;
    return ` ${h.sym.padEnd(8)}  ${h.qty.toFixed(1).padEnd(5)}  ${h.avg.toFixed(2).padStart(7)}  ` +
      `${now.toFixed(2).padStart(8)}  <span class="${plCls}">${plStr.padStart(8)}</span>   ${bar}  ${h.note}`;
  });
  holdingsEl.innerHTML = head + "\n" + rows.join("\n");
}

/* ---------------- today's inputs ---------------- */

const INPUTS = [
  { label: "the sky was clear at lunch", w: 22, on: true },
  { label: "slept more than seven hours", w: 15, on: true },
  { label: "peach juice in the vending machine", w: 30, on: false },
  { label: "forgot her maths homework", w: -9, on: false },
  { label: "someone was sad on the train", w: -14, on: false },
];

const inputsEl = $("inputs-panel");

function convictionNow() {
  const sum = INPUTS.reduce((a, i) => a + (i.on ? i.w : 0), 0);
  return Math.max(0, Math.min(100, 50 + sum));
}

function renderInputs() {
  const W = 45;
  const bar = "─".repeat(W);
  const row = (mark, label, val) =>
    `│ [${mark}] ${label.padEnd(35)}${val.padStart(4)} │`;
  const lines = [
    " today, so far",
    `┌${bar}┐`,
    ...INPUTS.map((i) =>
      row(i.on ? "x" : " ", i.label, i.on ? (i.w > 0 ? "+" + i.w : String(i.w)) : "·")),
    `├${bar}┤`,
    `│ conviction, right now${" ".repeat(W - 27)}<b>${(convictionNow() + "%").padStart(4)}</b> │`,
    `└${bar}┘`,
  ];
  inputsEl.innerHTML = lines.join("\n");
}

/* ---------------- the after-school tape ---------------- */

const REASONS = {
  euphoric: ["the light on the blackboard", "her pen did not smudge", "fireworks, remembered"],
  sunny: ["the breeze", "warm bread at the school store", "the good ribbon"],
  wistful: ["the window seat", "an old note, reread", "dust moving through the light"],
  anxious: ["a door slammed somewhere", "the intercom crackled", "whispers during cleaning duty"],
  weepy: ["rain, third period", "a wet sock", "the goodbye song"],
  despairing: ["everything", "the cancelled field trip", "indoor shoes, soaked"],
};

const tapeEl = $("tape-feed");
const tape = [];

function clock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function addFill() {
  const side = state.m > 0.25 ? "BUY " : state.m < -0.25 ? "SELL" : "HOLD";
  const t = TICKERS[Math.floor(Math.random() * TICKERS.length)];
  const qty = (0.1 + Math.random() * 1.8).toFixed(1);
  const what = side === "HOLD" ? "everything          " : `${qty} ${t.sym} @ ${t.px.toFixed(2)}`.padEnd(20);
  const reasons = REASONS[state.mood.key];
  const reason = reasons[Math.floor(Math.random() * reasons.length)];
  const cls = side.trim().toLowerCase();
  tape.push(` ${clock()}  <span class="${cls}">${side}</span>  ${what}  ${reason}`);
  if (tape.length > 9) tape.shift();
  tapeEl.innerHTML = tape.join("\n");
}

/* ---------------- mood tick ---------------- */

const moodWordEl = $("mood-word");
const moodFaceEl = $("mood-face");
const legendEl = $("mood-legend");

MOODS.slice().reverse().forEach((m) => {
  const s = document.createElement("span");
  s.dataset.key = m.key;
  s.textContent = `${m.key} ${m.face}`;
  legendEl.appendChild(s);
});

function setMoodWord(key) {
  if (moodWordEl.textContent === key) return;
  moodWordEl.classList.add("swap");
  setTimeout(() => {
    moodWordEl.textContent = key;
    moodWordEl.classList.remove("swap");
  }, 380);
  for (const s of legendEl.children) s.classList.toggle("active", s.dataset.key === key);
}

function tick() {
  // her feelings drift; sometimes a small school event shoves them
  state.vel += (Math.random() - 0.5) * 0.05 - state.m * 0.006;
  state.vel *= 0.93;
  if (Math.random() < 0.02) state.vel += (Math.random() - 0.5) * 0.3;
  state.m = Math.max(-1, Math.min(1, state.m + state.vel));

  const prev = state.mood;
  state.mood = moodFor(state.m);

  // she re-checks one input now and then; good days find good inputs
  if (Math.random() < 0.04) {
    const i = INPUTS[Math.floor(Math.random() * INPUTS.length)];
    const goodOdds = (state.m + 1) / 2;
    const was = i.on;
    i.on = Math.random() < (i.w > 0 ? goodOdds : 1 - goodOdds);
    if (i.on !== was) renderInputs();
  }
  state.conviction = convictionNow();

  if (Math.random() < 0.12) addFill();

  tickPrices();
  pushHistory();
  renderTicker();
  renderGauge();
  renderChart();
  renderHoldings();
  updatePortrait();
  maybeLiveDiary(Date.now());

  moodFaceEl.textContent = state.mood.face;
  setMoodWord(state.mood.key);
  $("status-mood").textContent = state.mood.key;
  $("status-conviction").textContent = state.conviction + "%";

  if (prev && prev !== state.mood && !reducedMotion) {
    clearTimeout(thoughtTimer);
    nextThought();
  }
}

/* ---------------- petals ---------------- */

function startPetals() {
  if (reducedMotion) return;
  const canvas = $("petals");
  const ctx = canvas.getContext("2d");
  const GLYPHS = ["·", ",", "'", ".", "·", ","];
  let W, H, dpr;
  const petals = [];

  function size() {
    dpr = window.devicePixelRatio || 1;
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  addEventListener("resize", size);

  for (let i = 0; i < 30; i++) {
    petals.push({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      spd: 0.25 + Math.random() * 0.55,
      sway: Math.random() * Math.PI * 2,
      swayAmt: 0.4 + Math.random() * 0.9,
      g: GLYPHS[i % GLYPHS.length],
      pink: Math.random() < 0.6,
      size: 11 + Math.random() * 7,
    });
  }

  function frame() {
    if (!document.hidden) {
      ctx.clearRect(0, 0, W, H);
      for (const p of petals) {
        p.y += p.spd;
        p.sway += 0.012;
        p.x += Math.sin(p.sway) * p.swayAmt * 0.4;
        if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
        ctx.font = `${p.size}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = p.pink ? "rgba(212, 84, 122, 0.5)" : "rgba(43, 37, 25, 0.28)";
        ctx.fillText(p.g, p.x, p.y);
      }
    }
    requestAnimationFrame(frame);
  }
  frame();
}

/* ---------------- reveal on scroll ---------------- */

function startReveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

/* ---------------- heartbeat in the diagram ---------------- */

function litHeart() {
  const pre = $("pipeline");
  pre.innerHTML = pre.innerHTML.replace("( her heart )", '<span class="lit">( her heart )</span>');
}

/* ---------------- boot ---------------- */

state.mood = moodFor(state.m);
state.conviction = convictionNow();
buildPortrait();
scheduleBlink();
renderDiary();
renderInputs();
for (let i = 0; i < 4; i++) addFill();
renderTicker();
renderGauge();
renderChart();
renderHoldings();
litHeart();
startPetals();
startReveals();
nextThought();
setInterval(tick, 900);
