import type { Page } from '@playwright/test';

/**
 * #144 SHADOW-1 の E2E の共通の準備。窓口 `window.__rikkun.shadow` の決まり（docs/design/SHADOW.md §8.1）:
 *   enabled(): boolean                      いま影が付いているか（はじめは true）
 *   set(on: boolean): void                  かげ オン／オフ（次のコマで画面が変わる。設定の画面のボタンと同じ）
 *   stats(): ShadowStats                    下を見よ
 *   resetStats(): void                      redraws・frame.maxStaticPerFrame を 0 にもどす
 *   advance(ticks, renderEvery = 1): void   tick を 1 つずつ（renderEvery 個ごとに 1 回 描いて）進める。描き直しの数えかたを壁の時計に左右されなくする
 *   visAt(x, y, z): number                  その点（y = 面の高さ。上を向いた面の上）に 日・月の光がとどく割合 0..1（影の地図の答え。動く物の地図も入る）
 *   rayBlocked(x, y, z): boolean            CPU で ブロック単位に 光（太陽か月）へ 1 本とばした答え（正解）
 *   shadeAt(x, y, z, { shadow? }): Shade    その点を 真上から 1 画素 本物の材料で描いた色（shadow を false にすると その 1 回だけ 影なし）
 *   shadeChar({ shadow? }): Shade           キャラの体の中心を ゲームのカメラで 1 画素 描いた色
 * ShadowStats = {
 *   enabled: boolean,
 *   redraws: { near: number; far: number; dynamic: number },      resetStats からの 地図の描き直しの数
 *   frame: { staticRedrawn: ('near'|'far')[]; draws: number; triangles: number; maxStaticPerFrame: number },  いまのコマ／resetStats からの最大
 *   light: { x; y; z; strength; body: 'sun'|'moon' },
 * }
 * Shade = { r; g; b; luma }   (0..1、画面に出る色。luma = 0.2126r + 0.7152g + 0.0722b)
 *
 * URL: 影の spec は `?nosave=1&shadow=1`（影オン）、ほかの spec は影オフ（CI の計画。`?shadow=0`）。
 * 付けないときの既定はオン（AC16「はじめはオン」）。
 */
export interface Shade { r: number; g: number; b: number; luma: number }

export async function openShadow(page: Page, query = '?nosave=1&shadow=1'): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
  });
}

/** 平らな草の床（y = 8、その上は空気）。足もとの面の高さは 9。地形に左右されない（#103） */
export async function flatGrass(page: Page, x0 = -4, z0 = -4, x1 = 28, z1 = 28): Promise<void> {
  await page.evaluate(([a, b, c, d]) => {
    const h = (window as any).__rikkun;
    h.world.fill(a, 8, b, c, 8, d, 'grass');
    h.world.fill(a, 9, b, c, 40, d, 'air');
  }, [x0, z0, x1, z1]);
}

/** ほかのチャンクの光の計算が落ちつくまで、tick を進める（ゲームに聞く。数の決め打ちをしない） */
export async function settleLight(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (let i = 0; i < 400 && h.world.lightPending() > 0; i++) h.step(1);
    h.step(2);
  });
}

/** 地図のカメラが 1 回描き直すまで待つ: 描いたコマを 2 つ進める */
export async function frames(page: Page, n = 2): Promise<void> {
  await page.evaluate(async (k) => {
    for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, n);
}

/** いまの光の向きの 反対（地面の上で 影がのびる向き）。単位ベクトル（水平） */
export async function shadowDir(page: Page): Promise<{ x: number; z: number; len: number; light: any }> {
  return page.evaluate(() => {
    const l = (window as any).__rikkun.shadow.stats().light;
    const n = Math.hypot(l.x, l.z);
    return { x: -l.x / n, z: -l.z / n, len: l.y > 0 ? n / l.y : Infinity, light: l };
  });
}
