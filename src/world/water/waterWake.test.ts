import { describe, expect, it } from 'vitest';
import { SEA_Y, WORLD_HEIGHT } from '../../contracts';
import { packColumn, unpackColumn } from '../../save/backend';
import { encodeSections } from '../../save/chunkCodec';
import { generateChunk } from '../gen/chunk';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { attach, carve, makeRig, type Box, type Rig } from './waterTestKit';

/**
 * WATER-1（docs/design/WATER-1.md §4.3・§6）の ユニット: AC10（起きる・眠る）・AC13（読みこみ・手放す）。
 * 「保存」は 本物の 列の 書き出し（`packColumn`・`encodeSections`）と 読み直し（`unpackColumn`）を 通す。
 * 実装の まえに 書いた テスト（`waterSystem.ts` が まだ 無いので 落ちるのが 正しい）。
 */

describe('AC10 起きる・眠る（生成の 海）', () => {
  /** 海の ある 4 列（シード 7。cx −8〜−7・cz −8〜−7）を 生成して 読みこむ。生成の 水は 眠った まま */
  function seaRig(): Rig {
    const r = attach(new ArrayVoxelWorld({ x: 0, y: WORLD_HEIGHT, z: 0 }));
    for (const [cx, cz] of [[-8, -8], [-7, -8], [-8, -7], [-7, -7]]) {
      r.world.loadColumn(generateChunk(7, cx, cz));
      r.sys.onColumnLoaded(cx, cz, 'generated');
    }
    return r;
  }

  /** 水の マスの 横に ある 水で ない ブロック（海の となりの 石・砂 など）を さがす */
  function shore(r: Rig): { dig: [number, number, number]; water: [number, number, number] } {
    for (let y = SEA_Y; y >= SEA_Y - 10; y--) {
      for (let z = -128; z < -96; z++) {
        for (let x = -128; x < -96; x++) {
          if (r.world.getBlock(x, y, z) !== 'water') continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const id = r.world.getBlock(x + dx, y, z + dz);
            if (id !== 'outside' && id !== 'air' && id !== 'water' && r.world.isSolid(x + dx, y, z + dz)) return { dig: [x + dx, y, z + dz], water: [x, y, z] };
          }
        }
      }
    }
    throw new Error('海の となりの 固い ブロックが 見つからない');
  }

  it('生成の 海は 眠った まま（読みこんだ だけでは queue() === 0）。となりの ブロックを 掘ると その ステップで queue() > 0', () => {
    const r = seaRig();
    expect(r.sys.queue(), '生成の 水は 眠る').toBe(0);
    const s = shore(r);
    expect(r.world.getBlock(...s.water)).toBe('water');
    r.world.setBlock(...s.dig, 'air');
    expect(r.sys.queue(), '掘った その ステップで 起きる').toBeGreaterThan(0);
  });

  it('queue() === 0 に なって から 何もしない 600 ステップでは work.read().water が ふえない（海は 勝手に 動かない）', () => {
    const r = seaRig();
    r.settle(20);
    expect(r.sys.queue()).toBe(0);
    r.work.start();
    r.step(600);
    expect(r.work.read().water, '600 ステップの あいだに 計算した マス').toBe(0);
    r.work.stop();
  });

  it('海の となりを 掘ると 海から 流れこむ。合計は へらない（掘った 穴ぶん 海の 水面が 少し さがる）', () => {
    const r = seaRig();
    const s = shore(r);
    const [x, y, z] = s.dig;
    const box: Box = [x - 6, y - 3, z - 6, x + 6, y + 3, z + 6];
    const before = r.sys.total(...box);
    r.world.setBlock(...s.dig, 'air');
    r.settle(200);
    expect(r.sys.amount(...s.dig), '掘った マスに 水が 入った').toBeGreaterThan(0);
    // 掘った 穴の 中身は 周りの 海から 来る。箱の 外へ 出入りする 分が あるので、へって いない ことだけ 見る
    expect(r.sys.total(...box)).toBeGreaterThanOrEqual(before - 8);
  });
});

/** 列の 書き出し（保存）。本物の 保存と 同じ 道: encodeSections → packColumn → unpackColumn */
async function snapshot(world: ArrayVoxelWorld, only?: Array<[number, number]>) {
  const recs = [];
  const n = Math.ceil(world.size.y / 16);
  for (const { cx, cz } of world.loadedColumns()) {
    if (only && !only.some(([a, b]) => a === cx && b === cz)) continue;
    const col = world.column(cx, cz)!;
    recs.push(await packColumn(cx, cz, encodeSections(col.sections), 4, n));
  }
  return recs;
}
type Recs = Awaited<ReturnType<typeof snapshot>>;

/** 保存から 読み直した 世界（列を 1 つずつ 読み、水の 係に 'saved' か 'generated' と 知らせる） */
async function load(recs: Recs, height: number, how: 'saved' | 'generated' = 'saved'): Promise<Rig> {
  const r = attach(new ArrayVoxelWorld({ x: 0, y: height, z: 0 }));
  await loadMore(r, recs, how);
  return r;
}
async function loadMore(r: Rig, recs: Recs, how: 'saved' | 'generated'): Promise<void> {
  for (const rec of recs) {
    r.world.loadColumn(await unpackColumn(rec, Math.ceil(r.world.size.y / 16)));
    r.sys.onColumnLoaded(rec.cx, rec.cz, how);
  }
}

describe('AC13 読みこみ（§4.3。主な 道 loadColumn の 話）', () => {
  /** 流れの とちゅう: 列 (0,0)・(1,0) を またぐ 広い 床の 水と、列 (2,2) の みぞの 水。どちらも 1 パスだけ 進めた */
  function flowing(): { r: Rig; boxes: Box[]; total: number } {
    const r = makeRig({ x: 48, y: 40, z: 48 });
    carve(r.world, [4, 2, 4, 26, 4, 26], [5, 3, 5, 25, 3, 25]);
    carve(r.world, [33, 2, 39, 38, 4, 41], [34, 3, 40, 37, 3, 40]);
    r.sys.set(15, 3, 15, 8); // 列 (0,0) と (1,0) の さかい（x = 15 | 16）
    r.sys.set(34, 3, 40, 8);
    r.pass(1);
    expect(r.sys.queue(), '流れの とちゅう').toBeGreaterThan(0);
    const boxes: Box[] = [[5, 3, 5, 25, 3, 25], [34, 3, 40, 37, 3, 40]];
    return { r, boxes, total: r.sys.total(...boxes[0]) + r.sys.total(...boxes[1]) };
  }

  it('(a) 流れの とちゅうで 列を 保存 → 読み直し → 動く かも しれない 水が ぜんぶ リストに あり、止まる。合計 同じ', async () => {
    const { r, boxes, total } = flowing();
    expect(total).toBe(16);
    const d = await load(await snapshot(r.world), r.world.size.y);
    // 動く かも しれない 水 = 1 マスずつ 計算し直して 動く マス
    let movable = 0;
    for (const b of boxes) {
      for (let z = b[2]; z <= b[5]; z++) for (let x = b[0]; x <= b[3]; x++) if (d.sys.amount(x, 3, z) > 0 && !d.sys.stable(x, 3, z, x, 3, z)) movable++;
    }
    expect(movable, '動く かも しれない 水が ある').toBeGreaterThan(0);
    expect(d.sys.queue(), '動く かも しれない 水は ぜんぶ リストに ある').toBeGreaterThanOrEqual(movable);
    d.settle(100);
    for (const b of boxes) expect(d.sys.stable(...b), '止まった（取りこぼし なし）').toBe(true);
    expect(d.sys.queue()).toBe(0);
    expect(d.sys.total(...boxes[0]) + d.sys.total(...boxes[1]), '合計 同じ').toBe(total);
  });

  it('(b) 同じ 保存を 2 回 読んで 同じ 操作 → 同じ 形', async () => {
    const { r } = flowing();
    const recs = await snapshot(r.world);
    const a = await load(recs, r.world.size.y);
    const b = await load(recs, r.world.size.y);
    for (const d of [a, b]) {
      d.world.setBlock(8, 3, 15, 'stone');
      d.pass(2);
      d.world.setBlock(21, 3, 15, 'stone');
      d.settle(100);
    }
    expect(a.world.hash()).toBe(b.world.hash());
    expect(a.sys.passes()).toBe(b.sys.passes());
  });

  it('(c) 横が 空きの 量 8 は 起きる。6 方が 量 8 の 水か 石の 量 8 は 起きない', async () => {
    // 空きに 面した 量 8（床の 上に ぽつんと 1 つ）
    const open = makeRig();
    carve(open.world, [8, 2, 8, 14, 4, 14], [9, 3, 9, 13, 3, 13]);
    open.sys.set(11, 3, 11, 8);
    open.sys.pause(true);
    const wakes = await load(await snapshot(open.world), open.world.size.y);
    expect(wakes.sys.queue(), '横が 空きの 量 8').toBeGreaterThan(0);
    // 水と 石に つつまれた 量 8（石の 箱の 中に 水を つめた）
    const packed = makeRig();
    packed.world.fill(8, 2, 8, 14, 8, 14, 'stone');
    packed.world.fill(9, 3, 9, 13, 7, 13, 'water');
    const sleeps = await load(await snapshot(packed.world), packed.world.size.y);
    expect(sleeps.sys.total(9, 3, 9, 13, 7, 13)).toBe(5 * 5 * 5 * 8);
    expect(sleeps.sys.queue(), '6 方が 量 8 の 水か 石').toBe(0);
  });

  it('(c) さかい: 保存から 読んだ 列の さかいの 動く かも しれない 水は 起きる。新しく 作った 列の 中と 生成の 側は 起こさない', async () => {
    // 列 A (0,0) の 東の はし (x = 15) の 水 8。東（x = 16）が 読みこまれる まえは 石 あつかいで 動かない
    const scene = makeRig({ x: 32, y: 40, z: 16 });
    carve(scene.world, [0, 2, 6, 15, 4, 10], [1, 3, 7, 15, 3, 9]); // ろうか: A の 中だけ
    scene.world.fill(0, 3, 7, 0, 3, 9, 'stone');
    scene.world.fill(1, 3, 7, 14, 3, 9, 'stone');
    scene.world.fill(15, 3, 8, 15, 3, 8, 'air');
    scene.world.fill(15, 3, 7, 15, 3, 7, 'stone');
    scene.world.fill(15, 3, 9, 15, 3, 9, 'stone');
    scene.sys.set(15, 3, 8, 8);
    // 列 B (1,0) = 東となり。空きの 床（x = 16 から ひらけている）
    const east = makeRig({ x: 32, y: 40, z: 16 });
    east.world.fill(16, 2, 0, 31, 2, 15, 'stone');
    const aRec = await snapshot(scene.world, [[0, 0]]);
    const bRec = await snapshot(east.world, [[1, 0]]);

    // A を 保存から 読む（B は まだ ない）→ 動かない（東は 読みこんで いない）
    const afterA = await load(aRec, 40, 'saved');
    expect(afterA.sys.queue(), '東が 読みこまれる まえは 動かない').toBe(0);
    // B を 新しく 作って 読む → A の さかいの 水（保存の 側）が 起きる
    await loadMore(afterA, bRec, 'generated');
    expect(afterA.sys.queue(), '保存から 読んだ 列の さかいの 動く かも しれない 水').toBeGreaterThan(0);
    afterA.settle(60);
    expect(afterA.sys.stable(0, 3, 0, 31, 3, 15)).toBe(true);
    expect(afterA.sys.total(0, 3, 0, 31, 3, 15)).toBe(8);

    // 逆: A を 生成の 列として 読み、B を 読んでも 生成の 側の 水は 起こさない
    const gen = await load(aRec, 40, 'generated');
    await loadMore(gen, bRec, 'saved');
    expect(gen.sys.queue(), '生成の 側は 眠った まま').toBe(0);
  });

  it('(d) 列を 手放すと その 列の マスが リストから 消える（のこりの 列の 分は のこる）', () => {
    const r = makeRig({ x: 48, y: 40, z: 48 });
    carve(r.world, [4, 2, 4, 9, 4, 6], [5, 3, 5, 8, 3, 5]);
    carve(r.world, [36, 2, 36, 41, 4, 38], [37, 3, 37, 40, 3, 37]);
    r.sys.set(5, 3, 5, 8); // 列 (0,0)
    r.sys.set(37, 3, 37, 8); // 列 (2,2)
    const both = r.sys.queue();
    expect(both).toBe(2);
    expect(r.world.unloadColumn(0, 0)).toBe(true);
    r.sys.onColumnUnloaded(0, 0);
    expect(r.sys.queue(), '列 (0,0) の 分が 消えた').toBe(1);
    r.step(120); // 手放した 列の マスを 計算しに いかない（例外が 出ない）
    r.settle(40);
    expect(r.sys.queue()).toBe(0);
    expect(r.sys.total(37, 3, 37, 40, 3, 37), 'のこりの 列の 水は 止まる').toBe(8);
    expect(r.world.unloadColumn(2, 2)).toBe(true);
    r.sys.onColumnUnloaded(2, 2);
    expect(r.sys.queue()).toBe(0);
  });
});
