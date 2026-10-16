import { describe, expect, it } from 'vitest';
import { createTimeSettings } from '../time/config';
import { clockScenePixels } from './clockArt';
import { CLOCK_FADE_MAX_STEPS, CLOCK_SCENES, CLOCK_WORDS, clockScene, clockShouldFade } from './clockModel';

describe('時計の絵 6 つ（M6-clock）', () => {
  const s = createTimeSettings();
  it('境目: ひる 40%・70%、ゆうがた、よる、夜明け', () => {
    const d = s.dayTicks;
    expect(clockScene(0, s)).toBe('morning');
    expect(clockScene(Math.ceil(d * 0.4) - 1, s)).toBe('morning');
    expect(clockScene(Math.ceil(d * 0.4), s)).toBe('noon');
    expect(clockScene(Math.ceil(d * 0.7) - 1, s)).toBe('noon');
    expect(clockScene(Math.ceil(d * 0.7), s)).toBe('afternoon');
    expect(clockScene(d - 1, s)).toBe('afternoon');
    expect(clockScene(d, s)).toBe('sunset');
    expect(clockScene(d + s.duskTicks, s)).toBe('night');
    expect(clockScene(d + s.duskTicks + s.nightTicks, s)).toBe('sunrise');
    expect(clockScene(d + s.duskTicks + s.nightTicks + s.dawnTicks - 1, s)).toBe('sunrise');
  });
  it('ことばは ひらがな 6 つ、絵は 6 つともちがう', () => {
    expect(CLOCK_SCENES.map((c) => CLOCK_WORDS[c])).toEqual(['ひので', 'あさ', 'おひる', 'ゆうやけ', 'ひのいり', 'よる']);
    expect(new Set(CLOCK_SCENES.map((c) => JSON.stringify(clockScenePixels(c)))).size).toBe(6);
  });
  it('ひので は明るく、ひのいり は暗い（平均の明るさがはっきりちがう）', () => {
    const mean = (c: Parameters<typeof clockScenePixels>[0]) => {
      const px = clockScenePixels(c);
      return px.reduce((a, p) => a + 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2], 0) / px.length;
    };
    expect(mean('sunrise')).toBeGreaterThan(mean('sunset') + 60);
  });
});

describe('時計の入れかえ: ふわっとするか すぐか（#129）', () => {
  const s = createTimeSettings();
  const len = s.dayTicks + s.duskTicks + s.nightTicks + s.dawnTicks;
  it('ふつうの進み（差 1・60）は ふわっ', () => {
    expect(CLOCK_FADE_MAX_STEPS).toBe(60);
    expect(clockShouldFade(1000, 1001, s)).toBe(true);
    expect(clockShouldFade(1000, 1000 + 60, s)).toBe(true);
  });
  it('61・大きくとぶ・もどる・最初は すぐ', () => {
    expect(clockShouldFade(1000, 1061, s)).toBe(false);
    expect(clockShouldFade(1000, 40000, s)).toBe(false);
    expect(clockShouldFade(40000, 1000, s)).toBe(false);
    expect(clockShouldFade(null, 1000, s)).toBe(false);
  });
  it('夜明けの最後 → 0 の回りこみは ふわっ', () => {
    expect(clockShouldFade(len - 1, 0, s)).toBe(true);
    expect(clockShouldFade(len - 10, 5, s)).toBe(true);
  });
});
