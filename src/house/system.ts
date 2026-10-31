import type { ItemId, Vec3 } from '../contracts';
import { blueprintName, blueprintWindows, type Blueprint } from './editor/blueprint';
import { EditorController } from './editor/controller';
import { editOp } from './editor/ops';
import { needOf, type NeedRow } from './editor/model';
import { SHEET, createSheetPort, type SheetBag } from './editor/sheet';
import type { HouseWorld } from './ground';
import { ArchitectManager, type ArchitectInfo } from './manager';
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

/** 見本の 今の 見せ方（Preview3D が 答える。見本を まだ 作って いない ときは null）。窓口 `editor().preview` の 元 */
export type PreviewProbe = (mode: 'outside' | 'inside') => { yaw: number; elev: number; touched: boolean; builds: number } | null;

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
  /** 見本（3D）の 今の 向き。wireHouse が つなぐ（つなぐ 前は null） */
  previewProbe: PreviewProbe = () => null;
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
