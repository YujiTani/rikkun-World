import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { checkLayout } from './helpers/layoutRules';
import { checkColors, checkComponents, checkContrast, checkFontSizes, snapshotUi } from './helpers/uiRules';

/**
 * UI 検査ゲート（`npm run check:ui`）。
 *
 * ぜんぶの画面を 3 つの大きさで開き、DOM で しらべる:
 * - くずれ（e2e/helpers/layoutRules.ts）: はみ出し・重なり・字の切れ・ボタンの字の折り返し・押せる大きさ
 * - きまり（e2e/helpers/uiRules.ts）: 色・字の大きさ・コントラスト・部品の形（1280×800 だけ。きまりの数は この大きさで決めてある）
 * - 見つけた くずれが `e2e/ui-gate/known.json`（今わかっている くずれ の表）に なければ 落ちる。
 * - 表にあって もう出なくなった物は、表から消すように 書き出す（落とさない）。
 * - 画面ごとのスクショと結果の表を `ui-gate-report/` に書く（ui-reviewer と PR 用）。
 *
 * 画面を足したら SCREENS に 1 行足す。くずれを直したら known.json から消す。
 */

const SIZES = [
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 1024, h: 700 },
] as const;

const OUT = 'ui-gate-report';
const KNOWN_FILE = 'e2e/ui-gate/known.json';

interface Screen {
  /** 画面の名前（ファイル名にもなる） */
  id: string;
  /** しらべる範囲（CSS セレクタ） */
  roots: string[];
  /** ゲームを開いたあと、この画面を出す */
  open(page: Page): Promise<void>;
}

/** いちばん多いとき用: もちものを ほぼ いっぱいにする */
const fillInventory = () => {
  const h = window.__rikkun! as any;
  h.inventory.clear();
  const items: [string, number][] = [
    ['dirt', 64], ['stone', 64], ['log', 64], ['planks', 64], ['coal_ore', 12], ['iron_ore', 9], ['iron_ingot', 6], ['paper', 4],
    ['string', 5], ['cloth', 3], ['clay', 8], ['oil', 2], ['crystal', 2], ['furnace', 1], ['tansu', 2], ['wood_pickaxe', 1],
    ['katana', 1], ['yumi', 1], ['ya', 64], ['torch', 10], ['yokai_orb', 1], ['kabuto', 1], ['yoroi', 1], ['kote', 1],
    ['suneate', 1], ['lantern', 3], ['kite', 1], ['futon', 1], ['omamori', 1], ['waraji', 1], ['haniwa', 1],
    ['seed_onion', 9], ['seed_tomato', 9], ['seed_pumpkin', 9], ['seed_eggplant', 9], ['onion', 9], ['tomato', 9],
    ['pumpkin', 9], ['eggplant', 9], ['kuwa', 1], ['watering_can', 1], ['long_watering_can', 1],
  ];
  for (const [item, n] of items) {
    try {
      h.inventory.add(item, n);
    } catch {
      // ない アイテムは とばす
    }
  }
  h.step(2);
};

const toggleInventory = () => {
  const h = window.__rikkun! as any;
  h.input.press('toggleInventory');
  h.input.release('toggleInventory');
  h.step(3);
};

async function boot(page: Page, locked: boolean): Promise<void> {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate((locked) => {
    const h = window.__rikkun! as any;
    h.pause();
    h.achievements.mute(true);
    if (locked) h.lock.simulate(true);
    h.step(2);
  }, locked);
}

const guideTab = (tab: string): Screen => ({
  id: `guide-${tab}`,
  roots: ['.play-overlay'],
  open: async (page) => {
    await boot(page, false);
    await page.evaluate((tab) => {
      const h = window.__rikkun! as any;
      h.lock.tab(tab);
      h.step(2);
    }, tab);
  },
});

const SCREENS: Screen[] = [
  ...['move', 'dig', 'fight', 'craft', 'grow'].map(guideTab),
  {
    id: 'hud',
    roots: ['#hud'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(fillInventory);
    },
  },
  {
    id: 'inventory',
    roots: ['#inventory-screen', '#hud'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(fillInventory);
      await page.evaluate(toggleInventory);
    },
  },
  {
    id: 'craft-detail',
    roots: ['#inventory-screen', '#tooltip', '#hud'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(fillInventory);
      await page.evaluate(toggleInventory);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        const t = h.craft.ui().tiles ?? [];
        h.craft.hover((t.find((x: any) => x.craftable) ?? t[0])?.id ?? null);
        h.step(3);
      });
    },
  },
  {
    // RARITY-7 AC16: 7 段目（★7・いちばん長いことば・いちばん長い名前）の物を、ホットバー・つくる画面・ツールチップに出す
    id: 'rarity-7',
    roots: ['#inventory-screen', '#hud'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(fillInventory);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        const all: Record<string, string> = {};
        for (const it of ['katana', 'crystal_katana', 'wood_pickaxe', 'dirt', 'stone', 'log', 'yumi', 'ya', 'kabuto', 'yoroi']) all[it] = 'legendary';
        h.settings.set('itemRarity', all);
        h.inventory.add('crystal_katana', 1);
        h.step(2);
      });
      await page.evaluate(toggleInventory);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.craft.hover('katana');
        h.step(3);
      });
    },
  },
  {
    // RARITY-7 AC16: 7 段目の ツールチップ（本物のマウスで合わせる。ほかの画面の上に出るのは ふつう）
    id: 'rarity-7-tooltip',
    roots: ['#tooltip'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(fillInventory);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        const all: Record<string, string> = {};
        for (const it of ['katana', 'crystal_katana', 'wood_pickaxe', 'dirt', 'stone', 'log', 'yumi', 'ya', 'kabuto', 'yoroi']) all[it] = 'legendary';
        h.settings.set('itemRarity', all);
        h.inventory.add('crystal_katana', 1);
        h.step(2);
      });
      await page.evaluate(toggleInventory);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.craft.hover('katana');
        h.step(3);
      });
      // 本物のマウスで合わせる（ツールチップが マウスの近くに出る）
      await page.locator('#inventory-screen .slot[data-item="katana"]').first().hover();
      await page.evaluate(() => (window.__rikkun as any).step(3));
    },
  },
  {
    // RARITY-7 AC16: 7 段目の おいわいの横断幕（名前 ＋ ★7）
    id: 'rarity-7-banner',
    roots: ['.cel-banner-wrap'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.settings.set('itemRarity', { wood_pickaxe: 'legendary' });
        h.inventory.clear();
        h.inventory.add('log', 6);
        h.step(2);
      });
      await page.evaluate(toggleInventory);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.craft.tileClick('wood_pickaxe');
        h.craft.tileClick('wood_pickaxe');
        h.step(40);
      });
    },
  },
  {
    id: 'achievements',
    roots: ['#inventory-screen', '#hud'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(toggleInventory);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.achievements.tab('achievements');
        h.step(3);
      });
    },
  },
  {
    id: 'tansu',
    roots: ['#inventory-screen', '#hud'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(fillInventory);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        const p = h.player.get().position;
        const x = Math.floor(p.x) + 2;
        const y = Math.floor(p.y);
        const z = Math.floor(p.z);
        h.world.setBlock(x, y, z, 'tansu');
        for (let i = 0; i < 27; i++) h.storage.set(x, y, z, i, { item: i % 2 ? 'long_watering_can' : 'seed_eggplant', count: i % 2 ? 1 : 64 });
        h.storage.open(x, y, z);
        h.step(3);
      });
    },
  },
  {
    id: 'log',
    roots: ['#inventory-screen', '#hud'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(fillInventory);
      await page.evaluate(toggleInventory);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.log.open();
        h.step(3);
      });
    },
  },
  {
    id: 'congrats',
    roots: ['.cel-scrim'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.achievements.record('level', 5);
        h.step(2);
        h.achievements.flush();
        h.step(70);
      });
    },
  },
  {
    id: 'death',
    roots: ['#death-screen'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.combat.damage(20);
        h.step(90);
      });
    },
  },
];

interface Issue {
  kind: string;
  /** 数字を ふくまない 目印（known.json と くらべる） */
  target: string;
  detail: string;
}

const key = (screen: string, i: Issue): string => `${screen} | ${i.kind} | ${i.target}`;

/** uiRules の「目印: 説明」の文を Issue にする */
function fromRule(kind: string, msg: string): Issue {
  const at = msg.includes('」: ') ? msg.indexOf('」: ') + 1 : msg.indexOf(': ');
  return { kind, target: msg.slice(0, at), detail: msg.slice(at + 2) };
}

/** くずれは どの大きさでも、きまり（色・字・部品）は 1280×800（きまりの数を決めた大きさ）だけで しらべる */
async function inspect(page: Page, roots: string[], withRules: boolean): Promise<Issue[]> {
  const out: Issue[] = await checkLayout(page, roots);
  if (!withRules) return out;
  for (const root of roots) {
    if (!(await page.locator(root).count())) continue;
    const snap = await snapshotUi(page, { root });
    for (const m of checkColors(snap)) out.push(fromRule('color', m));
    for (const m of checkFontSizes(snap)) out.push(fromRule('font', m));
    for (const m of checkContrast(snap)) out.push(fromRule('contrast', m));
    for (const m of checkComponents(snap)) out.push(fromRule('parts', m));
  }
  return out;
}

interface Known {
  /** key がそのまま書いてある物 → issue */
  exact: Record<string, string>;
  /** `*` をふくむ物（字の幅で 相手が かわる 重なりなど）→ issue */
  patterns: { re: RegExp; issue: string }[];
}

/** known.json（{ "issue の説明": [key か `*` つきの形, ...] }）を読む */
function loadKnown(): Known {
  const raw = JSON.parse(readFileSync(KNOWN_FILE, 'utf8')) as Record<string, string | string[]>;
  const known: Known = { exact: {}, patterns: [] };
  for (const [issue, keys] of Object.entries(raw)) {
    if (!Array.isArray(keys)) continue;
    for (const k of keys) {
      if (!k.includes('*')) known.exact[k] = issue;
      else known.patterns.push({ re: new RegExp(`^${k.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`), issue });
    }
  }
  return known;
}

function issueOf(known: Known, k: string): string | null {
  return known.exact[k] ?? known.patterns.find((p) => p.re.test(k))?.issue ?? null;
}

test.describe('UI 検査ゲート', () => {
  test.describe.configure({ mode: 'parallel' });

  for (const screen of SCREENS) {
    test(screen.id, async ({ page }) => {
      const known = loadKnown();
      mkdirSync(OUT, { recursive: true });
      await page.setViewportSize({ width: SIZES[0].w, height: SIZES[0].h });
      await screen.open(page);
      const found = new Map<string, string[]>(); // key → くわしい説明（大きさつき）
      let rootsSeen = 0;
      for (const s of SIZES) {
        await page.setViewportSize({ width: s.w, height: s.h });
        await page.evaluate(() => {
          (window.__rikkun as any).step(2);
          return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        rootsSeen += await page.evaluate((sels) => sels.filter((q) => document.querySelector(q)).length, screen.roots);
        for (const issue of await inspect(page, screen.roots, s === SIZES[0])) {
          const k = key(screen.id, issue);
          found.set(k, [...new Set([...(found.get(k) ?? []), `${s.w}×${s.h}: ${issue.detail}`])]);
        }
        await page.screenshot({ path: `${OUT}/${screen.id}-${s.w}x${s.h}.png` });
      }
      expect(rootsSeen, `${screen.roots.join(', ')} が見つからない`).toBeGreaterThan(0);

      const fresh = [...found.keys()].filter((k) => !issueOf(known, k));
      const fixed = Object.keys(known.exact).filter((k) => k.startsWith(`${screen.id} | `) && !found.has(k));
      const lines = [...found].map(([k, d]) => {
        const issue = issueOf(known, k);
        return `${issue ? `  (既知 ${issue.split(' ')[0]})` : '★ 新規'} ${k}\n      ${d.join('\n      ')}`;
      });
      writeFileSync(`${OUT}/${screen.id}.txt`, lines.join('\n') + (fixed.length ? `\n\nもう出ない（known.json から消す）:\n${fixed.join('\n')}` : '') + '\n');
      if (fixed.length) console.log(`[${screen.id}] もう出ない くずれ（e2e/ui-gate/known.json から消す）:\n  ${fixed.join('\n  ')}`);
      expect(
        fresh.map((k) => `${k}\n      ${found.get(k)!.join('\n      ')}`),
        `新しい くずれ。直すか、直せない理由があれば issue にして ${KNOWN_FILE} に足す`,
      ).toEqual([]);
    });
  }
});

test('道具が わるい例を 見つける', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(`<!doctype html><html><body style="margin:0;font:16px sans-serif">
    <div id="t">
      <div id="off" style="position:absolute;left:700px;top:10px;width:300px;height:40px">はみだす</div>
      <button id="spill" style="position:absolute;left:10px;top:80px;width:60px;height:48px;white-space:nowrap">ながい ながい なまえ</button>
      <div style="position:absolute;left:10px;top:160px;width:80px;height:30px;overflow:hidden"><span id="clip" style="white-space:nowrap">きれる きれる きれる</span></div>
      <div id="a" style="position:absolute;left:10px;top:220px">かさなる</div>
      <div id="b" style="position:absolute;left:20px;top:224px">かさなる</div>
      <button id="small" style="position:absolute;left:10px;top:280px;width:30px;height:20px">x</button>
      <button id="wrap" style="position:absolute;left:10px;top:330px;width:70px;height:60px">あそぼう！</button>
      <div style="position:absolute;left:300px;top:100px;height:100px;width:120px;overflow-y:auto"><div style="height:300px">スクロールの 中は よい</div><div>した</div></div>
    </div></body></html>`);
  const kinds = (await checkLayout(page, ['#t'])).map((i) => `${i.kind} ${i.target}`);
  const has = (re: RegExp) => expect(kinds.some((k) => re.test(k)), `${re} が ない: ${kinds.join(' / ')}`).toBe(true);
  has(/^offscreen div#off/);
  has(/^spill button#spill/);
  has(/^clipped span#clip/);
  has(/^overlap div#a.* と div#b/);
  has(/^small button#small/);
  has(/^wrap button#wrap/);
  expect(kinds.filter((k) => k.includes('した') || k.includes('スクロール')), 'スクロールで見られる物は 出さない').toEqual([]);
});
