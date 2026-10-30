import { expect, test } from '@playwright/test';
import { flatArea, openGame } from './helpers/audio';
import { readTiers, toRgb, toggleInventory } from './helpers/rarity';

/**
 * RARITY-7（#80）めずらしさ 7 段階。仕様書 docs/design/RARITY-7.md の AC14・AC15。
 * 色・形・ことばは決め打ちせず、ゲームの表（__rikkun.rarity.tiers()）に聞く。
 * 当てはめは案 A（katana = rare = index 2、5〜7 段目は 0 こ）で書く。
 */

// 持ち物の画面を開いて step を回す重い場面が多く、ほかの重いテストと並ぶと 60 秒をこえることがある（#180 の調査: 単独で 28〜44 秒。細かいメッシュの有無とは関係ない）
test.describe.configure({ timeout: 120_000 });

const IDS = ['common', 'uncommon', 'rare', 'superRare', 'epic', 'mythic', 'legendary'];
const DROP_MAX = [4, 3, 2, 1, 1, 1, 1];

test('AC14 つなぎ: 7 つの段が ホットバー・ツールチップ・つくる画面・たんす に同じ表で出る', async ({ page }) => {
  await openGame(page);
  const { bx, by, bz } = await flatArea(page);
  const tiers = await readTiers(page);

  expect(tiers).toHaveLength(7);
  expect(tiers.map((t) => t.id)).toEqual(IDS);
  expect(tiers.map((t) => t.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(tiers.map((t) => t.stars)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(tiers.map((t) => t.dropMax)).toEqual(DROP_MAX);

  // たんす（かたなを 1 マス目に入れておく）
  const tx = bx + 2;
  await page.evaluate(
    ({ tx, by, bz }) => {
      const h = (window as any).__rikkun;
      h.world.setBlock(tx, by, bz, 'tansu');
      h.step(2);
    },
    { tx, by, bz },
  );

  for (const t of tiers) {
    // 持ち物の画面 + ホットバー + ツールチップ + つくる画面
    await page.evaluate((id) => {
      const h = (window as any).__rikkun;
      h.settings.set('itemRarity', { katana: id });
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'katana', count: 1 });
      // つくる画面は ざいりょうを 1 つでも もっているレシピだけ出す。かたなの レシピ（てつの かたまり・き）の ざいりょうを 1 つ入れておく
      h.inventory.setSlot(2, { item: 'iron_ingot', count: 1 });
      h.inventory.select(1); // えらんだ枠の色とまざらないように、かたなの マスは えらばない
      h.step(2);
    }, t.id);
    await toggleInventory(page);
    const slot = page.locator('#hotbar .slot[data-item="katana"]');
    await expect(slot, t.id).toHaveAttribute('data-rarity', String(t.index));
    // 宝石の印は出さない（yuzu 2026-10-30）。レア度は ★ の数とふちの色だけ
    await expect(slot.locator('.slot-gem'), `${t.id} 印なし`).toHaveCount(0);
    await expect(page.locator('#hotbar .slot-gem'), `${t.id} 印なし`).toHaveCount(0);
    const border = await slot.evaluate((e) => getComputedStyle(e).borderColor);
    expect(border, `${t.id} ふちの色`).toBe(toRgb(t.color));

    const info = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.hover(0);
      h.craft.hover('katana');
      h.step(3);
      return { tip: h.inventory.tooltip(), craft: h.craft.info('katana') };
    });
    expect(info.tip?.rarity, `${t.id} ツールチップ rarity`).toBe(t.id);
    expect(info.tip?.stars, `${t.id} ツールチップ stars`).toBe(t.stars);
    expect(info.craft.stars, `${t.id} craft.info stars`).toBe(t.stars);
    expect(info.craft.rarityWord, `${t.id} craft.info rarityWord`).toBe(t.word);

    const stars = (await page.locator('.cp-detail .cp-stars').textContent()) ?? '';
    expect(stars.split('★').length - 1, `${t.id} せつめいの ★`).toBe(t.stars);
    await expect(page.locator('.cp-detail .cp-word'), t.id).toHaveText(t.word);
    await toggleInventory(page);

    // たんす
    await page.evaluate(
      ({ tx, by, bz }) => {
        const h = (window as any).__rikkun;
        h.storage.set(tx, by, bz, 0, { item: 'katana', count: 1 });
        h.storage.open(tx, by, bz);
        h.step(3);
      },
      { tx, by, bz },
    );
    const cell = page.locator('.tansu-grid [data-tansu="0"]');
    await expect(cell, `${t.id} たんすのマス`).toHaveAttribute('data-rarity', String(t.index));
    const tb = await cell.evaluate((e) => getComputedStyle(e).borderColor);
    expect(tb, `${t.id} たんすのふち`).toBe(toRgb(t.color));
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.storage.close();
      h.step(3);
    });
  }
});

test('AC15 通し: 当てはめ・atLeast・落とした袋・はじめて作った横断幕の ★ 7 こ', async ({ page }) => {
  await openGame(page);
  await flatArea(page);

  // 初期のまま（案 A）
  const init = await page.evaluate(() => {
    const r = (window as any).__rikkun.rarity;
    return { epic: r.atLeast('katana', 'epic'), common: r.atLeast('katana', 'common'), idx: r.of('katana').index };
  });
  expect(init).toEqual({ epic: false, common: true, idx: 2 });

  // legendary にして 落とす
  const bag = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.settings.set('itemRarity', { katana: 'legendary' });
    const ok = h.rarity.atLeast('katana', 'legendary');
    h.inventory.clear();
    h.inventory.setSlot(0, { item: 'katana', count: 1 });
    h.inventory.select(0);
    h.step(2);
    const before = h.combat.bags().length;
    h.input.press('drop');
    h.step(2);
    h.input.release('drop');
    let bags = h.combat.bags();
    for (let i = 0; i < 40 && bags.length <= before; i++) {
      h.step(10);
      bags = h.combat.bags();
    }
    return { ok, grew: bags.length > before, rarity: bags[bags.length - 1]?.rarity };
  });
  expect(bag.ok).toBe(true);
  expect(bag.grew).toBe(true);
  expect(bag.rarity).toBe('legendary');

  // はじめて作った横断幕（wood_pickaxe を legendary にして作る）
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.settings.set('itemRarity', { wood_pickaxe: 'legendary' });
    h.inventory.clear();
    h.inventory.add('log', 6);
    h.step(2);
  });
  await toggleInventory(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.craft.tileClick('wood_pickaxe');
    h.craft.tileClick('wood_pickaxe');
    h.step(40);
  });
  const name = (await page.locator('.cel-banner__name').first().textContent()) ?? '';
  expect(name.split('★').length - 1).toBe(7);
});
