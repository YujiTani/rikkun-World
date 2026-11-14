// 街（TOWN-1 1.4・1B-2）: 街の だいくさん（こやの 建築士さん）・足場・もどる ぽんの つなぎ。
// 部品は src/town/townCarpenter.ts（動き）・src/fx/townCarpenterFx.ts・townScaffoldFx.ts・townRepairFxView.ts（絵）。ここは 世界・時間・描画に つなぐ だけ。
import { groundNear, walkY } from '../../town/townCarpenterWalk';
import { TownCarpenter } from '../../town/townCarpenter';
import { RepairFx } from '../../town/townRepairFxModel';
import type { TownRepairs } from '../../town/townRepairs';
import { currentTown } from '../../town/townState';
import { TownCarpenterFx } from '../../fx/townCarpenterFx';
import { TownRepairFxView } from '../../fx/townRepairFxView';
import { TownScaffoldFx } from '../../fx/townScaffoldFx';
import { isLiquidIndex } from '../../world/blocks/liquids';
import { blockIndexOf } from '../../world/blocks/blockTypes';
import type { BlockId } from '../../contracts';
import type { WiredFighters } from './combat';

export interface TownCarpenterWire {
  carpenter: TownCarpenter;
  scaffoldFx: TownScaffoldFx;
  carpenterFx: TownCarpenterFx;
  repairFx: RepairFx;
  repairView: TownRepairFxView;
}

/** いま 開いて いる 街の だいくさん（作る 前は null）。`town.carpenter()` が 読む */
let current: TownCarpenterWire | null = null;
export const townCarpenterNow = (): TownCarpenterWire | null => current;

/** 建築士さんの 口（townRepairs の gate）。つなぐ 前は 何も 許さない（作る 前は 呼ばれない） */
export function carpenterGate(get: () => TownCarpenter | null) {
  return {
    allows: (j: Parameters<TownCarpenter['allows']>[0]): boolean => get()?.allows(j) ?? false,
    rush: (j: Parameters<TownCarpenter['rush']>[0]): boolean => get()?.rush(j) ?? false,
  };
}

/** 世界を 作った あとで 1 回（wireTownRepair の さいご）。街が なければ null（なにも 出さない） */
export function wireTownCarpenter(deps: WiredFighters, reps: TownRepairs): TownCarpenter | null {
  const { game, world, seed, lighting, renderer, shared } = deps;
  const town = currentTown();
  if (town === null) return null;
  const home = town.carpenterHome();
  const carpenter = new TownCarpenter({
    jobs: () => reps.jobs(),
    waiting: (j) => reps.waiting(j),
    standY: (x, z, fy) => walkY(world, x, z, fy),
    frames: () => reps.scaffolds.list(),
    menuOpen: () => false, // 試作: こやの 建築士さんの メニューは まだ つないで いない
    isLoaded: (x, z) => world.isLoaded(x, z),
    home,
    seed,
    onWarp: (x, y, z) => repairFx.spawn(Math.floor(x), Math.floor(y) - 1, Math.floor(z), 'air'),
  });
  const repairFx = new RepairFx();
  reps.onRestore = (x, y, z, id) => {
    const solid = !isLiquidIndex(blockIndexOf(id as BlockId)) && id !== 'air';
    if (solid) repairFx.spawn(x, y, z, id);
  };
  const scaffoldFx = new TownScaffoldFx(game.scene, {
    groundAt: (x, z, aroundY) => groundNear(world, x, z, aroundY),
    home: () => home,
  });
  const carpenterFx = new TownCarpenterFx(game.scene, home);
  const repairView = new TownRepairFxView(renderer.blockAtlas());
  game.scene.add(repairView.group);
  lighting.register(scaffoldFx.bodyMaterial, 'doll');
  lighting.register(carpenterFx.bodyMaterial, 'doll');
  lighting.register(carpenterFx.signMat, 'doll');
  lighting.register(repairView.popMaterial, 'doll');
  lighting.register(repairView.bitMaterial, 'doll');
  shared.townCarpenterStep = () => {
    carpenter.step();
    if (repairFx.active()) repairFx.step();
  };
  game.onBeforeRender(() => {
    scaffoldFx.sync(reps.scaffolds);
    carpenterFx.update(carpenter, game.camera);
    repairView.update(repairFx);
  });
  current = { carpenter, scaffoldFx, carpenterFx, repairFx, repairView };
  return carpenter;
}
