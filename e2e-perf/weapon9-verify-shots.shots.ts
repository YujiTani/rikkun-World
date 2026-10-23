import { test } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { legendWorld, spawnAt } from '../e2e/helpers/legend';
import { holdNiji } from '../e2e/helpers/niji';

/**
 * WEAPON-9 虹の 画面確認（オーナーに 見せる スクショ）。docs/art/WEAPON-9/verify/ に 保存する。判定はしない（記録 = log.txt）。
 * 重い（600 秒）ので CI では 回さない: npm run test:e2e:niji（playwright.niji.config.ts）。
 */
test.describe.configure({ mode: 'serial', timeout: 600_000 });
const OUT = 'docs/art/WEAPON-9/verify';
mkdirSync(OUT, { recursive: true });
const log = (s: string) => appendFileSync(`${OUT}/log.txt`, s + '\n');
type P = import('@playwright/test').Page;
const run = (page: P, n: number) => page.evaluate((n) => (window.__rikkun as any).step(n), n);

test.beforeAll(() => writeFileSync(`${OUT}/log.txt`, ''));

async function ready(page: P) {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.releaseAll();
    h.camera.yawOffset(0);
    h.yokai.clear();
    h.step(200);
  });
  await holdNiji(page, 10);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.player.set({ yaw: 0, pitch: 0 });
    h.step(5);
  });
}

/** 妖怪を 体から d マス 前に 置き、ため 150 → シャイニング。F ごとに 距離・HP・出来事を 記録し、shotAt の F で 撮る */
async function dome(page: P, name: string, kind: string, d: number, shotAt: number[], camDeg = 70) {
  await ready(page);
  await page.evaluate((deg) => (window as any).__rikkun.camera.yawOffset(deg), camDeg);
  const p = await page.evaluate(() => (window as any).__rikkun.player.get().position as { x: number; y: number; z: number });
  const id = await spawnAt(page, kind, p.x, p.y, p.z - d, 999);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.combat.sounds();
    h.input.press('primary');
    h.step(150);
  });
  await page.screenshot({ path: `${OUT}/${name}-charge150.png` });
  await page.evaluate(() => (window as any).__rikkun.input.release('primary'));
  let hitF = -1, maxUp = -9, maxDist = 0, y0 = 0, maxY = 0;
  for (let F = 1; F <= 120; F++) {
    const r = await page.evaluate((id) => {
      const h = (window as any).__rikkun;
      h.step(1);
      const st = h.legend.state();
      const y = h.yokai.list().find((q: any) => q.id === id);
      const pp = h.player.get().position;
      const ev = h.legend.events().slice(-3).map((e: any) => e.type);
      return {
        dome: st.dome?.radius ?? null,
        move: st.move,
        dist: y ? Math.hypot(y.position.x - pp.x, y.position.z - pp.z) : null,
        up: y ? y.position.y - pp.y : null,
        absY: y ? y.position.y : null,
        pY: pp.y,
        hp: y?.hp ?? null,
        grains: { fx: h.legend.nijiFx?.(), g: h.legend.grains?.(), mx: Math.max(0, ...h.yokai.list().map((q: any) => q.position.y)) },
        ev,
        sd: h.settings.get('shiningCamDistance'),
      };
    }, id);
    maxUp = Math.max(maxUp, r.up ?? -9); if (F === 1) y0 = r.absY ?? 0; maxY = Math.max(maxY, r.absY ?? 0); maxDist = Math.max(maxDist, r.dist ?? 0);
    if (F % 5 === 1 || (r.ev.includes('domeHit') && hitF < 0)) log(`${name} F${F} r=${r.dome?.toFixed?.(2)} dist=${r.dist?.toFixed(2)} up=${r.up?.toFixed(2)} hp=${r.hp} ${JSON.stringify(r.grains)} ${r.ev.join(',')}`);
    if (r.ev.includes('domeHit') && hitF < 0) hitF = F;
    const want = shotAt.includes(F) || (hitF >= 0 && [0, 3, 8, 14].includes(F - hitF));
    if (want) await page.screenshot({ path: `${OUT}/${name}-F${F}.png` });
  }
  log(`${name} 最初の domeHit = F${hitF} maxUp(体からの 高さ)=${maxUp.toFixed(2)} maxDist=${maxDist.toFixed(2)} 妖怪の 高さ 最初=${y0.toFixed(2)} 最高=${maxY.toFixed(2)}`);
}

test('ドーム ①: からかさを 体から 9.5 マス前 → すわれて はじかれる', async ({ page }) => {
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  await dome(page, 'karakasa', 'karakasa', 9.5, [3, 24, 40, 50, 60, 70]);
});

test('ドーム ②: ぬりかべ', async ({ page }) => {
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  await dome(page, 'nurikabe', 'nurikabe', 9.5, [24, 50, 70]);
});

test('斬撃: ふつうの 3 段攻撃 × カメラ（うしろ・横）', async ({ page }) => {
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [label, deg] of [['back', 0], ['side45', 45], ['side90', 90], ['side', 110], ['side135', 135], ['front', 180]] as const) {
    await ready(page);
    const p = await page.evaluate(() => (window as any).__rikkun.player.get().position as { x: number; y: number; z: number });
    await spawnAt(page, 'karakasa', p.x, p.y, p.z - 3, 999);
    await page.evaluate((deg) => (window as any).__rikkun.camera.yawOffset(deg), deg);
    await run(page, 3);
    for (let k = 1; k <= 3; k++) {
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        const seen: string[] = [];
        let first = -1;
        for (let i = 0; i < 40; i++) {
          h.step(1);
          const s = h.legend.slashes?.() ?? [];
          if (s.length && first < 0) { first = i; seen.push(JSON.stringify(s)); }
        }
        return { first, seen };
      });
      log(`slash-${label} 段${k} 出た step=${r.first} ${r.seen.join('')}`);
    }
    // 撮る用: 3 段 つづけて ふり、各 段で 出た 直後を 撮る
    await ready(page);
    await page.evaluate((deg) => (window as any).__rikkun.camera.yawOffset(deg), deg);
    await run(page, 3);
    for (let k = 1; k <= 3; k++) {
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
      });
      let got = false;
      for (let i = 0; i < 30 && !got; i++) {
        got = await page.evaluate(() => { const h = (window as any).__rikkun; h.step(1); return (h.legend.slashes?.() ?? []).length > 0; });
      }
      await run(page, 2);
      const sl = await page.evaluate(() => JSON.stringify((window as any).__rikkun.legend.slashes?.() ?? []));
      log(`slash-${label}-撮影 段${k} 出た=${got} ${sl}`);
      await page.screenshot({ path: `${OUT}/slash-${label}-${k}.png` });
      await run(page, 12);
    }
  }
});

test('手持ち: 女の子の 虹の 太刀（斜めうしろから 近く。斬撃が 重ならない 時）', async ({ page }) => {
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  await page.evaluate(() => (window as any).__rikkun.camera.yawOffset(60));
  await run(page, 120);
  const clip = { x: 440, y: 230, width: 400, height: 300 };
  await page.screenshot({ path: `${OUT}/hand-idle.png`, clip });
  for (let swing = 0; swing < 2; swing++) {
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
    });
    for (let i = 0; i < 12; i++) {
      await run(page, 2);
      const sl = await page.evaluate(() => (window as any).__rikkun.legend.slashes?.().length ?? 0);
      log(`hand swing${swing} +${(i + 1) * 2} slash=${sl}`);
      await page.screenshot({ path: `${OUT}/hand-s${swing}-${String(i).padStart(2, '0')}.png`, clip });
    }
    await run(page, 80);
  }
});

test('ダメージ 1/3 と 火の玉', async ({ page }) => {
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  const hp = (page: P) => page.evaluate(() => JSON.stringify((window as any).__rikkun.combat.get()));
  await ready(page);
  await page.evaluate(() => { (window as any).__rikkun.combat.setHp(20); (window as any).__rikkun.step(2); });
  const before = await hp(page);
  await page.evaluate(() => { (window as any).__rikkun.combat.damage(6); (window as any).__rikkun.step(2); });
  const afterNormal = await hp(page);
  log(`通常 6 ダメージ: ${before} -> ${afterNormal}`);
  // シャイニング中
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.combat.setHp(20);
    h.step(2);
    h.input.press('primary');
    h.step(150);
    h.input.release('primary');
    h.step(60);
  });
  const b2 = await hp(page);
  const st = await page.evaluate(() => JSON.stringify({ move: (window as any).__rikkun.legend.state().move, F: (window as any).__rikkun.legend.state().moveF }));
  await page.evaluate(() => { (window as any).__rikkun.combat.damage(6); (window as any).__rikkun.step(2); });
  const a2 = await hp(page);
  log(`シャイニング中 6 ダメージ ${st}: ${b2} -> ${a2}`);
  for (const dmg of [1, 2, 4, 5]) {
    await page.evaluate(() => { (window as any).__rikkun.combat.setHp(20); (window as any).__rikkun.step(70); });
    const x = await hp(page);
    await page.evaluate((d) => { (window as any).__rikkun.combat.damage(d); (window as any).__rikkun.step(2); }, dmg);
    log(`  d=${dmg}: ${x} -> ${await hp(page)}`);
  }
  await page.evaluate(() => { const h = (window as any).__rikkun; h.input.releaseAll(); h.step(300); });

  // 妖怪の 本物の 攻撃（からかさ 体当たり）: 近くに 置いて attackNow
  for (const phase of ['通常', 'シャイニング中'] as const) {
    await ready(page);
    await page.evaluate(() => { (window as any).__rikkun.combat.setHp(20); });
    if (phase === 'シャイニング中') {
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.input.press('primary');
        h.step(150);
        h.input.release('primary');
        h.step(60);
      });
    }
    const p = await page.evaluate(() => (window as any).__rikkun.player.get().position as { x: number; y: number; z: number });
    const id = await spawnAt(page, 'chochin', p.x, p.y + (phase === 'シャイニング中' ? 0 : 0), p.z - 9, 999);
    const r = await page.evaluate((id) => {
      const h = (window as any).__rikkun;
      const a = h.yokai.attackNow(id);
      const seq: string[] = [];
      let maxFb = 0;
      for (let i = 0; i < 150; i++) {
        h.step(1);
        const n = h.yokai.fireballs();
        maxFb = Math.max(maxFb, n);
        if (i % 10 === 0) seq.push(`${i}:${n}`);
      }
      return { a: JSON.stringify(a), maxFb, seq: seq.join(' '), combat: JSON.stringify(h.combat.get()), ev: JSON.stringify(h.combat.events()).slice(0, 300) };
    }, id);
    log(`火の玉 ${phase}: attackNow=${r.a} 最大 ${r.maxFb} 個 ${r.seq} / ${r.combat} / ${r.ev}`);
    await page.evaluate(() => { const h = (window as any).__rikkun; h.input.releaseAll(); h.step(300); });
  }
});

test('丸い ドーム（撮り直し）', async ({ page }) => {
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  await page.evaluate(() => (window as any).__rikkun.camera.yawOffset(80));
  await page.evaluate(() => { const h = (window as any).__rikkun; h.input.press('primary'); h.step(150); h.input.release('primary'); h.step(70); });
  await page.screenshot({ path: `${OUT}/dome-round.png` });
});

test('はじき 上 6（撮り直し）', async ({ page }) => {
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  await page.evaluate(() => (window as any).__rikkun.camera.yawOffset(80));
  const p = await page.evaluate(() => (window as any).__rikkun.player.get().position as { x: number; y: number; z: number });
  const id = await spawnAt(page, 'karakasa', p.x, p.y, p.z - 9.5, 999);
  // ものさし: はじかれた さきに 高さ 6 マスの 石の はしら（先の 1 マスは 木）。カメラの 側へ 2 マス よせる
  await page.evaluate((p) => {
    const h = (window as any).__rikkun;
    const c = h.camera.get().position;
    const sx = c.x - p.x >= 0 ? 1 : -1;
    const bx = Math.floor(p.x) + sx * 2, bz = Math.floor(p.z - 16.5), y = Math.floor(p.y);
    h.world.fill(bx, y, bz, bx, y + 5, bz, 'stone');
    h.world.setBlock(bx, y + 5, bz, 'log');
    h.step(2);
  }, p);
  await page.evaluate(() => { const h = (window as any).__rikkun; h.input.press('primary'); h.step(150); h.input.release('primary'); });
  await page.evaluate(() => { (window as any).__hits0 = (window as any).__rikkun.legend.events().filter((e: any) => e.type === 'domeHit').length; });
  let hitF = -1, y0 = p.y, maxY = 0;
  const rows: string[] = [];
  for (let F = 1; F <= 130; F++) {
    const r = await page.evaluate((id) => {
      const h = (window as any).__rikkun;
      h.step(1);
      const y = h.yokai.list().find((q: any) => q.id === id);
      return { y: y?.position.y ?? 0, d: y ? Math.hypot(y.position.x - h.player.get().position.x, y.position.z - h.player.get().position.z) : 0, hit: h.legend.events().filter((e: any) => e.type === 'domeHit').length > (window as any).__hits0, py: h.player.get().position.y };
    }, id);
    if (r.hit && hitF < 0) hitF = F;
    maxY = Math.max(maxY, r.y);
    if (hitF >= 0) rows.push(`F${F}(+${F - hitF}) yokaiY=${(r.y - y0).toFixed(2)} dist=${r.d.toFixed(1)} playerY=${(r.py - y0).toFixed(2)}`);
    if (hitF >= 0 && [0, 8, 16, 24, 32, 41].includes(F - hitF)) await page.screenshot({ path: `${OUT}/knock-raw-${String(F - hitF).padStart(2, '0')}.png` });
  }
  log(`knock 最初の 当たり F${hitF} 地面からの 最高 ${(maxY - y0).toFixed(2)}\n` + rows.join('\n'));
});
