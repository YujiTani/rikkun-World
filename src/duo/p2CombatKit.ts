/**
 * COOP-1 4b（docs/design/COOP-1.md 1.10 §3.5）のユニットテスト用の 共通の道具（テスト専用。ゲームの コードからは 読まない）。
 * 2P の 体力の 持ち主（2P 用 PlayerCombatImpl）と それを 包む P2Life を、**2P の そうび `p2.armor` を わたして** 作る。
 * wire/duoPlay.ts の build() は これと 同じ 作りに する（`armor: p2.armor`）。作りが かわったら ここ 1 か所を 直す。
 *
 * 実装への 約束（P2State に 足す。src/duo/p2State.ts）:
 *   new P2State(opts?: { onLevelUp?; armorConfig?: Pick<CraftConfig, 'armorValue'>; armorWear?: ArmorWearOptions })
 *   p2.armor: ArmorSystemImpl … p2.inventory に つながった 2P 用の そうびの しくみ（1P の combat.ts と 同じ 部品・同じ 数の 表）。
 *     armorConfig の 既定 = CRAFT_DEFAULTS、armorWear の 既定 = なし（たいきゅうの 設定は 初期値・時計 0）。
 *     つなぎ込みは armorWear に `{ settings: () => w2, tick: () => game.tick }` を わたす（1P と 同じ）。
 */
import type { BlockId, Vec3 } from '../contracts';
import { createCombatConfig } from '../combat/config';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { DropField } from '../drops/DropField';
import { createRng, type Rng } from '../world/gen/random';
import { P2Life } from './p2Life';
import { P2State } from './p2State';
import { DUO_TUNING } from './tuning';

/** 床（y < 8 が 石）だけの 世界 */
class FlatWorld {
  readonly size = { x: 64, y: 96, z: 64 };
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 64, z1: 64 };
  }
  getBlock(_x: number, y: number): BlockId | 'outside' {
    return y < 8 ? 'stone' : 'air';
  }
  setBlock(): boolean {
    return true;
  }
  isSolid(_x: number, y: number): boolean {
    return y < 8;
  }
}

export const P1_SPOT: Vec3 = { x: 30.5, y: 8, z: 30.5 };

export interface P2CombatKitOptions {
  /** 袋に 入れるか きめる 乱数（0 = かならず おとす・1 = なにも おとさない）。既定 1（おとさない） */
  rng?: Rng;
  /** 2P の はじめの 高さ（落ちる ダメージの 準備に 使う）。既定 8（床の 上） */
  y?: number;
}

export function makeP2Combat(o: P2CombatKitOptions = {}) {
  const world = new FlatWorld();
  const p2 = new P2State();
  p2.inventory.setSlot(0, { item: 'dirt', count: 3 });
  p2.inventory.select(0);
  const player = { position: { x: 10.5, y: o.y ?? 8, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const drops = new DropField({ world: world as never, inventory: p2.inventory, player: () => player.position });
  const cfg = createCombatConfig();
  const combat = new PlayerCombatImpl({
    world: world as never,
    player: {
      get: () => player,
      set: (v) => {
        Object.assign(player.position, v.position ?? {});
        Object.assign(player.velocity, v.velocity ?? {});
      },
    },
    inventory: p2.inventory,
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: P1_SPOT.x + 2, y: P1_SPOT.y, z: P1_SPOT.z, yawDeg: 0, pitchDeg: 0 }),
    config: { ...cfg, respawnDelayTicks: DUO_TUNING.p2ReturnSteps },
    rng: o.rng ?? createRng(1),
    drops,
    armor: p2.armor,
  });
  const life = new P2Life({ combat, p1Down: () => false });
  const run = (n: number) => {
    for (let i = 0; i < n; i++) life.step();
  };
  /** 北（−z）の 3 マス先から 妖怪の こうげき（のけぞりつき） */
  const from = (): Vec3 => ({ x: player.position.x, y: player.position.y, z: player.position.z - 3 });
  return { p2, armor: p2.armor, combat, life, drops, player, run, from, world, cfg };
}

export type P2CombatKit = ReturnType<typeof makeP2Combat>;
