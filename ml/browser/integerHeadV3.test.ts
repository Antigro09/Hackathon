import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fixture from './fixtures/integer-head-v3.json';
import { createIntegerHeadV3, quantizeEmbeddingV3, V3_CLASSES } from './integerHeadV3';

const clone = <T>(value: T): T => structuredClone(value);
const axis = () => clone(fixture.heads.axis);
const one = () => {const value = new Float32Array(512); value[0] = 1; return value;};

describe('research v3 integer scoring against the frozen Python implementation', () => {
  it('binds shared synthetic references to the current Python scorer bytes', () => {
    expect(createHash('sha256').update(readFileSync('ml/experiment_v3.py')).digest('hex')).toBe(fixture.pythonSourceSha256);
  });
  for (const item of fixture.cases) {
    it(item.name, () => {
      const scorer = createIntegerHeadV3(fixture.heads[item.head as keyof typeof fixture.heads]);
      if (item.inputKind === 'int32') expect(scorer.predictQuantized(Int32Array.from(item.input))).toEqual(item.expected);
      else {
        const input = Float32Array.from(item.input), before = input.slice();
        expect(Array.from(quantizeEmbeddingV3(input))).toEqual(item.expectedQuantized);
        expect(scorer.predict(input)).toEqual(item.expected);
        expect(input).toEqual(before);
      }
    });
  }
  it('copies artifact parameters and rules; caller mutation cannot alter a loaded scorer', () => {
    expect(Object.isFrozen(V3_CLASSES)).toBe(true);
    expect(() => (V3_CLASSES as unknown as string[]).reverse()).toThrow();
    const head = axis(), scorer = createIntegerHeadV3(head), before = scorer.predict(one());
    head.weights[0][0] = 0;head.bias[5] = 100;head.rejectionRules.buzz.abstainAll = true;head.classOrder.reverse();
    expect(scorer.predict(one())).toEqual(before);
    before.integerScores[0] = 0;
    expect(scorer.predict(one()).integerScores[0]).not.toBe(0);
  });
  it('rejects malformed, promoted, floating or untrusted scoring contracts', () => {
    const mutations: Array<(head: ReturnType<typeof axis>) => void> = [
      head => {head.formatVersion = 2;}, head => {head.experimental = false;}, head => {head.promotionAllowed = true;},
      head => {head.classOrder.reverse();}, head => {head.dimension = 511;}, head => {head.inputScale = 65536;}, head => {head.weightScale = 1;},
      head => {head.rounding = 'Math.round';}, head => {head.guardSteps = 0;}, head => {head.weights[0][0] = .5;},
      head => {head.weights[0][0] = Number.NaN;}, head => {head.weights[0][0] = 2147483648;}, head => {head.bias[0] = Number.MAX_SAFE_INTEGER + 1;},
      head => {head.pairGuard[0][1] = 0;}, head => {head.maxAbsoluteScoreBound++;},
      head => {head.rejectionRules.buzz.minGuardedMargin = .5;}, head => {head.rejectionRules.buzz.minGuardedMargin = -1;},
      head => {head.rejectionRules.buzz.abstainAll = true;},
    ];
    for (const mutate of mutations) {const head = axis(); mutate(head);expect(() => createIntegerHeadV3(head)).toThrow();}
    for (const malformed of [null, [], {}, {...axis(), weights: new Array(6)}, {...axis(), rejectionRules: {}}, {...axis(), bias: [0,0,0,0,0,true]}]) expect(() => createIntegerHeadV3(malformed)).toThrow();
  });
  it('rejects a mathematically unsafe bound even when all submitted parameters are safe integers', () => {
    const head = clone(fixture.heads['near-safe-limit']);
    head.bias[0]++;head.maxAbsoluteScoreBound++;
    expect(Number.isSafeInteger(head.bias[0])).toBe(true);
    expect(() => createIntegerHeadV3(head)).toThrow(/bound/);
  });
  it('rejects wrong type/shape, nonfinite, nonnormalized and out-of-bound inputs without repair', () => {
    const scorer = createIntegerHeadV3(axis());
    const bad = [new Float32Array(511), new Float32Array(512), new Float32Array(512).fill(NaN), new Float32Array(512).fill(Infinity), one().map(x => x * 2)];
    for (const input of bad) expect(() => scorer.predict(input)).toThrow();
    expect(() => scorer.predict(new Float64Array(512) as unknown as Float32Array)).toThrow();
    expect(() => scorer.predict(Array.from(one()) as unknown as Float32Array)).toThrow();
    const outside = new Int32Array(512); outside[0] = 32770;
    expect(() => scorer.predictQuantized(outside)).toThrow();
    expect(() => scorer.predictQuantized(new Int32Array(511))).toThrow();
  });
});
