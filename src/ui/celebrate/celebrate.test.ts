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

// WEAPON-7 §2.6 (1)・O8: 実績の おしらせは 画面の 上の 帯。止めない・ボタンなし・240 ステップで 自動で きえる。
// 前の「とじる」の テスト（M6 AC24: 59 では 閉じない・60 で 押せる／押して はなした ときだけ 閉じる／押せない 間の 押しは 無視）は
// 理由「O8 で とじる を なくした」で 消した。ModalModel の 窓口（仕様の 名前）: open・step（きえた ステップで 見せた id を 返す）・view（age・leftSteps）。
describe('実績の おしらせ（WEAPON-7 AC12b・O8）', () => {
  it('設定 achieveToastTicks = 240（出る 30・きえる 30 を ふくむ）', () => {
    expect((defaultCelebrateSettings() as unknown as Record<string, number>).achieveToastTicks).toBe(240);
  });
  it('出た ステップから 240 ステップで きえる（leftSteps 240 → 0）。きえた ステップで 見せた id を 返す', () => {
    const m = new ModalModel(cfg);
    expect(m.open(show(2))).toBe(true);
    const v0 = m.view([]) as unknown as { open: boolean; age: number; leftSteps: number };
    expect(v0.open).toBe(true);
    expect(v0.age).toBe(0);
    expect(v0.leftSteps).toBe(240);
    for (let i = 0; i < 239; i++) expect(m.step() as unknown, `${i + 1}`).toBeFalsy();
    const v239 = m.view([]) as unknown as { leftSteps: number };
    expect(v239.leftSteps).toBe(1);
    expect(m.isOpen()).toBe(true);
    expect(m.step() as unknown).toEqual(['a0', 'a1']);
    expect(m.isOpen()).toBe(false);
    expect((m.view([]) as unknown as { open: boolean }).open).toBe(false);
  });
  it('ボタンは ない: buttonEnabled はいつも false・waitLeft は いつも 0・press / buttonDown / pointerUp は ない', () => {
    const m = new ModalModel(cfg) as unknown as Record<string, unknown> & ModalModel;
    m.open(show(1));
    for (let i = 0; i < 240; i++) {
      const v = m.view([]);
      expect(v.buttonEnabled).toBe(false);
      expect(v.waitLeft).toBe(0);
      m.step();
    }
    expect(m.press).toBeUndefined();
    expect(m.buttonDown).toBeUndefined();
    expect(m.pointerUp).toBeUndefined();
  });
  it('のこりは「ほか N こ」だけ（行の 一覧は 出さない）。出ている 間は 次を 出せない（AC23 の 直し）', () => {
    const m = new ModalModel(cfg);
    m.open(show(3));
    const v = m.view([]) as unknown as { more: number; mainId: string; rows?: number };
    expect(v.mainId).toBe('a0');
    expect(v.more).toBe(2);
    expect(v.rows ?? 0).toBe(0);
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
