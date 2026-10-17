import { afterEach, describe, expect, it, vi } from 'vitest';
import { populateWorld } from '../gen/populate';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { referenceLight } from './referenceLight';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

function compare(w: ArrayVoxelWorld, l: WorldLight): { diffs: number; first: string } {
  const r = referenceLight(w);
  let diffs = 0;
  let first = '';
  for (let y = 0; y < r.sy; y++)
    for (let z = 0; z < r.sz; z++)
      for (let x = 0; x < r.sx; x++) {
        const i = (y * r.sz + z) * r.sx + x;
        if (l.skyAt(x, y, z) !== r.sky[i] || l.blockAt(x, y, z) !== r.block[i]) {
          if (diffs === 0) first = `(${x},${y},${z}) sky ${l.skyAt(x, y, z)} vs ${r.sky[i]}, block ${l.blockAt(x, y, z)} vs ${r.block[i]}`;
          diffs++;
        }
      }
  return { diffs, first };
}

function island(seed = 12345): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 0, z: 0 });
  populateWorld(w, seed);
  w.takeDirtyChunks();
  return w;
}

describe('セクションごとの光 = 前の光 (VOX-C AC1)', () => {
  it('今の島: 全マスで前と同じ', () => {
    const w = island();
    const l = new WorldLight(w, new SkyDarkness());
    const r = compare(w, l);
    expect(r.first).toBe('');
    expect(r.diffs).toBe(0);
  });

  it('島にたいまつ・屋根・穴をおいても 全マスで前と同じ（ほる・おく・取る）', () => {
    const w = island(777);
    const l = new WorldLight(w, new SkyDarkness());
    const g = (x: number, z: number): number => {
      for (let y = w.size.y - 1; y >= 0; y--) if (w.getIndex(x, y, z) > 0) return y;
      return 0;
    };
    w.setBlock(60, g(60, 60) + 1, 60, 'torch');
    w.setBlock(63, g(63, 60) + 1, 60, 'start_torch');
    w.fill(40, g(40, 40) + 3, 40, 52, g(40, 40) + 3, 52, 'stone');
    for (let y = g(80, 80); y > g(80, 80) - 6; y--) w.setBlock(80, y, 80, 'air'); // たて穴
    w.setBlock(64, g(64, 30) + 1, 30, 'leaves'); // 16 の境目
    l.update();
    l.flush();
    expect(compare(w, l).diffs).toBe(0);
    w.setBlock(60, g(60, 60) + 1, 60, 'air');
    w.setBlock(16, g(16, 16) + 1, 16, 'torch');
    l.update();
    l.flush();
    expect(compare(w, l).diffs).toBe(0);
  });
});

describe('セクションの光の性質 (VOX-C AC2)', () => {
  it('どの順に計算しても同じ答え（初めから作るのと、あとから変えるのが同じ）', () => {
    const a = island(5);
    const b = island(5);
    const edits: [number, number, number, string][] = [
      [30, 12, 30, 'torch'],
      [31, 9, 30, 'stone'],
      [32, 14, 31, 'leaves'],
    ];
    for (const e of edits) a.setBlock(e[0], e[1], e[2], e[3] as never);
    for (const e of [...edits].reverse()) b.setBlock(e[0], e[1], e[2], e[3] as never);
    const la = new WorldLight(a, new SkyDarkness());
    const lb = new WorldLight(b, new SkyDarkness());
    for (let y = 0; y < 48; y++)
      for (let z = 20; z < 44; z++)
        for (let x = 20; x < 44; x++) {
          expect(la.skyAt(x, y, z)).toBe(lb.skyAt(x, y, z));
          expect(la.blockAt(x, y, z)).toBe(lb.blockAt(x, y, z));
        }
  });

  it('空だけ 15 のセクションは 1 バイト、見えないセクションは持たない', () => {
    const w = new ArrayVoxelWorld({ x: 48, y: 96, z: 48 });
    w.fill(0, 0, 0, 47, 63, 47, 'stone'); // 地面は y=63 まで
    const l = new WorldLight(w, new SkyDarkness());
    expect(l.sectionKind(1, 5, 1)).toBe('uniform'); // 空
    expect(l.sectionKind(1, 1, 1)).toBe('dark'); // 地下の まんなか
    expect(l.sectionKind(1, 0, 1)).toBe('dark');
    expect(l.sectionKind(1, 3, 1)).toBe('dark'); // 光が 0 のまま（ふさがり）なので 持たない
    expect(l.sectionKind(1, 4, 1)).toBe('uniform'); // 地面すれすれの 空も 全部 15
    expect(l.skyAt(20, 80, 20)).toBe(15);
    expect(l.skyAt(20, 10, 20)).toBe(0);
    expect(l.blockAt(20, 10, 20)).toBe(0);
  });

  it('見えないセクションは 計算しない。となりをほったら 計算する', () => {
    const w = new ArrayVoxelWorld({ x: 48, y: 96, z: 48 });
    w.fill(0, 0, 0, 47, 63, 47, 'stone');
    const l = new WorldLight(w, new SkyDarkness());
    expect(l.sectionKind(1, 1, 1)).toBe('dark');
    l.lastRecomputeCells = 0;
    // 地下に たいまつを おく: まわりが ひらく
    w.fill(24, 20, 24, 26, 22, 26, 'air');
    w.setBlock(25, 21, 25, 'torch');
    l.update();
    l.flush();
    expect(l.sectionKind(1, 1, 1)).toBe('full');
    expect(l.blockAt(25, 21, 25)).toBe(14);
    expect(l.blockAt(26, 21, 25)).toBe(13);
    // もとの岩の奥は 0 のまま
    expect(l.blockAt(40, 40, 40)).toBe(0);
    // 3×3×3 のそと（となりの列の はし）に 計算が とどく数は 限られる
    expect(l.sectionKind(0, 0, 0)).toBe('dark');
  });

  it('1 コマに計算するセクションは 2 つまで。変えた所を先に', () => {
    const w = new ArrayVoxelWorld({ x: 64, y: 64, z: 64 });
    w.fill(0, 0, 0, 63, 3, 63, 'stone');
    const l = new WorldLight(w, new SkyDarkness());
    w.setBlock(24, 5, 24, 'torch');
    l.update();
    expect(l.lastRecomputeCells).toBeLessThanOrEqual(2 * 4096);
    expect(l.pendingCount()).toBeGreaterThan(0);
    expect(l.blockAt(24, 5, 24)).toBe(14); // 変えたセクション自身が 先
    l.flush();
    expect(l.pendingCount()).toBe(0);
  });

  it('列を読みこむ・捨てると、まわりの光が作り直される（VOX-A 台帳「中」）', () => {
    const w = new ArrayVoxelWorld({ x: 32, y: 48, z: 32 });
    w.fill(0, 0, 0, 31, 3, 31, 'stone');
    const l = new WorldLight(w, new SkyDarkness());
    expect(l.skyAt(15, 2, 15)).toBe(0);
    const col = w.column(0, 0)!;
    // となりの列を 屋根つきで 読みこむ
    const sections = col.sections.map((s) => (s.kind === 'uniform' ? { kind: 'uniform' as const, block: s.block } : s));
    w.loadColumn({ cx: 2, cz: 0, sections });
    l.update();
    l.flush();
    expect(l.sectionKind(2, 0, 0)).not.toBe('none');
    const r = referenceLight(w);
    // 読みこんだ列の光が 前の計算と同じ
    for (let z = 0; z < 16; z++) for (let x = 32; x < 48; x++) for (let y = 0; y < 48; y++) {
      const i = (y * r.sz + z) * r.sx + x;
      expect(l.skyAt(x, y, z)).toBe(r.sky[i]);
    }
    // 石の上にたいまつ → 捨てる → 読みこむ
    w.setBlock(33, 4, 5, 'torch');
    l.update();
    l.flush();
    expect(l.blockAt(33, 4, 5)).toBe(14);
    w.unloadColumn(2, 0);
    l.update();
    l.flush();
    expect(l.sectionKind(2, 0, 0)).toBe('none');
    expect(l.skyAt(33, 4, 5)).toBe(15); // 読みこんでいない所
  });

  it('光が変わった列を 描画側に伝える', () => {
    const w = new ArrayVoxelWorld({ x: 48, y: 32, z: 48 });
    w.fill(0, 0, 0, 47, 0, 47, 'stone');
    const l = new WorldLight(w, new SkyDarkness());
    w.takeDirtyChunks();
    w.setBlock(24, 1, 24, 'torch');
    w.takeDirtyChunks();
    l.update();
    l.flush();
    const d = w.takeDirtyChunks();
    expect(d.length).toBeGreaterThan(0);
    // 光の変わらない遠い列は 入らない（8 マスより遠い: 列 (0,0)）
    expect(d).not.toContain(w.chunkIndex(0, 0));
  });
});

describe('光が変わったセクションだけ メッシュの作り直しに入る（VOX-E）', () => {
  it('セクションの中ほどのたいまつ: そのセクションだけ。ふちに近い光は となりのセクションも', () => {
    const w = new ArrayVoxelWorld({ x: 96, y: 48, z: 96 });
    w.fill(0, 0, 0, 95, 0, 95, 'stone');
    const l = new WorldLight(w, new SkyDarkness());
    w.takeDirtySections();
    w.setBlock(40, 1, 40, 'torch'); // セクション (2,0,2) の中ほど（x・z は 8）
    w.takeDirtySections();
    l.update();
    l.flush();
    const keys = w.takeDirtySections().map((s) => `${s.cx},${s.sy},${s.cz}`);
    expect(keys).toContain('2,0,2');
    // 光は 14 マス広がるので となりのセクションにも届く。でも 遠いセクション (0,0,0) は 入らない
    expect(keys).not.toContain('0,0,0');
    expect(keys).not.toContain('5,0,5');
    // ひとつ上のセクションは 空だけ 15 のまま（光が変わらない）
    expect(keys).not.toContain('2,2,2');
  });
});

describe('レビュー指摘（VOX-C 1 周目）', () => {
  it('高い世界に列を 1 本読みこんでも すぐ落ち着く（自明なセクションは予算に数えない）', () => {
    const w = new ArrayVoxelWorld({ x: 48, y: 352, z: 48 });
    w.fill(0, 0, 0, 47, 63, 47, 'stone');
    const l = new WorldLight(w, new SkyDarkness());
    const sections = w.column(0, 0)!.sections.map((s) => (s.kind === 'uniform' ? { kind: 'uniform' as const, block: s.block } : s));
    w.loadColumn({ cx: 3, cz: 1, sections });
    let frames = 0;
    while (true) {
      l.update();
      frames++;
      if (l.pendingCount() === 0 || frames > 60) break;
    }
    expect(l.pendingCount()).toBe(0);
    expect(frames).toBeLessThanOrEqual(10);
  });

  it('読みこんだばかりの列は 光が計算されるまで「まだ」と分かる', () => {
    const w = new ArrayVoxelWorld({ x: 32, y: 48, z: 32 });
    w.fill(0, 0, 0, 31, 3, 31, 'stone');
    const l = new WorldLight(w, new SkyDarkness());
    expect(l.isColumnLit(0, 0)).toBe(true);
    const sections = w.column(0, 0)!.sections.map((s) => (s.kind === 'uniform' ? { kind: 'uniform' as const, block: s.block } : s));
    w.loadColumn({ cx: 2, cz: 0, sections });
    expect(l.isSectionReady(2, 0, 0)).toBe(false);
    expect(l.isColumnLit(2, 0)).toBe(false);
    l.flush();
    expect(l.isSectionReady(2, 0, 0)).toBe(true);
    expect(l.isColumnLit(2, 0)).toBe(true);
    expect(l.isSectionReady(9, 0, 9)).toBe(false);
  });
});

describe('時計 count（#179: 光の 1 コマの仕事を数で決める）', () => {
  afterEach(() => vi.restoreAllMocks());

  /** 島に たいまつを ばらまいて、作り直し待ちを たくさん ためる（まだ update しない） */
  function dirty(clock?: 'time' | 'count'): { l: WorldLight; real: () => number; calls: () => number } {
    const w = island(31);
    const l = clock === undefined ? new WorldLight(w, new SkyDarkness()) : new WorldLight(w, new SkyDarkness(), clock);
    const g = (x: number, z: number): number => {
      for (let y = w.size.y - 1; y >= 0; y--) if (w.getIndex(x, y, z) > 0) return y;
      return 0;
    };
    for (let x = 20; x < 110; x += 14) for (let z = 20; z < 110; z += 14) w.setBlock(x, g(x, z) + 1, z, 'torch');
    let real = 0;
    let calls = 0;
    const priv = l as unknown as { computeKey: (k: number) => void; lastRecomputeCells: number };
    const orig = priv.computeKey.bind(l);
    priv.computeKey = (k: number): void => {
      const before = priv.lastRecomputeCells;
      orig(k);
      calls++;
      if (priv.lastRecomputeCells !== before) real++;
    };
    return { l, real: () => real, calls: () => calls };
  }

  /** performance.now() を 呼ぶたびに 100 ms 進める。時間で決める作りなら 3 ms をこえて 1 つも計算しない */
  function slowClock(): void {
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 100));
  }

  it('count: 1 回の update() で ほんとうに計算するのは 2 セクション（時間は見ない）。ただで片づけるものを ふくめて 64 回まで', () => {
    const { l, real, calls } = dirty('count');
    slowClock();
    l.update();
    expect(l.pendingCount()).toBeGreaterThan(0); // 1 回では おわらない作りの世界
    expect(real()).toBe(2);
    expect(calls()).toBeLessThanOrEqual(64);
    const r1 = real();
    l.update();
    expect(real() - r1).toBeLessThanOrEqual(2);
  });

  it('count: ならべて 2 回作って 同じ回数 update すると 同じ（作り直し待ちの数が 毎コマ同じ）', () => {
    const run = (): number[] => {
      const { l } = dirty('count');
      const out: number[] = [];
      for (let i = 0; i < 30; i++) {
        l.update();
        out.push(l.pendingCount());
      }
      return out;
    };
    slowClock();
    const a = run();
    vi.restoreAllMocks();
    const b = run();
    expect(a).toEqual(b);
  });

  it('time が 既定: 3 つ目を 渡さなければ 100 ms かかる機械では 3 ms をこえて 1 つも計算しない（今のまま）', () => {
    const { l, real } = dirty();
    slowClock();
    l.update();
    expect(real()).toBe(0);
  });
});
