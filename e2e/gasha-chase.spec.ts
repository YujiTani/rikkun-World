import { test, expect } from '@playwright/test';
import { openGasha } from './helpers/gasha';
import { TUNE } from '../src/proto/gashaBigTuning';

/**
 * #293 怒った がしゃどくろは 追いかける: うしろに 回ると 振り返る・近づきすぎると 止まる・出現した 高さを 保つ（地面が 掘られても 落ちない）。
 * 攻撃サイクルは 切って（attack.enabled = false）、追う 動きだけを 見る。時間では 待たず、コマで 進める。
 */
test.describe.configure({ timeout: 300_000 });

const C = TUNE.chase;

/** 体を 出して 怒らせ、player の 場所に 立ち続けながら frames コマ 進める。途中の 体の 場所を 記録して 返す */
async function chase(page: import('@playwright/test').Page, o: { distance: number; angleDeg?: number; player: { dx: number; dz: number }; frames: number; every?: number; before?: string }) {
  return page.evaluate(async (o) => {
    const gt = (window as any).__gt, h = gt.h;
    await gt.spawn({ distance: o.distance, angleDeg: o.angleDeg ?? -90 });
    const g = gt.big();
    g.walk(false);
    g.tune({ attack: { enabled: false } });
    const b0 = gt.boss();
    const P = { x: b0.x + o.player.dx, z: b0.z + o.player.dz };
    if (o.before) new Function('gt', 'h', o.before)(gt, h);
    gt.put(P.x, P.z); gt.heal();
    g.hit();
    const log: { f: number; x: number; y: number; z: number; yawDeg: number; dist: number }[] = [];
    const every = o.every ?? 60;
    for (let f = 0; f <= o.frames; f++) {
      gt.put(P.x, P.z); gt.heal();
      if (f % every === 0) { const b = gt.boss(); log.push({ f, x: b.x, y: b.y, z: b.z, yawDeg: b.yawDeg, dist: Math.hypot(P.x - b.x, P.z - b.z) }); }
      h.step(1);
    }
    return { b0, P, log };
  }, o);
}

/** プレイヤーの 方向の 角度（体の yawDeg と おなじ 約束: atan2(dx, dz)） */
const bearing = (from: { x: number; z: number }, to: { x: number; z: number }): number => (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI;
const angDiff = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

test.describe('追いかける', () => {
  test('うしろに 回られても 振り返る（体が プレイヤーの 方を 向く）', async ({ page }) => {
    const errs = await openGasha(page);
    // 体は +z（手前）を 向いて 出る。プレイヤーは その 真うしろ（-z がわ）に 40 ブロック
    const r = await chase(page, { distance: 40, player: { dx: 0, dz: -40 }, frames: 2700, every: 300 });
    const first = r.log[0]!, last = r.log[r.log.length - 1]!;
    // はじめは うしろ向き（ずれが 大きい）、さいごは ほぼ まっすぐ プレイヤーの 方
    expect(angDiff(first.yawDeg, bearing(first, r.P))).toBeGreaterThan(150);
    expect(angDiff(last.yawDeg, bearing(last, r.P))).toBeLessThan(20);
    // 向きは じわじわ 近づく（途中で 行ったり きたり しない）
    const errsDeg = r.log.map((l) => angDiff(l.yawDeg, bearing(l, r.P)));
    for (let i = 1; i < errsDeg.length; i++) expect(errsDeg[i]!).toBeLessThanOrEqual(errsDeg[i - 1]! + 5);
    expect(errs).toEqual([]);
  });

  test('近すぎる（止まる 距離いない）と 動かない', async ({ page }) => {
    const errs = await openGasha(page);
    const r = await chase(page, { distance: 40, player: { dx: 0, dz: C.stopDist - 5 }, frames: 600, every: 300 });
    const first = r.log[0]!, last = r.log[r.log.length - 1]!;
    expect(Math.hypot(last.x - first.x, last.z - first.z)).toBeLessThan(0.5);
    expect(errs).toEqual([]);
  });

  test('遠いと 近づき、止まったら そこで 立ち止まる（プレイヤーに 重ならない）', async ({ page }) => {
    const errs = await openGasha(page);
    const r = await chase(page, { distance: 60, player: { dx: 0, dz: 60 }, frames: 3600, every: 300 });
    const first = r.log[0]!, last = r.log[r.log.length - 1]!;
    expect(last.dist).toBeLessThan(first.dist - 20); // 近づいた
    expect(last.dist).toBeGreaterThan(8); // 重ならない
    // さいごの 1200 コマは 動かない
    const tail = r.log.filter((l) => l.f >= 2400);
    for (const l of tail) expect(Math.hypot(l.x - last.x, l.z - last.z)).toBeLessThan(0.2);
    expect(errs).toEqual([]);
  });

  test('出現した 高さを 保つ: 進む 先の 地面が 深く 掘られても、高く もられても 体の 高さは かわらない', async ({ page }) => {
    const errs = await openGasha(page);
    const r = await chase(page, {
      distance: 60, player: { dx: 0, dz: 60 }, frames: 2400, every: 300,
      // 進む 道（体の 前 10〜45 ブロック）の 左半分を 深さ 12 掘り、右半分は 6 ブロック もる
      before: `const b = gt.boss(); const top = gt.groundTop(b.x, b.z + 20);
        h.world.fill(Math.floor(b.x) - 14, top - 13, Math.floor(b.z) + 10, Math.floor(b.x), top + 12, Math.floor(b.z) + 45, 'air');
        h.world.fill(Math.floor(b.x) + 1, top, Math.floor(b.z) + 10, Math.floor(b.x) + 14, top + 5, Math.floor(b.z) + 45, 'stone');`,
    });
    const first = r.log[0]!;
    const moved = r.log.some((l) => Math.hypot(l.x - first.x, l.z - first.z) > 8);
    expect(moved, '進んだ').toBe(true);
    for (const l of r.log) expect(l.y, `コマ ${l.f}`).toBeCloseTo(first.y, 3);
    expect(errs).toEqual([]);
  });
});
