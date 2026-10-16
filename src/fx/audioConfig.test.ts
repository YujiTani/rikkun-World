import { describe, expect, it } from 'vitest';
import { createAudioSettings } from './audioConfig';

describe('AudioSettings', () => {
  it('はじめの値（SOUND.md §2・§3）', () => {
    expect(createAudioSettings()).toEqual({
      masterVolume: 0.6,
      bgmVolume: 0.4,
      audioMuted: false,
      battleRange: 16,
      battleEnterTicks: 30,
      battleExitTicks: 240,
    });
  });
  it('毎回 新しいコピー', () => {
    const a = createAudioSettings();
    a.masterVolume = 0.1;
    expect(createAudioSettings().masterVolume).toBe(0.6);
  });
});
