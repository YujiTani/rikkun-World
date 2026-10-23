import { expect, test, type Page } from '@playwright/test';
import { aimAtBlock, installAimHelpers } from './helpers/aim';
import { holdItems, openBladeWorld, spawnAhead, stage, takeKatana } from './helpers/blade';
import { comboWorld, mash } from './helpers/combo';
import { impactHookShape, probe, spawnTitled, TAP, watch, type ImpactSnap } from './helpers/impact';
import { NIJI, holdNiji } from './helpers/niji';
import { RAIJIN, chargeUntilReady, legendWorld, aimGroundAhead, spawnAt } from './helpers/legend';

/**
 * HIT-1 ヒットストップと 画面の ゆれ（#276）。仕様: docs/tickets/HIT-1.md の AC1〜AC11。
 * 数は ゲームに 聞く: 止まりの のこり `impact.stopLeft()`・ゆれの 量 `impact.trauma()`・当たりの 記録 `impact.log()`
 * （[{ tick, level: 'mid' | 'large' }]）。tick は `tick()`。時間（ms）では 合否を 決めない。
 * 「何ステップ 止まったか」は 当たりの 次の ステップから 数えて tick が 進まない 間（helpers/impact.ts の probe）。
 *
 * このファイルで 見る:  AC1（中・大・小）・AC2・AC3・AC4・AC5（trauma の 比）・AC7・AC8・AC9・AC10・AC11
 * developer が ユニットで 見る（src/fx/impact.test.ts など）:
 *   - AC5 の 「カメラの ずれは trauma² に 比例」の 波の 式そのもの（shakeAngles(trauma, t)）。E2E では 中と 大の trauma の 比から (比)² ≦ 0.2 だけ 見る
 *   - AC6 なめらか（1 ステップごとの 変わり方・最大の ずれ yaw 1.2°・pitch 0.8°・roll 0.4°）。カメラの 向きは 窓口に 出ない ので ユニット
 *   - 段の 判定表（impactOf）・同じ ステップの まとめ（ImpactBus: 一番 長い 1 回）・Game.hitStop の max
 * ためわざの らせん（風神剣）は 窓口に 当たりの 出来事が まだ ない ので ユニットで 見る（真空波は ここで 見る）。
 */
test.describe.configure({ timeout: 120_000 });

/** 刀を 持って 平らな 地面に 立つ。floorY を 返す */
async function katanaWorld(page: Page, stance: 'chudan' | 'jodan' | 'gedan' = 'chudan', item = 'katana'): Promise<void> {
  await openBladeWorld(page);
  await takeKatana(page, stance, item);
  await stage(page);
}

const sameVec = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
  expect(a.z).toBeCloseTo(b.z, 6);
};

/** 止まって いた 間（当たりの 次から frozen こ）の きろく */
const frozenSnaps = (r: { post: ImpactSnap[]; frozen: number }) => r.post.slice(0, r.frozen);

test.describe('HIT-1 AC11 テストの 窓口', () => {
  test('AC11: impact.stopLeft() / trauma() / log() が 読める（はじめは 0・0・空）', async ({ page }) => {
    await katanaWorld(page);
    const h = await impactHookShape(page);
    expect(h, 'window.__rikkun.impact が まだ ない').not.toBeNull();
    expect(h!.stop).toBe(0);
    expect(h!.trauma).toBe(0);
    expect(h!.log).toEqual([]);
  });

  test('AC11: 当たると log に { tick: 数, level: "mid" | "large" } が 1 つ ふえる', async ({ page }) => {
    await katanaWorld(page, 'chudan');
    await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    const r = await probe(page, { before: TAP, max: 40, after: 1 });
    expect(r.hit, '突きが 当たる').not.toBeNull();
    const log = await page.evaluate(() => (window.__rikkun as any).impact.log() as { tick: number; level: string }[]);
    expect(log).toHaveLength(1);
    expect(typeof log[0]!.tick).toBe('number');
    expect(['mid', 'large']).toContain(log[0]!.level);
  });
});

test.describe('HIT-1 AC1 止まる 長さ', () => {
  test('AC1: 中（刀の 突き）→ ちょうど 3 ステップ 止まる。tick・刀の コマ・人・妖怪は 動かず、そのあと 進む', async ({ page }) => {
    await katanaWorld(page, 'chudan');
    const id = await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    const r = await probe(page, { before: TAP, max: 40, after: 12 });
    expect(r.hit, '突きが 当たる').not.toBeNull();
    expect(r.level).toBe('mid');
    expect(r.hit!.stop, '当たった ステップの おわりに のこり 3').toBe(3);
    expect(r.frozen, 'ちょうど 3 ステップ 止まる').toBe(3);
    for (const s of frozenSnaps(r)) {
      expect(s.tick, 'tick が 進まない').toBe(r.hit!.tick);
      expect(s.bladeF, '刀の コマが 進まない').toBe(r.hit!.bladeF);
      sameVec(s.pos, r.hit!.pos);
      const y = s.yokai.find((q) => q.id === id)!;
      const y0 = r.hit!.yokai.find((q) => q.id === id)!;
      sameVec(y, y0);
      expect(y.hp, '体力が かわらない').toBe(y0.hp);
    }
    expect(r.post.map((s) => s.stop).slice(0, 4), '止まりの のこりが 1 つずつ へる').toEqual([2, 1, 0, 0]);
    const after = r.post[3]!;
    expect(after.tick, '止まりが おわった ステップから 世界が 進む').toBe(r.hit!.tick + 1);
    expect(after.bladeF).toBeGreaterThan(r.hit!.bladeF);
  });

  test('AC1: 大（二つ名・ヌシ）への ヒット → ちょうど 7 ステップ', async ({ page }) => {
    await katanaWorld(page, 'chudan');
    await spawnTitled(page, 1.5, 'nushi');
    const r = await probe(page, { before: TAP, max: 40, after: 12 });
    expect(r.hit).not.toBeNull();
    expect(r.level).toBe('large');
    expect(r.hit!.stop).toBe(7);
    expect(r.frozen, 'ちょうど 7 ステップ').toBe(7);
    expect(r.post[7]!.tick).toBe(r.hit!.tick + 1);
  });

  for (const title of ['oyabun', 'taisho'] as const) {
    test(`AC1: 二つ名 ${title} への ヒットも 大（7 ステップ）`, async ({ page }) => {
      await katanaWorld(page, 'chudan');
      await spawnTitled(page, 1.5, title);
      const r = await probe(page, { before: TAP, max: 40, after: 10 });
      expect(r.level).toBe('large');
      expect(r.frozen).toBe(7);
    });
  }

  test('AC1: 妖怪を たおした → 大（7 ステップ）。ふつうの 当たり（中）と 同じ ステップでも 1 回', async ({ page }) => {
    await katanaWorld(page, 'chudan');
    await spawnAhead(page, 'karakasa', 1.5, { hp: 1 });
    const r = await probe(page, { before: TAP, max: 40, after: 10 });
    expect(r.hit).not.toBeNull();
    const gone = r.hit!.yokai.length === 0 || r.hit!.yokai[0]!.hp <= 0;
    expect(gone, '一発で たおれる').toBe(true);
    expect(r.level).toBe('large');
    expect(r.frozen).toBe(7);
    expect(r.hit!.logLen - r.pre.logLen, '記録は 1 つ').toBe(1);
  });

  test('AC1: 刀の 3 段（中・中・大）: 1・2 段目は 3、3 段目は 7', async ({ page }) => {
    await comboWorld(page, 'chudan', 'crystal_katana');
    await spawnAhead(page, 'nurikabe', 1.5, { hp: 9999 }); // ぬりかべは 押されない ので 3 回とも 当たる
    const rec = await mash(page, 260);
    const hitTicks: Record<number, number> = {};
    for (const s of rec) for (const e of s.events) if (e.type === 'techHit' && e.step && hitTicks[e.step] === undefined) hitTicks[e.step] = e.tick;
    expect(Object.keys(hitTicks).sort(), '1・2・3 段目が 当たる').toEqual(['1', '2', '3']);
    const log = await page.evaluate(() => (window.__rikkun as any).impact.log() as { tick: number; level: string }[]);
    // tick は ±1 の ずれを 許す（記録は 当たりを 見つけた ステップの tick）
    const levelAt = (t: number) => [...new Set(log.filter((l) => Math.abs(l.tick - t) <= 1).map((l) => l.level))];
    expect(levelAt(hitTicks[1]!), '1 段目').toEqual(['mid']);
    expect(levelAt(hitTicks[2]!), '2 段目').toEqual(['mid']);
    expect(levelAt(hitTicks[3]!), '3 段目').toEqual(['large']);
  });

  test('AC1: 素手の パンチが 当たる → 中（3 ステップ）', async ({ page }) => {
    await openBladeWorld(page);
    await stage(page);
    await page.evaluate(() => (window.__rikkun as any).inventory.clear());
    const id = await spawnAhead(page, 'karakasa', 1.0, { hp: 400 });
    const r = await probe(page, { before: TAP, max: 60, after: 8 });
    const hp = await page.evaluate((id) => (window.__rikkun as any).yokai.list().find((y: any) => y.id === id)?.hp as number, id);
    expect(hp, 'パンチで 体力が へる（前提）').toBeLessThan(400);
    expect(r.hit).not.toBeNull();
    expect(r.level).toBe('mid');
    expect(r.frozen).toBe(3);
  });

  test('AC1: 弓の 矢が 当たる → 中（3 ステップ）', async ({ page }) => {
    await openBladeWorld(page);
    await stage(page);
    await holdItems(page, [{ item: 'yumi' }, { item: 'ya', count: 10 }]);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const p = h.player.get().position;
      h.yokai.spawn('karakasa', p.x, p.y, p.z - 4, { ai: false });
      h.yokai.list().forEach((y: any) => h.yokai.setHp(y.id, 9999));
      h.player.set({ yaw: 0, pitch: 0 });
      h.step(15);
    });
    // 引いて（45 ステップ）はなす。矢が 当たる まで 進める（当たったか は bow.events() で 聞く）
    const r = await probe(page, {
      before: `(h, i) => { if (i === 0) h.input.press('primary'); if (i === 45) h.input.release('primary'); }`,
      max: 200,
      after: 8,
    });
    const arrowHits = await page.evaluate(() => (window.__rikkun as any).bow.events().filter((e: any) => e.type === 'arrowHit').length as number);
    expect(arrowHits, '矢が 妖怪に 当たる').toBeGreaterThanOrEqual(1);
    expect(r.hit).not.toBeNull();
    expect(r.level).toBe('mid');
    expect(r.frozen).toBe(3);
  });

  test('AC1: 大（雷の ためわざ）の 最初の 当たり → 7 ステップ', async ({ page }) => {
    const floorY = await legendWorld(page, RAIJIN);
    await aimGroundAhead(page, floorY, 8);
    const ready = await chargeUntilReady(page, 60);
    const S = ready[ready.length - 1]!.aim!.S!;
    await spawnAt(page, 'karakasa', S.x + 3.0, S.y, S.z, 9999);
    const r = await probe(page, { before: `(h, i) => { if (i === 0) h.input.release('primary'); }`, max: 40, after: 12 });
    const strikes = await page.evaluate(() => (window.__rikkun as any).legend.events().filter((e: any) => e.type === 'lightningStrike' && e.hits.length > 0).length as number);
    expect(strikes, '雷が 妖怪に 当たる').toBeGreaterThanOrEqual(1);
    expect(r.hit).not.toBeNull();
    expect(r.level).toBe('large');
    expect(r.frozen).toBe(7);
  });

  test('AC1: 小（ブロックを ほる）は 止まらない・記録も ふえない', async ({ page }) => {
    await openBladeWorld(page);
    await installAimHelpers(page);
    const { floorY } = await stage(page);
    const z = Math.floor(20.5 - 2);
    await page.evaluate(({ y, z }) => {
      const h = window.__rikkun as any;
      h.inventory.clear();
      h.world.fill(20, y, z, 20, y, z, 'dirt'); // すぐ ほれる ブロック
    }, { y: floorY, z });
    await aimAtBlock(page, 20, floorY, z, 1);
    const rec = await watch(page, 120, `(h, i) => { if (i === 0) h.input.press('primary'); if (i === 40) { h.input.release('primary'); h.input.press('primary'); } if (i === 80) h.input.release('primary'); }`); // ready に なったら もう 1 回 押して こわす
    const block = await page.evaluate(({ y, z }) => (window.__rikkun as any).world.getBlock(20, y, z), { y: floorY, z });
    expect([0, 'air', null, undefined], 'ブロックが ほれた').toContain(block);
    expect(Math.max(...rec.map((s) => s.stop)), '止まらない').toBe(0);
    expect(rec[rec.length - 1]!.logLen, '記録は 空').toBe(0);
    // tick は 1 ステップごとに 進む
    for (let i = 1; i < rec.length; i++) expect(rec[i]!.tick - rec[i - 1]!.tick).toBe(1);
  });
});

test.describe('HIT-1 AC2 1 回だけ', () => {
  test('AC2: 同じ ステップに 2 体 当たっても 止まるのは 1 回（3 ステップ）。止まって いる 間は 新しい 当たりが ない', async ({ page }) => {
    await katanaWorld(page, 'gedan'); // 切り上げは はばが ひろく、ならんだ 妖怪に 同じ ステップで 当たる
    const a = await spawnAhead(page, 'karakasa', 1.5, { side: -0.4, hp: 400 });
    const b = await spawnAhead(page, 'karakasa', 1.5, { side: 0.4, hp: 400 });
    const r = await probe(page, { before: TAP, max: 40, after: 12 });
    expect(r.hit).not.toBeNull();
    expect(r.hit!.hits - r.pre.hits, '同じ ステップに 2 体 当たる（前提）').toBeGreaterThanOrEqual(2);
    expect(r.level).toBe('mid');
    expect(r.hit!.logLen - r.pre.logLen, '記録は 1 つ').toBe(1);
    expect(r.frozen, '止まりは 重ならず 3 ステップ').toBe(3);
    for (const s of frozenSnaps(r)) {
      expect(s.hits, '止まって いる 間に 新しい 当たりは ない').toBe(r.hit!.hits);
      expect(s.logLen).toBe(r.hit!.logLen);
      for (const id of [a, b]) expect(s.yokai.find((q) => q.id === id)!.hp).toBe(r.hit!.yokai.find((q) => q.id === id)!.hp);
    }
  });

  test('AC2: 中と 大が 同じ ステップ（二つ名と ふつうの 妖怪）→ 長い ほう 1 回（7 ステップ）', async ({ page }) => {
    await katanaWorld(page, 'gedan');
    await spawnAhead(page, 'karakasa', 1.5, { side: -0.4, hp: 400 });
    await spawnTitled(page, 1.5, 'nushi', 9999, 0.4);
    const r = await probe(page, { before: TAP, max: 40, after: 12 });
    expect(r.hit!.hits - r.pre.hits, '2 体 当たる（前提）').toBeGreaterThanOrEqual(2);
    expect(r.level).toBe('large');
    expect(r.hit!.logLen - r.pre.logLen).toBe(1);
    expect(r.frozen).toBe(7);
  });
});

test.describe('HIT-1 AC3 ボタン', () => {
  test('AC3: 止まって いる 間に 押して はなした ボタンは、止まりが 終わった ステップで 受けつけられる', async ({ page }) => {
    await katanaWorld(page, 'chudan');
    await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.inventory.setSlot(1, { item: 'bokuto', count: 1 });
    });
    // 止まりの 1 ステップ目の 前に ホットバー 2 を 押して すぐ はなす（1 ステップの 間に 押して はなした ボタン）
    const r = await probe(page, {
      before: TAP,
      during: `(h, k) => { if (k === 0) { h.input.press('hotbar2'); h.input.release('hotbar2'); } }`,
      max: 40,
      after: 12,
    });
    expect(r.hit).not.toBeNull();
    expect(r.frozen).toBe(3);
    expect(r.hit!.selected, '押す 前は 0 番').toBe(0);
    for (const s of frozenSnaps(r)) expect(s.selected, '止まって いる 間は まだ').toBe(0);
    expect(r.post[r.frozen]!.selected, '止まりが 終わった ステップで 2 番に かわる（消えない）').toBe(1);
  });
});

test.describe('HIT-1 AC4 ゆれは カメラの 向きだけ', () => {
  test('AC4: 大の 当たりの あと ゆれて いる 間も カメラの 位置・肩の 点・人・妖怪・当たり判定は かわらない', async ({ page }) => {
    await katanaWorld(page, 'chudan');
    const id = await spawnTitled(page, 1.5, 'nushi');
    const r = await probe(page, { before: TAP, max: 40, after: 30 });
    expect(r.hit).not.toBeNull();
    const shaking = r.post.filter((s) => s.trauma > 0);
    expect(shaking.length, 'ゆれて いる ステップが ある（前提）').toBeGreaterThanOrEqual(10);
    const y0 = r.hit!.yokai.find((q) => q.id === id)!;
    for (const s of frozenSnaps(r)) {
      // 止まって いる 間（ゆれは 動いて いる）: 位置は ぜんぶ そのまま
      sameVec(s.pos, r.hit!.pos);
      sameVec(s.yokai.find((q) => q.id === id)!, y0);
      expect(s.shape).toBe(r.hit!.shape);
      for (const k of ['position', 'eye', 'pivot', 'shoulder'] as const) sameVec(s.cam[k], r.hit!.cam[k]);
    }
  });

  test('AC4: ゆれの 有る・無し（fxShake 1 と 0）で、同じ 動きを しても 人・妖怪・カメラの 位置・肩の 点が まったく 同じ', async ({ page }) => {
    const run = async (shake: number) => {
      await katanaWorld(page, 'chudan');
      await page.evaluate((v) => (window.__rikkun as any).settings.set('fxShake', v), shake);
      await spawnTitled(page, 1.5, 'nushi');
      return probe(page, { before: TAP, max: 40, after: 40 });
    };
    const on = await run(1);
    const off = await run(0);
    expect(on.post.some((s) => s.trauma > 0), 'ゆれて いる（前提）').toBe(true);
    expect(off.post.every((s) => s.trauma === 0), 'ゆれて いない（前提）').toBe(true);
    expect(on.post).toHaveLength(off.post.length);
    const shakingSteps = on.post.map((a, i) => ({ a, b: off.post[i]! })).filter(({ a }) => a.trauma > 0);
    expect(shakingSteps.length, 'ゆれて いる ステップが たくさん ある（前提）').toBeGreaterThanOrEqual(10);
    // trauma > 0 の すべての ステップで 人・妖怪・肩の 点（ねらいの 出どころ）が ゆれ無しと 同じ
    shakingSteps.forEach(({ a, b }) => {
      sameVec(a.pos, b.pos);
      sameVec(a.cam.shoulder, b.cam.shoulder);
      expect(a.yokai.map((q) => [q.x, q.y, q.z, q.hp])).toEqual(b.yokai.map((q) => [q.x, q.y, q.z, q.hp]));
      expect(a.shape).toBe(b.shape);
      for (const k of ['position', 'eye', 'pivot', 'shoulder'] as const) sameVec(a.cam[k], b.cam[k]);
    });
  });
});

test.describe('HIT-1 AC5 2 乗（trauma の 比）', () => {
  test('AC5: 中 1 回の trauma を 2 乗した ずれは、大 1 回の 2 割 以下（ずれの 波の 式は ユニット）', async ({ page }) => {
    await katanaWorld(page, 'chudan');
    await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    const mid = await probe(page, { before: TAP, max: 40, after: 0 });
    expect(mid.level).toBe('mid');
    const tMid = mid.hit!.trauma;
    await katanaWorld(page, 'chudan');
    await spawnTitled(page, 1.5, 'nushi');
    const large = await probe(page, { before: TAP, max: 40, after: 0 });
    expect(large.level).toBe('large');
    const tLarge = large.hit!.trauma;
    expect(tMid, '中も ゆれる').toBeGreaterThan(0);
    expect(tLarge).toBeGreaterThan(tMid);
    expect((tMid * tMid) / (tLarge * tLarge), '2 乗の 比').toBeLessThanOrEqual(0.2);
  });
});

test.describe('HIT-1 AC7 もとに もどる', () => {
  test('AC7: 大の 当たりから 60 ステップ 以内に trauma 0・止まり 0', async ({ page }) => {
    await katanaWorld(page, 'chudan');
    await spawnTitled(page, 1.5, 'nushi');
    const r = await probe(page, { before: TAP, max: 40, after: 60 });
    expect(r.hit).not.toBeNull();
    expect(r.hit!.trauma, '当たった とき は ゆれて いる').toBeGreaterThan(0);
    const calm = r.post.findIndex((s) => s.trauma === 0 && s.stop === 0);
    expect(calm, '60 ステップ 以内に おさまる').toBeGreaterThanOrEqual(0);
    for (const s of r.post.slice(calm)) {
      expect(s.trauma).toBe(0);
      expect(s.stop).toBe(0);
    }
  });
});

test.describe('HIT-1 AC8 設定', () => {
  test('AC8: fxShake = 0 なら ゆれない（止まりは ある）', async ({ page }) => {
    await katanaWorld(page, 'chudan');
    await page.evaluate(() => (window.__rikkun as any).settings.set('fxShake', 0));
    await spawnTitled(page, 1.5, 'nushi');
    const r = await probe(page, { before: TAP, max: 40, after: 30 });
    expect(r.hit).not.toBeNull();
    expect(r.level, '記録は のこる').toBe('large');
    expect(r.frozen, '止まりは ある').toBe(7);
    expect(r.hit!.trauma).toBe(0);
    for (const s of r.post) expect(s.trauma, 'ゆれない').toBe(0);
  });
});

test.describe('HIT-1 AC9 けさぎり', () => {
  test('AC9: けさぎりが 当たっても 画面（canvas）の transform は ゆれず、ゆれは カメラ（trauma）に まとまる', async ({ page }) => {
    await katanaWorld(page, 'jodan');
    await spawnAhead(page, 'karakasa', 2.0, { hp: 400 });
    const r = await probe(page, { before: TAP, max: 60, after: 30 });
    expect(r.hit, 'けさぎりが 当たる').not.toBeNull();
    expect(r.hit!.trauma, 'カメラが ゆれる').toBeGreaterThan(0);
    for (const s of [r.pre, r.hit!, ...r.post]) for (const t of s.canvasTransform) expect(t, 'DOM の ずれは なし').toBe('');
  });

  test('AC9: 設定 fxShake を 0 → 1 に 戻しても 同じ（canvas の transform は いつも 空）', async ({ page }) => {
    await katanaWorld(page, 'jodan');
    await page.evaluate(() => (window.__rikkun as any).settings.set('fxShake', 1));
    await spawnAhead(page, 'karakasa', 2.0, { hp: 400 });
    await page.evaluate(() => (window.__rikkun as any).settings.set('fxShake', 0));
    await page.evaluate(() => (window.__rikkun as any).settings.set('fxShake', 1)); // 0 → 1 に もどす
    expect(await page.evaluate(() => (window.__rikkun as any).settings.get('fxShake'))).toBe(1);
    const rec = await watch(page, 80, TAP);
    expect(rec[rec.length - 1]!.logLen, 'けさぎりが 当たった（記録が ふえた）').toBeGreaterThan(0);
    expect(Math.max(...rec.map((x) => x.trauma)), 'ゆれは カメラに').toBeGreaterThan(0);
    for (const s of rec) for (const t of s.canvasTransform) expect(t).toBe('');
  });
});

test.describe('HIT-1 AC10 ためわざの くり返し', () => {
  test('AC10: シャイニングの ドーム: 止まるのは 最初の 当たりの 1 回（大）だけ。2 回目から 止まらない', async ({ page }) => {
    await legendWorld(page, NIJI);
    await holdNiji(page, 10);
    const p = await page.evaluate(() => (window.__rikkun as any).player.get().position as { x: number; y: number; z: number });
    await spawnAt(page, 'nurikabe', p.x, p.y, p.z - 3, 99999); // ぬりかべは 押されない ので ドームが 何度も 当たる
    const r = await page.evaluate(() => {
      const h = window.__rikkun as any;
      const ev0 = h.legend.events().length;
      h.input.press('primary');
      h.step(150); // ため
      h.input.release('primary');
      let episodes = 0;
      let prev = 0;
      let maxStop = 0;
      for (let i = 0; i < 400; i++) {
        h.step(1);
        const s = h.impact.stopLeft();
        if (s > 0 && prev === 0) episodes++;
        prev = s;
        maxStop = Math.max(maxStop, s);
      }
      const domeHits = h.legend.events().slice(ev0).filter((e: any) => e.type === 'domeHit').length;
      return { episodes, maxStop, domeHits, log: h.impact.log() as { tick: number; level: string }[] };
    });
    expect(r.domeHits, 'ドームは 何度も 当たる（前提）').toBeGreaterThanOrEqual(2);
    expect(r.episodes, '止まるのは 1 回だけ').toBe(1);
    expect(r.maxStop, '最初の 当たりは 大').toBe(7);
    expect(r.log.filter((l) => l.level === 'large')).toHaveLength(1);
  });

  test('AC10: 風神剣の 真空波が 遠くの 妖怪に 当たっても 止まらない', async ({ page }) => {
    await legendWorld(page, 'fujin_ken');
    await spawnAhead(page, 'karakasa', 4, { hp: 9999 });
    const rec = await watch(page, 100, `(h, i) => { if (i === 0) h.input.press('primary'); if (i === 1) h.input.release('primary'); }`);
    const waveHits = await page.evaluate(() => (window.__rikkun as any).legend.events().filter((e: any) => e.type === 'waveHit').length as number);
    expect(waveHits, '波が 当たる（前提）').toBeGreaterThanOrEqual(1);
    expect(Math.max(...rec.map((s) => s.stop)), '止まらない').toBe(0);
    for (let i = 1; i < rec.length; i++) expect(rec[i]!.tick - rec[i - 1]!.tick, '世界は 毎ステップ 進む').toBe(1);
  });
});
