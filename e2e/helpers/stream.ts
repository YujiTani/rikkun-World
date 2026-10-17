import { expect, type Page } from '@playwright/test';
import { buildBlocks } from '../../src/world/gen/chunk';

/**
 * VOX-D（docs/tickets/VOX-D.md）の E2E が くり返し使う準備。
 * 角度・座標・個数を決め打ちせず、ゲーム（window.__rikkun.world）に聞く。進めるのは step の数で、時間（ms）では合否を決めない（#130）。
 *
 * 画面の決まり（タスク票に セレクタが無いので、ここで決める。開発はこれに合わせる）:
 *   じゅんびちゅうの ことば  `.prep-text`   （起動は `.po-button` の中・もどるときは `.prep-card` の中）
 *   ブロック 5 こ           `.prep-block`  できた物は `data-done="true"`、まだの物は `data-done="false"`
 *   遠くへもどるカード       `.prep-card`   （出ていないときは DOM に無いか hidden）
 */
export const PREP = {
  text: '.prep-text',
  block: '.prep-block',
  done: '.prep-block[data-done="true"]',
  card: '.prep-card',
  button: '.play-overlay .po-button',
} as const;

export type StreamInfo = {
  ready: boolean;
  phase: 'boot' | 'play' | 'wait';
  progress: number;
  center: { cx: number; cz: number };
  columns: { loading: number; generated: number; lit: number; meshed: number };
  queued: number;
  saving: boolean;
  unloadPending: number;
  totals: { generated: number; readFromSave: number; unloaded: number; savedBeforeUnload: number };
};

/** 開く: `__rikkun.ready`（起動の ready のあとで true）を待ち、実績の音を消し、一時停止する */
export async function openStream(page: Page, query = '?nosave=1'): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.achievements.mute(true);
    h.pause();
    h.settings.set('yokaiAutoSpawn', false);
  });
}

/** 起動中を見る用: `__rikkun.world` が置かれるまで待つ（`__rikkun.ready` は待たない）。一時停止する */
export async function openBooting(page: Page, query: string): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => (window.__rikkun as any)?.world?.stream !== undefined, undefined, { timeout: 15_000 });
  await page.evaluate(() => {
    (window.__rikkun! as any).pause();
  });
}

/** `world.settle()` で そろうまで進め、そろわなかったら（maxFrames）落ちる。終わりの stream() を返す */
export async function settleWorld(page: Page, full = false): Promise<StreamInfo> {
  const s = await page.evaluate((full) => (window.__rikkun! as any).world.settle({ full }), full);
  expect(s.ready, `settle: ready にならなかった ${JSON.stringify(s)}`).toBe(true);
  expect(s.saving, 'settle: 保存が終わらない').toBe(false);
  expect(s.unloadPending, 'settle: 捨てる待ちが 0 にならない').toBe(0);
  if (full) expect(s.queued, 'settle(full): 仕事が のこっている').toBe(0);
  return s as StreamInfo;
}

export interface Land {
  cx: number;
  cz: number;
  /** teleport に わたす x・z（列の まんなかのマス） */
  x: number;
  z: number;
}

/**
 * 行き先 P（基準 8）: (−5000, −5000) から うずまき順に `terrainAt` で さがした 最初の
 * 「陸（`sea === false`）・まわり 3×3 の列の高さの差 1 以下」の列。seed ごとに決まる。
 */
export async function findLand(page: Page, near = { x: -5000, z: -5000 }): Promise<Land> {
  // 条件に合う列を うずまき順に 順に 出してもらう（木のチェックは Node 側で 生成の関数に 聞く）
  const seed: number = await page.evaluate(() => (window.__rikkun! as any).world.seed());
  const cands = await page.evaluate((near) => {
    const w = (window.__rikkun! as any).world;
    const hOf = (cx: number, cz: number) => w.terrainAt(cx * 16 + 8, cz * 16 + 8);
    const c0x = Math.floor(near.x / 16);
    const c0z = Math.floor(near.z / 16);
    const ok = (cx: number, cz: number) => {
      if (hOf(cx, cz).sea) return false;
      let lo = Infinity;
      let hi = -Infinity;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const t = hOf(cx + dx, cz + dz);
          lo = Math.min(lo, t.h);
          hi = Math.max(hi, t.h);
        }
      return hi - lo <= 1;
    };
    const out: { cx: number; cz: number; h: number }[] = [];
    for (let ring = 0; ring < 400 && out.length < 40; ring++) {
      for (let dz = -ring; dz <= ring; dz++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          if (ok(c0x + dx, c0z + dz)) out.push({ cx: c0x + dx, cz: c0z + dz, h: hOf(c0x + dx, c0z + dz).h });
        }
    }
    return out;
  }, near);
  // 列のまんなかのマス (8, 8) の上 4 マスが 空気（木・葉・水が体に入らない）で、足もとが 固い列
  for (const c of cands) {
    const blocks = buildBlocks(seed, c.cx, c.cz).blocks;
    const at = (y: number) => blocks[(y * 16 + 8) * 16 + 8]!;
    let free = at(c.h) !== 0;
    for (let y = c.h + 1; y <= c.h + 4; y++) if (at(y) !== 0) free = false;
    if (free) return { cx: c.cx, cz: c.cz, x: c.cx * 16 + 8.5, z: c.cz * 16 + 8.5 };
  }
  expect(cands.length, 'P: 陸で平らで 木の無い列が見つからない（デザインへ）').toBe(-1);
  throw new Error('unreachable');
}

/**
 * スタートの足もとに 石の床と空気の広場（±half）を敷く。島や地形が どう変わっても 同じ場所で 同じ結果になるように。
 * 返す g は 床のブロックの y（足もとは g + 1）、sx・sz は スタートのマス。
 */
export async function flatNearStart(page: Page, half = 14): Promise<{ sx: number; sz: number; g: number }> {
  return page.evaluate((half) => {
    const h = (window.__rikkun! as any);
    const sp = h.world.spawn();
    const sx = Math.floor(sp.x);
    const sz = Math.floor(sp.z);
    const g: number = h.world.groundHeight(sx, sz);
    h.world.fill(sx - half, g, sz - half, sx + half, g, sz + half, 'stone');
    h.world.fill(sx - half, g + 1, sz - half, sx + half, g + 14, sz + half, 'air');
    h.player.set({ position: { x: sx + 0.5, y: g + 1, z: sz + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    h.step(1);
    return { sx, sz, g };
  }, half);
}

/** 光とメッシュの 待ちが 0 になるまで step（最大 max） */
export async function drainRebuilds(page: Page, max = 3000): Promise<number> {
  return page.evaluate((max) => {
    const h = (window.__rikkun! as any);
    let n = 0;
    while ((h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < max) {
      h.step(5);
      n += 5;
    }
    h.step(2);
    return n;
  }, max);
}
