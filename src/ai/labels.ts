// Keep this comparison set fixed: changing alternatives changes relative CLAP scores.
export const SOUND_HINT_LABELS = [
  'a buzzing indoor fluorescent light fixture or lamp ballast',
  'an outdoor electrical transformer humming',
  'outdoor industrial ventilation fans or cooling machinery humming',
  'a household fan or air conditioner running',
  'road traffic passing outside',
  'wind blowing across a microphone',
  'people talking in a room',
  'a quiet room with background noise',
] as const;

export type SoundHintLabel = typeof SOUND_HINT_LABELS[number];

export const SOUND_HINT_DISPLAY_LABELS: Record<SoundHintLabel, string> = {
  [SOUND_HINT_LABELS[0]]: 'Indoor light-fixture buzz',
  [SOUND_HINT_LABELS[1]]: 'Electrical transformer hum',
  [SOUND_HINT_LABELS[2]]: 'Outdoor ventilation or cooling machinery',
  [SOUND_HINT_LABELS[3]]: 'Household fan or air conditioner',
  [SOUND_HINT_LABELS[4]]: 'Passing road traffic',
  [SOUND_HINT_LABELS[5]]: 'Wind across a microphone',
  [SOUND_HINT_LABELS[6]]: 'People talking',
  [SOUND_HINT_LABELS[7]]: 'Quiet background noise',
};
