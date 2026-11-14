import { chromium } from '@playwright/test';
const exe = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(extra) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:5174/?nosave=1${extra}`);
  await page.waitForFunction(() => window.__rikkun?.ready === true, null, { timeout: 180000 });
  await page.evaluate(() => {
    const h = window.__rikkun;
    h.pause(); h.achievements.mute(true); h.lock.simulate(true); h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false); h.settings.set('yokaiWander', false); h.settings.set('animalAutoSpawn', false);
    h.yokai.clear(); h.animals.clear(); h.time.set(8000);
  });
  return page;
}
const measure = async (page, cam) => {
  await page.evaluate(([x, z]) => window.__rikkun.world.teleport(x, z), [cam.p.x, cam.p.z]);
  await page.evaluate(() => window.__rikkun.world.settle({ full: true }));
  await page.evaluate(() => { const h = window.__rikkun; for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 6000; n++) h.step(1); h.step(3); });
  await page.evaluate((c) => { const h = window.__rikkun; h.player.set({ position: { x: c.p.x, y: c.p.y, z: c.p.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }); h.step(2); h.camera.hideDoll(true); h.camera.fixed({ x: c.p.x, y: c.p.y + 1.6, z: c.p.z, tx: c.t.x, ty: c.t.y, tz: c.t.z }); h.step(4); }, cam);
  await page.waitForTimeout(1500);
  return page.evaluate(() => window.__rikkun.renderStats());
};
const a = await open('');
const info = await a.evaluate(() => window.__rikkun.town.info());
const spawn = await a.evaluate(() => { const g = window.__rikkun.player.get(); return g.position ?? g; });
const G = info.groundY;
const cams = {
  start: { p: { x: spawn.x, y: spawn.y, z: spawn.z }, t: { x: info.gate.pos.x, y: G + 8, z: info.gate.pos.z } },
  plaza: { p: { x: info.plaza.x, y: G + 1, z: info.plaza.z }, t: { x: info.gate.pos.x, y: G + 4, z: info.gate.pos.z } },
  center: { p: { x: info.plaza.x, y: G + 1, z: info.plaza.z }, t: { x: info.center.x, y: G + 3, z: info.center.z } },
};
const res = { on: {}, off: {} };
for (const [k, c] of Object.entries(cams)) res.on[k] = await measure(a, c);
await a.context().close();
const b = await open('&town=off');
for (const [k, c] of Object.entries(cams)) res.off[k] = await measure(b, c);
for (const k of Object.keys(cams)) console.log(k, 'on', res.on[k].drawCalls, res.on[k].triangles, 'off', res.off[k].drawCalls, res.off[k].triangles, 'diff', res.on[k].drawCalls - res.off[k].drawCalls, res.on[k].triangles - res.off[k].triangles);
await browser.close();
