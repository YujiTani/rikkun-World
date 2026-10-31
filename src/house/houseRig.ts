// HOUSE-1C・1E 建築まわりの ユニットテスト用の 道具（HouseSystem を ちいさな 平らな 世界に のせる）。本番の コードからは 使わない（テスト専用）。
// 1E: くらは ない。材料は もちもの＋近くの たんす。たんすは `rig.st`（stockKit.ts）に 置く。deps の `craft`・`tansu` は stockDeps で まぜる。
import type { ItemId } from '../contracts';
import { NOD_STEPS } from './architect';
import { makeFakeWorld } from './fakeWorld';
import { createHouseHook } from './hook';
import { HouseSystem, type HouseSfx } from './system';
import { makeStock, stockDeps, type Stock } from './stockKit';

const SPAWN = { x: 64.5, z: 64.5, yawDeg: 0 };
export const PAD = { x: 70, z: 60 };
export const GY = 10;

export interface RigOpts {
  /** 足もと（はじめは 建築士さんの いる 広場の 中。y ＝ GY ＋ 1） */
  player?: { x: number; y: number; z: number };
  held?: () => ItemId | null;
  /** 設定 craftTansuRange（はじめ 40 マス） */
  range?: number;
  /** false なら craft・tansu を わたさない（もちものだけ。1E の 前と 同じ 形） */
  stock?: boolean;
  /** 地形だけで 見た 水でない 地面（はじめは ぜんぶ 地面） */
  isLand?: (x: number, z: number) => boolean;
}

export function houseRig(opts: RigOpts = {}) {
  const st: Stock = makeStock({ player: opts.player ?? { x: SPAWN.x, y: GY + 1, z: SPAWN.z }, ...(opts.range !== undefined ? { range: opts.range } : {}) });
  const world = makeFakeWorld({ height: () => GY });
  const { bag, player } = st;
  const sfx: HouseSfx[] = [];
  const calls: string[] = [];
  // 型の 上で まだ 無い deps（craft・tansu）を まぜる ため、いったん 変数に 入れてから わたす
  const deps = {
    seed: 77,
    world,
    spawn: () => SPAWN,
    player: () => player,
    bag,
    voice: () => calls.push('voice'),
    gave: (item: ItemId) => calls.push(`gave:${item}`),
    onOpen: () => calls.push('open'),
    onClose: () => calls.push('close'),
    isLand: opts.isLand ?? (() => true),
    play: (e: HouseSfx) => sfx.push(e),
    ...(opts.held ? { held: opts.held } : {}),
    ...(opts.stock === false ? {} : stockDeps(st)),
  };
  const sys = new HouseSystem(deps);
  sys.state.record.toolsGiven = true;
  sys.state.record.fudeGiven = true;
  sys.update();
  const hook = createHouseHook(sys);
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) sys.update();
  };
  /** 話しかけて メニューが 開くまで（道具を もらった あとの 2 回目の 形。うなずき 22 ステップ） */
  const talk = (): void => {
    sys.talkTo(sys.architects()[0]!.id);
    run(NOD_STEPS);
  };
  /** エディターで せっけいずを 1 まい 作る（かみ 2・ふで 1 を もちものに 足してから）。マスの 番号を 返す */
  const make = (ops: unknown[] = [{ op: 'place', kind: 'futon', x: 0, z: 0 }, { op: 'place', kind: 'chair', x: 4, z: 0 }]): number => {
    bag.add('paper', 2);
    bag.add('fude', 1);
    sys.press('editor');
    for (const op of ops) if (!hook.edit(op)) throw new Error(`edit が 通らない: ${JSON.stringify(op)}`);
    sys.press('next');
    sys.press('next');
    for (const ch of 'もも') hook.edit({ op: 'char', ch });
    sys.press('done');
    // ふとん だけの 形は 確かめの まどで 止まる（AC44b ⑦）→ ［このまま つくる］
    if (hook.editor()?.confirm === 'futonOnly') sys.press('yes');
    return hook.blueprints().at(-1)!.slot;
  };
  /** せっけいず slot の 材料（need の 数）を もちものに 足す（extra は その 分 ふやす）。たんすには 入れない */
  const stock = (slot: number, extra: Record<string, number> = {}): void => {
    for (const r of hook.need(slot)) {
      const n = r.need + (extra[r.item] ?? 0);
      if (n > 0) bag.add(r.item, n);
    }
  };
  /** 建てられる 場所（かためた つち 7×7）を 作る */
  const pad = (x = PAD.x, z = PAD.z, w = 7, d = 7): void => {
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) world.setBlock(x + dx, GY, z + dz, 'katame_tsuchi');
  };
  /** 一覧 → えらぶ → 上空の 視点 → 決定 → ［ここに たてる］ */
  const startBuild = (slot: number): void => {
    sys.press('build');
    sys.press('pick', slot);
    sys.skyDecide();
    sys.skyDecide();
  };
  return { world, bag, player, sys, hook, sfx, calls, st, talk, make, stock, pad, run, startBuild };
}
