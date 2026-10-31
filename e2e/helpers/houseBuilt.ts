import { expect, type Page } from '@playwright/test';
import { doorIndex, footprint, windowCells } from '../../src/house/editor/model';
import type { FurnKind } from '../../src/house/editor/furniture';
import type { Rot } from '../../src/house/editor/tuning';
import { futonInfo } from '../../src/world/blocks/futon';
import { openHouse, press, setBag, talkTo } from './house';
import { blueprints, ed, firstArchitect, openEditorFast, setForm } from './houseEditor';

/**
 * HOUSE-1C PR-1（#340 家の 中身。docs/tickets/HOUSE-1C.md・docs/design/HOUSE-1.md §2.6・§2.11・§2.13・§3.3・§4.8・§6.1）の E2E・UI 検査が くり返し使う 準備。
 * フック（buildNow・houses・blockAt・ui.houseNameBand・renaming）と 画面の data-testid の 約束は e2e/helpers/house.ts の 先頭（「1C PR-1 の 約束」）。
 * 数・座標は 決め打ちしない: 形の 期待は `src/house/editor/model.ts`（windowCells・doorIndex・footprint）から 作り、場所は ゲーム（window.__rikkun）に 聞く。
 * 進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 */

export interface Pt {
  x: number;
  y: number;
  z: number;
}

/** 窓口 `houses()` の 1 件 */
export interface HouseRec {
  id: number | string;
  name: string;
  number: number;
  outer: { w: number; d: number };
  door: Pt;
  doorOpen: boolean;
}

/** 窓口 `blockAt(x, y, z)` */
export interface CellInfo {
  id: string;
  item: string | null;
  dir: 0 | 1 | 2 | 3 | null;
}

export interface PlacedForm {
  kind: string;
  x: number;
  z: number;
  rot: Rot;
}

/** せっけいずの 形（エディターで 作る 物）。w・d は 中の よこ・たて */
export interface HouseForm {
  w: 5 | 7 | 9;
  d: 5 | 7 | 9;
  windows: number;
  front: string;
  back: string;
  furniture: PlacedForm[];
}

/** 前の 文字 いちばん 長い（8 字）＋ いちばん 長い 後ろの 文字（UI 検査の「いちばん 長い 名前」） */
export const LONGEST_NAME = { front: 'あいうえおかきく', back: 'ひみつきち' } as const;

/** 建てた 家の ブロックの id（仕様 §4.8）。戸は 'house_door' で はじまれば よい（DOOR_PREFIX） */
export const HB = {
  floor: 'house_floor',
  wall: 'house_wall',
  roof: 'house_roof',
  shoji: 'shoji',
  door: 'house_door',
  lantern: 'lantern',
} as const;
export const DOOR_PREFIX = HB.door;

export const NIGHT = 67400; // 夜の 真ん中（night76.spec.ts・itemFx1.spec.ts と 同じ）
export const DAY = 14000;

// ---------------------------------------------------------------- 窓口

export const houses = (page: Page): Promise<HouseRec[]> => page.evaluate(() => (window as any).__rikkun.house.houses());

/** せっけいずから 家を その場に 建てる。建てられなければ ここで 落とす（実装の 前は 窓口が 無くて 赤） */
export async function buildNow(page: Page, number: number, at: Pt): Promise<HouseRec> {
  const rec = await page.evaluate(
    ({ number, at }) => {
      const h = (window as any).__rikkun;
      if (typeof h.house?.buildNow !== 'function') return 'NO_HOOK';
      const r = h.house.buildNow(number, at);
      h.step(2);
      return r ?? 'NULL';
    },
    { number, at },
  );
  expect(rec, 'window.__rikkun.house.buildNow（1C PR-1 の テスト用 フック。e2e/helpers/house.ts の 先頭）が まだ ない').not.toBe('NO_HOOK');
  expect(rec, `buildNow(${number}) が null（知らない 番号?）`).not.toBe('NULL');
  return rec as HouseRec;
}

export const blockAt = (page: Page, x: number, y: number, z: number): Promise<CellInfo> =>
  page.evaluate(([x, y, z]) => (window as any).__rikkun.house.blockAt(x, y, z), [x, y, z] as const);

export const bandOf = (page: Page): Promise<{ text: string; ticksLeft: number } | null> =>
  page.evaluate(() => (window as any).__rikkun.ui.houseNameBand());

// ---------------------------------------------------------------- せっけいずを 1 まい 作る（エディターの 窓口 だけ。画面は 通さない）

/** 話して エディターを 開き、形を 決めて「できた！」まで 進める。そのあと メニューを 閉じる。せっけいずの 番号を 返す */
export async function makeBlueprint(page: Page, form: HouseForm): Promise<number> {
  const first = await firstArchitect(page);
  await openEditorFast(page, first.id);
  // 今と 同じ 大きさを えらぶ `size` は false なので、ちがう ほうだけ わたす（はじめは 5×5）
  const cur = (await ed(page)).size;
  await setForm(page, {
    w: form.w === cur.w ? undefined : form.w,
    d: form.d === cur.d ? undefined : form.d,
    windows: form.windows,
    furniture: form.furniture,
    front: form.front,
    back: form.back,
  });
  await setBag(page, { paper: 2, fude: 1 });
  await press(page, 'done');
  const bps = await blueprints(page);
  expect(bps.length, 'せっけいずが できた').toBeGreaterThan(0);
  await press(page, 'close');
  return bps[bps.length - 1]!.number;
}

// ---------------------------------------------------------------- 場所の 準備

/**
 * 外の 寸法 outW×outD の 家を 建てる 場所（北西の すみ x0・z0）の まわりを 平らに する: 石の 床（高さ gy ＝ 場所の まん中の 地面）と、その 上を 空気に する。
 * 余白は よこ・うしろ 6 マス、まえ（南）10 マス（歩く ため）。床の 高さ gy（家の 床の 段の y）を 返す。
 */
export function prepareYard(page: Page, x0: number, z0: number, outW: number, outD: number): Promise<number> {
  return page.evaluate(
    ({ x0, z0, outW, outD }) => {
      const h = (window as any).__rikkun;
      const gy: number = h.world.groundHeight(x0 + Math.floor(outW / 2), z0 + Math.floor(outD / 2));
      h.world.fill(x0 - 6, gy - 2, z0 - 6, x0 + outW - 1 + 6, gy, z0 + outD - 1 + 10, 'stone');
      h.world.fill(x0 - 6, gy + 1, z0 - 6, x0 + outW - 1 + 6, gy + 12, z0 + outD - 1 + 10, 'air');
      h.step(2);
      return gy;
    },
    { x0, z0, outW, outD },
  );
}

/** ライトと メッシュの 作りなおしが おちつくまで 進める（上限 3000 ステップ） */
export const settleWorld = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    let n = 0;
    while ((h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000) {
      h.step(1);
      n++;
    }
    h.step(2);
  });

/** 同じ 場所・同じ カメラで 見た 描画回数と 三角形（AC34 ④）。おちつくまで 進めた あと 1 コマ 描いた 回数 */
export async function viewStats(page: Page, eye: Pt, yaw: number, pitch: number): Promise<{ calls: number; triangles: number }> {
  await page.evaluate(
    ({ eye, yaw, pitch }) => {
      const h = (window as any).__rikkun;
      h.time.set(14000); // ひる。空の 描画が 変わらない ように
      h.player.set({ position: eye, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
      h.step(2);
    },
    { eye, yaw, pitch },
  );
  await settleWorld(page);
  return page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.step(1);
    const s = h.renderStats();
    return { calls: s.drawCalls as number, triangles: s.triangles as number };
  });
}

// ---------------------------------------------------------------- 形の 期待（AC49）。式は src/house/editor/model.ts

export type Want =
  | { t: 'floor' | 'wall' | 'roof' | 'shoji' | 'lantern' | 'air' | 'door' }
  | { t: 'furn'; kind: string; rot: Rot };

/** 外の 箱の ぜんぶの マス（キーは "x,y,z"）の 期待。at ＝ 床の 段の 北西の すみ。外まわり・窓・戸・ちょうちん・家具は model.ts の 式から */
export function wantedCells(form: HouseForm, at: Pt): Map<string, Want> {
  const out = new Map<string, Want>();
  const ow = form.w + 2;
  const od = form.d + 2;
  const key = (gx: number, layer: number, gz: number): string => `${at.x + gx},${at.y + layer},${at.z + gz}`;
  const doorGx = 1 + doorIndex(form);
  const doorGz = od - 1; // まえ ＝ 南 ＝ いちばん 大きい z
  const win = new Set<string>();
  for (const c of windowCells(form)) {
    // かべごとの 並びは 左右 対称なので 向きは どちらでも 同じ 組
    if (c.wall === 'back') win.add(`${1 + c.i},${0}`);
    else if (c.wall === 'left') win.add(`${0},${1 + c.i}`);
    else win.add(`${ow - 1},${1 + c.i}`);
  }
  const cx = 1 + (form.w - 1) / 2;
  const cz = 1 + (form.d - 1) / 2;
  for (let gx = 0; gx < ow; gx++) {
    for (let gz = 0; gz < od; gz++) {
      out.set(key(gx, 0, gz), { t: 'floor' });
      out.set(key(gx, 4, gz), { t: 'roof' });
      const ring = gx === 0 || gz === 0 || gx === ow - 1 || gz === od - 1;
      for (let layer = 1; layer <= 3; layer++) {
        let want: Want = ring ? { t: 'wall' } : { t: 'air' };
        if (ring && gx === doorGx && gz === doorGz && (layer === 1 || layer === 2)) want = { t: 'door' };
        else if (ring && layer === 2 && win.has(`${gx},${gz}`)) want = { t: 'shoji' };
        else if (!ring && layer === 3 && gx === cx && gz === cz) want = { t: 'lantern' };
        out.set(key(gx, layer, gz), want);
      }
    }
  }
  for (const p of form.furniture) {
    const [fw, fd] = footprint(p.kind as FurnKind, p.rot);
    for (let dx = 0; dx < fw; dx++) for (let dz = 0; dz < fd; dz++) out.set(key(1 + p.x + dx, 1, 1 + p.z + dz), { t: 'furn', kind: p.kind, rot: p.rot });
  }
  return out;
}

/** 外の 箱の ぜんぶの マスを 読む（キーは "x,y,z"） */
export function scanBox(page: Page, at: Pt, outW: number, outD: number): Promise<Record<string, CellInfo>> {
  return page.evaluate(
    ({ at, outW, outD }) => {
      const h = (window as any).__rikkun;
      const out: Record<string, unknown> = {};
      for (let x = at.x; x < at.x + outW; x++) for (let y = at.y; y <= at.y + 4; y++) for (let z = at.z; z < at.z + outD; z++) out[`${x},${y},${z}`] = h.house.blockAt(x, y, z);
      return out as Record<string, CellInfo>;
    },
    { at, outW, outD },
  );
}

const PLAIN: Record<string, string> = { floor: HB.floor, wall: HB.wall, roof: HB.roof, shoji: HB.shoji, lantern: HB.lantern, air: 'air' };

/** 期待と ちがう マスの 説明（空 = 同じ）。家具は blockAt の item と dir（向き）で くらべる */
export function shapeMismatches(want: Map<string, Want>, got: Record<string, CellInfo>): string[] {
  const bad: string[] = [];
  for (const [k, w] of want) {
    const g = got[k];
    if (!g) {
      bad.push(`${k}: 読めない`);
    } else if (w.t === 'door') {
      if (!g.id.startsWith(DOOR_PREFIX) || g.item !== HB.door) bad.push(`${k}: 戸の はず → id ${g.id}・item ${g.item}`);
    } else if (w.t === 'furn') {
      if (g.id === 'air' || g.item !== w.kind || g.dir !== w.rot) bad.push(`${k}: 家具 ${w.kind} 向き ${w.rot} の はず → id ${g.id}・item ${g.item}・dir ${g.dir}`);
    } else if (g.id !== PLAIN[w.t]) {
      bad.push(`${k}: ${PLAIN[w.t]} の はず → ${g.id}`);
    }
  }
  return bad;
}

/** ふとん（2 マス）の 頭と 足の マス・向き。rot 0 ＝ まくらが うしろ（北）、1 ＝ みぎ（東）、2 ＝ 手前（南）、3 ＝ ひだり（西）。向きは 頭から 足への 向き（FutonDir: 0 e・1 s・2 w・3 n） */
export function futonCells(p: PlacedForm, at: Pt): { head: Pt; foot: Pt; dir: 0 | 1 | 2 | 3 } {
  const x = at.x + 1 + p.x;
  const z = at.z + 1 + p.z;
  const y = at.y + 1;
  switch (p.rot) {
    case 0:
      return { head: { x, y, z }, foot: { x, y, z: z + 1 }, dir: 1 };
    case 1:
      return { head: { x: x + 1, y, z }, foot: { x, y, z }, dir: 2 };
    case 2:
      return { head: { x, y, z: z + 1 }, foot: { x, y, z }, dir: 3 };
    case 3:
      return { head: { x, y, z }, foot: { x: x + 1, y, z }, dir: 0 };
  }
}

/** ふとんの 頭・足の マスが 今の ふとんの きまり（world/blocks/futon.ts）どおりか。空 = 同じ */
export async function futonMismatches(page: Page, p: PlacedForm, at: Pt): Promise<string[]> {
  const f = futonCells(p, at);
  const bad: string[] = [];
  for (const [role, c] of [['head', f.head], ['foot', f.foot]] as const) {
    const id = await page.evaluate(([x, y, z]) => (window as any).__rikkun.world.getBlock(x, y, z) as string, [c.x, c.y, c.z] as const);
    const info = futonInfo(id);
    if (!info || info.role !== role || info.dir !== f.dir) bad.push(`ふとんの ${role} (${c.x}, ${c.y}, ${c.z}): ${id}（role ${info?.role}・dir ${info?.dir} / 期待 ${role}・${f.dir}）`);
  }
  return bad;
}

// ---------------------------------------------------------------- 立つ・ねらう・歩く・ほる

/** 立つ（足もと pos・向き yaw〔0 ＝ 北 −z・90 ＝ 東 +x・180 ＝ 南・270 ＝ 西〕・まっすぐ）。2 ステップ 進めて 落ちつく */
export const standAt = (page: Page, pos: Pt, yaw = 0): Promise<void> =>
  page.evaluate(
    ({ pos, yaw }) => {
      const h = (window as any).__rikkun;
      h.input.releaseAll();
      h.player.set({ position: pos, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
      h.step(2);
    },
    { pos, yaw },
  );

export interface Target {
  id: string;
  block: Pt;
}

/** ブロック p を ねらう（top ＝ 高さ 0〜1。0.5 ＝ 横の 面の まん中）。ねらいに のった ブロック（なければ null） */
export const aimBlock = (page: Page, p: Pt, top = 0.5): Promise<Target | null> =>
  page.evaluate(
    ({ p, top }) => {
      const h = (window as any).__rikkun;
      (window as any).__aim.solve(p.x, p.y, p.z, top);
      h.step(1);
      const t = h.target.get();
      return t ? { id: t.id as string, block: { ...t.block } } : null;
    },
    { p, top },
  );

/** 右クリックを 1 回 押して はなす */
export const tapRight = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.release('secondary');
    h.input.press('secondary');
    h.step(1);
    h.input.release('secondary');
    h.step(2);
  });

/** 右の 案内（照準の 下）。出ていなければ null */
export const rightHint = (page: Page): Promise<{ icon: string; word: string } | null> =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.step(1);
    return h.hud.actionHint().right ?? null;
  });

export interface Walk {
  /** 1 ステップごとの 足もと x・z と、そのときの 名前の 帯（なければ null） */
  trace: { x: number; z: number; band: string | null; left: number | null }[];
  end: Pt;
}

/**
 * from に 立って yaw を 向き、前へ 歩く（moveForward を 押しつづける）。axis の 座標が until に とどくか（dir ＝ ふえる 向き 1／へる 向き −1）、max ステップで やめる。
 * 時間でなく ステップの 数で 決める。歩いた 足あとと 帯を 1 ステップずつ ためて 返す。
 */
export const walk = (page: Page, o: { from: Pt; yaw: number; axis: 'x' | 'z'; dir: 1 | -1; until: number; max: number }): Promise<Walk> =>
  page.evaluate((o) => {
    const h = (window as any).__rikkun;
    h.input.releaseAll();
    h.player.set({ position: o.from, velocity: { x: 0, y: 0, z: 0 }, yaw: o.yaw, pitch: 0 });
    h.step(2);
    const trace: { x: number; z: number; band: string | null; left: number | null }[] = [];
    h.input.press('moveForward');
    for (let i = 0; i < o.max; i++) {
      h.step(1);
      const p = h.player.get().position;
      const b = typeof h.ui.houseNameBand === 'function' ? h.ui.houseNameBand() : null; // フックが 無い 間は 帯なし（帯の 確かめは bandOf が 落とす）
      trace.push({ x: p.x as number, z: p.z as number, band: b ? (b.text as string) : null, left: b ? (b.ticksLeft as number) : null });
      if (o.dir * p[o.axis] >= o.dir * o.until) break;
    }
    h.input.release('moveForward');
    h.step(2);
    const p = h.player.get().position;
    return { trace, end: { x: p.x as number, y: p.y as number, z: p.z as number } };
  }, o);

/** ねらった ブロックを ほって こわす（押しつづけて ひびが MAX → 押し直した しゅんかんに こわれる）。ほれる ようになるまでの ステップ数を 返す */
export const digAimed = (page: Page): Promise<{ ready: boolean; steps: number }> =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.release('primary');
    h.input.press('primary');
    let steps = 0;
    while (!h.dig.get().ready && steps < 1500) {
      h.step(1);
      steps++;
    }
    const ready = h.dig.get().ready as boolean;
    h.input.release('primary');
    h.input.press('primary');
    h.step(1);
    h.input.release('primary');
    h.step(2);
    return { ready, steps };
  });

/** 家の 戸の 前の 外の 立ち位置（戸の 2 マス 南の 床の 上。まん中） */
/** 持ち物の 空いた ホットバーの マスを えらぶ（右クリックが 持ち物の 道具に 取られない ように） */
export const emptyHand = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    const slots = h.inventory.get().slots as (unknown | null)[];
    const i = slots.findIndex((s, k) => k < 9 && !s);
    h.inventory.select(i);
    h.step(1);
  });

export const outsideDoor = (door: Pt, south = 3): Pt => ({ x: door.x + 0.5, y: door.y, z: door.z + south });

/** 戸を あけて（右クリック）外から 戸を 通って 中へ 歩く。足あとを 返す（中の マスまで） */
export async function enterThroughDoor(page: Page, door: Pt): Promise<Walk> {
  return walk(page, { from: outsideDoor(door), yaw: 0, axis: 'z', dir: -1, until: door.z - 1.5, max: 240 });
}

// ---------------------------------------------------------------- UI 検査の 画面（e2e/ui-gate.spec.ts）

export type RenameScreen = 'list' | 'name' | 'band';

/** 一覧を いっぱいに する 家の 数（2 列 × 5 行の 並び。ふえても スクロールで おさまる かを 見る） */
const GATE_HOUSES = 10;

/**
 * UI 検査の 画面を 出す（AC35b）: いちばん 長い 名前の 家を 何けんか 建てて、
 *   list ＝ なまえを かえる の 一覧（page 'rename'）／name ＝ 名前の 画面（page 'renameName'）／band ＝ 戸から 入った ところの 名前の 帯。
 */
export async function openRenameScreen(page: Page, kind: RenameScreen): Promise<void> {
  await openHouse(page);
  const first = await firstArchitect(page);
  const number = await makeBlueprint(page, { w: 5, d: 5, windows: 0, front: LONGEST_NAME.front, back: LONGEST_NAME.back, furniture: [{ kind: 'futon', x: 0, z: 0, rot: 0 }, { kind: 'chair', x: 2, z: 0, rot: 0 }] }); // ふとん だけだと 確かめの まどが 出る ので いすを 足す
  const outer = 7; // 5 + 2
  const made: HouseRec[] = [];
  const count = kind === 'band' ? 1 : GATE_HOUSES;
  for (let i = 0; i < count; i++) {
    // 建築士さんの 立ち位置(±4)から はなして、2 列 × 5 行に ならべる（13 マスおき）
    const x0 = Math.floor(first.x) + 14 + (i % 2) * 13;
    const z0 = Math.floor(first.z) - 30 + Math.floor(i / 2) * 13;
    const gy = await prepareYard(page, x0, z0, outer, outer);
    made.push(await buildNow(page, number, { x: x0, y: gy, z: z0 }));
  }
  if (kind === 'band') {
    const door = made[0]!.door;
    await emptyHand(page); // 右クリックが 道具に 取られない ように 手を 空に する
    await standAt(page, outsideDoor(door), 0);
    await aimBlock(page, door, 0.5);
    await tapRight(page); // 戸を あける
    const w = await enterThroughDoor(page, door);
    expect(w.trace.some((s) => s.band !== null), '戸から 入ると 名前の 帯が 出る').toBe(true);
    await page.evaluate(() => (window as any).__rikkun.step(2));
    return;
  }
  await talkTo(page, first.id, 'hook');
  await press(page, 'rename');
  const m = await page.evaluate(() => (window as any).__rikkun.house.menu());
  expect(m.page, 'なまえを かえる の 一覧').toBe('rename');
  if (kind === 'name') {
    await press(page, 'renamePick', made[0]!.id);
    const n = await page.evaluate(() => (window as any).__rikkun.house.menu());
    expect(n.page, 'なまえを かえる の 名前の 画面').toBe('renameName');
  }
  await page.evaluate(() => (window as any).__rikkun.step(2));
}

export const RENAME_LIST_ROOTS = ['[data-testid="house-rename"]', '[data-testid="house-bubble"]'];
export const RENAME_NAME_ROOTS = ['[data-testid="house-rename-name"]', '[data-testid="house-bubble"]'];
export const NAME_BAND_ROOTS = ['[data-testid="house-name-band"]'];
