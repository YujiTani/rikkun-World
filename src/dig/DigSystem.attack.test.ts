import { describe, expect, it } from 'vitest';
import type { ItemId, LockStatus, ToolInfo, ToolKind } from '../contracts';
import { createW2Settings } from '../contracts';
import { FakeYokaiWorld, P, angDiff, at, bearing, centerOf, settingsW3 } from '../combat/attackTestKit';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { ActionState, type Action } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerController } from '../player/PlayerController';
import { createBladeSystem } from '../tools/blade/BladeSystem';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/**
 * WEAPON-3 §6 AC11（ほった量）・AC15〜AC19（キャラの向き・ほるとの 分け方・弓・ふちどり）。
 * 本物の DigSystem・PlayerCombat・BladeSystem・PlayerController を つなぐ。つなぎ込み（main.ts）の 順番は rig.step に 写した。
 *
 * 担当 B に 求める 口（名前は 提案。直すときは この rig だけ 直す）:
 *   DigSystemImpl.attackPreview()   = `attack.preview()`（§4.8）
 *   DigSystemImpl.attackLast()      = `attack.last()`（§4.8）
 *   DigSystemImpl.attackFaceDeg()   = 刀の わざ／パンチの 間は u、そうでなければ null（キャラの向きを u に 固定する）
 *   PlayerController.motion.leftAims = false の ステップは 左クリックを「ねらう行動」にしない（§4.6）
 *   DigM4Deps.yokai                 = 妖怪の 世界（一覧を 向きの決まりに わたす）
 */

type Kind = 'hand' | 'blade' | 'bow';

function rig(kind: Kind, o: { floor?: 'dirt' | 'stone' } = {}) {
  const world = new ArrayVoxelWorld({ x: 32, y: 24, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, 8, z, o.floor ?? 'dirt');
  const actions = new ActionState();
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const controller = new PlayerController(world, actions, { consume: () => ({ dx: 0, dy: 0 }) }, lock, () => ({ x: P.x, y: P.y, z: P.z, yawDeg: 0, pitchDeg: -25 }));
  const yokai = new FakeYokaiWorld();
  const item: ItemId | null = kind === 'blade' ? 'katana' : kind === 'bow' ? 'yumi' : null;
  const inv = new InventoryImpl();
  if (item) inv.setSlot(0, { item, count: 1 });
  inv.select(0);
  const toolKind: ToolKind = kind === 'blade' ? 'blade' : kind === 'bow' ? 'bow' : 'hand';
  const info: ToolInfo = { item, kind: toolKind, power: 1, level: 0, damage: 1, reach: 3.5, ticks: 30 };
  const tools = { current: () => info, step() {}, pushSwing() {}, swingWhiff() {}, onPunchStart() {}, punchParams: () => ({ damage: 1, reach: 3.5, ticks: 30 }) };
  const settings = settingsW3();
  let tick = 0;
  const blade = createBladeSystem({
    world, yokai: () => yokai, settings, weaponDamage: () => 4, onHit: () => {},
    lunge: (dx, dz) => controller.lunge(dx, dz), tick: () => tick,
  });
  const combat = new PlayerCombatImpl({
    world, player: { get: () => controller.state, set: (v) => controller.set(v) }, inventory: inv, yokai: () => yokai,
    spawn: () => ({ x: 1.5, y: 9, z: 1.5, yawDeg: 0, pitchDeg: 0 }), tool: tools, settings,
  });
  const dig = new DigSystemImpl(world, () => controller.state, actions, lock, inv, () => 1.62, createDigConfig(), undefined, combat, {
    tools, blade, w2: settings, yokai: () => yokai,
  } as never) as DigSystemImpl & {
    attackPreview(): { use: string; rule: number | null; dirDeg: number | null; targetId: number | null };
    attackLast(): { tick: number; kind: string; rule: number; baseDeg: number; keyDeg: number | null; dirDeg: number; targetId: number | null; tiltDeg: number } | null;
    attackFaceDeg(): number | null;
  };
  controller.set({ pitchDeg: -25, yawDeg: 0 });
  /** main.ts の 順番: わざの motion → プレイヤー → 掘る・攻撃 → 始めたステップの おわりに facing = u */
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      tick++;
      const bm = blade.motion();
      controller.motion.speedMul = bm.speedMul;
      controller.motion.jumpLocked = bm.jumpLocked;
      controller.motion.faceDeg = dig.attackFaceDeg();
      const use = dig.attackPreview().use;
      (controller.motion as { leftAims?: boolean }).leftAims = !(use === 'attack' || use === 'whiff');
      controller.update(1 / 60);
      dig.update();
      const f = dig.attackFaceDeg();
      if (f !== null) controller.set({ facingDeg: f });
      combat.update();
      actions.endFrame();
    }
  };
  step(2);
  return {
    world, controller, yokai, dig, blade, combat, actions, step, settings,
    press: (a: Action) => actions.press(a),
    release: (a: Action) => actions.release(a),
    facing: () => controller.state.facingDeg,
    face: (deg: number) => controller.set({ facingDeg: deg }),
  };
}

describe('AC11 ほった量は 0 のまま（すで）', () => {
  it('東 2.0 に 妖怪・＋マークの先は 土 → パンチ。土の ほった量は 0', () => {
    const r = rig('hand');
    r.face(90);
    const y = r.yokai.add('karakasa', at(90, 2.0));
    r.press('primary');
    let maxProgress = 0;
    for (let i = 0; i < 35; i++) {
      r.step();
      maxProgress = Math.max(maxProgress, r.dig.state().progress);
    }
    r.release('primary');
    expect(maxProgress).toBe(0);
    expect(r.yokai.damaged.map((c) => c.id)).toEqual([y.id]);
  });
});

describe('AC15 攻撃では ＋マークへ 回らない', () => {
  for (const kind of ['blade', 'hand'] as const) {
    it(`${kind}: yaw 0・facing 90、東 2.0 に 妖怪、60 ステップ おしつづける → 毎ステップ facing = その時の u、0 へ 回らない。はなして 30 ステップ たっても 回らない`, () => {
      const r = rig(kind);
      r.face(90);
      const y = r.yokai.add('nurikabe', at(90, 2.5));
      r.press('primary');
      let sawLast = false;
      for (let i = 0; i < 60; i++) {
        r.step();
        const last = r.dig.attackLast();
        expect(last, `step ${i}`).not.toBeNull();
        sawLast = true;
        const u = r.blade.state().move?.dirDeg ?? last!.dirDeg;
        expect(angDiff(r.facing(), u), `step ${i} facing ${r.facing()} u ${u}`).toBeLessThan(0.5);
        expect(angDiff(r.facing(), 0), `step ${i}`).toBeGreaterThan(45);
        expect(angDiff(u, bearing(centerOf(y)))).toBeLessThan(0.5);
      }
      expect(sawLast).toBe(true);
      r.release('primary');
      r.step(40);
      expect(angDiff(r.facing(), bearing(centerOf(y)))).toBeLessThan(0.5);
    });
  }
  it('パンチ: punchTicks の 間 facing = u、はじまった ステップの おわりに もう u', () => {
    const r = rig('hand');
    r.face(180);
    const y = r.yokai.add('karakasa', at(165, 2.0)); // facing 180 から 15°
    r.press('primary');
    r.step(1);
    expect(angDiff(r.facing(), bearing(centerOf(y)))).toBeLessThan(0.5);
    r.release('primary');
    for (let i = 0; i < 28; i++) {
      r.step();
      expect(angDiff(r.facing(), bearing(centerOf(y)))).toBeLessThan(0.5);
    }
  });
  it('空ぶり（すで・何もない所）は ねらう行動に ならない: 向きは 回らない（§4.6）', () => {
    const r = rig('hand');
    r.world.setBlock(0, 0, 0, 'dirt');
    r.controller.set({ pitchDeg: 80 }); // 空
    r.face(90);
    r.press('primary');
    r.step(40);
    r.release('primary');
    r.step(40);
    expect(angDiff(r.facing(), 90)).toBeLessThan(0.5);
  });
});

describe('AC16 ほるときは 今のまま', () => {
  for (const kind of ['hand', 'blade'] as const) {
    it(`${kind}: 妖怪なし・＋マークの先に 土 → 8 ステップ以内に facing = yaw、はなして 30 ステップ 保つ（CHAR-1 AC11）`, () => {
      const r = rig(kind);
      r.face(90);
      r.press('primary');
      r.step(8);
      expect(angDiff(r.facing(), 0)).toBeLessThan(0.5);
      expect(r.dig.attackPreview().use).toBe('dig');
      r.release('primary');
      r.step(30);
      expect(angDiff(r.facing(), 0)).toBeLessThan(0.5);
    });
  }
});

describe('AC17 ほっている とちゅうに 切りかわる', () => {
  for (const kind of ['hand', 'blade'] as const) {
    it(`${kind}: 土を ほって 15 ステップ目に facing の 20° の 向き・2.0 に 妖怪 → 次の ステップに 攻撃（rule 1）、おわりに facing = u。ほった量は へる`, () => {
      const r = rig(kind);
      r.face(90);
      r.press('primary');
      r.step(15);
      const mem = r.dig.state().progress;
      expect(mem).toBeGreaterThan(0);
      expect(angDiff(r.facing(), 0)).toBeLessThan(0.5); // ほる間は ＋マーク（yaw 0）の方
      const y = r.yokai.add('karakasa', at(r.facing() + 20, 2.0));
      expect(r.dig.attackPreview().rule).toBe(1);
      r.step(1);
      const last = r.dig.attackLast()!;
      expect(last.rule).toBe(1);
      expect(last.targetId).toBe(y.id);
      expect(angDiff(r.facing(), last.dirDeg)).toBeLessThan(0.5);
      expect(angDiff(r.facing(), bearing(centerOf(y)))).toBeLessThan(0.5);
      r.step(10);
      expect(r.dig.state().progress).toBeLessThan(mem);
    });
  }
});

describe('AC18 弓は 今のまま', () => {
  it('弓を 引くと facing は yaw へ 回る。東 2.0 の 妖怪が いても attack.preview().use = none', () => {
    const r = rig('bow');
    r.face(90);
    r.yokai.add('karakasa', at(90, 2.0));
    expect(r.dig.attackPreview()).toMatchObject({ use: 'none', rule: null, dirDeg: null, targetId: null });
    r.press('primary');
    r.step(8);
    expect(angDiff(r.facing(), 0)).toBeLessThan(0.5);
    expect(r.dig.attackLast()).toBeNull();
    r.release('primary');
    r.step(30);
    expect(angDiff(r.facing(), 0)).toBeLessThan(0.5);
  });
});

describe('AC19 ふちどり（yokaiFocus の えらび方）', () => {
  it('すで・facing 90 で 東 2.0 の 妖怪 → その id。facing を 270 にすると null。ヒントは hit → dig', () => {
    const r = rig('hand');
    r.face(90);
    const y = r.yokai.add('karakasa', at(90, 2.0));
    r.step(1);
    expect(r.dig.aimedYokaiId()).toBe(y.id);
    expect(r.dig.previewLeftClick()).toBe('hit');
    r.face(270);
    r.step(1);
    expect(r.dig.aimedYokaiId()).toBeNull();
    expect(r.dig.previewLeftClick()).toBe('dig');
  });
  it('刀も 同じ。押していなくても（キーなし）毎ステップ えらぶ', () => {
    const r = rig('blade');
    r.face(135);
    const y = r.yokai.add('karakasa', at(120, 2.0));
    r.step(1);
    expect(r.dig.aimedYokaiId()).toBe(y.id);
  });
  it('弓に 持ちかえると ＋マークの 妖怪だけ（東の 妖怪は null）', () => {
    const r = rig('bow');
    r.face(90);
    const side = r.yokai.add('karakasa', at(90, 2.0));
    r.step(1);
    expect(r.dig.aimedYokaiId()).not.toBe(side.id);
    expect(r.dig.aimedYokaiId()).toBeNull();
    // ＋マークの 線の 上（yaw 0・pitch −25 → 北 3.5 の 地面の 手前）に いる 妖怪は えらぶ
    r.yokai.clear();
    const line = r.yokai.add('nurikabe', at(0, 2.0));
    r.step(1);
    expect(r.dig.aimedYokaiId()).toBe(line.id);
  });
  it('設定: createW2Settings の 初期値に bladeFaceAssistDeg が ある（ふちどりも 同じ 補助）', () => {
    expect((createW2Settings() as unknown as { bladeFaceAssistDeg: number }).bladeFaceAssistDeg).toBe(30);
  });
});
