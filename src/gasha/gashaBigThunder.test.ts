import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { BodyShock, StrikeField, Thunder, touchBody, type Strike } from './gashaBigThunder';

const run = (th: Thunder, sec: number, dt = 1 / 60): { strike: number; land: number; shockEnd: number } => {
  const n = { strike: 0, land: 0, shockEnd: 0 };
  for (let t = 0; t < sec - 1e-9; t += dt) {
    const e = th.update(dt);
    if (e.strike) n.strike++;
    if (e.land) n.land++;
    if (e.shockEnd) n.shockEnd++;
  }
  return n;
};

describe('攻撃 5: 自分に 落雷の 時間（#293）', () => {
  it('① 指さし（予兆）→ ② 雷が 指に → ③ 電気 → ④ 手を おろす → done。出来事は 1 回ずつ', () => {
    const K = T.thunder, th = new Thunder();
    th.start(0);
    expect(th.phase).toBe('point');
    const a = run(th, K.pointSec - 0.05);
    expect(th.phase).toBe('point');
    expect(a).toEqual({ strike: 0, land: 0, shockEnd: 0 });
    const b = run(th, 0.1);
    expect(b.strike).toBe(1);
    expect(th.phase).toBe('strike');
    const c = run(th, K.strikeSec + 0.03);
    expect(c.land).toBe(1);
    expect(th.phase).toBe('shock');
    const d = run(th, K.shockSec);
    expect(d.shockEnd).toBe(1);
    expect(th.phase).toBe('recover');
    run(th, K.recoverSec + 0.05);
    expect(th.done).toBe(true);
    expect(run(th, 1)).toEqual({ strike: 0, land: 0, shockEnd: 0 });
  });
  it('手は 予兆で 上がりきる・雲は だんだん 暗く なり、はれる。電気は 走る 間だけ', () => {
    const K = T.thunder, th = new Thunder();
    th.start(0);
    run(th, 0.2);
    const r0 = th.raise, c0 = th.cloud;
    run(th, K.raiseSec);
    expect(th.raise).toBe(1);
    expect(th.raise).toBeGreaterThan(r0);
    run(th, K.cloudSec - 0.2 - K.raiseSec + 0.1);
    expect(th.cloud).toBe(1);
    expect(th.cloud).toBeGreaterThan(c0);
    expect(th.glow).toBe(0);
    run(th, K.pointSec - 1.0 - (K.cloudSec + 0.1)); // 予兆の おわりの 1 秒前
    expect(th.phase).toBe('point');
    run(th, 0.6);
    expect(th.glow).toBeGreaterThan(0); // 指が 光って ためる
    expect(th.elec).toBe(0);
    run(th, 0.4 + K.strikeSec + 0.5);
    expect(th.phase).toBe('shock');
    expect(th.elec).toBe(1);
    expect(th.live).toBe(true);
    run(th, K.shockSec - 0.5 - 0.35);
    expect(th.elec).toBeLessThan(1); // おわりに むけて 弱まる
    run(th, 0.4 + K.recoverSec * 0.5);
    expect(th.phase).toBe('recover');
    expect(th.elec).toBe(0);
    expect(th.live).toBe(false);
    expect(th.cloud).toBeLessThan(1);
    expect(th.cloud).toBeGreaterThan(0);
    run(th, K.recoverSec);
    expect(th.cloud).toBe(0);
    expect(th.raise).toBe(0);
  });
  it('遠くの 光は 雲が 暗くなって から ときどき 出る（シード付き: 同じ 回数なら 同じ 並び）', () => {
    const lights = (ord: number): number[] => {
      const th = new Thunder();
      th.start(ord);
      const at: number[] = [];
      let prev = 0;
      for (let i = 0; i < 60 * 12; i++) { th.update(1 / 60); if (th.flash > prev + 0.5) at.push(i); prev = th.flash; }
      return at;
    };
    const a = lights(0);
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(lights(0)).toEqual(a);
    expect(lights(1)).not.toEqual(a);
    expect(a[0]!).toBeGreaterThan(30);
  });
});

const flat = (x: number, z: number) => ({ y: 10, body: Math.hypot(x - 100, z - 100) < 5 });
const ctx = (px = 130, pz = 100) => ({ center: { x: 100, y: 12, z: 100 }, player: { x: px, y: 10, z: pz }, landAt: flat });
const runField = (f: StrikeField, sec: number, c = ctx()): { warned: number; hits: Strike[] } => {
  const seen = new Set<Strike>();
  const hits: Strike[] = [];
  for (let t = 0; t < sec; t += 1 / 60) {
    const o = f.update(1 / 60, c);
    for (const s of f.list) seen.add(s);
    hits.push(...o.hits);
  }
  return { warned: seen.size, hits };
};

describe('攻撃 5: まわりの 落雷（#293）', () => {
  const A = T.thunder.around;
  it('count 本が 順番に 予告 → 落ちる。予告は warnSec の 間 出る', () => {
    const f = new StrikeField();
    f.begin(0);
    const o = runField(f, A.warnSec + A.spanSec + A.keepSec + 1);
    expect(o.warned).toBe(A.count);
    expect(o.hits.length).toBe(A.count);
    expect(f.list.length).toBe(0);
    expect(f.active).toBe(false);
  });
  it('予告の 強さ 0→1。落ちる 瞬間（t = 0）に 1 度だけ hits に 出る', () => {
    const f = new StrikeField();
    f.begin(0);
    let warnSeen = false, hitFrameWarn = -1;
    for (let i = 0; i < 60 * 8; i++) {
      const o = f.update(1 / 60, ctx());
      for (const s of f.list) if (s.t < 0) { warnSeen = true; expect(f.warn(s)).toBeGreaterThanOrEqual(0); expect(f.warn(s)).toBeLessThan(1); }
      for (const h of o.hits) { hitFrameWarn = f.warn(h); expect(h.t).toBeGreaterThanOrEqual(0); expect(h.t).toBeLessThan(0.05); }
    }
    expect(warnSeen).toBe(true);
    expect(hitFrameWarn).toBe(1);
  });
  it('場所は 回数ごとに ちがい、同じ 回数・同じ 条件なら 同じ（シード付き）', () => {
    const spots = (ord: number): string[] => {
      const f = new StrikeField();
      f.begin(ord);
      return runField(f, 9).hits.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`);
    };
    expect(spots(0)).toEqual(spots(0));
    expect(spots(0)).not.toEqual(spots(1));
    expect(spots(1)).not.toEqual(spots(2));
  });
  it('広範囲: 体の 上・体の まわり・プレイヤーの 近くに 分かれて 落ちる。遠い 所は rMax まで', () => {
    const f = new StrikeField();
    f.begin(3);
    const hits = runField(f, 9).hits;
    const dc = (s: Strike) => Math.hypot(s.x - 100, s.z - 100);
    const near = hits.filter((s) => dc(s) <= A.nearMax + 1e-6).length;
    expect(near).toBeGreaterThanOrEqual(Math.floor(A.count * A.nearShare) - 1);
    expect(hits.every((s) => s.body === flat(s.x, s.z).body)).toBe(true);
    let onBody = 0;
    for (let o = 0; o < 5; o++) { const g = new StrikeField(); g.begin(o); onBody += runField(g, 9).hits.filter((s) => s.body).length; }
    expect(onBody).toBeGreaterThan(0); // 体の 上にも 落ちる
    const aimed = hits.filter((s) => Math.hypot(s.x - 130, s.z - 100) <= A.aimJitter + 1e-6).length;
    expect(aimed).toBeGreaterThanOrEqual(Math.floor(A.count * A.aimShare) - 1);
    expect(Math.max(...hits.map(dc))).toBeLessThanOrEqual(Math.max(A.rMax, 30 + A.aimJitter) + 1e-6);
    expect(Math.max(...hits.map(dc))).toBeGreaterThan(A.rMin);
  });
  it('落雷の 半径に いると 当たる（横は radius、高さは 地面から yBelow 下〜yAbove 上）', () => {
    const f = new StrikeField();
    const s = { id: 0, x: 50, y: 10, z: 50, body: false, t: 0, hitAt: 0 } as Strike;
    expect(f.inStrike(s, { x: 50 + A.radius - 0.1, y: 10, z: 50 })).toBe(true);
    expect(f.inStrike(s, { x: 50 + A.radius + 0.1, y: 10, z: 50 })).toBe(false);
    expect(f.inStrike(s, { x: 50, y: 10 + A.yAbove - 0.1, z: 50 })).toBe(true);
    expect(f.inStrike(s, { x: 50, y: 10 + A.yAbove + 0.1, z: 50 })).toBe(false);
    expect(f.inStrike(s, { x: 50, y: 10 - A.yBelow - 0.1, z: 50 })).toBe(false);
  });
  it('同時に ある 数は maxActive まで（超えた 分は 落ちない）', () => {
    const saved = A.maxActive;
    (A as { maxActive: number }).maxActive = 3;
    try {
      const f = new StrikeField();
      f.begin(0);
      let most = 0;
      for (let i = 0; i < 60 * 9; i++) { f.update(1 / 60, ctx()); most = Math.max(most, f.list.length); }
      expect(most).toBeLessThanOrEqual(3);
    } finally { (A as { maxActive: number }).maxActive = saved; }
  });
});

describe('攻撃 5: 体に 触れて いる 間の ダメージ（#293）', () => {
  const B = T.thunder.body;
  it('電気が 走って いて 触れて いる 間、すぐ 1 回 → everySec ごと', () => {
    const bs = new BodyShock();
    let total = 0, hits = 0;
    for (let i = 0; i < 60 * 3; i++) { const d = bs.step(1 / 60, true, true); total += d; if (d > 0) hits++; }
    expect(hits).toBe(Math.ceil(3 / B.everySec));
    expect(total).toBe(hits * B.damage);
  });
  it('触れて いない・電気が 走って いない ときは ダメージなし。触れ直すと すぐ 当たる（連打の 間かくは 守る）', () => {
    const bs = new BodyShock();
    expect(bs.step(1, true, false)).toBe(0);
    expect(bs.step(1, false, true)).toBe(0);
    expect(bs.step(0.01, true, true)).toBe(B.damage);
    expect(bs.step(0.1, true, true)).toBe(0);
    expect(bs.step(0.1, true, false)).toBe(0);
    expect(bs.step(0.1, true, true)).toBe(0); // 間かくの 途中で 触れ直しても 連打にならない
    expect(bs.step(B.everySec, true, true)).toBe(B.damage);
  });
  it('touchBody: 足の 下・横・頭に 体の マスが あれば 触れて いる', () => {
    const solidAt = (cx: number, cy: number, cz: number) => (x: number, y: number, z: number) => x === cx && y === cy && z === cz;
    const p = { x: 10.8, y: 20, z: 10.5 };
    expect(touchBody(solidAt(10, 19, 10), p, B.touchMargin)).toBe(true); // 足の 下（体の 上に 立つ）
    expect(touchBody(solidAt(10, 19, 10), { x: 10.5, y: 20.6, z: 10.5 }, B.touchMargin)).toBe(true); // 少し 浮いた 高さでも 下の マス
    expect(touchBody(solidAt(10, 21, 10), p, B.touchMargin)).toBe(true); // 腰の 高さ
    expect(touchBody(solidAt(11, 20, 10), p, B.touchMargin)).toBe(true); // 横（すぐ となり）
    expect(touchBody(solidAt(13, 20, 10), p, B.touchMargin)).toBe(false); // 遠い
    expect(touchBody(solidAt(10, 25, 10), p, B.touchMargin)).toBe(false); // ずっと 上
    expect(touchBody(() => false, p, B.touchMargin)).toBe(false);
  });
});
