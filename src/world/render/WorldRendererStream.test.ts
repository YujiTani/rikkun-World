import { Mesh, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { ChunkColumn } from '../../contracts';
import { ChunkStream, type StreamIO } from '../stream/ChunkStream';
import { R_DRAW, R_DRAW_DROP, cheb } from '../stream/ring';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { WorldRenderer } from './WorldRenderer';

/** ストリーミングの つなぎ（ChunkStream → 光 → WorldRenderer）。平らな石の列。本当の時間にたよらない */
function flatColumn(cx: number, cz: number, h: ArrayVoxelWorld): ChunkColumn {
  const tmp = new ArrayVoxelWorld({ x: 16, z: 16, y: 32 });
  tmp.fill(0, 0, 0, 15, 5, 15, 'stone');
  void h;
  return { cx, cz, sections: tmp.column(0, 0)!.sections.slice() };
}

function make() {
  const w = new ArrayVoxelWorld({ x: 0, z: 0, y: 32 });
  const r = new WorldRenderer(w);
  r.enableStreaming();
  r.attach(new Scene());
  const saved = new Set<number>();
  const io: StreamIO = {
    generate: (cx, cz) => flatColumn(cx, cz, w),
    has: () => false,
    read: () => null,
    persistent: () => false,
    keep: () => undefined,
    canFlush: () => false,
    flush: () => undefined,
    writing: () => false,
    saving: () => false,
  };
  void saved;
  const stream = new ChunkStream({
    world: { loadColumn: (c) => w.loadColumn(c), unloadColumn: (cx, cz) => { r.noteUnloaded(cx, cz); return w.unloadColumn(cx, cz); }, column: (cx, cz) => w.column(cx, cz), isSaveDirty: (cx, cz) => w.isSaveDirty(cx, cz), requeueSaveDirty: (l) => w.requeueSaveDirty(l) },
    light: r.streamLight(),
    mesh: r.streamMesh(),
    io,
  });
  const view = (cx: number, cz: number) => r.setViewer(cx * 16 + 8, cz * 16 + 8);
  const run = (max = 3000) => {
    stream.setWork(6);
    for (let i = 0; i < max; i++) {
      r.update();
      stream.update();
      if (stream.ready && stream.queuedCount() === 0) {
        r.update();
        return i + 1;
      }
    }
    throw new Error('おわらない');
  };
  return { w, r, stream, view, run };
}

describe('ストリーミングのメッシュ', () => {
  it('開始: 半径 4 まで何かの絵（半径 2 は箱でよい）。小ブロックへの差しかえは ready のあと。描く輪の中だけ作り、仕事は 1 こずつ数える', () => {
    const { r, stream, view, run } = make();
    view(0, 0);
    stream.restart(0, 0, 'boot');
    expect(stream.ready).toBe(false);
    stream.setWork(6);
    for (let i = 0; i < 3000 && !stream.ready; i++) {
      r.update();
      stream.update();
    }
    expect(stream.ready).toBe(true);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) expect(r.streamMesh().columnState(dx, dz)).not.toBe('none');
    // ready の時点では 小ブロックへの差しかえが のこっている（開始のあと 予算の中で進む）
    expect(r.streamMesh().pendingJobs()).toBeGreaterThan(0);
    run();
    expect(stream.ready).toBe(true);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) expect(r.streamMesh().columnState(dx, dz)).toBe('true');
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) expect(r.streamMesh().columnState(dx, dz)).not.toBe('none');
    expect(r.streamMesh().pendingJobs()).toBe(0);
    expect(r.meshStats().pending).toBe(0);
    expect(r.meshStats().meshCount).toBeGreaterThan(0);
    // 光の輪の外 (8) は メッシュなし・光の外ふち 7 は 列はあるが 絵なし
    expect(r.sectionInfo(7, 0, 0).meshes).toBe(0);
    expect(r.sectionInfo(8, 0, 0).meshes).toBe(0);
  });

  it('LOD の列は、まわりのマスが変わって作り直し待ちの間も 前の LOD を見せていて、絵なしと数えない（VOX-D 基準 5 のゆれ）', () => {
    const { w, r, stream, view, run } = make();
    view(0, 0);
    stream.restart(0, 0, 'boot');
    run();
    // 列 4 は 距離 56（LOD）
    expect(r.sectionInfo(4, 0, 0).tier).toBe('lod');
    expect(r.streamMesh().columnState(4, 0)).toBe('true');
    w.setBlock(4 * 16 + 3, 6, 3, 'stone');
    r.update(); // 変わったマスを受けとる（LOD は ChunkStream の仕事で作り直す）
    expect(r.streamMesh().columnState(4, 0)).toBe('drawn');
    expect(stream.stageOf(4, 0)).toBe('meshed');
    run();
    expect(r.streamMesh().columnState(4, 0)).toBe('true');
  });

  it('同じ n なら 同じコマ数でそろう（機械の速さにたよらない）', () => {
    const a = make();
    a.view(0, 0);
    a.stream.restart(0, 0, 'boot');
    const b = make();
    b.view(0, 0);
    b.stream.restart(0, 0, 'boot');
    expect(a.run()).toBe(b.run());
  });

  it('歩いて中心が変わると 外の絵 (> 7) を捨て、内がわ (≤ 6) の新しい列を作る', () => {
    const { w, r, stream, view, run } = make();
    view(0, 0);
    stream.restart(0, 0, 'boot');
    run();
    const before = r.meshStats().meshCount;
    expect(before).toBeGreaterThan(0);
    // 西 (-6) の列は絵がある
    expect(r.streamMesh().columnState(-6, 0)).not.toBe('none');
    view(3, 0);
    stream.setCenter(3, 0);
    run();
    // -6 は 距離 9 → 絵を捨てた（列そのものは 距離 9 なので 残る）
    expect(r.sectionInfo(-6, 0, 0).meshes).toBe(0);
    // 距離 7 (-4) は 残る
    expect(r.streamMesh().columnState(-4, 0)).not.toBe('none');
    // 新しく入る東 (9) は 描く輪の中
    expect(cheb(9, 0, 3, 0)).toBe(R_DRAW);
    expect(r.streamMesh().columnState(9, 0)).not.toBe('none');
    expect(R_DRAW_DROP).toBe(7);
    // 捨てた列は stream が捨てる (距離 11 以上) と renderer の状態も無くなる
    view(8, 0);
    stream.setCenter(8, 0);
    run();
    expect(r.sectionInfo(-4, 0, 0).meshes).toBe(0);
    expect(w.column(-4, 0)).toBeUndefined();
  });

  it('プレイヤーが変えた所は 先に作り直す (距離 −1)', () => {
    const { w, r, stream, view, run } = make();
    view(0, 0);
    stream.restart(0, 0, 'boot');
    run();
    w.setBlock(5, 3, 5, 'air');
    r.update();
    expect(r.streamMesh().nextJobDist()).toBe(-1);
    stream.setWork(1);
    r.update();
    stream.update();
    r.update();
    expect(r.streamMesh().nextJobDist() === null || r.streamMesh().nextJobDist()! >= 0).toBe(true);
  });
});


// ------------------------------------------------------------ PERF-2（docs/tickets/PERF-2.md テスト 2）: 小ブロックの 1 セクションを 途中で止められる仕事に分ける

/** 呼ぶたびに 1 進む偽物の時計（コンストラクタの now に渡す。時間の単位 = now() を呼んだ回数） */
function fakeClock() {
  let t = 0;
  return { now: () => t++, peek: () => t };
}

const DEADLINE = 8;
/** 締め切りを過ぎても 進める 1 単位の分。偽物の時計で 数える（resume が now() を見る回数のゆとり） */
const OVERSHOOT = 3;

type Sliced = { w: ArrayVoxelWorld; r: WorldRenderer; clk: ReturnType<typeof fakeClock>; up: () => void; job: () => ReturnType<WorldRenderer['meshJobStats']> };

/** clock='time'・偽物の時計。半径 2 の列を光らせて 描く輪に入れる。分けるか（meshSlice）を選べる */
function makeSliced(clock: 'time' | 'count' = 'time', slice = true, edit?: (w: ArrayVoxelWorld) => void): Sliced {
  const clk = fakeClock();
  const w = new ArrayVoxelWorld({ x: 0, z: 0, y: 32 });
  const r = new WorldRenderer(w, undefined, clock, clk.now);
  if (!slice) r.config.meshSlice = false;
  r.enableStreaming();
  r.attach(new Scene());
  r.setRing(0, 0);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) w.loadColumn(flatColumn(dx, dz, w));
  edit?.(w);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) r.streamLight().lightColumn(dx, dz);
  r.streamMesh().allowUpgrades?.(true);
  return { w, r, clk, up: () => r.update(), job: () => r.meshJobStats() };
}

/** 1 回の runJob を 締め切り DEADLINE で呼ぶ。進めた時計の数を返す */
function runOnce(s: Sliced): { ticks: number; ran: boolean } {
  s.up();
  const t0 = s.clk.peek();
  const ran = s.r.streamMesh().runJob(t0 + DEADLINE);
  return { ticks: s.clk.peek() - t0, ran };
}

/** 小ブロックの仕事が 途中になるまで進める（途中 = meshJobStats().active がある） */
function runUntilActive(s: Sliced, max = 5000): { cx: number; sy: number; cz: number } {
  for (let i = 0; i < max; i++) {
    runOnce(s);
    const a = s.job().active;
    if (a !== null) return a;
  }
  throw new Error('途中の仕事にならない');
}

function runToEnd(s: Sliced, max = 20000): void {
  for (let i = 0; i < max; i++) {
    const { ran } = runOnce(s);
    if (!ran && s.r.pendingJobs() === 0 && s.job().active === null) return;
  }
  throw new Error('おわらない');
}

/** group のメッシュの 中身（位置・全 attribute・index のバイト）を まとめた 文字の一覧（古い順に依らない） */
function groupDigest(r: WorldRenderer): string[] {
  const out: string[] = [];
  r.group.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    let a = 0x811c9dc5;
    const feed = (arr: ArrayLike<number>) => {
      const u = new Uint8Array((arr as unknown as { buffer: ArrayBuffer }).buffer, (arr as unknown as { byteOffset: number }).byteOffset, (arr as unknown as { byteLength: number }).byteLength);
      for (let i = 0; i < u.length; i++) a = Math.imul(a ^ u[i], 0x01000193);
    };
    const g = o.geometry;
    for (const name of Object.keys(g.attributes).sort()) feed(g.attributes[name].array);
    if (g.index) feed(g.index.array);
    out.push(`${o.position.x},${o.position.y},${o.position.z}:${(a >>> 0).toString(16)}`);
  });
  return out.sort();
}

const inColumn = (r: WorldRenderer, cx: number, cz: number): number => {
  let n = 0;
  for (let sy = 0; sy < 2; sy++) n += r.sectionInfo(cx, sy, cz).meshes;
  return n;
};

describe('PERF-2 小ブロックの仕事を 分ける（clock=time・偽物の時計）', () => {
  it('歩く代わりに setRing を動かしながら 締め切り 8 で runJob を呼ぶと、1 回が進める時計の数は 締め切りを 1 単位より大きく超えない。本当に何回にも分かれる', () => {
    const s = makeSliced();
    let worst = 0;
    let split = 0;
    for (let step = 0; step < 400; step++) {
      // 輪の中心を 1 列ずつ動かす（歩く代わり）。外へ出た列は 捨てられ、また入ると 作り直される
      if (step % 40 === 0) s.r.setRing(Math.floor(step / 40) % 3, 0);
      const { ticks } = runOnce(s);
      worst = Math.max(worst, ticks);
      if (s.job().active !== null) split++;
    }
    runToEnd(s);
    expect(s.job().finished, '分けて作りおえた小ブロックの仕事').toBeGreaterThan(0);
    expect(s.job().slices, '何回にも分かれた').toBeGreaterThan(s.job().finished);
    expect(split, 'runJob のあと 途中のままの回').toBeGreaterThan(0);
    expect(worst, '1 回の runJob が進めた時計').toBeLessThanOrEqual(DEADLINE + OVERSHOOT);
  });

  it('途中でそのセクションに setBlock: できたあとも dirty が残って もう一度作られ、最後の絵は まっさらに作ったものと同じ', () => {
    const s = makeSliced();
    const a = runUntilActive(s);
    const bx = a.cx * 16 + 3;
    const bz = a.cz * 16 + 3;
    s.w.setBlock(bx, 7, bz, 'stone');
    const finishedBefore = s.job().finished;
    // 変わったマスを受けとる。この仕事は 古い中身で作っているので、できても dirty のまま
    s.up();
    expect(s.r.meshStats().pending, '作っている間も 順番待ちに のこる').toBeGreaterThan(0);
    runToEnd(s);
    expect(s.job().finished + s.job().cancelled, 'もう一度作られた').toBeGreaterThan(finishedBefore);
    // 外がわの列は 光の輪のふち（meshable でない）で queue に残るので、meshStats().pending ではなく 作る仕事が のこっていないかで見る
    expect(s.r.pendingJobs(), '作り直しが のこっていない').toBe(0);
    expect(s.job().active).toBeNull();
    const fresh = makeSliced('time', false, (w) => w.setBlock(bx, 7, bz, 'stone'));
    runToEnd(fresh);
    expect(groupDigest(s.r)).toEqual(groupDigest(fresh.r));
  });

  it('途中で列を捨てる（noteUnloaded）: 取りつけず、cancelled が 1 増える', () => {
    const s = makeSliced();
    const a = runUntilActive(s);
    const before = s.job().cancelled;
    s.w.unloadColumn(a.cx, a.cz);
    s.r.noteUnloaded(a.cx, a.cz);
    for (let i = 0; i < 30; i++) runOnce(s);
    expect(s.job().cancelled).toBe(before + 1);
    expect(inColumn(s.r, a.cx, a.cz), '捨てた列に メッシュが増えない').toBe(0);
    const act = s.job().active;
    expect(act === null || act.cx !== a.cx || act.cz !== a.cz).toBe(true);
  });

  it('途中で輪の外へ出る（setRing）: 取りつけず、cancelled が 1 増える', () => {
    const s = makeSliced();
    const a = runUntilActive(s);
    const before = s.job().cancelled;
    s.r.setRing(a.cx + 40, a.cz);
    for (let i = 0; i < 30; i++) runOnce(s);
    expect(s.job().cancelled).toBe(before + 1);
    expect(inColumn(s.r, a.cx, a.cz), '輪の外の列に メッシュが増えない').toBe(0);
  });

  it('途中で段が box に変わる（小ブロックの半径を 0 に）: 小ブロックを取りつけず、cancelled が 1 増える', () => {
    const s = makeSliced();
    const a = runUntilActive(s);
    const before = s.job().cancelled;
    const micro = s.r.sectionInfo(a.cx, a.sy, a.cz);
    s.r.config.microRadius = 0;
    s.up();
    for (let i = 0; i < 30; i++) runOnce(s);
    expect(s.r.sectionInfo(a.cx, a.sy, a.cz).tier, '箱の段').toBe('box');
    expect(s.job().cancelled).toBe(before + 1);
    expect(s.r.sectionInfo(a.cx, a.sy, a.cz).meshes, '小ブロックの分が まざらない').toBeLessThanOrEqual(micro.meshes);
  });

  it("clock='count' では slices が 0 のまま（今と同じ 1 回で作り切る道）", () => {
    const s = makeSliced('count');
    runToEnd(s);
    expect(s.r.meshStats().meshCount).toBeGreaterThan(0);
    expect(s.job().slices).toBe(0);
    expect(s.job().finished).toBe(0);
    expect(s.job().active).toBeNull();
  });
});
