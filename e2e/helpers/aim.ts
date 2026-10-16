import type { Page } from '@playwright/test';

/**
 * ねらいの置き場所・角度を「いまの ねらい方」から計算する道具（CHAR-1 第 5.2 版）。
 * ねらい方が変わるたびに E2E の数（y の列・pitch・目の高さ）を直さなくていいように、
 * 肩の点 S（`camera.get().shoulder`）と ねらいの点（`aim.point()`・`target.get()`）を 窓口から聞いて 決める。
 *
 * ページの中では `window.__aim` として使う（`installAimHelpers(page)` を `open` のあとに 1 回）。
 *   __aim.standForS(sx, sz, yaw, pitch, y)  S が (sx, ?, sz) に来るように キャラを立たせる（向きも置く）
 *   __aim.solve(tx, ty, tz, top)             いまの足もとから (tx, ty + top, tz + 0.5…) のブロックの面を ねらう yaw・pitch を 窓口の S で くりかえして 求めて置く（ステップは進めない）
 *   __aim.sOffset(yaw, pitch)                S の 足もとからの ずれ { dx, dy, dz }（ひらけた所）
 */
export async function installAimHelpers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const RAD = Math.PI / 180;
    const aim = {
      /** ひらけた所での S の足もとからのずれ。窓口の `shoulderOffset`（壁で小さくなる前の 0.70 × cos pitch）と同じ式 */
      sOffset(yaw: number, pitch: number) {
        const s = 0.7 * Math.cos(pitch * RAD);
        return { dx: Math.cos(yaw * RAD) * s, dy: 1.4, dz: Math.sin(yaw * RAD) * s };
      },
      standForS(sx: number, sz: number, yaw: number, pitch: number, y = 9) {
        const o = aim.sOffset(yaw, pitch);
        h.player.set({ position: { x: sx - o.dx, y, z: sz - o.dz }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
      },
      solve(tx: number, ty: number, tz: number, top = 1) {
        const p = h.player.get().position;
        let yaw = 0;
        let pitch = 0;
        for (let i = 0; i < 8; i++) {
          const o = aim.sOffset(yaw, pitch);
          const dx = tx + 0.5 - (p.x + o.dx);
          const dy = ty + top - (p.y + o.dy);
          const dz = tz + 0.5 - (p.z + o.dz);
          yaw = (Math.atan2(dx, -dz) * 180) / Math.PI;
          pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
        }
        h.player.set({ yaw, pitch });
      },
    };
    (window as any).__aim = aim;
  });
}

/**
 * 地面に立つ: 立つ場所のまわりに 石の床を敷き、その上を 空気にして、足もとを床の上に置く。
 *   await standOnGround(page, x, z)                    床の高さは その列の 今の地面（`world.groundHeight`）
 *   await standOnGround(page, x, z, { floorY: 8 })     床の高さを 決める
 * 向きは opts.yaw・opts.pitch（省くと yaw 90・pitch 0）。キャラの足もとが (x, floorY + 1, z)。
 * 返す floorY は 床のブロックの y（足もとは floorY + 1）。
 */
export async function standOnGround(
  page: Page,
  x: number,
  z: number,
  opts: { floorY?: number; half?: number; yaw?: number; pitch?: number } = {},
): Promise<{ floorY: number }> {
  return page.evaluate(
    ({ x, z, o }) => {
      const h = (window as any).__rikkun;
      const floorY: number = o.floorY ?? h.world.groundHeight(Math.floor(x), Math.floor(z));
      const half: number = o.half ?? 12;
      // 世界に はしがあるときだけ はしで切る（無限の世界 VOX-B では size が なくなる）
      const size: { x: number; y: number; z: number } | null = h.world.size?.() ?? null;
      const lo = (v: number) => (size ? Math.max(0, v) : v);
      const x0 = lo(Math.floor(x) - half);
      const z0 = lo(Math.floor(z) - half);
      const x1 = size ? Math.min(size.x - 1, Math.floor(x) + half) : Math.floor(x) + half;
      const z1 = size ? Math.min(size.z - 1, Math.floor(z) + half) : Math.floor(z) + half;
      h.world.fill(x0, floorY, z0, x1, floorY, z1, 'stone');
      h.world.fill(x0, floorY + 1, z0, x1, size ? Math.min(size.y - 1, floorY + 20) : floorY + 20, z1, 'air');
      h.player.set({ position: { x, y: floorY + 1, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: o.yaw ?? 90, pitch: o.pitch ?? 0 });
      h.step(1);
      return { floorY };
    },
    { x, z, o: opts },
  );
}

/**
 * このブロックをねらう: いまの足もと・肩の点 S から、ブロック (x, y, z) の 上の面の まんなか（top = 1。横の面なら 0.5）を
 * ねらう yaw・pitch を 窓口の S から 求めて 置く。ステップは 1 つ進める。
 *   await aimAtBlock(page, 4, 10, 6)           上の面のまんなか
 *   await aimAtBlock(page, 4, 10, 6, 0.5)      ブロックの 高さ半分（横から）
 * ねらいが ほんとうに そのブロックに乗ったかは `target.get()` で 確かめる。
 */
export async function aimAtBlock(page: Page, x: number, y: number, z: number, top = 1): Promise<void> {
  await page.evaluate(
    ({ x, y, z, top }) => {
      (window as any).__aim.solve(x, y, z, top);
      (window as any).__rikkun.step(1);
    },
    { x, y, z, top },
  );
}
