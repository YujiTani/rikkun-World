// 街（TOWN-1 1.4）: 妖怪の わざで こわれた 街の マスの 記録と 朝の もどし の つなぎ。
// 部品は src/town/townRepairs.ts。ここは 世界・時間・人・妖怪・もちものを 口に つなぐだけ。
import { buildBlocks } from '../../world/gen/chunk';
import { overlapsBody } from '../../dig/digCore';
import type { DigTownPort } from '../../dig/digPorts';
import { isLiquidIndex } from '../../world/blocks/liquids';
import type { BlockId, ItemId } from '../../contracts';
import { createPlanReader } from '../../town/townPlanBlock';
import { townGuards } from '../../town/townGuard';
import { TownRepairs, type RepairPlayer } from '../../town/townRepairs';
import { currentTown } from '../../town/townState';
import type { WiredFighters } from './combat';

/** いま 開いて いる 世界の 記録（1 つ）。ほる・置く の 口と テストの 窓口が 読む（作る 前は null） */
let current: TownRepairs | null = null;
let planReader: ((x: number, y: number, z: number) => string) | null = null;

export const townRepairsNow = (): TownRepairs | null => current;
/** 記録を 使う（wireTownRepair が よぶ。テストは 自分で 作った 物を 入れる。null で 外す） */
export function bindTownRepairs(r: TownRepairs | null): void {
  current = r;
}
/** その マスの 設計・生成の 中身（記録が まだ 無い とき・テストの 窓口用） */
export const townPlanBlock = (x: number, y: number, z: number): string => planReader?.(x, y, z) ?? 'air';

/** 街の はんいの 中で あきちの 外か（高さは 問わない） */
function inTownBody(x: number, z: number): boolean {
  const t = currentTown();
  return t !== null && t.inTown(x, z) && !t.inLot(x, z);
}

/** ほれない マスか（街の 中の あきち 以外で、記録の マスでも ふちでも ない。AC9） */
export const townDigLocked = (x: number, y: number, z: number): boolean => inTownBody(x, z) && !(current?.canDig(x, y, z) ?? false);
/** 置けない マスか（街の 中の あきち 以外で、記録の マスで ない） */
export const townPlaceLocked = (x: number, y: number, z: number): boolean => inTownBody(x, z) && !(current?.canPlace(x, y, z) ?? false);

/** ほる・置く の 口（1P・2P で 1 つずつ。who ＝ 置いた 人の 印） */
export function townDigPort(who: 1 | 2): DigTownPort {
  return {
    locked: townDigLocked,
    placeLocked: townPlaceLocked,
    dug: (x, y, z) => current?.dug(x, y, z) ?? false,
    placed: (x, y, z, item) => current?.placed(x, y, z, item, who),
  };
}

/** 妖怪の わざで かわった マスを 記録する（街の はんいの 外・keeps は 何も しない） */
export function townNote(x: number, y: number, z: number): void {
  current?.note(x, y, z);
}

/**
 * 記録を 作って つなぐ（wireYokai の さいごに 1 回）。毎ステップの すすめは step.ts（時間が 進んだ あと）、保存は wireSave、
 * 列を 読みこんだ ときの もどしは StreamHost、水が ながれこんだ マスの 記録は ここで world.onBlockChange に 足す。
 */
export function wireTownRepair(deps: WiredFighters): void {
  const { shared, world, time, controller, inventory, drops, seed, restored } = deps;
  planReader = createPlanReader((cx, cz) => buildBlocks(seed, cx, cz, undefined, restored.oldCols).blocks.slice());
  const rows: RepairPlayer[] = [
    { who: 1, x: 0, y: 0, z: 0 },
    { who: 2, x: 0, y: 0, z: 0 },
  ];
  const list: RepairPlayer[] = [];
  const reps = new TownRepairs({
    world: {
      getBlock: (x, y, z) => world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => world.setBlock(x, y, z, id as BlockId),
      isLoaded: (x, z) => world.isLoaded(x, z),
      isSolid: (x, y, z) => world.isSolid(x, y, z),
    },
    plan: (x, y, z) => townPlanBlock(x, y, z),
    keeps: townGuards,
    inTown: (x, z) => currentTown()?.inTown(x, z) ?? false,
    day: () => time.day(),
    // 遊んで いる 人（1P は いつも・2P は 参加して いる あいだ）。使いまわしの 配列
    players: () => {
      list.length = 0;
      const p = controller.state.position;
      Object.assign(rows[0]!, { x: p.x, y: p.y, z: p.z });
      list.push(rows[0]!);
      const m = shared.duoMate();
      if (m !== null) {
        Object.assign(rows[1]!, { x: m.position.x, y: m.position.y, z: m.position.z });
        list.push(rows[1]!);
      }
      return list;
    },
    overlaps: (p, x, y, z) => overlapsBody(p, x, y, z),
    movePlayer: (who, x, y, z) => {
      if (who === 1) controller.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 } });
      else shared.duoMate()?.moveTo?.({ x, y, z });
    },
    occupied: (x, y, z) => shared.yokaiManager?.occupies(x, y, z) ?? false,
    evict: (x, y, z, spot) => {
      const box = { x0: x, x1: x + 1, z0: z, z1: z + 1, y0: y, y1: y + 1 };
      shared.yokaiManager?.evictFrom(box, [spot]);
      deps.animals.evictFrom(box, [spot]);
    },
    giveBack: (item, who) => {
      const mate = who === 2 ? shared.duoMate() : null;
      const inv = mate !== null ? mate.inventory : inventory; // 2P が やめて いたら 1P へ
      const at = mate !== null ? mate.position : controller.state.position;
      const left = inv.add(item as ItemId, 1);
      if (left > 0) drops.scatter({ x: at.x, y: at.y + 0.5, z: at.z }, [{ item: item as ItemId, count: left }]); // いっぱいなら 足もとに 落ちる
    },
    fallback: () => {
      const p = currentTown()?.info().plaza;
      return p === undefined ? { x: controller.state.position.x, y: controller.state.position.y, z: controller.state.position.z } : { x: p.x, y: p.y, z: p.z };
    },
  });
  bindTownRepairs(reps);
  shared.townRepairs = reps;
  // 水が かわった マス（量が へった・ふえた・ながれこんだ）も、記録が ある あいだは 設計と ちがえば 記録する。朝に 設計の 水に もどる
  const prev = world.onBlockChange;
  world.onBlockChange = (x, y, z, p, n) => {
    prev?.(x, y, z, p, n);
    if (isLiquidIndex(n) || isLiquidIndex(p)) reps.noteLiquid(x, y, z);
  };
}
