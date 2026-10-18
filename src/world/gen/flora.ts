import { CHUNK_SIZE, SEA_Y } from '../../contracts';
import { newSample } from './biome';
import { GEN_CONFIG as C } from './config';
import { computeFarmPlacement } from './farmPlacement';
import { nearMouth } from './mouths';
import { plantsRaw, spacePlants, type Plant } from './plants';
import { hash01, subSeed } from './random';
import { epochCache } from './spacing';
import type { Terrain } from './terrain';
import { treesRaw } from './trees';

/**
 * くさ（kusa）・のばな（nobana）（FLORA-75 §3）。世界を作るときだけ置く。位置は (シード, x, z) の乱数だけで決まる
 * → 作る順に関係しない。木・はな・すすき・たけ（先にある物）には 勝てない（その場所には 置かない）。
 */

const F = C.flora;
const TRIS_PER = 8;

const rawStore = new WeakMap<Terrain, Map<number, Plant[]>>();
const MAX_RAW = 4000;
const farmStore = new WeakMap<Terrain, { box: { x0: number; z0: number; x1: number; z1: number } | null; wild: Set<number> }>();
const tmp = newSample();
/** どの国でも (くさ ＋ のばな) の こさは これ以下 */
const MAX_RATE = Math.max(...Object.values(F.rate).map((v) => v[0] + v[1]));
/** ふるい はたけ・やせいの やさい が スタートから 離れる いちばん遠い チェビシェフきょり（farmPlacement.ts: やせい 8〜56、はたけ 47 まで） */
const FARM_REACH = 56;
const k2 = (x: number, z: number): number => x * 100003 + z;

/** ふるい はたけ の あと（かかしの 8×8）と やせいの やさい の マス。スタートの まわりの四角の外では 調べない */
function farmSpots(T: Terrain): { box: { x0: number; z0: number; x1: number; z1: number } | null; wild: Set<number> } {
  let s = farmStore.get(T);
  if (!s) {
    const p = computeFarmPlacement(T.seed);
    s = { box: p.oldFarm ? { x0: p.oldFarm.box.x0, z0: p.oldFarm.box.z0, x1: p.oldFarm.box.x1, z1: p.oldFarm.box.z1 } : null, wild: new Set(p.wild.map((w) => k2(w.x, w.z))) };
    farmStore.set(T, s);
  }
  return s;
}

/** 列 (cx, cz) の くさ・のばな の こうほ（上限をかけた後・間隔のきまりの 前） */
export function floraRaw(T: Terrain, cx: number, cz: number): Plant[] {
  let m = rawStore.get(T);
  if (!m) rawStore.set(T, (m = new Map()));
  const key = (cx + 40000) * 80021 + (cz + 40000);
  let v = m.get(key);
  if (!v) {
    v = floraRawUncached(T, cx, cz);
    if (m.size >= MAX_RAW) m.delete(m.keys().next().value as number);
    m.set(key, v);
  }
  return v;
}

function floraRawUncached(T: Terrain, cx: number, cz: number): Plant[] {
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  const sF = subSeed(T.seed, 909);
  const sp = T.spawn();
  const rock = T.rock();
  const ks: { p: Plant; r: number }[] = [];
  const ns: { p: Plant; r: number }[] = [];
  let taken: Set<number> | null = null;
  let farm: ReturnType<typeof farmSpots> | null = null;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = x0 + lx;
      const z = z0 + lz;
      const r = hash01(sF, x, z, 1);
      if (r >= MAX_RATE) continue; // どの国の こさ（くさ＋のばな）より 大きい → 当たらない。国を 調べずに とばす
      const s = T.map.sampleInto(x, z, tmp);
      const ra = F.rate[s.kind];
      const rb = F.rate[s.kind2];
      const rk = ra[0] * s.a + rb[0] * (1 - s.a);
      const rn = ra[1] * s.a + rb[1] * (1 - s.a);
      if (rk + rn <= 0) continue;
      const isN = r < rn;
      if (!isN && r >= rn + rk) continue;
      if (Math.max(Math.abs(x - sp.x), Math.abs(z - sp.z)) <= F.startClear) continue;
      if (T.map.onTakePath(x, z, s) || nearMouth(T, x, z, F.mouthClear)) continue;
      // はじまりの岩山の まわり: 見える せきたん（空気に面した いし）を かくさない
      if (Math.hypot(x - rock.cx, z - rock.cz) <= rock.r + F.rockClear) continue;
      const h = T.height(x, z);
      if (h < SEA_Y + C.strata.landFrom || T.topBlock(x, z, h) !== 'grass' || T.map.pondAt(x, z) !== null) continue;
      if (taken === null) taken = occupied(T, cx, cz);
      if (taken.has(k2(x, z))) continue;
      // ふるい はたけ は スタートから 47 まで、やせいの やさい は 56 まで。それより 遠い所は 調べない（ふるい はたけ の 計算は 重い）
      if (Math.max(Math.abs(x - sp.x), Math.abs(z - sp.z)) <= FARM_REACH) {
        farm ??= farmSpots(T);
        if (farm.box && x >= farm.box.x0 && x <= farm.box.x1 && z >= farm.box.z0 && z <= farm.box.z1) continue;
        if (farm.wild.has(k2(x, z))) continue;
      }
      (isN ? ns : ks).push({ p: { x, z, id: isN ? 'nobana' : 'kusa', height: 1 }, r });
    }
  }
  // 上限: 乱数の値が小さい順に 上限まで（今の はな と同じ）
  ks.sort((a, b) => a.r - b.r);
  ns.sort((a, b) => a.r - b.r);
  return [...ks.slice(0, F.capKusa), ...ns.slice(0, F.capNobana)].map((f) => f.p);
}

/** 先にある物（木のみき・はな・すすき・たけ）の マス（この列の中だけ） */
function occupied(T: Terrain, cx: number, cz: number): Set<number> {
  const set = new Set<number>();
  for (const p of plantsRaw(T, cx, cz)) set.add(k2(p.x, p.z));
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const t of treesRaw(T, cx + dx, cz + dz)) {
        const w = t.big === true ? 2 : 1;
        for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) set.add(k2(t.x + a, t.z + b));
      }
    }
  }
  return set;
}

const finalStore = new WeakMap<Terrain, { epoch: number; map: Map<number, Plant[]> }>();

/** 列 (cx, cz) に 置く くさ・のばな（間隔のきまりの あと） */
export function floraOfChunk(T: Terrain, cx: number, cz: number): Plant[] {
  const memo = epochCache(finalStore, T);
  const key = (cx + 40000) * 80021 + (cz + 40000);
  const hit = memo.get(key);
  if (hit) return hit;
  const mine = floraRaw(T, cx, cz);
  const out = spacePlants(T, mine, () => {
    const near: Plant[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near.push(...floraRaw(T, cx + dx, cz + dz));
    return near;
  });
  if (memo.size > 4000) memo.clear();
  memo.set(key, out);
  return out;
}

/** window.__rikkun.biome.flora: その列の 本数と 三角形 */
export function floraCounts(T: Terrain, cx: number, cz: number): { kusa: number; nobana: number; tris: number } {
  let kusa = 0;
  let nobana = 0;
  for (const p of floraOfChunk(T, cx, cz)) {
    if (p.id === 'kusa') kusa++;
    else nobana++;
  }
  return { kusa, nobana, tris: (kusa + nobana) * TRIS_PER };
}
