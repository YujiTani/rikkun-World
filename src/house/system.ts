import type { BlockId, ItemId, Vec3 } from '../contracts';
import { blueprintName, blueprintWindows, type Blueprint } from './editor/blueprint';
import { editorButtons, glowsWindows } from './editor/buttons';
import { EditorController } from './editor/controller';
import { editOp } from './editor/ops';
import { needBonusOf, type NeedRow } from './editor/model';
import { SHEET, createSheetPort, type SheetBag } from './editor/sheet';
import { Materials, type CraftCount, type TansuStock } from './materials';
import type { HouseWorld } from './ground';
import type { BlockWatcher } from './blockWatch';
import { ArchitectManager, type ArchitectInfo } from './manager';
import { HouseBook, type HouseView } from './book';
import { PlacedLooks, resolveLook } from './placedLooks';
import { bagVia, type Who } from './whoPort';
import { cellInfo, type CellInfo } from './cell';
import { HoverTip, glowPartOf, tipLines } from './recipes/hoverTip';
import { RecipeKeeper } from './recipes/keeper';
import { isRecipeId, recipeButtons } from './recipes/table';
import type { PreviewMode } from './preview/mesh';
import { NO_PREVIEW, previewModeOf, type PreviewPort } from './preview/port';
import { HouseRename, type RenameView } from './rename';
import { recordHouse, writeShape } from './shape';
import { HouseState } from './state';
import { HouseTalk, type HouseMenuState } from './talk';
import { BuildGlue, type HouseSfx } from './build/glue';
export type { HouseSfx };
import { MSG } from './build/tuning';
import type { BuildingView } from './build/builder';
import type { CelebrateView } from './build/celebrate';
import type { FlowCursor } from './build/flow';
import type { Site } from './build/sites';

/**
 * 建築士さん・話す 流れ・材料を ひとつに つなぐ 係（HOUSE-1A。1E で くらは なくなり、材料は もちもの ＋ 近くの たんす）。DOM・three なし。
 * 毎ステップ `update()`（時間が すすんで いる 間だけ。メニューが 開くと ゲームが 止まるので 呼ばれない）。
 * 画面（HouseUi）と 窓口（`window.__rikkun.house`）は ここを 通して 動かす。
 */

/** 話して いる 間に プレイヤーが これより はなれたら 話しを やめる（メニューが 勝手に 開かない ように） */
export const TALK_RANGE = 12;

export interface HouseSystemDeps {
  seed: number;
  /** 世界の 窓口。`setBlock` は 建てた 家を 書く `buildNow` が 使う（本物の 世界は ふつうの `setBlock`） */
  world: HouseWorld & { setBlock(x: number, y: number, z: number, id: BlockId): boolean };
  spawn: () => { x: number; z: number; yawDeg: number };
  /** プレイヤー（1P）の 足もと */
  player: () => Vec3;
  bag: SheetBag;
  /** COOP-1 5d: その 人の 足もと。2P が いなければ null（省くと who 1 は player()、who 2 は null）。話して いる あいだ 中の「プレイヤーの 場所」は 話した 人の 物 */
  playerOf?: (who: Who) => Vec3 | null;
  /** その 人の もちもの（省くと bag）。せっけいず・材料・どうぐは 話した 人の 物 */
  bagOf?: (who: Who) => SheetBag;
  /** その 人から craftTansuRange の たんすを 数える 係（省くと craft）。たんす本体の 取り出しは tansu のまま */
  craftOf?: (who: Who) => CraftCount | undefined;
  /** 材料の 数え方（もちもの ＋ 近くの たんす。「つくる」と 同じ きょり・同じ 数え方。HOUSE-1E）。`tansu` と そろって いない ときは もちものだけ */
  craft?: CraftCount;
  /** 近くの たんすから 取り出す・読む・書く（建てる 材料・せっけいずの かみ・ふで。HOUSE-1E） */
  tansu?: TansuStock;
  /** 今の 設定 `toolDurability`（たんすの ふでの のこりを 数える。なければ はじめの 値） */
  durability?: () => Readonly<Partial<Record<ItemId, number>>>;
  /** 声「ぽぽぽ」を 1 回 鳴らす */
  voice: () => void;
  /** 道具を わたした（拾った 知らせ） */
  gave: (item: ItemId, who?: Who) => void;
  /** 持ち物の ほかに 持って いる 数（たんすの 中）。なければ 持ち物だけ */
  owned?: (item: ItemId) => number;
  /** メニューが 開いた / とじた（ゲームの 時間を 止める・マウスの ポインターを はなす / もどす） */
  onOpen: () => void;
  onClose: () => void;
  /** やられた・ほかの 画面が 開いた など、話しを つづけられない とき true（who ＝ 話して いる 人） */
  interrupted?: (who: Who) => boolean;
  /** 地形だけで 見た「水でない 地面」（テストで 差しかえる） */
  isLand?: (x: number, z: number) => boolean;
  /** 戸を 外から 通って 中に 入った: 名前の 帯を 上の 帯の 列に 入れる（text ＝ 家の 名前。HOUSE-1 §3.3） */
  nameBand?: (text: string) => void;
  /** 手に 持って いる もの（みずもりの 色を 出す 目印。なければ 何も 持って いない） */
  held?: () => ItemId | null;
  /** 音・演出（HOUSE-1C PR-2。なければ 鳴らさない） */
  play?: (e: HouseSfx) => void;
  /** 持ち物に 入らなかった 物を その 人の 足もとに 落とす（まきものの 入りきらない 分・ぜんぶ おぼえた あとの かみ 3 まいの 入りきらない 分。HOUSE-2A。who を 省くと 1P） */
  drop?: (item: ItemId, count: number, who?: Who) => void;
  /** まきものの テロップ（はじめて 手に 入れた・おぼえた）を 上の 帯の 列に 入れる（HOUSE-2A。who ＝ 使った・拾った 人。なければ 何も しない） */
  recipeBand?: (text: string, who?: Who) => void;
  /** その 人を 足もと (x, y, z) へ うつす（建築を はじめる とき 場所の 中に いた ときだけ）。なければ 位置を 書きかえる */
  teleport?: (who: Who, x: number, y: number, z: number) => void;
  /** 建築を はじめる 場所の 中に いる 動物・妖怪を 外へ うつす。なければ 何も しない */
  evict?: (box: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }, spots: readonly Vec3[]) => void;
}

/** 窓口 settings に 出す 数（テスト用。houseBuildTicks 0 ＝ 仕様 §4.1 の 式） */
export interface HouseSettings {
  houseBuildTicks: number;
}

/** 上空の 視点の 画面への 窓口（wireHouse が つなぐ。つなぐ 前は 何も しない） */
export interface SkyPort {
  /** 世界の 点 (x, y, z) が 画面の どこに 見えるか（CSS px） */
  project(x: number, y: number, z: number): { x: number; y: number };
}
const NO_SKY: SkyPort = { project: () => ({ x: 0, y: 0 }) };

export class HouseSystem {
  readonly state = new HouseState();
  /** 建てた 家の 記録（戸で おぼえる。保存に 入る） */
  readonly book = new HouseBook();
  /** 手で 置いた 家の 物の 案の 記録（HOUSE-2C §2.7。世界に 1 つ。保存キー placedLooks） */
  readonly placedLooks = new PlacedLooks();
  /** 窓口 settings の houseBuildTicks（HOUSE-1C PR-2 のテスト用） */
  readonly settings: HouseSettings = { houseBuildTicks: 0 };
  /** 家を 建てる 流れ（建築中の 家・一覧・上空の 視点・みずもり・どうづき・完成の 盛り上げ） */
  readonly build: BuildGlue;
  sky: SkyPort = NO_SKY;
  readonly manager: ArchitectManager;
  readonly talk: HouseTalk;
  readonly editor: EditorController;
  /** 見本（3D）への 入口。wireHouse が つなぐ（つなぐ 前は 何も しない） */
  preview: PreviewPort = NO_PREVIEW;
  /** 世界の ブロックの 変化の 受け手（建築士さんの 足もと ＋ 家の 戸の 記録）。`watchBlocks(world, house.watcher)` で つなぐ */
  readonly watcher: BlockWatcher = {
    blockChanged: (x, z) => {
      this.manager.blockChanged(x, z);
      this.build.level.blockChanged(x, z);
    },
    blocksChanged: (x0, z0, x1, z1) => {
      this.manager.blocksChanged(x0, z0, x1, z1);
      this.build.level.blocksChanged(x0, z0, x1, z1);
    },
    cellChanged: (x, y, z, id) => {
      this.book.cellChanged(x, y, z, id);
      this.placedLooks.cellChanged(x, y, z, id);
    },
    boxFilled: (x0, y0, z0, x1, y1, z1, id) => {
      this.book.boxFilled(x0, y0, z0, x1, y1, z1, id);
      this.placedLooks.boxFilled(x0, y0, z0, x1, y1, z1, id);
    },
  };
  /** レシピの まきもの: 手に 入れる・使って おぼえる（3.3 版）。おぼえた 記録は state.recipes（保存） */
  readonly recipes: RecipeKeeper;
  private readonly renamer: HouseRename;
  /** 名前の ヘルプ（ばしょ・しゅるいの ボタンに のせて 12 コマ） */
  private readonly tip = new HoverTip();
  /** 材料の もと（もちもの ＋ 近くの たんす）。数えるのは 画面を 開いた とき・押した とき だけ（呼ぶ 側が 毎ステップ 呼ばない） */
  private readonly materials: Materials;
  private onChange: (() => void) | null = null;
  private seen = 0;
  /** 話して いる 人（話して いない あいだは 1P） */
  private who: Who = 1;

  constructor(private readonly d: HouseSystemDeps) {
    this.manager = new ArchitectManager({
      seed: d.seed,
      world: d.world,
      spawn: d.spawn,
      record: this.state.record,
      player: () => this.nowPos(),
      isLand: d.isLand,
    });
    // もちもの・たんすを 数える 係・場所は「いま 話して いる 人」の 物（話して いなければ 1P）
    const bagNow = bagVia(() => this.bagOf(this.talker() ?? 1));
    const crafter = (): CraftCount | undefined => d.craftOf?.(this.talker() ?? 1) ?? d.craft;
    const source = {
      get craft() {
        return crafter();
      },
      tansu: d.tansu,
    };
    this.materials = new Materials(bagNow, source);
    const gave = (item: ItemId): void => d.gave(item, this.talker() ?? 1);
    this.editor = new EditorController({
      holder: this.state.holder,
      recipes: this.state.recipes,
      have: (item) => this.materials.have(item),
      sheet: createSheetPort({
        bag: bagNow,
        get craft() {
          return crafter();
        },
        tansu: d.tansu,
        durability: d.durability,
        register: (draft) => this.state.register(draft),
        gave,
      }),
      onMade: () => this.talk.made(),
    });
    this.renamer = new HouseRename({ book: this.book, player: () => this.nowPos(), suffixOk: (i) => this.state.recipes.suffixOk(i) });
    this.build = new BuildGlue({
      world: d.world,
      player: () => this.nowPos(),
      playerOf: (who) => this.posOf(who),
      held: () => d.held?.() ?? null,
      plans: () => this.blueprints(),
      have: (item) => this.materials.have(item),
      consume: (item, n) => this.materials.consume(item, n),
      buildTicks: () => this.settings.houseBuildTicks,
      book: this.book,
      erasePlaced: (x, y, z) => this.placedLooks.erase(x, y, z),
      manager: this.manager,
      speaker: () => this.talk.current(),
      fallbackArchitect: () => this.manager.all()[0]?.id ?? null,
      play: (e) => d.play?.(e),
      teleport: (who, x, y, z) => {
        if (d.teleport) d.teleport(who, x, y, z);
        else {
          const p = this.posOf(who);
          if (p) Object.assign(p, { x, y, z });
        }
      },
      evict: (box, spots) => d.evict?.(box, spots),
    });
    this.recipes = new RecipeKeeper(this.state.recipes, {
      seed: d.seed,
      bagOf: (who) => this.bagOf(who),
      ...(d.drop ? { drop: d.drop } : {}),
      play: (e) => d.play?.(e),
      band: (text, who) => d.recipeBand?.(text, who),
      confetti: () => this.build.celebrate.bump(),
    });
    this.talk = new HouseTalk({
      flow: this.build.flow,
      busy: () => this.build.builder.active() !== null,
      busyText: () => this.build.busyText(),
      rename: this.renamer,
      editor: this.editor,
      record: this.state.record,
      legacy: this.state.legacy,
      bag: bagNow,
      voice: d.voice,
      onOpen: () => d.onOpen(),
      onClose: () => d.onClose(),
      endTalk: (id) => this.manager.endTalk(id),
      gave,
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
    // 戸を 通った 家の 帯: 人ごとに しらべ、同じ ステップに 2 人なら 1 つ（1P の 家が 先）
    const p2 = this.d.playerOf?.(2) ?? null;
    const e1 = this.book.step(this.d.player(), 1);
    const e2 = p2 ? this.book.step(p2, 2) : null;
    const entered = e1 ?? e2;
    if (entered) this.d.nameBand?.(entered.name);
    this.build.update();
    this.recipes.step();
    this.tickTip();
    this.talk.tickBye();
    const id = this.talk.current();
    if (id !== null) this.stepTalk(id);
    this.emit();
  }

  /** テストの 窓口（`house.talk`）から 話した ときは はなれて いても 話しつづけられる（あきちから 話す E2E） */
  private anyRange = false;

  /** 右クリックで 話しかける。いない・もう 話して いる なら false */
  talkTo(id: string, who: Who = 1, anyRange = false): boolean {
    if (!this.manager.get(id) || this.talk.current() !== null) return false;
    this.anyRange = anyRange;
    const from = this.posOf(who);
    if (!from) return false;
    this.who = who;
    if (!this.talk.start(id)) {
      this.who = 1;
      return false;
    }
    this.manager.beginTalk(id, from);
    this.emit();
    return true;
  }

  /** 話して いる 人（話して いなければ null）。中の「プレイヤーの 場所」・もちもの・材料は この 人の 物 */
  talker(): Who | null {
    return this.talk.current() === null ? null : this.who;
  }

  /** たたかれた（おっとっと）。who ＝ たたいた 人（その 人の 方から かたむく） */
  hit(id: string, who: Who = 1): void {
    const from = this.posOf(who);
    if (from) this.manager.hit(id, from);
  }

  /** その 人の 足もと（2P が いなければ null） */
  private posOf(who: Who): Vec3 | null {
    return this.d.playerOf?.(who) ?? (who === 1 ? this.d.player() : null);
  }

  /** いま 中で「プレイヤー」と 呼ぶ 場所: 話して いる 人、いなければ 1P */
  private nowPos(): Vec3 {
    return this.posOf(this.talker() ?? 1) ?? this.d.player();
  }

  private bagOf(who: Who): SheetBag {
    return this.d.bagOf?.(who) ?? this.d.bag;
  }

  press(id: string, arg?: unknown): void {
    const bonus = this.build.builder.firstBonus();
    this.talk.press(id, arg);
    // ［ここに たてる］で 建築が はじまった: メニューを とじて、建築士さんが ひとこと（はじめての 家は おまけの こと）
    if (this.talk.takeStarted()) this.talk.farewell(bonus ? MSG.bonus : '');
    this.emit();
  }

  /** Esc: エディターの 確かめの まど・ひつような もの・家具の えらびが あれば そちらを とじる。なければ 話しを ぜんぶ やめる */
  escape(): void {
    this.talk.escape();
    this.emit();
  }

  /** 上空の 視点の 操作（矢印〔dx, dz〕・マウス〔わくの 北西の すみ x, z〕・決定）。上空の 視点で なければ 何も しない */
  skyMove(dx: number, dz: number): void {
    this.build.flow.move(dx, dz);
    this.emit();
  }

  skyMoveTo(x: number, z: number): void {
    this.build.flow.moveTo(x, z);
    this.emit();
  }

  /** Enter・左クリック: わくが 置ける 場所なら 確かめの まど。まどが あれば ［ここに たてる］ */
  skyDecide(): void {
    if (this.build.flow.cursor()?.confirm) this.press('yes');
    else this.build.flow.decide();
    this.emit();
  }

  /** 上空の 視点が 開いて いる（カメラを 上に あげる・まどを 出す） */
  skying(): boolean {
    return this.talk.menu().page === 'sky';
  }

  /** エディターが 開いて いる（Esc いがいの キーを ゲームの 操作に しない・見本を 描く） */
  editing(): boolean {
    return this.talk.editing();
  }

  /** 字を えらぶ 画面〔エディター・なまえを かえる の 名前の 画面〕が 開いて いる（Esc と Backspace いがいの キーを ゲームの 操作に しない。§2.6） */
  typing(): boolean {
    return this.talk.typing();
  }

  /** 保存から 読みこむ（HouseState の 中身を 入れかえ、エディターの もどす の 記録は すてる） */
  load(data: unknown): void {
    this.state.deserialize(data);
    this.editor.loaded();
    const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    this.book.restore(d.houses);
    this.placedLooks.restore(d.placedLooks, (x, y, z) => this.d.world.getBlock(x, y, z)); // 今の ブロックと 合わない 行は すてる
    this.build.load(d.build);
  }

  /** 保存（せっけいず ＋ まだ かえして いない くらの 物 ＋ 建てた 家の 記録 ＋ 建築中の 家。HOUSE-1C PR-2） */
  serialize(): ReturnType<HouseState['serialize']> & { houses: ReturnType<HouseBook['serialize']>; build: ReturnType<BuildGlue['serialize']>; placedLooks: ReturnType<PlacedLooks['save']> } {
    return { ...this.state.serialize(), houses: this.book.serialize(), build: this.build.serialize(), placedLooks: this.placedLooks.save() };
  }

  /** 1 ステップ（1/60 秒。ゲームの 時間が 止まって いても すすむ）: エディターの ふきだしの 時間 */
  tickEditor(): void {
    if (!this.talk.editing()) return;
    this.editor.tick();
    this.tickTip();
    this.emit();
  }

  /** ヘルプの 1 コマ（update() か tickEditor() の どちらか 一方だけ 毎コマ 呼ばれる）。エディターが とじて いたら 消す */
  private tickTip(): void {
    if (!this.talk.editing()) this.tip.reset();
    else this.tip.tick(this.visibleButton);
  }

  /** そのボタンが いま 画面に 見えて いるか（ヘルプ・光りの 目安） */
  private readonly visibleButton = (id: string): boolean => this.talk.editing() && editorButtons(this.editor).some((b) => b.id === id);

  /** 窓口 editor().hoverTip: 出て いる ヘルプ { id, lines }（出て いなければ null）。置き場所は 画面が 決める */
  hoverTip(): { id: string; lines: string[] } | null {
    const id = this.tip.shown;
    return id === null ? null : { id, lines: tipLines(id, this.editor.s) };
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
    return previewModeOf(this.editor.s.step);
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

  /**
   * 窓口 `hover(id | null)`: その ボタンに マウスを のせた のと 同じ。光るのは まどの かず −＋（窓が ぜんぶ）と、ポップアップの しゅるいの ボタン
   * （その ばしょ。やね・かべ・まど・と・えんとつ・のれん・はなだん・しゃちほこ）だけ（① で）。ばしょ・しゅるいの ボタンには 名前の ヘルプも 出る
   */
  hover(id: string | null): void {
    const part = id !== null && this.previewMode() === 'outside' ? glowPartOf(id) : null;
    if (id !== null && this.previewMode() === 'outside' && glowsWindows(id)) this.preview.hover(true);
    else if (id !== null && part !== null && !this.drawsNothing(id, part) && this.visibleButton(id)) this.preview.hover(true, part);
    else this.preview.hover(false);
    this.tip.hover(id, this.visibleButton);
  }

  /** 「なし」の ボタンに のせた・その ばしょが 今 なし（描いて いない）なら 光らせる 物が ない（やね・かべ・まど。AC9c「なしは 描かず 光らない」） */
  private drawsNothing(id: string, part: string): boolean {
    if (id.endsWith('-none')) return true;
    const e = this.editor.s;
    return (part === 'roof' && e.roof === 'none') || (part === 'wall' && e.wall === 'none') || (part === 'window' && e.windowKind === 'none');
  }

  /** おぼえた レシピの id（「つくる」が 家の 物の 作り方を 解禁する ときに 読む。毎回 配列を 作らない） */
  learnedRecipes(): readonly string[] {
    return this.state.recipes.learnedIds();
  }

  /** 窓口 `recipes()`・`learn(id)`・`found(at, who)`・`read(who)`・`recipeBand()`・`recipeKinds(id)`（HOUSE-2A。テスト用の 窓口と 手に 入れる・使う 入口） */
  recipeKinds(id: string): string[] {
    return isRecipeId(id) ? recipeButtons(id) : [];
  }

  /** 窓口 `need(source?)`: source なし ＝ エディターの 今の 形、数 ＝ 持ち物の せっけいずの マスの 番号。have ＝ もちもの ＋ 近くの たんす（1E）。bonus は はじめての 家の おまけ（1C） */
  need(source?: number): Array<NeedRow & { bonus: number }> {
    if (source === undefined) return needBonusOf(this.state.holder.draft, (item) => this.materials.have(item), false);
    const form = this.planAt(source);
    return form ? this.build.needRows(form) : [];
  }

  /** 「けんちくを はじめる」の 画面が 読む もの（一覧の カード・ひつような もの の 行・確かめの まどの 名前） */
  pickList(): ReturnType<BuildGlue['pickList']> {
    return this.build.pickList();
  }
  buildNeedRows(): Array<NeedRow & { bonus: number }> {
    return this.need(this.build.flow.needSlot());
  }
  buildName(): string {
    return this.build.flow.planName();
  }

  /** 窓口 `blueprints()`: 持ち物の せっけいず（マスの 番号つき）。中身を 知らない 番号は とばす */
  blueprints(): Array<Blueprint & { slot: number; windowCells: ReturnType<typeof blueprintWindows> }> {
    const out: Array<Blueprint & { slot: number; windowCells: ReturnType<typeof blueprintWindows> }> = [];
    this.bagOf(this.talker() ?? 1).slots().forEach((s, slot) => {
      const bp = s?.item === SHEET && s.plan ? this.state.blueprint(s.plan) : null;
      if (bp) out.push({ ...bp, slot, windowCells: blueprintWindows(bp) });
    });
    return out;
  }

  /** 持ち物の マスの せっけいずの 中身（なければ null） */
  private planAt(slot: number): Blueprint | null {
    const s = this.bagOf(this.talker() ?? 1).slots()[slot];
    return s?.item === SHEET && s.plan ? this.state.blueprint(s.plan) : null;
  }

  /** ツールチップの 名前（持ち物の せっけいず）。知らない 番号は null */
  planName(plan: number): string | null {
    const bp = this.state.blueprint(plan);
    return bp ? blueprintName(bp) : null;
  }

  /** 前の セーブ〔1D まで〕の くらの 物の うち まだ かえして いない 分 { アイテムid: 数 }。なければ null（窓口 `legacyKura()`。AC32d） */
  legacyKura(): Record<string, number> | null {
    return this.state.legacy.totals();
  }

  // ------------------------------------------------------------ 建てた 家（HOUSE-1C PR-1。窓口 buildNow・houses・blockAt・renaming）

  /**
   * せっけいず（番号）から 家を その場に 建てる（建築が おわった 形を いっぺんに。手順・材料・地盤は PR-2）。外の 箱の 北西の すみ at（床の 段の 高さ）。
   * 箱の 中の ぜんぶの マスを ふつうの `world.setBlock` で 書く（blockWatch の 知らせ・光・メッシュも ふつうの 道）。知らない 番号は null
   */
  buildNow(number: number, at: Vec3): HouseView | null {
    const bp = this.state.blueprint(number);
    if (!bp) return null;
    // 記録は 書きおわってから 足す（書く 途中の blockWatch の 知らせで、まだ 戸が 無い マスを 記録が 見て 消えたり しない ように）
    writeShape(this.d.world, bp, at, (x, y, z) => this.placedLooks.erase(x, y, z)); // 置きかえた マスの 手置きの 記録は 消す
    const rec = recordHouse(this.book, bp, number, at);
    return this.book.view(rec);
  }

  /** 戸で おぼえた 記録（できた 順） */
  houses(): HouseView[] {
    return this.book.list().map((r) => this.book.view(r));
  }

  /** 場所 (x, y, z) の しゅるいの id（置いた 記録 → 家の 記録 → むら。見た目・ほった アイテムと 同じ 答え）。案の ある 形の ブロックで なければ null */
  lookOf(x: number, y: number, z: number): string | null {
    return resolveLook({ block: this.d.world.getBlock(x, y, z), placed: this.placedLooks, book: this.book }, x, y, z);
  }

  /** 置いた ときの 記録（なければ null） */
  placedLook(x: number, y: number, z: number): ReturnType<PlacedLooks['get']> {
    return this.placedLooks.get(x, y, z);
  }

  /** マス 1 つの ようす（ほると 手に 入る アイテム・家具の 向き） */
  blockAt(x: number, y: number, z: number): CellInfo {
    return cellInfo(this.d.world.getBlock(x, y, z), this.book, x, y, z);
  }

  // ------------------------------------------------------------ 建築（HOUSE-1C PR-2。窓口 level・sites・cursor・building・firstBonus・celebrate）

  /** みずもりの きじゅんと 色（持って いて 近い 間だけ cells） */
  level(): ReturnType<BuildGlue['levelView']> {
    return this.build.levelView();
  }

  /** 上空の 視点の 間の 置ける 場所（ほかの 間は []） */
  sites(): Site[] {
    return this.build.flow.sites().map((s) => ({ ...s }));
  }

  /** 上空の 視点の わく（画面の 位置つき）。上空の 視点で なければ null */
  cursor(): (FlowCursor & { screen: { x: number; y: number } }) | null {
    const c = this.build.flow.cursor();
    const o = this.build.flow.outer();
    if (!c || !o) return null;
    const y = this.build.flow.sites().find((s) => s.x === c.x && s.z === c.z)?.y ?? this.build.flow.sites()[0]?.y ?? 0;
    return { ...c, screen: this.sky.project(c.x + o.w / 2, y + 1, c.z + o.d / 2) };
  }

  /** 建築中の 家（なければ null） */
  building(): BuildingView | null {
    return this.build.builder.view();
  }

  /** まだ 1 けんも 建て はじめて いない（ふとん 1 つぶんの おまけが ある） */
  firstBonus(): boolean {
    return this.build.builder.firstBonus();
  }

  /** 紙ふぶきの 回数と 上の 帯 */
  celebrate(): CelebrateView {
    return this.build.celebrate.view();
  }

  /** 名前の 画面で 作って いる 名前（ほかの ページでは null） */
  renaming(): { id: number; name: { front: string; back: string } } | null {
    return this.talk.menu().page === 'renameName' ? this.renamer.renaming() : null;
  }

  /** なまえを かえる の 画面が 読む もの */
  renameView(): RenameView {
    return this.renamer.view();
  }

  menu(): HouseMenuState {
    return this.talk.menu();
  }

  architects(): ArchitectInfo[] {
    return this.manager.list();
  }

  /** メニューが 開いて いる（ゲームの 時間を 止める） */
  frozen(): boolean {
    return this.talk.frozen();
  }

  /** 話して いる（うなずき・あいさつ・メニュー） */
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
    const p = this.posOf(this.who);
    // 建築士さんが きえた（遠くへ はなれて 一覧から はずれた）・話した 人が はなれた／いなくなった・ほかの 画面が 開いた: やめる
    if (!a || !p || (!this.anyRange && Math.hypot(a.x - p.x, a.z - p.z) > TALK_RANGE) || this.d.interrupted?.(this.who) === true) {
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
