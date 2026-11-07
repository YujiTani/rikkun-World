import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, LookSource, PlayerState, SpawnPoint, ToolInfo, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { COMBAT_DEFAULTS } from '../combat/config';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { PlayerController } from '../player/PlayerController';
import { createToolConfig } from '../tools/config';
import { BLOCK_INDEX, BLOCK_TYPES, isOpaqueIndex } from '../world/blocks/blockTypes';
import { blockFamily } from './toolFamily';
import { EMISSION, OPACITY } from '../world/light/opacity';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createRng } from '../world/gen/random';
import { DIG_DEFAULTS, createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import type { DigToolPort } from './digPorts';

/**
 * MINE-1D（docs/design/MINE-1.md §4.4「つらら」・§5・受け入れ基準 D7）: つらら〔`tsurara`〕。
 *
 *   値〔§4.4 の 表〕: 固さ 0.5・すでから〔段階 0〕・なかま いし・ノーマル〔common〕・光 0・光を 通す・**固く ない**〔体が 通る・上に のれない〕・
 *     番号は 1C までの いちばん 後ろ〔203 こ〕より 後ろ。1C までの 並びは かわらない〔凍らせた 並びの ハッシュ〕。
 *   体の 箱が 通る〔PlayerController が 止められない〕・ぶつかって 速さが へらない・上に のれない〔つららの 上に 立てない〕。
 *   こわすと せっかいせき いつも 1〔すでで ほる〕。上の ブロックを こわすと つららも こわれて せっかいせき 1〔下の ブロックを こわすと 上の くさが 消えるのと 同じ〕。
 *   十字の 板〔三角形 16 まで・まとめて 描く〕は src/world/render/voxel/tsurara.test.ts。
 *
 * ブロックの id は 仕様の 案〔`tsurara`〕。型には まだ ないので 文字で 読む〔赤の 間も 型が 通る ように〕。
 */

const B = (id: string): BlockId => id as BlockId;
const IDX = BLOCK_INDEX as unknown as Record<string, number | undefined>;
const dig = DIG_DEFAULTS as unknown as {
  hardness: Record<string, number | null | undefined>;
  harvestLevel: Record<string, number | undefined>;
  rarity: Record<string, string | undefined>;
};
/** 1C までの ブロックの 数〔番号 0〜202。仕様 §4.4。凍らせた 事実で 数を 決め打ちする 登録表の 件数では ない〕 */
const BLOCKS_THROUGH_1C = 203;
/** 1C までの ブロックの id を 番号の 順に つないだ 文字の ハッシュ〔FNV-1a 32 ビット。並びが かわると 保存が こわれる〕 */
const IDS_THROUGH_1C_FNV = 'a5a7fd37';

const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
};

describe('D7: つららの 値', () => {
  it('ブロックが ある・名前 つらら・固く ない・こわせる', () => {
    const t = BLOCK_TYPES.find((b) => b.id === B('tsurara'));
    expect(t, 'tsurara の ブロック').toBeDefined();
    expect(t!.name).toBe('つらら');
    expect(t!.solid, '固く ない').toBe(false);
    expect(t!.breakable).toBe(true);
  });

  it('固さ 0.5・掘れる 段階 0〔すでから〕・なかま いし・ノーマル〔common〕', () => {
    expect(dig.hardness['tsurara']).toBe(0.5);
    expect(dig.harvestLevel['tsurara']).toBe(0);
    expect(blockFamily(B('tsurara'))).toBe('stone');
    expect(dig.rarity['tsurara']).toBe('common');
  });

  it('光: 光らない〔0〕・光を 通す・描き方は 不透明でない〔まわりの 面を かくさない〕', () => {
    const i = IDX['tsurara'];
    expect(i, 'tsurara の 番号').toBeTypeOf('number');
    expect(EMISSION[i!], '光らない').toBe(0);
    expect(OPACITY[i!], '光を 通す').toBe(0);
    expect(isOpaqueIndex(i!), '不透明でない').toBe(false);
  });

  it('番号は 1C までの いちばん 後ろ より 後ろ・1 バイトに 入る・1C までの 並びは かわらない', () => {
    const i = IDX['tsurara'];
    expect(i, 'tsurara の 番号').toBeTypeOf('number');
    expect(i!).toBeGreaterThanOrEqual(BLOCKS_THROUGH_1C);
    expect(i!).toBeLessThan(256);
    expect(BLOCK_TYPES[i!]?.id).toBe('tsurara');
    expect(fnv(BLOCK_TYPES.slice(0, BLOCKS_THROUGH_1C).map((b) => b.id).join(',')), '1C までの 並び').toBe(IDS_THROUGH_1C_FNV);
  });
});

// ------------------------------------------------------------------ 体が 通る

const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };

/** 平らな 石の ゆか〔y 9 まで〕の 上を、北〔z−〕へ 歩く。z = 24 の 壁に 置いた ブロックの 中を 通れるか */
function walkNorth(fill: (w: ArrayVoxelWorld) => void, steps = 240): { z: number; y: number; dz: number; hurt: boolean } {
  const w = new ArrayVoxelWorld({ x: 48, y: 32, z: 48 });
  w.fill(0, 0, 0, 47, 9, 47, 'stone');
  fill(w);
  const spawn: SpawnPoint = { x: 24.5, y: 10, z: 40.5, yawDeg: 0, pitchDeg: 0 };
  const actions = new ActionState();
  const p = new PlayerController(w as unknown as VoxelWorld, actions, look, lock, () => spawn);
  p.set({ position: { x: 24.5, y: 10, z: 40.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
  actions.press('moveForward');
  // ハート〔PlayerCombat〕が へらない ことを 見る
  const combat = new PlayerCombatImpl({
    world: w as unknown as VoxelWorld,
    player: { get: () => p.state, set: () => undefined },
    inventory: new InventoryImpl(),
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => spawn,
  });
  for (let i = 0; i < steps; i++) {
    p.update(1 / 60);
    actions.endFrame();
    combat.update();
  }
  const hurt = combat.hp() < COMBAT_DEFAULTS.playerMaxHp; // ハートの 数ぜんたい〔マグマの ほか どんな へり方でも〕
  const s = p.state.position;
  return { z: s.z, y: s.y, dz: 40.5 - s.z, hurt };
}

describe('D7: 体の 箱が 通る・ぶつかって へらない', () => {
  it('つららの かべ〔ゆかから 4 マス〕の 中を 歩いて 通りぬける。何も ない ときと 同じ だけ 進む〔速さが へらない〕・高さも かわらない', () => {
    const free = walkNorth(() => undefined);
    const through = walkNorth((w) => {
      w.fill(20, 10, 30, 28, 13, 32, B('tsurara'));
      expect(w.getBlock(24, 11, 31), 'つららを 置けた〔知らない id では 何も おきない〕').toBe('tsurara');
    });
    expect(free.dz, '何も ない ときの 歩き').toBeGreaterThan(5);
    expect(through.z, 'つららの かべの むこうまで 進んだ').toBeLessThan(30);
    expect(through.dz, 'つららで 速さが へらない').toBeCloseTo(free.dz, 1);
    expect(through.y, '高さも かわらない〔つららの 上に のれない〕').toBeCloseTo(free.y, 3);
    expect(through.hurt, 'ぶつかって ハートが へらない〔さわると へる しくみが 立たない〕').toBe(false);
  });

  it('つららの 上に のれない〔1 マスの つららを ゆかの 上に 置いても 足の 高さは かわらず、通りぬける〕', () => {
    const free = walkNorth(() => undefined);
    const onFloor = walkNorth((w) => {
      w.fill(23, 10, 28, 25, 10, 36, B('tsurara'));
      expect(w.getBlock(24, 10, 30), 'つららを 置けた').toBe('tsurara');
    });
    expect(onFloor.y, '足の 高さ').toBeCloseTo(free.y, 3);
    expect(onFloor.dz, '進んだ きょり').toBeCloseTo(free.dz, 1);
    expect(onFloor.hurt, 'ハートが へらない').toBe(false);
  });
});

// ------------------------------------------------------------------ ほる

const TOOLS = createToolConfig();
const DIG = createDigConfig();
const EYE = 1.62;
const FLOOR = 10;

function rig(held: ItemId | null) {
  const world = new ArrayVoxelWorld({ x: 48, y: 24, z: 48 });
  world.fill(0, 0, 0, 47, FLOOR - 1, 47, 'stone');
  const player: PlayerState = {
    position: { x: 24.5, y: FLOOR, z: 24.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0,
    onGround: true, inWater: false, moving: false, facingDeg: 0, running: false,
  };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  if (held) inv.setSlot(0, { item: held, count: 1 });
  inv.select(0);
  const tools: DigToolPort = {
    current: (): ToolInfo => {
      const item = inv.held()?.item ?? null;
      return {
        item, kind: item && item.endsWith('_pickaxe') ? 'pickaxe' : 'hand',
        power: (item && TOOLS.toolPower[item]) || DIG.handPower,
        level: item && TOOLS.toolLevel[item] !== undefined ? TOOLS.toolLevel[item]! : DIG.handLevel,
        damage: 1, reach: 3.5, ticks: 30,
      };
    },
    step: () => undefined,
    pushSwing: () => undefined,
    swingWhiff: () => undefined,
  };
  const craft = { isFurnace: () => false, openFurnace: () => undefined, furnaceBroken: () => undefined, fixedDrop: () => null };
  const system = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => EYE, createDigConfig(), createRng(1), null, { tools, craft: craft as never });
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      system.update();
      actions.endFrame();
    }
  };
  tick(2);
  const lookAt = (px: number, py: number, pz: number): void => {
    const p = player.position;
    player.yawDeg = (Math.atan2(px - p.x, -(pz - p.z)) * 180) / Math.PI;
    player.pitchDeg = (Math.atan2(py - (p.y + EYE), Math.hypot(px - p.x, pz - p.z)) * 180) / Math.PI;
    tick(2);
  };
  return { world, inv, actions, dig: system, tick, look: lookAt };
}

function digOut(r: ReturnType<typeof rig>, steps = 900): void {
  r.actions.press('primary');
  for (let i = 0; i < steps && !r.dig.state().ready; i++) r.tick();
  r.actions.release('primary');
  r.tick();
  r.actions.press('primary');
  r.tick(2);
  r.actions.release('primary');
  r.tick(30);
}

const bag = (inv: InventoryImpl): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const s of inv.slots()) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
  return out;
};

describe('D7: こわすと せっかいせき いつも 1', () => {
  it('すでで ほる → つららが 消えて、持ち物に せっかいせき 1〔何回 くりかえしても 1〕', () => {
    for (let n = 0; n < 4; n++) {
      const r = rig(null);
      expect(r.world.setBlock(26, FLOOR + 2, 24, B('stone')), '天井の 石').toBe(true);
      expect(r.world.setBlock(26, FLOOR + 1, 24, B('tsurara')), 'つららを 置ける').toBe(true);
      r.tick(2);
      r.look(26.5, FLOOR + 1.5, 24.5);
      expect(r.dig.target(), 'ねらいが つららに 乗った').toMatchObject({ id: 'tsurara', block: { x: 26, y: FLOOR + 1, z: 24 } });
      digOut(r);
      expect(r.world.getBlock(26, FLOOR + 1, 24)).toBe('air');
      expect(bag(r.inv), `${n + 1} 回目`).toEqual({ sekkaiseki: 1 });
    }
  });
});

describe('D7: 上の ブロックを こわすと つららも こわれる', () => {
  it('天井の 石を ほる → 下の つららも 消えて、せっかいせき 1〔石の 分は 石〕', () => {
    const r = rig('iron_pickaxe' as ItemId);
    expect(r.world.setBlock(26, FLOOR + 3, 24, B('stone'))).toBe(true);
    expect(r.world.setBlock(26, FLOOR + 2, 24, B('stone'))).toBe(true);
    expect(r.world.setBlock(26, FLOOR + 1, 24, B('tsurara'))).toBe(true);
    r.tick(2);
    r.look(26.5, FLOOR + 2.5, 24.5);
    expect(r.dig.target(), 'ねらいが 天井の 石').toMatchObject({ id: 'stone', block: { x: 26, y: FLOOR + 2, z: 24 } });
    digOut(r);
    expect(r.world.getBlock(26, FLOOR + 2, 24), '石が 消えた').toBe('air');
    expect(r.world.getBlock(26, FLOOR + 1, 24), 'つららも 消えた').toBe('air');
    const got = bag(r.inv);
    delete got['iron_pickaxe'];
    expect(got['sekkaiseki'], 'せっかいせき 1').toBe(1);
    // 石の 分は 石〔落とし物は 1 から 設定の 上の 限り まで〕。せっかいせき 1 の ほかは 石 だけ
    const stoneMax = Math.max(1, DIG.dropMax[DIG.rarity['stone']!] ?? 1);
    const rest = { ...got };
    delete rest['sekkaiseki'];
    expect(Object.keys(rest).every((k) => k === 'stone'), `せっかいせき 1 ＋ 石 だけ: ${JSON.stringify(got)}`).toBe(true);
    expect(rest['stone'] ?? 0, '石の 数').toBeGreaterThanOrEqual(1);
    expect(rest['stone'] ?? 0, '石の 数は 設定の 上の 限り まで').toBeLessThanOrEqual(stoneMax);
  });

  it('つららの 上の ブロックでない 所を ほっても つららは のこる〔となりの 石〕', () => {
    const r = rig('iron_pickaxe' as ItemId);
    expect(r.world.setBlock(26, FLOOR + 2, 24, B('stone'))).toBe(true);
    expect(r.world.setBlock(25, FLOOR + 1, 24, B('stone'))).toBe(true);
    expect(r.world.setBlock(26, FLOOR + 1, 24, B('tsurara'))).toBe(true);
    r.tick(2);
    // 手前〔となり〕の 石を まっすぐ ねらう〔つららは その 向こう。つららは ねらえる ので 手前に 置かない〕
    r.look(25.5, FLOOR + 1.5, 24.5);
    expect(r.dig.target(), 'ねらいが となりの 石').toMatchObject({ id: 'stone', block: { x: 25, y: FLOOR + 1, z: 24 } });
    digOut(r);
    expect(r.world.getBlock(25, FLOOR + 1, 24), '石は 消えた').toBe('air');
    expect(r.world.getBlock(26, FLOOR + 1, 24), 'つららは のこる').toBe('tsurara');
  });
});
