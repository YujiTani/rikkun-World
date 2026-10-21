import { expect, type Page } from '@playwright/test';
import { measure } from './thunder';
import type { Vec3 } from './blade';

/**
 * WEAPON-9（虹・シャイニング。docs/design/WEAPON-7.md §5・§11 PR-2）の E2E 用の 道具。
 * 数（F・半径・ダメージ・カメラの きょり）は 決め打ちせず ゲームに 聞く:
 * `legend.state()`（move・moveF・dome）・`legend.events()`・`combat.sounds()`・`settings`・`renderStats()`・`thunder.programs()`・`inventory.durability()`・`player.doll()`。
 * 約束（実装が 作る 口）: `inventory.add(item, count, { power })`・`legend.state().dome` が `{ radius } | null`・
 * `legend.events()` に `shiningStart`・`shiningEnd`・`domeHit { yokaiId, damage }`・設定 `shiningCamDistance`。
 */
export const NIJI = 'niji';
/** 一人称（カメラが 体に ぴったり。doll が 見えない）にするため、うしろに 置く 石の かべの 高さ */
export interface ShiningStep {
  F: number;
  move: string | null;
  moveF: number;
  dome: { radius: number } | null;
  events: { type: string; damage?: number; yokaiId?: number }[];
  sounds: string[];
  calls: number;
  triangles: number;
  programs: number;
  mean: number;
  white: number;
  rgb: { r: number; g: number; b: number } | null;
  dollVisible: boolean;
}

/** 虹を 強さ power で 1 本 だけ 持つ（0 番・選ぶ）。`inventory.add` の 3 つ目の 口が 実装の 前は ないので 赤 */
export async function holdNiji(page: Page, power = 10): Promise<void> {
  await page.evaluate((power) => {
    const h = window.__rikkun as any;
    h.input.releaseAll();
    h.inventory.clear();
    h.inventory.add('niji', 1, { power });
    h.inventory.select(0);
    h.step(1);
  }, power);
}

/** 一人称に する: 体の うしろに 石の かべを 立てて、カメラを 体に 近づける（doll が 見えなく なる まで） */
export async function pushCameraIn(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    const h = window.__rikkun as any;
    const p = h.player.get().position;
    const x = Math.floor(p.x);
    const z = Math.floor(p.z) + 1; // 北向き。うしろ = +z
    const y = Math.floor(p.y);
    h.world.fill(x - 2, y, z, x + 2, y + 6, z, 'stone');
    h.step(30);
    return h.player.doll().visible === false;
  });
  expect(ok, 'うしろに かべを 立てても doll が 消えない（一人称に ならない）').toBe(true);
}

/** 画面の 平均の 色（0〜255）。measure と 同じく 画面を 撮って 読む */
async function meanRgb(page: Page): Promise<{ r: number; g: number; b: number }> {
  const buf = await page.screenshot();
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const cx = cv.getContext('2d')!;
    cx.drawImage(bmp, 0, 0);
    const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
    let r = 0, g = 0, b = 0;
    const n = bmp.width * bmp.height;
    for (let i = 0; i < n * 4; i += 4) (r += d[i]!), (g += d[i + 1]!), (b += d[i + 2]!);
    return { r: r / n, g: g / n, b: b / n };
  }, buf.toString('base64'));
}

/** 画面の 明るさ・色を 読みながら か（shots）、読まずに か、1 ステップずつ 進めた きろく */
async function snap(page: Page, F: number, shots: boolean, rgb: boolean): Promise<ShiningStep> {
  const s = await page.evaluate(() => {
    const h = window.__rikkun as any;
    h.step(1);
    const st = h.legend.state();
    const ev = h.legend.events();
    const w = window as any;
    const seen = w.__niSeen ?? 0;
    w.__niSeen = ev.length;
    const rs = h.renderStats();
    return {
      move: st.move,
      moveF: st.moveF,
      dome: st.dome ? { radius: st.dome.radius } : null,
      events: JSON.parse(JSON.stringify(ev.slice(seen))),
      sounds: h.combat.sounds() as string[],
      calls: rs.drawCalls as number,
      triangles: rs.triangles as number,
      programs: h.thunder.programs() as number,
      dollVisible: h.player.doll().visible as boolean,
    };
  });
  let mean = NaN, white = NaN;
  if (shots) ({ mean, white } = await measure(page, [], F === 100 ? `niji-F100-${s.dollVisible ? 'third' : 'first'}` : undefined));
  const c = rgb ? await meanRgb(page) : null;
  return { F, ...s, mean, white, rgb: c };
}

/**
 * ためて（ticks 押す）→ はなす（そのステップ = F1）→ F260 まで 1 ステップずつ きろく。戻りは [F1 … F260]。
 * shots = 毎ステップ 画面を 撮る（明るさ）。rgbFrom〜rgbTo の F は 平均の 色も 読む。
 */
export async function runShining(page: Page, o: { ticks: number; shots: boolean; rgbFrom?: number; rgbTo?: number }): Promise<ShiningStep[]> {
  await page.evaluate((ticks) => {
    const h = window.__rikkun as any;
    h.combat.sounds();
    (window as any).__niSeen = h.legend.events().length;
    h.input.press('primary');
    h.step(ticks);
    h.input.release('primary');
  }, o.ticks);
  const out: ShiningStep[] = [];
  for (let F = 1; F <= 260; F++) out.push(await snap(page, F, o.shots, F >= (o.rgbFrom ?? 1e9) && F <= (o.rgbTo ?? -1)));
  return out;
}

/** ART-PIPE-1 AC16 と 同じ 数え方: 明るさの 上がり 回数 */
export function countRises(L: number[]): number {
  let m = L[0]!, M = 0, ups = 0;
  let mode: 'low' | 'high' = 'low';
  for (let i = 1; i < L.length; i++) {
    const v = L[i]!;
    if (mode === 'low') {
      m = Math.min(m, v);
      if (v >= m + 8) (ups++, (mode = 'high'), (M = v));
    } else {
      M = Math.max(M, v);
      if (v <= M - 8) ((mode = 'low'), (m = v));
    }
  }
  return ups;
}

export const vlen = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
