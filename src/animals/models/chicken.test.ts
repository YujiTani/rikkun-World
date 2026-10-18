import { describe, expect, it } from 'vitest';
import { CHICKEN_BONES, CHICKEN_SCALE, CHICKEN_TRI_LIMIT, COL, chickenSpec } from './chickenSpec';
import { getChickenModel } from './chickenModel';
import { boneIndex, createPose, poseChicken, type PoseInput } from './chickenPose';

describe('にわとり の 形（DESIGN 16.8・LIVE-1 §3.2）', () => {
  it('三角形 は しるし 込みでも 600 以下、しるし なしは それ より 少ない', () => {
    const plain = getChickenModel(false);
    const mark = getChickenModel(true);
    expect(plain.tris).toBe(528); // A2 の はかった 数（DESIGN 16.8）
    expect(mark.tris).toBe(584);
    expect(plain.tris).toBeLessThan(mark.tris);
    expect(mark.tris).toBeLessThanOrEqual(CHICKEN_TRI_LIMIT);
  });
  it('11 わ（やせい 3・なかま 8）の 三角形 の ふえ が 8,000 以下（ふちどり 1 つ 込み）', () => {
    const plain = getChickenModel(false);
    const mark = getChickenModel(true);
    expect(3 * plain.tris + 8 * mark.tris + mark.hullTris).toBeLessThanOrEqual(8000);
    expect(mark.hullTris).toBeLessThanOrEqual(mark.tris * 2);
  });
  it('1 わ 1 メッシュ: 頂点は 骨 1 本 だけ（重み 1）で、骨の 番号は 範囲内', () => {
    for (const m of [getChickenModel(false), getChickenModel(true)]) {
      const skin = m.geo.getAttribute('skinIndex');
      const wt = m.geo.getAttribute('skinWeight');
      for (let i = 0; i < skin.count; i++) {
        expect(skin.getX(i)).toBeLessThan(m.names.length);
        expect(wt.getX(i)).toBe(1);
        expect(wt.getY(i)).toBe(0);
      }
      expect(m.names).toEqual(CHICKEN_BONES.slice(0, m.names.length));
    }
  });
  it('高さ 0.80・体の はば 0.5 ぐらい（羽まで 0.62 以下）・長さ 0.80 まで', () => {
    const bb = getChickenModel(false).geo.boundingBox!;
    expect((bb.max.y - bb.min.y) * CHICKEN_SCALE).toBeGreaterThan(0.76);
    expect((bb.max.y - bb.min.y) * CHICKEN_SCALE).toBeLessThan(0.84);
    expect((bb.max.x - bb.min.x) * CHICKEN_SCALE).toBeLessThanOrEqual(0.62 + 1e-6);
    expect((bb.max.z - bb.min.z) * CHICKEN_SCALE).toBeLessThanOrEqual(0.82);
  });
  it('なかまの しるし: 藍の リボン の 色は なかま だけ に あり、結び目 は 体の 右（+x）に 出る', () => {
    const hasRibbon = (friend: boolean): { n: number; maxX: number } => {
      const m = getChickenModel(friend);
      const col = m.geo.getAttribute('color');
      const pos = m.geo.getAttribute('position');
      const c = { r: 0, g: 0, b: 0 };
      let n = 0;
      let maxX = -Infinity;
      const ribbon = (hex: number) => {
        const r = ((hex >> 16) & 255) / 255;
        const g = ((hex >> 8) & 255) / 255;
        const b = (hex & 255) / 255;
        // 色は 線形に なおして ある ので、近い かどうか だけ 見る（sRGB → 線形）
        const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
        return [lin(r), lin(g), lin(b)];
      };
      const targets = [ribbon(COL.ribbon), ribbon(COL.ribbonL)];
      for (let i = 0; i < col.count; i++) {
        c.r = col.getX(i);
        c.g = col.getY(i);
        c.b = col.getZ(i);
        if (targets.some((t) => Math.abs(t[0] - c.r) + Math.abs(t[1] - c.g) + Math.abs(t[2] - c.b) < 0.01)) {
          n++;
          maxX = Math.max(maxX, pos.getX(i));
        }
      }
      return { n, maxX };
    };
    expect(hasRibbon(false).n).toBe(0);
    const f = hasRibbon(true);
    expect(f.n).toBeGreaterThan(0);
    expect(f.maxX).toBeGreaterThan(0.18); // 体の 横（右）に 結び目 が はみ出す
  });
  it('部品の 親子: 首 → 体、頭 → 首、とさか・目 → 頭、しるし → 体', () => {
    const parts = new Map(chickenSpec(true).map((p) => [p.name, p.parent]));
    expect(parts.get('neck')).toBe('body');
    expect(parts.get('head')).toBe('neck');
    expect(parts.get('comb')).toBe('head');
    expect(parts.get('eyes')).toBe('head');
    expect(parts.get('mark')).toBe('body');
  });
});

const base = (o: Partial<PoseInput>): PoseInput => ({ state: 'idle', stateTicks: 0, headRelYaw: 0, motion: 1, ...o });
const posed = (o: Partial<PoseInput>) => {
  const p = createPose();
  poseChicken(p, base(o));
  return p;
};
const headFwd = (p: ReturnType<typeof createPose>) => p.off[boneIndex('neck') * 3 + 2] + p.off[boneIndex('head') * 3 + 2];
const headDown = (p: ReturnType<typeof createPose>) => p.off[boneIndex('neck') * 3 + 1] + p.off[boneIndex('head') * 3 + 1];

describe('にわとり の うごき（LIVE-1 §3.5・DESIGN 16.3）', () => {
  it('ついばむ: 8 コマめ に 頭が 前 2.8 点・下 1.2 点 まで 出て、くちばしが 下を 向く。30 で もとに もどる', () => {
    const p = posed({ state: 'eat', stateTicks: 8 });
    expect(headFwd(p)).toBeCloseTo(-2.8, 1);
    expect(headDown(p)).toBeCloseTo(-1.2, 1);
    expect(p.rot[boneIndex('head') * 3]).toBeLessThan(-25); // 頭 −30° ほど（かがみ 込み）
    expect(p.rot[boneIndex('body') * 3]).toBeLessThan(-15); // 体 −18°
    expect(p.rot[boneIndex('comb') * 3]).toBeGreaterThan(10); // とさかは おくれて うしろへ
    const end = posed({ state: 'eat', stateTicks: 30 });
    expect(Math.abs(headFwd(end))).toBeLessThan(0.01);
  });
  it('ついばむ: つつく は 6 ステップ ごとに 3 回（出る 山が 3 つ）', () => {
    let peaks = 0;
    let prev = 0;
    let up = false;
    for (let t = 6; t <= 24; t++) {
      const f = -headFwd(posed({ state: 'eat', stateTicks: t }));
      if (f > prev && !up) up = true;
      if (f < prev && up) {
        peaks++;
        up = false;
      }
      prev = f;
    }
    expect(peaks).toBeGreaterThanOrEqual(2);
    expect(-headFwd(posed({ state: 'eat', stateTicks: 8 }))).toBeGreaterThan(-headFwd(posed({ state: 'eat', stateTicks: 12 })));
  });
  it('なでられる: 目を ほそめ（0.25 倍）、頭が 上へ 1.2 点、かしげ 14°。30 で もとに もどる', () => {
    const p = posed({ state: 'pet', stateTicks: 4 });
    expect(p.sc[boneIndex('eyes') * 3 + 1]).toBeCloseTo(0.25, 2);
    expect(headDown(p)).toBeCloseTo(1.2, 1);
    expect(p.rot[boneIndex('head') * 3 + 2]).toBeGreaterThan(8);
    const end = posed({ state: 'pet', stateTicks: 30 });
    expect(end.sc[boneIndex('eyes') * 3 + 1]).toBeCloseTo(1, 2);
    expect(Math.abs(headDown(end))).toBeLessThan(0.01);
  });
  it('見る: 頭は かしげ（22°）、体は 後から 向く', () => {
    const mid = posed({ state: 'look', stateTicks: 8 });
    expect(mid.rot[boneIndex('head') * 3 + 2]).toBeGreaterThan(15);
    expect(mid.rot[boneIndex('body') * 3 + 1]).toBeCloseTo(0, 1);
    const late = posed({ state: 'look', stateTicks: 20 });
    expect(Math.abs(late.rot[boneIndex('body') * 3 + 1])).toBeGreaterThan(5);
  });
  it('頭の 向き: 体に たいする 頭の 角度 が 頭の 骨に 入る（上限 80°）', () => {
    const a = posed({ headRelYaw: 0.5 });
    const b = posed({ headRelYaw: 0 });
    expect(Math.abs(a.rot[boneIndex('head') * 3 + 1] - b.rot[boneIndex('head') * 3 + 1])).toBeGreaterThan(20);
    const big = posed({ headRelYaw: 3 });
    expect(Math.abs(big.rot[boneIndex('head') * 3 + 1] - b.rot[boneIndex('head') * 3 + 1])).toBeLessThanOrEqual(80.01);
  });
  it('たまご: しゃがむ（たて に つぶれ 横 に ひろがる。体積は ほぼ そのまま）→ ポンと 立つ', () => {
    const sq = posed({ state: 'lay', stateTicks: 8 });
    expect(sq.scale[0]).toBeGreaterThan(1.1);
    expect(sq.scale[1]).toBeLessThan(0.8);
    const vol = (sq.scale[0] * sq.scale[1] * sq.scale[2]) / CHICKEN_SCALE ** 3;
    expect(vol).toBeGreaterThan(0.9);
    expect(vol).toBeLessThan(1.15);
    const up = posed({ state: 'lay', stateTicks: 27 });
    expect(up.scale[1]).toBeGreaterThan(sq.scale[1]);
    const end = posed({ state: 'lay', stateTicks: 30 });
    expect(end.scale[1]).toBeCloseTo(CHICKEN_SCALE, 2);
  });
  it('よろこぶ: ジャンプ 20 コマ（ためる 4・とぶ 10・着地 6）。空中で 羽を ひろげ、2 回目は 同じ', () => {
    const air = posed({ state: 'cheer', stateTicks: 7 });
    expect(air.rigY).toBeGreaterThan(0.3);
    expect(air.rot[boneIndex('wingR') * 3 + 2]).toBeGreaterThan(60);
    expect(air.rot[boneIndex('wingL') * 3 + 2]).toBeLessThan(-60);
    const second = posed({ state: 'cheer', stateTicks: 27 });
    expect(second.rigY).toBeCloseTo(air.rigY, 3);
    expect(posed({ state: 'cheer', stateTicks: 0 }).rigY).toBe(0);
  });
  it('動きの 強さ 0: ジャンプの 高さ と とさかの ゆれは 止まる。頭の 向き・つつく・目を とじる は のこる', () => {
    const air = posed({ state: 'cheer', stateTicks: 7, motion: 0 });
    expect(air.rigY).toBe(0);
    const peck = posed({ state: 'eat', stateTicks: 8, motion: 0 });
    expect(peck.rot[boneIndex('comb') * 3]).toBe(0);
    expect(headFwd(peck)).toBeCloseTo(-2.8, 1);
    const pet = posed({ state: 'pet', stateTicks: 10, motion: 0 });
    expect(pet.sc[boneIndex('eyes') * 3 + 1]).toBeCloseTo(0.25, 2);
    expect(pet.rot[boneIndex('comb') * 3 + 2]).toBe(0);
  });
  it('出てくる: 30 ステップ で 0 → 1（ふわっと 大きくなる）', () => {
    const s = (t: number) => posed({ state: 'appear', stateTicks: t }).scale[1];
    expect(s(0)).toBeLessThan(0.1);
    expect(s(15)).toBeGreaterThan(s(5));
    expect(s(30)).toBeCloseTo(CHICKEN_SCALE, 2);
  });
  it('歩く: 12 ステップ で 頭を 前後 に ふり、足が ふれる。まつ ときは 足 を ふらない', () => {
    const legs = (state: 'wander' | 'idle', t: number) => posed({ state, stateTicks: t }).rot[boneIndex('legL') * 3];
    const heads = [0, 3, 6, 9].map((t) => posed({ state: 'wander', stateTicks: t }).off[boneIndex('head') * 3 + 2]);
    expect(Math.max(...heads) - Math.min(...heads)).toBeGreaterThan(0.5);
    expect(Math.abs(legs('wander', 6))).toBeGreaterThan(5);
    expect(legs('idle', 6)).toBe(0);
    // 12 ステップ で 頭は 1 往復
    expect(posed({ state: 'wander', stateTicks: 3 }).off[boneIndex('head') * 3 + 2]).toBeCloseTo(posed({ state: 'wander', stateTicks: 15 }).off[boneIndex('head') * 3 + 2], 5);
  });
  it('どの 状態の どの コマ でも 数は 有限（NaN なし）', () => {
    for (const state of ['appear', 'wander', 'rest', 'look', 'eat', 'pet', 'lay', 'cheer', 'follow', 'idle'] as const) {
      for (let t = 0; t <= 80; t++) {
        const p = posed({ state, stateTicks: t, headRelYaw: 0.3 });
        for (const v of [...p.off, ...p.rot, ...p.sc, ...p.scale, p.rigY]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
