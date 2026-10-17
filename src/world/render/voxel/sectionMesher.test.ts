import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../../VoxelWorld';
import { WorldLight } from '../../light/WorldLight';
import { SkyDarkness } from '../../light/skyDarkness';
import { BLOCK_INDEX } from '../../blocks/blockTypes';
import { FACES, flatAoLevels } from '../meshChunk';
import { OCC_BYTES } from './ao';
import { SectionMesher, type SectionMeshData } from './sectionMesher';

/** 32×32 の石の台（高さ 0〜20）。ほか: bedrock は y=0 */
function slab(top = 20, height = 48): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 48, y: height, z: 48 });
  w.fill(0, 0, 0, 47, 0, 47, 'bedrock');
  w.fill(0, 1, 0, 47, top, 47, 'stone');
  return w;
}

const maxOf = (d: SectionMeshData, axis: 0 | 1 | 2) => {
  let m = 0;
  for (const p of d.pieces) for (let i = axis; i < p.positions.length; i += 3) m = Math.max(m, p.positions[i]);
  return m;
};

describe('SectionMesher（セクション 1 つのメッシュ。VOX-E）', () => {
  it('全部空気のセクションは 面が 0（箱も小ブロックも）', () => {
    const w = slab();
    const m = new SectionMesher(w);
    for (const tier of ['box', 'micro'] as const) {
      const d = m.build(0, 2, 0, tier);
      expect(d.faces).toBe(0);
      expect(d.triangles).toBe(0);
      expect(d.extras.faceCount).toBe(0);
      expect(d.water.faceCount).toBe(0);
    }
  });

  it('石の台の中（まわりも石）は 面が 0。台の上の面は 箱で 1 まいにまとまる', () => {
    const w = slab(20);
    const m = new SectionMesher(w);
    expect(m.build(1, 0, 1, 'box').faces).toBe(0);
    expect(m.build(1, 0, 1, 'micro').faces).toBe(0);
    // y 16〜20 が石のセクション (1,1,1): 上の面 (y=21) が 16×16 の 1 まい。まわりも石で、横の面は 中には無い。
    // 例外（#143、SEAM.md 直し方 2）: 箱の段は となりのセクションの段が分からないので、セクションの横のふちで
    // となりが 地面の表面ブロック（石の台のてっぺん y=20）なら、その高さの 1 段だけ 横の面を描く（4 辺 × 16 ブロック = 64 まい）
    const d = m.build(1, 1, 1, 'box');
    const sides: { y0: number; y1: number; w: number }[] = [];
    let tops = 0;
    for (const piece of d.pieces) {
      for (let q = 0; q + 3 < piece.vertexCount; q += 4) {
        const f = piece.data[q * 4 + 3] & 7;
        if (f < 2) {
          tops++;
          expect(f, '下の面は 無い').toBe(0);
          continue;
        }
        const ys = [0, 1, 2, 3].map((i) => piece.positions[(q + i) * 3 + 1]);
        const xs = [0, 1, 2, 3].map((i) => piece.positions[(q + i) * 3]);
        const zs = [0, 1, 2, 3].map((i) => piece.positions[(q + i) * 3 + 2]);
        const w = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
        sides.push({ y0: Math.min(...ys), y1: Math.max(...ys), w });
      }
    }
    expect(tops).toBe(1);
    expect(sides.length, 'ふちの横の面が ある').toBeGreaterThan(0);
    // 横の面は ぜんぶ 表面ブロック（y=20 = セクションの中の 4 段目）の 1 段の高さだけ
    const unit = sides[0].y1 - sides[0].y0;
    expect(unit).toBeGreaterThan(0);
    for (const s of sides) {
      expect(s.y0).toBe(4 * unit);
      expect(s.y1).toBe(5 * unit);
    }
    // ふち 4 辺 × 16 ブロック = 64 ブロックぶん（まとまり方は問わない）
    expect(sides.reduce((a, e) => a + e.w, 0) / unit, 'ふち以外の横の面は 0。ふちは 4 辺 × 16 ブロック').toBe(64);
  });

  it('小ブロック（micro）は 箱（box）より 三角形が多い（ごつごつの形がある）', () => {
    const w = slab(20);
    const m = new SectionMesher(w);
    const box = m.build(1, 1, 1, 'box');
    const micro = m.build(1, 1, 1, 'micro');
    expect(micro.triangles).toBeGreaterThan(box.triangles * 4);
  });

  it('同じ入力から いつも同じ配列（決定的）', () => {
    const w = slab(20);
    const a = new SectionMesher(w).build(1, 1, 1, 'micro');
    const b = new SectionMesher(w).build(1, 1, 1, 'micro');
    expect(b.triangles).toBe(a.triangles);
    expect(b.pieces.length).toBe(a.pieces.length);
    for (let i = 0; i < a.pieces.length; i++) {
      expect(Array.from(b.pieces[i].positions)).toEqual(Array.from(a.pieces[i].positions));
      expect(Array.from(b.pieces[i].data)).toEqual(Array.from(a.pieces[i].data));
    }
  });

  it('座標はセクションの左下が 0（小ブロックの数）。箱は 0〜144 におさまる', () => {
    const w = slab(20);
    const d = new SectionMesher(w).build(1, 1, 1, 'box');
    expect(maxOf(d, 0)).toBeLessThanOrEqual(144);
    expect(maxOf(d, 2)).toBeLessThanOrEqual(144);
    expect(maxOf(d, 1)).toBe(5 * 9); // 石は y=16〜20 → 上の面は 5 ブロックぶん
  });

  it('セクションのさかい: 固いどうしの面は無い。1 ブロックほると 両がわに穴の中の面ができる', () => {
    const w = slab(40, 64);
    const m = new SectionMesher(w);
    // 石の台 y=1〜40 → セクション (1,1,1)（y 16〜31）は中まで石
    expect(m.build(1, 1, 1, 'box').faces).toBe(0);
    w.setBlock(24, 31, 24, 'air'); // セクション (1,1,1) のいちばん上の段、まんなか
    const hole = m.build(1, 1, 1, 'box');
    expect(hole.faces).toBeGreaterThan(0);
    // さかいをこえて 上のセクション (1,2,1) にも 穴の面（上のセクションの石の底は 空気の上）
    w.setBlock(24, 32, 24, 'air');
    const up = m.build(1, 2, 1, 'box');
    expect(up.faces).toBeGreaterThan(0);
  });

  it('光をあたまに焼く: たいまつの近くの面は ブロックの光が あり、遠くは 0', () => {
    const w = slab(20);
    w.setBlock(24, 21, 24, 'torch');
    const l = new WorldLight(w, new SkyDarkness());
    l.flush();
    for (const tier of ['box', 'micro'] as const) {
      const d = new SectionMesher(w, l).build(1, 1, 1, tier);
      let near = 0;
      let far = 0;
      for (const p of d.pieces) {
        for (let v = 0; v < p.vertexCount; v++) {
          const blk = p.light[v * 2 + 1];
          if (blk > 0) near++;
          else far++;
        }
      }
      expect(near, tier).toBeGreaterThan(0);
      expect(far, tier).toBeGreaterThan(0);
    }
  });

  it('光なしなら 空の光 15・ブロックの光 0（昼と同じ）', () => {
    const w = slab(20);
    const d = new SectionMesher(w).build(1, 1, 1, 'box');
    for (const p of d.pieces) {
      for (let v = 0; v < p.vertexCount; v++) {
        expect(p.light[v * 2]).toBe(255);
        expect(p.light[v * 2 + 1]).toBe(0);
      }
    }
  });

  // TEX-A（#146）: レンガは平らな箱（5.3）
  it('たいまつ・十字の板・水・レンガは 別のメッシュ（extras / water）に入る。レンガは平らな箱で描く（TEX-A）', () => {
    const w = slab(20);
    w.setBlock(20, 21, 20, 'torch');
    w.setBlock(21, 21, 20, 'wild_tomato');
    w.setBlock(22, 21, 20, 'brick');
    w.fill(26, 18, 26, 28, 20, 28, 'water');
    const d = new SectionMesher(w).build(1, 1, 1, 'micro');
    expect(d.extras.faceCount).toBeGreaterThan(0);
    expect(d.water.faceCount).toBeGreaterThan(0);
    // たいまつ 5 + 十字の板 4 + レンガ 5（台の上なので下の面はかくれる）
    expect(d.extras.faceCount).toBe(5 + 4 + 5);
    const withBrick = d.faces;
    w.setBlock(22, 21, 20, 'air');
    const without = new SectionMesher(w).build(1, 1, 1, 'micro');
    expect(withBrick).not.toBe(without.faces); // 台の上の面がレンガの下でかくれる
    expect(without.extras.faceCount).toBe(d.extras.faceCount - 5);
  });

  it('小ブロック地形のとび出し: 地面のブロックの上のはみ出しは 地面のあるセクションが持つ', () => {
    // 草の地面を y=15（セクション 0 のいちばん上）に。セクション 1 は全部空気
    const w = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
    w.fill(0, 0, 0, 47, 14, 47, 'dirt');
    w.fill(0, 15, 0, 47, 15, 47, 'grass');
    const m = new SectionMesher(w);
    const lower = m.build(1, 0, 1, 'micro');
    const upper = m.build(1, 1, 1, 'micro');
    expect(upper.faces).toBe(0);
    expect(upper.triangles).toBe(0);
    expect(maxOf(lower, 1)).toBeGreaterThan(144); // 草のふさが 上のセクションの高さにはみ出す
    expect(maxOf(lower, 1)).toBeLessThanOrEqual(144 + 9);
  });

  // ---------------------------------------------------------------- TEX-A（#146）

  it('頂点のデータ aData = [ブロックの種類, 行の符号, 角の印, 面の番号]。色（r, g, b）は 持たない', () => {
    const w = slab(20);
    const d = new SectionMesher(w).build(1, 1, 1, 'micro');
    const stone = BLOCK_INDEX.stone;
    const grass = BLOCK_INDEX.grass;
    let seen = 0;
    for (const p of d.pieces) {
      for (let v = 0; v < p.vertexCount; v++) {
        const kind = p.data[v * 4];
        const row = p.data[v * 4 + 1];
        const face = p.data[v * 4 + 3];
        expect(kind === stone || kind === BLOCK_INDEX.bedrock || kind === grass || kind === BLOCK_INDEX.dirt, `種類 ${kind}`).toBe(true);
        expect(face).toBeLessThan(6);
        expect(p.data[v * 4 + 2], '角の印（3 ビット）').toBeLessThan(8);
        if (face < 2) expect(row, '上下の面は 世界の高さで行を決める').toBe(255);
        else expect(row === 255 || row <= 17, `行の符号 ${row}`).toBe(true);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('小ブロック地形の横の面は 行の符号を持つ（てっぺんから何小ブロック下か）', () => {
    const w = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
    w.fill(0, 0, 0, 47, 0, 47, 'bedrock');
    w.fill(0, 1, 0, 47, 19, 47, 'stone');
    w.fill(0, 20, 0, 47, 20, 47, 'grass');
    w.fill(20, 21, 20, 30, 21, 30, 'grass'); // 1 ブロックの段（崖）
    const d = new SectionMesher(w).build(1, 1, 1, 'micro');
    const rows = new Set<number>();
    for (const p of d.pieces) for (let v = 0; v < p.vertexCount; v++) if (p.data[v * 4 + 3] >= 2) rows.add(p.data[v * 4 + 1]);
    expect([...rows].some((r) => r < 255), '地形の横の面に 行の符号').toBe(true);
    expect(Math.max(...[...rows].filter((r) => r < 255))).toBeLessThanOrEqual(17);
  });

  it('同じ種類・同じ行の符号の面は 1 まいにまとまる（符号が同じなら 色が ちがっても つながる）', () => {
    const w = slab(20);
    const m = new SectionMesher(w);
    const d = m.build(1, 1, 1, 'micro');
    // 石の台の上: 地形のてっぺんは 種類が 同じ。面の数は 小ブロックの数より ずっと 少ない
    expect(d.faces).toBeLessThan(144 * 144);
  });

  it('道具 7 種は 平らな箱: 1 こ置くと extras の面が 6 以下（三角形 12 以下）。小ブロックの面は ない', () => {
    for (const id of ['furnace', 'tansu', 'sprinkler', 'brick', 'kawara', 'farmland', 'farmland_wet'] as const) {
      const w = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
      w.setBlock(24, 24, 24, id);
      const d = new SectionMesher(w).build(1, 1, 1, 'micro');
      expect(d.extras.faceCount, id).toBe(6);
      expect(d.extras.indices.length / 3, id).toBeLessThanOrEqual(12);
      expect(d.faces, `${id} の小ブロックの面`).toBe(0);
      expect(d.triangles, id).toBe(12);
    }
  });

  it('石は 平らな箱ではない（でこぼこの形）。鉱石も', () => {
    for (const id of ['stone', 'coal_ore', 'iron_ore'] as const) {
      const w = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
      w.setBlock(24, 24, 24, id);
      const d = new SectionMesher(w).build(1, 1, 1, 'micro');
      expect(d.extras.faceCount, id).toBe(0);
      expect(d.triangles, id).toBeGreaterThan(12 * 3);
    }
  });

  it('平らな箱の面の角の暗がり（AO）: 地面に置いた箱の 横の面の下の角が 暗い。小ブロックの段だけ。上の面は 暗くない', () => {
    const w = slab(20);
    w.setBlock(24, 21, 24, 'brick');
    const micro = new SectionMesher(w).build(1, 1, 1, 'micro');
    const box = new SectionMesher(w).build(1, 1, 1, 'box');
    expect(Math.max(...micro.extras.darks), '小ブロックの段: 暗がりがある').toBeGreaterThan(0.1);
    expect(Math.max(...box.extras.darks), '箱の段: AO なし').toBe(0);
    // 上の面（y = 22）の 4 つの角は ぜんぶ 0
    const pos = micro.extras.positions;
    for (let v = 0; v < pos.length / 3; v++) if (pos[v * 3 + 1] === 22 && pos.slice(v * 3, v * 3 + 3).length === 3) {
      // 上の面の頂点（y = 22）は 横の面の上の角でもある。上の面の 4 角が 0 かどうかは 下の flatAoLevels で見る
    }
    const lv = [0, 0, 0, 0];
    flatAoLevels(w, 24, 21, 24, FACES[0], lv);
    expect(lv).toEqual([0, 0, 0, 0]);
    flatAoLevels(w, 24, 21, 24, FACES[4], lv); // 南の面: 下の角（床と ふれる）は 2（s + c）、上は 0
    expect(lv.slice().sort()).toEqual([0, 0, 2, 2]);
  });

  it('平らな箱の AO: 壁ぎわの 内かどは 3', () => {
    const w = slab(20);
    w.setBlock(24, 21, 24, 'stone');
    w.setBlock(25, 21, 25, 'stone');
    const lv = [0, 0, 0, 0];
    // 24,21,24 の上の面: +x の となりは 空気 (25,22,24)、+z の となりも 空気。斜めの (25,22,25) も空気 → 0
    flatAoLevels(w, 24, 21, 24, FACES[0], lv);
    expect(lv).toEqual([0, 0, 0, 0]);
    w.setBlock(25, 22, 24, 'stone');
    w.setBlock(24, 22, 25, 'stone');
    flatAoLevels(w, 24, 21, 24, FACES[0], lv);
    expect(Math.max(...lv)).toBe(3);
  });

  it('箱の下の地面を 横から見せる: 平らな箱の下の地面（となりの列の地形の てっぺんが 同じ高さ）の 横の面を 作る（基準 9）', () => {
    // 草の地面。まんなかの 1 マスに かまど（かまどの下の草は 地形の列ではなくなる）
    const w = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
    w.fill(0, 0, 0, 47, 0, 47, 'bedrock');
    w.fill(0, 1, 0, 47, 19, 47, 'dirt');
    w.fill(0, 20, 0, 47, 20, 47, 'grass');
    w.setBlock(24, 21, 24, 'furnace');
    const m = new SectionMesher(w);
    const withBox = m.build(1, 1, 1, 'micro');
    // 下の草 (24, 20, 24) の 4 つの横の面が 地形のとなりへ むけて 形の面になる: 面の数が ふえている
    const flat = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
    flat.fill(0, 0, 0, 47, 0, 47, 'bedrock');
    flat.fill(0, 1, 0, 47, 19, 47, 'dirt');
    flat.fill(0, 20, 0, 47, 20, 47, 'grass');
    const without = new SectionMesher(flat).build(1, 1, 1, 'micro');
    expect(withBox.faces).toBeGreaterThan(0);
    // かまどの下の草のブロック（セクションの中 (8, 4, 8) → 小ブロック x 72〜81・y 36〜45・z 72〜81）に 横の面がある
    const inG = (d: SectionMeshData): number => {
      let n = 0;
      for (const p of d.pieces) {
        for (let i = 0; i + 3 < p.vertexCount; i += 4) {
          if (p.data[i * 4 + 3] < 2) continue;
          const xs = [0, 1, 2, 3].map((k) => p.positions[(i + k) * 3]);
          const ys = [0, 1, 2, 3].map((k) => p.positions[(i + k) * 3 + 1]);
          const zs = [0, 1, 2, 3].map((k) => p.positions[(i + k) * 3 + 2]);
          if (Math.min(...xs) >= 72 && Math.max(...xs) <= 81 && Math.min(...zs) >= 72 && Math.max(...zs) <= 81 && Math.min(...ys) >= 36 && Math.max(...ys) <= 45) n++;
        }
      }
      return n;
    };
    expect(inG(withBox), 'かまどの下の草の 横の面（地形のへこみから見える）').toBeGreaterThan(0);
    expect(inG(new SectionMesher(w).build(1, 1, 1, 'box')), '箱の段では 平らな面だけ').toBeLessThanOrEqual(4);
    expect(withBox.extras.faceCount).toBe(5); // 地面の上: 上と 横 4（下は かくれる）
    expect(without.extras.faceCount).toBe(0);
  });

  it('うまり（角の暗がりの 3D テクスチャの中身）は 小ブロックの段で 面があるときだけ。箱の段・面なしは null', () => {
    const w = slab(20);
    const m = new SectionMesher(w);
    const micro = m.build(1, 1, 1, 'micro');
    expect(micro.occupancy).not.toBeNull();
    expect(micro.occupancy!.length).toBe(OCC_BYTES);
    expect(m.build(1, 1, 1, 'box').occupancy).toBeNull();
    expect(m.build(1, 3, 1, 'micro').occupancy).toBeNull();
    // 石の台の中: 小ブロックの 面の となり（y 方向 -1〜）まで うまっている
    let bits = 0;
    for (const b of micro.occupancy!) for (let k = 0; k < 8; k++) bits += (b >> k) & 1;
    expect(bits).toBeGreaterThan(144 * 144 * 5);
  });
});
