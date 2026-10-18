/** Research-only scorer, outside the app source/deployment tree.
 * Scoring follows pinned sklearn1.7.2/libsvm formulas; fitting stays in Python.
 * Votes use exact sign comparisons, gates use >=, and argmax ties use the first
 * class. No epsilon is silently added to change the learned decision rule.
 * Math.exp/reduction roundoff can matter near boundaries; expose that condition
 * for parity review instead of claiming portable source confidence.
 */

type Rule = { abstainAll: boolean; minDecisionMargin: number | null; minTop3CosineAffinity: number | null };
type Linear = { kind: 'logistic-regression'; weights: number[][]; intercept: number[] };
type Rbf = { kind: 'rbf-svc'; supportVectors: number[][]; dualCoefficients: number[][]; intercept: number[]; nSupport: number[]; gamma: number };

export interface ExperimentalHead {
  formatVersion: 1;
  experimental: true;
  promotionAllowed: false;
  browserParityReviewed: false;
  classOrder: string[];
  dimension: number;
  normalization: { inputL2Tolerance: number; method: string };
  classifier: Linear | Rbf;
  referenceVectors: number[][];
  referenceClassIndices: number[];
  topK: 3;
  rejectionRules: Record<string, Rule>;
  scoring: { numericBoundaryTolerance: number };
}

export interface ExperimentalPrediction {
  classIndex: number;
  label: string;
  decisionScores: number[];
  pairwiseDecisions: number[] | null;
  decisionMargin: number;
  top3CosineAffinity: number;
  accepted: boolean;
  numericBoundary: boolean;
}

const TOLERANCE = 1e-9;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid experimental head: ${message}`);
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteArray(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(v => typeof v === 'number' && Number.isFinite(v));
}

function matrix(value: unknown, rows: number, columns: number): value is number[][] {
  return Array.isArray(value) && value.length === rows && value.every(row => finiteArray(row, columns));
}

function squaredNorm(row: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < row.length; i += 1) sum += row[i] * row[i];
  return sum;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function freeze(value: object): void {
  for (const child of Object.values(value)) if (typeof child === 'object' && child !== null) freeze(child);
  Object.freeze(value);
}

function validateHead(value: unknown): ExperimentalHead {
  assert(object(value), 'expected a JSON object');
  assert(value.formatVersion === 1 && value.experimental === true && value.promotionAllowed === false && value.browserParityReviewed === false, 'research/promotion flags');
  assert(Array.isArray(value.classOrder) && value.classOrder.length >= 2 && value.classOrder.length <= 64
    && value.classOrder.every(label => typeof label === 'string' && label.length > 0)
    && new Set(value.classOrder).size === value.classOrder.length, 'class order');
  const classes = value.classOrder as string[];
  assert(Number.isSafeInteger(value.dimension) && (value.dimension as number) >= 2 && (value.dimension as number) <= 4096, 'embedding dimension');
  const dimension = value.dimension as number;
  assert(object(value.normalization) && value.normalization.inputL2Tolerance === 2e-4, 'normalization contract');
  assert(value.topK === 3 && object(value.scoring) && value.scoring.numericBoundaryTolerance === TOLERANCE, 'top-three/numeric contract');
  assert(object(value.backend) && value.backend.sklearn === '1.7.2', 'pinned sklearn scoring backend');
  assert(Array.isArray(value.referenceVectors) && value.referenceVectors.length >= classes.length * 3 && value.referenceVectors.length <= 20000, 'reference count');
  assert(matrix(value.referenceVectors, value.referenceVectors.length, dimension), 'reference vectors');
  assert(value.referenceVectors.every(row => Math.abs(Math.sqrt(squaredNorm(row)) - 1) <= 2e-4), 'reference normalization');
  assert(finiteArray(value.referenceClassIndices, value.referenceVectors.length)
    && value.referenceClassIndices.every(i => Number.isSafeInteger(i) && i >= 0 && i < classes.length), 'reference classes');
  for (let i = 0; i < classes.length; i += 1) assert(value.referenceClassIndices.filter(index => index === i).length >= 3, 'three references per class');
  assert(object(value.rejectionRules) && Object.keys(value.rejectionRules).length === classes.length, 'class rules');
  for (const label of classes) {
    assert(Object.hasOwn(value.rejectionRules, label), 'missing class rule');
    const rule = value.rejectionRules[label];
    assert(object(rule) && typeof rule.abstainAll === 'boolean', 'abstain rule');
    for (const key of ['minDecisionMargin', 'minTop3CosineAffinity']) {
      assert(rule[key] === null || typeof rule[key] === 'number' && Number.isFinite(rule[key]), 'finite gate threshold');
    }
  }
  assert(object(value.classifier), 'classifier');
  const classifier = value.classifier;
  if (classifier.kind === 'logistic-regression') {
    assert(matrix(classifier.weights, classes.length, dimension) && finiteArray(classifier.intercept, classes.length), 'linear dimensions');
  } else {
    assert(classifier.kind === 'rbf-svc', 'only dense RBF-SVC or logistic regression is supported');
    assert(Array.isArray(classifier.supportVectors) && classifier.supportVectors.length > 0 && classifier.supportVectors.length <= 20000, 'support count');
    const count = classifier.supportVectors.length;
    assert(matrix(classifier.supportVectors, count, dimension) && matrix(classifier.dualCoefficients, classes.length - 1, count), 'RBF matrix dimensions');
    assert(finiteArray(classifier.nSupport, classes.length) && classifier.nSupport.every(n => Number.isSafeInteger(n) && n > 0)
      && classifier.nSupport.reduce((sum, n) => sum + n, 0) === count, 'support-vector class blocks');
    assert(finiteArray(classifier.intercept, classes.length * (classes.length - 1) / 2), 'pair intercepts');
    assert(typeof classifier.gamma === 'number' && Number.isFinite(classifier.gamma) && classifier.gamma > 0, 'effective RBF gamma');
  }
  return value as unknown as ExperimentalHead;
}

/** sklearn's multiclass OVR scores from libsvm's i/j pair decisions.
 * Positive (including exact zero) votes for i; negative votes for j. Pair sums
 * provide only a bounded tiebreak term, so they cannot overturn a one-vote lead.
 */
export function ovrFromPairwise(pairwise: ArrayLike<number>, classCount: number): number[] {
  if (!Number.isSafeInteger(classCount) || classCount < 3 || pairwise.length !== classCount * (classCount - 1) / 2) throw new Error('Invalid pairwise decision dimensions.');
  const votes = new Array<number>(classCount).fill(0);
  const signed = new Array<number>(classCount).fill(0);
  let pair = 0;
  for (let i = 0; i < classCount; i += 1) {
    for (let j = i + 1; j < classCount; j += 1) {
      const decision = pairwise[pair++];
      if (!Number.isFinite(decision)) throw new Error('Nonfinite pairwise decision.');
      votes[decision < 0 ? j : i] += 1;
      signed[i] += decision;
      signed[j] -= decision;
    }
  }
  return votes.map((vote, i) => vote + signed[i] / (3 * (Math.abs(signed[i]) + 1)));
}

function pairwiseScores(model: Rbf, x: Float64Array, classCount: number): number[] {
  const kernel = model.supportVectors.map(vector => {
    let distance = 0;
    for (let i = 0; i < x.length; i += 1) {
      const difference = x[i] - vector[i];
      distance += difference * difference;
    }
    return Math.exp(-model.gamma * distance);
  });
  if (classCount === 2) {
    // sklearn's public binary coefficients/intercept have already been flipped
    // from libsvm: positive now favors classOrder[1].
    return [dot(model.dualCoefficients[0], kernel) + model.intercept[0]];
  }
  const start = [0];
  for (const count of model.nSupport) start.push(start[start.length - 1] + count);
  const result: number[] = [];
  for (let i = 0; i < classCount; i += 1) {
    for (let j = i + 1; j < classCount; j += 1) {
      let decision = 0;
      for (let k = start[i]; k < start[i + 1]; k += 1) decision += model.dualCoefficients[j - 1][k] * kernel[k];
      for (let k = start[j]; k < start[j + 1]; k += 1) decision += model.dualCoefficients[i][k] * kernel[k];
      result.push(decision + model.intercept[result.length]);
    }
  }
  return result;
}

export function createExperimentalScorer(json: unknown): { head: ExperimentalHead; predict: (embedding: ArrayLike<number>) => ExperimentalPrediction } {
  // Own a deep copy: later mutation of the source JSON must not change a scorer.
  const head = validateHead(structuredClone(json));
  freeze(head);
  const predict = (embedding: ArrayLike<number>): ExperimentalPrediction => {
    if (embedding.length !== head.dimension) throw new Error('Experimental embedding dimension mismatch.');
    const x = Float64Array.from(embedding);
    if (x.some(value => !Number.isFinite(value))) throw new Error('Experimental embedding contains nonfinite values.');
    const norm = Math.sqrt(squaredNorm(x));
    if (Math.abs(norm - 1) > head.normalization.inputL2Tolerance) throw new Error('Experimental embedding must already be L2-normalized.');
    for (let i = 0; i < x.length; i += 1) x[i] /= norm;
    let pairwise: number[] | null = null;
    let scores: number[];
    if (head.classifier.kind === 'logistic-regression') {
      scores = head.classifier.weights.map((row, i) => dot(row, x) + head.classifier.intercept[i]);
    } else {
      pairwise = pairwiseScores(head.classifier, x, head.classOrder.length);
      scores = head.classOrder.length === 2 ? [-pairwise[0], pairwise[0]] : ovrFromPairwise(pairwise, head.classOrder.length);
    }
    if (scores.some(value => !Number.isFinite(value))) throw new Error('Experimental classifier returned nonfinite scores.');
    let predicted = 0;
    for (let i = 1; i < scores.length; i += 1) if (scores[i] > scores[predicted]) predicted = i;
    const sorted = [...scores].sort((a, b) => b - a);
    const margin = sorted[0] - sorted[1];
    const nearest = head.referenceVectors.flatMap((row, i) => head.referenceClassIndices[i] === predicted
      ? [Math.max(-1, Math.min(1, dot(x, row)))] : []).sort((a, b) => b - a).slice(0, head.topK);
    const affinity = nearest.reduce((sum, value) => sum + value, 0) / head.topK;
    const rule = head.rejectionRules[head.classOrder[predicted]];
    const accepted = !rule.abstainAll && (rule.minDecisionMargin === null || margin >= rule.minDecisionMargin)
      && (rule.minTop3CosineAffinity === null || affinity >= rule.minTop3CosineAffinity);
    const numericBoundary = margin <= TOLERANCE || (pairwise?.some(value => Math.abs(value) <= TOLERANCE) ?? false)
      || rule.minDecisionMargin !== null && Math.abs(margin - rule.minDecisionMargin) <= TOLERANCE
      || rule.minTop3CosineAffinity !== null && Math.abs(affinity - rule.minTop3CosineAffinity) <= TOLERANCE;
    return { classIndex: predicted, label: head.classOrder[predicted], decisionScores: scores, pairwiseDecisions: pairwise,
      decisionMargin: margin, top3CosineAffinity: affinity, accepted, numericBoundary };
  };
  return { head, predict };
}
