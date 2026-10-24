import { test, expect, type Page } from '@playwright/test';
import { installTools } from './helpers/gasha';

/**
 * #293 がしゃどくろの 音は ミキサー経由: 設定で ミュート／音量 0 に すると 効果音も BGM も 鳴らない。
 * 音そのものは 聞けない ので、AudioNode の つなぎを 記録して（addInitScript）、鳴らした 音源から スピーカーまでの 道すじの
 * ゲインの 積が 0 に なるか・リミッターを 通るか を ゲームに 聞く。ミュートの 反映は 音の 時計で ゆっくり 変わる ので、
 * 「積が 0 に なる」まで 条件で 待つ（秒数では 待たない）。
 */
test.describe.configure({ timeout: 180_000 });

const SETUP = () => {
  const w = window as any;
  w.__edges = [] as [AudioNode, AudioNode][];
  w.__started = [] as AudioBufferSourceNode[];
  const c0 = AudioNode.prototype.connect as any;
  (AudioNode.prototype as any).connect = function (this: AudioNode, to: any, ...r: any[]) {
    if (to instanceof AudioNode) w.__edges.push([this, to]);
    return c0.call(this, to, ...r);
  };
  const s0 = AudioBufferSourceNode.prototype.start as any;
  (AudioBufferSourceNode.prototype as any).start = function (this: AudioBufferSourceNode, ...a: any[]) {
    w.__started.push(this);
    return s0.apply(this, a);
  };
  // がしゃどくろの BGM（神々の 戯れ）の 音源（いま 流れて いる もの）
  w.__kami = () => {
    const info = w.__gashaBgm?.info('kamigami');
    if (!info) return null;
    return (w.__started as AudioBufferSourceNode[]).filter((s) => s.loop && Math.abs((s.buffer?.duration ?? 0) - info.duration) < 0.01).pop() ?? null;
  };
  w.__kamiGain = () => { const s = w.__kami(); return s ? Math.max(...w.__route(s).map((r: any) => r.gain)) : -1; };
  // 音源から スピーカーまでの 道すじ（ゲインの 積・リミッターを 通るか・スピーカーに 着くか）
  w.__route = (src: AudioNode) => {
    const next = new Map<AudioNode, AudioNode[]>();
    for (const [a, b] of w.__edges as [AudioNode, AudioNode][]) { const l = next.get(a) ?? []; l.push(b); next.set(a, l); }
    const res: { gain: number; limiter: boolean }[] = [];
    const walk = (n: AudioNode, gain: number, limiter: boolean, depth: number) => {
      if (n instanceof AudioDestinationNode) { res.push({ gain, limiter }); return; }
      if (depth > 16) return;
      const g = n instanceof GainNode ? gain * n.gain.value : gain;
      const l = limiter || n instanceof DynamicsCompressorNode;
      for (const o of next.get(n) ?? []) walk(o, g, l, depth + 1);
    };
    walk(src, 1, false, 0);
    return res;
  };
};

async function open(page: Page): Promise<string[]> {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await page.addInitScript(SETUP);
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.mouse.click(0, 0); // 最初の クリックで 音が 使えるように なる
  await page.evaluate(() => { const h = (window as any).__rikkun; h.lock.simulate(true); h.pause(); });
  await page.evaluate(() => (window as any).__rikkun.world.settle({ full: true }));
  await installTools(page);
  return errs;
}

/** 体を 出して 怒らせ、BGM が 流れはじめる まで コマを 進める（読みこみは 非同期なので 一息ずつ 譲る） */
async function startBgm(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const w = window as any, h = w.__rikkun, gt = w.__gt;
    await gt.spawn({ distance: 60, angleDeg: -90 });
    gt.big().walk(false);
    gt.put(64.5, 64.5);
    gt.big().hit();
    for (let i = 0; i < 1500; i++) {
      gt.heal(); h.step(1);
      if (w.__gashaBgm?.status().playing === 'kamigami') return true;
      await new Promise((r) => setTimeout(r, 2));
    }
    return false;
  });
}

/** 画面の 音の 設定（おとの ボタン・つまみ）を 触る。本物の 画面の 部品を 使う */
const setMute = (page: Page, on: boolean) => page.evaluate((on) => {
  const b = document.querySelector<HTMLElement>('[data-testid=sound-mute]')!;
  if ((b.getAttribute('aria-pressed') === 'true') !== on) b.click();
}, on);
const setKnob = (page: Page, id: string, v: number) => page.evaluate(({ id, v }) => {
  const r = document.querySelector<HTMLInputElement>(`[data-testid=${id}]`)!;
  r.value = String(v);
  r.dispatchEvent(new Event('input', { bubbles: true }));
}, { id, v });

/** BGM の 音源（長さ 約 108 秒・ループ）の 道すじの ゲインの 最大 */
const bgmGain = (page: Page) => page.evaluate(() => {
  const w = window as any;
  const info = w.__gashaBgm.info('kamigami');
  const src = (w.__started as AudioBufferSourceNode[]).filter((s) => s.loop && Math.abs((s.buffer?.duration ?? 0) - info.duration) < 0.01).pop();
  if (!src) return null;
  const routes = w.__route(src) as { gain: number; limiter: boolean }[];
  return { n: routes.length, max: Math.max(...routes.map((r) => r.gain)), limiter: routes.every((r) => r.limiter) };
});

test.describe('BGM', () => {
  test('BGM は ミキサー（リミッター）を 通って スピーカーへ。ミュート・音量 0 で 積が 0、もどすと 鳴る', async ({ page }) => {
    const errs = await open(page);
    expect(await startBgm(page), 'BGM が 流れる').toBe(true);
    // 流れはじめは フェードインの 途中（音の 時計で ゆっくり 上がる）。CI が 重いと まだ 小さい ので、上がりきる まで 条件で 待つ
    await page.waitForFunction(() => { const w = window as any; return w.__kamiGain() > 0.01; });
    const on = await bgmGain(page);
    expect(on).not.toBeNull();
    expect(on!.n).toBeGreaterThan(0);
    expect(on!.limiter, 'ぜんぶ リミッターを 通る').toBe(true);
    expect(on!.max).toBeGreaterThan(0.01);
    // ミュート
    await setMute(page, true);
    await page.waitForFunction(() => { const w = window as any; const g = w.__kamiGain(); return g >= 0 && g < 1e-4; });
    expect((await bgmGain(page))!.max).toBeLessThan(1e-4);
    await setMute(page, false);
    await page.waitForFunction(() => { const w = window as any; return w.__kamiGain() > 0.01; });
    // 「ぜんぶ」の 音量 0
    await setKnob(page, 'sound-master', 0);
    await page.waitForFunction(() => { const w = window as any; const g = w.__kamiGain(); return g >= 0 && g < 1e-4; });
    await setKnob(page, 'sound-master', 0.6);
    await page.waitForFunction(() => { const w = window as any; return w.__kamiGain() > 0.01; });
    // 「おんがく」の 音量 0
    await setKnob(page, 'sound-bgm', 0);
    await page.waitForFunction(() => { const w = window as any; const g = w.__kamiGain(); return g >= 0 && g < 1e-4; });
    expect(errs).toEqual([]);
  });

  test('片づける（despawn）と BGM を 頼まなく なる（ふだんの BGM に もどる）', async ({ page }) => {
    const errs = await open(page);
    expect(await startBgm(page)).toBe(true);
    await page.evaluate(() => (window as any).__rikkun.gasha.despawn());
    const st = await page.evaluate(() => { const w = window as any; w.__rikkun.step(30); return w.__gashaBgm.status(); });
    expect(st.desired).toBeNull();
    expect(st.wants.big).toBe(false);
    expect(errs).toEqual([]);
  });
});

test.describe('効果音', () => {
  /** 攻撃を 出して、その 間に 鳴らした 音源の 道すじを 集める。player = 立つ 場所（高く 浮く） */
  const collect = (page: Page, attack: string) => page.evaluate(async (attack) => {
    const w = window as any, h = w.__rikkun, gt = w.__gt, g = gt.big();
    const from = (w.__started as AudioBufferSourceNode[]).length;
    g.attack(attack);
    for (let i = 0; i < 700; i++) { gt.put(64.5, 64.5, 40); gt.heal(); h.step(1); if (i % 20 === 0) await new Promise((r) => setTimeout(r, 2)); }
    const fresh = (w.__started as AudioBufferSourceNode[]).slice(from);
    const routes = fresh.map((s) => w.__route(s) as { gain: number; limiter: boolean }[]);
    return { n: fresh.length, reach: routes.every((r) => r.length > 0), limiter: routes.every((r) => r.every((x) => x.limiter)), max: Math.max(0, ...routes.flatMap((r) => r.map((x) => x.gain))) };
  }, attack);

  test('がしゃどくろの 効果音は ミキサーの リミッターを 通る。ミュート中は 鳴らしても 積が 0', async ({ page }) => {
    const errs = await open(page);
    expect(await startBgm(page)).toBe(true);
    await page.evaluate(() => { (window as any).__gt.big().tune({ attack: { gapSec: [1e6, 1e6], firstGapSec: 1e6 } }); });
    const loud = await collect(page, 'slam2');
    expect(loud.n, '効果音が 鳴る').toBeGreaterThan(0);
    expect(loud.reach, 'ぜんぶ スピーカーに 着く').toBe(true);
    expect(loud.limiter, 'ぜんぶ リミッターを 通る（ミキサー経由）').toBe(true);
    expect(loud.max).toBeGreaterThan(0.001);
    await page.evaluate(() => { const g = (window as any).__gt.big(); g.attack('thunder'); });
    await setMute(page, true);
    await page.waitForFunction(() => { const w = window as any; const g = w.__kamiGain(); return g >= 0 && g < 1e-4; });
    const quiet = await collect(page, 'sweep');
    expect(quiet.n, 'ミュートでも ゲームは 音を 頼む（ミキサーで 消える）').toBeGreaterThan(0);
    expect(quiet.limiter).toBe(true);
    expect(quiet.max, 'ミュート中は 積が 0').toBeLessThan(1e-4);
    // 音量 0 でも 同じ
    await setMute(page, false);
    await setKnob(page, 'sound-master', 0);
    await page.waitForFunction(() => { const w = window as any; const g = w.__kamiGain(); return g >= 0 && g < 1e-4; });
    const zero = await collect(page, 'beam');
    expect(zero.n).toBeGreaterThan(0);
    expect(zero.max, '音量 0 では 積が 0').toBeLessThan(1e-4);
    expect(errs).toEqual([]);
  });
});
