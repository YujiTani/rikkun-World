// COOP-1 5c: とりごやの メニューの 画面（1P も 2P も 同じ 部品）に わたす 「子の 絵」「ページの 音」「▼」の 口。
import type { AnimalManager } from '../../animals/AnimalManager';
import { playCraft } from '../../fx/craftSounds';
import type { SoundFx } from '../../fx/sound';
import type { ItemId, VoxelWorld } from '../../contracts';
import type { CoopMenuOptions } from '../../ui/coopMenu';
import type { CoopMenuDeps } from '../../ui/coopMenuModel';

/** 小屋の 中身を 見る・あつめる・いただきます（1P も 2P も 同じ 式。`who` は その 人の もちものへ 入れる）。`inReach`・`onOpen`・`onClose` は 呼ぶ 側が きめる */
export function coopMenuBase(animals: AnimalManager, who: 1 | 2, notify: (item: ItemId, count: number) => void): Omit<CoopMenuDeps, 'inReach' | 'onOpen' | 'onClose'> {
  const row = (c: number) => animals.coops().find((x) => x.id === c);
  return {
    meatList: (c) => animals.meatList(c),
    eggs: (c) => {
      const r = row(c);
      return r ? r.nest.egg + r.nest.gold : 0;
    },
    busy: (c) => row(c)?.meatBusy ?? null,
    exists: (c) => row(c) !== undefined,
    collect: (c) => {
      const r = animals.collectCoop(c, who);
      if (r.egg > 0) notify('egg', r.egg);
      if (r.gold > 0) notify('kin_tamago', r.gold);
    },
    startMeat: (c, id) => animals.meat(c, id, who).ok,
  };
}

/**
 * 頭の 上の ▼ は 世界に 1 つ。2 人とも えらんで いる ときは 1P の 子を 出し、1P が えらんで いなければ 2P の 子を 出す。
 * 人ごとの 口を 返す（毎ステップ 呼んで よい）
 */
export function pickMux(animalFx: { setPick(id: number | null): void }): (who: 1 | 2) => (id: number | null) => void {
  const picks: [number | null, number | null] = [null, null];
  return (who) => (id) => {
    picks[who - 1] = id;
    animalFx.setPick(picks[0] ?? picks[1]);
  };
}

export function coopMenuView(animals: Pick<AnimalManager, 'list'>, onPick: (id: number | null) => void, sound: Pick<SoundFx, 'playTones'>): CoopMenuOptions {
  return {
    kidInfo: (id) => ({ id, macho: animals.list().find((a) => a.id === id)?.breed === 'macho' }),
    tick: () => playCraft(sound, 'tab'),
    onPick,
  };
}

/**
 * たまごを もって ねらった こたつ（本体の マス）が、まだ 何も 入って いない こたつ なら その 大きさ（1 か 2）。こたつで なければ null。
 * 1P（creatures.ts）も 2P（duoAnimals.ts）も この 1 つで 天板の から の 3 わくを 決める
 */
export function emptyKitSize(world: Pick<VoxelWorld, 'getBlock'>, k: { x: number; y: number; z: number }): 1 | 2 | null {
  if (String(world.getBlock(k.x, k.y, k.z)) !== 'nukunuku') return null;
  return world.getBlock(k.x + 1, k.y, k.z) === 'nukunuku_e' ? 2 : 1;
}
