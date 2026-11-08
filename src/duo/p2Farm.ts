import type { DigVitalsPort, FarmAim, FarmEvent, LiveSettings, M7Settings, PetPort, Vec3, VoxelWorld } from '../contracts';
import type { DigM4Deps } from '../dig/digPorts';
import type { FarmSystemImpl } from '../farm/FarmSystem';
import { createBucket } from '../farm/bucket';
import { createWatering } from '../farm/watering';
import type { InventoryImpl } from '../inventory/Inventory';

/**
 * COOP-1 5a（docs/design/COOP-1.md 1.14 §3.7）: 2P が 畑で 使う 物を まとめる 包み。畑・ごきげんは 世界に 1 つ（1P と 同じ 物）。
 * じょうろの 水・バケツ・やさいは 2P の もちもの、ハートは 2P の combat。畑を 動かす 呼び出しは ぜんぶ `farm.actAs(2, …)` で 包む
 * （出来事に `by: 2`・合図は 畑の `lastHint` を 書かない・まいた マスは 2P の 分を 別に）。1 人の ときは この 包みを 作らない。
 */
export interface P2FarmDeps {
  /** 世界に 1 つの 畑（1P と 同じ 物） */
  farm: FarmSystemImpl;
  /** 世界に 1 つの ごきげん（作物の 物） */
  pet: PetPort;
  /** バケツが 水を よみかきする */
  world: VoxelWorld;
  /** 2P の もちもの（`p2.inventory`） */
  inventory: InventoryImpl;
  /** 2P の ハート（2P の combat） */
  vitals: DigVitalsPort;
  settings: M7Settings;
  tick: () => number;
  /** 1P が `live.animalEggHeal` を 読む のと 同じ 設定 */
  live: () => Pick<LiveSettings, 'animalEggHeal' | 'meatHeal'>;
  /** 2P の ねらっている マス（`dig.target()?.block`） */
  aimed: () => Vec3 | null;
}

export interface P2Farm {
  /** 2P の ほる係の m4 に そのまま 広げる（`m4: { ...p2Farm.m4, … }`） */
  m4: Pick<DigM4Deps, 'farm' | 'water' | 'bucket' | 'pet' | 'vitals' | 'emitFarm' | 'eggHeal' | 'meatHeal'>;
  /** 2P が さいごに まいた マス（しぶき用。畑の `lastPourCells()` は 1P の 物の まま） */
  lastPourCells(): readonly Vec3[];
  /** 2P の ねらいの `farm.aim`（ねらい なし・畑でない → null） */
  aim(): FarmAim | null;
}

export function createP2Farm(d: P2FarmDeps): P2Farm {
  const farm = d.farm;
  /** 2P の 呼び出しを 包む。つぎの 3 つ（畑を 動かす 口）だけ 使う ので 毎フレームは 呼ばれない */
  const emit = (e: FarmEvent): void => farm.actAs(2, () => farm.emit(e));
  return {
    m4: {
      // 見るだけの 口（crop・soil・settings・eatHeal）は 包まない（毎フレーム 呼ばれる）。畑を 動かす 口だけ 包む
      farm: {
        crop: (x, y, z) => farm.crop(x, y, z),
        soil: (x, y, z) => farm.soil(x, y, z),
        settings: () => farm.settings(),
        eatHeal: (item) => farm.eatHeal(item),
        till: (x, y, z) => farm.actAs(2, () => farm.till(x, y, z)),
        noteTillPress: (x, y, z, count) => farm.actAs(2, () => farm.noteTillPress(x, y, z, count)),
        plant: (x, y, z, kind) => farm.actAs(2, () => farm.plant(x, y, z, kind)),
        harvest: (x, y, z) => farm.actAs(2, () => farm.harvest(x, y, z)),
        ripen: (x, y, z) => farm.actAs(2, () => farm.ripen(x, y, z)),
        onBlockBroken: (x, y, z, id) => farm.actAs(2, () => farm.onBlockBroken(x, y, z, id)),
        grassSeed: (x, z) => farm.actAs(2, () => farm.grassSeed(x, z)),
        noteEat: (item, heal, at) => farm.actAs(2, () => farm.noteEat(item, heal, at)),
        noteHint: (hint, at) => farm.actAs(2, () => farm.noteHint(hint, at)),
      },
      pet: d.pet,
      water: createWatering({
        farm: { pourAt: (target, item, dx, dz) => farm.actAs(2, () => farm.pourAt(target, item, dx, dz)), emit },
        inventory: d.inventory,
        settings: d.settings,
        tick: d.tick,
      }),
      bucket: createBucket({ inventory: d.inventory, emit, tick: d.tick, world: d.world }),
      vitals: d.vitals,
      emitFarm: emit,
      eggHeal: () => d.live().animalEggHeal,
      meatHeal: () => d.live().meatHeal,
    },
    lastPourCells: () => farm.lastPourCells(2),
    aim() {
      const a = d.aimed();
      return a ? farm.aim(a.x, a.y, a.z) : null;
    },
  };
}
