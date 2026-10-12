import * as THREE from 'three';

export const DEG = Math.PI / 180;

/** 動きの種類 */
export type YokaiMotion = 'wait' | 'move' | 'attack' | 'hit' | 'die';

/** 共通の長さ（秒）。設計書 M3-yokai-candidates 2 章 */
export const HIT_SECONDS = 0.3;
export const HIT_FLASH_SECONDS = 0.1;
export const HIT_BACK_BLOCKS = 0.4;
export const HIT_TILT_DEG = 15;
export const DIE_FALL_SECONDS = 0.4;
export const DIE_SHRINK_END_SECONDS = 0.6;
export const DIE_TOTAL_SECONDS = 1.1;
export const PUFF_COUNT = 8;
export const PUFF_SIZE = 0.2;
export const PUFF_SPREAD = 0.6;
export const PUFF_SECONDS = 0.5;
export const BLINK_PERIOD_SECONDS = 3;
export const BLINK_SECONDS = 0.15;

/** ドット絵の共通の記号（. = 透明） */
export const COMMON_PALETTE: Record<string, number | null> = {
  '.': null,
  W: 0xffffff,
  K: 0x222222,
  R: 0xc8324a,
  P: 0xff9eb5,
};

export type Palette = Record<string, number | null>;

/** 16x16 の文字のドット絵から、NearestFilter のテクスチャを作る（キャンバス不要） */
export function makePixelTexture(rows: readonly string[], extra: Palette = {}): THREE.DataTexture {
  const palette: Palette = { ...COMMON_PALETTE, ...extra };
  const h = rows.length;
  const w = rows[0]!.length;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    // DataTexture は下の行が先
    const dy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const c = palette[row[x]!];
      const i = (dy * w + x) * 4;
      if (c === null || c === undefined) continue;
      data[i] = (c >> 16) & 255;
      data[i + 1] = (c >> 8) & 255;
      data[i + 2] = c & 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 「目をとじた」ドット絵を作る。目の行（eyeRows）の中で clear 以外の所を clear に消し、
 * もともと目があった列に lineRow の横線 `K` を 1 本ひく。
 */
export function makeBlinkRows(
  rows: readonly string[],
  eyeRows: readonly number[],
  lineRow: number,
  clear: string,
  eyeChars: string,
): string[] {
  const cols = new Set<number>();
  for (const y of eyeRows) {
    for (let x = 0; x < rows[y]!.length; x++) if (eyeChars.includes(rows[y]![x]!)) cols.add(x);
  }
  return rows.map((row, y) => {
    if (!eyeRows.includes(y)) return row;
    return [...row]
      .map((ch, x) => {
        if (y === lineRow && cols.has(x)) return 'K';
        return eyeChars.includes(ch) ? clear : ch;
      })
      .join('');
  });
}

/** 箱の形は大きさごとに使いまわす */
const geoCache = new Map<string, THREE.BoxGeometry>();
export function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w}|${h}|${d}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g;
}

export function solid(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color });
}

interface Part {
  mesh: THREE.Mesh;
  normal: THREE.Material | THREE.Material[];
  /** 見えている色（ふつうのとき）。テクスチャつきは代表色 */
  baseColor: number;
}

export interface YokaiSize {
  /** はば（x） */
  width: number;
  /** 高さ（y の上はし = 地面から見た高さ） */
  height: number;
  /** おくゆき（z） */
  depth: number;
  /** 下のはしの y */
  minY: number;
}

export interface YokaiPoseInput {
  /** ずっと進む時計（秒） */
  time: number;
  /** 「うごく」中か */
  moving: boolean;
  /** 攻撃の経過秒（攻撃中でなければ -1） */
  attackT: number;
  /** たおれの進み具合 0〜1（0.4 秒かけて）。たおれていなければ -1 */
  dieP: number;
}

/**
 * 妖怪のモデルの土台。箱をグループで組み、動きは absolute に pose() で毎回決める。
 * 共通の「たたかれた」「ポンと消える」「まばたき」「かげ」はここで受け持つ。
 */
export abstract class YokaiBase {
  abstract readonly id: string;
  abstract readonly displayName: string;
  /** 攻撃の長さ（秒） */
  abstract readonly attackSeconds: number;
  /** たたかれたとき後ろへ下がるか（ぬりかべは下がらずゆれるだけ） */
  protected knockback = true;
  /** M3 本番で使う移動の速さ（ブロック/秒）。見本ページでは使わない */
  abstract readonly moveSpeed: number;

  /** 外から置く場所・向きはここ */
  readonly root = new THREE.Group();
  /** たたかれた・たおれの動きがかかる所（足もとが原点） */
  protected readonly rig = new THREE.Group();
  private readonly puffGroup = new THREE.Group();
  private readonly puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  private readonly puffs: THREE.Mesh[] = [];

  private readonly parts: Part[] = [];
  private readonly flatMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private silhouetteOn = false;
  private flashOn = false;

  private faceMats: THREE.MeshBasicMaterial[] = [];
  private faceOpen: THREE.Texture[] = [];
  private faceClosed: THREE.Texture[] = [];
  private blinkClosed = false;
  private blinkClock = 0;

  private _motion: YokaiMotion = 'wait';
  private baseMotion: 'wait' | 'move' = 'wait';
  private motionT = 0;
  private clock = 0;
  private _scale = 1;
  private _size: YokaiSize = { width: 0, height: 0, depth: 0, minY: 0 };

  constructor() {
    this.root.add(this.rig, this.puffGroup);
    this.puffGroup.visible = false;
    for (let i = 0; i < PUFF_COUNT; i++) {
      const m = new THREE.Mesh(boxGeo(PUFF_SIZE, PUFF_SIZE, PUFF_SIZE), this.puffMat);
      this.puffs.push(m);
      this.puffGroup.add(m);
    }
  }

  /** サブクラスのコンストラクタの最後で呼ぶ */
  protected finish(): void {
    this.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(this.rig);
    this._size = {
      width: round(b.max.x - b.min.x),
      height: round(b.max.y),
      depth: round(b.max.z - b.min.z),
      minY: round(b.min.y),
    };
    this.puffGroup.position.y = (b.max.y + b.min.y) / 2;
    this.pose({ time: 0, moving: false, attackT: -1, dieP: -1 });
  }

  // ---- 部品づくり（サブクラスから使う） ----
  /** 単色の箱。位置は箱の中心 */
  protected addBox(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    pos: readonly [number, number, number],
    material: THREE.Material | THREE.Material[],
    baseColor: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(boxGeo(w, h, d), material);
    mesh.position.set(pos[0], pos[1], pos[2]);
    parent.add(mesh);
    this.parts.push({ mesh, normal: material, baseColor });
    return mesh;
  }

  /** 顔の板（おく 0.02）。開いた目と閉じた目のドット絵を受け取る */
  protected addFace(
    parent: THREE.Object3D,
    size: number,
    pos: readonly [number, number, number],
    open: THREE.Texture,
    closed: THREE.Texture,
    opaque = false,
  ): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ map: open, transparent: !opaque, alphaTest: opaque ? 0 : 0.5 });
    this.faceMats.push(mat);
    this.faceOpen.push(open);
    this.faceClosed.push(closed);
    return this.addBox(parent, size, size, 0.02, pos, mat, 0xffffff);
  }

  private readonly matCache = new Map<number, THREE.MeshBasicMaterial>();
  /** 同じ色の材料は使いまわす */
  protected mat(color: number): THREE.MeshBasicMaterial {
    let m = this.matCache.get(color);
    if (!m) {
      m = solid(color);
      this.matCache.set(color, m);
    }
    return m;
  }

  protected group(parent: THREE.Object3D, pos: readonly [number, number, number] = [0, 0, 0]): THREE.Group {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    parent.add(g);
    return g;
  }

  /** サブクラスが毎回、ぜんぶの動く値を決める */
  protected abstract pose(p: YokaiPoseInput): void;
  /** たおれ方（0〜0.4 秒の間、p=0〜1）。rig の外側の動きはここで */
  protected abstract poseDie(p: number): void;

  // ---- 外から見えるもの ----
  get motion(): YokaiMotion {
    return this._motion;
  }
  get size(): YokaiSize {
    return this._size;
  }
  /** 全体の大きさ（たおれると 0 になる） */
  get scale(): number {
    return this._scale;
  }
  get dead(): boolean {
    return this._motion === 'die' && this.motionT >= DIE_TOTAL_SECONDS;
  }
  get silhouette(): boolean {
    return this.silhouetteOn;
  }
  get blinking(): boolean {
    return this.blinkClosed;
  }
  /** 今見えている箱の色（重複なし、#rrggbb） */
  displayColors(): string[] {
    const set = new Set<string>();
    for (const p of this.parts) set.add(hex(this.currentColor(p)));
    return [...set];
  }
  /** 箱ごとの、いま画面に出る材料の色 */
  meshColors(): number[] {
    return this.parts.map((p) => this.currentColor(p));
  }
  private currentColor(p: Part): number {
    if (this.silhouetteOn) return 0x000000;
    if (this.flashOn) return 0xffffff;
    return p.baseColor;
  }
  /** 代表の色（いちばん広い箱の色） */
  get mainColor(): string {
    return hex(this.currentColor(this.parts[0]!));
  }

  setSilhouette(on: boolean): void {
    this.silhouetteOn = on;
    this.refreshMaterials();
  }

  setMotion(m: 'wait' | 'move'): void {
    this.revive();
    this.baseMotion = m;
    this._motion = m;
  }
  attack(): void {
    if (this._motion === 'die') return;
    this._motion = 'attack';
    this.motionT = 0;
  }
  hit(): void {
    if (this._motion === 'die') return;
    this._motion = 'hit';
    this.motionT = 0;
  }
  die(): void {
    if (this._motion === 'die') return;
    this._motion = 'die';
    this.motionT = 0;
  }
  /** たおれからもどす */
  revive(): void {
    if (this._motion !== 'die') return;
    this._motion = this.baseMotion;
    this.motionT = 0;
    this.resetDieState();
    this.pose({ time: this.clock, moving: this.baseMotion === 'move', attackT: -1, dieP: -1 });
  }

  /** 1 コマ進める（秒） */
  update(dt: number): void {
    this.clock += dt;
    this.motionT += dt;
    this.updateBlink(dt);

    const m = this._motion;
    if (m === 'attack' && this.motionT >= this.attackSeconds) {
      this._motion = this.baseMotion;
      this.motionT = 0;
    } else if (m === 'hit' && this.motionT >= HIT_SECONDS) {
      this._motion = this.baseMotion;
      this.motionT = 0;
    }
    const cur = this._motion;
    const t = this.motionT;

    const flash = cur === 'hit' && t < HIT_FLASH_SECONDS;
    if (flash !== this.flashOn) {
      this.flashOn = flash;
      this.refreshMaterials();
    }

    // たたかれた: 後ろへ下がって、上が後ろへかたむいて戻る
    let hitK = 0;
    if (cur === 'hit') hitK = Math.sin((Math.PI * t) / HIT_SECONDS);
    this.rig.position.z = this.knockback ? HIT_BACK_BLOCKS * hitK : 0;
    this.rig.rotation.x = (this.knockback ? HIT_TILT_DEG : 0) * DEG * hitK;
    this.rig.rotation.z = this.knockback ? 0 : 0.05 * Math.sin((Math.PI * 6 * t) / HIT_SECONDS) * hitK;

    let dieP = -1;
    if (cur === 'die') {
      dieP = Math.min(1, t / DIE_FALL_SECONDS);
      this.updateDieEffects(t);
    } else {
      this.resetDieState();
    }
    this.pose({ time: this.clock, moving: cur === 'move', attackT: cur === 'attack' ? t : -1, dieP });
    if (cur === 'die') this.poseDie(dieP);
  }

  private resetDieState(): void {
    this._scale = 1;
    this.rig.scale.setScalar(1);
    this.rig.visible = true;
    this.puffGroup.visible = false;
  }

  private updateDieEffects(t: number): void {
    let s = 1;
    if (t >= DIE_SHRINK_END_SECONDS) s = 0;
    else if (t > DIE_FALL_SECONDS) s = 1 - (t - DIE_FALL_SECONDS) / (DIE_SHRINK_END_SECONDS - DIE_FALL_SECONDS);
    this._scale = s;
    this.rig.scale.setScalar(Math.max(s, 1e-4));
    this.rig.visible = s > 0;
    const pt = t - DIE_SHRINK_END_SECONDS;
    if (pt >= 0 && pt < PUFF_SECONDS) {
      this.puffGroup.visible = true;
      const k = pt / PUFF_SECONDS;
      this.puffMat.opacity = 1 - k;
      const dist = PUFF_SPREAD * (1 - (1 - k) * (1 - k));
      for (let i = 0; i < PUFF_COUNT; i++) {
        const sx = i & 1 ? 1 : -1;
        const sy = i & 2 ? 1 : -1;
        const sz = i & 4 ? 1 : -1;
        const n = dist / Math.sqrt(3);
        this.puffs[i]!.position.set(sx * n, sy * n, sz * n);
      }
    } else {
      this.puffGroup.visible = false;
    }
  }

  private updateBlink(dt: number): void {
    this.blinkClock += dt;
    if (this.blinkClock >= BLINK_PERIOD_SECONDS + BLINK_SECONDS - 1e-9) this.blinkClock -= BLINK_PERIOD_SECONDS + BLINK_SECONDS;
    // 3 秒に 1 回、0.15 秒だけとじる
    const closed = this.blinkClock >= BLINK_PERIOD_SECONDS - 1e-9;
    if (closed !== this.blinkClosed) {
      this.blinkClosed = closed;
      for (let i = 0; i < this.faceMats.length; i++) {
        this.faceMats[i]!.map = closed ? this.faceClosed[i]! : this.faceOpen[i]!;
      }
    }
  }

  private refreshMaterials(): void {
    const flat = this.silhouetteOn || this.flashOn;
    this.flatMat.color.setHex(this.silhouetteOn ? 0x000000 : 0xffffff);
    for (const p of this.parts) p.mesh.material = flat ? this.flatMat : p.normal;
  }

  dispose(): void {
    this.flatMat.dispose();
    this.puffMat.dispose();
    const seen = new Set<THREE.Material>();
    for (const p of this.parts) {
      for (const m of Array.isArray(p.normal) ? p.normal : [p.normal]) seen.add(m);
    }
    for (const m of seen) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
    for (const t of [...this.faceOpen, ...this.faceClosed]) t.dispose();
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
