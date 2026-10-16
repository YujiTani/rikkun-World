import * as THREE from 'three';
import type { YokaiTitle } from '../contracts';
import { buildNickMarks, createNushiGlow, nushiGlowOpacity, type NickMarkKind, type NickMarks } from './nickMarks';

export const DEG = Math.PI / 180;

/** 時間のくらべで、浮動小数点のずれをゆるす */
export const EPS = 1e-6;
/** 当たり判定の箱（'当たり' の段階）が続く長さ（秒）。 M3 本番の「当たり」の窓 */
export const HIT_WINDOW_SECONDS = 0.1;

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
/** ねらわれたときの ふちどり: 黄色（--rk-accent に近い）・裏面だけ・ライトなし・点滅なし */
const FOCUS_MAT = new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.BackSide, fog: false });
const FOCUS_TMP = new THREE.Vector3();
const FOCUS_MIN_DIM = 0.05;
/** ふちの太さ（ブロック何こ分）: 距離 × 0.010 を、細すぎ・太すぎにならない範囲に */
const FOCUS_PER_DIST = 0.01;
const FOCUS_MIN_W = 0.035;
const FOCUS_MAX_W = 0.14;

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

/** 当たり判定の箱。妖怪の root から見た位置（中心）と大きさ。向き（yaw）はかけていない */
export interface HitBox {
  cx: number;
  cy: number;
  cz: number;
  w: number;
  h: number;
  d: number;
}

export interface YokaiHitEvent {
  yokai: YokaiBase;
  box: HitBox;
}

/** 攻撃の段階: cue = 合図（当たるまで）、hit = 当たり（当たってから 0.1 秒）、recover = すき */
export type AttackPhaseName = 'cue' | 'hit' | 'recover';
export interface AttackPhase {
  phase: AttackPhaseName;
  /** 攻撃を始めてからの秒 */
  t: number;
  /** 当たり判定が出る秒 */
  hitAt: number;
  /** 攻撃の合計の長さ（秒） */
  duration: number;
  /** 当たり判定がもう出たか */
  fired: boolean;
}

export interface YokaiPoseInput {
  /** ずっと進む時計（秒） */
  time: number;
  /** 「うごく」中か */
  moving: boolean;
  /** 「うごく」を始めてからの秒 */
  moveT: number;
  /** 攻撃の経過秒（攻撃中でなければ -1） */
  attackT: number;
  /** たおれの進み具合 0〜1（0.4 秒かけて）。たおれていなければ -1 */
  dieP: number;
}

/**
 * 妖怪のモデルの土台。箱をグループで組み、動きは absolute に pose() で毎回決める。
 * 共通の「たたかれた」「ポンと消える」「まばたき」「かげ」「攻撃の段階」はここで受け持つ。
 * たたかれた（白く光る・下がる）は上に重なるだけで、攻撃は止まらない。
 */
export abstract class YokaiBase {
  abstract readonly id: string;
  abstract readonly displayName: string;
  /** 攻撃の長さ（秒） */
  abstract readonly attackSeconds: number;
  /** 攻撃を始めてから当たり判定が出るまで（秒） */
  abstract readonly hitAt: number;
  /** M3 本番で使う移動の速さ（ブロック/秒）。見本ページでは使わない */
  abstract readonly moveSpeed: number;
  /** たたかれたとき後ろへ下がるか（ぬりかべは下がらず、ゆれるだけ） */
  protected knockback = true;

  /** ねらう所（プレイヤーの足もと）。root から見た位置。攻撃を始める前に決める */
  readonly aim = new THREE.Vector3(0, 0, -2.5);
  /** 攻撃の当たりが出た瞬間に呼ばれる */
  onHit: ((e: YokaiHitEvent) => void) | null = null;
  /** 当たりが出た回数と、いちばん新しい箱 */
  hitCount = 0;
  lastHitBox: HitBox | null = null;

  /** 外から置く場所・向きはここ */
  readonly root = new THREE.Group();
  /** たたかれた・たおれの動きがかかる所（足もとが原点） */
  protected readonly rig = new THREE.Group();
  /** 落ちているときの かたむき（ラジアン。からかさのゆらゆら用。たたかれたゆれに足される） */
  fallTilt = 0;
  /** みず で石になっていく度合い 0〜1（色を石の灰色へ近づける。applyDollBrightness が読む） */
  stoneness = 0;
  /** 色の段階 1〜3（applyDollBrightness が決める。ちょうちんの どうの色など、毎ステップ色を決めるモデルが読む） */
  stage: 1 | 2 | 3 = 1;
  private readonly puffGroup = new THREE.Group();
  private readonly puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  private readonly puffs: THREE.Mesh[] = [];

  private parts: Part[] = [];
  private readonly flatMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly focusHulls: { hull: THREE.Mesh; src: THREE.Mesh; w: number; h: number; d: number }[] = [];
  private _focused = false;
  private silhouetteOn = false;
  private flashOn = false;

  private faceMats: THREE.MeshBasicMaterial[] = [];
  private faceOpen: THREE.Texture[] = [];
  private faceClosed: THREE.Texture[] = [];
  private faceScary: (THREE.Texture | null)[] = [];
  private scaryOn = false;
  private blinkClosed = false;
  private blinkClock = 0;

  private baseMotion: 'wait' | 'move' = 'wait';
  private dying = false;
  private dieT = 0;
  private hitT = -1;
  private attackT = -1;
  private hitFired = false;
  private moveT = 0;
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

  // ---- ねらわれたときの黄色いふちどり（反転ハル。モデルの一部。ふだんは隠れている） ----
  /** 各箱の子として作る。子なので 首・手足・傘の動きにそのまま付いてくる。新しい妖怪にも finish() で自動で付く */
  private buildFocusHulls(): void {
    for (const p of this.parts) {
      const g = p.mesh.geometry as THREE.BoxGeometry;
      const q = g.parameters;
      // 顔の板のような うすい箱には付けない（ふくらませると 大きくなりすぎる）
      if (!q || Math.min(q.width, q.height, q.depth) < FOCUS_MIN_DIM) continue;
      const hull = new THREE.Mesh(g, FOCUS_MAT);
      hull.visible = false;
      hull.userData.focusHull = true;
      p.mesh.add(hull);
      this.focusHulls.push({ hull, src: p.mesh, w: q.width, h: q.height, d: q.depth });
    }
  }

  /** ふちどりを出す・隠す */
  setFocus(on: boolean): void {
    if (on === this._focused) return;
    this._focused = on;
    for (const e of this.focusHulls) e.hull.visible = on;
  }

  focused(): boolean {
    return this._focused;
  }

  /** ふちどりの複製の数（描画回数の増え分。ねらわれている間だけ） */
  focusHullCount(): number {
    return this.focusHulls.length;
  }

  /** ねらわれている間、毎ステップ: 見る人からの距離 dist に合わせて ふちの太さを決める（画面での太さが ほぼ一定） */
  updateFocus(dist: number): void {
    if (!this._focused) return;
    const wd = Math.min(FOCUS_MAX_W, Math.max(FOCUS_MIN_W, dist * FOCUS_PER_DIST));
    for (const e of this.focusHulls) {
      e.src.getWorldScale(FOCUS_TMP);
      const k = (2 * wd) / Math.max(1e-4, (FOCUS_TMP.x + FOCUS_TMP.y + FOCUS_TMP.z) / 3);
      e.hull.scale.set(1 + k / e.w, 1 + k / e.h, 1 + k / e.d);
    }
  }

  // ---- 二つ名の 頭の印・ヌシの光（nickMarks.ts） ----
  /** 印を つける 頭の グループ（首・かさ の動きに ついてくる）。印のない妖怪は null */
  protected headGroup(): THREE.Object3D | null {
    return null;
  }
  private nickMarks: NickMarks | null = null;
  private nickGlow: THREE.Mesh | null = null;
  nickTitle: YokaiTitle = 'none';

  /** 二つ名に合わせて 印（たいしょう = はちまき、ヌシ = かんむり）と 光（ヌシ）を つけかえる */
  setNickMarks(title: YokaiTitle): void {
    if (title === this.nickTitle) return;
    this.nickTitle = title;
    if (this.nickMarks) {
      const gone = new Set<THREE.Object3D>();
      this.nickMarks.group.traverse((o) => gone.add(o));
      for (const p of this.parts) if (gone.has(p.mesh)) (p.normal as THREE.Material).dispose();
      this.parts = this.parts.filter((p) => !gone.has(p.mesh));
      this.nickMarks.group.removeFromParent();
      this.nickMarks = null;
    }
    if (this.nickGlow) {
      (this.nickGlow.material as THREE.Material).dispose();
      this.nickGlow.removeFromParent();
      this.nickGlow = null;
    }
    const head = this.headGroup();
    const marks = head ? buildNickMarks(this.id, title) : null;
    if (marks && head) {
      head.add(marks.group);
      marks.group.traverse((o) => {
        if (o instanceof THREE.Mesh) this.parts.push({ mesh: o, normal: o.material as THREE.Material, baseColor: (o.material as THREE.MeshBasicMaterial).color.getHex() });
      });
      this.nickMarks = marks;
    }
    if (marks && title === 'nushi') {
      this.nickGlow = createNushiGlow({ width: this._size.width, height: this._size.height, depth: this._size.depth });
      this.rig.add(this.nickGlow);
    }
  }

  /** 印・光の 記録（テスト用） */
  nickInfo(): { kind: NickMarkKind | 'none'; markOnHead: boolean; markColors: number[]; glow: THREE.Mesh | null } {
    const head = this.headGroup();
    const cols: number[] = [];
    this.nickMarks?.group.traverse((o) => o instanceof THREE.Mesh && cols.push((o.material as THREE.MeshBasicMaterial).color.getHex()));
    return {
      kind: this.nickMarks?.kind ?? 'none',
      markOnHead: !!this.nickMarks && !!head && this.nickMarks.group.parent === head,
      markColors: cols,
      glow: this.nickGlow,
    };
  }

  /** サブクラスのコンストラクタの最後で呼ぶ */
  protected finish(): void {
    this.buildFocusHulls();
    this.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(this.rig);
    this._size = {
      width: round(b.max.x - b.min.x),
      height: round(b.max.y),
      depth: round(b.max.z - b.min.z),
      minY: round(b.min.y),
    };
    this.puffGroup.position.y = (b.max.y + b.min.y) / 2;
    this.pose({ time: 0, moving: false, moveT: 0, attackT: -1, dieP: -1 });
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

  /** 顔の板（おく 0.02）。開いた目と閉じた目（と、あれば怖い顔）のドット絵を受け取る */
  protected addFace(
    parent: THREE.Object3D,
    size: number,
    pos: readonly [number, number, number],
    open: THREE.Texture,
    closed: THREE.Texture,
    opaque = false,
    scary: THREE.Texture | null = null,
  ): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ map: open, transparent: !opaque, alphaTest: opaque ? 0 : 0.5 });
    this.faceMats.push(mat);
    this.faceOpen.push(open);
    this.faceClosed.push(closed);
    this.faceScary.push(scary);
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
  /** たおれ方（0〜0.4 秒の間、p=0〜1）。pose のあとに呼ばれる */
  protected abstract poseDie(p: number): void;
  /** 当たり判定の箱（root から見た位置）。当たりの瞬間に使う */
  protected abstract attackHitBox(): HitBox;
  /** 攻撃を始めたとき（ねらう所を決めるなど） */
  protected onAttackStart(): void {}
  /** 当たりが出た瞬間の追加の効果（火の玉を出す、けむりなど） */
  protected onAttackHit(_box: HitBox): void {}
  /** 外から見たい、いまの姿の数字（デバッグ・テスト用） */
  info(): Record<string, number> {
    return {};
  }

  // ---- 外から見えるもの ----
  get motion(): YokaiMotion {
    if (this.dying) return 'die';
    if (this.attackT >= 0) return 'attack';
    if (this.hitT >= 0) return 'hit';
    return this.baseMotion;
  }
  /** 「うごく」中か（攻撃・たおれ中は false） */
  get moving(): boolean {
    return !this.dying && this.baseMotion === 'move' && this.attackT < 0;
  }
  get size(): YokaiSize {
    return this._size;
  }
  /** 全体の大きさ（たおれると 0 になる） */
  get scale(): number {
    return this._scale;
  }
  get dead(): boolean {
    return this.dying && this.dieT >= DIE_TOTAL_SECONDS - EPS;
  }
  get silhouette(): boolean {
    return this.silhouetteOn;
  }
  get blinking(): boolean {
    return this.blinkClosed;
  }
  /** いまの顔 */
  get faceState(): 'open' | 'closed' | 'scary' {
    if (this.scaryOn && this.faceScary.some((t) => t)) return 'scary';
    return this.blinkClosed ? 'closed' : 'open';
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

  /** 攻撃の段階（攻撃中でなければ null）。M3 本番はこれを見て「合図・当たり・すき」を知る */
  attackPhase(): AttackPhase | null {
    if (this.attackT < 0) return null;
    const t = this.attackT;
    const phase: AttackPhaseName = !this.hitFired ? 'cue' : t < this.hitAt + HIT_WINDOW_SECONDS - EPS ? 'hit' : 'recover';
    return { phase, t, hitAt: this.hitAt, duration: this.attackSeconds, fired: this.hitFired };
  }

  setSilhouette(on: boolean): void {
    this.silhouetteOn = on;
    this.refreshMaterials();
  }

  setMotion(m: 'wait' | 'move'): void {
    this.revive();
    this.cancelAttack();
    if (m === 'move' && this.baseMotion !== 'move') this.moveT = 0;
    this.baseMotion = m;
  }
  attack(): void {
    if (this.dying || this.attackT >= 0) return;
    this.attackT = 0;
    this.hitFired = false;
    this.onAttackStart();
  }
  /** たたかれた。攻撃中でも攻撃は止まらない（白く光るだけ） */
  hit(): void {
    if (this.dying) return;
    this.hitT = 0;
  }
  die(): void {
    if (this.dying) return;
    this.dying = true;
    this.dieT = 0;
    this.attackT = -1;
    this.hitT = -1;
  }
  private cancelAttack(): void {
    this.attackT = -1;
    this.hitFired = false;
  }
  /** たおれからもどす */
  revive(): void {
    if (!this.dying) return;
    this.dying = false;
    this.dieT = 0;
    this.resetDieState();
    this.pose({ time: this.clock, moving: this.baseMotion === 'move', moveT: this.moveT, attackT: -1, dieP: -1 });
  }

  /** 1 コマ進める（秒） */
  update(dt: number): void {
    this.clock += dt;
    this.updateBlink(dt);
    if (this.nickGlow) (this.nickGlow.material as THREE.MeshBasicMaterial).opacity = nushiGlowOpacity(this.clock);

    if (this.dying) {
      this.dieT += dt;
    } else {
      if (this.baseMotion === 'move') this.moveT += dt;
      if (this.hitT >= 0) {
        this.hitT += dt;
        if (this.hitT >= HIT_SECONDS - EPS) this.hitT = -1;
      }
      if (this.attackT >= 0) {
        this.attackT += dt;
        if (!this.hitFired && this.attackT >= this.hitAt - EPS) {
          this.hitFired = true;
          const box = this.attackHitBox();
          this.hitCount++;
          this.lastHitBox = box;
          this.onAttackHit(box);
          this.onHit?.({ yokai: this, box });
        }
        if (this.attackT >= this.attackSeconds - EPS) this.cancelAttack();
      }
    }

    const flash = this.hitT >= 0 && this.hitT < HIT_FLASH_SECONDS - EPS;
    if (flash !== this.flashOn) {
      this.flashOn = flash;
      this.refreshMaterials();
    }

    // たたかれた: 後ろへ下がって、上が後ろへかたむいて戻る（ぬりかべはゆれるだけ）
    const t = this.hitT;
    const hitK = t >= 0 ? Math.sin((Math.PI * t) / HIT_SECONDS) : 0;
    this.rig.position.z = this.knockback ? HIT_BACK_BLOCKS * hitK : 0;
    this.rig.rotation.x = (this.knockback ? HIT_TILT_DEG : 0) * DEG * hitK;
    this.rig.rotation.z = (!this.knockback && t >= 0 ? 8 * DEG * Math.sin((Math.PI * 4 * t) / HIT_SECONDS) : 0) + this.fallTilt;

    let dieP = -1;
    if (this.dying) {
      dieP = Math.min(1, this.dieT / DIE_FALL_SECONDS);
      this.updateDieEffects(this.dieT);
    } else {
      this.resetDieState();
    }
    this.pose({
      time: this.clock,
      moving: !this.dying && this.baseMotion === 'move',
      moveT: this.moveT,
      attackT: this.attackT,
      dieP,
    });
    if (this.dying) this.poseDie(dieP);
  }

  private resetDieState(): void {
    this._scale = 1;
    this.rig.scale.setScalar(1);
    this.rig.visible = true;
    this.puffGroup.visible = false;
  }

  private updateDieEffects(t: number): void {
    let s = 1;
    if (t >= DIE_SHRINK_END_SECONDS - EPS) s = 0;
    else if (t > DIE_FALL_SECONDS) s = 1 - (t - DIE_FALL_SECONDS) / (DIE_SHRINK_END_SECONDS - DIE_FALL_SECONDS);
    this._scale = s;
    this.rig.scale.setScalar(Math.max(s, 1e-4));
    this.rig.visible = s > 0;
    const pt = t - DIE_SHRINK_END_SECONDS;
    if (pt >= -EPS && pt < PUFF_SECONDS) {
      this.puffGroup.visible = true;
      const k = Math.max(0, pt) / PUFF_SECONDS;
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

  /** 怖い顔にする（あれば）。ろくろくびの攻撃で使う */
  protected setScary(on: boolean): void {
    if (on === this.scaryOn) return;
    this.scaryOn = on;
    this.applyFace();
  }

  private updateBlink(dt: number): void {
    this.blinkClock += dt;
    if (this.blinkClock >= BLINK_PERIOD_SECONDS + BLINK_SECONDS - 1e-9) this.blinkClock -= BLINK_PERIOD_SECONDS + BLINK_SECONDS;
    // 3 秒に 1 回、0.15 秒だけとじる
    const closed = this.blinkClock >= BLINK_PERIOD_SECONDS - 1e-9;
    if (closed !== this.blinkClosed) {
      this.blinkClosed = closed;
      this.applyFace();
    }
  }

  private applyFace(): void {
    for (let i = 0; i < this.faceMats.length; i++) {
      const sc = this.scaryOn ? this.faceScary[i] : null;
      this.faceMats[i]!.map = sc ?? (this.blinkClosed ? this.faceClosed[i]! : this.faceOpen[i]!);
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
    this.setNickMarks('none');
    const seen = new Set<THREE.Material>();
    for (const p of this.parts) {
      for (const m of Array.isArray(p.normal) ? p.normal : [p.normal]) seen.add(m);
    }
    for (const m of seen) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      const sm = m.userData.stageMaps as Record<number, THREE.Texture> | undefined;
      if (sm) for (const t of Object.values(sm)) t.dispose();
      m.dispose();
    }
    for (const t of [...this.faceOpen, ...this.faceClosed]) t.dispose();
    for (const t of this.faceScary) t?.dispose();
  }
}

/** 白いけむりの立方体が外へ広がって消える（ぬりかべの どすーん で使う） */
export class Smoke {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  private readonly cubes: THREE.Mesh[] = [];
  private t = -1;
  constructor(
    private readonly count: number,
    size: number,
    private readonly spread: number,
    private readonly seconds: number,
  ) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(boxGeo(size, size, size), this.mat);
      this.cubes.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
  }
  start(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.t = 0;
    this.group.visible = true;
    this.apply();
  }
  get active(): boolean {
    return this.t >= 0;
  }
  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    if (this.t >= this.seconds) {
      this.t = -1;
      this.group.visible = false;
      return;
    }
    this.apply();
  }
  private apply(): void {
    const k = this.t / this.seconds;
    this.mat.opacity = 1 - k;
    const dist = this.spread * (1 - (1 - k) * (1 - k));
    for (let i = 0; i < this.count; i++) {
      const a = (i / this.count) * Math.PI * 2;
      this.cubes[i]!.position.set(Math.cos(a) * dist, 0.1 + 0.4 * k, Math.sin(a) * dist);
    }
  }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
