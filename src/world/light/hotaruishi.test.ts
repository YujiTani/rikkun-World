import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../contracts';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

/**
 * MINE-1B（docs/design/MINE-1.md §4.4・§4.9・受け入れ基準 B5・B12 の 光の ひろがり）: ほたるいしの 光。
 *
 *   B5: 暗い 所に 置くと その マス 7・となり 6・2 マス 先 5〔空気の 中を 1 マスずつ〕。となりは `isDarkForSpawn` が false、2 マス先は true〔妖怪が 出ない のは となり 1 マス〕。
 *       こわすと 0 に もどる。ほたるいしは 光を 通さない 固い ブロック〔光を 出す 固い ブロックは はじめて。光は となりの 空気へ 広がる〕。
 *   B12: ほたるいしを 2 倍に した 列で、光が ひろがった マスの 数が 2.2 倍 以下。
 *        〔仕様は「光を 広げた マスの 数」を 数える 窓口〔名前は developer〕。窓口の 名前が 決まるまで、ここでは 結果の 明るい マスの 数で くらべる
 *        ＝ 光の ひろがりが 数に 比べて ふくれあがらない ことを 見る。ふつうの 列の 生成の 中央値 4 ms・ほらあなの 三角形 ＋15% は【perf】〕
 * 光の 数え方は 本番の WorldLight〔たいまつと 同じ 光の きまり〕。時間では 決めない。
 */

const HOTARU = 'hotaruishi' as BlockId;

/** まっくらな 部屋: 床 y=0・天井 y=4（ぜんぶ いし）・y=1〜3 が 空気。空の 光は 入らない */
function dark(): { w: ArrayVoxelWorld; l: WorldLight } {
  const w = new ArrayVoxelWorld({ x: 48, y: 16, z: 48 });
  w.fill(0, 0, 0, 47, 0, 47, 'stone');
  w.fill(0, 4, 0, 47, 4, 47, 'stone');
  const l = new WorldLight(w, new SkyDarkness());
  l.update();
  l.flush();
  return { w, l };
}
const settle = (l: WorldLight): void => {
  l.update();
  l.flush();
};

describe('B5: ほたるいしの 光（置いた マス 7・となり 6・2 マス 先 5）', () => {
  it('部屋が まっくら（空の 光 0・ブロックの 光 0）', () => {
    const { l } = dark();
    expect(l.skyLight(24, 2, 24)).toBe(0);
    expect(l.blockLight(24, 2, 24)).toBe(0);
  });

  it('置いた マス 7・となり 6（6 方向）・2 マス 先 5・3 マス 先 4・7 マス 先は 0', () => {
    const { w, l } = dark();
    expect(w.setBlock(24, 2, 24, HOTARU), 'ほたるいしを 置ける').toBe(true);
    settle(l);
    expect(l.blockLight(24, 2, 24)).toBe(7);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]] as const) {
      expect(l.blockLight(24 + dx, 2 + dy, 24 + dz), `となり (${dx}, ${dy}, ${dz})`).toBe(6);
    }
    expect(l.blockLight(26, 2, 24)).toBe(5);
    expect(l.blockLight(24, 2, 26)).toBe(5);
    expect(l.blockLight(27, 2, 24)).toBe(4);
    expect(l.blockLight(31, 2, 24)).toBe(0);
  });

  it('となりは 妖怪が 出ない〔isDarkForSpawn が false〕・2 マス 先は 出る〔true〕', () => {
    const { w, l } = dark();
    expect(w.setBlock(24, 2, 24, HOTARU)).toBe(true);
    settle(l);
    expect(l.isDarkForSpawn(25, 2, 24), 'となり').toBe(false);
    expect(l.isDarkForSpawn(24, 3, 24), 'となり〔上〕').toBe(false);
    expect(l.isDarkForSpawn(26, 2, 24), '2 マス 先').toBe(true);
    expect(l.isDarkForSpawn(24, 2, 27), '3 マス 先').toBe(true);
  });

  it('こわすと 0 に もどる（たいまつと 同じ）。置きなおすと また つく', () => {
    const { w, l } = dark();
    expect(w.setBlock(24, 2, 24, HOTARU)).toBe(true);
    settle(l);
    expect(l.blockLight(25, 2, 24)).toBe(6);
    w.setBlock(24, 2, 24, 'air');
    settle(l);
    for (const x of [24, 25, 26, 27]) expect(l.blockLight(x, 2, 24), `x=${x}`).toBe(0);
    expect(l.isDarkForSpawn(25, 2, 24)).toBe(true);
    w.setBlock(24, 2, 24, HOTARU);
    settle(l);
    expect(l.blockLight(25, 2, 24)).toBe(6);
  });

  it('光は ほたるいしを 通りぬけない（ほたるいしの かべの 向こうは くらいまま）。となりの 空気へだけ 広がる', () => {
    const { w, l } = dark();
    // 部屋を 2 つに 分ける かべ（x=26 の 面。ぜんぶ ほたるいし）。左の 空気に たいまつを 置く
    for (let y = 1; y <= 3; y++) for (let z = 0; z < 48; z++) expect(w.setBlock(26, y, z, HOTARU)).toBe(true);
    w.setBlock(20, 2, 24, 'torch');
    settle(l);
    expect(l.blockLight(25, 2, 24), 'かべの 手前').toBeGreaterThan(0);
    // かべ 自身の 光（7）が 向こうの 空気へ 広がる だけ。たいまつの 光は かべを 通らない
    expect(l.blockLight(27, 2, 24), 'かべの 向こう〔ほたるいしの となり〕').toBe(6);
    expect(l.blockLight(28, 2, 24)).toBe(5);
  });

  it('ほたるいしを 2 つ ならべると 明るい ほうが 勝つ（足し算に ならない）', () => {
    const { w, l } = dark();
    w.setBlock(24, 2, 24, HOTARU);
    w.setBlock(26, 2, 24, HOTARU);
    settle(l);
    expect(l.blockLight(25, 2, 24), '2 つの 間').toBe(6);
    expect(l.blockLight(24, 2, 24)).toBe(7);
  });
});

describe('B12: ほたるいしを 2 倍に した 列で、光が ひろがった マスの 数が 2.2 倍 以下', () => {
  /** 16×16 の 1 列。床 y=0〜9 の いし・y=10〜15 の ひろい 空洞・天井 y=16 の いしに ほたるいしを n こ（かべの 面に 見える 場所） */
  function litCells(n: number): number {
    const w = new ArrayVoxelWorld({ x: 16, y: 24, z: 16 });
    w.fill(0, 0, 0, 15, 9, 15, 'stone');
    w.fill(0, 16, 0, 15, 23, 15, 'stone');
    // 横も かべで とじる（空の 光が 入らない ように。部屋の 中は 14×14）
    w.fill(0, 10, 0, 0, 15, 15, 'stone');
    w.fill(15, 10, 0, 15, 15, 15, 'stone');
    w.fill(0, 10, 0, 15, 15, 0, 'stone');
    w.fill(0, 10, 15, 15, 15, 15, 'stone');
    const l = new WorldLight(w, new SkyDarkness());
    // 天井の 決まった 場所〔格子を 1 つ おきに〕。n が 2 倍に なると、前の 場所は そのままで 同じ 数だけ ふえる
    const spots: Array<[number, number]> = [];
    for (let z = 2; z <= 13; z += 3) for (let x = 2; x <= 13; x += 3) spots.push([x, z]);
    const order = [0, 5, 10, 15, 3, 6, 9, 12, 1, 4, 7, 8, 11, 13, 14, 2];
    for (let k = 0; k < n; k++) {
      const [x, z] = spots[order[k]!]!;
      expect(w.setBlock(x, 16, z, HOTARU), `ほたるいし (${x}, 16, ${z})`).toBe(true);
    }
    l.update();
    l.flush();
    let lit = 0;
    for (let y = 10; y <= 15; y++) for (let z = 1; z <= 14; z++) for (let x = 1; x <= 14; x++) if (l.blockLight(x, y, z) > 0) lit++;
    return lit;
  }

  it('2 倍に すると 光が ひろがった 空気の マスは 2.2 倍 いかに おさまる（1 こずつ 光る のに 数が ふくれあがらない）', () => {
    const one = litCells(2);
    const two = litCells(4);
    const four = litCells(8);
    expect(one, 'ほたるいし 2 こで 光が ひろがる').toBeGreaterThan(0);
    expect(two / one, `${one} → ${two}`).toBeLessThanOrEqual(2.2);
    expect(four / two, `${two} → ${four}`).toBeLessThanOrEqual(2.2);
    expect(two, 'ふやすと へらない').toBeGreaterThanOrEqual(one);
  });
});
