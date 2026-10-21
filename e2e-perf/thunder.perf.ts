import { mkdirSync, writeFileSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { aimGroundAhead, chargeUntilReady, legendWorld, resetStage } from '../e2e/helpers/legend';

/**
 * ART-PIPE-1（雷神剣の雷 B）の性能。main の今の雷と、このブランチの雷 B を 同じ場面で 比べる（PERF_LABEL=main|branch）。
 * 1 コマ = step(1) ＋ 描画（renderStats が 流す）＋ 1 点の readPixels（SwiftShader の 描画を その場で 終わらせる）。
 * 比べるのは 時間（中央値・p95）・描画回数・三角形・シェーダー（WebGL プログラム）の 数と 名前・GPU メモリの 見つもり。fps ではない。
 * シェーダーとメモリは WebGL の呼び出しを init script で 数える（src に 手を入れない。main にも 同じ 物差しが 使える）。
 * PERF_DSF=2 で Retina（pixelRatio 2）。PERF_SCENE=roof で 屋根の 下（S あり・空が 見えない）、sky で 空へ（S なし）。
 */
const LABEL = process.env.PERF_LABEL ?? 'branch';
const DSF = Number(process.env.PERF_DSF ?? 1);
const SCENE = process.env.PERF_SCENE ?? 'flat';
test.describe.configure({ timeout: 600_000 });

const hook = () => {
  const G: any = ((window as any).__gl = { tag: 'boot', links: [], allocs: [], deletes: [] as any[] });
  const src = new WeakMap<object, string>();
  const att = new WeakMap<object, object[]>();
  const BYTES: Record<number, number> = { 0x8058: 4, 0x8c43: 4, 0x81a6: 4, 0x8cac: 4, 0x88f0: 4, 0x1908: 4, 0x1902: 4, 0x881a: 8, 0x81a5: 2, 0x8d48: 1, 0x8c3a: 4, 0x8814: 16, 0x822e: 4, 0x8229: 1 };
  for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype] as any[]) {
    const wrap = (name: string, fn: (orig: any, self: any, args: any[]) => any) => {
      const o = P[name];
      if (!o) return;
      P[name] = function (this: any, ...a: any[]) {
        return fn(o, this, a);
      };
    };
    wrap('shaderSource', (o, s, a) => (src.set(a[0], a[1]), o.apply(s, a)));
    wrap('attachShader', (o, s, a) => ((att.get(a[0]) ?? att.set(a[0], []).get(a[0])!).push(a[1]), o.apply(s, a)));
    wrap('linkProgram', (o, s, a) => {
      const t = performance.now();
      const r = o.apply(s, a);
      const sh = att.get(a[0]) ?? [];
      const frag = sh.map((x) => src.get(x) ?? '').find((x) => x.includes('gl_FragColor') || x.includes('pc_fragColor')) ?? '';
      const name = /#define SHADER_NAME (\S+)/.exec(frag)?.[1] ?? '?';
      const defs = (frag.match(/^#define \w+/gm) ?? []).map((x) => x.slice(8)).filter((x) => !/^(SHADER_NAME|HIGH_PRECISION|GAMMA_FACTOR|PHYSICALLY_CORRECT_LIGHTS|NUM_)/.test(x));
      const traits = ['uDepth', 'tDepth', 'uSheet', 'uRect', 'aCell', 'uAmount', 'map', 'instanceColor', 'vertexColors'].filter((k) => frag.includes(k) || sh.some((x) => (src.get(x) ?? '').includes(k)));
      G.links.push({ tag: G.tag, name, traits, defs, ms: performance.now() - t, fragLen: frag.length });
      return r;
    });
    const rec = (kind: string, fmt: number, w: number, h: number, extra = 1) => G.allocs.push({ tag: G.tag, kind, fmt, w, h, bytes: w * h * (BYTES[fmt] ?? 4) * extra });
    wrap('texStorage2D', (o, s, a) => (rec('texStorage2D', a[2], a[3], a[4], a[1] > 1 ? 1.33 : 1), o.apply(s, a)));
    wrap('texImage2D', (o, s, a) => {
      if (a[1] === 0) {
        if (a.length >= 9) rec('texImage2D', a[2], a[3], a[4]);
        else if (a[5] && a[5].width) rec('texImage2D', a[2], a[5].width, a[5].height);
      }
      return o.apply(s, a);
    });
    wrap('renderbufferStorage', (o, s, a) => (rec('renderbuffer', a[1], a[2], a[3]), o.apply(s, a)));
    wrap('renderbufferStorageMultisample', (o, s, a) => (rec('renderbufferMS' + a[1], a[2], a[3], a[4], a[1]), o.apply(s, a)));
    for (const d of ['deleteTexture', 'deleteRenderbuffer', 'deleteFramebuffer']) wrap(d, (o, s, a) => (G.deletes.push({ tag: G.tag, d }), o.apply(s, a)));
  }
};

interface Frame {
  F: number;
  ms: number;
  cpuMs: number;
  calls: number;
  tris: number;
  links: number;
}

/** 1 コマ（step ＋ 描画 ＋ 1 点 readPixels）を n 回。tag は WebGL 側の 印 */
async function frames(page: Page, n: number, tag: string, hookInput?: string): Promise<Frame[]> {
  return page.evaluate(
    ({ n, tag, hookInput }) => {
      const h = (window as any).__rikkun;
      const G = (window as any).__gl;
      G.tag = tag;
      const gl = (document.querySelector('canvas') as HTMLCanvasElement).getContext('webgl2') as WebGL2RenderingContext;
      const px = new Uint8Array(4);
      const out: any[] = [];
      for (let i = 0; i < n; i++) {
        if (hookInput && i === 0) h.input.release('primary');
        const t0 = performance.now();
        h.step(1);
        const rs = h.renderStats();
        const t1 = performance.now();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t2 = performance.now();
        out.push({ F: i + 1, ms: t2 - t0, cpuMs: t1 - t0, calls: rs.drawCalls, tris: rs.triangles, links: G.links.length });
      }
      return out;
    },
    { n, tag, hookInput },
  );
}

const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
};
const sum = (fr: Frame[]) => ({
  n: fr.length,
  medMs: +q(fr.map((f) => f.ms), 0.5).toFixed(1),
  p95Ms: +q(fr.map((f) => f.ms), 0.95).toFixed(1),
  maxMs: +Math.max(...fr.map((f) => f.ms)).toFixed(1),
  medCpuMs: +q(fr.map((f) => f.cpuMs), 0.5).toFixed(1),
  maxCalls: Math.max(...fr.map((f) => f.calls)),
  medCalls: q(fr.map((f) => f.calls), 0.5),
  maxTris: Math.max(...fr.map((f) => f.tris)),
  medTris: q(fr.map((f) => f.tris), 0.5),
});

test(`雷の性能 ${LABEL} ${SCENE} dsf${DSF}`, async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: DSF });
  const page = await ctx.newPage();
  await page.addInitScript(hook);
  const floorY = await legendWorld(page);
  if (SCENE === 'roof') {
    await page.evaluate((y) => {
      const h = (window as any).__rikkun;
      h.world.fill(8, y + 4, 4, 32, y + 4, 28, 'stone');
      h.step(2);
    }, floorY);
  }
  const aim = async () => {
    if (SCENE === 'sky') {
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.player.set({ pitch: 75 });
      });
    } else await aimGroundAhead(page, floorY, 8);
  };
  await aim();
  // 世界の 読みこみが 落ちつくまで
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.step(1);
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    h.step(60);
    h.renderStats();
  });
  const result: any = { label: LABEL, scene: SCENE, dsf: DSF, measuredAt: new Date().toISOString() };
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    return { w: c.width, h: c.height };
  });
  result.canvas = canvas;
  const noStrike = await frames(page, 60, 'idle');
  result.noStrike = sum(noStrike);
  result.programsBeforeCharge = await page.evaluate(() => (window as any).__gl.links.length);

  const strikes: any[] = [];
  for (let k = 1; k <= 3; k++) {
    if (k > 1) {
      await resetStage(page, floorY);
      if (SCENE === 'roof') {
        await page.evaluate((y) => {
          const h = (window as any).__rikkun;
          h.world.fill(8, y + 4, 4, 32, y + 4, 28, 'stone');
          h.step(2);
        }, floorY);
      }
      await aim();
    }
    await chargeUntilReady(page, 60);
    await frames(page, 3, `charge${k}`); // たまっている 描画を 流して から 測る（放した 1 コマ目に 混ぜない）
    const before = await page.evaluate(() => (window as any).__gl.links.length);
    const fall = await frames(page, 88, `strike${k}`, 'release');
    const afterFall = await page.evaluate(() => (window as any).__gl.links.length);
    const after = await frames(page, 60, `after${k}`);
    const info = await page.evaluate(() => (window as any).__rikkun.thunder?.info?.());
    strikes.push({
      k,
      linksBefore: before,
      linksAfterFall: afterFall,
      first: fall.slice(0, 3).map((f) => +f.ms.toFixed(1)),
      F1: +fall[0]!.ms.toFixed(1),
      F8: +fall[7]!.ms.toFixed(1),
      maxFrame: fall.reduce((a, f) => (f.ms > a.ms ? f : a), fall[0]!).F,
      fall: sum(fall),
      fallNoFirst: sum(fall.slice(3)),
      after: sum(after),
      calls: { F1: fall[0]!.calls, F10: fall[9]!.calls, F30: fall[29]!.calls, F88: fall[87]!.calls, after: after[10]!.calls },
      fallMeta: info ? { F: info.F } : null,
      perF: fall.map((f) => [f.F, +f.ms.toFixed(1), +f.cpuMs.toFixed(1), f.calls, f.tris]),
    });
  }
  result.strikes = strikes;
  result.gl = await page.evaluate(() => {
    const G = (window as any).__gl;
    return { links: G.links, allocs: G.allocs.filter((a: any) => a.bytes >= 65536), deletes: G.deletes };
  });
  mkdirSync('perf-results', { recursive: true });
  const file = `perf-results/thunder-${LABEL}-${SCENE}-dsf${DSF}.json`;
  writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(file);
  await ctx.close();
});
