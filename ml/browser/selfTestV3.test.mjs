import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import {SELF_TEST_V3, generateSelfTestV3Input} from './selfTestV3.mjs';

const sha = samples => crypto.createHash('sha256').update(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)).digest('hex');

test('square contains exactly 630 alternating 350-sample half cycles, without gain or missing samples', () => {
  const {samples, sampleRate} = generateSelfTestV3Input('tw-v3-square-44100');
  assert.equal(sampleRate, 44100);
  assert.equal(samples.length, sampleRate * 5);
  let positive = 0, negative = 0;
  for (let block = 0; block < 630; block++) {
    const expected = block % 2 ? -1 / 16 : 1 / 16;
    for (let offset = 0; offset < 350; offset++) {
      assert.equal(samples[block * 350 + offset], expected);
      if (expected > 0) positive++; else negative++;
    }
  }
  assert.equal(positive, 110250);
  assert.equal(negative, 110250);
});

test('noise exactly matches independently masked BigInt xorshift32 and top-24-bit scaling for every sample', () => {
  const {samples, sampleRate} = generateSelfTestV3Input('tw-v3-noise-48000');
  assert.equal(sampleRate, 48000);
  assert.equal(samples.length, sampleRate * 5);
  const mask = (1n << 32n) - 1n;
  let state = 0x1a2b3c4dn;
  for (const sample of samples) {
    state = (state ^ (state << 13n)) & mask;
    state = (state ^ (state >> 17n)) & mask;
    state = (state ^ (state << 5n)) & mask;
    assert.equal(sample, Number((state >> 8n) - 8388608n) / 134217728);
    assert.ok(Number.isFinite(sample) && sample >= -0.0625 && sample < 0.0625);
  }
});

test('both generated inputs are reproducible and independently owned across repeated/interleaved calls', () => {
  for (const specification of SELF_TEST_V3.cases) {
    const first = generateSelfTestV3Input(specification.id);
    const originalSha = sha(first.samples);
    const second = generateSelfTestV3Input(specification.id);
    assert.notEqual(first.samples.buffer, second.samples.buffer);
    assert.equal(sha(second.samples), originalSha);
    first.samples.fill(NaN);
    const third = generateSelfTestV3Input(specification.id);
    assert.equal(sha(second.samples), originalSha);
    assert.equal(sha(third.samples), originalSha);
  }
});

test('unknown inputs fail closed and public specifications cannot be mutated', () => {
  for (const id of ['', undefined, '__unknown__', 'square']) assert.throws(() => generateSelfTestV3Input(id), /Unknown synthetic self-test case/);
  assert.throws(() => {SELF_TEST_V3.noiseSeed = 1;}, TypeError);
  assert.throws(() => {SELF_TEST_V3.cases[0].sampleRate = 48000;}, TypeError);
  assert.throws(() => {SELF_TEST_V3.cases.push({});}, TypeError);
});
