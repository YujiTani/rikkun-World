import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

/** VOX-D 性能（docs/tickets/VOX-D.md「性能」）。main でも動く（stream が無ければ その項目は null）。 */
test.setTimeout(900_000);
test('VOX-D 性能', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true, undefined, { timeout: 120_000 });
  const bootMs = Date.now() - t0;

  const r = await page.evaluate(async () => {
    const h = (window as any).__rikkun;
    const w = h.world;
    const hasStream = typeof w.stream === 'function';
    const p95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)] ?? 0;
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
    h.pause();
    h.lock?.simulate(true);
    h.settings?.set('yokaiAutoSpawn', false);
    h.settings?.set('yokaiWander', false);
    h.yokai?.clear?.();
    // 輪が全部そろうまで（コマ数と本当の時間）
    let fullMs: number | null = null;
    let fullFrames: number | null = null;
    if (hasStream) {
      const t = performance.now();
      let n = 0;
      while (w.stream().queued > 0 && n < 6000) { h.step(1); n++; }
      fullMs = performance.now() - t;
      fullFrames = n;
    }
    const sp = w.spawn();
    const gy = (x: number, z: number) => w.groundHeight(Math.floor(x), Math.floor(z));
    // スタート
    h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    h.step(5);
    const s0 = h.renderStats();
    const start = { drawCalls: s0.drawCalls, triangles: s0.triangles };
    // 上空（地面から 80 上、斜め下を見る。4 方向の最大）
    let aer = { drawCalls: 0, triangles: 0 };
    h.player.set({ position: { x: sp.x, y: gy(sp.x, sp.z) + 80, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    for (const yaw of [0, 90, 180, 270]) {
      h.player.set({ yaw, pitch: -30, velocity: { x: 0, y: 0, z: 0 } });
      h.step(3);
      const s = h.renderStats();
      aer = { drawCalls: Math.max(aer.drawCalls, s.drawCalls), triangles: Math.max(aer.triangles, s.triangles) };
    }
    // 2 分まっすぐ歩く（走る）。7200 コマ
    // 歩く向き: 20 マス先まで ほぼ平ら（1 マスの段差 1 以下・海より上）がいちばん長くつづく向きをえらぶ
    let bestYaw = 0, bestLen = -1;
    for (let yaw = 0; yaw < 360; yaw += 15) {
      const dx = Math.sin((yaw * Math.PI) / 180), dz = -Math.cos((yaw * Math.PI) / 180);
      let len = 0, prev = gy(sp.x, sp.z);
      for (; len < 800; len++) {
        const g = gy(sp.x + dx * len, sp.z + dz * len);
        if (Math.abs(g - prev) > 1 || g <= (w.seaY?.() ?? 0)) break;
        prev = g;
      }
      if (len > bestLen) { bestLen = len; bestYaw = yaw; }
    }
    h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: bestYaw, pitch: 0 });
    h.step(5);
    h.input.releaseAll();
    const p0 = h.player.get().position;
    const z0 = p0.z;
    let lastX = p0.x, lastZ = p0.z, dodge = 0, dodgeSide = 1, dodges = 0;
    let r_dodges = 0, closes = 0;
    const stepMs: number[] = [];
    const workMs: number[] = [];
    let maxCols = 0, maxFrameMs = 0;
    let lastMax = 0;
    for (let i = 0; i < 7200; i++) {
      h.input.press('run');
      h.input.press('moveForward');
      if (i % 40 < 20) h.input.press('jump'); else h.input.release('jump');
      // 木や段にぶつかって止まったら 横によけて（左右かわりばんこ）また まっすぐ
      if (i % 30 === 0) {
        // 「おめでとう！」の 窓が出たら とじる（出ている間は 歩けない）
        if (h.achievements?.close?.().ok) closes++;
        const q = h.player.get().position;
        if (i > 0 && Math.hypot(q.x - lastX, q.z - lastZ) < 0.5) { dodge = 45; dodgeSide = -dodgeSide; dodges++; }
        lastX = q.x; lastZ = q.z;
      }
      h.input.release('moveLeft'); h.input.release('moveRight');
      if (dodge > 0) { dodge--; h.input.press(dodgeSide > 0 ? 'moveRight' : 'moveLeft'); }
      const t = performance.now();
      h.step(1);
      stepMs.push(performance.now() - t);
      if (hasStream) {
        const f = w.stream().frameMs;
        workMs.push(f.last);
        maxFrameMs = Math.max(maxFrameMs, f.last);
        lastMax = f.max;
      }
      if (i % 30 === 0) maxCols = Math.max(maxCols, w.loadedChunks().length);
    }
    h.input.releaseAll();
    const pe = h.player.get().position;
    const walked = Math.hypot(pe.x - p0.x, pe.z - p0.z);
    r_dodges = dodges;
    const mesh = w.meshStats();
    const afterWalk = h.renderStats();
    return {
      dodges: r_dodges, closes, hasStream, bestYaw, bestLen, fullMs, fullFrames, start, aerial: aer, walked,
      walk: { over8: stepMs.filter((x) => x > 8).length, over16: stepMs.filter((x) => x > 16).length, p90: [...stepMs].sort((x, y) => x - y)[Math.floor(stepMs.length * 0.9)], p99: [...stepMs].sort((x, y) => x - y)[Math.floor(stepMs.length * 0.99)], frames: stepMs.length, stepMedian: med(stepMs), stepP95: p95(stepMs), stepMax: Math.max(...stepMs),
        streamFrameMedian: workMs.length ? med(workMs) : null, streamFrameP95: workMs.length ? p95(workMs) : null,
        streamFrameMax: hasStream ? maxFrameMs : null, streamMaxField: hasStream ? lastMax : null, maxCols,
        drawCalls: afterWalk.drawCalls, triangles: afterWalk.triangles },
      mem: { lightBytes: w.lightMemoryBytes?.() ?? null, geometryBytes: mesh.geometryBytes, geometryLimit: mesh.geometryBytesLimit, meshCount: mesh.meshCount, cols: w.loadedChunks().length },
      genMs: w.genTimeMs?.() ?? null,
      jsHeap: (performance as any).memory?.usedJSHeapSize ?? null,
    };
  });
  const report = { measuredAt: new Date().toISOString(), bootMs, ...r };
  mkdirSync('perf-results', { recursive: true });
  writeFileSync(`perf-results/voxD-${process.env.PERF_TAG ?? 'branch'}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
