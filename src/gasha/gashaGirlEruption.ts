/**
 * #308 gashaGirl.ts を 分けた もの: 魔法 1「噴き出す」（紫の 輪 → 炎の 刃。輪は 3 つ）。
 */
import { Group, type Scene } from 'three';
import type { GashaGirlDeps } from './gashaGirlTypes';
import type { GirlGfx } from './gashaGirlGfx';
import type { ParticlePool } from './gashaGirlParticles';
import type { GirlSfx } from './gashaGirlSfx';
import { clamp01, easeOut, fwdOf } from './gashaGirlMath';
import { TUNE as T } from './gashaGirlTuning';

export interface EruptEnv {
  scene: Scene;
  gfx: GirlGfx;
  add: ParticlePool;
  smoke: ParticlePool;
  vr(a: number, b: number): number;
  vrng(): number;
  /** 魔法の 場所を 決める 乱数（シード付き） */
  rng(): number;
  groundY: GashaGirlDeps['groundY'];
  player: GashaGirlDeps['player'];
  /** 効果音は あとで 作られる ので 使う ときに 取りだす */
  sfx(): Pick<GirlSfx, 's1'>;
}

export function createEruptions(env: EruptEnv) {
  const { scene, gfx, add, smoke, vr, vrng } = env;
  const { basic, basicN, flat, crossed, ringTex, glowTex, bladeTex } = gfx;
  const bladeMat = basic(bladeTex, 0xffffff, 0.4);
  const makeEruption = () => {
    const E = { root: new Group(), t: -1, rad: 0, hitEnd: 0, count: 6, x: 0, y: 0, z: 0,
      blades: [] as { outer: Group; inner: Group; h: number; w: number; start: number; lean: number; ph: number }[] };
    scene.add(E.root);
    const ringMat = basicN(ringTex, 0xa040ff, 0), flashMat = basicN(glowTex, 0xd0a0ff, 0); // 輪の 塗りと 閃光は 通常合成（3 つ 重なっても むらさきが 見える）
    const ring = flat(ringMat, E.root), flash = flat(flashMat, E.root);
    for (let i = 0; i < 12; i++) {
      const outer = new Group(); const inner = crossed(bladeMat, outer); outer.add(inner); E.root.add(outer); outer.visible = false;
      E.blades.push({ outer, inner, h: 2, w: 0.5, start: 0.9, lean: 0.3, ph: 0 });
    }
    const fire = (x: number, z: number) => {
      E.x = x; E.z = z; E.y = env.groundY(Math.floor(x), Math.floor(z)) + 1.04;
      E.root.position.set(x, E.y, z); E.t = 0; E.hitEnd = 0;
      E.count = 10 + Math.floor(vrng() * 3);
      E.blades.forEach((b, i) => {
        b.h = vr(3.0, 4.0); b.w = vr(0.7, 0.9); b.start = T.s1.delaySec + vr(0, 0.06); b.lean = vr(0.05, 0.14); b.ph = vr(0, 6);
        const ph = i * 2.39996 + vr(-0.2, 0.2), r = T.s1.radius * 0.85 * Math.sqrt((i + 0.5) / E.count); // 輪の はんい いっぱいに ばらまく
        b.outer.position.set(Math.cos(ph) * r, 0, -Math.sin(ph) * r);
        b.outer.rotation.y = ph;
        if (i < E.count) E.hitEnd = Math.max(E.hitEnd, b.start + T.s1.activeSec);
      });
    };
    const hitActive = () => E.t >= 0 && E.t < E.hitEnd;
    const update = (dt: number) => {
      if (E.t < 0) return;
      const t = (E.t += dt);
      if (t > 2.2) { E.t = -1; E.root.visible = false; ring.visible = flash.visible = false; E.blades.forEach((b) => (b.outer.visible = false)); return; }
      E.root.visible = true;
      const rad = t < 0.35 ? T.s1.radius * easeOut(t / 0.35) : T.s1.radius + 0.4 * ((t - 0.35) / 1.85);
      E.rad = rad;
      ring.visible = true; ring.scale.set(rad, 1, rad);
      const hitOn = t < E.hitEnd; // 魔法陣が 出てから 炎が おわるまで 輪の 中は あぶない（ふちを 明るく ゆらす）
      ringMat.opacity = 0.5 * Math.min(1, t / 0.25) * (hitOn ? 0.95 + 0.05 * Math.sin(t * 25) : 0.9) * (t > 1.4 ? 1 - (t - 1.4) / 0.8 : 1);
      ringMat.color.setHex(hitOn ? 0xe098ff : 0xa040ff);
      const fl = clamp01(1 - Math.abs(t - (T.s1.delaySec - 0.05)) / 0.2);
      flash.visible = fl > 0; flash.scale.setScalar(1 + 3 * easeOut((t - 0.25) / 0.4)); flashMat.opacity = fl * 0.5 / Math.max(1, T.s1.rings); // 閃光の 強さは 輪の 数で わる
      if (t < T.s1.delaySec) for (let k = 0; k < 4; k++) { // 火の粉が 内向きに あつまる
        const a = vr(0, Math.PI * 2), r = vr(T.s1.radius * 1.1, T.s1.radius * 1.3);
        add.emit(E.x + Math.cos(a) * r, E.y + vr(0, 0.5), E.z + Math.sin(a) * r, -Math.cos(a) * 8, 0.3, -Math.sin(a) * 8, 0.45, 0.14, 0.06, 0xf0e0ff, 0x9040e0);
      }
      for (let i = 0; i < E.blades.length; i++) {
        const b = E.blades[i]!;
        const on = i < E.count && t > b.start && t < b.start + T.s1.activeSec;
        b.outer.visible = on; b.inner.visible = on;
        if (!on) continue;
        const u = t - b.start;
        const g = u < 0.2 ? easeOut(u / 0.2) : u > 0.8 ? 1 - (u - 0.8) / 0.3 : 1;
        const fk = 1 + 0.07 * Math.sin(t * 28 + b.ph);
        b.inner.scale.set(b.w * g + 0.05, Math.max(0.01, b.h * g * fk), b.w * g + 0.05);
        b.inner.rotation.z = -(b.lean * (0.4 + 0.6 * g));
      }
      if (t > T.s1.delaySec + 0.05 && t < 1.2) for (let k = 0; k < 3; k++) add.emit(E.x + vr(-T.s1.radius * 0.8, T.s1.radius * 0.8), E.y + vr(0, 1), E.z + vr(-T.s1.radius * 0.8, T.s1.radius * 0.8), vr(-0.8, 0.8), vr(1.5, 4), vr(-0.8, 0.8), 0.8, 0.12, 0.04, 0xe0b0ff, 0x6020b0, -1);
      if (t > 0.7 && t < 1.7) {
        smoke.emit(E.x + vr(-T.s1.radius * 0.7, T.s1.radius * 0.7), E.y + 0.3, E.z + vr(-T.s1.radius * 0.7, T.s1.radius * 0.7), vr(-0.5, 0.5), vr(1, 2), vr(-0.5, 0.5), 1.1, 0.5, 1.3, 0x2a1838, 0x050208, 0, 0.5);
        add.emit(E.x + vr(-T.s1.radius * 0.8, T.s1.radius * 0.8), E.y + 0.3, E.z + vr(-T.s1.radius * 0.8, T.s1.radius * 0.8), vr(-0.6, 0.6), vr(2, 4), vr(-0.6, 0.6), 1, 0.1, 0.03, 0xd8a0ff, 0x501090);
      }
    };
    return { fire, update, hitActive, e: E };
  };
  const erups = [makeEruption(), makeEruption(), makeEruption()];
  /** 3 つの 輪: 足もと、進む 方向の 約 3 ブロック先、その 先の 左右どちらか */
  const fireEruptions = () => {
    const p = env.player();
    let dx = p.vx, dz = p.vz;
    if (Math.hypot(dx, dz) < 0.5) { const f = fwdOf(p); dx = f.fx; dz = f.fz; }
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const sgn = env.rng() < 0.5 ? -1 : 1;
    const A = T.s1.ahead, S = T.s1.side, n = T.s1.rings;
    if (n > 0) env.sfx().s1(T.s1.delaySec); // 予告（輪）→ 噴出。輪が 3 つでも 1 回ずつ
    if (n > 0) erups[0]!.fire(p.x, p.z);
    if (n > 1) erups[1]!.fire(p.x + dx * A, p.z + dz * A);
    if (n > 2) erups[2]!.fire(p.x + dx * A - dz * S * sgn, p.z + dz * A + dx * S * sgn);
  };
  return { list: erups, fire: fireEruptions };
}
