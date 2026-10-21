import { expect, type Page } from '@playwright/test';

/**
 * ART-PIPE-1（雷 B・docs/design/ART-PIPE-1.md 1.1 §6）の E2E 用の 道具と、テストの 窓口 `window.__rikkun.thunder` の 約束。
 * 窓口は developer が 作る（実装の 前は ない → このファイルを 使う テストは 赤）。名前は ここで 決めた とおり:
 *
 *   thunder.info(): ThunderInfo   … いまの 見た目の ようす（毎回 読み直す。一時停止中は 変わらない）
 *   thunder.refresh(cam?: Vec3)   … 板・輪の 向きを「カメラが cam（なければ 本物の カメラ）に ある」として 作りなおす。F は 進めない
 *   thunder.project(p: Vec3)      … 世界の 点 p の 画面の 位置（ページの CSS ピクセル）。見えない とき visible = false
 *   thunder.programs(): number    … three の renderer.info.programs の 数（シェーダーの 数）
 *   thunder.textures(): ThunderTex[] … 雷 B の 3 まい（sheet・ground・spark）の 読み方
 *
 * F = 落雷の F（はなした ステップ = 1）。落雷が ない・終わった（F89 から）ときは F = 0、S = null、すべて 見えない。
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ThunderLayer {
  /** 0 奥・1 中・2 手前 */
  layer: 0 | 1 | 2;
  visible: boolean;
  /** 板の 下の はしの まん中（世界） */
  center: Vec3;
  /** 板の おもての 向き（単位ベクトル） */
  normal: Vec3;
  /** 板の 上の 軸（単位ベクトル） */
  up: Vec3;
  /** 大きさ（ブロック） */
  width: number;
  height: number;
}

export interface ThunderInfo {
  F: number;
  S: Vec3 | null;
  bolt: { visible: boolean; frame: number; variant: number; flipped: boolean; layers: ThunderLayer[] };
  ring: { visible: boolean; scale: number; radius: number; alpha: number; y: number; normal: Vec3; image: 'appear' | 'vanish' | null };
  sparks: { visible: boolean; alive: number };
  /** まわりを 明るく: 量・色（'#FFF8DC'）・まん中・とどき・入れ口の 数（いつも 同じ） */
  glow: { amount: number; color: string; center: Vec3 | null; full: number; zero: number; slots: number };
}

export interface ThunderTex {
  name: 'sheet' | 'ground' | 'spark';
  file: string;
  width: number;
  height: number;
  magFilter: 'nearest' | 'linear';
  minFilter: 'nearest' | 'linear';
  mipmaps: boolean;
  colorSpace: 'srgb' | 'linear';
  blending: 'additive' | 'normal';
  depthWrite: boolean;
  depthTest: boolean;
}

/** 窓口が あるか（実装の 前は ここで 落ちる） */
export async function expectThunderHook(page: Page): Promise<void> {
  const has = await page.evaluate(() => {
    const t = (window.__rikkun as any)?.thunder;
    return ['info', 'refresh', 'project', 'programs', 'textures'].every((k) => typeof t?.[k] === 'function');
  });
  expect(has, 'window.__rikkun.thunder.{info, refresh, project, programs, textures} が まだ ない（ART-PIPE-1 のテストの 窓口。e2e/helpers/thunder.ts）').toBe(true);
}

export const thunderInfo = (page: Page) => page.evaluate(() => (window.__rikkun as any).thunder.info() as ThunderInfo);

export const thunderRefresh = (page: Page, cam?: Vec3) =>
  page.evaluate((cam) => {
    (window.__rikkun as any).thunder.refresh(cam);
    return (window.__rikkun as any).thunder.info() as ThunderInfo;
  }, cam);

export const project = (page: Page, p: Vec3) =>
  page.evaluate((p) => (window.__rikkun as any).thunder.project(p) as { x: number; y: number; visible: boolean }, p);

export const angleDeg = (a: Vec3, b: Vec3): number => {
  const d = a.x * b.x + a.y * b.y + a.z * b.z;
  const m = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
  return (Math.acos(Math.max(-1, Math.min(1, d / m))) * 180) / Math.PI;
};

export interface Shot {
  /** 画面ぜんたいの 平均の 明るさ（0〜255。0.299R + 0.587G + 0.114B） */
  mean: number;
  /** 3 色とも 245 以上の 点の わり（0〜1） */
  white: number;
  /** rects ごとの 平均の 明るさ */
  rects: number[];
}

/**
 * 画面を 撮って、ページの 中で 読みとく（画像は 持ち帰らない）。rects は ページの CSS ピクセル。
 * `save` を 渡すと test-shots/ に 保存する（git に 入らない）。
 */
export async function measure(page: Page, rects: { x: number; y: number; w: number; h: number }[] = [], save?: string): Promise<Shot> {
  await page.evaluate(() => (window.__rikkun as any).renderStats()); // たまった 描画を 1 回 流す
  const buf = await page.screenshot(save ? { path: `test-shots/${save}.png` } : {});
  return page.evaluate(
    async ({ b64, rects }) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const bmp = await createImageBitmap(blob);
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const cx = cv.getContext('2d')!;
      cx.drawImage(bmp, 0, 0);
      const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
      const L = (i: number) => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      let sum = 0;
      let white = 0;
      const n = bmp.width * bmp.height;
      for (let i = 0; i < n * 4; i += 4) {
        sum += L(i);
        if (d[i]! >= 245 && d[i + 1]! >= 245 && d[i + 2]! >= 245) white++;
      }
      const sc = bmp.width / window.innerWidth; // 画面の 倍率（ふつうは 1）
      const out = rects.map((r) => {
        const x0 = Math.max(0, Math.round(r.x * sc));
        const y0 = Math.max(0, Math.round(r.y * sc));
        const x1 = Math.min(bmp.width, Math.round((r.x + r.w) * sc));
        const y1 = Math.min(bmp.height, Math.round((r.y + r.h) * sc));
        let s = 0;
        let c = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) (s += L((y * bmp.width + x) * 4)), c++;
        return c ? s / c : NaN;
      });
      return { mean: sum / n, white: white / n, rects: out };
    },
    { b64: buf.toString('base64'), rects },
  );
}

/** 1 ステップ 進めて、その ステップの 見た目・描画回数・落雷の 出来事を 読む */
export interface FallStep {
  info: ThunderInfo;
  calls: number;
  triangles: number;
  strike: boolean;
}

export async function stepOne(page: Page): Promise<FallStep> {
  return page.evaluate(() => {
    const h = window.__rikkun as any;
    const w = window as any;
    h.step(1);
    const ev = h.legend.events();
    const seen = w.__thSeen ?? 0;
    w.__thSeen = ev.length;
    const rs = h.renderStats();
    return {
      info: h.thunder.info(),
      calls: rs.drawCalls,
      triangles: rs.triangles,
      strike: ev.slice(seen).some((e: any) => e.type === 'lightningStrike'),
    };
  }) as Promise<FallStep>;
}

/** 起点を 今に そろえる（stepOne が 読む 出来事の 数） */
export const markThunder = (page: Page) =>
  page.evaluate(() => {
    (window as any).__thSeen = (window.__rikkun as any).legend.events().length;
  });
