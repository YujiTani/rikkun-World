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

/**
 * TOWN-1 1.3: 街の ふちに 近い 平らな 立ち場所（中）と、同じ 線の 上で わかない はんい（safe）の 外 4 マスの 場所を ゲームに 聞いて さがす。
 * 立ち場所: 街の はんいの 4 つの ふちの どれかで、ふちから 3 マス 中。そこまでの 線の 上（ふち 〜 立ち場所）が 地面の 高さ ＝ groundY で 上 2 マスが 空気（かべ・どうろうを さける）。
 * 返す yokai は 外 4 マス（ふちを 1 つ こえた 所が 1 マス目）の 地面の 上。決め打ちの 座標は 使わない。
 */
export interface EdgeSpot {
  side: 'w' | 'e' | 'n' | 's';
  player: P3;
  yokai: P3;
  /** 外へ 向かう 向き（x か z の どちらか ±1） */
  out: XZ;
}
export async function findEdgeSpot(page: Page, info: TownInfo): Promise<EdgeSpot> {
  const midX = Math.floor((info.bounds.min.x + info.bounds.max.x) / 2);
  const midZ = Math.floor((info.bounds.min.z + info.bounds.max.z) / 2);
  const sides = [
    { side: 'w' as const, out: { x: -1, z: 0 }, edge: info.bounds.min.x, safeEdge: info.safe.min.x, mid: midZ },
    { side: 'e' as const, out: { x: 1, z: 0 }, edge: info.bounds.max.x, safeEdge: info.safe.max.x, mid: midZ },
    { side: 'n' as const, out: { x: 0, z: -1 }, edge: info.bounds.min.z, safeEdge: info.safe.min.z, mid: midX },
    { side: 's' as const, out: { x: 0, z: 1 }, edge: info.bounds.max.z, safeEdge: info.safe.max.z, mid: midX },
  ];
  for (const s of sides) {
    const alongX = s.out.x === 0; // 北・南の ふちは x に そって ならぶ
    const cx = alongX ? s.mid : s.edge;
    const cz = alongX ? s.edge : s.mid;
    await goTo(page, cx, cz);
    const found = await page.evaluate(
      ({ s, alongX, groundY }) => {
        const h = (window as any).__rikkun;
        const cell = (along: number, depth: number): { x: number; z: number } => {
          // depth ＝ ふちから 中へ 何 マス（0 ＝ ふちの マス）
          const inward = -(s.out.x + s.out.z);
          const edgeC = s.edge + inward * depth;
          return alongX ? { x: along, z: edgeC } : { x: edgeC, z: along };
        };
        const clear = (c: { x: number; z: number }): boolean =>
          h.world.groundHeight(c.x, c.z) === groundY && h.world.getBlock(c.x, groundY + 1, c.z) === 'air' && h.world.getBlock(c.x, groundY + 2, c.z) === 'air';
        for (let off = 0; off <= 36; off += 4) {
          for (const sign of [1, -1]) {
            const along = s.mid + sign * off;
            if ([0, 1, 2, 3].every((d) => clear(cell(along, d)))) {
              const p = cell(along, 3);
              const outDepth = Math.abs(s.safeEdge - s.edge) + 4;
              const o = cell(along, -outDepth); // ふちの マスから safe の ふち（margin マス）と 外 4 マス目
              // 外が 坂・木・石で 見通しや 道が ふさがれる 所は とばす（妖怪は まっすぐ 歩くので、人に 気づけない・ひっかかる。SIGHT-1 #446）。道の はばは 左右 1 マス
              let flat = true;
              for (let k = -1; k <= 1; k++) {
                for (let d = -outDepth; d <= 3; d++) {
                  const c = cell(along + k, d);
                  const g = h.world.groundHeight(c.x, c.z) as number;
                  if (g > groundY + 1) flat = false;
                  for (let dy = 1; dy <= 3; dy++) if (h.world.getBlock(c.x, g + dy, c.z) !== 'air') flat = false;
                }
              }
              if (!flat) continue;
              return { p, o };
            }
          }
        }
        return null;
      },
      { s, alongX, groundY: info.groundY },
    );
    if (!found) continue;
    // 外 4 マス目の 地面（読みこみ済みに する）
    await goTo(page, found.o.x, found.o.z);
    const gy = await page.evaluate(([x, z]) => (window as any).__rikkun.world.groundHeight(x, z) as number, [found.o.x, found.o.z] as const);
    return {
      side: s.side,
      player: { x: found.p.x + 0.5, y: info.groundY + 1, z: found.p.z + 0.5 },
      yokai: { x: found.o.x + 0.5, y: gy + 1, z: found.o.z + 0.5 },
      out: s.out,
    };
  }
  throw new Error('街の ふちに 平らな 立ち場所が 見つからない（TOWN-1 1.3 の テスト）');
}
