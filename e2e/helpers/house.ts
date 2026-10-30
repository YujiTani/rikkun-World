import { expect, type Locator, type Page } from '@playwright/test';
import { findUnrubiedKanji } from '../../src/ui/text';
import { waitAnimationsDone } from './anim';
import { installAimHelpers } from './aim';

/**
 * HOUSE-1A（#338。docs/design/HOUSE-1.md §2.1〜2.4・§5・§6、docs/tickets/HOUSE-1A.md）の E2E が くり返し使う準備。
 * 数・座標・角度は 決め打ちしない: 建築士さんの 場所・スタート地点・ねらいは ゲーム（window.__rikkun）に 聞く。
 * 進めるのは step の数で、時間（ms）では 合否を 決めない（#255）。
 *
 * 窓口（仕様 §6.1）`window.__rikkun.house`:
 *   architects()      → { id, x, y, z, first, busy }[]    読みこまれて いる 建築士さん（x・y・z は 足もと）
 *   talk(id)          右クリックで 話すのと 同じ
 *   menu()            → { open, page: 'top'|'kura'|…|null, bubble, buttons: { id, enabled }[] }
 *   press(id, arg?)   メニューの ボタンを 押す
 *   kura()            → Record<itemId, number>     deposit(item, n) / withdraw(item, n) → 動いた 数
 *                     （deposit・withdraw は メニューが とじて いても 動く。くらへ 直接 あずける・とりだす。UI 検査の くらの 準備で 使う）
 *
 * ---- PO が 決めた つなぎ目の 約束（docs/tickets/HOUSE-1A.md「つなぎ目の 約束」。テストは これを 前提に する）----
 *   話す:   はじめての あいさつ（「こんにちは…」「これを あげる…」）は クリック なしで 進む。
 *           menu().open が true に なるのは、うなずきが おわって ボタンまで 出た とき（open が true なら ボタンは そろって いる）。
 *           はじめての 道具（みずもり・どうづき。アイテムの id は mizumori・dotsuki）は open が true に なる 前に わたす。
 *   場所:   最初の 1 人の「横 6〜10 マス」は world.spawn() からの XZ の 直線きょり。
 *   くら:   右（あずけた 物）は 1 こ以上 ある 種類だけ 出す（0 に なった マスは 消える）。
 *   とじる: Esc は どの ページでも press('close') と 同じ（全部 とじる）。くらの 画面にも ✕（house-btn-close）を 置く（もちもの 画面と 同じ）。
 *   押せない ボタン: disabled か aria-disabled="true"（menu().buttons[].enabled が false の もの）。
 *   ふきだし: HTML（data-testid="house-bubble"）。頭の 上に 出す 置き方は 自由（house-menu の 中に なくて よい。どこに あっても 見つける）。
 *   くらの マス: div（button に するなら 1280×800 で 56px 以上。UI 検査の きまり）。画面は 今の UI 部品（src/ui/theme）。字の 大きさは 16/20/24/32/48 から。
 *   時刻・妖怪（票の やること 6・AC41）: メニュー・くらが 開いて いる 間は 止まる（本の 画面と 同じ）。とじると また 進む。
 *
 * ---- 仕様に 名前が 無い ので テストが 決めた 約束（開発は これに そろえる。変えるなら この ファイルだけ 直す）----
 *   ボタンの id（menu().buttons[].id・press(id)・DOM の data-testid="house-btn-<id>"）。上から この 順（§2.3）:
 *     kura（あずける・とりだす）｜editor（いえを つくる）｜build（けんちくを はじめる）｜rename（なまえを かえる）｜tools（どうぐを もらう。道具を 持って いる ときは 出さない）｜close（とじる）
 *     press('close') は どの ページからでも メニューを 全部 とじる（Esc も 同じ）。くらの ✕ も data-testid="house-btn-close"。
 *   DOM（data-testid）:
 *     house-menu     上の メニューの 外わく（ボタン 6 つ。page 'top' の とき だけ ある）
 *     house-bubble   ふきだしの 字（menu().bubble と 同じ 字。画面の どこに あっても よい）
 *     house-kura     くらの 画面の 外わく（✕ ＋ 持ち物 ＋ くら ＋ 数の えらび。page 'kura' の とき だけ ある）
 *     kura-bag       左: 持ち物の マス（1 マス 1 つ。data-item="<id>"・data-count="<数>"。空きマスは data-item なし）
 *     kura-store     右: くらの マス（1 こ以上 ある 種類だけ。data-item="<id>"・data-count="<数>"）
 *     kura-count     下: 数の えらびの 数（はじめは 1。1 〜 動かせる 数 の 間）
 *     kura-minus10 / kura-minus1 / kura-plus1 / kura-plus10 / kura-all   数の えらびの ボタン（all = ぜんぶ）。kura- で 始まる 物は kura-count の ほか ぜんぶ 押せる 物（48px 以上を 見る）
 *     kura-deposit / kura-withdraw   「あずける」「とりだす」（持ち物の マスを えらんだ ときは あずける、くらの マスは とりだす だけ 出る）
 *   声の 効果音（audio.sfx() の 名前）: architect か kenchiku か popo か voice を ふくむ 名前（VOICE）。話すと ちょうど 1 回。
 */

export interface Architect {
  id: number | string;
  x: number;
  y: number;
  z: number;
  first: boolean;
  busy: boolean;
}

export interface MenuState {
  open: boolean;
  page: string | null;
  bubble: string;
  buttons: { id: string; enabled: boolean }[];
}

/** 上の メニューの ボタンの 並び（§2.3）。tools は 道具が ない ときだけ */
export const BTN_ORDER = ['kura', 'editor', 'build', 'rename', 'tools', 'close'] as const;

export const TID = {
  menu: 'house-menu',
  bubble: 'house-bubble',
  kura: 'house-kura',
  btn: (id: string) => `house-btn-${id}`,
  bag: 'kura-bag',
  store: 'kura-store',
  count: 'kura-count',
  minus10: 'kura-minus10',
  minus1: 'kura-minus1',
  plus1: 'kura-plus1',
  plus10: 'kura-plus10',
  all: 'kura-all',
  deposit: 'kura-deposit',
  withdraw: 'kura-withdraw',
} as const;

/** 声の 効果音の 名前（仕様に 名前が 無い。サウンドが 名前を 決めたら ここだけ 直す） */
export const VOICE = /architect|kenchiku|popo|voice/i;

export const tid = (page: Page, id: string) => page.getByTestId(id);

/** 見えている 要素だけ（同じ data-testid の 隠れた 物が 残って いても まよわない。✕ は 上の メニューにも くらにも ある） */
export const shownTid = (page: Page, id: string): Locator => tid(page, id).filter({ visible: true });

/** 新しい 世界を 開く（既定は ?nosave=1）。一時停止・ロックを まねる・妖怪も 動物も 出さない・持ち物を 空に・音を 使える ように する */
export async function openHouse(page: Page, query = '?nosave=1'): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  // 窓口（仕様 §6.1）が まだ 無い ときは、ここで 分かりやすく 落ちる（実装の 前の 赤）
  expect(
    await page.evaluate(() => typeof (window as any).__rikkun?.house?.architects),
    'window.__rikkun.house（仕様 §6.1 の テスト用 窓口）が まだ ない',
  ).toBe('function');
  // 最初のクリックで 音が 使えるように なる（unlock）。ないと audio.sfx() の 記録が 空の まま（SOUND-1 の openGame と 同じ）。
  // このとき 本物の ポインターロックも かかる ので、下で はなす（のこると 画面の ボタンを マウスで 押せない）
  await page.mouse.click(0, 0);
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true);
    document.exitPointerLock();
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.settings.set('animalAutoSpawn', false);
    h.yokai.clear();
    h.animals.clear();
    h.inventory.clear();
    h.step(2);
    h.audio.sfx(); // 記録を 空に する
  });
  await page.waitForFunction(() => !document.pointerLockElement);
}

export const stepUi = (page: Page, n = 2): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);

export const spawnPoint = (page: Page): Promise<{ x: number; z: number }> =>
  page.evaluate(() => {
    const s = (window as any).__rikkun.world.spawn();
    return { x: s.x as number, z: s.z as number };
  });

export const architects = (page: Page): Promise<Architect[]> => page.evaluate(() => (window as any).__rikkun.house.architects());

/** 建築士さんが 読みこまれるまで 少し 進めて（上限 max ステップ）、一覧を 返す */
export function waitArchitects(page: Page, max = 30): Promise<Architect[]> {
  return page.evaluate((max) => {
    const h = (window as any).__rikkun;
    for (let n = 0; n < max && h.house.architects().length === 0; n++) h.step(1);
    return h.house.architects();
  }, max);
}

export const menuState = (page: Page): Promise<MenuState> => page.evaluate(() => (window as any).__rikkun.house.menu());
export const kura = (page: Page): Promise<Record<string, number>> => page.evaluate(() => (window as any).__rikkun.house.kura());
export const countOf = (page: Page, item: string): Promise<number> => page.evaluate((i) => (window as any).__rikkun.inventory.count(i), item);

/** メニューの ボタンを 押す（hook）。2 ステップ 進めてから メニューの 状態を 返す */
export function press(page: Page, id: string, arg?: unknown): Promise<MenuState> {
  return page.evaluate(
    ({ id, arg }) => {
      const h = (window as any).__rikkun;
      h.house.press(id, arg);
      h.step(2);
      return h.house.menu();
    },
    { id, arg },
  );
}

/**
 * 画面の 要素を 押して 2 ステップ 進める（画面の 更新は ステップで 進む）。
 * クリックは 見つかるまで テストの 時間いっぱい 待ち続ける ので、先に 見えて いるか 確かめて、なければ すぐ 落とす（what = 何を 押す はずか）。
 */
export async function clickUi(page: Page, locator: Locator, what?: string): Promise<void> {
  await expect(locator.first(), `押す 物が 画面に 見えない: ${what ?? String(locator)}`).toBeVisible();
  await locator.click();
  await stepUi(page);
}

/** 建築士さん a の 2 マス 南の 平らな 地面に 立つ（足場の 石の 床を 敷き、目の 前の 草花・はっぱを 空気に する）。向きは 北（−z） */
export async function standNear(page: Page, a: Pick<Architect, 'x' | 'z'>): Promise<void> {
  await page.evaluate(({ x, z }) => {
    const h = (window as any).__rikkun;
    const gy: number = h.world.groundHeight(Math.floor(x), Math.floor(z));
    const x0 = Math.floor(x) - 4;
    const x1 = Math.floor(x) + 4;
    const z0 = Math.floor(z) - 4;
    const z1 = Math.floor(z) + 4;
    h.world.fill(x0, gy, z0, x1, gy, z1, 'stone');
    h.world.fill(x0, gy + 1, z0, x1, gy + 4, z1, 'air');
    h.player.set({ position: { x, y: gy + 1, z: z + 2 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    h.step(2);
  }, a);
}

/**
 * 建築士さんの 2 マス 南に 立って、からだの まん中（足もとから 0.5 マス 上）を ねらう（窓口 `__aim.sOffset` の 肩の 点 S から くりかえして 求める。
 * `__aim.solve` と 同じ 式を ブロックの まん中でなく 実際の 位置に 使う）。右クリックは 呼ぶ ほうが 押す。
 */
export async function aimAtArchitect(page: Page, id: Architect['id']): Promise<void> {
  const a = (await architects(page)).find((x) => x.id === id);
  if (!a) throw new Error(`建築士さん ${String(id)} が 読みこまれて いない`);
  await standNear(page, a);
  await page.evaluate((id) => {
    const h = (window as any).__rikkun;
    const aim = (window as any).__aim;
    const a = h.house.architects().find((x: any) => x.id === id);
    const p = h.player.get().position;
    const t = { x: a.x as number, y: (a.y as number) + 0.5, z: a.z as number };
    let yaw = 0;
    let pitch = 0;
    for (let i = 0; i < 8; i++) {
      const o = aim.sOffset(yaw, pitch);
      const dx = t.x - (p.x + o.dx);
      const dy = t.y - (p.y + o.dy);
      const dz = t.z - (p.z + o.dz);
      yaw = (Math.atan2(dx, -dz) * 180) / Math.PI;
      pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    }
    h.player.set({ yaw, pitch });
    h.step(1);
  }, id);
}

export interface Talked {
  /** 話しはじめてから メニューが 開くまでの ステップ（うなずき ＋ ふきだし。記録だけ） */
  steps: number;
  /** メニューが 開いた あと 3 ステップ 進めた ときの 状態 */
  menu: MenuState;
  /** 話しはじめてから メニューが 開いた あと 3 ステップまでに 鳴った 効果音の 名前 */
  sfx: string[];
  /**
   * menu().open が はじめて true に なった ステップの 状態: ボタンの id の 並びと、持ち物の 道具の 数。
   * 約束どおりなら、open が true の とき ボタンは そろって いて、はじめての 道具は もう わたして ある。開かなければ null
   */
  atOpen: { buttons: string[]; mizumori: number; dotsuki: number } | null;
}

/**
 * 建築士さんに 話す。
 *   via 'rightClick': 2 マス 南から ねらって 右クリック（押して はなす）。入力の 道を 通す
 *   via 'hook'      : 近くに 立って house.talk(id)（右クリックと 同じ。準備用）
 * そのあと メニューが 開くまで 1 ステップずつ 進めて（うなずきを 待つ。上限 max）、音の 名前を ためる。
 */
export async function talkTo(page: Page, id: Architect['id'], via: 'rightClick' | 'hook', max = 300): Promise<Talked> {
  if (via === 'rightClick') {
    await aimAtArchitect(page, id);
  } else {
    const a = (await architects(page)).find((x) => x.id === id);
    if (!a) throw new Error(`建築士さん ${String(id)} が 読みこまれて いない`);
    await standNear(page, a);
  }
  return page.evaluate(
    ({ id, via, max }) => {
      const h = (window as any).__rikkun;
      h.lock.simulate(true); // 遊んでいる（ロック中）。メニューを とじた あとの 右クリックの ため
      const sfx: string[] = [];
      const drain = () => {
        for (const r of h.audio.sfx()) sfx.push(String(r.name));
      };
      h.audio.sfx(); // 話す 前の 音は すてる（前の 話の 声が 今回の 数に 入らない ように、記録を 空に する）
      const seen: { at: { buttons: string[]; mizumori: number; dotsuki: number } | null } = { at: null };
      const look = () => {
        if (seen.at || !h.house.menu().open) return;
        seen.at = {
          buttons: h.house.menu().buttons.map((b: { id: string }) => b.id),
          mizumori: h.inventory.count('mizumori'),
          dotsuki: h.inventory.count('dotsuki'),
        };
      };
      let steps = 0;
      if (via === 'hook') {
        h.house.talk(id);
        look();
      } else {
        h.input.release('secondary');
        h.input.press('secondary');
        h.step(1);
        steps++;
        drain();
        look();
        h.input.release('secondary');
      }
      while (!seen.at && steps < max) {
        h.step(1);
        steps++;
        drain();
        look();
      }
      for (let i = 0; i < 3; i++) {
        h.step(1);
        drain();
      }
      return { steps, menu: h.house.menu(), sfx, atOpen: seen.at };
    },
    { id, via, max },
  );
}

/** 声の 効果音の 数 */
export const voiceCount = (names: string[]): number => names.filter((n) => VOICE.test(n)).length;

/**
 * 上の メニューの 画面（DOM）が menu() と 食いちがう ところ（空 = 同じ）:
 * ボタンの 並び・押せるか（disabled / aria-disabled）・ふきだしの 字。ふきだしは 画面の どこに あっても よい（house-menu の 中でなくて よい）。
 */
export async function menuMismatch(page: Page): Promise<string[]> {
  await waitAnimationsDone(page); // 開く・ぴょこんの 動きの 途中で 見えているか を 決めない
  return page.evaluate(
    ({ root, bubble, prefix }) => {
      const h = (window as any).__rikkun;
      const m = h.house.menu();
      const out: string[] = [];
      const rootEl = document.querySelector(`[data-testid="${root}"]`);
      if (!rootEl) return [`画面に ${root} が ない`];
      const shown = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      const dom = Array.from(rootEl.querySelectorAll(`[data-testid^="${prefix}"]`))
        .filter(shown)
        .map((el) => ({
          id: (el.getAttribute('data-testid') ?? '').slice(prefix.length),
          enabled: !((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true'),
        }));
      if (JSON.stringify(dom.map((d) => d.id)) !== JSON.stringify(m.buttons.map((b: { id: string }) => b.id))) {
        out.push(`ボタンの 並びが ちがう: 画面 ${dom.map((d) => d.id).join(',')} / menu() ${m.buttons.map((b: { id: string }) => b.id).join(',')}`);
      } else {
        m.buttons.forEach((b: { id: string; enabled: boolean }, i: number) => {
          if (dom[i]!.enabled !== b.enabled) out.push(`${b.id}: 押せるか ちがう（画面 ${dom[i]!.enabled} / menu() ${b.enabled}）`);
        });
      }
      const bubbleEl = document.querySelector(`[data-testid="${bubble}"]`);
      if (!bubbleEl) {
        out.push(`画面に ${bubble} が ない`);
      } else {
        // ふりがな（rt）は 数えない。字が 1 字ずつ 出る 作りでも 前から 同じなら 同じと みなす
        const clone = bubbleEl.cloneNode(true) as Element;
        clone.querySelectorAll('rt, rp').forEach((n) => n.remove());
        const shown = (clone.textContent ?? '').replace(/\s+/g, '');
        const said = String(m.bubble).replace(/\s+/g, '');
        if (!shown) out.push('ふきだしの 字が 空');
        else if (!(said.startsWith(shown) || shown.startsWith(said))) out.push(`ふきだしの 字が ちがう: 画面「${shown}」/ menu()「${said}」`);
      }
      return out;
    },
    { root: TID.menu, bubble: TID.bubble, prefix: 'house-btn-' },
  );
}

/** 画面の 外わく（セレクタ）の 中の HTML（ふりがなの 漢字しらべ 用） */
export const htmlOf = (page: Page, id: string): Promise<string> => page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.innerHTML ?? '', id);

/** 持ち物を 決めた 物だけに する（clear → add）。選ぶのは 先頭 */
export async function setBag(page: Page, items: Record<string, number>): Promise<void> {
  await page.evaluate((items) => {
    const h = (window as any).__rikkun;
    h.inventory.clear();
    for (const [item, n] of Object.entries(items)) h.inventory.add(item, n);
    h.step(1);
  }, items);
}

// ---------------------------------------------------------------- ほかの 建築士さんを さがす（AC5 の 2 人目）

/** 区画の 大きさ（AC2）。輪の 読みこみ 半径は 8 列（128 マス）なので、この 間かくの 点を まわれば 世界を おおう */
const REGION = 192;

/**
 * 最初の 1 人 いがいの 建築士さんを さがす。読みこまれて いれば それ。なければ スタートから 区画の 大きさ ごとの 点
 * （ちかい 順に 24 か所まで）へ teleport して、そろうまで 待って 窓口に 聞く。見つからなければ 落ちる。
 * （窓口 `architects()` は 読みこまれて いる 建築士さんだけ。シードで 決まる 場所を 先に 聞く 口は 仕様 §6.1 に ない）
 */
export async function findOtherArchitect(page: Page): Promise<Architect> {
  const near = (await architects(page)).find((a) => !a.first);
  if (near) return near;
  const sp = await spawnPoint(page);
  const spots: [number, number][] = [];
  for (let r = 1; r <= 3; r++) {
    const ring: [number, number][] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r) ring.push([dx, dz]);
    ring.sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
    spots.push(...ring);
  }
  const tried: string[] = [];
  for (const [dx, dz] of spots.slice(0, 24)) {
    const x = Math.round(sp.x + dx * REGION);
    const z = Math.round(sp.z + dz * REGION);
    tried.push(`(${x}, ${z})`);
    await page.evaluate(
      async ({ x, z }) => {
        const h = (window as any).__rikkun;
        h.world.teleport(x, z);
        // settle() は 時間切れ（maxFrames）でも 例外を 出さず 返す。読みこみが おわって いないのに「いない」と 見まちがえて 次の 点へ 進まない
        const s = await h.world.settle({ full: true });
        if (!s.ready || s.queued > 0 || s.columns.loading > 0) {
          throw new Error(`(${x}, ${z}) の 読みこみが おわらない（ready=${s.ready} queued=${s.queued} loading=${s.columns.loading}）。建築士さんが「いない」と 見まちがえない ために 落とす`);
        }
        h.step(5);
      },
      { x, z },
    );
    const other = (await architects(page)).find((a) => !a.first);
    if (other) return other;
  }
  throw new Error(`最初の 1 人の ほかの 建築士さんが 見つからない（まわった 点: ${tried.join(' ')}）。シードで 決まる 場所を 聞く 窓口が いるかも`);
}

// ---------------------------------------------------------------- UI 検査（AC35）

export interface HouseIssue {
  kind: string;
  target: string;
  detail: string;
}

/**
 * AC35 の 数: 外わく（セレクタ。いくつでも）の 中の 字は 24 px 以上（ふりがな rt は のぞく）、押せる 物は 48 px 以上。
 * 押せる 物 = <button>・role="button"・house-btn-*・kura-（kura-count の ほか。持ち物と くらの マス・数の えらび・あずける・とりだす）。
 * 拡大・縮小の 動き（ぴょこん）の 途中で はからない ように、動きが おわるのを 待ってから はかる。
 * UI 検査の 画面ごと・大きさごとに 呼ぶ（e2e/ui-gate.spec.ts の Screen.extra）。見つけた くずれの 一覧（空 = 合格）。
 */
export async function houseUiIssues(page: Page, rootSels: string[]): Promise<HouseIssue[]> {
  const found: HouseIssue[] = [];
  for (const rootSel of rootSels) {
    await waitAnimationsDone(page, rootSel);
    found.push(...(await rootIssues(page, rootSel)));
  }
  return found;
}

function rootIssues(page: Page, rootSel: string): Promise<HouseIssue[]> {
  return page.evaluate(({ rootSel, countTid }) => {
    const out: { kind: string; target: string; detail: string }[] = [];
    const root = document.querySelector(rootSel);
    if (!root) return out;
    const label = (el: Element): string => {
      const cls = Array.from(el.classList).slice(0, 3);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls.length ? '.' + cls.join('.') : ''}`;
    };
    const visible = (el: Element): boolean => {
      for (let p: Element | null = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden' || (p as HTMLElement).hidden || parseFloat(cs.opacity) <= 0.01) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
      if (!visible(el)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'rt' || el.closest('rt')) continue;
      let text = '';
      for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) text += n.textContent ?? '';
      text = text.replace(/\s+/g, ' ').trim();
      if (text) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 23.95) out.push({ kind: 'font24', target: `${label(el)}「${text.slice(0, 16)}」`, detail: `字が ${fs}px（24px 以上）` });
      }
      const tapTid = el.getAttribute('data-testid') ?? '';
      const pressable =
        tag === 'button' || el.getAttribute('role') === 'button' || tapTid.startsWith('house-btn-') || (tapTid.startsWith('kura-') && tapTid !== countTid);
      if (pressable) {
        const r = el.getBoundingClientRect();
        if (r.width < 47.5 || r.height < 47.5) {
          out.push({ kind: 'tap48', target: `${label(el)}${text ? `「${text.slice(0, 16)}」` : ''}`, detail: `押せる 大きさが ${r.width.toFixed(0)}×${r.height.toFixed(0)}px（48px 以上）` });
        }
      }
    }
    return out;
  }, { rootSel, countTid: TID.count });
}

/**
 * くらを「今の 登録表の 最大」にする: 重ねられる アイテムの 種類を ぜんぶ 1 種ずつ あずけ（登録表から 数える。数は 決め打ちしない）、
 * 先頭の 1 種は 999 まで。持ち物は 重ねられる 物で 36 マスまで うめる。重ねられる 種類の 数と、くらに 入った 種類の 数を 返す。
 * 今の 登録表では 仕様 §3.2 の「100 種 以上 → スクロール」には とどかない。スクロールの 見張りは 実装側（CSS・ユニット）か オーナー確認。
 */
export function fillKuraAndBag(page: Page): Promise<{ stackable: number; kinds: number }> {
  return page.evaluate(() => {
    const h = (window as any).__rikkun;
    const stackable: { id: string; maxStack: number }[] = h.inventory.itemTypes().filter((t: { maxStack: number }) => t.maxStack >= 2);
    for (const t of stackable) {
      h.inventory.clear();
      h.inventory.add(t.id, Math.min(t.maxStack, 64));
      h.house.deposit(t.id, 999);
    }
    const top = stackable[0]!;
    const rounds = Math.ceil(999 / top.maxStack) + 1; // 1 回に 1 マス（maxStack こ）ずつ あずけて、999 を こえるまで
    for (let i = 0; i < rounds; i++) {
      h.inventory.clear();
      h.inventory.add(top.id, top.maxStack);
      h.house.deposit(top.id, 999);
    }
    h.inventory.clear();
    stackable.slice(0, 36).forEach((t, i) => h.inventory.setSlot(i, { item: t.id, count: Math.min(t.maxStack, 64) }));
    h.step(2);
    return { stackable: stackable.length, kinds: Object.keys(h.house.kura()).length };
  });
}

/** UI 検査の 画面「メニュー」: 道具を なくして 2 回目に 話す（ボタンが 6 つ ぜんぶ 出る いちばん 多い とき） */
export async function openMenuScreen(page: Page): Promise<void> {
  await openHouse(page);
  const first = (await waitArchitects(page)).find((a) => a.first)!;
  await talkTo(page, first.id, 'hook'); // はじめて: 道具を もらう
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.house.press('close');
    h.step(2);
    h.inventory.clear();
    h.step(1);
  });
  const t = await talkTo(page, first.id, 'hook');
  expect(t.menu.buttons.map((b) => b.id), 'ボタン 6 つ（道具が ないので「どうぐを もらう」も 出る）').toEqual([...BTN_ORDER]);
}

/**
 * UI 検査の 画面「くら」: くらは 重ねられる 物 ぜんぶ（今の 登録表の 最大）、持ち物は いっぱい。持ち物の 先頭の マスを えらんで 数の えらびを 出す。
 * 全種類の 名前が 出る ので、ふりがなの ない 漢字（間欠泉の つち など）も ここで 見る。
 */
export async function openKuraScreen(page: Page): Promise<void> {
  await openHouse(page);
  const first = (await waitArchitects(page)).find((a) => a.first)!;
  await talkTo(page, first.id, 'hook');
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.house.press('close');
    h.step(2);
  });
  const { stackable, kinds } = await fillKuraAndBag(page);
  expect(kinds, '重ねられる 物は 種類が いくつ あっても ぜんぶ くらに 入る（AC6）').toBe(stackable);
  await talkTo(page, first.id, 'hook');
  await press(page, 'kura');
  expect((await menuState(page)).page).toBe('kura');
  await clickUi(page, tid(page, TID.bag).first());
  expect(findUnrubiedKanji(await htmlOf(page, TID.kura)), 'ふりがなの ない 漢字（くら・重ねられる 物 ぜんぶ）').toEqual([]);
}
