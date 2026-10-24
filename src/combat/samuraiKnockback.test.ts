import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, VoxelWorld } from '../contracts';
import { ArmorSystemImpl } from '../craft/ArmorSystem';
import { CRAFT_DEFAULTS } from '../craft/config';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import { InventoryImpl } from '../inventory/Inventory';
import { BigShock } from '../proto/gashaBigShock';
import { TUNE as T } from '../proto/gashaBigTuning';
import { PlayerCombatImpl } from './PlayerCombat';
import { COMBAT_DEFAULTS } from './config';

/**
 * SAMURAI-1（#300）AC8・AC9: 明珍羽織の「とばされにくさ」（横の 距離・速さ × 0.3。上への はねは かえない）。実装の 前の テスト（赤）。
 * 窓口 の 形:
 *   samuraiPower.ts  `knockbackMulOf(armor)`（AC7。プレイヤーの 押される しくみと がしゃどくろの はじきの 両方が この 関数だけを 読む）
 *   PlayerCombat     既に わたしている `armor`（deps.armor）から knockbackMulOf を 読む（押す 距離 knockback 1.8 に かける。knockbackUp 4.5 は そのまま）
 *   BigShock         `ShockDeps.knockbackMul?(): number`（つなぎ込みが `() => knockbackMulOf(armor)` を わたす。なければ 1）。
 *                    打撃・衝撃波（stagger.knockSpeed 11）・小さい 衝撃（tapKnockSpeed 7）・払い（sweep.knockSpeed 22）の 横の 速さだけに かける。上（5・7）・ダメージ・ひるみは そのまま
 *   コアの ふり落とし（core.throwOff）・とどめの はじき（finish.blow）は BigShock の 外で 起きる ので かけない（つなぎ込みで 確かめる）
 */
class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  isLoaded(x: number, z: number): boolean { return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z; }
  loadedBounds() { return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z }; }
  getBlock(): BlockId | 'outside' { return 'air'; }
  setBlock() { return true; }
  isSolid() { return false; }
}

/** 平らな 所（何も ない 空間）に 立つ プレイヤー。haori = 羽織を 着る */
function rig(haori: boolean) {
  const inv = new InventoryImpl();
  const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
  armor.set(null, haori ? ('samurai_haori' as ItemId) : null, null, null);
  const player = { position: { x: 5, y: 20, z: 5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const combat = new PlayerCombatImpl({
    world: new W(),
    player: {
      get: () => player,
      set: (v) => {
        Object.assign(player.position, v.position ?? {});
        Object.assign(player.velocity, v.velocity ?? {});
      },
    },
    inventory: inv,
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: 1, y: 20, z: 1, yawDeg: 0, pitchDeg: 0 }),
    armor,
  });
  combat.update();
  return { combat, player, armor };
}

/** 北（−z）から 攻撃を 受けて、押しが おわるまで 進める。横に 動いた 距離と、はねの 初速を 返す */
function hit(r: ReturnType<typeof rig>, by: 'karakasa' | 'chochin', kind: 'normal' | 'ball') {
  const p0 = { ...r.player.position };
  r.combat.damage(2, by, { x: p0.x, y: p0.y, z: p0.z - 3 }, kind as never);
  const vy = r.player.velocity.y;
  for (let i = 0; i < 20; i++) r.combat.update();
  return { moved: Math.hypot(r.player.position.x - p0.x, r.player.position.z - p0.z), vy };
}

describe('AC8 羽織 × ふつうの 妖怪の 攻撃・火の玉', () => {
  it('からかさの 攻撃: 羽織 なし 横に 1.8（±0.05）、羽織で 0.54（±0.05）。上への はねの 初速は どちらも 4.5', () => {
    const a = hit(rig(false), 'karakasa', 'normal');
    const b = hit(rig(true), 'karakasa', 'normal');
    expect(a.moved).toBeCloseTo(1.8, 1);
    expect(Math.abs(a.moved - 1.8)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(b.moved - 0.54)).toBeLessThanOrEqual(0.05);
    expect(a.vy).toBe(4.5);
    expect(b.vy).toBe(4.5);
    expect(COMBAT_DEFAULTS.knockback).toBe(1.8);
    expect(COMBAT_DEFAULTS.knockbackUp).toBe(4.5);
  });
  it('火の玉（ちょうちん・ball）でも 同じ: なし 1.8・羽織 0.54・はね 4.5', () => {
    const a = hit(rig(false), 'chochin', 'ball');
    const b = hit(rig(true), 'chochin', 'ball');
    expect(Math.abs(a.moved - 1.8)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(b.moved - 0.54)).toBeLessThanOrEqual(0.05);
    expect(a.vy).toBe(4.5);
    expect(b.vy).toBe(4.5);
  });
  it('knockbackMul.samurai_haori を 0.5 に する と 0.9（表の 数を そのまま つかう）', () => {
    const t = NINJA_TUNING.knockbackMul as unknown as Record<string, number>;
    const saved = t.samurai_haori;
    try {
      t.samurai_haori = 0.5;
      expect(Math.abs(hit(rig(true), 'karakasa', 'normal').moved - 0.9)).toBeLessThanOrEqual(0.05);
    } finally {
      t.samurai_haori = saved;
    }
    expect(Math.abs(hit(rig(true), 'karakasa', 'normal').moved - 0.54)).toBeLessThanOrEqual(0.05);
  });
  it('押されている 途中（10 ステップの 途中）で 羽織を ぬいでも もう 始まった 押しは そのまま。次の 押しから 1', () => {
    const r = rig(true);
    const p0 = { ...r.player.position };
    r.combat.damage(2, 'karakasa', { x: p0.x, y: p0.y, z: p0.z - 3 }, 'normal' as never);
    for (let i = 0; i < 4; i++) r.combat.update();
    r.armor.set(null, null, null, null);
    for (let i = 0; i < 20; i++) r.combat.update();
    expect(Math.abs(Math.hypot(r.player.position.x - p0.x, r.player.position.z - p0.z) - 0.54)).toBeLessThanOrEqual(0.05);
    // つぎの 押し（むてき時間が 切れてから）は 1.8
    for (let i = 0; i < 120; i++) r.combat.update();
    const q0 = { ...r.player.position };
    r.combat.damage(2, 'karakasa', { x: q0.x, y: q0.y, z: q0.z - 3 }, 'normal' as never);
    for (let i = 0; i < 20; i++) r.combat.update();
    expect(Math.abs(Math.hypot(r.player.position.x - q0.x, r.player.position.z - q0.z) - 1.8)).toBeLessThanOrEqual(0.05);
  });
});

/** BigShock の 準備。プレイヤーは 手（原点）の +x がわ 1 に 立つ。mul = 羽織の 倍率（省略 = ない） */
function shockRig(mul?: number) {
  const ply = { x: 1, y: 0, z: 0 };
  const hurts: number[] = [];
  const pushes: { x: number; y: number; z: number }[] = [];
  const shock = new BigShock({
    player: () => ply,
    groundY: () => -1,
    hurt: (amount: number) => (hurts.push(amount), true),
    setPlayerVelocity: (v: { x: number; y: number; z: number }) => pushes.push(v),
    ...(mul === undefined ? {} : { knockbackMul: () => mul }),
  } as never);
  return { shock, ply, hurts, pushes };
}

describe('AC9 羽織 × がしゃどくろ', () => {
  it('調整表の もとの 数: 衝撃波 11・小さい 衝撃 7・払い 22 / 上 5・5・7', () => {
    expect(T.stagger.knockSpeed).toBe(11);
    expect(T.stagger.tapKnockSpeed).toBe(7);
    expect(T.sweep.knockSpeed).toBe(22);
    expect(T.stagger.knockUp).toBe(5);
    expect(T.sweep.knockUp).toBe(7);
  });
  it('打撃・衝撃波: lastPush の 横が なし 11 → 羽織 3.3、上は 5 の まま', () => {
    const a = shockRig();
    a.shock.add('slam', 0, 0, 0);
    expect(a.shock.lastPush!.x).toBeCloseTo(11, 6);
    expect(a.shock.lastPush!.y).toBe(5);
    const b = shockRig(0.3);
    b.shock.add('slam', 0, 0, 0);
    expect(b.shock.lastPush!.x).toBeCloseTo(3.3, 6);
    expect(Math.abs(b.shock.lastPush!.z)).toBeLessThan(1e-9);
    expect(b.shock.lastPush!.y).toBe(5);
    expect(b.pushes[0]).toEqual(b.shock.lastPush);
  });
  it('衝撃波の 輪が とおった ときも 同じ（3.3）', () => {
    const b = shockRig(0.3);
    b.ply.x = 6; // 手から 遠い 所（打撃は とどかず、輪が 通る）
    b.shock.add('slam', 0, 0, 0);
    expect(b.pushes).toHaveLength(0);
    for (let i = 0; i < 120 && b.pushes.length === 0; i++) b.shock.step(1 / 60);
    expect(b.pushes.length).toBe(1);
    expect(b.shock.lastPush!.x).toBeCloseTo(3.3, 6);
    expect(b.shock.lastPush!.y).toBe(5);
  });
  it('小さい 衝撃（tap）: 7 → 2.1、上 5 の まま', () => {
    const a = shockRig();
    a.shock.add('tap', 0, 0, 0);
    expect(a.shock.lastPush!.x).toBeCloseTo(7, 6);
    const b = shockRig(0.3);
    b.shock.add('tap', 0, 0, 0);
    expect(b.shock.lastPush!.x).toBeCloseTo(2.1, 6);
    expect(b.shock.lastPush!.y).toBe(5);
  });
  it('払い（sweep）: 22 → 6.6、上 7 の まま', () => {
    const a = shockRig();
    a.shock.sweepStrike({ x: 0, y: 0, z: 0 }, 1, 0);
    expect(a.shock.lastPush).toEqual({ x: 22, y: 7, z: 0 });
    const b = shockRig(0.3);
    b.shock.sweepStrike({ x: 0, y: 0, z: 0 }, 1, 0);
    expect(b.shock.lastPush!.x).toBeCloseTo(6.6, 6);
    expect(b.shock.lastPush!.y).toBe(7);
  });
  it('ダメージ・ひるみの 時間は 羽織で かわらない', () => {
    const a = shockRig();
    const b = shockRig(0.3);
    a.shock.add('slam', 0, 0, 0);
    b.shock.add('slam', 0, 0, 0);
    expect(b.hurts).toEqual(a.hurts);
    expect(b.shock.staggerLeft).toBe(a.shock.staggerLeft);
    const c = shockRig();
    const d = shockRig(0.3);
    c.shock.sweepStrike({ x: 0, y: 0, z: 0 }, 1, 0);
    d.shock.sweepStrike({ x: 0, y: 0, z: 0 }, 1, 0);
    expect(d.hurts).toEqual(c.hurts);
    expect(d.shock.staggerLeft).toBe(c.shock.staggerLeft);
  });
  it('倍率 0 なら 横には とばされない（上へは はねる）。倍率を 渡さなければ 今の まま', () => {
    const z = shockRig(0);
    z.shock.add('slam', 0, 0, 0);
    expect(z.shock.lastPush!.x).toBe(0);
    expect(z.shock.lastPush!.y).toBe(5);
    const n = shockRig();
    n.shock.add('slam', 0, 0, 0);
    expect(n.shock.lastPush!.x).toBeCloseTo(11, 6);
  });
});
