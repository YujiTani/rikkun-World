import * as THREE from 'three';
import type { AnimalView } from '../../contracts';
import { TILE, TILE_COUNT, type AnimalFx, type ParticleOut } from '../../fx/animalFx';
import { getChickenModel } from './chickenModel';
import { getBugModel } from './bugNetModel';
import { LAND_TICKS, createPose, poseChicken, type PoseBuf } from './chickenPose';
import { CHICKEN_SCALE, COL, V } from './chickenSpec';
import type { BuiltModel } from './voxelMesh';

/**
 * LIVE-1 にわとり を 描く 係（DESIGN 16.6・16.8）。`AnimalView` の 配列を 受けて 描く（しくみ側 `src/animals/` は 読まない）。
 *  - 1 わ = 骨つきの SkinnedMesh 1 つ（描画 1 回）。ねらい中の ふちどりは 1 わ 分 だけ 見える（+1 回）。
 *  - 足もとの 影 = 全部 まとめて InstancedMesh 1 回。ハート・紙ふぶき・けむり・キラッ = Points 1 回。
 *  - 11 わ（やせい 3・なかま 8）で 描画 14 回。毎フレーム new しない（わは 使いまわす）。
 * 使い方: `scene.add(r.group)`、毎フレーム `r.update(views, camera)`。views は 毎ステップ 集めた もの（`ViewBuffer`）でよい。
 */

const D = Math.PI / 180;
/** 影が 出る にわとり の 数の 上限（InstancedMesh の 大きさ） */
const MAX_SHADOWS = 64;
const POINT_CAP = 320;

/** 面の 明るさ（動いた あとの 向き: 上 1.0・南北 0.8・東西 0.6・下 0.5）を かける 材料 */
function shadeMat(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
        vShade = wn.y * wn.y * (wn.y > 0.0 ? 1.0 : 0.5) + wn.z * wn.z * 0.8 + wn.x * wn.x * 0.6;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vShade;');
  };
  return m;
}

/** 丸い 影の 絵（DOM なし。中心 0.5 → ふちで 0） */
function blobTexture(): THREE.DataTexture {
  const N = 32;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2);
      const a = d >= 1 ? 0 : d < 0.6 ? 0.5 - (0.12 * d) / 0.6 : 0.38 * (1 - (d - 0.6) / 0.4);
      const o = (y * N + x) * 4;
      data[o + 3] = Math.round(a * 255);
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ハート 7×6 点（DESIGN 16.6）。うまった = あか、ふち だけ = うすい 白
const HEART_ROWS = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
/** とりの 足あと 7×7（3 本 の 指 ＋ かかと） */
const FOOT_ROWS = ['.X.X.X.', '.X.X.X.', '..XXX..', '...X...', '...X...', '..XXX..', '.......'];
const STAR_ROWS = [
  '...XX...',
  '...XX...',
  '..XXXX..',
  'XXXXXXXX',
  'XXXXXXXX',
  '..XXXX..',
  '...XX...',
  '...XX...',
];

/** つぶの 絵の 並び（左から: 赤ハート・白ハート・星・四角）。1 まい 16×16 × 4 */
function atlasTexture(): THREE.DataTexture {
  const T = 16;
  const W = T * TILE_COUNT;
  const data = new Uint8Array(W * T * 4);
  const put = (tile: number, x: number, y: number, rgb: number): void => {
    const o = (y * W + tile * T + x) * 4;
    data[o] = (rgb >> 16) & 255;
    data[o + 1] = (rgb >> 8) & 255;
    data[o + 2] = rgb & 255;
    data[o + 3] = 255;
  };
  const footprint = (tile: number, fill: number, edge: number): void => {
    const ox = 1;
    const oy = 1;
    const cell = (cx: number, cy: number): boolean => cy >= 0 && cy < FOOT_ROWS.length && cx >= 0 && cx < 7 && FOOT_ROWS[cy][cx] === 'X';
    for (let cy = -1; cy <= FOOT_ROWS.length; cy++) {
      for (let cx = -1; cx <= 7; cx++) {
        const edgeCell = !cell(cx, cy) && (cell(cx - 1, cy) || cell(cx + 1, cy) || cell(cx, cy - 1) || cell(cx, cy + 1));
        if (!cell(cx, cy) && !edgeCell) continue;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const px = ox + cx * 2 + dx;
          const py = oy + cy * 2 + dy;
          if (px >= 0 && px < T && py >= 0 && py < T) put(tile, px, py, cell(cx, cy) ? fill : edge);
        }
      }
    }
  };
  const heart = (tile: number, fill: number): void => {
    // 1 点 = 2×2。まわり 1 点 の ふちを こい色で
    const ox = 1;
    const oy = 2;
    const cell = (cx: number, cy: number): boolean => cy >= 0 && cy < 6 && cx >= 0 && cx < 7 && HEART_ROWS[cy][cx] === 'X';
    for (let cy = -1; cy <= 6; cy++) {
      for (let cx = -1; cx <= 7; cx++) {
        const edge = !cell(cx, cy) && (cell(cx - 1, cy) || cell(cx + 1, cy) || cell(cx, cy - 1) || cell(cx, cy + 1));
        if (!cell(cx, cy) && !edge) continue;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const px = ox + cx * 2 + dx;
          const py = oy + cy * 2 + dy;
          if (px >= 0 && px < T && py >= 0 && py < T) put(tile, px, py, cell(cx, cy) ? fill : 0x5a2430);
        }
      }
    }
  };
  heart(TILE.heartFull, 0xf0503c);
  heart(TILE.heartEmpty, 0xfff4e6);
  // あしあと（とりの 足あと = 3 本 の 指）: うまった = 藍（なかま の 色）、から の わく = うすい 白（ハート と 形が ちがう）
  footprint(TILE.footFull, 0x5b7bc4, 0x23325a);
  footprint(TILE.footEmpty, 0xe9e3d3, 0x7a7f94);
  // おなかいっぱい = まるい おなか（クリーム色。おこった 赤・× は 使わない）
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8.5);
      if (d > 6.4) continue;
      let c = d > 5.2 ? 0x8a6a3a : 0xfff0cf;
      if (c === 0xfff0cf && d > 3.2 && x + y > 17) c = 0xf0d9a8; // 右下 の かげ
      if (c === 0xfff0cf && Math.hypot(x + 0.5 - 6, y + 0.5 - 6.5) < 1.6) c = 0xffffff; // つや
      if (x >= 9 && x <= 11 && y === 10 && d < 5) c = 0xe3c690; // おへそ の せん
      put(TILE.belly, x, y, c);
    }
  }
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) if (STAR_ROWS[cy][cx] === 'X') for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) put(TILE.star, cx * 2 + dx, cy * 2 + dy, 0xffffff);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) put(TILE.dot, x, y, 0xffffff);
  const t = new THREE.DataTexture(data, W, T, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/** 紙ふぶき・ハート・けむり・キラッ・頭の 上の ハート を 1 回で 描く Points（光の しくみに 入れない） */
function makePoints(): { points: THREE.Points; out: ParticleOut; attrs: THREE.BufferAttribute[] } {
  const out: ParticleOut = {
    pos: new Float32Array(POINT_CAP * 3),
    col: new Float32Array(POINT_CAP * 3),
    size: new Float32Array(POINT_CAP),
    tile: new Float32Array(POINT_CAP),
  };
  const g = new THREE.BufferGeometry();
  const attrs = [
    new THREE.BufferAttribute(out.pos, 3).setUsage(THREE.DynamicDrawUsage),
    new THREE.BufferAttribute(out.col, 3).setUsage(THREE.DynamicDrawUsage),
    new THREE.BufferAttribute(out.size, 1).setUsage(THREE.DynamicDrawUsage),
    new THREE.BufferAttribute(out.tile, 1).setUsage(THREE.DynamicDrawUsage),
  ];
  g.setAttribute('position', attrs[0]);
  g.setAttribute('color', attrs[1]);
  g.setAttribute('aSize', attrs[2]);
  g.setAttribute('aTile', attrs[3]);
  g.setDrawRange(0, 0);
  const m = new THREE.PointsMaterial({ size: 1, map: atlasTexture(), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, alphaTest: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute float aSize;\nattribute float aTile;\nvarying float vTile;\nvoid main() {\n  vTile = aTile;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'varying float vTile;\nvoid main() {')
      .replace(
        '#include <map_particle_fragment>',
        `vec2 tileUv = vec2((gl_PointCoord.x + vTile) / ${TILE_COUNT}.0, gl_PointCoord.y);
         diffuseColor *= texture2D( map, tileUv );`,
      );
  };
  m.userData.noDim = true; // 夜でも 同じ 明るさ・光の しくみに 入れない
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.visible = false;
  return { points, out, attrs };
}

interface Entry {
  id: number;
  mark: boolean;
  gen: number;
  root: THREE.Group;
  rig: THREE.Group;
  bones: THREE.Bone[];
  mesh: THREE.SkinnedMesh;
  hull: THREE.SkinnedMesh;
  pose: PoseBuf;
  model: BuiltModel;
  /** 版 3.2: パタパタ の はじまり・着地 の 時刻（ms） */
  flutterOn: boolean;
  flutterStart: number;
  landStart: number;
}

/** 角度を −π〜π に */
export function wrapAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  else if (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export interface AnimalRendererStats {
  /** 見えている にわとり の 数 */
  animals: number;
  /** 今フレーム 描く もの（メッシュ・Points）の 数 = 描画回数 */
  draws: number;
  /** 描く 三角形 の 数（つぶ・影 込み） */
  triangles: number;
}

export interface AnimalRendererOpts {
  /** 音・つぶ・頭の 上の ハート の 計算 */
  fx: AnimalFx;
  /** 「動きの 強さ」0〜1。なければ 1 */
  motion?: () => number;
  /** 時計（ミリ秒。パタパタ・着地 ぽよん の 経過に 使う。なければ performance.now） */
  now?: () => number;
  /**
   * プレイヤー の 足もと（だっこ の 置き場所 を きめる）。カメラ が プレイヤー の 目 に 近ければ 1 人称（画面 の 下 25% に 顔 が 見える）、
   * はなれて いれば 3 人称（プレイヤー の 胸 の 前）。なければ いつも カメラ の 前（1 人称）。
   */
  player?: () => { x: number; y: number; z: number } | null;
}

/** だっこ の 置きかた（DESIGN 16.16・LIVE-1 §2.8・AC28） */
export const CARRY = {
  /** だっこ中 の 大きさ（ふつう より 小さい） */
  scale: 0.7,
  /** にわとり の 高さ（ブロック。コーム まで） */
  height: 0.8,
  /** 1 人称: カメラ から の 前 の 距離 */
  front: 0.75,
  /** 1 人称: にわとり の 上の はし が 来る 画面 の 高さ（ndc。−1 = 下の はし。−0.5 = 下 25% の さかい） */
  topNdc: -0.56,
  /** 3 人称: 胸 の 高さ・前 への 出し */
  chestY: 0.7,
  chestFront: 0.5,
  /** プレイヤー の 目 の 高さ（足もと から） */
  eyeY: 1.6,
  /** カメラ が この 距離 より 近ければ 1 人称（`DOLL_HIDE_DISTANCE`） */
  firstPersonDist: 1.2,
} as const;

/** `carryInfo()` の 中身（テスト・UI 検査用） */
export interface CarryInfo {
  firstPerson: boolean;
  /** にわとり の 足もと の 位置（世界） */
  x: number;
  y: number;
  z: number;
  /** 上の はし の 画面 の 高さ（ndc。−1 = 下の はし） */
  topNdcY: number;
  /** まん中 の 画面 の よこ（ndc） */
  centerNdcX: number;
  /** にわとり の 前（−z）と カメラ の ほう の 向きの 内積（1 = まっすぐ カメラ を 向く） */
  faceToCamera: number;
}

export class AnimalRenderer {
  readonly group = new THREE.Group();
  /** 体の 材料（`Lighting.register(r.bodyMaterial, 'doll')` で 夜に 暗くなる） */
  readonly bodyMaterial = shadeMat();
  private readonly hullMaterial = new THREE.MeshBasicMaterial({ color: COL.outline, fog: false, depthWrite: false });
  private readonly shadows: THREE.InstancedMesh;
  private readonly pts = makePoints();
  private readonly entries = new Map<number, Entry>();
  private readonly pool: Entry[] = [];
  private gen = 0;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();
  private readonly flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private lastStats: AnimalRendererStats = { animals: 0, draws: 0, triangles: 0 };
  /** とぶ むし の 入れ物（見えない ものは 隠して 使いまわす） */
  private readonly bugs: THREE.Group[] = [];
  private carry: CarryInfo | null = null;
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

  constructor(private readonly o: AnimalRendererOpts) {
    this.hullMaterial.userData.noDim = true;
    const shadowMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, fog: false });
    shadowMat.userData.noDim = true;
    this.shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), shadowMat, MAX_SHADOWS);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = -1;
    this.shadows.count = 0;
    this.shadows.visible = false;
    this.group.add(this.shadows, this.pts.points);
  }

  private motion(): number {
    return this.o.motion ? this.o.motion() : 1;
  }

  private now(): number {
    return this.o.now ? this.o.now() : performance.now();
  }

  private make(mark: boolean): Entry {
    const pooled = this.pool.findIndex((e) => e.mark === mark);
    if (pooled >= 0) return this.pool.splice(pooled, 1)[0];
    const model = getChickenModel(mark);
    const root = new THREE.Group();
    const rig = new THREE.Group();
    root.add(rig);
    const bones = model.names.map((n) => {
      const b = new THREE.Bone();
      b.name = n;
      return b;
    });
    bones.forEach((b, i) => {
      b.position.set(model.rest[i][0], model.rest[i][1], model.rest[i][2]);
      const par = model.parents[i];
      if (par >= 0) bones[par].add(b);
      else rig.add(b);
    });
    rig.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(bones);
    const mesh = new THREE.SkinnedMesh(model.geo, this.bodyMaterial);
    mesh.bind(skel, new THREE.Matrix4());
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    const hull = new THREE.SkinnedMesh(model.hull, this.hullMaterial);
    hull.bind(skel, new THREE.Matrix4());
    hull.frustumCulled = false;
    hull.renderOrder = 1; // 地面の あと → ふちどり → 体
    hull.visible = false;
    rig.add(mesh, hull);
    return { id: -1, mark, gen: 0, root, rig, bones, mesh, hull, pose: createPose(), model, flutterOn: false, flutterStart: 0, landStart: -1e12 };
  }

  private release(e: Entry): void {
    e.root.removeFromParent();
    this.entries.delete(e.id);
    e.id = -1;
    if (this.pool.length < 16) this.pool.push(e);
  }

  /** 毎フレーム。`views` = 見えている にわとり（`ViewBuffer.fill()` の 結果）、`camera` = いまの カメラ */
  update(views: readonly AnimalView[], camera: THREE.Camera): void {
    const gen = ++this.gen;
    const motion = this.motion();
    let tris = 0;
    let draws = 0;
    let n = 0;
    this.carry = null;
    camera.updateMatrixWorld();
    for (const v of views) {
      let e = this.entries.get(v.id);
      if (e && e.mark !== v.friend) {
        this.release(e);
        e = undefined;
      }
      if (!e) {
        e = this.make(v.friend);
        e.id = v.id;
        this.entries.set(v.id, e);
        this.group.add(e.root);
      }
      e.gen = gen;
      this.apply(e, v, motion, camera);
      tris += e.model.tris;
      draws++;
      const carried = v.carried === true;
      if (v.targeted && !carried) {
        tris += e.model.hullTris;
        draws++;
      }
      if (!carried && n < MAX_SHADOWS) this.shadow(n++, e, v); // だっこ 中は かげ なし
    }
    // 見えなくなった にわとり を かたづける（ふだんは 通らない）
    if (this.entries.size > views.length) for (const e of [...this.entries.values()]) if (e.gen !== gen) this.release(e);
    this.shadows.count = n;
    this.shadows.visible = n > 0;
    if (n > 0) {
      this.shadows.instanceMatrix.needsUpdate = true;
      draws++;
      tris += n * 2;
    }
    // とぶ むし（1 ぴき 1 回）
    const flights = this.o.fx.flights;
    const bugModel = getBugModel();
    for (let i = 0; i < flights.length; i++) {
      const f = flights[i];
      const g = this.bugs[i] ?? this.makeBug(i);
      g.visible = true;
      g.position.set(f.x, f.y, f.z);
      g.rotation.set(f.pitch, f.yaw, 0);
      g.scale.set(f.scale, f.scale * (1 + f.curl), f.scale * (1 - f.curl));
      draws++;
      tris += bugModel.tris;
    }
    for (let i = flights.length; i < this.bugs.length; i++) this.bugs[i].visible = false;
    // つぶ・頭の 上の しるし
    const el = camera.matrixWorld.elements;
    const cnt = this.o.fx.write(this.pts.out, POINT_CAP, { x: el[0], z: el[2] });
    const pt = this.pts.points;
    pt.visible = cnt > 0;
    if (cnt > 0) {
      for (const a of this.pts.attrs) a.needsUpdate = true;
      pt.geometry.setDrawRange(0, cnt);
      draws++;
      tris += cnt * 2;
    }
    this.lastStats = { animals: views.length, draws, triangles: tris };
  }

  private apply(e: Entry, v: AnimalView, motion: number, camera: THREE.Camera): void {
    const carried = v.carried === true;
    const now = this.now();
    // パタパタ・着地 ぽよん の 経過（ステップ。1 ステップ = 1000/60 ミリ秒）
    const fl = v.fluttering === true && !carried;
    if (fl && !e.flutterOn) e.flutterStart = now;
    if (!fl && e.flutterOn && !carried) e.landStart = now;
    e.flutterOn = fl;
    const flutterT = fl ? (now - e.flutterStart) * 0.06 : 0;
    const landT = e.landStart > -1e11 && !fl && !carried ? (now - e.landStart) * 0.06 : -1;
    if (carried) {
      this.placeCarried(e, v, camera);
    } else {
      e.root.scale.set(1, 1, 1);
      e.root.rotation.set(0, -v.yaw, 0); // ゲームの 向きは −yaw（妖怪と 同じ）
      e.root.position.set(v.x, v.y, v.z);
    }
    poseChicken(e.pose, {
      state: carried ? 'carried' : v.state,
      stateTicks: v.stateTicks,
      headRelYaw: carried ? 0 : wrapAngle(v.headYaw - v.yaw),
      motion,
      fluttering: fl,
      flutterT,
      landT: landT < LAND_TICKS ? landT : -1,
    });
    const p = e.pose;
    const bones = e.bones;
    const rest = e.model.rest;
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      b.position.set(rest[i][0] + p.off[i * 3] * V, rest[i][1] + p.off[i * 3 + 1] * V, rest[i][2] + p.off[i * 3 + 2] * V);
      b.rotation.set(p.rot[i * 3] * D, p.rot[i * 3 + 1] * D, p.rot[i * 3 + 2] * D);
      b.scale.set(p.sc[i * 3], p.sc[i * 3 + 1], p.sc[i * 3 + 2]);
    }
    e.rig.position.y = p.rigY;
    e.rig.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    e.hull.visible = v.targeted && !carried;
    e.root.updateMatrixWorld(true);
    if (carried && !this.carry) this.measureCarry(e, camera);
  }

  /** だっこ 中の 置き場所（§2.8・AC28）。1 人称 = カメラ の 前 の 画面 の 下 25%、3 人称 = プレイヤー の 胸 の 前 */
  private placeCarried(e: Entry, v: AnimalView, camera: THREE.Camera): void {
    const cam = camera.getWorldPosition(this.v1);
    const feet = this.o.player ? this.o.player() : null;
    let first = true;
    if (feet) {
      const d = Math.hypot(cam.x - feet.x, cam.y - (feet.y + CARRY.eyeY), cam.z - feet.z);
      first = d < CARRY.firstPersonDist;
    }
    e.root.scale.setScalar(CARRY.scale);
    if (first) {
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 75;
      const tanHalf = Math.tan((fov * D) / 2);
      const topY = CARRY.topNdc * CARRY.front * tanHalf;
      this.v2.set(0, topY - CARRY.height * CARRY.scale, -CARRY.front).applyMatrix4(camera.matrixWorld);
      e.root.position.copy(this.v2);
      camera.getWorldQuaternion(this.tmpQ);
      e.root.quaternion.copy(this.tmpQ).multiply(this.flipY); // 顔（−z）が カメラ の ほう
    } else {
      let fx = feet!.x - cam.x;
      let fz = feet!.z - cam.z;
      const len = Math.hypot(fx, fz);
      if (len < 1e-4) {
        fx = 0;
        fz = -1;
      } else {
        fx /= len;
        fz /= len;
      }
      const px = feet!.x + fx * CARRY.chestFront;
      const pz = feet!.z + fz * CARRY.chestFront;
      e.root.position.set(px, feet!.y + CARRY.chestY, pz);
      e.root.rotation.set(0, Math.atan2(-(cam.x - px), -(cam.z - pz)), 0); // 顔 が カメラ の ほう
    }
    void v;
  }

  private measureCarry(e: Entry, camera: THREE.Camera): void {
    const pos = e.root.position;
    const h = CARRY.height * CARRY.scale;
    const camPos = camera.getWorldPosition(this.v1);
    this.v2.set(0, h, 0).applyMatrix4(e.root.matrixWorld).project(camera);
    const topNdcY = this.v2.y;
    this.v2.set(0, h / 2, 0).applyMatrix4(e.root.matrixWorld).project(camera);
    const centerNdcX = this.v2.x;
    // 前（−z）の 向き と カメラ への 向き
    this.v2.set(0, 0, -1).applyQuaternion(e.root.getWorldQuaternion(this.tmpQ)).normalize();
    this.v3.set(camPos.x - pos.x, camPos.y - (pos.y + h / 2), camPos.z - pos.z).normalize();
    const firstPerson = this.o.player ? (() => {
      const feet = this.o.player!();
      return !feet || Math.hypot(camPos.x - feet.x, camPos.y - (feet.y + CARRY.eyeY), camPos.z - feet.z) < CARRY.firstPersonDist;
    })() : true;
    this.carry = { firstPerson, x: pos.x, y: pos.y, z: pos.z, topNdcY, centerNdcX, faceToCamera: this.v2.dot(this.v3) };
  }

  /** だっこ して いる にわとり の 置き場所（なければ null。テスト・UI 検査用） */
  carryInfo(): CarryInfo | null {
    return this.carry;
  }

  private makeBug(i: number): THREE.Group {
    const model = getBugModel();
    const holder = new THREE.Group();
    const bone = new THREE.Bone();
    holder.add(bone);
    const mesh = new THREE.SkinnedMesh(model.geo, this.bodyMaterial);
    mesh.name = 'bug';
    mesh.bind(new THREE.Skeleton([bone]), new THREE.Matrix4());
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    holder.add(mesh);
    holder.visible = false;
    this.group.add(holder);
    this.bugs[i] = holder;
    return holder;
  }

  private shadow(i: number, e: Entry, v: AnimalView): void {
    const bb = e.model.geo.boundingBox!;
    const sx = (bb.max.x - bb.min.x) * 1.5 + 0.1;
    const sz = (bb.max.z - bb.min.z) * 1.25 + 0.1;
    const k = e.pose.scale[0] / CHICKEN_SCALE; // 出てくる・しゃがむ に 合わせる
    const shrink = Math.max(0.5, 1 - e.pose.rigY * 0.6); // とぶと 影は 小さく
    this.tmpP.set(v.x, v.y + 0.012, v.z);
    this.tmpQ.setFromAxisAngle(this.up, -v.yaw);
    this.tmpQ2.copy(this.tmpQ).multiply(this.flat);
    this.tmpS.set(sx * k * shrink, sz * k * shrink, 1);
    this.tmpM.compose(this.tmpP, this.tmpQ2, this.tmpS);
    this.shadows.setMatrixAt(i, this.tmpM);
  }

  stats(): AnimalRendererStats {
    return this.lastStats;
  }

  dispose(): void {
    for (const e of [...this.entries.values()]) this.release(e);
    this.shadows.geometry.dispose();
    (this.shadows.material as THREE.Material).dispose();
    this.pts.points.geometry.dispose();
    (this.pts.points.material as THREE.Material).dispose();
    this.bodyMaterial.dispose();
    this.hullMaterial.dispose();
    this.group.removeFromParent();
  }
}

/**
 * `animals.forEachVisible(fn)` の 結果を 使いまわしの 配列に 集める（しくみ側が 同じ 入れ物を 使いまわしても 安全 に
 * コピーする）。毎ステップ `fill()` → `fx.step(views, eye)`、描く ときは 同じ 配列を `update()` に わたす。
 */
export class ViewBuffer {
  private readonly items: AnimalView[] = [];
  private n = 0;
  readonly views: AnimalView[] = [];

  fill(api: { forEachVisible(fn: (v: AnimalView) => void): void }): readonly AnimalView[] {
    this.n = 0;
    api.forEachVisible((v) => {
      let o = this.items[this.n];
      if (!o) o = this.items[this.n] = { ...v };
      else Object.assign(o, v);
      this.n++;
    });
    this.views.length = this.n;
    for (let i = 0; i < this.n; i++) this.views[i] = this.items[i];
    return this.views;
  }
}
