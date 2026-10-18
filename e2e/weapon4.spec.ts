import { expect, test, type Page } from '@playwright/test';
import { KIND_AI } from '../src/yokai/ai/config';
import {
  fire,
  flat,
  holdItems,
  KATANA_SET,
  northOf,
  openBladeWorld,
  range,
  runTech,
  settle,
  spawnAhead,
  stage,
  takeKatana,
  toStance,
  waitReady,
  type TechStep,
  type Vec3,
} from './helpers/blade';

/**
 * WEAPON-4（docs/design/WEAPON-4.md §6 通し）: AC11〜AC22。
 * 数は ゲーム（window.__rikkun）に 聞く: 射程は `settings.get('bladeReach')`、形は `blade.shape()`、体は `player.get()`、
 * 妖怪は `yokai.list()`、当たりは `blade.events()`。角度・座標は 決め打ちしない（前 = 北、立つ場所は 地面の高さを 聞く）。
 * 絵の コマ割り・軌跡の 点の 位置（切り上げ・大けさぎりの 絵は 作りなおし中）には 頼らない。
 * 実装の 前は 射程・ダメージ・ふみこみが 今の まま なので 赤になる。
 */
test.describe.configure({ timeout: 180_000 });

const KARAKASA_R = KIND_AI.karakasa.radius;
const NURIKABE_R = KIND_AI.nurikabe.radius;
const BODY_HALF = 0.3;

const settingOf = <T = number>(page: Page, key: string, sub?: string): Promise<T> =>
  page.evaluate(({ key, sub }) => {
    const v = (window.__rikkun! as any).settings.get(key);
    return sub ? v[sub] : v;
  }, { key, sub }) as Promise<T>;

const hits = (rec: TechStep[]) => rec.flatMap((s) => s.events.filter((e) => e.type === 'techHit').map((e) => ({ f: s.f, ...e })));
const yokaiOf = (page: Page, id: number) =>
  page.evaluate((id) => (window.__rikkun! as any).yokai.list().find((y: any) => y.id === id) as { hp: number; state: string; position: Vec3 } | undefined, id);

/** 刀の 準備まで した 世界。floorY を 返す */
async function ready(page: Page, stance: 'chudan' | 'jodan' | 'gedan', item = 'katana'): Promise<number> {
  await openBladeWorld(page);
  await takeKatana(page, stance, item);
  return (await stage(page)).floorY;
}

test.describe('WEAPON-4 通し', () => {
  test('AC11: 突きの 射程（R まで）。線で 当てる 近道は ない', async ({ page }) => {
    const floorY = await ready(page, 'chudan');
    const R = await settingOf(page, 'bladeReach', 'katana');
    expect(R).toBeCloseTo(2.2, 6);

    // 手前の 面が B から 水平 R − 0.3 → 当たる（F5〜6）
    const dIn = R - 0.3 + KARAKASA_R;
    const id = await spawnAhead(page, 'karakasa', dIn);
    const inside = hits(await runTech(page, 10));
    expect(inside.map((h) => h.yokaiId)).toEqual([id]);
    expect(inside[0]!.f).toBeGreaterThanOrEqual(5);
    expect(inside[0]!.f).toBeLessThanOrEqual(6);

    // カプセルの 先（R + 半径 0.2）より 外 → 当たらない
    await settle(page, 60);
    await stage(page, { floorY });
    await spawnAhead(page, 'karakasa', R + 0.2 + KARAKASA_R + 0.15);
    expect(hits(await runTech(page, 12))).toEqual([]);

    // ＋マークの 線（bladeAimReach 4.5）に 入る 4.0 先 → ねらっても 当たらない
    await settle(page, 60);
    await stage(page, { floorY });
    const aimed = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const p = h.player.get().position;
      const s = h.camera.get().shoulder;
      const side = s.x - p.x;
      const id = h.yokai.spawn('karakasa', p.x + side, p.y, p.z - 4.0, { ai: false });
      h.yokai.setHp(id, 400);
      h.step(2);
      const ray = h.yokai.raycast({ ...h.camera.get().shoulder }, { x: 0, y: 0, z: -1 }, 8);
      return { id, rayId: ray ? (ray.id as number) : null, reach: h.settings.get('bladeAimReach') as number };
    });
    expect(aimed.rayId, '＋マークの 線は この 妖怪に とどいている').toBe(aimed.id);
    expect(aimed.reach).toBeCloseTo(4.5, 6);
    expect(hits(await runTech(page, 12)), '4.0 先は 当たらない（今は 線で 当たる）').toEqual([]);
  });

  test('AC12: 刀ごとの 射程（bladeReach）。次の わざから 変わる。ぼくとうは 2.2 のまま', async ({ page }) => {
    await openBladeWorld(page);
    await holdItems(page, [{ item: 'katana' }, { item: 'bokuto' }]);
    await waitReady(page, KATANA_SET);
    await page.evaluate(() => (window.__rikkun! as any).settings.set('bladeReach', { katana: 3.0 }));
    const shapeAt = async (f: number) =>
      page.evaluate((f) => {
        const h = window.__rikkun! as any;
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        h.step(f - 1);
        const sh = h.blade.shape();
        h.step(130);
        return sh as null | { kind: string; from?: Vec3; to?: Vec3; rMax?: number };
      }, f);
    const capLen = (sh: any) => Math.hypot(sh.to.x - sh.from.x, sh.to.y - sh.from.y, sh.to.z - sh.from.z);

    for (const [item, slot, want] of [['katana', 0, 3.0], ['bokuto', 1, 2.2]] as const) {
      await page.evaluate((slot) => {
        const h = window.__rikkun! as any;
        h.inventory.select(slot);
        h.step(2);
      }, slot);
      await stage(page);
      await toStance(page, 'chudan');
      const t = await shapeAt(5);
      expect(t?.kind, `${item} 突き`).toBe('capsule');
      expect(capLen(t), `${item} 突きの カプセルの 長さ`).toBeCloseTo(want, 4);
      await toStance(page, 'jodan');
      const k = await shapeAt(29);
      expect(k?.kind, `${item} 大けさぎり`).toBe('fan');
      expect(k!.rMax, `${item} 大けさぎりの rMax`).toBeCloseTo(want, 4);
      await stage(page);
      await toStance(page, 'gedan');
      const g = await shapeAt(20);
      expect(g?.kind, `${item} 切り上げ`).toBe('fan');
      expect(g!.rMax, `${item} 切り上げの rMax`).toBeCloseTo(want, 4);
      await stage(page);
    }
  });

  test('AC13: 切り上げは その場。52 ステップで おわり、53 ステップ目に 次。当たりは F20〜22 だけ', async ({ page }) => {
    await ready(page, 'gedan');
    const start = await page.evaluate(() => (window.__rikkun! as any).player.get().position as Vec3);
    const rec = await runTech(page, 56, { hold: true });
    await settle(page);
    expect(rec.slice(0, 52).map((s) => s.f)).toEqual(range(1, 52));
    for (const s of rec.slice(0, 52)) expect(flat(s.pos, start), `F${s.f} 足もとは その場`).toBeLessThanOrEqual(0.001);
    expect(rec[52]!.f, '53 ステップ目に 次の わざが 始まる').toBe(1);
    const starts = rec.map((s, i) => (s.events.some((e) => e.type === 'techStart') ? i : -1)).filter((i) => i >= 0);
    expect(starts.slice(0, 2)).toEqual([0, 52]);
    expect(rec.slice(0, 52).filter((s) => s.shape).map((s) => s.f)).toEqual([20, 21, 22]);
  });

  test('AC14: 切り上げは 高い 所まで とどく（水平 1.5 先・足もと +4.0 の うかぶ ちょうちん）。ダメージ = 強さ × 1.15', async ({ page }) => {
    await ready(page, 'gedan');
    const id = await spawnAhead(page, 'chochin', 1.5, { up: 4.0, hp: 5 });
    const rec = await runTech(page, 30);
    const h = hits(rec);
    expect(h.map((x) => x.yokaiId)).toEqual([id]);
    expect(h[0]!.f).toBeGreaterThanOrEqual(20);
    expect(h[0]!.f).toBeLessThanOrEqual(22);
    expect(h[0]!.damage).toBeCloseTo(4.6, 3); // かたな 4 × 1.15
    expect(h[0]!.tech).toBe('kiriage');
    expect((await yokaiOf(page, id))!.hp).toBeCloseTo(0.4, 2);
  });

  test('AC15: 大けさぎりの とびこみ（ひらけた 所）。F28 で 0.309、F34 で 2.6、F37 で 3.1、F106 まで 3.1', async ({ page }) => {
    await ready(page, 'jodan');
    const start = await page.evaluate(() => (window.__rikkun! as any).player.get().position as Vec3);
    const rec = await runTech(page, 110);
    const at = (f: number) => northOf(rec[f - 1]!, start);
    expect(rec.slice(0, 106).map((s) => s.f)).toEqual(range(1, 106));
    expect(rec[106]!.f, 'F107 は もう わざの 外').toBe(0);
    expect(at(28)).toBeCloseTo(0.309, 1);
    expect(Math.abs(at(28) - 0.309)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(at(34) - 2.6)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(at(37) - 3.1)).toBeLessThanOrEqual(0.01);
    for (const f of [60, 90, 106]) expect(Math.abs(at(f) - 3.1), `F${f}`).toBeLessThanOrEqual(0.01);
    // よこには ずれない
    for (const s of rec.slice(0, 106)) expect(Math.abs(s.pos.x - start.x), `F${s.f}`).toBeLessThanOrEqual(0.01);
    expect(rec.slice(0, 106).filter((s) => s.shape).map((s) => s.f)).toEqual(range(29, 34));
    const miss = rec.findIndex((s) => s.events.some((e) => e.type === 'techMiss'));
    expect(rec[miss]!.f, 'techMiss は F34').toBe(34);
  });

  test('AC16: かべ（前 2.0 に 2 段）の 手前で 止まる。かべの 中に 入らず、わざは F106 まで 続く', async ({ page }) => {
    const floorY = await ready(page, 'jodan');
    await stage(page, { floorY, z: 21.0 });
    // 前 2.0 の 面（z = 19.0）に 2 段の かべ
    await page.evaluate((fy) => {
      const h = window.__rikkun! as any;
      h.world.fill(17, fy + 1, 18, 24, fy + 2, 18, 'stone');
      // ＋マークを 空へ（かべに 向けると 左クリックが 「ほる」に なる）
      h.player.set({ pitch: 40 });
      h.step(2);
    }, floorY);
    const start = await page.evaluate(() => (window.__rikkun! as any).player.get().position as Vec3);
    const rec = await runTech(page, 108);
    expect(rec.slice(0, 106).map((s) => s.f)).toEqual(range(1, 106));
    const face = 19.0;
    for (const s of rec) expect(s.pos.z - BODY_HALF, `F${s.f} かべの 中に 入らない`).toBeGreaterThanOrEqual(face - 0.001);
    const adv = northOf(rec[105]!, start);
    expect(adv).toBeGreaterThan(1.5);
    expect(adv).toBeLessThanOrEqual(2.0 - BODY_HALF + 0.01);
  });

  test('AC17: がけ（3 段以上の 落ちこみ）では 止まって 落ちない。1 段だけ 下がる 地面は 進んで おりる', async ({ page }) => {
    const floorY = await ready(page, 'jodan');
    // 前 1.5 から 先（面 z = 20.0）を 深い 穴に する
    await stage(page, { floorY, z: 21.5 });
    await page.evaluate((fy) => (window.__rikkun! as any).world.fill(8, fy - 5, 9, 32, fy, 19, 'air'), floorY);
    const start = await page.evaluate(() => (window.__rikkun! as any).player.get().position as Vec3);
    const rec = await runTech(page, 136); // わざの 間と おわって 30 ステップ
    for (const s of rec) expect(s.pos.y, `F${s.f} 落ちない`).toBeGreaterThanOrEqual(start.y - 0.01);
    expect(rec.slice(0, 106).map((s) => s.f)).toEqual(range(1, 106));
    expect(northOf(rec[135]!, start), 'ふちを こえない（体の 箱の 半分 0.3 までは 足場の 上）').toBeLessThan(1.5 + BODY_HALF + 0.01);

    // 1 段だけ 下がる 地面
    await settle(page);
    await page.evaluate((fy) => {
      const h = window.__rikkun! as any;
      h.world.fill(8, fy - 5, 9, 32, fy - 1, 19, 'stone');
    }, floorY);
    await stage(page, { floorY, z: 21.5 });
    await page.evaluate((fy) => {
      const h = window.__rikkun! as any;
      h.world.fill(8, fy, 9, 32, fy, 19, 'air');
      h.world.fill(8, fy - 1, 9, 32, fy - 1, 19, 'stone');
      h.step(1);
    }, floorY);
    const start2 = await page.evaluate(() => (window.__rikkun! as any).player.get().position as Vec3);
    const rec2 = await runTech(page, 120);
    expect(Math.abs(northOf(rec2[105]!, start2) - 3.1), '止まらず 3.1').toBeLessThanOrEqual(0.05);
    expect(rec2[119]!.pos.y, '1 段 下に 立つ').toBeCloseTo(start2.y - 1, 1);
  });

  test('AC18: 水（1 段下の 水）の 上は 止まらず 3.1 すすむ', async ({ page }) => {
    const floorY = await ready(page, 'jodan');
    await stage(page, { floorY, z: 21.0 });
    await page.evaluate((fy) => {
      const h = window.__rikkun! as any;
      h.world.fill(8, fy - 1, 9, 32, fy - 1, 19, 'stone');
      h.world.fill(8, fy, 9, 32, fy, 19, 'water'); // 前 1.0 から 先
      h.step(1);
    }, floorY);
    const start = await page.evaluate(() => (window.__rikkun! as any).player.get().position as Vec3);
    const rec = await runTech(page, 108);
    expect(Math.abs(northOf(rec[105]!, start) - 3.1)).toBeLessThanOrEqual(0.05);
  });

  test('AC19: 妖怪の 手前で 止まる（ぬりかべを 前 2.0）。体当たりを 受けない。ダメージ = 強さ × 2.5', async ({ page }) => {
    await ready(page, 'jodan');
    const id = await spawnAhead(page, 'nurikabe', 2.0, { hp: 40 });
    const nuri = (await yokaiOf(page, id))!.position;
    const hp0 = (await yokaiOf(page, id))!.hp;
    const php0 = await page.evaluate(() => (window.__rikkun! as any).combat.get().hp as number);
    const rec = await runTech(page, 110);
    const stopAt = NURIKABE_R + BODY_HALF + 0.1 - 0.01; // 1.29
    for (const s of rec) expect(flat(s.pos, nuri), `F${s.f} ぬりかべから`).toBeGreaterThanOrEqual(stopAt);
    expect(await page.evaluate(() => (window.__rikkun! as any).combat.get().hp as number), 'プレイヤーの 体力').toBe(php0);
    const y = (await yokaiOf(page, id))!;
    expect(hp0 - y.hp).toBeCloseTo(10, 2); // かたな 4 × 2.5
    expect(rec[105]!.f).toBe(106);
  });

  test('AC20: 大けさぎりは 遠く（前 4.0）の からかさに とどき、大きく ふっとばす', async ({ page }) => {
    await ready(page, 'jodan');
    const id = await spawnAhead(page, 'karakasa', 4.0);
    const r = await page.evaluate((id) => {
      const h = window.__rikkun! as any;
      const get = () => h.yokai.list().find((y: any) => y.id === id);
      let seen = h.blade.events().length;
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      let f = 1;
      let hit: any = null;
      for (let i = 0; i < 60 && !hit; i++) {
        const ev = h.blade.events();
        const e = ev.slice(seen).find((x: any) => x.type === 'techHit');
        seen = ev.length;
        if (e) hit = { f: h.blade.state().frame, damage: e.damage, knock: e.knock, up: e.up, pos: { ...get().position } };
        else {
          h.step(1);
          f++;
        }
      }
      if (!hit) return { hit: null as any, away: -1 };
      h.step(10);
      const q = get().position;
      return { hit, away: Math.hypot(q.x - hit.pos.x, q.z - hit.pos.z) };
    }, id);
    expect(r.hit, 'techHit').not.toBeNull();
    expect(r.hit.f).toBeGreaterThanOrEqual(29);
    expect(r.hit.f).toBeLessThanOrEqual(34);
    expect(r.hit.damage).toBeCloseTo(10, 3); // かたな 4 × 2.5
    expect(r.hit.knock).toBe(6);
    expect(r.hit.up).toBe(3);
    expect(Math.abs(r.away - 6), '当たってから 10 ステップで 水平に 6').toBeLessThanOrEqual(0.5);
  });

  test('AC21: ぼくとうの 突きで からかさ（体力 8）→ 6.5。バーは 8 本中 7 本。6 回目に 倒れる', async ({ page }) => {
    await openBladeWorld(page);
    await takeKatana(page, 'chudan', 'bokuto');
    await stage(page);
    const id = await spawnAhead(page, 'karakasa', 2.0, { hp: 8 });
    const want = [6.5, 5, 3.5, 2, 0.5];
    for (let n = 1; n <= 6; n++) {
      // 押された 分、手前に 立ち直す（つぎの 突きが とどくように）
      await page.evaluate((id) => {
        const h = window.__rikkun! as any;
        const y = h.yokai.list().find((q: any) => q.id === id);
        if (y) h.player.set({ position: { x: y.position.x, y: y.position.y, z: y.position.z + 2.0 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        h.step(2);
      }, id);
      const rec = await runTech(page, 45);
      expect(hits(rec), `${n} 回目`).toHaveLength(1);
      const y = await yokaiOf(page, id);
      if (n <= 5) {
        expect(y!.hp, `${n} 回目の 体力`).toBeCloseTo(want[n - 1]!, 3);
        expect(y!.state, `${n} 回目は まだ 倒れない`).not.toBe('dying');
        if (n === 1) {
          const bar = await page.evaluate((id) => (window.__rikkun! as any).hud.hpBar(id) as { bars: number; left: number } | null, id);
          expect(bar).toMatchObject({ bars: 8, left: 7 });
        }
      } else {
        expect(!y || y.state === 'dying' || y.hp <= 0, '6 回目に 倒れる').toBe(true);
      }
    }
  });

  test('AC22: 刃の軌跡の 点の 数（切り上げ F19〜22 の 4 つ、大けさぎり F28〜34 の 7 つ）', async ({ page }) => {
    await ready(page, 'gedan');
    const k = await fire(page, 22);
    expect(k[21]!.f).toBe(22);
    expect(k[21]!.trail.points.map((p) => p.step)).toEqual([19, 20, 21, 22]);
    await settle(page);
    await stage(page);
    await toStance(page, 'jodan');
    const s = await fire(page, 34);
    expect(s[33]!.trail.points.map((p) => p.step)).toEqual(range(28, 34));
    // 後半: さいごの 点の 刃先は 1 つ目より u（北 = −z）の方へ 2.0 以上 前（とびこみの 残像）
    const pts = s[33]!.trail.points;
    expect(pts[0]!.tip.z - pts[6]!.tip.z).toBeGreaterThanOrEqual(2.0);
  });
});
