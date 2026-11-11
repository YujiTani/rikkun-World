import { SEA_Y } from '../../contracts';
import { BLOCK_INDEX, isTorchIndex } from '../blocks/blockTypes';
import { chestBlockId } from '../blocks/chestBlock';
import { colKey } from '../stream/ring';
import { SHAPE_TABLE } from './mineBokenConfig';
import { roadSpots } from './mineBokenSides';
import { keyOf } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import type { Planned } from './mineShaftPlanned';
import type { Geo } from './mineShaftSite';
import type { PathCell, Pt } from './mineShaftTypes';
import { YAKATA_TABLE as T, YAKATA_TUNING as TUNE } from './mineYakataConfig';
import { yakataBoxOf, yakataShape, type Role, type YakataShape } from './mineYakataGeom';
import { yakataHit, yakataLook } from './mineYakataRoll';
import type { Box3, Yakata } from './mineYakataTypes';
import { createRng, hashInts, randInt, shuffle, subSeed } from './random';
import { heightAt } from './terrain';

/**
 * やかたを 1E の 坑道〔計画の 1 だん目。かえない〕に つける 2 だん目（MINE-1F §4.1・§4.2）。
 * いちばん 下の 階の 本道の 口の 候補を くじで ならべ、はじめに 入った 1 つを とる。入らなければ 置かない〔work.yakata は ためした 数〕。
 * 置けたら 計画の 置く 物〔`b`〕・列・外の 四角に やかたを 足す。道〔`plan.path`〕は さわらない〔1D の 部屋の 計画が 読む ので。F3〕。
 * 1 回 ためすごとに yield する〔先読みが 時間で 止まれる〕。
 */

export interface StageEnv {
  G: Geo;
  seed: number;
  rx: number;
  rz: number;
  /** 1F より 前に 保存した 列か */
  isOldCol(k: number): boolean;
  /** 箱の まわりの 1D の ほらあなの 箱〔計画が まだ なら 少しずつ すすめる〕 */
  caveBoxes(x0: number, z0: number, x1: number, z1: number): Generator<void, Box3[]>;
}

const cheb = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
const R = S.region;
/** 1E の 道の 足の マスと の あいだ〔マス。大広間の かべの 外と 横穴の まわり〕 */
const PATH_MARGIN = 2;
/** 1D の 部屋・坑道の へやと の あいだ〔マス。箱どうし〕 */
const CAVE_MARGIN = 4;
const ROOM_MARGIN = 2;
/** 同じ 階と みなす 高さの ちがい〔マス。以下〕 */
const FLOOR_NEAR = 6;
/** 同じ 口で ためす 横穴の 長さの 種類〔くじ・みじかい・ながい〕 */
const LENGTHS = 3;

/** 道の 足の マスが 大広間・横穴に ちかすぎないか〔yakataReport の placeProblemsF と 同じ きまり〕 */
function pathClear(path: readonly PathCell[], sh: YakataShape): boolean {
  const solid = { x0: sh.hall.x0 - 1 - T.ring, x1: sh.hall.x1 + 1 + T.ring, z0: sh.hall.z0 - 1 - T.ring, z1: sh.hall.z1 + 1 + T.ring };
  const yLo = sh.hall.y - 1 - T.ring - PATH_MARGIN;
  const yHi = sh.hall.y + T.hall.height + 1 + T.ring + PATH_MARGIN;
  const P = sh.passage.slice(3);
  const half = Math.floor(T.passage.width / 2) + PATH_MARGIN;
  for (const c of path) {
    if (c.x >= solid.x0 - PATH_MARGIN && c.x <= solid.x1 + PATH_MARGIN && c.z >= solid.z0 - PATH_MARGIN && c.z <= solid.z1 + PATH_MARGIN && c.y >= yLo && c.y <= yHi) return false;
    for (const p of P) if (Math.abs(c.x - p.x) <= half && Math.abs(c.z - p.z) <= half && c.y >= p.y - 3 && c.y <= p.y + T.passage.height + 2) return false;
  }
  return true;
}

/** 地形: いけ・洞くつの 口の 近くでなく、天井の 上に 石が 足りる */
function terrainOk(G: Geo, seed: number, sh: YakataShape): boolean {
  const C = S.cover;
  const pts: { x: number; z: number; roof: number }[] = [];
  const hallRoof = sh.hall.y + T.hall.height + 1;
  for (let x = sh.hall.x0 - 3; x <= sh.hall.x1 + 3; x += 4) for (let z = sh.hall.z0 - 3; z <= sh.hall.z1 + 3; z += 4) pts.push({ x, z, roof: hallRoof });
  for (const x of [sh.hall.x1 + 3]) for (const z of [sh.hall.z1 + 3]) pts.push({ x, z, roof: hallRoof });
  for (const p of sh.passage) pts.push({ x: p.x, z: p.z, roof: p.y + T.passage.height + 1 });
  for (const q of pts) {
    let thin = false;
    for (const ground of [G.h(q.x, q.z), heightAt(seed, q.x, q.z)]) {
      const need = ground <= SEA_Y - 1 ? C.sea : C.ground;
      if (ground - q.roof < need) return false;
      if (ground - q.roof < TUNE.specialDepth) thin = true;
    }
    // いけ・溶岩・はじまりの 岩山・洞くつの 口は 上の 石が うすい ときだけ さける〔ふかければ ひびかない〕
    if (thin && (G.special(q.x, q.z, 2) || G.nearMouth(q.x, q.z, 3))) return false;
  }
  return true;
}

const overlaps = (a: Box3, b: Box3, m: number): boolean => Math.max(b.x0 - a.x1, a.x0 - b.x1, b.z0 - a.z1, a.z0 - b.z1, b.y0 - a.y1, a.y0 - b.y1) <= m;

/** 口から 先の くじを 引いて 入る 形を さがす。入れば 計画に 足して true */
export function* yakataStage(env: StageEnv, planned: Planned): Generator<void, boolean> {
  const { plan } = planned;
  const { shaft } = plan;
  const { G, seed, rx, rz } = env;
  if (shaft.gen !== 'e' || shaft.style?.depth !== 'fukai' || !plan.boken || !yakataHit(seed, rx, rz)) return false;
  const bottom = plan.boken.bottom;
  const rng = createRng(hashInts(subSeed(seed, TUNE.tags.plan), rx, rz));
  // 口の 候補: いちばん 下の 階の 本道
  const spots = roadSpots(bottom).map((sp) => ({ hub: sp.hub, at: bottom.main[sp.i]! as { x: number; z: number } }));
  const cands = shuffle(rng, spots.flatMap((sp) => [-1, 1].map((sgn) => ({ sp, sgn }))));
  // 口の あいだは 同じ 階の 口だけ くらべる〔ほかの 階の 口は 高さが ちがい ぶつからない〕
  const others: Pt[] = [...shaft.sides.map((d) => d.from), ...(shaft.maze ? [shaft.maze.entrance] : []), ...(shaft.branches ?? []).map((b) => b.from)].filter((p) => Math.abs(p.y - bottom.y) <= FLOOR_NEAR);
  const mouths = [...plan.boken.mouths, ...others.map((p) => ({ x: p.x, z: p.z }))];
  let tried = 0;
  const lim = Math.min(SHAPE_TABLE.limit.tries.yakata, cands.length * LENGTHS);
  const work = shaft.work!;
  for (let i = 0; i < lim; i++) {
    tried++;
    work.yakata = tried;
    yield;
    const { sp, sgn } = cands[i % cands.length]!;
    const fr = sp.hub.frame;
    const y = sp.hub.y;
    const t = { x: fr.lx * sgn, z: fr.lz * sgn };
    const w = { x: fr.ux, z: fr.uz };
    const v = sgn > 0 ? sp.hub.vMax - 1 : sp.hub.vMin + 1; // 道は かべが ±2、ひろばは はしの かべ
    const o = { x: sp.at.x + fr.lx * v, y, z: sp.at.z + fr.lz * v };
    const mouth = { x: o.x + t.x * 2, y, z: o.z + t.z * 2 };
    if (mouths.some((m) => cheb(m, mouth) < TUNE.mouthGap)) continue; // 口どうし〔テストも 口の 場所で くらべる〕
    const [lo, hi] = T.passage.length;
    const length = Math.floor(i / cands.length) === 0 ? randInt(rng, lo, hi) : Math.floor(i / cands.length) === 1 ? lo : hi; // 1 まわり目は くじ、2・3 まわり目は いちばん みじかい・ながい

    const sh = yakataShape({ o, t, w, y, length, rng: createRng(hashInts(subSeed(seed, TUNE.tags.spots), rx, rz, i)) });
    if (sh.spawns.length < T.spawn.perZone * 3) continue;
    const box = yakataBoxOf(sh);
    if (box.x0 - rx * R < 2 || box.z0 - rz * R < 2 || (rx + 1) * R - 1 - box.x1 < 2 || (rz + 1) * R - 1 - box.z1 < 2) continue;
    if (!terrainOk(G, seed, sh)) continue;
    if (!pathClear(plan.path, sh)) continue;
    let hit = false;
    for (const set of [sh.air, sh.ring, sh.roles.keys()]) for (const k of set) if (plan.b.air.has(k)) hit = true;
    for (const k of sh.air) {
      const v = plan.b.put.get(k);
      if (v !== undefined && isTorchIndex(v)) hit = true; // 1E の 光る 物〔たいまつ〕だけ さける〔わくなど ほかの 置き物は 上書きして よい。わくも さけると 置ける 割合が 0.573 に 下がり F1 が 赤〕
    }
    if (hit) continue;
    if (plan.rooms.some((r) => overlaps(r.box, box, ROOM_MARGIN))) continue;
    const caves = yield* env.caveBoxes(box.x0 - 16, box.z0 - 16, box.x1 + 16, box.z1 + 16);
    if (caves.some((c) => overlaps(c, box, CAVE_MARGIN))) continue;
    const cols = colsOf(box, 2);
    if (cols.some((k) => env.isOldCol(k))) return false;
    merge(planned, sh, box, cols, yakataLook(seed, rx, rz));
    shaft.yakata = built(shaft.id, sh, yakataLook(seed, rx, rz));
    return true;
  }
  return false;
}

function colsOf(b: Box3, m: number): number[] {
  const out: number[] = [];
  for (let cz = (b.z0 - m) >> 4; cz <= (b.z1 + m) >> 4; cz++) for (let cx = (b.x0 - m) >> 4; cx <= (b.x1 + m) >> 4; cx++) out.push(colKey(cx, cz));
  return out;
}

function built(id: string, sh: YakataShape, look: Yakata['look']): Yakata {
  return {
    id,
    hit: true,
    look,
    passage: sh.passage.map((p) => ({ ...p })),
    gate: { ...sh.gate },
    hall: { ...sh.hall },
    altar: { ...sh.altar },
    chest: { x: sh.chest.x, y: sh.chest.y, z: sh.chest.z, cells: sh.chest.cells.map((p) => ({ ...p })), front: sh.chest.front, tier: 4 },
    spawns: sh.spawns.map((s) => ({ at: { ...s.at }, zone: s.zone })),
  };
}

/** 計画の 置く 物へ 足す〔かべ・床・柱・祭壇・たいまつ・宝箱・外がわの いし〕 */
function merge(planned: Planned, sh: YakataShape, box: Box3, cols: number[], look: Yakata['look']): void {
  const { plan } = planned;
  const B = T.lookBlocks[look];
  const block = (r: Role): number => BLOCK_INDEX[B[r] as keyof typeof BLOCK_INDEX];
  const b = plan.b;
  for (const k of sh.air) {
    b.air.add(k);
    b.put.delete(k);
    b.ring.delete(k);
  }
  for (const k of sh.ring) b.ring.add(k);
  for (const [k, r] of sh.roles) {
    b.put.set(k, block(r));
    b.air.delete(k);
    b.ring.delete(k);
  }
  sh.chest.cells.forEach((c, i) => b.put.set(keyOf(c.x, c.y, c.z), BLOCK_INDEX[chestBlockId(4, false, i === 1)]));
  for (const k of cols) plan.cols.add(k);
  plan.ext = { x0: box.x0, z0: box.z0, x1: box.x1, z1: box.z1 };
  plan.yakata = { yakata: built(plan.shaft.id, sh, look), box, air: sh.air, path: sh.path };
  planned.ops = null;
}
