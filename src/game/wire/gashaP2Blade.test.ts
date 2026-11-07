import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import type { LockStatus, ToolInfo } from '../../contracts';
import { FakeYokaiWorld, settingsW3 } from '../../combat/attackTestKit';
import { PlayerCombatImpl } from '../../combat/PlayerCombat';
import { createDigConfig } from '../../dig/config';
import { DigSystemImpl } from '../../dig/DigSystem';
import { startGashaBig, type GashaBigDeps } from '../../gasha/gashaBig';
import { makeHitSources } from '../../gasha/gashaBigHitWire';
import { TUNE as T } from '../../gasha/gashaBigTuning';
import type { GashaTarget } from '../../gasha/gashaTargets';
import { ActionState } from '../../input/actions';
import { InventoryImpl } from '../../inventory/Inventory';
import { PlayerController } from '../../player/PlayerController';
import { createBladeSystem } from '../../tools/blade/BladeSystem';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { extendPerson, peopleList, type P2GashaPort } from './gashaPeople';

/**
 * COOP-1 4d-3（docs/design/COOP-1.md 1.13 §3.6 (c)・AC110。e2e/duoGasha.spec.ts の 通し）: 2P の 刀が がしゃどくろの 体力に とどく までを、
 * wire の 部品を 組んで 1 本で 見る。2P の 入力（primary）→ DigSystem（2P 用。体の点 B の 口なし）→ BladeSystem.update → shape()
 * → gasha.ts の hit2 と 同じ makeHitSources → peopleList の 2P の 口 → BigHit の 人ごとの 当たり（who 2）→ damage。
 *
 * 場面は e2e/duoGasha.spec.ts と そろえる: 2P の 体の点 B（足もと + 1.40）を 手の 箱の まん中の 高さに 置く（突きが 箱を とおる 高さ。1P の E2E と 同じ やり方）。
 * 地面から の 突きは 地面に おいた 手（上は 足もと + 1.08）の 上を とおる。これは 1P と 同じ 動き（がしゃどくろの 箱へは 突きは かたむかない。PO 2026-11-07・AC113）。
 */

const FLOOR = 8; // 床の 高さ（ブロック。足もとは FLOOR + 1）

function rig() {
  const world = new ArrayVoxelWorld({ x: 128, y: 32, z: 128 });
  for (let x = 0; x < 128; x++) for (let z = 0; z < 128; z++) world.setBlock(x, FLOOR, z, 'dirt');
  const settings = settingsW3();
  const yokai = new FakeYokaiWorld();
  const ups: ((dt: number) => void)[] = [];
  let tick = 0;

  // ---- 2P（duoPlay.ts の build() と 同じ 組み方: 体の点 B・ねらいの 出どころの 口は 入れない）
  const actions = new ActionState();
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const ctl = new PlayerController(world, actions, { consume: () => ({ dx: 0, dy: 0 }) }, lock, () => ({ x: 64.5, y: FLOOR + 1, z: 64.5, yawDeg: 0, pitchDeg: 0 }));
  const inv = new InventoryImpl();
  inv.setSlot(0, { item: 'katana', count: 1 });
  inv.select(0);
  const info: ToolInfo = { item: 'katana', kind: 'blade', power: 1, level: 0, damage: 1, reach: 3.5, ticks: 30 };
  const tools = { current: () => info, step() {}, pushSwing() {}, swingWhiff() {}, onPunchStart() {}, punchParams: () => ({ damage: 1, reach: 3.5, ticks: 30 }) };
  const blade = createBladeSystem({ world, yokai: () => yokai, settings, weaponDamage: () => 4, onHit: () => {}, lunge: (dx, dz) => ctl.lunge(dx, dz), tick: () => tick });
  const combat = new PlayerCombatImpl({
    world, player: { get: () => ctl.state, set: (v) => ctl.set(v) }, inventory: inv, yokai: () => yokai,
    spawn: () => ({ x: 64.5, y: FLOOR + 1, z: 64.5, yawDeg: 0, pitchDeg: 0 }), tool: tools, settings,
  });
  const dig = new DigSystemImpl(world, () => ctl.state, actions, lock, inv, () => 1.62, createDigConfig(), undefined, combat, { tools, blade, w2: settings, yokai: () => yokai } as never);

  // ---- がしゃどくろ（gasha.ts の startBigBoss と 同じ つなぎ: 1P の 口に 1 人用の 当たり、2P は peopleList の hit2）
  const p1Hit = makeHitSources({ blade: { shape: () => null, state: () => ({ item: null, tech: null, frame: 0 }) }, waves: () => [], legend: { peekEvents: () => [], dome: () => null }, held: () => null, settings, weaponDamage: () => 4, yokai: () => yokai });
  const p1 = extendPerson({ who: 1, pos: { x: 4, y: FLOOR + 1, z: 4 }, yawDeg: 0, down: false, hit: p1Hit, hurt: () => true } as GashaTarget, { down: () => false });
  const port = {
    ctl, life: { hp: 10, maxHp: 10, down: false, damage: () => ({ applied: 0, knock: false }) }, armor: { equipped: () => null }, blade,
    held: () => inv.held(), weaponDamage: () => 4, setNoFall: () => {}, blockInput: () => {}, onBigHit: () => {},
    camera: new PerspectiveCamera(), hitStop: () => {}, shake: () => {}, shakeTo: () => {},
  } as unknown as P2GashaPort;
  const hit2 = (p: P2GashaPort) => makeHitSources({ blade: p.blade, waves: () => p.waves?.() ?? [], legend: p.legend ?? { peekEvents: () => [], dome: () => null }, held: p.held, settings, weaponDamage: p.weaponDamage, yokai: () => null });
  const deps = {
    scene: new Scene(), camera: new PerspectiveCamera(), player: () => ({ x: 4, y: FLOOR + 1, z: 4, yawDeg: 0 }), groundY: () => FLOOR,
    addPlayerSolid: () => {}, onUpdate: (fn: (dt: number) => void) => { ups.push(fn); }, hurt: () => true, reducedMotion: () => false, onBeforeRender: () => {},
    hit: p1Hit, targets: peopleList(p1, () => port, hit2),
  } as unknown as GashaBigDeps;
  const h = startGashaBig(deps);
  h.place({ x: 64, z: 96, yawDeg: 180 });
  h.walk(false);

  /** duoPlay.ts の 順: 2P の 体 → 掘る・攻撃（刀）→ がしゃどくろの 更新 */
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      tick++;
      const bm = blade.motion();
      ctl.motion.speedMul = bm.speedMul;
      ctl.motion.jumpLocked = bm.jumpLocked;
      ctl.motion.faceDeg = dig.attackFaceDeg();
      ctl.update(1 / 60);
      dig.update();
      combat.update();
      for (const f of ups) f(1 / 60);
      actions.endFrame();
    }
  };
  step(5);
  h.refreshColliders();
  return { h, ctl, actions, step, world };
}

describe('2P の 刀が がしゃどくろの 体力に とどく（wire の 通し。AC110）', () => {
  let chase = true;
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); chase = T.chase.enabled; T.chase.enabled = false; });
  afterEach(() => { vi.unstubAllGlobals(); T.chase.enabled = chase; });

  it('中段（突き）で 手の 箱の まん中の 高さから 手を ねらう → 体力が へり、当てたのは 2P', () => {
    const r = rig();
    const g = r.h as unknown as { colliders(): { name: string; center: number[]; half: number[] }[]; hp(): number; info(): { pos: number[]; lastHit: { who: number } | null } };
    const hand = g.colliders().find((q) => q.name === 'handL')!;
    const boss = g.info().pos;
    // e2e/duoGasha.spec.ts と 同じ 立ち位置: 体の まん中 → 手の 向きに、手の 箱の ふち + 0.9 マス。高さは 体の点 B が 手の 箱の まん中（足もとが 床に かかる ので その 列は 空気に）
    let ox = hand.center[0]! - boss[0]!, oz = hand.center[2]! - boss[2]!;
    const od = Math.hypot(ox, oz) || 1;
    ox /= od; oz /= od;
    const stand = Math.abs(ox) * hand.half[0]! + Math.abs(oz) * hand.half[2]! + 0.9;
    const x = hand.center[0]! + ox * stand, z = hand.center[2]! + oz * stand;
    const y = hand.center[1]! - 1.4;
    for (let k = 0; k <= Math.floor(y); k++) r.world.setBlock(Math.floor(x), k, Math.floor(z), 'air');
    // duo.aimAt と 同じ 向き（手の 中心の マスの まん中を 目から ねらう）
    const cx = Math.floor(hand.center[0]!) + 0.5, cy = Math.floor(hand.center[1]!) + 0.5, cz = Math.floor(hand.center[2]!) + 0.5;
    const dx = cx - x, dy = cy - (y + 1.62), dz = cz - z;
    const yaw = (Math.atan2(dx, -dz) * 180) / Math.PI;
    const pitch = (Math.asin(dy / Math.hypot(dx, dy, dz)) * 180) / Math.PI;
    const hp0 = g.hp();
    r.ctl.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: yaw, pitchDeg: pitch, facingDeg: yaw });
    expect(hp0).toBe(T.hit.hp);
    r.actions.press('primary');
    r.step(3);
    r.actions.release('primary');
    r.step(40);
    expect(g.hp(), '2P の 刀で 体力が へる').toBeLessThan(hp0);
    expect(g.info().lastHit?.who, '最後に 当てたのは 2P').toBe(2);
  });
});
