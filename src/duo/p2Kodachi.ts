// COOP-1 4b（docs/design/COOP-1.md §3.5・AC91）: 忍びの 手甲を 着た 2P の 小太刀の 追い打ち。
// 部品は 1P と 同じ `Kodachi`（式・おくれ・ダメージは 調整表 NINJA_TUNING）。1P の 追い打ちとは 別の 入れもの（待ちの 列も 上限も 別）。
import type { ArmorSlot, BladeEvent, CombatEvent, ItemId, Vec3, YokaiWorld } from '../contracts';
import { Kodachi, type KodachiHitEvent } from '../combat/Kodachi';
import type { SoundFx } from '../fx/sound';
import { playKodachi } from '../fx/weaponSounds';
import { bindWho } from './credit';

export interface P2KodachiDeps {
  /** 2P の そうび（p2.armor。1P の そうびは 見ない） */
  armor: { equipped(slot: ArmorSlot): ItemId | null };
  /** 妖怪の 本体。中で 2P の 当てたことに する */
  yokai: YokaiWorld;
  /** 2P の 足もと（追い打ちの 向きの めやす。コピーを 作らない） */
  playerPos: () => Vec3;
  sound: Pick<SoundFx, 'playTones'>;
  tick?: () => number;
  /** 絵（1P の kodachiFx を 使いまわす） */
  onFire?: (info: { yokaiId: number | null; part: string | null; damage: number }) => void;
}

export interface P2Kodachi {
  /** 毎ステップ。先に step()、あとで そのステップの 出来事を combat()・blade() に 入れる */
  step(): void;
  /** 2P の combat.drainEvents()。punchHit だけ 聞く */
  combat(events: readonly CombatEvent[]): void;
  /** 2P の blade.drainEvents()。techHit だけ 聞く */
  blade(events: readonly BladeEvent[]): void;
  /** COOP-1 4d-3: がしゃどくろの 箱（部位）に 刀・パンチが 当たった（1P の Kodachi.onBigHit と 同じ） */
  onBigHit(part: string): void;
  /** kodachiHit。毎ステップ 取り出す */
  drainEvents(): KodachiHitEvent[];
  pending(): number;
  /** セーブ読みこみ・世界の きりかえ・参加／やめる */
  clear(): void;
}

export function createP2Kodachi(d: P2KodachiDeps): P2Kodachi {
  const k = new Kodachi({
    armor: d.armor,
    yokai: bindWho(d.yokai, 2),
    playerPos: d.playerPos,
    tick: d.tick,
    onFire: (info) => {
      playKodachi(d.sound);
      d.onFire?.(info);
    },
  });
  return {
    step: () => k.step(),
    combat(events) {
      for (const e of events) k.onCombatEvent(e);
    },
    blade(events) {
      for (const e of events) k.onCombatEvent(e);
    },
    onBigHit: (part) => k.onBigHit(part),
    drainEvents: () => k.drainEvents(),
    pending: () => k.pending(),
    clear: () => k.clear(),
  };
}
