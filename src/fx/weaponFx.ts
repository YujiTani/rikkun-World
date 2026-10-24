import * as THREE from 'three';
import { type W2Settings, type ArmorSystem, type BladeStep, type BladeTech, BladeEvent, BladeSystem, BowEvent, BowSystem, Inventory, ItemId, Vec3, WearEvent } from '../contracts';
import type { BladeHud } from '../ui/bladeHud';
import type { WearNotice } from '../ui/wearNotice';
import { playCombat } from './combatSounds';
import type { SoundFx } from './sound';
import { WEAPON_FX, pickShardColors } from './weaponFxModel';
import { BladeTrail, type TrailSnapshot } from './bladeTrail';
import { playWeapon } from './weaponSounds';

export interface WeaponFxDeps {
  scene: THREE.Scene;
  sound: Pick<SoundFx, 'play' | 'playTones'>;
  blade: Pick<BladeSystem, 'drainEvents' | 'state'>;
  bow: Pick<BowSystem, 'drainEvents'>;
  inventory: Pick<Inventory, 'drainWearEvents'>;
  armor: Pick<ArmorSystem, 'drainWearEvents'>;
  bladeHud: Pick<BladeHud, 'update' | 'techStarted' | 'stanceChanged'>;
  notice: Pick<WearNotice, 'low' | 'broken'>;
  nameOf(item: ItemId): string;
  /** 手の 位置（こわれた かけらが とびちる 所） */
  handPos(): Vec3;
  /** 武器ごとの きせき・わざの 長さ（なければ 初期値） */
  settings?: () => Pick<W2Settings, 'bladeTrail' | 'bladeTrailShape' | 'bladeTrailWindow' | 'bladeTech'>;
  /** CHAR-4: 体（当たり判定の 足もと）の いまの 位置。ふみこみの あとで 呼ぶ。`camera` と 両方 あるときだけ 刃の軌跡を 出す */
  body?: () => Vec3;
  camera?: THREE.Camera;
  /** WEAPON-6: 刀の 出来事を 実績へ（3 段 ぜんぶ 当てた） */
  onBlade?: (events: readonly BladeEvent[]) => void;
  /** WEAPON-7: わざを 始めた とき、持っている 武器の 追加の 音・見た目（レジェンダリーの きせき） */
  onTechItem?: (item: ItemId | null, tech?: BladeTech, step?: BladeStep) => void;
  /** WEAPON-9: 妖怪に わざが 当たった（1 体ごとに 1 回。虹の 火花用） */
  onTechHit?: (item: ItemId | null, e: Extract<BladeEvent, { type: 'techHit' }>) => void;
  /** WEAPON-9: わざが やめに なった */
  onBladeCancel?: () => void;
  /** true を 返す 武器は 刀の 半月の 帯（BladeTrail）を 出さない（レジェンダリーは 白い 斬撃と 置きかえ。2026-10-23） */
  hideBandTrail?: (item: ItemId | null) => boolean;
  /** WEAPON-9: true を 返すと 今の 刀の 斬撃音(と 段の 音)を 鳴らさない（虹の nijiSlash に 入れかえ）。step = 3 段の 何段目(1〜3) */
  replaceTechSound?: (item: ItemId | null, step: number) => boolean;
  /** たいきゅうの 出来事を 実績へ */
  onWear?: (events: readonly WearEvent[]) => void;
  /** こわれた（人形が 手を 見る 動きなど） */
  onBreak?: (item: ItemId) => void;
  /** や を 拾った（拾ったログ用） */
  onArrowPickup?: () => void;
  /** ささった や の 数などを 数える（実績 `arrowShot` / `arrowHit` は main が 出来事から つなぐ）。ここでは 何もしない */
}

const POOL = 64;

/**
 * 刀・弓・たいきゅうの 演出と 音（WEAPON-2 §3.3〜§3.6）。1 ステップに 1 回 `step()`、描画の 前に `update(dt)`。
 * 星・かけらは InstancedMesh 2 つ、刃の 軌跡（CHAR-4）は 帯 1 つ + 星 1 つ を 使いまわす（毎フレーム new しない）。点滅・赤い色は 使わない。
 */
export class WeaponFx {
  private readonly stars: THREE.InstancedMesh;
  private readonly shards: THREE.InstancedMesh;
  private readonly sp: Particles;
  private readonly hp: Particles;
  private readonly bladeTrail: BladeTrail | null;
  private rng = 777;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly col = new THREE.Color();

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

    this.bladeTrail = d.camera && d.body && d.settings ? new BladeTrail({ scene: d.scene, camera: d.camera, settings: d.settings }) : null;
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 4294967296;
  }

  /** 1 ステップ: 出来事を 読んで 音・画面・演出を 出す */
  step(): void {
    const d = this.d;
    const be = d.blade.drainEvents();
    for (const e of be) this.onBlade(e);
    if (be.length) d.onBlade?.(be);
    d.bladeHud.update(d.blade.state());
    this.trailStep();
    for (const e of d.bow.drainEvents()) this.onBow(e);
    const wear = [...d.inventory.drainWearEvents(), ...d.armor.drainWearEvents()];
    for (const e of wear) this.onWear(e);
    if (wear.length) d.onWear?.(wear);
  }

  private onBlade(e: BladeEvent): void {
    const s = this.d.sound;
    switch (e.type) {
      case 'techStart':
        this.d.bladeHud.techStarted(e.tech);
        if (this.d.replaceTechSound?.(this.d.blade.state().item, e.step ?? 1)) {
          this.d.onTechItem?.(this.d.blade.state().item, e.tech, e.step ?? 1);
          break;
        }
        playWeapon(s, e.tech);
        this.d.onTechItem?.(this.d.blade.state().item, e.tech, e.step ?? 1);
        if (e.step === 2) playWeapon(s, 'combo2');
        else if (e.step === 3) playWeapon(s, 'combo3');
        break;
      case 'techHit':
        // 画面の ゆれ・ヒットストップは #276 の ImpactBus（main の onTechHit）が 出す
        if (e.tech === 'kesa') {
          playWeapon(s, 'kesaHit');
        } else {
          playCombat(s, 'hit');
        }
        this.burst(e.position, WEAPON_FX.starCount, 0xffffff, WEAPON_FX.starSeconds, 0.12, false);
        this.d.onTechHit?.(this.d.blade.state().item, e);
        break;
      case 'techMiss':
        break;
      case 'stance':
        playWeapon(s, 'stance');
        this.d.bladeHud.stanceChanged(e.to);
        break;
      case 'cancel':
        this.d.onBladeCancel?.();
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

  /** WEAPON-7: 落雷が 当たった 妖怪に 今の 星（白）を まぜる */
  hitStarsAt(at: Vec3): void {
    this.burst(at, WEAPON_FX.starCount, 0xffffff, WEAPON_FX.starSeconds, 0.12, false);
  }

  // ---- きせき（CHAR-4: 刃先の 通り道の 半月。ふみこみの あと = main の dig.update の あと に 呼ばれる）
  private trailStep(): void {
    if (this.bladeTrail && this.d.body && !this.d.hideBandTrail?.(this.d.blade.state().item)) this.bladeTrail.step(this.d.blade.state(), this.d.body());
  }

  /** 軌跡の ようす（`window.__rikkun.blade.trail()` 用）。体・カメラが なければ null */
  trailInfo(): TrailSnapshot | null {
    return this.bladeTrail ? this.bladeTrail.snapshot() : null;
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
    this.bladeTrail?.dispose();
  }
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
