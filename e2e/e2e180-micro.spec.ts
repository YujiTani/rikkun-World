import { expect, test, type Page } from '@playwright/test';
import { fine } from './helpers/fine';

/**
 * E2E-180（docs/tickets/E2E-180.md、issue #180）: 見た目を見ないテストは 小ブロックの細かいメッシュを作らない。
 *
 * E2E の開発サーバーは `VITE_MICRO_DEFAULT=off` で起動する（playwright.config.ts。影の `VITE_SHADOW_DEFAULT=off` と同じ所）。
 *   - URL に `?microR` を付けない → 小ブロックの半径 0。近くも 箱の段（micro の段が 1 つもない）。起動が 8〜12 秒はやい
 *   - `?microR=28` を付ける → 28。近くは micro（ふつうに遊ぶときと同じ。環境変数より URL が強い）
 *   - `?microR=0` → 0 として受けつける（環境変数がなくても 0）
 * 実装の前は赤（半径 0 が まだ無い・設定にまだ VITE_MICRO_DEFAULT が無い）。
 *
 * 使う窓口は VOX-E の `world.sectionStats()` / `world.sectionInfo(sx, sy, sz)` / `world.spawn()` だけ（新しい hook はいらない）。
 * 近いかどうかは 座標を決め打ちせず、ゲームが答える `dist`（プレイヤーのいる列までの水平の距離）で決める。
 */

const NEAR = 20; // この距離（ブロック）より近いセクションは、半径 28 なら小ブロックの段、半径 0 なら箱の段

interface Probe {
  s: {
    microR: number;
    micro: number;
    box: number;
    lod: number;
    microMaxDist: number;
    boxMinDist: number;
    boxMaxDist: number;
  };
  /** プレイヤーのいるセクション */
  here: { tier: string; meshes: number; dist: number };
  /** メッシュのある近いセクション（dist ≤ NEAR）の段ごとの数 */
  nearTiers: { micro: number; box: number };
}

/** 開く → 光とメッシュの順番待ちが 0 になるまで進める → 段を数える（決め打ちのコマ数は使わない。最大 3000 コマ） */
async function probe(page: Page, query: string): Promise<Probe> {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true, null, { timeout: 120_000 });
  return page.evaluate((NEAR) => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    let n = 0;
    while (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) {
      if (n >= 3000) throw new Error('QUIET_TIMEOUT: lightPending=' + h.world.lightPending() + ' meshPending=' + h.world.meshStats().pending);
      h.step(5);
      n += 5;
    }
    h.step(2);
    const sp = h.world.spawn();
    const here = h.world.sectionInfo(Math.floor(sp.x / 16), Math.floor(sp.y / 16), Math.floor(sp.z / 16));
    const sections = Math.ceil(h.world.size().y / 16);
    const nearTiers = { micro: 0, box: 0 };
    for (let y = 0; y < sections; y++)
      for (let z = 0; z < 8; z++)
        for (let x = 0; x < 8; x++) {
          const i = h.world.sectionInfo(x, y, z);
          if (i.dist > NEAR || i.meshes === 0) continue;
          if (i.tier === 'micro') nearTiers.micro++;
          if (i.tier === 'box') nearTiers.box++;
        }
    return { s: h.world.sectionStats(), here, nearTiers };
  }, NEAR);
}

/** 半径 0 のとき: 近くも箱の段。micro の段がどこにもない。箱の外は LOD のまま */
function expectBoxOnly(r: Probe, why: string): void {
  expect(r.s.microR, why).toBe(0);
  expect(r.s.micro, 'micro の段のセクション数').toBe(0);
  expect(r.s.microMaxDist, 'micro の段の いちばん遠い距離').toBe(0);
  expect(r.here.tier, 'プレイヤーのいるセクションの段').toBe('box');
  expect(r.here.meshes).toBeGreaterThan(0);
  expect(r.nearTiers.micro, `近く（${NEAR} 以内）の micro のセクション`).toBe(0);
  expect(r.nearTiers.box, `近く（${NEAR} 以内）の 箱の段のセクション（近くも描いてある）`).toBeGreaterThan(0);
  expect(r.s.box).toBeGreaterThan(0);
  expect(r.s.lod, '遠くの LOD は 今のまま').toBeGreaterThan(0);
  expect(r.s.boxMaxDist, '箱の外側は 48+2 のまま').toBeLessThanOrEqual(48 + 2);
}

test.describe('E2E-180 細かいメッシュ（小ブロック）のあり・なし', () => {
  test('?microR なし（E2E の既定）: 小ブロックなし。microR 0・近くの列も 箱の段で micro がない', async ({ page }) => {
    const r = await probe(page, '?nosave=1');
    console.log('E2E-180 既定', JSON.stringify(r));
    expectBoxOnly(r, 'E2E のサーバーが VITE_MICRO_DEFAULT=off で起動していない（npm run dev が動いていると それを使うので、止めてから）');
  });

  test('?microR=28: 小ブロックあり。microR 28・近くは micro（ふつうに遊ぶときと同じ）', async ({ page }) => {
    const r = await probe(page, fine('?nosave=1'));
    console.log('E2E-180 microR=28', JSON.stringify(r));
    expect(r.s.microR).toBe(28);
    expect(r.s.micro).toBeGreaterThan(0);
    expect(r.s.microMaxDist, '小ブロックは r+2 以内').toBeLessThanOrEqual(28 + 2);
    expect(r.here.tier, 'プレイヤーのいるセクションの段').toBe('micro');
    expect(r.here.meshes).toBeGreaterThan(0);
    expect(r.nearTiers.micro, `近く（${NEAR} 以内）の micro のセクション`).toBeGreaterThan(0);
    expect(r.nearTiers.box, `近く（${NEAR} 以内）に 箱の段が まじらない`).toBe(0);
    expect(r.s.box).toBeGreaterThan(0);
    expect(r.s.lod).toBeGreaterThan(0);
  });

  test('?microR=0 は 0 として受けつける（環境変数がなくても）。近くも箱の段', async ({ page }) => {
    const r = await probe(page, '?nosave=1&microR=0');
    console.log('E2E-180 microR=0', JSON.stringify(r));
    expectBoxOnly(r, '?microR=0 が 0 として受けつけられていない');
  });

  test('playwright.config.ts の webServer は VITE_MICRO_DEFAULT=off で起動する（影の VITE_SHADOW_DEFAULT=off と同じ所）', async ({}, testInfo) => {
    const ws = testInfo.config.webServer as { command?: string } | { command?: string }[] | null;
    const commands = (Array.isArray(ws) ? ws : ws ? [ws] : []).map((w) => w.command ?? '');
    expect(commands.length, 'webServer の設定').toBeGreaterThan(0);
    expect(commands.some((c) => c.includes('VITE_MICRO_DEFAULT=off')), `webServer.command = ${commands.join(' | ')}`).toBe(true);
    // 影の設定は そのまま
    expect(commands.some((c) => c.includes('VITE_SHADOW_DEFAULT=off'))).toBe(true);
  });
});
