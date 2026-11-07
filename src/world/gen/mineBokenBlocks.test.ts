import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ID, eRich, needBokenHook, tablesOf, type BokenShaft } from './mineBokenKit';
import { DugCols, boxProblems, deadEndsOf, dugSetOf, reachOf, safetyProblemsE, walkProblemsE, type Reach } from './mineBokenReport';
import { SEEDS_20, bbox, components, isSolidIndex, pathIndex, shapeProblems, type GenCols, type PathCell, type Pt } from './mineShaftKit';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.2・§4.7・§4.11・受け入れ基準 E2〔ブロック〕・E3・E4・E5）: 1E の 坑道を ブロックで しらべる。
 *
 *   新しい 世界の 20 シードそれぞれで、スタートに 近い 1E の 坑道の うち 中身が いちばん ゆたかな 1 つ〔迷路・キャンプ・ひび・くずれた いし〕を 作る。
 *   「ほった あと」＝ ひびの いし・くずれた いしを 空気に した 世界〔`DugCols`〕で 見る。数は 表から 読む〔#311〕。時間〔ms〕では 合否を きめない。
 *   E2: 階の ひろば・本道が 平ら・本道の まん中に ふるい レール・さか道は C3 の まま・おどりばから 横穴が 出ない
 *   E3: 上 4 マス〔ひびの 通り道は 2〕空気・下 2 マス 固い・まわり 1 マス 固い・天井の 上の 石・箱が 広さと 区画の 中   E4: 入口と 行き来 できる
 *   E5: 生成の チョークの しるしが ない
 * 光〔E3〕は mineBokenLight.test.ts。赤の 確かめ: 1E の 前は 1E の 坑道が なく「1E の 坑道が ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 600_000 });

interface Sample {
  seed: number;
  shaft: BokenShaft;
  path: PathCell[];
  g: GenCols;
  orig: GenCols;
  reach: Reach;
}
const samples: Sample[] = [];

beforeAll(() => {
  for (const seed of SEEDS_20) {
    const r = eRich(seed);
    if (!r) continue;
    needBokenHook(r.hook, ['shaftPath']);
    const path = r.hook.shaftPath(r.shaft.id);
    const g = new DugCols(seed, dugSetOf(r.shaft));
    samples.push({ seed, shaft: r.shaft, path, g, orig: r.g, reach: reachOf(g, r.shaft) });
  }
}, 900_000);

const tagOf = (s: Sample): string => `seed ${s.seed} ${s.shaft.id}`;
const fail = (what: string, bad: string[]): void => expect(bad.slice(0, 8), `${what}: ${bad.length} つ`).toEqual([]);

describe('E2〔ブロック〕: 階', () => {
  it('1E の 坑道が 集まる〔20 シード〕・shaftPath に ひろば・本道・さか道・いちばん 下の へやが ある', () => {
    expect(samples.length, '1E の 坑道が ない').toBeGreaterThanOrEqual(SEEDS_20.length - 2);
    for (const s of samples) {
      const parts = new Set(s.path.map((c) => c.part as string));
      for (const p of ['entrance', 'ramp', 'landing', 'hiroba', 'main', 'room']) expect(parts.has(p), `${tagOf(s)} に ${p}`).toBe(true);
    }
  });

  it('ひろばは 平らで 7×5 以上〔表〕・本道の 足の マスの 下 2 マスは 固い', () => {
    const H = tablesOf().shape.floor.hiroba;
    const bad: string[] = [];
    for (const s of samples) {
      for (const c of components(pathIndex(s.path).byPart.get('hiroba' as never) ?? [])) {
        const ys = new Set(c.map((p) => p.y));
        const b = bbox(c);
        if (ys.size !== 1) bad.push(`${tagOf(s)}: ひろばが 平らでない`);
        if (!((b.w >= H.w && b.d >= H.d) || (b.w >= H.d && b.d >= H.w))) bad.push(`${tagOf(s)}: ひろば ${b.w}×${b.d}〔${H.w}×${H.d} 以上〕`);
      }
      for (const f of s.shaft.floors ?? []) for (const p of f.main) if (!isSolidIndex(s.g.at(p.x, p.y - 1, p.z)) || !isSolidIndex(s.g.at(p.x, p.y - 2, p.z))) bad.push(`${tagOf(s)}: 本道 (${p.x}, ${p.y}, ${p.z}) の 下が 固くない`);
    }
    fail('ひろば', bad);
  });

  it('床の まん中に ふるい レールが 上り口から 下り口〔いちばん 下の 階は へやの 前〕まで 向きも 合って つづく〔曲がり角の 3×3 と ひろばの 内がわ 3 マスは のぞく〕', () => {
    const bad: string[] = [];
    let rails = 0;
    for (const s of samples) {
      for (const f of s.shaft.floors ?? []) {
        const m = f.main;
        const corners = m.filter((p, i) => i > 0 && i < m.length - 1 && (m[i + 1]!.x - p.x !== p.x - m[i - 1]!.x || m[i + 1]!.z - p.z !== p.z - m[i - 1]!.z));
        m.forEach((p, i) => {
          if (i < 3 || i >= m.length - 3 || corners.some((c) => Math.max(Math.abs(c.x - p.x), Math.abs(c.z - p.z)) <= 1)) return;
          const nb = m[i + 1] ?? m[i - 1]!;
          const want = nb.x !== p.x ? ID.railX : ID.railZ;
          const got = s.g.id(p.x, p.y, p.z);
          if (got === want) rails++;
          else bad.push(`${tagOf(s)}: 本道 (${p.x}, ${p.y}, ${p.z}) が ${got}〔${want} の はず〕`);
        });
      }
    }
    expect(rails, 'ふるい レール').toBeGreaterThan(0);
    fail('レール', bad);
  });

  it('さか道は C3 の まま〔はば 3・2 マスで 1 段・8〜12 段・16〜24 マス〕・おどりばは 平らな 7×3・いちばん 下の へやは 9×9 で 足 y が ふかさの はんい', () => {
    const T = tablesOf().shape.floor;
    const bad: string[] = [];
    for (const s of samples) {
      // 行きどまりの 宝箱の マスは 固い ブロック〔体が 通らない〕。`shapeProblems` は いちばん 下の へやの 宝箱〔`shaft.chest`〕しか 知らない ので、ここで 除く
      const chest = new Set(deadEndsOf(s.shaft).flatMap((e) => e.chest?.cells ?? []).map((c) => `${c.x},${c.y},${c.z}`));
      const path = s.path.filter((c) => (c.part as string) !== 'hibi' && !chest.has(`${c.x},${c.y},${c.z}`));
      const depth = s.shaft.style!.depth;
      for (const m of shapeProblems(s.g, s.shaft, path, { rampsOnly: true }).slice(0, 3)) bad.push(`${tagOf(s)}: ${m}`);
      const r = s.shaft.room;
      if (r.x1 - r.x0 + 1 !== 9 || r.z1 - r.z0 + 1 !== 9) bad.push(`${tagOf(s)}: へやが 9×9 でない`);
      if (r.y < T.bottomY[depth][0] || r.y > T.bottomY[depth][1]) bad.push(`${tagOf(s)}: へやの 足 y ${r.y}`);
    }
    fail('さか道・へや', bad);
  });

  it('おどりば〔さか道の おりかえし〕から 横穴が 出ない: 横穴の 出どころ〔階から〕が おどりばの 2 マス いないに ない', () => {
    expect(samples.length, '1E の 坑道が ない').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const s of samples) {
      const landing = s.path.filter((c) => c.part === 'landing');
      for (const d of s.shaft.sides) {
        if (d.floor === undefined || d.floor < 0) continue;
        if (landing.some((c) => Math.abs(c.x - d.from.x) <= 2 && Math.abs(c.z - d.from.z) <= 2 && Math.abs(c.y - d.from.y) <= 2)) bad.push(`${tagOf(s)}: 横穴 (${d.from.x}, ${d.from.y}, ${d.from.z}) が おどりばの そば`);
      }
    }
    fail('おどりば', bad);
  });
});

describe('E3: 形と 安全', () => {
  it('足の マスぜんぶ〔ひび・くずれた いしは ほった あと〕: 上 4 マス〔ひびの 通り道は 2〕空気・下 2 マス 固い・まわり 1 マスが 口・出口 いがい 固い', () => {
    expect(samples.length, '1E の 坑道が ない').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const s of samples) for (const m of safetyProblemsE(s.g, s.shaft, s.path).slice(0, 3)) bad.push(`${tagOf(s)}: ${m}`);
    fail('安全', bad);
  });

  it('箱が 広さ〔style.size〕と 区画の 中・箱の 中に 道ぜんぶ・天井の 上の 石〔地面まで cover.ground 以上・海の 下は cover.sea 以上〕', () => {
    expect(samples.length, '1E の 坑道が ない').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const s of samples) for (const m of boxProblems(s.shaft, s.path, s.seed)) bad.push(`${tagOf(s)}: ${m}`);
    fail('箱・天井', bad);
  });
});

describe('E4: もどれる〔道さがし〕', () => {
  it('入口と、階の 上り口・下り口・本道の はし・横穴の 先・いちばん 下の へやの 宝箱の 前・えだ道の 行きどまり〔へやの 床〕・迷路の どの ます・キャンプあとの 床・かくしべやの 床が 行き来 できる', () => {
    const bad: string[] = [];
    let mazes = 0;
    let camps = 0;
    let kakushi = 0;
    for (const s of samples) {
      expect(s.reach.fwd.capped, `${tagOf(s)}: 道さがしが 打ちきり`).toBeFalsy();
      for (const m of walkProblemsE(s.g, s.shaft, s.path, s.reach).slice(0, 3)) bad.push(`${tagOf(s)}: ${m}`);
      if (s.shaft.maze) mazes++;
      if (s.shaft.camp) camps++;
      if (s.path.some((c) => (c.part as string) === 'kakushi')) kakushi++;
    }
    // 見たい 物が 標本に 入って いる〔入って いないと この 確かめは 何も 見て いない〕
    expect(mazes, '迷路の ある 標本').toBeGreaterThan(0);
    expect(camps, 'キャンプの ある 標本').toBeGreaterThan(0);
    expect(kakushi, 'かくしべやの ある 標本').toBeGreaterThan(0);
    fail('道さがし', bad);
  });
});

describe('E5: 帰り道の しるしを 作らない', () => {
  it('生成の チョークの しるしが 道の まわりに ない〔チョーク ＝ id が chalk で はじまる ブロック〕', () => {
    expect(samples.length, '1E の 坑道が ない').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const s of samples) {
      const seen = new Set<string>();
      const pts: Pt[] = [];
      for (const c of s.path) for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (let dy = -1; dy <= 4; dy++) pts.push({ x: c.x + dx, y: c.y + dy, z: c.z + dz });
      for (const p of pts) {
        const k = `${p.x},${p.y},${p.z}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (s.orig.id(p.x, p.y, p.z).startsWith('chalk')) bad.push(`${tagOf(s)}: ${k} ${s.orig.id(p.x, p.y, p.z)}`);
      }
    }
    fail('チョーク', bad);
  });
});
