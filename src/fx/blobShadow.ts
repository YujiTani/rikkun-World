import * as THREE from 'three';

/**
 * キャラの足もとの丸い影（TEX-A、docs/art/DESIGN.md 3.3）。
 * - 足もとに ふちの ぼけた 丸 1 まい。大きさ 0.9 ブロック。中心の こさ 0.55 → 6 割の所で 0.4 → ふちで 0。
 * - まぜ方は かけ算（地面の色 ×（1 − こさ））。色を足さないので 暗い所でも 青くうかない。霧は かけない。
 * - 高さ = 足の下の いちばん上の固いブロックの上 ＋ 0.13。高くとぶほど 小さく うすく（こさ ×(1 − h/6)、大きさ 0.6 倍まで）。
 *   6 ブロックより上・水の中では出さない。
 * - キャラの板より先に描く（不透明の列で renderOrder 1。キャラの板は 2）。あとに描くと 影が くつの上にのる。
 *   そのため transparent は false にして、まぜ方だけ CustomBlending にする。描画回数 +1・三角形 +2。
 */
export const BLOB = {
  size: 0.9,
  /** 足の下の固いブロックの上から ういている高さ（小ブロック 1 こぶんの でこぼこに うもれない） */
  lift: 0.13,
  /** この高さ（ブロック）より上では出さない */
  maxHeight: 6,
  /** 高くとんだとき 大きさは この倍まで ちぢむ */
  minSizeRatio: 0.6,
  renderOrder: 1,
  /** キャラの板の描く順（影より あと） */
  spriteRenderOrder: 2,
} as const;

export interface BlobPlacement {
  visible: boolean;
  /** 影の高さ（ワールド） */
  y: number;
  /** 一辺（ブロック） */
  size: number;
  /** こさの倍率（地面で 1、6 ブロックで 0） */
  opacity: number;
}

/** 足の高さ feetY と 足の下の地面の高さ groundY（固いブロックの上の面）から、影の置き方を決める（純粋関数） */
export function blobPlacement(feetY: number, groundY: number | null): BlobPlacement {
  if (groundY === null) return { visible: false, y: feetY, size: 0, opacity: 0 };
  const h = Math.max(0, feetY - groundY);
  const k = Math.max(0, 1 - h / BLOB.maxHeight);
  return {
    visible: k > 0.001,
    y: groundY + BLOB.lift,
    size: BLOB.size * (BLOB.minSizeRatio + (1 - BLOB.minSizeRatio) * k),
    opacity: k,
  };
}

/**
 * 足の下の地面の高さ（固いブロックの上の面）。足のいるマスから下へ。水のマスに入ったら null（水の中・水の上では出さない）、
 * maxHeight + 1 マス下まで 見つからなければ null。block(y) = (x, z) の柱の y のマスの種類。
 */
export function groundBelow(feetY: number, block: (y: number) => 'solid' | 'water' | 'other'): number | null {
  const y0 = Math.floor(feetY + 0.01);
  for (let y = y0; y >= Math.max(0, y0 - BLOB.maxHeight - 1); y--) {
    const b = block(y);
    if (b === 'water') return null;
    if (b === 'solid') return y + 1;
  }
  return null;
}

export interface BlobInfo {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  size: number;
  opacity: number;
  renderOrder: number;
  spriteRenderOrder: number;
  transparent: boolean;
}

export class BlobShadow {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private enabled = true;
  private placed: BlobPlacement = { visible: false, y: 0, size: 0, opacity: 0 };
  private px = 0;
  private pz = 0;

  constructor() {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // かけ算: 画面の色 ×（1 − 影のこさ）。src の色は 使わない
    this.material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.material.userData.noDim = true;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = BLOB.renderOrder;
    this.mesh.name = 'blobShadow';
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  /** 毎ステップ: 足もと（feet）と 足の下の地面を 教える。characterVisible = キャラが 見えているか */
  update(feet: { x: number; y: number; z: number }, groundY: number | null, characterVisible: boolean): void {
    this.placed = blobPlacement(feet.y, groundY);
    this.px = feet.x;
    this.pz = feet.z;
    const p = this.placed;
    this.mesh.visible = this.enabled && characterVisible && p.visible;
    this.mesh.position.set(feet.x, p.y, feet.z);
    this.mesh.scale.set(p.size, p.size, 1);
    this.material.opacity = p.opacity;
  }

  /** テスト用: 影を切る */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.mesh.visible = false;
  }

  info(): BlobInfo {
    return {
      visible: this.mesh.visible,
      x: this.px,
      y: this.placed.y,
      z: this.pz,
      size: this.placed.size,
      opacity: this.placed.opacity,
      renderOrder: this.mesh.renderOrder,
      spriteRenderOrder: BLOB.spriteRenderOrder,
      transparent: this.material.transparent,
    };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }
}
