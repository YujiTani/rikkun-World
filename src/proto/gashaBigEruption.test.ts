import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { AshRain, Embers, Eruption, burnPlants, type V3 } from './gashaBigEruption';

const DT = 1 / 60;
const MOUTH: V3 = { x: 100, y: 170, z: 40 };
const flat = () => ({ y: 152, body: false });

describe('噴火: タイムライン（#293）', () => {
  it('調整表の 数', () => {
    const K = T.eruption;
    expect(K.inhaleSec).toBeGreaterThan(1);
    expect(K.eruptSec).toBeGreaterThan(1);
    expect(K.ash.count).toBeGreaterThan(30);
    expect(K.ash.rMax).toBeGreaterThan(K.ash.rMin);
    expect(K.ember.sec).toBeGreaterThan(5);
    expect(K.plants).toContain('leaves');
    expect(T.attack.table.map((t) => t.name)).toContain('eruption');
  });
  it('吸いこみ → 噴火 → 降る → 終わり。首は ゆっくり 上がって 噴火の 間は 1、そのあと もどる', () => {
    const e = new Eruption();
    e.start();
    const K = T.eruption;
    const phases: string[] = []; let startT = -1, endT = -1, t = 0, maxCol = 0, midPitch = -1;
    for (let i = 0; i < Math.ceil((K.inhaleSec + K.eruptSec + K.rainSec + 1) / DT) && !e.done; i++) {
      const ev = e.update(DT); t += DT;
      if (!phases.length || phases[phases.length - 1] !== e.phase) phases.push(e.phase);
      if (ev.eruptStart) startT = t;
      if (ev.eruptEnd) endT = t;
      maxCol = Math.max(maxCol, e.column);
      if (midPitch < 0 && t >= K.inhaleSec / 2) midPitch = e.pitch;
      if (e.phase === 'inhale') expect(e.column).toBe(0);
    }
    expect(phases).toEqual(['inhale', 'erupt', 'rain', 'done']);
    expect(startT).toBeCloseTo(K.inhaleSec, 1);
    expect(endT - startT).toBeCloseTo(K.eruptSec, 1);
    expect(maxCol).toBe(1);
    expect(midPitch).toBeGreaterThan(0.3); expect(midPitch).toBeLessThan(0.7);
    expect(e.pitch).toBe(0);
  });
  it('風は 吸いこみの 間だけ 強まる', () => {
    const e = new Eruption(); e.start();
    for (let i = 0; i < 100; i++) e.update(DT);
    const w1 = e.wind;
    for (let i = 0; i < 60; i++) e.update(DT);
    expect(e.wind).toBeGreaterThan(w1);
    for (let i = 0; i < Math.ceil(T.eruption.inhaleSec / DT); i++) e.update(DT);
    expect(e.wind).toBe(0);
  });
});

describe('噴火: 灰（放射状・ランダム・毎回ちがう）', () => {
  const run = (ordinal: number, landAt: (x: number, z: number) => { y: number; body: boolean } = flat) => {
    const r = new AshRain();
    r.begin(ordinal);
    const land: { x: number; z: number; t: number }[] = []; let t = 0, launched = 0;
    for (let i = 0; i < 60 * 12; i++) {
      t += DT;
      const o = r.update(DT, MOUTH, landAt);
      launched += o.launched.length;
      for (const a of o.landed) land.push({ x: a.lx, z: a.lz, t });
    }
    return { r, land, launched };
  };
  it('数だけ とばして、ぜんぶ 着地する。口から rMin〜rMax の 水平きょり', () => {
    const { r, land, launched } = run(0);
    expect(launched).toBe(T.eruption.ash.count);
    expect(land.length).toBe(T.eruption.ash.count);
    expect(r.active).toBe(false);
    for (const l of land) {
      const d = Math.hypot(l.x - MOUTH.x, l.z - MOUTH.z);
      expect(d).toBeGreaterThanOrEqual(T.eruption.ash.rMin - 1e-6);
      expect(d).toBeLessThanOrEqual(T.eruption.ash.rMax + 1e-6);
    }
  });
  it('一部（nearShare）は 口の 近く（nearMax いない）に 落ちる。のこりは 遠くまで', () => {
    const { land } = run(0);
    const near = land.filter((l) => Math.hypot(l.x - MOUTH.x, l.z - MOUTH.z) <= T.eruption.ash.nearMax).length;
    expect(near / land.length).toBeGreaterThan(T.eruption.ash.nearShare * 0.7);
    expect(near / land.length).toBeLessThan(0.7);
    expect(land.some((l) => Math.hypot(l.x - MOUTH.x, l.z - MOUTH.z) > T.eruption.ash.rMax * 0.8)).toBe(true);
  });
  it('放射状: 四方に ばらける（どの 象限にも 落ちる）', () => {
    const { land } = run(0);
    const q = [0, 0, 0, 0];
    for (const l of land) q[(l.x >= MOUTH.x ? 1 : 0) + (l.z >= MOUTH.z ? 2 : 0)]!++;
    for (const n of q) expect(n).toBeGreaterThan(5);
  });
  it('噴火の 回数が ちがえば 並びも ちがう。同じ 回数なら 同じ（テストで 再現できる）', () => {
    const a = run(0).land.map((l) => l.x.toFixed(3) + ',' + l.z.toFixed(3)).join(';');
    const b = run(1).land.map((l) => l.x.toFixed(3) + ',' + l.z.toFixed(3)).join(';');
    const c = run(0).land.map((l) => l.x.toFixed(3) + ',' + l.z.toFixed(3)).join(';');
    expect(a).not.toBe(b);
    expect(a).toBe(c);
  });
  it('弾道: 口から 出て、山なりに 上がって、着地点に つく。予告の 影は 着地の warnSec 前から', () => {
    const r = new AshRain(); r.begin(3);
    const o = r.update(DT, MOUTH, flat);
    const a = r.ashes[0] ?? o.launched[0]!;
    const p = { x: 0, y: 0, z: 0 };
    r.position(a, p);
    expect(Math.hypot(p.x - MOUTH.x, p.z - MOUTH.z)).toBeLessThan(2);
    a.t = a.flight / 2; r.position(a, p);
    expect(p.y).toBeGreaterThan(MOUTH.y);
    a.t = a.flight - T.eruption.ash.warnSec - 0.01; expect(r.warn(a)).toBe(0);
    a.t = a.flight - T.eruption.ash.warnSec / 2; expect(r.warn(a)).toBeCloseTo(0.5, 1);
    a.t = a.flight - 0.001; r.position(a, p);
    expect(p.x).toBeCloseTo(a.lx, 1); expect(p.y).toBeCloseTo(a.ly, 0);
  });
  it('着地点が 体の 上なら body の 印が つく', () => {
    const { r } = run(0, (x) => ({ y: 160, body: x > MOUTH.x }));
    expect(r.landedCount).toBe(T.eruption.ash.count);
    const r2 = new AshRain(); r2.begin(0);
    let bodies = 0, total = 0;
    for (let i = 0; i < 60 * 3; i++) { const o = r2.update(DT, MOUTH, (x) => ({ y: 160, body: x > MOUTH.x })); for (const a of o.launched) { total++; if (a.body) bodies++; } }
    expect(bodies).toBeGreaterThan(0); expect(bodies).toBeLessThan(total);
  });
});

describe('噴火: 燃え残り', () => {
  it('ember.sec の あいだ のこって 消える。上限を こえると 古い 順に 消える', () => {
    const e = new Embers();
    e.add(0, 0, 0, false);
    for (let i = 0; i < Math.round((T.eruption.ember.sec - 1) / DT); i++) e.update(DT);
    expect(e.list.length).toBe(1);
    for (let i = 0; i < Math.round(2 / DT); i++) e.update(DT);
    expect(e.list.length).toBe(0);
    for (let i = 0; i < T.eruption.ember.max + 10; i++) e.add(i, 0, 0, false);
    expect(e.list.length).toBe(T.eruption.ember.max);
    expect(e.list[0]!.x).toBe(10);
  });
  it('触れて いる 間 dotEverySec ごとに ダメージ。はなれれば 受けない', () => {
    const e = new Embers(); e.add(0, 0, 0, false);
    let dmg = 0, hits = 0;
    for (let i = 0; i < 60 * 3; i++) { const d = e.step(DT, { x: 0.5, y: 0, z: 0 }); dmg += d; if (d > 0) hits++; }
    expect(hits).toBeGreaterThanOrEqual(Math.floor(3 / T.eruption.ember.dotEverySec));
    expect(hits).toBeLessThanOrEqual(Math.ceil(3 / T.eruption.ember.dotEverySec) + 1);
    expect(dmg).toBe(hits * T.eruption.ember.dotDamage);
    expect(e.step(DT, { x: 5, y: 0, z: 0 })).toBe(0);
    expect(e.step(DT, { x: 0, y: 5, z: 0 })).toBe(0);
  });
});

describe('噴火: 植物は 燃える', () => {
  it('灰が 落ちた 点の まわりの 植物だけ 空気に なる。土・石は のこる。範囲の 外も のこる', () => {
    const cells = new Map<string, string>();
    const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
    for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) { cells.set(k(x, 0, z), 'grass'); cells.set(k(x, 1, z), 'kusa'); }
    cells.set(k(5, 1, 5), 'stone');
    cells.set(k(5, 2, 5), 'leaves');
    cells.set(k(6, 1, 5), 'flower_y');
    const blockAt = (x: number, y: number, z: number) => cells.get(k(x, y, z)) ?? 'air';
    const setAir = (x: number, y: number, z: number) => { cells.set(k(x, y, z), 'air'); return true; };
    const burnt = burnPlants(5.5, 1.5, 5.5, blockAt, setAir);
    expect(burnt.length).toBeGreaterThan(5);
    expect(burnt.length).toBeLessThanOrEqual(T.eruption.burnMax);
    expect(blockAt(5, 1, 5)).toBe('stone');
    expect(blockAt(5, 2, 5)).toBe('air');
    expect(blockAt(6, 1, 5)).toBe('air');
    expect(blockAt(5, 0, 5)).toBe('grass');
    expect(blockAt(11, 1, 11)).toBe('kusa');
  });
});
