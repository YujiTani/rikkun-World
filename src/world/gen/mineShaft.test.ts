import { beforeAll, describe, expect, it } from 'vitest';
import { columnHash } from './chunk';
import { inMouthFootprint, mouthsNear } from './mouths';
import {
  GenCols,
  SEEDS_20,
  SHAFT_MEET,
  genColumn,
  hook1c,
  isPlantId,
  sampleShafts,
  shapeProblems,
  type PathCell,
  type Shaft,
} from './mineShaftKit';
import { clearTerrainCache, heightAt, spawnOf, terrainFor } from './terrain';

/**
 * MINE-1C（docs/design/MINE-1.md §4.5.1・§4.5.2・受け入れ基準 C1・C2・C3・C10）: 坑道の 場所・数・形。
 *
 *   窓口 `mine.startShaft()`・`mine.shafts(x0, z0, x1, z1)`・`mine.shaftPath(id)`・`mine.shaftRolls(x0, z0, x1, z1)`（§6.1。`createMineHook({ seed })` で 答える）。
 *   名前と 約束は mineShaftKit.ts の 先頭に 書いた〔入口の 向き dir・足の マスの y・へやの はんい・横の 距離 など〕。
 *   ブロックは `generateChunk` で 作った 列を 読む〔窓口の 答えと 実際の ブロックが 合う ことを 見る〕。
 *   数のうち【PO 案】は 表〔mineShaftKit.ts の SHAFT_MEET〕から 読む。試作が ないので 実装の あとで 数えて 決めなおす。
 *
 *   重い 生成〔20 シード × 坑道 1〜3 こ × 列 40 こ ほど〕を 使うので、時間切れの ゆとりを とる〔手元で 数十秒〕。
 */

// ------------------------------------------------------------------ はじまりの 坑道 20 シード

const NORTH = { x: 0, z: -1 };
const DIR_VEC = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
] as const;
const angleBetween = (a: { x: number; z: number }, b: { x: number; z: number }): number => (Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.z * b.z) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z))))) * 180) / Math.PI;

interface StartRow {
  seed: number;
  sp: { x: number; z: number };
  start: Shaft;
  g: GenCols;
}
const rows: StartRow[] = [];

beforeAll(() => {
  for (const seed of SEEDS_20) {
    const sp = spawnOf(seed);
    rows.push({ seed, sp, start: hook1c(seed).startShaft(), g: new GenCols(seed) });
  }
}, 120_000);

describe('C1: はじまりの 坑道（新しい 世界 20 シード）', () => {
  it('窓口が 答える: start が true・入口は 小さな いしの 山の 横〔kind: mound・mound あり〕', () => {
    expect(rows).toHaveLength(SEEDS_20.length);
    for (const r of rows) {
      expect(r.start.start, `seed ${r.seed}`).toBe(true);
      expect(r.start.entrance.kind, `seed ${r.seed}`).toBe('mound');
      expect(r.start.mound, `seed ${r.seed} の 山`).not.toBeNull();
    }
  });

  it('スタートから 横 24〜48 マス〔置けない シードは 48〜96・96〜160 と ひろがる。遠くても 1 つは ある〕。9 割 以上は 24〜48', () => {
    let near = 0;
    for (const r of rows) {
      const d = Math.hypot(r.start.entrance.x - r.sp.x, r.start.entrance.z - r.sp.z);
      expect(d, `seed ${r.seed}`).toBeGreaterThanOrEqual(24);
      if (d <= 48) near++;
      else expect(d, `seed ${r.seed}: 24〜48 に 置けない ときは 160 まで`).toBeLessThanOrEqual(160);
    }
    expect(near / rows.length).toBeGreaterThanOrEqual(0.9);
  });

  it('入口の 正面と スタートへの 向きの ずれが 45 度 以内', () => {
    for (const r of rows) {
      const e = r.start.entrance;
      const toSpawn = { x: r.sp.x - e.x, z: r.sp.z - e.z };
      expect(angleBetween(DIR_VEC[e.dir], toSpawn), `seed ${r.seed}`).toBeLessThanOrEqual(45.01);
    }
  });

  it('スタートで 向いて いる 向き〔北〕の 左右 60 度の 中を 先に さがす: 20 シードの 7 割 以上が その 中', () => {
    let inNorth = 0;
    for (const r of rows) {
      const e = r.start.entrance;
      if (angleBetween(NORTH, { x: e.x - r.sp.x, z: e.z - r.sp.z }) <= 60.01) inNorth++;
    }
    expect(inNorth / rows.length).toBeGreaterThanOrEqual(0.7);
  });

  it('山: 高さ 5〜7・はば 9〜13〔ブロックで はかる〕・入口は 山の 横', () => {
    for (const r of rows) {
      const m = r.start.mound!;
      expect(m.width, `seed ${r.seed} の はば`).toBeGreaterThanOrEqual(9);
      expect(m.width, `seed ${r.seed} の はば`).toBeLessThanOrEqual(13);
      // 山の 外の 地面〔山の はしから 3 マス 先の 4 方向の 地形の 高さ〕と くらべた、山の てっぺんの 高さ
      const far = m.width / 2 + 3;
      const ground = Math.max(
        heightAt(r.seed, Math.round(m.x + far), Math.round(m.z)),
        heightAt(r.seed, Math.round(m.x - far), Math.round(m.z)),
        heightAt(r.seed, Math.round(m.x), Math.round(m.z + far)),
        heightAt(r.seed, Math.round(m.x), Math.round(m.z - far)),
      );
      const h = r.g.topSolid(Math.round(m.x), Math.round(m.z)) - ground;
      expect(h, `seed ${r.seed} の 山の 高さ`).toBeGreaterThanOrEqual(5);
      expect(h, `seed ${r.seed} の 山の 高さ`).toBeLessThanOrEqual(7);
      const e = r.start.entrance;
      expect(Math.hypot(e.x - m.x, e.z - m.z), `seed ${r.seed}: 入口は 山の 横`).toBeLessThanOrEqual(m.width / 2 + 3);
    }
  });

  it('山と まわり 2 マスに 木・草花が ない', () => {
    for (const r of rows) {
      const m = r.start.mound!;
      const half = Math.ceil(m.width / 2) + 2;
      const bad: string[] = [];
      for (let x = Math.round(m.x) - half; x <= Math.round(m.x) + half; x++) {
        for (let z = Math.round(m.z) - half; z <= Math.round(m.z) + half; z++) {
          const top = r.g.topSolid(x, z);
          for (let y = top + 1; y <= top + 12; y++) if (isPlantId(r.g.id(x, y, z))) bad.push(`(${x}, ${y}, ${z}) ${r.g.id(x, y, z)}`);
          if (isPlantId(r.g.id(x, top, z))) bad.push(`(${x}, ${top}, ${z}) ${r.g.id(x, top, z)}`);
        }
      }
      expect(bad.slice(0, 5), `seed ${r.seed}`).toEqual([]);
    }
  }, 60_000);

  it('同じ シードで 2 回 作ると 同じ〔べつの 窓口を 作りなおしても〕', () => {
    for (const r of rows.slice(0, 5)) expect(hook1c(r.seed).startShaft(), `seed ${r.seed}`).toEqual(r.start);
  });
});

// ------------------------------------------------------------------ ほかの 坑道

describe('C2: ほかの 坑道（256×256 区画）', () => {
  const REGION = 256;
  const SEEDS_ROLL = [20261012, 1000 + 7919, 1000 + 7919 * 2];

  it('区画ごとの 抽選: 当たる わりあいが 0.25 ± 0.03〔シード 3 つ × 1,000 区画〕', () => {
    let n = 0;
    let hit = 0;
    for (const seed of SEEDS_ROLL) {
      const sp = spawnOf(seed);
      const home = { rx: Math.floor(sp.x / REGION), rz: Math.floor(sp.z / REGION) };
      const rolls = hook1c(seed).shaftRolls(REGION, REGION, 35 * REGION - 1, 35 * REGION - 1); // 区画 1〜34 → 34×34 ＝ 1,156
      for (const r of rolls) {
        if (r.rx === home.rx && r.rz === home.rz) continue; // はじまりの 区画は はじまりの 坑道だけ
        n++;
        if (r.hit) hit++;
      }
    }
    expect(n, '数えた 区画').toBeGreaterThanOrEqual(3000);
    expect(hit / n).toBeGreaterThanOrEqual(0.22);
    expect(hit / n).toBeLessThanOrEqual(0.28);
  });

  it('当たった 区画の うち 陸 2 割 以上〔land ≥ 0.2〕の 9 割 以上に 置ける〔placed〕。陸が 2 割 より 少ない 区画には 置かない', () => {
    let want = 0;
    let got = 0;
    for (const seed of SEEDS_ROLL) {
      for (const r of hook1c(seed).shaftRolls(REGION, REGION, 35 * REGION - 1, 35 * REGION - 1)) {
        if (!r.hit) continue;
        if (r.land >= 0.2) {
          want++;
          if (r.placed) got++;
        } else {
          expect(r.placed, `seed ${seed} 区画 (${r.rx}, ${r.rz}) は 陸 ${r.land.toFixed(2)}`).toBe(false);
        }
      }
    }
    expect(want, '数えた 区画').toBeGreaterThanOrEqual(150);
    expect(got / want).toBeGreaterThanOrEqual(0.9);
  });

  const others: { seed: number; sp: { x: number; z: number }; shaft: Shaft; g: GenCols; start: Shaft }[] = [];
  beforeAll(() => {
    for (const seed of SEEDS_20.slice(0, 6)) {
      const sp = spawnOf(seed);
      const h = hook1c(seed);
      const start = h.startShaft();
      const g = new GenCols(seed);
      const near = h
        .shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535)
        .filter((s) => !s.start)
        .slice(0, 4);
      for (const shaft of near) others.push({ seed, sp, shaft, g, start });
    }
  }, 120_000);

  it('置かれた 坑道が 十分 ある〔6 シード × スタートの まわり 3,072 マス四方〕', () => {
    expect(others.length).toBeGreaterThanOrEqual(10);
  });

  it('入口: 山の 斜面〔slope: 足 y 147〜181・奥 5 マスの 地面が 床より 3 以上 高い〕か 小さな いしの 山〔mound: 高さ 5〜7・はば 9〜13〕の 横', () => {
    for (const o of others) {
      const e = o.shaft.entrance;
      const tag = `seed ${o.seed} ${o.shaft.id}`;
      expect(e.y, `${tag} の 入口の 足 y`).toBeGreaterThanOrEqual(147);
      expect(e.y, `${tag} の 入口の 足 y`).toBeLessThanOrEqual(181);
      if (e.kind === 'slope') {
        const v = DIR_VEC[e.dir];
        const inland = heightAt(o.seed, e.x - v.x * 5, e.z - v.z * 5); // 奥 〔外へ ひらく 向きの 反対〕
        expect(inland - (e.y - 1), `${tag}: 奥 5 マスの 地面が 床より 高い`).toBeGreaterThanOrEqual(3);
        expect(o.shaft.mound, tag).toBeNull();
      } else {
        const m = o.shaft.mound!;
        expect(m, `${tag} の 山`).not.toBeNull();
        expect(m.width).toBeGreaterThanOrEqual(9);
        expect(m.width).toBeLessThanOrEqual(13);
      }
    }
  });

  it('箱〔96×96 まで〕が 区画の 中・箱の 中に 入口と 道ぜんぶ。はじまりの 区画には ほかの 坑道が ない。坑道どうしは 重ならない', () => {
    for (const o of others) {
      const b = o.shaft.box;
      const tag = `seed ${o.seed} ${o.shaft.id}`;
      expect(b.x1 - b.x0 + 1, `${tag} の 箱の はば`).toBeLessThanOrEqual(96);
      expect(b.z1 - b.z0 + 1, `${tag} の 箱の おく`).toBeLessThanOrEqual(96);
      expect(Math.floor(b.x0 / 256), `${tag}: 箱が 区画の 中`).toBe(Math.floor(b.x1 / 256));
      expect(Math.floor(b.z0 / 256), `${tag}: 箱が 区画の 中`).toBe(Math.floor(b.z1 / 256));
      const e = o.shaft.entrance;
      expect(e.x >= b.x0 && e.x <= b.x1 && e.z >= b.z0 && e.z <= b.z1, `${tag}: 入口が 箱の 中`).toBe(true);
      const sb = o.start.box;
      const home = { x: Math.floor(sb.x0 / 256), z: Math.floor(sb.z0 / 256) };
      expect(Math.floor(b.x0 / 256) === home.x && Math.floor(b.z0 / 256) === home.z, `${tag}: はじまりの 区画に ある`).toBe(false);
      const overlap = b.x0 <= sb.x1 && b.x1 >= sb.x0 && b.z0 <= sb.z1 && b.z1 >= sb.z0;
      expect(overlap, `${tag} が はじまりの 坑道と 重なる`).toBe(false);
    }
    // ほかの 坑道どうし
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        const a = others[i]!;
        const c = others[j]!;
        if (a.seed !== c.seed) continue;
        const A = a.shaft.box;
        const B = c.shaft.box;
        expect(A.x0 <= B.x1 && A.x1 >= B.x0 && A.z0 <= B.z1 && A.z1 >= B.z0, `${a.shaft.id} と ${c.shaft.id}`).toBe(false);
      }
    }
  });

  it('洞くつの 口と 重ならない〔道の 足の マスの まわり 2 マスが 口の 外わくに 入らない〕', () => {
    for (const o of others) {
      const T = terrainFor(o.seed);
      const path = hook1c(o.seed).shaftPath(o.shaft.id);
      const bad: string[] = [];
      for (const c of path) for (const m of mouthsNear(T, c.x >> 4, c.z >> 4)) if (inMouthFootprint(m, c.x, c.z, 2)) bad.push(`${c.part} (${c.x}, ${c.y}, ${c.z})`);
      expect(bad.slice(0, 4), `seed ${o.seed} ${o.shaft.id}`).toEqual([]);
    }
  });

  it('出会える 数【PO 案】: 新しい 世界 20 シードの 9 割 以上で、スタートから 横 N マス 以内に はじまり いがいの 坑道〔入口〕が M 以上', () => {
    const { radius, count, share } = SHAFT_MEET;
    let ok = 0;
    const short: string[] = [];
    for (const seed of SEEDS_20) {
      const sp = spawnOf(seed);
      const found = hook1c(seed)
        .shafts(sp.x - radius, sp.z - radius, sp.x + radius, sp.z + radius)
        .filter((s) => !s.start && Math.hypot(s.entrance.x - sp.x, s.entrance.z - sp.z) <= radius);
      if (found.length >= count) ok++;
      else short.push(`seed ${seed}: ${found.length}`);
    }
    expect(ok / SEEDS_20.length, `N ${radius}・M ${count} に 足りない: ${short.join(' / ')}`).toBeGreaterThanOrEqual(share);
  }, 120_000);
});

// ------------------------------------------------------------------ 形

describe('C3: 形（さか道・おどりば・いちばん 下の へや）', () => {
  const samples: { seed: number; shaft: Shaft; path: PathCell[]; g: GenCols }[] = [];
  beforeAll(() => {
    for (const seed of SEEDS_20) {
      const s = sampleShafts(seed, 2);
      for (const shaft of s.shafts) samples.push({ seed, shaft, path: s.hook.shaftPath(shaft.id), g: s.g });
    }
  }, 240_000);

  it('20 シードの 坑道が 集まる〔はじまりの 20 ＋ ほか〕', () => {
    expect(samples.length).toBeGreaterThanOrEqual(SEEDS_20.length + 10);
  });

  it('shaftPath は 道の 足の マスを 返す: 入口・さか道・おどりば・へや の 5 つの 部分が ある', () => {
    for (const s of samples) {
      const parts = new Set(s.path.map((c) => c.part));
      for (const p of ['entrance', 'ramp', 'landing', 'room'] as const) expect(parts.has(p), `seed ${s.seed} ${s.shaft.id} に ${p}`).toBe(true);
      expect(s.path.every((c) => c.x >= s.shaft.box.x0 && c.x <= s.shaft.box.x1 && c.z >= s.shaft.box.z0 && c.z <= s.shaft.box.z1), `seed ${s.seed} ${s.shaft.id}: 道が 箱の 中`).toBe(true);
    }
  });

  it('足の マスぜんぶで 上 4 マスが 体の 通る マス・さか道は はば 3 で 2 マスで 1 段〔1 本 16〜24 マス〕・おどりばは 平ら 7×3・へやは 足 y 41〜46・9×9・高さ 5', () => {
    const bad: string[] = [];
    for (const s of samples) for (const m of shapeProblems(s.g, s.shaft, s.path).slice(0, 3)) bad.push(`seed ${s.seed} ${s.shaft.id}: ${m}`);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  }, 120_000);
});

// ------------------------------------------------------------------ C10

describe('C10: 坑道の 列を ちがう 順で 作っても 同じ', () => {
  it('はじまりの 坑道の 箱の 列を、前から・後ろから・かきまぜて 作って、まっさらな 地形からも 作る → どれも 同じ ハッシュ', () => {
    for (const seed of [SEEDS_20[0]!, SEEDS_20[7]!, SEEDS_20[13]!]) {
      const b = hook1c(seed).startShaft().box;
      const cols: { cx: number; cz: number }[] = [];
      for (let cz = b.z0 >> 4; cz <= b.z1 >> 4; cz++) for (let cx = b.x0 >> 4; cx <= b.x1 >> 4; cx++) cols.push({ cx, cz });
      const hashOf = (order: { cx: number; cz: number }[]): Map<string, string> => new Map(order.map((c) => [`${c.cx},${c.cz}`, columnHash(genColumn(seed, c.cx, c.cz))]));
      const fwd = hashOf(cols);
      clearTerrainCache();
      const rev = hashOf([...cols].reverse());
      clearTerrainCache();
      const shuffled = hashOf([...cols].sort((a, c) => ((a.cx * 31 + a.cz * 17) % 7) - ((c.cx * 31 + c.cz * 17) % 7)));
      for (const [k, h] of fwd) {
        expect(rev.get(k), `seed ${seed} 列 ${k}（後ろから）`).toBe(h);
        expect(shuffled.get(k), `seed ${seed} 列 ${k}（かきまぜ）`).toBe(h);
      }
    }
  }, 120_000);
});
