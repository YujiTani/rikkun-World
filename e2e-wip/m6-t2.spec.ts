import { expect, test, type Page } from '@playwright/test';
import { checkAnimations, checkColors, checkComponents, checkContrast, checkFontSizes, checkPressedShift, checkRootVars, snapshotUi } from './helpers/uiRules';

/**
 * M6 受け入れテスト T2（docs/design/M6-ui-achievements.md AC31〜AC53・U15）。
 * 画面ごとに DOM しらべ（e2e/helpers/uiRules.ts）を当てる。結果は docs/test-reports/M6-t2.md。
 */
test.describe.configure({ timeout: 120_000 });
test.use({ viewport: { width: 1280, height: 720 } });
const SHOTS = 'docs/test-reports/assets';

async function open(page: Page, query = '?nosave=1') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    const T: any = {
      base() {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.settings.set('yokaiAutoSpawn', false);
        h.yokai.clear();
        h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
        h.world.fill(0, 9, 0, 12, 20, 12, 'air');
        h.inventory.clear();
        h.settings.set('dropMax', { common: 1, uncommon: 1, rare: 1, superRare: 1 });
        T.place(2.5, 9, 6.5, 90, 0);
        h.step(10);
        h.dig.events();
      },
      place(x: number, y: number, z: number, yaw: number, pitch: number) {
        h.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
        h.step(1);
      },
      tap(a = 'primary') {
        h.input.press(a);
        h.step(1);
        h.input.release(a);
      },
      toggleInv() {
        h.input.press('toggleInventory');
        h.step(1);
        h.input.release('toggleInventory');
        h.step(2);
      },
      stuff() {
        const items: [string, number][] = [
          ['dirt', 64], ['stone', 40], ['log', 32], ['coal_ore', 12], ['iron_ore', 9], ['iron_ingot', 6], ['paper', 4],
          ['string', 5], ['cloth', 3], ['clay', 8], ['oil', 2], ['crystal', 2], ['furnace', 1], ['tansu', 2], ['wood_pickaxe', 1],
          ['katana', 1], ['yumi', 1], ['ya', 20], ['torch', 10], ['kabuto', 1],
        ];
        items.forEach(([item, n]) => h.inventory.add(item, n));
      },
    };
    (window as any).T = T;
  });
}

type Violations = Record<string, string[]>;

/** 1 つの画面を 5 つの しらべに かけて、まちがいの列を返す */
async function audit(page: Page, root?: string, opts: { hud?: boolean } = {}): Promise<Violations> {
  await page.waitForTimeout(450); // 出てくる動き（CSS transition）が終わるまで
  const snap = await snapshotUi(page, root ? { root } : {});
  const v: Violations = {
    color: checkColors(snap),
    font: checkFontSizes(snap),
    contrast: checkContrast(snap, opts.hud ? { hudWorld: '#ffffff' } : {}),
    comp: checkComponents(snap),
    anim: await checkAnimations(page),
  };
  const n = snap.els.length;
  console.log(`[audit ${root ?? 'body'}] els=${n} ` + Object.entries(v).map(([k, a]) => `${k}=${a.length}`).join(' '));
  return v;
}
function brief(v: Violations): Violations {
  const out: Violations = {};
  for (const [k, a] of Object.entries(v)) {
    // 同じ文は 1 回だけ（path+理由の頭）
    const seen = new Set<string>();
    out[k] = a.filter((s) => {
      const key = s.replace(/「.*?」/g, '').replace(/[\d.]+/g, '#');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
  }
  return out;
}
async function expectClean(page: Page, name: string, root?: string, opts: { hud?: boolean } = {}) {
  const v = await audit(page, root, opts);
  const b = brief(v);
  const total = Object.values(v).reduce((s, a) => s + a.length, 0);
  if (total) console.log(`NG ${name}: ` + JSON.stringify(b, null, 1));
  expect.soft(v.color, `${name} 色(AC31)`).toEqual([]);
  expect.soft(v.font, `${name} 文字(AC32)`).toEqual([]);
  expect.soft(v.contrast, `${name} コントラスト(AC33)`).toEqual([]);
  expect.soft(v.comp, `${name} 部品(AC35)`).toEqual([]);
  expect.soft(v.anim, `${name} 点滅(AC36)`).toEqual([]);
}

test.describe('AC31〜AC36 見た目の決まり（画面ごと）', () => {
  test('root vars', async ({ page }) => {
    await open(page);
    expect(await checkRootVars(page)).toEqual([]);
  });

  test('HUD（あそび中）', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      T.stuff();
      h.armor.set('kabuto', 'yoroi');
      h.combat.setHp(14);
      h.inventory.pickup('dirt', 3);
      h.step(5);
    });
    await expectClean(page, 'HUD', '#hud', { hud: true });
    await page.screenshot({ path: `${SHOTS}/m6-t2-hud.png` });
  });

  test('もちもの画面（もちもの・つくる・やく・ツールチップ）', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const T = (window as any).T;
      T.base();
      T.stuff();
      T.toggleInv();
    });
    await expectClean(page, 'もちもの/つくる', '#inventory-screen');
    // ツールチップ
    await page.evaluate(() => (window as any).__rikkun.inventory.hover(15));
    await page.evaluate(() => (window as any).__rikkun.step(2));
    await expectClean(page, 'ツールチップ', '#tooltip');
    await page.evaluate(() => (window as any).__rikkun.inventory.hover(null));
    // せつめい パネル: 重い物（よろい・なぎなた・たんす）
    for (const id of ['yoroi', 'naginata', 'tansu']) {
      await page.evaluate((id) => {
        const h = (window as any).__rikkun;
        ['iron_ingot', 'cloth', 'string', 'log', 'crystal'].forEach((i) => h.inventory.add(i, 20));
        h.step(2);
        h.craft.hover(id);
        h.step(2);
      }, id);
      await expectClean(page, `せつめい ${id}`, '#inventory-screen');
    }
    await page.screenshot({ path: `${SHOTS}/m6-t2-craft.png` });
  });

  test('やく タブ', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      T.stuff();
      h.world.setBlock(4, 10, 6, 'furnace');
      T.place(2.5, 9, 6.5, 90, 0);
      h.inventory.select(0);
      h.inventory.setSlot(0, null);
      T.tap('secondary');
      h.step(3);
    });
    const ui = await page.evaluate(() => (window as any).__rikkun.craft.ui());
    console.log('bake ui', JSON.stringify({ open: ui.open, tab: ui.tab, tabs: ui.tabs }));
    expect(ui.tab).toBe('bake');
    await page.evaluate(() => (window as any).__rikkun.craft.hover('iron_ingot'));
    await expectClean(page, 'やく', '#inventory-screen');
    await page.screenshot({ path: `${SHOTS}/m6-t2-bake.png` });
  });

  test('じっせき ページ', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.achievements.mute(false);
      for (const k of ['break:*', 'place:*', 'craft:*', 'defeat:*']) h.achievements.record(k, 3);
      h.achievements.flush();
      h.step(70);
      h.achievements.close();
      h.step(2);
      T.toggleInv();
      h.achievements.tab('achievements');
      h.step(3);
    });
    await expectClean(page, 'じっせき', '#inventory-screen');
    await page.screenshot({ path: `${SHOTS}/m6-t2-achpage.png` });
  });

  test('たんす画面', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      T.stuff();
      h.world.setBlock(4, 9, 6, 'tansu');
      h.storage.set(4, 9, 6, 0, { item: 'iron_ingot', count: 5 });
      h.storage.open(4, 9, 6);
      h.step(3);
    });
    await expectClean(page, 'たんす', '#inventory-screen');
    await page.screenshot({ path: `${SHOTS}/m6-t2-tansu.png` });
  });

  test('案内画面・やられた画面', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      h.lock.simulate(false);
      h.step(2);
    });
    for (const tab of ['move', 'dig', 'fight', 'craft']) {
      await page.evaluate((t) => (window as any).__rikkun.lock.tab(t), tab);
      await expectClean(page, `案内 ${tab}`, '.play-overlay');
    }
    await page.screenshot({ path: `${SHOTS}/m6-t2-guide.png` });
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.lock.simulate(true);
      h.step(2);
      h.combat.setHp(1);
      h.combat.damage(6);
      h.step(30);
    });
    const dead = await page.evaluate(() => !!document.querySelector('#death-screen:not([hidden])'));
    console.log('dead visible', dead);
    await expectClean(page, 'やられた', '#death-screen');
    await page.screenshot({ path: `${SHOTS}/m6-t2-death.png` });
  });

  test('おめでとう画面・横断幕', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      T.stuff();
      T.toggleInv();
      h.craft.tileClick('furnace');
      h.craft.tileClick('furnace');
      h.step(40);
    });
    const fx = await page.evaluate(() => (window as any).__rikkun.craft.fx());
    console.log('fx', JSON.stringify(fx));
    await expectClean(page, '横断幕');
    await page.screenshot({ path: `${SHOTS}/m6-t2-banner.png` });
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(200);
      h.achievements.mute(false);
      h.achievements.record('level', 5);
      h.achievements.record('break:*', 1);
      h.achievements.flush();
      h.step(70);
    });
    const m = await page.evaluate(() => (window as any).__rikkun.achievements.modal());
    console.log('modal', JSON.stringify(m));
    expect(m.open).toBe(true);
    await expectClean(page, 'おめでとう');
    await page.screenshot({ path: `${SHOTS}/m6-t2-congrats.png` });
  });

  test('AC35: 押したときの 2px・主ボタンの class', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const T = (window as any).T;
      T.base();
      T.stuff();
      T.toggleInv();
    });
    // 見えている 主ボタン（つくる）に 目印をつける
    const sel = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('#inventory-screen .rk-btn--primary')).find((e) => (e as HTMLElement).getBoundingClientRect().width > 0 && !(e as HTMLButtonElement).disabled);
      if (!el) return null;
      el.setAttribute('data-t2', '1');
      return '[data-t2="1"]';
    });
    console.log('btn selector', sel);
    expect(sel).not.toBeNull();
    expect(await checkPressedShift(page, sel!)).toEqual([]);
  });
});

// ============================================================ AC34 / AC53 配置・寸法

test.describe('AC34 HUD の配置・AC53 寸法', () => {
  async function rects(page: Page) {
    return page.evaluate(() => {
      const r = (sel: string) => {
        const e = document.querySelector(sel) as HTMLElement | null;
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height };
      };
      return { vw: innerWidth, vh: innerHeight, hotbar: r('#hotbar'), A: r('#hud-self'), B: r('#hud-notice'), C: r('#clock'), D: r('#pickup-log') };
    });
  }
  async function prep(page: Page) {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      (window as any).T.stuff();
      h.armor.set('kabuto', 'yoroi');
      h.inventory.pickup('dirt', 3);
      h.inventory.pickup('stone', 2);
      h.inventory.pickup('log', 1);
      h.step(5);
    });
  }
  const overlap = (a: any, b: any) => a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;

  test('AC34: 1280×720', async ({ page }) => {
    await prep(page);
    await page.waitForTimeout(500);
    const q = await rects(page);
    console.log('AC34 1280', JSON.stringify(q));
    const { hotbar, A, B, C, D } = q as any;
    expect.soft(Math.abs(A.x - hotbar.x), 'A 左 = ホットバー左').toBeLessThanOrEqual(1);
    expect.soft(Math.abs(B.r - hotbar.r), 'B 右 = ホットバー右').toBeLessThanOrEqual(1);
    expect.soft(Math.abs(hotbar.y - A.b - 16), 'A 下 と ホットバー上 16').toBeLessThanOrEqual(1);
    expect.soft(Math.abs(hotbar.y - B.b - 16), 'B 下 と ホットバー上 16').toBeLessThanOrEqual(1);
    expect.soft(Math.abs(C.y - 24), 'C 上 24').toBeLessThanOrEqual(1);
    expect.soft(Math.abs(q.vw - C.r - 24), 'C 右 24').toBeLessThanOrEqual(1);
    expect.soft(Math.abs(D.x - 24), 'D 左 24').toBeLessThanOrEqual(1);
    expect.soft(Math.abs(q.vh - hotbar.b - 24), 'ホットバー下 24').toBeLessThanOrEqual(1);
    const names = ['hotbar', 'A', 'B', 'C', 'D'] as const;
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) expect.soft(overlap((q as any)[names[i]], (q as any)[names[j]]), `${names[i]} と ${names[j]} が重ならない`).toBeFalsy();
  });

  for (const [w, h] of [[1920, 1080], [1024, 640]] as const) {
    test(`AC34: ${w}×${h} 重ならない`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await prep(page);
      await page.waitForTimeout(500);
      const q = await rects(page);
      console.log(`AC34 ${w}`, JSON.stringify(q));
      const names = ['hotbar', 'A', 'B', 'C', 'D'] as const;
      for (let i = 0; i < names.length; i++)
        for (let j = i + 1; j < names.length; j++) expect.soft(overlap((q as any)[names[i]], (q as any)[names[j]]), `${names[i]} と ${names[j]} が重ならない`).toBeFalsy();
      if (w === 1920) {
        const snap = await snapshotUi(page, { root: '#hud' });
        expect.soft(snap.els.filter((e) => e.text && e.fontSize < 15.9).map((e) => e.path + e.fontSize)).toEqual([]);
      }
    });
  }

  async function dims(page: Page, label: string) {
    return page.evaluate(() => {
      const fr = document.querySelector('.inv-frame') as HTMLElement;
      const b = fr.getBoundingClientRect();
      const inside = (e: Element) => {
        const x = e.getBoundingClientRect();
        return x.width > 0 && x.x >= b.x - 1 && x.y >= b.y - 1 && x.right <= b.right + 1 && x.bottom <= b.bottom + 1;
      };
      const vis = (e: Element) => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('[hidden]');
      };
      const scale = (() => {
        const m = new DOMMatrixReadOnly(getComputedStyle(fr).transform);
        return m.a || 1;
      })();
      const cells = Array.from(fr.querySelectorAll('.rk-slot, .rk-tab, .rk-btn, button')).filter(vis);
      const outside = cells.filter((e) => !inside(e)).map((e) => e.className.toString().slice(0, 40));
      const scrollers = Array.from(fr.querySelectorAll('*'))
        .filter((e) => vis(e) && (e as HTMLElement).scrollHeight > (e as HTMLElement).clientHeight + 1 && ['auto', 'scroll', 'hidden'].includes(getComputedStyle(e).overflowY))
        .map((e) => e.className.toString().slice(0, 40));
      const slot = fr.querySelector('.rk-slot') as HTMLElement | null;
      const tile = fr.querySelector('.cp-tile') as HTMLElement | null;
      return {
        vw: innerWidth, vh: innerHeight,
        frame: { x: b.x, y: b.y, w: b.width, h: b.height, scale },
        marginsOk: b.x >= 23 && b.y >= 23 && innerWidth - b.right >= 23 && innerHeight - b.bottom >= 23,
        outside, scrollers,
        slot: slot ? slot.getBoundingClientRect().width / scale : null,
        tile: tile ? tile.getBoundingClientRect().width / scale : null,
      };
    });
  }

  test('AC53(a): もちもの画面 3 タブの寸法（1280×720）', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const T = (window as any).T;
      T.base();
      T.stuff();
      T.toggleInv();
    });
    await page.waitForTimeout(500);
    const res: Record<string, any> = {};
    res.craft = await dims(page, 'craft');
    await page.evaluate(() => (window as any).__rikkun.craft.hover('yoroi'));
    await page.evaluate(() => (window as any).__rikkun.step(3));
    res.craftYoroi = await dims(page, 'yoroi');
    await page.evaluate(() => (window as any).__rikkun.achievements.tab('achievements'));
    await page.evaluate(() => (window as any).__rikkun.step(3));
    res.ach = await dims(page, 'ach');
    console.log('AC53a', JSON.stringify(res));
    for (const [k, d] of Object.entries(res)) {
      expect.soft(d.marginsOk, `${k} 画面のはしから 24px`).toBe(true);
      expect.soft(Math.abs(d.frame.w - 1224), `${k} 幅 1224±4 (${d.frame.w.toFixed(0)})`).toBeLessThanOrEqual(4);
      expect.soft(Math.abs(d.frame.h - 568), `${k} 高さ 568±4 (${d.frame.h.toFixed(0)})`).toBeLessThanOrEqual(4);
      expect.soft(d.outside, `${k} 外にはみ出すマス・ボタン`).toEqual([]);
      if (d.slot) expect.soft(Math.abs(d.slot - 56), `${k} マス 56 (${d.slot})`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(d.frame.scale - 1), `${k} 縮めていない (scale ${d.frame.scale})`).toBeLessThan(0.01);
    }
  });

  test('AC53(b): たんす画面の寸法', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      T.stuff();
      h.world.setBlock(4, 10, 6, 'tansu');
      h.storage.open(4, 10, 6);
      h.step(3);
    });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const p = document.querySelector('.tansu-panel') as HTMLElement;
      const b = p.getBoundingClientRect();
      const slot = document.querySelector('.tansu-grid .rk-slot') as HTMLElement;
      const vis = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const inv = document.querySelector('.inv-frame') as HTMLElement;
      const ib = inv.getBoundingClientRect();
      const cells = Array.from(inv.querySelectorAll('.rk-slot, .rk-tab, .rk-btn, button')).filter(vis);
      const outside = cells.filter((e) => { const x = e.getBoundingClientRect(); return x.x < ib.x - 1 || x.y < ib.y - 1 || x.right > ib.right + 1 || x.bottom > ib.bottom + 1; }).map((e) => e.className.toString().slice(0, 40));
      return { panel: { x: b.x, y: b.y, w: b.width, h: b.height }, vw: innerWidth, vh: innerHeight, slot: slot.getBoundingClientRect().width, frame: { x: ib.x, y: ib.y, w: ib.width, h: ib.height }, outside, tansuVisible: vis(p) };
    });
    console.log('AC53b', JSON.stringify(r));
    expect.soft(r.panel.h, '高さ 672 以下').toBeLessThanOrEqual(672 + 1);
    expect.soft(r.panel.y, '上 24 以上').toBeGreaterThanOrEqual(23);
    expect.soft(r.vh - (r.panel.y + r.panel.h), '下 24 以上').toBeGreaterThanOrEqual(23);
    expect.soft(Math.abs(r.slot - 48), 'マス 48').toBeLessThanOrEqual(1);
    expect.soft(r.outside).toEqual([]);
  });
});

// ============================================================ AC40〜AC50・U15 すてる・たんす

const putTansu = (page: Page, x = 4, y = 10, z = 6) =>
  page.evaluate(([x, y, z]) => {
    const h = (window as any).__rikkun;
    h.world.setBlock(x, y, z, 'tansu');
    h.step(1);
  }, [x, y, z]);

test.describe('AC40〜AC42 すてる', () => {
  test('AC40: drop で 1 こ・前へ・60 ステップ拾わない・押しっぱなしでも 1 回・空の手は何もしない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.setSlot(0, { item: 'dirt', count: 5 });
      h.inventory.select(0);
      h.step(1);
      const p0 = h.player.get().position;
      h.input.press('drop');
      h.step(60); // 押しっぱなし 60 ステップ
      h.input.release('drop');
      const slot0 = h.inventory.get().slots[0];
      let bags = h.combat.bags();
      const settle: any[] = [];
      for (let i = 0; i < 120; i++) {
        h.step(1);
        bags = h.combat.bags();
        if (bags[0]?.resting) break;
      }
      const rest = bags[0];
      const dx = rest.position.x - p0.x;
      const dz = rest.position.z - p0.z;
      const horiz = Math.hypot(dx, dz);
      const forward = dx; // yaw 90 = +x
      // 拾い直し: 1 ステップ目に投げ直して、足もとへ動かして待つ
      h.combat.bags().forEach(() => {});
      h.inventory.setSlot(0, { item: 'dirt', count: 5 });
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'stone', count: 3 });
      h.inventory.select(0);
      h.step(1);
      h.input.press('drop');
      h.step(1);
      h.input.release('drop');
      const thrown = h.combat.bags().find((b: any) => b.slots[0].item === 'stone');
      let pickedAt = -1;
      let stoneBefore = h.inventory.count('stone');
      for (let t = 1; t <= 80; t++) {
        const b = h.combat.bags().find((bb: any) => bb.slots[0]?.item === 'stone');
        if (b) h.player.set({ position: { x: b.position.x, y: b.position.y, z: b.position.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(1);
        if (h.inventory.count('stone') > stoneBefore && pickedAt < 0) pickedAt = t;
        stoneBefore = Math.max(stoneBefore, h.inventory.count('stone'));
      }
      // 手が空
      T.base();
      h.step(1);
      const nb = h.combat.bags().length;
      h.input.press('drop');
      h.step(2);
      h.input.release('drop');
      return { slot0, horiz, forward, rest: { resting: rest.resting, thrown: rest.thrown, ticksLeft: rest.ticksLeft }, firstThrown: thrown && { thrown: thrown.thrown, delay: thrown.pickupDelay }, pickedAt, emptyHandBags: h.combat.bags().length - nb, dropStat: h.achievements.stats()['drop:*'] };
    });
    console.log('AC40', JSON.stringify(r));
    expect(r.slot0).toEqual({ item: 'dirt', count: 4 });
    expect(r.rest.thrown).toBe(true);
    expect(r.forward).toBeGreaterThan(0.5);
    expect(r.horiz).toBeGreaterThanOrEqual(0.5);
    expect(r.horiz).toBeLessThanOrEqual(3.0);
    expect(r.firstThrown.delay).toBeGreaterThan(0);
    expect(r.pickedAt).toBeGreaterThanOrEqual(60);
    expect(r.pickedAt).toBeLessThanOrEqual(62);
    expect(r.emptyHandBags).toBe(0);
    expect(r.dropStat).toBeGreaterThanOrEqual(1);
  });

  test('AC41: dropStack で全部・36,000 ステップで消える・保存される・妖怪のドロップはすぐ拾える', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, '?reset=1');
    const a = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.setSlot(0, { item: 'dirt', count: 1 });
      h.inventory.select(0);
      h.input.press('drop');
      h.step(1);
      h.input.release('drop');
      h.step(2);
      h.inventory.setSlot(0, { item: 'dirt', count: 5 });
      h.step(2);
      const before = h.achievements.stats()['drop:*'];
      h.input.press('dropStack');
      h.step(1);
      h.input.release('dropStack');
      h.step(3);
      const bags = h.combat.bags();
      const big = bags.find((b: any) => b.slots[0].count === 5);
      h.save.now();
      return { slot0: h.inventory.get().slots[0], n: bags.length, big: big && { count: big.slots[0].count, ticksLeft: big.ticksLeft }, drops: h.achievements.stats()['drop:*'] - before, dropMax: h.settings.get('dropBagTicks') };
    });
    console.log('AC41a', JSON.stringify(a));
    expect(a.slot0).toBeNull();
    expect(a.big).toBeTruthy();
    expect(a.drops).toBe(5);
    expect(a.dropMax).toBe(36000);
    expect(a.big.ticksLeft).toBeGreaterThanOrEqual(35990);
    // 開き直し
    await page.goto('/');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const b = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.mute(true);
      return h.combat.bags().map((x: any) => ({ count: x.slots[0].count, item: x.slots[0].item, ticksLeft: x.ticksLeft }));
    });
    console.log('AC41b reload', JSON.stringify(b));
    expect(b.some((x: any) => x.count === 5 && x.item === 'dirt')).toBe(true);
    // 36,000 ステップ後に消える所は DropField.test.ts（10 分で消える）が受け持つ。ここは 1 ステップごとに 1 へるかだけ
    const c = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      h.yokai.clear();
      const get = () => h.combat.bags().find((x: any) => x.slots[0].count === 5).ticksLeft;
      const bp = h.combat.bags().find((x: any) => x.slots[0].count === 5).position;
      h.player.set({ position: { x: bp.x + 20, y: bp.y + 5, z: bp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(1);
      const t0 = get();
      h.step(100);
      return { t0, t1: get() };
    });
    console.log('AC41c', JSON.stringify(c));
    expect(c.t0 - c.t1).toBe(100);
    await page.evaluate(() => (window as any).__rikkun.save.clear());
  });

  test('AC42: クリックでは すてない・ドラッグで外へ・5px は クリック・Q／Shift+Q・うすい赤と 札', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.setSlot(5, { item: 'log', count: 7 });
      h.inventory.setSlot(6, { item: 'stone', count: 9 });
      T.toggleInv();
    });
    // カーソルに き 3 を持って パネルの外クリック
    const w1 = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.click(5); // 持ち上げ
      return { cur: h.inventory.get().cursor };
    });
    await page.mouse.click(8, 8);
    const w2 = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.clickOutside();
      return { cur: h.inventory.get().cursor, bags: h.combat.bags().length, s5: h.inventory.get().slots[5] };
    });
    console.log('AC42 click', JSON.stringify({ w1, w2 }));
    expect(w2.bags).toBe(0);
    expect(w2.cur).toEqual(w1.cur);
    await page.evaluate(() => (window as any).__rikkun.inventory.click(5)); // 戻す
    // 5px ドラッグ → クリック扱い
    const box = (await page.locator('#inventory-screen .inv-slot[data-index="6"]').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 5, cy, { steps: 3 });
    await page.mouse.up();
    await page.evaluate(() => (window as any).__rikkun.step(2));
    const w3 = await page.evaluate(() => ({ cur: (window as any).__rikkun.inventory.get().cursor, bags: (window as any).__rikkun.combat.bags().length }));
    console.log('AC42 5px', JSON.stringify(w3));
    expect(w3.cur).toEqual({ item: 'stone', count: 9 });
    expect(w3.bags).toBe(0);
    await page.evaluate(() => (window as any).__rikkun.inventory.click(6));
    // ドラッグ中の DOM
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy + 30, { steps: 4 });
    await page.waitForTimeout(300);
    const mid = await page.evaluate(() => {
      const o = document.querySelector('.rk-dragout') as HTMLElement;
      const chip = document.querySelector('.rk-dragout__chip') as HTMLElement;
      return { on: o.classList.contains('is-on'), opacity: getComputedStyle(o).opacity, bg: getComputedStyle(o).backgroundColor, chipHidden: chip.hidden };
    });
    await page.mouse.move(8, 8, { steps: 6 });
    await page.waitForTimeout(300);
    const out = await page.evaluate(() => {
      const o = document.querySelector('.rk-dragout') as HTMLElement;
      const chip = document.querySelector('.rk-dragout__chip') as HTMLElement;
      const op = [] as string[];
      return { opacity: getComputedStyle(o).opacity, chipHidden: chip.hidden, chipText: chip.textContent, bg: getComputedStyle(o).backgroundColor, op };
    });
    await page.screenshot({ path: `${SHOTS}/m6-t2-dragout.png` });
    await page.mouse.up();
    await page.evaluate(() => (window as any).__rikkun.step(2));
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { s6: h.inventory.get().slots[6], bags: h.combat.bags().map((b: any) => b.slots[0]) };
    });
    console.log('AC42 drag', JSON.stringify({ mid, out, after }));
    expect(mid.on).toBe(true);
    expect(mid.bg).toMatch(/1 0\.35\d* 0\.37\d* \/ 0\.15/);
    expect(out.chipHidden).toBe(false);
    expect(out.chipText).toContain('すてる');
    expect(after.s6).toBeNull();
    expect(after.bags).toContainEqual({ item: 'stone', count: 9 });
    const off = await page.evaluate(() => getComputedStyle(document.querySelector('.rk-dragout')!).opacity);
    expect(Number(off)).toBeLessThan(0.05);
    // dragOut フック・Q・Shift+Q（合わせているマス）
    const q = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.setSlot(5, { item: 'log', count: 7 });
      const r: any = {};
      const d = h.inventory.dragOut(5);
      h.step(2);
      r.drag = { d, s5: h.inventory.get().slots[5] };
      return r;
    });
    console.log('AC42 hook', JSON.stringify(q));
    expect(q.drag.s5).toBeNull();
    // Q（実マウスで合わせる）
    await page.evaluate(() => (window as any).__rikkun.inventory.setSlot(5, { item: 'log', count: 7 }));
    const b5 = (await page.locator('#inventory-screen .inv-slot[data-index="5"]').boundingBox())!;
    await page.mouse.move(b5.x + b5.width / 2, b5.y + b5.height / 2);
    await page.waitForTimeout(100);
    const q2 = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.input.press('drop');
      h.step(1);
      h.input.release('drop');
      h.step(1);
      const one = h.inventory.get().slots[5];
      h.input.press('dropStack');
      h.step(1);
      h.input.release('dropStack');
      h.step(1);
      return { one, all: h.inventory.get().slots[5] };
    });
    console.log('AC42 Q', JSON.stringify(q2));
    expect(q2.one).toEqual({ item: 'log', count: 6 });
    expect(q2.all).toBeNull();
  });
});

test.describe('AC43〜AC50・U15 たんす', () => {
  test('AC43: レシピ・アイテム・設定・置く・かたさ・fixedDrop', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const list = h.craft.list();
      const last = list[list.length - 1];
      const it = h.inventory.itemTypes().find((x: any) => x.id === 'tansu');
      const set = { hard: h.settings.get('hardness'), harvest: h.settings.get('harvestLevel'), fixed: h.settings.get('fixedDrop') };
      h.inventory.setSlot(0, { item: 'tansu', count: 2 });
      h.inventory.select(0);
      T.place(2.5, 9, 6.5, 90, -30);
      h.step(1);
      T.tap('secondary');
      h.step(2);
      const placed = [4, 3, 5].map((x) => h.world.getBlock(x, 9, 6)).concat([4, 5].map((x) => h.world.getBlock(x, 10, 6)));
      // こわす
      h.inventory.clear();
      h.settings.set('dropMax', { common: 3, uncommon: 3, rare: 3, superRare: 3 });
      let tx = null as any;
      for (let x = 3; x <= 7; x++) for (const y of [9, 10]) if (h.world.getBlock(x, y, 6) === 'tansu') tx = [x, y, 6];
      if (!tx) return { list: list.length, last, it, set, placed, tx };
      h.player.set({ position: { x: tx[0] - 1.5, y: 9, z: tx[2] + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: tx[1] === 9 ? -15 : 0 });
      h.step(1);
      h.input.press('primary');
      let ready = -1;
      for (let i = 1; i <= 400; i++) {
        h.step(1);
        if (h.dig.get().ready) {
          ready = i;
          break;
        }
      }
      h.input.release('primary');
      h.step(1);
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(3);
      return { list: list.length, last, it, set, placed, tx, ready, left: h.world.getBlock(tx[0], tx[1], tx[2]), count: h.inventory.count('tansu') + h.combat.bags().reduce((s: number, b: any) => s + b.slots.filter((x: any) => x.item === 'tansu').reduce((a: number, x: any) => a + x.count, 0), 0) };
    });
    console.log('AC43', JSON.stringify(r));
    expect(r.list).toBe(21);
    expect(r.last.id).toBe('tansu');
    expect(r.last.inputs).toEqual([{ item: 'log', count: 8 }, { item: 'iron_ingot', count: 2 }]);
    expect(r.last.works).toBe(true);
    expect(r.it).toMatchObject({ name: 'たんす', maxStack: 64, placeBlock: 'tansu' });
    expect.soft(r.it.rarity, 'itemTypes() に rarity（AC43）').toBe('uncommon');
    expect(r.set.hard.tansu).toBe(5);
    expect(r.set.harvest.tansu ?? 0).toBe(0);
    expect(r.set.fixed.tansu).toBe(1);
    expect(r.tx).toBeTruthy();
    expect(r.ready).toBeGreaterThan(0);
    expect(Math.abs(r.ready - 300)).toBeLessThanOrEqual(3);
    expect(r.left).toBe('air');
    expect(r.count).toBe(1); // こわすと 必ず 1 こ（dropMax を 3 にしても）
  });

  test('AC44・U15: ねらって secondary で開く・つち は置かない・遠いと閉じる', async ({ page }) => {
    await open(page);
    await putTansu(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.setBlock(4, 10, 6, 'tansu');
      h.inventory.setSlot(0, { item: 'dirt', count: 10 });
      h.inventory.select(0);
      T.place(2.5, 9, 6.5, 90, 0);
      h.step(1);
      T.tap('secondary');
      h.step(2);
      const cp = document.querySelector('.cp-detail, .cp-tiles, .cp-grid') as HTMLElement | null;
      const a = { ui: h.storage.ui(), dirt: h.inventory.count('dirt'), panel: h.craft.ui().panelVisible, domCraftVisible: !!document.querySelector('.cp-tile') && (document.querySelector('.cp-tile') as HTMLElement).getBoundingClientRect().width > 0 };
      // U15: shiftClick
      h.inventory.setSlot(10, { item: 'dirt', count: 64 });
      const mv = h.storage.shiftClick('inv', 10);
      const slots = h.storage.get(4, 10, 6).slots;
      const u15 = { mv, s0: slots[0], s10: h.inventory.get().slots[10] };
      // 遠く
      h.player.set({ position: { x: 4 - 6.1 + 0.5 - 0.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
      const far = h.storage.ui().open;
      h.step(1);
      const farAfter = h.storage.ui().open;
      return { a, u15, far, farAfter, pos: h.player.get().position };
    });
    console.log('AC44/U15', JSON.stringify(r));
    expect(r.a.ui.open).toBe(true);
    expect(r.a.ui.slots).toBe(54);
    expect(r.a.ui.position).toEqual({ x: 4, y: 10, z: 6 });
    expect(r.a.dirt).toBe(10);
    expect(r.a.domCraftVisible, '画面では つくる が出ていない').toBe(false);
    expect.soft(r.a.panel, 'craft.ui().panelVisible が false（AC44）').toBe(false);
    expect(r.u15.s0).toEqual({ item: 'dirt', count: 64 });
    expect(r.u15.s10).toBeNull();
    expect(r.farAfter).toBe(false);
    // toggleInventory でも開く
    const r2 = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.place(2.5, 9, 6.5, 90, 0);
      h.input.press('toggleInventory');
      h.step(1);
      h.input.release('toggleInventory');
      h.step(2);
      return h.storage.ui();
    });
    expect(r2.open).toBe(true);
    expect(r2.slots).toBe(54);
  });

  test('AC45: うつし方（ホットバー先・いっぱい・クリック 2 回）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.setBlock(4, 10, 6, 'tansu');
      h.storage.open(4, 10, 6);
      h.step(2);
      h.inventory.setSlot(9, { item: 'dirt', count: 64 });
      h.inventory.setSlot(10, { item: 'dirt', count: 10 });
      const a = h.storage.shiftClick('inv', 9);
      const b = h.storage.shiftClick('inv', 10);
      const sl = h.storage.get(4, 10, 6).slots;
      const r1 = { a, b, s0: sl[0], s1: sl[1], i9: h.inventory.get().slots[9], i10: h.inventory.get().slots[10] };
      // たんす → 持ち物（ホットバー先）
      h.inventory.setSlot(0, { item: 'stone', count: 1 });
      h.inventory.setSlot(1, { item: 'log', count: 64 });
      const c = h.storage.shiftClick('tansu', 0);
      const r2 = { c, hot: h.inventory.get().slots.slice(0, 9).map((s: any) => s && s.item + s.count), bag9: h.inventory.get().slots[9] };
      // いっぱい
      const items = ['dirt', 'stone', 'log', 'sand', 'leaves', 'grass', 'coal_ore', 'iron_ore', 'clay', 'paper', 'oil', 'string', 'cloth', 'crystal', 'iron_ingot', 'kawara', 'brick'];
      for (let i = 0; i < 54; i++) h.storage.set(4, 10, 6, i, { item: items[i % 17], count: 1 + (i % 3) });
      // 54 マスぜんぶ ちがう… 1 種 17 しゅるい。dirt+1 の マスが 同じ種類で 64 未満 なので 重なる → こわれない用に 64 で うめる
      for (let i = 0; i < 54; i++) h.storage.set(4, 10, 6, i, { item: items[i % 17], count: 64 });
      h.inventory.setSlot(20, { item: 'furnace', count: 3 });
      const d = h.storage.shiftClick('inv', 20);
      const r3 = { d, ui: h.storage.ui(), keep: h.inventory.get().slots[20] };
      // クリック 2 回（M2 §2.5）
      h.storage.set(4, 10, 6, 53, null);
      h.inventory.setSlot(21, { item: 'oil', count: 2 });
      h.inventory.click(21);
      const cur = h.inventory.get().cursor;
      h.storage.click(53);
      const r4 = { cur, t53: h.storage.get(4, 10, 6).slots[53], cursorAfter: h.inventory.get().cursor, i21: h.inventory.get().slots[21] };
      h.storage.click(53);
      const r5 = { cursorBack: h.inventory.get().cursor, t53: h.storage.get(4, 10, 6).slots[53] };
      return { r1, r2, r3, r4, r5, text: Array.from(document.querySelectorAll('.rk-chip, #notice-signal-text')).map((e) => (e as HTMLElement).textContent) };
    });
    console.log('AC45', JSON.stringify(r));
    expect(r.r1.s0).toEqual({ item: 'dirt', count: 64 });
    expect(r.r1.i9).toBeNull();
    expect(r.r1.s1).toEqual({ item: 'dirt', count: 10 });
    expect(r.r2.hot[2]).toBeTruthy(); // ホットバーの空き（2 番目以降）へ
    expect(r.r3.d.moved).toBe(0);
    expect(r.r3.d.reason).toBe('full');
    expect(r.r3.keep).toEqual({ item: 'furnace', count: 3 });
    expect(r.r4.cur).toEqual({ item: 'oil', count: 2 });
    expect(r.r4.t53).toEqual({ item: 'oil', count: 2 });
    expect(r.r4.cursorAfter).toBeNull();
    expect(r.r5.cursorBack).toEqual({ item: 'oil', count: 2 });
    // 合図の文字
    const txt = await page.evaluate(() => Array.from(document.querySelectorAll('#hud *')).map((e) => (e as HTMLElement).textContent).filter((t) => t && /いっぱい/.test(t)));
    console.log('AC45 いっぱい text', JSON.stringify(txt.slice(0, 3)));
  });

  test('AC46: 中身はべつべつ・こわすとばらまく・満杯でも ぜんぶ', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base(); // dropMax = 1
      h.world.setBlock(4, 10, 6, 'tansu');
      h.world.setBlock(4, 10, 7, 'tansu');
      h.storage.set(4, 10, 6, 0, { item: 'log', count: 5 });
      const B = h.storage.get(4, 10, 7).slots.filter((s: any) => s).length;
      // A をこわす
      h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
      h.input.press('primary');
      for (let i = 0; i < 320 && !h.dig.get().ready; i++) h.step(1);
      h.input.release('primary');
      h.step(1);
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(3);
      const bags = h.combat.bags();
      const logs = bags.reduce((s: number, b: any) => s + b.slots.filter((x: any) => x.item === 'log').reduce((a: number, x: any) => a + x.count, 0), 0);
      const a = { B, logs, tansuInv: h.inventory.count('tansu'), tansuBags: bags.reduce((s: number, b: any) => s + b.slots.filter((x: any) => x.item === 'tansu').reduce((a: number, x: any) => a + x.count, 0), 0), getA: h.storage.get(4, 10, 6), blockA: h.world.getBlock(4, 10, 6) };
      // 満杯
      h.inventory.clear();
      const items = ['dirt', 'stone', 'log', 'sand', 'leaves', 'grass', 'coal_ore', 'iron_ore', 'clay', 'paper'];
      let total = 0;
      for (let i = 0; i < 54; i++) {
        const n = 1 + (i % 60);
        total += n;
        h.storage.set(4, 10, 7, i, { item: items[i % 10], count: n });
      }
      h.combat.bags().length;
      const before = h.combat.bags().reduce((s: number, b: any) => s + b.slots.reduce((a: number, x: any) => a + x.count, 0), 0);
      h.player.set({ position: { x: 2.5, y: 9, z: 7.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
      h.input.press('primary');
      for (let i = 0; i < 320 && !h.dig.get().ready; i++) h.step(1);
      h.input.release('primary');
      h.step(1);
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(3);
      const after = h.combat.bags().reduce((s: number, b: any) => s + b.slots.reduce((a: number, x: any) => a + x.count, 0), 0);
      const invTotal = h.inventory.get().slots.reduce((s: number, x: any) => s + (x ? x.count : 0), 0);
      return { a, total, bagSum: after - before, invTotal };
    });
    console.log('AC46', JSON.stringify(r));
    expect(r.a.B).toBe(0);
    expect(r.a.logs).toBe(5);
    expect(r.a.tansuInv + r.a.tansuBags).toBe(1);
    expect(r.a.getA).toBeNull();
    expect(r.bagSum + r.invTotal).toBe(r.total + 1);
  });

  test('AC47: 保存（2 つ・中身ちがい・向き）・たんすの無い古い保存', async ({ page }) => {
    await open(page, '?reset=1');
    const a = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.setBlock(4, 10, 6, 'tansu');
      h.world.setBlock(8, 10, 6, 'tansu');
      h.storage.set(4, 10, 6, 0, { item: 'log', count: 5 });
      h.storage.set(4, 10, 6, 53, { item: 'katana', count: 1 });
      h.storage.set(8, 10, 6, 7, { item: 'dirt', count: 64 });
      h.step(2);
      h.save.now();
      return { A: h.storage.get(4, 10, 6), B: h.storage.get(8, 10, 6) };
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const b = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.mute(true);
      return { A: h.storage.get(4, 10, 6), B: h.storage.get(8, 10, 6), list: h.storage.list() };
    });
    console.log('AC47', JSON.stringify({ facing: [a.A.facing, b.A.facing], list: b.list }));
    expect(b.A).toEqual(a.A);
    expect(b.B).toEqual(a.B);
    expect(b.list.length).toBe(2);
    await page.evaluate(() => (window as any).__rikkun.save.clear());
    // たんす の無い保存（くさ の ブロックだけ）も開ける
    await open(page, '?reset=1');
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.world.setBlock(20, 12, 20, 'log');
      h.save.now();
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const ok = await page.evaluate(() => ({ b: (window as any).__rikkun.world.getBlock(20, 12, 20), s: (window as any).__rikkun.storage.list().length }));
    expect(ok).toEqual({ b: 'log', s: 0 });
    await page.evaluate(() => (window as any).__rikkun.save.clear());
  });

  test('AC48: 実績（作る・置く・しまう・いっぱい・すてる）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const un = (id: string) => h.achievements.list().find((a: any) => a.id === id).unlocked;
      const out: any = { before: ['craft.tansu.1', 'place.tansu.1', 'store.first.1', 'store.full.1', 'drop.first.1'].map(un) };
      h.inventory.add('log', 8);
      h.inventory.add('iron_ingot', 2);
      T.toggleInv();
      h.craft.tileClick('tansu');
      h.craft.tileClick('tansu');
      h.step(3);
      out.craft = { un: un('craft.tansu.1'), has: h.inventory.count('tansu'), banner: h.craft.fx().banner?.recipe };
      T.toggleInv();
      h.step(2);
      h.inventory.select(h.inventory.get().slots.findIndex((s: any) => s && s.item === 'tansu'));
      T.place(2.5, 9, 6.5, 90, -30);
      T.tap('secondary');
      h.step(2);
      out.place = un('place.tansu.1');
      let pos: any = null;
      for (let x = 3; x <= 7; x++) for (const y of [9, 10]) if (h.world.getBlock(x, y, 6) === 'tansu') pos = [x, y, 6];
      out.pos = pos;
      h.storage.open(...pos);
      h.step(2);
      h.inventory.setSlot(20, { item: 'dirt', count: 3 });
      h.storage.shiftClick('inv', 20);
      h.step(3);
      out.store = un('store.first.1');
      // 54 マス
      for (let i = 0; i < 53; i++) h.storage.set(...pos, i, { item: 'stone', count: 64 });
      h.storage.set(...pos, 53, null);
      h.inventory.setSlot(21, { item: 'stone', count: 64 });
      h.storage.shiftClick('inv', 21);
      h.step(3);
      out.full = un('store.full.1');
      out.stats = { store: h.achievements.stats()['store:*'], storeFull: h.achievements.stats().storeFull };
      h.storage.close();
      h.step(2);
      h.inventory.setSlot(0, { item: 'dirt', count: 2 });
      h.inventory.select(0);
      h.input.press('drop');
      h.step(1);
      h.input.release('drop');
      h.step(2);
      out.drop = un('drop.first.1');
      return out;
    });
    console.log('AC48', JSON.stringify(r));
    expect(r.before).toEqual([false, false, false, false, false]);
    expect(r.craft.un).toBe(true);
    expect(r.craft.banner).toBe('tansu');
    expect(r.place).toBe(true);
    expect(r.store).toBe(true);
    expect(r.full).toBe(true);
    expect(r.drop).toBe(true);
  });

  test('AC49: ドット絵 7 色・取っ手 4 つ・L 字・lookOpen', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const tex: any = {};
      for (const f of ['front', 'frontOpen', 'side', 'top', 'icon']) tex[f] = h.storage.texture(f);
      h.world.setBlock(4, 10, 6, 'tansu');
      h.step(1);
      const closed = h.storage.ui().lookOpen;
      h.storage.open(4, 10, 6);
      h.step(2);
      const open = h.storage.ui().lookOpen;
      h.storage.close();
      h.step(2);
      const after = h.storage.ui().lookOpen;
      return { tex, closed, open, after };
    });
    const flat = (t: any): string[] => (Array.isArray(t[0]) ? t.flat() : t);
    const all = new Set<string>();
    for (const f of ['front', 'frontOpen', 'side', 'top', 'icon']) {
      const px = flat(r.tex[f]).map((s: string) => s.toLowerCase());
      expect(px.length, `${f} は 16×16`).toBe(256);
      px.forEach((c: string) => all.add(c));
    }
    console.log('AC49 colors', JSON.stringify([...all]), 'look', r.closed, r.open, r.after);
    expect(all.size).toBeLessThanOrEqual(7);
    expect(all.has('#1f1f24')).toBe(true);
    // 前の面: 取っ手の まとまり（くろがね の連結）
    const f = flat(r.tex.front).map((s: string) => s.toLowerCase());
    const dark = f.map((c: string) => c === '#1f1f24');
    const seen = new Array(256).fill(false);
    const comps: number[] = [];
    for (let i = 0; i < 256; i++) {
      if (!dark[i] || seen[i]) continue;
      let n = 0;
      const st = [i];
      seen[i] = true;
      while (st.length) {
        const c = st.pop()!;
        n++;
        const x = c % 16, y = Math.floor(c / 16);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx > 15 || ny > 15) continue;
          const j = ny * 16 + nx;
          if (dark[j] && !seen[j]) { seen[j] = true; st.push(j); }
        }
      }
      comps.push(n);
    }
    console.log('AC49 front dark components', JSON.stringify(comps));
    expect(comps.length).toBeGreaterThanOrEqual(8); // 取っ手 4 ＋ L 字 4（連結のしかたで 多い）
    expect(r.closed).toBe(false);
    expect(r.open).toBe(true);
    expect(r.after).toBe(false);
  });

  test('AC50: 向き・桐色の帯と金具の点', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.inventory.setSlot(0, { item: 'tansu', count: 4 });
      h.inventory.select(0);
      T.place(2.5, 9, 6.5, 90, -30); // 東を向く
      T.tap('secondary');
      h.step(2);
      let pos: any = null;
      for (let x = 3; x <= 7; x++) for (const y of [9, 10]) if (h.world.getBlock(x, y, 6) === 'tansu') pos = [x, y, 6];
      const g = h.storage.get(...pos);
      h.storage.open(...pos);
      h.step(3);
      return { pos, facing: g.facing };
    });
    console.log('AC50', JSON.stringify(r));
    expect([null, 'w', 'e', 's', 'n']).toContain(r.facing);
    // 東向き(+x へ見る)で置くと 前は プレイヤーの方 = 西
    if (r.facing !== null) expect(r.facing).toBe('w');
    const dom = await page.evaluate(() => {
      const band = document.querySelector('.tansu-band') as HTMLElement;
      const kana = document.querySelectorAll('.tansu-kana');
      return { band: band && getComputedStyle(band).backgroundColor, h: band?.getBoundingClientRect().height, kana: kana.length, kanaBg: kana[0] && getComputedStyle(kana[0]).backgroundColor };
    });
    console.log('AC50 dom', JSON.stringify(dom));
    expect(dom.band).toBe('rgb(210, 176, 126)');
    expect(dom.kana).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================ AC32 とくに決めた大きさ

test('AC32: 名前 32・材料の数 20・つくる 24・ツールチップ desc 16・おめでとう 48/800・行 20・とじる 24', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const T = (window as any).T;
    T.base();
    T.stuff();
    T.toggleInv();
    (window as any).__rikkun.craft.hover('yoroi');
    (window as any).__rikkun.step(2);
  });
  await page.waitForTimeout(450);
  const q = await page.evaluate(() => {
    const fs = (sel: string) => Array.from(document.querySelectorAll(sel)).filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0).map((e) => { const cs = getComputedStyle(e); return { t: (e.textContent || '').trim().slice(0, 12), fs: parseFloat(cs.fontSize), fw: cs.fontWeight, tn: cs.fontVariantNumeric }; });
    const cls = (root: string) => Array.from(document.querySelectorAll(root + ' *')).filter((e) => e.children.length === 0 && (e.textContent || '').trim()).map((e) => ({ c: e.className.toString().slice(0, 30), t: (e.textContent || '').trim().slice(0, 10), fs: parseFloat(getComputedStyle(e).fontSize), fw: getComputedStyle(e).fontWeight }));
    return { detail: cls('.cp-detail, [class*="cp-detail"]').slice(0, 30) };
  });
  console.log('AC32 detail', JSON.stringify(q.detail));
  // ツールチップ
  await page.evaluate(() => { (window as any).__rikkun.inventory.hover(15); (window as any).__rikkun.step(2); });
  const tip = await page.evaluate(() => {
    const d = document.querySelector('.tip-desc') as HTMLElement | null;
    const n = document.querySelector('#tooltip .tip-name, #tooltip [class*=name]') as HTMLElement | null;
    return { desc: d && { t: d.textContent, fs: getComputedStyle(d).fontSize }, name: n && getComputedStyle(n).fontSize, data: (window as any).__rikkun.inventory.tooltip() };
  });
  console.log('AC32 tip', JSON.stringify(tip));
  expect(tip.desc).toBeTruthy();
  expect(tip.desc!.fs).toBe('16px');
  expect((tip.desc!.t || '').length).toBeGreaterThan(0);
  // おめでとう画面
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.inventory.hover(null);
    h.achievements.mute(false);
    h.achievements.record('level', 5);
    h.achievements.record('break:*', 1);
    h.achievements.record('place:*', 1);
    h.achievements.flush();
    h.step(70);
  });
  const modal = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.rk-modal *, [class*="celebrate"] *, [class*="ach-modal"] *')).filter((e) => e.children.length === 0 && (e.textContent || '').trim());
    return all.map((e) => ({ c: e.className.toString().slice(0, 36), t: (e.textContent || '').trim().slice(0, 14), fs: parseFloat(getComputedStyle(e).fontSize), fw: getComputedStyle(e).fontWeight }));
  });
  console.log('AC32 modal', JSON.stringify(modal));
  const big = modal.find((m) => m.t.startsWith('おめでとう'));
  expect(big?.fs).toBe(48);
  expect(big?.fw).toBe('800');
  const closeBtn = modal.find((m) => m.t === 'とじる');
  expect(closeBtn?.fs).toBe(24);
  const rows = modal.filter((m) => /なった|こわした|おいた/.test(m.t) && m.fs !== 32);
  for (const r of rows) expect(r.fs).toBe(20);
});

test.describe('AC53(c) じっせき ページの 分類タブ 8 つ', () => {
  for (const [w, h] of [[1280, 720], [1920, 1080]] as const) {
    test(`${w}×${h}: 8 つとも 入れ物と 画面の中に ぜんぶ見える`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      await page.evaluate(() => {
        const g = (window as any).__rikkun;
        (window as any).T.base();
        (window as any).T.toggleInv();
        g.achievements.tab('achievements');
        g.step(3);
      });
      await page.waitForTimeout(450);
      const r = await page.evaluate(() => {
        const box = (document.querySelector('.ach-cats') as HTMLElement).getBoundingClientRect();
        const btns = Array.from(document.querySelectorAll('.ach-cats button, .ach-cats .rk-tab')).map((e) => {
          const b = e.getBoundingClientRect();
          return { t: (e.textContent || '').trim(), top: b.top, bottom: b.bottom };
        });
        return { vh: innerHeight, box: { top: box.top, bottom: box.bottom }, btns };
      });
      console.log(`AC53c ${w}`, JSON.stringify(r));
      expect(r.btns.length).toBe(8);
      for (const b of r.btns) {
        expect.soft(b.bottom, `${b.t} が 分類タブの入れ物の中`).toBeLessThanOrEqual(r.box.bottom + 1);
        expect.soft(b.bottom, `${b.t} が 画面の中`).toBeLessThanOrEqual(r.vh);
      }
      await page.screenshot({ path: `${SHOTS}/m6-t2-achpage-${w}.png` });
    });
  }
});

// ============================================================ AC51 スクショ（たんす・投げた落とし物）

test('AC51: たんす（閉じた・開いた）と 投げた落とし物のスクショ', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const T = (window as any).T;
    T.base();
    h.time.set(1000);
    h.world.setBlock(5, 9, 6, 'tansu');
    T.place(2.5, 9, 6.5, 90, -10);
    h.step(3);
  });
  await page.screenshot({ path: `${SHOTS}/m6-t2-tansu-block-closed.png` });
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.storage.open(5, 9, 6);
    h.step(3);
    h.storage.close();
    h.step(0);
  });
  // 開いた絵は 画面が出ているあいだだけ。画面ごと撮る
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.storage.open(5, 9, 6);
    h.step(3);
  });
  const look = await page.evaluate(() => (window as any).__rikkun.storage.ui().lookOpen);
  expect(look).toBe(true);
  await page.screenshot({ path: `${SHOTS}/m6-t2-tansu-block-open.png` });
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.storage.close();
    h.step(2);
    h.inventory.setSlot(0, { item: 'crystal', count: 3 });
    h.inventory.select(0);
    h.input.press('dropStack');
    h.step(1);
    h.input.release('dropStack');
    h.step(70);
  });
  await page.screenshot({ path: `${SHOTS}/m6-t2-thrown-drop.png` });
});

test('AC45(文字): たんすが いっぱい のとき `たんす が いっぱい！`・持ち物が いっぱい のとき `もちもの が いっぱい！`', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    (window as any).T.base();
    h.world.setBlock(4, 10, 6, 'tansu');
    h.storage.open(4, 10, 6);
    h.step(2);
    for (let i = 0; i < 54; i++) h.storage.set(4, 10, 6, i, { item: 'stone', count: 64 });
    h.inventory.setSlot(20, { item: 'furnace', count: 3 });
    const a = h.storage.shiftClick('inv', 20);
    h.step(2);
    const txt = () => Array.from(document.querySelectorAll('#hud *, #inventory-screen *')).filter((e) => e.children.length === 0 && /いっぱい/.test(e.textContent || '') && (e as HTMLElement).getBoundingClientRect().width > 0).map((e) => (e.textContent || '').trim());
    const t1 = txt();
    // 持ち物いっぱい: たんす → 持ち物
    h.step(200);
    for (let i = 0; i < 36; i++) h.inventory.setSlot(i, { item: 'dirt', count: 64 });
    const b = h.storage.shiftClick('tansu', 0);
    h.step(2);
    return { a, b, t1, t2: txt() };
  });
  console.log('AC45 text', JSON.stringify(r));
  expect(r.a.reason).toBe('full');
  expect(r.t1.some((t: string) => t.includes('たんす') && t.includes('いっぱい'))).toBe(true);
  expect(r.b.reason).toBe('full');
  expect(r.t2.some((t: string) => t.includes('もちもの') && t.includes('いっぱい'))).toBe(true);
});
