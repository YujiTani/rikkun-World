import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * VOX-0: 9×9×9 の試しの場面で、4 方式の重さを測る。
 * 注意: クラウドは GPU なし（SwiftShader）。見るのは 三角形・描画回数・メモリ・メッシュを作る時間。
 * renderCpuMs は目安。本当の fps はオーナーの Mac で。
 * スクショ: test-shots/VOX-0/（4 方式 × スタート・上空 と、greedyShape の近くの大きな絵）
 */
type Cfg = { mode: 'current' | 'naive' | 'greedyColor' | 'greedyShape' | 'hybrid'; r?: number; shots: boolean; close: boolean };
const CONFIGS: Cfg[] = [
  { mode: 'current', shots: true, close: false },
  { mode: 'naive', shots: true, close: false },
  { mode: 'greedyColor', shots: true, close: false },
  { mode: 'greedyShape', shots: true, close: true },
  { mode: 'hybrid', r: 16, shots: true, close: true },
  { mode: 'hybrid', r: 24, shots: false, close: false },
  { mode: 'hybrid', r: 28, shots: false, close: false },
];
const SHOT_DIR = 'test-shots/VOX-0';
// スクショは最後にまとめて書く（docs/ に書くたびに vite が画面を作り直して window.__voxelProto が消えることがあった）
const shots = new Map<string, Buffer>();

test('9×9×9 の 4 方式を測る', async ({ page }) => {
  test.setTimeout(1_800_000); // naive は SwiftShader でとても重い
  mkdirSync(SHOT_DIR, { recursive: true });
  mkdirSync('perf-results', { recursive: true });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/voxel-proto.html?mode=current');
  await page.waitForFunction(() => window.__voxelProto?.ready === true, undefined, { timeout: 300_000 });

  const results: unknown[] = [];
  for (const cfg of CONFIGS) {
    const { mode } = cfg;
    await page.evaluate((c) => {
      const h = window.__voxelProto!;
      h.setRunning(false);
      h.setMode(c.mode);
      if (c.r) h.setMicroRadius(c.r);
    }, cfg);

    if (cfg.shots) {
      for (const pose of ['start', 'sky'] as const) {
        await page.evaluate((p) => {
          const h = window.__voxelProto!;
          h.setPose(p);
          h.renderOnce();
        }, pose);
        shots.set(`${mode}${cfg.r ? cfg.r : ''}-${pose}.png`, await page.screenshot({ timeout: 300_000 }));
      }
    }
    if (cfg.close) {
      await page.evaluate(() => {
        const h = window.__voxelProto!;
        h.setPose('close');
        h.renderOnce();
      });
      shots.set(`${mode}${cfg.r ? cfg.r : ''}-close.png`, await page.screenshot({ timeout: 300_000 }));
    }

    const r = (await page.evaluate(() => window.__voxelProto!.measure())) as unknown as Record<string, unknown>;
    // 描き終わるまで待つ時間（readPixels で同期。SwiftShader の CPU 描画なので絶対値ではなく方式の比べに使う）
    r.syncRenderMs = await page.evaluate(() => {
      const h = window.__voxelProto!;
      const gl = (document.querySelector('canvas') as HTMLCanvasElement).getContext('webgl2')!;
      const px = new Uint8Array(4);
      const out: Record<string, number> = {};
      for (const p of ['start', 'sky'] as const) {
        h.setPose(p);
        h.renderOnce();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t: number[] = [];
        for (let i = 0; i < 5; i++) {
          const t0 = performance.now();
          h.renderOnce();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          t.push(performance.now() - t0);
        }
        out[p] = t.sort((a, b) => a - b)[2];
      }
      h.setPose('start');
      return out;
    });
    r.label = mode === 'hybrid' ? `hybrid r=${cfg.r}` : mode;
    console.log(JSON.stringify(r));
    results.push(r);
  }

  const report = {
    scene: 'voxel-proto',
    measuredAt: new Date().toISOString(),
    note: 'クラウド（SwiftShader, GPU なし）。renderCpuMs は目安。三角形・描画回数・バイト数・作る時間を見る',
    results,
  };
  for (const [name, buf] of shots) writeFileSync(`${SHOT_DIR}/${name}`, buf);
  writeFileSync('perf-results/voxel-proto.json', JSON.stringify(report, null, 2));
  if (errors.length > 0) console.log('console errors:', errors.slice(0, 10));
});

/**
 * VOX-1: 見た目（Look）ごとに、hybrid r=16 の三角形・描画回数・頂点データを測り、スクショを撮る。
 * スクショ: test-shots/VOX-1/<id>-start.png / -char-front.png / -char-side.png / -sky.png
 * 結果: perf-results/voxel-looks.json
 */
test('見た目ごとの重さと絵（hybrid r=16）', async ({ page }) => {
  test.setTimeout(900_000);
  const dir = 'test-shots/VOX-1';
  mkdirSync(dir, { recursive: true });
  mkdirSync('perf-results', { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/voxel-proto.html?mode=hybrid&r=16');
  await page.waitForFunction(() => window.__voxelProto?.ready === true, undefined, { timeout: 300_000 });
  const ids = await page.evaluate(() => window.__voxelProto!.looks);
  const out = new Map<string, Buffer>();
  const results: Record<string, unknown>[] = [];
  for (const id of ids) {
    await page.evaluate((i) => {
      const h = window.__voxelProto!;
      h.setRunning(false);
      h.setMode('hybrid');
      h.setMicroRadius(16);
      h.setLook(i);
    }, id);
    await page.waitForFunction(() => window.__voxelProto!.getChar()?.ready === true, undefined, { timeout: 60_000 });
    const shot = async (name: string, f: () => void): Promise<void> => {
      await page.evaluate(f);
      out.set(`${id}-${name}.png`, await page.screenshot({ timeout: 300_000 }));
    };
    await shot('start', () => {
      const h = window.__voxelProto!;
      h.setPose('start');
      h.renderOnce();
    });
    await shot('char-front', () => {
      const h = window.__voxelProto!;
      h.orbitChar(0, 5, 2);
      h.renderOnce();
    });
    await shot('char-side', () => {
      const h = window.__voxelProto!;
      h.orbitChar(90, 5, 2);
      h.renderOnce();
    });
    await shot('sky', () => {
      const h = window.__voxelProto!;
      h.setPose('sky');
      h.renderOnce();
    });
    const rows = await page.evaluate(() => {
      const h = window.__voxelProto!;
      const r: number[] = [];
      for (let a = 0; a < 360; a += 45) {
        h.orbitChar(a, 5, 2);
        r.push(h.getChar()?.row ?? -1);
      }
      h.setPose('start');
      return r;
    });
    const m = (await page.evaluate(() => window.__voxelProto!.measure())) as unknown as Record<string, unknown>;
    m.charRowsAt45DegSteps = rows;
    console.log(JSON.stringify(m));
    results.push(m);
  }
  for (const [name, buf] of out) writeFileSync(`${dir}/${name}`, buf);
  writeFileSync('perf-results/voxel-looks.json', JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2));
  if (errors.length > 0) console.log('console errors:', errors.slice(0, 10));
});

/**
 * VOX-2: 地面の作り方（block / micro）ごとに、B ごつごつ・hybrid r=16 の重さを測り、スクショを撮る。
 * スクショ: test-shots/VOX-2/<terrain>-start.png / -char-side.png / -sky.png / -close.png
 * 結果: perf-results/voxel-terrain.json
 */
test('地面の作り方ごとの重さと絵（B・hybrid r=16）', async ({ page }) => {
  test.setTimeout(900_000);
  const dir = 'test-shots/VOX-2';
  mkdirSync(dir, { recursive: true });
  mkdirSync('perf-results', { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/voxel-proto.html?mode=hybrid&r=16&look=gotsugotsu');
  await page.waitForFunction(() => window.__voxelProto?.ready === true, undefined, { timeout: 300_000 });
  const out = new Map<string, Buffer>();
  const results: Record<string, unknown>[] = [];
  for (const terrain of ['block', 'micro'] as const) {
    await page.evaluate((t) => {
      const h = window.__voxelProto!;
      h.setRunning(false);
      h.setMode('hybrid');
      h.setMicroRadius(16);
      h.setLook('gotsugotsu');
      h.setTerrain(t);
    }, terrain);
    await page.waitForFunction(() => window.__voxelProto!.getChar()?.ready === true, undefined, { timeout: 60_000 });
    const shot = async (name: string, f: () => void): Promise<void> => {
      await page.evaluate(f);
      out.set(`${terrain}-${name}.png`, await page.screenshot({ timeout: 300_000 }));
    };
    await shot('start', () => {
      const h = window.__voxelProto!;
      h.setPose('start');
      h.renderOnce();
    });
    await shot('char-side', () => {
      const h = window.__voxelProto!;
      h.orbitChar(90, 5, 2);
      h.renderOnce();
    });
    await shot('sky', () => {
      const h = window.__voxelProto!;
      h.setPose('sky');
      h.renderOnce();
    });
    // 近くを大きく: 地面すれすれから、坂・1/9 の段差・岩を見る
    await shot('close', () => {
      const h = window.__voxelProto!;
      const s = h.spawn;
      h.setCamera(s.x - 1, s.y + 1.8, s.z + 1, 25, -14);
      h.renderOnce();
    });
    const m = (await page.evaluate(() => window.__voxelProto!.measure())) as unknown as Record<string, unknown>;
    console.log(JSON.stringify(m));
    results.push(m);
  }
  for (const [name, buf] of out) writeFileSync(`${dir}/${name}`, buf);
  writeFileSync('perf-results/voxel-terrain.json', JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2));
  if (errors.length > 0) console.log('console errors:', errors.slice(0, 10));
});

/**
 * VOX-3: 高さの倍率 k = 1 / 2 / 3 で、B ごつごつ・小ブロック地形・hybrid r=16 の重さを測り、スクショを撮る。
 * 場所: スタート・上空・やまのふもとから見上げる。
 * スクショ: test-shots/VOX-3/h<k>-start.png / -sky.png / -lookup.png
 * 結果: perf-results/voxel-height.json
 */
test('高さの倍率ごとの重さと絵（B・hybrid r=16）', async ({ page }) => {
  test.setTimeout(900_000);
  const dir = 'test-shots/VOX-3';
  mkdirSync(dir, { recursive: true });
  mkdirSync('perf-results', { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const out = new Map<string, Buffer>();
  const results: Record<string, unknown>[] = [];
  for (const k of [1, 2, 3]) {
    await page.goto(`/voxel-proto.html?mode=hybrid&r=16&look=gotsugotsu&terrain=micro&height=${k}`);
    await page.waitForFunction(() => window.__voxelProto?.ready === true, undefined, { timeout: 300_000 });
    await page.evaluate(() => window.__voxelProto!.setRunning(false));
    for (const pose of ['start', 'sky', 'lookup'] as const) {
      await page.evaluate((p) => {
        const h = window.__voxelProto!;
        h.setPose(p);
        h.renderOnce();
      }, pose);
      out.set(`h${k}-${pose}.png`, await page.screenshot({ timeout: 300_000 }));
    }
    const cliff = await page.evaluate(() => {
      const h = window.__voxelProto!;
      const ok = h.gotoCliff();
      h.renderOnce();
      return ok;
    });
    if (cliff) out.set(`h${k}-cliff.png`, await page.screenshot({ timeout: 300_000 }));
    const m = (await page.evaluate(() => {
      const h = window.__voxelProto!;
      return { ...h.measure(), worldSize: h.worldSize, peak: h.peak };
    })) as unknown as Record<string, unknown>;
    console.log(JSON.stringify(m));
    results.push(m);
  }
  for (const [name, buf] of out) writeFileSync(`${dir}/${name}`, buf);
  writeFileSync('perf-results/voxel-height.json', JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2));
  if (errors.length > 0) console.log('console errors:', errors.slice(0, 10));
});
