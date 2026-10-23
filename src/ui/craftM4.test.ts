import { describe, expect, it } from 'vitest';
import type { CraftEvent, ItemId, Rarity, Recipe } from '../contracts';
import { CRAFT_SOUNDS, playCraft } from '../fx/craftSounds';
import { CRAFT_UI_SETTINGS } from '../fx/craftConfig';
import { SmokePool, crackleTarget, flameLevel, nextCrackleDelay, type FurnaceFxEntry } from '../fx/furnaceFxModel';
import type { Tone } from '../fx/sound';

import { BLOCK_TILES, getTilePixels } from '../world/blocks/textures';
import { createRng } from '../world/gen/random';
import { rarityTier } from '../drops/rarity';
import { HintModel, anyCraftNow, buildCards, materialViews, nextFuel } from './craftModel';
import { handleCraftEvents, swingSounds } from './craftUi';
import { M4_ITEMS, clockPixels, hammerPixels, m4ItemPixels } from './itemArtM4';
import { itemIconPixels, signalIconPixels } from './itemIcon';
import { PickupLogModel } from './pickupLogModel';
import { buildOverlayHtml } from './playOverlay';
import { findUnrubiedKanji } from './text';
import { buildTooltip, rarityCss, type TooltipDeps } from './tooltipModel';
const bookMod = (await import('./book/bookData')) as any;
const BOOK_CHAPTERS: any[] = bookMod.BOOK_CHAPTERS;
const BOOK_ITEMS: any[] = bookMod.BOOK_ITEMS;

const R = (id: string, out: [ItemId, number], inputs: [ItemId, number][], works = true, station: 'craft' | 'furnace' = 'craft'): Recipe => ({
  id,
  output: { item: out[0], count: out[1] },
  inputs: inputs.map(([item, count]) => ({ item, count })),
  works,
  station,
});

const RECIPES: Recipe[] = [
  R('wood_pickaxe', ['wood_pickaxe', 1], [['log', 3]]),
  R('bokuto', ['bokuto', 1], [['log', 2]]),
  R('ya', ['ya', 4], [['log', 1], ['stone', 1], ['paper', 1]]),
  R('furnace', ['furnace', 1], [['stone', 5]]),
  R('kite', ['kite', 1], [['paper', 3], ['string', 2], ['log', 1]], false),
  R('iron_ingot', ['iron_ingot', 1], [['iron_ore', 1]], true, 'furnace'),
  R('haniwa', ['haniwa', 1], [['clay', 2]], false, 'furnace'),
];

function fakeInv(counts: Record<string, number>) {
  return { count: (i: ItemId) => counts[i] ?? 0 };
}
function fakeCraft(counts: Record<string, number>) {
  const inv = fakeInv(counts);
  return {
    recipes: () => RECIPES,
    status: (id: string) => {
      const r = RECIPES.find((x) => x.id === id)!;
      const missing = r.inputs.filter((i) => inv.count(i.item) < i.count).map((i) => ({ item: i.item, count: i.count - inv.count(i.item) }));
      return { craftable: missing.length === 0, missing };
    },
  };
}

describe('M4 のアイテムの絵（24 こ。ブロック 3 つは ブロックの絵）', () => {
  it('21 こすべて 16x16 で、ふちがあり、ぜんぶちがう絵', () => {
    expect(M4_ITEMS).toHaveLength(21);
    const seen = new Set<string>();
    for (const it of M4_ITEMS) {
      const p = m4ItemPixels(it);
      expect(p, it).toHaveLength(256);
      expect(p.filter((c) => c[3] === 255).length, it).toBeGreaterThan(25);
      expect(itemIconPixels(it)).toEqual(p);
      seen.add(JSON.stringify(p));
    }
    expect(seen.size).toBe(21);
    expect(hammerPixels()).toHaveLength(256);
    expect(clockPixels()).toHaveLength(256);
  });
  it('つるはしの頭の色: き 茶・いし 灰・てつ 銀', () => {
    const has = (it: (typeof M4_ITEMS)[number], r: number, g: number, b: number) =>
      m4ItemPixels(it).some((c) => c[0] === r && c[1] === g && c[2] === b && c[3] === 255);
    expect(has('wood_pickaxe', 0xa0, 0x70, 0x3c)).toBe(true);
    expect(has('stone_pickaxe', 0x8a, 0x8a, 0x8a)).toBe(true);
    expect(has('iron_pickaxe', 0xe0, 0xe0, 0xe8)).toBe(true);
  });
  it('きらめく カタナ は 水色とむらさきと白', () => {
    const p = m4ItemPixels('crystal_katana');
    const has = (r: number, g: number, b: number) => p.some((c) => c[0] === r && c[1] === g && c[2] === b && c[3] === 255);
    expect(has(0x9f, 0xe8, 0xff)).toBe(true);
    expect(has(0xc7, 0x9b, 0xff)).toBe(true);
    expect(has(255, 255, 255)).toBe(true);
  });
  it('合図: ほれない は いしの つるはし＋赤い ✕、や が無い は や＋赤い ✕', () => {
    for (const k of ['needTool', 'full', 'noArrow'] as const) {
      const p = signalIconPixels(k);
      expect(p).toHaveLength(256);
      expect(p.some((c) => c[0] === 0xe5 && c[1] === 0x39 && c[3] === 255)).toBe(true);
    }
    expect(signalIconPixels('needTool')).not.toEqual(signalIconPixels('noArrow'));
  });
  it('かまど・かわら・レンガ の ブロックの絵', () => {
    for (const id of ['furnace', 'kawara', 'brick'] as const) {
      expect(BLOCK_TILES[id]).toHaveLength(3);
      expect(itemIconPixels(id)).toHaveLength(256);
    }
    const px = (n: Parameters<typeof getTilePixels>[0]) => getTilePixels(n);
    const has = (n: Parameters<typeof getTilePixels>[0], h: string) =>
      px(n).some((c) => c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('') === h);
    expect(has('kawara', '4a5560')).toBe(true);
    expect(has('brick', 'b5523b')).toBe(true);
    expect(has('furnace_side', '151515')).toBe(true);
  });
});

describe('カード（つくる・やく）', () => {
  it('持ち物が空なら全部 光らず、足りない材料が赤、まるは全部から', () => {
    const cards = buildCards(RECIPES.filter((r) => r.station === 'craft'), fakeCraft({}), fakeInv({}));
    expect(cards.every((c) => !c.glowing)).toBe(true);
    const bokuto = cards.find((c) => c.id === 'bokuto')!;
    expect(bokuto.redItems).toEqual(['log']);
    expect(bokuto.materials[0].dots).toEqual([false, false]);
    expect(anyCraftNow(fakeCraft({}))).toBe(false);
  });
  it('き 2 で ぼくとう が光る、き 3 の つるはし は き 1 だと ●○○ で赤', () => {
    const counts = { log: 2 };
    const cards = buildCards(RECIPES.filter((r) => r.station === 'craft'), fakeCraft(counts), fakeInv(counts));
    expect(cards.find((c) => c.id === 'bokuto')!.glowing).toBe(true);
    const wp = cards.find((c) => c.id === 'wood_pickaxe')!;
    expect(wp.glowing).toBe(false);
    expect(wp.redItems).toEqual(['log']);
    expect(wp.materials[0].dots).toEqual([true, true, false]);
    expect(wp.materials[0].red).toBe(true);
    expect(anyCraftNow(fakeCraft(counts))).toBe(true);
  });
  it('数が 2 こ以上なら ×4（や は 4 本）', () => {
    const cards = buildCards(RECIPES, fakeCraft({}), fakeInv({}));
    expect(cards.find((c) => c.id === 'ya')!.countLabel).toBe('×4');
    expect(cards.find((c) => c.id === 'bokuto')!.countLabel).toBe('');
  });
  it('材料が多くても まるは持っている数でうまる（余りは要る数まで）', () => {
    const m = materialViews([{ item: 'log', count: 3 }], (i) => (i === 'log' ? 99 : 0));
    expect(m[0].dots).toEqual([true, true, true]);
    expect(m[0].red).toBe(false);
  });
  it('やく: ねんりょうが無ければ 材料があっても光らない。順番は せきたん → あぶら → き', () => {
    const none = { iron_ore: 1 };
    const bakeNoFuel = buildCards(RECIPES.filter((r) => r.station === 'furnace'), fakeCraft(none), fakeInv(none), { bake: true });
    expect(bakeNoFuel.find((c) => c.id === 'iron_ingot')!.glowing).toBe(false);
    const withFuel = { iron_ore: 1, log: 1 };
    const b2 = buildCards(RECIPES.filter((r) => r.station === 'furnace'), fakeCraft(withFuel), fakeInv(withFuel), { bake: true });
    expect(b2.find((c) => c.id === 'iron_ingot')!.glowing).toBe(true);
    expect(nextFuel((i) => ({ coal_ore: 1, oil: 1, log: 5 })[i as string] ?? 0)).toBe('coal_ore');
    expect(nextFuel((i) => ({ oil: 1, log: 5 })[i as string] ?? 0)).toBe('oil');
    expect(nextFuel((i) => ({ log: 5 })[i as string] ?? 0)).toBe('log');
    expect(nextFuel(() => 0)).toBeNull();
  });
  it('じゅんばんの数 あと N', () => {
    const c = buildCards(RECIPES.filter((r) => r.station === 'furnace'), fakeCraft({}), fakeInv({}), {
      bake: true,
      queued: { iron_ingot: 3 },
    });
    expect(c.find((x) => x.id === 'iron_ingot')!.queued).toBe(3);
    expect(c.find((x) => x.id === 'haniwa')!.queued).toBe(0);
  });
  it('つくれる マーク: 0 → 1 まい以上 になった瞬間だけはねる', () => {
    const h = new HintModel(0.35);
    expect(h.update(false, 1 / 60).hop).toBe(0);
    let max = 0;
    for (let i = 0; i < 30; i++) max = Math.max(max, h.update(true, 1 / 60).hop);
    expect(max).toBeGreaterThan(0.9);
    // 出ているあいだは もうはねない
    for (let i = 0; i < 5; i++) expect(h.update(true, 1 / 60).hop).toBe(0);
    h.update(false, 1 / 60);
    expect(h.update(true, 1 / 60).hop).toBeGreaterThan(0);
  });
});

describe('ツールチップ（AC28）', () => {
  const names: Record<string, string> = {
    stone_pickaxe: 'いしの つるはし',
    naginata: 'なぎなた',
    log: 'き',
    clay: 'ねんど',
    kite: 'たこ',
    crystal_katana: 'きらめく カタナ',
    yumi: 'ゆみ',
    ya: 'や',
    kabuto: 'かぶと',
    furnace: 'かまど',
    coal_ore: 'せきたん',
  };
  const rarity: Record<string, Rarity> = { stone_pickaxe: 'common', crystal_katana: 'superRare', kabuto: 'rare', log: 'common' };
  const deps: TooltipDeps = {
    nameOf: (i) => names[i] ?? i,
    rarityOf: (i) => rarity[i] ?? 'common',
    placeable: (i) => ['log', 'furnace', 'coal_ore'].includes(i),
    recipes: () => [
      ...RECIPES,
      R('stone_pickaxe', ['stone_pickaxe', 1], [['stone', 3], ['log', 2]]),
    ],
  };
  it('いしの つるはし', () => {
    const t = buildTooltip('stone_pickaxe', deps);
    expect(t.name).toBe('いしの つるはし');
    expect(t.rarity).toBe('common');
    expect(t.stars).toBe(1);
    expect(t.lines).toEqual(['ほる つよさ 4', 'てつ も ほれる', 'いし に つよい', 'たいきゅう 131 / 131']);
    expect(t.icons).toHaveLength(t.lines.length);
  });
  it('なぎなた・き・ねんど・たこ', () => {
    expect(buildTooltip('naginata', deps).lines).toEqual(['たたく つよさ 3', 'とおくまで とどく', 'たいきゅう 250 / 250']);
    expect(buildTooltip('log', deps).lines).toEqual(['おける', 'ねんりょう に なる', 'つくる ざいりょう']);
    expect(buildTooltip('clay', deps).lines).toEqual(['かまど で やける']);
    expect(buildTooltip('kite', deps).lines).toEqual(['もうすぐ つかえる']);
  });
  it('ゆみ・や・かぶと・かまど・きらめく カタナ', () => {
    expect(buildTooltip('yumi', deps).lines).toEqual(['や を とばす', 'たたく つよさ 2', 'たいきゅう 384 / 384']);
    expect(buildTooltip('ya', deps).lines).toEqual(['ゆみ で とばす']);
    expect(buildTooltip('kabuto', deps).lines).toEqual(['たま から まもる', 'たいきゅう 165 / 165']);
    expect(buildTooltip('kabuto', deps).stars).toBe(3);
    expect(buildTooltip('furnace', deps).lines).toEqual(['おける', 'みぎクリック で やく']);
    const k = buildTooltip('crystal_katana', deps);
    expect(k.stars).toBe(4);
    expect(k.lines).toEqual(['たたく つよさ 4', 'たいきゅう 400 / 400']);
    expect(rarityCss(k.rarity)).toBe('#' + rarityTier('superRare').color.toString(16).padStart(6, '0'));
  });
  it('数は設定の値を使う', () => {
    const t = buildTooltip('stone_pickaxe', {
      ...deps,
      tools: { toolPower: { stone_pickaxe: 9 }, toolLevel: { stone_pickaxe: 0 }, weaponDamage: {}, arrowDamage: 2 },
    });
    expect(t.lines).toEqual(['ほる つよさ 9', 'いし に つよい', 'たいきゅう 131 / 131']);
  });
});

describe('拾ったときの ログ（AC27）', () => {
  it('同じものは 1 行にまとめて数を足し、時間を戻す', () => {
    const m = new PickupLogModel();
    m.push('dirt', 1);
    expect(m.list()).toEqual([{ item: 'dirt', count: 1, ticksLeft: 180 }]);
    for (let i = 0; i < 60; i++) m.step();
    m.push('dirt', 1);
    expect(m.list()).toEqual([{ item: 'dirt', count: 2, ticksLeft: 180 }]);
    m.push('paper', 3);
    expect(m.list().map((r) => r.item)).toEqual(['dirt', 'paper']);
    expect(m.list()[1]).toEqual({ item: 'paper', count: 3, ticksLeft: 180 });
  });
  it('最後に足してから 180 ステップで消える', () => {
    const m = new PickupLogModel();
    m.push('dirt', 1);
    for (let i = 0; i < 179; i++) m.step();
    expect(m.rows()).toHaveLength(1);
    m.step();
    expect(m.rows()).toHaveLength(0);
  });
  it('5 行まで。6 つ目で いちばん古いのが消える。0 こは出さない', () => {
    const m = new PickupLogModel();
    const items: ItemId[] = ['dirt', 'paper', 'oil', 'string', 'cloth', 'clay'];
    for (const it of items) m.push(it, 1);
    expect(m.rows()).toHaveLength(5);
    expect(m.rows().map((r) => r.item)).toEqual(items.slice(1));
    m.push('crystal', 0);
    expect(m.rows()).toHaveLength(5);
  });
  it('最後の 30 ステップでうすくなる', () => {
    const m = new PickupLogModel();
    m.push('dirt', 1);
    expect(m.opacity(m.rows()[0])).toBe(1);
    for (let i = 0; i < 165; i++) m.step();
    expect(m.opacity(m.rows()[0])).toBeCloseTo(0.5, 5);
  });
});

describe('案内画面の本（BOOK-1。旧 AC22 のタブ）', () => {
  it('章は 5 つで、項目の数が 4・5・13・9・15（週次で たたかう +2・そだてる +3。たたかう 8 → 10 → 11（WEAPON-7 の fight-charge）、そだてる 11 → 12）', () => {
    expect(BOOK_CHAPTERS.map((c) => c.id)).toEqual(['move', 'dig', 'fight', 'craft', 'grow']);
    expect(BOOK_CHAPTERS.map((c) => c.label)).toEqual(['うごく', 'ほる・おく', 'たたかう', 'つくる・やく', 'そだてる']);
    expect(BOOK_CHAPTERS.map((c) => BOOK_ITEMS.filter((i) => i.chapter === c.id).length)).toEqual([4, 5, 13, 9, 15]);
  });
  it('HTML: 「あそびかたの ほん」ボタンが 1 つ。タブ・カードは ない。漢字は ふりがな付き。ボタンは「あそぼう」の下', () => {
    const html = buildOverlayHtml('クリックして あそぼう！');
    expect(findUnrubiedKanji(html)).toEqual([]);
    expect((html.match(/data-book-open/g) ?? []).length).toBe(1);
    expect(html).not.toContain('po-tab');
    expect(html).not.toContain('po-help');
    expect(html.indexOf('po-button')).toBeLessThan(html.indexOf('data-book-open'));
  });
});

describe('かまど の火・けむり・パチパチ', () => {
  it('火の明るさは 0.6〜1 で、1 秒に 3 回未満のゆれ', () => {
    const cfg = CRAFT_UI_SETTINGS;
    expect(cfg.flameHz1).toBeLessThan(3);
    expect(cfg.flameHz2).toBeLessThan(3);
    let lo = 9;
    let hi = 0;
    for (let i = 0; i < 600; i++) {
      const v = flameLevel(i / 60);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(0.6);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi - lo).toBeGreaterThan(0.1);
  });
  it('けむりは燃えているときだけ出て、プールをこえない', () => {
    const pool = new SmokePool(createRng(1));
    const off: FurnaceFxEntry = { x: 1, y: 1, z: 1, burning: false, waiting: null };
    for (let i = 0; i < 120; i++) pool.update(1 / 60, [off]);
    expect(pool.activeCount()).toBe(0);
    const on = { ...off, burning: true };
    for (let i = 0; i < 600; i++) pool.update(1 / 60, [on, { ...on, x: 5 }, { ...on, x: 9 }]);
    expect(pool.activeCount()).toBeGreaterThan(0);
    expect(pool.activeCount()).toBeLessThanOrEqual(CRAFT_UI_SETTINGS.smokeMax);
    const top = Math.max(...pool.puffs.filter((p) => p.active).map((p) => p.y));
    expect(top).toBeGreaterThan(1.05);
  });
  it('パチパチは 8 ブロック以内の燃えている かまど のうち いちばん近い 1 つだけ', () => {
    const f = (x: number, burning = true): FurnaceFxEntry => ({ x, y: 0, z: 0, burning, waiting: null });
    expect(crackleTarget([f(20)], 0.5, 0.5, 0.5)).toBeNull();
    expect(crackleTarget([f(3, false)], 0.5, 0.5, 0.5)).toBeNull();
    expect(crackleTarget([f(6), f(2), f(4)], 0.5, 0.5, 0.5)?.x).toBe(2);
    expect(crackleTarget([f(8)], 0.5, 0.5, 0.5)).not.toBeNull();
    expect(crackleTarget([f(9)], 0.5, 0.5, 0.5)).toBeNull();
    const d = nextCrackleDelay(createRng(3));
    expect(d).toBeGreaterThanOrEqual(CRAFT_UI_SETTINGS.crackleMinInterval);
    expect(d).toBeLessThanOrEqual(CRAFT_UI_SETTINGS.crackleMaxInterval);
  });
});

describe('M4 の音', () => {
  it('15 こ以上、どれも短く小さい（2 秒以内・音量 0.8 以下）', () => {
    const names = Object.keys(CRAFT_SOUNDS);
    expect(names.length).toBeGreaterThanOrEqual(15);
    for (const [n, tones] of Object.entries(CRAFT_SOUNDS)) {
      for (const t of tones as readonly Tone[]) {
        expect(t.delay + t.dur, n).toBeLessThan(2);
        expect(t.gain, n).toBeLessThanOrEqual(0.8);
        expect(t.f0).toBeGreaterThan(20);
        expect(t.f1).toBeGreaterThan(20);
      }
    }
  });
  it('出来事に合わせて鳴り、拾った出来事はログへ（つくった・テスト用 add は出さない）', () => {
    const played: (readonly Tone[])[] = [];
    const sound = { playTones: (t: readonly Tone[]) => void played.push(t) };
    const pushed: [ItemId, number][] = [];
    const events: CraftEvent[] = [
      { type: 'craft', tick: 1, recipe: 'bokuto', item: 'bokuto', count: 1 },
      { type: 'craftFail', tick: 2, recipe: 'bokuto', reason: 'missing' },
      { type: 'bakeStart', tick: 3, recipe: 'iron_ingot', fuel: 'log', position: { x: 0, y: 0, z: 0 } },
      { type: 'bakeDone', tick: 4, recipe: 'iron_ingot', item: 'iron_ingot', count: 1, position: { x: 0, y: 0, z: 0 } },
      { type: 'pickup', tick: 5, item: 'iron_ingot', count: 1 },
    ];
    handleCraftEvents(events, { sound, pickupLog: { push: (i, c) => void pushed.push([i, c]) } });
    expect(played).toHaveLength(4);
    expect(pushed).toEqual([['iron_ingot', 1]]);
    playCraft(sound, 'tab');
    expect(played).toHaveLength(5);
  });
  it('うでの動きに合わせた音', () => {
    expect(swingSounds('slash', 'katana')).toEqual(['slash']);
    expect(swingSounds('slash', 'crystal_katana')).toEqual(['slash', 'sparkle']);
    expect(swingSounds('thrust', 'naginata')).toEqual(['naginata']);
    expect(swingSounds('sweep', 'naginata')).toEqual(['naginata']);
    expect(swingSounds('draw', 'yumi')).toEqual(['bowDraw']);
    expect(swingSounds('release', 'yumi')).toEqual(['bowRelease']);
    expect(swingSounds('punch', null)).toEqual([]);
  });
});
