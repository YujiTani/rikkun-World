/**
 * #293 試作: 手が 地面を たたいた ときの 見た目（地面すれすれの 輪・土ぼこり・画面の ゆれ）。当たりは gashaBigShock.ts。
 *  ・輪は 十字（このゲームの 板の エフェクトの きまり）: よこ板 = 地面に ねた 輪、たて板 = 輪の ふちに 立つ ひくい 帯。内がわ 白 → 外がわ 茶色。
 *  ・土ぼこりは 小さい 箱を 1 つの InstancedMesh で（毎コマ new しない）。乱数は シード付き。
 *  ・画面の ゆれは カメラを ほんの 少し 回す（描く 前に かけて、カメラの 係が 動かして いなければ 次の 描く 前に もどす）。
 * 数は gashaBigTuning.ts の slam。
 */
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CircleGeometry, Color, CylinderGeometry, DoubleSide, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, Vector3,
  type Camera, type Scene,
} from 'three';
import { TUNE as T } from './gashaBigTuning';
import type { Impact } from './gashaBigShock';
import type { WarnMark } from './gashaBigActor';

const RINGS = 8;
const DUST = 160;
const DEG = Math.PI / 180;
const ROCKS = 24, TIERS = 3, CRACK_SLOTS = 2, CRACKS_MAX = 20;

/** 岩の とげ 1 本（噴き上がる → 立つ → しずむ）。見た目だけ */
interface Rock { x: number; y: number; z: number; h: number; w: number; yaw: number; delay: number; age: number }
/** 地面の ひび（外へ 広がる） */
interface CrackSet { imp: Impact | null; ang: number[]; kink: number[]; t0: number }

interface RingSlot { g: Group; flat: Mesh; band: Mesh; mats: MeshBasicMaterial[]; imp: Impact | null }
interface Mote { floor: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number }

function colorRing(geo: RingGeometry | CylinderGeometry, inner: Color, outer: Color, by: 'radius' | 'height'): void {
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  let lo = Infinity, hi = -Infinity;
  const val = (i: number) => (by === 'radius' ? Math.hypot(pos.getX(i), pos.getY(i)) : pos.getY(i));
  for (let i = 0; i < pos.count; i++) { const v = val(i); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const k = hi > lo ? (val(i) - lo) / (hi - lo) : 0;
    c.copy(inner).lerp(outer, by === 'radius' ? k : 1 - k);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
}

export class ShockFx {
  private readonly rings: RingSlot[] = [];
  private readonly dust: InstancedMesh;
  private readonly motes: Mote[] = [];
  private readonly geos: BufferGeometry[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private seed = 293;
  // 攻撃 1（両手たたきつけ）: 予告の 半円・岩・ひび
  private readonly warnG = new Group();
  private readonly warnFill: Mesh;
  private readonly warnEdge: Mesh;
  private readonly rocks: Rock[] = [];
  private readonly rockMesh: InstancedMesh;
  private readonly crackMesh: InstancedMesh;
  private readonly cracks: CrackSet[] = [];
  private clock = 0;
  // 画面の ゆれ
  private readonly shakeQ = new Quaternion();
  private readonly shakeInv = new Quaternion();
  private readonly after = new Quaternion();
  private readonly eul = new Euler();
  private shaken = false;

  constructor(private readonly scene: Scene, private readonly camera: Camera) {
    const S = T.slam;
    const inner = new Color(S.ringColorIn), outer = new Color(S.ringColorOut);
    const flatGeo = new RingGeometry(0.8, 1, 64, 1);
    flatGeo.rotateX(-Math.PI / 2);
    colorRing(flatGeo, inner, outer, 'radius');
    const bandGeo = new CylinderGeometry(1, 1, 1, 64, 1, true);
    bandGeo.translate(0, 0.5, 0);
    colorRing(bandGeo, inner, outer, 'height');
    this.geos.push(flatGeo, bandGeo);
    for (let i = 0; i < RINGS; i++) {
      const mk = () => new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, opacity: 0 });
      const mats = [mk(), mk()];
      const flat = new Mesh(flatGeo, mats[0]), band = new Mesh(bandGeo, mats[1]);
      flat.renderOrder = band.renderOrder = 5;
      const g = new Group();
      g.name = 'gashaShockRing';
      g.add(flat, band);
      g.visible = false;
      scene.add(g);
      this.rings.push({ g, flat, band, mats, imp: null });
    }
    const boxGeo = new BoxGeometry(1, 1, 1);
    this.geos.push(boxGeo);
    // 予告の 半円（地面に 平らな 赤い 印。中心 = 手の 落ちる 所、体の 反対の 前がわ）
    const fillGeo = new CircleGeometry(1, 48, 0, Math.PI);
    fillGeo.rotateX(Math.PI / 2);
    const edgeGeo = new RingGeometry(0.9, 1, 48, 1, 0, Math.PI);
    edgeGeo.rotateX(Math.PI / 2);
    const wc = new Color(T.slam2.warnColor);
    this.warnFill = new Mesh(fillGeo, new MeshBasicMaterial({ color: wc, transparent: true, depthWrite: false, side: DoubleSide, opacity: 0 }));
    this.warnEdge = new Mesh(edgeGeo, new MeshBasicMaterial({ color: new Color(0xffd0c0), transparent: true, depthWrite: false, side: DoubleSide, opacity: 0 }));
    this.warnFill.renderOrder = 4; this.warnEdge.renderOrder = 6;
    this.warnG.name = 'gashaWarnArc';
    this.warnG.add(this.warnFill, this.warnEdge);
    this.warnG.visible = false;
    scene.add(this.warnG);
    this.geos.push(fillGeo, edgeGeo);
    // 岩（ブロックの とげ）と ひび
    const unit = new BoxGeometry(1, 1, 1);
    unit.translate(0, 0.5, 0);
    this.geos.push(unit);
    this.rockMesh = new InstancedMesh(unit, new MeshBasicMaterial({ color: 0xffffff }), ROCKS * TIERS);
    this.rockMesh.name = 'gashaShockRocks'; this.rockMesh.count = 0; this.rockMesh.frustumCulled = false;
    scene.add(this.rockMesh);
    this.crackMesh = new InstancedMesh(unit, new MeshBasicMaterial({ color: 0x2a1e1a }), CRACK_SLOTS * CRACKS_MAX * 2);
    this.crackMesh.name = 'gashaShockCracks'; this.crackMesh.count = 0; this.crackMesh.frustumCulled = false;
    scene.add(this.crackMesh);
    for (let i = 0; i < CRACK_SLOTS; i++) this.cracks.push({ imp: null, ang: [], kink: [], t0: 0 });
    this.dust = new InstancedMesh(boxGeo, new MeshBasicMaterial({ color: 0xcdb38c }), DUST);
    this.dust.name = 'gashaShockDust';
    this.dust.count = 0;
    this.dust.frustumCulled = false;
    scene.add(this.dust);
  }

  private rnd(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  /** たたいた 所に 輪と 土ぼこりを 出す */
  spawn(imp: Impact): void {
    const S = T.slam, Q = T.slam2;
    const big = imp.kind === 'slam2';
    const slot = this.rings.find((r) => !r.imp) ?? this.rings.reduce((a, b) => ((a.imp?.age ?? 0) > (b.imp?.age ?? 0) ? a : b));
    slot.imp = imp;
    slot.g.visible = true;
    slot.g.position.set(imp.x, imp.y + 0.06, imp.z);
    const n = big ? Q.dustCount : imp.kind === 'slam' ? S.dustCount : S.tapDustCount;
    const r0 = big ? 4 : imp.kind === 'slam' ? 2.5 : 1.5;
    if (big) { this.spawnRocks(imp); this.spawnCracks(imp); }
    for (let i = 0; i < n; i++) {
      if (this.motes.length >= DUST) this.motes.shift();
      const a = this.rnd() * Math.PI * 2, sp = S.dustSpeed * (0.5 + this.rnd() * 0.7) * (big ? 1.5 : imp.kind === 'slam' ? 1 : 0.6);
      this.motes.push({
        floor: imp.y, x: imp.x + Math.sin(a) * r0, y: imp.y + 0.3, z: imp.z + Math.cos(a) * r0,
        vx: Math.sin(a) * sp, vy: sp * (0.4 + this.rnd() * 0.6), vz: Math.cos(a) * sp,
        age: 0, life: S.dustSec * (0.6 + this.rnd() * 0.5) * (big ? 1.6 : imp.kind === 'slam' ? 1 : 0.6), size: (big ? 2.2 : imp.kind === 'slam' ? 1.4 : 0.8) * (0.6 + this.rnd() * 0.6),
      });
    }
  }

  /** 岩の とげを 半円の 中に ばらまく（シード付き） */
  private spawnRocks(imp: Impact): void {
    const Q = T.slam2;
    const yaw = Math.atan2(imp.fx, imp.fz);
    for (let i = 0; i < Q.rockCount && this.rocks.length < ROCKS; i++) {
      // 手の まわり（半円の 前がわ）。近い 所ほど 高い とげ
      const r = Math.sqrt(this.rnd()) * Q.warnRadius * 0.95, a = (this.rnd() - 0.5) * Math.PI * 1.0;
      const lx = Math.sin(a) * r, lz = Math.cos(a) * r;
      const x = imp.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z = imp.z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
      const near = 1 - r / Q.warnRadius;
      const h = (Q.rockHeight[0] + (Q.rockHeight[1] - Q.rockHeight[0]) * (0.3 * this.rnd() + 0.7 * near));
      this.rocks.push({ x, y: imp.y, z, h, w: Q.rockWidth[0] + (Q.rockWidth[1] - Q.rockWidth[0]) * this.rnd(), yaw: this.rnd() * Math.PI, delay: this.rnd() * 0.25, age: 0 });
    }
  }

  /** 地面の ひびを 外へ（放射状。2 つに 折れた 線） */
  private spawnCracks(imp: Impact): void {
    const Q = T.slam2;
    const slot = this.cracks.find((c) => !c.imp) ?? this.cracks[0]!;
    slot.imp = imp; slot.t0 = this.clock;
    slot.ang = []; slot.kink = [];
    for (let i = 0; i < Math.min(CRACKS_MAX, Q.crackCount); i++) {
      slot.ang.push(((i + this.rnd() * 0.7) / Q.crackCount) * Math.PI * 2);
      slot.kink.push((this.rnd() - 0.5) * 0.7);
    }
  }

  /** 予告の 半円を 出す・動かす・消す（null） */
  setWarn(w: WarnMark | null): void {
    if (!w) { this.warnG.visible = false; return; }
    this.warnG.visible = true;
    this.warnG.position.set(w.x, w.y + 0.12, w.z);
    this.warnG.rotation.y = Math.atan2(w.fx, w.fz);
    this.warnG.scale.set(w.radius, 1, w.radius);
    const pulse = w.level > 0.75 ? 0.75 + 0.25 * Math.sin(this.clock * 22) : 1; // たたきつけが 近い ほど 点めつ
    (this.warnFill.material as MeshBasicMaterial).opacity = T.slam2.warnAlpha * (0.5 + 0.5 * w.level) * pulse;
    (this.warnEdge.material as MeshBasicMaterial).opacity = Math.min(1, 0.55 + 0.45 * w.level) * pulse;
  }

  /** 1 コマ（輪の 大きさ・うすさ、土ぼこり） */
  update(dt: number): void {
    const S = T.slam, Q = T.slam2;
    this.clock += dt;
    this.updateRocks(dt);
    this.updateCracks();
    for (const r of this.rings) {
      const imp = r.imp;
      if (!imp) continue;
      const slam = imp.kind !== 'tap';
      const big = imp.kind === 'slam2';
      const life = imp.kind === 'tap' ? S.tapRingSec : imp.life;
      if (imp.age >= life) { r.imp = null; r.g.visible = false; continue; }
      // 小さい 衝撃は 当たりは いっしゅん、見た目は すばやく 広がる
      const rad = Math.max(0.3, slam ? imp.r : imp.maxR * Math.min(1, imp.age / (S.tapRingSec * 0.5)));
      const fade = 1 - imp.age / life;
      r.flat.scale.set(rad, 1, rad);
      r.band.scale.set(rad, (big ? Q.ringBand : slam ? 1.6 : 0.8) * (0.5 + 0.5 * fade), rad);
      r.mats[0]!.opacity = Math.min(1, 1.2 * fade);
      r.mats[1]!.opacity = 0.75 * fade;
    }
    let n = 0;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const p = this.motes[i]!;
      p.age += dt;
      if (p.age >= p.life) { this.motes.splice(i, 1); continue; }
      p.vy -= 9 * dt;
      p.vx *= 1 - 1.5 * dt; p.vz *= 1 - 1.5 * dt;
      p.x += p.vx * dt; p.y = Math.max(p.floor + 0.2, p.y + p.vy * dt); p.z += p.vz * dt;
      const k = p.size * (1 - p.age / p.life);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q.identity(), this.s.set(k, k, k));
      this.dust.setMatrixAt(n++, this.m);
    }
    this.dust.count = n;
    if (n > 0) this.dust.instanceMatrix.needsUpdate = true;
  }

  private updateRocks(dt: number): void {
    const Q = T.slam2, tot = Q.rockRiseSec + Q.rockHoldSec + Q.rockSinkSec;
    const base = new Color(Q.rockColor), tip = new Color(Q.rockColorTip), col = new Color();
    const wid = [1, 0.62, 0.3], hei = [0.4, 0.35, 0.25];
    let n = 0;
    for (let i = this.rocks.length - 1; i >= 0; i--) { const r = this.rocks[i]!; r.age += dt; if (r.age - r.delay >= tot) this.rocks.splice(i, 1); }
    for (const r of this.rocks) {
      const t = r.age - r.delay;
      if (t < 0) continue;
      const g = t < Q.rockRiseSec ? 1 - Math.pow(1 - t / Math.max(1e-3, Q.rockRiseSec), 3) : t < Q.rockRiseSec + Q.rockHoldSec ? 1 : Math.max(0, 1 - (t - Q.rockRiseSec - Q.rockHoldSec) / Math.max(1e-3, Q.rockSinkSec));
      let y = r.y - (1 - g) * r.h;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), r.yaw);
      for (let k = 0; k < TIERS; k++) {
        const h = r.h * hei[k]!, w = r.w * wid[k]!;
        this.m.compose(this.v.set(r.x, y, r.z), this.q, this.s.set(w, h, w));
        this.rockMesh.setMatrixAt(n, this.m);
        this.rockMesh.setColorAt(n, col.copy(base).lerp(tip, k / (TIERS - 1)));
        y += h; n++;
      }
    }
    this.rockMesh.count = n;
    if (n > 0) { this.rockMesh.instanceMatrix.needsUpdate = true; if (this.rockMesh.instanceColor) this.rockMesh.instanceColor.needsUpdate = true; }
  }

  private updateCracks(): void {
    const Q = T.slam2;
    let n = 0;
    for (const c of this.cracks) {
      const imp = c.imp;
      if (!imp) continue;
      const age = this.clock - c.t0;
      if (age >= Q.crackSec) { c.imp = null; continue; }
      const grow = Math.min(1, age / 0.9), fade = 1 - Math.max(0, (age - Q.crackSec * 0.5) / (Q.crackSec * 0.5));
      const len = Q.crackLen * grow, wd = Q.crackWidth * fade;
      for (let i = 0; i < c.ang.length; i++) {
        let a = c.ang[i]!;
        let px = imp.x + Math.cos(a) * 2, pz = imp.z + Math.sin(a) * 2;
        for (let seg = 0; seg < 2; seg++) {
          const L = Math.max(0.01, (seg === 0 ? 0.55 : 0.45) * len);
          // ひびの 箱は +z に のびる。向き a（x = cos、z = sin）の three の yaw は atan2(dx, dz)
          this.q.setFromAxisAngle(this.v.set(0, 1, 0), Math.atan2(Math.cos(a), Math.sin(a)));
          this.m.compose(this.v.set(px + Math.cos(a) * L / 2, imp.y + 0.04, pz + Math.sin(a) * L / 2), this.q, this.s.set(wd, 0.06, L));
          this.crackMesh.setMatrixAt(n++, this.m);
          px += Math.cos(a) * L; pz += Math.sin(a) * L; a += c.kink[i]!;
        }
      }
    }
    this.crackMesh.count = n;
    if (n > 0) this.crackMesh.instanceMatrix.needsUpdate = true;
  }

  /** 描く 前に 画面を ゆらす（度）。カメラの 係が この 間に 動かして いなければ 前の ゆれを もどして から かける */
  applyShake(deg: number, time: number): void {
    const cam = this.camera;
    if (this.shaken && cam.quaternion.equals(this.after)) cam.quaternion.multiply(this.shakeInv);
    this.shaken = false;
    if (!(deg > 0)) return;
    const a = deg * DEG;
    this.eul.set(a * Math.sin(time * 61 + 1.3), a * Math.sin(time * 47), 0, 'YXZ');
    this.shakeQ.setFromEuler(this.eul);
    cam.quaternion.multiply(this.shakeQ);
    this.shakeInv.copy(this.shakeQ).invert();
    this.after.copy(cam.quaternion);
    this.shaken = true;
  }

  /** いま 見えて いる 輪と 土ぼこりの 数（テスト・info 用） */
  counts(): { rings: number; dust: number } {
    return { rings: this.rings.filter((r) => r.imp).length, dust: this.dust.count };
  }

  /** 攻撃 1 の 見た目の 数（テスト用）: 予告の 半円・岩の 箱・ひびの 箱 */
  bigCounts(): { warn: boolean; rocks: number; cracks: number } {
    return { warn: this.warnG.visible, rocks: this.rockMesh.count, cracks: this.crackMesh.count };
  }

  dispose(): void {
    for (const r of this.rings) { this.scene.remove(r.g); r.mats.forEach((m) => m.dispose()); }
    for (const o of [this.warnG, this.rockMesh, this.crackMesh]) this.scene.remove(o);
    for (const o of [this.warnFill, this.warnEdge]) (o.material as MeshBasicMaterial).dispose();
    (this.rockMesh.material as MeshBasicMaterial).dispose(); (this.crackMesh.material as MeshBasicMaterial).dispose();
    this.rockMesh.dispose(); this.crackMesh.dispose();
    this.scene.remove(this.dust);
    (this.dust.material as MeshBasicMaterial).dispose();
    this.dust.dispose();
    this.geos.forEach((g) => g.dispose());
  }
}
