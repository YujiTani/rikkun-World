import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { createP2Gadgets } from '../duo/p2Gadgets';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { InventoryImpl } from '../inventory/Inventory';
import { ActionState } from '../input/actions';
import { PlayerController } from './PlayerController';
import { createPlayerSettings } from './config';
import { applyTenshiMotion, tenshiNoFall } from './tenshiMove';

/**
 * LEGEND-4 PR3 天使の弓 T1〜T6（docs/design/LEGEND-4.md §6.3・§6.6）: 空中ジャンプ（押しなおし 3 回）・ゆっくり 落ちる・着地ダメージなし。
 * 数は `LEGEND4_TUNING.tenshi`・`createPlayerSettings()` から 読む（決め打ち しない）。
 */
class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 128, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  private blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 128 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? (y <= 6 ? 'sand' : 'air');
  }
  setBlock(x: number, y: number, z: number, id: BlockId) {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
}

const SPAWN: SpawnPoint = { x: 32.5, y: 12, z: 32.5, yawDeg: 0, pitchDeg: 0 };
const T = LEGEND4_TUNING.tenshi;
const base = createPlayerSettings();

function rig(held: ItemId | null, legs: ItemId | null = null) {
  const world = new FakeWorld();
  const actions = new ActionState();
  const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const player = new PlayerController(world, actions, look, lock, () => SPAWN);
  for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) world.setBlock(x, 8, z, 'stone'); // 床 = 足の 高さ 9
  player.set({ position: { x: 32.5, y: 9, z: 32.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
  let holding = held;
  const gadgets = createP2Gadgets({ body: player, held: () => holding, legs: () => legs, tick: () => 0 });
  const air = { jumps: 0 };
  player.onAirJump = () => air.jumps++;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      gadgets.step();
      applyTenshiMotion(player.motion, holding); // 1P の step.ts・2P の duoPlay.ts と 同じ 口
      player.update(1 / 60);
      actions.endFrame();
    }
  };
  const tap = () => {
    actions.press('jump');
    step(1);
    actions.release('jump');
  };
  /** 上向きの 速さが 0.5 以下に なる まで 進める（頂点） */
  const toApex = () => {
    for (let i = 0; i < 120 && player.state.velocity.y > 0.5; i++) step(1);
    step(2);
  };
  step(2);
  return { world, actions, player, step, tap, toApex, air, hold: (h: ItemId | null) => (holding = h) };
}

describe('T1 空中ジャンプ 3 回', () => {
  it('ジャンプ ＋ 頂点ごとに 押しなおし: のこり 3 → 2 → 1 → 0、4 回目の 押しでは 上がらない、着地で 3', () => {
    const r = rig('tenshi_yumi');
    expect(r.player.airJumpsLeft).toBe(T.airJumps);
    r.tap(); // 地面
    expect(r.player.airJumpsLeft).toBe(T.airJumps);
    const lefts: number[] = [];
    for (let k = 0; k < T.airJumps; k++) {
      r.toApex();
      r.tap();
      lefts.push(r.player.airJumpsLeft);
      expect(r.player.state.velocity.y).toBeGreaterThan(5);
    }
    expect(lefts).toEqual([2, 1, 0]);
    expect(r.air.jumps).toBe(3);
    r.toApex();
    const vy = r.player.state.velocity.y;
    r.tap();
    expect(r.player.state.velocity.y).toBeLessThanOrEqual(vy); // 上向きの 速さは ふえない
    expect(r.air.jumps).toBe(3);
    for (let i = 0; i < 600 && !r.player.state.onGround; i++) r.step(1);
    r.step(1);
    expect(r.player.airJumpsLeft).toBe(T.airJumps);
  });
  it('頂点ごとに 押すと 地面から 4.5 マス 以上 のぼる', () => {
    const r = rig('tenshi_yumi');
    const y0 = r.player.state.position.y;
    let top = y0;
    r.tap();
    for (let k = 0; k < T.airJumps; k++) {
      r.toApex();
      r.tap();
      for (let i = 0; i < 6; i++) {
        r.step(1);
        top = Math.max(top, r.player.state.position.y);
      }
    }
    for (let i = 0; i < 40; i++) {
      r.step(1);
      top = Math.max(top, r.player.state.position.y);
    }
    expect(top - y0).toBeGreaterThanOrEqual(4.5);
  });
});

describe('T2 押しっぱなし', () => {
  it('地面で とんだ あと はなさずに 30 ステップ → のこり 3 の まま', () => {
    const r = rig('tenshi_yumi');
    r.actions.press('jump');
    r.step(30);
    expect(r.player.airJumpsLeft).toBe(T.airJumps);
    expect(r.air.jumps).toBe(0);
  });
});

describe('T3 がけ・ほかの 物', () => {
  it('がけから 落ちても 空中で 3 回', () => {
    const r = rig('tenshi_yumi');
    // 床が ない 場所へ 歩いて 落ちる
    for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) r.world.setBlock(x, 8, z, 'air');
    r.world.setBlock(32, 8, 32, 'stone');
    r.player.set({ position: { x: 32.5, y: 9, z: 32.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0 });
    r.step(2);
    r.actions.press('moveBack');
    r.step(30);
    r.actions.release('moveBack');
    expect(r.player.state.onGround).toBe(false);
    expect(r.player.airJumpsLeft).toBe(T.airJumps);
    for (let k = 0; k < T.airJumps; k++) {
      r.tap();
      r.step(2);
    }
    expect(r.air.jumps).toBe(3);
  });
  it('天使の弓 以外を 持つと 空中で 押しても とばない', () => {
    const r = rig('katana');
    r.tap();
    r.toApex();
    const vy = r.player.state.velocity.y;
    r.tap();
    expect(r.player.state.velocity.y).toBeLessThanOrEqual(vy);
    expect(r.air.jumps).toBe(0);
  });
  it('空中で 持ちかえたら とべない。もどすと のこりは そのまま', () => {
    const r = rig('tenshi_yumi');
    r.tap();
    r.toApex();
    r.tap(); // 1 回 使う → 2
    expect(r.player.airJumpsLeft).toBe(T.airJumps - 1);
    r.hold('katana');
    r.step(8);
    r.tap();
    expect(r.air.jumps).toBe(1);
    expect(r.player.airJumpsLeft).toBe(T.airJumps - 1);
    r.hold('tenshi_yumi');
    expect(r.player.airJumpsLeft).toBe(T.airJumps - 1);
  });
});

describe('T4 ゆっくり 落ちる', () => {
  it('20 マス 落ちても 速さは fallSpeedMax を こえない', () => {
    const r = rig('tenshi_yumi');
    r.player.set({ position: { x: 32.5, y: 29, z: 32.5 }, velocity: { x: 0, y: 0, z: 0 } });
    let worst = 0;
    for (let i = 0; i < 900 && !r.player.state.onGround; i++) {
      r.step(1);
      worst = Math.max(worst, -r.player.state.velocity.y);
    }
    expect(r.player.state.onGround).toBe(true);
    expect(worst).toBeLessThanOrEqual(T.fallSpeedMax + 1e-6);
    expect(worst).toBeGreaterThan(T.fallSpeedMax - 0.5);
  });
  it('ほかの 物では ふつうに 速く 落ちる', () => {
    const r = rig('katana');
    r.player.set({ position: { x: 32.5, y: 29, z: 32.5 }, velocity: { x: 0, y: 0, z: 0 } });
    let worst = 0;
    for (let i = 0; i < 900 && !r.player.state.onGround; i++) {
      r.step(1);
      worst = Math.max(worst, -r.player.state.velocity.y);
    }
    expect(worst).toBeGreaterThan(T.fallSpeedMax + 3);
  });
  it('ゆっくり 落ちるのは 下向きだけ（上がる 速さは かえない）', () => {
    const r = rig('tenshi_yumi');
    r.tap();
    expect(r.player.state.velocity.y).toBeGreaterThan(T.fallSpeedMax);
  });
});

/** 体と 体力を つないだ 落下ダメージの 確かめ（T4・T5） */
function combatRig(held: () => ItemId | null) {
  const r = rig(held());
  const combat = new PlayerCombatImpl({
    world: r.world,
    player: { get: () => r.player.state, set: (v: any) => r.player.set(v) },
    inventory: new InventoryImpl(),
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => SPAWN,
    settings: createW2Settings(),
    noFall: () => tenshiNoFall(held()),
  } as never);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      r.step(1);
      combat.update();
    }
  };
  combat.update();
  return { ...r, combat, step2: step };
}

describe('T4・T5 着地ダメージ', () => {
  it('持って 20 マス 上から 落ちても 体力は かわらない（lastFall 0）', () => {
    let h: ItemId | null = 'tenshi_yumi';
    const r = combatRig(() => h);
    r.player.set({ position: { x: 32.5, y: 29, z: 32.5 }, velocity: { x: 0, y: 0, z: 0 } });
    const hp0 = r.combat.hp();
    for (let i = 0; i < 900 && !(r.player.state.onGround && r.player.state.position.y < 10); i++) r.step2(1);
    r.step2(2);
    expect(r.combat.hp()).toBe(hp0);
    expect(r.combat.lastFall()).toBe(0);
    h = null;
  });
  it('20 マス 上で 持ちかえて 落ちる → ふつうの 落下ダメージ', () => {
    let h: ItemId | null = 'katana';
    const r = combatRig(() => h);
    r.player.set({ position: { x: 32.5, y: 29, z: 32.5 }, velocity: { x: 0, y: 0, z: 0 } });
    const hp0 = r.combat.hp();
    for (let i = 0; i < 300 && !(r.player.state.onGround && r.player.state.position.y < 10); i++) r.step2(1);
    r.step2(2);
    expect(r.combat.hp()).toBeLessThan(hp0);
    expect(r.combat.lastFall()).toBeGreaterThan(0);
  });
  it('10 マス 落ちた 所で 持ちかえる → 持ちかえた 後の 分だけ', () => {
    let h: ItemId | null = 'tenshi_yumi';
    const r = combatRig(() => h);
    r.player.set({ position: { x: 32.5, y: 29, z: 32.5 }, velocity: { x: 0, y: 0, z: 0 } });
    // 地面 9 の 上 20 → 19.5 まで（ゆっくり）落ちる
    for (let i = 0; i < 900 && r.player.state.position.y > 19.5; i++) r.step2(1);
    h = 'katana';
    for (let i = 0; i < 300 && !(r.player.state.onGround && r.player.state.position.y < 10); i++) r.step2(1);
    r.step2(2);
    // 持ちかえた 高さ（約 19.5）から 9 まで = 10.5 マス → safeFall 3 を ひいて 7
    expect(r.combat.lastFall()).toBe(7);
  });
});

describe('T6 空中ジャンプの 高さ', () => {
  it('1 回で 上がる 高さが jumpHeight（±0.05）。わらじ なら 1.5', () => {
    for (const [legs, expected] of [[null, base.jumpHeight], ['waraji', 1.5]] as const) {
      const r = rig('tenshi_yumi', legs);
      r.tap();
      r.toApex();
      const y0 = r.player.state.position.y;
      r.tap();
      let top = y0;
      for (let i = 0; i < 60; i++) {
        r.step(1);
        top = Math.max(top, r.player.state.position.y);
      }
      expect(top - y0).toBeCloseTo(expected, 1);
    }
  });
});

describe('持って いない とき', () => {
  it('applyTenshiMotion: 持って いる ときだけ 空中ジャンプ・ゆっくり 落ちる', () => {
    const m = { tenshi: false } as { tenshi: boolean };
    applyTenshiMotion(m, 'tenshi_yumi');
    expect(m.tenshi).toBe(true);
    applyTenshiMotion(m, 'yumi');
    expect(m.tenshi).toBe(false);
    applyTenshiMotion(m, null);
    expect(m.tenshi).toBe(false);
    expect(tenshiNoFall('tenshi_yumi')).toBe(true);
    expect(tenshiNoFall('kokuryu')).toBe(false);
  });
});
