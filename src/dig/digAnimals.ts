import type { AnimalHintKind, CoopPlacePreview, PlayerState, TargetInfo, ThrowAim, Vec3 } from '../contracts';
import { LIVE_SETTING_DEFAULTS } from '../contracts';
import { isKotatsuBlock, kotatsuAnchorOf } from '../world/blocks/kotatsu';
import { COOP_BLOCKS, type DigCore } from './digCore';
import { lookDirection } from './raycast';
import type { RightClickPreview } from './rightClick';

/** にわとり・こたつ・小屋の係が DigSystemImpl から受け取る物（DigCore のほか） */
export interface DigAnimalsDeps extends DigCore {
  /** ブロック より 手前 の ねらう 箱 に 当たった にわとり */
  animalHit(): { id: number; distance: number } | null;
  origin(p: PlayerState, out: Vec3): Vec3;
  previewRightClick(repeat: boolean): RightClickPreview | null;
}

/** 右クリックの 動き（'latch' = 押しつづけ で くりかえさない、'hold' = なかま、'wild' = やせい） */
type RightMode = 'none' | 'latch' | 'hold' | 'wild';

/** 右クリックで にわとり・こたつ・小屋を あつかう係（LIVE-1〜LIVE-3）。押している間の状態も持つ */
export class DigAnimals {
  /**
   * LIVE-1 版 3.2 §2.3: 押した ステップ で きまる 右クリック の 動き。
   * 'latch' = 00・0b・8b・やせい以外（押しつづけ で くりかえさない）、'hold' = なかま（はなす か 40 まで 待つ。§2.8）、
   * 'wild' = やせい（押した ステップ に した。40 押しつづけ で 合図 carryWild だけ）
   */
  private rightMode: RightMode = 'none';
  private holdId = -1;
  private holdLifted = false;
  private holdCancelled = false;
  /** あみ を ふって いる 残り ステップ（この 間 は 押しても 何も しない。§2.3 の 0b） */
  private netLock = 0;
  private menuCache = { tick: -1, coop: -1, menu: false };
  private readonly pvDir = { x: 0, y: 0, z: 0 };
  private readonly pvOrigin = { x: 0, y: 0, z: 0 };

  constructor(private readonly d: DigAnimalsDeps) {}

  /** 毎ステップ（あみの ふりのこりを へらす） */
  tickNetLock(): void {
    if (this.netLock > 0) this.netLock--;
  }

  /** 右ボタンを 押した ステップの はじめ（前の押しの 状態を すてる） */
  beginPress(): void {
    this.rightMode = 'none';
    this.holdId = -1;
    this.holdLifted = false;
    this.holdCancelled = false;
  }

  isCarrying(): boolean {
    const a = this.d.m4.animals;
    return !!a && a.carrying() != null;
  }

  private liveTicks(): { netSwingTicks: number; carryHoldTicks: number } {
    return this.d.m4.live?.() ?? LIVE_SETTING_DEFAULTS;
  }

  hint(h: AnimalHintKind): void {
    this.d.m4.animals?.emitHint?.(h);
  }

  /** 押した ステップ の 00（おろす）・0（にわとり）・0b（あみ）・8b（あみ の 合図）。ここで 決めたら rightMode が 'none' 以外 */
  rightFirst(): void {
    const a = this.d.m4.animals;
    if (!a) return;
    const pv = this.d.previewRightClick(false);
    if (pv?.kind === 'putDown' || pv?.kind === 'throw' || pv?.kind === 'throwNo') {
      this.rightMode = 'latch';
      this.doPutDown();
      return;
    }
    const h = this.d.animalHit();
    if (h) {
      this.holdId = h.id;
      if (a.isFriend?.(h.id)) {
        // なかま: はなす まで あげる／なでる を 待つ。40 押しつづけ で だっこ（§2.8）
        this.rightMode = 'hold';
      } else {
        this.rightMode = 'wild';
        a.carryHold?.(h.id, 0); // A の「合図 を 出した」印 を 新しい 押し ごと に もどす（2 回目 の 長おし でも carryWild）
        if (pv) this.doAnimalKind(pv.kind);
      }
      return;
    }
    if (pv?.kind === 'net') {
      this.rightMode = 'latch';
      this.doNet();
    } else if (pv?.kind === 'netHint') {
      this.rightMode = 'latch';
      this.hint('netHint');
    }
  }

  /** 押しつづけ の ステップ。にわとり／あみ の 動きで 受け持った なら true（ほかの 右クリックは しない） */
  step(secondaryTicks: number): boolean {
    if (this.rightMode === 'latch') return true;
    if (this.rightMode === 'hold') {
      this.holdStep(secondaryTicks);
      return true;
    }
    if (this.rightMode === 'wild') {
      this.wildStep(secondaryTicks);
      return true;
    }
    return false;
  }

  /** なかま を 押している あいだ（押した ステップ から）。ねらい が はずれたら 何も しない */
  private holdStep(secondaryTicks: number): void {
    if (this.holdLifted || this.holdCancelled) return;
    const h = this.d.animalHit();
    if (!h || h.id !== this.holdId) {
      this.holdCancelled = true;
      return;
    }
    if (this.d.m4.animals!.carryHold(h.id, secondaryTicks) === 'lifted') this.holdLifted = true;
  }

  /** やせい を 押している あいだ。40 ステップ ちょうど で 合図 carryWild（1 回 の 押し で 1 回） */
  private wildStep(secondaryTicks: number): void {
    const hold = this.liveTicks().carryHoldTicks;
    if (secondaryTicks !== hold) return;
    const h = this.d.animalHit();
    if (!h || h.id !== this.holdId) return;
    if (this.d.m4.animals!.carryHold(h.id, secondaryTicks) === 'wild') this.hint('carryWild');
  }

  /** ボタン を はなした ステップ。なかま を 40 より 前 に はなした なら あげる／なでる（§2.3・§2.8） */
  releaseRight(secondaryTicks: number): void {
    const mode = this.rightMode;
    this.rightMode = 'none';
    if (mode !== 'hold' || this.holdLifted || this.holdCancelled) return;
    if (!this.d.lock.playInputEnabled() || this.d.gate?.blocksInput()) return;
    if (secondaryTicks >= this.liveTicks().carryHoldTicks) return;
    const h = this.d.animalHit();
    if (!h || h.id !== this.holdId) return;
    const pv = this.d.previewRightClick(false);
    if (pv) this.doAnimalKind(pv.kind);
  }

  /** 照準 の 下 の わ の たまり 0〜1（なかま を 押しつづけ て いる あいだ だけ。だっこ した ら 0） */
  carryProgress(secondaryTicks: number): number {
    if (this.rightMode !== 'hold' || this.holdLifted || this.holdCancelled) return 0;
    return Math.min(1, secondaryTicks / Math.max(1, this.liveTicks().carryHoldTicks));
  }

  private doAnimalKind(kind: string): void {
    // GOLD-1: まち中（'animalFull'）は むし なら あげる ふり（feed() が 'wait'）、それ いがい は なでる ふり（pet() が 'wait'）
    const held = this.d.inventory.held()?.item;
    if (kind === 'feed') this.doFeed();
    else if (kind === 'animalFull') {
      if (held === 'mushi' || held === 'harapan_mimizu') this.doFeed();
      else this.doAnimalPet();
    } else if (kind === 'animalPet') {
      // LIVE-2: ねて いる 子 に むし → なでず に sleepHint（feed() が 'sleep' を 返す。むし は へらない）
      // GOLD-1: はらぱんみみず を やせい・ひよこ・ねて いる 子 に → 合図 だけ（へらない）
      if (held === 'mushi' || held === 'harapan_mimizu') this.doFeed();
      else this.doAnimalPet();
    }
  }

  /** 0b あみ を ふる。ふって いる 20 ステップ の 間 は 何も しない */
  private doNet(): void {
    const a = this.d.m4.animals;
    const t = this.d.tgt();
    if (!a || !t || this.netLock > 0) return;
    this.netLock = this.liveTicks().netSwingTicks;
    const r = a.swingNet({ x: t.block.x, y: t.block.y, z: t.block.z });
    if (r.reason === 'empty') this.hint('treeEmpty');
    this.d.m4.tools?.pushSwing('dig');
  }

  /** LIVE-2.1 §2.2: なげる ときの ねらい（ねらった ブロック の 置く マス・目・前） */
  throwAim(): ThrowAim {
    const p = this.d.player();
    const d = lookDirection(p.yawDeg, 0, this.pvDir);
    const o = this.d.origin(p, this.pvOrigin);
    const t = this.d.tgt();
    const dirX = d.x;
    const dirZ = d.z;
    const d3 = lookDirection(p.yawDeg, p.pitchDeg, this.pvDir); // pvDir は 同じ 入れもの なので d は ここ で こわれる
    return { place: t ? { x: t.place.x, y: t.place.y, z: t.place.z } : null, eye: { x: o.x, y: o.y, z: o.z }, dirX, dirZ, dir3: { x: d3.x, y: d3.y, z: d3.z }, hitId: t?.id };
  }

  /** LIVE-2.1 §3.2: いま ねらって いる こたつ の 本体 の マス（こたつ で なければ null）と、たまご を 持って いる か（天板 の 3 わく を 出す わけ） */
  aimedKit(): { kit: { x: number; y: number; z: number } | null; holdingEgg: boolean } {
    const t = this.d.tgt();
    const held = this.d.inventory.held()?.item ?? null;
    const holdingEgg = held === 'egg' || held === 'kin_tamago';
    if (!t || !isKotatsuBlock(t.id)) return { kit: null, holdingEgg };
    const a = kotatsuAnchorOf(t.id, t.block.x, t.block.z);
    return { kit: { x: a.x, y: t.block.y, z: a.z }, holdingEgg };
  }

  /** 00 の 答え（照準 の 下 の 語・実行 が 同じ 判定）: なげる／なげられない／そっと おろす */
  throwKind(): 'throw' | 'throwNo' | 'putDown' {
    const a = this.d.m4.animals;
    const sp = a?.throwSpot?.(this.throwAim());
    if (!sp) return 'putDown';
    if (!sp.ok) return 'throwNo';
    return sp.toss ? 'throw' : 'putDown';
  }

  /** 00 なげる（LIVE-2.1。前は おろす）。d＜1 は そっと おろす（20 ステップ）。ブロック を ねらって いれば その 置く マス、なければ 前 3 マス */
  private doPutDown(): void {
    const a = this.d.m4.animals;
    if (!a) return;
    if (a.startThrow) {
      if (a.startThrow(this.throwAim())) this.d.m4.tools?.pushSwing('place');
      return;
    }
    // 古い つなぎ（なげる が 無い A）: 今まで の おろす
    const t = this.d.tgt();
    let spot: Vec3;
    if (t) spot = { x: t.place.x + 0.5, y: t.place.y, z: t.place.z + 0.5 };
    else {
      const p = this.d.player();
      const d = lookDirection(p.yawDeg, 0, this.pvDir);
      spot = { x: Math.floor(p.position.x + d.x * 1.5) + 0.5, y: Math.floor(p.position.y + 0.01), z: Math.floor(p.position.z + d.z * 1.5) + 0.5 };
    }
    if (a.putDown(spot)) this.d.m4.tools?.pushSwing('place');
    else this.hint(this.putDownWhy(spot));
  }

  /** おろせない 理由 の 合図。LIVE-2: いっぱい の 小屋（coopFull）・なかま 8 わ（friendFull）は A の 答え、なければ 小屋 の 中 の 数 を 見る。ほか は cantPutHere */
  private putDownWhy(spot: Vec3): AnimalHintKind {
    const a = this.d.m4.animals;
    const why = a?.putDownWhy?.();
    if (why) return why;
    const max = this.d.m4.live?.().coopMax ?? LIVE_SETTING_DEFAULTS.coopMax;
    const ix = Math.floor(spot.x);
    const iz = Math.floor(spot.z);
    for (const c of a?.coops?.() ?? []) {
      if (Math.abs(ix - c.x) <= 2 && Math.abs(iz - c.z) <= 2 && c.kids.length >= max) return 'coopFull';
    }
    return 'cantPutHere';
  }

  /** 0 あげる: A の 口 に 聞く。'ate' の とき だけ むし を 1 へらす（C の しごと） */
  private doFeed(): void {
    const a = this.d.m4.animals;
    const h = this.d.animalHit();
    const held = this.d.inventory.held();
    if (!a || !h || !held) return;
    const r = a.feed(h.id, held.item);
    if (r === 'ate' || r === 'harapan') this.d.inventory.consumeHeld();
    else if (r === 'full') this.hint('fullHint');
    else if (r === 'friendFull') this.hint('friendFull');
    else if (r === 'sleep') this.hint('sleepHint'); // LIVE-2: ねて いる 子 には あげられない（むし は へらない）
    if (r) this.d.m4.tools?.pushSwing('place');
  }

  /** 0 なでる。やせい を なでた とき は 合図 feedHint（むし を あげよう） */
  private doAnimalPet(): void {
    const h = this.d.animalHit();
    if (!this.d.m4.animals || !h) return;
    const r = this.d.m4.animals.pet(h.id);
    if (r === 'wild') this.hint('feedHint');
    if (r) this.d.m4.tools?.pushSwing('place');
  }

  /** 1a: こたつ に たまご を 入れる／まってね／たまご が いる／6 つ まで。答え は A（`useKit`）。'put' の とき だけ 持ち物 を 1 へらす（C の しごと） */
  doKit(t: TargetInfo | null): void {
    const a = this.d.m4.animals;
    if (!a || !t) return;
    const held = this.d.inventory.held()?.item ?? null;
    const r = a.useKit(t.block.x, t.block.y, t.block.z, held);
    if (r === 'put') {
      this.d.inventory.consumeHeld();
      this.d.m4.tools?.pushSwing('place');
    } else if (r === 'wait') this.hint('kitWait');
    else if (r === 'needEgg') this.hint('kitNeedEgg');
    else if (r === 'max') this.hint('kitMax');
  }

  /** 1b（LIVE-3）: えらべる 子 が いる 小屋 → とりごや の メニュー を ひらく */
  doCoopMenu(t: TargetInfo | null): void {
    const a = this.d.m4.animals;
    const c = t ? a?.coopAt(t.block.x, t.block.y, t.block.z) : null;
    if (!c) return;
    this.d.m4.coopMenu?.(c.id);
  }

  /** 1b: 小屋 の すばこ の たまご を あつめる（持ち物 に 入らない 分 は 足もと に おとす） */
  doCoopCollect(t: TargetInfo | null): void {
    const a = this.d.m4.animals;
    const c = t ? a?.coopAt(t.block.x, t.block.y, t.block.z) : null;
    if (!a || !c) return;
    // 持ち物 へ 入れる のは A（collectCoop。入らない 分 は すばこ に のこる）。ここ は 取った 知らせ だけ
    const r = a.collectCoop(c.id);
    for (const [item, n] of [['egg', r.egg], ['kin_tamago', r.gold]] as const) if (n > 0) this.d.m4.onPickup?.(item, n);
    this.d.m4.tools?.pushSwing('place');
  }

  /** 小屋 の もん は プレイヤー の 方（4 方向 の 近い 方）。0 北（-z）・1 東（+x）・2 南（+z）・3 西（-x） */
  private coopDir(cx: number, cz: number): 0 | 1 | 2 | 3 {
    const p = this.d.player().position;
    const dx = p.x - (cx + 0.5);
    const dz = p.z - (cz + 0.5);
    if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 1 : 3;
    return dz >= 0 ? 2 : 0;
  }

  /** 10a: toriya を 置く。入らない → coopNoRoom、3 つ → coopMax、置けたら toriya 1 へる */
  doCoopPlace(t: TargetInfo | null): void {
    const a = this.d.m4.animals;
    if (!a || !t) return;
    const { x, y, z } = t.place;
    const r = a.placeCoop(x, y, z, this.coopDir(x, z));
    if (r === 'noRoom') this.hint('coopNoRoom');
    else if (r === 'max') this.hint('coopMax');
    else {
      this.d.inventory.consumeHeld();
      this.d.m4.tools?.pushSwing('place');
      this.d.emit({ type: 'place', tick: this.d.tick(), block: { x, y, z }, id: 'toriya_fence' }); // 実績 place:toriya と 置く 音・つぶ（DigFx）の ため
    }
  }

  /** 小屋 の ブロック を ねらって いる ステップ ごと に A に 聞く。'locked' なら true（押した ステップ だけ firstPress） */
  coopLocked(t: TargetInfo, justPressed: boolean): boolean {
    const a = this.d.m4.animals;
    const c = a?.coopAt(t.block.x, t.block.y, t.block.z);
    if (!a || !c) return false;
    return a.breakCoop(c.id, justPressed) === 'locked';
  }

  /** 1a の ようす: ねらって いる の が こたつ か（たまご が 入って いる か） */
  kitState(): { occupied: boolean; full: boolean } | null {
    const a = this.d.m4.animals;
    const t = this.d.tgt();
    if (!a || !t || !isKotatsuBlock(t.id)) return null;
    const k = a.kitAt(t.block.x, t.block.y, t.block.z);
    const max = this.d.m4.live?.().kitEggMax ?? LIVE_SETTING_DEFAULTS.kitEggMax;
    return { occupied: k != null, full: k != null && (k.eggs?.length ?? 1) >= max };
  }

  /** 1b の ようす: ねらって いる の が 小屋 の ブロック か（すばこ の たまご の 数・LIVE-3: えらべる 子 が いる か） */
  coopState(): { eggs: number; menu: boolean } | null {
    const a = this.d.m4.animals;
    const t = this.d.tgt();
    if (!a || !t || !COOP_BLOCKS.has(t.id)) return null;
    const c = a.coopAt(t.block.x, t.block.y, t.block.z);
    if (!c) return null;
    // えらべる 子 の 一覧 は 1 ステップ に 1 回 だけ さがす（照準 の 下 の 表示 と 実行 で 同じ 答え）
    if (this.menuCache.tick !== this.d.tick() || this.menuCache.coop !== c.id) {
      this.menuCache = { tick: this.d.tick(), coop: c.id, menu: (a.meatList?.(c.id).length ?? 0) > 0 };
    }
    return { eggs: c.nest.egg + c.nest.gold, menu: this.menuCache.menu };
  }

  /** 置く 前 の すけた 小屋（toriya を 持って 地面 を ねらって いる とき だけ。毎フレーム 描く 側 が 読む） */
  coopGhost(): CoopPlacePreview | null {
    const a = this.d.m4.animals;
    const t = this.d.tgt();
    if (!a || !t || this.d.inventory.held()?.item !== 'toriya') return null;
    const { x, y, z } = t.place;
    return a.previewCoop(x, y, z, this.coopDir(x, z));
  }

  /** 10a の 答え: toriya を 持って 地面 を ねらって いる とき だけ */
  coopSpot(): 'ok' | 'noRoom' | 'max' | null {
    const a = this.d.m4.animals;
    const t = this.d.tgt();
    if (!a || !t || this.d.inventory.held()?.item !== 'toriya') return null;
    const max = this.d.m4.live?.().coopCountMax ?? LIVE_SETTING_DEFAULTS.coopCountMax;
    if (a.coops().length >= max) return 'max';
    const { x, y, z } = t.place;
    return a.previewCoop(x, y, z, this.coopDir(x, z)).ok ? 'ok' : 'noRoom';
  }

  /** 0: にわとり。押しつづけ の ステップ・A が 'null'（動き の とちゅう）は 'idle' */
  animalPreview(repeat: boolean): 'feed' | 'animalFull' | 'animalPet' | 'idle' | null {
    const a = this.d.m4.animals;
    const h = this.d.animalHit();
    if (!a || !h) return null;
    if (repeat) return 'idle';
    return a.preview(h.id, this.d.inventory.held()) ?? 'idle';
  }
}
