import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { createMineHook } from './mineHook';
import {
  SEEDS_20,
  components,
  genColumn,
  hook1c,
  isBodyIndex,
  isSolidIndex,
  pathIndex,
  ptKey,
  sampleShafts,
  type Compass,
  type GenCols,
  type Layer,
  type PathCell,
  type Pt,
  type Shaft,
} from './mineShaftKit';
import { spawnOf } from './terrain';

/**
 * MINE-1C（docs/design/MINE-1.md §4.5.2・§4.6「ある 坑道」・受け入れ基準 C6・C7）: 横穴・いちばん 下の へや・宝箱の 場所。
 *
 *   C6: 横穴〔1 つの 坑道に 5 本 まで・9 割 以上の 坑道で 2 本 以上・1 つの おどりば／へやから 1 本まで・長さ 12〜40・曲がり 0〜2・坑道ごとに ちがう〕と、
 *       先〔cave・joint・koheya〕。`length`・`bends` は 計画の 値〔実際の マス数は これ 以下〕。
 *   C7: へやの かべに きんの いし 8 こ 以上・てつ 4 こ 以上。宝箱の ある わりあいが `chestTable('kodo').placeChance` ± 0.06〔坑道 300 こ 以上。
 *       ここでは ゆらぎを 3σ に 入れる ため 600 こ 以上〕。ある ときは おくの かべの まん中に 2 マス〔同じ 列・本体は 前から 見て 左〕。
 *   名前と 約束は mineShaftKit.ts の 先頭。【PO 案】の「半分 以上が cave か joint」は 試作の 数で 見なおす。
 */

/** 坑道を たくさん しらべる ので 1 つの it に ゆとりを みる */
vi.setConfig({ testTimeout: 120_000 });

interface Sample {
  seed: number;
  shaft: Shaft;
  path: PathCell[];
  g: GenCols;
}
const samples: Sample[] = [];

beforeAll(() => {
  for (const seed of SEEDS_20) {
    const s = sampleShafts(seed, 2);
    for (const shaft of s.shafts) samples.push({ seed, shaft, path: s.hook.shaftPath(shaft.id), g: s.g });
  }
}, 240_000);

const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const cheb = (a: Pt, b: Pt): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));

describe('C6: 横穴', () => {
  it('坑道が 集まる', () => {
    expect(samples.length).toBeGreaterThanOrEqual(SEEDS_20.length + 10);
  });

  it('1 つの 坑道に 5 本 まで・9 割 以上の 坑道で 2 本 以上・1 つの おどりば／へやから 1 本まで〔from が 重ならない〕', () => {
    let two = 0;
    for (const s of samples) {
      expect(s.shaft.sides.length, `seed ${s.seed} ${s.shaft.id}`).toBeLessThanOrEqual(5);
      if (s.shaft.sides.length >= 2) two++;
      const keys = s.shaft.sides.map((d) => ptKey(d.from));
      expect(new Set(keys).size, `seed ${s.seed} ${s.shaft.id}: 同じ 出どころから 2 本`).toBe(keys.length);
      // 出どころは おどりば〔どの 層でも〕か いちばん 下の へやの そば
      const { byPart } = pathIndex(s.path);
      const hubs = [...(byPart.get('landing') ?? []), ...(byPart.get('room') ?? [])];
      for (const d of s.shaft.sides) expect(hubs.some((h) => cheb(h, d.from) <= 2), `seed ${s.seed} ${s.shaft.id}: 横穴の 出どころ ${ptKey(d.from)} が おどりば／へやの そば`).toBe(true);
    }
    expect(two / samples.length).toBeGreaterThanOrEqual(0.9);
  });

  it('長さ 12〜40・曲がり 0〜2〔計画の 値〕・先の 種類は cave／joint／koheya・層は 3 つの どれか', () => {
    for (const s of samples) {
      for (const d of s.shaft.sides) {
        const tag = `seed ${s.seed} ${s.shaft.id}`;
        expect(d.length, `${tag} の 長さ`).toBeGreaterThanOrEqual(12);
        expect(d.length, `${tag} の 長さ`).toBeLessThanOrEqual(40);
        expect(Number.isInteger(d.bends) && d.bends >= 0 && d.bends <= 2, `${tag} の 曲がり ${d.bends}`).toBe(true);
        expect(['cave', 'joint', 'koheya']).toContain(d.end);
        expect(['asai', 'nakahodo', 'fukai']).toContain(d.layer);
      }
    }
  });

  it('横穴から 分かれない: 横穴の マスは ひとつづきの 道で、おどりば／へやに つながる 口は 出どころの 1 つ だけ', () => {
    for (const s of samples) {
      const { byPart } = pathIndex(s.path);
      const sideCells = byPart.get('side') ?? [];
      // 'side' の かたまり〔横穴 1 本 ＝ 1 かたまり。つなぎの へや・こべやは べつの 部分〕の 数が 本数を こえない
      const comps = components(sideCells);
      expect(comps.length, `seed ${s.seed} ${s.shaft.id}: 横穴の かたまり`).toBeLessThanOrEqual(s.shaft.sides.length);
    }
  });

  it('上り下りは 2 マスに 1 段 まで〔横穴 1 本の 中で 2 マス いないの 高さの ちがいが 1 以下。べつの 層の 横穴が 上下に 重なるのは ふつう〕', () => {
    const bad: string[] = [];
    let tunnels = 0;
    for (const s of samples) {
      // 横穴 1 本ずつ〔段差 1 までで つながる かたまり。べつの 層の 横穴は べつの かたまり〕
      for (const comp of components(s.path.filter((c) => c.part === 'side'))) {
        tunnels++;
        const byXZ = new Map<string, number[]>();
        for (const c of comp) (byXZ.get(`${c.x},${c.z}`) ?? byXZ.set(`${c.x},${c.z}`, []).get(`${c.x},${c.z}`)!).push(c.y);
        for (const c of comp) {
          for (const [dx, dz] of [...FOUR, [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
            for (const y of byXZ.get(`${c.x + dx},${c.z + dz}`) ?? []) if (Math.abs(y - c.y) > 1) bad.push(`seed ${s.seed} ${s.shaft.id}: (${c.x}, ${c.y}, ${c.z}) と ${dx},${dz} さきで 高さ ${Math.abs(y - c.y)} ちがう`);
          }
        }
      }
    }
    expect(tunnels, '横穴').toBeGreaterThan(0);
    expect(bad.slice(0, 5), `${bad.length} つ`).toEqual([]);
  });

  it('実際の 横穴は 計画の 値の 中: 「side」の マス数は はば 3 × length 以下〔手前で ほらあなに つながると 短く なる〕・曲がり角は 平らな 3×3 で 数は bends 以下', () => {
    const bad: string[] = [];
    let tunnels = 0;
    let corners = 0;
    for (const s of samples) {
      const comps = components(s.path.filter((c) => c.part === 'side'));
      for (const d of s.shaft.sides) {
        // この 横穴の かたまり〔出口 to に いちばん 近い〕
        const near = (c: Pt[]): number => Math.min(...c.map((p) => cheb(p, d.to)));
        const comp = comps.slice().sort((p, q) => near(p) - near(q))[0];
        if (!comp || near(comp) > 3) continue; // つなぎの へや・こべやが 出口の すぐ 先に ある 横穴は 数えない
        tunnels++;
        const tag = `seed ${s.seed} ${s.shaft.id}`;
        if (comp.length > 3 * d.length) bad.push(`${tag}: 横穴の マス ${comp.length} > はば 3 × 長さ ${d.length}`);
        const at = new Map<string, number[]>();
        for (const c of comp) (at.get(`${c.x},${c.z}`) ?? at.set(`${c.x},${c.z}`, []).get(`${c.x},${c.z}`)!).push(c.y);
        const has = (x: number, z: number): boolean => at.has(`${x},${z}`);
        const found: Pt[] = [];
        for (const key of at.keys()) {
          const [x0, z0] = key.split(',').map(Number) as [number, number];
          let full = true;
          for (let dx = 0; dx < 3 && full; dx++) for (let dz = 0; dz < 3; dz++) if (!has(x0 + dx, z0 + dz)) full = false;
          if (!full) continue;
          const alongX = has(x0 - 1, z0 + 1) || has(x0 + 3, z0 + 1);
          const alongZ = has(x0 + 1, z0 - 1) || has(x0 + 1, z0 + 3);
          if (!(alongX && alongZ)) continue; // まっすぐ
          const ys = new Set<number>();
          for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) for (const y of at.get(`${x0 + dx},${z0 + dz}`)!) ys.add(y);
          if (ys.size !== 1) bad.push(`${tag}: 曲がり角 (${x0}, ${z0}) の 3×3 が 平らでない（高さ ${[...ys].join(',')}）`);
          found.push({ x: x0, y: [...ys][0]!, z: z0 });
        }
        // 角の まとまり〔となりあう 3×3 は 1 つ〕
        const clusters: Pt[][] = [];
        for (const f of found) {
          const g = clusters.find((cl) => cl.some((o) => cheb(o, f) <= 2));
          if (g) g.push(f);
          else clusters.push([f]);
        }
        corners += clusters.length;
        if (clusters.length > d.bends) bad.push(`${tag}: 曲がり角 ${clusters.length} > 計画の bends ${d.bends}`);
      }
    }
    expect(tunnels, '横穴').toBeGreaterThan(0);
    expect(bad.slice(0, 6), `${bad.length} つ`).toEqual([]);
    expect(corners, '曲がり角が 1 つ 以上').toBeGreaterThan(0);
  }, 120_000);

  it('先: joint は 床 5×5 〔25 マス いじょう〕・koheya は 床 5×5 で その 層の 鉱石が 3 こ 以上 見える', () => {
    const oreByLayer = new Map<Layer, Set<string>>();
    for (const row of createMineHook({ seed: 1 }).oreTable()) (oreByLayer.get(row.layer as Layer) ?? oreByLayer.set(row.layer as Layer, new Set()).get(row.layer as Layer)!).add(row.block);
    let nJoint = 0;
    let nKoheya = 0;
    for (const s of samples) {
      const { byPart } = pathIndex(s.path);
      const ends = new Set(s.shaft.sides.map((d) => d.end));
      const joint = byPart.get('joint') ?? [];
      const koheya = byPart.get('koheya') ?? [];
      expect(joint.length > 0, `seed ${s.seed} ${s.shaft.id}: joint の 横穴が あれば つなぎの へやの 床が ある`).toBe(ends.has('joint'));
      expect(koheya.length > 0, `seed ${s.seed} ${s.shaft.id}: koheya の 横穴が あれば こべやの 床が ある`).toBe(ends.has('koheya'));
      for (const comp of components(joint)) {
        nJoint++;
        expect(comp.length, `seed ${s.seed} ${s.shaft.id} の つなぎの へや`).toBeGreaterThanOrEqual(25);
      }
      for (const comp of components(koheya)) {
        nKoheya++;
        expect(comp.length, `seed ${s.seed} ${s.shaft.id} の こべや`).toBeGreaterThanOrEqual(25);
        // この こべやに つながる 横穴〔出口 to が いちばん 近い koheya の 横穴〕の 層
        const near = (d: Shaft['sides'][number]): number => Math.min(...comp.map((c) => Math.hypot(c.x - d.to.x, c.y - d.to.y, c.z - d.to.z)));
        const layer = s.shaft.sides.filter((d) => d.end === 'koheya').sort((p, q) => near(p) - near(q))[0]!.layer;
        const ores = oreByLayer.get(layer)!;
        const seen = new Set<string>();
        for (const c of comp) {
          for (let k = 0; k < 4; k++) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] as const) {
            const p = { x: c.x + dx, y: c.y + k + dy, z: c.z + dz };
            if (ores.has(s.g.id(p.x, p.y, p.z))) seen.add(ptKey(p));
          }
          for (const y of [c.y + 4, c.y - 1]) if (ores.has(s.g.id(c.x, y, c.z))) seen.add(ptKey({ x: c.x, y, z: c.z }));
        }
        expect(seen.size, `seed ${s.seed} ${s.shaft.id} の こべやで 見える ${layer} の 鉱石`).toBeGreaterThanOrEqual(3);
      }
    }
    // 1 つも 無いと この 確かめは 何も 見て いない〔cave ばかりに ならない〕
    expect(nJoint + nKoheya, 'つなぎの へや／こべやが 1 つ 以上').toBeGreaterThan(0);
  });

  it('坑道ごとに ちがう〔計画の 値〕: 本数が 3 とおり 以上・長さの はばが 15 以上・曲がり 0・1・2 が どれも ある。半分 以上の 横穴が cave か joint【PO 案】', () => {
    const counts = new Set(samples.map((s) => s.shaft.sides.length));
    const lens = samples.flatMap((s) => s.shaft.sides.map((d) => d.length));
    const bends = new Set(samples.flatMap((s) => s.shaft.sides.map((d) => d.bends)));
    expect(counts.size, `本数 ${[...counts].join(',')}`).toBeGreaterThanOrEqual(3);
    expect(Math.max(...lens) - Math.min(...lens), '長さの はば').toBeGreaterThanOrEqual(15);
    for (const b of [0, 1, 2]) expect(bends.has(b), `曲がり ${b}`).toBe(true);
    const ends = samples.flatMap((s) => s.shaft.sides.map((d) => d.end));
    expect(ends.filter((e) => e === 'cave' || e === 'joint').length / ends.length, 'ほらあなへ 出られる 横穴').toBeGreaterThanOrEqual(0.5);
  });

  it('はじまりの 坑道: なかほど〔足 y 64〜84 の おどりば〕から 1 本 以上〔20 シードぜんぶ〕', () => {
    const starts = samples.filter((s) => s.shaft.start);
    expect(starts).toHaveLength(SEEDS_20.length);
    for (const s of starts) expect(s.shaft.sides.some((d) => d.layer === 'nakahodo' && d.from.y >= 64 && d.from.y <= 84), `seed ${s.seed}`).toBe(true);
  });
});

// ------------------------------------------------------------------ C7

const FRONT_VEC: Record<Compass, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
/** 前から 見て 右の ずれ〔前に 立って 宝箱を 見る ひとの 右〕 */
const RIGHT_VEC: Record<Compass, readonly [number, number]> = { n: [-1, 0], e: [0, -1], s: [1, 0], w: [0, 1] };

describe('C7: いちばん 下の へや', () => {
  it('かべに きんの いし 8 こ 以上・てつ 4 こ 以上 見える〔宝箱を 置いた あとで 数える〕', () => {
    for (const s of samples) {
      const r = s.shaft.room;
      const kin = new Set<string>();
      const iron = new Set<string>();
      for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
        for (let z = r.z0 - 1; z <= r.z1 + 1; z++) {
          for (let y = r.y - 1; y <= r.y + 5; y++) {
            const inside = x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y >= r.y && y <= r.y + 4;
            if (inside) continue;
            const id = s.g.id(x, y, z);
            if (id !== 'kin_ore' && id !== 'iron_ore') continue;
            const touches = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => {
              const nx = x + dx!;
              const ny = y + dy!;
              const nz = z + dz!;
              return nx >= r.x0 && nx <= r.x1 && nz >= r.z0 && nz <= r.z1 && ny >= r.y && ny <= r.y + 4;
            });
            if (touches) (id === 'kin_ore' ? kin : iron).add(`${x},${y},${z}`);
          }
        }
      }
      expect(kin.size, `seed ${s.seed} ${s.shaft.id} の きんの いし`).toBeGreaterThanOrEqual(8);
      expect(iron.size, `seed ${s.seed} ${s.shaft.id} の てつ`).toBeGreaterThanOrEqual(4);
    }
  });

  it('宝箱が ある 坑道: へやの おくの 列〔かべぎわ〕の まん中を ふくむ 2 マス・同じ 列・本体は 前から 見て 左・下は 固い・上と 前は 空気〔たいまつ なし〕・chestAt が 2 マス 同じ', () => {
    const withChest = samples.filter((s) => s.shaft.chest !== null);
    expect(withChest.length, '宝箱の ある 坑道').toBeGreaterThanOrEqual(3);
    for (const s of withChest) {
      const c = s.shaft.chest!;
      const r = s.shaft.room;
      const tag = `seed ${s.seed} ${s.shaft.id}`;
      expect(c.cells, `${tag}: 2 マス`).toHaveLength(2);
      expect(c.cells[0], `${tag}: 本体が 先`).toMatchObject({ x: c.x, y: c.y, z: c.z });
      expect(c.cells.every((p) => p.y === r.y), `${tag}: へやの 床の 高さ`).toBe(true);
      expect(Math.abs(c.cells[0]!.x - c.cells[1]!.x) + Math.abs(c.cells[0]!.z - c.cells[1]!.z), `${tag}: となりあう`).toBe(1);
      // おくの 列: 前の 向きの 反対がわの はし
      const [fx, fz] = FRONT_VEC[c.front];
      const back = fx !== 0 ? (fx > 0 ? r.x0 : r.x1) : fz > 0 ? r.z0 : r.z1;
      expect(c.cells.every((p) => (fx !== 0 ? p.x === back : p.z === back)), `${tag}: おくの 列〔前 ${c.front}〕`).toBe(true);
      // まん中を ふくむ。2 マスが 同じ 列〔16×16〕。どちらも 入るなら 前から 見て 右
      const mid = fx !== 0 ? { x: back, z: (r.z0 + r.z1) >> 1 } : { x: (r.x0 + r.x1) >> 1, z: back };
      expect(c.cells.some((p) => p.x === mid.x && p.z === mid.z), `${tag}: まん中の マスを ふくむ`).toBe(true);
      expect(new Set(c.cells.map((p) => `${p.x >> 4},${p.z >> 4}`)).size, `${tag}: 2 マスが 同じ 列`).toBe(1);
      const [rx, rz] = RIGHT_VEC[c.front];
      const sameCol = (a: Pt, b: Pt): boolean => a.x >> 4 === b.x >> 4 && a.z >> 4 === b.z >> 4;
      const midP = { x: mid.x, y: r.y, z: mid.z };
      const rightP = { x: mid.x + rx, y: r.y, z: mid.z + rz };
      const expectCells = sameCol(midP, rightP) ? [midP, rightP] : [{ x: mid.x - rx, y: r.y, z: mid.z - rz }, midP];
      expect(c.cells.map(ptKey), `${tag}: 2 マスの えらび方〔どちらも 入るなら 右〕`).toEqual(expectCells.map(ptKey));
      // 本体は 前から 見て 左 ＝ 右の 反対がわ
      expect(c.cells[0]!.x - c.cells[1]!.x, `${tag}: 本体が 左`).toBe(-rx || 0);
      expect(c.cells[0]!.z - c.cells[1]!.z, `${tag}: 本体が 左`).toBe(-rz || 0);
      // 下は 固い・上と 前は 空気・たいまつ なし
      for (const p of c.cells) {
        expect(isSolidIndex(s.g.at(p.x, p.y - 1, p.z)), `${tag}: 下が 固い`).toBe(true);
        expect(isBodyIndex(s.g.at(p.x, p.y + 1, p.z)) && s.g.id(p.x, p.y + 1, p.z) !== 'torch', `${tag}: 上が 空気`).toBe(true);
        const front = { x: p.x + fx, y: p.y, z: p.z + fz };
        expect(isBodyIndex(s.g.at(front.x, front.y, front.z)) && s.g.id(front.x, front.y, front.z) !== 'torch', `${tag}: 前が 空気`).toBe(true);
      }
      // chestAt は どちらの マスでも 同じ
      // chestAt は 生きている 世界〔あいたか〕を 読む 側: 宝箱の 列だけ 読みこんだ 世界を わたす
      const world = new ArrayVoxelWorld({ x: 0, z: 0 });
      world.loadColumn(genColumn(s.seed, c.cells[0]!.x >> 4, c.cells[0]!.z >> 4));
      const h = hook1c(s.seed, { world });
      const a = h.chestAt(c.cells[0]!.x, c.cells[0]!.y, c.cells[0]!.z);
      const b = h.chestAt(c.cells[1]!.x, c.cells[1]!.y, c.cells[1]!.z);
      expect(a, `${tag}: chestAt 本体`).not.toBeNull();
      expect(b, `${tag}: chestAt のこり`).toEqual(a);
      expect(a).toMatchObject({ table: 'kodo', tier: c.tier, opened: false, front: c.front, main: { x: c.x, y: c.y, z: c.z } });
      expect(a!.cells.map(ptKey)).toEqual(c.cells.map(ptKey));
    }
  });
});

describe('C7: 宝箱の ある わりあい', () => {
  it('坑道 600 こ 以上〔シード いくつか〕で、宝箱の ある わりあいが chestTable("kodo").placeChance ± 0.06', () => {
    let n = 0;
    let withChest = 0;
    let placeChance = -1;
    for (const seed of SEEDS_20) {
      if (n >= 600) break;
      const h = hook1c(seed);
      placeChance = h.chestTable('kodo').placeChance;
      const sp = spawnOf(seed);
      for (const s of h.shafts(sp.x - 3072, sp.z - 3072, sp.x + 3071, sp.z + 3071)) {
        n++;
        if (s.chest !== null) withChest++;
      }
    }
    expect(n, '数えた 坑道').toBeGreaterThanOrEqual(600);
    expect(Math.abs(withChest / n - placeChance), `宝箱の ある わりあい ${(withChest / n).toFixed(3)}・表 ${placeChance}`).toBeLessThanOrEqual(0.06);
  }, 240_000);

  it('はじまりの 坑道も 同じ 抽選〔20 シードで 宝箱の ある 坑道と ない 坑道の 両方が ある。毎回 かならず ある ではない〕', () => {
    const has = SEEDS_20.map((seed) => hook1c(seed).startShaft().chest !== null);
    expect(has.some((x) => x), '宝箱の ある シード').toBe(true);
    expect(has.some((x) => !x), '宝箱の ない シード').toBe(true);
  });
});
