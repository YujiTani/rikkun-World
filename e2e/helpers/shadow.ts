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
 * URL: 影の spec は `?nosave=1&shadow=1`（影オン）、ほかの spec は URL に何も付けない（E2E のサーバーが `VITE_SHADOW_DEFAULT=off` で影を作らない。playwright.config.ts）。`?shadow=0` も同じく作らない。
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

/**
 * 平らな草の床。床の高さ FLOOR_Y は 世界に聞いて決める（その範囲の いちばん高い地面。VOX-B で 島の y=8 では なくなった）。
 * 足もとの面の高さは FLOOR_Y + 1。床の下は 石でうめ、その上は 空まで 空気にする（穴の底にならない）。
 */
export let FLOOR_Y = 8;
export async function flatGrass(page: Page, x0 = -4, z0 = -4, x1 = 28, z1 = 28): Promise<void> {
  FLOOR_Y = await page.evaluate(([a, b, c, d]) => {
    const h = (window as any).__rikkun;
    let lo = Infinity;
    let hi = 0;
    for (let x = Math.max(0, a); x <= Math.min(h.world.size().x - 1, c); x += 2) {
      for (let z = Math.max(0, b); z <= Math.min(h.world.size().z - 1, d); z += 2) {
        const g = h.world.groundHeight(x, z) as number;
        lo = Math.min(lo, g);
        hi = Math.max(hi, g);
      }
    }
    const y = hi;
    h.world.fill(a, Math.max(1, lo - 1), b, c, y - 1, d, 'stone');
    h.world.fill(a, y, b, c, y, d, 'grass');
    h.world.fill(a, y + 1, b, c, h.world.size().y - 1, d, 'air');
    return y;
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
