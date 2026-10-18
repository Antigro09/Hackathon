import type { QualityCode } from '../types';
import type { SoundHintLabel } from './labels';

export interface SoundHintRanking { label: SoundHintLabel; score: number }

export interface SoundHintResult {
  status: 'uncertain';
  reason: 'weak-separation' | 'not-validated';
  rankings: SoundHintRanking[];
  provisionalGatePassed: boolean;
  modelId: string;
  modelRevision: string;
  preprocessing: {
    originalSampleRateHz: number;
    originalSampleCount: number;
    observationSeconds: number;
    modelSampleRateHz: number;
    modelInputSamples: number;
    processorSeconds: number;
    padding: 'zero-pad';
    configuredPadding: 'repeatpad';
    featureBandHz: [number, number];
  };
  timing: { modelLoadMs: number; inferenceMs: number; totalMs: number; reusedModel: boolean };
}

export interface SoundHintsRequest {
  type: 'classify';
  sessionId: number;
  pcm: Float32Array;
  sampleRateHz: number;
  originalSampleRateHz: number;
  originalSampleCount: number;
  qualityCodes: QualityCode[];
}

export type SoundHintsResponse = {
  type: 'progress';
  sessionId: number;
  phase: 'loading' | 'inference';
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
} | {
  type: 'result';
  sessionId: number;
  result: SoundHintResult;
} | {
  type: 'error';
  sessionId: number;
  code: 'invalid-input' | 'unavailable' | 'runtime';
  message: string;
};
