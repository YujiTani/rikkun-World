import { expect, type Page } from '@playwright/test';
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

/** 立てた かべ（あとで 消す）*/
let wall: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } | null = null;

/** 一人称に する: カメラの ある 側（体の うしろ）に 石の かべを 立てて、カメラを 体に 近づける（doll が 見えなく なる まで） */
export async function pushCameraIn(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const h = window.__rikkun as any;
    const p = h.player.get().position;
    const c = h.camera.get().position;
    const dx = c.x - p.x, dz = c.z - p.z;
    const m = Math.hypot(dx, dz) || 1;
    const bx = Math.floor(p.x + (dx / m) * 1.0), bz = Math.floor(p.z + (dz / m) * 1.0);
    const y = Math.floor(p.y);
    const px = Math.floor(p.x), pz = Math.floor(p.z);
    // 体の マスを のぞいた 1 まいの かべ。カメラが x 側に 強ければ x の 面、z 側なら z の 面（よこ ±2）
    const alongX = Math.abs(dx) > Math.abs(dz);
    const w = alongX ? { x0: bx, y0: y, z0: bz - 2, x1: bx, y1: y + 6, z1: bz + 2 } : { x0: bx - 2, y0: y, z0: bz, x1: bx + 2, y1: y + 6, z1: bz };
    if (bx === px && bz === pz) throw new Error('かべが 体の マスに かさなる');
    h.world.fill(w.x0, w.y0, w.z0, w.x1, w.y1, w.z1, 'stone');
    const bodyAir = [y, y + 1].every((yy) => h.world.getBlock(px, yy, pz) === 'air' || h.world.getBlock(px, yy, pz) === 0);
    if (!bodyAir) throw new Error('体の マスが 空気で ない');
    h.step(30);
    return { w, ok: h.player.doll().visible === false };
  });
  wall = r.w;
  expect(r.ok, 'うしろに かべを 立てても doll が 消えない（一人称に ならない）').toBe(true);
}

/** 立てた かべを 消す（空気に もどす） */
export async function removeWall(page: Page): Promise<void> {
  if (!wall) return;
  await page.evaluate((w) => (window.__rikkun as any).world.fill(w.x0, w.y0, w.z0, w.x1, w.y1, w.z1, 'air'), wall);
  wall = null;
}

/** 画面を 1 枚 撮って、平均の 明るさ・3 色とも 245 以上の 点の わり・平均の 色を 読む（save があれば 保存） */
export async function shotStats(page: Page, save?: string): Promise<{ mean: number; white: number; r: number; g: number; b: number }> {
  await page.evaluate(() => (window.__rikkun as any).renderStats());
  const buf = await page.screenshot(save ? { path: `test-shots/${save}.png` } : {});
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const cx = cv.getContext('2d')!;
    cx.drawImage(bmp, 0, 0);
    const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
    let r = 0, g = 0, b = 0, white = 0;
    const n = bmp.width * bmp.height;
    for (let i = 0; i < n * 4; i += 4) {
      r += d[i]!; g += d[i + 1]!; b += d[i + 2]!;
      if (d[i]! >= 245 && d[i + 1]! >= 245 && d[i + 2]! >= 245) white++;
    }
    return { mean: (0.299 * r + 0.587 * g + 0.114 * b) / n, white: white / n, r: r / n, g: g / n, b: b / n };
  }, buf.toString('base64'));
}
export const meanRgb = shotStats;

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
  let c: { r: number; g: number; b: number } | null = null;
  if (shots || rgb) {
    const st = await shotStats(page, F === 100 ? `niji-F100-${s.dollVisible ? 'third' : 'first'}` : undefined);
    mean = st.mean; white = st.white;
    if (rgb) c = { r: st.r, g: st.g, b: st.b };
  }
  return { F, ...s, mean, white, rgb: c };
}

/**
 * ためて（ticks 押す）→ はなす（そのステップ = F1）→ F260 まで 1 ステップずつ きろく。戻りは [F1 … F260]。
 * shots = 毎ステップ 画面を 撮る（明るさ）。rgbFrom〜rgbTo の F は 平均の 色も 読む。
 */
export async function runShining(
  page: Page,
  o: { ticks: number; shots: boolean; rgbFrom?: number; rgbTo?: number },
): Promise<{ steps: ShiningStep[]; programsBefore: number }> {
  const programsBefore = await page.evaluate((ticks) => {
    const h = window.__rikkun as any;
    h.combat.sounds();
    (window as any).__niSeen = h.legend.events().length;
    h.input.press('primary');
    h.step(ticks);
    h.renderStats(); // たまった 描画を 流して から 数える
    const n = h.thunder.programs() as number;
    h.input.release('primary');
    return n;
  }, o.ticks);
  const steps: ShiningStep[] = [];
  for (let F = 1; F <= 260; F++) steps.push(await snap(page, F, o.shots, F >= (o.rgbFrom ?? 1e9) && F <= (o.rgbTo ?? -1)));
  return { steps, programsBefore };
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
