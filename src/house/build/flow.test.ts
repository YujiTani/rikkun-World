import { describe, expect, it } from 'vitest';
import type { Blueprint } from '../editor/blueprint';
import { BuildFlow, type FlowPlan } from './flow';
import type { Site } from './sites';
import { MSG } from './tuning';

/** ユニット 3・5（AC18・AC19・AC20）: 一覧 → 上空の 視点 → 確かめ。世界は 読まない（場所は 表で わたす） */
const bp = (n: number): Blueprint => ({ number: n, name: { front: 'もも', back: 'のいえ' }, w: 5, d: 5, windows: 0, windowKind: 'shoji', roof: 'flat', furniture: [], light: 'lantern' });
const SITES: Site[] = [{ x: 10, y: 5, z: 10 }, { x: 20, y: 5, z: 10 }];

function rig(opts: { plans?: FlowPlan[]; sites?: Site[]; begin?: boolean } = {}) {
  const calls: string[] = [];
  const plans = opts.plans ?? [{ slot: 3, bp: bp(1), enough: true }, { slot: 5, bp: bp(2), enough: false }];
  const flow = new BuildFlow({
    plans: () => plans,
    findSites: () => {
      calls.push('find');
      return opts.sites ?? SITES;
    },
    begin: (slot, _bp, site) => {
      calls.push(`begin:${slot}:${site.x},${site.z}`);
      return opts.begin ?? true;
    },
  });
  return { flow, calls };
}

describe('AC18 一覧', () => {
  it('せっけいずが 0 まい: 一覧に ならない（open が false）', () => {
    const { flow } = rig({ plans: [] });
    expect(flow.open()).toBe(false);
    expect(flow.page).toBeNull();
  });
  it('1 まい 以上: 一覧。材料が たりない カードは enabled false', () => {
    const { flow } = rig();
    expect(flow.open()).toBe(true);
    expect(flow.page).toBe('pick');
    expect(flow.buttons()).toEqual([{ id: 'pick-3', enabled: true }, { id: 'pick-5', enabled: false }, { id: 'close', enabled: true }]);
  });
  it('たりない カードを 押すと need ＋「ざいりょうが たりないよ」。世界は 読まない', () => {
    const { flow, calls } = rig();
    flow.open();
    flow.pick(5);
    expect(flow.page).toBe('need');
    expect(flow.say).toBe(MSG.short);
    expect(flow.needSlot()).toBe(5);
    expect(calls).toEqual([]);
    expect(flow.escape()).toBe(true);
    expect(flow.page).toBe('pick');
  });
});

describe('AC19 場所', () => {
  it('置ける 場所が 0: 一覧の まま ＋ ふきだし', () => {
    const { flow } = rig({ sites: [] });
    flow.open();
    flow.pick(3);
    expect(flow.page).toBe('pick');
    expect(flow.say).toBe(MSG.noSite);
    expect(flow.sites()).toEqual([]);
  });
  it('あれば 上空の 視点。はじめの わくは いちばん 近い 場所。世界を 読むのは 1 回', () => {
    const { flow, calls } = rig();
    flow.open();
    flow.pick(3);
    expect(flow.page).toBe('sky');
    expect(flow.cursor()).toEqual({ x: 10, z: 10, ok: true, confirm: false });
    flow.move(1, 0);
    flow.moveTo(20, 10);
    flow.move(0, 1);
    expect(flow.cursor()).toMatchObject({ x: 20, z: 11, ok: false });
    expect(calls).toEqual(['find']);
  });
  it('置けない 所では 決定しても 確かめの まどに ならない', () => {
    const { flow } = rig();
    flow.open();
    flow.pick(3);
    flow.move(1, 0);
    flow.decide();
    expect(flow.cursor()?.confirm).toBe(false);
  });
});

describe('AC20 確かめ', () => {
  const toConfirm = () => {
    const r = rig();
    r.flow.open();
    r.flow.pick(3);
    r.flow.decide();
    return r;
  };
  it('決定 → confirm true。何も はじまらない。確かめの 間は わくが 動かない', () => {
    const { flow, calls } = toConfirm();
    expect(flow.cursor()).toMatchObject({ confirm: true });
    flow.move(1, 0);
    expect(flow.cursor()).toMatchObject({ x: 10 });
    expect(calls).toEqual(['find']);
    expect(flow.buttons().map((b) => b.id)).toEqual(['yes', 'no']);
  });
  it('yes → begin(slot, site) が 呼ばれて 流れが おわる', () => {
    const { flow, calls } = toConfirm();
    expect(flow.press('yes')).toBe('started');
    expect(calls).toEqual(['find', 'begin:3:10,10']);
    expect(flow.page).toBeNull();
  });
  it('begin が 失敗 → 確かめの まどの まま', () => {
    const r = rig({ begin: false });
    r.flow.open();
    r.flow.pick(3);
    r.flow.decide();
    expect(r.flow.press('yes')).toBe('stay');
    expect(r.flow.cursor()).toMatchObject({ confirm: true });
  });
  it('no・Esc: まどだけ とじる（わくは そのまま）。まどが ない Esc は 一覧へ。一覧の Esc は false', () => {
    const { flow, calls } = toConfirm();
    flow.press('no');
    expect(flow.cursor()).toEqual({ x: 10, z: 10, ok: true, confirm: false });
    flow.decide();
    expect(flow.escape()).toBe(true);
    expect(flow.cursor()?.confirm).toBe(false);
    expect(flow.escape()).toBe(true);
    expect(flow.page).toBe('pick');
    expect(flow.escape()).toBe(false);
    expect(calls).toEqual(['find']);
  });
});
