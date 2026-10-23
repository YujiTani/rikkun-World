import * as THREE from 'three';
import type { BladeTech, Vec3 } from '../contracts';
import { slashAngleDeg, slashSwingSign, slashViewFor, type SlashView } from '../legend/slashView';
import {
  SLASH3,
  SLASH_FRAMES,
  centroidOf,
  createHit,
  flashFrameAt,
  frameAt,
  frameSteps,
  hitAlive,
  makeRng,
  rollVariation,
  rowOf,
  spawnDelayOf,
  stepHit,
  uvOf,
  type HitBurst,
  type SlashStep,
} from './nijiSlashModel';

/**
 * 白い 斬撃（どの 刀でも 使う 土台）。2026-10-23 オーナーの 決定: 虹の 斬撃 v3（つき=槍・きりあげ=三日月・けさ=「く」）を 白に して
 * 全ての 武器で 使う。武器ごとの エフェクトは この 上の 層に 重ねる。形・コマ・タイミングは 虹の v3（nijiSlash3.json）と 同じで 色だけ 白。
 * 絵の もとは art/WEAPON-9/slash-niji/build.py --white。
 * 斬撃の 板 = 1 描画・当たりの 火花（すじ ＋ まん中の 光）= 1 描画（見えている 時だけ）。材質は `warmUp` で 読みこみ中に 作る。
 */
const BASE = './models/fx/';
/** 当たりの 火花の すじ・まん中の 光を まとめる 板の 数（1 描画）。同時に 当たる 妖怪は 8 体まで */
const MAX_HITS = 8;
/** 斬撃の 板を カメラから 遠ざける 量（マス）。キャラ・妖怪を かくさない */
const SLASH_BACK = 2.5;
/**
 * 火花の 大きさ（高い 細かさの 絵: 1 点 = 1/32 ブロック）。すじの 升 24 点 = 0.75 ブロック・光の 升 48 点 = 1 ブロック（光の 中身は 0.6 ブロック 以下）。
 * 妖怪の 体より 小さく（エフェクトで 動きを かくさない）。とびちる きょりも 0.6 倍。カメラ側へ 出す 量
 */
const SPARK_SIZE_K = 1.5;
const FLASH_SIZE_K = 1.0;
const SPARK_TRAVEL = 0.6;
const SPARK_TOWARD = 1.8;
const QX = [-1, 1, -1, 1];
const QY = [1, 1, -1, -1];
const MAX_QUADS = MAX_HITS * 9;
/** 絵を 作った ときの 刀の とどき（マス）。武器の とどきが ちがう ときは この 比で 長さ・位置を のばす */
export const SLASH_BASE_REACH = 2.2;

/** うしろ・正面（角 0°・180°）= 体の 前 2.2 マス・等倍 → 真横（90°）= 前 1.3 マス・0.55 倍。角に ついて なめらかに かえる */
const slashReach = (angleDeg: number): { dist: number; scale: number } => {
  const s = Math.sin((angleDeg * Math.PI) / 180);
  return { dist: 2.2 - 0.9 * s, scale: 1 - 0.45 * s };
};

function tex(url: string): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface SlashInfo {
  view: SlashView;
  angle: number;
  age: number;
  /** 板の まん中の 世界の 位置 */
  pos: Vec3;
  tech: BladeTech;
  /** 何段目（1〜3） */
  step: SlashStep;
  /** 今の コマ（0〜5）・読んでいる 絵の 行（0〜5） */
  frame: number;
  row: number;
  /** カメラから 見て 左へ 振る = 絵を 左右 反転 */
  mirror: boolean;
}

/** 斬撃の 注文（techStart で 出し、spawnDelay ステップ あとに 出る） */
export interface SlashRequest {
  tech: BladeTech;
  step: SlashStep;
  /** わざの 向き（度。北 0° から 時計まわり） */
  uDeg: number;
  /** 出る 時の 体の 足もと（待つ 間に 動くので 出る 時に 聞く） */
  pos: () => Vec3;
  /** その 武器の とどき（マス。`bladeReach`）。なければ 2.2（絵の 基準） */
  reach?: number;
}

export class SlashFx {
  private readonly group = new THREE.Group();
  private readonly slashTex: THREE.Texture;
  private readonly slashTexReduced: THREE.Texture;
  private readonly slashMesh: THREE.Mesh;
  private readonly sparkTex: THREE.Texture;
  private readonly sparkMesh: THREE.Mesh;
  private readonly sparkPos: THREE.BufferAttribute;
  private readonly sparkUv: THREE.BufferAttribute;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly qz = new THREE.Quaternion();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly rng = makeRng(0x9e3779b9);
  private pending: { req: SlashRequest; wait: number } | null = null;
  private slashTech: BladeTech = 'thrust';
  private slashStepNo: SlashStep = 1;
  private slashSteps: number[] = [];
  private slashRow = 0;
  private slashFrame = 0;
  private slashMirror = false;
  private slashRoll = 0;
  private hits: { burst: HitBurst; at: Vec3 }[] = [];
  private reducedNow = false;
  private slashAge = -1;
  private slashView: SlashView = 'side';
  private slashAngle = 0;
  private readonly slashTip = new THREE.Vector3();
  private slashScale = 1;
  private lastView: SlashView | null = null;
  private sparkQuads = 0;
  private qn = 0;
  /** 火花の 板を 書く 時の カメラの 右・上（毎ステップ 作らない） */
  private readonly qv = new Float32Array(6);
  private readonly scene: THREE.Scene;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    base = BASE,
  ) {
    this.slashTex = tex(`${base}slash_white3.png`);
    this.slashTex.repeat.set(1 / SLASH_FRAMES, 1 / SLASH_FRAMES);
    this.slashTexReduced = tex(`${base}slash_white3_reduced.png`);
    this.slashTexReduced.repeat.set(1 / SLASH_FRAMES, 1 / SLASH_FRAMES);
    this.slashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(SLASH3.plateBlocks, SLASH3.plateBlocks * (SLASH3.frameSize[1]! / SLASH3.frameSize[0]!)),
      new THREE.MeshBasicMaterial({ map: this.slashTex, transparent: true, alphaTest: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    );
    this.slashMesh.renderOrder = 5;

    // 当たりの 火花（すじ・まん中の 光）は 1 まいの 絵から 1 つの 形に まとめて 1 描画
    this.sparkTex = tex(`${base}slash_white_hit.png`);
    const sg = new THREE.BufferGeometry();
    this.sparkPos = new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 4 * 3), 3);
    this.sparkPos.setUsage(THREE.DynamicDrawUsage);
    this.sparkUv = new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 4 * 2), 2);
    this.sparkUv.setUsage(THREE.DynamicDrawUsage);
    const idx = new Uint16Array(MAX_QUADS * 6);
    for (let i = 0; i < MAX_QUADS; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    sg.setAttribute('position', this.sparkPos);
    sg.setAttribute('uv', this.sparkUv);
    sg.setIndex(new THREE.BufferAttribute(idx, 1));
    sg.setDrawRange(0, 0);
    this.sparkMesh = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: this.sparkTex, alphaTest: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.sparkMesh.renderOrder = 6;

    for (const o of [this.slashMesh, this.sparkMesh]) {
      o.frustumCulled = false;
      o.visible = false;
      this.group.add(o);
    }
    scene.add(this.group);
    this.scene = scene;
  }

  /** シーンから はずして 形・材質・絵を すてる */
  dispose(): void {
    this.scene.remove(this.group);
    for (const o of [this.slashMesh, this.sparkMesh]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    // 板の 絵は ふたつを 入れかえるので、今 つながって いない 方も ここで 捨てる
    this.slashTex.dispose();
    this.slashTexReduced.dispose();
    this.sparkTex.dispose();
  }

  /** 読みこみ中に 材質（描画の プログラム）と 絵を 先に 作る。最初の 斬撃で 作りなおさない */
  warmUp(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): void {
    const all = [this.slashMesh, this.sparkMesh];
    const was = all.map((o) => o.visible);
    for (const o of all) o.visible = true;
    this.sparkMesh.geometry.setDrawRange(0, 6);
    renderer.compile(scene, camera);
    for (const t of [this.slashTex, this.slashTexReduced, this.sparkTex]) renderer.initTexture(t);
    all.forEach((o, i) => (o.visible = was[i]!));
    this.sparkMesh.geometry.setDrawRange(0, 0);
  }

  /** 1 ステップ ごと */
  step(reduced: boolean): void {
    this.reducedNow = reduced;
    this.slashStep();
    this.hitStep();
  }

  /**
   * 斬撃を 注文する（techStart で 呼ぶ）。spawnDelay ステップ まって から 出る（決めが 当たりの 1 ステップ目に 重なる）。
   * 前の 注文が まだ 出て いなければ すてる（わざが つぎに 変わった）。出ている 板は 新しい 板が 出る まで のこす。
   */
  queueSlash(req: SlashRequest): void {
    this.pending = { req, wait: spawnDelayOf(req.tech, req.step) };
  }

  /** わざが やめに なった（まだ 出ていない 斬撃を すてる） */
  cancelSlash(): void {
    this.pending = null;
  }

  /** 絵(よこ・ねかせ・左右)は 出た ステップに 1 回だけ きめる（§5.7.1）。ばらつきは シード付き乱数 */
  private fireSlash(req: SlashRequest): void {
    const pos = req.pos();
    const r = (req.uDeg * Math.PI) / 180;
    const rk = (req.reach ?? SLASH_BASE_REACH) / SLASH_BASE_REACH;
    const at = { x: pos.x + Math.sin(r) * SLASH_BASE_REACH, y: pos.y + 1.4, z: pos.z - Math.cos(r) * SLASH_BASE_REACH };
    const base = { x: pos.x, y: pos.y + 1.4, z: pos.z };
    const cam = this.camera.position;
    const camTo = { x: at.x - cam.x, z: at.z - cam.z };
    this.slashAngle = slashAngleDeg(req.uDeg, camTo);
    this.slashView = slashViewFor(this.slashAngle, this.lastView);
    this.lastView = this.slashView;
    this.slashMirror = slashSwingSign(req.uDeg, camTo) < 0;
    const v = rollVariation(this.rng);
    this.slashTech = req.tech;
    this.slashStepNo = req.step;
    this.slashSteps = frameSteps(req.tech, v.lifeFrame, v.lifeDelta);
    this.slashRow = rowOf(req.tech, this.slashView);
    this.slashRoll = (v.angleDeg * Math.PI) / 180;
    this.slashAge = 0;
    // 弧の 見た目の まん中（コマごとに 絵の 中の 位置が ちがう）を 刀の さき（体の 前・胸の 高さ）に 合わせる。とどきが ちがう 武器は のばす
    const reach = slashReach(this.slashAngle);
    this.slashScale = reach.scale * v.scale * rk;
    this.slashMesh.scale.setScalar(this.slashScale);
    const k = (reach.dist / SLASH_BASE_REACH) * rk;
    this.slashTip.set(base.x + (at.x - base.x) * k, base.y - 0.1, base.z + (at.z - base.z) * k);
    this.slashMesh.position.copy(this.slashTip);
  }

  private slashStep(): void {
    if (this.pending) {
      if (this.pending.wait <= 0) {
        const r = this.pending.req;
        this.pending = null;
        this.fireSlash(r);
      } else this.pending.wait--;
    }
    if (this.slashAge < 0) {
      this.slashMesh.visible = false;
      return;
    }
    const f = frameAt(this.slashSteps, this.slashAge);
    if (f < 0) {
      this.slashAge = -1;
      this.slashMesh.visible = false;
      return;
    }
    this.slashFrame = f;
    this.slashMesh.visible = true;
    this.qz.setFromAxisAngle(this.zAxis, this.slashRoll);
    this.slashMesh.quaternion.copy(this.camera.quaternion).multiply(this.qz);
    {
      // 弧の まん中が いつも 刀の さきに 来るよう 板を ずらす（右・上 = カメラの 向き。板の かたむきの ぶんも まわす）
      const u = (SLASH3.plateBlocks / SLASH3.frameSize[0]!) * this.slashScale;
      const [cx, cy] = centroidOf(this.slashTech, this.slashView, f, this.slashMirror);
      const dx = -(cx - 32) * u;
      const dy = (cy - 22) * u;
      const c = Math.cos(this.slashRoll);
      const sn = Math.sin(this.slashRoll);
      this.tmp.set(1, 0, 0).applyQuaternion(this.camera.quaternion).multiplyScalar(dx * c - dy * sn);
      this.slashMesh.position.copy(this.slashTip).add(this.tmp);
      this.tmp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).multiplyScalar(dx * sn + dy * c);
      this.slashMesh.position.add(this.tmp);
    }
    // 板を キャラ・妖怪より 奥へ: カメラから の 線の 上で SLASH_BACK マス 遠ざけ、同じ 割合で 大きく する（見た目の 位置・大きさは そのまま）
    {
      const cp = this.camera.position;
      const m = this.slashMesh.position;
      const d = Math.max(1, Math.hypot(m.x - cp.x, m.y - cp.y, m.z - cp.z));
      const k = (d + SLASH_BACK) / d;
      m.set(cp.x + (m.x - cp.x) * k, cp.y + (m.y - cp.y) * k, cp.z + (m.z - cp.z) * k);
      this.slashMesh.scale.setScalar(this.slashScale * k);
    }
    // うごきを へらす: 残像の ない 絵
    const tx = this.reducedNow ? this.slashTexReduced : this.slashTex;
    (this.slashMesh.material as THREE.MeshBasicMaterial).map = tx;
    const uv = uvOf(f, this.slashRow, this.slashMirror);
    tx.repeat.set(uv.repeatX, 1 / SLASH_FRAMES);
    tx.offset.set(uv.offsetX, uv.offsetY);
    this.slashAge++;
  }

  /** 妖怪に 当たった（1 体ごとに 1 回。当たりの 1 ステップ目）: 火花と まん中の 光 */
  hit(at: Vec3, tech: BladeTech, uDeg: number): void {
    const cam = this.camera.position;
    const mirror = slashSwingSign(uDeg, { x: at.x - cam.x, z: at.z - cam.z }) < 0;
    if (this.hits.length >= MAX_HITS) this.hits.shift();
    this.hits.push({ burst: createHit(this.rng, tech, mirror, this.reducedNow), at: { x: at.x, y: at.y, z: at.z } });
  }

  private hitStep(): void {
    const geo = this.sparkMesh.geometry;
    if (this.hits.length === 0) {
      if (this.sparkMesh.visible) {
        this.sparkMesh.visible = false;
        geo.setDrawRange(0, 0);
      }
      this.sparkQuads = 0;
      return;
    }
    const cam = this.camera;
    const right = this.tmp.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const rx = right.x, ry = right.y, rz = right.z;
    const up = this.tmp2.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const ux = up.x, uy = up.y, uz = up.z;
    this.qn = 0;
    const qv = this.qv;
    qv[0] = rx; qv[1] = ry; qv[2] = rz; qv[3] = ux; qv[4] = uy; qv[5] = uz;
    const IW = 64, IH = 96, CELL = 8;
    const SP = SLASH3.spark;
    for (const h of this.hits) {
      // 絵が 妖怪の 体に うまらない よう、カメラの ほうへ 少し 出す
      this.tmp.set(cam.position.x - h.at.x, cam.position.y - h.at.y, cam.position.z - h.at.z).normalize().multiplyScalar(SPARK_TOWARD);
      const ax = h.at.x + this.tmp.x, ay = h.at.y + this.tmp.y, az = h.at.z + this.tmp.z;
      const ff = flashFrameAt(h.burst.age, h.burst.reduced);
      if (ff >= 0) {
        const fy = SP.flashCells.y;
        const fs = SP.flashCells.size;
        this.pushQuad(ax, ay, az, (SP.flashBlocks * FLASH_SIZE_K) / 2, (ff * fs) / IW, 1 - (fy + fs) / IH, ((ff + 1) * fs) / IW, 1 - fy / IH);
      }
      for (const s of h.burst.sparks) {
        if (s.age >= s.life) continue;
        const r = s.color * 2 + (s.short ? 1 : 0);
        const sx = s.x * SPARK_TRAVEL, sy = s.y * SPARK_TRAVEL;
        this.pushQuad(ax + rx * sx + ux * sy, ay + ry * sx + uy * sy, az + rz * sx + uz * sy, (SP.streakBlocks * SPARK_SIZE_K) / 2, (s.cell * CELL) / IW, 1 - ((r + 1) * CELL) / IH, ((s.cell + 1) * CELL) / IW, 1 - (r * CELL) / IH);
      }
      stepHit(h.burst);
    }
    let keep = 0;
    for (let i = 0; i < this.hits.length; i++) {
      const h = this.hits[i]!;
      if (hitAlive(h.burst)) this.hits[keep++] = h;
    }
    this.hits.length = keep;
    const n = this.qn;
    this.sparkMesh.visible = n > 0;
    geo.setDrawRange(0, n * 6);
    this.sparkPos.needsUpdate = true;
    this.sparkUv.needsUpdate = true;
    this.sparkQuads = n;
  }

  private pushQuad(cx: number, cy: number, cz: number, half: number, u0: number, v0: number, u1: number, v1: number): void {
    if (this.qn >= MAX_QUADS) return;
    const qv = this.qv;
    const rx = qv[0]!, ry = qv[1]!, rz = qv[2]!, ux = qv[3]!, uy = qv[4]!, uz = qv[5]!;
    const pa = this.sparkPos.array as Float32Array;
    const ua = this.sparkUv.array as Float32Array;
    const o = this.qn * 12;
    for (let k = 0; k < 4; k++) {
      pa[o + k * 3] = cx + (rx * QX[k]! + ux * QY[k]!) * half;
      pa[o + k * 3 + 1] = cy + (ry * QX[k]! + uy * QY[k]!) * half;
      pa[o + k * 3 + 2] = cz + (rz * QX[k]! + uz * QY[k]!) * half;
    }
    const w = this.qn * 8;
    ua[w] = u0; ua[w + 1] = v1; ua[w + 2] = u1; ua[w + 3] = v1;
    ua[w + 4] = u0; ua[w + 5] = v0; ua[w + 6] = u1; ua[w + 7] = v0;
    this.qn++;
  }

  /** 出ている 斬撃の 絵（窓口用） */
  slashes(): SlashInfo[] {
    return this.slashAge >= 0
      ? [{
          view: this.slashView,
          angle: this.slashAngle,
          age: this.slashAge,
          pos: { x: this.slashMesh.position.x, y: this.slashMesh.position.y, z: this.slashMesh.position.z },
          tech: this.slashTech,
          step: this.slashStepNo,
          frame: this.slashFrame,
          row: this.slashRow,
          mirror: this.slashMirror,
        }]
      : [];
  }

  info() {
    // 斬撃の 板 = 1 描画・当たりの 火花 = 1 描画（見えている 時だけ）
    return {
      slash: this.slashAge >= 0,
      slashDraws: this.slashMesh.visible ? 1 : 0,
      sparkDraws: this.sparkMesh.visible ? 1 : 0,
      sparkQuads: this.sparkQuads,
      pending: this.pending ? this.pending.wait : -1,
    };
  }
}
