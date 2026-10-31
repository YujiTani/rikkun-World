import { describe, expect, it } from 'vitest';
import { TopBandModel, bandEase } from './bandModel';
import { defaultCelebrateSettings } from './config';

const cfg = () => defaultCelebrateSettings();
const show = { ids: ['a0'], mainId: 'a0', more: 0 };

/** WEAPON-7 §2.6 (2)(3): テロップ 300 ステップ・実績より 先・あらわれたの あとに */
describe('上の 帯（テロップ）', () => {
  it('設定 legendTelopTicks = 300。出した ステップに telop・300 ステップで きえる', () => {
    expect(cfg().legendTelopTicks).toBe(300);
    const b = new TopBandModel(cfg);
    b.enqueueTelop('raijin_ken');
    expect(b.step(1, false).telopStarted).toBe('raijin_ken');
    expect(b.info(null)).toMatchObject({ kind: 'telop', item: 'raijin_ken', leftSteps: 299 });
    for (let i = 0; i < 298; i++) b.step(1, false);
    expect(b.info(null).kind).toBe('telop');
    b.step(1, false);
    expect(b.info(null).kind).toBeNull();
  });

  it('あらわれた が 出ている 間は 始まらない・進まない（列に 入る）。おわったら 始まる', () => {
    const b = new TopBandModel(cfg);
    b.enqueueTelop('raijin_ken');
    for (let i = 0; i < 50; i++) expect(b.step(1, true).telopStarted).toBeNull();
    expect(b.info({ ticksLeft: 130 })).toMatchObject({ kind: 'appear', leftSteps: 130, queue: ['telop'] });
    expect(b.step(1, false).telopStarted).toBe('raijin_ken');
    expect(b.info(null).leftSteps).toBeGreaterThan(290);
  });

  it('テロップは 待っている 実績より 先。出ている 実績は きえるまで 待つ', () => {
    const b = new TopBandModel(cfg);
    b.enqueueTelop('raijin_ken');
    expect(b.canOpenToast(false)).toBe(false); // 待っている テロップが ある
    b.step(1, false);
    expect(b.canOpenToast(false)).toBe(false); // テロップが 出ている
    for (let i = 0; i < 299; i++) b.step(1, false);
    expect(b.canOpenToast(false)).toBe(true);
    expect(b.canOpenToast(true)).toBe(false); // あらわれた が 出ている
    b.toast.open(show);
    b.enqueueTelop('raijin_ken');
    expect(b.step(1, false).telopStarted).toBeNull(); // 実績が 出ている 間は 重ねない
    expect(b.info(null).kind).toBe('achieve');
    let ended: string[] | null = null;
    for (let i = 0; i < 239; i++) ended = b.step(1, false).toastEnded ?? ended;
    expect(ended).toEqual(['a0']);
    expect(b.step(1, false).telopStarted).toBe('raijin_ken');
  });

  it('実績の おしらせは 240 ステップ。あらわれた の 間は 止まる', () => {
    const b = new TopBandModel(cfg);
    b.toast.open(show);
    for (let i = 0; i < 30; i++) b.step(1, true);
    expect(b.info(null).leftSteps).toBe(240);
    expect(b.info({ ticksLeft: 5 }).queue).toEqual(['achieve']);
  });

  it('preempt で 出ている テロップと 待ちを すてる', () => {
    const b = new TopBandModel(cfg);
    b.enqueueTelop('raijin_ken');
    b.step(1, false);
    b.enqueueTelop('raijin_ken');
    b.preempt();
    expect(b.canOpenToast(false)).toBe(true);
    expect(b.info(null).kind).toBeNull();
  });

  it('出入りは なめらか（点滅しない）: 出る・見せる・きえる', () => {
    expect(bandEase(0, 300, 36, 30).opacity).toBe(0);
    expect(bandEase(36, 300, 36, 30).opacity).toBe(1);
    expect(bandEase(150, 300, 36, 30).opacity).toBe(1);
    expect(bandEase(285, 300, 36, 30).opacity).toBeCloseTo(0.875, 1);
    expect(bandEase(300, 300, 36, 30).opacity).toBe(0);
  });
});

/** HOUSE-1 §3.3・AC26: 家の 名前の 帯は 180 ステップ。実績・テロップと 重ならず 上の 帯の 列に ならぶ */
describe('上の 帯（家の 名前）', () => {
  it('何も 出ていなければ すぐ 出る。180 ステップで きえる（のこりは 179 から 1 ずつ）', () => {
    const b = new TopBandModel(cfg);
    expect(b.houseLook()).toBeNull();
    b.enqueueHouseName('ひみつきち');
    expect(b.houseLook(), '列で 待っている 間は 出はじめの 数').toEqual({ text: 'ひみつきち', ticksLeft: 180 });
    expect(b.step(1, false).houseStarted).toBe('ひみつきち');
    expect(b.houseLook()).toEqual({ text: 'ひみつきち', ticksLeft: 179 });
    expect(b.info(null)).toMatchObject({ kind: 'house', leftSteps: 179 });
    expect(b.ease()?.kind).toBe('house');
    for (let left = 178; left >= 1; left--) {
      b.step(1, false);
      expect(b.houseLook()?.ticksLeft).toBe(left);
    }
    b.step(1, false);
    expect(b.houseLook()).toBeNull();
    expect(b.info(null).kind).toBeNull();
    expect(b.ease()).toBeNull();
  });

  it('テロップが 出ている／待っている 間は ならんで 待つ。テロップが おわってから 出る（重ならない）', () => {
    const b = new TopBandModel(cfg);
    b.enqueueTelop('raijin_ken');
    b.enqueueHouseName('ひみつきち');
    expect(b.step(1, false)).toMatchObject({ telopStarted: 'raijin_ken', houseStarted: null });
    for (let i = 0; i < 298; i++) expect(b.step(1, false).houseStarted).toBeNull();
    expect(b.info(null).kind).toBe('telop');
    expect(b.step(1, false).houseStarted, 'テロップが きえた しゅんかんは まだ').toBeNull();
    expect(b.step(1, false).houseStarted).toBe('ひみつきち');
  });

  it('実績の おしらせが 出ている 間も ならんで 待つ。名前の 帯が 出ている 間は 実績・テロップは 始まらない', () => {
    const b = new TopBandModel(cfg);
    b.toast.open(show);
    b.enqueueHouseName('ひみつきち');
    for (let i = 0; i < 239; i++) expect(b.step(1, false).houseStarted).toBeNull();
    expect(b.step(1, false).toastEnded).toEqual(['a0']);
    expect(b.step(1, false).houseStarted).toBe('ひみつきち');
    expect(b.canOpenToast(false), '名前の 帯が 出ている').toBe(false);
    b.enqueueTelop('raijin_ken');
    for (let i = 0; i < 100; i++) expect(b.step(1, false).telopStarted).toBeNull();
    expect(b.info(null).queue).toEqual(['telop']);
    // 名前の 帯は 始まった ステップで 1 進んで いる ので、のこり 180 − 101 = 79 ステップ あと、おわった 次の ステップで テロップ
    for (let i = 0; i < 79; i++) expect(b.step(1, false).telopStarted).toBeNull();
    expect(b.info(null).kind, '名前の 帯が おわった').toBeNull();
    expect(b.step(1, false).telopStarted, '名前の 帯が おわって から').toBe('raijin_ken');
  });

  it('あらわれた の 間は 始まらない。案内画面（amount 0）でも 進まない。preempt で すてる', () => {
    const b = new TopBandModel(cfg);
    b.enqueueHouseName('あ');
    for (let i = 0; i < 20; i++) expect(b.step(1, true).houseStarted).toBeNull();
    expect(b.info({ ticksLeft: 50 }).queue).toEqual(['house']);
    expect(b.step(0, false).houseStarted).toBeNull();
    expect(b.step(1, false).houseStarted).toBe('あ');
    b.step(0, false);
    expect(b.houseLook()?.ticksLeft).toBe(179);
    b.preempt();
    expect(b.houseLook()).toBeNull();
    expect(b.canOpenToast(false)).toBe(true);
  });
});
