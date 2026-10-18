/** Research-only v3 integer head. No fitting, encoder, probabilities or promotion.
 * Matches ml/experiment_v3.py for identical canonical Float32 embeddings.
 * BigInt is used only to certify the artifact; validated inference uses exact
 * JavaScript Number integer arithmetic within the proven bound.
 */
export const V3_CLASSES = Object.freeze(['buzz', 'mechanical_fan', 'speech', 'traffic', 'wind', '__unknown__']);
const DIMENSION = 512;
const INPUT_SCALE = 32768;
const INPUT_BOUND = INPUT_SCALE + 1;
const WEIGHT_SCALE = 1048576;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const WEIGHT_BOUND = 2147483647;
function require(condition, message) {
    if (!condition)
        throw new Error(`Invalid v3 integer head: ${message}`);
}
function object(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function integers(value, size) {
    return Array.isArray(value) && value.length === size
        && Array.from(value).every(item => typeof item === 'number' && Number.isSafeInteger(item));
}
function integerMatrix(value, rows, columns) {
    return Array.isArray(value) && value.length === rows && Array.from(value).every(row => integers(row, columns));
}
const abs = (value) => value < 0n ? -value : value;
/** Exact power-of-two quantization; copies and never renormalizes the input. */
export function quantizeEmbeddingV3(embedding) {
    require(embedding instanceof Float32Array && embedding.length === DIMENSION, 'expected 512 canonical Float32 coordinates');
    const values = embedding.slice();
    let squaredNorm = 0;
    for (const value of values) {
        require(Number.isFinite(value) && Math.abs(value) <= 1 + 1 / INPUT_SCALE, 'finite bounded Float32 input');
        squaredNorm += value * value;
    }
    require(Math.abs(Math.sqrt(squaredNorm) - 1) <= 2e-4, 'input must already be L2-normalized');
    return Int32Array.from(values, value => Math.sign(value) * Math.floor(Math.abs(value) * INPUT_SCALE + .5));
}
/** Validate/copy a frozen Python head. Extra provenance fields are not attested here. */
export function createIntegerHeadV3(value) {
    require(object(value), 'expected a JSON object');
    require(value.formatVersion === 3 && value.experimental === true && value.promotionAllowed === false, 'unpromoted research schema');
    require(Array.isArray(value.classOrder) && value.classOrder.length === 6
        && V3_CLASSES.every((label, index) => value.classOrder[index] === label), 'fixed six-class order');
    require(value.dimension === DIMENSION && value.inputScale === INPUT_SCALE && value.weightScale === WEIGHT_SCALE
        && value.guardSteps === 1 && value.rounding === 'symmetric-half-away-from-zero', 'fixed-point contract');
    require(integerMatrix(value.weights, 6, DIMENSION) && integers(value.bias, 6) && integerMatrix(value.pairGuard, 6, 6), 'integer parameter shapes');
    require(value.weights.every(row => row.every(weight => Math.abs(weight) <= WEIGHT_BOUND)), 'int32 weight bound');
    const weights = value.weights.map(row => Object.freeze(row.slice()));
    const bias = Object.freeze(value.bias.slice());
    const guard = value.pairGuard.map(row => Object.freeze(row.slice()));
    let maximum = 0n;
    let maximumGuard = 0n;
    for (let i = 0; i < 6; i++) {
        let absoluteWeights = 0n;
        for (const weight of weights[i])
            absoluteWeights += abs(BigInt(weight));
        const bound = BigInt(INPUT_BOUND) * absoluteWeights + abs(BigInt(bias[i]));
        if (bound > maximum)
            maximum = bound;
        for (let j = 0; j < 6; j++) {
            let expected = 0n;
            if (i !== j) {
                expected = 1n;
                for (let k = 0; k < DIMENSION; k++)
                    expected += abs(BigInt(weights[i][k]) - BigInt(weights[j][k]));
            }
            require(BigInt(guard[i][j]) === expected, 'pairwise representation guard');
            if (expected > maximumGuard)
                maximumGuard = expected;
        }
    }
    require(typeof value.maxAbsoluteScoreBound === 'number' && Number.isSafeInteger(value.maxAbsoluteScoreBound)
        && BigInt(value.maxAbsoluteScoreBound) === maximum && 4n * maximum + 2n * maximumGuard + 2n <= MAX_SAFE, 'exact-integer accumulation bound');
    require(object(value.rejectionRules) && Object.keys(value.rejectionRules).length === 5
        && V3_CLASSES.slice(0, 5).every(label => Object.hasOwn(value.rejectionRules, label)), 'one frozen rule per known class');
    const rules = {};
    for (const label of V3_CLASSES.slice(0, 5)) {
        const rule = value.rejectionRules[label];
        require(object(rule) && typeof rule.abstainAll === 'boolean', 'boolean abstention rule');
        const threshold = rule.minGuardedMargin ?? null;
        if (rule.abstainAll)
            require(threshold === null, 'closed rule must have a null threshold');
        else
            require(typeof threshold === 'number' && Number.isSafeInteger(threshold) && threshold >= 0
                && BigInt(threshold) <= 2n * maximum + maximumGuard + 1n, 'bounded integer threshold');
        rules[label] = Object.freeze({ abstainAll: rule.abstainAll, minGuardedMargin: threshold });
    }
    Object.freeze(weights);
    Object.freeze(guard);
    Object.freeze(rules);
    const score = (q) => {
        // The certified absolute-sum bound also bounds every individual product and
        // partial sum, irrespective of sign/cancellation or reduction order.
        const scores = bias.map((intercept, row) => {
            let sum = intercept;
            for (let k = 0; k < DIMENSION; k++)
                sum += q[k] * weights[row][k];
            return sum;
        });
        let winner = 0;
        for (let i = 1; i < 6; i++)
            if (scores[i] > scores[winner])
                winner = i;
        let margin = Infinity;
        for (let rival = 0; rival < 6; rival++)
            if (rival !== winner)
                margin = Math.min(margin, scores[winner] - scores[rival] - guard[winner][rival]);
        const label = V3_CLASSES[winner];
        const rule = winner < 5 ? rules[label] : null;
        return { classIndex: winner, label, integerScores: scores, guardedMargin: margin,
            accepted: rule !== null && !rule.abstainAll && margin >= rule.minGuardedMargin };
    };
    return Object.freeze({
        predict(embedding) { return score(quantizeEmbeddingV3(embedding)); },
        predictQuantized(input) {
            require(input instanceof Int32Array && input.length === DIMENSION, 'expected 512 prequantized int32 coordinates');
            const q = input.slice();
            require(q.every(coordinate => coordinate >= -INPUT_BOUND && coordinate <= INPUT_BOUND), 'prequantized input bound');
            return score(q);
        },
    });
}
