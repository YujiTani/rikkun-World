import { describe, expect, it } from 'vitest';
import { amounts, carve, makeRig, rng, type Box, type Rig } from './waterTestKit';

/**
 * WATER-1（docs/design/WATER-1.md §6）の ユニット: AC3〜AC9・AC11・AC12・AC15（作り直す セクションの 数）と 窓口（stable・pause）。
 * 場所は 小さな 世界の 石の 箱。数（パスの 数・量）は §4.2・§4.3 を そのまま 動かして 出した 値（仕様の AC の 数と 同じ）。
 * 「止まった」= `queue() === 0` かつ `stable(箱)` かつ 合計が はじめと 同じ。北 = −z・東 = +x。
 * 実装の まえに 書いた テスト（`waterSystem.ts` が まだ 無いので 落ちるのが 正しい）。
 */

const stopped = (r: Rig, box: Box, total: number): void => {
  expect(r.sys.queue(), 'queue() === 0').toBe(0);
  expect(r.sys.stable(...box), 'stable(箱)').toBe(true);
  expect(r.sys.total(...box), '合計 同じ').toBe(total);
};

describe('AC3 落ちる', () => {
  it('床から 6 マス 上（間は 空き）の 量 8 → 5 パスで 床の 上の マスに 量 8、6 パス目で 止まった。間の マスは air', () => {
    const r = makeRig();
    const [X, Z, FLOOR] = [11, 11, 2];
    carve(r.world, [10, FLOOR, 10, 12, FLOOR + 10, 12], [X, FLOOR + 1, Z, X, FLOOR + 10, Z]);
    const box: Box = [X, FLOOR + 1, Z, X, FLOOR + 10, Z];
    r.sys.set(X, FLOOR + 6, Z, 8);
    expect(r.sys.queue(), '置いたら 起きる').toBeGreaterThan(0);
    for (let k = 1; k <= 5; k++) {
      r.pass(1);
      expect(r.sys.amount(X, FLOOR + 6 - k, Z), `${k} パス後に 8 の いる 高さ`).toBe(8);
      expect(r.sys.total(...box)).toBe(8);
    }
    expect(r.sys.passes()).toBe(5);
    expect(r.sys.amount(X, FLOOR + 1, Z), '5 パスで 床の 上の マスに 量 8').toBe(8);
    expect(r.sys.queue(), '5 パス目の あとも まだ 起きている').toBeGreaterThan(0);
    r.pass(1);
    expect(r.sys.passes(), '6 パス目').toBe(6);
    stopped(r, box, 8);
    for (let y = FLOOR + 2; y <= FLOOR + 10; y++) expect(r.world.getBlock(X, y, Z), `間の マス y=${y}`).toBe('air');
  });
});

describe('AC4 平らに', () => {
  it('はば 1・長さ 4 の とじた みぞの はし（0）に 量 8 → 6 パスで 止まった、はしから 3・2・2・1', () => {
    const r = makeRig();
    carve(r.world, [9, 2, 10, 14, 4, 12], [10, 3, 11, 13, 3, 11]);
    const box: Box = [10, 3, 11, 13, 3, 11];
    r.sys.set(10, 3, 11, 8);
    expect(r.settle(40), '止まるまでの パスの 数').toBe(6);
    expect(amounts(r.sys, box)).toEqual([3, 2, 2, 1]);
    stopped(r, box, 8);
  });
});

describe('AC5 広い 床', () => {
  it('21×21 の まん中に 量 8 → 3 パスで 止まった。まん中 2・北 東 南 西 1・北北 1・北東 1（7 マス、合計 8）', () => {
    const r = makeRig();
    carve(r.world, [4, 2, 4, 26, 4, 26], [5, 3, 5, 25, 3, 25]);
    const box: Box = [5, 3, 5, 25, 3, 25];
    const [cx, cz] = [15, 15];
    r.sys.set(cx, 3, cz, 8);
    expect(r.settle(40), '止まるまでの パスの 数').toBe(3);
    const want = new Map<string, number>([
      [`${cx},${cz}`, 2],
      [`${cx},${cz - 1}`, 1], // 北（−z）
      [`${cx + 1},${cz}`, 1], // 東（+x）
      [`${cx},${cz + 1}`, 1], // 南
      [`${cx - 1},${cz}`, 1], // 西
      [`${cx},${cz - 2}`, 1], // 北北
      [`${cx + 1},${cz - 1}`, 1], // 北東
    ]);
    for (let z = 5; z <= 25; z++) for (let x = 5; x <= 25; x++) expect(r.sys.amount(x, 3, z), `(${x},${z})`).toBe(want.get(`${x},${z}`) ?? 0);
    stopped(r, box, 8);
  });
});

describe('AC6 低い 所', () => {
  /** 広い 床（y=3 が 石、y=4 が 歩く 高さ）。穴は 床の 1 マス（深さ 1） */
  function plain(holeAt: number): { r: Rig; walk: Box; both: Box; hole: [number, number, number] } {
    const r = makeRig();
    carve(r.world, [3, 2, 3, 40, 5, 27], [4, 4, 4, 39, 4, 26]);
    const hole: [number, number, number] = [holeAt, 3, 15];
    r.world.setBlock(...hole, 'air');
    return { r, walk: [4, 4, 4, 39, 4, 26], both: [4, 3, 4, 39, 4, 26], hole };
  }

  it('量 1 から 東へ 7 マス 先の 穴 → 9 パスで 止まった、穴に 1・床は 0', () => {
    const { r, walk, both, hole } = plain(12 + 7);
    r.sys.set(12, 4, 15, 1);
    expect(r.settle(60)).toBe(9);
    expect(r.sys.amount(...hole)).toBe(1);
    expect(r.sys.total(...walk), '床の 上は 0').toBe(0);
    stopped(r, both, 1);
  });

  it('8 マス 先の 穴 → 1 パスで 止まった、うごかない（さがす 線は 7 マスまで）', () => {
    const { r, both, hole } = plain(12 + 8);
    r.sys.set(12, 4, 15, 1);
    expect(r.settle(60)).toBe(1);
    expect(r.sys.amount(12, 4, 15)).toBe(1);
    expect(r.sys.amount(...hole)).toBe(0);
    stopped(r, both, 1);
  });

  it('量 8 で 東 5 マス 先の 穴 → 穴に 8（仕様は 18 パス。§4.2・§4.3 を そのまま 動かすと 15 パス。18 パス 以内を 見る）', () => {
    const { r, walk, both, hole } = plain(12 + 5);
    r.sys.set(12, 4, 15, 8);
    const n = r.settle(60);
    expect(n, '止まるまでの パスの 数').toBeLessThanOrEqual(18);
    expect(r.sys.amount(...hole), '穴に 8').toBe(8);
    expect(r.sys.total(...walk), '床の 上は 0').toBe(0);
    stopped(r, both, 8);
  });
});

/** 12×6×12 ではなく 8×5×8 の とじた 箱。石 30%・のこりは 空気。空気の 25% に 水（量 1〜8）。シードで 決まる */
function randomBox(seed: number): { r: Rig; box: Box; total: number } {
  const r = makeRig();
  const R = rng(seed);
  const [W, H, D, x0, y0, z0] = [8, 5, 8, 11, 3, 11];
  r.world.fill(x0 - 1, y0 - 1, z0 - 1, x0 + W, y0 + H, z0 + D, 'stone'); // ふち（床・かべ）
  r.world.fill(x0, y0, z0, x0 + W - 1, y0 + H - 1, z0 + D - 1, 'air');
  const wet: Array<[number, number, number, number]> = [];
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const stone = R() < 0.3;
        const isWet = R() < 0.25;
        const n = 1 + Math.floor(R() * 8);
        if (stone) r.world.setBlock(x0 + x, y0 + y, z0 + z, 'stone');
        else if (isWet) wet.push([x0 + x, y0 + y, z0 + z, n]);
      }
    }
  }
  let total = 0;
  for (const [x, y, z, n] of wet) {
    r.sys.set(x, y, z, n);
    total += n;
  }
  return { r, box: [x0, y0, z0, x0 + W - 1, y0 + H - 1, z0 + D - 1], total };
}

describe('AC7 量は 保たれる・AC8 量 8 を こえない', () => {
  it('シード 固定の 箱 10 通り: どの パスの あとも 合計 同じ・量 8 を こえる マスが ない・200 パス 以内に 止まる', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { r, box, total } = randomBox(seed);
      expect(r.sys.total(...box), `シード ${seed} の はじめ`).toBe(total);
      let n = 0;
      while (r.sys.queue() > 0 && n < 200) {
        r.pass(1);
        n++;
        expect(r.sys.total(...box), `シード ${seed} の ${n} パス後の 合計`).toBe(total);
        for (const a of amounts(r.sys, box)) expect(a, `シード ${seed} の ${n} パス後`).toBeLessThanOrEqual(8);
      }
      expect(n, `シード ${seed}: 200 パス 以内`).toBeLessThan(200);
      stopped(r, box, total);
    }
  });

  it('同じ シード 2 回 → 同じ 形', () => {
    const a = randomBox(5);
    const b = randomBox(5);
    a.r.settle(200);
    b.r.settle(200);
    expect(amounts(a.r.sys, a.box)).toEqual(amounts(b.r.sys, b.box));
    expect(a.r.world.hash()).toBe(b.r.world.hash());
    expect(a.r.sys.passes()).toBe(b.r.sys.passes());
  });

  it('シードが ちがえば 形も ちがう（箱が 同じ 形では ない）', () => {
    const a = randomBox(1);
    const b = randomBox(2);
    a.r.settle(200);
    b.r.settle(200);
    expect(a.r.world.hash()).not.toBe(b.r.world.hash());
  });
});

describe('AC8 入れない', () => {
  it('たいまつ・作物の マス、量 8 の 水の マスは 水が 入らない（量が かわらない）。入れる 所が 1 つも ない 水は 1 パスで 眠る', () => {
    const r = makeRig();
    const [ax, az] = [12, 12];
    // 石の かたまりに 4 マスだけ あなを あける: A（量 8）・北（たいまつ）・東（作物）・南（量 8 の 水）。西は 石
    r.world.fill(9, 2, 9, 15, 5, 15, 'stone');
    for (const [x, z] of [[ax, az], [ax, az - 1], [ax + 1, az], [ax, az + 1]]) r.world.setBlock(x, 4, z, 'air');
    r.world.setBlock(ax, 4, az - 1, 'torch');
    r.world.setBlock(ax + 1, 4, az, 'crop_tomato');
    r.world.setBlock(ax, 4, az + 1, 'water');
    const box: Box = [9, 2, 9, 15, 5, 15];
    r.sys.set(ax, 4, az, 8);
    expect(r.settle(20), '動く 所が ないので 1 パスで 止まる').toBe(1);
    expect(r.world.getBlock(ax, 4, az - 1), 'たいまつ').toBe('torch');
    expect(r.world.getBlock(ax + 1, 4, az), '作物').toBe('crop_tomato');
    expect(r.sys.amount(ax, 4, az - 1), 'たいまつの マスは 水でも air でも ない').toBe(-1);
    expect(r.sys.amount(ax + 1, 4, az)).toBe(-1);
    expect(r.sys.amount(ax, 4, az), 'A').toBe(8);
    expect(r.sys.amount(ax, 4, az + 1), '量 8 の マスは 量が かわらない').toBe(8);
    stopped(r, box, 16);
  });

  it('低い 所を さがす 線も 入れない マス（たいまつ）で 止まる: 先に 穴が あっても 動かない', () => {
    const r = makeRig();
    // 横一列（z=12）の ろうか x=9..12。東（13）は 石。西の 先 (10) の 下に 穴
    carve(r.world, [8, 2, 11, 14, 5, 13], [9, 4, 12, 12, 4, 12]);
    r.world.setBlock(10, 3, 12, 'air'); // 穴（床の 1 マス）
    r.world.setBlock(11, 4, 12, 'torch'); // 水と 穴の あいだ
    const box: Box = [9, 3, 12, 12, 4, 12];
    r.sys.set(12, 4, 12, 8);
    expect(r.settle(20)).toBe(1);
    expect(r.sys.amount(12, 4, 12), '動かない').toBe(8);
    expect(r.sys.amount(10, 3, 12), '穴は からのまま').toBe(0);
    expect(r.world.getBlock(11, 4, 12)).toBe('torch');
    stopped(r, box, 8);
  });
});

describe('AC9 押し出し（§4.5。ブロックを 置くと その マスの 水は 上→北→東→南→西→下 の 順に となりへ）', () => {
  /** 石の 立方体 (9..13, 2..5, 9..13) の 中に 空気の 穴を あける */
  const cube = (r: Rig, ...air: Box[]): void => {
    r.world.fill(9, 2, 9, 13, 5, 13, 'stone');
    for (const a of air) r.world.fill(...a, 'air');
  };

  it('(a) 下・横 4 が 石、上が 空き の 量 8 に 石 → 上が 量 8、横は かわらない。置いた マスは 石', () => {
    const r = makeRig();
    cube(r, [11, 4, 11, 11, 5, 11]);
    r.sys.set(11, 4, 11, 8);
    r.world.setBlock(11, 4, 11, 'stone');
    expect(r.world.getBlock(11, 4, 11)).toBe('stone');
    expect(r.sys.amount(11, 5, 11), '上が 量 8').toBe(8);
    for (const [x, y, z] of [[11, 4, 10], [12, 4, 11], [11, 4, 12], [10, 4, 11], [11, 3, 11]]) expect(r.world.getBlock(x, y, z), '横・下は 石の まま').toBe('stone');
    expect(r.sys.total(9, 2, 9, 13, 5, 13)).toBe(8);
  });

  it('(b) 上が 石、北が 量 5、東が 空き、南・西が 石 → 北 8・東 5。置いた マスは 石', () => {
    const r = makeRig();
    cube(r, [11, 4, 11, 11, 4, 11], [11, 4, 10, 11, 4, 10], [12, 4, 11, 12, 4, 11]);
    r.sys.set(11, 4, 10, 5); // 北（−z）
    r.sys.set(11, 4, 11, 8);
    r.world.setBlock(11, 4, 11, 'stone');
    expect(r.world.getBlock(11, 4, 11)).toBe('stone');
    expect(r.sys.amount(11, 4, 10), '北 8').toBe(8);
    expect(r.sys.amount(12, 4, 11), '東 5').toBe(5);
    expect(r.sys.total(9, 2, 9, 13, 5, 13)).toBe(13);
  });

  it('(c) 6 方 石 → 水は 消える。置いた マスは 石', () => {
    const r = makeRig();
    cube(r, [11, 4, 11, 11, 4, 11]);
    r.sys.set(11, 4, 11, 8);
    r.world.setBlock(11, 4, 11, 'stone');
    expect(r.world.getBlock(11, 4, 11)).toBe('stone');
    expect(r.sys.total(9, 2, 9, 13, 5, 13), '水は 消えた').toBe(0);
  });

  it('量 3 の 水に 石 → 上に 3（置く マスの 水の 量が 押し出す 量）', () => {
    const r = makeRig();
    cube(r, [11, 4, 11, 11, 5, 11]);
    r.sys.set(11, 4, 11, 3);
    r.world.setBlock(11, 4, 11, 'stone');
    expect(r.sys.amount(11, 5, 11)).toBe(3);
  });
});

describe('AC11 上限: 1 パスで 計算する マスは 512 ちょうど', () => {
  it('water.set で 2000 マスを 起こす → 1 パスで 512。パスの ない ステップは 0', () => {
    const r = makeRig();
    carve(r.world, [3, 2, 3, 44, 6, 44], [4, 3, 4, 43, 5, 43]);
    let n = 0;
    outer: for (let y = 3; y <= 4; y++) {
      for (let z = 4; z <= 43; z++) {
        for (let x = 4; x <= 43; x++) {
          r.sys.set(x, y, z, 1);
          if (++n === 2000) break outer;
        }
      }
    }
    expect(r.sys.queue()).toBe(2000);
    r.work.start();
    r.pass(1);
    expect(r.work.read().water, '1 パスで 計算した マス').toBe(512);
    expect(r.sys.queue(), 'のこりは 次の パスの 頭から').toBeGreaterThanOrEqual(2000 - 512);
    // つぎの パスまで: パスの ない ステップは 計算 0
    let quiet = 0;
    for (let i = 0; i < 40; i++) {
      const p0 = r.sys.passes();
      const w0 = r.work.read().water;
      r.step(1);
      if (r.sys.passes() === p0) {
        quiet++;
        expect(r.work.read().water - w0, 'パスの ない ステップ').toBe(0);
      } else {
        expect(r.work.read().water - w0, '2 つ目の パスも 512 まで').toBeLessThanOrEqual(512);
      }
    }
    expect(quiet, 'パスの ない ステップが あった').toBeGreaterThan(10);
    r.work.stop();
  });
});

describe('AC12 仕事の数', () => {
  it('1 マスの 計算で 見る マスは 62 以下（下 1・自分 1・さがす 4×7×2・横 4）', () => {
    const r = makeRig();
    carve(r.world, [3, 2, 3, 40, 4, 40], [4, 3, 4, 39, 3, 39]);
    r.sys.set(21, 3, 21, 1); // 動かない 水（まわりは 7 マス 先まで 平ら）
    r.work.start();
    r.pass(1);
    expect(r.work.read().water, '計算した マス').toBe(1);
    expect(r.work.read().getBlock, '見た マス').toBeLessThanOrEqual(62);
    r.work.stop();
    expect(r.sys.amount(21, 3, 21), '動かなかった').toBe(1);
  });

  it('同じ 形の 水たまり 2 つ（はなす）で 止まる までの 計算は 1 つの ちょうど 2 倍', () => {
    const build = (ponds: number[]): number => {
      const r = makeRig();
      for (const x0 of [5, 30]) carve(r.world, [x0 - 1, 2, 10, x0 + 4, 4, 12], [x0, 3, 11, x0 + 3, 3, 11]);
      for (const x0 of ponds) r.sys.set(x0, 3, 11, 8);
      r.work.start();
      r.settle(60);
      const w = r.work.read().water;
      r.work.stop();
      expect(r.sys.queue()).toBe(0);
      return w;
    };
    const one = build([5]);
    const two = build([5, 30]);
    expect(one, '1 つ の 計算').toBeGreaterThan(0);
    expect(two).toBe(one * 2);
  });
});

describe('AC15（作り直し）: 1 パスで 作り直す セクションは 「量が かわった マスの いる セクション と ふちの となり」だけ。動かない ステップは 0（#255）', () => {
  it('列の 中ほどの みぞ → 1 パスで セクション 1 つ', () => {
    const r = makeRig();
    carve(r.world, [9, 2, 10, 14, 4, 12], [10, 3, 11, 13, 3, 11]);
    r.sys.set(10, 3, 11, 8);
    r.world.takeDirtySections();
    r.pass(1);
    expect(r.world.takeDirtySections()).toEqual([{ cx: 0, sy: 0, cz: 0 }]);
  });

  it('列の ふち（x = 14・15 / 16）を またぐ みぞ → となりの 列の セクションも', () => {
    const r = makeRig();
    carve(r.world, [13, 2, 10, 18, 4, 12], [14, 3, 11, 17, 3, 11]);
    r.sys.set(14, 3, 11, 8);
    r.world.takeDirtySections();
    r.pass(1);
    const got = r.world.takeDirtySections().map((s) => `${s.cx},${s.sy},${s.cz}`).sort();
    expect(got).toEqual(['0,0,0', '1,0,0']);
  });

  it('水が 動かない ステップ（止まったあと）は 作り直す セクション 0', () => {
    const r = makeRig();
    carve(r.world, [9, 2, 10, 14, 4, 12], [10, 3, 11, 13, 3, 11]);
    r.sys.set(10, 3, 11, 8);
    r.settle(40);
    r.world.takeDirtySections();
    r.step(90);
    expect(r.world.takeDirtySections()).toEqual([]);
  });
});

describe('窓口の ふるまい（§6.1）', () => {
  it('stable は 書かない: 流れの とちゅうは false、止まったら true。呼んでも 量・リスト・パスの 回数は かわらない', () => {
    const r = makeRig();
    carve(r.world, [9, 2, 10, 14, 4, 12], [10, 3, 11, 13, 3, 11]);
    const box: Box = [10, 3, 11, 13, 3, 11];
    r.sys.set(10, 3, 11, 8);
    expect(r.sys.stable(...box), '量 8 が はしに ある: 動く').toBe(false);
    const before = { a: amounts(r.sys, box), q: r.sys.queue(), p: r.sys.passes(), h: r.world.hash() };
    r.sys.stable(...box);
    expect({ a: amounts(r.sys, box), q: r.sys.queue(), p: r.sys.passes(), h: r.world.hash() }).toEqual(before);
    r.settle(40);
    expect(r.sys.stable(...box)).toBe(true);
  });

  it('amount は 水でも air でも ない マスで −1、air で 0。set は 0 で air', () => {
    const r = makeRig();
    carve(r.world, [9, 2, 9, 13, 5, 13], [11, 4, 11, 11, 4, 11]);
    expect(r.sys.amount(10, 4, 11)).toBe(-1);
    expect(r.sys.amount(11, 4, 11)).toBe(0);
    r.sys.set(11, 4, 11, 5);
    expect(r.sys.amount(11, 4, 11)).toBe(5);
    expect(r.world.getBlock(11, 4, 11)).toBe('water_5');
    r.sys.set(11, 4, 11, 8);
    expect(r.world.getBlock(11, 4, 11)).toBe('water');
    r.sys.set(11, 4, 11, 0);
    expect(r.world.getBlock(11, 4, 11)).toBe('air');
  });

  it('pause(true) の 間は パスを しない（リストは ためる）。pause(false) で また 進む', () => {
    const r = makeRig();
    carve(r.world, [9, 2, 10, 14, 4, 12], [10, 3, 11, 13, 3, 11]);
    r.sys.pause(true);
    r.sys.set(10, 3, 11, 8);
    const q = r.sys.queue();
    expect(q).toBeGreaterThan(0);
    r.step(200);
    expect(r.sys.amount(10, 3, 11), 'うごかない').toBe(8);
    expect(r.sys.queue()).toBe(q);
    expect(r.sys.passes(), 'パスの 回数も ふえない').toBe(0);
    r.sys.pause(false);
    r.step(60);
    expect(r.sys.passes()).toBeGreaterThan(0);
    r.settle(40);
    expect(amounts(r.sys, [10, 3, 11, 13, 3, 11])).toEqual([3, 2, 2, 1]);
  });

  it('waveTime は ステップ ÷ 60 秒（60 ステップで ちょうど 1）', () => {
    const r = makeRig();
    const t0 = r.sys.waveTime();
    r.step(60);
    expect(r.sys.waveTime() - t0).toBeCloseTo(1, 9);
    r.step(30);
    expect(r.sys.waveTime() - t0).toBeCloseTo(1.5, 9);
  });
});
