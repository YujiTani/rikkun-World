import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, LookSource, PlayerState, SpawnPoint, ToolInfo, VoxelWorld } from '../contracts';
import { BLOCK_ONLY_IDS } from '../content/items/types';
import { itemDef } from '../content/items/registry';
import { COMBAT_DEFAULTS } from '../combat/config';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerController } from '../player/PlayerController';
import { createToolConfig } from '../tools/config';
import { BLOCK_INDEX, BLOCK_TYPES } from '../world/blocks/blockTypes';
import { EMISSION } from '../world/light/opacity';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createRng } from '../world/gen/random';
import { DIG_DEFAULTS, createDigConfig } from './config';
import { DigSystemImpl, digSteps } from './DigSystem';
import type { DigToolPort } from './digPorts';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.9・§4.7・受け入れ基準 E12・E8 の「ひびの いしは すでで 90 ステップ」）: 新しい ブロック。
 *
 *   値〔§4.9 の 表〕: ひびの いし〔固さ 1.5・固い・いし 1〕・くずれた いし〔1・固い・いし 1〕・ふるい レール 東西／南北〔0.5・固く ない・き 1〕・
 *     こわれた わく〔5・固い・き 1〕・たおれた はしご 東西／南北〔0.5・固く ない・き 1〕・たきびの あと〔0.5・固く ない・せきたん 1〕。
 *     ぜんぶ すでから〔段階 0〕・光 0・持てない〔`BLOCK_ONLY_IDS`〕。
 *   番号は 1D までの いちばん 後ろ〔204 こ〕より 後ろ・1D までの 並びは かわらない・1E で 足した id は 10 こ 以下〔8 の 見こみ〕・合計 256 以下。
 *   固くない 物は 体が 通る〔速さが へらない〕・固い 物は 通れない。固くない 物は 下の ブロックを こわすと いっしょに 消える〔草と 同じ。何も 出ない〕。
 * ブロックの id は 仕様の 案。型には まだ ないので 文字で 読む〔赤の 間も 型が 通る ように〕。
 */

const B = (id: string): BlockId => id as BlockId;
const IDX = BLOCK_INDEX as unknown as Record<string, number | undefined>;
const dig = DIG_DEFAULTS as unknown as { hardness: Record<string, number | null | undefined>; harvestLevel: Record<string, number | undefined> };
/** 1D までの ブロックの 数〔番号 0〜203〕 */
const BLOCKS_THROUGH_1D = 204;
/** 1D までの ブロックの id を 番号の 順に つないだ 文字の ハッシュ〔FNV-1a 32 ビット。並びが かわると 保存が こわれる〕 */
const IDS_THROUGH_1D_FNV = 'fe14d1d7';
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
};

interface Row {
  id: string;
  name: string;
  hardness: number;
  solid: boolean;
  /** ほると 出る 物〔ぜんぶ 1 こ〕 */
  drop: string;
}
/** 仕様 §4.9 の 表 */
const ROWS: readonly Row[] = [
  { id: 'hibi_ishi', name: 'ひびの いし', hardness: 1.5, solid: true, drop: 'stone' },
  { id: 'kuzure_ishi', name: 'くずれた いし', hardness: 1, solid: true, drop: 'stone' },
  { id: 'furui_rail_x', name: 'ふるい レール', hardness: 0.5, solid: false, drop: 'log' },
  { id: 'furui_rail_z', name: 'ふるい レール', hardness: 0.5, solid: false, drop: 'log' },
  { id: 'kowareta_waku', name: 'こわれた わく', hardness: 5, solid: true, drop: 'log' },
  { id: 'taoreta_hashigo_x', name: 'たおれた はしご', hardness: 0.5, solid: false, drop: 'log' },
  { id: 'taoreta_hashigo_z', name: 'たおれた はしご', hardness: 0.5, solid: false, drop: 'log' },
  { id: 'takibi_ato', name: 'たきびの あと', hardness: 0.5, solid: false, drop: 'coal_ore' },
];
const norm = (s: string): string => s.replace(/\s+/g, '');

describe('E12: 新しい ブロックの 値', () => {
  it('8 つとも ブロックの 表に あり、名前・固いか・こわせる が 表の とおり', () => {
    for (const r of ROWS) {
      const t = BLOCK_TYPES.find((b) => b.id === B(r.id));
      expect(t, `${r.id} の ブロック`).toBeDefined();
      expect(norm(t!.name), `${r.id} の 名前`).toContain(norm(r.name));
      expect(t!.solid, `${r.id} が 固いか`).toBe(r.solid);
      expect(t!.breakable, `${r.id} が こわせるか`).toBe(true);
    }
  });

  it('固さ・掘れる 段階 0〔すでから〕・光らない', () => {
    for (const r of ROWS) {
      expect(dig.hardness[r.id], `${r.id} の 固さ`).toBe(r.hardness);
      expect(dig.harvestLevel[r.id], `${r.id} の 掘れる 段階`).toBe(0);
      const i = IDX[r.id];
      expect(i, `${r.id} の 番号`).toBeTypeOf('number');
      expect(EMISSION[i!], `${r.id} の 光`).toBe(0);
    }
  });

  it('持てない〔`BLOCK_ONLY_IDS` に あり、アイテムに ならない〕', () => {
    const only = new Set<string>(BLOCK_ONLY_IDS);
    for (const r of ROWS) {
      expect(only.has(r.id), `${r.id} が 持てない ブロックの 表に ある`).toBe(true);
      expect(itemDef(r.id), `${r.id} は アイテムに ならない`).toBeUndefined();
    }
  });

  it('番号は 1D までの いちばん 後ろ より 後ろ・1 バイトに 入る・1D までの 並びは かわらない', () => {
    for (const r of ROWS) {
      const i = IDX[r.id];
      expect(i, `${r.id} の 番号`).toBeTypeOf('number');
      expect(i!, `${r.id}`).toBeGreaterThanOrEqual(BLOCKS_THROUGH_1D);
      expect(i!).toBeLessThan(256);
      expect(BLOCK_TYPES[i!]?.id).toBe(r.id);
    }
    expect(fnv(BLOCK_TYPES.slice(0, BLOCKS_THROUGH_1D).map((b) => b.id).join(',')), '1D までの 並び').toBe(IDS_THROUGH_1D_FNV);
  });

  it('1E で 足した id は 10 こ 以下・合計は 256 以下', () => {
    expect(BLOCK_TYPES.length - BLOCKS_THROUGH_1D, '1E で 足した id').toBeGreaterThanOrEqual(ROWS.length);
    expect(BLOCK_TYPES.length - BLOCKS_THROUGH_1D, '1E で 足した id（＋ VOX-I-4a の 5 こ）').toBeLessThanOrEqual(10 + 5); // VOX-I-4a で 212〜216 を 足した
    expect(BLOCK_TYPES.length).toBeLessThanOrEqual(256);
  });
});

// ------------------------------------------------------------------ 体が 通る

const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };

/** 平らな 石の ゆか〔y 9 まで〕の 上を 北〔z−〕へ 歩く。z = 24〜26 の かべに 置いた ブロックの 中を 通れるか */
function walkNorth(fill: (w: ArrayVoxelWorld) => void, steps = 240): { z: number; y: number; dz: number; hurt: boolean } {
  const w = new ArrayVoxelWorld({ x: 48, y: 32, z: 48 });
  w.fill(0, 0, 0, 47, 9, 47, 'stone');
  fill(w);
  const spawn: SpawnPoint = { x: 24.5, y: 10, z: 40.5, yawDeg: 0, pitchDeg: 0 };
  const actions = new ActionState();
  const p = new PlayerController(w as unknown as VoxelWorld, actions, look, lock, () => spawn);
  p.set({ position: { x: 24.5, y: 10, z: 40.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
  actions.press('moveForward');
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
  const s = p.state.position;
  return { z: s.z, y: s.y, dz: 40.5 - s.z, hurt: combat.hp() < COMBAT_DEFAULTS.playerMaxHp };
}

describe('E12: 体の 箱が 通る〔固くない 物〕・通れない〔固い 物〕', () => {
  const free = (): ReturnType<typeof walkNorth> => walkNorth(() => undefined);

  it('レール・はしご・たきびの あとは ゆかの 上に しきつめても 通りぬける〔速さ・高さが かわらない・ハートが へらない〕', () => {
    const f = free();
    for (const r of ROWS.filter((x) => !x.solid)) {
      const t = walkNorth((w) => {
        w.fill(22, 10, 26, 26, 11, 34, B(r.id));
        expect(w.getBlock(24, 10, 30), `${r.id} を 置けた〔知らない id では 何も おきない〕`).toBe(r.id);
      });
      expect(t.dz, `${r.id}: 速さが へらない`).toBeCloseTo(f.dz, 1);
      expect(t.y, `${r.id}: 高さが かわらない〔上に のれない〕`).toBeCloseTo(f.y, 3);
      expect(t.hurt, `${r.id}: ハートが へらない`).toBe(false);
    }
  });

  it('ひびの いし・くずれた いし・こわれた わくは かべに なって 通れない', () => {
    for (const r of ROWS.filter((x) => x.solid)) {
      const t = walkNorth((w) => {
        w.fill(20, 10, 30, 28, 13, 31, B(r.id));
        expect(w.getBlock(24, 11, 30), `${r.id} を 置けた`).toBe(r.id);
      });
      expect(t.z, `${r.id}: かべの 手前で 止まる`).toBeGreaterThan(31);
    }
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

function digOut(r: ReturnType<typeof rig>, steps = 900): number {
  r.actions.press('primary');
  let n = 0;
  for (; n < steps && !r.dig.state().ready; n++) r.tick();
  r.actions.release('primary');
  r.tick();
  r.actions.press('primary');
  r.tick(2);
  r.actions.release('primary');
  r.tick(30);
  return n;
}

const bag = (inv: InventoryImpl): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const s of inv.slots()) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
  return out;
};

describe('E12: ほると 出る 物〔すでで ほれる・いつも 1 こ〕', () => {
  it('どれも すでで ほって 消える・持ち物に 表の 物が 1 こ だけ〔何回 くりかえしても 1〕', () => {
    for (const r of ROWS) {
      for (let n = 0; n < 3; n++) {
        const rg = rig(null);
        // 固い 物は 天井の 石の 下に 置いても よい。ねらいやすい ように 目の 高さ
        expect(rg.world.setBlock(26, FLOOR + 1, 24, B(r.id)), `${r.id} を 置ける`).toBe(true);
        rg.tick(2);
        rg.look(26.5, FLOOR + 1.5, 24.5);
        expect(rg.dig.target(), `${r.id}: ねらいが 乗った`).toMatchObject({ id: r.id, block: { x: 26, y: FLOOR + 1, z: 24 } });
        digOut(rg);
        expect(rg.world.getBlock(26, FLOOR + 1, 24), `${r.id} が 消えた`).toBe('air');
        expect(bag(rg.inv), `${r.id}: ${n + 1} 回目`).toEqual({ [r.drop]: 1 });
      }
    }
  });
});

describe('E8: ひびの いしは すでで 90 ステップ〔1.5 秒〕で こわれ いし 1', () => {
  it('ほる ステップの 数が 固さ 1.5 から 90', () => {
    const s = digSteps(createDigConfig(), B('hibi_ishi'));
    expect(s, 'すでで ほれる').toEqual({ steps: 90 });
  });

  it('素手で ねらって おし つづけると 90 ステップ前後で ほれる状態に なり、こわれて いし 1 〔数は 実際の ほり方で〕', () => {
    const r = rig(null);
    expect(r.world.setBlock(26, FLOOR + 1, 24, B('hibi_ishi'))).toBe(true);
    r.tick(2);
    r.look(26.5, FLOOR + 1.5, 24.5);
    const n = digOut(r);
    expect(n, 'ほり おわるまでの ステップ').toBeGreaterThanOrEqual(85);
    expect(n, 'ほり おわるまでの ステップ').toBeLessThanOrEqual(95);
    expect(r.world.getBlock(26, FLOOR + 1, 24)).toBe('air');
    expect(bag(r.inv)).toEqual({ stone: 1 });
  });
});

describe('E12: 下の ブロックを こわすと 消える〔草と 同じ。何も 出ない〕', () => {
  it('レール・はしご・たきびの あとの 下の 石を ほる → 上の 物も 消える・持ち物は 石 だけ', () => {
    for (const r of ROWS.filter((x) => !x.solid)) {
      const rg = rig('iron_pickaxe' as ItemId);
      expect(rg.world.setBlock(26, FLOOR, 24, B('stone'))).toBe(true);
      expect(rg.world.setBlock(26, FLOOR + 1, 24, B(r.id))).toBe(true);
      rg.tick(2);
      rg.look(26.5, FLOOR + 0.5, 24.5);
      expect(rg.dig.target(), `${r.id}: ねらいが 下の 石`).toMatchObject({ id: 'stone', block: { x: 26, y: FLOOR, z: 24 } });
      digOut(rg);
      expect(rg.world.getBlock(26, FLOOR, 24), '石が 消えた').toBe('air');
      expect(rg.world.getBlock(26, FLOOR + 1, 24), `${r.id} も 消えた`).toBe('air');
      const got = bag(rg.inv);
      delete got['iron_pickaxe'];
      expect(Object.keys(got).every((k) => k === 'stone'), `${r.id}: 持ち物は 石 だけ ${JSON.stringify(got)}`).toBe(true);
    }
  });

  it('となりの 石を ほっても のこる', () => {
    const rg = rig('iron_pickaxe' as ItemId);
    expect(rg.world.setBlock(25, FLOOR, 24, B('stone'))).toBe(true);
    expect(rg.world.setBlock(26, FLOOR + 1, 24, B('furui_rail_x'))).toBe(true);
    expect(rg.world.setBlock(26, FLOOR, 24, B('stone'))).toBe(true);
    rg.tick(2);
    rg.look(25.5, FLOOR + 0.5, 24.5);
    expect(rg.dig.target(), 'ねらいが となりの 石').toMatchObject({ id: 'stone', block: { x: 25, y: FLOOR, z: 24 } });
    digOut(rg);
    expect(rg.world.getBlock(25, FLOOR, 24)).toBe('air');
    expect(rg.world.getBlock(26, FLOOR + 1, 24), 'レールは のこる').toBe('furui_rail_x');
  });
});
