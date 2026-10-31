import { describe, expect, it } from 'vitest';
import type { WindowCell } from '../editor/model';
import { GlowCtl, cueLevel, hoverWave } from './glow';
import { GLOW, PREVIEW } from './tuning';

/** HOUSE-1B PR-2（AC56）: 窓・戸の 光りの 時間。1 コマ ＝ 1/60 秒 */

const all: WindowCell[] = [{ wall: 'back', i: 2 }, { wall: 'left', i: 2 }];
const run = (g: GlowCtl, n: number): number => {
  let ended = 0;
  for (let i = 0; i < n; i++) if (g.step()) ended++;
  return ended;
};

describe('光り 1 回（cue）', () => {
  it('窓を かえた 光り: left は 90 から へって 90 コマ目に 0 ＝ おわり（glow null）', () => {
    const g = new GlowCtl();
    expect(g.info(all)).toBeNull();
    g.startWindows([{ wall: 'back', i: 2 }], 24);
    expect(g.info(all)).toEqual({ door: false, cells: [{ wall: 'back', i: 2 }], left: 90 });
    expect(g.freezing).toBe(true);
    run(g, 60);
    expect(g.info(all)!.left).toBe(30);
    expect(run(g, 29)).toBe(0);
    expect(g.info(all)!.left).toBe(1);
    expect(run(g, 1)).toBe(1);
    expect(g.info(all)).toBeNull();
    expect(g.freezing).toBe(false);
    expect(run(g, 100)).toBe(0);
  });

  it('戸の 光り: door true・cells 空・90 コマ。見本の 自動の 回りは 止めない（freezing false）', () => {
    const g = new GlowCtl();
    g.startDoor();
    expect(g.info(all)).toEqual({ door: true, cells: [], left: 90 });
    expect(g.freezing).toBe(false);
    expect(g.cueing).toBe(true);
    expect(run(g, 90)).toBe(1);
    expect(g.info(all)).toBeNull();
  });

  it('光って いる 間に 新しい 光りを はじめると 90 から やりなおす', () => {
    const g = new GlowCtl();
    g.startDoor();
    run(g, 50);
    g.startWindows([{ wall: 'left', i: 2 }], 24);
    expect(g.info(all)).toMatchObject({ door: false, left: 90 });
    expect(run(g, 90)).toBe(1);
  });

  it('つよさ: まつ 間・おわった あと 0。まん中で ふくらみ、はじめと おわりは 0 に ちかい', () => {
    expect(cueLevel(0, 24, false)).toBe(0);
    expect(cueLevel(23, 24, false)).toBe(0);
    expect(cueLevel(24, 24, false)).toBe(0);
    const mid = cueLevel(24 + 20, 24, true);
    expect(mid).toBeGreaterThan(0.95);
    expect(cueLevel(PREVIEW.glowFrames, 24, true)).toBeCloseTo(0, 9);
    expect(cueLevel(PREVIEW.glowFrames + 1, 24, true)).toBe(0);
    for (let t = 0; t <= PREVIEW.glowFrames; t++) {
      const v = cueLevel(t, 0, false);
      expect(v, `${t}`).toBeGreaterThanOrEqual(0);
      expect(v, `${t}`).toBeLessThanOrEqual(1);
    }
  });

  it('動きを へらす 設定では ゆらがない（まん中は 1）', () => {
    expect(cueLevel(45, 0, true)).toBeCloseTo(1, 9);
    expect(cueLevel(45, 0, false)).toBeLessThan(1);
    expect(hoverWave(10, true)).toBeCloseTo(GLOW.hoverLevel, 9);
    expect(hoverWave(36, false)).toBeLessThan(GLOW.hoverLevel);
  });
});

describe('ボタンに 手を おく（hover）', () => {
  it('おいて いる 間 窓 ぜんぶ・left null。はなすと null。同じ 向きに もう 1 回 ならなければ false', () => {
    const g = new GlowCtl();
    expect(g.setHover(true)).toBe(true);
    expect(g.setHover(true)).toBe(false);
    expect(g.info(all)).toEqual({ door: false, cells: all, left: null });
    expect(g.freezing).toBe(false);
    run(g, 600);
    expect(g.info(all)).toEqual({ door: false, cells: all, left: null });
    expect(g.setHover(false)).toBe(true);
    expect(g.info(all)).toBeNull();
    expect(g.setHover(false)).toBe(false);
  });

  it('光り 1 回が あるうちは そちらが さき。おわると hover に もどる', () => {
    const g = new GlowCtl();
    g.setHover(true);
    g.startWindows([{ wall: 'back', i: 2 }], 24);
    expect(g.info(all)).toMatchObject({ left: 90, cells: [{ wall: 'back', i: 2 }] });
    run(g, 90);
    expect(g.info(all)).toEqual({ door: false, cells: all, left: null });
  });

  it('つよさ: ふえて（6 コマ）、はなすと 24 コマで 0 に もどる', () => {
    const g = new GlowCtl();
    expect(g.hoverNow(true)).toBe(0);
    g.setHover(true);
    run(g, 6);
    expect(g.hoverNow(true)).toBeCloseTo(GLOW.hoverLevel, 9);
    g.setHover(false);
    run(g, 12);
    expect(g.hoverNow(true)).toBeCloseTo(GLOW.hoverLevel * 0.5, 6);
    run(g, 12);
    expect(g.hoverNow(true)).toBe(0);
  });
});

describe('clear', () => {
  it('光り 1 回も hover も すぐ 消す', () => {
    const g = new GlowCtl();
    g.setHover(true);
    g.startDoor();
    run(g, 10);
    g.clear();
    expect(g.info(all)).toBeNull();
    expect(g.hovering).toBe(false);
    expect(g.hoverNow(false)).toBe(0);
    expect(g.cueNow(false)).toBe(0);
  });
});
