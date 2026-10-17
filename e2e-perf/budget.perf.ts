import { mkdirSync, writeFileSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

/**
 * ワクワクを足す前の 予算の測り（/mnt/project-files/perf-budget/BRIEF.md）。src/ は変えない。
 * 計測は VOX-D と同じ: page.route で 開発サーバーの返す 3 つのファイルに ブラウザ側だけ 計測の書き足しをする
 * （SectionMesher.build・WorldRenderer.build/markDirty・WorldLight.lightColumn/update/computeKey・fillBlockLook）。
 * 実行: npx playwright test --config playwright.perf.config.ts e2e-perf/budget.perf.ts（PART=scenes|cost|stats|all、SCENE=名前）
 * 結果: perf-results/budget-*.json
 */
test.setTimeout(1_800_000);
const PART = process.env.PART ?? 'all';
const ONLY = process.env.SCENE ?? '';
const OUT = 'perf-results';

// ---------------------------------------------------------------- 計測の書き足し（ブラウザ側）
const MESHER_ADD = `
;{
  const ob = SectionMesher.prototype.build;
  SectionMesher.prototype.build = function (cx, sy, cz, tier, opts) {
    const P = window.__prof;
    if (!P || !P.on) return ob.call(this, cx, sy, cz, tier, opts);
    const n0 = P.fblN, m0 = P.fblMs;
    P.cur = P.keys ? P.newSets() : null;
    const t = performance.now();
    const d = ob.call(this, cx, sy, cz, tier, opts);
    const ms = performance.now() - t;
    const e = { cx, sy, cz, tier, ms, full: d.pieces.length > 0 || d.extras.faceCount > 0 || d.water.faceCount > 0, tris: d.triangles, fblN: P.fblN - n0, fblMs: P.fblMs - m0, ctx: P.ctx, f: P.frame };
    if (P.cur) { const c = P.cur; e.sets = [c.base.size, c.k4.size, c.k8.size, c.k16.size, c.out.size]; P.cur = null; }
    P.mesh.push(e);
    return d;
  };
}
`;
const RENDERER_ADD = `
;{
  const P0 = () => window.__prof;
  const ob = WorldRenderer.prototype.build;
  WorldRenderer.prototype.build = function (st, boxOnly) {
    const P = P0();
    if (P && P.on) P.ctx = { built: st.built, want: st.col.tier, dirty: st.dirty, player: st.player, cause: st.__c || 0, boxOnly, evicted: st.evicted };
    const r = ob.call(this, st, boxOnly);
    st.__c = 0;
    return r;
  };
  const om = WorldRenderer.prototype.markDirty;
  WorldRenderer.prototype.markDirty = function (st, player) {
    st.__c = (st.__c || 0) | (player ? 1 : st.__nb ? 4 : 2);
    return om.call(this, st, player);
  };
  WorldRenderer.prototype.markDirtyNb = function (st) { st.__nb = 1; this.markDirty(st, false); st.__nb = 0; };
  const ou = WorldRenderer.prototype.update;
  WorldRenderer.prototype.update = function (v) { const P = P0(); if (P) P.frame++; return ou.call(this, v); };
}
`;
const LIGHT_ADD = `
;{
  const P0 = () => window.__prof;
  const wrap = (name, bucket) => {
    const o = WorldLight.prototype[name];
    WorldLight.prototype[name] = function (...a) {
      const P = P0();
      if (!P || !P.on) return o.apply(this, a);
      const t = performance.now();
      const r = o.apply(this, a);
      P.light[bucket].push(performance.now() - t);
      return r;
    };
  };
  wrap('lightColumn', 'cols');
  wrap('computeKey', 'keys');
  wrap('update', 'upd');
  wrap('flush', 'flush');
}
`;
const LOOKS_PATCH = (src: string): string =>
  src.replace('export function fillBlockLook(', 'function __fbl(') +
  `
export function fillBlockLook(kind, bx, by, bz, exposed, out) {
  const P = window.__prof;
  if (!P || !P.on) { __fbl(kind, bx, by, bz, exposed, out); return; }
  const t = performance.now();
  __fbl(kind, bx, by, bz, exposed, out);
  P.fblMs += performance.now() - t;
  P.fblN++;
  P.kindN[kind] = (P.kindN[kind] || 0) + 1;
  if (P.keys) {
    let h = Math.imul(bx, 0x9e3779b1) ^ Math.imul(by, 0x85ebca6b) ^ Math.imul(bz, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h >>>= 0;
    let o = 2166136261;
    for (let i = 0; i < 729; i++) o = Math.imul(o ^ out[i], 16777619);
    o >>>= 0;
    const base = kind * 64 + exposed;
    for (const c of [P.cum, P.cur]) {
      if (!c) continue;
      c.calls++;
      c.base.add(base); c.k4.add(base * 16 + (h & 3)); c.k8.add(base * 16 + (h & 7)); c.k16.add(base * 16 + (h & 15));
      c.out.add(base + '/' + o);
      c.pos.add(base + '/' + bx + ',' + by + ',' + bz);
    }
  }
}
`;

async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sets = () => ({ calls: 0, base: new Set<number>(), k4: new Set<number>(), k8: new Set<number>(), k16: new Set<number>(), out: new Set<string>(), pos: new Set<string>() });
    (window as any).__prof = {
      on: false, keys: false, frame: 0, ctx: null, cur: null, mesh: [], fblN: 0, fblMs: 0, kindN: {},
      light: { cols: [], keys: [], upd: [], flush: [] },
      newSets: sets,
      cum: sets(),
    };
  });
  const patch = (glob: string, fn: (s: string) => string, must: string) =>
    page.route(glob, async (route) => {
      const resp = await route.fetch();
      const body = await resp.text();
      const out = fn(body);
      if (!out.includes(must)) console.log(`WARN 書き足し先が見つからない: ${glob}`);
      await route.fulfill({ response: resp, body: out });
    });
  await patch('**/src/world/render/voxel/sectionMesher.ts*', (s) => s + MESHER_ADD, 'SectionMesher.prototype');
  await patch('**/src/world/render/WorldRenderer.ts*', (s) => s.replace('this.markDirty(ns, false)', 'this.markDirtyNb(ns)') + RENDERER_ADD, 'markDirtyNb(ns)');
  await patch('**/src/world/light/WorldLight.ts*', (s) => s + LIGHT_ADD, 'WorldLight.prototype');
  await patch('**/src/proto/voxel/looks/index.ts*', LOOKS_PATCH, 'function __fbl');
}

/** ページの中に 道具を入れる（window.__b）。矢印関数だけ（名前つきの関数は使わない） */
const installHelpers = (): void => {
  const h = (window as any).__rikkun;
  const w = h.world;
  const P = () => (window as any).__prof;
  const q = (a: number[], p: number) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  };
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const dist = (a: number[]) => ({ n: a.length, p50: q(a, 0.5), p95: q(a, 0.95), p99: q(a, 0.99), max: a.length ? Math.max(...a) : 0, sum: sum(a), over8: a.filter((x) => x > 8).length, over16: a.filter((x) => x > 16).length });
  const heap = () => ((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const rd = (o: any): any => {
    if (typeof o === 'number') return r2(o);
    if (Array.isArray(o)) return o.map(rd);
    if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rd(v)]));
    return o;
  };
  const cat = (e: any): string => {
    const c = e.ctx;
    if (!c) return 'noctx';
    if (c.built === null) return 'first-' + e.tier;
    if (c.built === 'box' && e.tier === 'micro') return 'upgrade(box->micro)';
    if (c.built === 'micro' && e.tier === 'box') return 'downgrade(micro->box:radius-out)';
    if (c.built === e.tier) {
      const k = c.cause;
      if (k & 1) return 'same-' + e.tier + ':block';
      if (k & 2) return 'same-' + e.tier + ':light-or-exposure';
      if (k & 4) return 'same-' + e.tier + ':neighbour';
      return 'same-' + e.tier + ':other' + (c.evicted ? '(evicted)' : '');
    }
    return 'other';
  };
  /** 計測の「窓」: from 以降の メッシュ・光・fillBlockLook のまとめ */
  const summarize = (from: { mesh: number; light: Record<string, number>; fn: number; fm: number }) => {
    const p = P();
    const E = p.mesh.slice(from.mesh);
    const full = (t: string) => E.filter((e: any) => e.tier === t && e.full);
    const mk = (a: any[]) => dist(a.map((e) => e.ms));
    const cats: Record<string, { n: number; nFull: number; ms: number }> = {};
    for (const e of E) {
      const k = cat(e);
      (cats[k] ||= { n: 0, nFull: 0, ms: 0 });
      cats[k].n++;
      if (e.full) cats[k].nFull++;
      cats[k].ms += e.ms;
    }
    const priorMicro = new Set<string>();
    for (const e of p.mesh.slice(0, from.mesh)) if (e.tier === 'micro' && e.full) priorMicro.add(e.cx + ',' + e.sy + ',' + e.cz);
    const down = new Set<string>();
    for (const e of p.mesh.slice(0, from.mesh)) {
      const k = e.cx + ',' + e.sy + ',' + e.cz;
      if (e.tier === 'box' && e.ctx && e.ctx.built === 'micro') down.add(k);
      if (e.tier === 'micro') down.delete(k);
    }
    const rep: Record<string, { n: number; ms: number }> = { 'after-radius-churn(downgrade->upgrade)': { n: 0, ms: 0 }, 'same-tier-rebuild': { n: 0, ms: 0 }, 'other': { n: 0, ms: 0 } };
    const secs = new Set<string>();
    for (const e of E) {
      const k = e.cx + ',' + e.sy + ',' + e.cz;
      secs.add(k);
      if (e.tier === 'box' && e.ctx && e.ctx.built === 'micro') down.add(k);
      if (e.tier === 'micro' && e.full) {
        if (priorMicro.has(k)) {
          const b = down.has(k) ? 'after-radius-churn(downgrade->upgrade)' : e.ctx && e.ctx.built === 'micro' ? 'same-tier-rebuild' : 'other';
          rep[b].n++; rep[b].ms += e.ms;
        }
        priorMicro.add(k);
        down.delete(k);
      }
    }
    const repN = sum(Object.values(rep).map((v) => v.n)), repMs = sum(Object.values(rep).map((v) => v.ms));
    const lg = (b: string) => dist(p.light[b].slice(from.light[b]));
    const micro = full('micro');
    return {
      builds: E.length,
      microFull: mk(micro),
      boxFull: mk(full('box')),
      emptyOrHidden: E.filter((e: any) => !e.full).length,
      microTrisMedian: q(micro.map((e: any) => e.tris), 0.5),
      microFblShare: sum(micro.map((e: any) => e.fblMs)) / Math.max(1e-9, sum(micro.map((e: any) => e.ms))),
      fbl: { calls: p.fblN - from.fn, ms: p.fblMs - from.fm },
      cats,
      distinctSections: secs.size,
      repeatMicro: { n: repN, ms: repMs, by: rep },
      lightColumn: lg('cols'),
      lightComputeKey: lg('keys'),
      lightUpdate: lg('upd'),
      lightFlush: lg('flush'),
    };
  };
  const mark = () => {
    const p = P();
    return { mesh: p.mesh.length, light: { cols: p.light.cols.length, keys: p.light.keys.length, upd: p.light.upd.length, flush: p.light.flush.length }, fn: p.fblN, fm: p.fblMs };
  };
  const gl: any = (() => {
    for (const c of Array.from(document.querySelectorAll('canvas'))) {
      const g = (c as HTMLCanvasElement).getContext('webgl2') ?? (c as HTMLCanvasElement).getContext('webgl');
      if (g) return g;
    }
    return null;
  })();
  const renderSample = () => {
    const t = performance.now();
    const s = h.renderStats();
    if (gl) { gl.finish(); }
    return { ms: performance.now() - t, calls: s.drawCalls, tris: s.triangles, geos: s.geometries, tex: s.textures };
  };
  const renderSum = (a: any[]) => ({
    n: a.length,
    drawCallsMedian: q(a.map((x) => x.calls), 0.5), drawCallsMax: a.length ? Math.max(...a.map((x) => x.calls)) : 0,
    trisMedian: q(a.map((x) => x.tris), 0.5), trisMax: a.length ? Math.max(...a.map((x) => x.tris)) : 0,
    renderMsMedian: q(a.map((x) => x.ms), 0.5),
    geometries: a.length ? a[a.length - 1].geos : 0, textures: a.length ? a[a.length - 1].tex : 0,
  });
  const mem = () => {
    const m = w.meshStats();
    return { geometryMB: m.geometryBytes / 1048576, geometryLimitMB: m.geometryBytesLimit / 1048576, meshCount: m.meshCount, jsHeapMB: heap(), lightMB: w.lightMemoryBytes() / 1048576, cols: w.loadedChunks().length };
  };
  const setup = () => {
    h.pause();
    h.lock?.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.input.releaseAll();
  };
  /** 立ったまま n コマ */
  const stand = (n: number, sampleEvery: number) => {
    const ms: number[] = [];
    const rs: any[] = [];
    for (let i = 0; i < n; i++) {
      const t = performance.now();
      h.step(1);
      ms.push(performance.now() - t);
      if (i % sampleEvery === 0) rs.push(renderSample());
    }
    return { step: dist(ms), render: renderSum(rs) };
  };
  /** まっすぐ歩く（走る＋ジャンプ。止まったら よける） */
  const walk = (n: number, sampleEvery: number, refill: boolean) => {
    const ms: number[] = [];
    const rs: any[] = [];
    const p0 = h.player.get().position;
    let lastX = p0.x, lastZ = p0.z, dodge = 0, side = 1, dodges = 0, closes = 0;
    for (let i = 0; i < n; i++) {
      h.input.press('run');
      h.input.press('moveForward');
      if (i % 40 < 20) h.input.press('jump'); else h.input.release('jump');
      if (i % 30 === 0) {
        if (h.achievements?.close?.().ok) closes++;
        if (refill) h.combat.setHp(9999);
        const qq = h.player.get().position;
        if (i > 0 && Math.hypot(qq.x - lastX, qq.z - lastZ) < 0.5) { dodge = 45; side = -side; dodges++; }
        lastX = qq.x; lastZ = qq.z;
      }
      h.input.release('moveLeft'); h.input.release('moveRight');
      if (dodge > 0) { dodge--; h.input.press(side > 0 ? 'moveRight' : 'moveLeft'); }
      const t = performance.now();
      h.step(1);
      ms.push(performance.now() - t);
      if (i % sampleEvery === 0) rs.push(renderSample());
    }
    h.input.releaseAll();
    const pe = h.player.get().position;
    const slow = ms.map((v, i) => [i, v]).filter((a) => a[1] > 500).slice(0, 10);
    return { step: dist(ms), render: renderSum(rs), walked: Math.hypot(pe.x - p0.x, pe.z - p0.z), dodges, closes, slow, yokaiAt: h.yokai.list().map((y: any) => [y.kind, y.state, Math.round(y.x), Math.round(y.z)]) };
  };
  /** 地面の起伏が小さい向き（段差 tol 以下・海より上）がいちばん長くつづく向き */
  const pickYawGround = (x: number, z: number, tol: number) => {
    let best = 0, bl = -1;
    for (let yaw = 0; yaw < 360; yaw += 15) {
      const dx = Math.sin((yaw * Math.PI) / 180), dz = -Math.cos((yaw * Math.PI) / 180);
      let len = 0, prev = w.groundHeight(Math.floor(x), Math.floor(z));
      for (; len < 400; len++) {
        const g = w.groundHeight(Math.floor(x + dx * len), Math.floor(z + dz * len));
        if (Math.abs(g - prev) > tol || g <= w.seaY()) break;
        prev = g;
      }
      if (len > bl) { bl = len; best = yaw; }
    }
    return { yaw: best, len: bl };
  };
  /** 洞くつ: 足と頭が 空気で つづく向き */
  const pickYawFree = (x: number, y: number, z: number) => {
    let best = 0, bl = -1;
    for (let yaw = 0; yaw < 360; yaw += 15) {
      const dx = Math.sin((yaw * Math.PI) / 180), dz = -Math.cos((yaw * Math.PI) / 180);
      let len = 0;
      for (; len < 60; len++) {
        const bx = Math.floor(x + dx * len), bz = Math.floor(z + dz * len);
        const a = w.getBlock(bx, Math.floor(y), bz), b = w.getBlock(bx, Math.floor(y) + 1, bz);
        if ((a !== 'air' && a !== 'torch') || (b !== 'air' && b !== 'torch')) break;
      }
      if (len > bl) { bl = len; best = yaw; }
    }
    return { yaw: best, len: bl };
  };
  const countTrees = (cx: number, cz: number, r: number) => {
    let trunks = 0, logs = 0, leaves = 0;
    for (let z = Math.floor(cz - r); z < cz + r; z++) {
      for (let x = Math.floor(cx - r); x < cx + r; x++) {
        if (!w.isLoaded(x, z)) continue;
        const g = w.groundHeight(x, z);
        if (w.getBlock(x, g + 1, z) === 'log') trunks++;
        for (let y = g + 1; y < g + 14; y++) {
          const b = w.getBlock(x, y, z);
          if (b === 'log') logs++; else if (b === 'leaves') leaves++;
        }
      }
    }
    return { trunks, logs, leaves };
  };
  /** 仕事が 15 コマつづけて 0 になるまで 進める */
  const quiet = () => {
    let ok = 0, extra = 0;
    while (ok < 15 && extra < 3000) {
      h.achievements?.close?.();
      h.step(1);
      extra++;
      if (w.meshStats().pending === 0 && w.lightPending() === 0 && w.stream().queued === 0) ok++; else ok = 0;
    }
    return extra;
  };
  const arrive = async (x: number, z: number) => {
    const t = performance.now();
    const m = mark();
    P().on = true;
    w.teleport(x, z);
    let frames = 0;
    for (let i = 0; i < 20; i++) { h.step(1); frames++; }
    const info = await w.settle({ full: true, maxFrames: 6000 });
    const extra = quiet();
    return { extraFrames: extra, ms: performance.now() - t, settleQueued: info.queued, sum: summarize(m) };
  };
  (window as any).__b = { q, dist, rd, mark, summarize, renderSample, renderSum, mem, setup, stand, walk, pickYawGround, pickYawFree, countTrees, arrive, quiet, sum };
};

/** 場面の場所さがし（terrainAt で 森いっぱい・がけいっぱいの所をさがす） */
const scanScenes = (): any => {
  const h = (window as any).__rikkun;
  const w = h.world;
  const sp = w.spawn();
  const cand: any[] = [];
  for (let cz = -256; cz <= 256; cz += 16) {
    for (let cx = -256; cx <= 256; cx += 16) {
      let land = 0, forest = 0, rough = 0, n = 0;
      for (let dz = 0; dz < 16; dz += 2) {
        for (let dx = 0; dx < 16; dx += 2) {
          const a = w.terrainAt(cx + dx, cz + dz), b = w.terrainAt(cx + dx + 2, cz + dz), c = w.terrainAt(cx + dx, cz + dz + 2);
          n++;
          if (!a.sea) land++;
          if (a.biome === 'forest') forest++;
          if (Math.abs(a.h - b.h) >= 2) rough++;
          if (Math.abs(a.h - c.h) >= 2) rough++;
        }
      }
      cand.push({ x: cx + 8, z: cz + 8, land: land / n, forest: forest / n, rough, d: Math.hypot(cx + 8 - sp.x, cz + 8 - sp.z) });
    }
  }
  const landOnly = cand.filter((c) => c.land === 1);
  const forest = [...landOnly].filter((c) => c.forest === 1 && c.rough <= 4).sort((a, b) => a.d - b.d)[0];
  const maxRough = Math.max(...landOnly.map((c) => c.rough));
  const cliff = [...landOnly].filter((c) => c.rough >= maxRough * 0.8).sort((a, b) => a.d - b.d)[0];
  return { forest, cliff, maxRough };
};

// ---------------------------------------------------------------- 場面
interface SceneDef { name: string }
const SCENES: SceneDef[] = [{ name: 'harappa' }, { name: 'mori' }, { name: 'gake' }, { name: 'horaana' }, { name: 'yoru' }];

async function boot(page: Page, shadow: 'on' | 'off' | 'none'): Promise<number> {
  await instrument(page);
  const t0 = Date.now();
  await page.goto(shadow === 'none' ? '/?nosave=1&shadow=0' : '/?nosave=1&shadow=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true, undefined, { timeout: 180_000 });
  const bootMs = Date.now() - t0;
  await page.evaluate(installHelpers);
  await page.evaluate((on) => {
    const h = (window as any).__rikkun;
    (window as any).__b.setup();
    if (on === 'off') h.shadow.set(false);
  }, shadow);
  return bootMs;
}

function save(name: string, data: unknown): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/budget-${name}.json`, JSON.stringify(data, null, 1));
}

if (PART === 'all' || PART === 'scenes') {
  for (const sc of SCENES) {
    if (ONLY && ONLY !== sc.name) continue;
    for (const shadow of ['off', 'on'] as const) {
      test(`場面 ${sc.name} かげ${shadow}`, async ({ page }) => {
        const bootMs = await boot(page, shadow);
        const cdp = process.env.PROF ? await page.context().newCDPSession(page) : null;
        if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 2000 }); await cdp.send('Profiler.start'); }
        const r = await page.evaluate(async ({ scene, scan }) => {
          const h = (window as any).__rikkun;
          const w = h.world;
          const B = (window as any).__b;
          const P = (window as any).__prof;
          const sp = w.spawn();
          const info: any = { scene };
          // 場所
          let x = sp.x, z = sp.z;
          let indoor: any = null;
          if (scene === 'mori' || scene === 'gake') {
            const sc = (0, eval)(`(${scan})`)();
            const c = scene === 'mori' ? sc.forest : sc.cliff;
            info.scan = { ...c, maxRough: sc.maxRough };
            x = c.x; z = c.z;
          }
          if (scene === 'horaana') {
            const m = w.caveMouths()[0];
            info.mouth = m;
            x = m.x; z = m.z;
            indoor = m;
          }
          info.arrive = await B.arrive(x, z);
          if (indoor) {
            // 洞くつのへやの中へ入る（足もとが空気）
            const rm = indoor.room;
            h.player.set({ position: { x: rm.x + 0.5, y: rm.y, z: rm.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
            for (let i = 0; i < 5; i++) h.step(1);
            const st = await w.settle({ full: true, maxFrames: 3000 });
            info.cave = { room: rm, queued: st.queued, extra: B.quiet(), pos: h.player.get().position };
          }
          if (scene === 'yoru') {
            h.time.set(72900); // よるの まんなか
            h.settings.set('yokaiWander', true);
            // たいまつ 10 本（まわり 4〜14 マスの 地面の上）
            const p = h.player.get().position;
            let placed = 0;
            for (let i = 0; placed < 10 && i < 200; i++) {
              const a = (i * 137.5 * Math.PI) / 180, rr = 4 + (i % 11);
              const tx = Math.floor(p.x + Math.cos(a) * rr), tz = Math.floor(p.z + Math.sin(a) * rr);
              const g = w.groundHeight(tx, tz);
              if (w.getBlock(tx, g + 1, tz) === 'air' && w.setBlock(tx, g + 1, tz, 'torch')) placed++;
            }
            info.torchesPlaced = placed;
            const kinds = ['karakasa', 'chochin', 'nurikabe', 'rokurokubi', 'karakasa'];
            for (let i = 0; i < 5; i++) {
              const a = (i * 72 * Math.PI) / 180;
              const yx = p.x + Math.cos(a) * 10, yz = p.z + Math.sin(a) * 10;
              h.yokai.spawn(kinds[i], yx, w.groundHeight(Math.floor(yx), Math.floor(yz)) + 1, yz);
            }
            for (let i = 0; i < 120; i++) h.step(1);
            await w.settle({ full: true, maxFrames: 3000 });
            B.quiet();
            info.yokai = h.yokai.list().length;
            P.mesh.length = 0;
          }
          // 向き
          const pos = h.player.get().position;
          let yaw = 0;
          if (scene === 'horaana') { const f = B.pickYawFree(pos.x, pos.y, pos.z); yaw = f.yaw; info.yawPick = f; }
          else { const f = B.pickYawGround(pos.x, pos.z, scene === 'gake' ? 2 : 1); yaw = f.yaw; info.yawPick = f; }
          h.player.set({ yaw, pitch: 0, velocity: { x: 0, y: 0, z: 0 } });
          h.step(3);
          B.quiet(); // 向きを変えると カメラの位置が かわり 小ブロックの輪が ずれるので、落ちつくまで待つ
          info.trees = B.countTrees(pos.x, pos.z, 48);
          info.treesNear = B.countTrees(pos.x, pos.z, 24);
          // 立ったまま 300 コマ
          P.on = true;
          let m = B.mark();
          info.stand = B.stand(300, 10);
          info.standWork = B.summarize(m);
          info.standEvents = P.mesh.slice(m.mesh, m.mesh + 40).map((e: any) => ({ f: e.f, c: [e.cx, e.sy, e.cz], t: e.tier, ms: e.ms, b: e.ctx && e.ctx.built, w: e.ctx && e.ctx.want, k: e.ctx && e.ctx.cause }));
          info.posAfterStand = h.player.get().position;
          info.memStand = B.mem();
          // まっすぐ 600 コマ
          m = B.mark();
          const refill = scene === 'yoru';
          info.walk = B.walk(600, 20, refill);
          info.walkWork = B.summarize(m);
          info.memWalk = B.mem();
          info.shadowOn = h.shadow.enabled();
          info.sections = w.sectionStats();
          P.on = false;
          return B.rd(info);
        }, { scene: sc.name, scan: scanScenes.toString() });
        if (cdp) {
          const { profile } = await cdp.send('Profiler.stop');
          const self = new Map<string, number>();
          const dt = profile.timeDeltas ?? [];
          const idIdx = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
          profile.samples?.forEach((id: number, i: number) => {
            const n = idIdx.get(id);
            const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`;
            self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
          });
          const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
          save(`prof-${sc.name}-${shadow}`, top);
        }
        save(`scene-${sc.name}-${shadow}`, { bootMs, ...r });
        console.log(`場面 ${sc.name} かげ${shadow}: ${JSON.stringify({ stand: r.stand.step, walk: r.walk.step, render: r.walk.render })}`);
      });
    }
  }
}

// ---------------------------------------------------------------- 新しい物 1 つの値段
if (PART === 'all' || PART === 'cost') {
  for (const which of ['yokai', 'drops', 'torch', 'tree', 'turn']) {
  test(`値段 ${which}`, async ({ page }) => {
    const bootMs = await boot(page, 'on');
    const r = await page.evaluate(async ({ which }) => {
      const h = (window as any).__rikkun;
      const w = h.world;
      const B = (window as any).__b;
      const P = (window as any).__prof;
      const sp = w.spawn();
      const out: any = {};
      const st0 = await w.settle({ full: true, maxFrames: 6000 });
      B.quiet();
      h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -5 });
      h.step(5);
      P.on = true;
      /** かげ オフ・オンの両方で 90 コマ立つ。draw/三角形は 描いて読む */
      const measure = (frames: number) => {
        const res: any = {};
        for (const on of [false, true]) {
          h.shadow.set(on);
          h.step(3);
          B.quiet();
          if (on) h.shadow.resetStats?.();
          const s = B.stand(frames, 15);
          const sf = on ? h.shadow.stats().frame : null;
          res[on ? 'shadowOn' : 'shadowOff'] = { shadowDraws: sf && sf.draws, shadowTris: sf && sf.triangles, stepP50: s.step.p50, stepP95: s.step.p95, stepMax: s.step.max, stepMean: s.step.sum / s.step.n, calls: s.render.drawCallsMedian, tris: s.render.trisMedian, renderMs: s.render.renderMsMedian };
        }
        h.shadow.set(false);
        return res;
      };
      const ground = (xx: number, zz: number) => w.groundHeight(Math.floor(xx), Math.floor(zz)) + 1;
      if (which === 'turn') {
        // その場で 右・左を むく（カメラ位置が かわり 小ブロックの輪が ずれる）: 20 回ふりむく
        out.turn = {};
        for (const [name, a, b] of [['180deg', 0, 180], ['30deg', 0, 30]] as const) {
          h.player.set({ yaw: a, pitch: 0, velocity: { x: 0, y: 0, z: 0 } });
          h.step(3);
          B.quiet();
          const m = B.mark();
          const ms: number[] = [];
          for (let k = 0; k < 20; k++) {
            h.player.set({ yaw: k % 2 === 0 ? b : a, pitch: 0, velocity: { x: 0, y: 0, z: 0 } });
            for (let i = 0; i < 30; i++) { const t = performance.now(); h.step(1); ms.push(performance.now() - t); }
          }
          out.turn[name] = { step: B.dist(ms), work: B.summarize(m) };
        }
      }
      if (which === 'yokai') {
      // ---- 妖怪
      out.yokai = {};
      const tryYokai = (name: string, kinds: string[], n: number) => {
        h.yokai.clear();
        h.step(5);
        for (let i = 0; i < n; i++) {
          const a = (i * 137.5 * Math.PI) / 180, rr = 5 + (i % 9);
          const yx = sp.x + Math.cos(a) * rr, yz = sp.z + Math.sin(a) * rr;
          h.yokai.spawn(kinds[i % kinds.length], yx, ground(yx, yz), yz);
        }
        for (let i = 0; i < 90; i++) { h.step(1); if (i % 30 === 0) h.combat.setHp(9999); }
        const cnt = h.yokai.list().length;
        const m = B.mark();
        const r = measure(90);
        // 同じ状態での 差（いる／いない）: 世界のゆれに うもれないように
        h.shadow.set(false);
        B.quiet();
        const s1 = h.renderStats();
        h.yokai.clear();
        h.step(5);
        B.quiet();
        const s0 = h.renderStats();
        out.yokai[name] = { asked: n, alive: cnt, ...r, work: B.summarize(m).microFull.n, paired: { withTris: s1.triangles, withoutTris: s0.triangles, withCalls: s1.drawCalls, withoutCalls: s0.drawCalls } };
      };
      h.settings.set('yokaiWander', true);
      const all4 = ['karakasa', 'chochin', 'nurikabe', 'rokurokubi'];
      tryYokai('mixed-0', all4, 0);
      tryYokai('mixed-10', all4, 10);
      tryYokai('mixed-30', all4, 30);
      for (const k of all4) tryYokai(k + '-10', [k], 10);
      h.yokai.clear();
      h.step(10);
      }
      if (which === 'drops') {
      // ---- 落ちているアイテム
      out.drops = {};
      const items = ['dirt', 'stone', 'yokai_orb', 'paper', 'crystal', 'cloth', 'clay', 'log'];
      h.settings.set('dropPickupDelay', 1_000_000);
      const dropsList = () => h.combat.bags().length;
      const dropN = (target: number) => {
        const base = dropsList();
        let made = 0;
        for (let i = 0; made < target && i < target * 3; i++) {
          h.inventory.setSlot(0, { item: items[i % items.length], count: 1 });
          h.inventory.select(0);
          h.player.set({ yaw: (i * 29) % 360, pitch: 0, position: { x: sp.x + (i % 7) - 3, y: sp.y, z: sp.z + ((i / 7) | 0) % 7 - 3 }, velocity: { x: 0, y: 0, z: 0 } });
          h.achievements?.close?.();
          h.input.press('drop');
          h.step(1);
          h.input.release('drop');
          h.step(2);
          if (dropsList() >= base + made + 1) made++;
        }
      };
      out.drops.d0 = { have: dropsList(), ...measure(90) };
      const home = () => { h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -5 }); h.step(3); B.quiet(); };
      dropN(50);
      for (let i = 0; i < 60; i++) h.step(1);
      home();
      out.drops.d50 = { have: dropsList(), ...measure(90) };
      dropN(150);
      for (let i = 0; i < 60; i++) h.step(1);
      home();
      out.drops.d200 = { have: dropsList(), ...measure(90) };
      // 拾えるようになる前に 別の場所へ... (そのまま残す。次の測りの前に プレイヤーを spawn に戻す)
      h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -5 });
      h.step(5);
      }
      if (which === 'torch') {
      // ---- たいまつ
      out.torch = {};
      const torchBatch = (name: string, from: number, count: number) => {
        const m = B.mark();
        const meshBefore = P.mesh.length;
        const t0 = performance.now();
        let placed = 0;
        for (let i = from; placed < count && i < from + 600; i++) {
          const a = (i * 137.5 * Math.PI) / 180, rr = 4 + (i % 14);
          const tx = Math.floor(sp.x + Math.cos(a) * rr), tz = Math.floor(sp.z + Math.sin(a) * rr);
          const g = w.groundHeight(tx, tz);
          if (w.getBlock(tx, g + 1, tz) === 'air' && w.setBlock(tx, g + 1, tz, 'torch')) placed++;
        }
        const placeMs = performance.now() - t0;
        // 光と作りなおしが 落ちつくまでの 1 コマごとの時間
        const frames: number[] = [];
        let n = 0;
        while ((w.lightPending() > 0 || w.meshStats().pending > 0 || w.stream().queued > 0) && n < 600) {
          const t = performance.now();
          h.step(1);
          frames.push(performance.now() - t);
          n++;
        }
        const sum = B.summarize(m);
        out.torch[name] = { placed, placeMs, settleFrames: n, frameStep: B.dist(frames), settleTotalMs: frames.reduce((a: number, b: number) => a + b, 0), work: sum };
      };
      out.torch.t0 = { ...measure(60) };
      torchBatch('add1', 0, 1);
      out.torch.t1 = measure(60);
      torchBatch('add9', 1, 9);
      out.torch.t10 = measure(60);
      torchBatch('add30', 10, 30);
      out.torch.t40 = measure(60);
      }
      if (which === 'tree') {
      // ---- 木（はらっぱに 同じ形の木を 10 本）
      out.tree = {};
      const baseM = measure(60);
      out.tree.t0 = baseM;
      const buildTree = (bx: number, bz: number) => {
        const g = w.groundHeight(bx, bz);
        for (let y = 1; y <= 4; y++) w.setBlock(bx, g + y, bz, 'log');
        w.fill(bx - 2, g + 4, bz - 2, bx + 2, g + 5, bz + 2, 'leaves');
        w.fill(bx - 1, g + 6, bz - 1, bx + 1, g + 6, bz + 1, 'leaves');
        w.setBlock(bx, g + 4, bz, 'log');
        w.setBlock(bx, g + 5, bz, 'log');
      };
      const spots: [number, number][] = [];
      for (let i = 0; spots.length < 10; i++) {
        const a = (i * 137.5 * Math.PI) / 180, rr = 10 + (i % 5) * 3;
        const tx = Math.floor(sp.x + Math.cos(a) * rr), tz = Math.floor(sp.z + Math.sin(a) * rr);
        if (spots.every(([x2, z2]) => Math.hypot(x2 - tx, z2 - tz) > 6) && w.getBlock(tx, w.groundHeight(tx, tz) + 1, tz) === 'air') spots.push([tx, tz]);
      }
      // 見える所に ある ことを たしかめる: 向きを木の方へ
      const treeBatch = (name: string, list: [number, number][]) => {
        const m = B.mark();
        for (const [tx, tz] of list) buildTree(tx, tz);
        const frames: number[] = [];
        let n = 0;
        while ((w.lightPending() > 0 || w.meshStats().pending > 0 || w.stream().queued > 0) && n < 600) {
          const t = performance.now();
          h.step(1);
          frames.push(performance.now() - t);
          n++;
        }
        out.tree[name] = { trees: list.length, settleFrames: n, left: [w.lightPending(), w.meshStats().pending, w.stream().queued], settleTotalMs: frames.reduce((a: number, b: number) => a + b, 0), frameStep: B.dist(frames), work: B.summarize(m) };
      };
      // 周りをぐるっと 見まわして 木が 画面に はいる 平均の三角形を測る（4 方向の平均）
      const measureAround = () => {
        const tr: number[] = [], dc: number[] = [];
        for (const yaw of [0, 90, 180, 270]) {
          h.player.set({ yaw, pitch: -5, velocity: { x: 0, y: 0, z: 0 } });
          h.step(2);
          B.quiet();
          const s = h.renderStats();
          tr.push(s.triangles); dc.push(s.drawCalls);
        }
        return { tris: tr, calls: dc, trisSum: tr.reduce((a, b) => a + b, 0), callsSum: dc.reduce((a, b) => a + b, 0) };
      };
      h.shadow.set(false);
      // ---- 建物（国ごとの建物 #195 の見こみ）: 小屋 6x4x6 と おやしろ 10x8x10（かべ・屋根・中は空気・入口 1 つ）
      out.building = {};
      const buildHouse = (x0: number, z0: number, wd: number, ht: number, dp: number, wall: string, roof: string) => {
        const g = w.groundHeight(x0, z0) + 1;
        w.fill(x0, g, z0, x0 + wd - 1, g + ht - 1, z0 + dp - 1, wall);
        w.fill(x0 + 1, g, z0 + 1, x0 + wd - 2, g + ht - 2, z0 + dp - 2, 'air');
        w.fill(x0, g + ht - 1, z0, x0 + wd - 1, g + ht - 1, z0 + dp - 1, roof);
        w.fill(x0 + (wd >> 1), g, z0, x0 + (wd >> 1), g + 1, z0, 'air'); // 入口
        return g;
      };
      const yawTo = (tx: number, tz: number) => ((Math.atan2(tx - sp.x, -(tz - sp.z)) * 180) / Math.PI + 360) % 360;
      const faceAndMeasure = (tx: number, tz: number) => {
        h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, yaw: yawTo(tx, tz), pitch: -5, velocity: { x: 0, y: 0, z: 0 } });
        h.step(3);
        B.quiet();
        const s = h.renderStats();
        return { tris: s.triangles, calls: s.drawCalls };
      };
      const houseBatch = (name: string, x0: number, z0: number, wd: number, ht: number, dp: number, wall: string, roof: string) => {
        x0 = Math.floor(x0); z0 = Math.floor(z0);
        const before = faceAndMeasure(x0 + wd / 2, z0 + dp / 2);
        const m = B.mark();
        buildHouse(x0, z0, wd, ht, dp, wall, roof);
        const frames: number[] = [];
        let n = 0;
        while ((w.lightPending() > 0 || w.meshStats().pending > 0 || w.stream().queued > 0) && n < 600) {
          const t = performance.now();
          h.step(1);
          frames.push(performance.now() - t);
          n++;
        }
        const after = faceAndMeasure(x0 + wd / 2, z0 + dp / 2);
        out.building[name] = { size: [wd, ht, dp], before, after, settleFrames: n, left: [w.lightPending(), w.meshStats().pending, w.stream().queued], settleTotalMs: frames.reduce((a: number, b: number) => a + b, 0), frameStep: B.dist(frames), work: B.summarize(m) };
      };
      houseBatch('hut6x4x6', sp.x + 14, sp.z - 6, 6, 4, 6, 'brick', 'kawara');
      houseBatch('shrine10x8x10', sp.x - 26, sp.z - 6, 10, 8, 10, 'brick', 'kawara');
      out.tree.around0 = measureAround();
      treeBatch('add1', spots.slice(0, 1));
      out.tree.around1 = measureAround();
      treeBatch('add9', spots.slice(1));
      out.tree.around10 = measureAround();
      out.tree.t10 = measure(60);
      }
      P.on = false;
      out.mem = B.mem();
      return B.rd(out);
    }, { which });
    save(`cost-${which}`, { bootMs, ...r });
    console.log(which, JSON.stringify(r).slice(0, 1500));
  });
  }
}

// ---------------------------------------------------------------- 「型を決める」案の見こみ（fillBlockLook のくりかえし）
if (PART === 'all' || PART === 'stats') {
  for (const sc of ['harappa', 'mori', 'gake']) {
    if (ONLY && ONLY !== sc) continue;
    test(`型 ${sc}`, async ({ page }) => {
      const bootMs = await boot(page, 'none');
      const r = await page.evaluate(async ({ scene, scan }) => {
        const h = (window as any).__rikkun;
        const w = h.world;
        const B = (window as any).__b;
        const P = (window as any).__prof;
        const sp = w.spawn();
        let x = sp.x, z = sp.z;
        const info: any = { scene };
        if (scene !== 'harappa') {
          const sc = (0, eval)(`(${scan})`)();
          const c = scene === 'mori' ? sc.forest : sc.cliff;
          x = c.x; z = c.z;
        }
        await B.arrive(x, z); // ここまでは 数えない
        const pos = h.player.get().position;
        const f = B.pickYawGround(pos.x, pos.z, scene === 'gake' ? 2 : 1);
        h.player.set({ yaw: f.yaw, pitch: 0, velocity: { x: 0, y: 0, z: 0 } });
        h.step(3);
        B.quiet();
        P.mesh.length = 0;
        P.fblN = 0; P.fblMs = 0; P.kindN = {};
        P.keys = true;
        P.cum = P.newSets();
        P.on = true;
        const m = B.mark();
        const walk = B.walk(600, 600, false);
        P.on = false;
        P.keys = false;
        const c = P.cum;
        const E = P.mesh.filter((e: any) => e.tier === 'micro' && e.full && e.sets);
        const perSec = (i: number) => E.map((e: any) => 1 - e.sets[i] / Math.max(1, e.fblN)).filter((v: number) => Number.isFinite(v));
        const avg = (a: number[]) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0);
        const kindNames = w.blockTypes().map((b: any) => b.id);
        info.walk = { walked: walk.walked, step: walk.step };
        info.window = {
          microSections: E.length,
          calls: c.calls,
          distinctKindFaces: c.base.size,
          distinctK4: c.k4.size, distinctK8: c.k8.size, distinctK16: c.k16.size,
          distinctOutputs: c.out.size,
          distinctKindFacePos: c.pos.size,
          hitK1: 1 - c.base.size / Math.max(1, c.calls),
          hitK4: 1 - c.k4.size / Math.max(1, c.calls),
          hitK8: 1 - c.k8.size / Math.max(1, c.calls),
          hitK16: 1 - c.k16.size / Math.max(1, c.calls),
          hitExactPos: 1 - c.pos.size / Math.max(1, c.calls),
          hitExactOutput: 1 - c.out.size / Math.max(1, c.calls),
          fblMs: P.fblMs,
          kindCalls: Object.fromEntries(Object.entries(P.kindN).map(([k, v]) => [kindNames[Number(k)] ?? k, v])),
        };
        info.perSection = {
          n: E.length,
          callsMedian: B.q(E.map((e: any) => e.fblN), 0.5),
          callsMax: E.length ? Math.max(...E.map((e: any) => e.fblN)) : 0,
          distinctKindFacesMedian: B.q(E.map((e: any) => e.sets[0]), 0.5),
          distinctOutputMedian: B.q(E.map((e: any) => e.sets[4]), 0.5),
          hitK1: avg(perSec(0)), hitK4: avg(perSec(1)), hitK8: avg(perSec(2)), hitK16: avg(perSec(3)),
          fblMsMedian: B.q(E.map((e: any) => e.fblMs), 0.5),
          meshMsMedian: B.q(E.map((e: any) => e.ms), 0.5),
          fblShare: E.reduce((a: number, e: any) => a + e.fblMs, 0) / Math.max(1e-9, E.reduce((a: number, e: any) => a + e.ms, 0)),
        };
        // 同じ 1 つのセクション（いちばん呼び出しの多い）をくわしく
        const top = [...E].sort((a: any, b: any) => b.fblN - a.fblN)[0];
        info.topSection = top ? { cx: top.cx, sy: top.sy, cz: top.cz, calls: top.fblN, sets: top.sets, ms: top.ms, fblMs: top.fblMs } : null;
        info.work = B.summarize(m);
        return B.rd(info);
      }, { scene: sc, scan: scanScenes.toString() });
      save(`stats-${sc}`, { bootMs, ...r });
      console.log(JSON.stringify(r.window), JSON.stringify(r.perSection));
    });
  }
}
