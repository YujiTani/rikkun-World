import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { waitCharLoaded, waitSpritesReady } from './helpers/char';

/**
 * CHAR-2（docs/design/CHAR-2.md §6 通し）: AC20 刀の通し・AC21 弓の通し。
 * 数は ゲーム（window.__rikkun）に聞く。コマの表は 仕様書 §4.2・§4.3 の `ticks`（絵の長さ）から 計算する。
 * 絵は public/models/char/ に 10 まい入っていることが前提（名前は 仕様書 §4.7 の とおり）。
 */
const SHOTS = 'test-shots/CHAR-2';
test.describe.configure({ timeout: 180_000 });

const KATANA_SET = ['katana_thrust', 'katana_kesa', 'katana_kiriage', 'katana_walk_chudan', 'katana_walk_jodan', 'katana_walk_gedan'];
const BOW_SET = ['bow_shot', 'bow_hold_walk', 'bow_walk', 'bow_rapid'];
// 仕様書 第 2 版 §4.7 の「本当の値」（切りつめた PNG の よこ × たて の合計）。上限 64 MiB
const BASE_BYTES = 12_863_488; // はじめの 4 つ
const KATANA_BYTES = 30_404_608; // 刀の組 6 まい（新しい絵 kesa2・kiriage2。はじめ ＋ 刀 = 43,268,096）
const BOW_BYTES = 18_585_600; // 弓の組 4 まい（はじめ ＋ 弓 = 31,449,088）
const ALL_BYTES = 61_853_696; // ぜんぶ 14 まい
const LIMIT_BYTES = 67_108_864;

/** 絵の 時間割（仕様書 §4.2・§4.3 の `ticks`）。大けさぎりの 絵は 作りなおし中なので、決め打ちせず atlas.json から 読む */
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
  await waitCharLoaded(page, { gpuBytes: BASE_BYTES });
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

/** 持ったあとの 絵の 読みこみを 待つ（描画を止めて 1 ステップずつ 進める） */
async function waitReady(page: Page, names: string[]): Promise<void> {
  await waitSpritesReady(page, names);
}

/** `atlas.json` の `packed` の よこ × たて の合計（ちょうど `gpuBytes` になる） */
const packedBytes = (page: Page, names: string[]) =>
  page.evaluate(async (ns) => {
    const atlas = await (await fetch('./models/char/girl/atlas.json')).json();
    return ns.reduce((a: number, n: string) => a + atlas.motions[n].packed.width * atlas.motions[n].packed.height, 0);
  }, names);
const BASE_SET = ['idle', 'walk', 'run', 'jump'];

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
    expect(await gpu(page)).toBe(await packedBytes(page, [...BASE_SET, ...KATANA_SET]));
    expect(await gpu(page)).toBeLessThanOrEqual(LIMIT_BYTES);

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

    const KESA_TICKS: number[] = await page.evaluate(async () => (await (await fetch('./models/char/girl/atlas.json')).json()).motions.katana_kesa.ticks);
    for (let f = 1; f <= 106; f++) {
      if (f > 1) await page.evaluate(() => (window.__rikkun! as any).step(1));
      const s = await page.evaluate(() => {
        const h = window.__rikkun! as any;
        const sp = h.player.doll().sprite;
        return { frame: h.blade.state().frame, scene: sp.scene, cell: sp.frame, motion: sp.motion };
      });
      expect(s.frame, `F${f}`).toBe(f);
      expect(s.scene, `F${f}`).toBe('tech');
      expect(s.motion, `F${f}`).toBe('katana_kesa');
      expect(s.cell, `F${f} の コマ`).toBe(cellAt(KESA_TICKS, f - 1));
      if (f === 20 || f === 30 || f === 60) await page.screenshot({ path: `${SHOTS}/AC20-kesa-F${f}.png` });
    }
    // WEAPON-4: カメラの 1 ステップの 動きの 上限（0.12）は 大けさぎりだけ やめた。見た目は オーナー確認（AC27）

    // おわったあと: かまえの 0 コマめ・体は u へ。ぬりかべ（前 2）の 手前で 止まる（WEAPON-4 §4.5: 半径 0.9 + 0.3 + 0.1 まで）
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
    const adv = dx * setup.u.x + dz * setup.u.z;
    expect(adv).toBeLessThanOrEqual(2 - 1.3 + 0.01); // 手前（1.3）より 近づかない
    expect(adv).toBeGreaterThan(0.2); // とちゅうまでは すすむ（止まり方は 開発に まかせる）
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
    expect(await gpu(page)).toBe(await packedBytes(page, [...BASE_SET, ...BOW_SET]));

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
    expect(BASE_BYTES + BOW_BYTES + KATANA_BYTES).toBe(ALL_BYTES);
    expect(await gpu(page)).toBe(await packedBytes(page, [...BASE_SET, ...BOW_SET, ...KATANA_SET]));
    expect(await gpu(page)).toBeLessThanOrEqual(LIMIT_BYTES);
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
    expect(new Set(swap.out)).toEqual(new Set([ALL_BYTES]));
    expect(swap.allReady).toBe(true);
  });
});
