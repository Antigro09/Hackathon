import type { AnalysisRequest, AnalysisResponse } from '../types';
import { analyzePcm } from './engine';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage: (message: AnalysisResponse) => void;
};

workerScope.onmessage = (event) => {
  const { sessionId, pcm, fs, meta } = event.data;
  try {
    workerScope.postMessage({ sessionId, result: analyzePcm(pcm, fs, meta) });
  } catch (error) {
    workerScope.postMessage({ sessionId, error: error instanceof Error ? error.message : 'Audio analysis failed. Please retry or choose another input.' });
  }
};
