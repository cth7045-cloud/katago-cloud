// Sign-in page board, drawn with exactly the analysis screen's rules — a port of LizzieYzy Next's
// BoardRenderer (GPL-3.0, see assets/NOTICE.txt; same code as remote/webui.html): YZY's wood and stone
// images, stone shadows and highlights, the cyan best move with its blue ring, visit-ratio colours,
// orange order labels, the three text rows and the hover preview (see "the scene" below).
const N = 19, LETTERS = "ABCDEFGHJKLMNOPQRST", T = Math.trunc;
const UI_FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif';
const WR_FONT = "'Open Sans', " + UI_FONT, WR_WEIGHT = 600;

// ------------------------------------------------------------------ text / colour helpers (webui.html)
function fitFont(ctx, family, weight, text, maxH, maxW) {
  ctx.font = `${weight} 100px ${family}`;
  const w100 = ctx.measureText(text).width || 1;
  const size = Math.max(1, Math.min(maxH, Math.round(100 * maxW / w100)));
  ctx.font = `${weight} ${size}px ${family}`;
  const m = ctx.measureText(text);
  const asc = m.fontBoundingBoxAscent ?? size * .9, desc = m.fontBoundingBoxDescent ?? size * .22;
  return { size, w: m.width, h: Math.round(asc) - Math.round(desc) };
}
function jString(ctx, family, weight, text, x, y, maxH, maxW, color) {
  const f = fitFont(ctx, family, weight, text, maxH, maxW);
  ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x - f.w / 2, y + f.h / 2);
}
function j3row(ctx, family, weight, text, x, baseline, maxH, maxW, color) {
  const f = fitFont(ctx, family, weight, text, maxH, maxW);
  ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x - f.w / 2, baseline);
}
function hsb(h, s, v) {
  const i = Math.floor((h - Math.floor(h)) * 6), f = (h - Math.floor(h)) * 6 - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return [T(r * 255 + .5), T(g * 255 + .5), T(b * 255 + .5)];
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a / 255})`;
function playoutsString(p) {
  if (p >= 10000000) return Math.round(p / 100000) / 10 + "m";
  if (p >= 9950) return Math.round(p / 1000) + "k";
  if (p >= 1000) return (Math.round(p / 100) / 10) + "k";
  return String(p);
}
function javaDouble(v) { const r = Math.round(v * 10) / 10; return (Object.is(r, -0) ? 0 : r).toFixed(1); }

// ------------------------------------------------------------------ images
const IMG = {};
const loaded = Promise.all([["board", "assets/board.png"], ["black", "assets/black0.png"], ["white", "assets/white0.png"]].map(([k, src]) =>
  new Promise((done) => { const im = new Image(); im.onload = () => { IMG[k] = im; done(); }; im.onerror = done; im.src = src; })));
let pattern = null;
const woodPaint = (ctx) => (IMG.board ? (pattern ??= ctx.createPattern(IMG.board, "repeat")) : "rgb(217,152,77)");

// ------------------------------------------------------------------ board renderer (BoardRenderer.java)
function geometry(avail0, k) {   // with coordinates: the big 5.5% margin
  let bw = Math.floor(avail0) + 1, margin, avail;
  do { bw--; margin = T(0.055 * bw); avail = bw - 2 * margin; } while (bw > 40 && (avail - 1) % (N - 1) !== 0);
  const sq = T((avail - 1) / (N - 1));
  return { size: bw, margin, avail, sq, r: sq < 4 ? 1 : T(sq / 2) - 1, k };
}
function fillCircle(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx + .5, cy + .5, r + .5, 0, Math.PI * 2); ctx.fill(); }
function strokeCircle(ctx, cx, cy, r, width) { ctx.lineWidth = width; ctx.beginPath(); ctx.arc(cx + .5, cy + .5, r, 0, Math.PI * 2); ctx.stroke(); }
function drawGoban(ctx, G) {
  const { size, margin: m, avail, sq, r, k } = G;
  ctx.fillStyle = woodPaint(ctx); ctx.fillRect(0, 0, size, size);
  let gr = ctx.createLinearGradient(0, 0, size, size); gr.addColorStop(0, "rgba(255,255,230,.098)"); gr.addColorStop(1, "rgba(0,0,20,.098)");
  ctx.fillStyle = gr; ctx.fillRect(0, 0, size, size);
  const d = Math.max(T(size / 80), 4);
  const edge = (x0, y0, x1, y1, c0, c1, rx, ry, rw, rh) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh); };
  edge(0, 0, 0, d, "rgba(0,0,0,.118)", "rgba(0,0,0,0)", 0, 0, size, d);
  edge(0, 0, d, 0, "rgba(0,0,0,.078)", "rgba(0,0,0,0)", 0, 0, d, size);
  edge(0, size - d, 0, size, "rgba(0,0,0,0)", "rgba(0,0,0,.078)", 0, size - d, size, d);
  edge(size - d, 0, size, 0, "rgba(0,0,0,0)", "rgba(0,0,0,.059)", size - d, 0, d, size);
  ctx.fillStyle = "#000";
  const border = Math.max((size / k > 560 ? 2 : 1) * k, avail / 481), normal = Math.max(k, avail / 750);
  for (let i = 0; i < N; i++) {
    const w = Math.round(i === 0 || i === N - 1 ? border : normal), o = T((w - 1) / 2);
    ctx.fillRect(m, m + sq * i - o, avail, w);
    ctx.fillRect(m + sq * i - o, m, w, avail);
  }
  const star = T(T(0.015 * size) / 2);
  for (const a of [3, 9, 15]) for (const b of [3, 9, 15]) fillCircle(ctx, m + sq * a, m + sq * b, star);
  for (let i = 0; i < N; i++) {
    const mh = T(r * 4 / 5);
    jString(ctx, UI_FONT, 400, LETTERS[i], m + sq * i + .5, T(m * 4 / 10), mh, r, "#000");
    jString(ctx, UI_FONT, 400, LETTERS[i], m + sq * i + .5, size - T(m * 4 / 10), mh, r, "#000");
    jString(ctx, UI_FONT, 400, String(N - i), T(m * 4 / 10), m + sq * i + .5, mh, r, "#000");
    jString(ctx, UI_FONT, 400, String(N - i), size - T(m * 4 / 10), m + sq * i + .5, mh, r, "#000");
  }
}
function drawShadow(ctx, cx, cy, r) {
  const R = T(r * 85 / 100), ss = Math.max(1, T(R * 0.2)), far = Math.max(1, T(R * 0.17)), ao = Math.max(1, T(R * 0.25));
  const X = cx + .5, Y = cy + .5;
  const radial = (x, y, rad, stops) => { const g = ctx.createRadialGradient(x, y, 0, x, y, rad); for (const [f, c] of stops) g.addColorStop(f, c); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad + .5, 0, Math.PI * 2); ctx.fill(); };
  radial(X + T(ao / 2), Y + T(ao / 2), r + ss + ao, [[0, "rgba(0,0,0,0)"], [.5, "rgba(0,0,0,0)"], [.8, "rgba(0,0,0,.118)"], [1, "rgba(0,0,0,0)"]]);
  radial(X, Y, r + ss, [[0, "rgba(50,50,50,.627)"], [.3, "rgba(50,50,50,.627)"], [1, "rgba(0,0,0,0)"]]);
  radial(X + ss, Y + ss, r + far, [[0, "rgba(0,0,0,.588)"], [.5, "rgba(0,0,0,.588)"], [1, "rgba(0,0,0,0)"]]);
}
function drawStone(ctx, cx, cy, r, black) {
  const img = black ? IMG.black : IMG.white, size = 2 * r + 1;
  if (img) { ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, cx - r, cy - r, size, size); }
  else {
    ctx.fillStyle = black ? "rgb(30,30,30)" : "rgb(245,245,245)"; fillCircle(ctx, cx, cy, r);
    ctx.strokeStyle = black ? "rgba(0,0,0,.7)" : "rgba(180,180,180,.86)"; strokeCircle(ctx, cx, cy, r, 1);
  }
  let g = ctx.createRadialGradient(cx - r * .3, cy - r * .3, 0, cx - r * .3, cy - r * .3, r * .6);
  g.addColorStop(0, `rgba(255,255,255,${(black ? 70 : 180) / 255})`); g.addColorStop(.6, `rgba(255,255,255,${(black ? 20 : 60) / 255})`); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.85, "rgba(255,255,255,0)"); g.addColorStop(.95, `rgba(255,255,255,${(black ? 25 : 50) / 255})`); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
}
// drawLeelazSuggestions for one candidate (list is in order, best first)
function drawSuggestion(ctx, G, mv, k, maxP) {
  const { margin: m, sq, r, avail } = G;
  const cx = m + sq * mv.x, cy = m + sq * mv.y, isBest = k === 0;
  const pct = mv.visits / maxP, alphaRatio = Math.max(0, Math.log(pct) / 5 + 1), alpha = T(32 + 208 * alphaRatio);
  const col = hsb(isBest ? 0.5 : (1 / 3) * Math.pow(pct, 1 / 2), 1, .85);
  const orderLabel = (text, dx, dy) => {
    const f = fitFont(ctx, WR_FONT, WR_WEIGHT, text, sq * .36, sq * .39);
    const x1 = Math.round(cx + sq * .43) + dx + .5 - f.w / 2, y1 = Math.round(cy - sq * .358) + dy + .5;
    ctx.fillStyle = "rgb(255,200,0)"; ctx.fillRect(x1, y1 - f.h, f.w, f.h + Math.max(1, T(f.h / 12)));
    ctx.fillStyle = "#000"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(text, x1, y1);
  };
  if (isBest) orderLabel("1", 1, -1);
  ctx.save(); if (pct < 0.05) ctx.globalAlpha = .8; ctx.fillStyle = woodPaint(ctx); fillCircle(ctx, cx, cy, r + 1); ctx.restore();
  ctx.fillStyle = rgba(col, alpha); fillCircle(ctx, cx, cy, r + 1);
  if (isBest) { ctx.strokeStyle = "rgb(0,0,255)"; strokeCircle(ctx, cx, cy, r + 2, (r + 2) / 15); }
  else { ctx.strokeStyle = `rgba(0,0,0,${T(48 + 48 * alphaRatio) / 255})`; strokeCircle(ctx, cx, cy, r + 1, (r + 1) / 26.5); }
  if (k > 0 && k < 9) orderLabel(String(k + 1), 0, 0);
  const narrow = mv.wr < 10;
  j3row(ctx, WR_FONT, WR_WEIGHT, mv.wr.toFixed(1), cx + .5, cy - Math.round(sq * (narrow ? .127 : .125)), sq * (narrow ? .36 : .35), sq * .67, "#000");
  j3row(ctx, UI_FONT, 400, playoutsString(mv.visits), cx + .5, cy + Math.round(sq * .18), sq * .34, mv.visits < 1000 ? r * 1.3 : r * 1.8, "#000");
  j3row(ctx, WR_FONT, WR_WEIGHT, javaDouble(mv.lead), cx + .5, cy + Math.round(sq * .435), avail * .273 / (N - 1), r * 1.6, "#000");
}

// ------------------------------------------------------------------ the scene
// A real KataGo run (hero-data.js), replayed the way a person uses the analysis screen: from the empty board,
// each position is searched (the candidates update as KataGo reports), then the mouse moves onto the best move
// (the blue spot), its variation shows for a moment like a hover in YZY, and a click plays it. At the end of the
// line the board fades out and the replay starts again.
// LINE[k] = [[seconds, [[move, winrate %, visits, score lead], ...]], ...] from the side to move; PV[k] = the
// best move's principal variation at the end of that search.
import { LINE, PV } from "./hero-data.js";
const pt = (v) => ({ x: LETTERS.indexOf(v[0]), y: N - Number(v.slice(1)) });
const SEARCH_MS = 1600, AIM_MS = 380, PREVIEW_MS = 650, FINAL_MS = 4200, FADE_MS = 700;
const STEP = SEARCH_MS + AIM_MS + PREVIEW_MS;
const START = LINE.map((_, k) => 300 + k * STEP);   // when each position's search begins
const CYCLE = START.at(-1) + SEARCH_MS + FINAL_MS;
const MOVES = LINE.slice(0, -1).map((snaps) => pt(snaps.at(-1)[1][0][0]));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Go rules for the replay: play `color` (1 black, 2 white) at i on grid g, removing captured groups.
function play(g, i, color) {
  g[i] = color;
  const captured = [], x = i % N, y = (i / N) | 0;
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
    if (nx < 0 || ny < 0 || nx >= N || ny >= N || g[ny * N + nx] !== 3 - color) continue;
    const seen = new Set([ny * N + nx]), todo = [ny * N + nx];
    let free = false;
    while (todo.length && !free) {
      const j = todo.pop(), jx = j % N, jy = (j / N) | 0;
      for (const [ax, ay] of [[jx - 1, jy], [jx + 1, jy], [jx, jy - 1], [jx, jy + 1]]) {
        if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
        const n = ay * N + ax;
        if (!g[n]) { free = true; break; }
        if (g[n] === g[j] && !seen.has(n)) { seen.add(n); todo.push(n); }
      }
    }
    if (!free) for (const j of seen) { g[j] = 0; captured.push(j); }
  }
  return captured;
}
const GRIDS = [new Int8Array(N * N)];   // board after k moves
MOVES.forEach((m, k) => { const g = GRIDS[k].slice(); play(g, m.y * N + m.x, k % 2 ? 2 : 1); GRIDS.push(g); });
// The hovered variation on top of position k (pvBoard in webui.html): new stones with their numbers.
const BRANCHES = PV.map((pv, k) => {
  const g = GRIDS[k].slice(), nums = new Int16Array(N * N);
  let color = k % 2 ? 2 : 1;
  for (let n = 0; n < pv.length; n++) {
    const q = pt(pv[n]), i = q.y * N + q.x;
    if (q.x < 0 || g[i]) break;
    for (const j of play(g, i, color)) nums[j] = 0;
    nums[i] = n + 1; color = 3 - color;
  }
  return { grid: g, nums };
});

// What the screen shows `t` ms into the loop.
function sceneAt(t) {
  let k = 0;
  while (k + 1 < LINE.length && t >= START[k + 1]) k++;
  const local = Math.max(0, t - START[k]), snaps = LINE[k], tEnd = snaps.at(-1)[0] || 1;
  let i = 0;
  while (i + 1 < snaps.length && snaps[i + 1][0] / tEnd * SEARCH_MS <= local) i++;
  const final = k === LINE.length - 1;
  // the cursor rests where it clicked and glides to the blue spot once the search is done
  const rest = (j) => (j > 0 ? MOVES[j - 1] : { x: 20.2, y: 19.4 });   // starts just off the board, bottom right
  const from = rest(k), to = final ? from : MOVES[k], a = final ? 0 : ease(clamp01((local - SEARCH_MS) / AIM_MS));
  const cursor = { x: from.x + (to.x - from.x) * a, y: from.y + (to.y - from.y) * a };
  const hovering = !final && local >= SEARCH_MS + AIM_MS;
  return { k, grid: GRIDS[k], cands: snaps[i][1], cursor, branch: hovering ? BRANCHES[k] : null,
           hover: hovering ? MOVES[k] : null, fade: final ? clamp01((CYCLE - t) / FADE_MS) : 1 };
}

function drawStones(ctx, G, sc) {
  const { margin: m, sq, r } = G, shown = [];
  for (let i = 0; i < N * N; i++) {
    if (sc.grid[i]) shown.push([i, sc.grid[i]]);
    else if (sc.branch && sc.branch.grid[i] && sc.branch.nums[i]) shown.push([i, sc.branch.grid[i]]);
  }
  for (const [i] of shown) drawShadow(ctx, m + sq * (i % N), m + sq * ((i / N) | 0), r);
  for (const [i, c] of shown) drawStone(ctx, m + sq * (i % N), m + sq * ((i / N) | 0), r, c === 1);
}
function drawBranchNumbers(ctx, G, sc) {   // drawMoveNumbers while previewing
  const { margin: m, sq, r } = G, b = sc.branch, hoverI = sc.hover.y * N + sc.hover.x;
  let lastN = 0, lastI = -1;
  for (let i = 0; i < N * N; i++) if (b.nums[i] > lastN && !sc.grid[i]) { lastN = b.nums[i]; lastI = i; }
  for (let i = 0; i < N * N; i++) {
    const n = b.nums[i];
    if (!n || sc.grid[i] || (i === hoverI && n === 1)) continue;
    const cx = m + sq * (i % N), cy = m + sq * ((i / N) | 0);
    if (i === lastI) {   // red last-move triangle in the stone's top-left corner
      ctx.fillStyle = "#ff0000"; ctx.beginPath();
      ctx.moveTo(cx - T(r * 16 / 15), cy - T(r * 16 / 15)); ctx.lineTo(cx - T(r * 16 / 15), cy - T(r * 4 / 11)); ctx.lineTo(cx - T(r * 4 / 11), cy - T(r * 16 / 15));
      ctx.closePath(); ctx.fill();
    }
    jString(ctx, UI_FONT, 400, String(n), cx + .5, cy + .5, r * 1.4, n >= 100 ? r * 1.85 : r * 1.4, b.grid[i] === 1 ? "#fff" : "#000");
  }
}
function drawHovered(ctx, G, c, blackToPlay) {   // the hovered candidate keeps a red ring and its three rows
  const { margin: m, sq, r, avail } = G, cx = m + sq * c.x, cy = m + sq * c.y, color = blackToPlay ? "#fff" : "#000";
  ctx.strokeStyle = "#f00"; strokeCircle(ctx, cx, cy, r + 1, (r + 1) / 11);
  const narrow = c.wr < 10;
  j3row(ctx, WR_FONT, WR_WEIGHT, c.wr.toFixed(1), cx + .5, cy - Math.round(sq * (narrow ? .127 : .125)), sq * (narrow ? .36 : .35), sq * .67, color);
  j3row(ctx, UI_FONT, 400, playoutsString(c.visits), cx + .5, cy + Math.round(sq * .18), sq * .34, c.visits < 1000 ? r * 1.3 : r * 1.8, color);
  j3row(ctx, WR_FONT, WR_WEIGHT, javaDouble(c.lead), cx + .5, cy + Math.round(sq * .435), avail * .273 / (N - 1), r * 1.6, color);
}
function drawCursor(ctx, x, y, k) {   // the standard Windows arrow: white with a black outline
  const P = [[0, 0], [0, 17], [4, 13], [7, 19.5], [9.8, 18.4], [7, 12], [12, 12]];
  ctx.beginPath();
  P.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * k, y + py * k) : ctx.moveTo(x + px * k, y + py * k)));
  ctx.closePath();
  ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = k; ctx.lineJoin = "round"; ctx.strokeStyle = "#000"; ctx.stroke();
}

export async function startHeroBoard(cv, isVisible) {
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  await Promise.all([loaded, document.fonts?.load(`${WR_WEIGHT} 12px 'Open Sans'`).catch(() => {})]);
  let G = null, ctx = null, empty = null;   // empty: the bare board, drawn once per size
  const t0 = performance.now();
  const layout = () => {
    const k = window.devicePixelRatio || 1, css = cv.parentElement.clientWidth;
    if (!css) return;
    G = geometry(Math.floor(css * k), k);
    cv.width = cv.height = G.size; cv.style.width = cv.style.height = G.size / k + "px";
    empty = document.createElement("canvas"); empty.width = empty.height = G.size;
    pattern = null; drawGoban(empty.getContext("2d"), G);
    ctx = cv.getContext("2d"); pattern = null;
    draw(calm ? CYCLE - FINAL_MS : (performance.now() - t0) % CYCLE);
  };
  function draw(t) {
    if (!ctx) return;
    const { margin: m, sq } = G, sc = sceneAt(t);
    ctx.drawImage(empty, 0, 0);
    drawStones(ctx, G, sc);
    const blackToPlay = sc.k % 2 === 0, cands = sc.cands, maxP = Math.max(...cands.map((c) => c[2]));
    const cand = (j) => { const [v, wr, visits, lead] = cands[j]; return { ...pt(v), wr, visits, lead }; };
    if (sc.branch) {
      drawBranchNumbers(ctx, G, sc);
      const j = cands.findIndex((c) => pt(c[0]).x === sc.hover.x && pt(c[0]).y === sc.hover.y);
      if (j >= 0) drawHovered(ctx, G, cand(j), blackToPlay);
    } else {
      if (sc.k > 0) {   // stone-indicator-type 1: circle in the opposite colour on the last move
        const last = MOVES[sc.k - 1], rad = Math.round(sq * .22);
        ctx.strokeStyle = sc.k % 2 ? "#fff" : "#000"; strokeCircle(ctx, m + sq * last.x, m + sq * last.y, rad, rad / 5);
      }
      for (let j = cands.length - 1; j >= 0; j--) drawSuggestion(ctx, G, cand(j), j, maxP);
    }
    if (sc.fade < 1) {   // the finished game dissolves back into the empty board
      ctx.globalAlpha = 1 - sc.fade; ctx.drawImage(empty, 0, 0); ctx.globalAlpha = 1;
    }
    if (!calm) drawCursor(ctx, m + sq * sc.cursor.x, m + sq * sc.cursor.y, G.k);
  }
  new ResizeObserver(layout).observe(cv.parentElement);
  layout();
  if (calm) return;
  const frame = () => {
    if (!document.hidden && isVisible()) draw((performance.now() - t0) % CYCLE);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
