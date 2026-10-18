import { describe, expect, it } from 'vitest';
import reference from './fixtures/reference.json';
import { createExperimentalScorer, ovrFromPairwise } from './experimentalHead';

const tolerance = reference.numericTolerance;

describe('isolated research head against independent sklearn1.7.2 references', () => {
  it.each(reference.cases)('$name preserves decision scores, labels, margins, top3 affinity and gate bits', fixture => {
    const scorer = createExperimentalScorer(fixture.head);
    fixture.queries.forEach((query, index) => {
      for (const input of [query, Float32Array.from(query)]) {
        const prediction = scorer.predict(input);
        expect(prediction.label).toBe(fixture.expected.labels[index]);
        expect(prediction.accepted).toBe(fixture.expected.accepted[index]);
        prediction.decisionScores.forEach((score, cls) => {
          expect(Math.abs(score - fixture.expected.decisionScores[index][cls])).toBeLessThanOrEqual(tolerance);
        });
        expect(Math.abs(prediction.decisionMargin - fixture.expected.decisionMargin[index])).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(prediction.top3CosineAffinity - fixture.expected.top3CosineAffinity[index])).toBeLessThanOrEqual(tolerance);
        if (fixture.expected.pairwiseDecisions) {
          expect(prediction.pairwiseDecisions).not.toBeNull();
          prediction.pairwiseDecisions!.forEach((score, pair) => {
            expect(Math.abs(score - fixture.expected.pairwiseDecisions![index][pair])).toBeLessThanOrEqual(tolerance);
          });
        } else expect(prediction.pairwiseDecisions).toBeNull();
      }
    });
    expect(scorer.head.promotionAllowed).toBe(false);
    expect(scorer.head.browserParityReviewed).toBe(false);
  });

  it.each(reference.pairwiseCases)('handles independent pairwise reference $name', fixture => {
    const scores = ovrFromPairwise(fixture.pairwise, 5);
    scores.forEach((score, index) => expect(Math.abs(score - fixture.scores[index])).toBeLessThanOrEqual(tolerance));
    expect(scores.indexOf(Math.max(...scores))).toBe(fixture.argmax);
  });

  it('flags an exact linear ranking/gate boundary and keeps first-index tie semantics', () => {
    const head = structuredClone(reference.cases.find(fixture => fixture.name === 'linear-five')!.head);
    head.classifier = { kind: 'logistic-regression', weights: head.classOrder.map(() => Array(head.dimension).fill(0)),
      intercept: Array(head.classOrder.length).fill(0), binaryScores: null };
    const rules = head.rejectionRules as Record<string, { abstainAll: boolean; minDecisionMargin: number | null; minTop3CosineAffinity: number | null }>;
    rules[head.classOrder[0]] = {
      abstainAll: false, minDecisionMargin: 0, minTop3CosineAffinity: null,
    };
    const prediction = createExperimentalScorer(head).predict(reference.cases[0].queries[0]);
    expect(prediction.classIndex).toBe(0);
    expect(prediction.decisionMargin).toBe(0);
    expect(prediction.accepted).toBe(true);
    expect(prediction.numericBoundary).toBe(true);
  });

  it('rejects unnormalized, nonfinite and wrong-dimensional embeddings', () => {
    const scorer = createExperimentalScorer(reference.cases[0].head);
    expect(() => scorer.predict(Array(scorer.head.dimension).fill(0))).toThrow(/normalized/);
    expect(() => scorer.predict(Array(scorer.head.dimension).fill(NaN))).toThrow(/nonfinite/);
    expect(() => scorer.predict([1, 0])).toThrow(/dimension/);
  });

  it('uses inclusive exact gate boundaries without an epsilon that changes acceptance', () => {
    const head = structuredClone(reference.cases[0].head);
    const unit = Array<number>(head.dimension).fill(0);
    unit[0] = 1;
    head.classifier = { kind: 'logistic-regression', weights: head.classOrder.map((_, i) => i === 0 ? [...unit] : Array(head.dimension).fill(0)),
      intercept: Array(head.classOrder.length).fill(0), binaryScores: null };
    head.referenceClassIndices.forEach((cls, i) => { if (cls === 0) head.referenceVectors[i] = [...unit]; });
    const rules = head.rejectionRules as Record<string, { abstainAll: boolean; minDecisionMargin: number | null; minTop3CosineAffinity: number | null }>;
    rules[head.classOrder[0]] = { abstainAll: false, minDecisionMargin: 1, minTop3CosineAffinity: 1 };
    const exact = createExperimentalScorer(head).predict(unit);
    expect(exact.decisionMargin).toBe(1);
    expect(exact.top3CosineAffinity).toBe(1);
    expect(exact.accepted).toBe(true);
    expect(exact.numericBoundary).toBe(true);
    rules[head.classOrder[0]].minDecisionMargin = 1 + Number.EPSILON;
    expect(createExperimentalScorer(head).predict(unit).accepted).toBe(false);
  });

  it('honors abstainAll even when a prediction has perfect affinity and a large margin', () => {
    const head = structuredClone(reference.cases[0].head);
    for (const rule of Object.values(head.rejectionRules)) rule.abstainAll = true;
    expect(createExperimentalScorer(head).predict(reference.cases[0].queries[0]).accepted).toBe(false);
  });

  it('validates matrices, support blocks, reference labels, flags and class gates before scoring', () => {
    const source = reference.cases.find(fixture => fixture.name === 'rbf-five')!.head;
    const mutate = (change: (head: Record<string, unknown>) => void) => {
      const head = structuredClone(source) as unknown as Record<string, unknown>;
      change(head);
      expect(() => createExperimentalScorer(head)).toThrow(/Invalid experimental head/);
    };
    mutate(head => { head.promotionAllowed = true; });
    mutate(head => { head.referenceClassIndices = Array(source.referenceClassIndices.length).fill(0); });
    mutate(head => { head.rejectionRules = {}; });
    mutate(head => { (head.classifier as { nSupport: number[] }).nSupport[0] += 1; });
    mutate(head => { (head.classifier as { supportVectors: number[][] }).supportVectors[0][0] = Infinity; });
    mutate(head => { (head.classifier as { gamma: number }).gamma = -1; });
  });

  it('does not change scores when the caller mutates the original source JSON', () => {
    const head = structuredClone(reference.cases[0].head);
    const scorer = createExperimentalScorer(head);
    const first = scorer.predict(reference.cases[0].queries[0]);
    head.referenceVectors[0].fill(0);
    head.classOrder[0] = 'mutated';
    expect(scorer.predict(reference.cases[0].queries[0])).toEqual(first);
    expect(() => { scorer.head.classOrder[0] = 'also-mutated'; }).toThrow();
  });

  it('refuses incomplete/nonfinite pairwise dimensions', () => {
    expect(() => ovrFromPairwise([1, 2], 5)).toThrow(/dimensions/);
    expect(() => ovrFromPairwise(Array(10).fill(NaN), 5)).toThrow(/Nonfinite/);
  });
});
