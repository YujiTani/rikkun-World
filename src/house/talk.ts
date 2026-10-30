import type { ItemId } from '../contracts';
import { HOUSE_TOOL_IDS } from '../content/items/ids';
import { KURA_MAX, type Kura, type KuraBag } from './kura';
import type { Column } from './placement';

/**
 * 建築士さんと 話す 流れ（HOUSE-1A。docs/design/HOUSE-1.md §2.2 の 4・5、§2.3、§2.4。AC3・AC41）。DOM・three なし。
 *
 *   start → うなずき（建築士さんが 22 ステップ。この 間も ゲームの 時間は すすむ）→ メニュー
 *   はじめて 話す とき だけ、うなずきの あとに あいさつが 2 行（クリック なしで すすむ）。2 行目で 道具を わたしてから メニューが 開く:
 *       「こんにちは！ …」（うなずきの 間から） → 「これを あげる。…」（道具を わたす） → 「なにを する？」（メニュー）
 *   メニューが 開いて いる 間（くらの 画面を ふくむ）は ゲームの 時間を 止める（frozen()。本の 画面と 同じ あつかい）。
 */

/** あいさつの 1 行ごとの 長さ（ステップ）。6 歳が 読める ながさ。うなずき 22 ＋ これ × 2 は E2E の 待ち 300 ステップに 入る */
export const GREET_STEPS = 100;

/** ふきだしの 字（ぜんぶ ひらがな・カタカナ。漢字は 使わない） */
export const SAY = {
  hello: 'こんにちは！ ぼくは けんちくし。いえを たてるよ',
  gift: 'これを あげる。みずもり と どうづき だよ',
  menu: 'なにを する？',
  kura: 'ざいりょうを あずけよう',
  tools: 'どうぞ！ たいせつに してね',
  kuraFull: '999 こ まで だよ',
  bagFull: 'もちものが いっぱい だよ',
} as const;

/** セーブに のこす 建築士さんの 記録: はじめての あいさつを したか・最初の 1 人の 場所（いちど 決まったら 動かさない） */
export interface HouseRecord {
  toolsGiven: boolean;
  first: Column | null;
}

export type HousePage = 'top' | 'kura';
/** メニューの ボタン（§2.3 の 順）。この 票で 動くのは kura・tools・close。editor・build・rename は 出すが 押せない（HOUSE-1B 以降） */
export type HouseButtonId = 'kura' | 'editor' | 'build' | 'rename' | 'tools' | 'close';

export interface HouseButton {
  id: HouseButtonId;
  enabled: boolean;
}

/** 窓口 `house.menu()` の 形 */
export interface HouseMenuState {
  open: boolean;
  page: HousePage | null;
  bubble: string;
  buttons: HouseButton[];
}

export interface HouseTalkDeps {
  record: HouseRecord;
  kura: Kura;
  bag: KuraBag;
  /** 声「ぽぽぽ」を 1 回 鳴らす（話しはじめの とき） */
  voice: () => void;
  /** メニューが 開いた / とじた（時間を 止める・もどす・画面を 出す・けす） */
  onOpen: () => void;
  onClose: () => void;
  /** 話しおわり: 建築士さんに 知らせる（また ぶらぶら 歩く） */
  endTalk: (id: string) => void;
  /** 道具を 1 つ わたした（拾った 知らせを 出す） */
  gave: (item: ItemId) => void;
}

type Phase = 'idle' | 'nod' | 'greet1' | 'greet2' | 'menu';

/** 上の ページの ボタン（道具は 持っていない ときだけ 足す）。live = この 票で 押せる */
const TOP: ReadonlyArray<{ id: HouseButtonId; live: boolean }> = [
  { id: 'kura', live: true },
  { id: 'editor', live: false },
  { id: 'build', live: false },
  { id: 'rename', live: false },
];

export class HouseTalk {
  private phase: Phase = 'idle';
  private page: HousePage | null = null;
  private say = '';
  private timer = 0;
  private who = '';
  private ver = 0;

  constructor(private readonly d: HouseTalkDeps) {}

  /** menu() の 見た目が かわる たびに ふえる 数（画面の 描きなおしの 目印。うなずき・あいさつの カウントダウンでは ふえない） */
  version(): number {
    return this.ver;
  }

  /** 話しはじめる。もう 話して いる（うなずき・あいさつ・メニュー）なら 何もせず false */
  start(id: string): boolean {
    if (this.phase !== 'idle') return false;
    this.who = id;
    this.phase = 'nod';
    this.say = this.d.record.toolsGiven ? SAY.menu : SAY.hello;
    this.ver++;
    this.d.voice();
    return true;
  }

  /** 話して いる 人（建築士さんの id）。話して いなければ null */
  current(): string | null {
    return this.phase === 'idle' ? null : this.who;
  }

  /** メニュー（くらを ふくむ）が 開いて いる 間 true。ゲームの 時間を 止める */
  frozen(): boolean {
    return this.phase === 'menu';
  }

  /** 1 ステップ（時間が すすんで いる 間だけ 呼ぶ）。nodDone = 建築士さんの うなずきが おわったか */
  step(nodDone: boolean): void {
    if (this.phase === 'nod') {
      if (!nodDone) return;
      if (this.d.record.toolsGiven) this.open();
      else {
        this.phase = 'greet1';
        this.timer = GREET_STEPS;
      }
    } else if (this.phase === 'greet1') {
      if (--this.timer <= 0) this.gift();
    } else if (this.phase === 'greet2') {
      if (--this.timer <= 0) this.open();
    }
  }

  /** 窓口 `house.menu()`。話して いない = 空。うなずき・あいさつの 間は ふきだしだけ（open: false） */
  menu(): HouseMenuState {
    if (this.phase === 'idle') return { open: false, page: null, bubble: '', buttons: [] };
    if (this.phase !== 'menu') return { open: false, page: null, bubble: this.say, buttons: [] };
    return { open: true, page: this.page, bubble: this.say, buttons: this.buttons() };
  }

  /** ボタンを 押す。close は どのページ・どの 段階でも 全部 とじる。押せない ボタン・知らない id は 何も おきない */
  press(id: string): void {
    if (id === 'close') {
      this.close();
      return;
    }
    if (this.phase !== 'menu' || this.page !== 'top') return;
    if (id === 'kura') {
      this.page = 'kura';
      this.say = SAY.kura;
      this.ver++;
    } else if (id === 'tools' && this.missingTool()) {
      this.say = this.giveMissing() ? SAY.tools : SAY.bagFull;
      this.ver++;
    }
  }

  /** 話しおわる（Esc・✕・とじる・途中で やめる）。メニューが 開いて いたら onClose も 呼ぶ */
  close(): void {
    if (this.phase === 'idle') return;
    const wasOpen = this.phase === 'menu';
    const who = this.who;
    this.phase = 'idle';
    this.page = null;
    this.say = '';
    this.timer = 0;
    this.ver++;
    if (wasOpen) this.d.onClose();
    this.d.endTalk(who);
  }

  /** くらへ あずける。動いた 数。メニューが とじて いても 使える。999 こで 入りきらない 分は のこり、ふきだしで 知らせる */
  deposit(item: ItemId, want: number): number {
    const moved = this.d.kura.deposit(this.d.bag, item, want);
    this.ver++;
    if (this.phase === 'menu') this.say = moved < Math.floor(want) && this.d.kura.count(item) >= KURA_MAX ? SAY.kuraFull : SAY.kura;
    return moved;
  }

  /** くらから とりだす。動いた 数。持ち物に 入らない 分は くらに のこり、ふきだしで 知らせる */
  withdraw(item: ItemId, want: number): number {
    const had = this.d.kura.count(item);
    const moved = this.d.kura.withdraw(this.d.bag, item, want);
    this.ver++;
    if (this.phase === 'menu') this.say = moved < Math.min(Math.floor(want), had) ? SAY.bagFull : SAY.kura;
    return moved;
  }

  // ------------------------------------------------------------ 中の 動き

  private buttons(): HouseButton[] {
    if (this.page === 'kura') return [{ id: 'close', enabled: true }];
    const out: HouseButton[] = TOP.map((b) => ({ id: b.id, enabled: b.live }));
    if (this.missingTool()) out.push({ id: 'tools', enabled: true });
    out.push({ id: 'close', enabled: true });
    return out;
  }

  /** 2 行目: 道具を わたす。あいさつは これで おわり（持ち物が いっぱいで わたせなくても くりかえさない。「どうぐを もらう」が のこる） */
  private gift(): void {
    this.phase = 'greet2';
    this.timer = GREET_STEPS;
    this.d.record.toolsGiven = true;
    this.say = this.giveMissing() ? SAY.gift : SAY.bagFull;
    this.ver++;
  }

  private open(): void {
    this.phase = 'menu';
    this.page = 'top';
    this.say = SAY.menu;
    this.ver++;
    this.d.onOpen();
  }

  /** どちらかの 道具を 持って いない（どうぐを もらう を 出す） */
  private missingTool(): boolean {
    return HOUSE_TOOL_IDS.some((id) => this.d.bag.count(id) === 0);
  }

  /** 持って いない 道具を 1 こずつ わたす。ぜんぶ 持つ ことに なったら true（入りきらない 分が あれば false） */
  private giveMissing(): boolean {
    let all = true;
    for (const id of HOUSE_TOOL_IDS) {
      if (this.d.bag.count(id) > 0) continue;
      if (this.d.bag.add(id, 1) === 0) this.d.gave(id);
      else all = false;
    }
    return all;
  }
}
