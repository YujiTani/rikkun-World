import type { ItemId } from '../contracts';
import { HOUSE_TOOL_IDS } from '../content/items/ids';
import { editorButtons } from './editor/buttons';
import type { EditorController } from './editor/controller';
import { pressEditor } from './editor/ops';
import { FUDE } from './editor/sheet';
import { KURA_MAX, type Kura, type KuraBag } from './kura';
import { RENAME_SAY, type HouseRename } from './rename';
import type { Column } from './placement';

/**
 * 建築士さんと 話す 流れ（HOUSE-1A。docs/design/HOUSE-1.md §2.2 の 4・5、§2.3、§2.4。AC3・AC41）。DOM・three なし。
 *
 *   start → うなずき（建築士さんが 22 ステップ。この 間も ゲームの 時間は すすむ）→ メニュー
 *   はじめて 話す とき だけ、うなずきの あとに あいさつが 2 行（クリック なしで すすむ）。2 行目で 道具を わたしてから メニューが 開く:
 *       「こんにちは！ …」（うなずきの 間から） → 「これを あげる。…」（道具を わたす） → 「なにを する？」（メニュー）
 *   1B（#339）から: あいさつの 2 行目で ふでも わたす。#339 より 前に 道具を もらった セーブは、うなずきの あと「ふで を あげる」の 1 行（100 ステップ）で ふでを わたして メニュー。
 *   メニューの「せっけいずを つくる」で エディター（page 'editor'。「ひつような もの」が 出て いる 間は page 'need'）。
 *   メニューが 開いて いる 間（くらの 画面を ふくむ）は ゲームの 時間を 止める（frozen()。本の 画面と 同じ あつかい）。
 */

/** あいさつの 1 行ごとの 長さ（ステップ）。6 歳が 読める ながさ。うなずき 22 ＋ これ × 2 は E2E の 待ち 300 ステップに 入る */
export const GREET_STEPS = 100;

/** ふきだしの 字（ぜんぶ ひらがな・カタカナ。漢字は 使わない） */
export const SAY = {
  hello: 'こんにちは！ ぼくは けんちくし。いえを たてるよ',
  gift: 'これを あげる。みずもり と どうづき と ふで だよ',
  fude: 'ふで を あげる。せっけいずを かく ときに つかってね',
  made: 'せっけいずが できたよ！',
  menu: 'なにを する？',
  kura: 'ざいりょうを あずけよう',
  tools: 'どうぞ！ たいせつに してね',
  kuraFull: '999 こ まで だよ',
  bagFull: 'もちものが いっぱい だよ',
} as const;

/** セーブに のこす 建築士さんの 記録: はじめての あいさつを したか・はじめの ふでを わたしたか・最初の 1 人の 場所（いちど 決まったら 動かさない） */
export interface HouseRecord {
  toolsGiven: boolean;
  /** はじめの ふでを わたせた とき だけ true（持ち物が いっぱいで わたせない ときは false の まま） */
  fudeGiven: boolean;
  first: Column | null;
}

type HousePage = 'top' | 'kura' | 'editor' | 'need' | 'rename' | 'renameName';
/** 上の メニューの ボタン（§2.3 の 順）。動くのは kura・editor・rename〔建てた 家が あるとき〕・tools・close。build は 出すが 押せない（PR-2） */
export type HouseButtonId = 'kura' | 'editor' | 'build' | 'rename' | 'tools' | 'close';

/** 窓口の ボタン。上の メニューは HouseButtonId、エディターは editor/buttons.ts の id */
export interface HouseButton {
  id: string;
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
  /** 持ち物の ほかに 持って いる 数（たんすの 中。なければ 0）。持って いる 道具は あげない・「どうぐを もらう」に 出さない */
  owned?: (item: ItemId) => number;
  /** エディターの 持ち主（作りかけ・もどす・できた！の しらべ） */
  editor: EditorController;
  /** なまえを かえる（建てた 家の 一覧・名前の 画面） */
  rename: HouseRename;
}

type Phase = 'idle' | 'nod' | 'greet1' | 'greet2' | 'menu';
type Page = 'top' | 'kura' | 'editor' | 'rename' | 'renameName';

/** 上の ページの ボタン（道具は 持っていない ときだけ 足す）。live = いま 押せる */
const TOP: ReadonlyArray<{ id: HouseButtonId; live: boolean }> = [
  { id: 'kura', live: true },
  { id: 'editor', live: true },
  { id: 'build', live: false },
  { id: 'rename', live: true },
];

export class HouseTalk {
  private phase: Phase = 'idle';
  private page: Page | null = null;
  private say = '';
  private timer = 0;
  private who = '';
  private ver = 0;

  constructor(private readonly d: HouseTalkDeps) {}

  /** menu() の 見た目が かわる たびに ふえる 数（画面の 描きなおしの 目印。うなずき・あいさつの カウントダウンでは ふえない） */
  version(): number {
    return this.ver + this.d.editor.version;
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
      if (this.d.record.toolsGiven && this.d.record.fudeGiven) this.open();
      else if (this.d.record.toolsGiven) this.giveFude();
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
    const ed = this.page === 'editor';
    return { open: true, page: ed && this.d.editor.needOpen ? 'need' : this.page, bubble: ed ? (this.d.editor.bubble?.text ?? '') : this.say, buttons: this.buttons() };
  }

  /** ボタンを 押す。close は どのページ・どの 段階でも 全部 とじる。押せない ボタン・知らない id は 何も おきない。arg は 仕様 §6.1 の 2 引数の 形（windowKind・roof） */
  press(id: string, arg?: unknown): void {
    if (id === 'close') {
      this.close();
      return;
    }
    if (this.phase !== 'menu') return;
    if (this.page === 'editor') {
      pressEditor(this.d.editor, id, arg);
      return;
    }
    if (this.page === 'rename' || this.page === 'renameName') {
      this.pressRename(id, arg);
      return;
    }
    if (this.page !== 'top') return;
    if (id === 'rename' && this.d.rename.available()) {
      this.page = 'rename';
      this.say = RENAME_SAY.pick;
      this.ver++;
    } else if (id === 'kura') {
      this.page = 'kura';
      this.say = SAY.kura;
      this.ver++;
    } else if (id === 'editor') {
      this.page = 'editor';
      this.d.editor.open();
      this.ver++;
    } else if (id === 'tools' && this.canGetTools()) {
      this.say = this.giveMissing() ? SAY.tools : SAY.bagFull;
      this.ver++;
    }
  }

  /** なまえを かえる の 2 ページ: 一覧から えらぶ（`renamePick-<id>`。`press('renamePick', id)` も 同じ）／名前の 画面の ボタン／これで いい！・やめる */
  private pressRename(id: string, arg: unknown): void {
    const r = this.d.rename;
    if (this.page === 'rename') {
      const n = id === 'renamePick' ? Number(arg) : id.startsWith('renamePick-') ? Number(id.slice(11)) : Number.NaN;
      if (Number.isInteger(n) && r.pick(n)) {
        this.page = 'renameName';
        this.say = RENAME_SAY.name;
        this.ver++;
      }
      return;
    }
    if (id === 'renameCancel') {
      r.leave();
      this.toTop();
    } else if (id === 'renameOk') {
      const ok = r.confirm();
      if (ok === 'ok') this.toTop();
      else if (ok === 'noName' || ok === 'ngWord') {
        this.say = ok === 'noName' ? RENAME_SAY.noName : RENAME_SAY.ngWord;
        this.ver++;
      }
    } else {
      // よくない ことばで 止めた ときは、かわらなくても ふきだし（エディターの ③ なまえと 同じ 言い方）
      const changed = r.press(id);
      const bubble = r.takeBubble();
      if (changed || bubble !== null) {
        this.say = bubble ?? RENAME_SAY.name;
        this.ver++;
      }
    }
  }

  private toTop(): void {
    this.page = 'top';
    this.say = SAY.menu;
    this.ver++;
  }

  /** Esc: エディターで 確かめの まど・ひつような もの・家具の えらびが あれば それを とじる。なければ 全部 とじる（AC55） */
  escape(): void {
    if (this.phase === 'menu' && this.page === 'editor' && this.d.editor.escape()) return;
    this.close();
  }

  /** エディターが 開いて いる（ひつような ものが 出て いる 間も） */
  editing(): boolean {
    return this.phase === 'menu' && this.page === 'editor';
  }

  /** できた！が 通った: エディターを とじて 上の ページへ。ふきだし「せっけいずが できたよ！」 */
  made(): void {
    if (this.phase !== 'menu') return;
    this.page = 'top';
    this.say = SAY.made;
    this.ver++;
  }

  /** 話しおわる（Esc・✕・とじる・途中で やめる）。メニューが 開いて いたら onClose も 呼ぶ */
  close(): void {
    if (this.phase === 'idle') return;
    const wasOpen = this.phase === 'menu';
    const who = this.who;
    this.phase = 'idle';
    this.page = null;
    this.d.rename.leave();
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
    if (this.page === 'rename') return this.d.rename.listButtons();
    if (this.page === 'renameName') return this.d.rename.nameButtons();
    if (this.page === 'editor') return editorButtons(this.d.editor);
    // なまえを かえる は 建てた 家が 1 けん 以上 あるときだけ 押せる
    const out: HouseButton[] = TOP.map((b) => ({ id: b.id, enabled: b.id === 'rename' ? this.d.rename.available() : b.live }));
    if (this.canGetTools()) out.push({ id: 'tools', enabled: true });
    out.push({ id: 'close', enabled: true });
    return out;
  }

  /** 2 行目: 道具（みずもり・どうづき・ふで）を わたす。あいさつは これで おわり（持ち物が いっぱいで わたせなくても くりかえさない。「どうぐを もらう」が のこる） */
  private gift(): void {
    this.phase = 'greet2';
    this.timer = GREET_STEPS;
    this.d.record.toolsGiven = true;
    this.say = this.giveMissing() ? SAY.gift : SAY.bagFull;
    this.ver++;
  }

  /** #339 より 前に 道具を もらった セーブ: うなずきの あと「ふで を あげる」の 1 行で ふでを わたす（わたせない ときは「もちものが いっぱい だよ」で 記録は のこらない） */
  private giveFude(): void {
    this.phase = 'greet2';
    this.timer = GREET_STEPS;
    this.say = this.giveOneFude() ? SAY.fude : SAY.bagFull;
    this.ver++;
  }

  private open(): void {
    this.phase = 'menu';
    this.page = 'top';
    this.say = SAY.menu;
    this.ver++;
    this.d.onOpen();
  }

  /** 持ち物にも たんすにも ある（なくしていない） */
  private has(id: ItemId): boolean {
    return this.d.bag.count(id) + (this.d.owned?.(id) ?? 0) > 0;
  }

  /** どちらかの 道具を 持って いない、または はじめの ふでを まだ わたして いない（「どうぐを もらう」を 出す。ふでは 2 本目から 出さない） */
  private canGetTools(): boolean {
    return HOUSE_TOOL_IDS.some((id) => !this.has(id)) || !this.d.record.fudeGiven;
  }

  /** はじめの ふでを 1 本 わたす。わたせたら 記録して true */
  private giveOneFude(): boolean {
    if (this.d.record.fudeGiven) return true;
    if (this.d.bag.add(FUDE, 1) !== 0) return false;
    this.d.gave(FUDE);
    this.d.record.fudeGiven = true;
    return true;
  }

  /** 持って いない 道具を 1 こずつ わたし、はじめの ふでも わたす。ぜんぶ わたせたら true（入りきらない 分が あれば false） */
  private giveMissing(): boolean {
    let all = true;
    for (const id of HOUSE_TOOL_IDS) {
      if (this.has(id)) continue;
      if (this.d.bag.add(id, 1) === 0) this.d.gave(id);
      else all = false;
    }
    return this.giveOneFude() && all;
  }
}
