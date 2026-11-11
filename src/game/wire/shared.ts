// main.ts の 流れ（src/game/wire/*.ts）が 段を こえて 読み書きする 状態。
// 前の 段の 中から あとで 作る 物を 呼ぶ 所（forward）と、段を またいで 書きかえる 変数（let）だけを ここに 置く。

import { DigFx } from '../../fx/DigFx';
import { PlayerCombatImpl } from '../../combat';
import { StaggerIcons } from '../../fx/parryFx';
import { SamuraiBook } from '../../craft/SamuraiBook';
import { LogSystem } from '../../ui/log';
import { W2_SETTING_DEFAULTS, type FarmAim, type FarmHintKind, type ItemId, type ItemStack, type YokaiKind, type CombatEvent, type DigEvent, type SwingAnim, type Inventory, type Vec3, type W2Settings } from '../../contracts';
import type { YokaiPartner } from '../../yokai/ai/target';
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
import type { HouseSystem } from '../../house/system';
import { P2State } from '../../duo/p2State';
import type { DuoLeaveReason, P2Save } from '../../duo/types';
import type { P2GashaPort } from './gashaPeople';
import type { DuoCamFx } from '../../duo/camFx';
import type { Parry } from '../../combat/parry';
import type { PaneFeed } from '../../ui/duoHalves';
import type { P2Parry } from '../../duo/p2Parry';
import type { P2AnimalsPort } from '../../duo/p2AnimalsPort';
import type { DigM4Deps } from '../../dig/digPorts';
import type { PerspectiveCamera } from 'three';
import type { CraftCount } from '../../house/materials';
import type { Pane } from '../../ui/houseBubble';
import { createModalOwner, type ModalOwner, type Who } from './modalOwner';
import type { ImpactView } from '../../duo/impactRoute';
import type { ImpactBus } from '../../fx/impact';
import type { LegendSystem } from '../../legend/LegendSystem';

/** パリィの 倍率が まだ 無い とき（wireLoop が 差しかえる まで） */
const NO_PARRY_SCALES: readonly number[] = [1];
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
  /** COOP-1: 2P の もちものと レベル（参加している あいだだけ 中身が ある。やめたら 空） */
  p2: P2State;
  /**
   * 2P の そうびの たいきゅうの 設定と 時計（COOP-1 4b）。p2 は w2・game より 先に 作る ので、読む 所だけ 先に 置き、
   * wireDuoPlay が 本物（`() => w2`・`() => game.tick`）に 差しかえる。それまでは 初期値・0
   */
  p2Wear: { settings: () => Pick<W2Settings, 'toolDurability' | 'toolWear' | 'wearLowRatio'>; tick: () => number };
  /** COOP-1: 2P の 最後の 保存（やめたとき・セーブから 読んだとき。次に 参加すると ここから 戻る） */
  p2Store: { saved: P2Save | null };
  /** COOP-1: 2P が 参加しているか（時間の 倍率・セーブが 読む。wireDuo が 差しかえる） */
  duoJoined: () => boolean;
  /** COOP-1 3d（AC71・AC72）: 2P を やめさせる（タイトルへ もどる・よみこむ で 読みなおす 直前に 呼ぶ。2P が いなければ 何もしない。wireDuo が 差しかえる） */
  leaveDuo: (reason: DuoLeaveReason) => void;
  /** COOP-1 3a: 仲間（2P）の 足もとと 持ち物（参加していなければ null。落とし物・動物・1P の 置く が 読む。wireDuo が 差しかえる。返す 物は いつも 同じ 1 つ） */
  duoMate: () => { position: Vec3; inventory: Inventory } | null;
  /** COOP-1 4d-3: 2P の がしゃどくろへの 口（参加している あいだだけ。なければ null。wireDuoPlay が 差しかえる。参加ごとに 同じ 1 つ） */
  p2Gasha: () => P2GashaPort | null;
  /** COOP-1 3a: 落とし物を ひろえる 仲間（倒れている あいだは null。DropField だけが 読む。wireDuo が 差しかえる） */
  duoDropMate: () => { position: Vec3; inventory: Inventory } | null;
  /** COOP-1 4c: かまどで やけた 物が 2P の もちものに 入った（2P の つくる の「ひろった」の 出来事。createDuoInventory が 差しかえる） */
  p2Delivered: (item: ItemId, count: number, tick: number) => void;
  /** COOP-1 4b: セーブを 読みこんだ とき 2P の 小太刀の 待ちを すてる（wireDuoPlay が 差しかえる） */
  p2LoadReset: () => void;
  /** COOP-1 3a: 妖怪が ねらう 仲間（参加していなければ null。wireDuo が 差しかえる） */
  duoYokai: () => YokaiPartner | null;
  /** COOP-1 3a: 2P の レベルアップ（ハートを 満タンに。wireDuo が 差しかえる） */
  p2LevelUp: () => void;
  /** COOP-1 3a: 2P の 今の ハート（たおした ときの 実績の hp 用。wireDuo が 差しかえる） */
  p2Hp: () => number;
  /** COOP-1 5b（AC132）: 2P が 落とし物を ひろった ときの 知らせ（2P の つくる の notifyPickup。createDuoInventory が 差しかえる） */
  p2DropPicked: (item: ItemId, count: number, fromYokai: boolean) => void;
  /** COOP-1 5b: 2P が 倒れて いる か（場所の 実績・国の 見はりが 見る。wireDuoPlay が 差しかえる） */
  p2Down: () => boolean;
  /** COOP-1 5b: セーブを 読んだ とき 2P の 場所の 見はりを 消す（wireFrame が 差しかえる） */
  p2PlaceReset: () => void;
  /** COOP-1 5b: 建築中の 家の 守り・みずもり・どうづき の 口（wireFighters が 作って 1P・2P に 同じ 物を 渡す。duoPlay.ts は combat.ts を import しない） */
  buildPort: DigM4Deps['build'] | null;
  /** COOP-1 5b: はらぱんみみず の くじ（1 つの くじを 1P・2P が 引く。wireFighters が 作る） */
  harapanPort: DigM4Deps['harapan'] | null;
  /** COOP-1: 2 人のときの カメラの 距離（null = 1 人。step.ts が rig に 渡す。wireDuo が 毎ステップ 書く） */
  duoCamDistance: number | null;
  /** COOP-1 4d-0（§8）: その人の カメラの 口（止め・ゆれ・きょり）。wirePlayer が 差しかえる */
  duoCamFx: (who: 1 | 2) => DuoCamFx;
  /** COOP-1 4d-0（§8）: その人の 当たりの 手ごたえ（止め・ゆれ）。1 人の ときは 世界を 止める。wirePlayer が 差しかえる */
  impactFor: (who: 1 | 2) => ImpactBus;
  /** COOP-1 4d-0: 当たりの 手ごたえを ステップの おわりに 出す（2 つとも。ImpactBus は 空なら 何も しない）。wirePlayer が 差しかえる */
  impactFlush: () => void;
  /** COOP-1 4d-0: `duo.impact(who)`。wirePlayer が 差しかえる */
  impactView: (who: 1 | 2) => ImpactView | null;
  /** COOP-1 4d-0（§8）: その時 いる 人の パリィの 倍率（1P と、参加している 2P。同じ 入れものを 使い回す）。wireLoop が 差しかえる */
  parryScales: () => readonly number[];
  /** COOP-1 4d-1（§8）: その人の パリィ（1P は 今の parry。2P が いなければ who 2 は null）。wireLoop が 差しかえる */
  parryFor: (who: 1 | 2) => Parry | null;
  /** COOP-1 4d-2（§8）: その人の わざの しくみ（1P は 今の legend。2P が いなければ who 2 は null）。2P の 分は wireDuoPlay が 差しかえる（`pickLegend`） */
  legendFor: (who: 1 | 2) => LegendSystem | null;
  /** COOP-1 4d-1: 2P の パリィ（参加している あいだ だけ。いなければ null）。wireDuoPlay が 差しかえる */
  p2Parry: () => P2Parry | null;
  /** COOP-1 5a: 2P の 半分の 合図の チップ（`FarmFx.hintFor(2)` が 読む。参加している あいだ だけ。いなければ null。wireDuoPlay が 差しかえる） */
  p2FarmHint: () => { show(kind: FarmHintKind): void } | null;
  /** COOP-1 5a: 2P の 作物の しるしの 中身（`duo.farmAim(2)`。ねらい なし・2P が いない → null。wireDuoPlay が 差しかえる） */
  p2FarmAim: () => FarmAim | null;
  /** COOP-1 5c: 2P の にわとり（出来事の 配り・こたつの わく・着地点の 丸が 読む。参加している あいだ だけ。いなければ null。wireDuoPlay が 差しかえる） */
  p2Animals: () => P2AnimalsPort | null;
  /** COOP-1 5c: 頭の 上の ▼ は 世界に 1 つ。人ごとの 口を 返す（1P の メニューも 2P の メニューも ここを 通る。wireHud が 差しかえる） */
  pickMux: (who: 1 | 2) => (id: number | null) => void;
  /** COOP-1 5f-1: 2P の おしらせの 印（2P の 半分の ＋の 右下）。2P が いなければ 何も しない */
  p2ShowSignal: Notice['showSignal'];
  /** COOP-1 5f-2: せっていを 閉じた とき（パッドの 面の 名前を 読みなおす 口。wireDuo が 差しかえる） */
  settingsClosed: () => void;
  /** COOP-1 5f-2: 2 人の とき 区画ごとに 名札・ひるみの 印・マッチョの 印を 投げる ための 世界の 物（createStep が 毎ステップ 入れ、DuoHalves.projectPane が 区画の カメラで 使う）。wireDuo が 差しかえる。1 人の ときは 使わない */
  duoPaneFeed: PaneFeed | null;
  /** COOP-1 4d-1: 妖怪の 更新の 直前に 毎ステップ 呼ぶ（createStep。1P の parry.update の すぐ あと）。2P の 入力を 妖怪の 当たりより 先に 入れる。wireDuoPlay が 差しかえる */
  preYokai: () => void;
  /** COOP-1 5e: ふとんで 「2 人」に 数えられる 人の 数（参加していて 倒れておらず 2P は パッドが ある 人。2 人とも 倒れて いれば 0。2P が いなければ 1。wireDuoPlay が 差しかえる） */
  sleepReady: () => number;
  /** COOP-1 5e: 2P の 待ちを 起こす 入力と 倒れた・パッドぬけの wake（毎ステップ、sleep.update の 前に gadgets.step が 呼ぶ。wireDuoPlay が 差しかえる） */
  p2SleepWake: () => void;
  /** COOP-1 5e: ふとんの 文（「よる に ねようね」）を who の 半分に 出す（2P の 分。wireDuo が 差しかえる。DuoNotices.showGadgetNote） */
  duoGadgetNote: (who: Who, text: string) => void;
  /** COOP-1: Game に 渡している 時間の 倍率（テストの 口 duo.timeScale() が 読む。wireLoop が 差しかえる） */
  gameTimeScale: () => number;
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
  /** HOUSE-1A: 建築士さん（wireHouse で 作る。作る 前は null）。右クリックの 窓口（combat.ts の dig）が あとから 読む */
  house: HouseSystem | null;
  /** HOUSE-1A: 建築士さんの メニューが 開いて いる（ゲームの 時間・妖怪を 止める。本の 画面と 同じ あつかい。player.ts の 窓が 読む） */
  houseFrozen: () => boolean;
  /** HOUSE-1B: エディターが 開いて いる 間の 1 コマ（見本の 向き・ふきだしの 時間）と 描画（見本）。player.ts の 窓が 呼ぶ。開いて いなければ 何も しない */
  houseModal: { tick: () => void; render: () => void };
  /** COOP-1 5d: 2P の 建築士さん まわり（wireDuo・wireDuoPlay が 差しかえる）。craft ＝ 2P から craftTansuRange の たんすを 数える 係、teleport ＝ 2P を 足もとへ、panelOpen ＝ 2P の もちもの画面、bubble ＝ 2P が 話した ふきだしを おさめる 区画と カメラ */
  p2House: {
    craft: () => CraftCount | undefined;
    teleport: (x: number, y: number, z: number) => void;
    panelOpen: () => boolean;
    bubble: () => { camera: PerspectiveCamera; pane: Pane } | null;
  };
  /** COOP-1 5d: 本・建築士さんの メニューを 開いた 人（開いた 人。docs/design/COOP-1.md 1.16 §8）。本の ほんだな・建築士さんの 門・「ちょっと まってね」が 同じ 1 つを 使う */
  modalOwner: ModalOwner;
  /** COOP-1 5d: 「ちょっと まってね」を who の 半分に 出す／消す（wireDuo が 差しかえる。DuoNotices.setWait） */
  duoSetWait: (who: Who, on: boolean) => void;
  /** COOP-1 5d: 開いて いる 本か 建築士さんの メニューを その ステップで しまう（2P が やめた／パッドが ぬけた。wireInput が 差しかえる） */
  modalCloseNow: () => void;
  /** COOP-1 作業 3d: modal（本・建築士さん）が active の あいだ 1 コマごとに 呼ぶ（2P の「ちょっと まってね」・「＋で さんか」の 出し入れ。wireDuo が 差しかえる） */
  duoModalTick: () => void;
  requestSave: () => void;
  /** MINE-1E: キャンプの たんすを はじめて あける ときの 中身〔wireMine が つなぐ。つなぐ 前は null〕。`StorageSystem` の firstFill が 読む */
  campFill: (x: number, y: number, z: number) => ItemStack[] | null;
  /** MINE-1F: やかたの ブロック〔まだ・挑戦の 間〕か。ほる係・ぬりかべが 読む〔wireMine が つなぐ。つなぐ 前は いつも false〕 */
  yakataLocked: (x: number, y: number, z: number) => boolean;
  /** MINE-1F §4.5: 挑戦の 間の 人〔1 = 1P・2 = 2P〕か。そこでは 自動の 出現を しない */
  yakataQuiet: (who: 1 | 2) => boolean;
  /** MINE-1F: 保存にだけ 元の ブロックで 書く マス〔挑戦の 間の 門・宝箱〕 */
  yakataSaveOverrides: () => Array<{ x: number; y: number; z: number; live: string; save: string }>;
  skipSignalLog: boolean;
  onDropPicked: (item: ItemId, count: number, fromYokai: boolean) => void;
  yokaiManager: YokaiManager | null;
  achievementsRef: { feedWorn(n: number): void };
  onDefeatAch: (kind: YokaiKind, who: 1 | 2) => void;
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
  const s = {
    p2: new P2State({ onLevelUp: () => s.p2LevelUp(), armorWear: { settings: () => s.p2Wear.settings(), tick: () => s.p2Wear.tick() } }),
    p2Wear: { settings: () => W2_SETTING_DEFAULTS, tick: () => 0 },
    duoMate: () => null,
    p2Gasha: () => null,
    duoDropMate: () => null,
    duoYokai: () => null,
    p2Delivered: () => {},
    p2DropPicked: () => {},
    p2LoadReset: () => {},
    p2LevelUp: () => {},
    p2Hp: () => 0,
    p2Down: () => false,
    p2PlaceReset: () => {},
    buildPort: null,
    harapanPort: null,
    p2Store: { saved: null },
    duoJoined: () => false,
    leaveDuo: () => {},
    duoCamDistance: null,
    parryScales: () => NO_PARRY_SCALES,
    parryFor: () => null,
    legendFor: () => null,
    p2Parry: () => null,
    p2FarmHint: () => null,
    p2FarmAim: () => null,
    p2Animals: () => null,
    pickMux: () => () => {},
    p2ShowSignal: () => {},
    settingsClosed: () => {},
    duoPaneFeed: null,
    preYokai: () => {},
    sleepReady: () => 1,
    p2SleepWake: () => {},
    duoGadgetNote: () => {},
    gameTimeScale: () => 1,
    gashaBgmFade: {},
    girlBgmOn: false,
    streamHost: null,
    tryOpenTansu: () => false,
    coopMenuIsOpen: () => false,
    openCoopMenu: () => {},
    house: null,
    houseFrozen: () => false,
    houseModal: { tick: () => undefined, render: () => undefined },
    duoModalTick: () => {},
    duoSetWait: () => {},
    p2House: { craft: () => undefined, teleport: () => {}, panelOpen: () => false, bubble: () => null },
    modalCloseNow: () => {},
    requestSave: () => {},
    campFill: () => null,
    yakataLocked: () => false,
    yakataQuiet: () => false,
    yakataSaveOverrides: () => [],
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
  s.modalOwner = createModalOwner({ joined: () => s.duoJoined(), setWait: (who, on) => s.duoSetWait(who, on), closeNow: () => s.modalCloseNow() });
  return s;
}
