import { describe, expect, it } from 'vitest';
import { Beam, BeamAim, clipBeam, type AimEnv } from './gashaBigBeam';
import { TUNE as T } from './gashaBigTuning';

const DT = 1 / 60;
const K = T.beam;

/** 平らな 地面（y 0 の 面。y < 0 が ブロック）と、あとから 足せる 壁 */
function world(walls: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[] = []) {
  return (x: number, y: number, z: number): boolean => {
    if (y < 0) return true;
    return walls.some((w) => x >= w.x0 && x < w.x1 && y >= w.y0 && y < w.y1 && z >= w.z0 && z < w.z1);
  };
}

/** 体は z = -25 の 先、プレイヤー（z 0）の ほうを 向く。目は 高さ 30 */
function env(over: Partial<AimEnv> & { solid?: AimEnv['solid'] } = {}): AimEnv {
  return {
    player: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, yawDeg: 0,
    eyes: [{ x: 3, y: 30, z: -25 }, { x: -3, y: 30, z: -25 }],
    body: { x: 0, z: -25 },
    solid: world(),
    ...over,
  };
}

describe('目から 光線 のタイムライン（Beam）', () => {
  it('調整表: 予兆・照射・終わり・追う 速さは ダッシュと おなじ・攻撃の 表に beam', () => {
    expect(K.chargeSec).toBeGreaterThan(1);
    expect(K.fireSec).toBeGreaterThan(5);
    expect(K.runSpeed).toBeCloseTo(5.6, 6); // src/player/config.ts の runSpeed
    expect(K.chaseMul).toBe(1);
    expect(K.breakBlocks).toBe(false);
    expect(T.attack.table.map((r) => r.name)).toContain('beam');
  });

  it('予兆 → 照射 → 終わり（大きな 煙）→ もどる → おわり。出来事は 1 回ずつ', () => {
    const b = new Beam();
    b.start();
    expect(b.phase).toBe('charge');
    const seen: string[] = [];
    let t = 0, glowPrev = 0, fireAt = -1, endAt = -1;
    while (!b.done && t < 60) {
      const ev = b.update(DT); t += DT;
      if (b.phase === 'charge') { expect(b.glow).toBeGreaterThanOrEqual(glowPrev - 1e-9); glowPrev = b.glow; }
      if (ev.fireStart) { seen.push('fire'); fireAt = t; }
      if (ev.fireEnd) { seen.push('end'); endAt = t; }
      if (b.phase !== seen[seen.length - 1] && !seen.includes(b.phase)) seen.push(b.phase);
    }
    expect(b.done).toBe(true);
    expect(seen.filter((s) => s === 'fire').length).toBe(1);
    expect(seen.filter((s) => s === 'end').length).toBe(1);
    expect(fireAt).toBeCloseTo(K.chargeSec, 1);
    expect(endAt - fireAt).toBeCloseTo(K.fireSec, 1);
    expect(t).toBeCloseTo(K.chargeSec + K.fireSec + K.finaleSec + K.recoverSec, 1);
  });

  it('目の 光: 予兆で 0 → 1、照射中は 1、おわりで 1 → 0', () => {
    const b = new Beam();
    b.start();
    expect(b.glow).toBe(0);
    for (let i = 0; i < Math.round(K.chargeSec * 60) + 2; i++) b.update(DT);
    expect(b.glow).toBeCloseTo(1, 5);
    expect(b.firing).toBe(true);
    for (let i = 0; i < Math.round((K.fireSec + K.finaleSec) * 60) - 2; i++) b.update(DT);
    expect(b.firing).toBe(false);
    expect(b.glow).toBeGreaterThan(0.9);
    for (let i = 0; i < Math.round(K.recoverSec * 60) + 5; i++) b.update(DT);
    expect(b.glow).toBe(0);
    expect(b.done).toBe(true);
  });
});

describe('光線は ブロックを 貫通しない（clipBeam）', () => {
  it('さえぎる ものが なければ 目的の 点まで とどく', () => {
    const r = clipBeam({ x: 0, y: 30, z: -25 }, { x: 0, y: 0.05, z: 0 }, world(), 0.4, 0.8);
    expect(r.blocked).toBe(false);
    expect(r.end.z).toBeCloseTo(0, 5);
  });

  it('壁が あれば そこで 止まる（さえぎられた）。壁の まえの 点が 先に なる', () => {
    const w = world([{ x0: -5, x1: 5, y0: 0, y1: 8, z0: -4, z1: -3 }]);
    const r = clipBeam({ x: 0, y: 30, z: -25 }, { x: 0, y: 0.05, z: 0 }, w, 0.4, 0.8);
    expect(r.blocked).toBe(true);
    expect(r.end.z).toBeLessThan(-3);
    expect(r.end.z).toBeGreaterThan(-8);
  });
});

describe('光線の ねらい（BeamAim）', () => {
  it('最初の ねらいは プレイヤーの 少し 前（体の ほうを 向いて いる プレイヤーから 見て 体がわ）の 地面', () => {
    const a = new BeamAim();
    a.begin(env()); // プレイヤー (0, 0, 0)・体 (0, -25) → ねらいは (0, -leadDist)
    expect(a.a.x).toBeCloseTo(0, 3);
    expect(a.a.z).toBeCloseTo(-K.leadDist, 3);
    expect(a.a.y).toBeCloseTo(0.05, 3);
    const b = new BeamAim();
    b.begin(env({ player: { x: 10, y: 0, z: 0 } }));
    const d = Math.hypot(0 - 10, -25 - 0);
    expect(b.a.x).toBeCloseTo(10 + ((0 - 10) / d) * K.leadDist, 3);
    expect(b.a.z).toBeCloseTo(0 + ((-25 - 0) / d) * K.leadDist, 3);
  });

  it('着弾点は プレイヤーの ダッシュ速度（× 倍率）で 追う。それ より はやく 動かない', () => {
    const a = new BeamAim();
    const e = env();
    a.begin(e);
    const p0 = { x: a.a.x, z: a.a.z };
    a.step(1, e);
    expect(Math.hypot(a.a.x - p0.x, a.a.z - p0.z)).toBeCloseTo(K.runSpeed * K.chaseMul, 3);
    const half = new BeamAim();
    const save = K.chaseMul;
    try { K.chaseMul = 0.5; half.begin(e); const q = { x: half.a.x, z: half.a.z }; half.step(1, e); expect(Math.hypot(half.a.x - q.x, half.a.z - q.z)).toBeCloseTo(K.runSpeed * 0.5, 3); } finally { K.chaseMul = save; }
  });

  it('止まって いると 追いつかれて ダメージ。当たり 続けて いる 間は hitEverySec ごとに 1 回', () => {
    const a = new BeamAim();
    const e = env();
    a.begin(e);
    let dmg = 0, firstAt = -1, t = 0;
    for (let i = 0; i < 60 * 5; i++) { const r = a.step(DT, e); t += DT; if (r.damage > 0) { dmg += r.damage; if (firstAt < 0) firstAt = t; } }
    expect(firstAt).toBeGreaterThan(0.5);
    expect(firstAt).toBeLessThan(K.leadDist / (K.runSpeed * K.chaseMul) + 0.5);
    expect(dmg).toBeGreaterThanOrEqual(K.damage * 6);
    expect(dmg % K.damage).toBe(0);
  });

  it('ダッシュで 走り 続ければ 追いつかれない（ダメージ 0）', () => {
    const a = new BeamAim();
    const e = env({ vel: { x: 0, z: K.runSpeed }, yawDeg: 180 });
    a.begin(e);
    let dmg = 0;
    for (let i = 0; i < 60 * 12; i++) {
      e.player.z += K.runSpeed * DT; // 体から とおざかる 向きに ダッシュ
      dmg += a.step(DT, e).damage;
    }
    expect(dmg).toBe(0);
  });

  it('ブロックの かげに かくれれば 防げる（ダメージ 0）。壁が なければ 当たる', () => {
    const wall = world([{ x0: -6, x1: 6, y0: 0, y1: 12, z0: -4, z1: -3 }]);
    const hidden = new BeamAim();
    const eh = env({ solid: wall });
    hidden.begin(eh);
    let dmg = 0;
    for (let i = 0; i < 60 * 6; i++) dmg += hidden.step(DT, eh).damage;
    expect(dmg).toBe(0);
    const open = new BeamAim();
    const eo = env();
    open.begin(eo);
    let dmg2 = 0;
    for (let i = 0; i < 60 * 6; i++) dmg2 += open.step(DT, eo).damage;
    expect(dmg2).toBeGreaterThan(0);
  });

  it('体の 上（目より 下）に いる 人は 自分の 体を ねらう（モード body）。ブロックの かげでも なければ 当たる', () => {
    const a = new BeamAim();
    const e = env({ player: { x: 1, y: 14, z: -22 } });
    a.begin(e);
    let dmg = 0, mode = '';
    for (let i = 0; i < 60 * 4; i++) { const r = a.step(DT, e); dmg += r.damage; mode = r.mode; }
    expect(mode).toBe('body');
    expect(dmg).toBeGreaterThan(0);
    expect(Math.hypot(a.a.x - 1, a.a.y - 14.5, a.a.z + 22)).toBeLessThan(K.hitRadius + 0.6);
  });

  it('目より 上（頭の 上の 雲など）は 安全（モード safe・ダメージ 0）', () => {
    const a = new BeamAim();
    const e = env({ player: { x: 0, y: 30, z: -24 } });
    a.begin(e);
    let dmg = 0, mode = '';
    for (let i = 0; i < 60 * 6; i++) { const r = a.step(DT, e); dmg += r.damage; mode = r.mode; }
    expect(mode).toBe('safe');
    expect(dmg).toBe(0);
  });

  it('体の 上でも 光線の とちゅうに ブロックを 置けば 防げる', () => {
    const block = world([{ x0: -1, x1: 5, y0: 20, y1: 24, z0: -24, z1: -23 }]); // 目と 体の 上の 人の あいだに
    const a = new BeamAim();
    const e = env({ player: { x: 1, y: 14, z: -22 }, solid: block });
    a.begin(e);
    let dmg = 0;
    for (let i = 0; i < 60 * 4; i++) dmg += a.step(DT, e).damage;
    // 目 (y 30, z -25) → 人 (y 14.5, z -22) の 線が ブロック（y 20〜24, z -24〜-23）を とおる か
    const t = (22 - 30) / (14.5 - 30); // y = 22 の ところ
    const zAt = -25 + (-22 + 25) * t;
    expect(zAt).toBeGreaterThan(-24); expect(zAt).toBeLessThan(-23);
    expect(dmg).toBe(0);
  });
});
