/**
 * #308 gashaBig.ts を 分けた もの: すりガラスの 雲（ガラスの ブロックの 絵・もくもく雲 puff）と、肩・うで・背中・髪・らせん・こしの 雲の 並べ方。
 */
import { Color, DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, Matrix4, Quaternion, Vector3 } from 'three';
import { Builder, HAIR, C, vec, FACES, tmpP, makeRnd } from './gashaBigBuilder';
import { JointName, GlassCell } from './gashaBigTypes';
import { TUNE as T } from './gashaBigTuning';
import type { BuildCtx } from './gashaBigBuildCtx';
import type { ArmEnd } from './gashaBigBuildArms';

// ---------------------------------------------------------------- すりガラスの 雲（はしごの 段 と もくもく雲）
/** 1 ブロック あたりの もとの 座標の 長さ（= 1 / 拡大）。雲の はしごの 段の 高さ・間かく・あつさは ブロックの 絶対の 値で 決める ので、buildBig の はじめに 入れる */
let KW = 1;
const lerpA = (r: readonly [number, number], f: number): number => r[0] + (r[1] - r[0]) * f;

/** ガラスの ブロックの 絵（16 × 16。ふちは 明るい 青白、中は 白っぽい 半透明、左上に ななめの つや） */
let glassTex: DataTexture | null = null;
export function glassTexture(): DataTexture {
  if (glassTex) return glassTex;
  const N = 16, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
    const edge2 = x === 1 || y === 1 || x === N - 2 || y === N - 2;
    const shine = (x + y === 5 || x + y === 6 || x + y === 9) && x > 2 && y > 2 && x < 10 && y < 10;
    let r = 232, g = 244, bl = 252, a = 70;
    if (edge) { r = 250; g = 253; bl = 255; a = 235; }
    else if (edge2) { r = 214; g = 236; bl = 250; a = 120; }
    else if (shine) { r = 255; g = 255; bl = 255; a = 170; }
    const i = (y * N + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = bl; d[i + 3] = a;
  }
  const t = new DataTexture(d, N, N, RGBAFormat);
  t.magFilter = NearestFilter; t.minFilter = NearestFilter; t.colorSpace = SRGBColorSpace; t.generateMipmaps = false; t.needsUpdate = true;
  return (glassTex = t);
}

/** ガラスの ブロック 1 つ（1 ブロック 角。マイクラの ガラスの ように 明るい ふち ＋ 中は 白っぽい 半透明）。M = 中心・向き・大きさ。ためた 頂点の はじめと 数を 返す */
function pushCube(b: Builder, joint: JointName, M: Matrix4, tint: number): { start: number; count: number } {
  const bk = b.bucket(joint, 'gblock');
  const start = bk.pos.length / 3;
  const UV: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const c = new Color(0xffffff).multiplyScalar(tint);
  for (const f of FACES) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      tmpP.set(f.v[i]![0], f.v[i]![1], f.v[i]![2]).applyMatrix4(M);
      bk.pos.push(tmpP.x, tmpP.y, tmpP.z);
      bk.col.push(c.r, c.g, c.b, 1);
      bk.uv.push(UV[i]![0], UV[i]![1]);
    }
  }
  return { start, count: 36 };
}

/** もくもく雲を 1 つ（木くらいの 大きさ）。1 ブロックの すりガラスの ブロックを 平らに 並べた 板（上の 面が 乗れる 当たり。マスごとに 割れる）＋ 下に ぶらさがる ブロック。 */
function puff(b: Builder, o: { joint: JointName; cx: number; top: number; cz: number; w: number; yaw: number; lobes: number; name: string; rnd: () => number }): void {
  const rnd = o.rnd, cell = KW, thick = T.bank.thick * KW;
  const nx = Math.max(2, Math.round(o.w)), nz = Math.max(2, Math.round(o.w * (0.82 + 0.2 * rnd())));
  const u = vec(Math.cos(o.yaw), 0, Math.sin(o.yaw));
  const side = new Vector3().crossVectors(vec(0, 1, 0), u);
  const on = new Uint8Array(nx * nz);
  let count = 0;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const e = (ix + 0.5 - nx / 2) / (nx / 2), f = (iz + 0.5 - nz / 2) / (nz / 2);
    if (Math.pow(Math.abs(e), 2.6) + Math.pow(Math.abs(f), 2.6) <= 1.15) { on[iz * nx + ix] = 1; count++; }
  }
  if (!count) { on[Math.floor(nz / 2) * nx + Math.floor(nx / 2)] = 1; }
  const hitIdx = b.hits.length;
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(u, vec(0, 1, 0), side));
  const cellCentre = (ix: number, iz: number, below: number): Vector3 =>
    vec(o.cx, o.top - thick / 2 - below * thick, o.cz).addScaledVector(u, (ix + 0.5 - nx / 2) * cell).addScaledVector(side, (iz + 0.5 - nz / 2) * cell);
  const cells: Map<number, GlassCell> = new Map();
  const addCube = (ix: number, iz: number, below: number): void => {
    const k = iz * nx + ix;
    let gc = cells.get(k);
    if (!gc) { gc = { hit: hitIdx, cell: k, joint: o.joint, ranges: [], local: cellCentre(ix, iz, 0) }; cells.set(k, gc); }
    const M = new Matrix4().compose(cellCentre(ix, iz, below), q, vec(cell, thick, cell));
    gc.ranges.push(pushCube(b, o.joint, M, 0.9 + 0.1 * rnd()));
  };
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) if (on[iz * nx + ix]) addCube(ix, iz, 0);
  // 下に ぶらさがる ブロック（もくもく）: 板の ふちに 近い マスの 下に 1〜2 こ
  const lobeCells = [...cells.keys()];
  for (let k = 0; k < o.lobes && lobeCells.length; k++) {
    const pick = lobeCells[Math.floor(rnd() * lobeCells.length)]!;
    addCube(pick % nx, Math.floor(pick / nx), 1);
    if (rnd() < 0.35) addCube(pick % nx, Math.floor(pick / nx), 2);
  }
  for (const gc of cells.values()) b.glass.push(gc);
  b.hits.push({ name: o.name, joint: o.joint, c: vec(o.cx, o.top - thick / 2, o.cz), axes: [u.clone(), vec(0, 1, 0), side.clone()], half: [(nx * cell) / 2, thick / 2, (nz * cell) / 2], mask: { nx, nz, on } });
}

const jointForY = (y: number): JointName => (y < 20 ? 'Hips' : y < 50 ? 'Spine02' : 'Head');

/** 雲の 大きさの もとに なる「1 ブロック あたりの もとの 座標の 長さ」を きめる（buildBig が 身長から 出す） */
export function setCloudScale(scale: number): void { KW = 1 / scale; }

/** 肩の 雲（小さな もくもく雲の あつまり。平らな 足場）・うでの 足場の 雲・背中の 雲の 道・髪の 段・肩から 頭への らせん・こしの もくもく雲。上の 面が そのまま 当たり */
export function buildClouds(c: Pick<BuildCtx, 'b' | 'Tt' | 'A' | 'KT'>, armEnds: readonly ArmEnd[]): void {
  const { b, Tt, A, KT } = c;
  {
    const S = T.shoulder, rs = makeRnd(S.seed);
    for (const s of [-1, 1]) {
      const sd = s < 0 ? 'R' : 'L';
      let n = 0;
      for (const x of S.xs) for (const z of S.zs) {
        puff(b, { joint: 'Spine02', cx: s * x, top: S.y + (rs() - 0.5) * S.jitter, cz: z, w: lerpA(S.size, rs()), yaw: rs() * Math.PI, lobes: 4, name: `shoulder${sd}${n++}`, rnd: rs });
      }
    }
    // うでの 足場の 雲: 上わんの かたがわの はしに 小さな 雲を 1 つ。うでを のぼりきった ところ（かたの ぬの・肩の 雲の すぐ 下）で、
    // うでの 上の 面と 肩の 雲の 高さの 差（ブロックの そろい かたで 1〜2 ブロック かわる）を うめる。うでの 関節に つく（うでと いっしょに うごく）
    {
      const Q = T.armStep, rq = makeRnd(Q.seed);
      for (const e of armEnds) {
        const dir = e.E.clone().sub(e.S).normalize(), p = e.S.clone().addScaledVector(dir, Q.back * KW);
        const w = lerpA(Q.size, rq());
        // 雲の 上の 面 = 腕の 上の 面（雲の ひじ がわの ふち）より Q.rise だけ 高い。腕は 斜めで、雲は 腕の 上に のる ので、ふちで くらべる（下がり 角が ふえても 段が 1 つ より 高く ならない）
        const q = e.S.clone().addScaledVector(dir, (Q.back + 0.6 * w) * KW);
        const armTop = q.y + (A.upperThick - 0.4) / 2 / Math.max(0.3, Math.hypot(dir.x, dir.z));
        puff(b, { joint: e.joint, cx: p.x + e.s * Q.out * KW, top: armTop + Q.rise * KW, cz: p.z, w, yaw: rq() * Math.PI, lobes: 4, name: `armStep${e.s < 0 ? 'R' : 'L'}`, rnd: rq });
      }
    }
    // 背中の 穴の 上へ つづく 雲の 道: 左の 肩の いちばん 後ろの 雲（肩の 高さ）から 肩の 高さの まま 穴の 外の 床の だんの うしろまで。
    // さいごの 雲の ふちから 床の だん（約 5 ブロック 下）へ 飛び降りる。床の だんからは 上へ 戻れない（一方通行）
    {
      const Z = T.core, rs2 = makeRnd(Z.steps.seed), n = Math.max(1, Math.round(Z.steps.count));
      const L = Tt(KT.x, KT.floorY, KT.backZ);
      const x0 = S.xs[0]!, z0 = S.zs[0]!, y0 = S.y;
      const wJ = lerpA(Z.steps.size, rs2());
      const xJ = L.x, zJ = L.z - (wJ / 2 + Z.steps.behind) * KW;
      for (let k = 1; k <= n; k++) {
        const u = k / (n + 1);
        puff(b, { joint: 'Spine02', cx: x0 + (xJ - x0) * u, top: y0, cz: z0 + (zJ - z0) * u, w: lerpA(Z.steps.size, rs2()), yaw: rs2() * Math.PI, lobes: 4, name: `backStep${k - 1}`, rnd: rs2 });
      }
      puff(b, { joint: 'Spine02', cx: xJ, top: y0, cz: zJ, w: wJ, yaw: 0, lobes: 2, name: 'backJump', rnd: rs2 });
    }
    // 髪の 毛束: 黒い 箱。上の 面が 当たり。ときどき 髪どめ（ピンク）
    const H = T.hair;
    const lock = (name: string, x: number, top: number, z: number, k: number): void => {
      const w = H.size * KW, th = H.thick * KW, joint = jointForY(top), r = b.root(joint);
      r.box(w, th, w, x, top - th / 2, z, HAIR);
      r.box(w * 0.78, th * 1.4, w * 0.78, x, top - th - th * 0.7, z, HAIR);
      if (k % 3 === 2) r.box(w * 1.06, th * 0.3, w * 1.06, x, top - th * 0.55, z, C.stripe);
      b.hits.push({ name, joint, c: vec(x, top - th / 2, z), axes: [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)], half: [w / 2, th / 2, w / 2] });
    };
    for (const s of [-1, 1]) {
      const sd = s < 0 ? 'R' : 'L', Tl = H.tail;
      for (let k = 0; k < Tl.steps; k++) {
        const a = ((Tl.angle0Deg + k * Tl.stepDeg) * Math.PI) / 180;
        lock(`tail${sd}${k}`, s * (Tl.x + Tl.radius * Math.cos(a)), Tl.y0 + k * Tl.rise, Tl.z + Tl.radius * Math.sin(a), k);
      }
      H.side.forEach((q, k) => lock(`side${sd}${k}`, s * q[0]!, q[2]!, q[1]!, k));
    }
    // 肩から 頭の 上への 雲の らせん（からだが 動いても 通れる。上がりは 1 つ 0.62 ブロック。さいごの 数個は 頭の てっぺんの わくへ 近づく）
    {
      const U = T.rise, rr = makeRnd(U.seed);
      const sm = (t: number): number => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
      for (const s of [-1, 1]) {
        const sd = s < 0 ? 'R' : 'L';
        for (let k = 0; k < U.count; k++) {
          const a = ((U.angle0Deg + k * U.stepDeg) * Math.PI) / 180, y = U.y0 + k * U.step;
          const rad = U.radius + (U.endRadius - U.radius) * sm((k - U.taperFrom) / Math.max(1, U.count - 1 - U.taperFrom));
          puff(b, {
            joint: y < U.splitY ? 'Spine02' : 'Head', cx: s * (U.cx + rad * Math.cos(a)) * KW, top: y * KW, cz: (U.cz + rad * Math.sin(a)) * KW,
            w: lerpA(U.size, rr()), yaw: rr() * Math.PI, lobes: 4, name: `rise${sd}${k}`, rnd: rr,
          });
        }
      }
    }
    // 腰の まわり: ガラスの 雲の 輪（中心から 外へ 数本の 輪。外の 輪ほど ひくく、地面ちかくまで ぐるっと かこむ）
    const K = T.bank, rb = makeRnd(K.seed);
    let bi = 0;
    for (const [rr0, n] of K.rings) {
      const a0 = rb() * Math.PI * 2;
      for (let q = 0; q < n; q++) {
        const ang = a0 + ((q + (rb() - 0.5) * 0.5) / n) * Math.PI * 2, rad = Math.min(1, Math.max(0.05, rr0 + (rb() - 0.5) * 0.08));
        let top = Math.max(1.6 * KW, K.height * (1 - Math.pow(rad, 1.6)) + (rb() - 0.5) * K.jitter);
        if (rad < K.innerRad) top = Math.min(top, K.innerTop);
        puff(b, { joint: 'Hips', cx: Math.cos(ang) * rad * K.radiusX, top, cz: K.z + Math.sin(ang) * rad * K.radiusZ, w: lerpA(K.size, rb()), yaw: rb() * Math.PI, lobes: K.lobes, name: `bank${bi++}`, rnd: rb });
      }
    }
  }
}
