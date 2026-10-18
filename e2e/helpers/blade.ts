import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { standOnGround } from './aim';
import { waitSpritesReady } from './char';

/**
 * 刀の 軌跡・刃の色の E2E 用の 道具（CHAR-4 仕様書 §4・§8）。
 * 数は 決め打ちせず ゲーム（window.__rikkun）に 聞く: 軌跡は `blade.trail()`、体は `player.get()`、
 * わざの 向きは `blade.state().move.dirDeg`、刃の色は `player.doll().sprite.bladeColors`、設定は `settings`。
 * 刃先の データは `art/char-sheets/blade_path.json`（仕様書 §4.3。ゲームに 組みこまれた 写しと 同じ 値のはず）。
 */

export type BladeTechName = 'thrust' | 'kesa' | 'kiriage';
export type Vec3 = { x: number; y: number; z: number };

export interface TrailSnap {
  visible: boolean;
  item: string | null;
  tech: string | null;
  points: { step: number; tau: number; age: number; tip: Vec3; base: Vec3 }[];
  tail: number | null;
  head: number | null;
  columns: { q: number; age: number; tip: Vec3; inner: Vec3 }[];
  strips: { age: number; fade: number }[];
  segments: number;
  triangles: number;
  objects: number;
  color: number;
  glow: number;
  stars: Vec3[];
}

/** 1 ステップぶんの きろく */
export interface Snap {
  /** 刀の frame（わざを 始めた ステップ = 1。わざで ないとき 0） */
  f: number;
  tech: string | null;
  /** わざの 向き u（わざの あいだだけ） */
  dir: number | null;
  /** その ステップの おわりの 体の 位置 */
  pos: Vec3;
  trail: TrailSnap;
}

export const BASE_SET = ['idle', 'walk', 'run', 'jump'];
export const KATANA_SET = ['katana_thrust', 'katana_kesa', 'katana_kiriage', 'katana_walk_chudan', 'katana_walk_jodan', 'katana_walk_gedan'];

/** 仕様書 §4.5 の 色の 表（数は 0xRRGGBB） */
export const BLADE_TABLE = {
  bokuto: { color: 0x9c6b3a, glow: 0xe8c08a, blade: 0xb98b54, bladeShine: 0xe0bc86, style: 'plain' },
  katana: { color: 0xe8f1fa, glow: 0xffffff, blade: 0xc8cdd8, bladeShine: 0xffffff, style: 'plain' },
  crystal_katana: { color: 0x7fdcff, glow: 0xe6faff, blade: 0x6fcdf5, bladeShine: 0xe6faff, style: 'star' },
  naginata: { color: 0xcfe8ff, glow: 0xffffff, blade: 0xb8cce0, bladeShine: 0xeef6ff, style: 'long' },
} as const;

const PATH = JSON.parse(readFileSync('art/char-sheets/blade_path.json', 'utf8')) as Record<
  string,
  { perTick: { base: [number, number, number]; tip: [number, number, number] }[] }
>;
const PATH_KEY: Record<BladeTechName, string> = { thrust: 'katana_thrust', kesa: 'katana_kesa', kiriage: 'katana_kiriage' };

/** 書く時間（絵の時 τ。仕様書 §4.2） */
export const DRAW_TAU: Record<BladeTechName, [number, number]> = { thrust: [2, 6], kesa: [28, 34], kiriage: [19, 22] };

export const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** データの 点（右・上・前）を 世界の 位置に する。k = 板の 大きさ ÷ 絵の span = 1.8 ÷ modelH、u = わざの 向き（度） */
export function worldPoint(tech: BladeTechName, tau: number, which: 'tip' | 'base', body: Vec3, dirDeg: number, k: number): Vec3 {
  const rows = PATH[PATH_KEY[tech]]!.perTick;
  const lo = Math.floor(tau);
  const t = tau - lo;
  const at = (i: number) => rows[Math.max(0, Math.min(rows.length - 1, i))]![which];
  // 整数の τ は データそのまま。ほかは 4 点を 通る なめらかな 曲線（見本 render.py の cr と 同じ 形）
  const p = (c: number): number => {
    if (t === 0) return at(lo)[c]!;
    const p0 = at(lo - 1)[c]!, p1 = at(lo)[c]!, p2 = at(lo + 1)[c]!, p3 = at(lo + 2)[c]!;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
  const r = p(0), up = p(1), fw = p(2);
  const u = (dirDeg * Math.PI) / 180;
  return {
    x: body.x + k * (r * Math.cos(u) + fw * Math.sin(u)),
    y: body.y + k * up,
    z: body.z + k * (r * Math.sin(u) - fw * Math.cos(u)),
  };
}

export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** 年れいから 消えぐあい（仕様書 §4.4） */
export const fadeOfAge = (age: number): number => (age < 2.25 ? 1 : age < 4.5 ? 0.75 : age < 6.75 ? 0.5 : age < 9 ? 0.25 : 0);

/** ゲームを 開く。ひらけた 平らな 地面に 立つ（北向き yaw 0）。刀の 絵は まだ 読まない */
export async function openBladeWorld(page: Page, opts: { half?: number } = {}): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.waitForFunction(
    (ns) => {
      const st = (window.__rikkun! as any).player.doll().sprite.status;
      return ns.every((n: string) => st?.[n] === 'ready');
    },
    BASE_SET,
    { timeout: 0 },
  );
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.achievements.mute(true);
    h.lock.simulate(true);
    h.pause();
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
    h.time.set(0);
    h.inventory.clear();
  });
  await standOnGround(page, 20.5, 20.5, { yaw: 0, pitch: 0, half: opts.half });
}

/** ホットバーに 入れて 0 番を 持つ（ステップを 1 進める） */
export async function holdItems(page: Page, items: { item: string; count?: number }[], select = 0): Promise<void> {
  await page.evaluate(
    ({ items, select }) => {
      const h = window.__rikkun! as any;
      items.forEach((it, i) => h.inventory.setSlot(i, { item: it.item, count: it.count ?? 1 }));
      h.inventory.select(select);
      h.step(1);
    },
    { items, select },
  );
}

/** 絵の 読みこみを 待つ（描画を止めて 1 ステップずつ 進める） */
export async function waitReady(page: Page, names: string[]): Promise<void> {
  await waitSpritesReady(page, names);
}

/** 窓口が あるか（実装の 前は ここで 落ちる） */
export async function expectTrailHook(page: Page): Promise<void> {
  const has = await page.evaluate(() => typeof (window.__rikkun! as any).blade.trail === 'function');
  expect(has, 'window.__rikkun.blade.trail() が まだ ない（仕様書 §8）').toBe(true);
}

/** かまえを R で まわして 目的の かまえに する（切りかえ 8F が おわるまで 待つ） */
export async function toStance(page: Page, want: 'chudan' | 'jodan' | 'gedan'): Promise<void> {
  const st = await page.evaluate((want) => {
    const h = window.__rikkun! as any;
    for (let i = 0; i < 4 && h.blade.state().stance !== want; i++) {
      h.input.press('stanceNext');
      h.step(1);
      h.input.release('stanceNext');
      h.step(10);
    }
    return { stance: h.blade.state().stance as string, phase: h.blade.state().phase as string };
  }, want);
  expect(st).toEqual({ stance: want, phase: 'idle' });
}

/** ページの 中で 使う きろく関数の 文字（evaluate に 埋める） */
const SNAP_FN = `(() => {
  const h = window.__rikkun;
  const st = h.blade.state();
  const p = h.player.get().position;
  return { f: st.frame, tech: st.tech, dir: st.move ? st.move.dirDeg : null, pos: { x: p.x, y: p.y, z: p.z }, trail: JSON.parse(JSON.stringify(h.blade.trail())) };
})()`;

/**
 * クリックして わざを 始め（F1）、F(n) まで 1 ステップずつ きろくする。
 * 戻りの 配列の i 番目 = F(i + 1) の ステップの おわり。
 */
export async function fire(page: Page, n: number): Promise<Snap[]> {
  return page.evaluate(
    ({ n, fn }) => {
      const h = window.__rikkun! as any;
      const snap = () => (0, eval)(fn);
      const out: any[] = [];
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      out.push(snap());
      for (let i = 1; i < n; i++) {
        h.step(1);
        out.push(snap());
      }
      return out;
    },
    { n, fn: SNAP_FN },
  ) as Promise<Snap[]>;
}

/** 続けて n ステップ 進めて きろくする */
export async function advance(page: Page, n: number): Promise<Snap[]> {
  return page.evaluate(
    ({ n, fn }) => {
      const h = window.__rikkun! as any;
      const out: any[] = [];
      for (let i = 0; i < n; i++) {
        h.step(1);
        out.push((0, eval)(fn));
      }
      return out;
    },
    { n, fn: SNAP_FN },
  ) as Promise<Snap[]>;
}

/** k = 1.8 ÷ modelH（atlas.json から） */
export async function bladeScale(page: Page): Promise<number> {
  const modelH = await page.evaluate(async () => (await (await fetch('./models/char/atlas.json')).json()).modelH as number);
  return 1.8 / modelH;
}

export const bladeColors = (page: Page) =>
  page.evaluate(() => (window.__rikkun! as any).player.doll().sprite.bladeColors as { body: number; shine: number } | null | undefined);

export const settingRow = (page: Page, item: string) =>
  page.evaluate((item) => (window.__rikkun! as any).settings.get('bladeTrail')[item] as Record<string, unknown>, item);

/**
 * きろくの 各点が 「その 点を 書いた ステップの おわりの 体の 位置 ＋ k × データ」と 合うか。
 * 戻りは いちばん 大きい 差。`tech` の 書く時間に ある 点だけを 見る。
 */
export function maxPointError(rec: Snap[], tech: BladeTechName, dirDeg: number, k: number): { err: number; n: number } {
  const posByF = new Map<number, Vec3>();
  for (const s of rec) if (s.f > 0) posByF.set(s.f, s.pos);
  let err = 0;
  let n = 0;
  for (const s of rec) {
    for (const p of s.trail.points) {
      const body = posByF.get(p.step);
      if (!body) throw new Error(`点の step ${p.step} の 体の 位置が きろくに ない`);
      err = Math.max(err, dist(p.tip, worldPoint(tech, p.tau, 'tip', body, dirDeg, k)), dist(p.base, worldPoint(tech, p.tau, 'base', body, dirDeg, k)));
      n++;
    }
  }
  return { err, n };
}

// ───────────────────────────────────────────────────────────────
// WEAPON-4（射程・突き・大けさぎりの とびこみ・その場の切り上げ）の 道具
// ───────────────────────────────────────────────────────────────

/** 立つ場所の 北向き（yaw 0 = −z）。前 d の 点は (x, z − d) */
export const ORIGIN = { x: 20.5, z: 20.5 } as const;

export interface TechEvent {
  type: string;
  tech?: string;
  yokaiId?: number;
  damage?: number;
  knock?: number;
  up?: number;
}

/** 1 ステップぶんの きろく（F = 刀の frame。わざの 外は 0） */
export interface TechStep {
  f: number;
  tech: string | null;
  pos: Vec3;
  /** この ステップの おわりに `blade.shape()` が あるか（当たりの F だけ true） */
  shape: boolean;
  /** このステップで 新しく 出た 出来事（techStart・techHit・techMiss など） */
  events: TechEvent[];
}

/** 立つ。ひらけた 平らな 地面（床 floorY）。前 = 北。壁・がけを 作る 前の かたづけも かねる */
export async function stage(page: Page, o: { x?: number; z?: number; floorY?: number } = {}): Promise<{ floorY: number }> {
  const x = o.x ?? ORIGIN.x;
  const z = o.z ?? ORIGIN.z;
  const floorY = o.floorY ?? (await page.evaluate(({ x, z }) => (window.__rikkun! as any).world.groundHeight(Math.floor(x), Math.floor(z)), { x, z }));
  // 前の テストで 掘った 穴・水を 元に もどす（床の 下 6 段まで 石）
  await page.evaluate(
    ({ x, z, fy }) => {
      const h = window.__rikkun! as any;
      h.world.fill(Math.floor(x) - 12, fy - 6, Math.floor(z) - 12, Math.floor(x) + 12, fy, Math.floor(z) + 12, 'stone');
    },
    { x, z, fy: floorY },
  );
  const r = await standOnGround(page, x, z, { floorY, yaw: 0, pitch: 0 });
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.yokai.clear();
    h.blade.events(); // peek: 空には ならない（数は 差で 見る）
    h.step(1);
  });
  return r;
}

/** 前 d・横 side の 地面に 妖怪を 置く（止める = ai:false）。体力は 多め。戻りは id */
export async function spawnAhead(
  page: Page,
  kind: 'karakasa' | 'chochin' | 'nurikabe' | 'rokurokubi',
  d: number,
  o: { side?: number; up?: number; hp?: number } = {},
): Promise<number> {
  return page.evaluate(
    ({ kind, d, o }) => {
      const h = window.__rikkun! as any;
      const p = h.player.get().position;
      const id = h.yokai.spawn(kind, p.x + (o.side ?? 0), p.y + (o.up ?? 0), p.z - d, { ai: false });
      h.yokai.setHp(id, o.hp ?? 400);
      h.yokai.events();
      return id as number;
    },
    { kind, d, o },
  );
}

/**
 * 左クリックで わざを 始め（F1）、F(n) まで 1 ステップずつ きろくする。i 番目 = F(i + 1) の おわり。
 * hold = true なら 押したまま（おしつづけ）。false なら F1 の あとで はなす。
 */
export async function runTech(page: Page, n: number, o: { hold?: boolean } = {}): Promise<TechStep[]> {
  return page.evaluate(
    ({ n, hold }) => {
      const h = window.__rikkun! as any;
      const out: any[] = [];
      let seen = h.blade.events().length;
      const snap = () => {
        const st = h.blade.state();
        const p = h.player.get().position;
        const ev = h.blade.events();
        const fresh = ev.slice(seen);
        seen = ev.length;
        out.push({
          f: st.frame,
          tech: st.tech,
          pos: { x: p.x, y: p.y, z: p.z },
          shape: h.blade.shape() !== null,
          events: fresh.map((e: any) => ({ type: e.type, tech: e.tech, yokaiId: e.yokaiId, damage: e.damage, knock: e.knock, up: e.up })),
        });
      };
      h.input.press('primary');
      h.step(1);
      if (!hold) h.input.release('primary');
      snap();
      for (let i = 1; i < n; i++) {
        h.step(1);
        snap();
      }
      if (hold) h.input.release('primary');
      return out;
    },
    { n, hold: !!o.hold },
  ) as Promise<TechStep[]>;
}

/** わざを おわらせて 落ちつくまで 進める（おしつづけは はなしてから） */
export async function settle(page: Page, n = 130): Promise<void> {
  await page.evaluate((n) => {
    const h = window.__rikkun! as any;
    h.input.releaseAll();
    h.step(n);
  }, n);
}

/** 刀を 持って 絵を 読み、かまえを そろえる（openBladeWorld の あと） */
export async function takeKatana(page: Page, stance: 'chudan' | 'jodan' | 'gedan', item = 'katana'): Promise<void> {
  await holdItems(page, [{ item }]);
  await waitReady(page, KATANA_SET);
  await toStance(page, stance);
}

/** 進んだ 距離（北向き: 始めた 所から −z の 向き） */
export const northOf = (s: TechStep, start: Vec3): number => start.z - s.pos.z;

/** 水平の きょり */
export const flat = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
