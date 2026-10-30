import { chalkInfo, type ChalkFace, type Compass } from '../blocks/chalkMark';
import { CHALK_SHEETS, chalkTileName, type ChalkImageDir } from '../blocks/mineTextures';
import { tileUv } from '../blocks/textures';
import { mix } from './looks/common';
import { FACES, type MeshData } from './meshChunk';

/**
 * チョークの しるし（MINE-1B #349。仕様 MINE-1.md §4.4・アート 07-mine.md 20.10）の 板。
 * しるしの マス（かべ・ゆかの 前の 空気の マス）の かべ側の さかいから 0.02 ブロック うかせた 板 1 まい（三角形 2）。
 * 絵（atlas）の メッシュに くわわる ので 描画回数は ふえない（区画 1 つ ＋1 まで の 中）。光は そのマスの 光。
 */

/** 板を かべから うかす 長さ（ブロック。でこぼこの へこみの 上に のる） */
export const CHALK_LIFT = 0.02;
/** 絵を えらぶ ハッシュの たね（アート 20.10: 位置の ハッシュ・たね 907）。同じ 場所なら いつも 同じ 絵 */
export const CHALK_SEED = 907;
/**
 * しるしの 板の 印: ブロックの 光の 値に 足す（RIPE_FLAG〔2〕の 次）。
 * lightShader.ts が 3.5 以上を 見て、明るさの 下限〔LIGHT_CONFIG.dollMin = 0.3〕を かける。ブロックの 光〔0〜1〕は この 印を ひいた 残り
 */
export const CHALK_FLAG = 4;

/** 面ごとの FACES の 番号（FACES[i].index）。その 面の 向きに 板が 向く */
const FACE_OF: Readonly<Record<ChalkFace, number>> = { up: 0, e: 2, w: 3, s: 4, n: 5 };

/**
 * 絵の 中の 向き（右 = e・左 = w・上 = n・下 = s）。
 * ゆかは 上から 見て 絵の 上 = 北・右 = 東 なので そのまま。かべは 外から 見た 右が 面ごとに ちがう
 * （北向きの 面 = 右が 西・南向き = 右が 東・東向き = 右が 北・西向き = 右が 南）。
 * かべの 絵は 左右 だけ 使う〔やじるしは かべに そって 横を さす〕ので、上下の 組みは ない
 */
export function chalkImageDir(face: ChalkFace, dir: Compass): ChalkImageDir {
  switch (face) {
    case 'up':
      return dir;
    case 'n':
      return dir === 'e' ? 'w' : 'e';
    case 's':
      return dir === 'e' ? 'e' : 'w';
    case 'e':
      return dir === 'n' ? 'e' : 'w';
    case 'w':
      return dir === 's' ? 'e' : 'w';
    default: {
      const never: never = face;
      return never;
    }
  }
}

/** その 場所で 使う 絵の 番号（0〜CHALK_SHEETS - 1）。位置の ハッシュ〔たね 907〕 */
export function chalkSheetAt(x: number, y: number, z: number): number {
  return mix(mix(mix(CHALK_SEED, x), y), z) % CHALK_SHEETS;
}

/**
 * しるし 1 こ（マス x, y, z）の 板を mesh に 足す。id が しるしで なければ 何もしない。
 * sky・blk = そのマスの 光〔0〜1。光の 値 ÷ 15〕。
 */
export function pushChalk(mesh: MeshData, id: string, x: number, y: number, z: number, sky: number, blk: number): void {
  const info = chalkInfo(id);
  if (!info) return;
  const face = FACES[FACE_OF[info.face]]!;
  const uv = tileUv(chalkTileName(chalkSheetAt(x, y, z), chalkImageDir(info.face, info.dir)));
  // 板の 位置: 面の 向きの 軸を、かべ側の さかいから うかせた 所に 置く（向きが + なら 手前の 0 に 近い 側、- なら 1 に 近い 側）
  const axis = face.dir[0] !== 0 ? 0 : face.dir[1] !== 0 ? 1 : 2;
  const at = face.dir[axis]! > 0 ? CHALK_LIFT : 1 - CHALK_LIFT;
  const base = mesh.positions.length / 3;
  // 外から 見て 左下 → 右下 → 右上 → 左上（FACES の 角の 順）。絵の 左下 = 板の 左下
  const u = [uv[0], uv[2], uv[2], uv[0]];
  const v = [uv[1], uv[1], uv[3], uv[3]];
  for (let i = 0; i < 4; i++) {
    const c = face.verts[i]!;
    mesh.positions.push(axis === 0 ? x + at : x + c[0], axis === 1 ? y + at : y + c[1], axis === 2 ? z + at : z + c[2]);
    mesh.uvs.push(u[i]!, v[i]!);
    mesh.colors.push(1, 1, 1);
    mesh.lights.push(sky, blk + CHALK_FLAG);
    mesh.darks.push(0);
  }
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  mesh.faceCount++;
}
