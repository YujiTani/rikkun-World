import { describe, expect, it } from 'vitest';
import { ICON_H, ICON_W, eggWobble, kitIconKey, kitIconState, kitIconsFor, rasterKitIcon, type KitLike } from './kitIcons';

const TOTAL = 7200;
const kit = (x: number, z: number, eggs: KitLike['eggs'], size: 1 | 2 = 2): KitLike => ({ x, y: 9, z, size, eggs });

describe('LIVE-2.1 §3.2 こたつ の 天板 の たまご の 表示（純粋 な 部分）', () => {
  it('ゆれ の 段（のこり 2/3 以上 0・1/3 以上 1・それ より 少ない 2）', () => {
    expect(eggWobble(7200, TOTAL)).toBe(0);
    expect(eggWobble(4800, TOTAL)).toBe(0);
    expect(eggWobble(4799, TOTAL)).toBe(1);
    expect(eggWobble(2400, TOTAL)).toBe(1);
    expect(eggWobble(2399, TOTAL)).toBe(2);
    expect(eggWobble(0, TOTAL)).toBe(2);
  });

  it('slots は いつも 3。入って いない わく は null・fill 0。入った 順 に ならぶ', () => {
    const s = kitIconState([{ egg: 'egg', left: 7200 }, { egg: 'gold', left: 3600 }], TOTAL);
    expect(s).toHaveLength(3);
    expect(s[0]).toEqual({ egg: 'egg', fill: 0, wobble: 0 });
    expect(s[1]).toEqual({ egg: 'gold', fill: 0.5, wobble: 1 });
    expect(s[2]).toEqual({ egg: null, fill: 0, wobble: 0 });
    expect(kitIconState([], TOTAL).every((x) => x.egg === null)).toBe(true);
  });

  it('たまご は 4 こ 目 から 数えない・fill は 0〜1 に おさまる', () => {
    const e = [0, 1, 2, 3].map(() => ({ egg: 'egg' as const, left: -5 }));
    const s = kitIconState(e, TOTAL);
    expect(s).toHaveLength(3);
    expect(s.every((x) => x.fill >= 0 && x.fill <= 1)).toBe(true);
    expect(s[0]!.fill).toBe(1);
  });

  it('かえる ときの 絵: ピキッ（0〜1/3）は ひび、ぽんっ（1/3 から）で たまご の 絵 が 消える', () => {
    const s = kitIconState([{ egg: 'egg', left: 0, hatchT: 0.2 }, { egg: 'egg', left: 0, hatchT: 0.5 }], TOTAL);
    expect(s[0]).toMatchObject({ egg: 'egg', wobble: 2 });
    expect(s[1]!.egg).toBeNull();
  });

  it('出る とき: たまご が あって 水平 8 以内。20 マス では 出ない', () => {
    const near = kit(10, 10, [{ egg: 'egg', left: 100 }]);
    const far = kit(40, 10, [{ egg: 'egg', left: 100 }]);
    const rows = kitIconsFor([near, far], { eye: { x: 14, z: 10 }, total: TOTAL, aim: null });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ x: 10, y: 9, z: 10 });
    expect(rows[0]!.slots).toHaveLength(3);
    expect(kitIconsFor([far], { eye: { x: 14, z: 10 }, total: TOTAL, aim: null })).toHaveLength(0);
  });

  it('たまご を もって その こたつ を ねらって いる とき は から でも 3 わく とも null で 出る（とおく でも）', () => {
    const empty = kit(40, 10, []);
    const rows = kitIconsFor([empty], { eye: { x: 0, z: 0 }, total: TOTAL, aim: { x: 40, z: 10, holdingEgg: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slots.map((s) => s.egg)).toEqual([null, null, null]);
    // もって いない／ほか の こたつ を ねらって いる → 出ない
    expect(kitIconsFor([empty], { eye: { x: 0, z: 0 }, total: TOTAL, aim: { x: 40, z: 10, holdingEgg: false } })).toHaveLength(0);
    expect(kitIconsFor([empty], { eye: { x: 0, z: 0 }, total: TOTAL, aim: { x: 2, z: 10, holdingEgg: true } })).toHaveLength(0);
  });

  it('いちばん 多い とき 2 台 × 3 こ の 6 こ が 同時 に 見える', () => {
    const a = kit(10, 10, [0, 1, 2].map(() => ({ egg: 'egg' as const, left: 5000 })));
    const b = kit(14, 10, [0, 1, 2].map(() => ({ egg: 'gold' as const, left: 5000 })));
    const rows = kitIconsFor([a, b], { eye: { x: 12, z: 14 }, total: TOTAL, aim: null });
    expect(rows.flatMap((r) => r.slots).filter((s) => s.egg).length).toBe(6);
  });

  it('絵 の 点: 3 わく ぶん の よこ はば に おさまる。から の わく は うすい 点線（絵 の 点 が すこし）、入った わく は うまる ほど 点 が ふえる', () => {
    const solid = (px: Uint8Array) => {
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i]! > 0) n++;
      return n;
    };
    const px = (slots: ReturnType<typeof kitIconState>) => rasterKitIcon(slots);
    expect(px(kitIconState([], TOTAL)).length).toBe(ICON_W * ICON_H * 4);
    const empty = solid(px(kitIconState([], TOTAL)));
    const low = solid(px(kitIconState([{ egg: 'egg', left: 7200 }], TOTAL)));
    const high = solid(px(kitIconState([{ egg: 'egg', left: 100 }], TOTAL)));
    expect(empty).toBeGreaterThan(0); // 点線
    expect(low).toBeGreaterThan(empty); // 入った わく は 絵 が ある
    expect(high).toBeGreaterThan(low); // うまる ほど 点 が ふえる
  });

  it('絵 の 鍵: 同じ 見た目 なら 同じ（毎フレーム 作り直さない）。うまり は 段 で ちがう', () => {
    const k = (left: number) => kitIconKey(kitIconState([{ egg: 'egg', left }], TOTAL));
    expect(k(7200)).toBe(k(7199));
    expect(k(7200)).not.toBe(k(3000));
    expect(kitIconKey(kitIconState([{ egg: 'gold', left: 7200 }], TOTAL))).not.toBe(k(7200));
  });
});
