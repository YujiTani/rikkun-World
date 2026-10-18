import * as THREE from 'three';
import type { Vec3 } from '../contracts';
import type { LegendEvent } from '../legend/LegendSystem';
import { BOLT, SPARKS, boltFrameOf, groundGlow, landingRing, makeSparks, sparkAt, type Spark } from '../legend/thunderModel';

/**
 * WEAPON-7 §3.5・決定「雷 v4」: 落雷の 見た目。
 * - 雷: 十字の 板（草木と 同じ 2 枚の たての 板が ×に まじわる）に ドット絵 8 コマ × 4 通り。2 ステップごとに 次の コマ（F2〜17、F8 が 着地）。
 * - 着地: 地面の 光の たまり・わ（半径 5）・光の つぶ 30〜40 こ（上へ 2〜3 マス まきあがる）。色は 白〜白っぽい 黄色だけ。足し算の 重ね（additive）。
 * - ため: 刀の 光（2 つの 大きさ）・ため いっぱいの わ（S に 半径 5）。
 * 絵は `public/models/fx/thunder_sheet.png`（256×1024）・`thunder_ground.png`（128×128）。NearestFilter。毎フレーム new しない。
 */

const BASE = '/models/fx/';
const PALE = 0xfff6d0;
const WHITE = 0xffffff;

function loadTexture(url: string, repeatU: number, repeatV: number): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(repeatU, repeatV);
  return tex;
}

function additive(map: THREE.Texture, opts: { depthTest?: boolean } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: opts.depthTest ?? true,
    side: THREE.DoubleSide,
    fog: false,
    color: WHITE,
  });
}

export interface ThunderFxDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  basePath?: string;
  seed?: number;
}

/** ため中の 見た目の 入力（毎ステップ） */
export interface ChargeLook {
  charging: boolean;
  ready: boolean;
  /** 刀を かかげた 点（足もと + 上） */
  hand: Vec3;
  /** ため いっぱいの わ（S）。見えない ときは null */
  aimS: Vec3 | null;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class ThunderFx {
  private readonly cam: THREE.Camera;
  private readonly group = new THREE.Group();

  // 雷（十字の 板）
  private readonly sheet: THREE.Texture;
  private readonly boltMat: THREE.MeshBasicMaterial;
  private readonly bolt = new THREE.Group();
  // 地面（光の たまり・わ・ための わ）
  private readonly glowTex: THREE.Texture;
  private readonly ringTex: THREE.Texture;
  private readonly glowMesh: THREE.Mesh;
  private readonly ringMesh: THREE.Mesh;
  private readonly aimMesh: THREE.Mesh;
  private readonly handMesh: THREE.Mesh;
  // つぶ
  private readonly bits: THREE.InstancedMesh;
  private readonly sparks: Spark[];

  /** 今の 落雷（なければ null）。age = 落雷の F */
  private cur: { S: Vec3; variant: number; F: number; sky: boolean } | null = null;

  constructor(deps: ThunderFxDeps) {
    this.cam = deps.camera;
    const base = deps.basePath ?? BASE;
    this.sparks = makeSparks((deps.seed ?? 7) ^ 0x7a11);

    // 雷
    this.sheet = loadTexture(`${base}thunder_sheet.png`, 1 / BOLT.frames, 1 / BOLT.variants);
    this.boltMat = additive(this.sheet);
    const w = BOLT.height * (BOLT.cellW / BOLT.cellH);
    const geo = new THREE.PlaneGeometry(w, BOLT.height);
    geo.translate(0, BOLT.height / 2, 0);
    const a = new THREE.Mesh(geo, this.boltMat);
    const b = new THREE.Mesh(geo, this.boltMat);
    b.rotation.y = Math.PI / 2;
    a.frustumCulled = b.frustumCulled = false;
    this.bolt.add(a, b);
    this.bolt.visible = false;
    this.group.add(this.bolt);

    // 地面の 絵（128×128 の 左上 = 光の たまり・右上 = わ）
    this.glowTex = loadTexture(`${base}thunder_ground.png`, 0.5, 0.5);
    this.glowTex.offset.set(0, 0.5);
    this.ringTex = loadTexture(`${base}thunder_ground.png`, 0.5, 0.5);
    this.ringTex.offset.set(0.5, 0.5);
    const flat = new THREE.PlaneGeometry(1, 1);
    flat.rotateX(-Math.PI / 2);
    this.glowMesh = new THREE.Mesh(flat, additive(this.glowTex));
    this.ringMesh = new THREE.Mesh(flat, additive(this.ringTex));
    this.aimMesh = new THREE.Mesh(flat, additive(this.ringTex));
    this.handMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(this.glowTex, { depthTest: false }));
    for (const m of [this.glowMesh, this.ringMesh, this.aimMesh, this.handMesh]) {
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.handMesh.renderOrder = 3;

    // 光の つぶ（足し算の 小さな 四角。カメラへ 向ける）
    this.bits = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: WHITE }),
      SPARKS.count,
    );
    this.bits.frustumCulled = false;
    this.bits.visible = false;
    this.bits.count = SPARKS.count;
    this.group.add(this.bits);

    deps.scene.add(this.group);
  }

  /** `legend` の 出来事（毎ステップ 1 回） */
  onEvent(e: LegendEvent): void {
    if (e.type === 'lightningStart' && e.S) {
      // はなした ステップ = F1
      this.cur = { S: { ...e.S }, variant: e.variant, F: 1, sky: e.skyVisible };
    }
  }

  /** 1 ステップ（Game.onUpdate）。落雷の F を すすめて 見た目を 決める */
  step(look: ChargeLook, reduced: boolean): void {
    // ため
    const cl = look;
    this.handMesh.visible = cl.charging;
    if (cl.charging) {
      const s = cl.ready ? 1.5 : 0.8;
      this.handMesh.position.set(cl.hand.x, cl.hand.y, cl.hand.z);
      this.handMesh.quaternion.copy(this.cam.quaternion);
      this.handMesh.scale.set(s, s, 1);
      (this.handMesh.material as THREE.MeshBasicMaterial).color.setHex(cl.ready ? WHITE : PALE);
    }
    this.aimMesh.visible = cl.ready && cl.aimS !== null;
    if (this.aimMesh.visible && cl.aimS) {
      this.aimMesh.position.set(cl.aimS.x, cl.aimS.y + 0.04, cl.aimS.z);
      this.aimMesh.scale.set(10, 1, 10);
      (this.aimMesh.material as THREE.MeshBasicMaterial).color.setScalar(0.55);
    }

    const c = this.cur;
    if (!c) {
      this.bolt.visible = this.glowMesh.visible = this.ringMesh.visible = this.bits.visible = false;
      return;
    }
    const F = c.F;
    // 雷（空が 見えない ときは 見えない 地上の 雷。地下の 目には ブロックが さえぎる）
    const k = boltFrameOf(F);
    this.bolt.visible = k >= 0;
    if (k >= 0) {
      this.sheet.offset.set(k / BOLT.frames, 1 - (c.variant + 1) / BOLT.variants);
      this.bolt.position.set(c.S.x, c.S.y, c.S.z);
    }
    const g = groundGlow(F);
    this.glowMesh.visible = g !== null;
    if (g) {
      this.glowMesh.position.set(c.S.x, c.S.y + 0.03, c.S.z);
      const sz = 3 * g.scale;
      this.glowMesh.scale.set(sz, 1, sz);
      (this.glowMesh.material as THREE.MeshBasicMaterial).color.setScalar(g.alpha);
    }
    const r = landingRing(F);
    this.ringMesh.visible = r !== null;
    if (r) {
      this.ringMesh.position.set(c.S.x, c.S.y + 0.05, c.S.z);
      this.ringMesh.scale.set(r.radius * 2, 1, r.radius * 2);
      (this.ringMesh.material as THREE.MeshBasicMaterial).color.setScalar(r.alpha);
    }
    // つぶ（着地から）
    const t = F - 8;
    let any = false;
    if (t >= 0 && !reduced) {
      _q.copy(this.cam.quaternion);
      for (let i = 0; i < this.sparks.length; i++) {
        const s = this.sparks[i]!;
        const p = sparkAt(s, t);
        if (p.alpha <= 0) {
          _s.set(0, 0, 0);
        } else {
          any = true;
          _s.set(s.size, s.size, s.size);
        }
        _p.set(c.S.x + p.dx, c.S.y + 0.1 + p.dy, c.S.z + p.dz);
        _m.compose(_p, _q, _s);
        this.bits.setMatrixAt(i, _m);
        _c.setHex(s.tone === 0 ? WHITE : PALE).multiplyScalar(p.alpha);
        this.bits.setColorAt(i, _c);
      }
      this.bits.instanceMatrix.needsUpdate = true;
      if (this.bits.instanceColor) this.bits.instanceColor.needsUpdate = true;
    }
    this.bits.visible = any;
    c.F += 1;
    const maxLife = SPARKS.lifeMax;
    if (F > 8 + maxLife) this.cur = null;
  }

  /** テストの 窓口用: 今の 見た目の ようす */
  info(): { bolt: boolean; frame: number; glow: boolean; ring: boolean; sparks: boolean; F: number } {
    return {
      bolt: this.bolt.visible,
      frame: this.cur ? boltFrameOf(this.cur.F - 1) : -1,
      glow: this.glowMesh.visible,
      ring: this.ringMesh.visible,
      sparks: this.bits.visible,
      F: this.cur ? this.cur.F - 1 : 0,
    };
  }

  dispose(): void {
    this.group.removeFromParent();
    this.sheet.dispose();
    this.glowTex.dispose();
    this.ringTex.dispose();
    this.boltMat.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
    });
    this.bits.geometry.dispose();
    (this.bits.material as THREE.Material).dispose();
    this.bits.dispose();
  }
}
