import { useId } from 'react';
import type { InputMeterReading } from '../audio/meter';

const MIN_DB = -90;
const boundedLevel = (level: number) => Math.max(MIN_DB, Math.min(0, level));
const position = (level: number) => (boundedLevel(level) - MIN_DB) / -MIN_DB * 100;

export function InputMeter({ reading, active }: { reading: InputMeterReading | null; active: boolean }) {
  const captionId = useId();
  const current = active ? reading : null;
  const level = current?.levelDb ?? MIN_DB;
  const peakDb = current && current.peak > 0 ? 20 * Math.log10(current.peak) : MIN_DB;
  const nearLimit = current !== null && current.peak >= 0.98;
  const display = !active ? 'Microphone idle' : !current ? 'Waiting for samples' : current.levelDb === null
    ? 'Digital silence' : `${current.levelDb < MIN_DB ? '< −90' : current.levelDb.toFixed(1)} dB`;
  const valueText = !active ? 'Microphone inactive' : !current ? 'Waiting for microphone samples' : current.levelDb === null
    ? 'Digital silence; no measurable input' : `${current.levelDb.toFixed(1)} dB relative to RMS 1${current.clipped ? '; digital clipping detected' : nearLimit ? '; near the digital limit' : ''}`;

  return <div className={`input-meter${nearLimit ? ' input-meter--near-limit' : ''}`}>
    <div className="input-meter-heading"><strong>Live input</strong><span>{display}</span></div>
    <div className="input-meter-track" role="meter" aria-label="Live microphone digital input level"
      aria-valuemin={MIN_DB} aria-valuemax={0} aria-valuenow={boundedLevel(level)}
      aria-valuetext={valueText} aria-describedby={captionId}>
      <span className="input-meter-fill" style={{ width: `${current?.levelDb === null || !current ? 0 : position(level)}%` }}/>
      {current && current.peak > 0 && <span className="input-meter-peak" style={{ left: `${position(peakDb)}%` }}/>}
    </div>
    <div className="input-meter-scale" aria-hidden="true"><span>−90</span><span>−60</span><span>−30</span><span>0 dB</span></div>
    <p id={captionId} className="input-meter-caption">Unweighted digital RMS relative to RMS 1. The thin mark shows the peak. Preview only; not sound pressure.</p>
    {nearLimit && <p className="input-meter-warning" role="status">{current.clipped ? 'Digital clipping detected. Lower microphone gain and retry.' : 'Input is near the digital limit. Lower microphone gain if the recording distorts.'}</p>}
  </div>;
}
