import { expect, test, type Page } from '@playwright/test';
import { openStream } from './helpers/stream';

/**
 * SIGHT-1（issue #446。docs/tickets/SIGHT-1.md）: 実際の ゲームで たしかめる 代表 2 つだけ（数・向きの 全通りは ユニット
 * src/camera/clearance.test.ts・src/yokai/ai/sight.test.ts）。
 *  AC1: 石を fill して 坑道（1 はば 2 高）を ほり、場所 × 向き × 上下 で `camera.get().position` から 固いマスまでの すきま ≥ 0.25。
 *  AC4: 石の 壁 1 枚 ごしに 妖怪を おく → 追いかけに ならない。壁を こわすと 追う。
 * 角度・座標は 決め打ちせず、立っている 地面の 高さを ゲームに 聞く。時間（ms）では 決めない。手元では 回さない〔CI で 見る〕。
 * 赤の 確かめ: 実装の 前は AC1 が 0.25 未満で 落ち、AC4 が 壁ごしでも 追って 落ちる。
 */
test.describe.configure({ timeout: 300_000 });

const NEED = 0.25;

/** 新しい 世界で 立てる 地面を さがし（足もと fy・まわりの 石を ほる 起点 px, pz）、一時停止の まま 返す */
async function prepare(page: Page): Promise<{ px: number; fy: number; pz: number }> {
  await openStream(page, '?nosave=1');
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.lock.simulate(true);
    h.input.releaseAll();
    h.yokai.clear();
    h.time.set(0);
  });
  const s = await page.evaluate(() => (window as any).__rikkun.world.settle({ full: true }));
  expect(s.ready, `settle: ${JSON.stringify(s)}`).toBe(true);
  const p = await page.evaluate(() => (window as any).__rikkun.player.get().position as { x: number; y: number; z: number });
  return { px: Math.floor(p.x), fy: Math.floor(p.y + 0.01), pz: Math.floor(p.z) };
}

test('AC1: 坑道（1 はば 2 高）で 三人称カメラの 点は 固いマスから 0.25 以上（場所 × 向き 12 × 上下 5）', async ({ page }) => {
  const { px, fy, pz } = await prepare(page);
  const res = await page.evaluate(
    ({ px, fy, pz, need }) => {
      const h = (window as any).__rikkun;
      // 石の かたまりに 東へ 12 マスの 坑道（足もと fy・高さ 2）
      h.world.fill(px - 3, fy - 3, pz - 3, px + 16, fy + 6, pz + 3, 'stone');
      h.world.fill(px, fy, pz, px + 12, fy + 1, pz, 'air');
      for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
      const solid = (x: number, y: number, z: number) => {
        const b = h.world.getBlock(x, y, z);
        return b !== 'air' && b !== 'outside';
      };
      const nearest = (c: { x: number; y: number; z: number }) => {
        let best = 1;
        for (let x = Math.floor(c.x) - 1; x <= Math.floor(c.x) + 1; x++)
          for (let y = Math.floor(c.y) - 1; y <= Math.floor(c.y) + 1; y++)
            for (let z = Math.floor(c.z) - 1; z <= Math.floor(c.z) + 1; z++) {
              if (!solid(x, y, z)) continue;
              const dx = Math.max(x - c.x, 0, c.x - (x + 1));
              const dy = Math.max(y - c.y, 0, c.y - (y + 1));
              const dz = Math.max(z - c.z, 0, c.z - (z + 1));
              best = Math.min(best, Math.hypot(dx, dy, dz));
            }
        return best;
      };
      let worst = 1;
      let worstAt = '';
      let count = 0;
      for (const dx of [2, 6, 10]) {
        for (let yi = 0; yi < 12; yi++) {
          for (const pitch of [-60, -25, 0, 25, 60]) {
            h.player.set({ position: { x: px + dx + 0.5, y: fy, z: pz + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: yi * 30, pitch });
            h.step(3);
            const d = nearest(h.camera.get().position);
            count++;
            if (d < worst) {
              worst = d;
              worstAt = `x+${dx} yaw${yi * 30} pitch${pitch}`;
            }
          }
        }
      }
      return { worst, worstAt, count, need };
    },
    { px, fy, pz, need: NEED },
  );
  expect(res.count).toBe(3 * 12 * 5);
  expect(res.worst, `いちばん せまい: ${res.worstAt}`).toBeGreaterThanOrEqual(NEED);
});

test('AC4: 石の 壁 1 枚 ごしには 追いかけに ならない。壁を こわすと 追う', async ({ page }) => {
  const { px, fy, pz } = await prepare(page);
  const states = await page.evaluate(
    ({ px, fy, pz }) => {
      const h = (window as any).__rikkun;
      // 石の かたまりの 中に 広い 部屋（東西 24・南北 7・高さ 4）を ほり、まん中に 壁 1 枚
      h.world.fill(px - 2, fy - 2, pz - 5, px + 26, fy + 6, pz + 5, 'stone');
      h.world.fill(px, fy, pz - 3, px + 24, fy + 3, pz + 3, 'air');
      h.world.fill(px + 8, fy, pz - 3, px + 8, fy + 3, pz + 3, 'stone');
      for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
      h.player.set({ position: { x: px + 3.5, y: fy, z: pz + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      const id = h.yokai.spawn('karakasa', px + 13.5, fy, pz + 0.5);
      const stateNow = () => h.yokai.list().find((y: any) => y.id === id)?.state as string;
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) {
        h.step(1);
        seen.add(stateNow());
      }
      const behindWall = [...seen];
      h.world.fill(px + 8, fy, pz - 3, px + 8, fy + 3, pz + 3, 'air');
      const after = new Set<string>();
      for (let i = 0; i < 90; i++) {
        h.step(1);
        after.add(stateNow());
      }
      return { behindWall, after: [...after] };
    },
    { px, fy, pz },
  );
  const combat = ['chase', 'attack', 'retreat'];
  expect(states.behindWall.filter((s) => combat.includes(s)), `壁ごし: ${states.behindWall.join(',')}`).toEqual([]);
  expect(states.after.some((s) => combat.includes(s)), `壁を こわした あと: ${states.after.join(',')}`).toBe(true);
});
