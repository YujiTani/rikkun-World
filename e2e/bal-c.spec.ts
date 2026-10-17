import { expect, test, type Page } from '@playwright/test';

/**
 * BAL-C（#111）AC12b: 妖怪の体力のバー（docs/design/BALANCE.md §4.7）。
 * 窓口: window.__rikkun.hud.hpBar(yokaiId)。最大体力は決め打ちせず、ゲームから読んで期待を計算する
 * （BAL-A でからかさの体力が変わっても通る）。
 */

test.describe.configure({ timeout: 120_000 });

async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
    h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
    h.world.fill(0, 9, 0, 12, h.world.size().y - 1, 12, 'air');
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1); // 空気の穴の光とメッシュを先に済ませる
    h.inventory.clear();
    h.time.set(0);
    h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
    h.step(10);
    h.yokai.events();
    h.combat.events();
  });
  await page.evaluate(FACE);
}

/** ページ内の道具。妖怪の位置から立つ場所を置き直し、yokai.raycast で当たるか確かめる（bal-a.spec.ts の AC8 と同じやり方） */
const FACE = `
  (window).__faceTo = (id, dist = 2) => {
    const h = window.__rikkun;
    const y = h.yokai.list().find((q) => q.id === id);
    if (!y) return false;
    h.player.set({ position: { x: y.position.x - dist, y: y.position.y, z: y.position.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
    h.step(1);
    const hit = h.yokai.raycast(h.camera.get().eye, { x: 1, y: 0, z: 0 }, 4);
    return hit?.id === id;
  };
  (window).__spawnAhead = () => {
    const h = window.__rikkun;
    const e = h.camera.get().eye;
    return h.yokai.spawn('karakasa', e.x + 2, 9, e.z, { ai: false, yawDeg: 270 });
  };
`;

/** §4.7 の式 */
function expected(hp: number, max: number) {
  const bars = Math.min(max, 20);
  const left = Math.ceil((bars * hp) / max);
  const color = hp * 3 < max ? 'red' : hp * 2 < max ? 'yellow' : 'white';
  return { bars, left, color };
}

test.describe('BAL-C 体力のバー（AC12b）', () => {
  test('AC12b: たたかなければ出ない・すでで たたくと 本数・残り・色が式どおり・180 ステップで消える・まる は出ない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const one = (id: number) => h.yokai.list().find((y: any) => y.id === id);
      const id = (window as any).__spawnAhead();
      const out: any = { id, max: one(id).maxHp, untouched: [] as any[], hits: [] as any[], aimed: [] as boolean[] };
      // たたかなければ 180 ステップ ずっと出ない
      for (let i = 0; i < 18; i++) {
        h.step(10);
        out.untouched.push(h.hud.hpBar(id));
      }
      out.unknown = h.hud.hpBar(999999);
      // すで（何も持たない）で 体力が 1 になるまで たたく
      h.inventory.clear();
      let guard = 0;
      while (one(id).hp > 1 && guard++ < 30) {
        const before = one(id).hp;
        out.aimed.push((window as any).__faceTo(id));
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        let s = 0;
        while (one(id).hp === before && s++ < 120) h.step(1);
        out.hits.push({ hp: one(id).hp, bar: h.hud.hpBar(id) });
      }
      // 最後にたたいてから 180 ステップで消える
      h.step(100);
      out.at100 = h.hud.hpBar(id);
      h.step(75);
      out.at175 = h.hud.hpBar(id);
      h.step(10);
      out.at185 = h.hud.hpBar(id);
      return out;
    });
    // たたく前: バーなし（visible=false）。まる も出ない
    for (const b of r.untouched) expect(b?.visible).toBe(false);
    expect(r.unknown).toBeNull();
    expect(r.aimed.every((a: boolean) => a), JSON.stringify(r.aimed)).toBe(true);
    expect(r.hits.length).toBeGreaterThan(0);
    // AC12b（BAL-A のあと）: からかさ は 最大 8。5 回で 残り 3・黄、6 回で 残り 2・赤
    expect(r.max).toBe(8);
    const at = (hp: number) => r.hits.find((h: any) => h.hp === hp)?.bar;
    expect(at(3)).toMatchObject({ bars: 8, left: 3, color: 'yellow' });
    expect(at(2)).toMatchObject({ bars: 8, left: 2, color: 'red' });
    const colors = new Set<string>();
    for (const hit of r.hits) {
      const e = expected(hit.hp, r.max);
      expect(hit.bar.visible, `hp=${hit.hp}`).toBe(true);
      expect(hit.bar.bars, `hp=${hit.hp} bars`).toBe(e.bars);
      expect(hit.bar.left, `hp=${hit.hp} left`).toBe(e.left);
      expect(hit.bar.color, `hp=${hit.hp} color`).toBe(e.color);
      expect(hit.bar.icon).toBeNull();
      colors.add(hit.bar.color);
    }
    // 最後（体力 1）は 最大が 2 より大きければ 赤
    const last = r.hits[r.hits.length - 1];
    expect(last.hp).toBe(1);
    expect(last.bar.color).toBe(r.max >= 3 ? 'red' : 'white');
    // 最大が 5 以上なら 黄 も 通る（最大 4 だと 黄は ない）
    if (r.max >= 5) expect(colors.has('yellow')).toBe(true);
    expect(colors.has('red')).toBe(true);
    // 180 ステップで消える
    expect(r.at100.visible).toBe(true);
    expect(r.at175.visible).toBe(true);
    expect(r.at185.visible).toBe(false);
  });

  test('AC12b: バーの絵（スクショ）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const id = (window as any).__spawnAhead();
      (window as any).__faceTo(id);
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(40);
      h.step(3);
      return { id, bar: h.hud.hpBar(id) };
    });
    expect(r.bar?.visible).toBe(true);
    await page.screenshot({ path: 'docs/test-reports/assets/BAL-C-hp-bar.png' });
  });
});
