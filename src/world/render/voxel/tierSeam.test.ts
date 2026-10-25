import { describe, expect, it } from 'vitest';
import { hasLook, occludes } from '../looks';
import { sampleSurface, newSample, type ColumnSource } from '../../micro/microSurface';
import { scanColumn, type ColumnInfo } from '../../micro/worldColumns';
import { BLOCK_INDEX, isOpaqueIndex } from '../../blocks/blockTypes';
import { populateWorld } from '../../gen/populate';
import { ArrayVoxelWorld } from '../../VoxelWorld';
import { SectionMesher, type MeshTier } from './sectionMesher';

/**
 * 小ブロックの段と箱の段の境目のすき間（issue #143、docs/tickets/SEAM.md、受け入れ基準 1・2・3）。
 *
 * となりあう 2 つのセクション A（cx）と B（cx+1）（z の向きも同じ）を、
 * 「小ブロック｜箱」「箱｜小ブロック」「小ブロック｜小ブロック」で作る。
 * 境目の面の 1 小ブロック (y, t) ごとに、A がわ・B がわが「つまっているか」を メッシュを見ずに 世界と式だけで決める:
 *   - 小ブロック段で、地面の表面ブロック（scanColumn の ty）の列で、y が ty*9 以上: y < S（小ブロック地形の高さ）
 *   - それ以外（箱の段・表面より下のブロック）: ブロック単位（固くて面をかくす種類か）
 *   - 両がわのブロックが 地面の種類か空気のときだけ調べる（木・葉・建物・水は とばす）
 * 片がわが つまっていて 反対がわが空いていれば、つまっているがわから空いているがわへ向く面が A か B のメッシュに無ければならない。
 * 期待: 調べた面 > 0、ぬけている面 = 0。
 */

const N = 9;
const SEC = 16 * N; // セクション 1 つの小ブロック数（144）
const P = 154;

/** 地面の種類（worldColumns の GROUND と同じ）か 空気のときだけ調べる */
const GROUND = new Set<number>(
  ['grass', 'dirt', 'sand', 'stone', 'coal_ore', 'iron_ore', 'bedrock'].map((id) => (BLOCK_INDEX as Record<string, number>)[id]),
);

function closed(k: number): boolean {
  return hasLook(k) ? occludes(k) : isOpaqueIndex(k);
}

class Columns implements ColumnSource {
  private readonly cache = new Map<number, ColumnInfo>();
  private readonly hCache = new Map<number, number>();
  private readonly tmp = newSample();
  constructor(private readonly world: ArrayVoxelWorld) {}
  info(bx: number, bz: number): ColumnInfo {
    const key = (bx + 4096) * 8192 + (bz + 4096);
    let c = this.cache.get(key);
    if (!c) {
      c = { ty: -1, kind: 0, reach: 0, rockOk: false };
      scanColumn(this.world, bx, bz, c);
      this.cache.set(key, c);
    }
    return c;
  }
  surfaceY(bx: number, bz: number): number {
    return this.info(bx, bz).ty;
  }
  reach(bx: number, bz: number): number {
    return this.info(bx, bz).reach;
  }
  rockOk(bx: number, bz: number): boolean {
    return this.info(bx, bz).rockOk;
  }
  surfaceH(mx: number, mz: number): number {
    const key = (mx + 40000) * 100000 + (mz + 40000);
    let h = this.hCache.get(key);
    if (h === undefined) {
      sampleSurface(mx, mz, this, this.tmp);
      h = this.tmp.h;
      this.hCache.set(key, h);
    }
    return h;
  }
}

/** 小ブロック (mx, my, mz) が つまっている(1)・空いている(0)・調べない(-1) */
function cell(world: ArrayVoxelWorld, cols: Columns, tier: MeshTier, mx: number, my: number, mz: number, dx: number, dz: number): number {
  const bx = Math.floor(mx / N);
  const by = Math.floor(my / N);
  const bz = Math.floor(mz / N);
  const k = world.getIndex(bx, by, bz);
  if (k < 0) return -1;
  if (k !== 0 && !GROUND.has(k)) return -1;
  if (tier === 'micro') {
    const ty = cols.info(bx, bz).ty;
    if (ty >= 0 && my >= ty * N) return my < cols.surfaceH(mx, mz) ? 1 : 0;
  }
  if (k > 0 && closed(k)) {
    // 小ブロック段の表面でない固いブロックは、境目の向こうがわのブロックが空気など(closed でない)だと、
    // 1 ブロック単位で見える面が Look(fillBlockLook)で 1〜3 小ブロック けずられ、面は境目ではなく奥に出る。Look の形なので調べない
    if (tier === 'micro') {
      const k2 = world.getIndex(bx + dx, by, bz + dz);
      if (k2 <= 0 || !closed(k2)) return -1;
    }
    return 1;
  }
  return 0;
}

/** セクションの境の面の印: 添字 = y * P + t（t = もう 1 つの横の座標）。axis 0 = x の境、1 = z の境。hi = 自分の +がわの境（面の置き場 144）、lo = -がわ（0） */
interface Borders {
  xHi: Set<number>;
  xLo: Set<number>;
  zHi: Set<number>;
  zLo: Set<number>;
}

class Meshes {
  private readonly mesher: SectionMesher;
  private readonly cache = new Map<string, Borders>();
  constructor(world: ArrayVoxelWorld) {
    this.mesher = new SectionMesher(world);
  }
  get(cx: number, sy: number, cz: number, tier: MeshTier): Borders {
    const key = `${cx},${sy},${cz},${tier}`;
    let b = this.cache.get(key);
    if (b) return b;
    b = { xHi: new Set(), xLo: new Set(), zHi: new Set(), zLo: new Set() };
    const data = this.mesher.build(cx, sy, cz, tier);
    for (const piece of data.pieces) {
      for (let q = 0; q + 3 < piece.vertexCount; q += 4) {
        const f = piece.data[q * 4 + 3] & 7;
        if (f < 2) continue;
        const ax = f < 4 ? 0 : 2;
        const plane = piece.positions[q * 3 + ax];
        if (plane !== 0 && plane !== SEC) continue;
        const hi = plane === SEC;
        if (hi !== (f === 2 || f === 4)) continue; // 置き場が +がわなら +向き、-がわなら -向きの面だけ
        let y0 = 9999;
        let y1 = -1;
        let t0 = 9999;
        let t1 = -1;
        const ta = ax === 0 ? 2 : 0;
        for (let i = 0; i < 4; i++) {
          const vy = piece.positions[(q + i) * 3 + 1];
          const vt = piece.positions[(q + i) * 3 + ta];
          if (vy < y0) y0 = vy;
          if (vy > y1) y1 = vy;
          if (vt < t0) t0 = vt;
          if (vt > t1) t1 = vt;
        }
        const set = ax === 0 ? (hi ? b.xHi : b.xLo) : hi ? b.zHi : b.zLo;
        for (let y = y0; y < y1; y++) for (let t = t0; t < t1; t++) set.add(y * P + t);
      }
    }
    this.cache.set(key, b);
    return b;
  }
}

export interface SeamCount {
  checked: number;
  faces: number;
}

/** A = (cx, sy, cz)、B = x の向きなら (cx+1, sy, cz)、z の向きなら (cx, sy, cz+1)。境目の面を数える */
function countSeam(
  world: ArrayVoxelWorld,
  cols: Columns,
  meshes: Meshes,
  axis: 'x' | 'z',
  cx: number,
  sy: number,
  cz: number,
  tierA: MeshTier,
  tierB: MeshTier,
): SeamCount {
  const out: SeamCount = { checked: 0, faces: 0 };
  const bx = axis === 'x' ? cx + 1 : cx;
  const bz = axis === 'x' ? cz : cz + 1;
  const a = meshes.get(cx, sy, cz, tierA);
  const b = meshes.get(bx, sy, bz, tierB);
  // + 向き（A がつまり B が空き）の面は A の +がわの境、- 向き（B がつまり A が空き）の面は B の -がわの境に ある
  const plusSet = axis === 'x' ? a.xHi : a.zHi;
  const minusSet = axis === 'x' ? b.xLo : b.zLo;
  const border = (axis === 'x' ? cx + 1 : cz + 1) * SEC;
  for (let y = 0; y < SEC; y++) {
    for (let t = 0; t < SEC; t++) {
      const my = sy * SEC + y;
      const mt = (axis === 'x' ? cz : cx) * SEC + t;
      const sa = axis === 'x' ? cell(world, cols, tierA, border - 1, my, mt, 1, 0) : cell(world, cols, tierA, mt, my, border - 1, 0, 1);
      const sb = axis === 'x' ? cell(world, cols, tierB, border, my, mt, -1, 0) : cell(world, cols, tierB, mt, my, border, 0, -1);
      if (sa < 0 || sb < 0 || sa === sb) continue;
      out.checked++;
      // つまっているがわから空いているがわへ向く面。+ 向き(A がつまり) は A の hi 面、- 向き(B がつまり) は B の lo 面
      // （反対がわのメッシュが同じ場所に 逆向きの面を作ることはないので、この 2 つで 十分）
      const has = sa === 1 ? plusSet.has(y * P + t) : minusSet.has(y * P + t);
      if (!has) out.faces++;
    }
  }
  return out;
}

const COMBOS: [MeshTier, MeshTier][] = [
  ['micro', 'box'],
  ['box', 'micro'],
  ['micro', 'micro'],
];

// ------------------------------------------------------------ 手作りの地形

const SIZE = 48;
const TOP = 20;
const HEAVY = { timeout: 60_000 };

function terrain(topAt: (x: number, z: number) => number, sx = SIZE, sz = SIZE): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: sx, y: 48, z: sz });
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const t = topAt(x, z);
      w.setBlock(x, 0, z, 'bedrock');
      w.fill(x, 1, z, x, t - 3, z, 'stone');
      w.fill(x, t - 2, z, x, t - 1, z, 'dirt');
      w.setBlock(x, t, z, 'grass');
    }
  }
  return w;
}

/** x の境(セクション 1|2)と z の境(1|2)を、3 つの組み合わせ・地面をふくむ縦のセクションで数える */
function countHand(w: ArrayVoxelWorld, axis: 'x' | 'z', combo: [MeshTier, MeshTier]): SeamCount {
  const cols = new Columns(w);
  const meshes = new Meshes(w);
  const total: SeamCount = { checked: 0, faces: 0 };
  for (let sy = 0; sy < 3; sy++) {
    for (let o = 0; o < 3; o++) {
      const r = axis === 'x' ? countSeam(w, cols, meshes, 'x', 1, sy, o, combo[0], combo[1]) : countSeam(w, cols, meshes, 'z', o, sy, 1, combo[0], combo[1]);
      total.checked += r.checked;
      total.faces += r.faces;
    }
  }
  return total;
}

/** 境目は ブロック 32（セクション 1|2 の間）。x の向きの崖は 境目から 'off' ブロックずれた所 */
const shapes: { name: string; make: (axis: 'x' | 'z') => ArrayVoxelWorld }[] = [
  { name: '平ら', make: () => terrain(() => TOP) },
  ...[1, 2].flatMap((d) =>
    [
      { name: `崖 ${d} ブロック（境目より 3 ブロック手前で段になる）`, at: 29 },
      { name: `崖 ${d} ブロック（ちょうど境目で段になる）`, at: 32 },
      { name: `崖 ${d} ブロック（境目より 3 ブロック先で段になる）`, at: 35 },
    ].map((s) => ({
      name: s.name,
      make: (axis: 'x' | 'z') => terrain((x, z) => ((axis === 'x' ? x : z) < s.at ? TOP : TOP + d)),
    })),
  ),
  ...[1, 2].flatMap((d) =>
    [
      { name: `くだり崖 ${d} ブロック（ちょうど境目）`, at: 32 },
      { name: `くだり崖 ${d} ブロック（境目より 2 ブロック手前）`, at: 30 },
    ].map((s) => ({
      name: s.name,
      make: (axis: 'x' | 'z') => terrain((x, z) => ((axis === 'x' ? x : z) < s.at ? TOP + d : TOP)),
    })),
  ),
  ...[1, 2].map((d) => ({
    name: `境目の上のくぼみ（深さ ${d}。境目をまたぐ）`,
    make: (axis: 'x' | 'z') =>
      terrain((x, z) => {
        const t = axis === 'x' ? x : z;
        const o = axis === 'x' ? z : x;
        return t >= 28 && t < 36 && o >= 16 && o < 32 ? TOP - d : TOP;
      }),
  })),
];

describe('境目の面（#143）: 手作りの地形', () => {
  for (const shape of shapes) {
    for (const axis of ['x', 'z'] as const) {
      it(`${shape.name} / ${axis} の向き: 3 つの組み合わせとも ぬけている面 0（調べた面は 0 でない）`, HEAVY, () => {
        const w = shape.make(axis);
        let checked = 0;
        const msgs: string[] = [];
        let faces = 0;
        for (const combo of COMBOS) {
          const r = countHand(w, axis, combo);
          checked += r.checked;
          faces += r.faces;
          msgs.push(`${combo[0]}｜${combo[1]}: ぬけ ${r.faces} / 調べた ${r.checked}`);
        }
        if (shape.name !== '平ら') expect(checked, '調べた面が 0 だと何も確かめていない').toBeGreaterThan(0);
        expect(faces, msgs.join(' ; ')).toBe(0);
      });
    }
  }

  it('数え方の確認: 平らでも 小ブロック｜箱 では S と 箱の上のへりの差で 調べる面が出る（境目の面を 0 件しか見ないテストにしない）', HEAVY, () => {
    const w = terrain(() => TOP);
    const total = COMBOS.map((c) => countHand(w, 'x', c).checked).reduce((p, n) => p + n, 0) + COMBOS.map((c) => countHand(w, 'z', c).checked).reduce((p, n) => p + n, 0);
    // 平らな地面でも 小ブロックの S は上のへりより高い・低い所がある。どれも 0 なら 数え方が動いていない
    const cliff = terrain((x) => (x < 32 ? TOP : TOP + 2));
    const c = countHand(cliff, 'x', ['micro', 'box']);
    expect(c.checked + total).toBeGreaterThan(0);
    expect(c.checked, '崖のある境目で 調べた面が 0').toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------ いつもの島

describe('境目の面（#143）: いつもの島（seed 20261012）', () => {
  it('x の向き・z の向きの境目それぞれ 50 か所以上で、3 つの組み合わせとも ぬけている面 0', { timeout: 120_000 }, () => {
    const w = new ArrayVoxelWorld({ x: 0, z: 0 });
    populateWorld(w, 20261012);
    const cols = new Columns(w);
    const meshes = new Meshes(w);
    const per: Record<string, { seams: number; checked: number; faces: number }> = {};
    const ns = 8; // 128 / 16
    for (const axis of ['x', 'z'] as const) {
      for (const combo of COMBOS) {
        per[`${axis} ${combo[0]}｜${combo[1]}`] = { seams: 0, checked: 0, faces: 0 };
      }
      for (let i = 0; i < ns; i++) {
        for (let j = 0; j < ns - 1; j++) {
          const cx = axis === 'x' ? j : i;
          const cz = axis === 'x' ? i : j;
          // 境目の両がわの列の 地面の高さから 調べる縦のセクションを決める
          const sys = new Set<number>();
          const lines: [number, number][] = [];
          for (let t = 0; t < 16; t++) {
            if (axis === 'x') lines.push([(cx + 1) * 16 - 1, cz * 16 + t], [(cx + 1) * 16, cz * 16 + t]);
            else lines.push([cx * 16 + t, (cz + 1) * 16 - 1], [cx * 16 + t, (cz + 1) * 16]);
          }
          for (const [bx, bz] of lines) {
            const ty = cols.info(bx, bz).ty;
            if (ty >= 0) {
              sys.add(Math.floor(ty / 16));
              sys.add(Math.floor((ty + 1) / 16));
            }
          }
          if (sys.size === 0) continue;
          for (const combo of COMBOS) {
            const rec = per[`${axis} ${combo[0]}｜${combo[1]}`];
            rec.seams++;
            for (const sy of sys) {
              const r = countSeam(w, cols, meshes, axis, cx, sy, cz, combo[0], combo[1]);
              rec.checked += r.checked;
              rec.faces += r.faces;
            }
          }
        }
      }
    }
    console.log('SEAM island', JSON.stringify(per));
    for (const [name, r] of Object.entries(per)) {
      expect(r.seams, `${name}: 調べた境目の数`).toBeGreaterThanOrEqual(50);
      expect(r.checked, `${name}: 調べた面が 0 だと何も確かめていない`).toBeGreaterThan(0);
      expect(r.faces, `${name}: ぬけている面`).toBe(0);
    }
  });
});
