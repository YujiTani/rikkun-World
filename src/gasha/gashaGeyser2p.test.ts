import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { GeyserField, type FieldDeps, type GeyserPlaceArgs } from './gashaGeyserField';
import type { GashaTarget } from './gashaTargets';

/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)「のる・運ばれる・押される・間欠泉・落ちない」・§10 の 【4d】・AC111）: 間欠泉の 2 人分。実装の 前に 書いた 赤の テスト。
 * 「間欠泉の 中・あとの 落ちる ダメージ なしは その人だけ」。
 *
 * ---- 開発への 約束（`src/gasha/gashaGeyserField.ts`。名前は 開発が かえて よいが、かえたら 依頼文と 仕様に 書く）----
 *   FieldDeps.targets?(): readonly GashaTarget[]（`src/gasha/gashaTargets.ts`）… 打ち上げる 相手の 一覧。毎ステップ 読む。
 *     人ごとに  body()・setVelocity(v)・nudge(dx, dz)・setNoFall(on) を 使い、「柱に 入って いる／おりている／守りの 途中（assisted）」の 覚えも 人ごと。
 *     式（liftStep・funnelRadius など）は 今の ものを そのまま 1P と 2P で 使う（コピーしない）。
 *   targets が ない ときは 今の body・setVelocity・nudge・setNoFall（1P）の まま（AC113。今の gashaGeyserField.test.ts は 変えない）。
 *   一覧から 人が 消えた（やめた）ステップに、その人の 落ちない（setNoFall）が 入って いたら setNoFall(false) を 呼んで はずす。
 */

const A: GeyserPlaceArgs = { x: 0, y: 11, z: 0, yaw: 0.4, scale: 0.465 };
const DT = 1 / 60;
const S = T.geyser.spawn;

interface Log { vel: { x: number; y: number; z: number }[]; noFall: boolean[]; nudge: number }

function make() {
  const blocks = new Map<string, string>();
  const people = new Map<1 | 2, { pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number }; onGround: boolean; log: Log }>();
  const add = (who: 1 | 2, x: number, y: number, z: number) => {
    people.set(who, { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, onGround: false, log: { vel: [], noFall: [], nudge: 0 } });
  };
  let list: (1 | 2)[] = [];
  const targets = (): readonly GashaTarget[] => list.map((who) => {
    const p = people.get(who)!;
    return {
      who, pos: p.pos, yawDeg: 0, down: false,
      body: () => ({ position: p.pos, velocity: p.vel, onGround: p.onGround }),
      setVelocity: (v: { x: number; y: number; z: number }) => { p.log.vel.push({ ...v }); },
      nudge: () => { p.log.nudge++; },
      setNoFall: (on: boolean) => { p.log.noFall.push(on); },
    } as GashaTarget;
  });
  const deps = {
    groundY: () => 10,
    blockAt: (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? (y > 10 ? 'air' : y === 10 ? 'grass' : 'dirt'),
    setBlock: (x: number, y: number, z: number, id: string) => { blocks.set(`${x},${y},${z}`, id); return true; },
    restoreBlock: (x: number, y: number, z: number, id: string) => { blocks.set(`${x},${y},${z}`, id); return true; },
    scanBlocks: (found: (x: number, y: number, z: number) => void) => { for (const [k, v] of blocks) if (v === 'geyser_dirt') { const [x, y, z] = k.split(',').map(Number); found(x!, y!, z!); } },
    bodySolid: () => false,
    centre: () => ({ x: 0, z: 0 }),
    // 1 人用の 口（targets が ある ときは 使われない はず。はるか 遠くの 何もしない 1P）
    body: () => ({ position: { x: 9999, y: 11, z: 9999 }, velocity: { x: 0, y: 0, z: 0 }, onGround: true }),
    setVelocity: () => {}, nudge: () => {}, setNoFall: () => {},
    targets,
  } as unknown as FieldDeps;
  const f = new GeyserField(deps);
  f.place(A);
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) f.step(DT); };
  run(S.crackSec + 2 + T.geyser.staggerSec);
  const column = f.info().find((q) => q.state === 'up')!;
  return { f, run, people, add, setList: (l: (1 | 2)[]) => { list = l; }, column };
}

describe('間欠泉の 2 人分（AC111）: 打ち上げ・落ちないは その人だけ', () => {
  it('2P だけ 柱に 入る: 2P が 打ち上がり、2P だけ 落下ダメージなし。1P には 何も 起きない', () => {
    const w = make();
    w.add(1, 500, 11, 500);
    w.add(2, w.column.x, w.column.ground, w.column.z);
    w.setList([1, 2]);
    w.run(0.05);
    expect(w.people.get(2)!.log.vel.at(-1)!.y).toBeGreaterThan(0);
    expect(w.people.get(2)!.log.noFall.at(-1)).toBe(true);
    expect(w.people.get(1)!.log.vel).toEqual([]);
    expect(w.people.get(1)!.log.noFall).toEqual([]);
  });

  it('1P だけ 柱に 入る: 1P が 打ち上がり、2P には 何も 起きない（1P と 同じ 部品）', () => {
    const w = make();
    w.add(1, w.column.x, w.column.ground, w.column.z);
    w.add(2, 500, 11, 500);
    w.setList([1, 2]);
    w.run(0.05);
    expect(w.people.get(1)!.log.vel.at(-1)!.y).toBeGreaterThan(0);
    expect(w.people.get(1)!.log.noFall.at(-1)).toBe(true);
    expect(w.people.get(2)!.log.vel).toEqual([]);
    expect(w.people.get(2)!.log.noFall).toEqual([]);
  });

  it('2 人とも 同じ 柱に 入ると 2 人とも 打ち上がり、それぞれ 自分の 落ちないが 入る', () => {
    const w = make();
    w.add(1, w.column.x, w.column.ground, w.column.z);
    w.add(2, w.column.x, w.column.ground, w.column.z);
    w.setList([1, 2]);
    w.run(0.05);
    for (const who of [1, 2] as const) {
      expect(w.people.get(who)!.log.vel.at(-1)!.y, `${who}P`).toBeGreaterThan(0);
      expect(w.people.get(who)!.log.noFall.at(-1), `${who}P`).toBe(true);
    }
  });

  it('2P が 柱を 出て 地面に 着くと 2P の 落ちないだけ はずれる。まだ 柱の 中の 1P は 守られたまま（片方が もう 片方の 守りを 消さない）', () => {
    const w = make();
    w.add(1, w.column.x, w.column.ground, w.column.z);
    w.add(2, w.column.x, w.column.ground, w.column.z);
    w.setList([1, 2]);
    w.run(0.05);
    const p2 = w.people.get(2)!;
    p2.pos.x = 500; p2.pos.z = 500; p2.pos.y = 11; p2.onGround = true; // 柱を はなれて 着地
    w.run(0.4);
    expect(p2.log.noFall.at(-1)).toBe(false);
    expect(w.people.get(1)!.log.noFall.at(-1)).toBe(true);
  });

  it('2P が やめて 一覧から 消えた ステップに、2P の 落ちないを はずす（1P の 守りは そのまま）', () => {
    const w = make();
    w.add(1, w.column.x, w.column.ground, w.column.z);
    w.add(2, w.column.x, w.column.ground, w.column.z);
    w.setList([1, 2]);
    w.run(0.05);
    expect(w.people.get(2)!.log.noFall.at(-1)).toBe(true);
    w.setList([1]);
    w.run(DT * 2);
    expect(w.people.get(2)!.log.noFall.at(-1)).toBe(false);
    expect(w.people.get(1)!.log.noFall.at(-1)).toBe(true);
  });

  it('あとから 一覧に 入った 2P も 打ち上がる（2P の さんかに ついて いく）', () => {
    const w = make();
    w.add(1, 500, 11, 500);
    w.add(2, w.column.x, w.column.ground, w.column.z);
    w.setList([1]);
    w.run(0.2);
    expect(w.people.get(2)!.log.vel).toEqual([]);
    w.setList([1, 2]);
    w.run(0.05);
    expect(w.people.get(2)!.log.vel.at(-1)!.y).toBeGreaterThan(0);
  });
});
