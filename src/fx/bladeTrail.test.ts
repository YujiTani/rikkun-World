// CHAR-4: 刃の軌跡（AC2〜AC9・AC14）。docs/design/CHAR-4.md §4.2〜§4.8
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BladeTech, ItemId, Vec3 } from '../contracts';
import { TRAIL_K, pathPoint, timeToTau } from './bladeTrailModel';
import type { TrailSnapshot } from './bladeTrail';
import { TECHS, at, bodyOf, dist, fire, idleState, makeRig, moveState, range, setCamera, trailMeshes, visibleSteps, type Rec } from './bladeTrailTestKit';

const K = TRAIL_K;
const O: Vec3 = { x: 20.5, y: 5, z: 20.5 };
const rel = (v: Vec3): [number, number, number] => [v.x - O.x, v.y - O.y, v.z - O.z];
const near = (a: readonly number[], b: readonly number[], tol: number): boolean => a.every((v, i) => Math.abs(v - b[i]!) <= tol);

/** 期待する 世界の 位置: 体 + k × (右 × r + 上 × y + 前 × u) */
function expectWorld(tech: BladeTech, tau: number, which: 'tip' | 'base', body: Vec3, dirDeg: number): Vec3 {
  const d = [0, 0, 0];
  pathPoint(tech, tau, which, d);
  const u = (dirDeg * Math.PI) / 180;
  return { x: body.x + K * (d[0]! * Math.cos(u) + d[2]! * Math.sin(u)), y: body.y + K * d[1]!, z: body.z + K * (d[0]! * Math.sin(u) - d[2]! * Math.cos(u)) };
}

const TICKS: Record<BladeTech, number> = { thrust: 41, kesa: 106, kiriage: 52 };
const DRAW: Record<BladeTech, [number, number]> = { thrust: [2, 6], kesa: [28, 34], kiriage: [19, 22] };
const VISIBLE: Record<BladeTech, [number, number]> = { thrust: [3, 14], kesa: [29, 42], kiriage: [20, 30] };

describe('CHAR-4 AC2 書く時間と 見える時間', () => {
  for (const tech of TECHS) {
    it(`${tech}: 点が ふえるのは F${DRAW[tech][0]}〜F${DRAW[tech][1]} だけ・visible は F${VISIBLE[tech][0]}〜F${VISIBLE[tech][1]} ちょうど`, () => {
      const rig = makeRig();
      const rec = fire(rig, tech, TICKS[tech]);
      const grew = rec.filter((r, i) => r.snap.points.length > (i === 0 ? 0 : rec[i - 1]!.snap.points.length)).map((r) => r.f);
      expect(grew).toEqual(range(DRAW[tech][0], DRAW[tech][1]));
      expect(at(rec, DRAW[tech][1]).snap.points).toHaveLength(DRAW[tech][1] - DRAW[tech][0] + 1);
      expect(visibleSteps(rec)).toEqual(range(VISIBLE[tech][0], VISIBLE[tech][1]));
      for (const r of rec) if (!r.snap.visible) expect(r.snap.objects, `F${r.f}`).toBe(0);
    });
  }
  it('点の step は F、tau は 絵の 時、age は いまの 時刻 − step', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 40);
    const p = at(rec, 34).snap.points;
    expect(p.map((x) => x.step)).toEqual(range(28, 34));
    expect(p.map((x) => x.tau)).toEqual(range(28, 34));
    expect(at(rec, 40).snap.points.map((x) => x.age)).toEqual([12, 11, 10, 9, 8, 7, 6]);
  });
  it('設定を 大けさぎり 14/3/36 にすると 点は F14〜F17、tau は 28・30・32・34、visible は F15〜F25', () => {
    const rig = makeRig();
    rig.settings.bladeTech.kesa = { startup: 14, active: 3, recovery: 36 };
    const rec = fire(rig, 'kesa', 40);
    const last = at(rec, 17).snap.points;
    expect(last.map((p) => p.step)).toEqual([14, 15, 16, 17]);
    expect(last.map((p) => p.tau)).toEqual([28, 30, 32, 34]);
    expect(visibleSteps(rec)).toEqual(range(15, 25));
    expect(at(rec, 25).snap.points).toHaveLength(4);
  });
  it('見える部分は 時刻 [max(書きはじめ, n − 9), min(n, 書きおわり)]', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 45);
    const f31 = at(rec, 31).snap;
    expect([f31.tail, f31.head]).toEqual([28, 31]);
    const f42 = at(rec, 42).snap;
    expect([f42.tail, f42.head]).toEqual([33, 34]);
    expect(at(rec, 28).snap.visible).toBe(false);
    expect(at(rec, 43).snap.visible).toBe(false);
  });
});

describe('CHAR-4 AC3 位置', () => {
  it('各点の tip・base = そのステップの おわりの 体 + k × データ（±0.001）。3 わざ × 4 つの 向き', () => {
    for (const tech of TECHS) {
      for (const dir of [0, 90, 200, 315]) {
        const rig = makeRig();
        const rec = fire(rig, tech, DRAW[tech][1] + 1, { dirDeg: dir });
        for (const r of rec) {
          for (const p of r.snap.points) {
            const body = at(rec, p.step).body;
            expect(dist(p.tip, expectWorld(tech, p.tau, 'tip', body, dir)), `${tech} yaw${dir} F${p.step} tip`).toBeLessThanOrEqual(0.001);
            expect(dist(p.base, expectWorld(tech, p.tau, 'base', body, dir)), `${tech} yaw${dir} F${p.step} base`).toBeLessThanOrEqual(0.001);
          }
        }
      }
    }
  });
  it('仕様書 §4.3 の 表（yaw 0）: 刃先 − O が 表と ±0.01', () => {
    const table: Array<[BladeTech, number, [number, number, number]]> = [
      // WEAPON-4: 体が 大けさぎりで 前へ 進む（A(29) = 0.4・A(34) = 2.6）ぶん 前へ。切り上げは その場（A = 0）で 窓は F19〜22
      ['kesa', 29, [0.409, 2.001, -0.196]],
      ['kesa', 34, [-0.725, 0.429, -3.035]],
      ['kiriage', 19, [0.006, 1.591, -0.877]],
      ['kiriage', 22, [-0.126, 1.969, -0.626]],
      ['thrust', 2, [0.041, 1.573, -0.53]],
      ['thrust', 6, [0.031, 1.281, -1.266]],
    ];
    for (const [tech, f, want] of table) {
      const rig = makeRig();
      const rec = fire(rig, tech, f);
      const p = at(rec, f).snap.points.find((x) => x.step === f)!;
      expect(near(rel(p.tip), want, 0.01), `${tech} F${f}: ${rel(p.tip).map((v) => v.toFixed(3))} と ${want}`).toBe(true);
    }
  });
  it('yaw 90 の 大けさぎり F34 の 刃先 = (3.035, 0.429, −0.725) ±0.01', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 34, { dirDeg: 90 });
    const p = at(rec, 34).snap.points.find((x) => x.step === 34)!;
    expect(near(rel(p.tip), [3.035, 0.429, -0.725], 0.01), rel(p.tip).join()).toBe(true);
  });
  it('WEAPON-4 AC22 後半: 大けさぎりの さいごの 点（F34）の 刃先は 1 つ目（F28）より u の方へ 2.0 以上 前（とびこみの 残像）', () => {
    const rec = fire(makeRig(), 'kesa', 34, { dirDeg: 0 });
    const pts = at(rec, 34).snap.points;
    expect(pts).toHaveLength(7);
    expect(pts[0]!.tip.z - pts[6]!.tip.z).toBeGreaterThanOrEqual(2.0); // u = 北（−z）
  });
  it('書いた 点は 世界に とどまる: F29 に 書いた 点は F33 でも 同じ 位置（±0.001）。体が 前へ すすんでも・カメラを 回しても 動かない', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 29);
    const f29 = at(rec, 29).snap.points.find((p) => p.step === 29)!;
    setCamera(rig, [8, 3, 2], [20, 1, 20]);
    const more = fire(rig, 'kesa', 45, { from: 30 });
    for (const r of more) {
      if (r.f > 43) continue;
      const q = r.snap.points.find((p) => p.step === 29);
      if (!q) continue;
      expect(dist(q.tip, f29.tip), `F${r.f}`).toBeLessThanOrEqual(0.001);
      expect(dist(q.base, f29.base), `F${r.f}`).toBeLessThanOrEqual(0.001);
    }
    expect(at(more, 33).snap.points.find((p) => p.step === 29)).toBeTruthy();
  });
  it('わざの とちゅうで yaw を 90 回しても 点は 変わらない（わざの 向きは はじめの まま）', () => {
    const a = makeRig();
    const b = makeRig();
    const base = fire(a, 'kesa', 36, { dirDeg: 0 });
    const turned = fire(b, 'kesa', 36, { dirDeg: 0, stateDir: (f) => (f < 31 ? 0 : 90) });
    for (const r of base) {
      const t = at(turned, r.f).snap;
      expect(t.points.length).toBe(r.snap.points.length);
      r.snap.points.forEach((p, i) => {
        expect(dist(p.tip, t.points[i]!.tip)).toBeLessThanOrEqual(0.001);
        expect(dist(p.base, t.points[i]!.base)).toBeLessThanOrEqual(0.001);
      });
    }
  });
  it('体の 0.10 前に かべ: 体は 止まった 位置から。刃先 − 体 が データ × k（±0.001）', () => {
    const rig = makeRig();
    const stuck = (_f: number, b: Vec3): Vec3 => {
      const fw = { x: 0, z: -1 };
      const along = Math.min(0.1, (b.z - O.z) * fw.z);
      return { x: O.x, y: O.y, z: O.z + fw.z * along };
    };
    const rec = fire(rig, 'kesa', 34, { body: stuck });
    const f34 = at(rec, 34).snap;
    expect(f34.points).toHaveLength(7);
    for (const p of f34.points) {
      const body = at(rec, p.step).body;
      expect(body.z).toBeGreaterThanOrEqual(O.z - 0.1 - 1e-9);
      expect(dist(p.tip, expectWorld('kesa', p.tau, 'tip', body, 0))).toBeLessThanOrEqual(0.001);
      const d = [0, 0, 0];
      pathPoint('kesa', p.tau, 'tip', d);
      expect(near([p.tip.x - body.x, p.tip.y - body.y, p.tip.z - body.z], [d[0]! * K, d[1]! * K, -d[2]! * K], 0.001)).toBe(true);
    }
  });
  it('空中・落ちながら: 体の 上下も ついていく', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 34, { body: (f, b) => ({ ...b, y: b.y - 0.03 * f }) });
    for (const p of at(rec, 34).snap.points) expect(dist(p.tip, expectWorld('kesa', p.tau, 'tip', at(rec, p.step).body, 0))).toBeLessThanOrEqual(0.001);
  });
  it('区切りの 点: 体の 位置は ステップの おわりの 位置を 直線で つなぐ（ステップの あいだの 時刻）', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 31);
    const snap = at(rec, 31).snap;
    // 時刻 30.5 の 刃先は τ 30.5 の データ + (F30 と F31 の おわりの 体の まんなか)
    const col = snap.columns.find((c) => Math.abs(snap.head! - c.age - 30.5) < 1e-9);
    expect(col, '時刻 30.5 の 区切りが ある').toBeTruthy();
    const mid: Vec3 = { x: (at(rec, 30).body.x + at(rec, 31).body.x) / 2, y: at(rec, 30).body.y, z: (at(rec, 30).body.z + at(rec, 31).body.z) / 2 };
    expect(dist(col!.tip, expectWorld('kesa', 30.5, 'tip', mid, 0))).toBeLessThanOrEqual(0.001);
  });
});

/** 見る向き v と 通り道の 向き t から n（長さ 1）。near-parallel なら null */
function normalOf(tips: Vec3[], j: number, cam: THREE.Vector3): THREE.Vector3 | null {
  const a = Math.max(0, j - 1);
  const b = Math.min(tips.length - 1, j + 1);
  const t = new THREE.Vector3(tips[b]!.x - tips[a]!.x, tips[b]!.y - tips[a]!.y, tips[b]!.z - tips[a]!.z);
  if (t.lengthSq() < 1e-12) return null;
  t.normalize();
  const v = new THREE.Vector3(tips[j]!.x - cam.x, tips[j]!.y - cam.y, tips[j]!.z - cam.z).normalize();
  const n = new THREE.Vector3().crossVectors(v, t);
  if (n.length() < 0.01) return null;
  return n.normalize();
}

describe('CHAR-4 AC4 形', () => {
    const cameras: Record<string, (tech: BladeTech) => { pos: [number, number, number]; look: [number, number, number] }> = {
    // 正面: わざの 前（北）から 体を 見る。突きの 道に ほぼ 直角でなく 向かい合う ほうが うすくなる 例
    正面: () => ({ pos: [20.5, 6.6, 14.5], look: [20.5, 6.2, 20.5] }),
    // 真横: 切り上げを 北から 見る（わざの 前の 向きと 同じ 向き = 道の 向きと ほぼ 平行）
    真横: () => ({ pos: [20.5, 6.6, 30.5], look: [20.5, 6.2, 19] }),
    // 真うしろ: ふだんの カメラ
    真うしろ: () => ({ pos: [20.5, 6.8, 26.5], look: [20.5, 6.4, 19] }),
    // 東から
    東: () => ({ pos: [28.5, 6.6, 19.5], look: [20.5, 6.2, 19.5] }),
  };
  for (const [name, cam] of Object.entries(cameras)) {
    for (const tech of TECHS) {
      it(`${name}の カメラで ${tech}: うちの へり = 刃先 + (つば − 刃先) × 0.45 × sin(πq)、うすい 所は n の 向きに 0.10 × sin(πq) 以上`, () => {
        const c = cam(tech);
        const rig = makeRig({ camera: c });
        const rec = fire(rig, tech, VISIBLE[tech][1]);
        let total = 0;
        for (const r of rec) {
          const s = r.snap;
          if (!s.visible) continue;
          const cols = s.columns;
          expect(cols).toHaveLength(s.segments + 1);
          expect(s.segments).toBe(Math.min(36, Math.max(6, Math.ceil(6 * (s.head! - s.tail!) - 1e-9))));
          expect(cols[0]!.q).toBeCloseTo(0, 9);
          expect(cols[cols.length - 1]!.q).toBeCloseTo(1, 9);
          const tips = cols.map((x) => x.tip);
          cols.forEach((col, j) => {
            const time = r.f - col.age;
            const tau = timeToTauOf(rig, tech, time);
            const bodyAt = bodyAtTime(rec, time);
            const tipW = expectWorld(tech, tau, 'tip', bodyAt, 0);
            const baseW = expectWorld(tech, tau, 'base', bodyAt, 0);
            expect(dist(col.tip, tipW), `${tech} F${r.f} 列${j} tip`).toBeLessThanOrEqual(0.001);
            const w = 0.45 * Math.sin(Math.PI * col.q);
            const formula = { x: tipW.x + (baseW.x - tipW.x) * w, y: tipW.y + (baseW.y - tipW.y) * w, z: tipW.z + (baseW.z - tipW.z) * w };
            total++;
            const sw = Math.sin(Math.PI * col.q);
            if (j === 0 || j === cols.length - 1) {
              // q = 0 と q = 1: とがる
              expect(dist(col.inner, col.tip), `${tech} F${r.f} 列${j} とがる`).toBeLessThanOrEqual(0.001);
              return;
            }
            const n = normalOf(tips, j, rig.camera.position);
            const want = 0.1 * sw;
            if (dist(col.inner, formula) <= 0.001) return; // ずらさない 所
            expect(n, `${tech} F${r.f} 列${j} ずらしたのに n が ない`).not.toBeNull();
            const sign = Math.sign((baseW.x - tipW.x) * n!.x + (baseW.y - tipW.y) * n!.y + (baseW.z - tipW.z) * n!.z) || 1;
            const comp = ((col.inner.x - col.tip.x) * n!.x + (col.inner.y - col.tip.y) * n!.y + (col.inner.z - col.tip.z) * n!.z) * sign;
            expect(comp, `${tech} F${r.f} 列${j} n 成分`).toBeGreaterThanOrEqual(want - 0.001);
            // ずらした ぶんは n の 向きだけ（それ以外は 式どおり）
            const d = { x: col.inner.x - formula.x, y: col.inner.y - formula.y, z: col.inner.z - formula.z };
            const along = d.x * n!.x + d.y * n!.y + d.z * n!.z;
            expect(Math.hypot(d.x - n!.x * along, d.y - n!.y * along, d.z - n!.z * along), `${tech} F${r.f} 列${j} n 以外の ずれ`).toBeLessThanOrEqual(0.001);
          });
          // どの 区切りも n 成分の 大きさ ≥ 0.10 × sin(πq) − 0.001、符号は つば − 刃先 と 同じ
          cols.forEach((col, j) => {
            if (j === 0 || j === cols.length - 1) return;
            const n = normalOf(tips, j, rig.camera.position);
            if (!n) return;
            const time = r.f - col.age;
            const tipW = expectWorld(tech, timeToTauOf(rig, tech, time), 'tip', bodyAtTime(rec, time), 0);
            const baseW = expectWorld(tech, timeToTauOf(rig, tech, time), 'base', bodyAtTime(rec, time), 0);
            const sign = Math.sign((baseW.x - tipW.x) * n.x + (baseW.y - tipW.y) * n.y + (baseW.z - tipW.z) * n.z) || 1;
            const comp = ((col.inner.x - col.tip.x) * n.x + (col.inner.y - col.tip.y) * n.y + (col.inner.z - col.tip.z) * n.z) * sign;
            expect(Math.abs(comp), `${tech} F${r.f} 列${j}`).toBeGreaterThanOrEqual(0.1 * Math.sin(Math.PI * col.q) - 0.001);
            expect(comp, `${tech} F${r.f} 列${j} 符号`).toBeGreaterThanOrEqual(-0.001);
          });
        }
        expect(total).toBeGreaterThan(0);
      });
    }
  }
  it('一番 うすい はばで 見る向きに ひらく: 3 つの カメラの どれでも 線に ならない（うちの へり ≠ 刃先 の 区切りが 多い）', () => {
    for (const name of Object.keys(cameras)) {
      const rig = makeRig({ camera: cameras[name]!('kesa') });
      const rec = fire(rig, 'kesa', 34);
      const s = at(rec, 34).snap;
      const wide = s.columns.filter((c) => c.q > 0.1 && c.q < 0.9 && dist(c.inner, c.tip) >= 0.05);
      expect(wide.length, name).toBeGreaterThanOrEqual(Math.floor(s.columns.length * 0.5));
    }
  });
});

function timeToTauOf(rig: ReturnType<typeof makeRig>, tech: BladeTech, t: number): number {
  return timeToTau(tech, rig.settings.bladeTech[tech], t);
}
/** きろくの 体の 位置を 時刻 t で 直線で つなぐ */
function bodyAtTime(rec: Rec[], t: number): Vec3 {
  const lo = Math.max(1, Math.floor(t + 1e-9));
  const hi = Math.min(rec[rec.length - 1]!.f, lo + 1);
  const a = at(rec, lo).body;
  const b = at(rec, hi).body;
  const w = hi > lo ? t - lo : 0;
  return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w };
}

describe('CHAR-4 AC5 だん 4 つの 色・% と 消え方', () => {
  const FADE = (age: number): number => (age < 2.25 ? 1 : age < 4.5 ? 0.75 : age < 6.75 ? 0.5 : age < 9 ? 0.25 : 0);

  it('各 区切りの fade は 年れいだけで 決まり 表の 値と 同じ（大けさぎり F29〜F43 を 1 ステップずつ）', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 45);
    let n = 0;
    for (const r of rec.filter((x) => x.f >= 29 && x.f <= 43)) {
      for (const s of r.snap.strips) {
        expect(s.fade, `F${r.f} age ${s.age}`).toBe(FADE(s.age));
        expect(s.age).toBeLessThan(9);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });
  it('同じ 時刻（時刻 30）の 所の fade は ステップが 進んでも ふえない', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 45);
    for (const T of [29.25, 30, 30.5, 31.2]) {
      let prev = Infinity;
      for (const r of rec) {
        const s = r.snap;
        if (!s.visible) continue;
        // 時刻 T を ふくむ 区切り（列 j と j+1 のあいだ）
        const times = s.columns.map((c) => r.f - c.age);
        const j = times.findIndex((t, i) => i < times.length - 1 && T >= t - 1e-9 && T <= times[i + 1]! + 1e-9);
        if (j < 0) continue;
        const f = s.strips[j]!.fade;
        expect(f, `T=${T} F${r.f}`).toBeLessThanOrEqual(prev);
        prev = f;
      }
      expect(prev).toBeLessThan(Infinity);
    }
  });
  it('だん 4 つ: そとの 1/6 = glow 100%、のこり = color 85%・50%・22%（× 消えぐあい）。だんの さかいで 頂点を 共有しない', () => {
    for (const item of ['bokuto', 'katana', 'crystal_katana'] as ItemId[]) {
      const rig = makeRig();
      const rec = fire(rig, 'kesa', 33, { item });
      const s = at(rec, 33).snap;
      const row = rig.settings.bladeTrail[item]!;
      const { band } = trailMeshes(rig.scene);
      const pos = band.geometry.getAttribute('position') as THREE.BufferAttribute;
      const col = band.geometry.getAttribute('color') as THREE.BufferAttribute;
      expect(col.itemSize).toBe(4);
      expect(band.geometry.drawRange.count).toBe(s.segments * 4 * 6);
      const glow = new THREE.Color(row.glow);
      const color = new THREE.Color(row.color);
      const EDGE = [0, 1 / 6, 1 / 2, 5 / 6, 1];
      const ALPHA = [1, 0.85, 0.5, 0.22];
      expect(s.strips.length).toBe(s.segments);
      for (let j = 0; j < s.segments; j++) {
        for (let b = 0; b < 4; b++) {
          const base = (j * 4 + b) * 4;
          const c = b === 0 ? glow : color;
          const fade = s.strips[j]!.fade;
          for (let k = 0; k < 4; k++) {
            expect(col.getX(base + k)).toBeCloseTo(c.r, 5);
            expect(col.getY(base + k)).toBeCloseTo(c.g, 5);
            expect(col.getZ(base + k)).toBeCloseTo(c.b, 5);
            expect(col.getW(base + k)).toBeCloseTo(ALPHA[b]! * fade, 5);
          }
          // 頂点 0,1 = 列 j の そと・うち、2,3 = 列 j+1 の そと・うち
          for (let side = 0; side < 2; side++) {
            const cc = s.columns[j + side]!;
            for (let e = 0; e < 2; e++) {
              const v = base + side * 2 + e;
              const f = EDGE[b + e]!;
              const want = [cc.tip.x + (cc.inner.x - cc.tip.x) * f, cc.tip.y + (cc.inner.y - cc.tip.y) * f, cc.tip.z + (cc.inner.z - cc.tip.z) * f];
              expect(near([pos.getX(v), pos.getY(v), pos.getZ(v)], want, 1e-4), `strip ${j} band ${b} v${side * 2 + e}`).toBe(true);
            }
          }
        }
      }
    }
  });
  it('点滅しない: 帯の どの 色の 不とうめいさも ステップが 進んで ふえない（同じ 時刻の 区切り）。赤い 色は 使わない', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 45);
    for (const r of rec) {
      for (const st of r.snap.strips) expect(st.fade).toBeLessThanOrEqual(1);
    }
    for (const item of ['bokuto', 'katana', 'crystal_katana'] as const) {
      const row = rig.settings.bladeTrail[item]!;
      for (const hex of [row.color, row.glow]) {
        const r = (hex >> 16) & 255;
        const g = (hex >> 8) & 255;
        expect(r > g * 1.6 && r > 150 && g < 100).toBe(false);
      }
    }
  });
  it('帯の 物: 透明・深さを かかない・どちらからも 見える・霧は ほかと 同じ・ライトで 変わらない', () => {
    const rig = makeRig();
    const { band } = trailMeshes(rig.scene);
    const m = band.material as THREE.MeshBasicMaterial;
    expect(m).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.depthTest).toBe(true);
    expect(m.vertexColors).toBe(true);
    expect(m.side).toBe(THREE.DoubleSide);
    // 2 面 + 透明は three が 2 回 描く（描画回数が 2 ばいに なる）。1 回に する
    expect(m.forceSinglePass).toBe(true);
    expect(m.fog).toBe(true);
  });
});

describe('CHAR-4 AC6 星', () => {
  it('きらきらの かたなで 大けさぎり F31: 3 こ。q = 0.25・0.55・0.85 の 区切りの 刃先から 0.05 以内', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 31, { item: 'crystal_katana' });
    const s = at(rec, 31).snap;
    expect(s.stars).toHaveLength(3);
    const want = [0.25, 0.55, 0.85].map((q) => s.columns[Math.floor(q * s.segments)]!.tip);
    for (const w of want) expect(Math.min(...s.stars.map((x) => dist(x, w))), '期待の 刃先の 近くに 星').toBeLessThanOrEqual(0.05);
    // 3 こが ばらばら（かたまらない）
    expect(dist(s.stars[0]!, s.stars[1]!)).toBeGreaterThan(0.05);
    expect(dist(s.stars[1]!, s.stars[2]!)).toBeGreaterThan(0.05);
  });
  it('ぼくとう・かたなは 星 0 こ（3 わざ ぜんぶ）', () => {
    for (const item of ['bokuto', 'katana'] as ItemId[]) {
      for (const tech of TECHS) {
        const rig = makeRig();
        const rec = fire(rig, tech, TICKS[tech], { item });
        for (const r of rec) expect(r.snap.stars, `${item} ${tech} F${r.f}`).toHaveLength(0);
        for (const r of rec) expect(r.snap.objects).toBeLessThanOrEqual(1);
      }
    }
  });
  it('年れいが 8.55 を こえた 点の 星は 出ない。それまでは 3 こ。星の 物は 1 つ（星 3 こ込みで 2 つ 以下）', () => {
    for (const tech of ['kesa', 'kiriage', 'thrust'] as BladeTech[]) {
      const rig = makeRig();
      const rec = fire(rig, tech, TICKS[tech], { item: 'crystal_katana' });
      let sawFewer = false;
      let saw3 = false;
      for (const r of rec) {
        const s = r.snap;
        if (!s.visible) {
          expect(s.stars).toHaveLength(0);
          continue;
        }
        const live = [0.25, 0.55, 0.85].filter((q) => s.columns[Math.min(s.segments, Math.floor(q * s.segments))]!.age <= 8.55);
        expect(s.stars, `${tech} F${r.f}`).toHaveLength(live.length);
        if (live.length < 3) sawFewer = true;
        if (live.length === 3) saw3 = true;
        expect(s.objects).toBeLessThanOrEqual(2);
        expect(s.triangles).toBeLessThanOrEqual(360);
      }
      expect(saw3, tech).toBe(true);
      if (tech !== 'thrust') expect(sawFewer, `${tech} 終わりごろ 星が へる`).toBe(true);
    }
  });
});

describe('CHAR-4 AC7 1 本だけ・取り消し・止まる', () => {
  it('初期の 長さで 突きを おしつづける: F1・F42・F83 に わざ、軌跡は どの ステップも 1 本 以下。1 秒に 3 回 以下', () => {
    const rig = makeRig();
    const starts: number[] = [];
    const vis: boolean[] = [];
    let maxObj = 0;
    let f = 0;
    for (let i = 0; i < 600; i++) {
      f = f >= 41 ? 1 : f + 1;
      if (f === 1) starts.push(i + 1);
      rig.trail.step(moveState(rig.settings, 'katana', 'thrust', f, 0, O), bodyOf(rig.settings, 'thrust', f, 0, O));
      const s = rig.trail.snapshot();
      vis.push(s.visible);
      maxObj = Math.max(maxObj, s.objects);
    }
    expect(starts.slice(0, 3)).toEqual([1, 42, 83]);
    expect(maxObj).toBeLessThanOrEqual(1);
    const onsets = vis.map((v, i) => (v && !(i > 0 && vis[i - 1]) ? i : -1)).filter((x) => x >= 0);
    expect(onsets.length).toBeGreaterThanOrEqual(10);
    expect(onsets.length).toBeLessThanOrEqual(15);
    for (let i = 0; i + 60 <= 600; i++) expect(onsets.filter((o) => o >= i && o < i + 60).length).toBeLessThanOrEqual(3);
  });
  it('突き 2/1/2 で おしつづける: 2 回目の わざを 始めた ステップに 前の 点は ない（すぐ 消す）', () => {
    const rig = makeRig();
    rig.settings.bladeTech.thrust = { startup: 2, active: 1, recovery: 2 };
    const first = fire(rig, 'thrust', 5);
    expect(at(first, 3).snap.points).toHaveLength(3);
    expect(first.some((r) => r.snap.visible)).toBe(true);
    const second = fire(rig, 'thrust', 1);
    const s = second[0]!.snap;
    // 前の わざの 点（F2・F3）は のこらない。いまの 点は 新しい F1 の 1 こだけ
    expect(s.points).toHaveLength(1);
    expect(s.points[0]!.step).toBe(1);
    expect(s.points[0]!.age).toBe(0);
  });
  it('大けさぎりを F31 の おわりまで 進め、次の ステップで 持ちかえ → 点は F28〜F31 の 4 こ のまま・8 ステップめまで visible・9 ステップめに 消える', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 31);
    expect(at(rec, 31).snap.points.map((p) => p.step)).toEqual([28, 29, 30, 31]);
    const after: TrailSnapshot[] = [];
    for (let i = 0; i < 12; i++) {
      rig.trail.step(idleState('bokuto'), { ...at(rec, 31).body });
      after.push(rig.trail.snapshot());
    }
    for (let i = 0; i < 8; i++) {
      expect(after[i]!.points.map((p) => p.step), `${i + 1} ステップめ`).toEqual([28, 29, 30, 31]);
      expect(after[i]!.visible, `${i + 1} ステップめ`).toBe(true);
    }
    expect(after[8]!.visible, '9 ステップめ').toBe(false);
    expect(after[8]!.objects).toBe(0);
    expect(after[11]!.visible).toBe(false);
    // 31 の 点の 年れいが 9 になった ステップで 消える
    expect(after[8]!.points.find((p) => p.step === 31)!.age).toBe(9);
  });
  it('持ちかえで 取り消された 軌跡は 色が 持ちかえた 物では なく、わざを した 刀の まま 消える（item）', () => {
    const rig = makeRig();
    fire(rig, 'kesa', 31, { item: 'crystal_katana' });
    rig.trail.step(idleState('bokuto'), O);
    const s = rig.trail.snapshot();
    expect(s.visible).toBe(true);
    expect(s.item).toBe('crystal_katana');
    expect(s.color).toBe(rig.settings.bladeTrail.crystal_katana!.color);
  });
  it('わざの とちゅうの 持ちかえで 出す 前（書く時間より 前）に 取り消されたら 点は 0 のまま', () => {
    const rig = makeRig();
    fire(rig, 'kesa', 20);
    rig.trail.step(idleState('bokuto'), O);
    expect(rig.trail.snapshot().points).toHaveLength(0);
    expect(rig.trail.snapshot().visible).toBe(false);
  });
  it('一時停止中（step を 呼ばない）は snapshot が 変わらない', () => {
    const rig = makeRig();
    fire(rig, 'kesa', 33);
    const a = JSON.stringify(rig.trail.snapshot());
    expect(JSON.stringify(rig.trail.snapshot())).toBe(a);
  });
  it('わざが 自然に おわっても 軌跡は 年れい 9 で 消える', () => {
    const rig = makeRig();
    rig.settings.bladeTech.thrust = { startup: 2, active: 1, recovery: 2 };
    const rec = fire(rig, 'thrust', 5);
    const vis = visibleSteps(rec);
    expect(vis.length).toBeGreaterThan(0);
    const tail: boolean[] = [];
    for (let i = 0; i < 14; i++) {
      rig.trail.step(idleState('katana'), O);
      tail.push(rig.trail.snapshot().visible);
    }
    expect(tail.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(tail[13]).toBe(false);
  });
});

describe('CHAR-4 AC8 ほかの 道具', () => {
  it('なぎなた・つるはし・素手・弓（item が 刀でない / null）では visible が ずっと false', () => {
    for (const item of ['naginata', 'wood_pickaxe', 'yumi', null] as (ItemId | null)[]) {
      const rig = makeRig();
      for (let f = 1; f <= 60; f++) {
        rig.trail.step(item ? moveState(rig.settings, item, 'kesa', f, 0, O) : idleState(null), bodyOf(rig.settings, 'kesa', f, 0, O));
        const s = rig.trail.snapshot();
        expect(s.visible, `${item} F${f}`).toBe(false);
        expect(s.objects).toBe(0);
        expect(s.points).toHaveLength(0);
      }
    }
  });
});

describe('CHAR-4 AC9 絵に たよらない', () => {
  it('軌跡は 絵（sprite）を 受けとらない: データと 体の 位置だけで AC2・AC3 と 同じ 点', () => {
    // BladeTrail の 引数に sprite は ない。絵が 読みこみ中でも ?char=block でも 同じ 入力 → 同じ 出力
    const a = fire(makeRig(), 'kesa', 45);
    const b = fire(makeRig(), 'kesa', 45);
    expect(JSON.stringify(a.map((r) => r.snap))).toBe(JSON.stringify(b.map((r) => r.snap)));
    expect(visibleSteps(a)).toEqual(range(29, 42));
  });
});

describe('CHAR-4 AC14 軌跡の 物（性能）', () => {
  /** 軌跡が 持つ 頂点の 入れ物の バイト合計（帯 + 星。番号の 入れ物も 含む） */
  function bufferBytes(scene: THREE.Scene): number {
    let n = 0;
    scene.traverse((o) => {
      const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (!g) return;
      for (const a of Object.values(g.attributes)) n += (a as THREE.BufferAttribute).array.byteLength;
      if (g.index) n += g.index.array.byteLength;
    });
    return n;
  }
  const visibleObjects = (scene: THREE.Scene): number => {
    let n = 0;
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) n++;
    });
    return n;
  };

  it('出ていない とき 見える 物 0。出ている とき かたな 1 以下・三角形 288 以下', () => {
    const rig = makeRig();
    expect(visibleObjects(rig.scene)).toBe(0);
    const rec = fire(rig, 'kesa', 50);
    for (const r of rec) {
      if (!r.snap.visible) expect(r.snap.objects).toBe(0);
      else {
        expect(r.snap.objects, `F${r.f}`).toBeLessThanOrEqual(1);
        expect(r.snap.triangles, `F${r.f}`).toBeLessThanOrEqual(288);
      }
    }
    for (const f of range(29, 42)) expect(at(rec, f).snap.visible).toBe(true);
  });
  it('区切りが 36 まで のびる 設定でも 三角形 288 以下', () => {
    const rig = makeRig();
    rig.settings.bladeTech.kesa = { startup: 60, active: 30, recovery: 72 };
    const rec = fire(rig, 'kesa', 120);
    for (const r of rec) expect(r.snap.triangles).toBeLessThanOrEqual(288);
    expect(Math.max(...rec.map((r) => r.snap.segments))).toBeLessThanOrEqual(36);
  });
  it('きらきらの かたなは 物 2 以下・三角形 360 以下', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 50, { item: 'crystal_katana' });
    for (const r of rec) {
      expect(r.snap.objects).toBeLessThanOrEqual(2);
      expect(r.snap.triangles).toBeLessThanOrEqual(360);
    }
    expect(Math.max(...rec.map((r) => r.snap.objects))).toBe(2);
  });
  it('出ている 見える 物は シーンの 中で 軌跡の 物だけ（古い 帯・線は ない）。objects と 同じ', () => {
    const rig = makeRig();
    const rec = fire(rig, 'kesa', 34, { item: 'crystal_katana' });
    expect(visibleObjects(rig.scene)).toBe(at(rec, 34).snap.objects);
  });
  it('頂点の 入れ物の 合計 64 KiB 以下', () => {
    const rig = makeRig();
    expect(bufferBytes(rig.scene)).toBeLessThanOrEqual(64 * 1024);
  });
  it('わざを 10 回 くりかえしても シーンの 物の数と 入れ物の 大きさが 1 回目の あとと 同じ', () => {
    const rig = makeRig();
    let count1 = -1;
    let bytes1 = -1;
    const countAll = (): number => {
      let n = 0;
      rig.scene.traverse(() => n++);
      return n;
    };
    for (let i = 0; i < 10; i++) {
      const tech = TECHS[i % 3]!;
      fire(rig, tech, TICKS[tech], { item: i % 2 ? 'crystal_katana' : 'bokuto' });
      if (i === 0) {
        count1 = countAll();
        bytes1 = bufferBytes(rig.scene);
      }
    }
    expect(countAll()).toBe(count1);
    expect(bufferBytes(rig.scene)).toBe(bytes1);
  });
  it('dispose で シーンから 消える', () => {
    const rig = makeRig();
    rig.trail.dispose();
    let n = 0;
    rig.scene.traverse((o) => ((o as THREE.Mesh).isMesh ? n++ : 0));
    expect(n).toBe(0);
  });
});

