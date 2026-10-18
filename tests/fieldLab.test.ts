import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../field_lab.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const log = readFileSync(new URL('../docs/FIELD_LOG.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const archive = html.match(/<pre id="historical-source"[^>]*><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
const activeHtml = html.replace(/<pre id="historical-source"[^>]*>[\s\S]*?<\/pre>/, '');
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

describe('retired field-lab instrument and preserved notes', () => {
  it('keeps the incoming standalone source exactly as inert escaped text', () => {
    expect(archive).toBeDefined();
    const decoded = archive!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    expect(sha256(decoded)).toBe('6e46ed24a419ae9c9d358a3abd7333973c8eda6e51dcedd8f1b7f2d779a68d96');
    expect(archive).not.toMatch(/<(?:script|button|input|select|canvas)\b/i);
    expect(activeHtml).toContain('None of this archived code runs on this page');
  });

  it('does not expose a second microphone/DSP/CSV implementation or executable script', () => {
    expect(activeHtml).not.toMatch(/<script\b|\bonclick\s*=|getUserMedia|AudioContext|requestAnimationFrame|id="start"|id="csv"/i);
    expect(activeHtml).toContain("default-src 'none'");
    expect(activeHtml).toContain('The old standalone instrument is retired');
    expect(activeHtml).toContain('does not access the microphone or calculate measurements');
    expect(activeHtml).toContain('name="viewport"');
  });

  it('links to the app capture route and explains separate indicators and actual duration', () => {
    expect(activeHtml).toContain('href="https://tonalwatch.vercel.app/#/measure"');
    expect(activeHtml).toContain('href="./#/measure"');
    expect(activeHtml).toContain('actual analyzed duration');
    expect(activeHtml).toContain('low-frequency contribution suggested');
    expect(activeHtml).toContain('separate experimental check');
    expect(activeHtml).toContain('dB re digital RMS 1, uncalibrated input');
    expect(activeHtml).toContain('not a calibration offset');
  });

  it('preserves every original field-log character without substituting a mean or rewriting field data', () => {
    const original = log.match(/^```text\n([\s\S]*?)\n```/m)?.[1];
    expect(original).toBeDefined();
    expect(sha256(original!)).toBe('926ec7e57ee66c3dc2b318268ab5c7d4377aa98be6faae1cb4f42f070c32760f');
    expect(original).toContain('mean Δ 0.46 dB');
    expect(original).toContain('5.9/5.8, 5.9/5.4, 7.6/6.4');
  });

  it('explicitly flags method, duration and reported-offset ambiguity outside the raw-note block', () => {
    const explanation = log.replace(/^```text\n[\s\S]*?\n```/m, '').replace(/\s+/g, ' ');
    expect(explanation).toContain('not validated measurement data');
    expect(explanation).toContain('0.46 dB is unverified');
    expect(explanation).toContain('not a calibration offset');
    expect(explanation).toMatch(/column heading says.*15s gap/);
    expect(explanation).toContain('It is not the current protocol');
    expect(explanation).toContain('Observation packet filename / analysis ID');
  });
});
