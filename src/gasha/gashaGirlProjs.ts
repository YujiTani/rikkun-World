/**
 * #308 gashaGirl.ts を 分けた もの: 魔法 3「火の玉」・魔法 4「青い 波」の 弾と、当たった ときの 輪。パリィで はね返す。
 */
import { Mesh, Vector3, type Group, type MeshBasicMaterial, type Scene } from 'three';
import type { GashaGirlDeps } from './gashaGirlTypes';
import type { GirlGfx } from './gashaGirlGfx';
import type { ParticlePool } from './gashaGirlParticles';
import type { GirlSfx } from './gashaGirlSfx';
import { D2R, easeOut } from './gashaGirlMath';
import { TUNE as T } from './gashaGirlTuning';

/** 数え（撮影・テストで 読む） */
export interface GirlStats {
  fbHit: number; fbMiss: number; waveHit: number; waveMiss: number; fired: number; hits: number; ringHits: number; vortexHits: number; swHits: number;
  parried: number; parryEarly: number; reflected: number; reflectHits: number;
}

export interface ProjsEnv {
  scene: Scene;
  gfx: GirlGfx;
  add: ParticlePool;
  smoke: ParticlePool;
  vr(a: number, b: number): number;
  vrng(): number;
  groundY: GashaGirlDeps['groundY'];
  solid: GashaGirlDeps['solid'];
  player: GashaGirlDeps['player'];
  /** 少女の 足もと（はね返した 弾の 行き先と 当たり） */
  pivot: Group;
  H: number;
  stats: GirlStats;
  /** パリィに 聞く（当たる 瞬間） */
  askParry(by: 'attack' | 'fireball', at: { x: number; y: number; z: number }): { result: 'success' | 'early' | 'fail' | 'none'; amount: number };
  hurtPlayer(from: { x: number; y: number; z: number }, amount?: number): boolean;
  /** はね返した 弾が 少女に 当たった（ひるませる） */
  onGirlHit(): void;
  /** 効果音は あとで 作られる ので 使う ときに 取りだす */
  sfx(): Pick<GirlSfx, 's3Hit'>;
}

export interface Proj { on: boolean; kind: 0 | 1; pos: Vector3; dir: Vector3; age: number; homing: boolean; org: Vector3; perp: Vector3; ph: number; amp: number; reflected: boolean; }

export function chestOf(p: { x: number; y: number; z: number }, out: Vector3): Vector3 { return out.set(p.x, p.y + 1.2, p.z); }

export function createProjs(env: ProjsEnv) {
  const { scene, gfx, add, smoke, vr, vrng, pivot, H, stats, askParry, hurtPlayer } = env;
  const { basic, flat, ringTex, disc } = gfx;
  const projs: Proj[] = [];
  for (let i = 0; i < 44; i++) projs.push({ on: false, kind: 0, pos: new Vector3(), dir: new Vector3(), age: 0, homing: true, org: new Vector3(), perp: new Vector3(), ph: 0, amp: 0, reflected: false });
  const burstRing = new Mesh(disc, basic(ringTex));
  void burstRing;
  const bursts: { mesh: Mesh; mat: MeshBasicMaterial; t: number; size: number; on: boolean }[] = [];
  for (let i = 0; i < 12; i++) {
    const mat = basic(ringTex, 0xffffff, 0);
    const mesh = flat(mat, scene);
    bursts.push({ mesh, mat, t: 0, size: 1, on: false });
  }
  let nBurst = 0;
  const burst = (p: Vector3, kind: 0 | 1) => {
    if (kind === 0) env.sfx().s3Hit();
    const b = bursts[nBurst++ % bursts.length]!;
    b.on = true; b.t = 0; b.size = kind === 0 ? 1.4 : 0.8;
    b.mat.color.setHex(kind === 0 ? 0xff8a20 : 0x60b8ff);
    b.mesh.position.set(p.x, Math.max(p.y, env.groundY(Math.floor(p.x), Math.floor(p.z)) + 1.06), p.z);
    b.mesh.visible = true;
    const n = kind === 0 ? 14 : 8;
    add.emit(p.x, p.y, p.z, 0, 0, 0, 0.25, kind === 0 ? 2.6 : 1.4, 0.4, kind === 0 ? 0xfff0c0 : 0xe0f8ff, kind === 0 ? 0xff7010 : 0x3070ff);
    for (let k = 0; k < n; k++) add.emit(p.x, p.y, p.z, vr(-2.5, 2.5), vr(0.5, 3.5), vr(-2.5, 2.5), vr(0.4, 0.8), 0.14, 0.04, kind === 0 ? 0xffc060 : 0xb0e0ff, kind === 0 ? 0xc03000 : 0x2040c0, -6, 0.5);
    if (kind === 0) for (let k = 0; k < 4; k++) smoke.emit(p.x + vr(-0.3, 0.3), p.y, p.z + vr(-0.3, 0.3), vr(-0.4, 0.4), vr(0.6, 1.4), vr(-0.4, 0.4), 0.9, 0.5, 1.2, 0x40281a, 0x100808, 0, 0.5);
  };
  const chest = new Vector3(), want = new Vector3(), axis = new Vector3();
  /** パリィ成功: はね返す（少女へ 向き直し・追尾 おわり・プレイヤーの もの） */
  const reflectProj = (q: Proj) => {
    want.set(pivot.position.x, pivot.position.y + H * 0.55, pivot.position.z).sub(q.pos);
    if (want.lengthSq() < 1e-6) want.copy(q.dir).negate();
    q.dir.copy(want).normalize(); q.homing = false; q.reflected = true; q.amp = 0; q.age = 0; stats.reflected++;
    add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, 0.25, 2.4, 0.4, 0xffffff, 0xfff0c0);
  };
  const updateProjs = (dt: number) => {
    const pl = env.player();
    chestOf(pl, chest);
    for (const q of projs) {
      if (!q.on) continue;
      q.age += dt;
      if (q.reflected) { // はね返した 弾（プレイヤーの もの）。少女に 当たったら ひるませる
        q.pos.addScaledVector(q.dir, (q.kind === 0 ? T.s3.speed : T.s4.speed) * T.parry.reflectSpeedMul * dt);
        const c0 = q.kind === 0 ? [0xffffff, 0xffe8b0, 0xffc060] : [0xffffff, 0xd0f8ff, 0x90e0ff];
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 0.7, 0.7, c0[0]!, c0[1]!);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 1.4, 1.4, c0[2]!, c0[2]!);
        add.emit(q.pos.x + vr(-0.06, 0.06), q.pos.y + vr(-0.06, 0.06), q.pos.z + vr(-0.06, 0.06), vr(-0.2, 0.2), vr(0, 0.5), vr(-0.2, 0.2), 0.4, 0.5, 0.08, c0[1]!, c0[2]!);
        const gx = q.pos.x - pivot.position.x, gz = q.pos.z - pivot.position.z;
        const onGirl = pivot.visible && Math.hypot(gx, gz) < T.parry.girlHitR && q.pos.y > pivot.position.y - 0.2 && q.pos.y < pivot.position.y + H + 0.3;
        const gr = env.solid(Math.floor(q.pos.x), Math.floor(q.pos.y), Math.floor(q.pos.z));
        if (onGirl || gr || q.age >= T.s3.lifeSec) {
          q.on = false; burst(q.pos, q.kind);
          if (onGirl) { stats.reflectHits++; env.onGirlHit(); }
        }
        continue;
      }
      if (q.kind === 0) {
        if (q.homing && (q.age > T.s3.homingMaxSec || q.pos.distanceTo(chest) < T.s3.stopNear)) q.homing = false;
        if (q.homing) {
          want.copy(chest).sub(q.pos).normalize();
          const ang = Math.acos(Math.min(1, Math.max(-1, q.dir.dot(want))));
          const turn = (T.s3.turnDeg * D2R) * dt;
          if (ang <= turn) q.dir.copy(want);
          else { axis.crossVectors(q.dir, want); if (axis.lengthSq() > 1e-8) q.dir.applyAxisAngle(axis.normalize(), turn); }
          q.dir.normalize();
        }
        q.pos.addScaledVector(q.dir, T.s3.speed * dt);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 0.55, 0.55, 0xfff6c8, 0xffe080);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 1.2, 1.2, 0xff8a20, 0xff6010);
        for (let k = 0; k < 2; k++) add.emit(q.pos.x + vr(-0.06, 0.06), q.pos.y + vr(-0.06, 0.06), q.pos.z + vr(-0.06, 0.06), vr(-0.2, 0.2), vr(0, 0.5), vr(-0.2, 0.2), 0.4, 0.5, 0.08, 0xff9a30, 0x601000);
        const hit = q.pos.distanceTo(chest) < T.s3.hitR;
        const ground = env.solid(Math.floor(q.pos.x), Math.floor(q.pos.y), Math.floor(q.pos.z));
        if (hit) { const r = askParry('fireball', q.pos); if (r.result === 'success') { reflectProj(q); continue; } q.on = false; burst(q.pos, 0); stats.fbHit++; if (r.result === 'early') stats.parryEarly++; hurtPlayer(q.pos, r.result === 'early' ? r.amount : T.damage.heart); continue; }
        if (ground || q.age >= T.s3.lifeSec) { q.on = false; burst(q.pos, 0); stats.fbMiss++; }
      } else {
        const d = T.s4.speed * q.age;
        if (q.homing && q.org.distanceTo(chest) < T.s4.stopNear) q.homing = false; // 3 ブロックより 近づいたら 追尾 おわり
        if (q.homing) { // ごく 弱い ホーミング（25°/秒）
          want.copy(chest).sub(q.org).normalize();
          const ang = Math.acos(Math.min(1, Math.max(-1, q.dir.dot(want))));
          const turn = (T.s4.turnDeg * D2R) * dt;
          if (ang <= turn) q.dir.copy(want);
          else { axis.crossVectors(q.dir, want); if (axis.lengthSq() > 1e-8) q.dir.applyAxisAngle(axis.normalize(), turn); }
          q.dir.normalize(); q.perp.set(-q.dir.z, 0, q.dir.x).normalize();
        }
        q.org.addScaledVector(q.dir, T.s4.speed * dt); // 中心線は すすむ。そこから 左右に ゆれる
        q.pos.copy(q.org).addScaledVector(q.perp, q.amp * Math.sin(Math.PI * 2 * T.s4.hz * q.age + q.ph));
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 0.5, 0.5, 0xeaffff, 0xa0e0ff);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 1.0, 1.0, 0x60b0ff, 0x3070ff);
        for (let k = 0; k < 2; k++) add.emit(q.pos.x, q.pos.y, q.pos.z, vr(-0.15, 0.15), vr(-0.15, 0.15), vr(-0.15, 0.15), 0.55, 0.45, 0.08, 0x4aa8ff, 0x1020a0);
        if (vrng() < 0.35) add.emit(q.pos.x, q.pos.y, q.pos.z, vr(-0.5, 0.5), vr(-0.4, 0.4), vr(-0.5, 0.5), 0.9, 0.14, 0.04, 0x90d0ff, 0x2040c0);
        const hit = q.pos.distanceTo(chest) < T.s4.hitR;
        const ground = env.solid(Math.floor(q.pos.x), Math.floor(q.pos.y), Math.floor(q.pos.z));
        if (hit) { const r = askParry('fireball', q.pos); if (r.result === 'success') { reflectProj(q); continue; } q.on = false; burst(q.pos, 1); stats.waveHit++; if (r.result === 'early') stats.parryEarly++; hurtPlayer(q.pos, r.result === 'early' ? r.amount : T.damage.heart); continue; }
        if (ground || d >= T.s4.range || q.age >= T.s4.lifeSec) { q.on = false; if (ground) burst(q.pos, 1); stats.waveMiss++; }
      }
    }
    for (const b of bursts) {
      if (!b.on) continue;
      b.t += dt;
      const u = b.t / 0.45;
      if (u >= 1) { b.on = false; b.mesh.visible = false; continue; }
      const s = b.size * (0.2 + 0.8 * easeOut(u));
      b.mesh.scale.set(s, 1, s); b.mat.opacity = 1 - u;
    }
  };
  const spawnProj = (kind: 0 | 1, from: Vector3, dir: Vector3, amp = 0, ph = 0) => {
    const q = projs.find((p) => !p.on);
    if (!q) return;
    q.on = true; q.kind = kind; q.age = 0; q.homing = true; q.pos.copy(from); q.org.copy(from); q.dir.copy(dir).normalize();
    q.perp.set(-q.dir.z, 0, q.dir.x).normalize(); q.amp = amp; q.ph = ph; q.reflected = false; stats.fired++;
  };
  return { list: projs, bursts, update: updateProjs, spawn: spawnProj };
}
