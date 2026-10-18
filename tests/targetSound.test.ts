import { describe, expect, it } from 'vitest';
import { assessTargetSound, type TargetSoundWindow } from '../src/ai/targetSound';

const windows = (...families: TargetSoundWindow['family'][]): TargetSoundWindow[] => families.map((family, index) => ({
  startSeconds: index * 5, endSeconds: (index + 1) * 5, family,
}));

describe('equipment-noise target guidance from accepted broad families', () => {
  it('prioritizes possible talking anywhere, including the last window after cooling-like sound', () => {
    const scan = windows('mechanical_fan', 'mechanical_fan', 'speech');
    const before = structuredClone(scan);
    expect(assessTargetSound(scan)).toMatchObject({ status: 'retake',
      label: 'Possible talking — retake for equipment noise', mixedFamilies: true, unclearWindows: 0 });
    expect(scan).toEqual(before);
  });

  it('lets the separate speech screen override all-fan resemblance while preserving other interference', () => {
    const fan = assessTargetSound(windows('mechanical_fan', 'mechanical_fan', 'mechanical_fan'), true);
    expect(fan).toMatchObject({ status: 'retake', speechScreenDetected: true, competingFamilies: ['speech'] });
    expect(fan.summary).toContain('separate speech screen');
    expect(assessTargetSound(windows('speech', 'traffic', 'wind'), true).competingFamilies).toEqual(['speech', 'wind', 'traffic']);
  });

  it('never upgrades unexplained or mixed audio when the separate speech screen flags nothing', () => {
    expect(assessTargetSound(windows('mechanical_fan', null, 'mechanical_fan'), false).status).toBe('unclear');
    expect(assessTargetSound(windows('mechanical_fan', 'buzz', 'mechanical_fan'), false).status).toBe('unclear');
    expect(assessTargetSound(windows(null, null, null), false).status).toBe('unclear');
    expect(assessTargetSound(windows('traffic'), false).status).toBe('interference');
  });

  it.each(['wind', 'traffic'] as const)('reports %s interference even when another window resembles cooling', family => {
    expect(assessTargetSound(windows('mechanical_fan', family, null))).toMatchObject({
      status: 'interference', unclearWindows: 1, mixedFamilies: true,
    });
  });

  it('keeps fan-like audio with unexplained or different intervals unclear', () => {
    const check = assessTargetSound(windows('mechanical_fan', null, 'buzz'));
    expect(check).toMatchObject({ status: 'unclear', unclearWindows: 1, mixedFamilies: true });
    expect(check.summary).toContain('competing sounds');
    expect(assessTargetSound(windows('mechanical_fan', 'mechanical_fan', null)).status).toBe('unclear');
    expect(assessTargetSound(windows('mechanical_fan', 'mechanical_fan', 'buzz')).status).toBe('unclear');
  });

  it('requires fan-like agreement throughout for cautious relevance, without claiming accuracy', () => {
    const check = assessTargetSound(windows('mechanical_fan', 'mechanical_fan', 'mechanical_fan'));
    expect(check).toMatchObject({ status: 'potentially-relevant', unclearWindows: 0, mixedFamilies: false });
    expect(check.summary).toContain('other HVAC, fans and machinery');
    expect(check.summary).toContain('does not identify a data-center source');
    expect(check.summary).toContain('competing sounds can be missed');
    expect(check.summary).toContain('or confirm an accurate recording');
  });

  it('does not turn insect-inclusive buzz or total abstention into equipment identification or quiet', () => {
    const buzz = assessTargetSound(windows('buzz'));
    expect(buzz.status).toBe('unclear');
    expect(buzz.summary).toContain('insect recordings');
    const unknown = assessTargetSound(windows(null, null, null));
    expect(unknown).toMatchObject({ status: 'unclear', unclearWindows: 3, mixedFamilies: false });
    expect(unknown.summary).toContain('does not establish quiet or the absence of equipment noise');
  });

  it('requires a complete ordered scan instead of accepting partial or overlapping timelines', () => {
    for (const scan of [[], windows('speech', 'mechanical_fan'),
      [{ startSeconds: 1, endSeconds: 6, family: 'speech' }],
      [{ startSeconds: 0, endSeconds: 4, family: 'speech' }],
      [{ startSeconds: 0, endSeconds: 5, family: 'data_center' }]]) {
      expect(() => assessTargetSound(scan as TargetSoundWindow[])).toThrow('complete ordered');
    }
  });
});
