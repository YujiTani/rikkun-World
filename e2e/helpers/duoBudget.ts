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
 * 2 人のときの 上限（AC31。作業 2。作業 3e（#422。1.8）で 分割だけに した）: 「同じテストの 中で 1 人のときと くらべた 何倍まで」。
 * 1.8 から 2P が いる あいだは いつも 左右 2 回 描く。1 画面（1.2 倍）・ルーペ（1.8／1.5 倍）の 行は なくなった。
 * 決め方（重さの 試作 /mnt/project-files/coop/perf/README.md の 数と、E2E の 条件の ちがいから。仕様 §9.9）:
 *   - 試作の 数は 「ふだんの 輪(full)・小ブロックあり」の 1 人に 対する 倍。E2E は 小さい 輪・小ブロックなし・影なし・平らな 床なので、同じ 倍に ならない。
 *   - 分割: 描画回数・三角形とも 2.0・1.8 倍（§7.1 の 合格の 線）。試作 D は 回数 1.45・三角形 0.63 倍で 十分 入る。
 *     E2E は 小ブロックが なく 三角形の 工夫(micro16)が 効かないので、三角形は 仕様の 線 1.8 の まま。
 *   - 「2 人が 近い」（2 マス・輪 1 つ）と「遠い」（60 マス・輪 2 つ）の 2 か所とも この 倍率以下（AC31）。近い 場合は 試作で 測っていない（§9.9）。
 *   - 持つ 列: 595 以下(列の 上限。AC27)は 別に 見る。
 * 数は PO が 仕様 §12.1 に 書く。変えるときは デザインへ 差し戻す。
 */
export const DUO_RENDER_BUDGET = {
  split: { drawCalls: 2.0, triangles: 1.8 },
} as const;

/** 下限(AC31): 2 回 描いて いる しるし。1 人の 何倍 以上(描画回数)。2P 側の 列が 描かれて いないと 下限に とどかない（近い・遠い どちらでも） */
export const DUO_RENDER_MIN = { split: { drawCalls: 1.3 } } as const;

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

/**
 * 2 人のときの 数を 測る(AC31): 1P を 決まった 場所・向きに 置き、2P を 1P から (dx, dz) マス はなれた 所に 置く。
 * 1P と 2P の まわりの 25×25 を 石の 床に して 上を 空気に する(地形の ちがいで 数が ゆれないように)。
 * 120 ステップ 進めて(切りかえの 見せ方と 輪の 切りかえを すぎる)から、`duo.state().view` が 思った とおりか 確かめ、renderStats を 数える。
 * 返す view は 実際の ようす。
 */
export async function measureDuoRender(
  page: Page,
  rel: { dx: number; dz: number },
  at: { x: number; z: number; yaw: number; pitch: number } = SOLO_BASELINE.at,
): Promise<RenderCount & { view: string; viewports: number }> {
  return page.evaluate(
    ({ at, rel }) => {
      const h = (window as any).__rikkun;
      h.pause();
      const flat = (cx: number, cz: number) => {
        const fy: number = h.world.groundHeight(Math.floor(cx), Math.floor(cz));
        const x0 = Math.floor(cx) - 12;
        const z0 = Math.floor(cz) - 12;
        h.world.fill(x0, fy, z0, x0 + 24, fy, z0 + 24, 'stone');
        h.world.fill(x0, fy + 1, z0, x0 + 24, fy + 20, z0 + 24, 'air');
        return fy;
      };
      const fy1 = flat(at.x, at.z);
      const fy2 = flat(at.x + rel.dx, at.z + rel.dz);
      h.player.set({ position: { x: at.x, y: fy1 + 1, z: at.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: at.yaw, pitch: at.pitch });
      h.duo.place(2, { x: at.x + rel.dx, y: fy2 + 1, z: at.z + rel.dz });
      h.step(120);
      h.world.settle({ full: true }); // 2P 側の 列も 読みこみ・光・メッシュまで そろえてから 数える
      h.step(10);
      const s = h.renderStats();
      return { drawCalls: s.drawCalls as number, triangles: s.triangles as number, view: h.duo.state().view as string, viewports: h.duo.viewports().length as number };
    },
    { at, rel },
  );
}
