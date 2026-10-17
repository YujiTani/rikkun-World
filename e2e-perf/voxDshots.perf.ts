import { test } from '@playwright/test';
test.setTimeout(300_000);
const OUT = '/mnt/project-files/voxd/final';
test('VOX-D スクショ', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?nosave=1&streamWork=1');
  await page.waitForFunction(() => (window.__rikkun as any)?.world?.stream !== undefined, undefined, { timeout: 30_000 });
  await page.evaluate(() => (window.__rikkun as any).pause());
  // じゅんびちゅう: progress が 0.4 ぐらいになるまで
  const info = await page.evaluate(() => {
    const h = (window.__rikkun as any); let n = 0;
    while (h.world.stream().progress < 0.4 && !h.world.stream().ready && n < 3000) { h.step(1); n++; }
    return { n, p: h.world.stream().progress, ready: h.world.stream().ready };
  });
  console.log('boot', JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/1-junbichuu-kidou.png` });
  await page.evaluate(async () => { (window.__rikkun as any).achievements.mute(true); await (window.__rikkun as any).world.settle({ full: true }); });
  const hi = await page.evaluate(() => {
    const w = (window.__rikkun as any).world; const sp = w.spawn();
    let best = { x: sp.x, z: sp.z, h: -1, d: 0 };
    for (let x = sp.x - 200; x <= sp.x + 200; x += 4) for (let z = sp.z - 200; z <= sp.z + 200; z += 4) {
      const hh = w.groundHeight(Math.floor(x), Math.floor(z)); const d = Math.hypot(x - sp.x, z - sp.z);
      if (hh > best.h + 8 || (hh >= best.h - 8 && hh > best.h && d < 160)) best = { x: Math.floor(x), z: Math.floor(z), h: hh, d };
    }
    (window as any).__pk = best; return best;
  });
  console.log('highest', JSON.stringify(hi));
  const pk = await page.evaluate(() => {
    const h = (window.__rikkun as any); const w = h.world; h.lock.simulate(true);
    const sp = w.spawn(); const pk = (window as any).__pk;
    const dx = pk.x - sp.x, dz = pk.z - sp.z;
    const yaw = (Math.atan2(dx, -dz) * 180) / Math.PI;
    h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 5 });
    h.step(3);
    return { sp, pk, dist: Math.hypot(dx, dz), yaw };
  });
  console.log('peak', JSON.stringify(pk));
  // 山へ歩く: 山の手前 1/2 まで（走る）。窓が出たら閉じる
  await page.evaluate(() => {
    const h = (window.__rikkun as any); const w = h.world;
    const sp = w.spawn(); const pk = (window as any).__pk;
    const total = Math.hypot(pk.x - sp.x, pk.z - sp.z);
    h.input.releaseAll();
    for (let i = 0; i < 3000; i++) {
      h.achievements?.close?.();
      h.input.press('run'); h.input.press('moveForward'); if (i % 40 < 20) h.input.press('jump'); else h.input.release('jump');
      h.step(1);
      const p = h.player.get().position;
      if (Math.hypot(pk.x - p.x, pk.z - p.z) < total * 0.15) break;
    }
    h.input.releaseAll();
    h.player.set({ velocity: { x: 0, y: 0, z: 0 } });
    h.step(30);
  });
  await page.evaluate(async () => { await (window.__rikkun as any).world.settle({ full: true }); (window.__rikkun as any).step(5); });
  await page.screenshot({ path: `${OUT}/2-yama-e-aruku.png` });
  // 山の上から 遠くを見る
  const top = await page.evaluate(async () => {
    const h = (window.__rikkun as any); const w = h.world; const pk = (window as any).__pk;
    w.teleport(pk.x, pk.z); await w.settle({ full: true });
    h.player.set({ position: { x: pk.x + 0.5, y: w.groundHeight(pk.x, pk.z) + 28, z: pk.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 200, pitch: -8 });
    h.step(1);
    await w.settle({ full: true });
    h.player.set({ position: { x: pk.x + 0.5, y: w.groundHeight(pk.x, pk.z) + 28, z: pk.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 } });
    h.step(2);
    return { y: h.player.get().position.y, draw: h.renderStats().drawCalls, tri: h.renderStats().triangles };
  });
  console.log('top', JSON.stringify(top));
  await page.screenshot({ path: `${OUT}/3-tooku-wo-miru.png` });
});
