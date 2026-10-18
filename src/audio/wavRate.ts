/** A bounded container hint, not a WAV codec or a format-validity decision.
 * Keep the existing tested 44.1/48 kHz analysis contract. Other containers,
 * ambiguous headers and unsupported rates use the disclosed browser default.
 */
export function wavSampleRateHint(encoded: ArrayBuffer): 44100 | 48000 | null {
  if (encoded.byteLength < 12) return null;
  const view = new DataView(encoded);
  if (view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57415645) return null; // RIFF / WAVE
  const end = 8 + view.getUint32(4, true);
  if (end < 12 || end > encoded.byteLength) return null;
  let offset = 12;
  let rate: 44100 | 48000 | null = null;
  let foundFormat = false;
  // At most 4096 chunks are inspected, even for adversarial zero-size chunks.
  for (let chunk = 0; offset < end && chunk < 4096; chunk += 1) {
    if (offset + 8 > end) return null;
    const size = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    const next = payload + size + (size % 2);
    if (next > end) return null;
    if (view.getUint32(offset) === 0x666d7420) { // fmt followed by a space
      if (foundFormat || size < 16) return null;
      foundFormat = true;
      const sampleRate = view.getUint32(payload + 4, true);
      if (sampleRate !== 44100 && sampleRate !== 48000) return null;
      rate = sampleRate;
    }
    offset = next;
  }
  return offset === end ? rate : null;
}
