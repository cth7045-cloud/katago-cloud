// Player strength estimate for the web analysis screen.
// Ported from LizzieYzy Next (https://github.com/wimi321/lizzieyzy-next): PlayerStrengthEstimator.java,
// XGBoostStrengthModel.java, XGBoost20TunResidualCalibrator.java, PlayerStrengthRankFormatter.java.
// GNU GPL v3.0 like the analysis screen (see NOTICE.txt). The models are strength-models.json (compacted from
// the same project's models/strength/*.json by keeping only what the Java scorer reads).
//
// Input: the main line as positions (every value from the side to move's point of view, like YZY's MoveData):
//   {cands: [{move, wr (0-100), lead, prior, order}] sorted by KataGo order, wr, lead}   (null = not analysed)
// and the moves between them: {color: "B"|"W", move: "Q16"|"pass", number}.

const WINRATE_TO_SCORE_LOSS = 6.0, ADDITIONAL_MOVE_ORDER = 999, AI_RANK_CAP = 10;
const OPENING_MOVE_LIMIT = 60, MIDDLEGAME_MOVE_LIMIT = 160, MIN_DIFFICULTY_WEIGHT = 0.05;
const EXCELLENT = 0.2, GREAT = 0.6, GOOD = 1.2, INACCURACY = 4.0, MISTAKE = 10.0;
export const MIN_REPORT_SAMPLES = 6;
// Full-29 indices the xgboost20tun boosters use (XGBoostStrengthModel.Features.XGBOOST20TUN_20_INDICES).
const XGBOOST20TUN_20_INDICES = [13, 5, 2, 19, 10, 20, 26, 3, 14, 11, 28, 8, 18, 7, 12, 23, 27, 22, 25, 0];
const MIN_RANK_VALUE = -1.0, MAX_RANK_VALUE = 12.0;

const positive = (v) => Math.max(0, v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fin = Number.isFinite;

// ------------------------------------------------------------------ per-move samples
function scoreEquivalentLoss(top, move) {   // candidateScoreEquivalentLoss
  if (fin(top.lead) && fin(move.lead)) return top.lead - move.lead;
  if (fin(top.wr) && fin(move.wr)) return (top.wr - move.wr) / WINRATE_TO_SCORE_LOSS;
  return null;
}

function complexity(pos) {
  const c = pos.cands;
  if (!c.length) return 0;
  const top = c[0];
  let lossSum = 0, priorSum = 0;
  c.forEach((m, i) => {
    if ((m.order > 0 ? m.order : i) >= ADDITIONAL_MOVE_ORDER) return;
    const prior = fin(m.prior) ? Math.max(0, m.prior) : 0;
    if (prior <= 0) return;
    const loss = scoreEquivalentLoss(top, m);
    if (loss === null) return;
    lossSum += positive(loss) * prior; priorSum += prior;
  });
  if (priorSum > 0) return clamp(lossSum / priorSum, 0, 1);
  if (c.length < 2) return 0;
  const loss = scoreEquivalentLoss(c[0], c[1]);
  return loss === null ? 0 : clamp(positive(loss) / GOOD, 0, 1);
}

function category(loss) {
  loss = positive(loss);
  return loss < EXCELLENT ? "excellent" : loss < GREAT ? "great" : loss < GOOD ? "good"
    : loss < INACCURACY ? "inaccuracy" : loss < MISTAKE ? "mistake" : "blunder";
}
const isGoodMove = (c) => c === "excellent" || c === "great" || c === "good";
const isMistake = (c) => c === "mistake" || c === "blunder";

/** One sample per analysed move: prev = position before the move, cur = position after it. */
export function sample(prev, cur, played, samePlayerToMove = false) {
  if (!prev || !cur || !played || (played.color !== "B" && played.color !== "W")) return null;
  const coord = played.move.toUpperCase();
  const index = prev.cands.findIndex((m) => m.move.toUpperCase() === coord);
  const top = prev.cands[0], actual = index >= 0 ? prev.cands[index] : null;
  let winrateLoss, scoreLoss = null;
  if (actual && top && ((fin(top.lead) && fin(actual.lead)) || (fin(top.wr) && fin(actual.wr)))) {
    if (fin(top.lead) && fin(actual.lead)) scoreLoss = top.lead - actual.lead;
    winrateLoss = fin(top.wr) && fin(actual.wr) ? top.wr - actual.wr : fallbackWinrateLoss(prev, cur, samePlayerToMove);
  } else {
    winrateLoss = fallbackWinrateLoss(prev, cur, samePlayerToMove);
    if (fin(prev.lead) && fin(cur.lead)) scoreLoss = cur.lead - (samePlayerToMove ? prev.lead : -prev.lead);
  }
  const sel = scoreLoss !== null ? positive(scoreLoss) : positive(winrateLoss) / WINRATE_TO_SCORE_LOSS;
  const cx = complexity(prev);
  return {
    color: played.color, number: played.number, move: coord,
    winrateLoss: positive(winrateLoss), scoreLoss: scoreLoss === null ? null : positive(scoreLoss),
    firstChoice: !!top && top.move.toUpperCase() === coord,
    aiRank: index >= 0 ? index : ADDITIONAL_MOVE_ORDER,
    category: category(sel), scoreEquivalentLoss: sel, complexity: cx,
    adjustedWeight: clamp(Math.max(cx, positive(sel) / INACCURACY), MIN_DIFFICULTY_WEIGHT, 1.0),
  };
}
function fallbackWinrateLoss(prev, cur, samePlayerToMove) {
  return cur.wr - (samePlayerToMove ? prev.wr : 100 - prev.wr);
}

// ------------------------------------------------------------------ side report
function median(values) {
  const v = [...values].sort((a, b) => a - b), mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
function percentile(values, fraction) {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 1) return v[0];
  const pos = fraction * (v.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? v[lo] : v[lo] * (1 - (pos - lo)) + v[hi] * (pos - lo);
}
function stddev(values) {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}
function weightedLoss(samples, fallback) {
  if (!samples.length) return fallback;
  let s = 0, w = 0;
  for (const x of samples) { s += x.scoreEquivalentLoss * x.adjustedWeight; w += x.adjustedWeight; }
  return w === 0 ? fallback : s / w;
}
const phaseGoodMoveRate = (samples, fallback) =>
  samples.length ? samples.filter((x) => isGoodMove(x.category)).length / samples.length : fallback;
const lossFit = (loss, cap) => 1 / (1 + clamp(positive(loss), 0, cap));

export function report(samples, model) {
  const n = samples.length;
  if (!n) return { sampleCount: 0, scoreSampleCount: 0, rankValue: NaN, confidence: "low" };
  let winSum = 0, scoreSum = 0, selSum = 0, wSum = 0, wLossSum = 0, cxSum = 0, rankSum = 0;
  let first = 0, top3 = 0, top5 = 0, excellent = 0, good = 0, inacc = 0, mistakes = 0, blunders = 0;
  const scoreLosses = [], selLosses = [], opening = [], middle = [], end = [];
  for (const s of samples) {
    winSum += positive(s.winrateLoss);
    const sel = positive(s.scoreEquivalentLoss);
    selSum += sel; selLosses.push(sel);
    wLossSum += sel * s.adjustedWeight; wSum += s.adjustedWeight;
    if (s.scoreLoss !== null) { scoreSum += positive(s.scoreLoss); scoreLosses.push(positive(s.scoreLoss)); }
    if (s.firstChoice) first++;
    if (s.aiRank < 3) top3++;
    if (s.aiRank < 5) top5++;
    if (s.category === "excellent") excellent++;
    if (isGoodMove(s.category)) good++;
    if (s.category === "inaccuracy") inacc++;
    if (isMistake(s.category)) mistakes++;
    if (s.category === "blunder") blunders++;
    (s.number <= OPENING_MOVE_LIMIT ? opening : s.number <= MIDDLEGAME_MOVE_LIMIT ? middle : end).push(s);
    rankSum += s.aiRank >= ADDITIONAL_MOVE_ORDER ? AI_RANK_CAP : Math.min(s.aiRank + 1, AI_RANK_CAP);
    cxSum += s.complexity;
  }
  const scoreN = scoreLosses.length;
  const averageScoreLoss = scoreN ? scoreSum / scoreN : 0, medianScoreLoss = scoreN ? median(scoreLosses) : 0;
  const averageSel = selSum / n;
  const weighted = wSum === 0 ? averageSel : wLossSum / wSum;
  const firstChoiceRate = first / n, top3Rate = top3 / n, top5Rate = top5 / n, excellentRate = excellent / n;
  const goodMoveRate = good / n, inaccuracyRate = inacc / n, mistakeRate = mistakes / n, blunderRate = blunders / n;
  const matchRate = clamp(0.45 * firstChoiceRate + 0.45 * goodMoveRate + 0.10 * (1 - mistakeRate), 0, 1);
  const averageDifficulty = cxSum * 100 / n;
  const medianForModel = scoreN ? medianScoreLoss : averageSel;
  const difficulty = clamp((averageDifficulty - 25) / 35, 0, 1);
  const fc = clamp(firstChoiceRate, 0, 1), t5 = clamp(top5Rate, 0, 1), gm = clamp(goodMoveRate, 0, 1), mr = clamp(matchRate, 0, 1);
  const full29 = [
    fc, clamp(top3Rate, 0, 1), t5, 1 / (1 + clamp(rankSum / n, 0, 10)), clamp(excellentRate, 0, 1), gm,
    1 - clamp(inaccuracyRate, 0, 1), mr, 1 - clamp(mistakeRate, 0, 1), 1 - clamp(blunderRate, 0, 1),
    lossFit(weighted, 50), lossFit(averageSel, 50), lossFit(medianForModel, 50), lossFit(percentile(selLosses, 0.75), 50),
    lossFit(percentile(selLosses, 0.90), 80), lossFit(percentile(selLosses, 0.95), 100), lossFit(Math.max(0, ...selLosses), 120),
    lossFit(stddev(selLosses), 50), difficulty,
    lossFit(weightedLoss(opening, weighted), 50), lossFit(weightedLoss(middle, weighted), 50), lossFit(weightedLoss(end, weighted), 50),
    clamp(phaseGoodMoveRate(opening, goodMoveRate), 0, 1), clamp(phaseGoodMoveRate(middle, goodMoveRate), 0, 1),
    clamp(phaseGoodMoveRate(end, goodMoveRate), 0, 1), fc * difficulty, gm * difficulty, mr * difficulty, t5 * difficulty,
  ];
  return {
    sampleCount: n, scoreSampleCount: scoreN, rankValue: model ? predict(model, full29) : NaN,
    averageWinrateLoss: winSum / n, averageScoreLoss, medianScoreLoss, weightedScoreLoss: weighted,
    firstChoiceRate, goodMoveRate, mistakeRate, matchRate, averageDifficulty,
    confidence: n >= 40 && scoreN >= n * 0.7 ? "high" : n >= 16 ? "medium" : "low",
  };
}

// ------------------------------------------------------------------ XGBoost + residual calibrator
export function predict(model, full29) {
  const x = XGBOOST20TUN_20_INDICES.map((i) => full29[i]);
  if (x.length < model.numFeature) return NaN;
  let raw = model.baseScore;
  for (const [left, right, split, cond, defLeft] of model.trees) {
    let node = 0;
    while (left[node] !== -1) {
      const v = x[split[node]];
      node = Number.isNaN(v) ? (defLeft[node] ? left[node] : right[node]) : v < cond[node] ? left[node] : right[node];
    }
    raw += cond[node];   // leaf values live in split_conditions
  }
  return calibrate(model.calibrator, clamp(raw, MIN_RANK_VALUE, MAX_RANK_VALUE), full29);
}

export function calibrate(c, base, full29) {
  if (!c || c.featureOrder.length !== c.coefficients.length) return clamp(base, MIN_RANK_VALUE, MAX_RANK_VALUE);
  let raw = c.intercept;
  for (let i = 0; i < c.coefficients.length; i++) {
    const name = c.featureOrder[i], scale = c.scalerScale[i] === 0 ? 1 : c.scalerScale[i];
    let v = NaN;
    if (name === "base_prediction") v = base;
    else if (name.startsWith("hinge_above_")) { const t = Number(name.slice(12)); v = fin(t) ? Math.max(0, base - t) : NaN; }
    else v = { match_rate: full29[7], first_choice_rate: full29[0], top5_rate: full29[2], weighted_loss_fit: full29[10], difficulty_fit: full29[18] }[name] ?? NaN;
    if (!fin(v)) return clamp(base, MIN_RANK_VALUE, MAX_RANK_VALUE);
    raw += c.coefficients[i] * (v - c.scalerMean[i]) / scale;
  }
  const gate = (v, t) => clamp((v - t[0]) / Math.max(t[1] - t[0], 1e-9), 0, 1);
  const rankGate = clamp((base - c.gateStart) / Math.max(c.gateFull - c.gateStart, 1e-9), 0, 1);
  const qualityGate = Math.max(gate(full29[7], c.matchGate), gate(full29[2], c.top5Gate), gate(full29[10], c.weightedLossGate));
  return clamp(base + rankGate * qualityGate * clamp(raw, c.correctionMin, c.correctionMax), MIN_RANK_VALUE, MAX_RANK_VALUE);
}

// ------------------------------------------------------------------ whole game
/** positions[k] = position after k moves on the main line, moves[k] = the move that led to positions[k] (k >= 1). */
export function estimate(positions, moves, model) {
  const bySide = { B: [], W: [] };
  for (let k = 1; k < positions.length; k++) {
    const s = sample(positions[k - 1], positions[k], moves[k]);
    if (s) bySide[s.color].push(s);
  }
  return { black: report(bySide.B, model), white: report(bySide.W, model), overall: report([...bySide.B, ...bySide.W], model) };
}

/** YZY's rank text (PlayerStrengthRankFormatter), in the words YZY's Korean window uses. */
export function formatRank(rankValue) {
  if (!fin(rankValue)) return "-";
  const v = clamp(rankValue, -18, 12), t = (x) => x.toFixed(1);
  if (v >= 12) return `${t(v)} 세미-god/AI`;
  if (v >= 11) return `${t(v)} 최고의 프로`;
  if (v >= 10) return `${t(v)} 전문가`;
  if (v >= 1) return `Fox ${t(v)} dan`;
  return `Fox ${t(Math.max(1, 2 - v))} kyu`;   // there is no 0 dan: just below 1 dan is 1 kyu
}

export async function loadModels(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`강도 모델을 불러오지 못했습니다 (${r.status})`);
  return (await r.json()).models;
}
