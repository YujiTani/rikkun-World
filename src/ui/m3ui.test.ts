import { describe, expect, it } from 'vitest';
import { clockBackground, clockFace } from './clockModel';
import { DEATH_TEXT, DeathScreenModel, HOME_TEXT, lanternFacePixels } from './deathScreenModel';
import { HEART_CONFIG, HeartsModel, heartPixels, heartStates } from './heartsModel';
import { itemIconPixels, orbPixels } from './itemIcon';
import { MATERIAL_ITEMS, materialPixels } from './itemArt';
import { findUnrubiedKanji } from './text';

describe('ハート（AC20）', () => {
  it('体力 13 → 満タン 6・半分 1・から 3', () => {
    const s = heartStates(13);
    expect(s).toHaveLength(10);
    expect(s.filter((x) => x === 'full')).toHaveLength(6);
    expect(s.filter((x) => x === 'half')).toHaveLength(1);
    expect(s.filter((x) => x === 'empty')).toHaveLength(3);
    expect(s[6]).toBe('half');
  });
  it('20 は全部満タン、0 は全部から、範囲外はまるめる', () => {
    expect(heartStates(20).every((x) => x === 'full')).toBe(true);
    expect(heartStates(0).every((x) => x === 'empty')).toBe(true);
    expect(heartStates(99).every((x) => x === 'full')).toBe(true);
    expect(heartStates(-3).every((x) => x === 'empty')).toBe(true);
  });
  it('ドット絵は 16x16。半分は左半分だけ赤、からは灰色', () => {
    for (const st of ['full', 'half', 'empty'] as const) expect(heartPixels(st)).toHaveLength(256);
    const red = (px: readonly number[]) => px[0] === 0xe5 && px[1] === 0x39 && px[2] === 0x35;
    const half = heartPixels('half');
    // 4 行目（y = 5）の左と右
    expect(red(half[5 * 16 + 3])).toBe(true);
    expect(red(half[5 * 16 + 12])).toBe(false);
    expect(heartPixels('empty').some((p) => red(p))).toBe(false);
    expect(heartPixels('empty').some((p) => p[0] === 0x55 && p[1] === 0x55 && p[3] === 255)).toBe(true);
  });
});

describe('ハートの動き（§3.3）', () => {
  it('へったらはじけて列がぷるっ、0.4 秒で終わる', () => {
    const m = new HeartsModel();
    m.set(20, false);
    m.set(17, false);
    expect(m.cells[8].burstT).toBe(0);
    expect(m.cells[9].burstT).toBe(0);
    expect(m.cells[7].burstT).toBe(-1);
    expect(m.shakeT).toBe(0);
    m.update(0.39);
    expect(m.cells[9].burstT).toBeGreaterThan(0);
    m.update(0.02);
    expect(m.cells[9].burstT).toBe(-1);
    expect(m.shakeT).toBe(-1);
  });
  it('回復した1つは1.2倍までふくらんで戻る', () => {
    const m = new HeartsModel();
    m.set(20, false);
    m.set(15, false);
    m.update(1);
    m.set(16, false);
    const i = 7;
    expect(m.cells[i].popT).toBe(0);
    m.update(HEART_CONFIG.popSeconds / 2);
    expect(m.cellScale(i)).toBeCloseTo(1.2, 5);
    m.update(HEART_CONFIG.popSeconds);
    expect(m.cellScale(i)).toBe(1);
  });
  it('体力 3 以下のときだけ ぴょこぴょこ（1 秒に 1 回）', () => {
    const m = new HeartsModel();
    m.set(4, false);
    m.update(0.2);
    expect(m.cellOffsetY(0)).toBe(0);
    m.set(3, false);
    expect(m.low()).toBe(true);
    let hopped = false;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60);
      if (m.cellOffsetY(0) < 0) hopped = true;
    }
    expect(hopped).toBe(true);
    m.set(0, false);
    expect(m.low()).toBe(false);
  });
});

describe('時計のマーク', () => {
  it('ひる おひさま・よる おつきさま・ゆうがた／あさ は半分ずつ', () => {
    expect(clockFace('day')).toEqual({ left: 'sun', right: 'sun' });
    expect(clockFace('night')).toEqual({ left: 'moon', right: 'moon' });
    expect(clockFace('dusk')).toEqual({ left: 'sun', right: 'moon' });
    expect(clockFace('dawn')).toEqual({ left: 'moon', right: 'sun' });
    expect(clockBackground('day')).toBe('#FFE14D');
    expect(clockBackground('dusk')).toContain('linear-gradient');
  });
});

describe('やられた画面（§3.4）', () => {
  it('1 秒で白 0.6 まで、復活で 0.5 秒で消える', () => {
    const m = new DeathScreenModel();
    expect(m.white()).toBe(0);
    m.start();
    for (let i = 0; i < 30; i++) m.update(1 / 60);
    expect(m.white()).toBeCloseTo(0.3, 2);
    for (let i = 0; i < 90; i++) m.update(1 / 60);
    expect(m.white()).toBeCloseTo(0.6, 5);
    expect(m.showText()).toBe(true);
    m.end();
    expect(m.showText()).toBe(false);
    for (let i = 0; i < 15; i++) m.update(1 / 60);
    expect(m.white()).toBeCloseTo(0.3, 2);
    for (let i = 0; i < 20; i++) m.update(1 / 60);
    expect(m.white()).toBe(0);
    expect(m.active()).toBe(false);
  });
  it('文字はひらがな・カタカナだけ（漢字なし）', () => {
    expect(findUnrubiedKanji(DEATH_TEXT)).toEqual([]);
    expect(findUnrubiedKanji(HOME_TEXT)).toEqual([]);
  });
  it('ちょうちんの顔は 16x16', () => {
    expect(lanternFacePixels()).toHaveLength(256);
  });
});

describe('ようかいだま の絵（§3.6）', () => {
  it('16x16・むらさきの丸・白いつや・黒い目', () => {
    const p = orbPixels();
    expect(p).toHaveLength(256);
    expect(itemIconPixels('yokai_orb')).toEqual(p);
    const has = (r: number, g: number, b: number) => p.some((c) => c[0] === r && c[1] === g && c[2] === b && c[3] === 255);
    expect(has(0x9c, 0x6a, 0xde)).toBe(true);
    expect(has(255, 255, 255)).toBe(true);
    expect(has(0x11, 0x11, 0x11)).toBe(true);
    expect(p[0][3]).toBe(0);
  });
});

describe('材料のアイテムの絵', () => {
  it('7 つとも 16x16 で、ふちがあり、石の仮の絵ではない', () => {
    expect(MATERIAL_ITEMS).toEqual(['paper', 'oil', 'string', 'cloth', 'clay', 'crystal', 'sumi', 'hemp']); // TAKO-1: すみ・ROPE-1: あさ
    const seen = new Set<string>();
    for (const it of MATERIAL_ITEMS) {
      const p = materialPixels(it);
      expect(p).toHaveLength(256);
      expect(p.filter((c) => c[3] === 255).length).toBeGreaterThan(40);
      expect(itemIconPixels(it)).toEqual(p);
      seen.add(JSON.stringify(p));
    }
    expect(seen.size).toBe(MATERIAL_ITEMS.length); // ROPE-1: あさ で 8
  });
});

import { createTimeSettings } from '../time/config';
import { clockBodyPose } from './clockModel';

describe('時計の絵の動き', () => {
  it('東（右）からのぼり、昼にてっぺん、西（左）へ。夜はおつきさま', () => {
    const s = createTimeSettings();
    expect(clockBodyPose(0, s).x).toBeCloseTo(1);
    expect(clockBodyPose(29700, s).y).toBeCloseTo(1, 1);
    expect(clockBodyPose(59000, s).x).toBeLessThan(-0.9);
    expect(clockBodyPose(59000, s).body).toBe('sun');
    expect(clockBodyPose(65000, s).body).toBe('moon');
    expect(clockBodyPose(65000, s).x).not.toBeCloseTo(clockBodyPose(80000, s).x);
  });
});
