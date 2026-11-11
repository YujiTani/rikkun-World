// GASHA-FIX-3 §3: コアの 高さ(下から 刀が とどかない)と 登り道(段差・すきま・はば)を 全姿勢で 調べる
import { describe, expect, it } from 'vitest';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { BigActor } from './gashaBigActor';
import { TUNE as T } from './gashaBigTuning';
import { buildBig } from './gashaBig';
import { apexOf } from './gashaGeyserField';

const mk = (): BigActor => {
  const ply = { x: 500, y: 1, z: 500, yawDeg: 0 };
  const a = new BigActor(buildBig(), { climbUp, climbDown, lookBack } as never, { groundY: () => -1, player: () => ply }, 293);
  a.place(0, 0, 0, 0.8);
  return a;
};

/** 姿勢ごとに 見る コマ: 休み・はって 進む(22 秒)・首を 振る・怒る。fn は 間引いた コマで 呼ぶ */
function eachPose(a: BigActor, fn: (tag: string) => void): void {
  a.update(1 / 60); fn('rest');
  a.walk(true); a.goTo(0, 300);
  for (let t = 0; t < 60 * 22; t++) { a.update(1 / 60); if (t % 60 === 0) fn(`crawl${t}`); }
  a.walk(false); a.lookBack();
  for (let t = 0; t < 360; t++) { a.update(1 / 60); if (t % 30 === 0) fn(`look${t}`); }
  a.hit();
  for (let t = 0; t < 240; t++) { a.update(1 / 60); if (t % 30 === 0) fn(`angry${t}`); }
}

const boxOf = (a: BigActor, name: string) => a.boxList[a.model.hits.findIndex((h) => h.name === name)]!;
const absSum = (b: { ax: ArrayLike<number>; half: ArrayLike<number> }, row: number) => Math.abs(b.ax[row]!) * b.half[0]! + Math.abs(b.ax[3 + row]!) * b.half[1]! + Math.abs(b.ax[6 + row]!) * b.half[2]!;
/** 地面から 目(立った / ジャンプ)の 点で、コアの 箱まで の いちばん 近い 距離 */
function coreReach(a: BigActor): number {
  const b = boxOf(a, 'core'), G = T.core.reach;
  let best = 99;
  for (let i = -45; i <= 45; i++) for (let k = -45; k <= 45; k++) {
    if (a.solid(i, 0, k) || a.solid(i, 1, k)) continue; // 立てない 所
    const d = [i + 0.5 - b.c[0]!, G.eye + G.jump - b.c[1]!, k + 0.5 - b.c[2]!];
    let s2 = 0;
    for (let q = 0; q < 3; q++) { const u = d[0]! * b.ax[q * 3]! + d[1]! * b.ax[q * 3 + 1]! + d[2]! * b.ax[q * 3 + 2]!; const o = Math.max(0, Math.abs(u) - b.half[q]!); s2 += o * o; }
    best = Math.min(best, Math.sqrt(s2));
  }
  return best;
}

type Cl = { n: string; top: number; cx: number; cz: number; hx: number; hz: number };
function clouds(a: BigActor, re: RegExp): Cl[] {
  const o: Cl[] = [];
  a.model.hits.forEach((h, i) => {
    if (!re.test(h.name)) return;
    const b = a.boxList[i]!;
    o.push({ n: h.name, top: b.c[1]! + absSum(b, 1), cx: b.c[0]!, cz: b.c[2]!, hx: absSum(b, 0), hz: absSum(b, 2) });
  });
  return o;
}
const gapOf = (p: Cl, q: Cl) => Math.hypot(Math.max(0, Math.abs(p.cx - q.cx) - p.hx - q.hx), Math.max(0, Math.abs(p.cz - q.cz) - p.hz - q.hz));
/** 各 足場に ついて 「いちばん つなぎやすい 相手」への 段差・すきま。つなぎやすさは 上限との 比の 大きい ほうで くらべる */
function worstLink(cs: Cl[]): { step: number; gap: number; width: number } {
  const C = T.climb;
  let step = 0, gap = 0, width = 99;
  for (const c of cs) {
    let best = { st: 99, gp: 99 };
    for (const d of cs) {
      if (d === c) continue;
      const st = Math.abs(c.top - d.top), gp = gapOf(c, d);
      if (Math.max(st / C.maxStep, gp / C.maxGap) < Math.max(best.st / C.maxStep, best.gp / C.maxGap)) best = { st, gp };
    }
    step = Math.max(step, best.st); gap = Math.max(gap, best.gp); width = Math.min(width, Math.min(c.hx, c.hz) * 2);
  }
  return { step, gap, width };
}

describe('コアは 下から 刀が とどかない(全姿勢)', () => {
  it('調整表: 最低の 高さは 目 + ジャンプ + 刀の とどき より 高い', () => {
    const R = T.core.reach;
    expect(R.minGroundClear).toBeGreaterThan(R.eye + R.jump + R.swordReach);
  });

  it('コアの 箱の 下の 面は どの 姿勢でも 地面から minGroundClear いじょう(休み・はう・首ふり・怒る)', () => {
    const a = mk(); let min = 99;
    eachPose(a, (tag) => { const b = boxOf(a, 'core'), bot = b.c[1]! - absSum(b, 1); min = Math.min(min, bot); expect(bot, tag).toBeGreaterThanOrEqual(T.core.reach.minGroundClear); });
    expect(min).toBeGreaterThanOrEqual(T.core.reach.minGroundClear);
  }, 120_000);

  it('地面に 立って ジャンプした 目から コアの 箱まで、刀の とどき より 遠い(どの コマでも)', () => {
    const a = mk();
    eachPose(a, (tag) => { expect(coreReach(a), tag).toBeGreaterThan(T.core.reach.swordReach); });
  }, 120_000);
});

describe('登り道: 間欠泉 → 肩 → 背中の 雲の 道(全姿勢)', () => {
  it('肩の 雲・雲の 道は 段差 maxStep・すきま maxGap いない、はば minWidth いじょう', () => {
    const C = T.climb, a = mk();
    eachPose(a, (tag) => {
      for (const [k, re] of [['肩', /^shoulderL\d+$/], ['雲の 道', /^(shoulderL3|riseL\d+)$/]] as [string, RegExp][]) {
        const w = worstLink(clouds(a, re));
        expect(w.step, `${tag} ${k} 段差`).toBeLessThanOrEqual(C.maxStep);
        expect(w.gap, `${tag} ${k} すきま`).toBeLessThanOrEqual(C.maxGap);
        expect(w.width, `${tag} ${k} はば`).toBeGreaterThanOrEqual(C.minWidth);
      }
    });
  }, 120_000);

  it('間欠泉で 飛んだ 高さの 上は、どの 姿勢の 肩の 上の 面より geyserMargin いじょう 上', () => {
    const a = mk(); let top = 0;
    eachPose(a, () => { for (const c of clouds(a, /^shoulder[LR]\d+$/)) top = Math.max(top, c.top); });
    const apex = apexOf({ top: T.geyser.height });
    expect(apex - top).toBeGreaterThanOrEqual(T.climb.geyserMargin);
  }, 120_000);
});
