import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import {
  GenCols,
  bothWays,
  components,
  ledgeProblems,
  ptKey,
  shapeProblems,
  standable,
  stepTo,
  walkDist,
  wallProblems,
  type PathCell,
  type Pt,
  type Shaft,
} from './mineShaftKit';

/**
 * MINE-1C のテストの 道具〔mineShaftKit.ts〕の 自分用の たしかめ。作った 物語〔歩ける きまり・ふち・さか道の 輪切り〕を、
 * ちいさな 手づくりの 世界で 確かめる〔生成には 頼らない〕。道具が まちがっていると C3〜C7 が 実装を 正しく 見張れない ので。
 */

const AIR = BLOCK_INDEX.air;
const STONE = BLOCK_INDEX.stone;
const TORCH = BLOCK_INDEX.torch;
const WATER = BLOCK_INDEX.water;

/** 手づくりの 世界。f が ブロックの 番号を 返す */
class Fake extends GenCols {
  constructor(private readonly f: (x: number, y: number, z: number) => number) {
    super(1);
  }
  override at(x: number, y: number, z: number): number {
    if (y < 0) return -1;
    return this.f(x, y, z);
  }
}
const BOX = { x0: -50, x1: 50, z0: -50, z1: 50 };

describe('歩ける きまり（仕様 §6.1）', () => {
  // 床 y<10 が 石、そのうえは 空気
  const flat = new Fake((_x, y) => (y < 10 ? STONE : AIR));

  it('立てる マス: 足と 頭が 体の 通る マスで、足の 下が 固い。たいまつは 通れる・水は ちがう', () => {
    expect(standable(flat, 0, 10, 0)).toBe(true);
    expect(standable(flat, 0, 11, 0)).toBe(false); // 足の 下が 空気
    const torch = new Fake((_x, y) => (y < 10 ? STONE : y === 10 ? TORCH : AIR));
    expect(standable(torch, 0, 10, 0), 'たいまつの マスにも 立てる').toBe(true);
    const water = new Fake((_x, y) => (y < 10 ? STONE : y === 10 ? WATER : AIR));
    expect(standable(water, 0, 10, 0), '水の 中は 立てる マスでない').toBe(false);
  });

  it('同じ 高さ・1 下 は 行ける。2 下 は 歩けない', () => {
    const w = new Fake((x, y) => (y < (x < 5 ? 10 : x < 10 ? 9 : 7) ? STONE : AIR));
    expect(stepTo(w, { x: 4, y: 10, z: 0 }, 1, 0)).toEqual({ x: 5, y: 9, z: 0 });
    expect(stepTo(w, { x: 3, y: 10, z: 0 }, 1, 0)).toEqual({ x: 4, y: 10, z: 0 });
    expect(stepTo(w, { x: 9, y: 9, z: 0 }, 1, 0), '2 下').toBeNull();
  });

  it('1 上 は 自動ジャンプ〔足から 上 4 マスが 空気〕のときだけ。2 上 は 歩けない', () => {
    const up = new Fake((x, y) => (y < (x < 5 ? 10 : x < 10 ? 11 : 13) ? STONE : AIR));
    expect(stepTo(up, { x: 4, y: 10, z: 0 }, 1, 0)).toEqual({ x: 5, y: 11, z: 0 });
    expect(stepTo(up, { x: 9, y: 11, z: 0 }, 1, 0), '2 上').toBeNull();
    // 低い 側の 天井が 足から 3 マスしか あいて いない → ジャンプ できない
    const low = new Fake((x, y) => (y < (x < 5 ? 10 : 11) ? STONE : x < 5 && y >= 13 ? STONE : AIR));
    expect(stepTo(low, { x: 4, y: 10, z: 0 }, 1, 0), '天井が ひくい').toBeNull();
  });

  it('行き来: 上りは 天井が ひくいと 行けない のに 下りは 行ける → 片道は「行き来 できる」ではない', () => {
    const low = new Fake((x, y) => (y < (x < 5 ? 10 : 11) ? STONE : x < 5 && y >= 13 ? STONE : AIR));
    const a: Pt = { x: 4, y: 10, z: 0 };
    const b: Pt = { x: 6, y: 11, z: 0 };
    expect(walkDist(low, b, BOX).has(ptKey(a)), '下りは 行ける').toBe(true);
    expect(walkDist(low, a, BOX).has(ptKey(b)), '上りは 行けない').toBe(false);
    expect(bothWays(low, a, b, BOX)).toBe(false);
    expect(bothWays(flat, { x: 0, y: 10, z: 0 }, { x: 5, y: 10, z: 3 }, BOX)).toBe(true);
  });
});

describe('かたまり分け・輪切り', () => {
  it('段差 1 までで つながる 4 方向の かたまり', () => {
    const cs: Pt[] = [{ x: 0, y: 5, z: 0 }, { x: 1, y: 4, z: 0 }, { x: 2, y: 4, z: 0 }, { x: 10, y: 5, z: 0 }, { x: 11, y: 7, z: 0 }];
    expect(components(cs).map((c) => c.length).sort()).toEqual([1, 1, 3]);
  });
});

// ---------------------------------------------------------------- 手づくりの さか道〔まっすぐ 20 マス・はば 3・2 マスで 1 段〕＋ へや

function ramp(): { g: Fake; shaft: Shaft; path: PathCell[] } {
  const path: PathCell[] = [];
  const foot = new Map<string, number>(); // (x,z) → 足の y
  for (let i = 0; i < 20; i++) for (let w = -1; w <= 1; w++) {
    const y = 100 - (i >> 1);
    path.push({ x: i, y, z: w, part: 'ramp' });
    foot.set(`${i},${w}`, y);
  }
  // へや: 9×9 を さか道の 先〔x 20〜28・z −4〜4〕に、足 y 43
  const room = { x0: 20, y: 43, z0: -4, x1: 28, z1: 4 };
  const g = new Fake((x, y, z) => {
    const f = foot.get(`${x},${z}`);
    if (f !== undefined) return y >= f && y <= f + 3 ? AIR : STONE;
    if (x >= room.x0 && x <= room.x1 && z >= room.z0 && z <= room.z1) return y >= room.y && y <= room.y + 4 ? AIR : STONE;
    return STONE;
  });
  const shaft = { id: 't', start: false, entrance: { x: 0, y: 100, z: 0, dir: 3, kind: 'slope' }, mound: null, room, chest: null, sides: [], box: { x0: 0, z0: -4, x1: 28, z1: 4 } } as Shaft;
  return { g, shaft, path };
}

describe('C3・C4 の しらべ（手づくりの 坑道）', () => {
  it('まっとうな さか道〔20 マス・はば 3・2 マスで 1 段〕と 9×9 の へやは 形の もんだい なし', () => {
    const { g, shaft, path } = ramp();
    // 100 → 90 で 20 マス〔y 100〜91〕。へやは 離れて いるので 形だけ 見る
    expect(shapeProblems(g, shaft, path)).toEqual([]);
  });

  it('1 マスで 1 段〔2 マスでない〕・はば 2・短い・上が ふさがって いる を 見つける', () => {
    const { g, shaft, path } = ramp();
    const steep = path.map((c) => ({ ...c, y: 100 - c.x })); // 1 マスで 1 段
    expect(shapeProblems(g, shaft, steep).length).toBeGreaterThan(0);
    const narrow = path.filter((c) => c.z !== 1);
    expect(shapeProblems(g, shaft, narrow).some((m) => m.includes('はば 3'))).toBe(true);
    const short = path.filter((c) => c.x < 12);
    expect(shapeProblems(g, shaft, short).some((m) => m.includes('長さ'))).toBe(false); // いちばん 下〔ひとつだけ〕は 短くて よい
    const blocked = new Fake((x, y, z) => (x === 5 && z === 0 && y === 100 - 2 + 3 ? STONE : g.at(x, y, z)));
    expect(shapeProblems(blocked, shaft, path).some((m) => m.includes('体の 通る'))).toBe(true);
  });

  it('へやの 大きさ・高さの ちがいを 見つける', () => {
    const { g, shaft, path } = ramp();
    expect(shapeProblems(g, { ...shaft, room: { ...shaft.room, y: 50 } }, path).some((m) => m.includes('41〜46'))).toBe(true);
    expect(shapeProblems(g, { ...shaft, room: { ...shaft.room, x1: 27 } }, path).some((m) => m.includes('9×9'))).toBe(true);
  });

  it('かべ・床: 床が ぬけて いる・かべが あいて いる を 見つける。入口の 近く〔横穴の 口〕は ゆるす', () => {
    const { g, shaft, path } = ramp();
    expect(wallProblems(g, shaft, path)).toEqual([]);
    const hole = new Fake((x, y, z) => (x === 5 && z === 0 && y < 100 - 2 && y > 100 - 5 ? AIR : g.at(x, y, z)));
    expect(wallProblems(hole, shaft, path).some((m) => m.includes('固くない'))).toBe(true);
    const gap = new Fake((x, y, z) => (x === 12 && z === 2 && y === 100 - 6 + 1 ? AIR : g.at(x, y, z)));
    expect(wallProblems(gap, shaft, path).some((m) => m.includes('かべ'))).toBe(true);
    // 入口から 横 2 マス いない の あなは 口〔入口 / 横穴の 口〕として ゆるす
    const nearGap = new Fake((x, y, z) => (x === 1 && z === 2 && y === 100 + 1 ? AIR : g.at(x, y, z)));
    expect(wallProblems(nearGap, shaft, path)).toEqual([]);
  });

  it('ふち: 4 以上 落ちる 所を 見つける。1 段ずつの 山は ふちでない', () => {
    // 地面 y=10 の 平野に、高さ 6 の 台と 1 段ずつの 山
    const cliff = new Fake((x, y, z) => (y < (x >= 0 && x <= 4 && z >= 0 && z <= 4 ? 16 : 10) ? STONE : AIR));
    const s = { entrance: { x: 2, y: 10, z: 8, dir: 2, kind: 'mound' }, mound: null } as unknown as Shaft;
    expect(ledgeProblems(cliff, s).length, '6 落ちる').toBeGreaterThan(0);
    const steps = new Fake((x, y, z) => (y < 10 + Math.max(0, 6 - Math.max(Math.abs(x - 2), Math.abs(z - 2))) ? STONE : AIR));
    expect(ledgeProblems(steps, { entrance: { x: 2, y: 10, z: 8, dir: 2, kind: 'mound' }, mound: { x: 2, z: 2, top: 16, width: 9 } } as unknown as Shaft)).toEqual([]);
  });
});
