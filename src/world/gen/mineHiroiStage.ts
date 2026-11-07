import type { Geo } from './mineShaftSite';
import { stageRoomSteps, type RoomStage } from './mineCaveRoom';
import type { Overlay } from './mineCaveGrid';
import { colId } from './mineHiroiRoom';
import { hiroiShape, type HiroiLayout } from './mineHiroiShape';
import { createRng, hashInts, subSeed } from './random';

/** 出口の 前 4 マスに かかる 床の こぶ（局所の 番号）。根もとの まるが かかる 柱が あれば null（その 場所は やめる） */
function frontHits(l: HiroiLayout, fronts: Set<number>, ox: number, oz: number): { x: number; z: number }[] | null {
  if (fronts.size === 0) return [];
  for (const p of l.pillars) {
    const r = Math.ceil(p.widths[0]! / 2);
    for (let z = p.z - r; z <= p.z + r; z++) for (let x = p.x - r; x <= p.x + r; x++) if (Math.hypot(x - p.x, z - p.z) < p.widths[0]! / 2 && fronts.has(colId(ox + x, oz + z))) return null;
  }
  return l.bumps.filter((b) => fronts.has(colId(ox + b.x, oz + b.z)));
}

/** こぶ（床）を 取りのぞいた 計画 */
function dropBumps(l: HiroiLayout, drop: { x: number; z: number }[]): HiroiLayout {
  const lo = l.lo.slice();
  for (const b of drop) lo[b.z * l.size.x + b.x] = 0;
  return { ...l, lo, bumps: l.bumps.filter((b) => !drop.includes(b)) };
}

/**
 * ひろい ほらあなを 場所に ほる 前半（抽選の 部屋と 坑道の へや 共通）。出口の 前に こぶ・柱が かかる 場所は さける（こぶは けずる）。
 * salt は 乱数の 材料（抽選は 区画の 番号・坑道の へやは 坑道ごとの 数）。over は 坑道の へやだけ。
 * 短い 仕事ごとに yield する〔先読みが 時間で 止まれる ように〕。
 */
export function* stageHiroiSteps(G: Geo, seed: number, salt: readonly [number, number], layout0: HiroiLayout, x0: number, y0: number, z0: number, over?: Overlay): Generator<void, { room: RoomStage; layout: HiroiLayout } | null> {
  let layout = layout0;
  for (let pass = 0; pass < 2; pass++) {
    const room = yield* stageRoomSteps({ G, seed, kind: 'hiroi', shape: hiroiShape(layout), ox: x0, oy: y0, oz: z0, rng: createRng(hashInts(subSeed(seed, 935), salt[0], salt[1], pass)), over });
    const hit = frontHits(layout, room.fronts, x0, z0);
    if (hit === null) return null;
    if (hit.length === 0) return { room, layout };
    layout = dropBumps(layout, hit);
  }
  return null;
}
