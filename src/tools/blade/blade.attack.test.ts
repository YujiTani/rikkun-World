import { describe, expect, it } from 'vitest';
import type { BladeStance, BladeStepContext, ItemId, Vec3, YokaiInfo, YokaiKind, YokaiKnock, YokaiRayHit, YokaiWorld } from '../../contracts';
import { ActionState as Actions } from '../../input/actions';
import { PlayerController } from '../../player/PlayerController';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { KIND_AI } from '../../yokai/ai/config';
import {
  B, NO_KEYS, P, angDiff, at, bearing, centerOf, decide, flatWorld, settingsW3, yokaiAt,
  type AttackKeys,
} from '../../combat/attackTestKit';
import { createBladeSystem } from './BladeSystem';

/**
 * WEAPON-3 §6 AC6〜AC10（刀）。
 * 刀の しくみには「向き u（`attackDirDeg`）・T の 中心の 点（`attackTarget`）・体の点 B（`body`）」を
 * `BladeStepContext` で わたす（仕様書 §8 担当 A の 契約）。u と T は `decideAttack`（attackFacing）で 出す。
 */

class FakeYokai implements YokaiWorld {
  items: YokaiInfo[] = [];
  calls: Array<{ id: number; amount: number; from: Vec3; knock?: YokaiKnock }> = [];
  add(kind: YokaiKind, pos: Vec3): YokaiInfo {
    const y = yokaiAt(kind, pos, { id: this.items.length + 1 });
    this.items.push(y);
    return y;
  }
  list = () => this.items;
  raycast(o: Vec3, d: Vec3, max: number): YokaiRayHit | null {
    let best: YokaiRayHit | null = null;
    for (const y of this.items) {
      const { radius: r, height: h } = KIND_AI[y.kind];
      let t0 = 0;
      let t1 = max;
      const lo = [y.position.x - r, y.position.y, y.position.z - r];
      const hi = [y.position.x + r, y.position.y + h, y.position.z + r];
      const oo = [o.x, o.y, o.z];
      const dd = [d.x, d.y, d.z];
      let ok = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(dd[i]) < 1e-9) {
          if (oo[i] < lo[i] || oo[i] > hi[i]) ok = false;
        } else {
          const a = (lo[i] - oo[i]) / dd[i];
          const b = (hi[i] - oo[i]) / dd[i];
          t0 = Math.max(t0, Math.min(a, b));
          t1 = Math.min(t1, Math.max(a, b));
        }
      }
      if (ok && t0 <= t1 && (!best || t0 < best.distance)) best = { id: y.id, kind: y.kind, distance: t0 };
    }
    return best;
  }
  damage(id: number, amount: number, from: Vec3, knock?: YokaiKnock) {
    this.calls.push({ id, amount, from, knock });
  }
  occupies = () => false;
  drainEvents = () => [];
}

const TECH_OF: Record<BladeStance, 'thrust' | 'kesa' | 'kiriage'> = { chudan: 'thrust', jodan: 'kesa', gedan: 'kiriage' };

function rig(stance: BladeStance = 'chudan') {
  const world: ArrayVoxelWorld = flatWorld();
  const actions = new Actions();
  const player = new PlayerController(
    world, actions, { consume: () => ({ dx: 0, dy: 0 }) },
    { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true },
    () => ({ x: P.x, y: P.y, z: P.z, yawDeg: 0, pitchDeg: 0 }),
  );
  const yokai = new FakeYokai();
  const settings = settingsW3();
  let tick = 0;
  const blade = createBladeSystem({
    world, yokai: () => yokai, settings, weaponDamage: () => 4, onHit: () => {},
    lunge: (dx, dz) => player.lunge(dx, dz), tick: () => tick,
  });
  const item: ItemId = 'katana';
  blade.setStance(stance);
  /** このステップに わたす 向き: 今の かまえの わざで `decideAttack` に 聞く（弓いがい・＋マークは 足もとの 石） */
  const stepWith = (o: { yaw?: number; facing: number; keys?: AttackKeys; pressed?: boolean; held?: boolean }) => {
    tick++;
    const pos = player.state.position;
    const d = decide({
      hold: 'blade', tech: TECH_OF[blade.state().stance], yawDeg: o.yaw ?? 0, facingDeg: o.facing, keys: o.keys ?? NO_KEYS,
      position: pos, yokai: yokai.items, world, settings,
    });
    const target = d.targetId === null ? null : centerOf(yokai.items.find((y) => y.id === d.targetId)!);
    const ctx: BladeStepContext = {
      item, techPressed: !!o.pressed, techHeld: !!o.held, stancePressed: false,
      eye: { x: pos.x, y: pos.y + 1.62, z: pos.z }, dir: { x: 0, y: 0, z: -1 }, position: pos, yawDeg: o.yaw ?? 0, active: true,
      body: { x: pos.x, y: pos.y + 1.4, z: pos.z }, attackDirDeg: d.dirDeg ?? 0, attackTarget: target,
    } as BladeStepContext;
    blade.update(ctx);
    player.update(1 / 60);
    return d;
  };
  stepWith({ facing: 0 }); // 刀を えらぶ
  blade.setStance(stance);
  return { world, player, blade, yokai, settings, stepWith };
}

const hitsOf = (r: ReturnType<typeof rig>) => r.blade.peekEvents().filter((e) => e.type === 'techHit');

describe('AC6 向きは キャラの向き（キーなし・妖怪なし）', () => {
  it('yaw 0・facing 90・上段 → dirDeg = 90、扇の forward = (1,0,0)、体は 東へ ふみこむ', () => {
    const r = rig('jodan');
    const o = { ...r.player.state.position };
    r.stepWith({ facing: 90, pressed: true });
    expect(r.blade.state().move!.dirDeg).toBeCloseTo(90, 3);
    let seen = false;
    for (let f = 2; f <= 40; f++) {
      r.stepWith({ facing: 90 });
      const sh = r.blade.shape();
      if (sh && sh.kind === 'fan') {
        seen = true;
        expect(sh.forward.x).toBeCloseTo(1, 3);
        expect(sh.forward.z).toBeCloseTo(0, 3);
      }
    }
    expect(seen).toBe(true);
    expect(r.player.state.position.x).toBeGreaterThan(o.x + 0.1);
    expect(Math.abs(r.player.state.position.z - o.z)).toBeLessThan(0.001);
  });
  it('A を 押して 始める → dirDeg = yaw + 270。キーは 歩いて いなくても 読む', () => {
    const r = rig('jodan');
    r.stepWith({ facing: 90, keys: { ...NO_KEYS, left: true }, pressed: true });
    expect(r.blade.state().move!.dirDeg).toBeCloseTo(270, 3);
    const q = rig('jodan');
    q.stepWith({ yaw: 40, facing: 90, keys: { ...NO_KEYS, left: true }, pressed: true });
    expect(angDiff(q.blade.state().move!.dirDeg, 310)).toBeLessThan(0.001);
  });
});

describe('AC7 横・うしろへ 当たる', () => {
  for (const stance of ['jodan', 'gedan', 'chudan'] as const) {
    for (const [name, deg] of [['東', 90], ['南', 180]] as const) {
      it(`${stance}: からかさ ${name} 2.0・facing ${deg} → techHit 1 回・体力が 1 回ぶん へる`, () => {
        const r = rig(stance);
        const y = r.yokai.add('karakasa', at(deg, 2.0));
        r.stepWith({ facing: deg, pressed: true });
        for (let i = 0; i < 110; i++) r.stepWith({ facing: deg });
        expect(hitsOf(r)).toHaveLength(1);
        expect(r.yokai.calls).toHaveLength(1);
        expect(r.yokai.calls[0]!.id).toBe(y.id);
        // 押す向きは P から 妖怪へ
        expect(angDiff(bearing(r.yokai.calls[0]!.from, y.position), (deg + 180) % 360)).toBeLessThan(1);
      });
    }
  }
  it('南 2.0 と 北 2.0 に 1 体ずつ・facing 180 の 中段（突き）→ 当たるのは 南の 1 体だけ', () => {
    const r = rig('chudan');
    const south = r.yokai.add('karakasa', at(180, 2.0));
    r.yokai.add('karakasa', at(0, 2.0));
    r.stepWith({ facing: 180, pressed: true });
    for (let i = 0; i < 50; i++) r.stepWith({ facing: 180 });
    expect(r.yokai.calls.map((c) => c.id)).toEqual([south.id]);
  });
  it('補助で えらんだ 妖怪の 方へ ぴたっと 向く（facing 90 から 20° ずれた 妖怪）', () => {
    const r = rig('jodan');
    const y = r.yokai.add('karakasa', at(110, 2.0));
    r.stepWith({ facing: 90, pressed: true });
    expect(angDiff(r.blade.state().move!.dirDeg, bearing(centerOf(y)))).toBeLessThan(0.01);
  });
});

describe('AC8 突きの 線（B から・かたむき）', () => {
  const capsule = (r: ReturnType<typeof rig>) => {
    for (let i = 0; i < 12; i++) {
      const sh = r.blade.shape();
      if (sh && sh.kind === 'capsule') return sh;
      r.stepWith({ facing: 135 });
    }
    return null;
  };
  it('妖怪なし（rule 4）: from = (P.x, S.y, P.z)、to.y = from.y、水平の 向き = u', () => {
    const r = rig('chudan');
    r.stepWith({ facing: 135, pressed: true });
    const sh = capsule(r)!;
    expect(sh).not.toBeNull();
    // 体の 点: P の 真上（このテストの 床は ひらけた 所 → 足もと + 1.40）
    expect(Math.abs(sh.from.x - B.x)).toBeLessThan(0.01);
    expect(Math.abs(sh.from.z - B.z)).toBeLessThan(0.01);
    expect(Math.abs(sh.from.y - (r.player.state.position.y + 1.4))).toBeLessThan(0.01);
    expect(Math.abs(sh.to.y - sh.from.y)).toBeLessThan(0.001);
    const dir = bearing(sh.to, sh.from);
    expect(angDiff(dir, 135)).toBeLessThan(0.01);
    expect(Math.hypot(sh.to.x - sh.from.x, sh.to.z - sh.from.z)).toBeCloseTo(2.2, 2); // WEAPON-4: 射程 R = 2.2
  });
  it('うかぶ ちょうちん（中心が B より 上）が T → T の 中心の 向きへ かたむく。tiltDeg = atan(高さの差 ÷ 水平の距離)', () => {
    const r = rig('chudan');
    // 箱の下 足もと + 2.0・高さ 1.7 → 中心 + 2.85。水平 2.0 先（WEAPON-4: 射程 2.2 に とどく 所）
    const y = r.yokai.add('chochin', at(135, 2.0, P.y + 2.0));
    r.stepWith({ facing: 135, pressed: true });
    const sh = capsule(r)!;
    expect(sh).not.toBeNull();
    const c = centerOf(y);
    const dh = Math.hypot(c.x - sh.from.x, c.z - sh.from.z);
    const want = (Math.atan2(c.y - sh.from.y, dh) * 180) / Math.PI;
    expect(want).toBeCloseTo(36, 0); // atan(1.45 ÷ 2.0)
    const vx = sh.to.x - sh.from.x;
    const vy = sh.to.y - sh.from.y;
    const vz = sh.to.z - sh.from.z;
    const got = (Math.atan2(vy, Math.hypot(vx, vz)) * 180) / Math.PI;
    expect(Math.abs(got - want)).toBeLessThan(0.1);
    expect(angDiff(bearing(sh.to, sh.from), bearing(c))).toBeLessThan(0.01);
    const mv = r.blade.state().move as unknown as { tiltDeg: number };
    expect(Math.abs(mv.tiltDeg - want)).toBeLessThan(0.1);
    expect(r.yokai.calls.map((c2) => c2.id)).toEqual([y.id]);
  });
  it('T が 50° 上の 所 → かたむきは thrustTiltMaxDeg（45°）まで', () => {
    const r = rig('chudan');
    // 水平 1.0 先・中心 + 2.6（B から 1.2 上）→ atan(1.2 / 1.0) = 50.2°
    const y = r.yokai.add('chochin', at(135, 1.0, P.y + 1.4 + 1.2 - 0.85));
    r.stepWith({ facing: 135, pressed: true });
    const sh = capsule(r)!;
    expect(sh).not.toBeNull();
    const got = (Math.atan2(sh.to.y - sh.from.y, Math.hypot(sh.to.x - sh.from.x, sh.to.z - sh.from.z)) * 180) / Math.PI;
    expect(got).toBeCloseTo(r.settings.thrustTiltMaxDeg, 1);
    const mv = r.blade.state().move as unknown as { tiltDeg: number };
    expect(mv.tiltDeg).toBeCloseTo(45, 1);
    expect(y.id).toBe(1);
  });
  it('thrustTiltMaxDeg を 変えると 上限も かわる', () => {
    const r = rig('chudan');
    r.settings.thrustTiltMaxDeg = 30;
    r.yokai.add('chochin', at(135, 1.0, P.y + 1.4 + 1.2 - 0.85));
    r.stepWith({ facing: 135, pressed: true });
    const sh = capsule(r)!;
    const got = (Math.atan2(sh.to.y - sh.from.y, Math.hypot(sh.to.x - sh.from.x, sh.to.z - sh.from.z)) * 180) / Math.PI;
    expect(got).toBeCloseTo(30, 1);
  });
});

describe('AC9 向きの 固定と 次の わざ', () => {
  it('東の 妖怪へ 始め、とちゅうで yaw を 180 に・S を 押しても dirDeg は 始めの u のまま', () => {
    const r = rig('jodan');
    const y = r.yokai.add('nurikabe', at(90, 2.0));
    r.stepWith({ facing: 90, pressed: true });
    const u0 = r.blade.state().move!.dirDeg;
    expect(angDiff(u0, bearing(centerOf(y)))).toBeLessThan(0.01);
    for (let i = 0; i < 40; i++) {
      r.stepWith({ yaw: 180, facing: 0, keys: { ...NO_KEYS, back: true } });
      expect(r.blade.state().move!.dirDeg).toBe(u0);
    }
  });
  it('おしつづけ: 次の わざが 始まる ステップに D を 押していれば 次の dirDeg = その時の yaw + 90（妖怪なし）', () => {
    const r = rig('chudan');
    r.stepWith({ yaw: 30, facing: 30, held: true, pressed: true });
    const starts: number[] = [];
    const dirs: number[] = [];
    let before = r.blade.peekEvents().filter((e) => e.type === 'techStart').length;
    for (let f = 2; f <= 90; f++) {
      // D は わざの とちゅう（F38 から）に 押しておく。歩けなくても キーは 読む
      r.stepWith({ yaw: 30, facing: 30, held: true, keys: f >= 38 ? { ...NO_KEYS, right: true } : NO_KEYS });
      const n = r.blade.peekEvents().filter((e) => e.type === 'techStart').length;
      if (n > before) {
        starts.push(f);
        dirs.push(r.blade.state().move!.dirDeg);
        before = n;
      }
    }
    expect(starts.length).toBeGreaterThanOrEqual(1);
    expect(angDiff(dirs[0]!, 120)).toBeLessThan(0.001);
  });
});

describe('AC10 先行入力: 向きは 出る ステップで 決める', () => {
  it('わざの さいご 8 ステップの 間に W で 押し、出る ステップに D を 押している → D の 方', () => {
    const r = rig('chudan');
    r.stepWith({ yaw: 0, facing: 0, pressed: true, keys: { ...NO_KEYS, forward: true } });
    expect(r.blade.state().move!.dirDeg).toBeCloseTo(0, 3);
    const total = 41; // 突き 4 + 2 + 35
    for (let f = 2; f <= total + 1; f++) {
      const press = f === total - 5; // 先行入力を 受ける 窓の 中（F36）
      r.stepWith({ yaw: 0, facing: 0, pressed: press, keys: press ? { ...NO_KEYS, forward: true } : { ...NO_KEYS, right: true } });
    }
    const starts = r.blade.peekEvents().filter((e) => e.type === 'techStart');
    expect(starts).toHaveLength(2);
    expect(r.blade.state().frame).toBe(1);
    expect(angDiff(r.blade.state().move!.dirDeg, 90)).toBeLessThan(0.001);
  });
});
