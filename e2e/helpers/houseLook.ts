import { expect, type Page } from '@playwright/test';
import type { Blueprint } from '../../src/house/editor/blueprint';
import * as kindsMod from '../../src/house/recipes/kinds';
import { houseShape } from '../../src/house/shape';
import { press, setBag } from './house';
import { blueprints, edit, firstArchitect, openEditorFast, setForm } from './houseEditor';
import type { CellInfo, Pt } from './houseBuilt';

/**
 * HOUSE-2B AC11 の 建てる 通し（HOUSE-1C の e2e/house1cBuild.spec.ts の 中の 1 つの step）が 使う 準備（#364・docs/design/HOUSE-2.md §2.4・§6.2）。
 * 約束（本番に 足す 物。名前は src/house/recipes/lookKit.ts の「2B の 約束」）: `houseShape(bp)` が やね・かべ・まど・と・かざり・あかりの しゅるいを 読む／`kindBlocks(part, kind)`。
 * ブロックの id・高さは ここに 書かない: 期待は src の houseShape〔せっけいずの 形の 式〕と kindBlocks から 作り、建った 世界を 窓口 `house.blockAt` で 読んで くらべる。
 * 時間では 待たない（#255）。
 */

/** kindBlocks（本番に 足す 物。まだ 無い 間は 型に 無い ので 取り出しで 落とす） */
export function kindBlocksOf(part: string, kind: string): string[] {
  const f = (kindsMod as unknown as Record<string, unknown>).kindBlocks;
  if (typeof f !== 'function') throw new Error('kindBlocks が まだ ない（2B の 約束。src/house/recipes/kinds.ts）');
  return (f as (p: string, k: string) => string[])(part, kind);
}

/** kindItem（本番に 足す 物。ほると 手に 入る アイテム） */
export function kindItemOf(part: string, kind: string): string | null {
  const f = (kindsMod as unknown as Record<string, unknown>).kindItem;
  if (typeof f !== 'function') throw new Error('kindItem が まだ ない（2B の 約束。src/house/recipes/kinds.ts）');
  return (f as (p: string, k: string) => string | null)(part, kind);
}

/** 作る せっけいず（中の 5×5・窓 2・家具 なし）の しゅるいの えらび。いつもの 物は 書かない */
export interface LookPicks {
  roof?: string;
  wall?: string;
  windowKind?: string;
  door?: string;
  deco?: string[];
  light?: string;
}

/** 話して エディターを 開き、しゅるいを えらんで「できた！」まで 進める。そのあと メニューを 閉じる。せっけいずの 番号を 返す（makeBlueprint の しゅるい つき） */
export async function makeLookBlueprint(page: Page, front: string, picks: LookPicks): Promise<number> {
  const first = await firstArchitect(page);
  await openEditorFast(page, first.id);
  await setForm(page, { windows: 2, front, back: 'のいえ' });
  if (picks.roof) expect(await edit(page, { op: 'roof', kind: picks.roof }), `やね ${picks.roof}`).toBe(true);
  if (picks.wall) expect(await edit(page, { op: 'wall', kind: picks.wall } as never), `かべ ${picks.wall}`).toBe(true);
  if (picks.windowKind) expect(await edit(page, { op: 'windowKind', kind: picks.windowKind }), `まど ${picks.windowKind}`).toBe(true);
  if (picks.door) expect(await edit(page, { op: 'door', kind: picks.door } as never), `と ${picks.door}`).toBe(true);
  for (const k of picks.deco ?? []) expect(await edit(page, { op: 'deco', kind: k } as never), `かざり ${k}`).toBe(true);
  if (picks.light) expect(await edit(page, { op: 'light', kind: picks.light }), `あかり ${picks.light}`).toBe(true);
  await setBag(page, { paper: 2, fude: 1 });
  await press(page, 'done');
  const bps = await blueprints(page);
  expect(bps.length, 'せっけいずが できた').toBeGreaterThan(0);
  await press(page, 'close');
  return bps[bps.length - 1]!.number;
}

/** 期待の せっけいず（家具 なし・中の 5×5・窓 2）。houseShape へ そのまま わたす 形 */
export function lookBlueprint(picks: LookPicks): Pick<Blueprint, 'w' | 'd' | 'windows' | 'furniture' | 'roof' | 'wall' | 'windowKind' | 'door' | 'deco' | 'light'> {
  return {
    w: 5,
    d: 5,
    windows: 2,
    furniture: [],
    roof: (picks.roof ?? 'flat') as Blueprint['roof'],
    wall: (picks.wall ?? 'ki') as Blueprint['wall'],
    windowKind: (picks.windowKind ?? 'shoji') as Blueprint['windowKind'],
    door: (picks.door ?? 'ie') as Blueprint['door'],
    deco: (picks.deco ?? []) as Blueprint['deco'],
    light: (picks.light ?? 'lantern') as Blueprint['light'],
  };
}

/** 外の 箱 w×d×h の ぜんぶの マスと、そのまわり 1 マス（外の すき間）を 読む（キーは "x,y,z"）。at ＝ 床の 段の 北西の すみ */
export function scanLook(page: Page, at: Pt, w: number, d: number, h: number): Promise<Record<string, CellInfo>> {
  return page.evaluate(
    ({ at, w, d, h }) => {
      const hook = (window as any).__rikkun;
      const out: Record<string, unknown> = {};
      for (let x = at.x - 1; x <= at.x + w; x++) for (let y = at.y; y <= at.y + h; y++) for (let z = at.z - 1; z <= at.z + d; z++) out[`${x},${y},${z}`] = hook.house.blockAt(x, y, z);
      return out as Record<string, CellInfo>;
    },
    { at, w, d, h },
  );
}

/** 建った 世界と 期待の 形（houseShape）の ちがう マス（空 ＝ 同じ）。箱の 外の すき間（まわり 1 マス・箱の 1 段 上まで。床の 段より 上）は 空気 */
export function lookMismatches(shape: ReturnType<typeof houseShape>, h: number, at: Pt, got: Record<string, CellInfo>): string[] {
  const bad: string[] = [];
  const inBox = new Set<string>();
  for (const c of shape.cells) {
    const k = `${at.x + c.x},${at.y + c.y},${at.z + c.z}`;
    inBox.add(k);
    const g = got[k];
    if (!g) bad.push(`${k}: 読めない`);
    else if (g.id !== c.id) bad.push(`${k}: ${c.id} の はず → ${g.id}`);
  }
  for (const [k, g] of Object.entries(got)) {
    if (inBox.has(k)) continue;
    const y = Number(k.split(',')[1]);
    if (y > at.y && y <= at.y + h && g.id !== 'air') bad.push(`${k}: 箱の 外は 空気の はず → ${g.id}`);
  }
  return bad;
}
