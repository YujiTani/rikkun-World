/**
 * #293 試作（開発サーバーだけ）: 大きい がしゃどくろを 置いた とき、まわりの 地面から 間欠泉が わき出す。
 * ・柱（地面の cells × cells マスに ぴったり）に 入ると 真上へ 打ち上がる。肩の 雲の 上 + 2 ブロックまで とどく（調整表 geyser）。
 *   空中では ふつうに 横へ 動けるので 肩の 雲へ のりうつれる。柱の 上は ろうと形に ひろがって、ななめに 落ちてきても 柱へ すいこまれる。
 * ・柱に 入った しゅんかんに 落ちる 速さを ゆるめ、柱から 出て 地面に 着くまで 落下ダメージを 受けない（`setNoFall`。combat の noFall の 口）。
 * ・見た目: 半透明（白〜水色）の 水の 柱（たて板と よこ板を かさねた 十字）、根元の 湯気、地面の われ目。
 *   どれも InstancedMesh で、描画は 3 回。
 * ・場所は 置いた とき きめる（がしゃどくろが 動いても そのまま）。数・大きさ・速さは gashaBigTuning.ts の geyser。
 * 純粋な 計算（planGeysers / inColumn / liftStep）は 切りはなして あり、gashaGeyser.test.ts で 確かめる。
 */
import {
  AdditiveBlending, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedMesh,
  Matrix4, MeshBasicMaterial, Quaternion, RepeatWrapping, Vector3, type Scene,
} from 'three';
import { TUNE as T } from './gashaBigTuning';

export interface GeyserSpec {
  /** 柱の 北西の かどの マス（x0, z0）。柱は x0 〜 x0 + cells、z0 〜 z0 + cells */
  x0: number;
  z0: number;
  cells: number;
  /** 柱の 根元（立つ 地面の 高さ） */
  ground: number;
  /** 柱の 上の はし（世界の 高さ） */
  top: number;
  /** 置いてから わき出すまで（秒） */
  delay: number;
}

export interface GeyserPlaceArgs {
  /** からだの 中心（地面の 高さ）と 向き（ラジアン。three の rotation.y）・もとの 座標 → ブロックの 拡大 */
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

type Tune = typeof T.geyser;

function makeRnd(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** からだの 向きで 回した 世界の 場所（local = ブロック。x = 左、z = 前） */
export function worldOf(a: GeyserPlaceArgs, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
  return { x: a.x + lx * c + lz * s, z: a.z - lx * s + lz * c };
}

/** 間欠泉の 場所を きめる（同じ 引数なら 同じ 結果）。肩の 下の 左右 2 本 ＋ 背中がわ。高さは 立つ 面に そろえず、柱の 上は ぜんぶ 身長の 基準（y + height） */
export function planGeysers(a: GeyserPlaceArgs, groundY: (x: number, z: number) => number, tune: Tune = T.geyser): GeyserSpec[] {
  const rnd = makeRnd(tune.seed);
  const spots: { x: number; z: number }[] = [];
  for (const s of [1, -1]) spots.push(worldOf(a, s * tune.shoulderX * a.scale, tune.shoulderZ * a.scale));
  const n = Math.max(0, tune.count - 2);
  const spread = (n - 1) * tune.spacingDeg;
  for (let i = 0; i < n; i++) {
    // 背中がわ（180 度）を まんなかに ならべる。まんなかが いちばん 近い（頭の 上から とびおりて とどく）
    const off = n > 1 ? -spread / 2 + (i * spread) / (n - 1) : 0;
    const th = ((180 + off + (rnd() - 0.5) * 8) * Math.PI) / 180;
    const k = spread > 0 ? Math.abs(off) / (spread / 2) : 0;
    const r = tune.ringMin + (tune.ringMax - tune.ringMin) * 0.7 * k * (0.85 + 0.15 * rnd());
    spots.push(worldOf(a, r * Math.sin(th), r * Math.cos(th)));
  }
  const out: GeyserSpec[] = [];
  const c = tune.cells;
  for (const p of spots) {
    const x0 = Math.round(p.x - c / 2), z0 = Math.round(p.z - c / 2);
    let g = -Infinity;
    for (let i = 0; i < c; i++) for (let j = 0; j < c; j++) g = Math.max(g, groundY(x0 + i, z0 + j) + 1);
    const [d0, d1] = tune.delaySec;
    out.push({ x0, z0, cells: c, ground: g, top: a.y + tune.height, delay: d0 + (d1 - d0) * rnd() });
  }
  return out;
}

/** 柱の 中か（足もとの 場所 x, y, z。柱の 根元の すこし 下から 上の はしまで） */
export function inColumn(g: GeyserSpec, x: number, y: number, z: number): boolean {
  return x >= g.x0 && x < g.x0 + g.cells && z >= g.z0 && z < g.z0 + g.cells && y >= g.ground - 0.6 && y <= g.top;
}

/** 柱の 中での 上向きの 速さ: 落ちて いたら まず slowFall まで ゆるめ、launchAccel で launchSpeed まで 上がる */
export function liftStep(vy: number, dt: number, tune: Tune = T.geyser): number {
  const v = vy < -tune.slowFall ? -tune.slowFall : vy;
  return Math.min(tune.launchSpeed, v + tune.launchAccel * dt);
}

/** 柱の 上の ろうと: 柱の 上に いて、中心から この 水平きょり いない なら すいこむ（なければ null） */
export function funnelRadius(g: GeyserSpec, y: number, tune: Tune = T.geyser): number | null {
  if (y <= g.top || y > g.top + tune.funnelHeight) return null;
  return g.cells / 2 + Math.min(tune.funnelMax, tune.funnelSlope * (y - g.top));
}

/** 柱の 上へ とび出したあとの 高さ（重力 gravity）: 柱の 上 + v² / 2g */
export function apexOf(g: GeyserSpec, gravity = 28, tune: Tune = T.geyser): number {
  return g.top + (tune.launchSpeed * tune.launchSpeed) / (2 * gravity);
}

export interface GeyserInfo extends GeyserSpec {
  /** 中心 */
  x: number;
  z: number;
  state: 'wait' | 'rising' | 'up';
  /** 柱が 伸びた 割合（0〜1） */
  grow: number;
}

export interface GeyserDeps {
  scene: Scene;
  /** 毎ステップ 呼ぶ（dt 秒）。固定ステップ */
  onUpdate(fn: (dt: number) => void): void;
  groundY(x: number, z: number): number;
  /** プレイヤーの いま（足もと の 位置、速さ、地面に のって いるか） */
  body(): { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number }; onGround?: boolean };
  setVelocity(v: { x: number; y: number; z: number }): void;
  /** 水平に すこし 寄せる（ブロック） */
  nudge(dx: number, dz: number): void;
  /** 落下ダメージを 受けない（combat の noFall に 重ねる） */
  setNoFall(on: boolean): void;
}

// ---------------------------------------------------------------- 見た目
const COLUMN_MAX = 16;

function streakTexture(): CanvasTexture {
  const W = 64, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  // たての すじ（水の ながれ）。うえへ いくほど うすく、よこの ふちも うすく
  for (let i = 0; i < 28; i++) {
    const x = rnd() * W, w = 1.5 + rnd() * 4, a = 0.25 + rnd() * 0.5;
    const y0 = rnd() * H * 0.4, y1 = H * (0.55 + rnd() * 0.45);
    const gr = g.createLinearGradient(0, y1, 0, y0);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - w / 2, y0, w, y1 - y0);
    g.fillRect(x - w / 2 + W, y0, w, y1 - y0); g.fillRect(x - w / 2 - W, y0, w, y1 - y0);
  }
  // 全体の うすい 水色（芯）
  const fill = g.createLinearGradient(0, H, 0, 0);
  fill.addColorStop(0, 'rgba(210,240,255,0.55)'); fill.addColorStop(1, 'rgba(210,240,255,0.08)');
  g.fillStyle = fill; g.fillRect(0, 0, W, H);
  // よこの ふちを うすく
  g.globalCompositeOperation = 'destination-in';
  const edge = g.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0.15)'); edge.addColorStop(0.2, 'rgba(0,0,0,1)'); edge.addColorStop(0.8, 'rgba(0,0,0,1)'); edge.addColorStop(1, 'rgba(0,0,0,0.15)');
  g.fillStyle = edge; g.fillRect(0, 0, W, H);
  const tex = new CanvasTexture(cv);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return tex;
}

function puffTexture(): CanvasTexture {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new CanvasTexture(cv);
}

/** 十字（たて板と よこ板）: x 方向の 板 と z 方向の 板。幅 1、高さ 0〜1 */
function crossGeometry(h0 = 0, h1 = 1): BufferGeometry {
  const pos = [
    -0.5, h0, 0, 0.5, h0, 0, 0.5, h1, 0, -0.5, h0, 0, 0.5, h1, 0, -0.5, h1, 0,
    0, h0, -0.5, 0, h0, 0.5, 0, h1, 0.5, 0, h0, -0.5, 0, h1, 0.5, 0, h1, -0.5,
  ];
  const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

/** 地面の われ目: ぎざぎざの 星 */
function crackGeometry(): BufferGeometry {
  const pos: number[] = [], N = 10;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    const r = i % 2 ? 0.62 : 1.0;
    pos.push(0, 0, 0, Math.cos(a0) * 0.45, 0, Math.sin(a0) * 0.45, Math.cos(am) * r, 0, Math.sin(am) * r, 0, 0, 0, Math.cos(am) * r, 0, Math.sin(am) * r, Math.cos(a1) * 0.45, 0, Math.sin(a1) * 0.45);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

export class GashaGeyser {
  private specs: GeyserSpec[] = [];
  private t = 0;
  private assisted = false;
  private assistedT = 0;
  private noFallNow = false;
  private columns: InstancedMesh | null = null;
  private steam: InstancedMesh | null = null;
  private cracks: InstancedMesh | null = null;
  private colTex: CanvasTexture | null = null;
  private readonly mat = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly sc = new Vector3();

  constructor(private readonly d: GeyserDeps) {
    d.onUpdate((dt) => this.update(dt));
  }

  /** 置く（前の 間欠泉は 消す）。からだが その後 動いても 場所は かわらない */
  place(a: GeyserPlaceArgs): GeyserSpec[] {
    this.clear();
    this.specs = planGeysers(a, this.d.groundY);
    this.t = 0;
    this.build();
    return this.specs;
  }

  geysers(): GeyserInfo[] {
    const R = T.geyser;
    return this.specs.map((g) => {
      const age = this.t - g.delay;
      return { ...g, x: g.x0 + g.cells / 2, z: g.z0 + g.cells / 2, state: age < 0 ? 'wait' : age < R.riseSec ? 'rising' : 'up', grow: Math.min(1, Math.max(0, age / R.riseSec)) };
    });
  }

  clear(): void {
    for (const m of [this.columns, this.steam, this.cracks]) {
      if (!m) continue;
      this.d.scene.remove(m);
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).map?.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
    this.columns = this.steam = this.cracks = null;
    this.colTex = null;
    this.specs = [];
    this.assisted = false;
    this.setNoFall(false);
  }

  private setNoFall(on: boolean): void {
    if (on === this.noFallNow) return;
    this.noFallNow = on;
    this.d.setNoFall(on);
  }

  private build(): void {
    const R = T.geyser, n = this.specs.length;
    if (!n) return;
    this.colTex = streakTexture();
    const cm = new MeshBasicMaterial({ map: this.colTex, color: new Color(R.color), transparent: true, opacity: R.opacity, depthWrite: false, side: DoubleSide, fog: false });
    this.columns = new InstancedMesh(crossGeometry(), cm, Math.min(COLUMN_MAX, n));
    this.columns.name = 'geyserColumns';
    const sm = new MeshBasicMaterial({ map: puffTexture(), color: new Color(0xe8f6ff), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
    this.steam = new InstancedMesh(crossGeometry(-0.5, 0.5), sm, Math.min(COLUMN_MAX, n) * R.steamCount);
    this.steam.name = 'geyserSteam';
    this.steam.instanceColor = new InstancedBufferAttribute(new Float32Array(this.steam.count * 3).fill(1), 3);
    const km = new MeshBasicMaterial({ color: 0x2c2420, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.cracks = new InstancedMesh(crackGeometry(), km, Math.min(COLUMN_MAX, n));
    this.cracks.name = 'geyserCracks';
    for (const m of [this.columns, this.steam, this.cracks]) { m.frustumCulled = false; m.renderOrder = 4; this.d.scene.add(m); }
    this.cracks.renderOrder = 1;
    this.layout();
  }

  /** 見た目を いまの 時間に あわせる */
  private layout(): void {
    if (!this.columns || !this.steam || !this.cracks) return;
    const R = T.geyser, m = this.mat, q = this.q;
    let si = 0;
    this.specs.forEach((g, i) => {
      if (i >= COLUMN_MAX) return;
      const cx = g.x0 + g.cells / 2, cz = g.z0 + g.cells / 2, age = this.t - g.delay;
      const wait = Math.min(1, Math.max(0, this.t / Math.max(0.01, g.delay)));
      const grow = Math.min(1, Math.max(0, age / R.riseSec));
      const ease = 1 - (1 - grow) * (1 - grow);
      // われ目: 水が わく 前から ひろがる（ひとマスより すこし 大きく）
      m.compose(this.v.set(cx, g.ground + 0.03, cz), q.identity(), this.sc.set(g.cells * (0.2 + 0.7 * wait) * 0.95, 1, g.cells * (0.2 + 0.7 * wait) * 0.95));
      this.cracks!.setMatrixAt(i, m);
      // 柱: 地面の cells × cells マスに ぴったり。たて板と よこ板が 十字
      const h = Math.max(0.001, (g.top - g.ground) * ease);
      m.compose(this.v.set(cx, g.ground, cz), q.identity(), this.sc.set(g.cells, h, g.cells));
      this.columns!.setMatrixAt(i, m);
      // 根元の 湯気（わき出す 前の しぶきも ふくむ）
      for (let k = 0; k < R.steamCount; k++, si++) {
        const ph = (this.t * 0.55 + k / R.steamCount + i * 0.173) % 1;
        const burst = age > 0 ? Math.exp(-age * 1.8) : 0;
        const on = age > -0.4 ? 1 : 0;
        const sz = g.cells * (0.9 + 1.1 * ph + 0.9 * burst) * on;
        const ang = (k / R.steamCount) * Math.PI * 2 + i;
        m.compose(this.v.set(cx + Math.cos(ang) * g.cells * 0.35 * ph, g.ground + 0.5 + ph * 2.6 + burst * 1.5, cz + Math.sin(ang) * g.cells * 0.35 * ph), q.identity(), this.sc.set(sz, sz, sz));
        this.steam!.setMatrixAt(si, m);
        const f = (1 - ph) * (grow > 0 || age > -0.4 ? 0.9 : 0);
        this.steam!.instanceColor!.setXYZ(si, f, f, f);
      }
    });
    this.columns.instanceMatrix.needsUpdate = true;
    this.steam.instanceMatrix.needsUpdate = true;
    this.steam.instanceColor!.needsUpdate = true;
    this.cracks.instanceMatrix.needsUpdate = true;
    if (this.colTex) this.colTex.offset.y = -((this.t * R.flowSpeed) % 1);
  }

  private update(dt: number): void {
    if (!this.specs.length) return;
    const R = T.geyser;
    this.t += dt;
    this.layout();
    const b = this.d.body(), p = b.position, vel = b.velocity;
    let inside = false;
    let vy = vel.y;
    for (const g of this.specs) {
      if (this.t - g.delay < R.riseSec * 0.5) continue; // まだ わき出して いない
      if (inColumn(g, p.x, p.y, p.z)) {
        inside = true;
        vy = liftStep(vy, dt, R);
        break;
      }
      const fr = funnelRadius(g, p.y, R);
      if (fr !== null) {
        const cx = g.x0 + g.cells / 2, cz = g.z0 + g.cells / 2, dx = cx - p.x, dz = cz - p.z, dist = Math.hypot(dx, dz);
        if (dist < fr && dist > 0.05) {
          // 水平の 速さは 入力で 毎ステップ 上書きされる ので、位置を 直接 すこし 寄せる
          const st = Math.min(dist, R.funnelPull * dt);
          this.d.nudge((dx / dist) * st, (dz / dist) * st);
          this.assisted = true; this.assistedT = 0;
        }
      }
    }
    if (inside) {
      this.assisted = true; this.assistedT = 0;
      this.d.setVelocity({ x: vel.x, y: vy, z: vel.z });
    }
    // 柱から 出たあと 地面に 着く（または 時間ぎれ）まで 落下ダメージなし
    if (this.assisted && !inside) {
      this.assistedT += dt;
      if (b.onGround === true && this.assistedT > 0.1) this.assisted = false;
      else if (this.assistedT > R.assistMaxSec) this.assisted = false;
    }
    this.setNoFall(inside || this.assisted);
  }
}
