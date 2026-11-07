import { expect, test, type Page } from '@playwright/test';
import { DUO_RENDER_BUDGET, measureDuoRender, measureRender } from '../e2e/helpers/duoBudget';
import { installFakePads } from '../e2e/helpers/duoUi';
import { RAIJIN, spawnAt } from '../e2e/helpers/legend';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §12.1・AC107【perf】）: 2P が いる とき、2 人 同時に 雷を 落とす 場面の 描画回数・三角形が
 * AC31 の 上限（DUO_RENDER_BUDGET: 1 人の ときの 2.0 倍・1.8 倍）の 中。雷が ない 2 人の ときと くらべた ふえは 雷の 絵の ぶん だけ
 * （全面の 光の 道の 描画は 0 = `duo.state().fullPass` が 0。AC98）。形は e2e/duo2.spec.ts の AC31 に ならう。
 * 実装の 後の 性能ループ（perf-analyst）で 回す。手元では 回さない。時間（ms）では 合否を 決めない（#255）。描画回数と 三角形だけ。
 *
 * ---- 前提（口は 仕様 §12.0 の とおり）----
 *   duo.legend(who) … 4d-2 の 口。who の わざの 今の ようす（move・moveF）。
 *   duo.thunder(who) … 4d-2 の 口。who の 雷の 絵の ようす（info().bolt.visible）。1P の `thunder` は 今の まま。
 *   2P の 入力: 偽パッド 番号 1 の ZR（ボタン 7）= primary。
 *   雷神剣の strikeF は 設定の 表（`settings.get('legendary')`）から 読む。
 */

test.describe.configure({ timeout: 300_000 });

const open = async (page: Page, query: string): Promise<void> => {
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('animalAutoSpawn', false);
    h.lock.simulate(true);
    h.step(2);
  });
};

test('AC107: 2 人 同時に 雷を 落とす 場面でも 描画回数・三角形が DUO_RENDER_BUDGET の 中。全面の 光の 道は 0。雷の ない 2 人と くらべた ふえを 記録', async ({ page }) => {
  await open(page, '?nosave=1&ring=small&duo=dev');
  const solo = await measureRender(page);
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await page.evaluate(() => (window as any).__rikkun.step(30));
  // 雷が ない 2 人（近い: 2 マス）
  const quiet = await measureDuoRender(page, { dx: 0, dz: 2 });
  expect(quiet.view).toBe('split');

  // 2 人とも 雷神剣。北 8 マス先の 地面を ねらい、そこに 妖怪を 置く（雷を ちゃんと 当てる）
  const setup = await page.evaluate(
    ({ item }) => {
      const h = (window as any).__rikkun;
      const out: { who: 1 | 2; x: number; z: number; y: number }[] = [];
      for (const who of [1, 2] as const) {
        const p = h.duo.pos(who);
        h.duo.give(who, item, 1);
        out.push({ who, x: Math.floor(p.x), z: Math.floor(p.z) - 8, y: p.y - 1 });
      }
      return out;
    },
    { item: RAIJIN },
  );
  for (const s of setup) {
    await spawnAt(page, 'karakasa', s.x + 0.5, s.y + 1, s.z + 0.5, 400);
    await page.evaluate((s) => (window as any).__rikkun.duo.aimAt(s.who, { x: s.x, y: s.y, z: s.z }), s);
  }
  await page.evaluate(() => (window as any).__rikkun.step(2));
  // 同じ 場面で 雷も ためも ない コマ（くらべる 相手）
  const idle = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.step(1);
    const s = h.renderStats();
    return { drawCalls: s.drawCalls as number, triangles: s.triangles as number };
  });

  // 2 人 同時に ため → ready で 同時に はなす → 雷が 見える コマ（lightning の F）ごとに 描画を 数える
  const frames = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const pad = (window as any).__pads[1];
    const zr = (on: boolean) => {
      const b = pad.buttons[7];
      b.pressed = on;
      b.touched = on;
      b.value = on ? 1 : 0;
    };
    const press = (on: boolean) => {
      on ? h.input.press('primary') : h.input.release('primary');
      zr(on);
    };
    const out: { F1: number | null; F2: number | null; drawCalls: number; triangles: number; full: number; views: number; bolt: boolean }[] = [];
    let released = false;
    press(true);
    for (let i = 0; i < 500; i++) {
      const a = h.duo.legend(1);
      const b = h.duo.legend(2);
      if (!released && a?.charge?.ready && b?.charge?.ready) {
        press(false);
        released = true;
      }
      h.step(1);
      const s = h.renderStats(); // たまった 描画を 流して から 数える
      const a2 = h.duo.legend(1);
      const b2 = h.duo.legend(2);
      if (released && (a2?.move === 'lightning' || b2?.move === 'lightning')) {
        out.push({ F1: a2?.moveF ?? null, F2: b2?.moveF ?? null, drawCalls: s.drawCalls, triangles: s.triangles, full: h.duo.state().fullPass, views: h.duo.viewports().length, bolt: !!(h.duo.thunder(1)?.info().bolt.visible || h.duo.thunder(2)?.info().bolt.visible || h.thunder.info().bolt.visible) });
      }
      if (released && a2?.move === null && b2?.move === null) break;
    }
    press(false);
    return out;
  });
  expect(frames.length, '2 人の 雷が 見える コマが あった').toBeGreaterThan(0);
  const worst = frames.reduce((m, f) => ({ drawCalls: Math.max(m.drawCalls, f.drawCalls), triangles: Math.max(m.triangles, f.triangles) }), { drawCalls: 0, triangles: 0 });
  test.info().annotations.push({ type: 'solo', description: JSON.stringify(solo) });
  test.info().annotations.push({ type: 'duo-quiet', description: JSON.stringify({ drawCalls: quiet.drawCalls, triangles: quiet.triangles }) });
  test.info().annotations.push({ type: 'duo-thunder-worst', description: JSON.stringify(worst) });
  test.info().annotations.push({ type: 'increase', description: JSON.stringify({ drawCalls: worst.drawCalls - quiet.drawCalls, triangles: worst.triangles - quiet.triangles }) });

  // 雷の 板は 2 人の ときも **描かれて いる**: 全面の 光の 道〈worldPass〉は 通らない ので、雷は 区画ごとの 描画の すぐ あとに 重ねて 描く
  // （ThunderFx.renderInPane・DuoViewRenderer の afterPane。p2Legend.test.ts の 頭）。板が 見える コマの 描画回数は 雷の ない 同じ 場面より **ふえる**。
  const boltFrames = frames.filter((f) => f.bolt);
  expect(boltFrames.length, '雷の 板が 見える コマが あった（duo.thunder(who).info().bolt.visible）').toBeGreaterThan(0);
  const boltWorst = Math.max(...boltFrames.map((f) => f.drawCalls));
  test.info().annotations.push({ type: 'idle', description: JSON.stringify(idle) });
  expect(boltWorst - idle.drawCalls, `雷の コマの 描画回数（${boltWorst}）は 雷の ない 同じ 場面（${idle.drawCalls}）より ふえる`).toBeGreaterThan(0);

  const b = DUO_RENDER_BUDGET.split;
  expect(worst.drawCalls, `描画回数（1 人 ${solo.drawCalls} の ${b.drawCalls} 倍まで）`).toBeLessThanOrEqual(Math.ceil(solo.drawCalls * b.drawCalls));
  expect(worst.triangles, `三角形（1 人 ${solo.triangles} の ${b.triangles} 倍まで）`).toBeLessThanOrEqual(Math.ceil(solo.triangles * b.triangles));
  frames.forEach((f, i) => {
    expect(f.views, `${i} コマ目: 区画は 2 つ`).toBe(2);
    expect(f.full, `${i} コマ目: 全面の 光の 道の 描画は 0`).toBe(0);
  });
});
