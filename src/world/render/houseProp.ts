/**
 * 家の 戸・しょうじ・向きの ある 家具（箱の 組み合わせ）を 区の メッシュに 足す（HOUSE-1C PR-1 #340。描画回数は ふえない〔ほかの 小物と 同じ メッシュ〕）。
 * ・戸 ＝ 2 マス × あけ・しめ（いつも 南向き）。戸わく・ひさしが かべの 外と 中へ 出る。しょうじ ＝ 紙の 板（紙は いつも 中から 明るい）＋ 窓わく
 * ・家具 ＝ world/blocks/furnitureQuads.ts の 面から このマスに 入る 分だけ（エディターの 見本と 同じ 関数）
 * 面の 絵は 1 マスごとに 作って おぼえる（毎フレーム 新しい 物を 作らない）。
 */
import { BLOCK_INDEX, SHOJI } from '../blocks/blockTypes';
import { tileSubUv, tileUv, type TileName } from '../blocks/textures';
import { doorBoxes, shojiBoxes, type BoxFace, type HouseBox } from '../blocks/houseBoxes';
import { furnitureQuads } from '../blocks/furnitureQuads';
import { FURN_LEN, doorInfo, furnCellOffset, furnInfo, type FurnRot } from '../blocks/houseBlocks';
import type { MeshData } from './meshChunk';
import { FACE_SHADE_BY_INDEX } from './config';

/** 面 1 まい: 4 つの 角の 場所（マスの 中。ブロック単位）・絵の 場所（atlas の UV）・明るさ。sky・blk が null の ときは マスの 光 */
interface Piece {
  pos: number[];
  uv: number[];
  shade: number;
  sky: number | null;
  blk: number | null;
}

/** しょうじの 紙の 光（0〜1。0.8 ＝ ブロックの光 12 ＝ あかりの 近くと 同じ 明るさ）と 面の こさ（1 ＝ かげ なし）。日の 影を うけず よるは あかりの 色 */
const PAPER_BLOCK = 0.8;
/** あんどんの 紙の 光（自分で 光る 見た目だけ） */
const ANDON_BLOCK = 1;

/** 面: 0 上, 1 下, 2 +x, 3 −x, 4 +z, 5 −z（meshChunk の FACES と 同じ 角の 順） */
const FACE_VERTS: Array<Array<[number, number, number]>> = [
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const FACE_NAME: readonly BoxFace[] = ['top', 'bottom', 'right', 'left', 'front', 'back'];

/** 点の 区間 [a, b) を 0〜16 に おさめる（はみ出す 箱は 16 ごとに くり返す） */
function wrap(a: number, b: number): [number, number] {
  if (b - a >= 16) return [0, 16];
  const k = Math.floor(a / 16) * 16;
  return [Math.max(0, a - k), Math.min(16, b - k)];
}

/** 戸・しょうじの 箱（点）→ 面 */
function piecesOfBoxes(boxes: readonly HouseBox[], open: boolean): Piece[] {
  const out: Piece[] = [];
  for (const b of boxes) {
    const [x0, y0, z0] = b.min;
    const [x1, y1, z1] = b.max;
    for (let f = 0; f < 6; f++) {
      // 上下の 面（ゆか・かべ・上下の マスと くっつく）と、かべに うまる 面（skip）は 見えない
      if ((f === 1 && y0 === 0) || (f === 0 && y1 === 16)) continue;
      if (b.skip?.includes(FACE_NAME[f]!)) continue;
      const tile = (b.tiles[FACE_NAME[f]!] ?? b.tiles.side ?? 'house_door_edge') as TileName;
      const glow = b.glow === true && tile === 'house_shoji';
      // 面の 絵の 範囲（点）: 前 ＝ (x, y)、うしろ ＝ (16 − x, y)、右 +x ＝ (16 − z, y)、左 −x ＝ (z, y)、上下 ＝ (x, z)
      const off = b.uOff ?? 0;
      let u0: number, u1: number, v0: number, v1: number;
      if (f >= 4) {
        [u0, u1] = f === 4 ? wrap(x0 + off, x1 + off) : wrap(16 - x1 + off, 16 - x0 + off);
        [v0, v1] = [16 - y1, 16 - y0];
      } else if (f >= 2) {
        // あけた 戸の 大きな 面: z の 長さで 絵を うつす
        const zz = open ? [z0 - Math.floor(z0 / 16) * 16, z1 - Math.floor(z0 / 16) * 16] : [z0, z1];
        [u0, u1] = f === 3 ? wrap(zz[0]! + off, zz[1]! + off) : wrap(16 - zz[1]! + off, 16 - zz[0]! + off);
        [v0, v1] = [16 - y1, 16 - y0];
      } else {
        [u0, u1] = wrap(x0, x1);
        [v0, v1] = wrap(z0, z1);
      }
      const uv = tileSubUv(tile, u0, Math.max(0, v0), u1, Math.min(16, v1));
      out.push({
        pos: FACE_VERTS[f]!.flatMap((v) => [(v[0] ? x1 : x0) / 16, (v[1] ? y1 : y0) / 16, (v[2] ? z1 : z0) / 16]),
        uv: [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]],
        shade: glow ? 1 : FACE_SHADE_BY_INDEX[f]!,
        sky: glow ? 0 : null,
        blk: glow ? PAPER_BLOCK : null,
      });
    }
  }
  return out;
}

const cache = new Map<string, readonly Piece[] | null>();

/** 向きの ある 家具 1 マスの 面（家具ぜんたいの 面から この マスの 分を 取り、マスの すみが 原点に なる ように ずらす） */
function furnPieces(id: string): readonly Piece[] | null {
  const f = furnInfo(id);
  if (!f) return null;
  const len = FURN_LEN[f.kind];
  const [dx, dz] = furnCellOffset(len, f.rot, f.k);
  return furnitureQuads(f.kind, f.rot as FurnRot)
    .filter((q) => q.k === f.k)
    .map((q) => {
      const r = tileUv(q.tile as TileName);
      const pos = [...q.pos];
      for (let i = 0; i < 4; i++) {
        pos[i * 3] = pos[i * 3]! - dx;
        pos[i * 3 + 2] = pos[i * 3 + 2]! - dz;
      }
      return {
        pos,
        uv: [0, 1, 2, 3].flatMap((i) => [r[0] + q.uv[i * 2]! * (r[2] - r[0]), r[1] + q.uv[i * 2 + 1]! * (r[3] - r[1])]),
        shade: q.glow ? 1 : FACE_SHADE_BY_INDEX[q.face]!,
        sky: null,
        blk: q.glow ? ANDON_BLOCK : null,
      };
    });
}

function piecesOf(id: string, shojiAxis: 'x' | 'z'): readonly Piece[] | null {
  const isShoji = BLOCK_INDEX[id as keyof typeof BLOCK_INDEX] === SHOJI;
  const key = isShoji ? `shoji:${shojiAxis}` : id;
  let p = cache.get(key);
  if (p !== undefined) return p;
  const d = doorInfo(id);
  if (d) p = piecesOfBoxes(doorBoxes(d.top ? 'up' : 'low', d.open), d.open);
  else if (isShoji) p = piecesOfBoxes(shojiBoxes(shojiAxis), false);
  else p = furnPieces(id);
  cache.set(key, p);
  return p;
}

/** かべのように つながる ブロックの 番号（しょうじの 向きを きめる ときの となり） */
let wallish: ReadonlySet<number> | null = null;
function wallishSet(): ReadonlySet<number> {
  wallish ??= new Set(['house_wall', 'shoji', 'house_door', 'house_door_top', 'house_door_open', 'house_door_open_top'].map((id) => (BLOCK_INDEX as Record<string, number>)[id]!));
  return wallish;
}
/**
 * しょうじの 紙が 向く 軸（'z' ＝ 紙は 南北を 向く ＝ 東西に のびる かべ、'x' ＝ 紙は 東西を 向く ＝ 南北に のびる かべ）。
 * となりに かべ（しょうじ・戸も）が あるほうの 軸で きめる。どちらも なければ 'z'。ブロックの id は どの かべでも `shoji` ひとつ
 */
export function shojiAxisAt(getIndex: (x: number, y: number, z: number) => number, x: number, y: number, z: number): 'x' | 'z' {
  const w = wallishSet();
  if (w.has(getIndex(x - 1, y, z)) || w.has(getIndex(x + 1, y, z))) return 'z';
  return w.has(getIndex(x, y, z - 1)) || w.has(getIndex(x, y, z + 1)) ? 'x' : 'z';
}

/** 家の 戸・しょうじ・家具なら 描いて true（そうでなければ false）。shojiAxis は しょうじの ときだけ 使う（shojiAxisAt） */
export function pushHouseProp(mesh: MeshData, x: number, y: number, z: number, id: string, sky: number, block: number, shojiAxis: 'x' | 'z' = 'z'): boolean {
  const pieces = piecesOf(id, shojiAxis);
  if (!pieces) return false;
  for (const p of pieces) {
    const base = mesh.positions.length / 3;
    const sk = p.sky ?? sky;
    const bk = p.blk ?? block;
    for (let i = 0; i < 4; i++) {
      mesh.positions.push(x + p.pos[i * 3]!, y + p.pos[i * 3 + 1]!, z + p.pos[i * 3 + 2]!);
      mesh.uvs.push(p.uv[i * 2]!, p.uv[i * 2 + 1]!);
      mesh.colors.push(p.shade, p.shade, p.shade);
      mesh.lights.push(sk, bk);
      mesh.darks.push(0);
    }
    mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    mesh.faceCount++;
  }
  return true;
}
