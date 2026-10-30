import type { ItemId, Vec3 } from '../contracts';
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

export interface HouseSystemDeps {
  seed: number;
  world: HouseWorld;
  spawn: () => { x: number; z: number; yawDeg: number };
  /** プレイヤーの 足もと */
  player: () => Vec3;
  bag: KuraBag;
  /** 声「ぽぽぽ」を 1 回 鳴らす */
  voice: () => void;
  /** 道具を わたした（拾った 知らせ） */
  gave: (item: ItemId) => void;
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
    this.talk = new HouseTalk({
      record: this.state.record,
      kura: this.state.kura,
      bag: d.bag,
      voice: d.voice,
      onOpen: () => d.onOpen(),
      onClose: () => d.onClose(),
      endTalk: (id) => this.manager.endTalk(id),
      gave: d.gave,
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

  press(id: string): void {
    this.talk.press(id);
    this.emit();
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
