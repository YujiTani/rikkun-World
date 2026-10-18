import { describe, expect, it } from 'vitest';
import type { BladeStepContext, ItemId, Vec3, YokaiInfo, YokaiKind, YokaiKnock, YokaiRayHit, YokaiWorld } from '../../contracts';
import { createW2Settings } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { createBladeSystem, techDamage } from './BladeSystem';

const R: Record<YokaiKind, [number, number]> = { karakasa: [0.6, 1.6], chochin: [0.4, 1.7], nurikabe: [0.9, 3.0], rokurokubi: [0.4, 2.9] };

class FakeYokai implements YokaiWorld {
  items: YokaiInfo[] = [];
  calls: Array<{ id: number; amount: number; from: Vec3; knock?: YokaiKnock }> = [];
  add(kind: YokaiKind, x: number, y: number, z: number): number {
    const id = this.items.length + 1;
    this.items.push({ id, kind, position: { x, y, z }, yawDeg: 0, hp: 99, maxHp: 99, state: 'idle', attackTick: 0, scale: 1, name: 'テスト', title: 'none', m: 1, attack: 2 });
    return id;
  }
  list = () => this.items;
  raycast(o: Vec3, d: Vec3, max: number): YokaiRayHit | null {
    let best: YokaiRayHit | null = null;
    for (const y of this.items) {
      const [r, h] = R[y.kind];
      // 軸そろえの 箱と 線（スラブ法）
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

function rig(item: ItemId = 'katana') {
  const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, 8, z, 'stone');
  const yokai = new FakeYokai();
  const settings = createW2Settings();
  let tick = 0;
  const hits: Array<{ tech: string; count: number }> = [];
  const lunges: number[][] = [];
  const dmg: Record<string, number> = { bokuto: 2, katana: 4, crystal_katana: 6 };
  const blade = createBladeSystem({
    world,
    yokai: () => yokai,
    settings,
    weaponDamage: (i) => dmg[i] ?? 1,
    onHit: (i) => hits.push(i),
    lunge: (dx, dz) => {
      lunges.push([dx, dz]);
      return { x: dx, z: dz }; // ひらけた所: 言われた ぶんだけ 動く
    },
    tick: () => tick,
  });
  // 北向き（yaw 0）。P = (16.5, 9, 16.5)。前 = -z
  const P = { x: 16.5, y: 9, z: 16.5 };
  let cur: ItemId | null = item;
  let pitch = 0;
  function ctx(o: Partial<BladeStepContext> = {}): BladeStepContext {
    const p = (pitch * Math.PI) / 180;
    return {
      item: cur,
      techPressed: false,
      techHeld: false,
      stancePressed: false,
      eye: { x: P.x, y: P.y + 1.62, z: P.z },
      dir: { x: 0, y: Math.sin(p), z: -Math.cos(p) },
      position: P,
      yawDeg: 0,
      active: true,
      // WEAPON-3 §6.1: 向き u・T・体の点 B を わたす（北向き・妖怪を えらばない = 今までと 同じ場面）
      body: { x: P.x, y: P.y + 1.4, z: P.z },
      attackDirDeg: 0,
      attackTarget: null,
      ...o,
    } as BladeStepContext;
  }
  const step = (o: Partial<BladeStepContext> = {}) => {
    tick++;
    blade.update(ctx(o));
  };
  step(); // 刀を えらんだ（中段）
  return {
    blade, yokai, settings, hits, lunges, step,
    setItem: (i: ItemId | null) => (cur = i),
    setPitch: (d: number) => (pitch = d),
    steps(n: number, o: Partial<BladeStepContext> = {}) { for (let i = 0; i < n; i++) step(o); },
    phases(n: number, first: Partial<BladeStepContext> = {}) {
      const out: string[] = [];
      step(first);
      out.push(`${blade.state().phase}`);
      for (let i = 1; i < n; i++) { step(); out.push(blade.state().phase); }
      return out;
    },
    front(d: number, deg = 0, y = P.y) {
      const a = (deg * Math.PI) / 180;
      return { x: P.x + Math.sin(a) * d, y, z: P.z - Math.cos(a) * d };
    },
  };
}

describe('かまえ（AC1）', () => {
  it('中段から Rで 上段→下段→中段、8F は switch', () => {
    const r = rig();
    expect(r.blade.state().stance).toBe('chudan');
    r.step({ stancePressed: true });
    expect(r.blade.state().stance).toBe('jodan');
    for (let f = 1; f <= 8; f++) {
      expect(r.blade.state().phase).toBe('switch');
      expect(r.blade.state().frame).toBe(f);
      r.step();
    }
    expect(r.blade.state().phase).toBe('idle');
    r.step({ stancePressed: true });
    r.steps(8);
    r.step({ stancePressed: true });
    expect(r.blade.state().stance).toBe('chudan');
  });
  it('刀 以外 では かわらず、持ちかえて もどると 中段', () => {
    const r = rig();
    r.step({ stancePressed: true });
    expect(r.blade.state().stance).toBe('jodan');
    r.setItem('wood_pickaxe');
    r.step({ stancePressed: true });
    expect(r.blade.state().item).toBeNull();
    r.setItem('katana');
    r.step();
    expect(r.blade.state().stance).toBe('chudan');
  });
});

describe('フレーム表（AC2）', () => {
  const expectPhases = (s: string[], a: number, b: number, c: number) => {
    expect(s.slice(0, a).every((p) => p === 'startup')).toBe(true);
    expect(s.slice(a, a + b).every((p) => p === 'active')).toBe(true);
    expect(s.slice(a + b, a + b + c).every((p) => p === 'recovery')).toBe(true);
    expect(s[a + b + c]).toBe('idle');
  };
  it('突き 4/2/35', () => {
    const r = rig();
    const s = r.phases(42, { techPressed: true });
    expect(r.blade.state().tech).toBeNull();
    expectPhases(s, 4, 2, 35);
  });
  it('大げさ斬り 28/6/72', () => {
    const r = rig();
    r.blade.setStance('jodan');
    expectPhases(r.phases(107, { techPressed: true }), 28, 6, 72);
  });
  it('切り上げ 19/3/30（WEAPON-4）。設定を かえると かわる', () => {
    const d = rig();
    d.blade.setStance('gedan');
    expectPhases(d.phases(54, { techPressed: true }), 19, 3, 30);
    const r = rig();
    r.blade.setStance('gedan');
    r.settings.bladeTech.kiriage = { startup: 2, active: 1, recovery: 3 };
    expectPhases(r.phases(7, { techPressed: true }), 2, 1, 3);
  });
});

describe('当たる F・ダメージ（AC3・AC4。WEAPON-4 §4.1・§4.3）', () => {
  it('突き は F5、かたな 3', () => {
    const r = rig();
    const id = r.yokai.add('karakasa', ...(Object.values(r.front(2)) as [number, number, number]));
    r.step({ techPressed: true });
    r.steps(3);
    expect(r.yokai.calls.length).toBe(0);
    r.step();
    expect(r.yokai.calls).toHaveLength(1);
    expect(r.yokai.calls[0]).toMatchObject({ id, amount: 3, knock: { dist: 0.8, up: 0 } });
    const ev = r.blade.peekEvents().find((e) => e.type === 'techHit');
    expect(ev).toBeTruthy();
    r.steps(10);
    expect(r.yokai.calls).toHaveLength(1);
    expect(r.hits).toEqual([{ tech: 'thrust', count: 1 }]);
  });
  it('大げさ斬り F29 に 10（ノックバック 6・上 3）、切り上げ F20 に 4.6（ノックバック 1・上 7）', () => {
    const r = rig();
    r.blade.setStance('jodan');
    r.yokai.add('karakasa', ...(Object.values(r.front(2)) as [number, number, number]));
    r.step({ techPressed: true });
    r.steps(27);
    expect(r.yokai.calls).toHaveLength(0);
    r.step();
    expect(r.yokai.calls[0]).toMatchObject({ amount: 10, knock: { dist: 6, up: 3 } });
    const k = rig();
    k.blade.setStance('gedan');
    k.yokai.add('karakasa', ...(Object.values(k.front(2)) as [number, number, number]));
    k.step({ techPressed: true });
    k.steps(18); // F19
    expect(k.yokai.calls).toHaveLength(0);
    k.step(); // F20
    expect(k.yokai.calls[0]).toMatchObject({ knock: { dist: 1.0, up: 7 } });
    expect(k.yokai.calls[0]!.amount).toBeCloseTo(4.6, 6);
  });
  it('AC2: 3 しゅるい x 3 わざの ダメージ表（§4.3。四捨五入しない・0.01 の位）', () => {
    // [突き, 切り上げ, 大けさぎり] の 順（かまえ: 中段・下段・上段）
    const exp: Record<string, number[]> = { bokuto: [1.5, 2.3, 5], katana: [3, 4.6, 10], crystal_katana: [4.5, 6.9, 15] };
    for (const it of Object.keys(exp)) {
      (['chudan', 'gedan', 'jodan'] as const).forEach((st, i) => {
        const r = rig(it as ItemId);
        r.blade.setStance(st);
        r.yokai.add('nurikabe', ...(Object.values(r.front(2)) as [number, number, number]));
        r.step({ techPressed: true });
        r.steps(42);
        expect(r.yokai.calls[0].amount).toBeCloseTo(exp[it][i], 3);
      });
    }
  });
  it('AC2: techDamage は 四捨五入も 最低 1 も しない。1.15 × 6 は 6.9（6.8999… でない）', () => {
    expect(techDamage(6, 1.15)).toBe(6.9);
    expect(techDamage(4, 1.15)).toBe(4.6);
    expect(techDamage(2, 1.15)).toBe(2.3);
    expect(techDamage(2, 0.75)).toBe(1.5);
    expect(techDamage(6, 0.75)).toBe(4.5);
    expect(techDamage(2, 0.25)).toBe(0.5); // 最低 1 に しない
    expect(techDamage(1, 0.1)).toBe(0.1);
  });
  it('bladeDamageMul で かわる', () => {
    const r = rig();
    r.settings.bladeDamageMul.thrust = 1;
    r.yokai.add('karakasa', ...(Object.values(r.front(2)) as [number, number, number]));
    r.step({ techPressed: true });
    r.steps(5);
    expect(r.yokai.calls[0].amount).toBe(4);
  });
});

const reachOf = (r: { settings: unknown }) => (r.settings as unknown as { bladeReach: Record<string, number> }).bladeReach;

describe('突きの 形（AC5。WEAPON-4: 射程は R = 2.2）', () => {
  const run = (setup: (r: ReturnType<typeof rig>) => void) => {
    const r = rig();
    setup(r);
    r.step({ techPressed: true });
    r.steps(8);
    return r;
  };
  it('正面 3.0 は 当たる', () => {
    const r = run((r) => r.yokai.add('nurikabe', r.front(3).x, 9, r.front(3).z));
    expect(r.yokai.calls).toHaveLength(1);
  });
  it('正面 6.5・横 2.0 は 当たらず 空振り', () => {
    const r = run((r) => r.yokai.add('nurikabe', r.front(6.5).x, 9, r.front(6.5).z));
    expect(r.yokai.calls).toHaveLength(0);
    expect(r.blade.peekEvents().some((e) => e.type === 'techMiss')).toBe(true);
    const r2 = run((r) => r.yokai.add('nurikabe', r.front(3).x + 2, 9, r.front(3).z));
    expect(r2.yokai.calls).toHaveLength(0);
  });
  it('2 体 は 手前だけ', () => {
    const r = run((r) => {
      r.yokai.add('karakasa', r.front(2.6).x, 9, r.front(2.6).z);
      r.yokai.add('karakasa', r.front(2).x, 9, r.front(2).z);
    });
    expect(r.yokai.calls.map((c) => c.id)).toEqual([2]);
  });
  it('AC11: 射程 R。からかさ（半径 0.6）は 中心 2.5 で 当たり、R + 0.2 + 0.6 を こえる 3.1 では 当たらない', () => {
    const near = run((r) => r.yokai.add('karakasa', r.front(2.5).x, 9, r.front(2.5).z));
    expect(near.yokai.calls).toHaveLength(1);
    const far = run((r) => r.yokai.add('karakasa', r.front(3.1).x, 9, r.front(3.1).z));
    expect(far.yokai.calls).toHaveLength(0);
    expect(far.blade.peekEvents().some((e) => e.type === 'techMiss')).toBe(true);
  });
  it('AC11: ＋マークの 線（bladeAimReach 4.5）に 入る 4.0 先でも 当たらない（線で 当てる 近道は R まで）', () => {
    const r = run((r) => r.yokai.add('karakasa', r.front(4).x, 9, r.front(4).z));
    expect(r.yokai.calls).toHaveLength(0);
    expect(r.blade.peekEvents().some((e) => e.type === 'techMiss')).toBe(true);
    // 線は 4.5 のまま（ふりわけ用）
    expect(r.settings.bladeAimReach).toBe(4.5);
  });
  it('AC12: bladeReach.katana = 3.0 → つぎの 突きの カプセルの 長さが 3.0。ぼくとうは 2.2 のまま', () => {
    const r = rig();
    reachOf(r).katana = 3.0;
    r.step({ techPressed: true });
    r.steps(4);
    const sh = r.blade.shape() as { from: Vec3; to: Vec3 };
    expect(Math.hypot(sh.to.x - sh.from.x, sh.to.y - sh.from.y, sh.to.z - sh.from.z)).toBeCloseTo(3.0, 6);
    const b = rig('bokuto');
    reachOf(b).katana = 3.0;
    b.step({ techPressed: true });
    b.steps(4);
    const sb = b.blade.shape() as { from: Vec3; to: Vec3 };
    expect(Math.hypot(sb.to.x - sb.from.x, sb.to.y - sb.from.y, sb.to.z - sb.from.z)).toBeCloseTo(2.2, 6);
  });
  it('AC3: 表にない 刀の R は かたなの R', () => {
    const r = rig('bokuto');
    reachOf(r).katana = 3.0;
    delete reachOf(r).bokuto;
    r.step({ techPressed: true });
    r.steps(4);
    const sh = r.blade.shape() as { from: Vec3; to: Vec3 };
    expect(Math.hypot(sh.to.x - sh.from.x, sh.to.y - sh.from.y, sh.to.z - sh.from.z)).toBeCloseTo(3.0, 6);
  });
  it('§5: わざの とちゅうで bladeReach を かえても 始めた ときの R のまま', () => {
    const r = rig();
    r.step({ techPressed: true });
    reachOf(r).katana = 5;
    r.steps(4);
    const sh = r.blade.shape() as { from: Vec3; to: Vec3 };
    expect(Math.hypot(sh.to.x - sh.from.x, sh.to.y - sh.from.y, sh.to.z - sh.from.z)).toBeCloseTo(2.2, 6);
  });
  it('shape() は 持続 だけ カプセル', () => {
    const r = rig();
    r.step({ techPressed: true });
    expect(r.blade.shape()).toBeNull();
    r.steps(4);
    expect(r.blade.shape()).toMatchObject({ kind: 'capsule', radius: 0.2 });
  });
});

describe('大げさ斬り・切り上げの 形（AC6・AC7）', () => {
  const runKesa = (setup: (r: ReturnType<typeof rig>) => void, stance: 'jodan' | 'gedan' = 'jodan') => {
    const r = rig();
    r.blade.setStance(stance);
    setup(r);
    r.step({ techPressed: true });
    r.steps(42); // 切り上げの 当たり F20〜22 も ふくむ
    return r;
  };
  it('0°・60° は 当たり、120° と 4.5 は 当たらない', () => {
    const r = runKesa((r) => {
      for (const d of [0, 60, -60]) r.yokai.add('karakasa', r.front(2, d).x, 9, r.front(2, d).z);
    });
    expect(r.yokai.calls.map((c) => c.id).sort()).toEqual([1, 2, 3]);
    const q = runKesa((r) => r.yokai.add('karakasa', r.front(2, 120).x, 9, r.front(2, 120).z));
    expect(q.yokai.calls).toHaveLength(0);
    const w = runKesa((r) => r.yokai.add('karakasa', r.front(4.5).x, 9, r.front(4.5).z));
    expect(w.yokai.calls).toHaveLength(0);
  });
  it('AC12: 扇の 外がわ rMax = R。中心 2.7（半径 0.6 + R 2.2 の 内）は 当たり、3.0 は 当たらない（大けさぎり・切り上げ）', () => {
    for (const st of ['jodan', 'gedan'] as const) {
      expect(runKesa((r) => r.yokai.add('karakasa', r.front(2.7).x, 9, r.front(2.7).z), st).yokai.calls, st).toHaveLength(1);
      expect(runKesa((r) => r.yokai.add('karakasa', r.front(3.0).x, 9, r.front(3.0).z), st).yokai.calls, st).toHaveLength(0);
    }
  });
  it('AC12: bladeReach.katana = 3.0 → 扇の rMax が 3.0（大けさぎり・切り上げ）', () => {
    for (const st of ['jodan', 'gedan'] as const) {
      const r = rig();
      reachOf(r).katana = 3.0;
      r.blade.setStance(st);
      r.step({ techPressed: true });
      let seen = false;
      for (let i = 0; i < 40 && !seen; i++) {
        r.step();
        const sh = r.blade.shape();
        if (sh && sh.kind === 'fan') {
          seen = true;
          expect(sh.rMax, st).toBeCloseTo(3.0, 6);
        }
      }
      expect(seen, st).toBe(true);
    }
  });
  it('AC14: 切り上げは 高い 所まで とどく。足もと +4.9 の ちょうちんに 当たり（yMax 6.0）、大けさぎりは 当たらない', () => {
    const put = (r: ReturnType<typeof rig>) => r.yokai.add('chochin', r.front(1.5).x, 9 + 4.9, r.front(1.5).z);
    expect(runKesa(put, 'gedan').yokai.calls).toHaveLength(1);
    expect(runKesa(put, 'jodan').yokai.calls).toHaveLength(0);
    // うかぶ ちょうちん（足もと +4.0、水平 1.5 先）
    const hover = (r: ReturnType<typeof rig>) => r.yokai.add('chochin', r.front(1.5).x, 9 + 4.0, r.front(1.5).z);
    expect(runKesa(hover, 'gedan').yokai.calls).toHaveLength(1);
  });
  it('同じ 妖怪に 1 わざ 1 回、onHit も 1 回', () => {
    const r = runKesa((r) => {
      for (const d of [0, 60, -60]) r.yokai.add('karakasa', r.front(2, d).x, 9, r.front(2, d).z);
    });
    expect(r.yokai.calls).toHaveLength(3);
    expect(r.hits).toEqual([{ tech: 'kesa', count: 3 }]);
  });
  it('浮いた ちょうちん: 切り上げ は 当たる、大げさ斬り は 当たらない', () => {
    const put = (r: ReturnType<typeof rig>) => r.yokai.add('chochin', r.front(2).x, 12, r.front(2).z);
    expect(runKesa(put, 'gedan').yokai.calls).toHaveLength(1);
    expect(runKesa(put, 'jodan').yokai.calls).toHaveLength(0);
  });
  it('切り上げ: 30° は 当たり 90° は 当たらない', () => {
    expect(runKesa((r) => r.yokai.add('karakasa', r.front(2, 30).x, 9, r.front(2, 30).z), 'gedan').yokai.calls).toHaveLength(1);
    expect(runKesa((r) => r.yokai.add('karakasa', r.front(2, 90).x, 9, r.front(2, 90).z), 'gedan').yokai.calls).toHaveLength(0);
  });
});

describe('かべごし（AC8）', () => {
  it('stone の 向こうは 当たらず、とると 当たる', () => {
    const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
    for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, 8, z, 'stone');
    world.setBlock(16, 10, 15, 'stone'); // 前 0.5〜1.5・高さ +1
    const yokai = new FakeYokai();
    yokai.add('karakasa', 16.5, 9, 14.5);
    let t = 0;
    const b = createBladeSystem({ world, yokai: () => yokai, settings: createW2Settings(), weaponDamage: () => 4, onHit: () => {}, tick: () => t });
    const c = (o: Partial<BladeStepContext>): BladeStepContext => ({
      item: 'katana', techPressed: false, techHeld: false, stancePressed: false,
      eye: { x: 16.5, y: 10.62, z: 16.5 }, dir: { x: 0, y: Math.SQRT1_2, z: -Math.SQRT1_2 },
      position: { x: 16.5, y: 9, z: 16.5 }, yawDeg: 0, active: true,
      body: { x: 16.5, y: 10.4, z: 16.5 }, attackDirDeg: 0, attackTarget: null, ...o,
    } as BladeStepContext);
    b.update(c({}));
    b.setStance('jodan');
    b.update(c({ techPressed: true }));
    for (let i = 0; i < 33; i++) { t++; b.update(c({})); }
    expect(yokai.calls).toHaveLength(0);
    expect(b.peekEvents().some((e) => e.type === 'techMiss')).toBe(true);
    world.setBlock(16, 10, 15, 'air');
    for (let i = 0; i < 80; i++) b.update(c({})); // 大げさ斬りが おわるまで（106 − 34 = 72 より多く）
    b.update(c({ techPressed: true }));
    for (let i = 0; i < 42; i++) b.update(c({}));
    expect(yokai.calls).toHaveLength(1);
  });
});

describe('動き・ふみこみ（AC14・AC17）', () => {
  // 仕様書 §4.5 の「計算の確認」にある 値（ひらけた所・北向き）。WEAPON-4: 大けさぎり 3.1・切り上げ その場
  const A: Record<string, Array<[number, number]>> = {
    thrust: [[4, 0.197], [6, 0.2675], [41, 0]],
    kesa: [[28, 0.309], [29, 0.4], [33, 2.4], [34, 2.6], [36, 3.0], [37, 3.1], [106, 3.1]],
    kiriage: [[1, 0], [20, 0], [22, 0], [52, 0]],
  };
  const stanceOf = { thrust: 'chudan', kesa: 'jodan', kiriage: 'gedan' } as const;
  const lenOf = { thrust: 41, kesa: 106, kiriage: 52 } as const;
  for (const tech of ['thrust', 'kesa', 'kiriage'] as const) {
    it(`${tech}: ぜんぶの F で 歩けず ジャンプできず、ふみこみの合計が A(f)`, () => {
      const r = rig();
      r.blade.setStance(stanceOf[tech]);
      const want = new Map(A[tech]);
      r.step({ techPressed: true });
      for (let f = 1; f <= lenOf[tech]; f++) {
        if (f > 1) r.step();
        expect(r.blade.motion(), `F${f}`).toEqual({ speedMul: 0, jumpLocked: true });
        const total = r.lunges.reduce((a, l) => a - l[1], 0); // 北 = -z
        const sideways = r.lunges.reduce((a, l) => a + Math.abs(l[0]), 0);
        expect(sideways).toBeLessThan(1e-9);
        if (want.has(f)) expect(Math.abs(total - want.get(f)!), `F${f}: ${total}`).toBeLessThan(0.001);
      }
      r.step();
      expect(r.blade.motion()).toEqual({ speedMul: 1, jumpLocked: false });
    });
  }
  it('1 ステップの ふみこみ: 突き・切り上げ 0.12 以下、大けさぎり 0.5 以下（WEAPON-4）', () => {
    for (const tech of ['thrust', 'kesa', 'kiriage'] as const) {
      const r = rig();
      r.blade.setStance(stanceOf[tech]);
      r.step({ techPressed: true });
      r.steps(lenOf[tech]);
      for (const l of r.lunges) expect(Math.hypot(l[0], l[1])).toBeLessThanOrEqual(tech === 'kesa' ? 0.501 : 0.12);
    }
  });
  it('かまえ変え（switch）の あいだは 歩ける・ジャンプできる', () => {
    const r = rig();
    r.step({ stancePressed: true });
    expect(r.blade.motion()).toEqual({ speedMul: 1, jumpLocked: false });
  });
});

describe('先行入力・おしつづけ（AC11）', () => {
  const startsAt = (r: ReturnType<typeof rig>, n: number, press: (f: number) => Partial<BladeStepContext>) => {
    const starts: number[] = [];
    r.step({ techPressed: true });
    for (let f = 2; f <= n; f++) {
      const before = r.blade.peekEvents().filter((e) => e.type === 'techStart').length;
      r.step(press(f));
      if (r.blade.peekEvents().filter((e) => e.type === 'techStart').length > before) starts.push(f);
    }
    return starts;
  };
  it('F99 に 押す → F107 に 次が 始まる。F98 は 出ない', () => {
    const r = rig();
    r.blade.setStance('jodan');
    expect(startsAt(r, 115, (f) => ({ techPressed: f === 99 }))).toEqual([107]);
    const q = rig();
    q.blade.setStance('jodan');
    expect(startsAt(q, 115, (f) => ({ techPressed: f === 98 }))).toEqual([]);
  });
  it('F100 に R → F107 に かまえが かわる。R のあと primary は あとの方', () => {
    const r = rig();
    r.blade.setStance('jodan');
    r.step({ techPressed: true });
    r.steps(98);
    r.step({ stancePressed: true }); // F100
    r.steps(6);
    r.step(); // F107
    expect(r.blade.state()).toMatchObject({ stance: 'gedan', phase: 'switch', frame: 1 });
    const q = rig();
    q.blade.setStance('jodan');
    q.step({ techPressed: true });
    q.steps(98);
    q.step({ stancePressed: true }); // F100
    q.step();
    q.step({ techPressed: true }); // F102
    expect(q.blade.state().buffered).toBe('tech');
    q.steps(4);
    q.step();
    expect(q.blade.state()).toMatchObject({ stance: 'jodan', tech: 'kesa', frame: 1 });
  });
  it('おしつづけ: 突きが F1・F42・F83', () => {
    const r = rig();
    const starts = startsAt(r, 90, () => ({ techHeld: true }));
    expect(starts).toEqual([42, 83]);
  });
});

describe('持ちかえ・やられた', () => {
  it('わざの とちゅうで 持ちかえ → idle、cancel、当たりなし', () => {
    const r = rig();
    r.blade.setStance('jodan');
    r.yokai.add('karakasa', ...(Object.values(r.front(2)) as [number, number, number]));
    r.step({ techPressed: true });
    r.steps(4);
    r.setItem('stone');
    r.step();
    expect(r.blade.state().phase).toBe('idle');
    r.setItem('katana');
    r.steps(8);
    expect(r.yokai.calls).toHaveLength(0);
    expect(r.blade.peekEvents().some((e) => e.type === 'cancel')).toBe(true);
    expect(r.blade.state().stance).toBe('chudan');
  });
  it('active=false は わざを 始めない', () => {
    const r = rig();
    r.step({ techPressed: true, active: false });
    expect(r.blade.state().phase).toBe('idle');
  });
});
