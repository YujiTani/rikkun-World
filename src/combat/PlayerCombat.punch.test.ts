import { describe, expect, it } from 'vitest';
import type { CombatEvent, ItemId, PlayerState, Vec3, YokaiEvent, YokaiInfo, YokaiRayHit, YokaiWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerCombatImpl, type PunchTool } from './PlayerCombat';
import { P, angDiff, at, bearing, centerOf, decide, flatWorld, settingsW3, yokaiAt, type AttackDecision } from './attackTestKit';

/**
 * WEAPON-3 §6 AC11〜AC14（パンチ: すで・おの・なぎなた ほか）。
 * `primaryStep` の 5 つめの 引数に「その ステップの 攻撃の 決まり（`decideAttack` の 結果）」を わたす
 * （担当 B。仕様書 §8）。パンチは 始めた ステップの u・T を 持ち、当たる ステップに その時の P から 扇（§4.5）で 見る。
 */

class FakeYokai implements YokaiWorld {
  items: YokaiInfo[] = [];
  damaged: Array<{ id: number; amount: number; from: Vec3 }> = [];
  add(y: YokaiInfo): YokaiInfo {
    this.items.push(y);
    return y;
  }
  list = () => this.items;
  raycast(): YokaiRayHit | null {
    return null;
  }
  damage(id: number, amount: number, from: Vec3) {
    this.damaged.push({ id, amount, from });
  }
  occupies = () => false;
  drainEvents(): YokaiEvent[] {
    return [];
  }
}

function rig(item: ItemId | null, tool?: PunchTool) {
  const world = flatWorld();
  const player: PlayerState = {
    position: { ...P }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: -25, onGround: true, inWater: false,
    moving: false, facingDeg: 90, running: false,
  };
  const inv = new InventoryImpl();
  if (item) inv.setSlot(0, { item, count: 1 });
  inv.select(0);
  const yokai = new FakeYokai();
  const settings = settingsW3();
  const combat = new PlayerCombatImpl({
    world, player: { get: () => player, set: () => {} }, inventory: inv, yokai: () => yokai,
    spawn: () => ({ x: 1.5, y: 9, z: 1.5, yawDeg: 0, pitchDeg: 0 }), tool, settings,
  });
  const EYE: Vec3 = { x: P.x, y: P.y + 1.62, z: P.z };
  const DOWN: Vec3 = { x: 0, y: -0.42, z: -0.9 };
  const decideNow = (o: Parameters<typeof decide>[0] = {}): AttackDecision =>
    decide({ hold: 'punch', punchReach: tool?.punchParams().reach ?? 3.5, facingDeg: player.facingDeg, yawDeg: player.yawDeg, position: player.position, yokai: yokai.items, world, settings, ...o });
  const press = (a: AttackDecision | null) => (combat as unknown as { primaryStep: (...x: unknown[]) => boolean }).primaryStep(true, EYE, DOWN, 3.4, a);
  const hold = (n: number) => {
    for (let i = 0; i < n; i++) (combat as unknown as { primaryStep: (...x: unknown[]) => boolean }).primaryStep(false, EYE, DOWN, 3.4, null);
  };
  const events = (): CombatEvent[] => combat.takeHookEvents();
  return { world, player, combat, yokai, press, hold, events, decideNow, settings };
}

const naginata: PunchTool = { punchParams: () => ({ damage: 4, reach: 5.0, ticks: 40 }), onPunchStart: () => {} };

describe('AC11 すで: 向いている方へ パンチ', () => {
  it('yaw 0・facing 90・キーなし、東 2.0 に からかさ、＋マークの先は 北の 地面 → punchStart(dirDeg・targetId)、30 ステップ目に punchHit・体力が へる', () => {
    const r = rig('wood_pickaxe');
    const y = r.yokai.add(yokaiAt('karakasa', at(90, 2.0)));
    const d = r.decideNow();
    expect(d.use).toBe('attack');
    expect(d.targetId).toBe(y.id);
    expect(r.press(d)).toBe(true);
    const start = r.events().find((e) => e.type === 'punchStart') as unknown as { dirDeg: number; targetId: number | null };
    expect(start).toBeTruthy();
    expect(angDiff(start.dirDeg, bearing(centerOf(y)))).toBeLessThan(0.01);
    expect(start.targetId).toBe(y.id);
    r.hold(28);
    expect(r.yokai.damaged).toHaveLength(0);
    r.hold(1); // 30 ステップ目
    expect(r.yokai.damaged).toHaveLength(1);
    expect(r.yokai.damaged[0]).toMatchObject({ id: y.id, amount: 1 });
    expect(r.events().map((e) => e.type)).toEqual(['punchHit']);
    expect(r.combat.hookState().punching).toBe(false);
  });
  it('すで（何も 持たない）でも 同じ。押す向きの もとは P', () => {
    const r = rig(null);
    const y = r.yokai.add(yokaiAt('karakasa', at(90, 2.0)));
    r.press(r.decideNow());
    r.hold(29);
    expect(r.yokai.damaged.map((c) => c.id)).toEqual([y.id]);
    expect(r.yokai.damaged[0]!.from).toEqual(P);
  });
});

describe('AC12 パンチの 扇', () => {
  it('当たる ステップの 前に T を u から 45° + 10° の 向きへ 動かす → T には 当たらず punchMiss', () => {
    const r = rig('wood_pickaxe');
    const t = r.yokai.add(yokaiAt('karakasa', at(90, 2.0)));
    const d = r.decideNow();
    r.press(d);
    r.hold(10);
    t.position = at(d.dirDeg! + 55, 2.0);
    r.hold(19);
    expect(r.yokai.damaged).toHaveLength(0);
    expect(r.events().map((e) => e.type)).toEqual(['punchStart', 'punchMiss']);
  });
  it('そのとき 扇の中（u から 20°・2.0）に べつの 妖怪が いれば その 1 体に punchHit', () => {
    const r = rig('wood_pickaxe');
    const t = r.yokai.add(yokaiAt('karakasa', at(90, 2.0)));
    const other = r.yokai.add(yokaiAt('karakasa', at(110, 2.0)));
    const d = r.decideNow();
    expect(d.targetId).toBe(t.id); // 同じ 距離・角の 小さい方
    r.press(d);
    r.hold(10);
    t.position = at(d.dirDeg! + 55, 2.0);
    r.hold(19);
    expect(r.yokai.damaged.map((c) => c.id)).toEqual([other.id]);
    expect(r.events().map((e) => e.type)).toEqual(['punchStart', 'punchHit']);
  });
  it('T が 扇の中に いれば T（もっと 近い 別の 妖怪が いても T を たたく）', () => {
    const r = rig('wood_pickaxe');
    const t = r.yokai.add(yokaiAt('karakasa', at(90, 2.0)));
    const d = r.decideNow();
    r.press(d);
    r.hold(5);
    r.yokai.add(yokaiAt('karakasa', at(90 + 30, 1.2)));
    r.hold(24);
    expect(r.yokai.damaged.map((c) => c.id)).toEqual([t.id]);
  });
  it('扇の中に 2 体 いても 体力が へるのは 1 体だけ（P に いちばん 近い方）', () => {
    const r = rig('wood_pickaxe');
    const far = r.yokai.add(yokaiAt('karakasa', at(90, 2.4)));
    const near = r.yokai.add(yokaiAt('karakasa', at(90 + 20, 1.8)));
    const d = r.decideNow();
    expect(d.targetId).toBe(near.id);
    r.press(d);
    r.hold(29);
    expect(r.yokai.damaged).toHaveLength(1);
    expect(r.yokai.damaged[0]!.id).toBe(near.id);
    expect(far.id).not.toBe(near.id);
  });
  it('パンチの とちゅうで T が 帰った → 扇の中の ほかの 1 体', () => {
    const r = rig('wood_pickaxe');
    const t = r.yokai.add(yokaiAt('karakasa', at(90, 2.0)));
    const other = r.yokai.add(yokaiAt('karakasa', at(90 - 15, 2.6)));
    r.press(r.decideNow());
    r.hold(10);
    t.state = 'leaving';
    r.hold(19);
    expect(r.yokai.damaged.map((c) => c.id)).toEqual([other.id]);
  });
  it('かべごし（B から 中心への 線が 固い ブロック）は 当たらない', () => {
    const r = rig('wood_pickaxe');
    r.yokai.add(yokaiAt('karakasa', at(90, 3.0)));
    const d = r.decideNow();
    r.press(d);
    r.hold(5);
    r.world.setBlock(18, 9, 16, 'stone');
    r.world.setBlock(18, 10, 16, 'stone');
    r.hold(24);
    expect(r.yokai.damaged).toHaveLength(0);
    expect(r.events().map((e) => e.type)).toContain('punchMiss');
  });
  it('パンチの 向きは 始めた ステップのまま（あとで キャラの facing・キーが かわっても）', () => {
    const r = rig('wood_pickaxe');
    const t = r.yokai.add(yokaiAt('karakasa', at(90, 2.0)));
    r.press(r.decideNow());
    r.player.facingDeg = 270;
    r.player.yawDeg = 180;
    r.hold(29);
    expect(r.yokai.damaged.map((c) => c.id)).toEqual([t.id]);
  });
});

describe('AC13 なぎなた・おの', () => {
  it('なぎなた（weaponReach 5.0・weaponTicks 40）: 東へ 当たる。当たるのは 40 ステップ目', () => {
    const r = rig('naginata', naginata);
    const y = r.yokai.add(yokaiAt('karakasa', at(90, 2.0)));
    r.press(r.decideNow());
    r.hold(38);
    expect(r.yokai.damaged).toHaveLength(0);
    r.hold(1);
    expect(r.yokai.damaged.map((c) => c.id)).toEqual([y.id]);
    expect(r.yokai.damaged[0]!.amount).toBe(4);
  });
  it('いしの おの（届く距離・ステップは 今の 設定 = 3.5・30）: 東へ 同じに 当たる', () => {
    const r = rig('stone_axe');
    const y = r.yokai.add(yokaiAt('karakasa', at(90, 2.0)));
    r.press(r.decideNow());
    r.hold(29);
    expect(r.yokai.damaged.map((c) => c.id)).toEqual([y.id]);
  });
  it('広げた箱まで 4.2 の からかさ: なぎなた（5.0 − 0.3 より 近い）は 当たる、すで（3.5 + 0.3 より 遠い）は 当たらない', () => {
    // 広げた箱 = 半径 0.6 + 0.3 = 0.9 → 中心まで 5.1
    const rn = rig('naginata', naginata);
    const yn = rn.yokai.add(yokaiAt('karakasa', at(90, 4.2 + 0.9)));
    const dn = rn.decideNow();
    expect(dn.use).toBe('attack');
    rn.press(dn);
    rn.hold(39);
    expect(rn.yokai.damaged.map((c) => c.id)).toEqual([yn.id]);

    const rs = rig('wood_pickaxe');
    const ys = rs.yokai.add(yokaiAt('karakasa', at(90, 4.2 + 0.9)));
    expect(rs.decideNow().targetId).toBeNull();
    // むりやり その 妖怪を T にして 始めても、当たる ステップの 扇で とどかない
    rs.press({ use: 'attack', rule: 1, baseDeg: 90, keyDeg: null, dirDeg: 90, targetId: ys.id });
    rs.hold(29);
    expect(rs.yokai.damaged).toHaveLength(0);
    expect(rs.events().map((e) => e.type)).toContain('punchMiss');
  });
});

describe('AC14 今の 届く距離と 同じ（m3 AC18 の 場面）', () => {
  // からかさの 箱の 手前の面 まで 3.4 / 3.9（目の 位置の x から）。中心は 手前の面 + 0.75 → 4.15 / 4.65
  it('3.4 は 当たる（中心まで 4.15 → 広げた箱まで 3.25 ≤ 3.5）', () => {
    const r = rig('wood_pickaxe');
    r.player.facingDeg = 90;
    const y = r.yokai.add(yokaiAt('karakasa', at(90, 3.4 + 0.75)));
    const d = r.decideNow();
    expect(d.use).toBe('attack');
    r.press(d);
    r.hold(29);
    expect(r.yokai.damaged.map((c) => c.id)).toEqual([y.id]);
  });
  it('3.9 は 当たらない（中心まで 4.65 → 3.75 > 3.5）', () => {
    const r = rig('wood_pickaxe');
    const y = r.yokai.add(yokaiAt('karakasa', at(90, 3.9 + 0.75)));
    const d = r.decideNow();
    expect(d.use).not.toBe('attack');
    // むりやり T にして 始めても、当たる ステップの 扇（届く距離 3.5）で とどかない
    r.press({ use: 'attack', rule: 1, baseDeg: 90, keyDeg: null, dirDeg: 90, targetId: y.id });
    r.hold(29);
    expect(r.yokai.damaged).toHaveLength(0);
    expect(r.events().map((e) => e.type)).toContain('punchMiss');
  });
});
