import { describe, expect, it } from 'vitest';
import { BannerModel, starLights } from './bannerModel';
import { ComboModel } from './comboModel';
import { defaultCelebrateSettings, flashPeriods, flashPerSecond } from './config';
import { ModalModel } from './modalModel';
import { poyonScale, SparkPool } from './sparkModel';
import { CRAFT_SOUNDS } from '../../fx/craftSounds';

const cfg = () => defaultCelebrateSettings();
const show = (n: number) => ({ ids: Array.from({ length: n }, (_, i) => `a${i}`), mainId: 'a0', more: 0 });

describe('横断幕', () => {
  it('入場 36・退場 150・消える 180（AC11）', () => {
    const b = new BannerModel(cfg);
    expect(b.enqueue('bokuto', 'bokuto', 'craft')).toBe('shown');
    expect(b.info()?.phase).toBe('in');
    for (let i = 0; i < 36; i++) b.step(1);
    const i36 = b.info()!;
    expect(i36.phase).toBe('stay');
    expect(i36.rotationDeg).toBeCloseTo(720, 0);
    expect(i36.scale).toBeCloseTo(1, 1);
    for (let i = 36; i < 150; i++) b.step(1);
    expect(b.info()?.phase).toBe('out');
    for (let i = 150; i < 180; i++) b.step(1);
    expect(b.info()).toBeNull();
  });
  it('もちもの画面（4 倍）では 45 ステップで消える（AC12）', () => {
    const b = new BannerModel(cfg);
    b.enqueue('a', 'a', 'craft');
    for (let i = 0; i < 44; i++) b.step(4);
    expect(b.showing()).toBe(true);
    b.step(4);
    expect(b.showing()).toBe(false);
  });
  it('じゅんばん: 2 こまで待ち、4 こ目は出さない（AC13）', () => {
    const b = new BannerModel(cfg);
    expect(b.enqueue('a', 'a', 'craft')).toBe('shown');
    expect(b.enqueue('b', 'b', 'craft')).toBe('queued');
    expect(b.enqueue('c', 'c', 'craft')).toBe('queued');
    expect(b.enqueue('d', 'd', 'craft')).toBe('dropped');
    expect(b.queue()).toEqual(['b', 'c']);
    for (let i = 0; i < 180; i++) b.step(1);
    expect(b.info()?.recipe).toBe('b');
  });
  it('ファンファーレは 36 で 1 回', () => {
    const b = new BannerModel(cfg);
    b.enqueue('a', 'a', 'craft');
    let n = 0;
    for (let i = 0; i < 180; i++) n += b.step(1).filter((e) => e.type === 'fanfare').length;
    expect(n).toBe(1);
  });
  it('点滅のきまり: 光の間は 24 以上・星は 1 秒に 3 回未満（AC15）', () => {
    expect(Math.min(...flashPeriods())).toBeGreaterThanOrEqual(24);
    expect(flashPerSecond()).toBeLessThan(3);
    // 2 組は交互
    const l = starLights(10, true);
    expect(l[0] > 0 && l[1] === 0).toBe(true);
  });
});

describe('コンボ', () => {
  it('60 ステップおきで 1・2・3、121 あけると 1、上限 8（AC14）', () => {
    const c = new ComboModel(cfg);
    const seq: number[] = [];
    for (let i = 0; i < 3; i++) {
      seq.push(c.made());
      for (let k = 0; k < 60; k++) c.step(1);
    }
    expect(seq).toEqual([1, 2, 3]);
    for (let k = 0; k < 121; k++) c.step(1);
    expect(c.made()).toBe(1);
    let last = 0;
    for (let i = 0; i < 10; i++) last = c.made();
    expect(last).toBe(8);
    expect(ComboModel.pitch(8)).toBe(7);
    expect(ComboModel.sparkCount(8)).toBe(26);
    c.failed();
    expect(c.combo()).toBe(0);
  });
});

describe('おめでとう画面', () => {
  it('59 では閉じない・60 で押せる（AC24）', () => {
    const m = new ModalModel(cfg);
    m.open(show(2));
    for (let i = 0; i < 59; i++) m.step();
    expect(m.press().result).toEqual({ ok: false, reason: 'notYet' });
    expect(m.step()).toBe(true);
    expect(m.buttonEnabled()).toBe(true);
    expect(m.press().result.ok).toBe(true);
    expect(m.press().result.reason).toBe('notOpen');
  });
  it('押して はなした ときだけ閉じる', () => {
    const m = new ModalModel(cfg);
    m.open(show(2));
    for (let i = 0; i < 60; i++) m.step();
    expect(m.pointerUp(true)).toBeNull(); // 出る前から押していた
    m.buttonDown();
    expect(m.pointerUp(false)).toBeNull();
    m.buttonDown();
    expect(m.pointerUp(true)).toEqual(['a0', 'a1']);
  });
  it('押せない間の押しは 無視', () => {
    const m = new ModalModel(cfg);
    m.open(show(1));
    m.buttonDown();
    for (let i = 0; i < 60; i++) m.step();
    expect(m.pointerUp(true)).toBeNull();
  });
  it('7 こ → 行 5・ほか 1（AC23）', () => {
    const m = new ModalModel(cfg);
    m.open(show(7));
    const v = m.view([]);
    expect(v.rows).toBe(5);
    expect(v.more).toBe(1);
    expect(m.open(show(1))).toBe(false);
  });
});

describe('つぶ・音', () => {
  it('つぶは 上限つきで消える', () => {
    const p = new SparkPool(30);
    expect(p.burst(0, 0, 26)).toBe(26);
    expect(p.active()).toBe(26);
    p.step(30);
    expect(p.active()).toBe(0);
  });
  it('ぽよんの形', () => {
    expect(poyonScale(0.4)).toBeCloseTo(1.3);
    expect(poyonScale(0.7)).toBeCloseTo(0.95);
    expect(poyonScale(1)).toBe(1);
  });
  it('チャイムは ★ の数だけ', () => {
    expect(CRAFT_SOUNDS.chime1).toHaveLength(1);
    expect(CRAFT_SOUNDS.chime4).toHaveLength(4);
  });
});
