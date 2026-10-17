import { describe, expect, it } from 'vitest';
import type { ChunkColumn } from '../../contracts';
import {
  ChunkStream,
  START_JOBS,
  type StreamIO,
  type StreamLight,
  type StreamMesh,
  type StreamWorld,
} from './ChunkStream';
import { R_DRAW, R_DRAW_DROP, R_GEN, R_KEEP, R_LIGHT, canLight, canMesh, cheb, colKey, compareNear, ringColumns, ringCount } from './ring';

/** 偽の世界・光・メッシュ・保存。three も本当の時間も使わない（rule #130） */
function harness(opts: { saved?: Array<[number, number]>; broken?: Array<[number, number]>; async?: boolean; holdLight?: (cx: number, cz: number) => boolean; required?: () => Array<{ cx: number; cz: number }> } = {}) {
  const cols = new Map<number, ChunkColumn>();
  const dirty = new Set<number>();
  const lit = new Set<number>();
  const meshed = new Set<number>();
  const saved = new Map<number, ChunkColumn>();
  const broken = new Set<number>();
  for (const [x, z] of opts.saved ?? []) saved.set(colKey(x, z), { cx: x, cz: z, sections: [] });
  for (const [x, z] of opts.broken ?? []) broken.add(colKey(x, z));
  const log = { generated: [] as number[][], read: [] as number[][], readAll: 0, flushes: 0, lightOrder: [] as number[][] };
  const state = { fail: false, center: { cx: 0, cz: 0 }, requeued: [] as number[][] };

  const world: StreamWorld = {
    loadColumn: (c) => void cols.set(colKey(c.cx, c.cz), c),
    unloadColumn: (cx, cz) => {
      const k = colKey(cx, cz);
      lit.delete(k);
      meshed.delete(k);
      return cols.delete(k);
    },
    column: (cx, cz) => cols.get(colKey(cx, cz)),
    isSaveDirty: (cx, cz) => dirty.has(colKey(cx, cz)),
    requeueSaveDirty: (list) =>
      list.forEach((p) => {
        dirty.add(colKey(p.cx, p.cz));
        state.requeued.push([p.cx, p.cz]);
      }),
  };
  const light: StreamLight = {
    lightColumn: (cx, cz) => {
      lit.add(colKey(cx, cz));
      log.lightOrder.push([cx, cz]);
    },
  };
  const jobs = (): Array<{ cx: number; cz: number; d: number }> => {
    const out: Array<{ cx: number; cz: number; d: number }> = [];
    for (let dz = -R_DRAW; dz <= R_DRAW; dz++) {
      for (let dx = -R_DRAW; dx <= R_DRAW; dx++) {
        const cx = state.center.cx + dx;
        const cz = state.center.cz + dz;
        const k = colKey(cx, cz);
        if (meshed.has(k) || !lit.has(k) || !canMesh((a, b) => lit.has(colKey(a, b)), cx, cz)) continue;
        out.push({ cx, cz, d: cheb(cx, cz, state.center.cx, state.center.cz) });
      }
    }
    out.sort((a, b) => compareNear(state.center.cx, state.center.cz, a, b));
    return out;
  };
  const mesh: StreamMesh = {
    setRing: (cx, cz) => {
      state.center = { cx, cz };
      for (const k of [...meshed]) {
        const x = Math.floor(k / 65536) - 32768;
        const z = (k % 65536) - 32768;
        if (cheb(x, z, cx, cz) > R_DRAW_DROP) meshed.delete(k);
      }
    },
    pendingJobs: () => jobs().length,
    nextJobDist: () => jobs()[0]?.d ?? null,
    runJob: () => {
      const j = jobs()[0];
      if (j === undefined) return false;
      meshed.add(colKey(j.cx, j.cz));
      return true;
    },
    columnState: (cx, cz) => (meshed.has(colKey(cx, cz)) ? 'true' : 'none'),
  };
  const io: StreamIO = {
    generate: (cx, cz) => {
      log.generated.push([cx, cz]);
      return { cx, cz, sections: [] };
    },
    has: (cx, cz) => saved.has(colKey(cx, cz)),
    read: (cx, cz) => {
      log.read.push([cx, cz]);
      const k = colKey(cx, cz);
      const r = broken.has(k) ? null : (saved.get(k) ?? null);
      return opts.async ? Promise.resolve(r) : r;
    },
    persistent: () => true,
    keep: () => undefined,
    canFlush: () => true,
    flush: () => {
      log.flushes++;
      if (state.fail) return;
      for (const k of [...dirty]) {
        const c = cols.get(k);
        if (c !== undefined) saved.set(k, c);
        dirty.delete(k);
      }
    },
    writing: () => false,
    saving: () => false,
  };
  let t = 0;
  const stream = new ChunkStream({ world, light, mesh, io, now: () => (t += 0.01), holdLight: opts.holdLight, required: opts.required });
  return { stream, cols, dirty, lit, meshed, saved, log, state };
}

function settle(h: ReturnType<typeof harness>, max = 4000): number {
  h.stream.setWork(8);
  for (let i = 0; i < max; i++) {
    h.stream.update();
    if (h.stream.ready && h.stream.queuedCount() === 0) return i + 1;
  }
  return max;
}

const CENTERS: Array<[number, number]> = [
  [0, 0],
  [-313, -313],
  [1874, -1875],
];

describe('輪の数（基準 1）', () => {
  for (const [pcx, pcz] of CENTERS) {
    it(`中心 (${pcx}, ${pcz}) で 生成 289・光 225・描く 169、持つのは 441 まで`, () => {
      expect(ringColumns(pcx, pcz, R_GEN)).toHaveLength(289);
      expect(ringColumns(pcx, pcz, R_LIGHT)).toHaveLength(225);
      expect(ringColumns(pcx, pcz, R_DRAW)).toHaveLength(169);
      expect(ringCount(R_KEEP)).toBe(441);
      const h = harness();
      h.stream.restart(pcx, pcz, 'boot');
      settle(h);
      const around = (r: number, set: { has(k: number): boolean }) => ringColumns(pcx, pcz, r).filter((p) => set.has(colKey(p.cx, p.cz))).length;
      expect(h.cols.size).toBe(289);
      expect(around(R_GEN, h.cols as unknown as { has(k: number): boolean })).toBe(289);
      expect(h.lit.size).toBe(225);
      expect(h.meshed.size).toBe(169);
    });
  }

  it('9〜10 は残し、11 以上は捨てる', () => {
    const h = harness();
    h.stream.restart(0, 0, 'boot');
    settle(h);
    h.stream.setCenter(2, 0); // 東へ 2 列。西のはし(-8) は距離 10 になって残る
    settle(h);
    expect(h.cols.has(colKey(-8, 0))).toBe(true);
    h.stream.setCenter(3, 0); // 西のはし(-8) は距離 11 → 捨てる
    settle(h);
    expect(h.cols.has(colKey(-8, 0))).toBe(false);
    expect(h.cols.has(colKey(-7, 0))).toBe(true); // 距離 10
    for (const k of h.cols.keys()) {
      const x = Math.floor(k / 65536) - 32768;
      const z = (k % 65536) - 32768;
      expect(cheb(x, z, 3, 0)).toBeLessThanOrEqual(R_KEEP);
    }
    expect(h.cols.size).toBeLessThanOrEqual(ChunkStream.MAX);
    // 描く輪の外 (>7) のメッシュは捨て、7 は残す
    expect(h.meshed.has(colKey(-4, 0))).toBe(true); // 距離 7
    expect(h.meshed.has(colKey(-5, 0))).toBe(false); // 距離 8
  });
});

describe('近い順（基準 2・S3）', () => {
  it('同じ中心なら いつも同じ並びで、近い順', () => {
    const a = ringColumns(5, -7, R_GEN);
    const b = ringColumns(5, -7, R_GEN);
    expect(a).toEqual(b);
    expect(a[0]).toEqual({ cx: 5, cz: -7 });
    for (let i = 1; i < a.length; i++) expect(compareNear(5, -7, a[i - 1], a[i])).toBeLessThan(0);
    // 距離が同じなら ユークリッドが近い方が先、それも同じなら cz → cx
    const e = ringColumns(0, 0, 2).map((p) => `${p.cx},${p.cz}`);
    expect(e.slice(0, 9)).toEqual(['0,0', '0,-1', '-1,0', '1,0', '0,1', '-1,-1', '1,-1', '-1,1', '1,1']);
  });

  it('作る順番も その並び（生成は近い順）', () => {
    const h = harness();
    h.stream.restart(0, 0, 'boot');
    h.stream.setWork(1);
    for (let i = 0; i < 60; i++) h.stream.update();
    const gen = h.log.generated.map(([cx, cz]) => ({ cx, cz }));
    expect(gen.length).toBeGreaterThan(20);
    for (let i = 1; i < gen.length; i++) expect(cheb(gen[i].cx, gen[i].cz, 0, 0)).toBeGreaterThanOrEqual(cheb(gen[i - 1].cx, gen[i - 1].cz, 0, 0));
  });
});

describe('段の条件（基準 3・S1・S2）', () => {
  it('となりを 1 つぬくと 光もメッシュも だめ', () => {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const skip = colKey(10 + dx, 10 + dz);
        const ok = (a: number, b: number) => colKey(a, b) !== skip;
        expect(canLight(ok, 10, 10)).toBe(false);
        expect(canMesh(ok, 10, 10)).toBe(false);
      }
    }
    expect(canLight(() => true, 10, 10)).toBe(true);
    expect(canMesh(() => true, 10, 10)).toBe(true);
  });

  it('光を止めた列のとなりは 光らない（stream の中でも）', () => {
    const h = harness({ holdLight: (cx, cz) => cx === 1 && cz === 1 });
    h.stream.restart(0, 0, 'boot');
    h.stream.setWork(8);
    for (let i = 0; i < 300; i++) h.stream.update();
    expect(h.lit.has(colKey(1, 1))).toBe(false);
    expect(h.lit.has(colKey(0, 0))).toBe(true); // 自分は光る (止めたのは (1,1) だけ。生成はされている)
    // メッシュは となり 8 列の光が いる → (1,1) の まわり 9 列はメッシュなし
    for (let dz = 0; dz <= 2; dz++) for (let dx = 0; dx <= 2; dx++) expect(h.meshed.has(colKey(dx, dz))).toBe(false);
    expect(h.meshed.has(colKey(-1, -1))).toBe(true);
  });
});

describe('開始の条件（基準 4）', () => {
  it('そろうまで ready=false。p は 0〜1 で ふえるだけ。p=1 と ready は同じコマ', () => {
    const h = harness();
    h.stream.restart(0, 0, 'boot');
    h.stream.setWork(3);
    let prev = 0;
    let readyAt = -1;
    let oneAt = -1;
    for (let i = 0; i < 600; i++) {
      h.stream.update();
      const p = h.stream.progress;
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
      if (p >= 1 && oneAt < 0) oneAt = i;
      if (h.stream.ready && readyAt < 0) readyAt = i;
      if (!h.stream.ready) expect(p).toBeLessThan(1);
    }
    expect(readyAt).toBeGreaterThan(0);
    expect(readyAt).toBe(oneAt);
    expect(START_JOBS).toBe(371);
  });

  it('保険の列 (K6) は 輪の外でも 開始の前に読みこむ。そろってから ready。そのあと輪の外なら捨てる', () => {
    const h = harness({ required: () => [{ cx: 100, cz: 100 }] });
    h.stream.restart(0, 0, 'boot');
    h.stream.setWork(1);
    let sawLoadedBeforeReady = false;
    for (let i = 0; i < 1500 && !h.stream.ready; i++) {
      h.stream.update();
      if (h.cols.has(colKey(100, 100))) sawLoadedBeforeReady = true;
      if (!h.cols.has(colKey(100, 100))) expect(h.stream.ready).toBe(false);
    }
    expect(h.stream.ready).toBe(true);
    expect(sawLoadedBeforeReady).toBe(true);
    for (let i = 0; i < 50; i++) h.stream.update();
    expect(h.cols.has(colKey(100, 100))).toBe(false);
  });

  it('同じ n なら 何回やっても 同じコマ数で ready（機械の速さにたよらない）', () => {
    const a = settle(harness());
    const b = settle(harness());
    expect(a).toBe(b);
    expect(a).toBeLessThan(4000);
  });
});

describe('起動で全部は読まない（基準 11）', () => {
  const savedAll: Array<[number, number]> = [];
  for (let i = 0; i < 300; i++) savedAll.push([(i % 20) - 10, Math.floor(i / 20) - 7]);

  it('保存に 300 あっても 読むのは 輪の中の 289 まで・こわれた列は 生成して saveDirty', () => {
    const h = harness({ saved: savedAll, broken: [[0, 0]] });
    h.stream.restart(0, 0, 'boot');
    settle(h);
    expect(h.log.readAll).toBe(0);
    expect(h.log.read.length).toBeLessThanOrEqual(289);
    expect(h.log.read.length).toBeGreaterThan(0);
    for (const [cx, cz] of h.log.read) expect(cheb(cx, cz, 0, 0)).toBeLessThanOrEqual(R_GEN);
    // 保存に ない列は 生成
    expect(h.log.generated.some(([cx, cz]) => cx === 0 && cz === -8)).toBe(true);
    expect(h.log.generated.some(([cx, cz]) => cx === 3 && cz === 3)).toBe(false);
    // こわれた列
    expect(h.log.generated.some(([cx, cz]) => cx === 0 && cz === 0)).toBe(true);
    expect(h.state.requeued).toEqual([[0, 0]]);
    expect(h.dirty.has(colKey(0, 0))).toBe(true);
  });

  it('非同期で読んでも同じ（読んでいる間は 生成ずみにならない）', async () => {
    const h = harness({ saved: savedAll, async: true });
    h.stream.restart(0, 0, 'boot');
    h.stream.setWork(8);
    h.stream.update();
    expect(h.stream.stageOf(0, 0)).toBe('loading');
    expect(h.stream.isGenerated(0, 0)).toBe(false);
    for (let i = 0; i < 300; i++) {
      await Promise.resolve();
      h.stream.update();
    }
    expect(h.log.read.length).toBeLessThanOrEqual(289);
    expect(h.cols.size).toBe(289);
  });
});

describe('書けないときは捨てない（基準 12）', () => {
  it('保存が失敗するあいだ saveDirty の列は 11 より外でも 残り、書けるようになったら 書いて 捨てる', () => {
    const h = harness();
    h.stream.restart(0, 0, 'boot');
    settle(h);
    h.dirty.add(colKey(-8, 0)); // さわった列
    h.state.fail = true;
    h.stream.setCenter(4, 0); // -8 は 距離 12
    settle(h, 400);
    expect(h.cols.has(colKey(-8, 0))).toBe(true);
    expect(h.cols.has(colKey(-7, 0))).toBe(false); // さわっていない 距離 11 は捨てた
    expect(h.log.flushes).toBeGreaterThan(0);
    h.state.fail = false;
    settle(h, 400);
    expect(h.cols.has(colKey(-8, 0))).toBe(false);
    expect(h.saved.has(colKey(-8, 0))).toBe(true); // 書いてから 捨てた
    expect(h.dirty.size).toBe(0);
  });
});
