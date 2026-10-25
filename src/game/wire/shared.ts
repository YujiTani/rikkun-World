// main.ts の 流れ（src/game/wire/*.ts）が 段を こえて 読み書きする 状態。
// 前の 段の 中から あとで 作る 物を 呼ぶ 所（forward）と、段を またいで 書きかえる 変数（let）だけを ここに 置く。

import { DigFx } from '../../fx/DigFx';
import { PlayerCombatImpl } from '../../combat';
import { StaggerIcons } from '../../fx/parryFx';
import { SamuraiBook } from '../../craft/SamuraiBook';
import { LogSystem } from '../../ui/log';
import type { ItemId, YokaiKind, CombatEvent, DigEvent, SwingAnim } from '../../contracts';
import { AchievementSystem } from '../../achievements';
import { CelebrateUi } from '../../ui/celebrate';
import { DragOut } from '../../ui/dragOut';
import { NatsukiPanel } from '../../ui/natsukiPanel';
import { AnimalHint } from '../../ui/animalHint';
import { YokaiManager } from '../../yokai';
import { ScreenController } from '../../screen/ScreenController';
import { StreamHost } from '../../world/stream/StreamHost';
import { Notice } from '../../ui/notice';
import { PlayerController } from '../../player/PlayerController';
import type { BossHandle, GashaRelease } from '../../gasha/release';
import { ShadowSystem } from '../../world/render/shadow/ShadowSystem';

// WEAPON-7: 雷の 見た目（十字の ドット絵・着地の 光・光の つぶ）
export const IDLE_THUNDER_LOOK = { charging: false, ready: false, aimS: null };
// 出来事は 1 か所で 1 回だけ drain して、受け手（画面・音・人形）に配る。
// 受け手がその場で読む列は、この入れ物から渡す（読んだら空にする）
export const NO_COMBAT: CombatEvent[] = [];
export const NO_SWINGS: { anim: SwingAnim; tick: number }[] = [];
export const NO_PLATES: { id: number; text: string; x: number; y: number; z: number; dist: number }[] = [];
// 出来事の入れ物（毎ステップ 1 回だけ drain して、画面・音・実績に配る）
// ゆみの出来事は main が 1 回だけ drain して、weaponFx にも配る
export const NO_DIG: DigEvent[] = [];

interface Shared {
  // #293 試作: ふだんの BGM の フェード（gashaBgm.ts が きめる）
  gashaBgmFade: { outSec?: number; inSec?: number; delaySec?: number };
  // #293 試作: がしゃどくろの 曲（gashaBgm.ts。少女「災厄」・大きな 姿「神々の 戯れ」）が 流れて いる 間 true。係は ページに 1 つ なので 少女と 大きな 姿で ぶつからない
  girlBgmOn: boolean;
  streamHost: StreamHost | null;
  tryOpenTansu: () => boolean;
  /** LIVE-3: とりごや の メニュー が ひらいて いる か（E の たんす が かさならない ように） */
  coopMenuIsOpen: () => boolean;
  /** LIVE-3: 右クリック で とりごや の メニュー を ひらく（メニュー は あとで 作る） */
  openCoopMenu: (coopId: number) => void;
  requestSave: () => void;
  skipSignalLog: boolean;
  onDropPicked: (item: ItemId, count: number, fromYokai: boolean) => void;
  yokaiManager: YokaiManager | null;
  achievementsRef: { feedWorn(n: number): void };
  onDefeatAch: (kind: YokaiKind) => void;
  domeEraseThisStep: boolean;
  // #293 試作: 間欠泉の 中・あと は 落下ダメージなし（?proto=gashaBig）
  protoNoFall: boolean;
  dragOut: DragOut | null;
  oldTansu: { x: number; y: number; z: number } | null;
  gashaBodyBlocks: import('../../dig/bodyBlocks').BodyBlocksPort | null;
  bigBossHandle: BossHandle | null;
  prevKits: number;
  prevCoops: number;
  combatBuf: CombatEvent[];
  swingBuf: { anim: SwingAnim; tick: number; }[];
  onFullSignal: () => void;
  digBuf: DigEvent[];
  gashaRelease: GashaRelease | null;
  gashaSavedPending: unknown;
  /** 保存にだけ 元の ブロックで 書く マス（ボスの 間欠泉が 作った つち。ボスが 出て いなければ 空） */
  gashaSaveOverrides: () => Array<{ x: number; y: number; z: number; live: string; save: string }>;
  shadowSystem: ShadowSystem | null;
  /** 実績に今の状態を渡す（画面ステップ: あそぶ 1・もちもの 1÷timeScale・止まっているとき 0） */
  achMuted: boolean;
  // 後の 段で 作る 物（作った 直後に 入る。それまでは 読まない）
  controller: PlayerController;
  screen: ScreenController;
  combat: PlayerCombatImpl;
  yokaiM: YokaiManager;
  showSignalRaw: Notice['showSignal'];
  staggerIcons: StaggerIcons;
  log: LogSystem;
  fx: DigFx;
  animalHint: AnimalHint;
  natsukiPanel: NatsukiPanel;
  achievements: AchievementSystem;
  samuraiBook: SamuraiBook;
  samuraiHave: () => ItemId[];
  toItemsTab: () => void;
  celebrate: CelebrateUi;
}

export function createShared(): Shared {
  return {
    gashaBgmFade: {},
    girlBgmOn: false,
    streamHost: null,
    tryOpenTansu: () => false,
    coopMenuIsOpen: () => false,
    openCoopMenu: () => {},
    requestSave: () => {},
    skipSignalLog: false,
    onDropPicked: () => {},
    yokaiManager: null,
    achievementsRef: { feedWorn: () => {} },
    onDefeatAch: () => {},
    domeEraseThisStep: false,
    protoNoFall: false,
    dragOut: null,
    oldTansu: null,
    gashaBodyBlocks: null,
    bigBossHandle: null,
    prevKits: -1,
    prevCoops: -1,
    combatBuf: NO_COMBAT,
    swingBuf: NO_SWINGS,
    onFullSignal: () => {},
    digBuf: NO_DIG,
    gashaRelease: null,
    gashaSavedPending: null,
    gashaSaveOverrides: () => [],
    shadowSystem: null,
    achMuted: false,
  } as unknown as Shared;
}
