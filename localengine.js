// KataGo Cloud · 내 기기로 분석: a KataGo analysis engine running in a Web Worker on this device.
// It answers the same JSON queries the GPU's analysis engine answers (the analysis screen sends them unchanged), so
// 자동분석, 대국 리포트, AI대국 and 오답노트 all work without a rented GPU. The neural net is KataGo's own: the
// '빠름' (b10c384h6nbttflrs) or '균형' (b10c512h8nbt3tflrs) model, picked by ?m= on this worker's address, turned into
// ONNX with `katago dumponnx` (KataGo 1.18.2, a 19x19 buffer with board masking, so 9x9 and 13x13 boards fit in its
// top-left corner the way KataGo does it), run by ONNX Runtime Web on the graphics (WebGPU) where the browser offers
// it, else on the CPU (WebAssembly).
// The search is a plain PUCT tree search with batched evaluations (virtual loss), not KataGo's own: no ladder or
// pass-alive input features yet, no symmetries, one tree per query. Values are reported for BLACK, like the GPU's
// engine (reportAnalysisWinratesAs = BLACK).
"use strict";
const ORT_DIST = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
importScripts(ORT_DIST + "ort.webgpu.min.js");
ort.env.wasm.wasmPaths = ORT_DIST;   // inside a worker it cannot tell where its own .wasm / .mjs files live

// A file over 100MB is kept in parts (GitHub takes no bigger file); the parts are fetched and stored one by one.
const MODELS = {
  fast: {name: "KataGo(빠름)", size: 64595794, parts: ["models/b10c384h6nbttflrs-masked.onnx"],
         ref: [{win: .5248, lead: .206, best: 287}, {win: .4759, lead: -.394, best: 288}]},
  balanced: {name: "KataGo(균형)", size: 158833691, parts: ["models/b10c512h8nbt3tflrs-masked.onnx.0", "models/b10c512h8nbt3tflrs-masked.onnx.1"],
             ref: [{win: .5319, lead: .352, best: 287}, {win: .4573, lead: -.404, best: 300}]},
};
const ARGS = new URLSearchParams(self.location.search);
const MODEL = MODELS[ARGS.get("m")] || MODELS.fast, MODEL_NAME = MODEL.name + " · 내 기기";
const CPU_ONLY = ARGS.get("ep") === "wasm";   // GPU 대여's 시작 already found the graphics unusable here: no second 90-second try
const B = 19, BB = B * B;                 // the net's buffer: 19x19, smaller boards sit in its top-left corner
const CPUCT = 1.1, FPU = .2, BATCH = 8, SCORE_UTIL = .3;
// Playouts per evaluation batch, kept to what this device does in about STEP_MS: a query waits for the batch in hand
// before it starts, and 8 at once took 4-5 s on a CPU (phones longer), so a new position showed nothing for that long.
// 0.1 s, the analysis screen's report interval, so the win rate moves as often as a rented GPU's where the device
// is fast enough (a device slower than one position per 0.1 s reports after each position)
const STEP_MS = 100;
let batch = 1;
let session = null, ep = "", meta = {leadMultiplier: 20, scoreStdevMultiplier: 20};
const post = m => postMessage(m);

// ---------------------------------------------------------------- loading
async function fetchModel(model) {   // the whole file; progress is over all its parts
  let cache = null, done = 0, said = -1;
  try { cache = await caches.open("kgc-models-v1"); } catch { cache = null; }
  const files = [];
  for (const url of model.parts) {
    let hit = null; try { hit = cache && await cache.match(url); } catch { hit = null; }
    if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); files.push(b); done += b.length; continue; }
    const r = await fetch(url); if (!r.ok) throw new Error("모델 파일을 받지 못했습니다 (" + r.status + ")");
    const reader = r.body.getReader(), chunks = []; let got = 0;
    for (;;) {
      const {done: end, value} = await reader.read(); if (end) break;
      chunks.push(value); got += value.length;
      const pct = Math.min(99, Math.floor((done + got) / model.size * 100));
      if (pct !== said) { said = pct; post({local: "progress", pct, mb: Math.round((done + got) / 1e6)}); }
    }
    const b = new Uint8Array(got); let o = 0; for (const c of chunks) { b.set(c, o); o += c.length; }
    try { if (cache) await cache.put(url, new Response(b.slice())); } catch { /* storage full or blocked: download again next time */ }
    files.push(b); done += got;
  }
  if (files.length === 1) return files[0].buffer;
  const buf = new Uint8Array(done); let o = 0; for (const b of files) { buf.set(b, o); o += b.length; }
  return buf.buffer;
}
async function load() {
  try {
    const buf = await fetchModel(MODEL);
    post({local: "preparing"});
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    let adapter = null; try { adapter = !CPU_ONLY && navigator.gpu && await navigator.gpu.requestAdapter({powerPreference: "high-performance"}); } catch { /* none */ }
    if (adapter) ort.env.webgpu.adapter = adapter;   // a laptop's own graphics card rather than the built-in one
    const limit = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
    for (const e of adapter ? ["webgpu", "wasm"] : ["wasm"]) {   // the graphics first, the CPU when they fail
      try {
        const make = ort.InferenceSession.create(buf, {executionProviders: [e], graphOptimizationLevel: "all"});
        session = e === "webgpu" ? await limit(make, 90000) : await make; ep = e;
        const got = await limit(evaluate(checkPositions()), e === "webgpu" ? 60000 : 600000);   // first run: compiles the shaders
        if (e === "webgpu" && !matches(got)) throw new Error("wrong results");
        const t0 = performance.now(); await evaluate(checkPositions());   // timed now the shaders are ready
        batch = Math.max(1, Math.min(BATCH, Math.floor(STEP_MS / ((performance.now() - t0) / 2))));
        if (!MODEL.ref) post({local: "ref", ref: got.map(r => ({win: +r.win.toFixed(4), lead: +r.lead.toFixed(3), best: bestOf(r)}))});
        break;
      } catch (err) { session = null; if (e === "wasm") throw err; post({local: "fallback"}); }
    }
    try {
      const md = session.handler && session.handler.metadata;
      if (md && md.customMetadataMap) for (const [k, v] of Object.entries(md.customMetadataMap)) meta[k.replace(/^katago\.(postProcess\.)?/, "")] = +v;
    } catch { /* defaults */ }
    post({local: "ready", device: ep === "webgpu" ? "그래픽" : "CPU"});
    pump();
  } catch (err) { post({local: "failed", error: String(err && err.message || err)}); }
}

// ---------------------------------------------------------------- go rules on an n x n board (index y * n + x)
const NBR = {};
function nbrs(n) {
  if (NBR[n]) return NBR[n];
  return NBR[n] = Array.from({length: n * n}, (_, i) => { const x = i % n, y = (i / n) | 0, o = [];
    if (x > 0) o.push(i - 1); if (x < n - 1) o.push(i + 1); if (y > 0) o.push(i - n); if (y < n - 1) o.push(i + n); return o; });
}
function chain(g, n, i) {
  const c = g[i], st = [i], seen = new Uint8Array(n * n), NB = nbrs(n), libs = new Set(); seen[i] = 1;
  for (let k = 0; k < st.length; k++) for (const j of NB[st[k]]) { if (!g[j]) libs.add(j); else if (g[j] === c && !seen[j]) { seen[j] = 1; st.push(j); } }
  return {st, libs: libs.size};
}
// position: {n, g (1 black, 2 white), pla (to move), ko, hist: [{pla, mv}] newest last (mv -1 = pass), komi (white), pda,
// chill}. chill is KataGo's whiteBonusScore under territory scoring: +1 for every black stone placed, -1 for every white
// one (passes not), which the net sees added to the komi (BoardHistory, "chill 1 point per move"). Without it every
// position with white to move looked a point worse for white (2026-10-05: white win 0.41 here, 0.53 in KataGo).
function emptyPos(n) { return {n, g: new Int8Array(n * n), pla: 1, ko: -1, hist: [], komi: 6.5, pda: 0, chill: 0}; }
function play(p, color, mv) {   // the new position, or null if illegal; color 1/2 may break the alternation (placed stones)
  const opp = 3 - color, n = p.n;
  if (mv < 0) return {...p, pla: opp, ko: -1, hist: p.hist.concat({pla: color, mv: -1})};
  if (p.g[mv] || (mv === p.ko && color === p.pla)) return null;
  const g = p.g.slice(); g[mv] = color; let cap = [];
  for (const j of nbrs(n)[mv]) if (g[j] === opp) { const ch = chain(g, n, j); if (!ch.libs) { for (const k of ch.st) g[k] = 0; cap = cap.concat(ch.st); } }
  const own = chain(g, n, mv); if (!own.libs) return null;
  const ko = cap.length === 1 && own.st.length === 1 && own.libs === 1 ? cap[0] : -1;
  return {...p, g, pla: opp, ko, hist: p.hist.concat({pla: color, mv}), chill: p.chill + (color === 1 ? 1 : -1)};
}
const LETTERS = "ABCDEFGHJKLMNOPQRST";
const parseMove = (s, n) => { if (!s || /^pass$/i.test(s)) return -1; const x = LETTERS.indexOf(s[0].toUpperCase()), y = n - parseInt(s.slice(1), 10); return x >= 0 && x < n && y >= 0 && y < n ? y * n + x : -2; };
const moveName = (mv, n) => mv < 0 ? "pass" : LETTERS[mv % n] + (n - ((mv / n) | 0));
// Some phones' graphics run the net but compute it wrong (2026-10-05, a Galaxy tablet: every move the same win rate,
// moves all over the board). So the first run is checked against what the CPU computes for two positions, worked
// out beforehand (MODELS[].ref): graphics that disagree are not used, the CPU is.
function checkPositions() { return [positionsOf({moves: CHECK_MOVES}).pop(), emptyPos(19)]; }
const CHECK_MOVES = [["B", "Q16"], ["W", "D4"], ["B", "R4"], ["W", "D16"], ["B", "C3"]];
function bestOf(r) { let b = 0; for (let i = 1; i < r.logit.length; i++) if (r.logit[i] > r.logit[b]) b = i; return b; }
function matches(got) {
  if (!MODEL.ref) return true;
  return got.every((r, k) => {
    const want = MODEL.ref[k], mx = r.logit[bestOf(r)];
    return Math.abs(r.win - want.win) < .03 && Math.abs(r.lead - want.lead) < .6 && r.logit[want.best] > mx - .3;
  });
}
function posKey(p) {   // what the net sees: the board, the side to move, the ko and the last 5 moves
  let s = p.pla + "|" + p.ko + "|" + (p.komi + p.chill) + "|" + p.pda + "|";
  for (let k = Math.max(0, p.hist.length - 5); k < p.hist.length; k++) s += p.hist[k].pla + ":" + p.hist[k].mv + ",";
  return s + p.g.join("");
}

// ---------------------------------------------------------------- neural net (NNInputs::fillRowV7, Korean rules)
function fillInputs(p, sp, gl, mk, so, go, mo) {
  const n = p.n, pla = p.pla, opp = 3 - pla, F = BB, libsOf = new Int16Array(n * n).fill(-1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, pos = y * B + x;
    sp[so + pos] = 1; mk[mo + pos] = 1;                          // 0 on board (and the mask)
    const c = p.g[i]; if (!c) continue;
    sp[so + (c === pla ? 1 : 2) * F + pos] = 1;                   // 1, 2 own / opponent stone
    if (libsOf[i] < 0) { const ch = chain(p.g, n, i); for (const k of ch.st) libsOf[k] = ch.libs; }
    const l = libsOf[i]; if (l >= 1 && l <= 3) sp[so + (2 + l) * F + pos] = 1;   // 3, 4, 5 one / two / three liberties
  }
  const at = i => ((i / n) | 0) * B + i % n;
  if (p.ko >= 0) sp[so + 6 * F + at(p.ko)] = 1;                  // 6 ko ban
  // 9..13 the last five moves while they alternate back from the opponent (a pass sets a global flag instead)
  const h = p.hist;
  for (let k = 0; k < 5 && k < h.length; k++) {
    const m = h[h.length - 1 - k]; if (m.pla !== (k % 2 === 0 ? opp : pla)) break;
    if (m.mv < 0) gl[go + k] = 1; else sp[so + (9 + k) * F + at(m.mv)] = 1;
  }
  const selfKomi = pla === 2 ? p.komi + p.chill : -(p.komi + p.chill), area = n * n;
  gl[go + 5] = Math.max(-area - 20, Math.min(area + 20, selfKomi)) / 20;   // komi from the side to move
  gl[go + 9] = 1;                                                // territory scoring
  gl[go + 10] = 1;                                               // seki tax (Korean rules)
  if (h.length && h[h.length - 1].mv < 0) gl[go + 14] = 1;       // a pass now would end the game
  if (p.pda) { gl[go + 15] = 1; gl[go + 16] = .5 * p.pda; }      // playoutDoublingAdvantage (handicap play)
}
const softplus = x => x > 20 ? x : Math.log1p(Math.exp(x));
async function evaluate(list) {   // -> per position {pol (prob per board point, pass last), win, lead, stdev, own} for the side to move
  const k = list.length, sp = new Float32Array(k * 22 * BB), gl = new Float32Array(k * 19), mk = new Float32Array(k * BB);
  list.forEach((p, b) => fillInputs(p, sp, gl, mk, b * 22 * BB, b * 19, b * BB));
  const feeds = {InputSpatial: new ort.Tensor("float32", sp, [k, 22, B, B]), InputGlobal: new ort.Tensor("float32", gl, [k, 19, 1, 1])};
  if (session.inputNames.includes("InputMask")) feeds.InputMask = new ort.Tensor("float32", mk, [k, 1, B, B]);
  const out = await session.run(feeds);
  const pol = out.OutputPolicy.data, pass = out.OutputPolicyPass.data, val = out.OutputValue.data, sv = out.OutputScoreValue.data, own = out.OutputOwnership.data;
  const pc = out.OutputPolicy.dims[1], svc = out.OutputScoreValue.dims[1], sc = meta.outputScaleMultiplier || 1;
  return list.map((p, b) => {
    const n = p.n, logit = new Float32Array(n * n + 1);
    for (let i = 0; i < n * n; i++) logit[i] = pol[b * pc * BB + ((i / n) | 0) * B + i % n] * sc;
    logit[n * n] = pass[b * pc] * sc;
    const v = [0, 1, 2].map(j => val[b * 3 + j] * sc), mx = Math.max(...v), e = v.map(x => Math.exp(x - mx)), z = e[0] + e[1] + e[2];
    const o = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) o[i] = Math.tanh(own[b * BB + ((i / n) | 0) * B + i % n] * sc);
    return {logit, win: (e[0] + .5 * e[2]) / z, lead: sv[b * svc + 2] * sc * (meta.leadMultiplier || 20),
            stdev: softplus(sv[b * svc + 1] * sc) * (meta.scoreStdevMultiplier || 20), own: o};
  });
}
// evaluations are cached by what the net sees: the live search and 자동분석 often look at the same positions
const cache = new Map();
async function evalCached(list) {
  const keys = list.map(posKey), need = [], at = [];
  keys.forEach((k, i) => { if (!cache.has(k)) { need.push(list[i]); at.push(i); } });
  if (need.length) {
    const res = await evaluate(need);
    res.forEach((r, j) => cache.set(keys[at[j]], r));
    while (cache.size > 30000) cache.delete(cache.keys().next().value);
  }
  return keys.map(k => cache.get(k));
}

// ---------------------------------------------------------------- tree search
// A node keeps W (win rate) and S (score lead) summed from the view of the player who moved into it.
function makeNode(p) { return {p, N: 0, W: 0, S: 0, kids: null, ev: null, pend: false}; }
const util = (w, s) => w + SCORE_UTIL * .5 * (2 / Math.PI) * Math.atan(s / 15);   // win rate plus a little score
function expand(node, ev) {
  node.ev = ev;
  const p = node.p, n = p.n, legal = [];
  for (let i = 0; i < n * n; i++) if (!p.g[i] && i !== p.ko) legal.push(i);
  legal.push(-1);
  let mx = -Infinity; for (const m of legal) mx = Math.max(mx, ev.logit[m < 0 ? n * n : m]);
  let z = 0; const w = legal.map(m => { const e = Math.exp(ev.logit[m < 0 ? n * n : m] - mx); z += e; return e; });
  node.kids = legal.map((m, k) => ({m, P: w[k] / z, node: null})).sort((a, b) => b.P - a.P);
}
function pick(node) {
  const pq = node.N ? util(1 - node.W / node.N, -node.S / node.N) : util(.5, 0);   // for the side to move here
  let seen = 0; for (const k of node.kids) if (k.node && k.node.N) seen += k.P;
  const fpu = pq - FPU * Math.sqrt(seen), sq = Math.sqrt(Math.max(1, node.N));
  let best = null, bv = -Infinity;
  for (const k of node.kids) {
    if (k.P <= 0) continue;
    const c = k.node, cn = c ? c.N : 0, q = cn ? util(c.W / cn, c.S / cn) : fpu, v = q + CPUCT * k.P * sq / (1 + cn);
    if (v > bv) { bv = v; best = k; }
  }
  return best;
}
async function step(root) {   // one batch of playouts; returns how many new evaluations it made
  const leaves = [];
  for (let t = 0; t < batch; t++) {
    let node = root; const path = [root];
    while (node.kids) {
      const e = pick(node); if (!e) break;
      if (!e.node) { const np = play(node.p, node.p.pla, e.m); if (!np) { e.P = 0; continue; } np.pda = -node.p.pda; e.node = makeNode(np); }
      node = e.node; path.push(node);
      if (!node.ev) break;
    }
    for (const n of path) n.N += 1;   // virtual loss: counted as a visit that has not won yet
    leaves.push({path, node, fresh: !node.ev && !node.pend});
    if (!node.ev) node.pend = true;
  }
  const fresh = leaves.filter(l => l.fresh), evs = fresh.length ? await evalCached(fresh.map(l => l.node.p)) : [];
  fresh.forEach((l, k) => { expand(l.node, evs[k]); l.node.pend = false; });
  for (const l of leaves) {
    const ev = l.node.ev;   // a leaf still waiting (picked twice in one batch) counts as a draw
    let w = ev ? 1 - ev.win : .5, s = ev ? -ev.lead : 0;   // for the player who moved into the leaf
    for (let k = l.path.length - 1; k >= 0; k--) { l.path[k].W += w; l.path[k].S += s; w = 1 - w; s = -s; }
  }
  return fresh.length;
}
function report(task, root, during, turn) {   // the GPU engine's response, values for BLACK
  const p = root.p, n = p.n, black = p.pla === 1, bw = w => black ? w : 1 - w, bs = s => black ? s : -s;
  const kids = (root.kids || []).filter(k => k.node && k.node.N > 0).sort((a, b) => b.node.N - a.node.N);
  const moveInfos = kids.slice(0, 30).map((k, order) => {
    const pv = [moveName(k.m, n)];
    for (let c = k.node; c && c.kids && pv.length < 12;) {
      const nx = c.kids.filter(x => x.node && x.node.N > 0).sort((a, b) => b.node.N - a.node.N)[0];
      if (!nx) break; pv.push(moveName(nx.m, n)); c = nx.node;
    }
    return {move: moveName(k.m, n), visits: k.node.N, winrate: bw(k.node.W / k.node.N), scoreLead: bs(k.node.S / k.node.N),
            scoreMean: bs(k.node.S / k.node.N), prior: k.P, order, pv};
  });
  const ev = root.ev, rw = root.N ? 1 - root.W / root.N : ev.win, rs = root.N ? -root.S / root.N : ev.lead;
  const msg = {id: task.id, isDuringSearch: during, turnNumber: turn,
               rootInfo: {visits: root.N, winrate: bw(rw), scoreLead: bs(rs), scoreStdev: ev.stdev, currentPlayer: black ? "B" : "W"}, moveInfos};
  if (task.q.includeOwnership) msg.ownership = Array.from(ev.own, v => black ? v : -v);
  post(msg);
}

// ---------------------------------------------------------------- queries
// Each query is a task: one position per analyzed turn. The live search (priority 10) and 자동분석 take turns, the
// live one twice as often, like the GPU's two analysis threads with the live query first in line.
const tasks = [];
function positionsOf(q) {
  const n = q.boardXSize || 19; let p = emptyPos(n);
  p.komi = typeof q.komi === "number" ? q.komi : 6.5;
  for (const [c, s] of q.initialStones || []) { const mv = parseMove(s, n); if (mv >= 0) p.g[mv] = /^b/i.test(c) ? 1 : 2; }
  for (const c of p.g) if (c) p.chill += c === 1 ? 1 : -1;   // setup stones count as moves played (BoardHistory::clear)
  p.pla = /^w/i.test(q.initialPlayer || "B") ? 2 : 1;
  const list = [p];
  for (const [c, s] of q.moves || []) {
    const np = play(p, /^w/i.test(c) ? 2 : 1, parseMove(s, n));
    if (!np) throw new Error("illegal move " + s);
    p = np; list.push(p);
  }
  const pda = q.overrideSettings && +q.overrideSettings.playoutDoublingAdvantage || 0;
  for (const x of list) x.pda = pda;   // for the side to move at the analyzed position (search nodes flip it)
  return list;
}
function addQuery(q) {
  let all;
  try { all = positionsOf(q); } catch (err) { post({id: q.id, error: String(err.message)}); return; }
  const turns = Array.isArray(q.analyzeTurns) ? q.analyzeTurns.filter(t => t >= 0 && t < all.length) : [all.length - 1];
  tasks.push({id: q.id, q, turns, all, i: 0, root: null, prio: q.priority || 0, maxVisits: q.maxVisits || 500,
              every: q.reportDuringSearchEvery || 0, first: q.firstReportDuringSearchAfter || q.reportDuringSearchEvery || 0, said: 0, t0: 0, live: !q.analyzeTurns});
  pump();
}
function terminate(id) {
  const k = tasks.findIndex(t => t.id === id);
  if (k >= 0) { const t = tasks[k]; tasks.splice(k, 1); if (t.root && t.root.N) report(t, t.root, false, t.turns[t.i]); }
}
let pumping = false, tick = 0;
async function pump() {
  if (pumping || !session) return; pumping = true;
  try {
    let yielded = performance.now();
    while (tasks.length) {
      // let new queries, terminations and pings in: cached evaluations finish without ever leaving the microtask
      // queue, and a loop of them would keep every message waiting (the live search never stopped)
      if (performance.now() - yielded > 15) { await new Promise(r => setTimeout(r, 0)); yielded = performance.now(); if (!tasks.length) break; }
      tick++;
      const live = tasks.filter(t => t.prio > 0), rest = tasks.filter(t => t.prio <= 0);
      const t = live.length && (tick % 3 !== 0 || !rest.length) ? live[0] : rest[0] || live[0];
      if (!t.root) {   // the next analyzed turn
        const p = t.all[t.turns[t.i]], [ev] = await evalCached([p]);
        t.root = makeNode(p); expand(t.root, ev); t.t0 = performance.now(); t.said = 0;
      }
      const s0 = performance.now(), made = await step(t.root), took = performance.now() - s0;
      if (made === batch) {   // a full batch of new evaluations: fit the next one to STEP_MS (cached ones cost nothing)
        if (took > STEP_MS * 1.5 && batch > 1) batch >>= 1; else if (took < STEP_MS / 2 && batch < BATCH) batch <<= 1;
      }
      if (!tasks.includes(t)) continue;   // terminated while it was evaluating
      const now = performance.now(), el = (now - t.t0) / 1000;
      if (t.every && el >= (t.said ? t.said + t.every : t.first)) { t.said = el; report(t, t.root, true, t.live ? undefined : t.turns[t.i]); }
      if (t.root.N >= t.maxVisits) {
        report(t, t.root, false, t.live ? undefined : t.turns[t.i]);
        t.root = null; t.i++;
        if (t.i >= t.turns.length) tasks.splice(tasks.indexOf(t), 1);
      }
    }
  } catch (err) {
    const t = tasks.shift(); if (t) post({id: t.id, error: "엔진 오류: " + (err && err.message || err)});
  }
  pumping = false;
  if (tasks.length) pump();
}

onmessage = ev => {
  let q; try { q = JSON.parse(ev.data); } catch { return; }
  if (q.action === "ping") return post({pong: q.t, clients: 1, model: MODEL_NAME, device: ep});
  if (q.action === "query_version") return post({id: q.id, version: "1.18.2"});
  if (q.action === "terminate") { terminate(q.terminateId); return post({id: q.id, action: "terminate"}); }
  if (q.action === "clear_cache") { cache.clear(); return post({id: q.id, action: "clear_cache"}); }
  if (q.action) return;   // bridge-only actions (state, live, ...) mean nothing here
  if (q.id) addQuery(q);
};
load();
