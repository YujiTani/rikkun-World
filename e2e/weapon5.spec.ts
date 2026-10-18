import { expect, test, type Page } from '@playwright/test';
import { flat, holdItems, openBladeWorld, stage, takeKatana, type Vec3 } from './helpers/blade';
import {
  bladeEvents,
  calmDown,
  drainSounds,
  hasParryHook,
  hpOf,
  parryAtF,
  parryEvents,
  parryFireballAtF,
  parryState,
  parryWorld,
  place,
  playerPos,
  pressParry,
  probeHit,
  setting,
  staggerOf,
  takeYokaiEvents,
  trace,
  yokaiInfo,
} from './helpers/parry';

/**
 * WEAPON-5（docs/design/WEAPON-5.md §6 通し）: AC12〜AC22（AC23 は 既存の weapon2〜4・char2 の spec が 期待を 変えずに 通ること）。
 * 数は ゲーム（window.__rikkun）に 聞く。F の 区切りは `settings.get('parryTicks')`・`parryEarlyTicks`、
 * 押す ステップは `yokai.attackNow` が 返す `hitInSteps` から 決める。角度・座標は 決め打ちしない（前 = 北、立つ場所は 地面の高さを 聞く）。
 * 実装の 前は 窓口（`parry`・`yokai.attackNow`・`yokai.stagger`・`hud.staggerIcon`・`player.glow`）が ないので 赤になる。
 */
test.describe.configure({ timeout: 180_000 });

async function needHook(page: Page): Promise<void> {
  expect(await hasParryHook(page), '窓口 `parry`・`yokai.attackNow`・`yokai.stagger` が まだ ない（仕様書 §4.8）').toBe(true);
}

/** F の 区切り（設定から）。ready + guard = 受けの おわり、+ early = 早すぎの おわり */
async function bounds(page: Page) {
  const t = await setting<{ ready: number; guard: number; recover: number }>(page, 'parryTicks');
  const early = await setting<number>(page, 'parryEarlyTicks');
  const guardEnd = t.ready + t.guard;
  return { ready: t.ready, guardEnd, earlyEnd: guardEnd + early, total: guardEnd + t.recover, lateAt: guardEnd + early + 3 };
}

const count = (ev: { type: string }[], type: string) => ev.filter((e) => e.type === type).length;

test.describe('WEAPON-5 通し', () => {
  test('AC12: からかさの 攻撃を 受けの F10 で 受ける → 成功（ダメージ 0・押されない・スロー・光・よろけ・アイコン・音）', async ({ page }) => {
    await parryWorld(page);
    await needHook(page);
    const b = await bounds(page);
    const hit = await probeHit(page, 'karakasa', 1.5);
    expect(hit).toBeGreaterThan(0);
    const id = await place(page, 'karakasa', 1.5);
    const hp0 = await hpOf(page);
    const p0 = await playerPos(page);
    const stagTicks = await setting<number>(page, 'staggerTicks');
    const slow = await setting<{ ticks: number; scale: number }>(page, 'parrySlow');

    const F = 10;
    expect(F).toBeGreaterThan(b.ready);
    expect(F).toBeLessThanOrEqual(b.guardEnd);
    await parryAtF(page, id, hit, F);

    const ev = await parryEvents(page);
    expect(count(ev, 'parryStart')).toBe(1);
    const ok = ev.filter((e) => e.type === 'parrySuccess');
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ by: 'attack', yokaiId: id, frame: F });
    expect(await hpOf(page), 'ダメージ 0').toBe(hp0);
    expect(flat(await playerPos(page), p0), '押されない').toBeLessThanOrEqual(0.01);
    expect(await page.evaluate(() => (window.__rikkun! as any).combat.get().invincibleTicks), 'むてきを つけない').toBe(0);

    const tr = await trace(page, id, 10);
    // スロー: 6 ステップ 0.25、そのあと 1（数え方は 成功の ステップの おわりから 見て 0 または 1 コマ ずれてよい）
    const scales = tr.map((s) => s.parry.timeScale);
    const slowIdx = scales.map((v, i) => (Math.abs(v - slow.scale) < 1e-9 ? i : -1)).filter((i) => i >= 0);
    expect(slowIdx, `timeScale 0.25 の コマ数（${scales.join(',')}）`).toHaveLength(slow.ticks);
    expect(slowIdx[slowIdx.length - 1]! - slowIdx[0]!, '0.25 は つづいている').toBe(slow.ticks - 1);
    expect(slowIdx[0]!).toBeLessThanOrEqual(1);
    expect(scales[scales.length - 1]).toBe(1);

    // 光は「成功の 次のステップから」（§4.3）。成功した ステップの おわり（tr[0]）では まだ でも よい
    expect(tr[1]!.glow.visible, '青白い光').toBe(true);
    expect(tr[1]!.glow.ticksLeft).toBeGreaterThan(0);
    expect(tr[0]!.stagger, 'よろけ').not.toBeNull();
    expect(tr[0]!.stagger!.ticksLeft).toBeLessThanOrEqual(stagTicks);
    expect(tr[0]!.stagger!.ticksLeft).toBeGreaterThanOrEqual(stagTicks - 1);
    expect(tr[0]!.stagger!.double).toBe(true);
    expect(tr[0]!.icon, 'よろけアイコン').toEqual({ visible: true });
    expect(await drainSounds(page)).toContain('parry');
  });

  test('AC13: おしいと 失敗。F1・F25 は 切り上げ（攻撃力 × 0.5）で parryEarly、F35 は 攻撃力ぶん で parryFail', async ({ page }) => {
    await parryWorld(page);
    await needHook(page);
    const b = await bounds(page);
    const mul = await setting<number>(page, 'parryEarlyMul');
    const hit = await probeHit(page, 'karakasa', 1.5);
    const cases = [
      { name: 'F1（かまえ）', F: 1, kind: 'parryEarly' },
      { name: 'F25（早すぎ）', F: b.guardEnd + 5, kind: 'parryEarly' },
      { name: 'F35（おそい もどり）', F: b.lateAt, kind: 'parryFail' },
    ];
    expect(cases[1]!.F).toBeLessThanOrEqual(b.earlyEnd);
    expect(cases[2]!.F).toBeLessThanOrEqual(b.total);
    for (const c of cases) {
      await calmDown(page);
      await stage(page);
      const id = await place(page, 'karakasa', 1.5);
      const attack = (await yokaiInfo(page, id))!.attack;
      const hp0 = await hpOf(page);
      await parryAtF(page, id, hit, c.F);
      const ev = await parryEvents(page);
      const want = c.kind === 'parryEarly' ? Math.ceil(attack * mul) : attack;
      expect(hp0 - (await hpOf(page)), `${c.name} の ダメージ`).toBeCloseTo(want, 6);
      const e = ev.filter((x) => x.type === c.kind);
      expect(e, `${c.name} の ${c.kind}`).toHaveLength(1);
      expect(e[0]!.frame, `${c.name} の F`).toBe(c.F);
      if (c.kind === 'parryEarly') expect(e[0]!.amount).toBe(want);
      expect(count(ev, 'parrySuccess')).toBe(0);
      expect(await staggerOf(page, id), `${c.name}: よろけない`).toBeNull();
      expect((await parryState(page)).timeScale).toBe(1);
    }
  });

  test('AC13b: 後ろからは 受けられない（F10 でも ふつうの ダメージ・parryFail の behind）。向きを むけると 成功', async ({ page }) => {
    await parryWorld(page);
    await needHook(page);
    const hit = await probeHit(page, 'karakasa', 1.5, { back: true });
    expect(hit).toBeGreaterThan(0);
    const id = await place(page, 'karakasa', 1.5, { back: true });
    const attack = (await yokaiInfo(page, id))!.attack;
    const hp0 = await hpOf(page);
    await parryAtF(page, id, hit, 10);
    let ev = await parryEvents(page);
    expect(hp0 - (await hpOf(page)), '攻撃力ぶん').toBeCloseTo(attack, 6);
    const fail = ev.filter((e) => e.type === 'parryFail');
    expect(fail).toHaveLength(1);
    expect(fail[0]).toMatchObject({ behind: true, yokaiId: id });
    expect(count(ev, 'parrySuccess')).toBe(0);
    expect(await staggerOf(page, id)).toBeNull();
    expect(await drainSounds(page)).not.toContain('parry');

    // 同じ 置き方で 向きだけ からかさへ（南 = yaw 180）
    await calmDown(page);
    await stage(page);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.player.set({ yaw: 180 });
      h.step(2);
    });
    const hp1 = await hpOf(page);
    const id2 = await place(page, 'karakasa', 1.5, { back: true });
    await parryAtF(page, id2, hit, 10);
    ev = await parryEvents(page);
    expect(count(ev, 'parrySuccess')).toBe(1);
    expect(await hpOf(page)).toBe(hp1);
    expect(await staggerOf(page, id2)).not.toBeNull();
  });

  test('AC14: 2 倍 → ふつう。AC12 の あと きめ明けの 突きが 6（3 × 2）、アイコンが 消え、もう 1 回は 3', async ({ page }) => {
    await parryWorld(page, 'katana', 'chudan');
    await needHook(page);
    const hit = await probeHit(page, 'karakasa', 1.5);
    const id = await place(page, 'karakasa', 1.5);
    await parryAtF(page, id, hit, 10);
    // きめが おわって idle に なるまで
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      for (let i = 0; i < 60 && h.parry.state().phase !== 'idle'; i++) h.step(1);
      h.input.release('run');
      h.step(1);
    });
    expect((await parryState(page)).phase).toBe('idle');
    expect(await staggerOf(page, id), 'まだ よろけている').not.toBeNull();

    const thrust = async () => {
      // 押された ぶん、手前に 立ち直す
      await page.evaluate((id) => {
        const h = window.__rikkun! as any;
        const y = h.yokai.list().find((q: any) => q.id === id);
        h.player.set({ position: { x: y.position.x, y: y.position.y, z: y.position.z + 1.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        h.step(2);
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        h.step(12);
      }, id);
      return (await bladeEvents(page)).filter((e) => e.type === 'techHit');
    };
    const first = await thrust();
    expect(first, '1 回目の 突き').toHaveLength(1);
    expect(first[0]!.damage).toBeCloseTo(6, 3);
    expect(first[0]!.tech).toBe('thrust');
    const ev = await parryEvents(page);
    const dbl = ev.filter((e) => e.type === 'staggerDouble');
    expect(dbl).toHaveLength(1);
    expect(dbl[0]).toMatchObject({ yokaiId: id });
    expect(dbl[0]!.damage).toBeCloseTo(6, 3);
    expect(await page.evaluate((id) => (window.__rikkun! as any).hud.staggerIcon(id), id), 'アイコンが 消える').toEqual({ visible: false });
    const st = await staggerOf(page, id);
    expect(st, 'よろけは のこる').not.toBeNull();
    expect(st!.double).toBe(false);

    await calmDown(page, 30);
    const second = (await thrust()).slice(1);
    expect(second, '2 回目の 突き').toHaveLength(1);
    expect(second[0]!.damage).toBeCloseTo(3, 3);
  });

  test('AC15: よろけの おわり。90 ステップ 動かず 攻撃せず、91 ステップ目に stagger が null・アイコンも 消える', async ({ page }) => {
    await parryWorld(page);
    await needHook(page);
    const stagTicks = await setting<number>(page, 'staggerTicks');
    const hit = await probeHit(page, 'karakasa', 1.5);
    const id = await place(page, 'karakasa', 1.5);
    await parryAtF(page, id, hit, 10);
    await takeYokaiEvents(page);
    const tr = await trace(page, id, stagTicks + 1);
    const y0 = tr[0]!.yokaiPos!;
    for (let k = 1; k < stagTicks; k++) {
      expect(tr[k]!.stagger, `${k} ステップ目は よろけている`).not.toBeNull();
      expect(flat(tr[k]!.yokaiPos!, y0), `${k} ステップ目の 位置`).toBeLessThanOrEqual(0.01);
    }
    const starts = (await takeYokaiEvents(page)).filter((e) => e.type === 'attackStart');
    expect(starts, 'attackStart').toHaveLength(0);
    expect(tr[stagTicks + 1]!.stagger, '91 ステップ目').toBeNull();
    expect(tr[stagTicks + 1]!.icon).toEqual({ visible: false });
  });

  test('AC16: ちょうちんの 火の玉を きらめく カタナで はね返す → ちょうちんに 当たって 5 → 3・よろけ。切り上げで 9.2 で 倒れる（WEAPON-6: 強さ 4）', async ({ page }) => {
    await parryWorld(page, 'crystal_katana', 'gedan');
    await needHook(page);
    const b = await bounds(page);
    const id = await place(page, 'chochin', 5, { up: 4, hp: 5 });
    const attack = (await yokaiInfo(page, id))!.attack;
    const reflect = await setting<{ speed: number; range: number; damageMul: number }>(page, 'reflectFireball');
    const hp0 = await hpOf(page);
    const r = await page.evaluate((id) => (window.__rikkun! as any).yokai.attackNow(id) as { hitInSteps: number } | null, id);
    expect(r).not.toBeNull();
    await page.evaluate((n) => (window.__rikkun! as any).step(n), r!.hitInSteps);
    const est = await parryFireballAtF(page, 10);
    expect(est, '火の玉が 来た').toBeGreaterThan(0);

    // 当たるまで（受けの 中に 当たるはず）
    await page.evaluate(() => (window.__rikkun! as any).step(30));
    let ev = await parryEvents(page);
    const ok = ev.filter((e) => e.type === 'parrySuccess');
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ by: 'fireball', yokaiId: id });
    expect(ok[0]!.frame).toBeGreaterThan(b.ready);
    expect(ok[0]!.frame).toBeLessThanOrEqual(b.guardEnd);
    expect(await hpOf(page), 'ダメージ 0').toBe(hp0);

    // はね返した 火の玉（あたった 次のステップに すぐ 消えていないこと）。1 秒以内に reflectHit
    const seen = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      let fb: any = null;
      let hitEv: any = null;
      for (let i = 0; i < 60 && !hitEv; i++) {
        const l = h.yokai.fireballList().find((f: any) => f.reflected);
        if (l && !fb) fb = JSON.parse(JSON.stringify(l));
        const e = h.parry.events().find((x: any) => x.type === 'reflectHit');
        if (e) hitEv = JSON.parse(JSON.stringify(e));
        else h.step(1);
      }
      return { fb, hitEv };
    });
    ev = await parryEvents(page);
    if (!seen.fb) {
      // 成功と 同じステップに すでに 飛び出して いた場合に そなえ、記録から 見る
      expect(ev.some((e) => e.type === 'reflectHit'), 'はね返しが 当たった').toBe(true);
    } else {
      expect(seen.fb.reflected).toBe(true);
      expect(seen.fb.speed).toBeCloseTo(reflect.speed, 6);
    }
    const rh = ev.filter((e) => e.type === 'reflectHit');
    expect(rh, 'reflectHit').toHaveLength(1);
    expect(rh[0]!.yokaiId).toBe(id);
    expect(rh[0]!.damage).toBeCloseTo(attack * reflect.damageMul, 6);
    expect((await yokaiInfo(page, id))!.hp, '5 → 3').toBeCloseTo(5 - attack * reflect.damageMul, 6);
    expect(ev.some((e) => e.type === 'stagger' && e.yokaiId === id && e.by === 'reflect'), 'ちょうちんが よろける').toBe(true);
    expect(await hpOf(page), 'プレイヤーに 当たらない').toBe(hp0);

    // 切り上げ（きらめく カタナ 4.6 × 2 = 9.2。WEAPON-6 で 強さ 6 → 4）
    await calmDown(page, 20);
    const chochin = (await yokaiInfo(page, id))!.position;
    await page.evaluate(
      ({ c }) => {
        const h = window.__rikkun! as any;
        // 水平 1.5 手前（南）から 北向きに 切り上げる
        h.player.set({ position: { x: c.x, y: c.y - 4, z: c.z + 1.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        h.step(2);
        h.blade.events();
      },
      { c: chochin },
    );
    expect(await staggerOf(page, id), 'まだ よろけている').not.toBeNull();
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.release('run');
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(30);
    });
    const th = (await bladeEvents(page)).filter((e) => e.type === 'techHit');
    expect(th).toHaveLength(1);
    expect(th[0]!.tech).toBe('kiriage');
    expect(th[0]!.damage).toBeCloseTo(9.2, 2);
    await page.evaluate(() => (window.__rikkun! as any).step(120));
    const after = await yokaiInfo(page, id);
    expect(!after || after.state === 'dying' || after.hp <= 0, '倒れる').toBe(true);
  });

  test('AC17: 火の玉の おしい（早すぎ）。体力が 半分（2 → 1）へり、はね返らない', async ({ page }) => {
    await parryWorld(page, 'crystal_katana', 'gedan');
    await needHook(page);
    const b = await bounds(page);
    const mul = await setting<number>(page, 'parryEarlyMul');
    const id = await place(page, 'chochin', 5, { up: 4, hp: 5 });
    const attack = (await yokaiInfo(page, id))!.attack;
    const hp0 = await hpOf(page);
    const r = await page.evaluate((id) => (window.__rikkun! as any).yokai.attackNow(id) as { hitInSteps: number } | null, id);
    await page.evaluate((n) => (window.__rikkun! as any).step(n), r!.hitInSteps);
    const est = await parryFireballAtF(page, b.guardEnd + 5);
    expect(est).toBeGreaterThan(0);
    const maxReflected = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      let m = 0;
      for (let i = 0; i < 80; i++) {
        m = Math.max(m, h.yokai.fireballList().filter((f: any) => f.reflected).length);
        h.step(1);
      }
      return m;
    });
    const ev = await parryEvents(page);
    const early = ev.filter((e) => e.type === 'parryEarly');
    expect(early).toHaveLength(1);
    expect(early[0]!.by).toBe('fireball');
    expect(early[0]!.frame).toBeGreaterThan(b.guardEnd);
    expect(early[0]!.frame).toBeLessThanOrEqual(b.earlyEnd);
    expect(hp0 - (await hpOf(page)), '2 の 半分').toBeCloseTo(Math.ceil(attack * mul), 6);
    expect(maxReflected, 'はね返らない').toBe(0);
    expect(count(ev, 'parrySuccess')).toBe(0);
    expect((await yokaiInfo(page, id))!.hp).toBe(5);
  });

  test('AC18: はしりながら 出せる。F2〜F40 は その場、F41 から また はしる', async ({ page }) => {
    await parryWorld(page);
    await needHook(page);
    const b = await bounds(page);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('run');
      h.input.press('moveForward');
      h.step(30);
    });
    const before = await playerPos(page);
    const rec = await page.evaluate(
      ({ n }) => {
        const h = window.__rikkun! as any;
        const out: { frame: number; pos: any }[] = [];
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        const snap = () => {
          const p = h.player.get().position;
          out.push({ frame: h.parry.state().frame, pos: { x: p.x, y: p.y, z: p.z } });
        };
        snap();
        for (let i = 1; i < n; i++) {
          h.step(1);
          snap();
        }
        return out;
      },
      { n: b.total + 8 },
    );
    expect(flat(rec[0]!.pos, before), 'はしって きた').toBeGreaterThan(0);
    expect((await parryEvents(page)).filter((e) => e.type === 'parryStart')).toHaveLength(1);
    expect(rec[0]!.frame).toBe(1);
    for (let f = 2; f <= b.total; f++) {
      expect(rec[f - 1]!.frame, `F${f}`).toBe(f);
      expect(flat(rec[f - 1]!.pos, rec[f - 2]!.pos), `F${f} の 1 ステップ`).toBeLessThanOrEqual(0.01);
    }
    expect(flat(rec[rec.length - 1]!.pos, rec[b.total - 1]!.pos), 'F41 から また はしる').toBeGreaterThan(0.3);
  });

  test('AC19: ほかの道具は 今のまま。ツルハシは Shift＋おしつづけで ほれる（parryStart 0）、刀は パリィ（ほらない）', async ({ page }) => {
    await openBladeWorld(page);
    const { floorY } = await stage(page);
    await needHook(page);
    // 前 1.5 に 石の かべ（目の高さ）
    const wall = async () =>
      page.evaluate((fy) => {
        const h = window.__rikkun! as any;
        const p = h.player.get().position;
        const z = Math.floor(p.z - 1.5);
        const x = Math.floor(p.x);
        h.world.fill(x - 2, fy + 1, z, x + 2, fy + 2, z, 'stone');
        h.player.set({ yaw: 0, pitch: 0 });
        h.step(2);
        const t = h.target.get();
        return t ? (t.block as Vec3) : null;
      }, floorY);
    const hold = async (n: number) =>
      page.evaluate((n) => {
        const h = window.__rikkun! as any;
        h.input.press('run');
        h.input.press('primary');
        h.step(n);
        h.input.releaseAll();
        h.step(2);
      }, n);
    const blockAt = (b: Vec3) => page.evaluate((b) => (window.__rikkun! as any).world.getBlock(b.x, b.y, b.z) as string, b);

    await holdItems(page, [{ item: 'iron_pickaxe' }]);
    let target = await wall();
    expect(target, 'かべを ねらっている').not.toBeNull();
    await hold(180);
    // M2 AC4/AC8: ひびは MAX で止まる。はなして 押し直すと こわれる
    await hold(2);
    expect(await blockAt(target!), 'ツルハシ: 押し直しで ほれる').toBe('air');
    expect(count(await parryEvents(page), 'parryStart'), 'ツルハシ: parryStart 0').toBe(0);

    await calmDown(page, 10);
    await takeKatana(page, 'chudan', 'katana');
    await stage(page, { floorY });
    target = await wall();
    expect(target).not.toBeNull();
    await hold(180);
    expect(await blockAt(target!), '刀: ほらない').toBe('stone');
    expect(count(await parryEvents(page), 'parryStart'), '刀: parryStart 1').toBe(1);
  });

  test('AC20: 連打の防ぎ。Shift を 押して 120 ステップ 押し直し つづけても parryStart は ちょうど 3 回（1・41・81 ステップ目）', async ({ page }) => {
    await parryWorld(page);
    await needHook(page);
    const b = await bounds(page);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('run');
      for (let i = 0; i < 120; i++) {
        // 1 ステップおきに 押して はなす（押す・はなす・押す… が ぜんぶ 別の ステップ）
        if (i % 2 === 0) h.input.press('primary');
        else h.input.release('primary');
        h.step(1);
      }
      h.input.releaseAll();
    });
    const starts = (await parryEvents(page)).filter((e) => e.type === 'parryStart');
    expect(starts).toHaveLength(3);
    expect(starts[1]!.tick - starts[0]!.tick).toBe(b.total);
    expect(starts[2]!.tick - starts[1]!.tick).toBe(b.total);
    const tech = (await bladeEvents(page)).filter((e) => e.type === 'techStart');
    expect(tech, 'わざは 出ない').toHaveLength(0);
  });

  test('AC21: ろくろくびの 首・ぬりかべの たおれこみも F10 で 受けられる（ダメージ 0・よろけ 90）', async ({ page }) => {
    await parryWorld(page);
    await needHook(page);
    const stagTicks = await setting<number>(page, 'staggerTicks');
    for (const [kind, d] of [['rokurokubi', 5], ['nurikabe', 2]] as const) {
      await calmDown(page);
      await stage(page);
      const hit = await probeHit(page, kind, d);
      expect(hit, `${kind} の attackNow`).toBeGreaterThan(0);
      const id = await place(page, kind, d);
      const hp0 = await hpOf(page);
      await parryAtF(page, id, hit, 10);
      const ev = await parryEvents(page);
      const ok = ev.filter((e) => e.type === 'parrySuccess');
      expect(ok, `${kind} の parrySuccess`).toHaveLength(1);
      expect(ok[0]!.yokaiId).toBe(id);
      expect(await hpOf(page), `${kind}: ダメージ 0`).toBe(hp0);
      const st = await staggerOf(page, id);
      expect(st, `${kind}: よろける`).not.toBeNull();
      expect(st!.ticksLeft).toBeGreaterThanOrEqual(stagTicks - 1);
    }
  });

  test('AC22: smoke。刀を 持って パリィを 1 回 出して エラーなし', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await parryWorld(page);
    await pressParry(page);
    await needHook(page);
    expect((await parryState(page)).phase).not.toBe('idle');
    await calmDown(page);
    expect((await parryEvents(page)).filter((e) => e.type === 'parryStart')).toHaveLength(1);
    expect((await parryEvents(page)).filter((e) => e.type === 'parryEnd')).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});
