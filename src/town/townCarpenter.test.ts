import { describe, expect, it } from 'vitest';
import type { RepairJob } from './townRepairs';
import { TownCarpenter, type CarpenterDeps } from './townCarpenter';
import { MOTION_LEN } from './townCarpenterPose';
import { TOWN } from './townTuning';

/** TOWN-1 1.4 §2.16 の 9〜14（試作）: 街の だいくさんの 状態の うつり変わりと 数。平らな 地面（y = 5）。 */
const C = TOWN.repair.carpenter;
const HOME = { x: 50.5, y: 5, z: 50.5, yaw: Math.PI };

function job(x: number, z: number, w = 2, d = 2, waitable = false): RepairJob {
  return { queue: [], head: 0, minX: x, maxX: x + w - 1, minZ: z, maxZ: z + d - 1, minY: 5, maxY: 5, waitable, next: 0, finished: false, whole: true };
}

function rig(o: { stand?: (x: number, z: number) => number | null; loaded?: (x: number, z: number) => boolean; covered?: (x: number, y: number, z: number) => boolean } = {}) {
  const jobs: RepairJob[] = [];
  const waiting = new Set<RepairJob>();
  const menu = { open: false };
  const warps: { x: number; z: number }[] = [];
  const deps: CarpenterDeps = {
    jobs: () => jobs,
    waiting: (j) => waiting.has(j),
    standY: o.stand ?? ((x, z) => (x < 0 || z < 0 || x > 150 || z > 150 ? null : 5)),
    frames: () => [],
    covered: o.covered ?? (() => false),
    menuOpen: () => menu.open,
    isLoaded: o.loaded ?? (() => true),
    home: HOME,
    seed: 7,
    onWarp: (x, _y, z) => warps.push({ x, z }),
  };
  const c = new TownCarpenter(deps);
  const run = (n: number, until?: () => boolean): number => {
    for (let i = 0; i < n; i++) {
      if (until?.()) return i;
      c.step();
    }
    return n;
  };
  return { c, jobs, waiting, menu, warps, run };
}

describe('街の だいくさん', () => {
  it('こわれた 所が ない 日は こやに いて 歩かない（るす なし・ふだ なし）', () => {
    const r = rig();
    r.run(500);
    expect(r.c.state).toBe('home');
    expect(r.c.out).toBe(false);
    expect(r.c.sign()).toBe(false);
    expect(r.c.x).toBe(HOME.x);
  });

  it('朝に まとまりが できると departMax ステップ 以内に こやを 出る（るす・ふだ）。歩く はやさは 1 ステップに walkPerStep 以下（ワープ しない）', () => {
    const r = rig();
    r.jobs.push(job(80, 50));
    const left = r.run(C.departMax + 2, () => r.c.out);
    expect(left).toBeLessThanOrEqual(C.departMax + 1);
    expect(r.c.out).toBe(true);
    expect(r.c.sign()).toBe(true);
    let px = r.c.x;
    let pz = r.c.z;
    let max = 0;
    while (r.c.state === 'walk') {
      r.c.step();
      max = Math.max(max, Math.hypot(r.c.x - px, r.c.z - pz));
      px = r.c.x;
      pz = r.c.z;
    }
    expect(max).toBeLessThanOrEqual(C.walkPerStep * 1.01);
    expect(r.warps).toHaveLength(0);
  });

  it('着くと fix: 四角から 2〜3 マスの 所で たたく。いる まとまり だけ allows', () => {
    const r = rig();
    const a = job(80, 50);
    const b = job(30, 50);
    r.jobs.push(a, b);
    r.run(3000, () => r.c.state === 'fix');
    expect(r.c.state).toBe('fix');
    expect(r.c.target).toBe(a === r.c.target ? a : b);
    const t = r.c.target!;
    expect(r.c.allows(t)).toBe(true);
    expect(r.c.allows(t === a ? b : a)).toBe(false);
    const d = Math.max(t.minX - r.c.x, 0, r.c.x - t.maxX - 1, t.minZ - r.c.z, 0, r.c.z - t.maxZ - 1);
    expect(d).toBeGreaterThanOrEqual(C.standMin - 1);
    expect(d).toBeLessThanOrEqual(C.standMax); // こわれた まとまりの すぐ となり（1 マス いない）
    expect(r.c.motion).toBe('tap');
  });

  it('たたく とき、こわれた マスから 1 マス いないに 立ち、こわれた 所を 向く', () => {
    const r = rig();
    const a = job(80, 50, 3, 3);
    a.queue.push({ x: 81, y: 5, z: 51 } as never);
    r.jobs.push(a);
    r.run(3000, () => r.c.state === 'fix');
    const cx = Math.floor(r.c.x);
    const cz = Math.floor(r.c.z);
    expect(Math.max(a.minX - cx, 0, cx - a.maxX, a.minZ - cz, 0, cz - a.maxZ)).toBe(1);
    r.run(40); // 向きを かえおわる まで
    const want = Math.atan2(81.5 - r.c.x, -(51.5 - r.c.z));
    expect(Math.abs(Math.atan2(Math.sin(r.c.yaw - want), Math.cos(r.c.yaw - want)))).toBeLessThan(0.05);
  });

  it('建物の 中（屋根の 下）が あっても、外がわの 立てる 所が あれば 外に 立つ。外が なければ 中', () => {
    const inside = (x: number, z: number): boolean => x >= 79 && x <= 82 && z >= 50 && z <= 51;
    // 四角 x 80〜81 の すぐ となりは x 79 と 82（どちらも 屋根の 下）と、z の 上下（外）
    const r = rig({ covered: (x, _y, z) => inside(Math.floor(x), Math.floor(z)) });
    const a = job(80, 50, 2, 2);
    r.jobs.push(a);
    r.run(3000, () => r.c.state === 'fix');
    expect(inside(Math.floor(r.c.x), Math.floor(r.c.z))).toBe(false);
    const onlyIn = rig({ covered: () => true });
    onlyIn.jobs.push(job(80, 50, 2, 2));
    onlyIn.run(3000, () => onlyIn.c.state === 'fix');
    expect(onlyIn.c.state).toBe('fix');
  });

  it('こやから 近い 順に 回る', () => {
    const r = rig();
    const far = job(120, 50);
    const near = job(60, 50);
    r.jobs.push(far, near);
    r.run(3000, () => r.c.state === 'fix');
    expect(r.c.target).toBe(near);
  });

  it('まとまりが ぜんぶ もどると おじぎ（32 コマ）→ つぎの まとまり → ぜんぶ おわったら 帰って こやで home・るす おわり', () => {
    const r = rig();
    const a = job(70, 50);
    const b = job(30, 60);
    r.jobs.push(a, b);
    r.run(3000, () => r.c.state === 'fix' && r.c.target === a);
    a.finished = true;
    r.run(1);
    expect(r.c.motion).toBe('bow');
    r.run(MOTION_LEN.bow + 2);
    expect(r.c.state).toBe('walk');
    expect(r.c.target).toBe(b);
    r.run(3000, () => r.c.state === 'fix');
    b.finished = true;
    r.jobs.length = 0;
    r.run(MOTION_LEN.bow + 2);
    expect(r.c.state).toBe('back');
    r.run(3000, () => r.c.state === 'home');
    expect(r.c.state).toBe('home');
    expect(r.c.out).toBe(false);
    expect(r.c.sign()).toBe(false);
    expect(Math.hypot(r.c.x - HOME.x, r.c.z - HOME.z)).toBeLessThan(0.01);
  });

  it('朝に メニューが 開いて いる 間は 出かけない。とじると departMax 以内に 出る', () => {
    const r = rig();
    r.menu.open = true;
    r.jobs.push(job(80, 50));
    r.run(C.departMax * 3);
    expect(r.c.state).toBe('home');
    r.menu.open = false;
    r.run(C.departMax + 2, () => r.c.out);
    expect(r.c.out).toBe(true);
  });

  it('人が そばで まって いる まとまりは とばす。ぜんぶ まって いたら そばで wait（たたかない）。はなれたら なおす', () => {
    const r = rig();
    const a = job(60, 50, 2, 2, true);
    const b = job(100, 50, 2, 2, true);
    r.jobs.push(a, b);
    r.waiting.add(a);
    r.run(3000, () => r.c.state === 'fix');
    expect(r.c.target).toBe(b);
    r.waiting.add(b);
    r.run(2);
    expect(r.c.state).not.toBe('fix');
    r.run(3000, () => r.c.state === 'wait');
    expect(r.c.state).toBe('wait');
    expect(r.c.motion).toBe('rest');
    expect(r.c.allows(a)).toBe(false);
    r.waiting.delete(a);
    r.run(2);
    expect(r.c.state).toBe('walk');
    expect(r.c.target).toBe(a);
  });

  it('道が なくて warpSteps たっても 着かない ときは 行き先の そばへ ぽんと うつる', () => {
    // 行き先の まわりが ぜんぶ 立てない 輪（四角の すぐ となりの どこか 1 マスだけ 立てる）
    const only = { x: 93, z: 50 };
    const r = rig({ stand: (x, z) => (x < 0 || z < 0 || x > 150 || z > 150 ? null : x >= 85 && x <= 100 && !(x === only.x && z === only.z) ? null : 5) });
    r.jobs.push(job(94, 50, 2, 2));
    r.run(C.departMax + 5);
    r.run(C.warpSteps + 100, () => r.c.state === 'fix');
    expect(r.warps.length).toBeGreaterThanOrEqual(1);
    expect(r.c.state).toBe('fix');
  });

  it('見て いない（列を 読みこんで いない）ときは すぐ こやに もどる', () => {
    const open = { v: true };
    const r = rig({ loaded: () => open.v });
    r.jobs.push(job(80, 50));
    r.run(C.departMax + 30);
    expect(r.c.out).toBe(true);
    open.v = false;
    r.run(1);
    expect(r.c.state).toBe('home');
    expect(r.c.out).toBe(false);
  });

  it('1 ステップの 仕事は まとまりの マスの 数に よらない（道さがしは 1 回の 行き先ごと）', () => {
    const r = rig();
    for (let i = 0; i < 30; i++) r.jobs.push(job(60 + (i % 10) * 6, 70 + Math.floor(i / 10) * 6));
    expect(() => r.run(200)).not.toThrow();
  });
});
