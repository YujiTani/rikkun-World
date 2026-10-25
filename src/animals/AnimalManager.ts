import type { AnimalApi, AnimalDeps, AnimalEvent, AnimalHintKind, AnimalInfo, AnimalSaveV4, AnimalSpawnOpts, AnimalView, CoopBreakResult, CoopInfo, CoopPlacePreview, CoopPlaceResult, FightCues, ItemId, ItemStack, KitIcon, KitInfo, KitUseResult, LiveSettings, NatsukiView, SwingResult, ThrowAim, ThrowSpot, Vec3 } from '../contracts';
import type { CoopDir } from './coop';
import type { AnimalManagerOptions, Coop } from './animalTypes';
import { BUG_CATCH_UPDATES, POP_TICKS } from './animalConsts';
import { AnimalCore } from './animalCore';
import { finishMeat, meatList, meatSay, startMeat } from './animalMeat';
import { breakCoop, collectCoop, coopAt, forEachCoop, listCoops, machoMiss, placeCoop, previewCoop, removeCoop } from './animalCoops';
import { forEachKit, kitAt, kitIcons, listKits, useKit } from './animalKits';
import { carryHold, dropCarried, putDownAnimal, startThrow, throwSpot, throwTo } from './animalCarry';
import { feedAnimal, natsukiViewOf, petAnimal, previewAnimal } from './animalCare';
import { fightCue, fightMarks, fightersNow } from './animalFight';
import { deserializeAnimals, serializeAnimals } from './animalSave';
import { forEachVisibleAnimal, listAnimals, rayHitAnimal } from './animalView';
import { spawnAnimal, trySpawn, updateAnimals } from './animalLife';

export type { AnimalManagerOptions } from './animalTypes';

/**
 * LIVE-1 A: にわとり の しくみ（出る・うろうろ・見る・ついてくる・ワープ・なかよし・たまご・保存）。
 * 見た目・音・ふりわけ は 持たない。`AnimalApi`（rayHit・preview・feed・pet・forEachVisible）と `SaveExtra` を 実装。
 * 状態 は `AnimalCore`、係ごとの 動き は `animalMove`・`animalCarry`・`animalCoops`・`animalKits`・`animalMeat`・`animalCare`・
 * `animalFight`・`animalSave`・`animalView`・`animalLife` の 関数。ここ は 窓口 だけ。
 */
export class AnimalManager implements AnimalApi {
  readonly settings: LiveSettings;
  /** 外から 差しこまれた しくみ（テスト が 一部 を 差しかえる） */
  protected readonly d: AnimalDeps;
  private readonly core: AnimalCore;

  /** 小屋 の 一覧（テスト が 読む） */
  protected get coopList(): Coop[] {
    return this.core.coopList;
  }

  constructor(o: AnimalManagerOptions) {
    this.core = new AnimalCore(o);
    this.d = this.core.d;
    this.settings = this.core.settings;
  }

  /** あみ を ふる（§2.4）。とれる か は ふった ステップ に きまり、むし は 30 ステップ 目 に 持ち物 へ */
  swingNet(block: Vec3): SwingResult {
    const r = this.core.net.swing(block, this.core.tick, this.core.settings);
    this.core.push({ type: 'swing', x: block.x, y: block.y, z: block.z, caught: r.caught, reason: r.reason });
    if (r.caught) this.core.catches.push(BUG_CATCH_UPDATES);
    return r;
  }

  carrying(): number | null {
    return this.core.carriedId;
  }

  /** 直前 の `putDown` が 失敗 した わけ（`coopFull`・`friendFull`）。A が その 合図 を 出して いる。ほか は null（C は null の とき だけ `cantPutHere`） */
  putDownWhy(): AnimalHintKind | null {
    return this.core.putWhy;
  }

  /** 小屋 の 子 に なった しゅんかん の 大きな しるし の 段（いちばん あたらしい 子。1 → 40 ステップ で 0） */
  homePop(): number {
    let v = 0;
    for (const e of this.core.ents) if (e.popAge >= 0 && e.popAge < POP_TICKS) v = Math.max(v, 1 - e.popAge / POP_TICKS);
    return v;
  }

  /** おなかいっぱい か（照準 の 下 の `まってね`） */
  isFull(id: number): boolean {
    const e = this.core.find(id);
    return !!e && e.fullLeft > 0;
  }

  isFriend(id: number): boolean {
    return !!this.core.find(id)?.friend;
  }

  /** つなぎ込み から の 合図（あみ の ヒント など）。出来事 と lastHint に 出す */
  emitHint(h: AnimalHintKind): void {
    this.core.hintOut(h);
  }

  lastHint(): AnimalHintKind | null {
    return this.core.hint;
  }

  /** 今 ねらわれている にわとり（しるし を 出す。つなぎ込みが 毎ステップ 入れる） */
  setTargeted(id: number | null): void {
    this.core.targetId = id;
  }

  count(): number {
    return this.core.ents.length;
  }

  /** なかま の 数（小屋 の 子 は 数えない。小屋 ごと に 6 わ） */
  friendCount(): number {
    return this.core.friendCount();
  }

  /** 前 に 呼んでから の 出来事（呼ぶと 空） */
  events(): AnimalEvent[] {
    const q = this.core.queue;
    this.core.queue = [];
    return q;
  }

  clear(): void {
    this.core.clear();
  }

  spawn(x: number, y: number, z: number, opts: AnimalSpawnOpts = {}): number | null {
    return spawnAnimal(this.core, x, y, z, opts);
  }

  list(): AnimalInfo[] {
    return listAnimals(this.core);
  }

  rayHit(origin: Vec3, dir: Vec3, maxDist: number): { id: number; distance: number } | null {
    return rayHitAnimal(this.core, origin, dir, maxDist);
  }

  preview(id: number, held: ItemStack | null): 'feed' | 'animalFull' | 'animalPet' | null {
    return previewAnimal(this.core, id, held);
  }

  feed(id: number, item: ItemId): 'ate' | 'full' | 'pet' | 'friendFull' | 'sleep' | 'wait' | 'harapan' | 'harapanNo' | null {
    return feedAnimal(this.core, id, item);
  }

  /** パネル の 状態（§3.2・§6）。なかま の 大人 だけ shown（だっこ 中 は 出ない） */
  natsukiView(id: number): NatsukiView | null {
    return natsukiViewOf(this.core, id);
  }

  pet(id: number): 'wild' | 'friend' | 'wait' | null {
    return petAnimal(this.core, id);
  }

  forEachVisible(fn: (v: AnimalView) => void): void {
    forEachVisibleAnimal(this.core, fn);
  }

  /** 出す の を 1 回 ためす（§2.1）。出た id か null */
  trySpawn(): number | null {
    return trySpawn(this.core);
  }

  update(): void {
    updateAnimals(this.core);
  }

  /** 右クリック の 押しつづけ（§2.8）。`heldTicks` = 押してから の ステップ 数 */
  carryHold(id: number, heldTicks: number): 'lifted' | 'wait' | 'wild' | null {
    return carryHold(this.core, id, heldTicks);
  }

  /** おろす（§2.8）。`spot` = 足もと の 位置。固い マス・読みこんで いない 所 は false */
  putDown(spot: Vec3): boolean {
    return putDownAnimal(this.core, spot);
  }

  /** やられた とき: だっこ中 を その場に おろす（地面 の 検査 は しない。出来事 putDown は 出す） */
  dropCarried(spot: Vec3): void {
    dropCarried(this.core, spot);
  }

  /** だっこ 中 の 着地点（照準 の 下 の 語・丸）。だっこ して いなければ null */
  throwSpot(aim: ThrowAim): ThrowSpot | null {
    return throwSpot(this.core, aim);
  }

  /** 右クリック（だっこ 中）: なげる（d＜1 は 20 ステップ で そっと おろす）。なげられない 所 は 合図 を 出して false */
  startThrow(aim: ThrowAim): boolean {
    return startThrow(this.core, aim);
  }

  /** テスト 用: その 足もと の 点 へ なげる */
  throwTo(x: number, y: number, z: number): boolean {
    return throwTo(this.core, x, y, z);
  }

  /** 小屋 を 置く（ゲーム の 置く と 同じ 判定。ねらった 所 が だめ なら まわり 8 か所）。x・z は 5×5 の まん中、y は いちばん 下 の 空気 の 高さ */
  placeCoop(x: number, y: number, z: number, dir: CoopDir = 0): CoopPlaceResult {
    return placeCoop(this.core, x, y, z, dir);
  }

  previewCoop(x: number, y: number, z: number, dir: CoopDir = 0): CoopPlacePreview {
    return previewCoop(this.core, x, y, z, dir);
  }

  kits(): KitInfo[] {
    return listKits(this.core);
  }

  coops(): CoopInfo[] {
    return listCoops(this.core);
  }

  /** その マス の こたつ（たまご が 入って いる もの だけ） */
  kitAt(x: number, y: number, z: number): KitInfo | null {
    return kitAt(this.core, x, y, z);
  }

  /** その ブロック を 持つ 小屋（まわり の わ。さく・もん・ねぐら・すばこ） */
  coopAt(x: number, y: number, z: number): CoopInfo | null {
    return coopAt(this.core, x, y, z);
  }

  /**
   * 右クリック: こたつ を ねらった（LIVE-2 §2.1・LIVE-2.1 §2.4）。`held` = 持って いる もの。
   * 入れた → 'put'（C が 1 つ へらす）。その こたつ が 3 こ → 'full'（kitFull）・たまご じゃ ない 物 → 'wait'（入って いる）／'needEgg'（から）・
   * あたためる たまご が 世界 ぜんぶ で 6 こ → 'max'（kitMax）。どれ も 合図 は ここ で 出す。
   * 置ける 物 を 持って いる とき の「となり に 置く」は C が 決めて、この 口 は 呼ばない。
   */
  useKit(x: number, y: number, z: number, held: ItemId | null): KitUseResult {
    return useKit(this.core, x, y, z, held);
  }

  /**
   * 天板 の 上 の たまご の 3 わく（LIVE-2.1 §3.2・AC12）。プレイヤー 水平 8 以内 の こたつ（たまご が 入って いる）と、
   * たまご を 持って ねらって いる こたつ（から でも 3 わく とも null）。
   */
  kitIcons(aimed: { x: number; y: number; z: number } | null, holdingEgg: boolean): KitIcon[] {
    return kitIcons(this.core, aimed, holdingEgg);
  }

  /** 右クリック: 小屋 の すばこ の たまご を ぜんぶ 持ち物 へ（入らない 分 は のこる）。あつめた 数 */
  collectCoop(coopId: number): { egg: number; gold: number } {
    return collectCoop(this.core, coopId);
  }

  /** 左クリック を 押した: 中 に 子 が いれば 'locked'（押した ステップ だけ 合図 と 出来事。だっこ 中 の 子 も 数える） */
  breakCoop(coopId: number, firstPress: boolean): CoopBreakResult {
    return breakCoop(this.core, coopId, firstPress);
  }

  /** 小屋 を 消す（子 0 の とき だけ。いれば false）。すばこ の たまご を おとし、ブロック は `removeCoopBlocks` で ぜんぶ 消す */
  removeCoop(coopId: number): boolean {
    return removeCoop(this.core, coopId);
  }

  /** ひよこ から 数えて 種類 の くじ の はずれ 数（保存 される）。`n` を 渡す と 設定 */
  machoMiss(n?: number): number {
    return machoMiss(this.core, n);
  }

  /** B が 描く: こたつ（たまご が 入って いる もの）。`hatchT` = かえる 動き の 進み 0〜1（動き 中 で ない とき 0）。同じ 行 を 使いまわす */
  forEachKit(fn: (k: KitInfo & { hatchT: number }) => void): void {
    forEachKit(this.core, fn);
  }

  /** B が 描く: 小屋（すばこ の 数 と 子 の 数） */
  forEachCoop(fn: (c: CoopInfo) => void): void {
    forEachCoop(this.core, fn);
  }

  /** その 小屋 の えらべる 子 の id（§2.1）: `meatEligible` で、だっこ 中・演出 中・とんで いる 子 は のぞく */
  meatList(coopId: number): number[] {
    return meatList(this.core, coopId);
  }

  /**
   * いただきます を はじめる（メニュー の 「いただきます」と 同じ）。えらべない 子 は `notEligible`（演出 中 の 小屋 でも 先 に 見る）、
   * その 小屋 で すでに 演出 中 なら `busy`
   */
  meat(coopId: number, id: number): { ok: boolean; reason: null | 'notEligible' | 'busy' } {
    return startMeat(this.core, coopId, id);
  }

  /** 演出 の 一言 の ふわっと 度（0〜1。出て いなければ null）。複数 の 小屋 なら いちばん 濃い もの */
  meatSay(): number | null {
    return meatSay(this.core);
  }

  /** 保存 の 前: 演出 中 の 子 を その場 で おわらせる（にく は 持ち物 か 足もと。読み直し に 演出 の 続き は 出ない） */
  finishMeat(): void {
    finishMeat(this.core);
  }

  /**
   * 保存（LIVE-2.1 §4.3・v 4）。だっこ 中 は プレイヤー の 足もと の 位置 が そのまま 入る。なげて いる とちゅう は 着地点 に いる もの と して 書く
   * （小屋 の 中 なら 小屋 の 子）。かえる 動き 中 の ひよこ は こたつ に 戻して 入れる（読み直す と また かえる）
   */
  serialize(): AnimalSaveV4 {
    return serializeAnimals(this.core);
  }

  /** 読みこみ。版 1（`eggDay` つき・`follow` なし）→ 版 2 → 版 3 の 順 に 直す（台帳 G8） */
  deserialize(data: unknown): void {
    deserializeAnimals(this.core, data);
  }

  /** 窓口: いま たたかえる マッチョ の id（その場 で 数え直す。だっこ した 次 の 子 も すぐ 見える） */
  fighters(): number[] {
    return fightersNow(this.core);
  }

  /**
   * 「きっかけ」を 渡す（§2.2）。りっくん が 体力 を へらした 妖怪（`hit`）・りっくん の 体力 を へらした 妖怪（`hurt`）。
   * 12 マス（`machoLeash`）より とおい 妖怪・もう いない 妖怪 は 数えない。たたかう 子 だけ が その ステップ に ねらう
   */
  fightCue(c: FightCues): void {
    fightCue(this.core, c);
  }

  /** 画面 の しるし 用: 「！」 を 出す マッチョ の 足もと と 経過、ねらわれて いる 妖怪 の id（同時 に 1 つ まで） */
  fightMarks(): { bang: { x: number; y: number; z: number; age: number } | null; target: number | null } {
    return fightMarks(this.core);
  }
}

export function createAnimalManager(o: AnimalManagerOptions): AnimalManager {
  return new AnimalManager(o);
}
