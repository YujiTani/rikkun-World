import { expect, test, type Page } from '@playwright/test';
import { openStream } from './helpers/stream';

/**
 * MINE-1D【4 版】（issue #351。docs/design/MINE-1.md §4.7.2 の B の きまり 7・§4.9・§6.1 `hiroiScene`・受け入れ基準 D16）: ひろい ほらあなの 性能の くらべ〔数だけ〕。
 *
 *   `hiroiScene` で 部屋の 乱数 3 つ〔`hiroiTry(seed).size` が 大・中・小 の 部屋に なる 物を ここで えらぶ。試作は 61・41・21〕。
 *   どれも B の 部屋〔`plain` なし〕と くらべ用〔`plain: true` ＝ 同じ たまご・天井・出口・たいまつで 柱・こぶ・鉱石 なし〕を、それぞれ 新しい 世界で ほり、
 *   `stand`〔出口から 4 マス・北向き〕に 立って ふだんの 三人称の カメラ・ふだんの 設定で、コマを 30 ずつ すすめて
 *   メッシュの のこり 0・光の のこり 0・読みこみの 待ち 0・分けて 作る 途中の 仕事 なし が 3 回 つづいた あと、描画回数・三角形〔`renderStats()`〕と geometry〔`world.meshStats()`〕を 読む。
 *   合格: くらべ用より 描画回数 ＋LIMIT.drawCalls まで・三角形 ＋LIMIT.triangles まで・geometry ＋LIMIT.geometry まで。
 *   時間〔ms〕は 見ない〔#255〕。上限は この ファイルの `LIMIT` の 1 か所〔§4.9 の 数の 写し。かえる ときは 仕様と いっしょに。#311 の 対象 外〕。
 *
 * 窓口: mine.hiroiTry・mine.hiroiScene・world.teleport／settle／stream／meshStats／meshJob／lightPending・player.set・renderStats・step。
 * 赤の 確かめ: 1D の 前は `mine.hiroiScene` が なく「窓口が ない」で 落ちる。手元では 回さない〔CI で 見る〕。
 */
test.describe.configure({ timeout: 600_000 });

/** §4.9 の 上限〔くらべ用との 差〕 */
const LIMIT = { drawCalls: 4, triangles: 0.25, geometry: 0.15 } as const;
/** 部屋の 乱数の 候補〔§4.7.2 の B の きまり 4 と 同じ 200 こ〕 */
const CANDIDATES = Array.from({ length: 200 }, (_, i) => i * 13 + 1);
const STEP = 30;
/** 落ちつくまでの 上限〔コマ送りの 回数。時間では ない〕 */
const MAX_ROUNDS = 400;

interface Count {
  drawCalls: number;
  triangles: number;
  geometryBytes: number;
  size: { x: number; z: number };
  caveId: string;
}

async function needHooks(page: Page): Promise<void> {
  const have = await page.evaluate(() => ['hiroiTry', 'hiroiScene'].filter((n) => typeof (window as any).__rikkun?.mine?.[n] === 'function'));
  expect(have, '__rikkun.mine の 窓口〔1D〕').toEqual(['hiroiTry', 'hiroiScene']);
}

/** 大・中・小の 部屋の 乱数を えらぶ〔置けた 部屋の 横 × たての 順〕 */
async function pickSeeds(page: Page): Promise<number[]> {
  const rows = await page.evaluate((seeds) => {
    const h = (window as any).__rikkun;
    return seeds.map((s: number) => {
      const t = h.mine.hiroiTry(s) as { size: { x: number; z: number }; plan: unknown | null };
      return { seed: s, area: t.size.x * t.size.z, placed: t.plan !== null };
    });
  }, CANDIDATES);
  const ok = rows.filter((r) => r.placed).sort((a, b) => a.area - b.area || a.seed - b.seed);
  expect(ok.length, '置けた 部屋').toBeGreaterThanOrEqual(3);
  return [ok[ok.length - 1]!.seed, ok[Math.floor(ok.length / 2)]!.seed, ok[0]!.seed];
}

/** 新しい 世界で 場面を ほり、`stand` に 立って 落ちつくまで 待ち、数を 読む */
async function measure(page: Page, seed: number, plain: boolean): Promise<Count> {
  await openStream(page, '?nosave=1');
  await needHooks(page);
  const scene = await page.evaluate(
    ({ seed, plain }) => {
      const h = (window as any).__rikkun;
      h.lock.simulate(true);
      h.input.releaseAll();
      h.yokai.clear();
      return h.mine.hiroiScene({ seed, plain }) as { caveId: string; size: { x: number; z: number }; stand: { x: number; y: number; z: number; facing: string } };
    },
    { seed, plain },
  );
  expect(scene.stand.facing, '北向き').toBe('n');
  await page.evaluate(({ x, z }) => (window as any).__rikkun.world.teleport(x, z), { x: scene.stand.x, z: scene.stand.z });
  const s = await page.evaluate(() => (window as any).__rikkun.world.settle({ full: true }));
  expect(s.ready, `settle: ready に ならない ${JSON.stringify(s)}`).toBe(true);
  await page.evaluate((st) => {
    const h = (window as any).__rikkun;
    h.player.set({ position: { x: st.x + 0.5, y: st.y, z: st.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  }, scene.stand);
  // 落ちつくまで 30 コマずつ。3 回 つづけて のこり 0
  let calm = 0;
  for (let n = 0; n < MAX_ROUNDS && calm < 3; n++) {
    const rest = await page.evaluate((k) => {
      const h = (window as any).__rikkun;
      h.step(k);
      const st = h.world.stream();
      return h.world.meshStats().pending + h.world.lightPending() + st.columns.loading + st.queued + (h.world.meshJob().active ? 1 : 0);
    }, STEP);
    calm = rest === 0 ? calm + 1 : 0;
  }
  expect(calm, `seed ${seed}${plain ? '〔くらべ用〕' : ''}: のこりが 0 に ならない`).toBeGreaterThanOrEqual(3);
  const r = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.step(1);
    const rs = h.renderStats();
    return { drawCalls: rs.drawCalls as number, triangles: rs.triangles as number, geometryBytes: h.world.meshStats().geometryBytes as number };
  });
  return { ...r, size: scene.size, caveId: scene.caveId };
}

test('D16: ひろい ほらあなの 描画回数・三角形・geometry が くらべ用〔柱・こぶ・鉱石 なしの 同じ 部屋〕から 上限の 中〔大・中・小の 部屋〕', async ({ page }) => {
  await openStream(page, '?nosave=1');
  await needHooks(page);
  const seeds = await pickSeeds(page);
  expect(new Set(seeds).size, '部屋の 乱数 3 つ').toBe(3);
  for (const seed of seeds) {
    const b = await measure(page, seed, false);
    const p = await measure(page, seed, true);
    const tag = `部屋の 乱数 ${seed}〔${b.size.x}×${b.size.z}〕`;
    expect(p.size, `${tag}: くらべ用も 同じ 大きさ`).toEqual(b.size);
    expect(b.drawCalls, `${tag}: 描画回数 ${b.drawCalls}（くらべ用 ${p.drawCalls}）`).toBeLessThanOrEqual(p.drawCalls + LIMIT.drawCalls);
    expect(b.triangles, `${tag}: 三角形 ${b.triangles}（くらべ用 ${p.triangles}）`).toBeLessThanOrEqual(p.triangles * (1 + LIMIT.triangles));
    expect(b.geometryBytes, `${tag}: geometry ${b.geometryBytes}（くらべ用 ${p.geometryBytes}）`).toBeLessThanOrEqual(p.geometryBytes * (1 + LIMIT.geometry));
  }
});
