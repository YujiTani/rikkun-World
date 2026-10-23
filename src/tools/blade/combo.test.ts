import { describe, expect, it } from 'vitest';
import type { BladeEvent, BladeStance, BladeStepContext, ItemId, Vec3, YokaiInfo, YokaiKnock, YokaiWorld } from '../../contracts';
import { W2_SETTING_DEFAULTS, createW2Settings } from '../../contracts';
import { TECH_CURVES, TECH_PHASES } from '../../char/techCurves';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { createBladeSystem } from './BladeSystem';
import { techAdvance, techCell } from './advance';

/** WEAPON-6 §6 ユニット層（AC1〜AC9）。刀の しくみだけを 1 ステップずつ 動かして 確かめる */

class FakeYokai implements YokaiWorld {
  items: YokaiInfo[] = [];
  add(x: number, y: number, z: number): void {
    this.items.push({ id: this.items.length + 1, kind: 'nurikabe', position: { x, y, z }, yawDeg: 0, hp: 99, maxHp: 99, state: 'idle', attackTick: 0, scale: 1, name: 'テスト', title: 'none', m: 1, attack: 2 });
  }
  list = () => this.items;
  raycast = () => null;
  damage(_id: number, _amount: number, _from: Vec3, _knock?: YokaiKnock) {}
  occupies = () => false;
  drainEvents = () => [];
}

const P = { x: 16.5, y: 9, z: 16.5 };

function rig(item: ItemId = 'crystal_katana', stance: BladeStance = 'chudan') {
  const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, 8, z, 'stone');
  const yokai = new FakeYokai();
  const settings = createW2Settings();
  let tick = 0;
  const dmg: Record<string, number> = { bokuto: 2, katana: 4, crystal_katana: 4 };
  const pos = { ...P };
  const blade = createBladeSystem({
    world,
    yokai: () => yokai,
    settings,
    weaponDamage: (i) => dmg[i] ?? 1,
    onHit: () => {},
    lunge: (dx, dz) => {
      pos.x += dx;
      pos.z += dz;
      return { x: dx, z: dz };
    },
    tick: () => tick,
  });
  const ctx = (o: Partial<BladeStepContext>): BladeStepContext =>
    ({
      item,
      techPressed: false,
      techHeld: false,
      stancePressed: false,
      eye: { x: pos.x, y: pos.y + 1.62, z: pos.z },
      dir: { x: 0, y: 0, z: -1 },
      position: pos,
      yawDeg: 0,
      active: true,
      body: { x: pos.x, y: pos.y + 1.4, z: pos.z },
      attackDirDeg: 0,
      attackTarget: null,
      ...o,
    }) as BladeStepContext;
  const step = (o: Partial<BladeStepContext> = {}) => {
    tick++;
    blade.update(ctx(o));
  };
  step();
  blade.setStance(stance);
  const events: BladeEvent[] = [];
  const log = () => {
    events.push(...blade.drainEvents());
  };
  /** n ステップ。press(i) が true の i 番目（0 はじまり）に 押す。i = 0 が わざの F1 */
  const run = (n: number, press: (i: number) => boolean, extra?: (i: number) => Partial<BladeStepContext>) => {
    const frames: Array<{ f: number; tech: string | null; step: number | null }> = [];
    for (let i = 0; i < n; i++) {
      step({ techPressed: press(i), ...(extra ? extra(i) : {}) });
      log();
      const st = blade.state();
      frames.push({ f: st.frame, tech: st.tech, step: st.combo ? st.combo.step : null });
    }
    return frames;
  };
  const starts = () => events.filter((e) => e.type === 'techStart').map((e) => e as Extract<BladeEvent, { type: 'techStart' }>);
  return { blade, settings, step, run, events, starts, pos, yokai, log };
}

const startOffsets = (r: ReturnType<typeof rig>) => {
  const s = r.starts();
  return s.map((e) => [e.tick - s[0]!.tick, e.step, e.tech]);
};

describe('AC1 設定の 初期値', () => {
  it('bladeCombo が §4.7 の 表どおり・step2Advance の ticks は 絵と 同じ', () => {
    const c = createW2Settings().bladeCombo;
    expect(c.items).toEqual(['crystal_katana', 'raijin_ken', 'fujin_ken', 'niji']); // WEAPON-9 で 虹も 3 段攻撃(§5.5)
    expect(c.order).toEqual({ chudan: ['thrust', 'kiriage', 'kesa'], gedan: ['kiriage', 'thrust', 'kesa'], jodan: ['kesa'] });
    expect(c.stepStartup).toEqual({ thrust: 4, kiriage: 12, kesa: 20 });
    expect(c.follow).toEqual({ thrust: 14, kiriage: 12, kesa: 12 });
    expect(c.step2Advance.kiriage!.ticks).toEqual(TECH_CURVES.kiriage.ticks);
    expect(c.step2Advance.thrust!.ticks).toEqual(TECH_CURVES.thrust.ticks);
    expect(c.step2Advance.kiriage!.step).toBe(1.4);
    expect(W2_SETTING_DEFAULTS.toolDurability.crystal_katana).toBe(400);
  });
});

describe('AC2・AC3 段の 長さと 窓', () => {
  it('中段: 2 段目 きりあげ 12/3/30・3 段目 おおげさぎり 20/6/72', () => {
    const r = rig();
    r.run(1, () => true);
    expect(r.blade.state().lengths).toEqual({ startup: 4, active: 2, recovery: 35 });
    r.run(25, () => true); // F21 に 2 段目
    expect(r.blade.state().combo!.step).toBe(2);
    expect(r.blade.state().lengths).toEqual({ startup: 12, active: 3, recovery: 30 });
    r.run(30, () => true);
    expect(r.blade.state().combo!.step).toBe(3);
    expect(r.blade.state().lengths).toEqual({ startup: 20, active: 6, recovery: 72 });
  });
  it('下段の 2 段目 つき = 4/2/35。bladeTech を かえると 当たり・もどりは それに したがう', () => {
    const r = rig('crystal_katana', 'gedan');
    r.settings.bladeTech.thrust = { startup: 4, active: 3, recovery: 20 };
    r.run(40, () => true);
    const st = r.blade.state();
    expect(st.combo!.step).toBe(2);
    expect(st.tech).toBe('thrust');
    expect(st.lengths).toEqual({ startup: 4, active: 3, recovery: 20 });
    r.settings.bladeCombo.stepStartup.thrust = 6;
  });
  it('C と 窓: つき 21・F5〜41、きりあげ(1) 35・F20〜52、きりあげ(2) 28・F13〜45、3 段目は 窓なし', () => {
    const r = rig();
    r.run(1, () => false, () => ({ techPressed: true }));
    const at = (f: number) => {
      while (r.blade.state().frame < f) r.run(1, () => false);
      return r.blade.state().combo!;
    };
    expect(at(4)).toMatchObject({ step: 1, open: false, cancelAt: 21 });
    expect(at(5).open).toBe(true);
    expect(at(41).open).toBe(true);
    // きりあげ 1 段目
    const g = rig('crystal_katana', 'gedan');
    g.run(1, () => true);
    while (g.blade.state().frame < 19) g.run(1, () => false);
    expect(g.blade.state().combo).toMatchObject({ open: false, cancelAt: 35 });
    g.run(1, () => false);
    expect(g.blade.state().combo!.open).toBe(true);
    while (g.blade.state().frame < 52) g.run(1, () => false);
    expect(g.blade.state().combo!.open).toBe(true);
    // 3 段目
    const m = rig();
    m.run(160, () => true);
    // 3 段目の どの F でも open false
    const r3 = rig();
    r3.run(47, () => true);
    for (let i = 0; i < 90; i++) {
      r3.run(1, () => false);
      const c = r3.blade.state().combo;
      if (c && c.step === 3) expect(c.open).toBe(false);
    }
  });
  it('follow を かえると C が かわる', () => {
    const r = rig();
    r.settings.bladeCombo.follow.thrust = 10;
    r.run(1, () => true);
    expect(r.blade.state().combo!.cancelAt).toBe(17);
  });
});

describe('AC4 始まる 時', () => {
  const pressAt = (f: number) => {
    const r = rig();
    // f 番目の ステップ（F = f）に 押す
    r.run(f + 60, (i) => i === 0 || i === f - 1);
    return r;
  };
  it('F4 に 押す → つながらない（F42 に 何も出ない）', () => {
    const r = rig();
    r.run(60, (i) => i === 0 || i === 3);
    expect(r.starts().map((e) => e.step)).toEqual([1, 1].slice(0, 1));
    expect(r.blade.state().tech).toBeNull();
  });
  it('F5 → F21、F30 → F31、F41 → 次の ステップ', () => {
    const a = pressAt(5);
    expect(a.starts()[1]!.tick - a.starts()[0]!.tick).toBe(20);
    expect(a.starts()[1]!.step).toBe(2);
    const b = pressAt(30);
    expect(b.starts()[1]!.tick - b.starts()[0]!.tick).toBe(30);
    const c = pressAt(41);
    expect(c.starts()[1]!.tick - c.starts()[0]!.tick).toBe(41);
    expect(c.starts()[1]!.step).toBe(2);
  });
  it('窓の 中で 何回 おしても 1 回分', () => {
    const r = rig();
    r.run(90, (i) => i < 50 || i > 51 ? true : true);
    expect(r.starts().slice(0, 3).map((e) => e.step)).toEqual([1, 2, 3]);
  });
});

describe('AC5 順', () => {
  it('中段・下段・上段', () => {
    const m = rig('crystal_katana', 'chudan');
    m.run(110, () => true);
    expect(startOffsets(m).slice(0, 3)).toEqual([[0, 1, 'thrust'], [20, 2, 'kiriage'], [47, 3, 'kesa']]);
    const g = rig('crystal_katana', 'gedan');
    g.run(110, () => true);
    expect(startOffsets(g).slice(0, 3)).toEqual([[0, 1, 'kiriage'], [34, 2, 'thrust'], [54, 3, 'kesa']]);
    const j = rig('crystal_katana', 'jodan');
    j.run(60, (i) => i === 0 || i === 40);
    expect(j.starts().map((e) => e.step)).toEqual([1]);
    expect(j.blade.state().tech).toBe('kesa');
    expect(j.blade.state().combo).toEqual({ step: 1, queued: false, open: false, cancelAt: null });
  });
  it('3 段目の さいご 8F に 押す → 次は step 1。通しは 145 ステップ', () => {
    const m = rig();
    m.run(160, () => true);
    expect(startOffsets(m)).toEqual([[0, 1, 'thrust'], [20, 2, 'kiriage'], [47, 3, 'kesa'], [145, 1, 'thrust']]);
    const g = rig('crystal_katana', 'gedan');
    g.run(165, () => true);
    expect(startOffsets(g)[3]).toEqual([152, 1, 'kiriage']);
  });
  it('ほかの 刀は つながらない・combo は null', () => {
    const r = rig('katana');
    const fr = r.run(100, () => true);
    expect(r.starts().map((e) => e.step)).toEqual([1, 1, 1]);
    expect(fr.every((x) => x.step === null)).toBe(true);
    expect(r.blade.state().combo).toBeNull();
  });
  it('おしつづけ（techHeld だけ）では つながらない', () => {
    const r = rig();
    r.run(1, () => true);
    r.run(120, () => false, () => ({ techHeld: true }));
    expect(startOffsets(r)).toEqual([[0, 1, 'thrust'], [41, 1, 'thrust'], [82, 1, 'thrust']]);
  });
});

describe('AC6 絵の コマ', () => {
  it('きりあげ 2 段目 F13〜15 = 1 段目 F20〜22、おおげさぎり 3 段目 F21〜26 = F29〜34、F27〜98 = F35〜106', () => {
    const P6 = TECH_PHASES;
    const K = TECH_CURVES;
    const base = W2_SETTING_DEFAULTS.bladeTech;
    const k2 = { startup: 12, active: 3, recovery: 30 };
    const s3 = { startup: 20, active: 6, recovery: 72 };
    for (let i = 0; i < 3; i++) expect(techCell(K.kiriage, P6.kiriage, k2, 13 + i)).toBe(techCell(K.kiriage, P6.kiriage, base.kiriage, 20 + i));
    for (let i = 0; i < 6; i++) expect(techCell(K.kesa, P6.kesa, s3, 21 + i)).toBe(techCell(K.kesa, P6.kesa, base.kesa, 29 + i));
    for (let f = 27; f <= 98; f++) expect(techCell(K.kesa, P6.kesa, s3, f), `F${f}`).toBe(techCell(K.kesa, P6.kesa, base.kesa, f + 8));
  });
});

describe('AC7 ふみこみ', () => {
  const S = W2_SETTING_DEFAULTS;
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.001;
  it('3 段目 おおげさぎり', () => {
    const s3 = { startup: 20, active: 6, recovery: 72 };
    const A = (f: number) => techAdvance(S.bladeAdvance.kesa, TECH_PHASES.kesa, s3, f);
    expect(near(A(20), 0.309)).toBe(true);
    expect(near(A(21), 0.4)).toBe(true);
    expect(near(A(26), 2.6)).toBe(true);
    expect(near(A(29), 3.1)).toBe(true);
    expect(near(A(98), 3.1)).toBe(true);
  });
  it('2 段目 きりあげ・つき', () => {
    const c = S.bladeCombo.step2Advance;
    const k2 = { startup: 12, active: 3, recovery: 30 };
    const Ak = (f: number) => techAdvance(c.kiriage!, TECH_PHASES.kiriage, k2, f);
    expect(near(Ak(6), 0)).toBe(true);
    expect(near(Ak(9), 0.094)).toBe(true);
    expect(near(Ak(12), 0.85)).toBe(true);
    expect(near(Ak(13), 1.133)).toBe(true);
    expect(near(Ak(14), 1.4)).toBe(true);
    expect(near(Ak(45), 1.4)).toBe(true);
    const t2 = S.bladeTech.thrust;
    const At = (f: number) => techAdvance(c.thrust!, TECH_PHASES.thrust, t2, f);
    expect(near(At(2), 0.25)).toBe(true);
    expect(near(At(4), 0.9)).toBe(true);
    expect(near(At(5), 1.25)).toBe(true);
    expect(near(At(6), 1.4)).toBe(true);
    expect(near(At(41), 1.4)).toBe(true);
    let prev = 0;
    for (let f = 1; f <= 45; f++) {
      const a = Ak(f);
      expect(a - prev).toBeLessThanOrEqual(0.46);
      prev = a;
    }
  });
  it('1 段目の きりあげは どの F も 0', () => {
    const r = rig('crystal_katana', 'gedan');
    const moved: number[] = [];
    for (let i = 0; i < 52; i++) {
      r.run(1, () => i === 0);
      moved.push(r.blade.state().move?.target ?? 0);
    }
    expect(Math.max(...moved)).toBe(0);
  });
  it('実際に 動く: 2 段目 きりあげは F14 で 1.4・3 段目は 3.1', () => {
    const r = rig();
    r.run(21, () => true); // F1 of step 2 at i = 20
    const z0 = r.pos.z;
    r.run(13, () => true);
    expect(Math.abs(z0 - r.pos.z - 1.4)).toBeLessThanOrEqual(0.01);
    r.run(40, () => true);
    r.run(34, () => true);
    expect(r.blade.state().combo!.step).toBe(3);
  });
});

describe('AC9 ダメージ', () => {
  it('段に かかわらず 刀の 強さ × 倍率（3・4.6・10）', () => {
    const r = rig();
    r.yokai.add(P.x, 9, P.z - 1.5);
    const calls: number[] = [];
    (r.yokai as FakeYokai).damage = (_id, amount) => {
      calls.push(amount);
    };
    // 当たりが 毎段 出るように 妖怪を 動かさない
    r.run(160, () => true);
    expect(calls.slice(0, 3)).toEqual([3, 4.6, 10]);
  });
});

describe('AC12 前後 イベント', () => {
  it('techStart・techHit に step が 入る', () => {
    const r = rig();
    r.yokai.add(P.x, 9, P.z - 1.5);
    r.run(100, () => true);
    const hits = r.events.filter((e) => e.type === 'techHit') as Array<Extract<BladeEvent, { type: 'techHit' }>>;
    expect(hits.map((h) => h.step)).toEqual([1, 2, 3]);
  });
});

describe('パリィと つなぎ（busyNext・yieldToParry）', () => {
  it('窓の 中で パリィを 押した ステップは busy・C か 次の ステップで busy でなくなる', () => {
    const r = rig();
    r.run(10, (i) => i === 0); // F10
    expect(r.blade.state().frame).toBe(10);
    expect(r.blade.busyNext!(true)).toEqual({ busy: true, accepts: true });
    r.run(10, () => false); // F20
    expect(r.blade.busyNext!(false)).toEqual({ busy: false, accepts: true }); // F21 = C
    r.blade.yieldToParry!();
    expect(r.blade.state().tech).toBeNull();
    expect(r.blade.state().combo).toBeNull();
  });
  it('3 段目の 窓は ない（さいご 8F だけ）', () => {
    const r = rig();
    r.run(60, () => true);
    expect(r.blade.state().combo!.step).toBe(3);
    expect(r.blade.busyNext!(true).accepts).toBe(false);
  });
  it('dropBuffer は おぼえた つなぎも すてる', () => {
    const r = rig();
    r.run(10, (i) => i === 0 || i === 6);
    expect(r.blade.state().combo!.queued).toBe(true);
    r.blade.dropBuffer!();
    expect(r.blade.state().combo!.queued).toBe(false);
    r.run(40, () => false);
    expect(r.starts()).toHaveLength(1);
  });
});

describe('nextStart（向きの 補助用）', () => {
  it('つなげる とき 次の 段の わざ・段', () => {
    const r = rig();
    expect(r.blade.nextStart!()).toEqual({ tech: 'thrust', step: 1 });
    r.run(10, (i) => i === 0);
    expect(r.blade.nextStart!()).toEqual({ tech: 'kiriage', step: 2 });
    // 出だし中（窓の外）に 押しても つながらない → 次の 始まりは 1 段目
    const e = rig();
    e.run(3, (i) => i === 0);
    expect(e.blade.nextStart!()).toEqual({ tech: 'thrust', step: 1 });
    e.run(2, () => false); // F5 = 窓の中
    expect(e.blade.nextStart!()).toEqual({ tech: 'kiriage', step: 2 });
    const k = rig('katana');
    expect(k.blade.nextStart!()).toEqual({ tech: 'thrust', step: 1 });
  });
});
