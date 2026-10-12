import { describe, expect, it } from 'vitest';
import { createTimeSettings } from '../time/config';
import { clockScenePixels } from './clockArt';
import { CLOCK_SCENES, CLOCK_WORDS, clockScene } from './clockModel';

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
});
