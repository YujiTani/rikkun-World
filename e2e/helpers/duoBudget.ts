import type { Page } from '@playwright/test';

/**
 * COOP-1（docs/design/COOP-1.md §12.1）: 2 人で 遊ぶときの 「描画の 重さ」の くらべの 置き場。
 * 時間（ms）では 合否を 決めない（#255）。描画回数（draw calls）と 三角形で くらべる。
 *
 * ---- SOLO_BASELINE（AC14）----
 * 作業 1 を 始める前の main で 測った 1 人の 数。測り方（ここと 同じ。数が 変わる 変更が 入ったら 測りなおして 直す）:
 *   E2E の サーバー（playwright.config.ts の webServer: VITE_RING_DEFAULT=small・影なし・小ブロックなし・VITE_FRAME_CLOCK=count）で
 *   `/?nosave=1&ring=small` を 開く → pause → (100.5, 100.5) の まわり 25×25 を 石の 床に して 上を 空気に → その 足もとに 立ち yaw 90・pitch 0 →
 *   step(120) → renderStats() の drawCalls・triangles。3 回 開いて 3 回 同じ 数（ゆれなし）。測った 日: 2026-11-06（ブランチ claude/project-thread-miskfl の 作業 1 の 前。
 *   手元 Chrome + SwiftShader）。CI でも 同じ 数に なるはずだが、CI の ログで 違えば ここを 直す（PO に 知らせる）。
 */
export const SOLO_BASELINE = {
  drawCalls: 90,
  triangles: 26158,
  /** 測った 場所と 向き（measureRender の 既定と そろえる） */
  at: { x: 100.5, z: 100.5, yaw: 90, pitch: 0 },
} as const;

/** 上限は 2 割の ゆとり（AC14: 1 人で 遊ぶとき SOLO_BASELINE の 1.2 倍以下） */
export const SOLO_SLACK = 1.2;
export const SOLO_MAX = {
  drawCalls: Math.ceil(SOLO_BASELINE.drawCalls * SOLO_SLACK),
  triangles: Math.ceil(SOLO_BASELINE.triangles * SOLO_SLACK),
} as const;

/**
 * 2 人のときの 上限（AC31。作業 2 で 使う）: 「同じテストの 中で 1 人のときと くらべた 何倍まで」。
 * 数は §7.1 の 決め方（D が A の 描画回数 2.0 倍・三角形 1.8 倍 以下）を 分割の 上限に した 仮の 値。
 * 1 画面・ルーペの 値は 試作の 測り（作業 2 の 前）で デザインが 決める。数を 変えるときは デザインへ 差し戻す。
 */
export const DUO_RENDER_BUDGET = {
  one: { drawCalls: 1.2, triangles: 1.2 }, // 仮: 1 画面は 絵を 増やさない（2P の 人形 1 体ぶんの ゆとり）
  loupe: { drawCalls: 1.6, triangles: 1.5 }, // 仮
  split: { drawCalls: 2.0, triangles: 1.8 }, // §7.1 の 決め方
} as const;

export interface RenderCount {
  drawCalls: number;
  triangles: number;
}

/**
 * 1 人の 数を 測る: 決まった 場所・向きに 立ち、床を ならし、120 ステップ 進めて 数える。
 * ゲームは `/?nosave=1&ring=small&duo=dev` などで 開いて ready に なった あと。duo.join() の 前でも あとでも 同じ 場所で 測れる
 * （1P を 置きなおす だけ。2P が いれば 1P の 右 2 マスに いる）。
 */
export async function measureRender(page: Page, at: { x: number; z: number; yaw: number; pitch: number } = SOLO_BASELINE.at): Promise<RenderCount> {
  return page.evaluate((at) => {
    const h = (window as any).__rikkun;
    h.pause();
    const fy: number = h.world.groundHeight(Math.floor(at.x), Math.floor(at.z));
    const x0 = Math.floor(at.x) - 12;
    const z0 = Math.floor(at.z) - 12;
    h.world.fill(x0, fy, z0, x0 + 24, fy, z0 + 24, 'stone');
    h.world.fill(x0, fy + 1, z0, x0 + 24, fy + 20, z0 + 24, 'air');
    h.player.set({ position: { x: at.x, y: fy + 1, z: at.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: at.yaw, pitch: at.pitch });
    h.step(120);
    const s = h.renderStats(); // たまった 描画を 流して から 数える
    return { drawCalls: s.drawCalls as number, triangles: s.triangles as number };
  }, at);
}
