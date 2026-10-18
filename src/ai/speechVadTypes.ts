export interface SpeechVadInterval { startSeconds: number; endSeconds: number }

export interface SpeechVadProgress {
  phase: 'loading' | 'self-test' | 'analyzing';
  completedFrames: number;
  totalFrames: number;
}

/** A possible-speech screen, never a claim that the source or recording is accurate. */
export interface SpeechVadResult {
  speechDetected: boolean;
  intervals: SpeechVadInterval[];
  captureDurationSeconds: number;
  frameCount: number;
  coverage: 'full-recording';
  sampleRateHz: 16000;
  modelId: 'snakers4/silero-vad';
  modelRevision: string;
  modelSha256: string;
  policyVersion: 'tw-speech-interference-v1';
  selfTestPassed: true;
}

export interface SpeechVadOptions {
  signal?: AbortSignal;
  onProgress?: (value: SpeechVadProgress) => void;
}

export interface SpeechVadRequest {
  type: 'scan';
  requestId: string;
  pcm: Float32Array;
  sampleRateHz: number;
}

export type SpeechVadResponse =
  | { type: 'progress'; requestId: string; progress: SpeechVadProgress }
  | { type: 'result'; requestId: string; result: SpeechVadResult }
  | { type: 'error'; requestId: string; code: string; message: string };
