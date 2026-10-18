import { expect, test, type Page } from '@playwright/test';

/**
 * PERF-1（issue #200）: 近さの段（micro/box/lod）を決める位置は プレイヤーの位置。カメラの位置ではない。
 *  (1) その場で 180° を 20 回振り向いても、段の切りかえによる作りなおしが ほぼ 0。
 *  (2) 歩く・テレポートでは 段は今どおり（プレイヤーからの距離と ずらし ±2 で）決まる。
 * 実装の前は (1) が赤（肩ごしカメラが振り向きで約 10 マス動き、境目 48±2 の列が箱と LOD を行き来する）。
 * E2E のサーバーは microR=0 なので 境目は box↔lod の 48。角度・座標は決め打ちせず ゲームに聞く。
 */

const TURNS = 20;
const BOX_OUTER = 48;
const H = 2;

async function open(page: Page): Promise<void> {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true, null, { timeout: 120_000 });
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
  });
}

/** 光とメッシュの順番待ちが 0 になるまで進める（決め打ちのコマ数は使わない） */
async function quiet(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    let n = 0;
    while (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) {
      if (n >= 3000) throw new Error('QUIET_TIMEOUT');
      h.step(5);
      n += 5;
    }
    h.step(5);
  });
}

test.describe('PERF-1 段を決める位置はプレイヤー', () => {
  test('(1) その場で 180° を 20 回振り向いても 段の切りかえの作りなおしがほぼ 0', async ({ page }) => {
    await open(page);
    await quiet(page);
    const r = await page.evaluate((TURNS) => {
      const h = (window as any).__rikkun;
      const yaw0: number = h.player.get().yaw;
      h.world.rebuildLog(true);
      const tiersBefore = h.world.sectionStats();
      for (let i = 0; i < TURNS; i++) {
        h.player.set({ yaw: yaw0 + 180 * ((i + 1) % 2) });
        h.step(30);
      }
      // 作りなおしが終わるまで（順番待ちが 0）進めて、ぜんぶ記録に出す
      let n = 0;
      while (h.world.meshStats().pending > 0 && n < 3000) {
        h.step(5);
        n += 5;
      }
      const log = h.world.rebuildLog(true);
      return { count: log.length, tiersBefore, tiersAfter: h.world.sectionStats(), pos: h.player.get().position };
    }, TURNS);
    console.log('PERF-1 (1)', JSON.stringify({ count: r.count, before: r.tiersBefore, after: r.tiersAfter }));
    expect(r.tiersBefore.box, '境目の箱の段がある').toBeGreaterThan(0);
    expect(r.tiersBefore.lod, '境目の LOD の段がある').toBeGreaterThan(0);
    expect(r.count, `振り向くだけの ${TURNS} 回で 作りなおしたセクション`).toBeLessThanOrEqual(2);
  });

  test('(2) テレポート・歩きのあと 段は プレイヤーからの距離と ずらし ±2 で決まる', async ({ page }) => {
    await open(page);
    await quiet(page);
    const sp = await page.evaluate(() => (window as any).__rikkun.world.spawn());
    const size = await page.evaluate(() => (window as any).__rikkun.world.size());
    // 世界の四すみ近くへ（座標は世界の大きさに聞いて決める）。歩きは 小さく動かして step で確かめる
    const spots = [
      { x: size.x * 0.3, z: size.z * 0.3 },
      { x: size.x * 0.7, z: size.z * 0.6 },
      { x: sp.x, z: sp.z },
    ];
    for (const s of spots) {
      await page.evaluate((s) => {
        const h = (window as any).__rikkun;
        const y = h.player.get().position.y;
        h.player.set({ position: { x: s.x, y: y + 2, z: s.z }, velocity: { x: 0, y: 0, z: 0 } });
      }, s);
      await quiet(page);
      const p = await page.evaluate(() => (window as any).__rikkun.player.get().position);
      const r = await page.evaluate(({ p, size }) => {
        const h = (window as any).__rikkun;
        const out = { box: [] as number[], lod: [] as number[], bad: 0 };
        const secs = Math.ceil(size.y / 16);
        for (let y = 0; y < secs; y++)
          for (let z = 0; z < size.z / 16; z++)
            for (let x = 0; x < size.x / 16; x++) {
              const i = h.world.sectionInfo(x, y, z);
              // こちらで プレイヤーからの水平の距離を求める
              const dx = Math.max(x * 16 - p.x, 0, p.x - (x * 16 + 16));
              const dz = Math.max(z * 16 - p.z, 0, p.z - (z * 16 + 16));
              const d = Math.hypot(dx, dz);
              if (i.tier === 'box') {
                out.box.push(d);
              } else if (i.tier === 'lod') out.lod.push(d);
            }
        return out;
      }, { p, size });
      console.log('PERF-1 (2)', JSON.stringify({ at: p, boxMax: Math.max(...r.box), lodMin: Math.min(...r.lod) }));
      expect(Math.max(...r.box), '箱の段は 48+2 まで（プレイヤーから）').toBeLessThanOrEqual(BOX_OUTER + H + 1e-6);
      if (r.lod.length > 0) expect(Math.min(...r.lod), 'LOD の段は 48-2 より遠い（プレイヤーから）').toBeGreaterThanOrEqual(BOX_OUTER - H - 1e-6);
    }
  });
});
