import { expect, type Page } from '@playwright/test';
import { installFakePads } from './duoUi';
import { settleWorld } from './stream';

/**
 * TOWN-1 区切り 1B-1（docs/design/TOWN-1.md §6.1・TOWN-1-place.md）の E2E が 使う 部品。実装の 前に 書いた。
 * 窓口（仕様 §6.1）: `window.__rikkun.town.info()`・`town.inSafe(x, y, z)`・`town.inTown(x, y, z)`・`town.smoke()`。まだ 無ければ「…が まだ ない」で 落ちる（赤）。
 * 数・座標は 決め打ちせず ゲームに 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 */

export interface P3 {
  x: number;
  y: number;
  z: number;
}
export interface XZ {
  x: number;
  z: number;
}
/** town.info() の うち 1B-1 の テストが 読む 所（仕様 §6.1。min・max は x・z を もつ） */
export interface TownInfo {
  center: P3;
  facing: 'n' | 'e' | 's' | 'w';
  bounds: { min: XZ; max: XZ };
  safe: { min: XZ; max: XZ };
  groundY: number;
  terrace: { min: XZ; max: XZ; y: number };
  plaza: P3;
  fountain: { min: XZ; max: XZ };
  gate: { pos: P3; top: P3 };
  lots: { min: XZ; max: XZ }[];
  canal: {
    bottomY: number;
    water: XZ[];
    walk: XZ[];
    stairs: { bottom: P3; top: P3; light: P3; banner: P3 }[];
    bridges: { min: XZ; max: XZ }[];
  };
  lights: { kind: string; pos: P3 }[];
}

/**
 * 街を 作らない 世界を 開く ための 約束（仕様 §6.1「街を 作らない 世界を 開く 方法」。AC29 の くらべる 相手）。
 * URL に `town=off` を つけると 街を 作らない（同じ 広さを 平らな 草地に）。置く 所は developer（まだ 無い）。
 */
export const TOWN_OFF = 'town=off';

/** 窓口 town[name](...args) を 呼ぶ。まだ 無ければ 分かりやすく 落とす（実装の 前の 赤） */
export async function townCall<T>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  const r = await page.evaluate(
    ({ name, args }) => {
      const t = (window as any).__rikkun.town;
      const f = t?.[name];
      if (typeof f !== 'function') return { missing: true as const };
      return { value: f.apply(t, args) };
    },
    { name, args },
  );
  expect('missing' in r ? name : null, `window.__rikkun.town.${name}（TOWN-1 1B-1 の テスト用 フック。TOWN-1.md §6.1）が まだ ない`).toBeNull();
  return (r as { value: T }).value;
}

export const townInfo = (page: Page): Promise<TownInfo> => townCall<TownInfo>(page, 'info');
export const inSafe = (page: Page, p: P3): Promise<boolean> => townCall<boolean>(page, 'inSafe', p.x, p.y, p.z);

/**
 * ゲームを 開いて 一時停止・夜でない・妖怪や 動物の 自動の 湧きなし にする（街の 位置は スタート地点の そば）。duo ＝ true なら 2 人目も 参加させる。
 * query は `?nosave=1` の あとに つなげる 物（例 '&seed=7'）。
 */
export async function openTown(page: Page, opts: { duo?: boolean; extra?: string } = {}): Promise<void> {
  await page.goto(`/?nosave=1${opts.duo ? '&duo=dev' : ''}${opts.extra ?? ''}`);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.settings.set('animalAutoSpawn', false);
    h.yokai.clear();
    h.animals.clear();
    h.time.set(20000);
  });
  if (opts.duo) {
    await installFakePads(page, 2);
    expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
    await page.evaluate(() => (window as any).__rikkun.step(30));
  }
}

/** (x, z) の 列へ 行って 輪を そろえ、光と メッシュが おちつくまで 進める。立つ 場所は その 列の 地面（teleport の きまり） */
export async function goTo(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(([x, z]) => (window as any).__rikkun.world.teleport(x, z), [x, z] as const);
  await settleWorld(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    h.step(2);
  });
}

/** 1P を 置く（止まって いる 状態で、向き yaw〔0 ＝ 北 −z・90 ＝ 東 +x〕） */
export const place1P = (page: Page, pos: P3, yaw = 0): Promise<void> =>
  page.evaluate(
    ({ pos, yaw }) => {
      const h = (window as any).__rikkun;
      h.input.releaseAll();
      h.player.set({ position: pos, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
      h.step(2);
    },
    { pos, yaw },
  );

/** 2P を 置く */
export const place2P = (page: Page, pos: P3): Promise<void> =>
  page.evaluate((pos) => {
    const h = (window as any).__rikkun;
    h.duo.place(2, pos);
    h.step(2);
  }, pos);

/** 4 方向の なかま どうしの 向き（yaw 度。0 ＝ 北 −z・90 ＝ 東 +x・180 ＝ 南・270 ＝ 西） */
export const yawOf = (dx: number, dz: number): number => (Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 90 : 270) : dz > 0 ? 180 : 0);
