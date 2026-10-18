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
