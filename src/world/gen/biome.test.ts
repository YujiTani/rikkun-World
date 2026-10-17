import { beforeAll, describe, expect, it } from 'vitest';
import { SEA_Y } from '../../contracts';
import {
  COUNTRY_KINDS,
  MOUNTAIN_KINDS,
  columnCounts,
  countryAt,
  countryCell,
  groundAt,
  mountainFrame,
  mountainShapeAt,
  pondsOf,
  takePath,
  type CountryKind,
} from './biome';
import { GEN_CONFIG as C } from './config';
import { clearTerrainCache, spawnOf, terrainFor } from './terrain';
import { treesInRect } from './trees';

/**
 * #184 VOX-I-1 地形（docs/design/VOX-I.md 5 版 §9 の #184-AC1〜13）のユニットテスト。
 * 名前・形の約束は docs/tickets/VOX-I-1.md の「つなぎ目」。数は仕様の数のまま（変えない。足りなければ designer へ差し戻す）。
 * 実装の前は `./biome` が無いので、ここは赤になる。
 */

const SEEDS = [20261012, 1, 777];
const CELL = 112;
const AX = 64;
const AZ = 64;
/** 8192 ブロック四方 = 升目 73×73（番号 −36〜36）。山のわく（4×4 升目）の番号は floor((i + 2) / 4) = −9〜9 */
const R = 36;
const FR = 9;
const cellRange: number[] = Array.from({ length: 2 * R + 1 }, (_, k) => k - R);
const frameRange: number[] = Array.from({ length: 2 * FR + 1 }, (_, k) => k - FR);
const BLEND = C.biome.blend;

interface Mtn {
  kind: CountryKind;
  i: number;
  j: number;
  px: number;
  pz: number;
}
const mtnCache = new Map<number, Mtn[]>();
function mountainsOf(seed: number): Mtn[] {
  let v = mtnCache.get(seed);
  if (v) return v;
  v = [];
  for (const fz of frameRange) {
    for (const fx of frameRange) {
      const m = mountainFrame(seed, fx, fz).mountain;
      if (m) v.push({ kind: m.kind, i: m.i, j: m.j, px: m.px, pz: m.pz });
    }
  }
  mtnCache.set(seed, v);
  return v;
}

interface Sample {
  x: number;
  z: number;
  country: CountryKind;
  e: number;
  cx: number;
  cz: number;
  h: number;
  base: number;
  lift: number;
  top: string;
}
const sampleCache = new Map<number, Sample[]>();
/** 8192 四方を 20 ブロックおき ＋ 山のまわり（点から 80 以内を 4 ブロックおき）の列を、地面の関数に聞いた表 */
function samplesOf(seed: number): Sample[] {
  let v = sampleCache.get(seed);
  if (v) return v;
  v = [];
  const add = (x: number, z: number): void => {
    const c = countryAt(seed, x, z);
    const g = groundAt(seed, x, z);
    v!.push({ x, z, country: c.kind, e: c.e, cx: c.cx, cz: c.cz, h: g.h, base: g.base, lift: g.lift, top: g.top });
  };
  for (let x = -4096; x < 4096; x += 20) for (let z = -4096; z < 4096; z += 20) add(x, z);
  for (const m of mountainsOf(seed)) for (let dz = -80; dz <= 80; dz += 4) for (let dx = -80; dx <= 80; dx += 4) add(m.px + dx, m.pz + dz);
  sampleCache.set(seed, v);
  return v;
}

describe('#184-AC1: 同じシード・同じ場所なら、作る順に関係なく biome.at が同じ', () => {
  it('順に読んだ結果と、覚えを捨てて逆の順・ほかのシードを挟んで読んだ結果が同じ', () => {
    for (const seed of SEEDS) {
      const pts: [number, number][] = [];
      for (let k = 0; k < 300; k++) pts.push([((k * 7919) % 6000) - 3000, ((k * 104729) % 6000) - 3000]);
      clearTerrainCache();
      const a = pts.map(([x, z]) => countryAt(seed, x, z));
      clearTerrainCache();
      countryAt(seed + 5, 10, 10);
      const b = [...pts].reverse().map(([x, z]) => countryAt(seed, x, z)).reverse();
      expect(b).toEqual(a);
      for (const r of a) {
        expect(COUNTRY_KINDS).toContain(r.kind);
        expect(typeof r.mountain).toBe('boolean');
        expect(r.e).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('決まりの数: 升目 112・点は 升目の中の 28〜84・境目 14・順位の表は 101 こ（小さい順）・はじまりの力 80', () => {
    expect(C.biome.cell).toBe(112);
    expect(C.biome.pointMin).toBe(28);
    expect(C.biome.pointSpan).toBe(56);
    expect(C.biome.blend).toBe(14);
    expect(C.biome.startForce).toBe(80);
    const t = C.biome.rankTable as readonly number[];
    expect(t).toHaveLength(101);
    for (let k = 1; k < t.length; k++) expect(t[k]!).toBeGreaterThanOrEqual(t[k - 1]!);
    for (const seed of SEEDS) {
      for (const i of [-5, 0, 3, 20]) {
        for (const j of [-7, 0, 2, 19]) {
          const c = countryCell(seed, i, j);
          if (c.mountain) continue; // 山の点は ±8（AC3）
          expect(c.px - (AX + CELL * i)).toBeGreaterThanOrEqual(28);
          expect(c.px - (AX + CELL * i)).toBeLessThanOrEqual(84);
          expect(c.pz - (AZ + CELL * j)).toBeGreaterThanOrEqual(28);
          expect(c.pz - (AZ + CELL * j)).toBeLessThanOrEqual(84);
        }
      }
    }
  });
});

describe('#184-AC2: 山でない升目の 8 国は 12.5% ずつ（8192 四方）', () => {
  const eight: CountryKind[] = COUNTRY_KINDS.filter((k) => !MOUNTAIN_KINDS.includes(k));
  const shares = new Map<number, Map<CountryKind, number>>();

  beforeAll(() => {
    for (const seed of SEEDS) {
      const cnt = new Map<CountryKind, number>();
      let n = 0;
      for (const j of cellRange) {
        for (const i of cellRange) {
          const c = countryCell(seed, i, j);
          if (c.mountain || c.startForced) continue;
          n++;
          cnt.set(c.kind, (cnt.get(c.kind) ?? 0) + 1);
        }
      }
      const s = new Map<CountryKind, number>();
      for (const k of eight) s.set(k, ((cnt.get(k) ?? 0) / n) * 100);
      shares.set(seed, s);
    }
  });

  it('山でない升目は 8 国だけ。どの国も シードごとに 12.5 ± 4 ポイント', () => {
    expect(eight).toHaveLength(8);
    for (const seed of SEEDS) {
      for (const k of eight) {
        const p = shares.get(seed)!.get(k)!;
        expect(p, `seed ${seed} ${k}`).toBeGreaterThanOrEqual(8.5);
        expect(p, `seed ${seed} ${k}`).toBeLessThanOrEqual(16.5);
      }
    }
  });

  it('3 つのシードの平均は 12.5 ± 2 ポイント', () => {
    for (const k of eight) {
      const avg = SEEDS.reduce((s, seed) => s + shares.get(seed)!.get(k)!, 0) / SEEDS.length;
      expect(avg, k).toBeGreaterThanOrEqual(10.5);
      expect(avg, k).toBeLessThanOrEqual(14.5);
    }
  });
});

describe('#184-AC3: 山のわく（4×4 升目。anchor が まん中）', () => {
  it('スタートのわくは 山 0。ほかは 大陸の高さが いちばん高い こうほ が 海から +2 以上なら 山が 1 つ、未満なら 0', () => {
    for (const seed of SEEDS) {
      const start = mountainFrame(seed, 0, 0);
      expect(start.start).toBe(true);
      expect(start.mountain).toBeNull();
      let withMtn = 0;
      let landFrames = 0;
      for (const fz of frameRange) {
        for (const fx of frameRange) {
          if (fx === 0 && fz === 0) continue;
          const f = mountainFrame(seed, fx, fz);
          expect(f.start).toBe(false);
          expect(f.candidates).toHaveLength(4);
          const best = Math.max(...f.candidates.map((c) => c.above));
          if (best >= 2) {
            landFrames++;
            expect(f.mountain, `seed ${seed} frame ${fx},${fz}`).not.toBeNull();
            const m = f.mountain!;
            // こうほ は わくの中の (0,0)(1,0)(0,1)(1,1) の 2×2。いちばん高い こうほ が えらばれる
            const i0 = 4 * fx - 2;
            const j0 = 4 * fz - 2;
            const cand = f.candidates.find((c) => c.i === m.i && c.j === m.j);
            expect(cand, 'えらんだ山は こうほ の 1 つ').toBeDefined();
            expect(cand!.above).toBe(best);
            expect([i0, i0 + 1]).toContain(m.i);
            expect([j0, j0 + 1]).toContain(m.j);
            // 点は 2×2 の まん中（升目の角）から ±8
            expect(Math.abs(m.px - (AX + CELL * (m.i + 1)))).toBeLessThanOrEqual(8);
            expect(Math.abs(m.pz - (AZ + CELL * (m.j + 1)))).toBeLessThanOrEqual(8);
            withMtn++;
          } else {
            expect(f.mountain, `seed ${seed} frame ${fx},${fz} 海の上に山を置かない`).toBeNull();
          }
        }
      }
      expect(withMtn).toBe(landFrames);
      expect(withMtn).toBeGreaterThan(30);
    }
  });

  it('山の 2×2 は 山の国、それをかこむ 12 升目に ほかの山は 0。わくの ほかの升目は 山でない', () => {
    for (const seed of SEEDS) {
      for (const m of mountainsOf(seed)) {
        for (let dj = -1; dj <= 2; dj++) {
          for (let di = -1; di <= 2; di++) {
            const c = countryCell(seed, m.i + di, m.j + dj);
            const inner = di >= 0 && di <= 1 && dj >= 0 && dj <= 1;
            if (inner) {
              expect(c.mountain).toBe(true);
              expect(c.kind).toBe(m.kind);
            } else {
              expect(c.mountain, `seed ${seed} 山 ${m.i},${m.j} のまわり ${m.i + di},${m.j + dj}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('4 種の山が それぞれ 山の 15〜35%（シードごと）', () => {
    for (const seed of SEEDS) {
      const ms = mountainsOf(seed);
      for (const k of MOUNTAIN_KINDS) {
        const p = (ms.filter((m) => m.kind === k).length / ms.length) * 100;
        expect(p, `seed ${seed} ${k}`).toBeGreaterThanOrEqual(15);
        expect(p, `seed ${seed} ${k}`).toBeLessThanOrEqual(35);
      }
    }
  });
});

describe('#184-AC4: 山の升目 12% 以上。すな・ゆき の出る所', () => {
  it('8192 四方で 山の升目が 全体の 12% 以上（3 つのシード）。落ちたら 数を変えず designer へ', () => {
    for (const seed of SEEDS) {
      let n = 0;
      let mt = 0;
      for (const j of cellRange) for (const i of cellRange) {
        n++;
        if (countryCell(seed, i, j).mountain) mt++;
      }
      expect(mt / n, `seed ${seed}`).toBeGreaterThanOrEqual(0.12);
    }
  });

  it('すな は すなはま だけ（山の形がかかる列は 海から +10 未満）。ゆき は ゆきやま の +40 以上だけ、+40 以上の地面は 頂上まで ゆき（いし 0）。ほかに すな・ゆき 0（陸の列。境目 e < blend の列は のぞく）', () => {
    let snow = 0;
    let sand = 0;
    for (const seed of SEEDS) {
      for (const s of samplesOf(seed)) {
        if (s.e < BLEND || s.h < SEA_Y + 2) continue;
        const above = s.h - SEA_Y;
        const ctx = `seed ${seed} (${s.x},${s.z}) ${s.country} +${above} ${s.top}`;
        if (s.top === 'sand') {
          sand++;
          expect(s.country, ctx).toBe('sunahama');
          const shape = mountainShapeAt(seed, s.x, s.z);
          if (shape && shape.m >= s.h) expect(above, ctx).toBeLessThan(10);
        }
        if (s.top === 'snow') {
          snow++;
          expect(s.country, ctx).toBe('yuki');
          expect(above, ctx).toBeGreaterThanOrEqual(40);
        }
        if (s.country === 'yuki' && above >= 40) expect(s.top, ctx).toBe('snow');
      }
    }
    expect(snow).toBeGreaterThan(50);
    expect(sand).toBeGreaterThan(50);
  });
});

describe('#184-AC5: はじまりの国', () => {
  it('anchor の国は はらっぱ。anchor を角にもつ 4 升目のうち 点が いちばん近い升目と、点が anchor から 80 以内の升目は はらっぱ', () => {
    for (const seed of SEEDS) {
      expect(countryAt(seed, AX, AZ).kind).toBe('harappa');
      const four = [[-1, -1], [0, -1], [-1, 0], [0, 0]].map(([i, j]) => countryCell(seed, i!, j!));
      const near = four.reduce((a, b) => (Math.hypot(b.px - AX, b.pz - AZ) < Math.hypot(a.px - AX, a.pz - AZ) ? b : a));
      expect(near.kind).toBe('harappa');
      let forced = 0;
      for (let j = -4; j <= 3; j++) {
        for (let i = -4; i <= 3; i++) {
          const c = countryCell(seed, i, j);
          if (Math.hypot(c.px - AX, c.pz - AZ) <= C.biome.startForce) {
            forced++;
            expect(c.kind, `seed ${seed} 升目 ${i},${j}`).toBe('harappa');
          }
        }
      }
      expect(forced).toBeGreaterThanOrEqual(1);
    }
  });

  it('スタートから いちばん近い山の点は 328 以上。スタートさがしは fallback しない', () => {
    for (const seed of SEEDS) {
      let best = Infinity;
      for (const m of mountainsOf(seed)) best = Math.min(best, Math.hypot(m.px - AX, m.pz - AZ));
      expect(best, `seed ${seed}`).toBeGreaterThanOrEqual(328);
      expect(spawnOf(seed).fallback, `seed ${seed}`).toBe(false);
    }
  });
});

describe('#184-AC6: 境目は なだらか', () => {
  it('境目（e < blend）では かっぱの持ち上げが 0。境目をまたぐ となりあう列の高さの差は 4 以下（山の形がかかる所も）', () => {
    let pairs = 0;
    for (const seed of SEEDS) {
      const check = (x: number, z: number): void => {
        const c = countryAt(seed, x, z);
        if (c.e >= BLEND) return;
        const g = groundAt(seed, x, z);
        expect(g.lift, `seed ${seed} (${x},${z}) 境目の持ち上げ`).toBe(0);
        for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
          const g2 = groundAt(seed, x + dx, z + dz);
          pairs++;
          expect(Math.abs(g.h - g2.h), `seed ${seed} (${x},${z})+(${dx},${dz})`).toBeLessThanOrEqual(4);
        }
      };
      for (let x = -800; x < 800; x += 3) for (let z = -800; z < 800; z += 3) check(x, z);
      for (const m of mountainsOf(seed).slice(0, 12)) for (let dz = -130; dz <= 130; dz += 2) for (let dx = -130; dx <= 130; dx += 2) check(m.px + dx, m.pz + dz);
    }
    expect(pairs).toBeGreaterThan(1000);
  });
});

describe('#184-AC7: 山の頂上', () => {
  it('頂上（山の点から 6 以内の いちばん高い列）が 海から ゆき 79・いわ 69・てんぐ 67・もみじ 63 以上。ゆき は ほかの山の頂上の平均より 高い', () => {
    const floor: Record<string, number> = { yuki: 79, iwayama: 69, tengu: 67, momiji: 63 };
    for (const seed of SEEDS) {
      const tops: { kind: CountryKind; top: number }[] = [];
      for (const m of mountainsOf(seed)) {
        let top = -Infinity;
        for (let dz = -6; dz <= 6; dz++) {
          for (let dx = -6; dx <= 6; dx++) {
            if (Math.hypot(dx, dz) > 6) continue;
            top = Math.max(top, groundAt(seed, m.px + dx, m.pz + dz).h - SEA_Y);
          }
        }
        expect(top, `seed ${seed} ${m.kind} (${m.px},${m.pz})`).toBeGreaterThanOrEqual(floor[m.kind]!);
        tops.push({ kind: m.kind, top });
      }
      const others = tops.filter((t) => t.kind !== 'yuki');
      const avg = others.reduce((s, t) => s + t.top, 0) / others.length;
      const yuki = tops.filter((t) => t.kind === 'yuki');
      expect(yuki.length).toBeGreaterThan(0);
      for (const t of yuki) expect(t.top, `seed ${seed}`).toBeGreaterThan(avg);
    }
  });
});

describe('#184-AC7b: 山の形 M', () => {
  it('となりあう列の差が 1 以下', () => {
    for (const seed of SEEDS) {
      for (const k of MOUNTAIN_KINDS) {
        for (const m of mountainsOf(seed).filter((q) => q.kind === k).slice(0, 3)) {
          for (let dz = -130; dz <= 130; dz++) {
            for (let dx = -130; dx <= 130; dx++) {
              const a = mountainShapeAt(seed, m.px + dx, m.pz + dz);
              if (!a) continue;
              for (const [ex, ez] of [[1, 0], [0, 1]] as const) {
                const b = mountainShapeAt(seed, m.px + dx + ex, m.pz + dz + ez);
                if (!b || b.px !== a.px || b.pz !== a.pz) continue;
                expect(Math.abs(a.m - b.m), `seed ${seed} ${k} (${m.px + dx},${m.pz + dz})`).toBeLessThanOrEqual(1);
              }
            }
          }
        }
      }
    }
  });

  it('M が 海から +15 になる 山の点からの きょりが ゆき 75〜85・いわ 67〜77・てんぐ 57〜67・もみじ 81〜91', () => {
    const range: Record<string, [number, number]> = { yuki: [75, 85], iwayama: [67, 77], tengu: [57, 67], momiji: [81, 91] };
    for (const seed of SEEDS) {
      for (const m of mountainsOf(seed)) {
        for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          let found: number | null = null;
          for (let k = 0; k <= 200; k++) {
            const s = mountainShapeAt(seed, m.px + ex * k, m.pz + ez * k);
            if (s && s.m - SEA_Y <= 15) {
              found = s.d;
              break;
            }
          }
          expect(found, `seed ${seed} ${m.kind}`).not.toBeNull();
          const [lo, hi] = range[m.kind]!;
          expect(found!, `seed ${seed} ${m.kind} (${m.px},${m.pz}) 向き ${ex},${ez}`).toBeGreaterThanOrEqual(lo);
          expect(found!, `seed ${seed} ${m.kind}`).toBeLessThanOrEqual(hi);
        }
      }
    }
  });
});

describe('#184-AC8: 720 ブロック歩くと 3 つ以上の国', () => {
  it('3 つのシードで スタートから 東西南北 に 720 ブロックの線（12 本）。通る国が 3 種類以上の線が 9 本以上', () => {
    let good = 0;
    let lines = 0;
    for (const seed of SEEDS) {
      const sp = spawnOf(seed);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const kinds = new Set<CountryKind>();
        for (let k = 0; k <= 720; k += 4) kinds.add(countryAt(seed, sp.x + dx * k, sp.z + dz * k).kind);
        lines++;
        if (kinds.size >= 3) good++;
      }
    }
    expect(lines).toBe(12);
    expect(good).toBeGreaterThanOrEqual(9);
  });
});

describe('#184-AC9: 1 列の数の上限・かっぱの いけ', () => {
  it('1 列（16×16）の数が 上限以下: もり 12、おおきな は 大木 2・木 5、たけ 60、はな 40、すすき 40', () => {
    const limit = { mori: 0, ookina: 0, take: 0, hana: 0, susuki: 0 };
    const seen = { mori: 0, ookina: 0, take: 0, hana: 0, susuki: 0 };
    const want = new Set<CountryKind>(['mori', 'ookina', 'take', 'hana', 'susuki']);
    void limit;
    for (const seed of SEEDS) {
      for (let cz = -128; cz < 128; cz++) {
        for (let cx = -128; cx < 128; cx++) {
          const x0 = cx * 16;
          const z0 = cz * 16;
          const pts: [number, number][] = [[x0, z0], [x0 + 15, z0], [x0, z0 + 15], [x0 + 15, z0 + 15], [x0 + 8, z0 + 8]];
          const cs = pts.map(([x, z]) => countryAt(seed, x, z));
          const k = cs[0]!.kind;
          if (!want.has(k) || cs.some((c) => c.kind !== k || c.e < BLEND)) continue; // 1 つの国だけの列
          const n = columnCounts(seed, cx, cz);
          if (k === 'mori') {
            expect(n.trees, `seed ${seed} 列 ${cx},${cz}`).toBeLessThanOrEqual(12);
            seen.mori = Math.max(seen.mori, n.trees);
          } else if (k === 'ookina') {
            expect(n.bigTrees, `seed ${seed} 列 ${cx},${cz} 大木`).toBeLessThanOrEqual(2);
            expect(n.trees, `seed ${seed} 列 ${cx},${cz} 木`).toBeLessThanOrEqual(5);
            seen.ookina = Math.max(seen.ookina, n.trees);
          } else if (k === 'take') {
            expect(n.take).toBeLessThanOrEqual(60);
            seen.take = Math.max(seen.take, n.take);
          } else if (k === 'hana') {
            expect(n.flower).toBeLessThanOrEqual(40);
            seen.hana = Math.max(seen.hana, n.flower);
          } else {
            expect(n.susuki).toBeLessThanOrEqual(40);
            seen.susuki = Math.max(seen.susuki, n.susuki);
          }
        }
      }
    }
    // 何も置かない実装で通らないように、どの国にも 1 つ以上はある
    for (const k of Object.keys(seen) as (keyof typeof seen)[]) expect(seen[k], k).toBeGreaterThan(0);
  }, 300_000);

  it('点が陸の かっぱの ぬま の 全部の升目で いけ が 4〜8 こ（4 こは 点に さわる 4 区画）。いけ の はばは 4〜7', () => {
    let landCells = 0;
    for (const seed of SEEDS) {
      for (const j of cellRange) {
        for (const i of cellRange) {
          const c = countryCell(seed, i, j);
          if (c.kind !== 'kappa' || c.mountain) continue;
          const r = pondsOf(seed, i, j);
          if (!r.pointOnLand) continue;
          landCells++;
          const ctx = `seed ${seed} 升目 ${i},${j}`;
          expect(r.ponds.length, ctx).toBeGreaterThanOrEqual(4);
          expect(r.ponds.length, ctx).toBeLessThanOrEqual(8);
          const must = r.ponds.filter((p) => p.mandatory);
          expect(must.length, ctx).toBe(4);
          const quads = new Set<string>();
          for (const p of must) {
            const mx = (p.x0 + p.x1 + 1) / 2 - c.px;
            const mz = (p.z0 + p.z1 + 1) / 2 - c.pz;
            expect(Math.abs(mx), ctx).toBeLessThanOrEqual(9);
            expect(Math.abs(mz), ctx).toBeLessThanOrEqual(9);
            quads.add(`${mx < 0}${mz < 0}`);
          }
          expect(quads.size, `${ctx} 点のまわりの 4 区画に 1 こずつ`).toBe(4);
          for (const p of r.ponds) {
            expect(p.x1 - p.x0 + 1, ctx).toBeGreaterThanOrEqual(4);
            expect(p.x1 - p.x0 + 1, ctx).toBeLessThanOrEqual(7);
            expect(p.z1 - p.z0 + 1, ctx).toBeGreaterThanOrEqual(4);
            expect(p.z1 - p.z0 + 1, ctx).toBeLessThanOrEqual(7);
          }
        }
      }
    }
    expect(landCells).toBeGreaterThan(100);
  });

  it('かっぱの ぬま で ふつうの高さが 海から −4 より深い列は 持ち上げない（点のまわり 18×18 を のぞく）。浅い所は 持ち上がる', () => {
    let lifted = 0;
    for (const seed of SEEDS) {
      for (const s of samplesOf(seed)) {
        if (s.country !== 'kappa' || s.e < BLEND) continue;
        const pt = countryCell(seed, s.cx, s.cz);
        const nearPoint = Math.abs(s.x - pt.px) <= 9 && Math.abs(s.z - pt.pz) <= 9;
        if (s.lift > 0) lifted++;
        if (s.base - SEA_Y < -4 && !nearPoint) expect(s.lift, `seed ${seed} (${s.x},${s.z}) ふつう ${s.base - SEA_Y}`).toBe(0);
      }
    }
    expect(lifted).toBeGreaterThan(20);
  });
});

describe('#184-AC11: 木の はっぱ', () => {
  it('てんぐの やま の木は まつの はっぱ、もみじやま の木は もみじの はっぱ、ほかの国の木は 今の はっぱ', () => {
    const seen = { tengu: 0, momiji: 0, other: 0 };
    for (const seed of SEEDS) {
      const T = terrainFor(seed);
      const rects: [number, number, number, number][] = [[-512, -512, 511, 511]];
      for (const m of mountainsOf(seed)) if (m.kind === 'tengu' || m.kind === 'momiji') rects.push([m.px - 90, m.pz - 90, m.px + 90, m.pz + 90]);
      for (const [x0, z0, x1, z1] of rects) {
        for (const t of treesInRect(T, x0, z0, x1, z1)) {
          const k = countryAt(seed, t.x, t.z).kind;
          if (k === 'tengu') {
            expect(t.leaves).toBe('matsu_leaves');
            seen.tengu++;
          } else if (k === 'momiji') {
            expect(t.leaves).toBe('momiji_leaves');
            seen.momiji++;
          } else {
            expect(t.leaves).toBe('leaves');
            seen.other++;
          }
        }
      }
    }
    expect(seen.tengu).toBeGreaterThan(0);
    expect(seen.momiji).toBeGreaterThan(0);
    expect(seen.other).toBeGreaterThan(100);
  }, 120_000);
});

describe('#184-AC12: たけやぶ の道', () => {
  it('たけやぶ の升目ごとに、点から 升目の外まで take.path の道だけで つながる（3 つのシード・各 20 升目）', () => {
    for (const seed of SEEDS) {
      let done = 0;
      for (const j of cellRange) {
        for (const i of cellRange) {
          if (done >= 20) break;
          const c = countryCell(seed, i, j);
          if (c.kind !== 'take' || c.mountain) continue;
          done++;
          const ctx = `seed ${seed} 升目 ${i},${j}`;
          const path = takePath(seed, i, j);
          expect(path.length, ctx).toBeGreaterThan(0);
          const set = new Set(path.map((p) => `${p.x},${p.z}`));
          // 点（のすぐそば）から はじめる
          const starts = path.filter((p) => Math.abs(p.x - c.px) <= 1 && Math.abs(p.z - c.pz) <= 1);
          expect(starts.length, `${ctx} 点が道の上`).toBeGreaterThan(0);
          const x0 = AX + CELL * i;
          const z0 = AZ + CELL * j;
          const outside = (p: { x: number; z: number }): boolean => p.x < x0 || p.x >= x0 + CELL || p.z < z0 || p.z >= z0 + CELL;
          const seen = new Set<string>(starts.map((p) => `${p.x},${p.z}`));
          const queue = [...starts];
          let reached = false;
          while (queue.length > 0 && !reached) {
            const p = queue.pop()!;
            if (outside(p)) {
              reached = true;
              break;
            }
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              const q = { x: p.x + dx, z: p.z + dz };
              const key = `${q.x},${q.z}`;
              if (set.has(key) && !seen.has(key)) {
                seen.add(key);
                queue.push(q);
              }
            }
          }
          expect(reached, `${ctx} 道だけで 升目の外へ`).toBe(true);
        }
      }
      expect(done, `seed ${seed}`).toBe(20);
    }
  });
});

describe('#184-AC13: すなはま の陸の列の 7.5 割以上が すな（6 版）', () => {
  it('3 つのシードで、すなはま の陸の列（海から 0 以上）の 7.5 割以上が すな（シードごと）。落ちたら designer へ', () => {
    for (const seed of SEEDS) {
      let land = 0;
      let sand = 0;
      for (const s of samplesOf(seed)) {
        if (s.country !== 'sunahama' || s.e < BLEND || s.h < SEA_Y) continue;
        land++;
        if (s.top === 'sand') sand++;
      }
      expect(land, `seed ${seed}`).toBeGreaterThan(300);
      expect(sand / land, `seed ${seed}`).toBeGreaterThanOrEqual(0.75);
    }
  });
});
