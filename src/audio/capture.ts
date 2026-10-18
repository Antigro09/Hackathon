import type { InputMeta, QualityCode } from '../types';
import { CaptureCollector, filterDeviceSettings } from './chunks';
import { abortable, AudioInputError, cancelledError } from './errors';

export interface CapturedInput { pcm: Float32Array; fs: number; meta: InputMeta }
export interface CaptureOptions {
  onProgress: (phase: 'permission-pending' | 'warming-up' | 'recording', fraction: number) => void;
  signal: AbortSignal;
}

function captureError(error: unknown): Error {
  if (error instanceof AudioInputError || (error instanceof DOMException && error.name === 'AbortError')) return error;
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new AudioInputError('permission-denied', 'Microphone permission was denied. Choose a local file or demo, or allow microphone access in browser settings and retry.');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new AudioInputError('no-microphone', 'No microphone was found. Connect one, or choose a local file or demo.');
    case 'NotReadableError':
    case 'TrackStartError':
      return new AudioInputError('device-unreadable', 'The microphone could not be read. Close other apps using it, retry, or choose a local file or demo.');
    default:
      return new AudioInputError('capture-failed', 'Microphone capture could not start. Retry in a supported browser on HTTPS or localhost, or choose a local file or demo.');
  }
}

/** Invoke directly from a button gesture so creation/resume retain user activation. */
export async function startCapture({ onProgress, signal }: CaptureOptions): Promise<CapturedInput> {
  if (signal.aborted) throw cancelledError();
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new AudioInputError('secure-context-required', 'Microphone capture needs HTTPS or localhost. Open this app there, or choose a local file or demo.');
  }
  if (typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') {
    throw new AudioInputError('worklet-unavailable', 'This browser does not support the required audio recorder. Use a current browser, local WAV file, or demo.');
  }
  if (document.visibilityState === 'hidden') {
    throw new AudioInputError('incomplete', 'Keep the recording tab visible, then retry.');
  }

  let context: AudioContext | undefined;
  let stream: MediaStream | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let recorder: AudioWorkletNode | undefined;
  let silent: GainNode | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let finished = false;
  let graphActive = false;
  let interrupt: (reason: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => { interrupt = reject; });
  // Attach the rejection handler before permission or module loading can remain pending.
  const guarded = <T>(promise: Promise<T>) => abortable(Promise.race([promise, interrupted]), signal);
  const interruption = () => interrupt(new AudioInputError('incomplete', 'Recording was interrupted. Keep this tab visible and retry, or choose a local file or demo.'));
  const onVisibility = () => { if (document.visibilityState === 'hidden') interruption(); };
  const onPageHide = () => interruption();
  const onStateChange = () => { if (graphActive && context?.state !== 'running') interruption(); };
  const onTrackEnded = () => interruption();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  try {
    context = new AudioContext();
    if (!context.audioWorklet) {
      throw new AudioInputError('worklet-unavailable', 'This browser cannot create an audio recorder. Choose a local WAV file or demo.');
    }
    // Resume immediately, while this call still belongs to the user's button gesture.
    const resumed = context.resume();
    onProgress('permission-pending', 0);
    const supported = navigator.mediaDevices.getSupportedConstraints();
    const constraints: MediaTrackConstraints = { channelCount: { ideal: 1 } };
    if (supported.echoCancellation) constraints.echoCancellation = { ideal: false };
    if (supported.noiseSuppression) constraints.noiseSuppression = { ideal: false };
    if (supported.autoGainControl) constraints.autoGainControl = { ideal: false };
    const requestedStream = navigator.mediaDevices.getUserMedia({ audio: constraints, video: false }).then(value => {
      // getUserMedia has no abort API: a late grant must release the device too.
      if (finished || signal.aborted) value.getTracks().forEach(track => track.stop());
      else stream = value;
      return value;
    });
    const loaded = context.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-worklet.js`);
    await guarded(Promise.all([resumed, loaded, requestedStream]));
    if (signal.aborted) throw cancelledError();
    if (!stream) throw new AudioInputError('capture-failed', 'Microphone capture ended before it started. Retry, or choose a file or demo.');
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState === 'ended') throw new AudioInputError('no-microphone', 'No active microphone track was returned. Choose a local file or demo.');
    if (context.state !== 'running') await guarded(context.resume());
    if (context.state !== 'running') throw new AudioInputError('context-suspended', 'Audio recording is suspended. Retry from the recording button, or choose a file or demo.');

    const settings = filterDeviceSettings(track.getSettings());
    const qualityCodes: QualityCode[] = [];
    const processing = ['echoCancellation', 'noiseSuppression', 'autoGainControl'].map(key => settings[key]);
    if (processing.some(value => value === true)) qualityCodes.push('processing-active');
    if (processing.some(value => value !== true && value !== false)) qualityCodes.push('processing-unknown');
    const collector = new CaptureCollector(context.sampleRate);
    source = context.createMediaStreamSource(stream);
    recorder = new AudioWorkletNode(context, 'tonalwatch-capture', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'discrete',
    });
    silent = context.createGain();
    silent.gain.value = 0;
    track.addEventListener('ended', onTrackEnded);
    track.addEventListener('mute', onTrackEnded);
    context.addEventListener('statechange', onStateChange);
    const captured = new Promise<void>((resolve, reject) => {
      if (!recorder) return;
      recorder.onprocessorerror = () => reject(new AudioInputError('incomplete', 'The audio recorder stopped unexpectedly. Retry, or choose a file or demo.'));
      recorder.port.onmessage = (event: MessageEvent) => {
        if (finished) return;
        try {
          if (event.data?.type === 'interrupted') { interruption(); return; }
          if (event.data?.type !== 'chunk') return;
          collector.push(event.data);
          lastChunkAt = performance.now();
          onProgress(collector.warmingUp ? 'warming-up' : 'recording', collector.progress);
          if (collector.complete) resolve();
        } catch (error) { reject(error); }
      };
    });
    let lastChunkAt = performance.now();
    const captureStart = Date.now();
    onProgress('warming-up', 0);
    graphActive = true;
    source.connect(recorder);
    recorder.connect(silent);
    silent.connect(context.destination);
    watchdog = setInterval(() => { if (performance.now() - lastChunkAt > 2500) interruption(); }, 500);
    await guarded(captured);
    if (signal.aborted) throw cancelledError();
    return {
      pcm: collector.pcm, fs: context.sampleRate,
      meta: {
        inputKind: 'microphone', fixtureId: null,
        recordedAtUtc: new Date(captureStart + 500).toISOString(),
        channelPolicy: 'mono-capture', deviceSettings: settings, qualityCodes,
        inputLabel: 'Fresh microphone recording',
      },
    };
  } catch (error) {
    throw captureError(error);
  } finally {
    finished = true;
    graphActive = false;
    if (watchdog !== undefined) clearInterval(watchdog);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    context?.removeEventListener('statechange', onStateChange);
    stream?.getTracks().forEach(track => {
      track.removeEventListener('ended', onTrackEnded);
      track.removeEventListener('mute', onTrackEnded);
      track.stop();
    });
    if (recorder) {
      recorder.port.onmessage = null;
      recorder.onprocessorerror = null;
      recorder.port.close();
    }
    for (const node of [source, recorder, silent]) { try { node?.disconnect(); } catch { /* already disconnected */ } }
    if (context && context.state !== 'closed') { try { await context.close(); } catch { /* device already closed */ } }
  }
}
