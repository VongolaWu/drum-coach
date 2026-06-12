export const rhythmOptions = [
  { value: '4', label: '四分音符' },
  { value: '8', label: '八分音符' },
  { value: '16', label: '十六分音符' },
  { value: '3', label: '三连音' },
  { value: '8_16_16', label: '前八后十六' },
  { value: 'rest', label: '休止' }
];

export const judgementProfiles = {
  easy: { perfectMs: 30, goodMs: 60, missMs: 240, label: '新手宽松' },
  normal: { perfectMs: 15, goodMs: 35, missMs: 180, label: '标准' },
  strict: { perfectMs: 10, goodMs: 22, missMs: 120, label: '严格' }
};
