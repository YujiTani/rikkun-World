import { afterEach, describe, expect, it } from 'vitest';
import type { ChunkColumn } from '../../contracts';
import { ChunkStream, type StreamIO, type StreamLight, type StreamMesh, type StreamWorld } from './ChunkStream';
import type { LayoutMesh, LayoutStream, RingCenter } from './layout';
import { DUO_TUNING } from '../../duo/tuning';
import { RING_FULL, RING_SMALL, canMesh, colKey, getRing, setRing, type RingSpec } from './ring';

/**
 * COOP-1 作業 2（#399）の 先行テスト（赤）。AC27（読みこみ側）・AC28: 遊んでいる 最中に 輪の 大きさ（ふだん ⇔ 小さい）と 中心の 数（1 ⇔ 2）を
 * 何度 かえても、読みこみ・光・メッシュが こわれず、描くはずの 列が ぜんぶ 描かれる。
 * つなぎ目の 約束: src/world/stream/layout.ts の 先頭（ChunkStream.setLayout と StreamMesh.setLayout）。
 * 偽の 世界・光・メッシュ・保存は ChunkStream.test.ts と 同じ やり方。判定の 距離は ここで 自前で 数える(RingLayout を 使わない)。
 */

const minCheb = (cs: readonly RingCenter[], cx: number, cz: number): number => Math.min(...cs.map((c) => Math.max(Math.abs(cx - c.cx), Math.abs(cz - c.cz))));
const unkey = (k: number) => ({ cx: Math.floor(k / 65536) - 32768, cz: (k % 65536) - 32768 });

function harness() {
  const cols = new Map<number, ChunkColumn>();
  const lit = new Set<number>();
  const meshed = new Set<number>();
  const log = { generated: [] as number[], dupLoads: 0, unloaded: 0 };
  let layout: { centers: readonly RingCenter[]; spec: RingSpec } = { centers: [{ cx: 0, cz: 0 }], spec: RING_FULL };
  let layoutCalls = 0;

  const world: StreamWorld = {
    loadColumn: (c) => {
      const k = colKey(c.cx, c.cz);
      if (cols.has(k)) log.dupLoads++;
      cols.set(k, c);
    },
    unloadColumn: (cx, cz) => {
      const k = colKey(cx, cz);
      lit.delete(k);
      meshed.delete(k);
      log.unloaded++;
      return cols.delete(k);
    },
    column: (cx, cz) => cols.get(colKey(cx, cz)),
    isSaveDirty: () => false,
    requeueSaveDirty: () => undefined,
  };
  const light: StreamLight = { lightColumn: (cx, cz) => void lit.add(colKey(cx, cz)) };
  const jobs = () => {
    const out: Array<{ cx: number; cz: number; d: number }> = [];
    for (const k of lit) {
      if (meshed.has(k)) continue;
      const { cx, cz } = unkey(k);
      const d = minCheb(layout.centers, cx, cz);
      if (d > layout.spec.draw || !canMesh((a, b) => lit.has(colKey(a, b)), cx, cz)) continue;
      out.push({ cx, cz, d });
    }
    out.sort((a, b) => a.d - b.d || a.cz - b.cz || a.cx - b.cx);
    return out;
  };
  const mesh: StreamMesh & LayoutMesh = {
    setRing: (cx, cz) => {
      // 1 つの 中心だけの 古い 口。setLayout が 来た あとは 使わない
      if (layoutCalls === 0) layout = { centers: [{ cx, cz }], spec: layout.spec };
    },
    setLayout: (centers, spec) => {
      layoutCalls++;
      layout = { centers, spec };
      for (const k of [...meshed]) {
        const { cx, cz } = unkey(k);
        if (minCheb(centers, cx, cz) > spec.drawDrop) meshed.delete(k);
      }
    },
    pendingJobs: () => jobs().length,
    nextJobDist: () => jobs()[0]?.d ?? null,
    runJob: () => {
      const j = jobs()[0];
      if (!j) return false;
      meshed.add(colKey(j.cx, j.cz));
      return true;
    },
    columnState: (cx, cz) => (meshed.has(colKey(cx, cz)) ? 'true' : 'none'),
  };
  const io: StreamIO = {
    generate: (cx, cz) => {
      log.generated.push(colKey(cx, cz));
      return { cx, cz, sections: [] };
    },
    has: () => false,
    read: () => null,
    persistent: () => true,
    keep: () => undefined,
    canFlush: () => true,
    flush: () => undefined,
    writing: () => false,
    saving: () => false,
  };
  let t = 0;
  const stream = new ChunkStream({ world, light, mesh, io, now: () => (t += 0.01) });
  const api = stream as unknown as ChunkStream & LayoutStream;
  return { stream, api, cols, lit, meshed, log, layoutCalls: () => layoutCalls };
}
type H = ReturnType<typeof harness>;

function settle(h: H, work = 16, max = 6000): number {
  h.stream.setWork(work);
  for (let i = 0; i < max; i++) {
    h.stream.update();
    if (h.stream.ready && h.stream.queuedCount() === 0) return i + 1;
  }
  return max;
}

/** 今の 輪と 中心で、あるべき 姿に なっているか(自前で 数える)。問題の 一覧を 返す(空 = 合格) */
function problems(h: H, centers: readonly RingCenter[], spec: RingSpec): string[] {
  const out: string[] = [];
  const pad = spec.keep + 3;
  const xs = centers.map((c) => c.cx);
  const zs = centers.map((c) => c.cz);
  for (let cx = Math.min(...xs) - pad; cx <= Math.max(...xs) + pad; cx++) {
    for (let cz = Math.min(...zs) - pad; cz <= Math.max(...zs) + pad; cz++) {
      const d = minCheb(centers, cx, cz);
      const k = colKey(cx, cz);
      if (d <= spec.gen && !h.cols.has(k)) out.push(`生成 ${cx},${cz} d${d} が ない`);
      if (d > spec.keep && h.cols.has(k)) out.push(`残す 輪の 外 ${cx},${cz} d${d} が のこっている`);
      if (d <= spec.light && !h.lit.has(k)) out.push(`光 ${cx},${cz} d${d} が ない`);
      if (d <= spec.draw && !h.meshed.has(k)) out.push(`描く ${cx},${cz} d${d} が 描かれていない`);
      if (d > spec.drawDrop && h.meshed.has(k)) out.push(`描く 輪の 外 ${cx},${cz} d${d} の 絵が のこっている`);
    }
  }
  if (h.log.dupLoads > 0) out.push(`同じ 列を 2 回 読みこんだ ${h.log.dupLoads} 回`);
  if (h.cols.size > DUO_TUNING.layoutMaxColumns) out.push(`持つ 列 ${h.cols.size} > ${DUO_TUNING.layoutMaxColumns}`);
  return out.slice(0, 5);
}

describe('AC28: 遊んでいる 最中の 輪の 切りかえ', () => {
  afterEach(() => setRing(RING_FULL));

  it('setLayout を 呼ぶと getRing() が 新しい 輪に なる(#203: 起動の 1 回だけ の 前提を 外す)', () => {
    const h = harness();
    h.stream.restart(0, 0, 'boot');
    settle(h);
    h.api.setLayout([{ cx: 0, cz: 0 }, { cx: 40, cz: 0 }], RING_SMALL);
    expect(getRing()).toBe(RING_SMALL);
    h.api.setLayout([{ cx: 0, cz: 0 }], RING_FULL);
    expect(getRing()).toBe(RING_FULL);
    expect(h.layoutCalls()).toBe(2); // メッシュ側にも つたわる
  });

  it('1 つ(ふだん) → 2 つ(小さい): 遠い 2P の まわりも 読みこみ・光・描く。1P の 輪は 小さくなる。重なりは なし', () => {
    const h = harness();
    h.stream.restart(0, 0, 'boot');
    expect(settle(h)).toBeLessThan(6000);
    expect(problems(h, [{ cx: 0, cz: 0 }], RING_FULL)).toEqual([]);
    const before = h.cols.size;
    const centers = [{ cx: 0, cz: 0 }, { cx: 40, cz: 0 }];
    h.api.setLayout(centers, RING_SMALL);
    let peak = h.cols.size;
    h.stream.setWork(16);
    for (let i = 0; i < 6000; i++) {
      h.stream.update();
      peak = Math.max(peak, h.cols.size);
      if (h.stream.queuedCount() === 0) break;
    }
    expect(problems(h, centers, RING_SMALL)).toEqual([]);
    // 1P の まわりは 前の 生成の 輪(半径 8 = 289 列)が 「残す」輪(半径 8)に 入るので のこる。2P の まわりは 生成の 輪(半径 6 = 169 列)
    expect(h.cols.size).toBe(289 + 169);
    expect(peak, '切りかえの とちゅうでも 上限').toBeLessThanOrEqual(DUO_TUNING.layoutMaxColumns);
    expect(before).toBe(289);
  });

  it('2 つ → 1 つ: 外に なった 列は 少しずつ 捨てる(1 コマで ぜんぶ 捨てない)。最後は 輪の 外が のこらない', () => {
    const h = harness();
    h.stream.restart(0, 0, 'boot');
    const two = [{ cx: 0, cz: 0 }, { cx: 40, cz: 0 }];
    h.api.setLayout(two, RING_SMALL);
    settle(h);
    expect(problems(h, two, RING_SMALL)).toEqual([]);
    const one = [{ cx: 0, cz: 0 }];
    h.api.setLayout(one, RING_FULL);
    const toDrop = [...h.cols.keys()].filter((k) => {
      const { cx, cz } = unkey(k);
      return minCheb(one, cx, cz) > RING_FULL.keep;
    }).length;
    expect(toDrop).toBeGreaterThan(100);
    const u0 = h.log.unloaded;
    h.stream.setWork(8);
    h.stream.update();
    const first = h.log.unloaded - u0;
    expect(first, '1 コマで ぜんぶ 捨てない').toBeLessThan(toDrop / 2);
    settle(h);
    expect(h.log.unloaded - u0).toBe(toDrop);
    expect(problems(h, one, RING_FULL)).toEqual([]);
  });

  it('何度 切りかえても(1⇔2・ふだん⇔小さい・中心も 動く)毎回 あるべき 姿に なる', () => {
    const h = harness();
    h.stream.restart(0, 0, 'boot');
    const plan: Array<[RingCenter[], RingSpec]> = [
      [[{ cx: 0, cz: 0 }], RING_FULL],
      [[{ cx: 0, cz: 0 }, { cx: 40, cz: 0 }], RING_SMALL],
      [[{ cx: 0, cz: 0 }], RING_FULL],
      [[{ cx: 0, cz: 0 }, { cx: 10, cz: 0 }], RING_SMALL], // 2 つの 輪が 重なる
      [[{ cx: 3, cz: 3 }], RING_FULL],
      [[{ cx: 3, cz: 3 }, { cx: 3, cz: 60 }], RING_SMALL],
      [[{ cx: 6, cz: 3 }, { cx: 3, cz: 30 }], RING_SMALL], // 歩いて 動く
      [[{ cx: 6, cz: 3 }], RING_SMALL], // 小さい 輪の まま 1 つ(E2E の ふだん)
      [[{ cx: 6, cz: 3 }], RING_FULL],
    ];
    for (const [centers, spec] of plan) {
      h.api.setLayout(centers, spec);
      settle(h);
      expect(problems(h, centers, spec), JSON.stringify(centers) + spec.draw).toEqual([]);
    }
  });

  it('仕事の とちゅうで 切りかえても(落ちつく 前に 次の 切りかえ)最後は あるべき 姿', () => {
    const h = harness();
    h.stream.restart(0, 0, 'boot');
    settle(h);
    const seq: Array<[RingCenter[], RingSpec]> = [
      [[{ cx: 0, cz: 0 }, { cx: 40, cz: 0 }], RING_SMALL],
      [[{ cx: 0, cz: 0 }], RING_FULL],
      [[{ cx: 0, cz: 0 }, { cx: 0, cz: 33 }], RING_SMALL],
      [[{ cx: 1, cz: 0 }, { cx: 0, cz: 33 }], RING_SMALL],
    ];
    for (const [centers, spec] of seq) {
      h.api.setLayout(centers, spec);
      h.stream.setWork(3);
      for (let i = 0; i < 7; i++) h.stream.update(); // 少しだけ 進めて 次へ
    }
    const [centers, spec] = seq[seq.length - 1]!;
    settle(h);
    expect(problems(h, centers, spec)).toEqual([]);
  });

  it('いまある 列を 作りなおさない(1 つ → 2 つ で 1P の まわりは そのまま)', () => {
    const h = harness();
    h.stream.restart(0, 0, 'boot');
    settle(h);
    const first = new Set(h.log.generated);
    expect(first.size).toBe(289);
    h.log.generated.length = 0;
    h.api.setLayout([{ cx: 0, cz: 0 }, { cx: 40, cz: 0 }], RING_SMALL);
    settle(h);
    for (const k of h.log.generated) expect(first.has(k), '1P の まわりの 列を 作りなおした').toBe(false);
    expect(h.log.generated).toHaveLength(169); // 2P の まわり(半径 6)だけ
  });
});
