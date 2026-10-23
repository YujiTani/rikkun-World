import { expect, type Page } from '@playwright/test';
import { installAimHelpers, aimAtBlock } from './aim';
import { KATANA_SET, holdItems, openBladeWorld, stage, waitReady, type Vec3 } from './blade';

/**
 * WEAPON-7（レジェンダリー武器・ためわざ）の E2E 用の 道具（仕様書 §9・§11）。
 * 数（F・半径・ダメージ）は 決め打ちせず ゲーム（window.__rikkun）に 聞く:
 * `legend.state()`・`legend.events()`・`blade.state()`・`yokai.list()`・`combat.sounds()`・`settings`・`ui.topBand()`・`achievements`。
 * 実装の 前は `legend`・`ui.topBand` が ない ので、それを 使う テストは 赤になる。
 * 約束: `legend.events()` は `blade.events()`・`parry.events()` と 同じく 読んでも 空に ならない（この道具は 起点からの 差で 読む）。
 */

export const RAIJIN = 'raijin_ken';

export interface LegendEvent {
  type: string;
  S?: Vec3;
  hits?: number[];
  yokaiId?: number;
  damage?: number;
  reason?: string;
}

export interface LStep {
  /** この ステップの おわりの ためわざ（なければ null）と その F */
  move: 'lightning' | 'shining' | null;
  moveF: number;
  charge: { ticks: number; ready: boolean } | null;
  aim: { T: Vec3; S: Vec3 | null; skyVisible: boolean } | null;
  /** このステップで 新しく 出た legend の 出来事 */
  events: LegendEvent[];
  /** このステップで 新しく 鳴った 音 */
  sounds: string[];
  /** 刀の frame と わざ（ふつうの わざの F） */
  bladeF: number;
  bladeTech: string | null;
  stance: string;
  tick: number;
  pos: Vec3;
  /** 妖怪の 体力（id ごと） */
  hp: Record<number, number>;
}

const SNAP = `(() => {
  const h = window.__rikkun;
  const st = h.legend.state();
  const ev = h.legend.events();
  const seen = window.__legendSeen ?? 0;
  window.__legendSeen = ev.length;
  const b = h.blade.state();
  const p = h.player.get().position;
  const hp = {};
  for (const y of h.yokai.list()) hp[y.id] = y.hp;
  return {
    move: st.move, moveF: st.moveF,
    charge: st.charge ? { ticks: st.charge.ticks, ready: st.charge.ready } : null,
    aim: st.aim ? JSON.parse(JSON.stringify(st.aim)) : null,
    events: JSON.parse(JSON.stringify(ev.slice(seen))),
    sounds: h.combat.sounds(),
    bladeF: b.frame, bladeTech: b.tech, stance: b.stance,
    tick: h.tick(),
    pos: { x: p.x, y: p.y, z: p.z },
    hp,
  };
})()`;

/** 窓口が あるか（実装の 前は ここで 落ちる） */
export async function expectLegendHook(page: Page): Promise<void> {
  const has = await page.evaluate(() => {
    const h = window.__rikkun! as any;
    return typeof h.legend?.state === 'function' && typeof h.legend?.events === 'function';
  });
  expect(has, 'window.__rikkun.legend.state() / events() が まだ ない（仕様書 §9）').toBe(true);
}

/** 起点を 今に そろえる（これまでの legend の 出来事・音は 捨てる） */
export async function markLegend(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    (window as any).__legendSeen = h.legend.events().length;
    h.combat.sounds();
  });
}

/**
 * 1 ステップずつ n 回 進めて きろくする。`before` は 各ステップの「前」に 実行する 関数の 文字
 * （例: `(h, i, last) => { if (i === 0) h.input.press('primary'); }`）。
 */
export async function stepN(page: Page, n: number, before?: string): Promise<LStep[]> {
  return page.evaluate(
    ({ n, before, snap }) => {
      const h = window.__rikkun! as any;
      const w1 = () => { h.step(1); while (h.impact && h.impact.stopLeft() > 0) h.step(1); }; // #276 止まりは 1 ステップに 数えない
      const b = before ? (0, eval)(before) : null;
      const out: any[] = [];
      for (let i = 0; i < n; i++) {
        if (b) b(h, i, out[out.length - 1] ?? null);
        w1();
        out.push((0, eval)(snap));
      }
      return out;
    },
    { n, before, snap: SNAP },
  ) as Promise<LStep[]>;
}

/**
 * 左クリックを 押して down ステップ 押しつづけ（i = 0 〜 down − 1 が ためF 1 〜 down）、
 * i = down の ステップに はなして（= わざの F1）、さらに after ステップ きろくする。戻りは down + after + 1 こ。
 * `extra` は 各ステップの 前に 足す 文（変数 h・i・last が 使える）。
 */
export async function chargeRun(page: Page, down: number, after = 0, extra = ''): Promise<LStep[]> {
  return stepN(
    page,
    down + 1 + after,
    `(h, i, last) => { if (i === 0) h.input.press('primary'); if (i === ${down}) h.input.release('primary'); ${extra} }`,
  );
}

export const types = (rec: LStep[]): string[] => rec.flatMap((s) => s.events.map((e) => e.type));
export const sounds = (rec: LStep[]): string[] => rec.flatMap((s) => s.sounds);
/** type の 出来事が 最初に 出た きろくの 番号（なければ -1） */
export const indexOfEvent = (rec: LStep[], type: string): number => rec.findIndex((s) => s.events.some((e) => e.type === type));

export const legendState = (page: Page) => page.evaluate(() => (window.__rikkun! as any).legend.state());

/**
 * 雷神剣（か item）を 持って、ひらけた 平らな 地面に 立つ（北向き・床 floorY）。実績の おしらせは 出す（mute 解除は 呼ぶ側）。
 * 戻りは floorY。
 */
export async function legendWorld(page: Page, item: string = RAIJIN): Promise<number> {
  await openBladeWorld(page);
  await installAimHelpers(page);
  await expectLegendHook(page); // 窓口が ない（実装の 前）なら ここで 落ちる
  const { floorY } = await stage(page);
  await holdItems(page, [{ item }]);
  await waitReady(page, KATANA_SET);
  await markLegend(page);
  return floorY;
}

/** 立ち直す（ためや わざを おわらせ、妖怪・ブロックを かたづけ、起点を 今に そろえる） */
export async function resetStage(page: Page, floorY: number): Promise<void> {
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.input.releaseAll();
    h.step(120);
  });
  await stage(page, { floorY }); // 床の 上は 空気に もどる（かべ・やねも 消える）
  await markLegend(page);
}

/** 前 d の 地面の ブロックの 上の面を ねらう（北向き。ステップを 1 進める） */
export async function aimGroundAhead(page: Page, floorY: number, d = 8): Promise<void> {
  const z = Math.floor(20.5 - d);
  await aimAtBlock(page, 20, floorY, z, 1);
}

/** 世界に 妖怪を 1 体 置く（ai:false・体力 hp）。戻りは id */
export async function spawnAt(page: Page, kind: string, x: number, y: number, z: number, hp = 99, opts: Record<string, unknown> = {}): Promise<number> {
  return page.evaluate(
    ({ kind, x, y, z, hp, opts }) => {
      const h = window.__rikkun! as any;
      const id = h.yokai.spawn(kind, x, y, z, { ai: false, ...opts });
      h.yokai.setHp(id, hp);
      h.yokai.events();
      return id as number;
    },
    { kind, x, y, z, hp, opts },
  );
}

/** ためて ready に する（ためF = chargeTicks まで 押す。はなさない）。戻りは きろく */
export async function chargeUntilReady(page: Page, ticks = 60): Promise<LStep[]> {
  return stepN(page, ticks, `(h, i) => { if (i === 0) h.input.press('primary'); }`);
}

/** hold を はなして 1 ステップ 進める */
export async function releaseAndStep(page: Page, after = 0): Promise<LStep[]> {
  return stepN(page, 1 + after, `(h, i) => { if (i === 0) h.input.release('primary'); }`);
}

/** ヌシ（からかさ・M = 1）を 前 d に 置く。体力は hp（初期値 1 = 1 回で たおれる）。戻りは id */
export async function spawnNushiAhead(page: Page, d = 1.5, hp = 1): Promise<number> {
  return page.evaluate(
    ({ d, hp }) => {
      const h = window.__rikkun! as any;
      const p = h.player.get().position;
      const id = h.yokai.spawn('karakasa', p.x, p.y, p.z - d, { ai: false, title: 'nushi', m: 1 });
      h.yokai.setHp(id, hp);
      h.yokai.events();
      return id as number;
    },
    { d, hp },
  );
}

/** 水平の きょり */
export const flat = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/** もちもの画面の マス i に マウスを のせて ツールチップを 出す（画面は 開いておく。ステップを 1 進める） */
export async function hoverSlot(page: Page, i: number): Promise<void> {
  const b = await page.locator(`.inv-slot[data-index="${i}"]`).boundingBox();
  if (!b) throw new Error(`マス ${i} が 見えない`);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.move(b.x + b.width / 2 + 1, b.y + b.height / 2 + 1);
  await page.evaluate(() => (window.__rikkun as any).step(1));
}

/** ヌシの 表を 1 本に 固定する（PR2 で 表が 2 本以上に なったので、特定の 武器が 出る 前提の テスト用）。ステップは 進めない */
export async function pinNushiTable(page: Page, item: string = RAIJIN): Promise<void> {
  await page.evaluate((it) => (window.__rikkun as any).settings.set('nushiDrops', [{ item: it, weight: 1 }]), item);
}

export const FUJIN = 'fujin_ken';
