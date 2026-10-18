import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { toStance } from './helpers/blade';
import { waitSpritesReady } from './helpers/char';
import { findLand, openBooting } from './helpers/stream';
import { wide } from './helpers/fine';
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
  /** true なら くずれ（はみ出し・重なり）だけ しらべる（色・字の きまりは ほかの画面で見ている） */
  layoutOnly?: boolean;
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

async function boot(page: Page, locked: boolean, query = '?nosave=1'): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate((locked) => {
    const h = window.__rikkun! as any;
    h.pause();
    h.achievements.mute(true);
    if (locked) h.lock.simulate(true);
    h.step(2);
  }, locked);
}

// BOOK-1: 案内画面 ＋ 本の 4 画面（① もくじ・② そだてる〔12 こ〕・③ 一番長い説明・③ 画面の絵が要る項目）。docs/design/BOOK-1.md AC16
const guideHome: Screen = {
  id: 'guide',
  roots: ['.play-overlay'],
  open: async (page) => {
    await boot(page, false);
    await page.evaluate(() => (window.__rikkun! as any).step(2));
  },
};

const bookPage = (id: string, target: string): Screen => ({
  id,
  roots: ['.play-overlay', '[data-book]'],
  open: async (page) => {
    await boot(page, false);
    await page.evaluate((target) => {
      const h = window.__rikkun! as any;
      h.lock.book(target);
      let n = 0;
      while (h.lock.get().bookAnim !== 'none' && n++ < 1200) h.step(1);
      h.step(2);
    }, target);
  },
});

const SCREENS: Screen[] = [
  guideHome,
  bookPage('book-toc', 'toc'),
  bookPage('book-chapter-grow', 'grow'),
  bookPage('book-item-seeds', 'grow-seeds'),
  bookPage('book-item-bag', 'dig-bag'),
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

/**
 * BAL-G（#115）AC19: 二つ名の妖怪（たいしょう・ヌシ × 色の段階 1〜3）・登場のおしらせ・おのの絵と手に持つ形。
 * 窓口は e2e/bal-g.spec.ts の注と同じ（まだ無いので、実装までは赤）。段階は M 1 / 1.5 / 2.25 で決まる。
 */
const NICK_M = { 1: 1, 2: 1.5, 3: 2.25 } as const;
const openNick = (title: 'taisho' | 'nushi', stage: 1 | 2 | 3, announce: boolean): Screen['open'] => async (page) => {
  await boot(page, true);
  await page.evaluate(
    ({ title, m, announce }) => {
      const h = window.__rikkun! as any;
      const p = h.player.get().position;
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      const z = Math.floor(p.z);
      h.world.fill(x, y - 1, z - 5, x + 9, y - 1, z + 5, 'stone');
      h.world.fill(x, y, z - 5, x + 9, y + 10, z + 5, 'air');
      h.settings.set('yokaiAutoSpawn', false);
      h.yokai.clear();
      h.player.set({ position: { x: x + 0.5, y, z: z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.time.set(20000);
      h.yokai.spawn('karakasa', x + 5.5, y, z + 3.6, { ai: false, yawDeg: 300, title, m });
      h.step(announce ? 20 : 8);
    },
    { title, m: NICK_M[stage], announce },
  );
};
const BAL_SCREENS: Screen[] = [
  ...(['taisho', 'nushi'] as const).flatMap((t) => [
    { id: `nick-announce-${t}`, roots: ['#title-announce', '#hud'], open: openNick(t, 1, true) },
    ...([1, 2, 3] as const).map((st) => ({ id: `nick-${t}-stage${st}`, roots: ['#hud'], open: openNick(t, st, false) })),
  ]),
  {
    id: 'axes',
    roots: ['#hud'],
    open: async (page) => {
      await boot(page, true);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.inventory.clear();
        for (const a of ['wood_axe', 'stone_axe', 'iron_axe', 'wood_pickaxe', 'kuwa']) h.inventory.add(a, 1);
        h.inventory.select?.(0);
        h.step(5);
      });
    },
  },
];
SCREENS.push(...BAL_SCREENS);

/**
 * CHAR-2 AC26: 刀のわざ・弓を引く 場面の画面が HUD と重ならない（はみ出し・重なり）。
 * 絵の読みこみ（本当の時間）を待ってから、1 ステップずつ進めて場面を作る。
 */
const CHAR2_KATANA = ['katana_thrust', 'katana_kesa', 'katana_kiriage', 'katana_walk_chudan', 'katana_walk_jodan', 'katana_walk_gedan'];
const CHAR2_BOW = ['bow_shot', 'bow_hold_walk', 'bow_walk', 'bow_rapid'];
async function char2Setup(page: Page, held: string, names: string[]): Promise<void> {
  await boot(page, true);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(0);
  });
  await standOnGround(page, 20.5, 20.5, { yaw: 0, pitch: 0 });
  await page.evaluate((held) => {
    const h = window.__rikkun! as any;
    h.inventory.clear();
    h.inventory.setSlot(0, { item: held, count: 1 });
    if (held === 'yumi') h.inventory.setSlot(1, { item: 'ya', count: 5 });
    h.inventory.select(0);
    h.step(1);
  }, held);
  await waitSpritesReady(page, names);
}
const CHAR2_SCREENS: Screen[] = [
  {
    id: 'char2-katana-tech',
    roots: ['#hud'],
    layoutOnly: true,
    open: async (page) => {
      await char2Setup(page, 'katana', CHAR2_KATANA);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.step(20);
        h.input.press('primary');
        h.step(30);
      });
    },
  },
  {
    id: 'char2-bow-draw',
    roots: ['#hud'],
    layoutOnly: true,
    open: async (page) => {
      await char2Setup(page, 'yumi', CHAR2_BOW);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.step(20);
        h.input.press('primary');
        h.step(45);
      });
    },
  },
];
SCREENS.push(...CHAR2_SCREENS);

/**
 * VOX-D 基準 26: じゅんびちゅう（起動の大きいボタンの中・遠くへもどるカード）。進みを止めて（?streamWork=0 / setStreamWork(0)）撮る。
 * 窓口（world.stream / teleport / setStreamWork、player.respawn）と 画面（.prep-card ほか）は 実装まで無いので、実装までは赤。
 */
const VOXD_SCREENS: Screen[] = [
  {
    id: 'prep-boot',
    roots: ['.play-overlay'],
    layoutOnly: true,
    open: async (page) => {
      await openBooting(page, '?nosave=1&streamWork=0');
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.world.setStreamWork(1);
        // 半分ほどそろった所（ブロックが 2〜3 こ できた）で 止める
        for (let i = 0; i < 3000 && h.world.stream().progress < 0.5; i++) h.step(1);
        h.world.setStreamWork(0);
        h.step(2);
      });
    },
  },
  {
    id: 'prep-card',
    roots: ['.prep-card'],
    layoutOnly: true,
    open: async (page) => {
      await boot(page, false);
      const P = await findLand(page);
      await page.evaluate((P) => (window.__rikkun! as any).world.teleport(P.x, P.z), P);
      await page.evaluate(() => (window.__rikkun! as any).world.settle());
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.world.setStreamWork(1);
        h.player.respawn();
        h.step(40); // 30 コマを こえて カードが出る
        h.world.setStreamWork(0);
        h.step(2);
      });
    },
  },
];
SCREENS.push(...VOXD_SCREENS);

/**
 * CHAR-4 AC18: 刀の軌跡が 出ている 場面で HUD の はみ出し・重なりが 0。
 * 大けさぎり F31（ぼくとう・かたな・きらきらの かたな）・切り上げ F21（きらきらの かたな）・突き F5（かたな）。
 * スクショ（ui-gate-report/char4-*-<大きさ>.png）は ui-reviewer が 見る。
 */
const char4Scene = (id: string, item: string, stance: 'chudan' | 'jodan' | 'gedan', frame: number): Screen => ({
  id,
  roots: ['#hud'],
  layoutOnly: true,
  open: async (page) => {
    await char2Setup(page, item, CHAR2_KATANA);
    await page.evaluate(() => (window.__rikkun! as any).step(30));
    await toStance(page, stance);
    const shown = await page.evaluate((frame) => {
      const h = window.__rikkun! as any;
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(frame - 1);
      return { f: h.blade.state().frame as number, visible: h.blade.trail().visible as boolean };
    }, frame);
    expect(shown, `${id}: 軌跡が 出ている 場面に なっていない`).toEqual({ f: frame, visible: true });
  },
});
SCREENS.push(
  char4Scene('char4-kesa-bokuto-F31', 'bokuto', 'jodan', 31),
  char4Scene('char4-kesa-katana-F31', 'katana', 'jodan', 31),
  char4Scene('char4-kesa-crystal-F31', 'crystal_katana', 'jodan', 31),
  char4Scene('char4-kiriage-crystal-F21', 'crystal_katana', 'gedan', 21),
  char4Scene('char4-thrust-katana-F5', 'katana', 'chudan', 5),
);

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
        for (const issue of await inspect(page, screen.roots, s === SIZES[0] && !screen.layoutOnly)) {
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

/**
 * CHAR-2 AC34: 切りつめる前と後で 画面が 同じ。
 * 切りつめた絵（ふだん）と もとの格子の絵（?charsheets=orig。開発サーバーだけ）で、同じ場面の画面を撮って ドット単位でくらべる。
 */
test('CHAR-2 AC34: 切りつめる前と後で 画面が ドット単位で 同じ', async ({ browser }) => {
  // 新しい地形（高さ 352）は 1 ステップが重く、CI（GPU なし）では もとの格子の絵の 読みこみに 時間が かかるため 広げる
  test.setTimeout(480_000);
  type Scene = { id: string; held: 'none' | 'katana' | 'yumi'; yaw: number; pitch: number; stance?: number; draw?: boolean };
  const scenes: Scene[] = [
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((yaw) => ({ id: `dir-yaw${yaw}`, held: 'none' as const, yaw, pitch: -10 })),
    { id: 'down', held: 'none', yaw: 0, pitch: -75 },
    { id: 'up', held: 'none', yaw: 0, pitch: 75 },
    ...[0, 1, 2].map((stance) => ({ id: `kamae-${stance}`, held: 'katana' as const, yaw: 45, pitch: -10, stance })),
    { id: 'bow-full-draw', held: 'yumi', yaw: 90, pitch: -10, draw: true },
  ];
  // 読みこみ（page.goto）は 重い。持ち物ごと（なし・刀・弓）に 1 回だけ読んで、場面を 続けて撮る。
  // 2 回（切りつめ・もとの格子）とも 同じ順・同じ手順なので 決定的。かまえは 前の場面からの 差だけ 押す
  const groups = (['none', 'katana', 'yumi'] as const).map((held) => scenes.filter((sc) => sc.held === held));
  const shoot = async (query: string): Promise<Record<string, Buffer>> => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const out: Record<string, Buffer> = {};
    try {
      for (const group of groups) {
        const first = group[0]!;
        await page.goto(`/?nosave=1${query}`);
        await page.waitForFunction(() => window.__rikkun?.ready === true);
        const names = first.held === 'katana' ? CHAR2_KATANA : first.held === 'yumi' ? CHAR2_BOW : ['idle', 'walk', 'run', 'jump'];
        await page.evaluate(() => {
          const h = window.__rikkun! as any;
          h.pause();
          h.achievements.mute(true);
          h.lock.simulate(true);
          h.input.releaseAll();
          h.settings.set('yokaiAutoSpawn', false);
          h.settings.set('yokaiWander', false);
          h.yokai.clear();
          h.time.set(0);
          h.inventory.clear();
        });
        let stanceNow = 0;
        for (const sc of group) {
          await standOnGround(page, 20.5, 20.5, { yaw: sc.yaw, pitch: sc.pitch });
          await page.evaluate((sc) => {
            const h = window.__rikkun! as any;
            if (sc.held !== 'none') {
              h.inventory.setSlot(0, { item: sc.held, count: 1 });
              if (sc.held === 'yumi') h.inventory.setSlot(1, { item: 'ya', count: 5 });
              h.inventory.select(0);
            }
            h.step(1);
          }, sc);
          if (sc === first) {
            // 読みこみは本当の時間で進む。描画を止めて待ち、時間の上限は テスト全体にまかせる（待ちの中で step は回さない。始めの step(1) は 上で 済み）
            await page.evaluate(() => (window.__rikkun! as any).suspendRender(true));
            try {
              await page.waitForFunction((ns) => {
                const st = (window.__rikkun! as any).player.doll().sprite.status;
                return ns.every((n: string) => st?.[n] === 'ready');
              }, names, { timeout: 0 });
            } finally {
              await page.evaluate(() => (window.__rikkun! as any).suspendRender(false));
            }
          }
          // 世界の光とメッシュが落ちつくまで進める（作る順番は 機械の速さで変わる。落ちつけば 2 回の撮影は 同じ世界）
          await page.evaluate(() => {
            const h = window.__rikkun! as any;
            for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n += 5) h.step(5);
            h.step(2);
            // 待ったステップの数は 機械の速さで ちがい、時刻（太陽・影の向き）に のこる。場面ごとに 時刻をそろえる
            h.time.set(0);
            // 待ったステップの数は 機械の速さで ちがう。キャラの コマの数え（立ち 45 ステップに 1 コマ）を ここから数えなおす
            h.player.doll().sprite.restartMotion();
          });
          const presses = (sc.stance ?? 0) - stanceNow;
          stanceNow = sc.stance ?? 0;
          await page.evaluate(([sc, presses]) => {
            const h = window.__rikkun! as any;
            for (let i = 0; i < presses; i++) {
              h.input.press('stanceNext');
              h.step(1);
              h.input.release('stanceNext');
              h.step(10);
            }
            h.step(30);
            if (sc.draw) {
              h.input.press('primary');
              h.step(45);
            }
          }, [sc, presses] as const);
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          out[sc.id] = await page.screenshot();
        }
      }
    } finally {
      await ctx.close();
    }
    return out;
  };
  const packed = await shoot('');
  const orig = await shoot('&charsheets=orig');
  mkdirSync(OUT, { recursive: true });
  const diffs: string[] = [];
  for (const sc of scenes) {
    if (!packed[sc.id]!.equals(orig[sc.id]!)) {
      diffs.push(sc.id);
      writeFileSync(`${OUT}/ac34-${sc.id}-packed.png`, packed[sc.id]!);
      writeFileSync(`${OUT}/ac34-${sc.id}-orig.png`, orig[sc.id]!);
    }
  }
  expect(diffs, 'ちがう場面（ui-gate-report/ac34-*.png）').toEqual([]);
});

/**
 * CHAR-4 AC13: 同じ 場面（立って 中段・yaw 45・pitch −10・1280×800）で HUD を 隠して、ぼくとう と かたなの 3D の 画面を くらべる。
 * ちがう ドットが 1 つ 以上 あり、ぜんぶ キャラの板の 四すみを 画面へ うつした 四角の 中（地面・空は 1 ドットも ちがわない）。
 * 板の 四すみは 窓口から 計算する（板の 中心 = 足もと + (0, 0.95k)、一辺 2k、k = 1.8 ÷ modelH。カメラの 向きは yaw・pitch）。
 */
test('CHAR-4 AC13: ぼくとう と かたなの 画面の ちがいは キャラの板の 四角の 中だけ', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  // 小さい輪（E2E の既定）だと 1 回目と 2 回目で 地面の 1 ドットが ちがうことがある。地面も同じに 撮るため ふだんの輪で（#203）
  await boot(page, true, wide('?nosave=1'));
  await page.addStyleTag({ content: '#hud{display:none !important}' });
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
    h.time.set(0);
    h.inventory.clear();
  });
  await standOnGround(page, 20.5, 20.5, { yaw: 45, pitch: -10 });
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.inventory.setSlot(0, { item: 'bokuto', count: 1 });
    h.inventory.setSlot(1, { item: 'katana', count: 1 });
    h.inventory.select(0);
    h.step(1);
  });
  await waitSpritesReady(page, CHAR2_KATANA);

  const shoot = async (slot: number): Promise<Buffer> => {
    await page.evaluate(async (slot) => {
      const h = window.__rikkun! as any;
      h.inventory.select(slot);
      h.step(1);
      await h.world.settle({ full: true }); // 輪の読みこみ（生成）も おわってから撮る。光とメッシュの pending だけだと 生成中の列が あとから 出る（#203）
      for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n += 5) h.step(5);
      h.step(2);
      h.time.set(0);
      h.player.doll().sprite.restartMotion();
      h.step(30);
    }, slot);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.screenshot();
  };
  const a = await shoot(0);
  const b = await shoot(1);
  const b2 = await shoot(1);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/ac13-bokuto.png`, a);
  writeFileSync(`${OUT}/ac13-katana.png`, b);
  expect(b.equals(b2), '同じ かたなを 2 回 撮ると 同じ（場面が 決定的）').toBe(true);

  // 板の 四すみを 画面へ うつす
  const quad = await page.evaluate(async () => {
    const h = window.__rikkun! as any;
    const p = h.player.get();
    const cam = h.camera.get();
    const fovDeg = h.camera.fov() as number;
    const modelH = (await (await fetch('./models/char/atlas.json')).json()).modelH as number;
    const k = 1.8 / modelH;
    const sprite = h.player.doll().sprite;
    const yaw = (p.yaw * Math.PI) / 180;
    const pitch = (p.pitch * Math.PI) / 180;
    const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const r = [Math.cos(yaw), 0, Math.sin(yaw)];
    const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    const u = cross(r, f);
    const cpos = [cam.position.x, cam.position.y, cam.position.z];
    const center = [p.position.x, p.position.y + 0.95 * k, p.position.z];
    // 板の 向き（src/char/sprite.ts と 同じ）
    let bx: number[];
    let by: number[];
    const dx = cpos[0]! - p.position.x;
    const dz = cpos[2]! - p.position.z;
    if (sprite.tier === 0) {
      const ang = Math.atan2(dx, dz);
      bx = [Math.cos(ang), 0, -Math.sin(ang)];
      by = [0, 1, 0];
    } else {
      let z = [dx, cpos[1]! - center[1]!, dz];
      const zl = Math.hypot(z[0]!, z[1]!, z[2]!);
      z = z.map((v) => v / zl);
      let x = [r[0]!, r[1]!, r[2]!];
      const d = dot(x, z);
      x = x.map((v, i) => v - d * z[i]!);
      const xl = Math.hypot(x[0]!, x[1]!, x[2]!);
      bx = x.map((v) => v / xl);
      by = cross(z, bx);
    }
    const half = k; // 一辺 2k
    const W = 1280;
    const H = 800;
    const th = Math.tan((fovDeg * Math.PI) / 360);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const P = center.map((c, i) => c + half * sx! * bx[i]! + half * sy! * by[i]!);
      const v = P.map((c, i) => c - cpos[i]!);
      const depth = dot(v, f);
      const nx = dot(v, r) / depth / (th * (W / H));
      const ny = dot(v, u) / depth / th;
      return { x: ((nx + 1) / 2) * W, y: ((1 - ny) / 2) * H };
    });
    return { corners, tier: sprite.tier as number };
  });

  // ちがう ドットを 数える（ページの 中で PNG を 読む）
  const toB64 = (buf: Buffer) => buf.toString('base64');
  const diff = await page.evaluate(async ({ a, b }) => {
    const load = async (s: string) => {
      const img = new Image();
      img.src = `data:image/png;base64,${s}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, c.width, c.height);
    };
    const A = await load(a);
    const B = await load(b);
    const pts: [number, number][] = [];
    for (let i = 0; i < A.data.length; i += 4) {
      if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) {
        const px = i / 4;
        pts.push([px % A.width, Math.floor(px / A.width)]);
      }
    }
    return { w: A.width, h: A.height, pts };
  }, { a: toB64(a), b: toB64(b) });

  expect(diff.w).toBe(1280);
  expect(diff.pts.length, 'ぼくとう と かたなで ちがう ドットが 1 つ 以上').toBeGreaterThan(0);
  // 点が 四角形（凸）の 中に あるか。1 ドットぶんの よゆうを みる
  const q = quad.corners;
  const inside = (x: number, y: number): boolean => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const p1 = q[i]!;
      const p2 = q[(i + 1) % 4]!;
      const cr = (p2.x - p1.x) * (y - p1.y) - (p2.y - p1.y) * (x - p1.x);
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const d = cr / len;
      if (Math.abs(d) <= 1) continue;
      const sg = Math.sign(d);
      if (sign === 0) sign = sg;
      else if (sg !== sign) return false;
    }
    return true;
  };
  const outside = diff.pts.filter(([x, y]) => !inside(x! + 0.5, y! + 0.5));
  const xs = diff.pts.map((p) => p[0]!);
  const ys = diff.pts.map((p) => p[1]!);
  console.log(`[AC13] tier ${quad.tier}, ちがうドット ${diff.pts.length}, 範囲 x ${Math.min(...xs)}〜${Math.max(...xs)} y ${Math.min(...ys)}〜${Math.max(...ys)}, 板の四すみ ${q.map((c) => `(${c.x.toFixed(0)},${c.y.toFixed(0)})`).join(' ')}, 四角の外 ${outside.length}`);
  expect(outside.slice(0, 5), '板の 四角の 外で ちがうドット').toEqual([]);
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
