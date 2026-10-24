/**
 * #293 試作: 手が 地面を たたいた ときの 見た目（地面すれすれの 輪・土ぼこり・画面の ゆれ）。当たりは gashaBigShock.ts。
 *  ・輪は 十字（このゲームの 板の エフェクトの きまり）: よこ板 = 地面に ねた 輪、たて板 = 輪の ふちに 立つ ひくい 帯。内がわ 白 → 外がわ 茶色。
 *  ・土ぼこりは 小さい 箱を 1 つの InstancedMesh で（毎コマ new しない）。乱数は シード付き。
 *  ・画面の ゆれは カメラを ほんの 少し 回す（描く 前に かけて、カメラの 係が 動かして いなければ 次の 描く 前に もどす）。
 * 数は gashaBigTuning.ts の slam。
 */
import {
  BoxGeometry, BufferAttribute, Color, CylinderGeometry, DoubleSide, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, Vector3,
  type Camera, type Scene,
} from 'three';
import { TUNE as T } from './gashaBigTuning';
import type { Impact } from './gashaBigShock';

const RINGS = 8;
const DUST = 160;
const DEG = Math.PI / 180;

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
  private readonly geos: (RingGeometry | CylinderGeometry | BoxGeometry)[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private seed = 293;
  // 画面の ゆれ
  private readonly shakeQ = new Quaternion();
  private readonly shakeInv = new Quaternion();
  private readonly after = new Quaternion();
  private readonly eul = new Euler();
  private shaken = false;

  constructor(private readonly scene: Scene, private readonly camera: Camera) {
    const S = T.slam;
    const inner = new Color(S.ringColorIn), outer = new Color(S.ringColorOut);
    const flatGeo = new RingGeometry(0.86, 1, 64, 1);
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
    this.dust = new InstancedMesh(boxGeo, new MeshBasicMaterial({ color: 0xb89e78 }), DUST);
    this.dust.name = 'gashaShockDust';
    this.dust.count = 0;
    this.dust.frustumCulled = false;
    scene.add(this.dust);
  }

  private rnd(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  /** たたいた 所に 輪と 土ぼこりを 出す */
  spawn(imp: Impact): void {
    const S = T.slam;
    const slot = this.rings.find((r) => !r.imp) ?? this.rings.reduce((a, b) => ((a.imp?.age ?? 0) > (b.imp?.age ?? 0) ? a : b));
    slot.imp = imp;
    slot.g.visible = true;
    slot.g.position.set(imp.x, imp.y + 0.06, imp.z);
    const n = imp.kind === 'slam' ? S.dustCount : S.tapDustCount;
    const r0 = imp.kind === 'slam' ? 2.5 : 1.5;
    for (let i = 0; i < n; i++) {
      if (this.motes.length >= DUST) this.motes.shift();
      const a = this.rnd() * Math.PI * 2, sp = S.dustSpeed * (0.5 + this.rnd() * 0.7) * (imp.kind === 'slam' ? 1 : 0.6);
      this.motes.push({
        floor: imp.y, x: imp.x + Math.sin(a) * r0, y: imp.y + 0.3, z: imp.z + Math.cos(a) * r0,
        vx: Math.sin(a) * sp, vy: sp * (0.4 + this.rnd() * 0.6), vz: Math.cos(a) * sp,
        age: 0, life: S.dustSec * (0.6 + this.rnd() * 0.5) * (imp.kind === 'slam' ? 1 : 0.6), size: (imp.kind === 'slam' ? 0.9 : 0.6) * (0.6 + this.rnd() * 0.6),
      });
    }
  }

  /** 1 コマ（輪の 大きさ・うすさ、土ぼこり） */
  update(dt: number): void {
    const S = T.slam;
    for (const r of this.rings) {
      const imp = r.imp;
      if (!imp) continue;
      const slam = imp.kind === 'slam';
      const life = slam ? Math.max(S.ringSec, imp.maxR / Math.max(1e-3, S.waveSpeed)) : S.tapRingSec;
      if (imp.age >= life) { r.imp = null; r.g.visible = false; continue; }
      // 小さい 衝撃は 当たりは いっしゅん、見た目は すばやく 広がる
      const rad = Math.max(0.3, slam ? imp.r : imp.maxR * Math.min(1, imp.age / (S.tapRingSec * 0.5)));
      const fade = 1 - imp.age / life;
      r.flat.scale.set(rad, 1, rad);
      r.band.scale.set(rad, slam ? 0.9 : 0.5, rad);
      r.mats[0]!.opacity = 0.85 * fade;
      r.mats[1]!.opacity = 0.6 * fade;
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

  dispose(): void {
    for (const r of this.rings) { this.scene.remove(r.g); r.mats.forEach((m) => m.dispose()); }
    this.scene.remove(this.dust);
    (this.dust.material as MeshBasicMaterial).dispose();
    this.dust.dispose();
    this.geos.forEach((g) => g.dispose());
  }
}
