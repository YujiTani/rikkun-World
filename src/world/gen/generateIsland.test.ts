import { describe, expect, it } from 'vitest';
import type { BlockId, VoxelWorld, WorldRegions } from '../../contracts';
import { WORLD_SIZE } from '../../contracts';
import { generateIsland } from './generateIsland';

/** 仮の VoxelWorld（配列だけのもの） */
const IDS: BlockId[] = [
  'air', 'grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'water', 'bedrock', 'torch', 'start_torch',
];
const SOLID = new Set<BlockId>(['grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'bedrock']);
const SX = WORLD_SIZE.x;
const SY = WORLD_SIZE.y;
const SZ = WORLD_SIZE.z;

class FakeWorld implements VoxelWorld {
  readonly size = { x: SX, y: SY, z: SZ };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  readonly data = new Uint8Array(SX * SY * SZ);
  private inside(x: number, y: number, z: number) {
    return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;
  }
  private i(x: number, y: number, z: number) {
    return (y * SZ + z) * SX + x;
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

const SEEDS = [20261012, ...Array.from({ length: 19 }, (_, i) => i + 1)];
const d = (x: number, z: number) => Math.hypot(x - 64, z - 64);

function make(seed: number) {
  const w = new FakeWorld();
  const info = generateIsland(seed, w);
  const h = (x: number, z: number) => info.groundHeight(x, z);
  return { w, info, h, R: info.regions() };
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

function findTrunks(w: FakeWorld) {
  const out: { x: number; z: number; base: number; top: number }[] = [];
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      for (let y = 1; y < SY - 1; y++) {
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

const inRect = (x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }) =>
  x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const inCircle = (x: number, z: number, c: { cx: number; cz: number; r: number }) => Math.hypot(x - c.cx, z - c.cz) <= c.r;
const isRock = (id: string) => id === 'stone' || id === 'coal_ore' || id === 'iron_ore';

/** みず の列の種類 */
function isFresh(x: number, z: number, R: WorldRegions): boolean {
  return inCircle(x, z, R.spring) || inCircle(x, z, R.pond) || R.river.some((r) => inRect(x, z, r));
}

describe.each(SEEDS)('世界生成 seed=%i', (seed) => {
  const { w, info, h, R } = make(seed);
  const h0 = h(64, 64);

  it('AC2: 同じシードは同じ世界、ちがうシードはちがう世界', () => {
    expect(hashOf(make(seed).w)).toBe(hashOf(w));
    expect(hashOf(make(seed + 100).w)).not.toBe(hashOf(w));
    expect(info.seed).toBe(seed);
    expect(w.size).toEqual({ x: 128, y: 48, z: 128 });
  });

  it('AC3: うみ・陸の範囲と列数', () => {
    let land = 0;
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const hh = h(x, z);
        if (hh >= 7) {
          land++;
          expect(d(x, z)).toBeLessThanOrEqual(62);
        }
        if (d(x, z) >= 62) {
          expect(hh).toBe(6);
          expect(w.getBlock(x, 7, z)).toBe('water');
        }
      }
    }
    expect(land).toBeGreaterThanOrEqual(10800);
    expect(land).toBeLessThanOrEqual(12000);
  });

  it('AC4: 段差 1 以下・みず は y=7 だけ・みず の列は うみ か かわ・いずみ・いけ', () => {
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const hh = h(x, z);
        expect(hh).toBeGreaterThanOrEqual(6);
        if (x < SX - 1) expect(Math.abs(hh - h(x + 1, z))).toBeLessThanOrEqual(1);
        if (z < SZ - 1) expect(Math.abs(hh - h(x, z + 1))).toBeLessThanOrEqual(1);
        let waterY = -1;
        for (let y = 0; y < SY; y++) {
          if (w.getBlock(x, y, z) === 'water') {
            expect(waterY).toBe(-1);
            waterY = y;
          }
        }
        if (waterY >= 0) {
          expect(waterY).toBe(7);
          expect(hh).toBe(6);
          // うみ は d ≥ 60 の外（岸の最小）
          expect(d(x, z) >= 60 || isFresh(x, z, R)).toBe(true);
        }
        // 陸の列に みず は無い（かわ・いずみ・いけ・うみ 以外）
        if (hh === 6) expect(waterY).toBe(7);
      }
    }
  });

  it('AC5: やま の頂上と高さ', () => {
    const m = R.mountain;
    expect(m.r).toBe(18);
    expect(Math.hypot(m.peak.x - m.cx, m.peak.z - m.cz)).toBeLessThanOrEqual(4);
    expect(m.peak.h).toBeGreaterThanOrEqual(22);
    expect(m.peak.h).toBeLessThanOrEqual(25);
    expect(h(m.peak.x, m.peak.z)).toBe(m.peak.h);
    let maxH = 0;
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const hh = h(x, z);
        maxH = Math.max(maxH, hh);
        if (inCircle(x, z, { cx: m.cx, cz: m.cz, r: m.r }) && hh >= 17) {
          expect(isRock(w.getBlock(x, hh, z))).toBe(true);
        }
        if (hh >= 7 && hh > 16 && !inCircle(x, z, { cx: m.cx, cz: m.cz, r: m.r })) {
          expect(inCircle(x, z, R.rock)).toBe(true);
        }
        if (hh > 16) expect(inCircle(x, z, { cx: m.cx, cz: m.cz, r: m.r })).toBe(true);
      }
    }
    expect(maxH).toBe(m.peak.h);
  });

  it('AC6: スタート', () => {
    expect(h0).toBeGreaterThanOrEqual(10);
    expect(h0).toBeLessThanOrEqual(12);
    expect(R.startH0).toBe(h0);
    for (let z = 62; z <= 66; z++) {
      for (let x = 62; x <= 66; x++) {
        expect(w.getBlock(x, h0, z)).toBe('grass');
        expect(h(x, z)).toBe(h0);
        for (let y = h0 + 1; y <= h0 + 3; y++) expect(w.isSolid(x, y, z) && !(x === 66 && z === 63 && y === h0 + 1)).toBe(false);
      }
    }
    const s = info.spawn();
    expect(s).toEqual({ x: 64.5, y: h0 + 1, z: 64.5, yawDeg: 0, pitchDeg: 0 });
    expect(w.getBlock(66, h0 + 1, 63)).toBe('start_torch');
  });

  it('AC6b: spawn() は呼んだ時点の世界で計算し直す', () => {
    w.setBlock(64, h0 + 1, 64, 'stone');
    expect(info.spawn().y).toBeCloseTo(h0 + 2, 3);
    w.setBlock(64, h0 + 1, 64, 'air');
    expect(info.spawn().y).toBeCloseTo(h0 + 1, 3);
  });

  it('AC7: 岩山と木の見通し', () => {
    const ey = h0 + 2.62;
    let cols = 0;
    let maxH = -1;
    let best: [number, number] = [0, 0];
    for (let z = 45; z <= 59; z++) {
      for (let x = 58; x <= 70; x++) {
        const top = w.getBlock(x, h(x, z), z);
        if (top !== 'stone' && top !== 'coal_ore') continue;
        cols++;
        const hh = h(x, z);
        const better = hh > maxH || (hh === maxH && (z > best[1] || (z === best[1] && Math.abs(x - 64) < Math.abs(best[0] - 64))));
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
    for (let z = 45; z <= 59; z++) {
      for (let y = 1; y < SY; y++) {
        for (let x = 58; x <= 70; x++) {
          if (w.getBlock(x, y, z) !== 'coal_ore') continue;
          const n: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
          if (n.some(([a, b, c]) => w.getBlock(x + a, y + b, z + c) === 'air')) exposedCoal++;
        }
      }
    }
    expect(exposedCoal).toBeGreaterThanOrEqual(3);
    const hit = firstHit(w, 64.5, ey, 64.5, best[0] + 0.5, maxH + 0.5, best[1] + 0.5);
    expect(['stone', 'coal_ore']).toContain(hit.id);
    expect(hit.x >= 58 && hit.x <= 70 && hit.z >= 45 && hit.z <= 59).toBe(true);

    const trunks = findTrunks(w);
    let near = 0;
    let visible = 0;
    for (const t of trunks) {
      expect(t.x >= 59 && t.x <= 69 && t.z >= 59 && t.z <= 69).toBe(false);
      expect(t.x >= 58 && t.x <= 70 && t.z >= 44 && t.z <= 63).toBe(false);
      if (d(t.x, t.z) <= 12) near++;
      const D = 64 - t.z;
      if (D >= 1 && Math.abs(t.x - 64) <= D && Math.abs(t.top + 0.5 - ey) <= 0.75 * D) {
        const ht = firstHit(w, 64.5, ey, 64.5, t.x + 0.5, t.top + 0.5, t.z + 0.5);
        if (ht.id === 'leaves' || ht.id === 'log') visible++;
      }
    }
    expect(near).toBeGreaterThanOrEqual(3);
    expect(visible).toBeGreaterThanOrEqual(1);
  });

  it('AC8: ひらち', () => {
    const f = R.flat;
    expect(f.x1 - f.x0 + 1).toBe(24);
    expect(f.z1 - f.z0 + 1).toBe(20);
    expect(f.x0).toBeGreaterThanOrEqual(84);
    expect(f.x0).toBeLessThanOrEqual(88);
    expect(f.z0).toBeGreaterThanOrEqual(52);
    expect(f.z0).toBeLessThanOrEqual(58);
    let near = 0;
    for (let z = f.z0; z <= f.z1; z++) {
      for (let x = f.x0; x <= f.x1; x++) {
        expect(w.getBlock(x, 7, z)).toBe('grass');
        expect(h(x, z)).toBe(7);
        for (let y = 8; y < SY; y++) expect(w.getBlock(x, y, z)).toBe('air');
        let ok = false;
        for (let dz = -4; dz <= 4 && !ok; dz++) {
          for (let dx = -4; dx <= 4; dx++) {
            if (R.river.some((r) => inRect(x + dx, z + dz, r)) && w.getBlock(x + dx, 7, z + dz) === 'water') {
              ok = true;
              break;
            }
          }
        }
        if (ok) near++;
      }
    }
    expect(near).toBeGreaterThanOrEqual(150);
  });

  it('AC9: かわ はつながり、はば 3、d ≥ 16', () => {
    const seen = new Set<number>();
    const stack: [number, number][] = [];
    // いずみ の中心から
    stack.push([R.spring.cx, R.spring.cz]);
    seen.add(R.spring.cz * SX + R.spring.cx);
    let reachedSea = false;
    while (stack.length) {
      const [x, z] = stack.pop()!;
      if (d(x, z) >= 62) reachedSea = true;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + a;
        const nz = z + b;
        if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) continue;
        if (seen.has(nz * SX + nx) || w.getBlock(nx, 7, nz) !== 'water') continue;
        seen.add(nz * SX + nx);
        stack.push([nx, nz]);
      }
    }
    expect(reachedSea).toBe(true);
    expect(R.river).toHaveLength(2);
    for (const r of R.river) {
      expect(Math.min(r.x1 - r.x0 + 1, r.z1 - r.z0 + 1)).toBe(3);
      for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) if (d(x, z) < 62) expect(h(x, z)).toBe(6);
    }
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        if (R.river.some((r) => inRect(x, z, r))) expect(d(x, z)).toBeGreaterThanOrEqual(16);
      }
    }
    // いずみ の みず の列
    let sp = 0;
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) if (inCircle(x, z, R.spring)) sp++;
    expect(sp).toBeGreaterThanOrEqual(21);
    expect(sp).toBeLessThanOrEqual(37);
  });

  it('AC10: くさはら と いけ', () => {
    const m = R.meadow;
    expect(Math.hypot(R.pond.cx - m.cx, R.pond.cz - m.cz)).toBeLessThanOrEqual(6);
    let grassTop = 0;
    let pondCols = 0;
    let trunkCount = 0;
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        if (inCircle(x, z, R.pond)) pondCols++;
        if (!inCircle(x, z, m)) continue;
        const hh = h(x, z);
        if (inCircle(x, z, R.pond)) {
          expect(hh).toBe(6);
          continue;
        }
        let rimCol = false;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inCircle(x + dx, z + dz, R.pond)) rimCol = true;
        if (rimCol) expect(hh).toBe(7);
        else {
          expect(hh).toBeGreaterThanOrEqual(8);
          expect(hh).toBeLessThanOrEqual(11);
        }
        expect(w.getBlock(x, hh, z)).toBe('grass');
        grassTop++;
        if (w.getBlock(x, hh + 1, z) === 'log') trunkCount++;
      }
    }
    expect(pondCols).toBeGreaterThanOrEqual(21);
    expect(pondCols).toBeLessThanOrEqual(55);
    expect(grassTop).toBeGreaterThanOrEqual(380);
    expect(trunkCount).toBeLessThanOrEqual(2);
  });

  it('AC11: 木', () => {
    const trunks = findTrunks(w);
    expect(trunks.length).toBeGreaterThanOrEqual(70);
    expect(trunks.length).toBeLessThanOrEqual(130);
    const inForest = trunks.filter((t) => inCircle(t.x, t.z, R.forest));
    expect(inForest.length).toBeGreaterThanOrEqual(25);
    for (const t of trunks) {
      const len = t.top - t.base + 1;
      expect([4, 5]).toContain(len);
      expect(w.getBlock(t.x, t.base - 1, t.z)).toBe('grass');
      expect(w.getBlock(t.x, t.top + 1, t.z)).toBe('leaves');
      const hh = h(t.x, t.z);
      expect(hh).toBeLessThan(17);
      expect(hh).toBe(t.base - 1);
      expect(inRect(t.x, t.z, R.flat)).toBe(false);
      expect(isFresh(t.x, t.z, R)).toBe(false);
      expect(inCircle(t.x, t.z, R.rock)).toBe(false);
    }
    for (let i = 0; i < trunks.length; i++) {
      for (let j = i + 1; j < trunks.length; j++) {
        const a = trunks[i]!;
        const b = trunks[j]!;
        const both = inCircle(a.x, a.z, R.forest) && inCircle(b.x, b.z, R.forest);
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBeGreaterThanOrEqual(both ? 3 : 4);
      }
    }
    // ひらち の上の はっぱ なし（AC8）は AC8 で確認
  });

  it('AC12: 鉱石', () => {
    let coal = 0;
    let iron = 0;
    let mCoal = 0;
    let mIron = 0;
    let sCoal = 0;
    let sIron = 0;
    const m = R.mountain;
    for (let z = 0; z < SZ; z++) {
      for (let y = 0; y < SY; y++) {
        for (let x = 0; x < SX; x++) {
          const b = w.getBlock(x, y, z);
          if (b !== 'coal_ore' && b !== 'iron_ore') continue;
          if (b === 'coal_ore') coal++;
          else iron++;
          if (!inCircle(x, z, { cx: m.cx, cz: m.cz, r: m.r }) || y < 8) continue;
          if (b === 'coal_ore') mCoal++;
          else if (y <= 20) mIron++;
          const n: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
          if (n.some(([a, bb, c]) => w.getBlock(x + a, y + bb, z + c) === 'air')) {
            if (b === 'coal_ore') sCoal++;
            else if (y <= 20 || true) sIron++;
          }
        }
      }
    }
    expect(coal).toBeGreaterThanOrEqual(300);
    expect(iron).toBeGreaterThanOrEqual(100);
    expect(mCoal).toBeGreaterThanOrEqual(120);
    expect(mIron).toBeGreaterThanOrEqual(50);
    expect(sCoal).toBeGreaterThanOrEqual(12);
    expect(sIron).toBeGreaterThanOrEqual(6);
  });

  it('AC13: テスト地形の場所', () => {
    expect(info.testArea()).toEqual({ x0: 0, x1: 12, z0: 0, z1: 12, y0: 8, y1: 47 });
    for (let z = 0; z <= 12; z++) {
      for (let x = 0; x <= 12; x++) {
        expect(w.getBlock(x, 0, z)).toBe('bedrock');
        expect(w.getBlock(x, 5, z)).toBe('sand');
        expect(w.getBlock(x, 6, z)).toBe('sand');
        expect(w.getBlock(x, 7, z)).toBe('water');
        for (let y = 8; y <= 47; y++) expect(w.getBlock(x, y, z)).toBe('air');
      }
    }
  });

  it('地層・すな', () => {
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const hh = h(x, z);
        if (w.getBlock(x, hh, z) === 'grass') {
          for (let y = hh - 3; y < hh; y++) expect(w.getBlock(x, y, z)).toBe('dirt');
          for (let y = 1; y <= hh - 4; y++) expect(isRock(w.getBlock(x, y, z))).toBe(true);
        }
        if (w.getBlock(x, hh, z) === 'sand' && hh === 7) {
          // すな は うみ から 3 マス以内（x・z とも）
          let near = false;
          for (let dz = -3; dz <= 3 && !near; dz++) {
            for (let dx = -3; dx <= 3; dx++) {
              const xx = x + dx;
              const zz = z + dz;
              if (xx >= 0 && zz >= 0 && xx < SX && zz < SZ && d(xx, zz) >= 60 && h(xx, zz) === 6) {
                near = true;
                break;
              }
            }
          }
          expect(near).toBe(true);
        }
      }
    }
  });

  it('生成時間', () => {
    expect(info.genTimeMs).toBeGreaterThanOrEqual(0);
    expect(info.genTimeMs).toBeLessThanOrEqual(1500);
  });
});
