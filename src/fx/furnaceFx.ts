import * as THREE from 'three';
import type { ItemId } from '../contracts';
import { itemIconPixels } from '../ui/itemIcon';
import { FURNACE_MOUTH, TILE_SIZE } from '../world/blocks/textures';
import { createRng } from '../world/gen/random';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from './craftConfig';
import { playCraft } from './craftSounds';
import {
  SmokePool,
  crackleTarget,
  flameLevel,
  nextCrackleDelay,
  type FurnaceFxEntry,
} from './furnaceFxModel';
import type { SoundFx } from './sound';

/** 口の火の絵（口の四角の中だけオレンジ。ゆらゆらは色の明るさで） */
function fireTexture(): THREE.DataTexture {
  const data = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  const { x, y, w, h } = FURNACE_MOUTH;
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      // 下ほど明るい黄色、上ほどオレンジ
      const k = (py - y) / (h - 1);
      const o = ((TILE_SIZE - 1 - py) * TILE_SIZE + px) * 4;
      data[o] = 255;
      data[o + 1] = Math.round(120 + 110 * k);
      data[o + 2] = Math.round(20 + 50 * k * k);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, TILE_SIZE, TILE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const iconTextures = new Map<string, THREE.DataTexture>();

/** 待っている焼けたものの絵（板に貼る） */
function iconTexture(item: ItemId): THREE.DataTexture {
  let t = iconTextures.get(item);
  if (t) return t;
  const px = itemIconPixels(item);
  const data = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const c = px[y * TILE_SIZE + x];
      const o = ((TILE_SIZE - 1 - y) * TILE_SIZE + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = c[3];
    }
  }
  t = new THREE.DataTexture(data, TILE_SIZE, TILE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  iconTextures.set(item, t);
  return t;
}

/** 4 つの横の面: 向き（Y まわりの回転）と外向きの法線 */
const FACES = [
  { rotY: 0, nx: 0, nz: 1 },
  { rotY: Math.PI / 2, nx: 1, nz: 0 },
  { rotY: Math.PI, nx: 0, nz: -1 },
  { rotY: -Math.PI / 2, nx: -1, nz: 0 },
] as const;

/**
 * 焼いている かまど の見た目: 口の火（ゆらゆら）・上のけむり・待っている焼けたものの絵・パチパチ。
 * 毎フレーム update(dt, entries, player) を呼ぶ。同じ形は InstancedMesh でまとめる（毎フレーム new しない）。
 */
export class FurnaceFx {
  readonly group = new THREE.Group();
  readonly smoke: SmokePool;
  private readonly fire: THREE.InstancedMesh;
  private readonly smokeMesh: THREE.InstancedMesh;
  private readonly sprites: THREE.Sprite[] = [];
  private readonly fireTex = fireTexture();
  private readonly spriteMats: THREE.SpriteMaterial[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly rng = createRng(4242);
  private time = 0;
  private crackleLeft = 0;
  /** 鳴らしたパチパチの数（テスト用） */
  crackles = 0;
  /** 今 火が見えている面の数（テスト用） */
  fireFaces = 0;

  constructor(
    scene: THREE.Object3D,
    private readonly sound: Pick<SoundFx, 'playTones'> | null = null,
    private readonly cfg: CraftUiSettings = CRAFT_UI_SETTINGS,
  ) {
    this.smoke = new SmokePool(createRng(99), cfg);
    const n = cfg.fireMaxFurnaces * 4;
    this.fire = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.004, 1.004),
      new THREE.MeshBasicMaterial({
        map: this.fireTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      n,
    );
    this.fire.frustumCulled = false;
    this.fire.count = 0;
    this.fire.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.smokeMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, depthWrite: false }),
      cfg.smokeMax,
    );
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.count = 0;
    for (let i = 0; i < cfg.fireMaxFurnaces; i++) {
      const m = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.scale.set(0.5, 0.5, 0.5);
      s.visible = false;
      this.spriteMats.push(m);
      this.sprites.push(s);
      this.group.add(s);
    }
    this.group.add(this.fire, this.smokeMesh);
    scene.add(this.group);
  }

  update(dt: number, entries: readonly FurnaceFxEntry[], player?: { x: number; y: number; z: number }): void {
    this.time += dt;
    const max = this.cfg.fireMaxFurnaces;
    // 火
    let f = 0;
    let fi = 0;
    for (const e of entries) {
      if (!e.burning || fi >= max) continue;
      const level = flameLevel(this.time, fi * 1.3, this.cfg);
      for (const face of FACES) {
        this.dummy.position.set(e.x + 0.5 + face.nx * 0.5, e.y + 0.5, e.z + 0.5 + face.nz * 0.5);
        this.dummy.rotation.set(0, face.rotY, 0);
        this.dummy.updateMatrix();
        this.fire.setMatrixAt(f, this.dummy.matrix);
        this.color.setRGB(level, level, level);
        this.fire.setColorAt(f, this.color);
        f++;
      }
      fi++;
    }
    this.fire.count = f;
    this.fireFaces = f;
    this.fire.instanceMatrix.needsUpdate = true;
    if (this.fire.instanceColor) this.fire.instanceColor.needsUpdate = true;

    // けむり
    this.smoke.update(dt, entries);
    let s = 0;
    for (const p of this.smoke.puffs) {
      if (!p.active) continue;
      const k = p.age / p.life;
      const size = p.size * (1 + k * 1.2);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(0, p.age, 0);
      this.dummy.scale.setScalar(size);
      this.dummy.updateMatrix();
      this.smokeMesh.setMatrixAt(s++, this.dummy.matrix);
    }
    this.dummy.scale.setScalar(1);
    this.smokeMesh.count = s;
    this.smokeMesh.instanceMatrix.needsUpdate = true;
    (this.smokeMesh.material as THREE.MeshBasicMaterial).opacity = 0.6;

    // 待っている焼けたもの
    let w = 0;
    for (const e of entries) {
      if (!e.waiting || w >= this.sprites.length) continue;
      const sp = this.sprites[w];
      const mat = this.spriteMats[w];
      const tex = iconTexture(e.waiting as ItemId);
      if (mat.map !== tex) {
        mat.map = tex;
        mat.needsUpdate = true;
      }
      sp.visible = true;
      sp.position.set(e.x + 0.5, e.y + 1.4 + Math.sin(this.time * 2.5 + w) * 0.08, e.z + 0.5);
      w++;
    }
    for (; w < this.sprites.length; w++) this.sprites[w].visible = false;

    // パチパチ
    if (this.sound && player) {
      this.crackleLeft -= dt;
      if (this.crackleLeft <= 0) {
        this.crackleLeft = nextCrackleDelay(this.rng, this.cfg);
        if (crackleTarget(entries, player.x, player.y, player.z, this.cfg)) {
          playCraft(this.sound, 'crackle', Math.round((this.rng() - 0.5) * 6));
          this.crackles++;
        }
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.fire.geometry.dispose();
    (this.fire.material as THREE.Material).dispose();
    this.smokeMesh.geometry.dispose();
    (this.smokeMesh.material as THREE.Material).dispose();
    this.fireTex.dispose();
    for (const m of this.spriteMats) m.dispose();
  }
}
