import { describe, expect, it } from 'vitest';
import {
  COOP_COL,
  COOP_TRI_LIMIT,
  COOP_UNIT,
  EGG_COL,
  EGG_TRI_LIMIT,
  NEST_BOX,
  NEST_EGG_SCALE,
  NEST_EGG_SHOWN,
  getCoopModel,
  getEggModel,
  getNestEggsModel,
  nestEggSlots,
} from './coopSpec';
import type { BuiltModel } from './voxelMesh';

const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const near = (m: BuiltModel, hex: number): Array<[number, number, number]> => {
  const col = m.geo.getAttribute('color');
  const pos = m.geo.getAttribute('position');
  const t = [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < col.count; i++) {
    if (Math.abs(t[0] - col.getX(i)) + Math.abs(t[1] - col.getY(i)) + Math.abs(t[2] - col.getZ(i)) < 0.01) out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  return out;
};
/** 1/9 の 形を 1/9 ブロック の メッシュ に（頂点 は 1/16 単位 で 出る ので 16/9 倍） */
const S = 16 / 9;

describe('とりごや の 形（K3 さくの にわ 5×5。DESIGN 16.14）', () => {
  const m = getCoopModel();
  it('三角形 は 3,340（試作で はかった 数）≤ 3,600。すばこ の たまご は 入れない', () => {
    expect(m.tris).toBe(3340);
    expect(m.tris).toBeLessThanOrEqual(COOP_TRI_LIMIT);
  });
  it('1 つ 1 メッシュ（骨 1 本）・3 つ まで 置ける ので 3 回・約 10,000 三角形', () => {
    expect(m.names).toEqual(['coop']);
    expect(3 * m.tris).toBeLessThanOrEqual(10100);
  });
  it('大きさ: そと 5×5 マス（はば 5）・高さ 3 マス（ねぐら の やね の てっぺん。置く の に いる 4 の 中）', () => {
    const bb = m.geo.boundingBox!;
    expect((bb.max.x - bb.min.x) * S).toBeGreaterThan(4.8);
    expect((bb.max.x - bb.min.x) * S).toBeLessThanOrEqual(5.4); // くい の 太さ（1 点）が はし から はみ出す
    expect((bb.max.z - bb.min.z) * S).toBeGreaterThan(4.8);
    expect((bb.max.z - bb.min.z) * S).toBeLessThanOrEqual(5.4); // やね が うしろへ 1.5 点 はみ出す
    expect(bb.max.y * S).toBeGreaterThan(2.7);
    expect(bb.max.y * S).toBeLessThanOrEqual(3.01);
    expect(bb.min.y).toBeGreaterThanOrEqual(0);
    // 中心 は 5×5 の まん中（左右 は そろう）
    expect(Math.abs((bb.max.x + bb.min.x) * S)).toBeLessThan(0.1);
  });
  it('さくの 高さ は 12/9 マス（中の 子が 見える ひくさ）。もん は 2 マス（のれん）、ねぐら の やね は 3 マス', () => {
    const wood = near(m, COOP_COL.wood).concat(near(m, COOP_COL.woodD));
    // くい・よこ木 だけ（もん・ねぐら の かべ を のぞく: 前 と 左右 の さく）
    const fenceTop = Math.max(...wood.filter(([x, y, z]) => Math.abs(x * S) > 2.4 && z * S < 1.5 && y * S < 1.6).map(([, y]) => y * S));
    expect(fenceTop).toBeCloseTo(13 / 9, 1);
    const gate = near(m, COOP_COL.lintel);
    expect(Math.max(...gate.map(([, y]) => y * S))).toBeGreaterThan(2);
    expect(Math.max(...gate.map(([, y]) => y * S))).toBeLessThan(2.3);
    // もん は 前（−z）の まん中
    for (const [x, , z] of gate) {
      expect(Math.abs(x * S)).toBeLessThan(0.85);
      expect(z * S).toBeLessThan(-2.1);
    }
  });
  it('入口: もん の まん中 は あいて いる（のれん の 3 まい だけ。くい は 左右）。中 3×3 は がらん と して いる', () => {
    const noren = near(m, COOP_COL.noren);
    expect(noren.length).toBeGreaterThan(0);
    const hem = near(m, COOP_COL.hem);
    expect(hem.length).toBeGreaterThan(0);
    // 中 の まん中（|x|<0.5・|z|<0.5）には 何も 立って いない（ゆかも 無い。地面 の 上 に 立つ）
    const col = m.geo.getAttribute('position');
    for (let i = 0; i < col.count; i++) {
      const x = col.getX(i) * S;
      const y = col.getY(i) * S;
      const z = col.getZ(i) * S;
      if (Math.abs(x) < 0.5 && Math.abs(z) < 0.5) expect(y, `(${x},${y},${z})`).toBeLessThan(0.01);
    }
  });
  it('ねぐら: うしろ の 列 3 マス に 藍 の 三角やね（むね は 左右）。藍 は うでの リボン と おなじ 「なかまの 色」', () => {
    // 三角やね の 面（やね の 本体 の 色）。すじ の 藍 は のれん と 同じ 色 なので ここ では 本体 だけ 見る
    const roof = near(m, COOP_COL.roof);
    expect(roof.length).toBeGreaterThan(0);
    for (const [, y, z] of roof) {
      expect(z * S).toBeGreaterThan(0.7); // うしろ の 列 より 前 には 出ない
      expect(y * S).toBeGreaterThan(1.7);
    }
    expect(Math.max(...roof.map(([, y]) => y * S))).toBeGreaterThan(2.7);
    // すばこ: ねぐら の ゆか の 上（わら）
    const straw = near(m, COOP_COL.straw);
    expect(straw.length).toBeGreaterThan(0);
    for (const [x, y, z] of straw) {
      expect(Math.abs(x * S)).toBeLessThan(0.7);
      expect(z * S).toBeGreaterThan(1.4);
      expect(y * S).toBeGreaterThan(0.8);
    }
  });
  it('色の 割合（面積）: 木 7・藍 2・わら 少し（木 が いちばん 多く、わら が いちばん 少ない）', () => {
    const idx = m.geo.getIndex()!;
    const pos = m.geo.getAttribute('position');
    const col = m.geo.getAttribute('color');
    const area = new Map<number, number>();
    const keyOf = (i: number) => `${col.getX(i).toFixed(3)},${col.getY(i).toFixed(3)},${col.getZ(i).toFixed(3)}`;
    const byKey = new Map<string, number>();
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const ux = pos.getX(b) - pos.getX(a);
      const uy = pos.getY(b) - pos.getY(a);
      const uz = pos.getZ(b) - pos.getZ(a);
      const vx = pos.getX(c) - pos.getX(a);
      const vy = pos.getY(c) - pos.getY(a);
      const vz = pos.getZ(c) - pos.getZ(a);
      const ar = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      byKey.set(keyOf(a), (byKey.get(keyOf(a)) ?? 0) + ar);
    }
    void area;
    const of = (hexes: number[]) =>
      hexes.reduce((sum, h) => sum + (byKey.get(`${lin(((h >> 16) & 255) / 255).toFixed(3)},${lin(((h >> 8) & 255) / 255).toFixed(3)},${lin((h & 255) / 255).toFixed(3)}`) ?? 0), 0);
    const wood = of([COOP_COL.wood, COOP_COL.woodD, COOP_COL.lintel]);
    const indigo = of([COOP_COL.roof, COOP_COL.roofS, COOP_COL.noren]);
    const straw = of([COOP_COL.straw, COOP_COL.strawD, COOP_COL.box]);
    expect(wood).toBeGreaterThan(indigo);
    expect(indigo).toBeGreaterThan(straw);
    expect(straw).toBeGreaterThan(0);
  });
});

describe('たまご（こたつ・すばこ）の 形（DESIGN 16.12・16.15）', () => {
  it('こたつ の たまご 1 こ: 三角形 200 以下。4 しゅるい（ふつう・きん × ひびなし・あり）', () => {
    for (const gold of [false, true]) {
      for (const crack of [false, true]) {
        const e = getEggModel(gold, crack);
        expect(e.tris, `${gold} ${crack}`).toBeGreaterThan(40);
        expect(e.tris, `${gold} ${crack}`).toBeLessThanOrEqual(EGG_TRI_LIMIT);
        expect(getEggModel(gold, crack)).toBe(e);
      }
    }
  });
  it('たまご の 色: ふつう = たまご の から（F5ECD8・下 E2D6B8）、きん = きんいろ。ひび は こい線', () => {
    expect(near(getEggModel(false, false), EGG_COL.shell).length).toBeGreaterThan(0);
    expect(near(getEggModel(false, false), EGG_COL.shellD).length).toBeGreaterThan(0);
    expect(near(getEggModel(false, false), EGG_COL.gold).length).toBe(0);
    expect(near(getEggModel(true, false), EGG_COL.gold).length).toBeGreaterThan(0);
    expect(near(getEggModel(true, false), EGG_COL.shell).length).toBe(0);
    expect(near(getEggModel(false, false), EGG_COL.crack).length).toBe(0);
    expect(near(getEggModel(false, true), EGG_COL.crack).length).toBeGreaterThan(0);
    expect(near(getEggModel(true, true), EGG_COL.goldCrack).length).toBeGreaterThan(0);
    // ひび は ひびの ない 形 より 三角形 が ふえる
    expect(getEggModel(false, true).tris).toBeGreaterThan(getEggModel(false, false).tris);
  });
  it('たまご の 大きさ: 高さ 約 0.5（8/16）・はば 約 0.34（光らない・点滅しない 静かな 形）', () => {
    const bb = getEggModel(false, false).geo.boundingBox!;
    expect(bb.max.y - bb.min.y).toBeGreaterThan(0.4);
    expect(bb.max.y - bb.min.y).toBeLessThanOrEqual(0.51);
    expect(bb.max.x - bb.min.x).toBeLessThanOrEqual(0.4);
  });
});

describe('すばこ の たまご（6 こ まで ならぶ・7 こ から 山。小屋 ごと 1 メッシュ）', () => {
  it('見える 数 = たまご + きん（上限 12）。0 こ は 空', () => {
    expect(nestEggSlots(0, 0)).toHaveLength(0);
    expect(nestEggSlots(4, 0)).toHaveLength(4);
    expect(nestEggSlots(4, 1)).toHaveLength(5);
    expect(nestEggSlots(12, 1)).toHaveLength(NEST_EGG_SHOWN);
    expect(nestEggSlots(99, 99)).toHaveLength(NEST_EGG_SHOWN);
  });
  it('すばこ の はんい の 中 に 入る。同じ 場所 に 2 こ 重ならない（6 こ まで）', () => {
    const s = nestEggSlots(6, 0);
    const keys = new Set<string>();
    for (const e of s) {
      expect(e.x).toBeGreaterThan(NEST_BOX.x0);
      expect(e.x).toBeLessThan(NEST_BOX.x1);
      expect(e.z).toBeGreaterThan(NEST_BOX.z0);
      expect(e.z).toBeLessThan(NEST_BOX.z1);
      expect(e.y).toBeCloseTo(NEST_BOX.y, 6);
      keys.add(`${e.x.toFixed(3)},${e.z.toFixed(3)}`);
    }
    expect(keys.size).toBe(6);
    // 6 こ の たまご の はば は すばこ の 中 に おさまる（となり と 重ならない）
    const xs = [...new Set(s.map((e) => e.x.toFixed(3)))].map(Number).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThan(0.2);
  });
  it('7 こ から は 山（上 に つむ）', () => {
    const s = nestEggSlots(12, 0);
    expect(s.slice(0, 6).every((e) => Math.abs(e.y - NEST_BOX.y) < 1e-9)).toBe(true);
    expect(s.slice(6).every((e) => e.y > NEST_BOX.y + 0.1)).toBe(true);
  });
  it('きん の たまご は さきに ならぶ（きんいろ）。たまご 3 ＋ きん 1 → きん が 1 こ', () => {
    const s = nestEggSlots(3, 1);
    expect(s.filter((e) => e.gold)).toHaveLength(1);
    expect(s[0].gold).toBe(true);
    expect(nestEggSlots(5, 0).some((e) => e.gold)).toBe(false);
  });
  it('1 メッシュ: たまご 12 こ でも 三角形 は 12 × 200 以下。きん が ある と きんいろ が 入る', () => {
    const full = getNestEggsModel(12, 0);
    expect(full.tris).toBeLessThanOrEqual(12 * EGG_TRI_LIMIT);
    expect(getNestEggsModel(12, 0)).toBe(full);
    expect(getNestEggsModel(0, 0).tris).toBe(0);
    expect(near(getNestEggsModel(2, 1), EGG_COL.gold).length).toBeGreaterThan(0);
    expect(near(getNestEggsModel(3, 0), EGG_COL.gold).length).toBe(0);
    // すばこ の 上 に 見える（足もと は すばこ の ゆか）
    const bb = getNestEggsModel(6, 0).geo.boundingBox!;
    expect(bb.min.y * NEST_EGG_SCALE).toBeGreaterThanOrEqual(NEST_BOX.y - 0.01);
    // メッシュ は 1/16 の 点 の まま（描く 側 が `NEST_EGG_SCALE` を かける）
    expect(bb.min.x * NEST_EGG_SCALE).toBeGreaterThan(NEST_BOX.x0 - 0.05);
    expect(bb.max.x * NEST_EGG_SCALE).toBeLessThan(NEST_BOX.x1 + 0.05);
    expect(COOP_UNIT).toBeCloseTo(1 / 9, 9);
  });
});
