import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bigSample, hookE, needBokenHook, type Area, type BokenShaft, type ESample, type MineHookE } from './mineBokenKit';
import { deadEndsOf } from './mineBokenReport';
import type { PathCell, Pt } from './mineShaftKit';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.12・受け入れ基準 E17）: 実績の「場所」を 返す 窓口 `areaAt(x, y, z)` が 計画の 場所と 合う。
 *
 *   足が かくしべやの 中・むかしの えだ道・迷路の いちばん おくの 行きどまり〔へやが あれば へや〕・キャンプあとの へやに 入った ことを 見つける 所〔つなぎ込み〕は
 *   この 窓口を 読む。実績の 出し方〔はじめて 1 回・2 回目は 出ない〕は src/achievements/mine1e.test.ts。
 *   窓口 `areaAt(x, y, z): 'kakushi' | 'mukashi' | 'meiro' | 'camp' | null` は テスト用の 約束〔mineBokenKit.ts の 冒頭〕。
 * 赤の 確かめ: 1E の 前は「窓口が まだ ない」「1E の 坑道が ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 900_000 });

const NEED = 3;
const isOldBranch = (s: BokenShaft): boolean => (s.branches ?? []).some((b) => b.old);
const hasKakushi = (s: BokenShaft): boolean => deadEndsOf(s).some((e) => e.room !== null && e.kind.startsWith('hibi'));
const enough = (all: readonly ESample[]): boolean =>
  all.filter((a) => a.shaft.camp).length >= NEED && all.filter((a) => isOldBranch(a.shaft)).length >= NEED && all.filter((a) => a.shaft.maze).length >= NEED && all.filter((a) => hasKakushi(a.shaft)).length >= NEED;

interface Pick {
  seed: number;
  shaft: BokenShaft;
  hook: MineHookE;
}
const picks: Pick[] = [];
beforeAll(() => {
  const { all } = bigSample(enough);
  const chosen = new Map<string, ESample>();
  for (const pred of [(s: BokenShaft) => !!s.camp, isOldBranch, (s: BokenShaft) => !!s.maze, hasKakushi]) {
    for (const a of all.filter((x) => pred(x.shaft)).slice(0, NEED)) chosen.set(`${a.seed}:${a.shaft.id}`, a);
  }
  const hooks = new Map<number, MineHookE>();
  for (const a of chosen.values()) {
    const h = hooks.get(a.seed) ?? hookE(a.seed);
    hooks.set(a.seed, h);
    needBokenHook(h, ['areaAt', 'shaftPath']);
    picks.push({ seed: a.seed, shaft: a.shaft, hook: h });
  }
}, 900_000);

const tag = (p: Pick): string => `seed ${p.seed} ${p.shaft.id}`;
const area = (p: Pick, c: Pt): Area | null => p.hook.areaAt(c.x, c.y, c.z);
const floorOf = (r: { x0: number; y: number; z0: number; x1: number; z1: number }): Pt[] => {
  const out: Pt[] = [];
  for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) out.push({ x, y: r.y, z });
  return out;
};

describe('E17: 場所の 窓口 `areaAt`', () => {
  it('キャンプあとの 床〔道の マス part が camp〕は ぜんぶ camp', () => {
    const camps = picks.filter((p) => p.shaft.camp);
    expect(camps.length, 'キャンプの ある 1E の 坑道').toBeGreaterThanOrEqual(NEED);
    const bad: string[] = [];
    for (const p of camps) {
      const cells = p.hook.shaftPath(p.shaft.id).filter((c: PathCell) => (c.part as string) === 'camp');
      expect(cells.length, `${tag(p)}: camp の 道の マス`).toBeGreaterThan(0);
      for (const c of cells) if (area(p, c) !== 'camp') bad.push(`${tag(p)}: (${c.x}, ${c.y}, ${c.z}) が ${area(p, c)}`);
      for (const c of floorOf(p.shaft.camp!.room)) if (area(p, c) !== 'camp') bad.push(`${tag(p)}: 床 (${c.x}, ${c.y}, ${c.z}) が ${area(p, c)}`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('かくしべやの 床は ぜんぶ kakushi・手前の 行きどまりの マスは kakushi でない', () => {
    const list = picks.flatMap((p) => deadEndsOf(p.shaft).filter((e) => e.room && e.kind.startsWith('hibi')).map((e) => ({ p, e })));
    expect(list.length, 'かくしべやの ある 行きどまり').toBeGreaterThanOrEqual(NEED);
    const bad: string[] = [];
    for (const { p, e } of list) {
      for (const c of floorOf(e.room!)) if (area(p, c) !== 'kakushi') bad.push(`${tag(p)}: 床 (${c.x}, ${c.y}, ${c.z}) が ${area(p, c)}`);
      if (area(p, e.at) === 'kakushi') bad.push(`${tag(p)}: ひびの 手前 (${e.at.x}, ${e.at.y}, ${e.at.z}) が kakushi`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('むかしの えだ道の 行きどまりは mukashi・むかしでない えだ道の 行きどまりは null〔ひびの 手前も〕', () => {
    const list = picks.flatMap((p) => (p.shaft.branches ?? []).map((b) => ({ p, b })));
    expect(list.filter((x) => x.b.old).length, 'むかしの えだ道').toBeGreaterThanOrEqual(NEED);
    const bad: string[] = [];
    for (const { p, b } of list) {
      const got = area(p, b.end.at);
      if (b.old && got !== 'mukashi') bad.push(`${tag(p)}: むかしの えだ道の おわり (${b.end.at.x}, ${b.end.at.y}, ${b.end.at.z}) が ${got}`);
      if (!b.old && got !== null) bad.push(`${tag(p)}: むかしでない えだ道の おわり (${b.end.at.x}, ${b.end.at.y}, ${b.end.at.z}) が ${got}`);
      // えだ道の 中の マス〔道の マス part が eda。口から 2〜3 マス 内がわ〕でも 同じ〔おくの へやを えだ道に 入れない 実装を 落とす〕
      const inside = p.hook.shaftPath(p.shaft.id).filter((c: PathCell) => (c.part as string) === 'eda' && Math.abs(c.y - b.from.y) <= 1 && Math.max(Math.abs(c.x - b.from.x), Math.abs(c.z - b.from.z)) >= 2 && Math.max(Math.abs(c.x - b.from.x), Math.abs(c.z - b.from.z)) <= 3);
      expect(inside.length, `${tag(p)}: 口から 2〜3 マスの えだ道の マス`).toBeGreaterThan(0);
      for (const c of inside) {
        const a = area(p, c);
        if (b.old && a !== 'mukashi') bad.push(`${tag(p)}: むかしの えだ道の 中 (${c.x}, ${c.y}, ${c.z}) が ${a}`);
      }
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('迷路の いちばん おくの 行きどまり〔へやが あれば へやの 床〕は meiro・ほかの 行きどまり・迷路の 入口は null', () => {
    const mazes = picks.filter((p) => p.shaft.maze);
    expect(mazes.length, '迷路の ある 1E の 坑道').toBeGreaterThanOrEqual(NEED);
    const bad: string[] = [];
    for (const p of mazes) {
      const m = p.shaft.maze!;
      m.deadEnds.forEach((e, i) => {
        const far = i === m.farthest;
        const got = area(p, e.at);
        if (far && got !== 'meiro') bad.push(`${tag(p)}: いちばん おく (${e.at.x}, ${e.at.y}, ${e.at.z}) が ${got}`);
        if (!far && got !== null) bad.push(`${tag(p)}: ${i} 番めの 行きどまりが ${got}`);
        if (far && e.room) for (const c of floorOf(e.room)) if (area(p, c) !== 'meiro') bad.push(`${tag(p)}: おくの へやの 床 (${c.x}, ${c.y}, ${c.z}) が ${area(p, c)}`);
      });
      if (area(p, m.entrance) !== null) bad.push(`${tag(p)}: 迷路の 入口が ${area(p, m.entrance)}`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('入口・本道・ひろばなど ほかの 場所は null・坑道の 外と 空の 上も null', () => {
    expect(picks.length, '1E の 坑道').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const p of picks) {
      const e = p.shaft.entrance;
      if (area(p, e) !== null) bad.push(`${tag(p)}: 入口が ${area(p, e)}`);
      for (const f of p.shaft.floors ?? []) for (const c of f.main.slice(0, 6)) if (area(p, c) !== null) bad.push(`${tag(p)}: 本道 (${c.x}, ${c.y}, ${c.z}) が ${area(p, c)}`);
      if (p.hook.areaAt(e.x + 5000, e.y, e.z + 5000) !== null) bad.push(`${tag(p)}: 坑道の 外が 場所に なって いる`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });
});
