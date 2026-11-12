import type { ItemId, PlayerState, YokaiWorld } from '../contracts';
import type { HammerSlamFx } from '../fx/hammerSlamFx';
import { playHammer } from '../fx/hammerSounds';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { createHammerSystem, type HammerFocus, type HammerMotion, type HammerSystem } from '../tools/hammer/HammerSystem';
import type { VoxelWorld } from '../contracts';
import type { SoundFx } from '../fx/sound';

/**
 * 2P の 大地のハンマー（LEGEND-4 §3.3）。1P と 同じ `createHammerSystem` を 2P の 体・2P の もちもの・2P の ほる係で 動かす 2 つ目。
 * こわした 物は 2P の もちものへ（ほる係 `breakAt` が 2P の もの）、たおした 人は 2P（`yokai` は 2P の 人で 見る）。絵は 1P の 物と 別の 2 つ目。
 */
export interface P2HammerDeps {
  world: Pick<VoxelWorld, 'getBlock' | 'isSolid'>;
  /** 2P の 人で 妖怪を 見る（bindWho(…, 2)） */
  yokai: () => YokaiWorld;
  /** 2P の ねらって いる ブロック（ふつうに ほる ときと 同じ。妖怪を ねらって いる ときは null） */
  focus: () => HammerFocus | null;
  /** 2P の ほる係で 1 マス こわす */
  breakAt: (x: number, y: number, z: number) => boolean;
  inventory: { held(): { item: ItemId } | null; wearHeld?(n: number): void };
  body: () => PlayerState;
  /** 2P の 入力（ZR = primary） */
  actions: { isHeld(a: 'primary'): boolean; wasPressed(a: 'primary'): boolean };
  /** 遊べる（倒れて いない・もちもの画面を 開いて いない・ひるんで いない） */
  active: () => boolean;
  sound: Pick<SoundFx, 'playTones'>;
  /** 地面の われ・光（2P 用の 2 つ目。テストは 空の 物を 渡す） */
  fx: Pick<HammerSlamFx, 'step' | 'dispose'>;
  reduced: () => boolean;
}

export interface P2Hammer {
  system: HammerSystem;
  /** 体を 動かす 前に: 2P の 体の motion へ かける 値 */
  motion(): HammerMotion;
  /** 体を 動かした あとに 毎ステップ 1 回 */
  step(): void;
  noFall(): boolean;
  dispose(): void;
}

export function createP2Hammer(d: P2HammerDeps): P2Hammer {
  const system = createHammerSystem({
    world: d.world,
    yokai: d.yokai,
    focus: d.focus,
    breakAt: d.breakAt,
    wear: () => d.inventory.wearHeld?.(LEGEND4_TUNING.daichi.wearPerSwing),
    sound: (n) => playHammer(d.sound, n),
  });
  const fx = d.fx;
  return {
    system,
    motion: () => system.motion(),
    step(): void {
      const b = d.body();
      system.update({
        item: d.inventory.held()?.item ?? null,
        active: d.active(),
        pressed: d.actions.wasPressed('primary'),
        held: d.actions.isHeld('primary'),
        position: b.position,
        yawDeg: b.yawDeg,
        onGround: b.onGround,
        inWater: b.inWater,
      });
      fx.step(system.drainEvents(), d.reduced());
    },
    noFall: () => system.noFall(),
    dispose: () => fx.dispose(),
  };
}
