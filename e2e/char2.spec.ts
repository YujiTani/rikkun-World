import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';

/**
 * CHAR-2（docs/design/CHAR-2.md §6 通し）: AC20 刀の通し・AC21 弓の通し。
 * 数は ゲーム（window.__rikkun）に聞く。コマの表は 仕様書 §4.2・§4.3 の `ticks`（絵の長さ）から 計算する。
 * 絵は public/models/char/ に 10 まい入っていることが前提（名前は 仕様書 §4.7 の とおり）。
 */
const SHOTS = 'docs/screenshots/CHAR-2';
test.describe.configure({ timeout: 180_000 });

const KATANA_SET = ['katana_thrust', 'katana_kesa', 'katana_kiriage', 'katana_walk_chudan', 'katana_walk_jodan', 'katana_walk_gedan'];
const BOW_SET = ['bow_shot', 'bow_hold_walk', 'bow_walk', 'bow_rapid'];
const BASE_BYTES = 50_331_648; // はじめの 4 つ（32 コマ）
const KATANA_BYTES = 68 * 1_572_864; // 106,954,752
const BOW_BYTES = 39 * 1_572_864; // 61,341,696

/** 絵の 時間割（仕様書 §4.2・§4.3 の `ticks`） */
const KESA_TICKS = [8, 7, 4, 4, 5, 2, 2, 2, 5, 28, 8, 8, 8, 8, 7];
const BOW_SHOT_TICKS = [6, 6, 6, 6, 6, 5, 5, 9999]; // 引く 0〜7（c_7 = 40 で 7 コマめ。7 より大きくしない）
const cellAt = (ticks: number[], t: number): number => {
  let c = 0;
  for (let k = 0; k < ticks.length; k++) {
    c += ticks[k]!;
    if (t < c) return k;
  }
  return ticks.length - 1;
};

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  // はじめの 4 つ（たつ・あるく・はしる・ジャンプ）が ぜんぶ 読めるまで
  await expect.poll(() => page.evaluate(() => (window.__rikkun! as any).player.doll().sprite.gpuBytes), { timeout: 8000 }).toBe(BASE_BYTES);
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
  await standOnGround(page, 20.5, 20.5, { yaw: 0, pitch: 0 });
}

/** 持ったあとの 絵の 読みこみ（本当の時間で 上限 5 秒）を 待つ。待つあいだ 1 ステップずつ進める */
async function waitReady(page: Page, names: string[]) {
  await expect
    .poll(
      () =>
        page.evaluate((ns) => {
          const h = window.__rikkun! as any;
          h.step(1);
          const st = h.player.doll().sprite.status;
          return ns.every((n: string) => st?.[n] === 'ready');
        }, names),
      { timeout: 5000 },
    )
    .toBe(true);
}

const sprite = (page: Page) =>
  page.evaluate(() => {
    const s = (window.__rikkun! as any).player.doll().sprite;
    return { scene: s.scene as string, motion: s.motion as string, frame: s.frame as number, gpuBytes: s.gpuBytes as number };
  });

const gpu = (page: Page) => page.evaluate(() => (window.__rikkun! as any).player.doll().sprite.gpuBytes as number);

test.describe('CHAR-2 通し', () => {
  test('AC20: 刀の通し（かまえ → かまえ歩き → 上段へ R → 大けさぎり 106 ステップ）', async ({ page }) => {
    await open(page);
    expect(await gpu(page)).toBe(BASE_BYTES);

    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.inventory.setSlot(0, { item: 'katana', count: 1 });
      h.inventory.select(0);
      h.step(1);
    });
    await waitReady(page, KATANA_SET);
    expect(await gpu(page)).toBe(BASE_BYTES + KATANA_BYTES);

    // 立つ: かまえ・中段の 0 コマめ
    await page.evaluate(() => (window.__rikkun! as any).step(30));
    expect(await sprite(page)).toMatchObject({ scene: 'kamae', motion: 'katana_thrust', frame: 0 });

    // W で 20 ステップ: かまえ歩き（中段）
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('moveForward');
      h.step(20);
    });
    expect(await sprite(page)).toMatchObject({ scene: 'kamaeWalk', motion: 'katana_walk_chudan' });

    // はなして 止まり、上段へ R
    const afterR = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.release('moveForward');
      h.step(60);
      h.input.press('stanceNext');
      h.step(1);
      h.input.release('stanceNext');
      h.step(10);
      const s = h.player.doll().sprite;
      return { stance: h.blade.state().stance, scene: s.scene, motion: s.motion, frame: s.frame };
    });
    expect(afterR).toMatchObject({ stance: 'jodan', scene: 'kamae', motion: 'katana_kesa', frame: 0 });

    // 目の前 2 に 妖怪（体力は 多めに して 1 回ぶんを 見る）
    const setup = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const p = h.player.get();
      const yawRad = (p.yaw * Math.PI) / 180;
      const u = { x: Math.sin(yawRad), z: -Math.cos(yawRad) };
      const id = h.yokai.spawn('nurikabe', p.position.x + u.x * 2, p.position.y, p.position.z + u.z * 2, { ai: false });
      h.yokai.setHp(id, 40);
      h.yokai.events();
      h.blade.events();
      const hp0 = h.yokai.list().find((y: any) => y.id === id).hp;
      return { id, u, hp0, start: p.position, yaw: p.yaw };
    });

    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
    });

    let prevCam: { x: number; y: number; z: number } | null = null;
    let maxCamMove = 0;
    for (let f = 1; f <= 106; f++) {
      if (f > 1) await page.evaluate(() => (window.__rikkun! as any).step(1));
      const s = await page.evaluate(() => {
        const h = window.__rikkun! as any;
        const sp = h.player.doll().sprite;
        return { frame: h.blade.state().frame, scene: sp.scene, cell: sp.frame, motion: sp.motion, cam: h.camera.get().position };
      });
      expect(s.frame, `F${f}`).toBe(f);
      expect(s.scene, `F${f}`).toBe('tech');
      expect(s.motion, `F${f}`).toBe('katana_kesa');
      expect(s.cell, `F${f} の コマ`).toBe(cellAt(KESA_TICKS, f - 1));
      if (prevCam) maxCamMove = Math.max(maxCamMove, Math.hypot(s.cam.x - prevCam.x, s.cam.y - prevCam.y, s.cam.z - prevCam.z));
      prevCam = s.cam;
      if (f === 20 || f === 30 || f === 60) await page.screenshot({ path: `${SHOTS}/AC20-kesa-F${f}.png` });
    }
    expect(maxCamMove).toBeLessThanOrEqual(0.12);

    // おわったあと: かまえの 0 コマめ・体は u へ 0.800
    await page.evaluate(() => (window.__rikkun! as any).step(1));
    const end = await page.evaluate(
      ({ id }) => {
        const h = window.__rikkun! as any;
        const sp = h.player.doll().sprite;
        return {
          scene: sp.scene,
          frame: sp.frame,
          pos: h.player.get().position,
          hp: h.yokai.list().find((y: any) => y.id === id).hp,
          hits: h.blade.events().filter((e: any) => e.type === 'techHit').length,
        };
      },
      { id: setup.id },
    );
    expect(end).toMatchObject({ scene: 'kamae', frame: 0 });
    const dx = end.pos.x - setup.start.x;
    const dz = end.pos.z - setup.start.z;
    expect(Math.abs(dx * setup.u.x + dz * setup.u.z - 0.8)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(dx * -setup.u.z + dz * setup.u.x)).toBeLessThanOrEqual(0.01); // よこには ずれない
    expect(end.hits).toBe(1);
    expect(end.hp).toBeLessThan(setup.hp0);
  });

  test('AC21: 弓の通し（立つ → 引く → はなす → 連射 → 引きながら歩く → 刀の組も読む）', async ({ page }) => {
    await open(page);
    expect(await gpu(page)).toBe(BASE_BYTES);

    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.inventory.setSlot(0, { item: 'yumi', count: 1 });
      h.inventory.setSlot(1, { item: 'ya', count: 5 });
      h.inventory.select(0);
      h.step(1);
    });
    await waitReady(page, BOW_SET);
    expect(await gpu(page)).toBe(BASE_BYTES + BOW_BYTES);

    // 立つ
    await page.evaluate(() => (window.__rikkun! as any).step(20));
    expect(await sprite(page)).toMatchObject({ scene: 'bowHold', motion: 'bow_shot', frame: 0 });
    await page.screenshot({ path: `${SHOTS}/AC21-1-stand.png` });

    // 45 ステップ引く: いちばん引いた絵（7 コマめ）・印の丸 3 こ
    const drawn = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('primary');
      h.step(45);
      const s = h.player.doll().sprite;
      return { scene: s.scene, motion: s.motion, frame: s.frame, ticks: h.bow.state().drawTicks, stage: h.bow.state().stage, dots: document.querySelectorAll('#aim-bow .aim-bow__dot.on').length };
    });
    expect(drawn).toMatchObject({ scene: 'bowDraw', motion: 'bow_shot', frame: 7, stage: 3, dots: 3 });
    expect(cellAt(BOW_SHOT_TICKS, drawn.ticks)).toBe(7);
    await page.screenshot({ path: `${SHOTS}/AC21-2-full-draw.png` });

    // はなす: 矢が 1 本 飛び、はなす絵（8 コマめ）
    const shot = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const ya0 = h.inventory.count('ya');
      h.input.release('primary');
      h.step(1);
      const s = h.player.doll().sprite;
      return { arrows: h.bow.arrows().length, used: ya0 - h.inventory.count('ya'), scene: s.scene, frame: s.frame };
    });
    expect(shot).toMatchObject({ arrows: 1, used: 1, scene: 'bowRelease', frame: 8 });

    // うって 12 ステップめに 押して 引く: 連射の絵
    const rapid = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.step(11);
      h.input.press('primary');
      h.step(1);
      const s = h.player.doll().sprite;
      return { drawing: h.bow.state().drawing, scene: s.scene, motion: s.motion };
    });
    expect(rapid).toMatchObject({ drawing: true, scene: 'bowDraw', motion: 'bow_rapid' });
    await page.evaluate(() => (window.__rikkun! as any).step(10));
    await page.screenshot({ path: `${SHOTS}/AC21-3-rapid.png` });
    const rapidRel = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.release('primary');
      h.step(1);
      const s = h.player.doll().sprite;
      return { used: 5 - h.inventory.count('ya'), motion: s.motion, scene: s.scene, frame: s.frame };
    });
    expect(rapidRel).toMatchObject({ used: 2, motion: 'bow_rapid', scene: 'bowRelease', frame: 7 });

    // W を押して 引く: 引きながら歩く
    const walk = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.step(30);
      h.input.press('moveForward');
      h.input.press('primary');
      h.step(20);
      const s = h.player.doll().sprite;
      return { scene: s.scene, motion: s.motion, drawing: h.bow.state().drawing };
    });
    expect(walk).toMatchObject({ scene: 'bowDrawWalk', motion: 'bow_walk', drawing: true });
    await page.screenshot({ path: `${SHOTS}/AC21-4-draw-walk.png` });
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.releaseAll();
      h.step(30);
    });

    // 刀も 持つ: 組が ぜんぶ 読まれて 218,628,096。持ちかえても 読み直さない
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.inventory.setSlot(2, { item: 'katana', count: 1 });
      h.inventory.select(2);
      h.step(1);
    });
    await waitReady(page, KATANA_SET);
    expect(await gpu(page)).toBe(BASE_BYTES + BOW_BYTES + KATANA_BYTES);
    expect(BASE_BYTES + BOW_BYTES + KATANA_BYTES).toBe(218_628_096);
    const swap = await page.evaluate(([ks, bs]) => {
      const h = window.__rikkun! as any;
      const out: number[] = [];
      for (const slot of [0, 2, 0, 2]) {
        h.inventory.select(slot);
        h.step(5);
        out.push(h.player.doll().sprite.gpuBytes);
      }
      const st = h.player.doll().sprite.status;
      return { out, allReady: [...ks!, ...bs!].every((n) => st?.[n] === 'ready') };
    }, [KATANA_SET, BOW_SET] as const);
    expect(new Set(swap.out)).toEqual(new Set([218_628_096]));
    expect(swap.allReady).toBe(true);
  });
});
