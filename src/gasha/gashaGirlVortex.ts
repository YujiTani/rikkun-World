/**
 * #308 gashaGirl.ts を 分けた もの: 魔法 2「周囲攻撃」（渦 9 か所。3×3 の 格子。渦と 渦の すき間に にげる）。
 */
import { Group, type Scene } from 'three';
import type { GashaGirlDeps } from './gashaGirlTypes';
import type { GirlGfx } from './gashaGirlGfx';
import type { ParticlePool } from './gashaGirlParticles';
import type { GirlSfx } from './gashaGirlSfx';
import { easeOut } from './gashaGirlMath';
import { TUNE as T } from './gashaGirlTuning';

export interface VortexEnv {
  scene: Scene;
  gfx: GirlGfx;
  add: ParticlePool;
  vr(a: number, b: number): number;
  groundY: GashaGirlDeps['groundY'];
  /** 少女の 足もと（格子は 少女を 中心に する。位置と 向きは 毎回 読む） */
  pivot: Group;
  /** 効果音は あとで 作られる ので 使う ときに 取りだす */
  sfx(): Pick<GirlSfx, 's2Vortex'>;
}

export function createVortices(env: VortexEnv) {
  const { scene, gfx, add, vr, pivot } = env;
  const { basic, flat, crossed, ringTex, vortexTex, glowTex, flameTex } = gfx;
  const warnMat = basic(ringTex, 0xff9040, 0.3);
  const makeVortex = () => {
    const V = { root: new Group(), spin: new Group(), t: -1, x: 0, y: 0, z: 0, r: 1 };
    V.root.add(V.spin); scene.add(V.root);
    const m1 = basic(vortexTex, 0xffffff, 0), m2 = basic(vortexTex, 0xffc080, 0), cMat = basic(glowTex, 0xfff0c0, 0), tMat = basic(flameTex, 0xffffff, 0);
    const d1 = flat(m1, V.spin), d2 = flat(m2, V.spin), core = flat(cMat, V.root);
    d2.position.y = 0.02;
    const tongues: { g: Group; r: number; h: number; ph: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const g = crossed(tMat, V.spin);
      const a = (i / 10) * Math.PI * 2 + vr(-0.1, 0.1);
      tongues.push({ g, r: vr(0.88, 1.0), h: vr(0.7, 1.5), ph: a });
      g.position.set(Math.cos(a), 0, Math.sin(a));
    }
    const warn = flat(warnMat, scene);
    const fire = (x: number, z: number) => {
      V.x = x; V.z = z; V.y = env.groundY(Math.floor(x), Math.floor(z)) + 1.05; V.r = T.s2.radius;
      V.root.position.set(x, V.y, z); V.t = 0;
    };
    const showWarn = (on: boolean, x = 0, z = 0) => {
      warn.visible = on;
      if (on) { warn.position.set(x, env.groundY(Math.floor(x), Math.floor(z)) + 1.05, z); warn.scale.set(T.s2.radius, 1, T.s2.radius); }
    };
    const hits = (px: number, pz: number) => V.t >= 0.1 && V.t < T.s2.hitSec && Math.hypot(px - V.x, pz - V.z) < V.r * (V.t < 0.3 ? Math.max(0.05, easeOut(V.t / 0.3)) : 1);
    const update = (dt: number) => {
      if (V.t < 0) return;
      const t = (V.t += dt);
      if (t > T.s2.totalSec) { V.t = -1; V.root.visible = false; d1.visible = d2.visible = core.visible = false; tongues.forEach((q) => (q.g.visible = false)); return; }
      V.root.visible = true;
      const e = t < 0.3 ? easeOut(t / 0.3) : 1;
      const tail = t > T.s2.hitSec ? 1 - (t - T.s2.hitSec) / (T.s2.totalSec - T.s2.hitSec) : 1;
      const a = Math.min(1, t / 0.2) * tail;
      const r = V.r * Math.max(0.05, e);
      V.spin.rotation.y = t * 3;
      d1.visible = d2.visible = core.visible = true;
      d1.scale.set(r, 1, r); d2.scale.set(r * 0.9, 1, r * 0.9); d2.rotation.y = -t * 5; // 逆まわり
      m1.opacity = a * 0.95; m2.opacity = a * 0.5; tMat.opacity = a;
      core.scale.setScalar(0.4 + 0.1 * Math.sin(t * 20)); cMat.opacity = a;
      for (const q of tongues) {
        q.g.visible = true;
        q.g.position.set(Math.cos(q.ph) * r * q.r, 0, Math.sin(q.ph) * r * q.r);
        q.g.rotation.y = -q.ph;
        const f = (1 + 0.3 * Math.sin(t * 17 + q.ph * 5)) * e * tail;
        q.g.scale.set(0.8, Math.max(0.01, q.h * f), 0.8);
      }
      if (t < T.s2.hitSec) for (let k = 0; k < 2; k++) {
        const an = vr(0, Math.PI * 2), rr = vr(0.3, V.r) * e;
        add.emit(V.x + Math.cos(an) * rr, V.y + 0.1, V.z + Math.sin(an) * rr, -Math.sin(an) * 2, vr(1.5, 3.5), Math.cos(an) * 2, 0.7, 0.12, 0.04, 0xffd070, 0xc03000, -1);
      }
    };
    return { fire, update, showWarn, hits, v: V };
  };
  const vortices = Array.from({ length: 25 }, () => makeVortex()) // grid は 5 まで;
  /** 少女を 中心に した 格子の 渦の 位置（少女の 向きに そろえる。ずらさない） */
  const gridCenters = (cx: number, cz: number, yaw: number) => {
    const n = T.s2.grid, out: { x: number; z: number }[] = [];
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = (i - (n - 1) / 2) * T.s2.spacing, b = (j - (n - 1) / 2) * T.s2.spacing;
      out.push({ x: cx + rx * a + fx * b, z: cz + rz * a + fz * b });
    }
    return out;
  };
  const fireVortices = () => { env.sfx().s2Vortex(); fireVorticesAt(); }; // 渦は 9 か所でも 音は 1 回
  const fireVorticesAt = () => gridCenters(pivot.position.x, pivot.position.z, pivot.rotation.y).forEach((c, i) => vortices[i]?.fire(c.x, c.z));
  const showVortexWarn = (on: boolean) => {
    const cs = gridCenters(pivot.position.x, pivot.position.z, pivot.rotation.y);
    vortices.forEach((v, i) => v.showWarn(on && i < cs.length, cs[i]?.x, cs[i]?.z));
  };
  return { list: vortices, warnMat, fire: fireVortices, showWarn: showVortexWarn };
}
