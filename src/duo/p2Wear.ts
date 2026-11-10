// COOP-1 4b（docs/design/COOP-1.md §3.5・AC92）: 2P の 道具・そうびが へった／こわれた ときの 音と お知らせ。
// 1P は WeaponFx が 毎ステップ 読んで 鳴らす。2P の 分を だれも 読まないと 出来事が たまり続けるので、ここで 毎ステップ 両方 空にする。
import type { Inventory, ItemId, Vec3, WearEvent } from '../contracts';
import type { ArmorSystem } from '../contracts';
import { playWearSound } from '../fx/weaponSounds';
import type { SoundFx } from '../fx/sound';
import type { WearNotice } from '../ui/wearNotice';

export interface P2WearDeps {
  /** 2P の もちもの（p2.inventory） */
  inventory: Pick<Inventory, 'drainWearEvents'>;
  /** 2P の そうび（p2.armor） */
  armor: Pick<ArmorSystem, 'drainWearEvents'>;
  /** 1P と 同じ 音の 窓口（数の 上限は 2 人で 1 つ） */
  sound: Pick<SoundFx, 'playTones'>;
  /** 2P の 半分に 出す お知らせ */
  notice: Pick<WearNotice, 'low' | 'broken'>;
  nameOf(item: ItemId): string;
  /** 2P の 手もと（足もと + 1。読むたびに いまの 位置） */
  handPos(): Vec3;
  /** こわれた ときの かけらの つぶ（1P の WeaponFx.breakShards を 2P の 手もとで） */
  burst?(at: Vec3, item: ItemId): void;
  /** COOP-1 5b: 1 つ以上 あった ステップに 1 回、もちもの → そうびの 出来事を まとめて わたす（実績 `toolBroken`・`armorBroken` へ。1P の WeaponFx の onWear と 同じ 形）。空なら 呼ばない */
  onEvents?: (events: WearEvent[]) => void;
}

/** 毎ステップ 1 回 `step()`。もちもの → そうびの 順に 取り出して、かならず 両方 空に する */
export function createP2Wear(d: P2WearDeps): { step(): void } {
  const one = (e: WearEvent): void => {
    playWearSound(d.sound, e);
    const name = d.nameOf(e.item);
    if (e.type === 'wearLow') {
      d.notice.low(e.item, name);
    } else {
      d.notice.broken(e.item, name);
      d.burst?.(d.handPos(), e.item);
    }
  };
  return {
    step() {
      const events = d.inventory.drainWearEvents();
      const armorEvents = d.armor.drainWearEvents();
      for (const e of events) one(e);
      for (const e of armorEvents) one(e);
      if (d.onEvents && (events.length > 0 || armorEvents.length > 0)) d.onEvents(events.length === 0 ? armorEvents : armorEvents.length === 0 ? events : events.concat(armorEvents));
    },
  };
}
