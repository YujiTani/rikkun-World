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
  config?: DigConfig;
  rng?: Rng;
}

const FURNACE: BlockId = 'furnace';
const TANSU: BlockId = 'tansu';

/**
 * 2P の ほる・おく係（AC35・AC15）。1P と 同じ DigSystemImpl を もう 1 つ 作る。持ち物は `p2.inventory` だけ。
 * 2P は 画面を 開かない: かまど・たんすを ねらった ZL は 何も 置かず、開く 口（openFurnace・storage.open）も 呼ばない。
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
      openFurnace: () => {},
      furnaceBroken: (x, y, z) => craft?.furnaceBroken(x, y, z),
      fixedDrop: (id) => craft?.fixedDrop(id) ?? null,
    },
    storage: {
      isTansu: (x, y, z) => w.getBlock(x, y, z) === TANSU,
      open: () => false,
      placed: () => {},
      broken: (x, y, z) => given.storage?.broken(x, y, z) ?? 0,
    },
  };
  return new DigSystemImpl(w, d.position, d.actions, d.lock, d.p2.inventory, d.eyeHeight, d.config, d.rng, d.gate ?? null, m4);
}
