import { expect, test, type Page } from '@playwright/test';

/**
 * WEAPON-2 の つないだ あとの 受け入れ（docs/design/WEAPON-2.md §6）のうち、実際の ゲームで しか
 * 確かめられない もの。ユニットで 確かめ済みの 形・数は blade.test.ts / bow.test.ts にある。
 */

test.describe.configure({ timeout: 120_000 });

async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    const T: any = {
      base() {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.settings.set('yokaiAutoSpawn', false);
        h.settings.set('yokaiWander', false);
        h.yokai.clear();
        h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
        h.world.fill(0, 9, 0, 12, 20, 12, 'air');
        h.inventory.clear();
        h.time.set(0);
        h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(10);
        h.yokai.events();
        h.combat.events();
      },
    };
    (window as any).T = T;
  });
}

test.describe('WEAPON-2 刀', () => {
  test('AC1: R で かまえが まわる（8F）・刀いがいでは かわらない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      h.inventory.setSlot(0, { item: 'katana', count: 1 });
      h.inventory.select(0);
      h.step(2);
      const out: any = { first: h.blade.state().stance };
      const seq: string[] = [];
      for (let i = 0; i < 3; i++) {
        h.input.press('stanceNext');
        h.step(1);
        const sw = h.blade.state().phase;
        h.input.release('stanceNext');
        h.step(7);
        const mid = h.blade.state().phase;
        h.step(1);
        seq.push(h.blade.state().stance + ':' + sw + ':' + mid + ':' + h.blade.state().phase);
      }
      out.seq = seq;
      h.inventory.setSlot(1, { item: 'stone', count: 1 });
      h.inventory.select(1);
      h.step(1);
      h.input.press('stanceNext');
      h.step(2);
      h.input.release('stanceNext');
      out.other = h.blade.state().phase;
      return out;
    });
    expect(r.first).toBe('chudan');
    expect(r.seq).toEqual(['jodan:switch:switch:idle', 'gedan:switch:switch:idle', 'chudan:switch:switch:idle']);
    expect(r.other).toBe('idle');
  });

  test('3 つの わざが 妖怪に 当たり、たいきゅうが 1 回で 1 へる・空振りは へらない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.setSlot(0, { item: 'katana', count: 1 });
      h.inventory.select(0);
      h.step(1);
      const out: any = { hits: {}, dur: [] };
      const id = h.yokai.spawn('nurikabe', 4.5, 9, 6.5, { ai: false, yawDeg: 270 });
      for (const st of ['chudan', 'jodan', 'gedan']) {
        h.blade.setStance(st);
        h.yokai.setHp(id, 48);
        const n0 = h.blade.events().filter((e: any) => e.type === 'techHit').length;
        const hp0 = h.yokai.list().find((y: any) => y.id === id).hp;
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        h.step(60);
        const ev = h.blade.events().filter((e: any) => e.type === 'techHit');
        out.hits[st] = ev.length - n0;
        out.dur.push(h.inventory.durability(0).left);
        out.hp = hp0;
      }
      // 空振り
      h.yokai.clear();
      const before = h.inventory.durability(0).left;
      h.blade.setStance('chudan');
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(60);
      out.whiffWear = before - h.inventory.durability(0).left;
      return out;
    });
    expect(r.hits).toEqual({ chudan: 1, jodan: 1, gedan: 1 });
    expect(r.dur).toEqual([249, 248, 247]);
    expect(r.whiffWear).toBe(0);
  });

  test('ひだりクリック: ブロックは ほれる（刀 でも）・妖怪が 手前なら わざ', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.fill(4, 10, 6, 4, 10, 6, 'dirt');
      h.inventory.setSlot(0, { item: 'katana', count: 1 });
      h.inventory.select(0);
      h.input.press('primary');
      h.step(300);
      h.input.release('primary');
      h.step(2);
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(2);
      return { block: h.world.getBlock(4, 10, 6), techs: h.blade.events().filter((e: any) => e.type === 'techStart').length, dur: h.inventory.durability(0).left };
    });
    expect(r.block).toBe('air');
    expect(r.techs).toBe(0);
    expect(r.dur).toBe(248);
  });

  test('大げさ斬りの 硬直は 動けない・ジャンプ できない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      h.inventory.setSlot(0, { item: 'katana', count: 1 });
      h.inventory.select(0);
      h.step(1);
      h.blade.setStance('jodan');
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(18);
      h.input.press('moveForward');
      h.input.press('jump');
      const p0 = h.player.get().position.x;
      h.step(10);
      const p1 = h.player.get().position;
      return { phase: h.blade.state().phase, dx: p1.x - p0, y: p1.y, ev: h.blade.events().map((e: any) => e.type), st: h.blade.state() };
    });
    expect(r.phase, JSON.stringify(r)).toBe('recovery');
    expect(Math.abs(r.dx)).toBeLessThan(0.3);
    expect(r.y).toBeLessThan(9.05);
  });
});

test.describe('WEAPON-2 弓', () => {
  test('段・山なり・ささった や・拾う・たいきゅう', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.fill(9, 9, 4, 9, 12, 9, 'stone');
      h.inventory.setSlot(0, { item: 'yumi', count: 1 });
      h.inventory.setSlot(1, { item: 'ya', count: 5 });
      h.inventory.select(0);
      h.step(11);
      const out: any = {};
      // 段 0 で はなす
      h.input.press('primary');
      h.step(5);
      h.input.release('primary');
      h.step(2);
      out.dry = h.bow.events().some((e: any) => e.type === 'dryRelease');
      out.yaAfterDry = h.inventory.count('ya');
      h.step(12);
      // 段 3
      h.input.press('primary');
      h.step(45);
      out.stage = h.bow.state().stage;
      h.input.release('primary');
      h.step(1);
      const shot = h.bow.events().find((e: any) => e.type === 'arrowShot');
      out.shotStage = shot?.stage;
      out.speed = shot?.speed;
      h.step(1);
      const a = h.bow.arrows()[0];
      out.vyAfter = a ? a.velocity.y : null;
      h.step(60);
      out.stuck = h.bow.stuck().length;
      out.ya = h.inventory.count('ya');
      out.dur = h.inventory.durability(0).left;
      // 拾う
      const sp = h.bow.stuck()[0].position;
      h.player.set({ position: { x: sp.x - 1, y: 9, z: sp.z }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(3);
      out.stuckAfter = h.bow.stuck().length;
      out.yaAfter = h.inventory.count('ya');
      return out;
    });
    expect(r.dry).toBe(true);
    expect(r.yaAfterDry).toBe(5);
    expect(r.stage).toBe(3);
    expect(r.shotStage).toBe(3);
    expect(r.speed).toBe(28);
    expect(r.stuck).toBe(1);
    expect(r.ya).toBe(4);
    expect(r.dur).toBe(383);
    expect(r.stuckAfter).toBe(0);
    expect(r.yaAfter).toBe(5);
  });
});

test.describe('WEAPON-2 たいきゅう', () => {
  test('つるはしで ほると へる・0 で こわれる・ゲージが 出る', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.setSlot(0, { item: 'wood_pickaxe', count: 1 });
      h.inventory.select(0);
      h.world.fill(4, 10, 6, 4, 10, 6, 'stone');
      h.step(1);
      const out: any = { max: h.inventory.durability(0).max };
      out.gauge = document.querySelectorAll('#hud .wear-gauge').length;
      const dig = () => {
        h.input.press('primary');
        h.step(200);
        h.input.release('primary');
        h.step(2);
        h.input.press('primary');
        h.step(3);
        h.input.release('primary');
        h.step(2);
      };
      dig();
      out.left = h.inventory.durability(0).left;
      h.inventory.setDurability(0, 1);
      h.world.fill(4, 10, 6, 4, 10, 6, 'stone');
      dig();
      out.broke = h.inventory.slots?.()?.[0] ?? null;
      out.events = h.inventory.events().map((e: any) => e.type);
      return out;
    });
    expect(r.max).toBe(59);
    expect(r.gauge).toBeGreaterThan(0);
    expect(r.left).toBe(58);
    expect(r.events).toContain('toolBreak');
  });
});

test.describe('WEAPON-2 スクリーンショット', () => {
  test('構え・ゲージ・きせき・弓', async ({ page }) => {
    await open(page);
    const shot = (n: string) => page.screenshot({ path: `docs/screenshots/w2-${n}.png` });
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      h.inventory.setSlot(0, { item: 'crystal_katana', count: 1 });
      h.inventory.setSlot(1, { item: 'yumi', count: 1 });
      h.inventory.setSlot(2, { item: 'ya', count: 20 });
      h.inventory.setSlot(3, { item: 'wood_pickaxe', count: 1 });
      h.inventory.select(0);
      h.inventory.setDurability(0, 60);
      h.inventory.setDurability(3, 6);
      h.yokai.spawn('nurikabe', 5.5, 9, 6.5, { ai: false, yawDeg: 270 });
      h.step(30);
    });
    await shot('stance');
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(2);
      h.input.press('toggleView');
      h.step(1);
      h.input.release('toggleView');
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(5);
    });
    await shot('trail');
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(60);
      h.inventory.select(3);
      h.step(3);
    });
    await shot('gauge');
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.select(1);
      h.step(2);
      h.input.press('primary');
      h.step(45);
    });
    await shot('bow');
  });
});
