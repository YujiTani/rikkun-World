import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { waitCharLoaded, waitSpritesReady } from './helpers/char';

/**
 * WEAPON-3（docs/design/WEAPON-3.md §6 通し）: AC20 刀の通し・AC21 パンチと弓の通し。
 * 角度・位置は 決め打ちせず、ゲーム（window.__rikkun）の `player.get()`・`yokai.list()`・`target.get()`・`aim.point()` に聞いて
 * テストの中で 計算する。窓口 `attack.preview()`・`attack.last()`（§4.8）は 実装で 足される。ここでは 使わない
 * （その 2 つは ユニットで 確かめる）。実装の 前は 向きの 決まりが ないので 赤になる。
 */
const SHOTS = 'docs/screenshots/WEAPON-3';
test.describe.configure({ timeout: 180_000 });

const KATANA_SET = ['katana_thrust', 'katana_kesa', 'katana_kiriage', 'katana_walk_chudan', 'katana_walk_jodan', 'katana_walk_gedan'];

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await waitCharLoaded(page);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.achievements.mute(true);
    h.lock.simulate(true);
    h.pause();
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
    h.time.set(0);
    h.inventory.clear();
  });
  // ひらけた 平らな 地面（石の 床）。＋マークは 北の 地面（pitch −25）
  await standOnGround(page, 20.5, 20.5, { floorY: 8, yaw: 0, pitch: -25 });
}

/** 絵の 読みこみを 待つ（描画を止めて 1 ステップずつ 進める） */
async function waitReady(page: Page, names: string[]): Promise<void> {
  await waitSpritesReady(page, names);
}

async function useKatana(page: Page) {
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.inventory.setSlot(0, { item: 'katana', count: 1 });
    h.inventory.select(0);
    h.step(1);
  });
  await waitReady(page, KATANA_SET);
}

test.describe('WEAPON-3 通し', () => {
  test('AC20: 刀の通し（東・南の からかさ → 向いた方へ 切る → 空ぶり）', async ({ page }) => {
    await open(page);
    await useKatana(page);

    const setup = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const p = h.player.get();
      const base = p.position;
      const east = h.yokai.spawn('karakasa', base.x + 2, base.y, base.z, { ai: false });
      const south = h.yokai.spawn('karakasa', base.x, base.y, base.z + 2, { ai: false });
      h.yokai.setHp(east, 40);
      h.yokai.setHp(south, 40);
      h.player.set({ yaw: 0, pitch: -25 });
      h.step(3);
      const t = h.target.get();
      return { east, south, yaw: h.player.get().yaw, pitch: h.player.get().pitch, aimBlock: t && t.block, blockId: t && h.world.getBlock(t.block.x, t.block.y, t.block.z), stance: h.blade.state().stance };
    });
    // ＋マークは 北の 地面。中段（突き）から
    expect(setup.aimBlock).not.toBeNull();
    expect(setup.blockId).toBe('stone');
    expect(setup.yaw).toBe(0);
    expect(setup.stance).toBe('chudan');

    // ① 何も 押さずに facing を 90 にして 左クリック 1 回
    const a = await page.evaluate(
      ({ east, south }) => {
        const h = window.__rikkun! as any;
        // P から 妖怪の 中心への 水平の 向き（度。0 = 北、90 = 東）— 位置から テストの中で 計算する
        const bearing = (p: any, y: any): number => (((Math.atan2(y.position.x - p.x, -(y.position.z - p.z)) * 180) / Math.PI) % 360 + 360) % 360;
        h.player.set({ facing: 90 });
        h.step(2);
        const list = () => h.yokai.list();
        const get = (id: number) => list().find((y: any) => y.id === id);
        const p = h.player.get().position;
        const out: any = { hpE0: get(east).hp, hpS0: get(south).hp, want: bearing(p, get(east)), focus: h.hud.yokaiFocus(), hint: h.hud.actionHint().left ?? null };
        h.blade.events();
        const n0 = h.blade.events().length;
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        out.dirDeg = h.blade.state().move?.dirDeg ?? null;
        out.yawAtStart = h.player.get().yaw;
        // 当たりの F（突きは F5〜6）まで
        h.step(4);
        out.shape = h.blade.shape();
        out.hit = true;
        return { ...out, n0 };
      },
      { east: setup.east, south: setup.south },
    );
    expect(a.focus, JSON.stringify(a)).toBe(setup.east);
    expect(a.hint, '左の ヒント（たたく／きる）').not.toBeNull();
    expect(a.dirDeg).not.toBeNull();
    expect(Math.abs(a.dirDeg - a.want)).toBeLessThanOrEqual(0.5);
    expect(a.yawAtStart).toBe(0);
    await page.screenshot({ path: `${SHOTS}/AC20-1-east.png` });

    const a2 = await page.evaluate(
      ({ east, south, n0 }) => {
        const h = window.__rikkun! as any;
        h.step(45);
        const evs = h.blade.events().slice(n0);
        const get = (id: number) => h.yokai.list().find((y: any) => y.id === id);
        const hits = evs.filter((e: any) => e.type === 'techHit');
        const t = h.target.get();
        return {
          hits: hits.map((e: any) => ({ id: e.yokaiId, damage: e.damage })),
          hpE: get(east).hp,
          hpS: get(south).hp,
          groundBlock: t && h.world.getBlock(t.block.x, t.block.y, t.block.z),
          dig: h.dig.get(),
          yaw: h.player.get().yaw,
        };
      },
      { east: setup.east, south: setup.south, n0: a.n0 },
    );
    expect(a2.hits).toHaveLength(1);
    expect(a2.hits[0].id).toBe(setup.east);
    expect(a.hpE0 - a2.hpE).toBe(a2.hits[0].damage); // 東の 体力が 1 回ぶん へる
    expect(a2.hpS).toBe(a.hpS0);
    expect(a2.groundBlock).toBe('stone'); // 北の 地面は ほられない
    expect(a2.dig.progress ?? 0).toBe(0);
    expect(a2.yaw).toBe(0);

    // ② S を 押しながら 左クリック → 南の からかさに 当たる
    const b = await page.evaluate(
      ({ east, south }) => {
        const h = window.__rikkun! as any;
        // P から 妖怪の 中心への 水平の 向き（度。0 = 北、90 = 東）— 位置から テストの中で 計算する
        const bearing = (p: any, y: any): number => (((Math.atan2(y.position.x - p.x, -(y.position.z - p.z)) * 180) / Math.PI) % 360 + 360) % 360;
        const get = (id: number) => h.yokai.list().find((y: any) => y.id === id);
        h.player.set({ facing: 0 });
        h.step(2);
        const p = h.player.get().position;
        const out: any = { want: bearing(p, get(south)), hpS0: get(south).hp, hpE0: get(east).hp };
        const n0 = h.blade.events().length;
        h.input.press('moveBack');
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        h.input.release('moveBack');
        out.dirDeg = h.blade.state().move?.dirDeg ?? null;
        out.focus = h.hud.yokaiFocus();
        h.step(4);
        return { ...out, n0 };
      },
      { east: setup.east, south: setup.south },
    );
    expect(b.dirDeg).not.toBeNull();
    expect(Math.abs(b.dirDeg - b.want)).toBeLessThanOrEqual(0.5);
    await page.screenshot({ path: `${SHOTS}/AC20-2-south.png` });
    const b2 = await page.evaluate(
      ({ east, south, n0 }) => {
        const h = window.__rikkun! as any;
        h.step(45);
        const hits = h.blade.events().slice(n0).filter((e: any) => e.type === 'techHit');
        const get = (id: number) => h.yokai.list().find((y: any) => y.id === id);
        return { hits: hits.map((e: any) => ({ id: e.yokaiId, damage: e.damage })), hpS: get(south).hp, hpE: get(east).hp, yaw: h.player.get().yaw };
      },
      { east: setup.east, south: setup.south, n0: b.n0 },
    );
    expect(b2.hits.map((x: any) => x.id)).toEqual([setup.south]);
    expect(b.hpS0 - b2.hpS).toBe(b2.hits[0].damage);
    expect(b2.hpE).toBe(b.hpE0);
    expect(b2.yaw).toBe(0);

    // ③ ＋マークを 北の 空へ・妖怪を 消して D ＋ 左クリック → dirDeg = 90 の 空ぶり（techMiss）
    const c = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.yokai.clear();
      h.player.set({ yaw: 0, pitch: 40, facing: 0 });
      h.step(3);
      const n0 = h.blade.events().length;
      const yaw = h.player.get().yaw;
      h.input.press('moveRight');
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.input.release('moveRight');
      const dirDeg = h.blade.state().move?.dirDeg ?? null;
      const block = h.target.get();
      h.step(45);
      const evs = h.blade.events().slice(n0);
      return { yaw, dirDeg, block, miss: evs.filter((e: any) => e.type === 'techMiss').length, hit: evs.filter((e: any) => e.type === 'techHit').length, yawEnd: h.player.get().yaw, dig: h.dig.get() };
    });
    expect(c.block).toBeNull();
    expect(c.dirDeg).not.toBeNull();
    expect(Math.abs(c.dirDeg - (c.yaw + 90))).toBeLessThanOrEqual(0.5);
    expect(c.miss).toBe(1);
    expect(c.hit).toBe(0);
    expect(c.yawEnd).toBe(0);
  });

  test('AC21: パンチ（東の 妖怪を たたく → 消すと 土を ほる）と 弓（＋マークの 点へ）', async ({ page }) => {
    await open(page);

    // 土: ＋マークの 先（北の 地面）の ブロックを 土に する
    const s0 = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.player.set({ yaw: 0, pitch: -25, facing: 0 });
      h.step(3);
      const t = h.target.get();
      h.world.setBlock(t.block.x, t.block.y, t.block.z, 'dirt');
      h.step(2);
      const base = h.player.get().position;
      // 東 2.0 から 外へ 少しずつ ずらして、＋マークの 線（4° の ねらい補助 ふくむ）が 東の 妖怪に 当たらない 所に 置く。
      // （カメラは 右がわに あるので 近すぎると 線が 箱の はしに かかる。「＋」は 北の 土、東は 横の 妖怪 という 場面にする）
      let east = -1;
      for (let d = 2.0; d <= 3.0; d += 0.1) {
        if (east >= 0) h.yokai.clear();
        east = h.yokai.spawn('karakasa', base.x + d, base.y, base.z, { ai: false });
        h.step(2);
        if (h.aim.assist() === null && h.yokai.raycast({ ...h.camera.get().shoulder }, { x: 0, y: -0.4226, z: -0.9063 }, 8) === null) break;
      }
      h.yokai.setHp(east, 40);
      h.player.set({ facing: 90 });
      h.step(2);
      return { off: h.aim.assist() === null, block: t.block, east, hp0: h.yokai.list().find((y: any) => y.id === east).hp, dmg: h.settings.get('punchDamage'), ticks: h.settings.get('punchTicks') };
    });

    expect(s0.off, '東の 妖怪は ＋マークの 線の 外').toBe(true);

    const p1 = await page.evaluate((s) => {
      const h = window.__rikkun! as any;
      h.combat.events();
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      let maxProgress = 0;
      for (let i = 0; i < s.ticks + 3; i++) {
        h.step(1);
        maxProgress = Math.max(maxProgress, h.dig.get().progress ?? 0);
      }
      const evs = h.combat.events().map((e: any) => e.type);
      return { evs, hp: h.yokai.list().find((y: any) => y.id === s.east).hp, maxProgress, block: h.world.getBlock(s.block.x, s.block.y, s.block.z), yaw: h.player.get().yaw };
    }, s0);
    expect(p1.evs).toContain('punchHit');
    expect(s0.hp0 - p1.hp).toBe(s0.dmg);
    expect(p1.maxProgress).toBe(0);
    expect(p1.block).toBe('dirt');
    expect(p1.yaw).toBe(0);

    // 妖怪を 消すと 同じ 左クリックで 土が ほれる（押しつづけて ひびが MAX → 押し直して こわす）
    const d = await page.evaluate((s) => {
      const h = window.__rikkun! as any;
      h.yokai.clear();
      h.step(35);
      h.input.press('primary');
      h.step(120);
      h.input.release('primary');
      h.input.press('primary');
      h.step(3);
      h.input.release('primary');
      return { block: h.world.getBlock(s.block.x, s.block.y, s.block.z), facing: h.player.get().facing };
    }, s0);
    expect(d.block).toBe('air');
    expect(Math.abs(((d.facing + 540) % 360) - 180)).toBeLessThanOrEqual(1); // ほるときは ＋マークの方（yaw 0）

    // 弓と 矢 5 本: 段 3 まで 引いて はなす → 矢の はじめの向きは aim.point() − P。東の 妖怪には 向かない
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'yumi', count: 1 });
      h.inventory.setSlot(1, { item: 'ya', count: 5 });
      h.inventory.select(0);
      const base = h.player.get().position;
      h.yokai.spawn('karakasa', base.x + 2, base.y, base.z, { ai: false });
      h.player.set({ yaw: 0, pitch: -20, facing: 90 });
      h.step(15);
    });
    const bow = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('primary');
      h.step(45);
      const X = h.aim.point();
      const Pv = h.camera.get().pivot;
      const stage = h.bow.state().stage;
      h.input.release('primary');
      h.step(1);
      const shot = h.bow.events().find((e: any) => e.type === 'arrowShot');
      const v = shot?.velocity;
      const dv = { x: X.x - Pv.x, y: X.y - Pv.y, z: X.z - Pv.z };
      const L = Math.hypot(dv.x, dv.y, dv.z);
      const vl = v ? Math.hypot(v.x, v.y, v.z) : 1;
      const cos = v ? (v.x * dv.x + v.y * dv.y + v.z * dv.z) / (vl * L) : 0;
      const east = h.yokai.list()[0];
      const toEast = { x: east.position.x - Pv.x, y: east.position.y + 0.8 - Pv.y, z: east.position.z - Pv.z };
      const le = Math.hypot(toEast.x, toEast.y, toEast.z);
      const cosE = v ? (v.x * toEast.x + v.y * toEast.y + v.z * toEast.z) / (vl * le) : 1;
      h.step(60);
      const hit = h.bow.events().filter((e: any) => e.type === 'arrowHit').length;
      return { stage, shot: !!shot, angleDeg: (Math.acos(Math.min(1, cos)) * 180) / Math.PI, angleEastDeg: (Math.acos(Math.min(1, cosE)) * 180) / Math.PI, hit, preview: (h.attack?.preview?.() ?? null) as null | { use: string } };
    });
    expect(bow.shot).toBe(true);
    expect(bow.stage).toBe(3);
    expect(bow.angleDeg).toBeLessThanOrEqual(0.5);
    expect(bow.angleEastDeg).toBeGreaterThan(10); // 東の 妖怪の 方へは 曲がらない
    expect(bow.hit).toBe(0);
    expect(bow.preview?.use, '窓口 attack.preview()（§4.8）').toBe('none');
  });
});
