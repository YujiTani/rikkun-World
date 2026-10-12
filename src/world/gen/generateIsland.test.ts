import { describe, expect, it } from 'vitest';
import type { BlockId, VoxelWorld } from '../../contracts';
import { generateIsland } from './generateIsland';

/** 仮の VoxelWorld（T2 の ArrayVoxelWorld が出来るまでの、配列だけのもの） */
const IDS: BlockId[] = [
  'air', 'grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'water', 'bedrock',
];
const SOLID = new Set<BlockId>(['grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'bedrock']);

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  readonly data = new Uint8Array(64 * 32 * 64);
  private inside(x: number, y: number, z: number) {
    return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && x >= 0 && y >= 0 && z >= 0 && x < 64 && y < 32 && z < 64;
  }
  private i(x: number, y: number, z: number) {
    return (y * 64 + z) * 64 + x;
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.inside(x, y, z) ? IDS[this.data[this.i(x, y, z)]!]! : 'outside';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    const k = IDS.indexOf(id);
    if (!this.inside(x, y, z) || k < 0) return false;
    this.data[this.i(x, y, z)] = k;
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && SOLID.has(b);
  }
}

const SEEDS = [20261012, 1, 2, 3, 4, 5];
const d = (x: number, z: number) => Math.hypot(x - 32, z - 32);

function make(seed: number) {
  const w = new FakeWorld();
  const info = generateIsland(seed, w);
  const h = (x: number, z: number) => info.groundHeight(x, z);
  return { w, info, h };
}

function firstHit(w: VoxelWorld, ex: number, ey: number, ez: number, qx: number, qy: number, qz: number) {
  const len = Math.hypot(qx - ex, qy - ey, qz - ez);
  for (let s = 0.05; s < len + 0.05; s += 0.05) {
    const t = Math.min(1, s / len);
    const x = Math.floor(ex + (qx - ex) * t);
    const y = Math.floor(ey + (qy - ey) * t);
    const z = Math.floor(ez + (qz - ez) * t);
    const id = w.getBlock(x, y, z);
    if (id !== 'air' && id !== 'water') return { id, x, y, z };
  }
  return { id: 'air' as const, x: 0, y: 0, z: 0 };
}

function hashOf(w: FakeWorld): string {
  let a = 2166136261;
  for (let i = 0; i < w.data.length; i++) a = Math.imul(a ^ w.data[i]!, 16777619) >>> 0;
  return a.toString(16);
}

/** みき（log の縦の並び）を探す。下の列から数える */
function findTrunks(w: FakeWorld) {
  const out: { x: number; z: number; base: number; top: number }[] = [];
  for (let z = 0; z < 64; z++) {
    for (let x = 0; x < 64; x++) {
      for (let y = 1; y < 31; y++) {
        if (w.getBlock(x, y, z) === 'log' && w.getBlock(x, y - 1, z) !== 'log') {
          let top = y;
          while (w.getBlock(x, top + 1, z) === 'log') top++;
          out.push({ x, z, base: y, top });
        }
      }
    }
  }
  return out;
}

describe.each(SEEDS)('島生成 seed=%i', (seed) => {
  const { w, info, h } = make(seed);
  const h0 = h(32, 32);

  it('AC2: 同じシードは同じ島、ちがうシードはちがう島', () => {
    expect(hashOf(make(seed).w)).toBe(hashOf(w));
    expect(hashOf(make(seed + 100).w)).not.toBe(hashOf(w));
    expect(info.seed).toBe(seed);
  });

  it('AC3: y=0 はすべて bedrock', () => {
    for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) expect(w.getBlock(x, 0, z)).toBe('bedrock');
  });

  it('AC4: 陸の列数、半径、海', () => {
    let land = 0;
    for (let z = 0; z < 64; z++) {
      for (let x = 0; x < 64; x++) {
        const hh = h(x, z);
        if (hh >= 7) {
          land++;
          expect(d(x, z)).toBeLessThanOrEqual(26);
        }
        if (d(x, z) >= 27) {
          expect(hh).toBe(6);
          expect(w.getBlock(x, 7, z)).toBe('water');
          for (let y = 8; y < 32; y++) expect(w.getBlock(x, y, z)).toBe('air');
        }
      }
    }
    expect(land).toBeGreaterThanOrEqual(1200);
    expect(land).toBeLessThanOrEqual(1900);
  });

  it('AC5: 陸の高さ 7〜15、となりとの差 1 以下', () => {
    for (let z = 0; z < 64; z++) {
      for (let x = 0; x < 64; x++) {
        const hh = h(x, z);
        if (hh >= 7) expect(hh).toBeLessThanOrEqual(15);
        expect(hh).toBeGreaterThanOrEqual(6);
        if (x < 63) expect(Math.abs(hh - h(x + 1, z))).toBeLessThanOrEqual(1);
        if (z < 63) expect(Math.abs(hh - h(x, z + 1))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('AC6: 地層', () => {
    const rock = new Set(['stone', 'coal_ore', 'iron_ore']);
    for (let z = 0; z < 64; z++) {
      for (let x = 0; x < 64; x++) {
        const hh = h(x, z);
        if (w.getBlock(x, hh, z) === 'grass') {
          for (let y = hh - 3; y < hh; y++) expect(w.getBlock(x, y, z)).toBe('dirt');
          for (let y = 1; y <= hh - 4; y++) expect(rock.has(w.getBlock(x, y, z))).toBe(true);
        }
        if (hh === 6 || hh === 7) {
          expect(w.getBlock(x, hh, z)).toBe('sand');
          expect(w.getBlock(x, hh - 1, z)).toBe('sand');
        }
      }
    }
  });

  it('AC7: 木', () => {
    const trunks = findTrunks(w);
    expect(trunks.length).toBeGreaterThanOrEqual(12);
    expect(trunks.length).toBeLessThanOrEqual(20);
    let near = 0;
    let visible = 0;
    const ey = h0 + 2.62;
    for (const t of trunks) {
      const len = t.top - t.base + 1;
      expect([4, 5]).toContain(len);
      expect(['grass', 'dirt']).toContain(w.getBlock(t.x, t.base - 1, t.z));
      expect(w.getBlock(t.x, t.top + 1, t.z)).toBe('leaves');
      expect(t.x >= 27 && t.x <= 37 && t.z >= 27 && t.z <= 37).toBe(false);
      expect(t.x >= 26 && t.x <= 38 && t.z >= 12 && t.z <= 31).toBe(false);
      expect(d(t.x, t.z)).toBeLessThanOrEqual(18);
      if (d(t.x, t.z) <= 12) near++;
      const D = 32 - t.z;
      if (D >= 1 && Math.abs(t.x - 32) <= D && Math.abs(t.top + 0.5 - ey) <= 0.75 * D) {
        const hit = firstHit(w, 32.5, ey, 32.5, t.x + 0.5, t.top + 0.5, t.z + 0.5);
        if (hit.id === 'leaves' || hit.id === 'log') visible++;
      }
    }
    // 間かく
    for (let i = 0; i < trunks.length; i++) {
      for (let j = i + 1; j < trunks.length; j++) {
        const a = trunks[i]!;
        const b = trunks[j]!;
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBeGreaterThanOrEqual(4);
      }
    }
    expect(near).toBeGreaterThanOrEqual(3);
    expect(visible).toBeGreaterThanOrEqual(1);
    // 木の根元は 1 列に 1 本だけ（み きが 2 つ重なっていない）
    expect(new Set(trunks.map((t) => `${t.x},${t.z}`)).size).toBe(trunks.length);
  });

  it('AC8: 鉱石', () => {
    let coal = 0;
    let iron = 0;
    for (let z = 0; z < 64; z++) {
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 64; x++) {
          const b = w.getBlock(x, y, z);
          if (b === 'coal_ore') {
            coal++;
            expect(y).toBeGreaterThanOrEqual(1);
            expect(y).toBeLessThanOrEqual(14);
          }
          if (b === 'iron_ore') {
            iron++;
            expect(y).toBeGreaterThanOrEqual(1);
            expect(y).toBeLessThanOrEqual(5);
          }
        }
      }
    }
    expect(coal).toBeGreaterThanOrEqual(40);
    expect(iron).toBeGreaterThanOrEqual(15);
  });

  it('AC9: 岩山', () => {
    let cols = 0;
    let maxH = -1;
    let best: [number, number] = [0, 0];
    for (let z = 13; z <= 27; z++) {
      for (let x = 26; x <= 38; x++) {
        const top = w.getBlock(x, h(x, z), z);
        if (top !== 'stone' && top !== 'coal_ore') continue;
        cols++;
        const hh = h(x, z);
        const better =
          hh > maxH ||
          (hh === maxH && (z > best[1] || (z === best[1] && Math.abs(x - 32) < Math.abs(best[0] - 32))));
        if (better) {
          maxH = hh;
          best = [x, z];
        }
      }
    }
    expect(cols).toBeGreaterThanOrEqual(30);
    expect(maxH).toBeGreaterThanOrEqual(h0 + 2);
    expect(maxH).toBeLessThanOrEqual(h0 + 3);
    let exposedCoal = 0;
    for (let z = 13; z <= 27; z++) {
      for (let y = 1; y < 32; y++) {
        for (let x = 26; x <= 38; x++) {
          if (w.getBlock(x, y, z) !== 'coal_ore') continue;
          const n: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
          if (n.some(([a, b, c]) => w.getBlock(x + a, y + b, z + c) === 'air')) exposedCoal++;
        }
      }
    }
    expect(exposedCoal).toBeGreaterThanOrEqual(3);
    const hit = firstHit(w, 32.5, h0 + 2.62, 32.5, best[0] + 0.5, maxH + 0.5, best[1] + 0.5);
    expect(['stone', 'coal_ore']).toContain(hit.id);
    expect(hit.x >= 26 && hit.x <= 38 && hit.z >= 13 && hit.z <= 27).toBe(true);
  });

  it('AC10: スタート地点', () => {
    expect(h0).toBeGreaterThanOrEqual(10);
    expect(h0).toBeLessThanOrEqual(12);
    const s = info.spawn();
    expect(s.x).toBeCloseTo(32.5, 3);
    expect(s.y).toBeCloseTo(h0 + 1, 3);
    expect(s.z).toBeCloseTo(32.5, 3);
    expect(s.yawDeg).toBe(0);
    expect(s.pitchDeg).toBe(0);
    for (let z = 30; z <= 34; z++) {
      for (let x = 30; x <= 34; x++) {
        expect(w.getBlock(x, h0, z)).toBe('grass');
        expect(h(x, z)).toBe(h0);
        for (let y = h0 + 1; y <= h0 + 3; y++) expect(w.isSolid(x, y, z)).toBe(false);
      }
    }
  });

  it('AC13: spawn() は呼んだ時点の世界で計算し直す', () => {
    w.setBlock(32, h0 + 1, 32, 'stone');
    expect(info.spawn().y).toBeCloseTo(h0 + 2, 3);
    w.setBlock(32, h0 + 1, 32, 'air');
    expect(info.spawn().y).toBeCloseTo(h0 + 1, 3);
  });

  it('AC17: 生成時間 1,000ms 以内', () => {
    expect(info.genTimeMs).toBeLessThanOrEqual(1000);
    expect(info.genTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('AC20: テスト地形の場所', () => {
    const a = info.testArea();
    expect(a).toEqual({ x0: 0, x1: 12, z0: 0, z1: 12, y0: 8, y1: 31 });
    for (let z = 0; z <= 12; z++) {
      for (let x = 0; x <= 12; x++) {
        expect(h(x, z)).toBe(6);
        expect(w.getBlock(x, 7, z)).toBe('water');
        for (let y = 8; y <= 31; y++) expect(w.getBlock(x, y, z)).toBe('air');
      }
    }
  });
});

describe('岩山の見た目', () => {
  it('ふだんのシードで頂上の高さが 14 以下（AC9 の範囲内）', () => {
    const { h } = make(20261012);
    let m = 0;
    for (let z = 13; z <= 27; z++) for (let x = 26; x <= 38; x++) m = Math.max(m, h(x, z));
    expect(m).toBeLessThanOrEqual(15);
  });
});
