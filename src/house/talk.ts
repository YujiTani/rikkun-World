import type { Inventory, ItemId } from '../contracts';
import { HOUSE_TOOL_IDS } from '../content/items/ids';
import { editorButtons } from './editor/buttons';
import type { EditorController } from './editor/controller';
import { pressEditor } from './editor/ops';
import { FUDE } from './editor/sheet';
import type { LegacyKura } from './legacyKura';
import { RENAME_SAY, type HouseRename } from './rename';
import type { BuildFlow } from './build/flow';
import { FAREWELL_TICKS, MSG } from './build/tuning';
import type { Column } from './placement';

/**
 * 建築士さんと 話す 流れ（HOUSE-1A。docs/design/HOUSE-1.md §2.2 の 4・5、§2.3、§2.4。AC3・AC41）。DOM・three なし。
 *
 *   start → うなずき（建築士さんが 22 ステップ。この 間も ゲームの 時間は すすむ）→ メニュー
 *   はじめて 話す とき だけ、うなずきの あとに あいさつが 2 行（クリック なしで すすむ）。2 行目で 道具を わたしてから メニューが 開く:
 *       「こんにちは！ …」（うなずきの 間から） → 「これを あげる。…」（道具を わたす） → 「なにを する？」（メニュー）
 *   1B（#339）から: あいさつの 2 行目で ふでも わたす。#339 より 前に 道具を もらった セーブは、うなずきの あと「ふで を あげる」の 1 行（100 ステップ）で ふでを わたして メニュー。
 *   1E（#374）から: くらは ない。前の セーブの くらに 物が ある ときは、うなずきの あと「あずかった ものを かえすね」の 1 行（100 ステップ）で もちものへ 入る 分だけ もどす。
 *   入りきらなければ 続けて「いっぱい だから また あとでね」の 1 行（100 ステップ）。そのあとは ふつうの 流れ（ふでの 行・メニュー）。足もとには 落とさない（§2.4 の 4）。
 *   メニューの「せっけいずを つくる」で エディター（page 'editor'。「ひつような もの」が 出て いる 間は page 'need'）。
 *   メニューが 開いて いる 間は ゲームの 時間を 止める（frozen()。本の 画面と 同じ あつかい）。
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
  tools: 'どうぞ！ たいせつに してね',
  bagFull: 'もちものが いっぱい だよ',
  /** 前の セーブの くらの 物を かえす（12 字＋空白 2 で 1 だん。§2.4 の 4） */
  back: 'あずかった ものを かえすね',
  /** 入りきらなかった ときの つづき（13 字＋空白 3 で 1 だん） */
  later: 'いっぱい だから また あとでね',
} as const;

/** セーブに のこす 建築士さんの 記録: はじめての あいさつを したか・はじめの ふでを わたしたか・最初の 1 人の 場所（いちど 決まったら 動かさない） */
export interface HouseRecord {
  toolsGiven: boolean;
  /** はじめの ふでを わたせた とき だけ true（持ち物が いっぱいで わたせない ときは false の まま） */
  fudeGiven: boolean;
  first: Column | null;
}

type HousePage = 'top' | 'editor' | 'need' | 'rename' | 'renameName' | 'pick' | 'sky';
/** 上の メニューの ボタン（§2.3 の 順）。動くのは editor・build〔建築中で なければ〕・rename〔建てた 家が あるとき〕・tools・close */
export type HouseButtonId = 'editor' | 'build' | 'rename' | 'tools' | 'close';

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
  /** 「けんちくを はじめる」の 流れの 画面（一覧・ひつような もの・上空の 視点）の とき true。画面は これで ひつような もの（page 'need'）を エディターの と 見分ける */
  build?: true;
}

export interface HouseTalkDeps {
  record: HouseRecord;
  /** 前の セーブの くらの 物を かえす 係（なければ 何も かえさない） */
  legacy?: LegacyKura;
  bag: Pick<Inventory, 'count' | 'add'>;
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
  /** けんちくを はじめる の 流れ（HOUSE-1C PR-2。なければ せっけいずは 0 まいの 扱い） */
  flow?: BuildFlow;
  /** いま 建築中か（「けんちくを はじめる」は 建築中は 押せない） */
  busy?: () => boolean;
  /** 建築中の ふきだし「<名前>を たてて いるよ。<のこりの 言い方>」（建築中でなければ null。どの 建築士さんに 話しても 同じ） */
  busyText?: () => string | null;
}

/** back1 ＝ 前の セーブの くらの 物を かえす 行、back2 ＝ 入りきらなかった ときの 行（どちらも ふでの 行・メニューの 前） */
type Phase = 'idle' | 'nod' | 'back1' | 'back2' | 'greet1' | 'greet2' | 'menu' | 'bye';
type Page = 'top' | 'editor' | 'rename' | 'renameName' | 'build';

/** 上の ページの ボタン（道具は 持っていない ときだけ 足す）。live = いま 押せる */
const TOP: ReadonlyArray<{ id: HouseButtonId; live: boolean }> = [
  { id: 'editor', live: true },
  { id: 'build', live: true },
  { id: 'rename', live: true },
];

export class HouseTalk {
  private phase: Phase = 'idle';
  private page: Page | null = null;
  private say = '';
  private timer = 0;
  private who = '';
  private ver = 0;
  private started = false;

  constructor(private readonly d: HouseTalkDeps) {}

  /** menu() の 見た目が かわる たびに ふえる 数（画面の 描きなおしの 目印。うなずき・あいさつの カウントダウンでは ふえない） */
  version(): number {
    return this.ver + this.d.editor.version + (this.d.flow?.version ?? 0);
  }

  /** 話しはじめる。もう 話して いる（うなずき・あいさつ・メニュー）なら 何もせず false */
  start(id: string): boolean {
    if (this.phase !== 'idle' && this.phase !== 'bye') return false;
    this.who = id;
    this.phase = 'nod';
    this.say = this.d.record.toolsGiven ? this.menuSay() : SAY.hello;
    this.ver++;
    this.d.voice();
    return true;
  }

  /** 話して いる 人（建築士さんの id）。話して いなければ null（建築を はじめた あとの ひとこと〔bye〕は 話して いるに 数えない） */
  current(): string | null {
    return this.phase === 'idle' || this.phase === 'bye' ? null : this.who;
  }

  /** ふきだしを 出して いる 建築士さん（ひとことも ふくむ。頭の 上に ふきだしを 出す 目印） */
  speaker(): string | null {
    return this.phase === 'idle' ? null : this.who;
  }

  /** 建築を はじめた: メニューを とじて、建築士さんが ひとこと（text）。bye は 時間で きえる。時間は 1 ステップごと tickBye */
  farewell(text: string): void {
    const who = this.who;
    this.close();
    if (text === '') return;
    this.who = who;
    this.phase = 'bye';
    this.say = text;
    this.timer = FAREWELL_TICKS;
    this.ver++;
  }

  /** 1 ステップ（ひとことの 時間。ゲームの 時間が すすんで いる 間だけ 呼ぶ） */
  tickBye(): void {
    if (this.phase === 'bye' && --this.timer <= 0) {
      this.phase = 'idle';
      this.say = '';
      this.ver++;
    }
  }

  /** メニューが 開いて いる 間 true。ゲームの 時間を 止める */
  frozen(): boolean {
    return this.phase === 'menu';
  }

  /** 1 ステップ（時間が すすんで いる 間だけ 呼ぶ）。nodDone = 建築士さんの うなずきが おわったか */
  step(nodDone: boolean): void {
    if (this.phase === 'nod') {
      if (!nodDone) return;
      if (this.d.legacy?.pending()) this.giveBack();
      else this.afterNod();
    } else if (this.phase === 'back1') {
      if (--this.timer > 0) return;
      if (this.d.legacy?.pending()) this.sayLater();
      else this.afterNod();
    } else if (this.phase === 'back2') {
      if (--this.timer <= 0) this.afterNod();
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
    const fl = this.page === 'build' ? this.d.flow : undefined;
    if (fl?.page) return { open: true, page: fl.page, bubble: fl.say, buttons: this.buttons(), build: true };
    return { open: true, page: ed && this.d.editor.needOpen ? 'need' : (this.page === 'build' ? 'top' : this.page), bubble: ed ? (this.d.editor.bubble?.text ?? '') : this.say, buttons: this.buttons() };
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
    if (this.page === 'build') {
      this.pressBuild(id, arg);
      return;
    }
    if (this.page !== 'top') return;
    if (id === 'build' && !this.busy()) {
      this.openBuild();
    } else if (id === 'rename' && this.d.rename.available()) {
      this.page = 'rename';
      this.say = RENAME_SAY.pick;
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

  private busy(): boolean {
    return this.d.busy?.() ?? false;
  }

  /** 「けんちくを はじめる」: せっけいずが あれば 一覧、0 まいなら ふきだしだけ（ページは 上の まま） */
  private openBuild(): void {
    if (this.d.flow?.open()) this.page = 'build';
    else this.say = MSG.noPlan;
    this.ver++;
  }

  /** 一覧・ひつような もの・上空の 視点の ボタン。はじまったら メニューを とじる（ひとことは システムが farewell で足す） */
  private pressBuild(id: string, arg: unknown): void {
    const fl = this.d.flow;
    if (!fl) return;
    this.ver++;
    if (fl.press(id, arg) === 'started') {
      this.started = true;
      return;
    }
    if (fl.page === null) this.toTop();
  }

  /** ［ここに たてる］で 建築が はじまった（システムが 読んで ひとことを 決める）。読むと false に もどる */
  takeStarted(): boolean {
    const s = this.started;
    this.started = false;
    return s;
  }

  /** 上の メニューの ふきだし（建築中は 名前と のこりの 言い方） */
  private menuSay(): string {
    return this.d.busyText?.() ?? SAY.menu;
  }

  private toTop(): void {
    this.page = 'top';
    this.say = this.menuSay();
    this.ver++;
  }

  /** Esc: エディターで 確かめの まど・ひつような もの・家具の えらびが あれば それを とじる。なければ 全部 とじる（AC55） */
  escape(): void {
    if (this.phase === 'menu' && this.page === 'editor' && this.d.editor.escape()) return;
    if (this.phase === 'menu' && this.page === 'build' && this.d.flow?.escape()) {
      this.ver++;
      return;
    }
    this.close();
  }

  /** エディターが 開いて いる（ひつような ものが 出て いる 間も） */
  editing(): boolean {
    return this.phase === 'menu' && this.page === 'editor';
  }

  /** 字を えらぶ 画面〔エディター・なまえを かえる の 名前の 画面〕が 開いて いる（Esc と Backspace いがいの キーは ゲームの 操作に しない） */
  typing(): boolean {
    return this.phase === 'menu' && (this.page === 'editor' || this.page === 'renameName');
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
    this.d.flow?.reset();
    if (this.phase === 'bye') {
      this.phase = 'idle';
      this.say = '';
      this.ver++;
      return;
    }
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

  // ------------------------------------------------------------ 中の 動き

  private buttons(): HouseButton[] {
    if (this.page === 'build') return this.d.flow?.buttons() ?? [];
    if (this.page === 'rename') return this.d.rename.listButtons();
    if (this.page === 'renameName') return this.d.rename.nameButtons();
    if (this.page === 'editor') return editorButtons(this.d.editor);
    // なまえを かえる は 建てた 家が 1 けん 以上 あるときだけ 押せる
    const out: HouseButton[] = TOP.map((b) => ({ id: b.id, enabled: b.id === 'rename' ? this.d.rename.available() : b.id === 'build' ? !this.busy() : b.live }));
    if (this.canGetTools()) out.push({ id: 'tools', enabled: true });
    out.push({ id: 'close', enabled: true });
    return out;
  }

  /** うなずきの あと: 前の セーブの くらの 物を もちものへ 入る 分だけ もどして 1 行（入りきらなければ 続けて 2 行目） */
  private giveBack(): void {
    // もどした 種類ごとに 拾った ログ・音と 同じ 道（gave）を 通す
    for (const item of this.d.legacy?.giveBack(this.d.bag) ?? []) this.d.gave(item);
    this.phase = 'back1';
    this.timer = GREET_STEPS;
    this.say = SAY.back;
    this.ver++;
  }

  /** 入りきらなかった 続きの 1 行 */
  private sayLater(): void {
    this.phase = 'back2';
    this.timer = GREET_STEPS;
    this.say = SAY.later;
    this.ver++;
  }

  /** うなずき（か かえす 行）の あとの ふつうの 流れ: 道具も ふでも 渡して あれば メニュー、ふでだけ まだなら ふでの 行、はじめては あいさつ */
  private afterNod(): void {
    if (this.d.record.toolsGiven && this.d.record.fudeGiven) this.open();
    else if (this.d.record.toolsGiven) this.giveFude();
    else {
      this.phase = 'greet1';
      this.timer = GREET_STEPS;
      if (this.say !== SAY.hello) {
        // 前の セーブの くらの 行の あとで はじめての あいさつに 入る とき だけ、ふきだしを もどす
        this.say = SAY.hello;
        this.ver++;
      }
    }
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
    this.say = this.menuSay();
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
