import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
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
async function char2Setup(page: Page, held: 'katana' | 'yumi', names: string[]): Promise<void> {
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
  await page.waitForFunction((ns) => {
    const h = window.__rikkun! as any;
    h.step(1);
    const st = h.player.doll().sprite.status;
    return ns.every((n: string) => st?.[n] === 'ready');
  }, names, { timeout: 8000 });
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
  test.setTimeout(240_000);
  type Scene = { id: string; held: 'none' | 'katana' | 'yumi'; yaw: number; pitch: number; stance?: number; draw?: boolean };
  const scenes: Scene[] = [
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((yaw) => ({ id: `dir-yaw${yaw}`, held: 'none' as const, yaw, pitch: -10 })),
    { id: 'down', held: 'none', yaw: 0, pitch: -75 },
    { id: 'up', held: 'none', yaw: 0, pitch: 75 },
    ...[0, 1, 2].map((stance) => ({ id: `kamae-${stance}`, held: 'katana' as const, yaw: 45, pitch: -10, stance })),
    { id: 'bow-full-draw', held: 'yumi', yaw: 90, pitch: -10, draw: true },
  ];
  const shoot = async (query: string): Promise<Record<string, Buffer>> => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const out: Record<string, Buffer> = {};
    try {
      for (const sc of scenes) {
        await page.goto(`/?nosave=1${query}`);
        await page.waitForFunction(() => window.__rikkun?.ready === true);
        const names = sc.held === 'katana' ? CHAR2_KATANA : sc.held === 'yumi' ? CHAR2_BOW : ['idle', 'walk', 'run', 'jump'];
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
        await page.waitForFunction((ns) => {
          const h = window.__rikkun! as any;
          h.step(1);
          const st = h.player.doll().sprite.status;
          return ns.every((n: string) => st?.[n] === 'ready');
        }, names, { timeout: 10_000 });
        // 世界の光とメッシュが落ちつくまで進める（作る順番は 機械の速さで変わる。落ちつけば 2 回の撮影は 同じ世界）
        await page.evaluate(() => {
          const h = window.__rikkun! as any;
          for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n += 5) h.step(5);
          h.step(2);
          // 待ったステップの数は 機械の速さで ちがう。キャラの コマの数え（立ち 45 ステップに 1 コマ）を ここから数えなおす
          h.player.doll().sprite.restartMotion();
        });
        await page.evaluate((sc) => {
          const h = window.__rikkun! as any;
          for (let i = 0; i < (sc.stance ?? 0); i++) {
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
        }, sc);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        out[sc.id] = await page.screenshot();
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
