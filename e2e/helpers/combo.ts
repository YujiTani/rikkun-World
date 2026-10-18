import type { Page } from '@playwright/test';
import { openBladeWorld, stage, takeKatana, type Vec3 } from './blade';

/**
 * きらめく カタナの 3 段攻撃の E2E 用の 道具（WEAPON-6 仕様書 §4.7・§6）。
 * 押す ステップ・数は 決め打ちせず ゲーム（window.__rikkun）に 聞く:
 * `blade.state().combo`（open・cancelAt・queued）・`blade.events()`（step）・`blade.trail().stars`・`combat.sounds()`・`settings`。
 * 実装の 前は `combo`・`step` が ない（undefined）ので、それを 使う テストは 赤になる。
 */

export type Stance = 'chudan' | 'jodan' | 'gedan';

export interface ComboEvent {
  type: string;
  tick: number;
  tech?: string;
  step?: number;
  yokaiId?: number;
  damage?: number;
}

export interface ComboStep {
  /** この ステップの おわりの 刀の frame（わざの 外は 0） */
  f: number;
  tech: string | null;
  combo: { step: number; queued: boolean; open: boolean; cancelAt: number | null } | null | undefined;
  buffered: string | null;
  stance: string;
  dirDeg: number | null;
  pos: Vec3;
  trailVisible: boolean;
  stars: number;
  /** このステップで 新しく 出た 出来事 */
  events: ComboEvent[];
  /** このステップで 新しく 出た 音 */
  sounds: string[];
  /** 妖怪の 位置（id ごと） */
  yokai: Record<number, Vec3>;
}

/** ページの 中で 使う きろく関数（evaluate に 埋める） */
const REC = `(() => {
  const h = window.__rikkun;
  const st = h.blade.state();
  const p = h.player.get().position;
  const ev = h.blade.events();
  const seen = window.__comboSeen ?? 0;
  window.__comboSeen = ev.length;
  const y = {};
  for (const q of h.yokai.list()) y[q.id] = { x: q.position.x, y: q.position.y, z: q.position.z };
  const tr = h.blade.trail();
  return {
    f: st.frame, tech: st.tech, combo: st.combo, buffered: st.buffered, stance: st.stance,
    dirDeg: st.move ? st.move.dirDeg : null,
    pos: { x: p.x, y: p.y, z: p.z },
    trailVisible: !!tr.visible, stars: tr.stars ? tr.stars.length : 0,
    events: JSON.parse(JSON.stringify(ev.slice(seen))),
    sounds: h.combat.sounds(),
    yokai: y,
  };
})()`;

/** きろくの 起点を 今に そろえる（これまでの 出来事・音は 捨てる） */
export async function markNow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    (window as any).__comboSeen = h.blade.events().length;
    h.combat.sounds();
  });
}

/**
 * 1 ステップずつ 進めて きろくする。`script(i)` は i 番目（0 はじまり）の ステップの「前」に 実行する 関数の 文字
 * （例: `(h, i, last) => { ... }`）。省くと 毎ステップ 押して はなす（pressEvery = true）。
 */
export async function run(
  page: Page,
  n: number,
  o: { mash?: boolean; hold?: boolean; before?: string } = {},
): Promise<ComboStep[]> {
  return page.evaluate(
    ({ n, o, rec }) => {
      const h = window.__rikkun! as any;
      const before = o.before ? (0, eval)(o.before) : null;
      const out: any[] = [];
      for (let i = 0; i < n; i++) {
        const last = out[out.length - 1] ?? null;
        if (before) before(h, i, last);
        if (o.mash) h.input.press('primary');
        else if (o.hold && i === 0) h.input.press('primary');
        h.step(1);
        if (o.mash) h.input.release('primary');
        out.push((0, eval)(rec));
      }
      if (o.hold) h.input.release('primary');
      return out;
    },
    { n, o, rec: REC },
  ) as Promise<ComboStep[]>;
}

/** 毎ステップ 押して はなす（仕様書 AC12 の 押し方）。起点は 呼ぶ 直前 */
export async function mash(page: Page, n: number, before?: string): Promise<ComboStep[]> {
  await markNow(page);
  return run(page, n, { mash: true, before });
}

/** おしつづけ（長押し）で n ステップ */
export async function holdDown(page: Page, n: number): Promise<ComboStep[]> {
  await markNow(page);
  return run(page, n, { hold: true });
}

/** 何も 押さずに n ステップ */
export async function idle(page: Page, n: number): Promise<ComboStep[]> {
  await markNow(page);
  return run(page, n);
}

export const starts = (rec: ComboStep[]): ComboEvent[] => rec.flatMap((s) => s.events.filter((e) => e.type === 'techStart'));
export const hitsOf = (rec: ComboStep[]): ComboEvent[] => rec.flatMap((s) => s.events.filter((e) => e.type === 'techHit'));
export const allSounds = (rec: ComboStep[]): string[] => rec.flatMap((s) => s.sounds);

/** [tick - t0, step, tech] の 並び（t0 = 最初の techStart の tick） */
export function startList(rec: ComboStep[]): [number, number | undefined, string | undefined][] {
  const st = starts(rec);
  const t0 = st[0]?.tick ?? 0;
  return st.map((e) => [e.tick - t0, e.step, e.tech]);
}

/** きらめく カタナ（か ほかの刀）を 持って、ひらけた 地面に 立つ。floorY を 返す */
export async function comboWorld(page: Page, stance: Stance, item = 'crystal_katana'): Promise<number> {
  await openBladeWorld(page);
  await takeKatana(page, stance, item);
  return (await stage(page)).floorY;
}

export const weaponPower = (page: Page, item: string): Promise<number> =>
  page.evaluate((item) => (window.__rikkun! as any).settings.get('weaponDamage')[item] as number, item);
