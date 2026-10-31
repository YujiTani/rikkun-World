/**
 * 箱で 作る 家具の 面（四角）の ならび。エディターの 見本（house/preview/mesh.ts）と ゲームの 世界の ブロック（render/houseProp.ts）が 同じ 関数を 読む（#304 1 か所）。
 * 家具の 箱（furnitureArt.ts。1/9 ブロック）を 向き rot に まわし、ブロックの 区切り（整数）で 面を 分ける（絵は 1 ブロックごとに くり返す ので、
 * 分けた 面は 絵 1 まいの 一部）。three に 依らない 純粋な 計算。
 */
import { furnitureBoxes, type BoxKind, type FaceSide, type FurnBox } from './furnitureArt';
import { FURN_LEN, furnFootprint, type FurnRot } from './houseBlocks';
import { furnTileName } from './houseTextures';

export interface FurnQuad {
  /** 4 つの 角（ブロック単位。家具ぜんたいの 北西〔−x・−z〕の すみが 原点、x ＝ 東・y ＝ 上・z ＝ 南）。角の 順は FACES〔render/meshChunk.ts〕と 同じ */
  pos: readonly number[];
  /** 角ごとの 絵の 中の 場所（絵 1 まいを 0〜1 と した u, v。v は 上が 大きい）。8 こ */
  uv: readonly number[];
  /** 絵の 名前（世界の 絵の 表の 名前） */
  tile: string;
  /** まわした あとの 面の 向き番号（0 上・1 下・2 +x・3 −x・4 +z・5 −z。明るさの 元） */
  face: number;
  /** 面の 明るさを かけない（あんどんの 紙） */
  glow: boolean;
  /** 箱の 形の 左から 何番目の マスに 入る 面か（0 から） */
  k: number;
}

type Ax = 0 | 1 | 2;
interface BoxFaceDef {
  n: readonly [number, number, number];
  fixed: Ax;
  s: Ax;
  t: Ax;
  index: number;
}
/** 箱の 横の 面（index 2〜5）→ 家具の 向きでの 呼び名（前 ＝ −z、右 ＝ +x）。faces で 面ごとの 絵を かえる とき */
const SIDE_OF: Readonly<Record<number, FaceSide>> = { 2: 'right', 3: 'left', 4: 'back', 5: 'front' };

/** s × t ＝ n（外から 見て 反時計まわり）。houseA の 面の 定義と 同じ */
const BOX_FACES: readonly BoxFaceDef[] = [
  { n: [0, 1, 0], fixed: 1, s: 2, t: 0, index: 0 },
  { n: [0, -1, 0], fixed: 1, s: 0, t: 2, index: 1 },
  { n: [1, 0, 0], fixed: 0, s: 1, t: 2, index: 2 },
  { n: [-1, 0, 0], fixed: 0, s: 2, t: 1, index: 3 },
  { n: [0, 0, 1], fixed: 2, s: 0, t: 1, index: 4 },
  { n: [0, 0, -1], fixed: 2, s: 1, t: 0, index: 5 },
];

/** 区切り（整数）で 分けた 区間の ならび（絵は 1 ブロックごとに くり返す） */
function splits(a: number, b: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let cur = a;
  const eps = 1e-6;
  for (let k = Math.floor(a + eps) + 1; k < b - eps; k++) {
    out.push([cur, k]);
    cur = k;
  }
  out.push([cur, b]);
  return out;
}

const NINTH = 9; // 家具の 箱の 1 ブロック ＝ 9 点
const cache = new Map<string, readonly FurnQuad[]>();
let boxCache: ReturnType<typeof furnitureBoxes> | null = null;

/** 箱で 作る 家具 1 つの 面ぜんぶ（向き rot。0 ＝ 前が 南〔+z〕、みぎに まわすと 時計まわり）。同じ (しゅるい, 向き) は おぼえて 返す */
export function furnitureQuads(kind: BoxKind, rot: FurnRot): readonly FurnQuad[] {
  const key = `${kind}:${rot}`;
  const hit = cache.get(key);
  if (hit) return hit;
  boxCache ??= furnitureBoxes();
  const lw = (FURN_LEN as Record<string, number | undefined>)[kind] ?? 1; // はにわ（見本だけ）は 1 マス
  const ld = 1;
  const [fw, fd] = furnFootprint(lw, rot);
  const turns = (rot + 2) % 4; // 時計まわりの 4 分の 1 回転の 数（箱の 形は 前が −z）
  const rotate = (dx: number, dz: number): [number, number] => {
    let a = dx;
    let b = dz;
    for (let i = 0; i < turns; i++) [a, b] = [-b, a];
    return [a, b];
  };
  const toWorld = (p: readonly number[]): [number, number, number] => {
    const [rx, rz] = rotate(p[0]! - lw / 2, p[2]! - ld / 2);
    return [fw / 2 + rx, p[1]!, fd / 2 + rz];
  };
  const out: FurnQuad[] = [];
  for (const bx of boxCache[kind] as FurnBox[]) {
    const a = bx.a.map((v) => v / NINTH);
    const b = bx.b.map((v) => v / NINTH);
    for (const f of BOX_FACES) {
      const plane = f.n[f.fixed] > 0 ? b[f.fixed]! : a[f.fixed]!;
      if (f.index === 1 && plane < 1e-6) continue; // 床に つく 面は 見えない
      const tile = furnTileName(f.index <= 1 ? bx.top : (bx.faces?.[SIDE_OF[f.index]!] ?? bx.side));
      // 面の 向き（まわした あと）
      const [wx, wz] = rotate(f.n[0], f.n[2]);
      const face = f.n[1] > 0 ? 0 : f.n[1] < 0 ? 1 : Math.abs(wx) > 0.5 ? (wx > 0 ? 2 : 3) : wz > 0 ? 4 : 5;
      for (const [s0, s1] of splits(a[f.s]!, b[f.s]!)) {
        for (const [t0, t1] of splits(a[f.t]!, b[f.t]!)) {
          const corners: Array<[number, number]> = [[s0, t0], [s1, t0], [s1, t1], [s0, t1]];
          const local = corners.map(([sv, tv]) => {
            const p = [0, 0, 0];
            p[f.fixed] = plane;
            p[f.s] = sv;
            p[f.t] = tv;
            return p;
          });
          // 絵の うつし方（ローカル。横の 4 面は 外から 見て 左から 右へ 絵の x が すすむ ＝ ゲームの ブロックと 同じ 向き）:
          //   上下 (x, −z)・−z (−x, y)・+z (x, y)・+x (−z, y)・−x (z, y)
          const uvOf = (p: number[]): [number, number] =>
            f.index <= 1 ? [p[0]!, -p[2]!] : f.n[2] !== 0 ? [f.n[2] < 0 ? -p[0]! : p[0]!, p[1]!] : [f.n[0] > 0 ? -p[2]! : p[2]!, p[1]!];
          const raw = local.map(uvOf);
          const cu = Math.floor(raw.reduce((q, v) => q + v[0], 0) / 4);
          const cv = Math.floor(raw.reduce((q, v) => q + v[1], 0) / 4);
          // どの マスか: 面の まんなかを 内がわへ すこし ずらして 箱の 形の x を 見る
          const cx = local.reduce((q, p) => q + p[0]!, 0) / 4 - f.n[0] * 1e-4;
          const k = Math.min(lw - 1, Math.max(0, Math.floor(cx)));
          out.push({
            pos: local.flatMap((p) => toWorld(p)),
            uv: raw.flatMap((r) => [r[0] - cu, r[1] - cv]),
            tile,
            face,
            glow: bx.glow === true,
            k,
          });
        }
      }
    }
  }
  cache.set(key, out);
  return out;
}
