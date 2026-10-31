import type { ItemId, Vec3 } from '../contracts';
import { blueprintName, blueprintWindows, type Blueprint } from './editor/blueprint';
import { glowsWindows } from './editor/buttons';
import { EditorController } from './editor/controller';
import { editOp } from './editor/ops';
import { needOf, type NeedRow } from './editor/model';
import { SHEET, createSheetPort, type SheetBag } from './editor/sheet';
import type { HouseWorld } from './ground';
import { ArchitectManager, type ArchitectInfo } from './manager';
import type { PreviewMode } from './preview/mesh';
import { NO_PREVIEW, type PreviewPort } from './preview/port';
import { HouseState } from './state';
import { HouseTalk, type HouseMenuState } from './talk';
import type { KuraBag } from './kura';

/**
 * 建築士さん・話す 流れ・くらを ひとつに つなぐ 係（HOUSE-1A）。DOM・three なし。
 * 毎ステップ `update()`（時間が すすんで いる 間だけ。メニューが 開くと ゲームが 止まるので 呼ばれない）。
 * 画面（HouseUi）と 窓口（`window.__rikkun.house`）は ここを 通して 動かす。
 */

/** 話して いる 間に プレイヤーが これより はなれたら 話しを やめる（メニューが 勝手に 開かない ように） */
export const TALK_RANGE = 12;

export interface HouseSystemDeps {
  seed: number;
  world: HouseWorld;
  spawn: () => { x: number; z: number; yawDeg: number };
  /** プレイヤーの 足もと */
  player: () => Vec3;
  bag: KuraBag & SheetBag;
  /** 声「ぽぽぽ」を 1 回 鳴らす */
  voice: () => void;
  /** 道具を わたした（拾った 知らせ） */
  gave: (item: ItemId) => void;
  /** 持ち物の ほかに 持って いる 数（たんすの 中）。なければ 持ち物だけ */
  owned?: (item: ItemId) => number;
  /** メニューが 開いた / とじた（ゲームの 時間を 止める・マウスの ポインターを はなす / もどす） */
  onOpen: () => void;
  onClose: () => void;
  /** やられた・ほかの 画面が 開いた など、話しを つづけられない とき true */
  interrupted?: () => boolean;
  /** 地形だけで 見た「水でない 地面」（テストで 差しかえる） */
  isLand?: (x: number, z: number) => boolean;
}

export class HouseSystem {
  readonly state = new HouseState();
  readonly manager: ArchitectManager;
  readonly talk: HouseTalk;
  readonly editor: EditorController;
  /** 見本（3D）への 入口。wireHouse が つなぐ（つなぐ 前は 何も しない） */
  preview: PreviewPort = NO_PREVIEW;
  private onChange: (() => void) | null = null;
  private seen = 0;

  constructor(private readonly d: HouseSystemDeps) {
    this.manager = new ArchitectManager({
      seed: d.seed,
      world: d.world,
      spawn: d.spawn,
      record: this.state.record,
      player: d.player,
      isLand: d.isLand,
    });
    this.editor = new EditorController({
      holder: this.state.holder,
      have: (item) => this.state.kura.count(item),
      sheet: createSheetPort({ bag: d.bag, kura: this.state.kura, register: (draft) => this.state.register(draft), gave: d.gave }),
      onMade: () => this.talk.made(),
    });
    this.talk = new HouseTalk({
      editor: this.editor,
      record: this.state.record,
      kura: this.state.kura,
      bag: d.bag,
      voice: d.voice,
      onOpen: () => d.onOpen(),
      onClose: () => d.onClose(),
      endTalk: (id) => this.manager.endTalk(id),
      gave: d.gave,
      ...(d.owned ? { owned: d.owned } : {}),
    });
  }

  /** 画面を 描きなおす 合図（menu() の 見た目が かわった とき 呼ばれる）を 1 つ つなぐ */
  setOnChange(fn: (() => void) | null): void {
    this.onChange = fn;
    this.seen = this.talk.version();
  }

  /** 1 ステップ */
  update(): void {
    this.manager.update();
    const id = this.talk.current();
    if (id !== null) this.stepTalk(id);
    this.emit();
  }

  /** 右クリックで 話しかける。いない・もう 話して いる なら false */
  talkTo(id: string): boolean {
    if (!this.manager.get(id) || this.talk.current() !== null) return false;
    if (!this.talk.start(id)) return false;
    this.manager.beginTalk(id, this.d.player());
    this.emit();
    return true;
  }

  /** たたかれた（おっとっと） */
  hit(id: string): void {
    this.manager.hit(id, this.d.player());
  }

  press(id: string, arg?: unknown): void {
    this.talk.press(id, arg);
    this.emit();
  }

  /** Esc: エディターの 確かめの まど・ひつような もの・家具の えらびが あれば そちらを とじる。なければ 話しを ぜんぶ やめる */
  escape(): void {
    this.talk.escape();
    this.emit();
  }

  /** エディターが 開いて いる（Esc いがいの キーを ゲームの 操作に しない・見本を 描く） */
  editing(): boolean {
    return this.talk.editing();
  }

  /** 保存から 読みこむ（HouseState の 中身を 入れかえ、エディターの もどす の 記録は すてる） */
  load(data: unknown): void {
    this.state.deserialize(data);
    this.editor.loaded();
  }

  /** 1 ステップ（1/60 秒。ゲームの 時間が 止まって いても すすむ）: エディターの ふきだしの 時間 */
  tickEditor(): void {
    if (!this.talk.editing()) return;
    this.editor.tick();
    this.emit();
  }

  /** 窓口 `edit(op)`（仕様 §6.1）。エディターが 開いて いない とき false */
  edit(op: unknown): boolean {
    if (!this.talk.editing()) return false;
    const ok = editOp(this.editor, op);
    this.emit();
    return ok;
  }

  /** いま 見本が 出て いる 見せ方（エディターが 開いて いない・③ なまえ は null） */
  previewMode(): PreviewMode | null {
    if (!this.talk.editing()) return null;
    const step = this.editor.s.step;
    return step === 'namae' ? null : step === 'naka' ? 'inside' : 'outside';
  }

  /** 見本を まわす: 確かめの まど・ひつような ものが 出て いる 間は まわさない。まわしたら 置いた 家具の えらびは はずれる（AC57）。今の { angle, pitch }（見本が なければ null） */
  private turn(apply: (p: PreviewPort) => boolean): { angle: number; pitch: number } | null {
    const mode = this.previewMode();
    if (mode === null) return null;
    const c = this.editor;
    if (c.confirm === null && !c.needOpen && apply(this.preview)) {
      c.clearPlaced();
      this.emit();
    }
    const v = this.preview.info(mode);
    return v ? { angle: v.yaw, pitch: v.elev } : null;
  }

  /** 窓口 `previewDrag(dx, dy)`: 見本の 上で 押して dx・dy px 動かして はなした のと 同じ（1 px ＝ 0.5°） */
  previewDrag(dx: number, dy: number): { angle: number; pitch: number } | null {
    return this.turn((p) => p.drag(dx, dy));
  }

  /** 窓口 `previewWheel(dx, dy)`: wheel を 1 回 うけた のと 同じ（(dx ＋ dy) px を よこの ドラッグと 同じに） */
  previewWheel(dx: number, dy: number): { angle: number; pitch: number } | null {
    return this.turn((p) => p.wheel(dx, dy));
  }

  /** 窓口 `hover(id | null)`: その ボタンに マウスを のせた のと 同じ。光るのは まどの かず・しゅるいの ボタン だけ（① で） */
  hover(id: string | null): void {
    this.preview.hover(id !== null && this.previewMode() === 'outside' && glowsWindows(id));
  }

  /** 窓口 `need(source?)`: source なし ＝ エディターの 今の 形、数 ＝ 持ち物の せっけいずの マスの 番号。bonus は 1C（はじめての 家の おまけ）まで 0 */
  need(source?: number): Array<NeedRow & { bonus: number }> {
    const form = source === undefined ? this.state.holder.draft : this.planAt(source);
    if (!form) return [];
    return needOf(form, (item) => this.state.kura.count(item)).map((r) => ({ ...r, bonus: 0 }));
  }

  /** 窓口 `blueprints()`: 持ち物の せっけいず（マスの 番号つき）。中身を 知らない 番号は とばす */
  blueprints(): Array<Blueprint & { slot: number; windowCells: ReturnType<typeof blueprintWindows> }> {
    const out: Array<Blueprint & { slot: number; windowCells: ReturnType<typeof blueprintWindows> }> = [];
    this.d.bag.slots().forEach((s, slot) => {
      const bp = s?.item === SHEET && s.plan ? this.state.blueprint(s.plan) : null;
      if (bp) out.push({ ...bp, slot, windowCells: blueprintWindows(bp) });
    });
    return out;
  }

  /** 持ち物の マスの せっけいずの 中身（なければ null） */
  private planAt(slot: number): Blueprint | null {
    const s = this.d.bag.slots()[slot];
    return s?.item === SHEET && s.plan ? this.state.blueprint(s.plan) : null;
  }

  /** ツールチップの 名前（持ち物の せっけいず）。知らない 番号は null */
  planName(plan: number): string | null {
    const bp = this.state.blueprint(plan);
    return bp ? blueprintName(bp) : null;
  }

  deposit(item: ItemId, want: number): number {
    const n = this.talk.deposit(item, want);
    this.emit();
    return n;
  }

  withdraw(item: ItemId, want: number): number {
    const n = this.talk.withdraw(item, want);
    this.emit();
    return n;
  }

  menu(): HouseMenuState {
    return this.talk.menu();
  }

  architects(): ArchitectInfo[] {
    return this.manager.list();
  }

  /** メニュー・くらが 開いて いる（ゲームの 時間を 止める） */
  frozen(): boolean {
    return this.talk.frozen();
  }

  /** 話して いる（うなずき・あいさつ・メニュー・くら） */
  talking(): boolean {
    return this.talk.current() !== null;
  }

  /** 話しを やめる（Esc・✕・とじる）。メニューが 開いて いたら onClose も 呼ばれる */
  close(): void {
    this.talk.close();
    this.emit();
  }

  private stepTalk(id: string): void {
    const a = this.manager.get(id);
    const p = this.d.player();
    // 建築士さんが きえた（遠くへ はなれて 一覧から はずれた）・プレイヤーが はなれた・ほかの 画面が 開いた: やめる
    if (!a || Math.hypot(a.x - p.x, a.z - p.z) > TALK_RANGE || this.d.interrupted?.() === true) {
      this.talk.close();
      return;
    }
    this.talk.step(a.nodDone());
  }

  private emit(): void {
    const v = this.talk.version();
    if (v === this.seen) return;
    this.seen = v;
    this.onChange?.();
  }
}
