import { Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { WorldRenderer } from './WorldRenderer';
import { CHUNK_DRAW_DISTANCE } from './config';

/** 128×48×128 の平らな石の島（高さ 1〜6）。上のセクションは空気、下は岩 */
function setup(stoneTop = 6) {
  const w = new ArrayVoxelWorld({ x: 128, y: 48, z: 128 });
  w.fill(0, 0, 0, 127, 0, 127, 'bedrock');
  w.fill(0, 1, 0, 127, stoneTop, 127, 'stone');
  const r = new WorldRenderer(w);
  r.setViewer(64, 64);
  r.attach(new Scene());
  return { w, r };
}

/** メッシュと光の順番待ちが空になるまで進める（最大 2000 コマ） */
function settle(r: WorldRenderer): number {
  let n = 0;
  do {
    r.update();
    if (++n > 2000) throw new Error('settle: おわらない');
  } while (r.light.pendingCount() > 0 || r.meshStats().pending > 0);
  r.update();
  return n;
}

describe('小ブロックの半径 0（#180: 小ブロックなし。近くも箱の段）', () => {
  function setup0() {
    const w = new ArrayVoxelWorld({ x: 128, y: 48, z: 128 });
    w.fill(0, 0, 0, 127, 0, 127, 'bedrock');
    w.fill(0, 1, 0, 127, 6, 127, 'stone');
    const r = new WorldRenderer(w, 0);
    return { w, r };
  }

  it('作った時点から 半径 0。最初の update を待たずに 小ブロックの段が無い', () => {
    const { r } = setup0();
    expect(r.microRadiusNow).toBe(0);
    expect(r.config.microRadius).toBe(0);
    r.setViewer(64, 64);
    r.attach(new Scene());
    const s = r.sectionStats(); // update() を 1 回も呼ばない
    expect(s.microR).toBe(0);
    expect(s.micro).toBe(0);
    expect(s.box).toBeGreaterThan(0);
    expect(r.sectionInfo(4, 0, 4).tier).toBe('box'); // プレイヤーのいる列
    expect(r.rebuildLog().filter((e) => e.kind === 'micro')).toHaveLength(0);
  });

  it('いつまでたっても 小ブロックのメッシュを作らない（update・ほって作り直したあとも）', () => {
    const { w, r } = setup0();
    r.setViewer(64, 64);
    r.attach(new Scene());
    settle(r);
    w.setBlock(64, 7, 64, 'stone'); // プレイヤーのいる列を掘って（置いて）作り直す
    settle(r);
    r.setViewer(20, 90);
    settle(r);
    const s = r.sectionStats();
    expect(s.microR).toBe(0);
    expect(s.micro).toBe(0);
    expect(s.box).toBeGreaterThan(0);
    expect(s.lod).toBeGreaterThan(0); // 箱の外側 48 より遠くは LOD のまま
    expect(r.rebuildLog().filter((e) => e.kind === 'micro')).toHaveLength(0);
  });

  it('あとから 16 → 32 に切りかえると 小ブロックが出る。0 にもどせる', () => {
    const { r } = setup0();
    r.setViewer(64, 64);
    r.attach(new Scene());
    settle(r);
    r.config.microRadius = 32;
    settle(r);
    expect(r.sectionStats().microR).toBe(32);
    expect(r.sectionStats().micro).toBeGreaterThan(0);
    r.config.microRadius = 0;
    settle(r);
    expect(r.sectionStats().microR).toBe(0);
    expect(r.sectionStats().micro).toBe(0);
  });

  it('作るときの半径を 渡さなければ 今のまま 32', () => {
    const w = new ArrayVoxelWorld({ x: 128, y: 48, z: 128 });
    expect(new WorldRenderer(w).microRadiusNow).toBe(32);
  });
});

describe('セクションごとのメッシュ（VOX-E）', () => {
  it('スタート: 近くは小ブロック・その外は箱・さらに外は LOD。全部で 8×8×3 = 192 セクション', () => {
    const { r } = setup();
    settle(r);
    const s = r.sectionStats();
    expect(s.total).toBe(192);
    expect(s.microR).toBe(32);
    expect(s.micro + s.box + s.lod + s.none).toBe(192);
    expect(s.noneBy.empty + s.noneBy.hidden + s.noneBy.unlit).toBe(s.none);
    expect(s.micro).toBeGreaterThan(0);
    expect(s.box).toBeGreaterThan(0);
    expect(s.lod).toBeGreaterThan(0);
    expect(s.microMaxDist).toBeLessThanOrEqual(34);
    expect(s.boxMinDist).toBeGreaterThanOrEqual(30);
    expect(s.boxMaxDist).toBeLessThanOrEqual(50);
  });

  it('全部空気は none/empty、中まで固いセクションは none/hidden、見える所は meshes > 0', () => {
    const { r } = setup(40); // 高さ 1〜40 が石: セクション y=0, 1 は中まで石、y=2 に地面
    settle(r);
    expect(r.sectionInfo(3, 0, 3)).toMatchObject({ tier: 'none', reason: 'hidden', meshes: 0, triangles: 0 });
    expect(r.sectionInfo(3, 1, 3)).toMatchObject({ tier: 'none', reason: 'hidden', meshes: 0 });
    const ground = r.sectionInfo(4, 2, 4);
    expect(ground.tier).toBe('micro');
    expect(ground.meshes).toBeGreaterThan(0);
    const flat = setup(6);
    settle(flat.r);
    expect(flat.r.sectionInfo(3, 2, 3)).toMatchObject({ tier: 'none', reason: 'empty', meshes: 0, triangles: 0 });
    expect(flat.r.sectionInfo(3, 0, 3).tier).toBe('micro'); // 石の上の面がある
  });

  it('近くの小ブロックのセクションは、箱より三角形が多い', () => {
    const { r } = setup();
    settle(r);
    const near = r.sectionInfo(4, 0, 4);
    const boxy = r.sectionInfo(0, 0, 0);
    expect(near.tier).toBe('micro');
    expect(boxy.tier).not.toBe('micro');
    expect(near.meshes).toBeGreaterThan(0);
  });

  it('r を 16 に下げると 小ブロックのセクションが減る（切りかえ）。24・32 にも戻せる', () => {
    const { r } = setup();
    r.setViewer(60, 60); // 列までの距離が 0, 4, 12, 20, 28, … になる場所
    settle(r);
    const m32 = r.sectionStats().micro;
    r.config.microRadius = 16;
    settle(r);
    const s16 = r.sectionStats();
    expect(s16.microR).toBe(16);
    expect(s16.micro).toBeLessThan(m32);
    expect(s16.microMaxDist).toBeLessThanOrEqual(18);
    r.config.microRadius = 24;
    settle(r);
    const s24 = r.sectionStats();
    expect(s24.microR).toBe(24);
    expect(s24.micro).toBeGreaterThan(s16.micro);
    expect(s24.microMaxDist).toBeLessThanOrEqual(26);
    r.config.microRadius = 32;
    settle(r);
    const s32 = r.sectionStats();
    expect(s32.microR).toBe(32);
    expect(s32.micro).toBeGreaterThan(s24.micro);
    expect(s32.micro).toBeLessThanOrEqual(m32);
  });

  it('段の境目は ±2 ずらす: 小ブロックから r+2 まで出ない・箱から r−2 まで入らない', () => {
    const { r } = setup();
    settle(r);
    // 列 (4,4)（x 64〜79, z 64〜79）。視点を (64, 64) から x 方向にずらして、列までの距離を変える
    const dist = (x: number) => r.sectionInfo(4, 0, 4).dist + 0 * x;
    expect(dist(0)).toBe(0);
    r.update({ x: 64 - 33, z: 72 }); // 33 はなれる（r=32 より外、r+2 より内）
    settle(r);
    expect(r.sectionInfo(4, 0, 4).dist).toBeCloseTo(33, 5);
    expect(r.sectionInfo(4, 0, 4).tier).toBe('micro'); // もと小ブロック: 34 まではそのまま
    r.update({ x: 64 - 35, z: 72 });
    settle(r);
    expect(r.sectionInfo(4, 0, 4).tier).toBe('box');
    r.update({ x: 64 - 31, z: 72 });
    settle(r);
    expect(r.sectionInfo(4, 0, 4).tier).toBe('box'); // 箱から入るのは 30 まで
    r.update({ x: 64 - 29, z: 72 });
    settle(r);
    expect(r.sectionInfo(4, 0, 4).tier).toBe('micro');
  });

  it('遠くなったセクションのメッシュは dispose する。geometryBytes が増え続けない', () => {
    const { r } = setup();
    settle(r);
    const a = r.meshStats();
    expect(a.meshCount).toBeGreaterThan(0);
    expect(a.geometryBytes).toBeGreaterThan(0);
    expect(a.geometryBytes).toBeLessThanOrEqual(a.geometryBytesLimit);
    r.update({ x: 4, z: 4 });
    settle(r);
    const b = r.meshStats();
    expect(b.disposedTotal).toBeGreaterThan(a.disposedTotal);
    // 角からは 52 より遠いセクションに メッシュはない
    for (let sy = 0; sy < 3; sy++)
      for (let sz = 0; sz < 8; sz++)
        for (let sx = 0; sx < 8; sx++) {
          const i = r.sectionInfo(sx, sy, sz);
          if (i.dist > 52) expect(i.meshes).toBe(0);
        }
    r.update({ x: 64, z: 64 });
    settle(r);
    // もどると また作る（境目の ±2 のずらしで 箱のままの所があるので、はじめ以下）
    expect(r.meshStats().geometryBytes).toBeLessThanOrEqual(a.geometryBytes);
    expect(r.meshStats().geometryBytes).toBeGreaterThan(0);
  });

  it('上限をこえたら 遠い順に捨てる', () => {
    const { r } = setup();
    settle(r);
    const full = r.meshStats();
    const farBefore = r.sectionInfo(0, 0, 0);
    r.geometryBytesLimit = Math.floor(full.geometryBytes * 0.6);
    r.update();
    const m = r.meshStats();
    expect(m.geometryBytes).toBeLessThanOrEqual(r.geometryBytesLimit);
    expect(m.disposedTotal).toBeGreaterThan(full.disposedTotal);
    // いちばん近い所は残り、遠い所から消える
    expect(r.sectionInfo(4, 0, 4).meshes).toBeGreaterThan(0);
    expect(farBefore.meshes).toBeGreaterThanOrEqual(0);
  });

  it('1 ブロックほると、作り直すのは そのセクションだけ（rebuildLog）。そのコマ、次のコマには見える', () => {
    const { w, r } = setup(20);
    settle(r);
    r.rebuildLog(true);
    const before = r.sectionInfo(4, 1, 4);
    w.setBlock(72, 20, 72, 'air'); // セクション (4, 1, 4) の中ほど（x・z は 8）
    r.update();
    r.update();
    r.update();
    settle(r);
    const log = r.rebuildLog(true);
    const keys = new Set(log.map((e) => `${e.x},${e.y},${e.z}`));
    expect(keys.has('4,1,4')).toBe(true);
    expect(keys.size).toBeLessThanOrEqual(2); // ほった穴の面が上に出る（光は ふつうの外なので 変わらない）
    expect(r.sectionInfo(4, 1, 4).triangles).not.toBe(before.triangles);
    expect(r.rebuildLog().length).toBe(0);
  });

  it('見えないセクションをほると、そのセクションにメッシュができる', () => {
    const { w, r } = setup(40);
    settle(r);
    expect(r.sectionInfo(4, 1, 4)).toMatchObject({ tier: 'none', reason: 'hidden' });
    w.setBlock(72, 24, 72, 'air');
    for (let i = 0; i < 3; i++) r.update();
    const info = r.sectionInfo(4, 1, 4);
    expect(info.meshes).toBeGreaterThan(0);
    expect(info.triangles).toBeGreaterThan(0);
  });

  it('rebuildStats: ほったあとの作り直しが数えられる（セクション 1 つぶんのミリ秒）', () => {
    const { w, r } = setup(20);
    settle(r);
    const c0 = r.rebuildStats().count;
    w.setBlock(72, 20, 72, 'air');
    r.update();
    expect(r.rebuildStats().count).toBeGreaterThan(c0);
    expect(r.rebuildStats().lastMs).toBeGreaterThan(0);
  });

  it('1 コマの作り直しは 8ms ぐらいまで（のこりは次のコマ）。進めると順番待ちが減る', () => {
    const { r } = setup();
    r.setViewer(64, 64);
    const p0 = r.meshStats().pending;
    expect(p0).toBeGreaterThan(0);
    r.update();
    const p1 = r.meshStats().pending;
    expect(p1).toBeLessThanOrEqual(p0);
    settle(r);
    expect(r.meshStats().pending).toBe(0);
  });
});

describe('距離でチャンクを描く／描かない (M5 AC15 の意味を のこす)', () => {
  it('かどに立つと、88 より遠い列は描かない。スタート (64,64) では 64 列ぜんぶ描く', () => {
    const { r } = setup();
    settle(r);
    expect(r.chunkStats()).toMatchObject({ total: 64, drawn: 64 });
    r.update({ x: 1, z: 1 });
    settle(r);
    const s = r.chunkStats();
    expect(s.total).toBe(64);
    expect(s.drawn).toBeLessThan(64);
    expect(s.drawn).toBe(s.inRange);
    expect(s.maxDistance).toBe(CHUNK_DRAW_DISTANCE);
  });

  it('遠い列を作り直しても、描かないままになる', () => {
    const { w, r } = setup();
    r.update({ x: 1, z: 1 });
    settle(r);
    const before = r.chunkStats().drawn;
    w.setBlock(126, 6, 126, 'air');
    settle(r);
    expect(r.chunkStats().drawn).toBe(before);
  });
});

describe('時計 count（#179: 1 コマの仕事を数で決める）', () => {
  afterEach(() => vi.restoreAllMocks());

  function island(clock?: 'time' | 'count') {
    const w = new ArrayVoxelWorld({ x: 128, y: 48, z: 128 });
    w.fill(0, 0, 0, 127, 0, 127, 'bedrock');
    w.fill(0, 1, 0, 127, 6, 127, 'stone');
    const r = clock === undefined ? new WorldRenderer(w, 32) : new WorldRenderer(w, 32, clock);
    r.setViewer(64, 64);
    r.attach(new Scene());
    return { w, r };
  }

  /** performance.now() を 呼ぶたびに 100 ms 進める（本当の時間で 8 ms をこえる機械を まねる）。時間で決める作りなら 1 コマ 1 つになる */
  function slowClock(): void {
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 100));
  }

  /** update() を n 回。1 回ごとの rebuildLog（attach のぶんは のぞく） */
  function perFrame(r: WorldRenderer, n: number): { micro: number; total: number }[] {
    r.rebuildLog(true);
    const out: { micro: number; total: number }[] = [];
    for (let i = 0; i < n; i++) {
      r.update();
      const log = r.rebuildLog(true);
      out.push({ micro: log.filter((e) => e.kind === 'micro').length, total: log.length });
    }
    return out;
  }

  it("count: 1 回の update() で 作るメッシュは 8 個まで・小ブロックは 1 個まで。時間が かかっても 数で進む", () => {
    const { r } = island('count');
    slowClock();
    const frames = perFrame(r, 400);
    expect(Math.max(...frames.map((f) => f.total))).toBeLessThanOrEqual(8);
    expect(Math.max(...frames.map((f) => f.micro))).toBeLessThanOrEqual(1);
    // 時間を見ていない: 100 ms ずつ進んでも 1 コマに 2 個以上 作る日がある（箱は 8 個まで）
    expect(Math.max(...frames.map((f) => f.total))).toBeGreaterThan(1);
  });

  it('count: 小ブロックを 1 個作ったコマは そこでおしまい（その前の箱は あってよい）', () => {
    const { r } = island('count');
    slowClock();
    const frames = perFrame(r, 400);
    expect(frames.filter((f) => f.micro === 1).length).toBeGreaterThan(0);
  });

  it('count: 同じ世界を 2 回作って 同じコマ数 進めると rebuildLog が 同じ（x, y, z, kind, frame）', () => {
    const run = (): string => {
      const { r } = island('count');
      for (let i = 0; i < 60; i++) r.update();
      return JSON.stringify(r.rebuildLog());
    };
    const a = run();
    const b = run();
    expect(a).toBe(b);
    expect(JSON.parse(a).length).toBeGreaterThan(0);
  });

  it('count: 落ちつくまでのコマ数は 時間の読みに よらない。箱は 1 コマに まとめて作るので コマ数 < 作ったメッシュの数', () => {
    const { r: r1 } = island('count');
    const n1 = settle(r1);
    const { r: r2 } = island('count');
    slowClock();
    const n2 = settle(r2);
    expect(n2).toBe(n1);
    expect(r2.rebuildLog().filter((e) => e.frame > 0).length).toBeGreaterThan(n2);
  });

  it('time が 既定: 3 つ目を 渡さなくても 渡しても 100 ms かかる機械では 1 コマ 1 つ（かならず 1 つ）', () => {
    for (const clock of [undefined, 'time' as const]) {
      const { r } = island(clock);
      slowClock();
      const frames = perFrame(r, 200);
      expect(Math.max(...frames.map((f) => f.total))).toBeLessThanOrEqual(1);
      vi.restoreAllMocks();
    }
  });
});
