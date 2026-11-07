import type { BlockId, LockStatus, PlayerState, Vec3, VoxelWorld } from '../contracts';
import type { PunchGate } from '../combat/PlayerCombat';
import type { DigConfig } from '../dig/config';
import { DigSystemImpl } from '../dig/DigSystem';
import type { DigM4Deps } from '../dig/digPorts';
import type { ActionState } from '../input/actions';
import type { Rng } from '../world/gen/random';
import type { P2State } from './p2State';

/** 2P 用の ほる・おく係に 渡す もの（COOP-1 3a。名前と 形の 約束は p2Dig.test.ts の 頭） */
export interface P2DigDeps {
  world: VoxelWorld;
  p2: P2State;
  /** 2P の 入力（ZR = primary・ZL = secondary） */
  actions: ActionState;
  position: () => PlayerState;
  lock: LockStatus;
  eyeHeight: () => number;
  /** 仲間（1P）の 足もと。なければ null */
  partner: () => Vec3 | null;
  /** 2P 用の PlayerCombatImpl（2P の 体力の 持ち主。型は PunchGate） */
  gate?: PunchGate | null;
  m4?: DigM4Deps;
  /** COOP-1 4c（AC95）: 2P が かまどを ねらって ZL。2P の 画面の「やく」の ページを 開く 合図（1 回）。渡さない 2P は 何も 開かない */
  onOpenFurnace?: (x: number, y: number, z: number) => void;
  /** COOP-1 4c（AC95）: 2P が たんすを ねらって ZL か Y。「たんす」の ページを 開く 合図（1 回）。渡さない 2P は 何も 開かない */
  onOpenTansu?: (x: number, y: number, z: number) => void;
  config?: DigConfig;
  rng?: Rng;
}

const FURNACE: BlockId = 'furnace';
const TANSU: BlockId = 'tansu';

/**
 * 2P の ほる・おく係（AC35・AC15・AC95）。1P と 同じ DigSystemImpl を もう 1 つ 作る。持ち物は `p2.inventory` だけ。
 * かまど・たんすを ねらった ZL は 何も 置かない。開く 口は 1P 用の m4（craft.openFurnace・storage.open）では なく
 * 2P の 画面の ページを 開く `onOpenFurnace`・`onOpenTansu`（渡さなければ 3a の とおり 何も 開かない）。
 * かまどを こわした ときの `m4.craft.furnaceBroken` は 呼ぶ 側が 2P の つくる を 渡す（中身は こわした 人へ）。
 */
export function createP2Dig(d: P2DigDeps): DigSystemImpl {
  const w = d.world;
  const given = d.m4 ?? {};
  const craft = given.craft;
  const m4: DigM4Deps = {
    ...given,
    partner: d.partner,
    craft: {
      isFurnace: (x, y, z) => craft?.isFurnace(x, y, z) ?? w.getBlock(x, y, z) === FURNACE,
      openFurnace: (x, y, z) => d.onOpenFurnace?.(x, y, z),
      furnaceBroken: (x, y, z) => craft?.furnaceBroken(x, y, z),
      fixedDrop: (id) => craft?.fixedDrop(id) ?? null,
    },
    storage: {
      isTansu: (x, y, z) => w.getBlock(x, y, z) === TANSU,
      open: (x, y, z) => {
        d.onOpenTansu?.(x, y, z);
        return d.onOpenTansu !== undefined;
      },
      placed: () => {},
      broken: (x, y, z) => given.storage?.broken(x, y, z) ?? 0,
    },
  };
  return new DigSystemImpl(w, d.position, d.actions, d.lock, d.p2.inventory, d.eyeHeight, d.config, d.rng, d.gate ?? null, m4);
}
