import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { createRng } from '../world/gen/random';
import { makeFakeWorld } from './fakeWorld';
import { canStand, Footing, standY } from './ground';

/**
 * Footing: `canStand` と 同じ 答えを、世界を 読まずに 返す（#355。建築士さんが 毎ステップ 世界を 読まない ため）。
 * 窓 = ぶらぶらする はんいの まわりの 列。窓の 中の 列の 足もとを おぼえて、かわった ことは `touch` で 知らされる。
 */

const bumpy = () =>
  makeFakeWorld({
    height: (x, z) => 9 + ((((x * 7 + z * 13) % 5) + 5) % 5), // 9〜13 の でこぼこ（となりと 3 段 ちがう 所も ある）
    water: (x, z) => (x + z) % 7 === 0,
    loaded: (x) => x !== 3,
  });

/** 列 1 つぶんの 読み（平らな 世界） */
const readsOfColumn = (): number => {
  const w = makeFakeWorld();
  standY(w, 1, 1);
  return w.reads;
};

describe('Footing: canStand と 同じ 答え', () => {
  it('いろんな 場所・高さで canStand と 同じ（窓の 中・外・窓に またがる 所。おぼえた 答えを 高さだけ かえて 使う ときも）', () => {
    const w = bumpy();
    const foot = new Footing(1, 1, 6, 4); // 体の 四すみが とどく 列 0〜7 × 0〜5 の うち、窓は 列 1〜6 × 1〜4
    let stood = 0;
    let blocked = 0;
    for (let z = 0.05; z < 6; z += 0.11) {
      for (let x = 0.05; x < 8; x += 0.07) {
        for (const fromY of [8, 9, 10, 10.9, 11, 11.1, 12, 13, 14]) {
          const want = canStand(w, x, z, fromY);
          expect(foot.stand(w, x, z, fromY), `(${x.toFixed(2)}, ${z.toFixed(2)}) y=${fromY}`).toBe(want);
          if (want === null) blocked++;
          else stood++;
        }
      }
    }
    expect(stood, '立てる 所も').toBeGreaterThan(500);
    expect(blocked, '立てない 所（水・読みこみ前・段差）も ためした').toBeGreaterThan(500);
  });

  it('段差の きまり: 高い 方へは 1 段まで 登れ、低い 方へは 2 段まで おりられる。立つ 高さは 高い 方', () => {
    // 体の 四すみが 地面 9 の 列（立つ 高さ 10）と 11 の 列（立つ 高さ 12）に またがる（x = 1 の 列だけ 11）。
    const w = makeFakeWorld({ height: (x) => (x === 1 ? 11 : 9) });
    const foot = new Footing(-1, -1, 3, 2);
    const at = (y: number) => foot.stand(w, 1.1, 0.5, y); // 四すみが x の 列 0 と 1 に かかる
    expect(at(11)).toBe(12);
    expect(at(10.9), '登る 段差 1.1').toBeNull();
    expect(at(12)).toBe(12);
    expect(at(12.1), 'おりる 段差 2.1').toBeNull();
    expect(at(11.5), 'もどると また 立てる').toBe(12);
    for (const y of [10.9, 11, 11.5, 12, 12.1, 13]) expect(at(y), `y = ${y}`).toBe(canStand(w, 1.1, 0.5, y));
  });
});

describe('Footing: 位置が 数で ない とき', () => {
  it('NaN・無限・とほうも ない 数の ときは 立てない（null）。止まらずに 返り、数が もどれば また 立てる', () => {
    const w = makeFakeWorld();
    const foot = new Footing(0, 0, 3, 3);
    expect(foot.stand(w, 1.5, 1.5, 11)).toBe(11); // 窓を おぼえさせる
    for (const [x, z] of [
      [NaN, 1.5],
      [1.5, NaN],
      [NaN, NaN],
      [Infinity, 1.5],
      [1.5, -Infinity],
      [1e308, 1.5],
    ] as const) {
      expect(canStand(w, x, z, 11), `canStand (${x}, ${z})`).toBeNull();
      expect(foot.stand(w, x, z, 11), `Footing (${x}, ${z})`).toBeNull();
    }
    expect(foot.stand(w, 1.5, 1.5, 11)).toBe(11);
    expect(canStand(w, 1.5, 1.5, 11)).toBe(11);
  });
});

describe('Footing: 読む 回数', () => {
  it('窓の 列を はじめの 1 回で まとめて 読み、そのあとは どこに 立っても 読まない。かわった 列だけ 読みなおす', () => {
    const col = readsOfColumn();
    const w = makeFakeWorld();
    const foot = new Footing(0, 0, 3, 3); // 16 列
    foot.stand(w, 1.5, 1.5, 11);
    expect(w.reads, '窓ぜんぶ').toBe(16 * col);
    w.reads = 0;
    for (const [x, z] of [[1.5, 1.5], [2.5, 1.5], [1.2, 2.7], [0.5, 0.5], [3.5, 3.5]] as const) foot.stand(w, x, z, 11);
    expect(w.reads, '窓の 中なら どこでも 読まない').toBe(0);
    foot.touch(9, 9); // 窓の 外
    foot.touch(4, 0, 6, 3); // 窓の となり
    foot.stand(w, 1.5, 1.5, 11);
    expect(w.reads, '窓の 外の かわり').toBe(0);
    foot.touch(2, 1); // 窓の 中の 1 列
    foot.stand(w, 0.5, 0.5, 11); // 体が かかる 列では ない 所に 立って いても、窓は まとめて 読みなおす
    expect(w.reads, '1 列だけ').toBe(col);
    w.reads = 0;
    foot.touch(-3, -3, 1, 1); // 窓の 4 列と かさなる 箱
    foot.stand(w, 3.5, 3.5, 11);
    expect(w.reads, '箱の うち 窓の 中').toBe(4 * col);
    w.reads = 0;
    foot.stand(w, 3.5, 3.5, 11);
    expect(w.reads).toBe(0);
  });

  it('窓の 外に かかる 場所は おぼえず 毎回 読む（canStand と 同じ）', () => {
    const w = makeFakeWorld();
    const foot = new Footing(0, 0, 3, 3);
    foot.stand(w, 1.5, 1.5, 11);
    w.reads = 0;
    const once = (() => {
      canStand(w, 5.5, 5.5, 11);
      const n = w.reads;
      w.reads = 0;
      return n;
    })();
    expect(once).toBeGreaterThan(0);
    foot.stand(w, 5.5, 5.5, 11);
    foot.stand(w, 5.5, 5.5, 11);
    expect(w.reads, '2 回とも 読む').toBe(2 * once);
    w.reads = 0;
    foot.stand(w, 3.8, 1.5, 11); // 体の 東の すみ（4.1）が 窓の 外（列 4）に かかる
    expect(w.reads).toBeGreaterThan(0);
  });

  it('読みこみ前の 列は おぼえない: 読みこまれたら すぐ 立てる。立てない 列（木）は おぼえ、かわった と 知らされたら 読みなおす', () => {
    let ready = false;
    const w = makeFakeWorld({ loaded: () => ready });
    const foot = new Footing(0, 0, 3, 3);
    expect(foot.stand(w, 1.5, 1.5, 11)).toBeNull();
    ready = true;
    expect(foot.stand(w, 1.5, 1.5, 11), '読みこまれたら すぐ').toBe(11);

    const tree = makeFakeWorld();
    tree.set(1, 11, 1, 'log'); // 木の みき（立てない）
    const f2 = new Footing(0, 0, 3, 3);
    expect(f2.stand(tree, 1.5, 1.5, 11)).toBeNull();
    tree.reads = 0;
    expect(f2.stand(tree, 1.5, 1.5, 11)).toBeNull();
    expect(tree.reads, '立てない 列も おぼえて いる').toBe(0);
    tree.set(1, 11, 1, 'air'); // みきを きった
    f2.touch(1, 1);
    expect(f2.stand(tree, 1.5, 1.5, 11), 'かわった と 知らされた').toBe(11);
  });

  it('世界が ちがえば 読みなおす（前の 世界の 答えを 使わない）', () => {
    const w = makeFakeWorld();
    const foot = new Footing(0, 0, 3, 3);
    expect(foot.stand(w, 1.5, 1.5, 11)).toBe(11);
    const other = makeFakeWorld({ height: () => 12 });
    expect(foot.stand(other, 1.5, 1.5, 12)).toBe(13);
  });
});

describe('Footing: でたらめに かえて 知らせても いつも canStand と 同じ', () => {
  it('ブロックを 1 つずつ・箱で かえて touch すると、そのあとの どの 答えも canStand と 同じ', () => {
    const rng = createRng(20261030);
    const ids: BlockId[] = ['air', 'stone', 'log', 'water', 'leaves', 'dirt'];
    const w = makeFakeWorld({ height: (x, z) => 9 + (((x * 5 + z * 3) % 4) + 4) % 4, loaded: (x, z) => !(x === 4 && z === 2) });
    const foot = new Footing(1, 1, 6, 5);
    let stood = 0;
    let blocked = 0;
    for (let op = 0; op < 600; op++) {
      if (rng() < 0.5) {
        const x = Math.floor(rng() * 9) - 1;
        const z = Math.floor(rng() * 8) - 1;
        w.set(x, 8 + Math.floor(rng() * 7), z, ids[Math.floor(rng() * ids.length)]!);
        foot.touch(x, z);
      } else {
        const x0 = Math.floor(rng() * 8) - 1;
        const z0 = Math.floor(rng() * 7) - 1;
        const x1 = x0 + Math.floor(rng() * 3);
        const z1 = z0 + Math.floor(rng() * 3);
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w.set(x, 8 + Math.floor(rng() * 7), z, ids[Math.floor(rng() * ids.length)]!);
        foot.touch(x0, z0, x1, z1);
      }
      for (let q = 0; q < 6; q++) {
        const x = rng() * 8;
        const z = rng() * 7;
        const fromY = 9 + Math.floor(rng() * 12) / 2;
        const want = canStand(w, x, z, fromY);
        expect(foot.stand(w, x, z, fromY), `op ${op} (${x.toFixed(2)}, ${z.toFixed(2)}) y=${fromY}`).toBe(want);
        if (want === null) blocked++;
        else stood++;
      }
    }
    expect(stood, '立てる 答え').toBeGreaterThan(200);
    expect(blocked, '立てない 答え').toBeGreaterThan(200);
  });
});
