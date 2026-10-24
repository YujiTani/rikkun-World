/**
 * #293 試作（開発サーバーだけ）: 間欠泉の 見た目と つなぎ（しくみは gashaGeyserField.ts）。
 * ・柱（地面の cells × cells マスに ぴったり。見た目は widen 倍に 太い）、根元の 湯気、地面の われ目。
 *   かわる 途中は ひびが 4 だんで ふえ、湯気が つよく なる（まだ 打ち上げない）。
 * ・どれも InstancedMesh で、描画は 3 回（柱・湯気・われ目）。
 * ・場所は ワールドの `geyser_dirt` ブロックで きまる。数・大きさ・速さは gashaBigTuning.ts の geyser。
 */
import {
  AdditiveBlending, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedMesh,
  Matrix4, MeshBasicMaterial, Quaternion, RepeatWrapping, Vector3, type Scene,
} from 'three';
import { TUNE as T } from './gashaBigTuning';
import { GeyserField, MAX_CELLS, crackStage, type FieldDeps, type GeyserInfo, type GeyserPlaceArgs } from './gashaGeyserField';

export { apexOf, crackStage, funnelRadius, inColumn, liftStep, planShoulders, worldOf, type GeyserInfo, type GeyserPlaceArgs, type GeyserSpec } from './gashaGeyserField';

export interface GeyserDeps extends FieldDeps {
  scene: Scene;
  /** 毎ステップ 呼ぶ（dt 秒）。固定ステップ */
  onUpdate(fn: (dt: number) => void): void;
}

// ---------------------------------------------------------------- 見た目
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
  fill.addColorStop(0, 'rgba(205,236,255,0.8)'); fill.addColorStop(1, 'rgba(205,236,255,0.5)');
  g.fillStyle = fill; g.fillRect(0, 0, W, H);
  // よこの ふちを うすく
  g.globalCompositeOperation = 'destination-in';
  const edge = g.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0.4)'); edge.addColorStop(0.15, 'rgba(0,0,0,1)'); edge.addColorStop(0.85, 'rgba(0,0,0,1)'); edge.addColorStop(1, 'rgba(0,0,0,0.4)');
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

const MAX_PEND_CELLS = 32;

export class GashaGeyser {
  readonly field: GeyserField;
  private readonly columns: InstancedMesh;
  private readonly steam: InstancedMesh;
  private readonly cracks: InstancedMesh;
  private readonly colTex: CanvasTexture;
  private readonly mat = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly sc = new Vector3();

  constructor(d: GeyserDeps) {
    this.field = new GeyserField(d);
    const R = T.geyser;
    this.colTex = streakTexture();
    const cm = new MeshBasicMaterial({ map: this.colTex, color: new Color(R.color), transparent: true, opacity: R.opacity, depthWrite: false, side: DoubleSide, fog: false });
    this.columns = new InstancedMesh(crossGeometry(), cm, MAX_CELLS * 2);
    this.columns.name = 'geyserColumns';
    const sm = new MeshBasicMaterial({ map: puffTexture(), color: new Color(0xe8f6ff), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
    const nSteam = MAX_CELLS * 4 + MAX_PEND_CELLS * 2;
    this.steam = new InstancedMesh(crossGeometry(-0.5, 0.5), sm, nSteam);
    this.steam.name = 'geyserSteam';
    this.steam.instanceColor = new InstancedBufferAttribute(new Float32Array(nSteam * 3).fill(1), 3);
    const km = new MeshBasicMaterial({ color: 0x2c2420, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.cracks = new InstancedMesh(crackGeometry(), km, MAX_CELLS + MAX_PEND_CELLS);
    this.cracks.name = 'geyserCracks';
    for (const m of [this.columns, this.steam, this.cracks]) { m.frustumCulled = false; m.renderOrder = 4; m.count = 0; d.scene.add(m); }
    this.cracks.renderOrder = 1;
    d.onUpdate((dt) => { this.field.step(dt); this.layout(); });
  }

  /** 置く（肩の 下の 2 本を かえはじめる）。ワールドの 間欠泉の つちは そのまま */
  place(a: GeyserPlaceArgs): void {
    this.field.place(a);
  }

  /** x, z の マスから 間欠泉に かえはじめる（テスト用。sec = ひびの 秒。0 で すぐ） */
  spawn(x: number, z: number, sec?: number): boolean {
    return this.field.spawnAt(x, z, sec);
  }

  geysers(): GeyserInfo[] {
    return this.field.info();
  }

  clear(): void {
    this.field.reset();
  }

  /** 見た目を いまの 時間に あわせる */
  private layout(): void {
    const R = T.geyser, S = R.spawn, m = this.mat, q = this.q, t = this.field.t;
    let ci = 0, si = 0, ki = 0;
    for (const g of this.field.specs()) {
      const cx = g.x0 + g.w / 2, cz = g.z0 + g.d / 2, age = t - g.born;
      const grow = Math.min(1, Math.max(0, age / R.riseSec));
      const ease = 1 - (1 - grow) * (1 - grow);
      // われ目: 水が わく 前から ひろがる
      const open = age > -0.4 ? 1 : 0.5;
      m.compose(this.v.set(cx, g.ground + 0.03, cz), q.identity(), this.sc.set(g.w * 0.95 * open, 1, g.d * 0.95 * open));
      this.cracks.setMatrixAt(ki++, m);
      // 柱: 地面の マスに ぴったり（当たり）。見た目は widen 倍に 太く、芯を もう 1 まい かさねて 濃く
      const h = Math.max(0.001, (g.top - g.ground) * ease);
      m.compose(this.v.set(cx, g.ground, cz), q.identity(), this.sc.set(g.w * R.widen, h, g.d * R.widen));
      this.columns.setMatrixAt(ci++, m);
      m.compose(this.v.set(cx, g.ground, cz), q.identity(), this.sc.set(g.w * 0.6, h, g.d * 0.6));
      this.columns.setMatrixAt(ci++, m);
      // 根元の 湯気
      const size = (g.w + g.d) / 2;
      for (let k = 0; k < R.steamCount; k++, si++) {
        const ph = (t * 0.55 + k / R.steamCount + g.x0 * 0.173) % 1;
        const burst = age > 0 ? Math.exp(-age * 1.8) : 0;
        const on = age > -0.4 ? 1 : 0;
        const sz = size * (0.9 + 1.1 * ph + 0.9 * burst) * on;
        const ang = (k / R.steamCount) * Math.PI * 2 + g.z0;
        m.compose(this.v.set(cx + Math.cos(ang) * size * 0.35 * ph, g.ground + 0.5 + ph * 2.6 + burst * 1.5, cz + Math.sin(ang) * size * 0.35 * ph), q.identity(), this.sc.set(sz, sz, sz));
        this.steam.setMatrixAt(si, m);
        const f = (1 - ph) * (grow > 0 || age > -0.4 ? 0.9 : 0);
        this.steam.instanceColor!.setXYZ(si, f, f, f);
      }
    }
    // かわる 途中: ひびが だんだん ふえ、湯気が つよく なる
    let pc = 0;
    for (const p of this.field.pending()) {
      const prog = Math.min(1, p.t / Math.max(1e-6, p.dur));
      const stage = crackStage(prog, S.crackStages);
      const k = 0.3 + 0.75 * (stage / S.crackStages);
      let gy = 0;
      for (const c of p.cells) {
        gy = c.y + 1;
        if (ki >= this.cracks.instanceMatrix.count) break;
        m.compose(this.v.set(c.x + 0.5, c.y + 1.03, c.z + 0.5), q.identity(), this.sc.set(k, 1, k));
        this.cracks.setMatrixAt(ki++, m);
        pc++;
      }
      const cx = p.x0 + p.w / 2, cz = p.z0 + p.d / 2;
      for (let n = 0; n < 2 && si < this.steam.instanceMatrix.count; n++, si++) {
        const ph = (t * 0.4 + n * 0.5) % 1;
        const sz = (p.w + p.d) / 2 * (0.5 + 1.1 * prog) * (0.6 + 0.8 * ph);
        m.compose(this.v.set(cx, gy + 0.3 + ph * 1.5 * prog, cz), q.identity(), this.sc.set(sz, sz, sz));
        this.steam.setMatrixAt(si, m);
        const f = (1 - ph) * 0.65 * prog * prog;
        this.steam.instanceColor!.setXYZ(si, f, f, f);
      }
    }
    void pc;
    this.columns.count = ci; this.steam.count = si; this.cracks.count = ki;
    this.columns.instanceMatrix.needsUpdate = true;
    this.steam.instanceMatrix.needsUpdate = true;
    this.steam.instanceColor!.needsUpdate = true;
    this.cracks.instanceMatrix.needsUpdate = true;
    this.colTex.offset.y = -((t * R.flowSpeed) % 1);
  }
}
