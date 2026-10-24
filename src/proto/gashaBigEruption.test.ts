import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { Embers, Eruption, MeteorRain, burnPlants, craterCells, inBlast, type V3 } from './gashaBigEruption';

const DT = 1 / 60;
const MOUTH: V3 = { x: 100, y: 170, z: 40 };
const flat = () => ({ y: 152, body: false });

describe('噴火: タイムライン（#293）', () => {
  it('調整表の 数', () => {
    const K = T.eruption;
    expect(K.inhaleSec).toBeGreaterThan(1);
    expect(K.eruptSec).toBeGreaterThan(1);
    expect(K.meteor.count).toBeGreaterThan(30);
    expect(K.meteor.rMax).toBeGreaterThan(K.meteor.rMin);
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

describe('噴火: 隕石（放射状・ランダム・毎回ちがう）', () => {
  const run = (ordinal: number, landAt: (x: number, z: number) => { y: number; body: boolean } = flat, aim: V3 | null = null) => {
    const r = new MeteorRain();
    r.begin(ordinal);
    const land: { x: number; z: number; t: number; aimed: boolean }[] = [], sparks: { x: number; z: number; sx: number; sz: number }[] = [];
    let t = 0, launched = 0, maxLaunch = 0, maxFly = 0;
    for (let i = 0; i < 60 * 14; i++) {
      t += DT;
      const o = r.update(DT, MOUTH, landAt, aim);
      launched += o.launched.length; maxLaunch = Math.max(maxLaunch, o.launched.length); maxFly = Math.max(maxFly, r.meteors.length);
      for (const a of o.landed) land.push({ x: a.lx, z: a.lz, t, aimed: a.aimed });
      for (const s of o.sparkLanded) sparks.push({ x: s.lx, z: s.lz, sx: s.sx, sz: s.sz });
    }
    return { r, land, sparks, launched, maxLaunch, maxFly };
  };
  it('調整表の 数: 無数に 降る（120 個 いじょう）・落下範囲 3 ブロック いじょう・ダメージ 3', () => {
    const K = T.eruption.meteor;
    expect(K.count).toBeGreaterThanOrEqual(120);
    expect(K.radius).toBeGreaterThanOrEqual(3);
    expect(K.damage).toBe(3);
    expect(T.eruption.splash.min).toBeGreaterThanOrEqual(5);
    expect(T.eruption.splash.max).toBeLessThanOrEqual(8);
  });
  it('数だけ とばして、ぜんぶ 着地する。口から rMin〜rMax の 水平きょり。同時に とぶ 数・1 コマで とばす 数は 上限 いない', () => {
    const { r, land, launched, maxLaunch, maxFly } = run(0);
    const K = T.eruption.meteor;
    expect(launched).toBe(K.count);
    expect(land.length).toBe(K.count);
    expect(r.impacts.length).toBe(K.count);
    expect(r.active).toBe(false);
    expect(maxLaunch).toBeLessThanOrEqual(K.maxLaunchPerFrame);
    expect(maxFly).toBeLessThanOrEqual(K.maxFlying);
    for (const l of land) {
      const d = Math.hypot(l.x - MOUTH.x, l.z - MOUTH.z);
      expect(d).toBeGreaterThanOrEqual(K.rMin - 1e-6);
      expect(d).toBeLessThanOrEqual(K.rMax + 1e-6);
    }
  });
  it('spawnSec の うちに ぜんぶ とび立つ（火柱が 立って いる 間）', () => {
    const r = new MeteorRain(); r.begin(0);
    let t = 0;
    while (r.spawned < T.eruption.meteor.count && t < 10) { r.update(DT, MOUTH, flat); t += DT; }
    expect(t).toBeLessThanOrEqual(T.eruption.meteor.spawnSec + 0.1);
    expect(T.eruption.meteor.spawnSec).toBeLessThan(T.eruption.eruptSec);
  });
  it('一部（nearShare）は 口の 近く（nearMax いない）に 落ちる。のこりは 遠くまで', () => {
    const { land } = run(0);
    const near = land.filter((l) => Math.hypot(l.x - MOUTH.x, l.z - MOUTH.z) <= T.eruption.meteor.nearMax).length;
    expect(near / land.length).toBeGreaterThan(T.eruption.meteor.nearShare * 0.7);
    expect(near / land.length).toBeLessThan(0.7);
    expect(land.some((l) => Math.hypot(l.x - MOUTH.x, l.z - MOUTH.z) > T.eruption.meteor.rMax * 0.8)).toBe(true);
  });
  it('放射状: 四方に ばらける（どの 象限にも 落ちる）', () => {
    const { land } = run(0);
    const q = [0, 0, 0, 0];
    for (const l of land) q[(l.x >= MOUTH.x ? 1 : 0) + (l.z >= MOUTH.z ? 2 : 0)]!++;
    for (const n of q) expect(n).toBeGreaterThan(10);
  });
  it('ねらい: プレイヤーが 近いと 約 aimShare の 隕石が プレイヤーの aimSpread いないに 落ちる。遠すぎると ねらわない', () => {
    const K = T.eruption.meteor;
    const P: V3 = { x: MOUTH.x + 30, y: 152, z: MOUTH.z - 10 };
    const { land } = run(2, flat, P);
    const aimed = land.filter((l) => l.aimed);
    expect(aimed.length / land.length).toBeGreaterThan(K.aimShare * 0.6);
    expect(aimed.length / land.length).toBeLessThan(K.aimShare * 1.6);
    for (const l of aimed) expect(Math.hypot(l.x - P.x, l.z - P.z)).toBeLessThanOrEqual(K.aimSpread + 1e-6);
    const far = run(2, flat, { x: MOUTH.x + K.aimMaxDist + 20, y: 152, z: MOUTH.z });
    expect(far.land.filter((l) => l.aimed).length).toBe(0);
    const none = run(2, flat, null);
    expect(none.land.filter((l) => l.aimed).length).toBe(0);
  });
  it('少女への 切りかえの 噴火（finale）: ねらわず、プレイヤーの まわり finaleSafe には 隕石が 落ちない（火の 粉・燃えかすも とどかない）', () => {
    const K = T.eruption.meteor, S = T.eruption.splash;
    expect(K.finaleSafe).toBeGreaterThan(K.radius + 0.5);
    expect(K.finaleSafe - S.rMax).toBeGreaterThan(T.eruption.ember.radius + 0.5);
    const P: V3 = { x: MOUTH.x + 20, y: 152, z: MOUTH.z + 5 };
    for (const ord of [0, 1, 2, 3]) {
      const r = new MeteorRain(); r.begin(ord, true);
      let n = 0, sparkMin = Infinity;
      for (let i = 0; i < 60 * 14; i++) {
        const o = r.update(DT, MOUTH, flat, P);
        for (const m of o.landed) { n++; expect(m.aimed).toBe(false); expect(Math.hypot(m.lx - P.x, m.lz - P.z)).toBeGreaterThan(K.finaleSafe); }
        for (const s of o.sparkLanded) sparkMin = Math.min(sparkMin, Math.hypot(s.lx - P.x, s.lz - P.z));
      }
      expect(n).toBe(K.count);
      expect(sparkMin).toBeGreaterThan(T.eruption.ember.radius + 0.5);
    }
  });
  it('噴火の 回数が ちがえば 並びも ちがう。同じ 回数なら 同じ（テストで 再現できる）。火の 粉も おなじ', () => {
    const key = (o: ReturnType<typeof run>) => o.land.map((l) => l.x.toFixed(3) + ',' + l.z.toFixed(3)).join(';') + '|' + o.sparks.map((l) => l.x.toFixed(3) + ',' + l.z.toFixed(3)).join(';');
    const a = key(run(0)), b = key(run(1)), c = key(run(0));
    expect(a).not.toBe(b);
    expect(a).toBe(c);
  });
  it('弾道: 口から 出て、山なりに 上がって、着地点に つく。予告の 輪は 着地の warnSec 前から', () => {
    const r = new MeteorRain(); r.begin(3);
    const o = r.update(DT, MOUTH, flat);
    const a = r.meteors[0] ?? o.launched[0]!;
    const p = { x: 0, y: 0, z: 0 };
    r.position(a, p);
    expect(Math.hypot(p.x - MOUTH.x, p.z - MOUTH.z)).toBeLessThan(2);
    a.t = a.flight / 2; r.position(a, p);
    expect(p.y).toBeGreaterThan(MOUTH.y);
    a.t = a.flight - T.eruption.meteor.warnSec - 0.01; expect(r.warn(a)).toBe(0);
    a.t = a.flight - T.eruption.meteor.warnSec / 2; expect(r.warn(a)).toBeCloseTo(0.5, 1);
    a.t = a.flight - 0.001; r.position(a, p);
    expect(p.x).toBeCloseTo(a.lx, 1); expect(p.y).toBeCloseTo(a.ly, 0);
  });
  it('着地点が 体の 上なら body の 印が つく（肩・頭にも 降る）', () => {
    const r2 = new MeteorRain(); r2.begin(0);
    let bodies = 0, total = 0;
    for (let i = 0; i < 60 * 3; i++) { const o = r2.update(DT, MOUTH, (x) => ({ y: 160, body: x > MOUTH.x })); for (const a of o.launched) { total++; if (a.body) bodies++; } }
    expect(bodies).toBeGreaterThan(0); expect(bodies).toBeLessThan(total);
  });
});

describe('噴火: 落下範囲（inBlast）', () => {
  it('着地点から radius いないで 高さが hitYTol いないなら 当たる。外は 当たらない', () => {
    const K = T.eruption.meteor;
    expect(inBlast(0, 10, 0, { x: 0, y: 10, z: 0 })).toBe(true);
    expect(inBlast(0, 10, 0, { x: K.radius - 0.05, y: 10, z: 0 })).toBe(true);
    expect(inBlast(0, 10, 0, { x: (K.radius - 0.1) * 0.7, y: 10, z: (K.radius - 0.1) * 0.7 })).toBe(true);
    expect(inBlast(0, 10, 0, { x: K.radius + 0.05, y: 10, z: 0 })).toBe(false);
    expect(inBlast(0, 10, 0, { x: 0, y: 10 + K.hitYTol + 0.1, z: 0 })).toBe(false);
    expect(inBlast(0, 10, 0, { x: 0, y: 10 - K.hitYTol - 0.1, z: 0 })).toBe(false);
  });
});

describe('噴火: 炎が 飛び散る（火の 粉）', () => {
  it('隕石 1 つに つき splash.min〜max 個が 着地点の まわり rMin〜rMax に 放射状に 落ちる', () => {
    const r = new MeteorRain(); r.begin(5);
    const S = T.eruption.splash;
    const fromImpact = new Map<string, { x: number; z: number }[]>();
    for (let i = 0; i < 60 * 14; i++) {
      const o = r.update(DT, MOUTH, flat);
      for (const s of o.sparkLanded) {
        const k = s.sx.toFixed(4) + ',' + s.sz.toFixed(4);
        if (!fromImpact.has(k)) fromImpact.set(k, []);
        fromImpact.get(k)!.push({ x: s.lx, z: s.lz });
      }
    }
    expect(r.active).toBe(false);
    expect(r.impacts.length).toBe(T.eruption.meteor.count);
    let total = 0;
    for (const im of r.impacts) {
      expect(im.sparks).toBeGreaterThanOrEqual(S.min); expect(im.sparks).toBeLessThanOrEqual(S.max);
      total += im.sparks;
      const list = fromImpact.get(im.x.toFixed(4) + ',' + im.z.toFixed(4))!;
      expect(list.length).toBe(im.sparks);
      const q = new Set<number>();
      for (const s of list) {
        const d = Math.hypot(s.x - im.x, s.z - im.z);
        expect(d).toBeGreaterThanOrEqual(S.rMin - 1e-6); expect(d).toBeLessThanOrEqual(S.rMax + 1e-6);
        q.add((s.x >= im.x ? 1 : 0) + (s.z >= im.z ? 2 : 0));
      }
      expect(q.size).toBeGreaterThanOrEqual(3); // 放射状（片がわに かたよらない）
    }
    expect(r.sparkCount).toBe(total);
    expect(r.sparkLanded).toBe(total);
  });
  it('火の 粉の 同時に とぶ 数は maxFlying まで（こえた ぶんは その場で 落ちる）', () => {
    const r = new MeteorRain(); r.begin(0);
    let maxS = 0;
    for (let i = 0; i < 60 * 14; i++) { r.update(DT, MOUTH, flat); maxS = Math.max(maxS, r.sparks.length); }
    expect(maxS).toBeLessThanOrEqual(T.eruption.splash.maxFlying);
    expect(r.sparkLanded).toBe(r.sparkCount);
  });
});

describe('噴火: 小さな 穴（craterCells）', () => {
  it('着地点の まわり crater.radius の いちばん 上の だんだけ、最大 crater.max マス。岩盤（y ≦ 0）・みずは こわさない', () => {
    const C = T.eruption.crater;
    const cells = new Map<string, string>();
    const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
    for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) { cells.set(k(x, 4, z), 'grass'); cells.set(k(x, 3, z), 'dirt'); }
    cells.set(k(6, 4, 5), 'water');
    const blockAt = (x: number, y: number, z: number) => cells.get(k(x, y, z)) ?? 'air';
    const can = (b: string, y: number) => y > 0 && b !== 'air' && b !== 'water';
    const setAir = (x: number, y: number, z: number) => { cells.set(k(x, y, z), 'air'); return true; };
    const out = craterCells(5.5, 5, 5.5, blockAt, can, setAir);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(C.max);
    for (const c of out) { expect(c.y).toBe(4); expect(Math.hypot(c.x + 0.5 - 5.5, c.z + 0.5 - 5.5)).toBeLessThanOrEqual(C.radius); }
    expect(blockAt(5, 4, 5)).toBe('air');
    expect(blockAt(5, 3, 5)).toBe('dirt');
    expect(blockAt(6, 4, 5)).toBe('water');
    expect(blockAt(8, 4, 8)).toBe('grass');
    expect(craterCells(5.5, 1, 5.5, (_x, y) => (y === 0 ? 'stone' : 'air'), can, setAir)).toEqual([]);
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
  it('燃えかすは 300 秒（約 5 分）のこる。douse で 当たった ものだけ 消える', () => {
    expect(T.eruption.ember.sec).toBe(300);
    const e = new Embers();
    e.add(0, 0, 0, false); e.add(10, 0, 0, false); e.add(20, 0, 0, true);
    for (let i = 0; i < Math.round(299 / DT); i++) e.update(DT);
    expect(e.list.length).toBe(3);
    const gone = e.douse((q) => q.x >= 10);
    expect(gone.map((q) => q.x)).toEqual([10, 20]);
    expect(e.list.map((q) => q.x)).toEqual([0]);
    expect(e.douse(() => false)).toEqual([]);
    for (let i = 0; i < Math.round(2 / DT); i++) e.update(DT);
    expect(e.list.length).toBe(0);
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
  it('隕石・火の 粉が 落ちた 点の まわりの 植物だけ 空気に なる。土・石は のこる。範囲の 外も のこる', () => {
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
