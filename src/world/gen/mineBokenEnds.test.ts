import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEAD_END_KINDS,
  ID,
  bigSample,
  cheb,
  hookE,
  inSpan,
  needBokenHook,
  tablesOf,
  type BokenShaft,
  type DeadEnd,
  type DeadEndKind,
  type ESample,
} from './mineBokenKit';
import { DugCols, campProblems, closedProblems, deadEndProblems, deadEndsOf, dugSetOf, mazeGraph, reachOf } from './mineBokenReport';
import { GenCols, ptKey, walkDist, type PathCell, type Pt } from './mineShaftKit';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.4〜§4.8・受け入れ基準 E6〔ブロック〕・E7〔ブロック〕・E8・E9〔ブロック〕・E10〔ブロック〕）: 行きどまり・ひび・迷路・キャンプを ブロックで しらべる。
 *
 *   計画だけの 標本から「6 つの 結果が それぞれ 3 つ ずつ」「くずれた いしの ある えだ道 3 つ」「迷路 3 つ」「キャンプ 3 つ」が 入る ように
 *   坑道を 選び〔めずらしい 物が 標本に 入らず 何も 見ない のを ふせぐ〕、その ブロックを 作って しらべる。数は 表から 読む〔#311〕。時間〔ms〕では 合否を きめない。
 * 赤の 確かめ: 1E の 前は 1E の 坑道が なく「窓口が まだ ない」「1E の 坑道が ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 600_000 });

const PER_KIND = 3;
interface Pick {
  seed: number;
  shaft: BokenShaft;
  path: PathCell[];
  orig: GenCols;
  dug: DugCols;
}
const picks: Pick[] = [];

const kindsOf = (s: BokenShaft): DeadEndKind[] => deadEndsOf(s).map((e) => e.kind);
const hasRubble = (s: BokenShaft): boolean => (s.branches ?? []).some((b) => b.rubble.length > 0);
const enough = (all: readonly ESample[]): boolean =>
  DEAD_END_KINDS.every((k) => all.filter((a) => kindsOf(a.shaft).includes(k)).length >= PER_KIND) &&
  all.filter((a) => hasRubble(a.shaft)).length >= PER_KIND &&
  all.filter((a) => a.shaft.maze).length >= PER_KIND &&
  all.filter((a) => a.shaft.camp).length >= PER_KIND;

beforeAll(() => {
  const { all } = bigSample(enough);
  const chosen = new Map<string, ESample>();
  const take = (pred: (s: BokenShaft) => boolean): void => {
    const hit = all.filter((a) => pred(a.shaft));
    let got = hit.filter((a) => chosen.has(`${a.seed}:${a.shaft.id}`)).length;
    for (const a of hit) {
      if (got >= PER_KIND) break;
      if (chosen.has(`${a.seed}:${a.shaft.id}`)) continue;
      chosen.set(`${a.seed}:${a.shaft.id}`, a);
      got++;
    }
  };
  for (const k of DEAD_END_KINDS) take((s) => kindsOf(s).includes(k));
  take(hasRubble);
  take((s) => s.maze !== null && s.maze !== undefined);
  take((s) => s.camp !== null && s.camp !== undefined);
  for (const a of chosen.values()) {
    const h = hookE(a.seed);
    needBokenHook(h, ['shaftPath']);
    picks.push({ seed: a.seed, shaft: a.shaft, path: h.shaftPath(a.shaft.id), orig: new GenCols(a.seed), dug: new DugCols(a.seed, dugSetOf(a.shaft)) });
  }
}, 900_000);

const tagOf = (p: Pick): string => `seed ${p.seed} ${p.shaft.id}`;
const fail = (what: string, bad: string[]): void => expect(bad.slice(0, 8), `${what}: ${bad.length} つ`).toEqual([]);

describe('E7〔ブロック〕: 行きどまりの くじの 中身', () => {
  it('標本に 6 つの 結果が 3 つ ずつ 以上ある', () => {
    expect(picks.length, '1E の 坑道が ない').toBeGreaterThan(0);
    const ends = picks.flatMap((p) => deadEndsOf(p.shaft));
    for (const k of DEAD_END_KINDS) expect(ends.filter((e) => e.kind === k).length, `行きどまり ${k}`).toBeGreaterThanOrEqual(PER_KIND);
  });

  it('大当たり〔へや 5×5・高さ 4・宝箱 2 マス〕・中あたり〔その 層の 鉱石が 表の 数 以上〕・あたり〔鉱石 2〜4 こ〕・はずれ〔こわれた わく か はしご・ひびなし・くずれた いし なし〕・ひび〔はば 1・高さ 2・おく 2〜4・手前に たいまつ ちょうど 1 本・床が 同じ 高さの へや〕', () => {
    const T = tablesOf();
    const bad: string[] = [];
    for (const p of picks) {
      const depth = p.shaft.style!.depth;
      for (const e of deadEndsOf(p.shaft)) for (const m of deadEndProblems(p.orig, p.dug, e, T, depth).slice(0, 2)) bad.push(`${tagOf(p)}: ${m}`);
    }
    fail('行きどまり', bad);
  });
});

describe('E8: かくしべやは とじて いる・ほると 行き来 できる', () => {
  const hibiEnds = (): { p: Pick; e: DeadEnd }[] => picks.flatMap((p) => deadEndsOf(p.shaft).filter((e) => e.kind === 'hibi_naka' || e.kind === 'hibi_oo').map((e) => ({ p, e })));

  it('ほる 前: かくしべやの 空気が ほかの 空気・水と 6 方向で つながらない・床の 下 2 マスは 固い', () => {
    const T = tablesOf();
    const list = hibiEnds();
    expect(list.length, 'ひびの 行きどまり').toBeGreaterThanOrEqual(2 * PER_KIND);
    const bad: string[] = [];
    for (const { p, e } of list) for (const m of closedProblems(p.orig, e, T)) bad.push(`${tagOf(p)} (${e.at.x}, ${e.at.y}, ${e.at.z}): ${m}`);
    fail('とじて いる', bad);
  });

  it('ひびの いしを ぜんぶ ほると 行きどまりと かくしべやが 入口から 行き来 できる〔段差 0〕。ほる 前は 入口から 入れない', () => {
    expect(hibiEnds().length, 'ひびの 行きどまりの ある 1E の 坑道が ない').toBeGreaterThan(0);
    const bad: string[] = [];
    const reaches = new Map<Pick, { before: ReturnType<typeof reachOf>; after: ReturnType<typeof reachOf> }>();
    for (const { p, e } of hibiEnds()) {
      let r = reaches.get(p);
      if (!r) {
        // ほる 前: ひびは そのまま・くずれた いしだけ ほった 世界〔くずれた いしの おくの 行きどまりも 行ける ように〕
        const rubble = new Set((p.shaft.branches ?? []).flatMap((b) => b.rubble.map(ptKey)));
        r = { before: reachOf(new DugCols(p.seed, rubble), p.shaft), after: reachOf(p.dug, p.shaft) };
        reaches.set(p, r);
      }
      const room = e.room!;
      const chest = new Set((e.chest?.cells ?? []).map(ptKey)); // 宝箱の マスは 固くて 立てない〔宝箱である ことは E7 が 見る〕
      const center: Pt = { x: (room.x0 + room.x1) >> 1, y: room.y, z: (room.z0 + room.z1) >> 1 };
      // 宝箱で ない マスの うち 中央に いちばん 近い 1 つ
      const floor: Pt[] = [];
      for (let x = room.x0; x <= room.x1; x++) for (let z = room.z0; z <= room.z1; z++) if (!chest.has(ptKey({ x, y: room.y, z }))) floor.push({ x, y: room.y, z });
      const mid: Pt = floor.sort((a, b) => Math.abs(a.x - center.x) + Math.abs(a.z - center.z) - (Math.abs(b.x - center.x) + Math.abs(b.z - center.z)))[0]!;
      if (e.at.y !== room.y) bad.push(`${tagOf(p)}: 段差 ${room.y - e.at.y}`);
      if (!r.before.ok(e.at)) bad.push(`${tagOf(p)}: ほる 前でも 行きどまりに 行けない`);
      if (r.before.ok(mid)) bad.push(`${tagOf(p)}: ほる 前に かくしべやに 入れる (${mid.x}, ${mid.y}, ${mid.z})`);
      for (let x = room.x0; x <= room.x1; x++) for (let z = room.z0; z <= room.z1; z++) if (!chest.has(ptKey({ x, y: room.y, z })) && !r.after.ok({ x, y: room.y, z })) bad.push(`${tagOf(p)}: ほった あと かくしべやの 床 (${x}, ${room.y}, ${z}) に 行き来 できない`);
    }
    fail('ほった あと', bad);
  });
});

describe('E6〔ブロック〕: くずれた いしの 口・むかしの えだ道', () => {
  const rubbleBranches = (): { p: Pick; b: NonNullable<BokenShaft['branches']>[number] }[] => picks.flatMap((p) => (p.shaft.branches ?? []).filter((b) => b.rubble.length > 0).map((b) => ({ p, b })));

  it('くずれた いしは 口の 内がわ 1 マス・はば 3・足と 頭の 6 こ〔ブロックも くずれた いし〕。はば 1 の 2 こを ほると 道さがしで 通れる〔ほる 前は 通れない〕', () => {
    const list = rubbleBranches();
    expect(list.length, 'くずれた いしの ある えだ道').toBeGreaterThanOrEqual(PER_KIND);
    const bad: string[] = [];
    const before = new Map<Pick, ReturnType<typeof reachOf>>();
    for (const { p, b } of list) {
      const tag = `${tagOf(p)} (${b.from.x}, ${b.from.y}, ${b.from.z})`;
      const cs = b.rubble;
      for (const c of cs) if (p.orig.id(c.x, c.y, c.z) !== ID.kuzure) bad.push(`${tag}: ${ptKey(c)} が ${p.orig.id(c.x, c.y, c.z)}`);
      const ys = new Set(cs.map((c) => c.y));
      const xs = new Set(cs.map((c) => c.x));
      const zs = new Set(cs.map((c) => c.z));
      if (ys.size !== 2 || !ys.has(b.from.y) || !ys.has(b.from.y + 1)) bad.push(`${tag}: 足と 頭の 2 だんでない`);
      if (!((xs.size === 3 && zs.size === 1) || (xs.size === 1 && zs.size === 3))) bad.push(`${tag}: はば 3 × おく 1 でない`);
      if (cs.some((c) => cheb(c, b.from) > 2)) bad.push(`${tag}: 口から はなれて いる`);
      // 道さがし: ほる 前は 行きどまりに 入れず、まん中の 列 2 こ〔はば 1〕を ほると 入れる
      const lateralKey: 'x' | 'z' = xs.size === 3 ? 'x' : 'z';
      const sorted = [...new Set(cs.map((c) => c[lateralKey]))].sort((u, v) => u - v);
      const midV = sorted[1]!;
      const dig = cs.filter((c) => c[lateralKey] === midV);
      if (dig.length !== 2) bad.push(`${tag}: まん中の 列が 2 こでない`);
      let r0 = before.get(p);
      if (!r0) {
        r0 = reachOf(p.orig, p.shaft);
        before.set(p, r0);
      }
      if (r0.ok(b.end.at)) bad.push(`${tag}: くずれた いしを ほる 前でも 行きどまりに 行ける`);
      const cut = new DugCols(p.seed, new Set([...dugSetOf(p.shaft)].filter((k) => !cs.some((c) => ptKey(c) === k)).concat(dig.map(ptKey))));
      // 同じ えだ道の ひび〔かくしべやの ある 行きどまり〕は ほらない: ほる のは 口の 2 こだけ。おわりまで 行ければ よい
      if (!reachOf(cut, p.shaft).ok(b.end.at)) bad.push(`${tag}: まん中の 2 こを ほっても 行きどまりに 行けない`);
    }
    fail('くずれた いし', bad);
  });

  it('むかしの えだ道は 口から 2〜3 マス 内がわに たいまつ 1 本 以上', () => {
    const S = tablesOf().shape.eda;
    const bad: string[] = [];
    let n = 0;
    for (const p of picks) {
      for (const b of p.shaft.branches ?? []) {
        if (!b.old) continue;
        n++;
        // えだ道の 道の マスで 口から torchFrom の はなれに ある マスの まわり〔横 ±1・高さ 4〕だけ 数える。横穴〔ほかの 道の マス〕の たいまつは 入れない
        const others = new Set(p.path.filter((c) => (c.part as string) !== 'eda').map(ptKey));
        const inside = p.path.filter((c) => (c.part as string) === 'eda' && Math.abs(c.y - b.from.y) <= 1 && inSpan(cheb(c, b.from), S.torchFrom));
        const found = new Set<string>();
        for (const c of inside) {
          for (let x = c.x - 1; x <= c.x + 1; x++) {
            for (let z = c.z - 1; z <= c.z + 1; z++) {
              for (let y = c.y; y <= c.y + 3; y++) {
                const k = ptKey({ x, y, z });
                if (!others.has(k) && p.orig.id(x, y, z) === ID.torch) found.add(k);
              }
            }
          }
        }
        const torches = found.size;
        if (torches < 1) bad.push(`${tagOf(p)} (${b.from.x}, ${b.from.y}, ${b.from.z}): 口から ${S.torchFrom.join('〜')} マスに たいまつが ない`);
      }
    }
    expect(n, 'むかしの えだ道').toBeGreaterThan(0);
    fail('たいまつ', bad);
  });
});

describe('E9〔ブロック〕: 迷路', () => {
  it('平ら〔道の y が ぜんぶ 迷路の y〕・分かれ目 3 以上・道の 輪 1 以上・行きどまり 2〜4 で ぜんぶ いちばん 外がわの ます・つきあたりの かべが 外がわ', () => {
    const M = tablesOf().shape.maze;
    const bad: string[] = [];
    const mazes = picks.filter((p) => p.shaft.maze);
    expect(mazes.length, '迷路の ある 標本').toBeGreaterThanOrEqual(PER_KIND);
    for (const p of mazes) {
      const m = p.shaft.maze!;
      const cells = p.path.filter((c) => (c.part as string) === 'maze');
      if (cells.some((c) => c.y !== m.y)) bad.push(`${tagOf(p)}: 迷路が 平らでない`);
      const g = mazeGraph(p.shaft, p.path)!;
      const nodes: [number, number][] = [];
      for (let i = 0; i < m.grid; i++) for (let j = 0; j < m.grid; j++) nodes.push([i, j]);
      let edges = 0;
      for (const [i, j] of nodes) {
        if (g.open(i, j, i + 1, j)) edges++;
        if (g.open(i, j, i, j + 1)) edges++;
      }
      const ent = nodes.find(([i, j]) => Math.abs(g.cells[i]![j]!.x - m.entrance.x) <= 2 && Math.abs(g.cells[i]![j]!.z - m.entrance.z) <= 2);
      if (!ent) {
        bad.push(`${tagOf(p)}: 入口が どの ますにも ない`);
        continue;
      }
      const forks = nodes.filter(([i, j]) => g.degree(i, j) >= 3 || (i === ent[0] && j === ent[1] && g.degree(i, j) >= 2)).length;
      if (forks < M.forks) bad.push(`${tagOf(p)}: 分かれ目 ${forks}〔${M.forks} 以上〕`);
      if (edges - nodes.length + 1 < M.loops) bad.push(`${tagOf(p)}: 道の 輪 ${edges - nodes.length + 1}〔${M.loops} 以上〕`);
      const ends = nodes.filter(([i, j]) => g.degree(i, j) === 1 && !(i === ent[0] && j === ent[1]));
      if (!inSpan(ends.length, M.deadEnds)) bad.push(`${tagOf(p)}: 行きどまりの ます ${ends.length}`);
      if (ends.length !== m.deadEnds.length) bad.push(`${tagOf(p)}: 計画の 行きどまり ${m.deadEnds.length} ≠ ブロックの ${ends.length}`);
      for (const [i, j] of ends) if (!(i === 0 || j === 0 || i === m.grid - 1 || j === m.grid - 1)) bad.push(`${tagOf(p)}: 行きどまり (${i}, ${j}) が いちばん 外がわの ますでない`);
      for (const e of m.deadEnds) if (e.at.x < m.box.x0 || e.at.x > m.box.x1 || e.at.z < m.box.z0 || e.at.z > m.box.z1) bad.push(`${tagOf(p)}: 行きどまりの 足の マスが 迷路の 外`);
    }
    fail('迷路', bad);
  });

  it('どの ますからも 入口まで 歩いて 60 歩 以内〔表〕・いちばん おくの 行きどまりが 入口から いちばん 遠い・たいまつは 16 本 まで', () => {
    const M = tablesOf().shape.maze;
    const bad: string[] = [];
    for (const p of picks.filter((x) => x.shaft.maze)) {
      const m = p.shaft.maze!;
      const dist = walkDist(p.dug, { x: m.entrance.x, y: m.entrance.y, z: m.entrance.z }, m.box);
      const g = mazeGraph(p.shaft, p.path)!;
      let worst = 0;
      for (let i = 0; i < m.grid; i++) for (let j = 0; j < m.grid; j++) {
        const d = dist.get(ptKey(g.cells[i]![j]!));
        if (d === undefined) bad.push(`${tagOf(p)}: ます (${i}, ${j}) に 入口から 行けない`);
        else worst = Math.max(worst, d);
      }
      if (worst > M.walkMax) bad.push(`${tagOf(p)}: いちばん 遠い ますまで ${worst} 歩〔${M.walkMax} 以内〕`);
      const far = m.deadEnds.map((e) => dist.get(ptKey(e.at)) ?? -1);
      if (far[m.farthest] !== Math.max(...far)) bad.push(`${tagOf(p)}: farthest ${m.farthest} が いちばん 遠く ない〔${far.join(',')}〕`);
      let torches = 0;
      for (let x = m.box.x0; x <= m.box.x1; x++) for (let z = m.box.z0; z <= m.box.z1; z++) for (let y = m.y; y <= m.y + M.height; y++) if (p.orig.id(x, y, z) === ID.torch) torches++;
      if (torches > M.torchMax) bad.push(`${tagOf(p)}: 迷路の たいまつ ${torches} 本〔${M.torchMax} まで〕`);
    }
    fail('迷路', bad);
  });
});

describe('E10〔ブロック〕: キャンプあと', () => {
  it('床 5×5・高さ 4・段差 0・たんす・ちょうちん・ふとん・たきびの あとが ブロックで ある', () => {
    const T = tablesOf();
    const bad: string[] = [];
    const camps = picks.filter((p) => p.shaft.camp);
    expect(camps.length, 'キャンプの ある 標本').toBeGreaterThanOrEqual(PER_KIND);
    for (const p of camps) for (const m of campProblems(p.orig, p.shaft, T)) bad.push(`${tagOf(p)}: ${m}`);
    fail('キャンプ', bad);
  });
});
