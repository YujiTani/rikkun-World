import { BOKEN_COLORS, FLOOR_DECO_IDS, bokenColor, bokenShape, type FloorDecoId } from '../../blocks/mineBoken';
import { KODO_WAKU_COLORS } from '../../blocks/chestArt';
import { blockHash, carved, dentable, mix } from './common';
import { ALL_FACES, FACE_BIT, LOOK_N, LOOK_VOLUME, type KindSpec } from './types';

/**
 * MINE-1E（docs/design/MINE-1E.md §3.2・§4.9。アート docs/art/design/07-mine.md 20.13「B ほりこみ」）の 8 この 小ブロックの 形（9×9×9）。
 * 色は 絵の 投影（TEX-A）なので、ここは 形だけ（色番号は 「ある」の 印）。
 *   ひびの いし: 見える 横の 面に ぎざぎざの みぞ（ふかさ 2）。みぞの 道すじは 世界の 高さ〔ブロックの 高さ × 9 ＋ y〕で 決める ので
 *     上下 2 マスで 1 本に つながる〔ブロックの 上下を 見える 面に する ため `occludes: false`〕。ふちが ところどころ 欠け、細い えだは あさい みぞ
 *   くずれた いし: 見える 面に まるい 石が 6 こほど（石の あいだは ふかい すきま）・かどを まるく けずる
 *   こわれた わく: 1C の わくと 同じ 箱に、見える 面を 横切る ななめの ひび（ふかさ 2）と、かどの 欠け
 *   ふるい レール・たおれた はしご・たきびの あと: 床から ひくく 立つ 形（mineBoken.ts の 文字の 表。ブロックの 下の 半分に のる。つまずかない）
 * 毎回 新しい 物を 作らない（作業用の 表は ここに 1 つずつ）。
 */
const N = LOOK_N;
const M = N - 1;

/** 面 f〔0 上, 1 下, 2 +x, 3 -x, 4 +z, 5 -z〕の (u, v, ふかさ d) → 小ブロックの 番号。v は 横の 面では 下から 数える〔y〕、上下の 面では z */
function faceCell(f: number, u: number, v: number, d: number): number {
  let x: number;
  let y: number;
  let z: number;
  switch (f) {
    case 0:
      x = u; y = M - d; z = v;
      break;
    case 1:
      x = u; y = d; z = v;
      break;
    case 2:
      x = M - d; y = v; z = u;
      break;
    case 3:
      x = d; y = v; z = u;
      break;
    case 4:
      x = u; y = v; z = M - d;
      break;
    default:
      x = u; y = v; z = d;
  }
  return (y * N + z) * N + x;
}

/** 横の 面 4 つ〔+x, -x, +z, -z〕の 面の 番号 */
const SIDE_FACES = [2, 3, 4, 5] as const;

/** ひびの みぞの ぎざぎざ: 世界の 高さ 6 つぶ で ひとまわり〔横に ずれる 量〕 */
const ZIGZAG = [0, 1, 1, 0, -1, -1] as const;
/** ひびの いしの みぞの ふかさ〔つぶ〕 */
const HIBI_DEPTH = 2;

/** ひびの いし: u（面の 横）の 道すじが 世界の 高さ wy で 決まる ぎざぎざの みぞ */
function fillHibi(body: number, bx: number, by: number, bz: number, e: number, out: Uint8Array): void {
  out.fill(body, 0, LOOK_VOLUME);
  if (e === ALL_FACES) return; // 3D テクスチャ用: 穴を あけない
  for (const f of SIDE_FACES) {
    if (!(e & FACE_BIT[f]!)) continue;
    const seed = mix(blockHash(1500, bx, 0, bz), f);
    const u0 = 3 + (seed % 3);
    for (let y = 0; y < N; y++) {
      const wy = by * N + y;
      const u = u0 + ZIGZAG[((wy % 6) + 6) % 6]!;
      for (let d = 0; d < HIBI_DEPTH; d++) out[faceCell(f, u, y, d)] = 0;
      if (wy % 4 === 0) out[faceCell(f, u + 1, y, 0)] = 0; // ところどころ はばが 広い
      if (mix(seed, wy) % 5 === 0) out[faceCell(f, u - 1, y, 0)] = 0; // ふちの 欠け
      if (((wy % 9) + 9) % 9 === 4) {
        // 細い えだ（あさい みぞ）
        out[faceCell(f, u + 1, y, 0)] = 0;
        out[faceCell(f, u + 2, y, 0)] = 0;
        out[faceCell(f, Math.min(M, u + 3), y, 0)] = 0;
      }
    }
  }
}

/** くずれた いし 1 面ぶんの まるい 石〔中心 u・v と 半径〕の 数 */
const KUZURE_ROCKS = 6;
/** 作業用: 石の 中心〔u, v〕と 半径 */
const rockU = new Float32Array(KUZURE_ROCKS);
const rockV = new Float32Array(KUZURE_ROCKS);
const rockR = new Float32Array(KUZURE_ROCKS);

/** くずれた いし: 見える 面ごとに まるい 石を 置き、石の あいだを ほる。かどは まるく けずる */
function fillKuzure(body: number, bx: number, by: number, bz: number, e: number, out: Uint8Array): void {
  out.fill(body, 0, LOOK_VOLUME);
  if (e === ALL_FACES) return;
  const h = blockHash(1501, bx, by, bz);
  for (let f = 0; f < 6; f++) {
    if (!(e & FACE_BIT[f]!)) continue;
    for (let i = 0; i < KUZURE_ROCKS; i++) {
      const r = mix(h, f * 16 + i);
      rockU[i] = 0.5 + (r % 9);
      rockV[i] = 0.5 + ((r >>> 8) % 9);
      rockR[i] = 1.6 + ((r >>> 16) % 4) * 0.4; // 1.6〜2.8
    }
    for (let u = 0; u < N; u++) {
      for (let v = 0; v < N; v++) {
        let inside = false;
        for (let i = 0; i < KUZURE_ROCKS && !inside; i++) inside = Math.hypot(u + 0.5 - rockU[i]!, v + 0.5 - rockV[i]!) <= rockR[i]!;
        if (inside) continue;
        const r = mix(h, 400 + f * 81 + u * 9 + v);
        for (let d = 0; d < (r % 3 === 0 ? 2 : 1); d++) {
          const i = faceCell(f, u, v, d);
          const x = i % N;
          const z = ((i / N) | 0) % N;
          const y = (i / (N * N)) | 0;
          if (dentable(x, y, z, e)) out[i] = 0;
        }
      }
    }
  }
  for (let i = 0; i < LOOK_VOLUME; i++) {
    const x = i % N;
    const z = ((i / N) | 0) % N;
    const y = (i / (N * N)) | 0;
    if (out[i] !== 0 && carved(x, y, z, e, h, 0, 0, 6)) out[i] = 0; // かどを まるく
  }
}

/** こわれた わく: 見える 面を 横切る ななめの ひび（ふかさ 2）＋ 1 つの かどの 欠け */
function fillWaku(body: number, bx: number, by: number, bz: number, e: number, out: Uint8Array): void {
  out.fill(body, 0, LOOK_VOLUME);
  if (e === ALL_FACES) return;
  const h = blockHash(1502, bx, by, bz);
  const flip = h % 2 === 0;
  for (let f = 0; f < 6; f++) {
    if (!(e & FACE_BIT[f]!)) continue;
    for (let u = 0; u < N; u++) {
      const v = flip ? M - u : u;
      for (let d = 0; d < 2; d++) {
        const i = faceCell(f, u, v, d);
        if (dentable(i % N, (i / (N * N)) | 0, ((i / N) | 0) % N, e)) out[i] = 0;
      }
      if (u % 3 === 0 && v + 1 <= M) {
        const i = faceCell(f, u, v + 1, 0);
        if (dentable(i % N, (i / (N * N)) | 0, ((i / N) | 0) % N, e)) out[i] = 0; // ひびの ふちの 欠け
      }
    }
  }
  // かどの 欠け（2×2×2）。見える 面どうしが 出会う かどだけ
  const cx = (h >>> 3) % 2 === 0 ? 0 : M - 1;
  const cy = (h >>> 4) % 2 === 0 ? 0 : M - 1;
  const cz = (h >>> 5) % 2 === 0 ? 0 : M - 1;
  for (let y = cy; y < cy + 2; y++) {
    for (let z = cz; z < cz + 2; z++) {
      for (let x = cx; x < cx + 2; x++) if (dentable(x, y, z, e) && carved(x, y, z, e, h, 0, 0, 10)) out[(y * N + z) * N + x] = 0;
    }
  }
}

/** 床の 飾り 1 つ: 文字の 表を そのまま 色番号に する（形は いつも 同じ） */
function decoKind(id: FloorDecoId, P: (hex: string) => number): KindSpec {
  const cells = Uint8Array.from(bokenShape(id), (letter) => (letter === '' ? 0 : P(bokenColor(letter))));
  return {
    base: P(BOKEN_COLORS.W!),
    occludes: false, // ひくい 形なので どの 面にも すきまが ある
    fill: (_bx, _by, _bz, _e, out) => out.set(cells),
  };
}

/** 坑道の 冒険の 8 この 見た目。P = パレットに 色を 入れて 色番号を 返す 関数。body = 地の 石の 色番号 */
export function createBokenKinds(P: (hex: string) => number, body: number): Record<string, KindSpec> {
  const hibi = P('#9E978A');
  const kuzure = P('#928B80');
  const waku = P(KODO_WAKU_COLORS.wood);
  const out: Record<string, KindSpec> = {
    hibi_ishi: { base: body, occludes: false, fill: (bx, by, bz, e, o) => fillHibi(hibi, bx, by, bz, e, o) },
    kuzure_ishi: { base: body, fill: (bx, by, bz, e, o) => fillKuzure(kuzure, bx, by, bz, e, o) },
    kowareta_waku: { base: waku, fill: (bx, by, bz, e, o) => fillWaku(waku, bx, by, bz, e, o) },
  };
  for (const id of FLOOR_DECO_IDS) out[id] = decoKind(id, P);
  return out;
}
