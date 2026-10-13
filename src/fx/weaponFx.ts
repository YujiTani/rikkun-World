import * as THREE from 'three';
import { W2_SETTING_DEFAULTS, type W2Settings, type BladeTrailStyle, type ArmorSystem, BladeEvent, BladeShapeInfo, BladeSystem, BowEvent, BowSystem, Inventory, ItemId, Vec3, WearEvent } from '../contracts';
import type { BladeHud } from '../ui/bladeHud';
import type { WearNotice } from '../ui/wearNotice';
import { playCombat } from './combatSounds';
import type { SoundFx } from './sound';
import { WEAPON_FX, pickShardColors, shakeOffset, trailOpacity } from './weaponFxModel';
import { playWeapon } from './weaponSounds';

export interface WeaponFxDeps {
  scene: THREE.Scene;
  sound: Pick<SoundFx, 'play' | 'playTones'>;
  blade: Pick<BladeSystem, 'drainEvents' | 'state' | 'shape'>;
  bow: Pick<BowSystem, 'drainEvents'>;
  inventory: Pick<Inventory, 'drainWearEvents'>;
  armor: Pick<ArmorSystem, 'drainWearEvents'>;
  bladeHud: Pick<BladeHud, 'update' | 'techStarted' | 'stanceChanged'>;
  notice: Pick<WearNotice, 'low' | 'broken'>;
  nameOf(item: ItemId): string;
  /** 手の 位置（こわれた かけらが とびちる 所） */
  handPos(): Vec3;
  /** ゆれる 画面（ゲームの canvas）。なければ ゆらさない */
  shakeEl?: HTMLElement;
  /** 武器ごとの きせき（なければ 初期値） */
  settings?: () => Pick<W2Settings, 'bladeTrail'>;
  /** たいきゅうの 出来事を 実績へ */
  onWear?: (events: readonly WearEvent[]) => void;
  /** こわれた（人形が 手を 見る 動きなど） */
  onBreak?: (item: ItemId) => void;
  /** や を 拾った（拾ったログ用） */
  onArrowPickup?: () => void;
  /** ささった や の 数などを 数える（実績 `arrowShot` / `arrowHit` は main が 出来事から つなぐ）。ここでは 何もしない */
}

const POOL = 64;
const WEAPON_TRAIL_FALLBACK: BladeTrailStyle = { color: WEAPON_FX.trailColor, width: 0.05, style: 'plain' };

/**
 * 刀・弓・たいきゅうの 演出と 音（WEAPON-2 §3.3〜§3.6）。1 ステップに 1 回 `step()`、描画の 前に `update(dt)`。
 * きせき・星・かけらは InstancedMesh 2 つ + メッシュ 数こ を 使いまわす（毎フレーム new しない）。点滅・赤い色は 使わない。
 */
export class WeaponFx {
  private readonly stars: THREE.InstancedMesh;
  private readonly shards: THREE.InstancedMesh;
  private readonly sp: Particles;
  private readonly hp: Particles;
  private readonly trail = new THREE.Group();
  private readonly line: THREE.Mesh;
  private readonly band: THREE.Mesh;
  private readonly bandInner: THREE.Group;
  private bandHalf = -1;
  private trailSince = 999;
  private trailStyle: BladeTrailStyle = WEAPON_TRAIL_FALLBACK;
  private rng = 777;
  private shakeLeft = 0;
  private shakeFrame = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private readonly lineMat: THREE.MeshBasicMaterial;
  private readonly bandMat: THREE.MeshBasicMaterial;

  constructor(private readonly d: WeaponFxDeps) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mk = (): THREE.InstancedMesh => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), POOL);
      im.count = 0;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, this.col.set(0xffffff));
      d.scene.add(im);
      return im;
    };
    this.stars = mk();
    this.shards = mk();
    this.sp = new Particles(this.stars, POOL);
    this.hp = new Particles(this.shards, POOL);

    this.lineMat = new THREE.MeshBasicMaterial({ color: WEAPON_FX.trailColor, transparent: true, depthWrite: false });
    this.bandMat = new THREE.MeshBasicMaterial({ color: WEAPON_FX.trailColor, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.line = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.lineMat);
    this.band = new THREE.Mesh(new THREE.BufferGeometry(), this.bandMat);
    this.bandInner = new THREE.Group();
    this.bandInner.add(this.band);
    this.trail.add(this.line, this.bandInner);
    this.trail.visible = false;
    this.line.visible = false;
    this.bandInner.visible = false;
    d.scene.add(this.trail);
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 4294967296;
  }

  /** 1 ステップ: 出来事を 読んで 音・画面・演出を 出す */
  step(): void {
    const d = this.d;
    for (const e of d.blade.drainEvents()) this.onBlade(e);
    d.bladeHud.update(d.blade.state());
    this.trailStep();
    for (const e of d.bow.drainEvents()) this.onBow(e);
    const wear = [...d.inventory.drainWearEvents(), ...d.armor.drainWearEvents()];
    for (const e of wear) this.onWear(e);
    if (wear.length) d.onWear?.(wear);
    this.shakeStep();
  }

  private onBlade(e: BladeEvent): void {
    const s = this.d.sound;
    switch (e.type) {
      case 'techStart':
        this.d.bladeHud.techStarted(e.tech);
        playWeapon(s, e.tech);
        break;
      case 'techHit':
        if (e.tech === 'kesa') {
          playWeapon(s, 'kesaHit');
          this.shakeLeft = WEAPON_FX.shakeSteps;
          this.shakeFrame = 0;
        } else {
          playCombat(s, 'hit');
        }
        this.burst(e.position, WEAPON_FX.starCount, 0xffffff, WEAPON_FX.starSeconds, 0.12, false);
        break;
      case 'techMiss':
        break;
      case 'stance':
        playWeapon(s, 'stance');
        this.d.bladeHud.stanceChanged(e.to);
        break;
      case 'cancel':
        break;
    }
  }

  private onBow(e: BowEvent): void {
    const s = this.d.sound;
    switch (e.type) {
      case 'stage':
        playWeapon(s, e.stage === 1 ? 'drawStage1' : e.stage === 2 ? 'drawStage2' : 'drawStage3');
        break;
      case 'arrowShot':
        playWeapon(s, e.stage === 1 ? 'shoot1' : e.stage === 2 ? 'shoot2' : 'shoot3');
        break;
      case 'arrowHit':
        playWeapon(s, 'arrowHit');
        playCombat(s, 'hit');
        break;
      case 'arrowStick':
        playWeapon(s, 'arrowStick');
        break;
      case 'dryRelease':
        playWeapon(s, 'dry');
        break;
      case 'noArrow':
        s.play('clink');
        break;
      case 'pickup':
        s.play('pickup');
        this.d.onArrowPickup?.();
        break;
      default:
        break;
    }
  }

  private onWear(e: WearEvent): void {
    const name = this.d.nameOf(e.item);
    if (e.type === 'wearLow') {
      playWeapon(this.d.sound, 'wearLow');
      this.d.notice.low(e.item, name);
    } else {
      playWeapon(this.d.sound, 'toolBreak');
      this.d.notice.broken(e.item, name);
      const colors = pickShardColors(e.item, WEAPON_FX.shardCount, () => this.rand());
      this.burst(this.d.handPos(), WEAPON_FX.shardCount, colors, WEAPON_FX.shardSeconds, 0.09, true);
      this.d.onBreak?.(e.item);
    }
  }

  private burst(at: Vec3, n: number, color: number | number[], seconds: number, size: number, gravity: boolean): void {
    const p = gravity ? this.hp : this.sp;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const up = 0.3 + this.rand() * 0.7;
      const sp = 1.2 + this.rand() * 1.6;
      p.spawn(at, Math.cos(a) * sp, up * (gravity ? 2.2 : 1.5), Math.sin(a) * sp, seconds, size, Array.isArray(color) ? color[i % color.length] : color, gravity ? 9 : 0);
    }
  }

  // ---- きせき（刃が 通った 白い 帯。持続の あいだ 出て 8F で 消える。1 回 だけ）
  private trailStep(): void {
    const st = this.d.blade.state();
    if (st.phase === 'active') {
      const shape = this.d.blade.shape();
      if (shape && this.trailSince !== -1) {
        const tr = (this.d.settings?.() ?? W2_SETTING_DEFAULTS).bladeTrail[st.item ?? 'katana'] ?? WEAPON_TRAIL_FALLBACK;
        this.lineMat.color.setHex(tr.color);
        this.bandMat.color.setHex(tr.color);
        this.trailStyle = tr;
        this.setTrailShape(shape, st.tech === 'kiriage' ? 1 : -1);
        if (tr.style === 'star') {
          const at = shape.kind === 'capsule' ? shape.to : shape.center;
          this.burst(at, 3, tr.color, WEAPON_FX.starSeconds, 0.1, false);
        }
        this.trailSince = -1;
      } else if (shape) {
        this.trailSince = -1;
      }
    } else if (this.trailSince < 999) {
      this.trailSince = this.trailSince < 0 ? 0 : this.trailSince + 1;
    }
    const o = this.trailSince >= 999 ? 0 : trailOpacity(this.trailSince);
    this.lineMat.opacity = o;
    this.bandMat.opacity = o * 0.85;
    this.trail.visible = o > 0;
    if (o <= 0) this.trailSince = 999;
  }

  private setTrailShape(shape: BladeShapeInfo, dir: number): void {
    if (shape.kind === 'capsule') {
      const a = shape.from;
      const b = shape.to;
      this.v.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const len = Math.max(0.01, this.v.length());
      this.line.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      this.line.scale.set(this.trailStyle.width, this.trailStyle.width, len);
      this.q.setFromUnitVectors(this.sc.set(0, 0, 1), this.v.normalize());
      this.line.quaternion.copy(this.q);
      this.line.visible = true;
      this.bandInner.visible = false;
      return;
    }
    if (shape.halfAngleDeg !== this.bandHalf) {
      this.bandHalf = shape.halfAngleDeg;
      this.band.geometry.dispose();
      this.band.geometry = sectorGeometry(shape.halfAngleDeg, 0.55, 1);
    }
    const r = shape.rMax;
    this.trail.position.set(0, 0, 0);
    this.bandInner.position.set(shape.center.x, shape.center.y + (shape.yMin + shape.yMax) / 2, shape.center.z);
    this.bandInner.rotation.set(0, Math.atan2(shape.forward.x, shape.forward.z), 0);
    this.band.scale.set(r, 1, r);
    this.band.rotation.set(0, 0, dir * (this.trailStyle.style === 'long' ? 1.0 : 0.6));
    this.band.rotation.order = 'ZXY';
    this.bandInner.visible = true;
    this.line.visible = false;
  }

  // ---- 画面の ゆれ（大げさ斬りが 当たったとき だけ。2px・0.1 秒。明るさは かえない）
  private shakeStep(): void {
    const el = this.d.shakeEl;
    if (this.shakeLeft > 0) {
      const x = shakeOffset(this.shakeFrame++);
      this.shakeLeft--;
      if (el) el.style.transform = this.shakeLeft > 0 ? `translate(${x.toFixed(2)}px, 0)` : '';
    }
  }

  /** 描画の 前（秒）。星・かけらを 動かす */
  update(dt: number): void {
    this.sp.update(dt, this.m, this.q, this.v, this.sc, this.col);
    this.hp.update(dt, this.m, this.q, this.v, this.sc, this.col);
  }

  /** 見えている 星・かけらの 数（テスト用） */
  counts(): { stars: number; shards: number } {
    return { stars: this.sp.live, shards: this.hp.live };
  }

  dispose(): void {
    for (const im of [this.stars, this.shards]) {
      im.removeFromParent();
      (im.material as THREE.Material).dispose();
      im.dispose();
    }
    this.stars.geometry.dispose();
    this.trail.removeFromParent();
    this.band.geometry.dispose();
    this.line.geometry.dispose();
    this.lineMat.dispose();
    this.bandMat.dispose();
    if (this.d.shakeEl) this.d.shakeEl.style.transform = '';
  }
}

/** 水平の 輪の 一部（-half〜+half 度）。内側 r0・外側 r1（単位の 半径）。+Z が 前 */
function sectorGeometry(halfDeg: number, r0: number, r1: number): THREE.BufferGeometry {
  const N = 16;
  const pos = new Float32Array((N + 1) * 2 * 3);
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = ((-halfDeg + (2 * halfDeg * i) / N) * Math.PI) / 180;
    pos.set([Math.sin(a) * r0, 0, Math.cos(a) * r0], i * 6);
    pos.set([Math.sin(a) * r1, 0, Math.cos(a) * r1], i * 6 + 3);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** 小さな 四角の 粒を InstancedMesh で 動かす（場所は 使いまわす） */
class Particles {
  private readonly x: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly total: Float32Array;
  private readonly size: Float32Array;
  private readonly grav: Float32Array;
  private readonly color: Uint32Array;
  live = 0;

  constructor(private readonly mesh: THREE.InstancedMesh, private readonly cap: number) {
    this.x = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.total = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.color = new Uint32Array(cap);
  }

  spawn(at: Vec3, vx: number, vy: number, vz: number, seconds: number, size: number, color: number, gravity: number): void {
    let i = this.life.findIndex((l) => l <= 0);
    if (i < 0) i = 0;
    this.x.set([at.x, at.y, at.z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = seconds;
    this.total[i] = seconds;
    this.size[i] = size;
    this.grav[i] = gravity;
    this.color[i] = color;
  }

  update(dt: number, m: THREE.Matrix4, q: THREE.Quaternion, v: THREE.Vector3, sc: THREE.Vector3, col: THREE.Color): void {
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      for (let k = 0; k < 3; k++) this.x[i * 3 + k] += this.vel[i * 3 + k] * dt;
      const s = this.size[i] * (0.4 + 0.6 * (this.life[i] / this.total[i]));
      v.set(this.x[i * 3], this.x[i * 3 + 1], this.x[i * 3 + 2]);
      m.compose(v, q, sc.set(s, s, s));
      this.mesh.setMatrixAt(n, m);
      this.mesh.setColorAt(n, col.setHex(this.color[i]));
      n++;
    }
    this.live = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
