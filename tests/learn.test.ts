import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearnPage, LearnPanel, LEARN_MAX_GAIN, TonePlaybackController } from '../src/components/Learn';
import { analyzePcm } from '../src/analysis/engine';
import { generateFixture, syntheticMeta } from '../src/analysis/fixtures';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function mockAudioContext(resuming = Promise.resolve()) {
  const param = {
    value: 0,
    cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(),
  };
  const oscillator = { frequency: { value: 0 }, type: '', connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  const gain = { gain: param, connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    state: 'suspended', currentTime: 1, destination: {},
    createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => gain),
    resume: vi.fn(() => resuming),
    close: vi.fn(() => { context.state = 'closed'; return Promise.resolve(); }),
  };
  return { context: context as unknown as AudioContext, raw: context, oscillator, gain, param };
}

const players: TonePlaybackController[] = [];
function player(createContext: () => AudioContext) {
  const onState = vi.fn();
  const controller = new TonePlaybackController(createContext, onState);
  players.push(controller);
  return { controller, onState };
}

afterEach(() => { players.splice(0).forEach(controller => controller.stop()); });

describe('explicit synthetic tone playback', () => {
  it('creates no audio context before a play request, then starts quietly at the requested frequency', async () => {
    const audio = mockAudioContext();
    const factory = vi.fn(() => audio.context);
    const { controller, onState } = player(factory);
    expect(factory).not.toHaveBeenCalled();
    await controller.play(63);
    expect(audio.oscillator.frequency.value).toBe(63);
    expect(audio.oscillator.type).toBe('sine');
    expect(audio.param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.025, 1.04);
    expect(audio.oscillator.start).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenLastCalledWith({ phase: 'playing', frequencyHz: 63 });
  });

  it('clamps starting and live gain to the declared maximum', async () => {
    const audio = mockAudioContext();
    const { controller } = player(() => audio.context);
    await controller.play(8000, 100);
    expect(audio.param.linearRampToValueAtTime).toHaveBeenLastCalledWith(LEARN_MAX_GAIN, 1.04);
    controller.setLevel(100);
    expect(audio.param.setTargetAtTime).toHaveBeenLastCalledWith(LEARN_MAX_GAIN, 1, 0.015);
    controller.setLevel(-1);
    expect(audio.param.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.015);
  });

  it('silences, stops, disconnects, and closes a playing tone on Stop', async () => {
    const audio = mockAudioContext();
    const { controller, onState } = player(() => audio.context);
    await controller.play(125);
    controller.stop();
    expect(audio.param.setValueAtTime).toHaveBeenLastCalledWith(0, 1);
    expect(audio.oscillator.stop).toHaveBeenCalledOnce();
    expect(audio.oscillator.disconnect).toHaveBeenCalledOnce();
    expect(audio.gain.disconnect).toHaveBeenCalledOnce();
    expect(audio.raw.close).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenLastCalledWith({ phase: 'idle', frequencyHz: null });
    controller.stop();
    expect(audio.raw.close).toHaveBeenCalledOnce();
  });

  it('cancels a pending resume without starting an oscillator later', async () => {
    const resume = deferred();
    const audio = mockAudioContext(resume.promise);
    const { controller, onState } = player(() => audio.context);
    const request = controller.play(500);
    expect(onState).toHaveBeenLastCalledWith({ phase: 'starting', frequencyHz: 500 });
    controller.stop();
    resume.resolve();
    await request;
    expect(audio.oscillator.start).not.toHaveBeenCalled();
    expect(audio.raw.close).toHaveBeenCalledOnce();
    expect(onState).toHaveBeenLastCalledWith({ phase: 'idle', frequencyHz: null });
  });

  it('replacing a pending tone cannot restart it or overwrite the new playing state', async () => {
    const resume = deferred();
    const oldAudio = mockAudioContext(resume.promise);
    const newAudio = mockAudioContext();
    const factory = vi.fn().mockReturnValueOnce(oldAudio.context).mockReturnValueOnce(newAudio.context);
    const { controller, onState } = player(factory);
    const oldRequest = controller.play(63);
    await controller.play(1000);
    resume.resolve();
    await oldRequest;
    expect(oldAudio.oscillator.start).not.toHaveBeenCalled();
    expect(oldAudio.raw.close).toHaveBeenCalledOnce();
    expect(newAudio.oscillator.start).toHaveBeenCalledOnce();
    expect(newAudio.raw.close).not.toHaveBeenCalled();
    expect(onState).toHaveBeenLastCalledWith({ phase: 'playing', frequencyHz: 1000 });
  });

  it('uses a volume adjustment made while resume is pending', async () => {
    const resume = deferred();
    const audio = mockAudioContext(resume.promise);
    const { controller } = player(() => audio.context);
    const request = controller.play(125);
    controller.setLevel(0.005);
    resume.resolve();
    await request;
    expect(audio.param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.005, 1.04);
  });

  it('prevents overlapping playback across two Learn placements', async () => {
    const firstAudio = mockAudioContext();
    const secondAudio = mockAudioContext();
    const first = player(() => firstAudio.context);
    const second = player(() => secondAudio.context);
    await first.controller.play(63);
    await second.controller.play(8000);
    expect(firstAudio.oscillator.stop).toHaveBeenCalledOnce();
    expect(firstAudio.raw.close).toHaveBeenCalledOnce();
    expect(first.onState).toHaveBeenLastCalledWith({ phase: 'idle', frequencyHz: null });
    expect(second.onState).toHaveBeenLastCalledWith({ phase: 'playing', frequencyHz: 8000 });
  });

  it('releases a failed resume and reports an idle playback error', async () => {
    const resume = deferred();
    const audio = mockAudioContext(resume.promise);
    const { controller, onState } = player(() => audio.context);
    const request = controller.play(1000);
    resume.reject(new Error('Playback refused'));
    await request;
    expect(audio.oscillator.start).not.toHaveBeenCalled();
    expect(audio.raw.close).toHaveBeenCalledOnce();
    expect(onState.mock.lastCall?.[0]).toMatchObject({ phase: 'error', frequencyHz: null });
  });
});

describe('Learn content', () => {
  it('renders the exact screening boundary and all five explicit, disabled tone choices without browser APIs', () => {
    const html = renderToStaticMarkup(createElement(LearnPage, { disabled: true }));
    expect(html).toContain('Uncalibrated screening only. No source identification or legal-compliance determination.');
    expect(html.match(/class="learn-tone-button" disabled=""/g)).toHaveLength(5);
    expect(html).toContain('63 Hz');
    expect(html).toContain('125 Hz');
    expect(html).toContain('500 Hz');
    expect(html).toContain('1 kHz');
    expect(html).toContain('8 kHz');
    expect(html).toContain('Low-frequency broadband');
    expect(html).toContain('not sound-pressure levels or a direct measure of discomfort');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('autoplay');
  });

  it('makes the compact explainer reachable without concealing the weighting limitations', () => {
    const html = renderToStaticMarkup(createElement(LearnPanel));
    expect(html).toContain('href="#/learn"');
    expect(html.indexOf('not sound-pressure levels')).toBeLessThan(html.indexOf('<details'));
    expect(html).toContain('The sustained-peak indicator is a separate experimental check.');
  });

  it('shows actual FFT spacing, duration, peak candidate, and synthetic provenance for the active observation', () => {
    const result = analyzePcm(generateFixture('sine-63'), 48000, syntheticMeta('sine-63'));
    const html = renderToStaticMarkup(createElement(LearnPage, { result }));
    expect(html).toContain('48,000 Hz ÷ 8,192 = <strong>5.859 Hz/bin</strong>');
    expect(html).toContain('5.00 s · 240,000 samples');
    expect(html).toContain(`Candidate near <strong>${result.peakCandidate!.centerHz.toFixed(1)} Hz</strong>`);
    expect(html).toContain('Synthetic demonstration — not a field observation');
    expect(html).toContain('dashed 60/120 Hz lines are reference positions, not detections');
    expect(html).toContain('This zoom adds no frequency resolution.');
    expect(html).toContain('class="learn-candidate-line"');
    expect(html).toContain('does not identify the power grid, equipment, a building, or transmission through a wall');
  });

  it('uses the active 44.1kHz resolution and does not draw an out-of-range candidate in the low-frequency zoom', () => {
    const result = analyzePcm(generateFixture('sine-1000', 44100), 44100, syntheticMeta('sine-1000'));
    const html = renderToStaticMarkup(createElement(LearnPage, { result }));
    expect(html).toContain('44,100 Hz ÷ 8,192 = <strong>5.383 Hz/bin</strong>');
    expect(html).toContain('220,500 samples');
    expect(html).toContain(`Candidate near <strong>${result.peakCandidate!.centerHz.toFixed(1)} Hz</strong>`);
    expect(html).not.toContain('class="learn-candidate-line"');
  });

  it('retains quality limits and suppresses a candidate when clipping makes the spectrum unreliable', () => {
    const original = analyzePcm(generateFixture('sine-63'), 48000, syntheticMeta('sine-63'));
    const result = { ...original, qualityCodes: ['clipped' as const] };
    const html = renderToStaticMarkup(createElement(LearnPage, { result }));
    expect(html).toContain('Clipped input: this spectrum includes overload distortion');
    expect(html).toContain('No reliable candidate available; check recording quality and analysis status');
    expect(html).not.toContain('class="learn-candidate-line"');
  });

  it('treats silence as unavailable instead of drawing a zero-valued spectrum or claiming a missing sound', () => {
    const result = analyzePcm(generateFixture('silence'), 48000, syntheticMeta('silence'));
    const html = renderToStaticMarkup(createElement(LearnPage, { result }));
    expect(html).toContain('No usable spectrum is available in the 20–200 Hz display range.');
    expect(html).toContain('the captured input was near zero');
    expect(html).toContain('Absence of a visible peak does not rule out a sound or validate microphone sensitivity');
    expect(html).not.toContain('class="learn-observed-spectrum"');
  });
});
