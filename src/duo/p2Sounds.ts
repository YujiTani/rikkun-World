// COOP-1 作業 3c（#417。docs/design/COOP-1.md §3.4・§9.7・AC67）: 2P が 鳴らす 音（足音・こうげき・刀と 弓の わざ）。
// 1P と 同じ 音の 表・同じ 大きさ（距離で 小さく しない）。数の 上限は 渡された SoundFx の もの 1 つ（2 人で 1 つ）。
// ほる・ひび・こわす・おく・ひろう は 2P の DigFx（p2DigFx.ts）が 鳴らす ので、ここには ない。
import type { ArmorSlot, BladeEvent, BowEvent, CombatEvent, ItemId, SwingAnim } from '../contracts';
import { GetaStepper, type GetaPlayer } from '../craft/geta';
import { playGeta } from '../fx/getaSounds';
import { playCombat } from '../fx/combatSounds';
import { createFootsteps, type FootKind } from '../fx/footsteps';
import type { SoundFx } from '../fx/sound';
import { playBladeSound, playBowSound } from '../fx/weaponSounds';
import { playSwing } from '../ui/craftUi';

export interface P2Sounds {
  /** 毎ステップ。2P の 足音（1 歩の 数え方は 2P だけの 分）。鳴らした ときは 種類、鳴らさない ときは null */
  step(body: GetaPlayer, groundId: () => string): FootKind | null;
  /** 2P の combat.drainEvents()。punchStart → punch・punchHit → hit・punchMiss → miss。ほかは 鳴らさない */
  combat(events: readonly CombatEvent[]): void;
  /** 2P の tools.drainSwings()。1P の `playSwing` と 同じ 音 */
  swings(swings: readonly { anim: SwingAnim }[], held: ItemId | null): void;
  /** 2P の blade.drainEvents()。1 つずつ `playBladeSound` */
  blade(events: readonly BladeEvent[]): void;
  /** 2P の tools.drainArrowEvents()。1 つずつ `playBowSound`（arrowHit は 1P の step.ts と 同じに もう 1 つ hit）。noArrow は 鳴らさない（画面の 合図だけ） */
  arrows(events: readonly BowEvent[]): void;
}

/**
 * armor = 2P の そうび（p2.armor。読むたびに いまの 着ている 物）。明珍下駄で 走る ステップは「カラン」だけ 鳴らし、ふつうの 足音は 鳴らさない（1P の step.ts と 同じ）。
 * なければ 下駄は ない。
 */
export function createP2Sounds(sound: Pick<SoundFx, 'play' | 'playTones'>, armor?: { equipped(slot: ArmorSlot): ItemId | null }): P2Sounds {
  const footsteps = createFootsteps(sound);
  const geta = armor ? new GetaStepper(armor, () => playGeta(sound)) : null;
  return {
    step: (body, groundId) => (geta?.step(body) ? null : footsteps.step(body, groundId)),
    combat(events) {
      for (const e of events) {
        if (e.type === 'punchStart') playCombat(sound, 'punch');
        else if (e.type === 'punchHit') playCombat(sound, 'hit');
        else if (e.type === 'punchMiss') playCombat(sound, 'miss');
      }
    },
    swings(swings, held) {
      for (const sw of swings) playSwing(sound, sw.anim, held);
    },
    blade(events) {
      for (const e of events) playBladeSound(sound, e);
    },
    arrows(events) {
      for (const e of events) {
        if (e.type === 'noArrow') continue;
        playBowSound(sound, e);
        if (e.type === 'arrowHit') playCombat(sound, 'hit');
      }
    },
  };
}
