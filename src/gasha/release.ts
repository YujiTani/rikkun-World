/**
 * #293 リリース: がしゃどくろを ふだんの ゲーム（?proto なし）に 出す 係。
 *  ・ゲームの 1 日（あさ）ごとに くじを 引き（約 3 割）、当たると プレイヤーから 150〜250 ブロック先に 1 体だけ 出す。
 *    場所と 向きは gashaBig.ts の `place({ x, z, yawDeg })` に 直接 わたす（プレイヤーの 方を 向く）。
 *  ・たおす（体力 0。gashaBig.ts の onDefeated で 知らせが 来る）か、プレイヤーが 遠く（despawnDistance）へ はなれると
 *    gashaBig.ts の `despawn()` で 片づける（体・当たり・間欠泉・ゲージ・射線・エフェクト・音が ぜんぶ 消える）。次の 出番は また place() で 使いまわす。
 *  ・体力が 半分（1/2。調整表 girl.hpFraction）以下に なると 噴火を 出して 上を 向いた まま 固まる（BGM が ぶつっと 切れる）→ 少女（gashaGirl.ts）が 笑い声 → ワープで 飛びまわる → 決めポーズ → 魔法 5 回 →
 *    大きな 姿の かたに 座って 休む（なぐると 大ダメージ）→ また 魔法、を たおすまで くりかえす。大きな 姿は 固まった まま（登れる・なぐれる）。
 *    少女の しくみは 先に 読みこんで ねかせて おき、固まった しゅんかんに summon() する。
 *  ・とどめ（体力 0 の 一撃）: 少女は その場に 座りこんで 動かない（無敵）→ 大きな 姿が 倒れて 赤い コアが 出る → コアを たたく たびに アイテムが ばらまかれる（PSO ふう。
 *    1 回ごとに レア素材の 一部、レア度の 色の 光の 柱つき）→ コアを こわすと 実績を 記録して、足袋 ＋ レア素材の 大きな 一山 → 大きな 姿も 少女も ボロボロに くずれて 消える。宝箱は ない（オーナー 2026-10-24 15:19）。
 *  ・遠くは 世界が 読みこまれて いない ので、体の 高さは 読みこみ済みなら 世界の 地面（置いた ブロック込み）、未読みこみなら 地形から。地ならしは しない（浮いて 進む ので いらない。プレイヤーの 家・畑を 消さない）。
 * 数は ぜんぶ releaseTuning.ts。ゲームとの つなぎは ReleaseEnv（main.ts が 渡す）。
 */
import type { Object3D } from 'three';
import type { ItemId, ItemStack } from '../contracts';
import type { GashaBigDeps } from './gashaBig';
import { TUNE as BIG } from './gashaBigTuning';
import { rewardRng, rollReward } from './reward';
import { isNinjaGear } from '../craft/NinjaBook';
import { createRng, randInt } from '../world/gen/random';
import { applySilhouette, updateSilhouette } from './silhouette';
import { RELEASE } from './releaseTuning';
import { faceTowardYawDeg, horizontalDistance, pickSpawnSpot, rollMorning, shouldDespawn, type SpawnSpot } from './spawnRule';

/** 試作の 係（gashaBig.ts の GashaBigHandle）のうち、ここで 使う 口 */
export interface BossHandle {
  /** 作りなおして 指した 場所・向きに 置く（体力も もどる） */
  place(at: { x: number; z: number; yawDeg?: number }): void;
  /** 片づける（体・当たり・間欠泉・ゲージ・射線・エフェクト・音を 消し、毎コマの 更新も 止める） */
  despawn(): void;
  hp(): number;
  maxHp(): number;
  angry(on: boolean): void;
  walk(on: boolean): void;
  /** `pos: [x, y, z]`（体の 足もと） */
  info(): Record<string, unknown>;
  /** 部位に ダメージ(体力 0 に する とき に 使う。開発用 defeat()) */
  damage?(part: string, amount: number, at?: { x: number; y: number; z: number } | null, source?: string): number;
  /** とどめの あとの 様子(場面・コアの のこり) */
  finishInfo?(): { phase: string; coreHp: number; coreMax: number };
  /** 体力 1/2: 噴火を 必ず 出して 上を 向いた まま 固まる(固まった しゅんかんに onHeld) */
  finale?(): void;
  /** 固まって いるか */
  frozen?(): boolean;
  /** 少女が 座る 場所(大きな 姿の かたの 上) */
  perchSpot?(): { x: number; y: number; z: number; yawDeg: number } | null;
  /** 座っている 少女の 当たりの 箱を 足す / はずす */
  setGirlBox?(box: { name: string; c: ArrayLike<number>; ax: ArrayLike<number>; half: ArrayLike<number> } | null): void;
  /** 体の 3D の かたまり（place() の たびに 作りなおされる）。あれば 遠くで シルエットに 見える ように する */
  readonly group?: Object3D;
}

/** 試作の 係を 作る とき、ふだんの 入り口（deps）を すりかえる 関数 */
export type DepsWrap = (d: GashaBigDeps) => GashaBigDeps;

export interface ReleaseEnv {
  /** 世界の シード（日ごとの くじ・中身の 乱数の もと） */
  seed: number;
  /** あさの くじを 引いて よいか（?gasha=off・自動テストでは false）。開発用の spawn() は これに かかわらず 動く */
  enabled: boolean;
  player(): { x: number; y: number; z: number; yawDeg: number };
  /** 海・水の 上でないか（読みこんで いなくても 地形から 答える） */
  isLand(x: number, z: number): boolean;
  /** その 場所の 列が 読みこまれて いるか */
  isLoaded(x: number, z: number): boolean;
  /** 読みこんで いない 所の 地面の いちばん 上の ブロックの 高さ（地形から） */
  terrainTop(x: number, z: number): number;
  /** 読みこんだ 所の 地面の いちばん 上の ブロックの 高さ（プレイヤーが 置いた ブロック・家・畑も ふくむ。体を 出す 高さに 使う） */
  groundY(x: number, z: number): number;
  /** 試作の 係を 読みこんで 作る（初めの 1 回だけ。作る とき `at` に place() される）。wrap で 入り口を すりかえる */
  start(wrap: DepsWrap, at: { x: number; z: number; yawDeg?: number }): Promise<BossHandle>;
  /** 少女の 形態を 読みこんで 作る（初めの 1 回だけ）。ねかせて おき、summon() で はじまる。なければ 少女は 出ない */
  startGirl?(hooks: GirlHooks): Promise<GirlControl>;
  /** 落ちた アイテムとして ばらまく（DropField.scatter。1 回の 呼び出しが 1 つの 山 = 1 本の 光の 柱） */
  scatter(at: { x: number; y: number; z: number }, stacks: readonly ItemStack[], opts?: { speedMin?: number; speedMax?: number; upMin?: number; upMax?: number }): void;
  /** 実績の 記録（`defeat:gashadokuro`） */
  record(key: string): void;
  /** 画面の ログに 出す 一言 */
  say(text: string): void;
  /** がしゃどくろの BGM を 止める（少女が 出た 記録も けす） */
  bgmReset?(): void;
  sound?(name: 'ready' | 'levelUp'): void;
  /** 体力ゲージ（試作の 画面の 部品）を 出す / かくす。試作の ゲージは 作った 時から 出っぱなしなので、遠い 間・いない 間は かくす */
  showBar?(on: boolean): void;
  /** NINJA-1 §4.2: 忍者帳（手に 入れた ことの ある 忍者装備）と 今 持って いる 物（もちもの・防具の マス・手に もった 物）。くじの 材料。なければ どちらも 空 */
  ninja?(): { book: readonly ItemId[]; have: readonly ItemId[] };
  /** NINJA-1 §3.2: 忍者装備の 袋が 出た ことの 知らせ（上の 帯の テロップ用）。出どころは 'gasha' */
  dropped?(item: ItemId, from: 'gasha'): void;
}

/** 少女の 形態の 係（gashaGirlTypes.ts の GirlController） */
export interface GirlControl {
  /** 少女の 登場を はじめる（笑い声 → ワープで 飛びまわる → 決めポーズ → 5 回の 魔法 → 大きな 姿の かたに 座って 休む → また 魔法） */
  summon(): void;
  /** いまの 場面 */
  stage(): 'off' | 'laugh' | 'orbit' | 'pose' | 'girl' | 'perch' | 'down' | 'crumble';
  /** とどめ: その場に 座りこんで 動かなく なる(無敵。魔法・弾・当たりの 箱は ぜんぶ 消す) */
  finish(): void;
  /** コアが こわれた: ゆっくり ボロボロに 消えて いく */
  crumble(): void;
  /** 止めて かくす（エフェクト・BGM の 頼みも 消す） */
  dismiss(): void;
  active(): boolean;
}

/** 少女の 係が 知らせる 合図 */
export interface GirlHooks {
  /** 少女が 座る 場所(大きな 姿の かた) */
  perchSpot(): { x: number; y: number; z: number; yawDeg: number } | null;
  /** 座っている 少女の 当たりの 箱を 大きな 姿に 足す / はずす */
  setHitBox(box: { name: string; c: ArrayLike<number>; ax: ArrayLike<number>; half: ArrayLike<number> } | null): void;
}

export type ReleaseState = 'idle' | 'loading' | 'present' | 'defeated';
/**
 * big = 大きな 姿で たたかう / freeze = 体力 1/2 で 噴火して 固まる(まで) / laugh = 笑い声 / orbit = 少女が ワープで 飛びまわる / pose = 正面で 決めポーズ /
 * girl = 少女の 魔法(大きな 姿は 固まった まま) / perch = 少女が 大きな 姿の かたに 座って 休む(なぐると 大ダメージ) /
 * down = とどめの あと(倒れて 赤い コアを たたく) / crumble = コアを こわした あと くずれて 消える
 */
export type ReleaseForm = 'big' | 'freeze' | 'laugh' | 'orbit' | 'pose' | 'girl' | 'perch' | 'down' | 'crumble';

export interface SpawnOpts {
  /** プレイヤーからの 距離（ブロック）。なければ dev.distance */
  distance?: number;
  /** 向きの 角度（度。0 = +x（東）、90 = +z（南））。なければ プレイヤーの 正面 */
  angleDeg?: number;
}


export class GashaRelease {
  private st: ReleaseState = 'idle';
  private handle: BossHandle | null = null;
  private lastDay = -1;
  private checkClock = 0;
  private killCount = 0;
  private cancelLoad = false;
  /** とどめの 一撃を うけた(コアを こわして 消える まで) */
  private finishing = false;
  /** こわれて くずれて いる 間の のこり(秒。onVanished が 来なくても これで 片づける) */
  private vanishLeft = 0;
  private girl: GirlControl | null = null;
  private girlLoading = false;
  private girlFailed = false;
  private form: ReleaseForm = 'big';
  private bossPos: { x: number; y: number; z: number } | null = null;
  private clock = 0;

  constructor(readonly env: ReleaseEnv) {}

  state(): ReleaseState {
    return this.st;
  }

  // ---------------------------------------------------------------- 入り口のすりかえ（試作の 係に わたす）
  readonly wrap: DepsWrap = (d) => {
    return {
      ...d,
      noTabi: true, // 足袋は ごほうび なので はじめから 着せない
      // 体力 1/2 で 噴火して 固まった: 少女の 登場を はじめる
      onHeld: () => { d.onHeld?.(); this.onHeld(); },
      // 体力 0 の 一撃: 少女は 座りこむ(大きな 姿は 倒れる)。実績・ごほうびは コアを こわした とき
      onDefeated: () => { d.onDefeated?.(); this.killBlow(); },
      // コアを たたいた: アイテムを ばらまく / コアを こわした: 実績 ＋ 大きな 一山 / くずれて 消えた: 片づける
      onCoreHit: (e) => { d.onCoreHit?.(e); this.coreHit(e); },
      onCoreBroken: (e) => { d.onCoreBroken?.(e); this.coreBroken(e); },
      onVanished: () => { d.onVanished?.(); this.despawn(); },
      // 読みこんで いない 遠くは 地形の 高さ
      groundY: (x, z) => (this.env.isLoaded(x, z) ? d.groundY(x, z) : this.env.terrainTop(x, z)),
      // 出す 高さ: 読みこみ済みなら 世界の 地面（置いた ブロック込み）、未読みこみなら 地形から。地ならしは しない（浮いて 進む）
      placeGroundY: (x, z) => (this.env.isLoaded(x, z) ? this.env.groundY(x, z) : this.env.terrainTop(x, z)),
    };
  };

  // ---------------------------------------------------------------- 出す・しまう
  /** ゲームの 1 日の はじまり（あさ）。くじを 引いて、当たれば 出す */
  onMorning(day: number): void {
    if (!this.env.enabled || day === this.lastDay) return;
    this.lastDay = day;
    if (this.st !== 'idle') return; // 世界に 1 体だけ
    const roll = rollMorning(this.env.seed, day);
    if (!roll.appear) return;
    const spot = pickSpawnSpot(roll.rng, this.env.player(), (x, z) => this.env.isLand(x, z));
    if (spot) void this.spawnAt(spot);
  }

  /** 開発用: いま すぐ 出す。いる 時は 置きなおす。出せたら true */
  async spawn(opts: SpawnOpts = {}): Promise<boolean> {
    if (this.st === 'loading') return false;
    if (this.st !== 'idle') this.despawn();
    const p = this.env.player();
    const distance = opts.distance ?? RELEASE.dev.distance;
    const rad = opts.angleDeg === undefined ? null : (opts.angleDeg * Math.PI) / 180;
    const dx = rad === null ? Math.sin((p.yawDeg * Math.PI) / 180) : Math.cos(rad);
    const dz = rad === null ? -Math.cos((p.yawDeg * Math.PI) / 180) : Math.sin(rad);
    return this.spawnAt({ x: p.x + dx * distance, z: p.z + dz * distance, dx, dz, distance, angleDeg: (Math.atan2(dz, dx) * 180) / Math.PI });
  }

  private async spawnAt(spot: SpawnSpot): Promise<boolean> {
    if (this.st !== 'idle') return false;
    this.st = 'loading';
    this.cancelLoad = false;
    // プレイヤーの 方を 向いて 立つ
    const at = { x: spot.x, z: spot.z, yawDeg: faceTowardYawDeg(spot, this.env.player(), BIG.place.faceYawOffsetDeg) };
    try {
      if (this.handle) {
        this.handle.angry(false);
        this.handle.place(at);
      } else {
        this.handle = await this.env.start(this.wrap, at); // この 中で 最初の place() が 行われる
      }
    } catch {
      this.st = 'idle';
      return false;
    }
    this.form = 'big';
    this.finishing = false;
    this.dress();
    if (this.cancelLoad) { this.cancelLoad = false; this.st = 'present'; this.despawn(); return false; }
    this.st = 'present';
    this.checkClock = 0;
    this.readPos();
    this.applyBar();
    this.env.sound?.('ready');
    return true;
  }

  /** 体の 材料に 遠くの シルエットを かける（作りなおす たびに 新しい 材料なので かけなおす） */
  private dress(): void {
    updateSilhouette();
    const g = this.handle?.group;
    if (g) applySilhouette(g);
  }

  /** 消す（たおされた あとも 遠くはなれた ときも）。gashaBig.ts の despawn() で 体・当たり・間欠泉・ゲージ・射線・エフェクト・音を 片づける */
  despawn(): void {
    if (this.st === 'loading') { this.cancelLoad = true; return; }
    if (!this.handle || this.st === 'idle') { this.st = 'idle'; return; }
    this.endGirl();
    this.finishing = false;
    this.handle.despawn();
    this.bossPos = null;
    this.st = 'idle';
    this.applyBar();
    this.env.bgmReset?.(); // 少女が 出た 記録も けして、ふだんの BGM に もどす
  }

  /** ゲージは いる 間の 近くだけ。ゲージの 部品は place() の たびに 作り直される ので そのつど かけなおす */
  private applyBar(): void {
    const near = (this.st === 'present' || this.st === 'defeated') && this.bossPos !== null && horizontalDistance(this.env.player(), this.bossPos) <= RELEASE.spawn.barShowDistance;
    this.env.showBar?.(near);
  }

  private readPos(): void {
    const pos = this.handle?.info().pos;
    if (Array.isArray(pos) && pos.length === 3) this.bossPos = { x: Number(pos[0]), y: Number(pos[1]), z: Number(pos[2]) };
  }

  // ---------------------------------------------------------------- 少女への きりかえ
  /** 少女を 止めて かくす（たおした・消える とき）。大きな 姿に 戻した 状態にして おく */
  private endGirl(): void {
    this.girl?.dismiss();
    this.form = 'big';
  }

  /** 体力を 見て、少しずつ 少女を 読みこみ、1/2 以下で 大きな 姿を かくして 少女を 出す */
  private stepGirl(): void {
    const h = this.handle;
    if (!h || this.form !== 'big' || !this.env.startGirl || !h.finale) return;
    const hp = h.hp(), max = h.maxHp();
    if (!(max > 0) || hp <= 0) return;
    const G = RELEASE.girl;
    if (!this.girl && !this.girlLoading && !this.girlFailed && hp <= max * G.loadHpFraction) {
      this.girlLoading = true;
      this.env.startGirl({
        perchSpot: () => this.handle?.perchSpot?.() ?? null,
        setHitBox: (b) => this.handle?.setGirlBox?.(b),
      }).then((g) => { this.girl = g; }, () => { this.girlFailed = true; /* 読めなければ 大きな 姿だけで たたかう */ }).finally(() => { this.girlLoading = false; });
    }
    if (this.girl && hp <= max * G.hpFraction) {
      h.finale();
      this.form = 'freeze';
    }
  }

  /** 固まった しゅんかん(gashaBig.ts から)。BGM は もう 切れて いる。少女の 登場を はじめる */
  private onHeld(): void {
    if (this.st !== 'present' || this.form !== 'freeze') return;
    this.girl?.summon();
  }

  /** いまの 形態(固まった あとは 少女の 場面に したがう) */
  private formNow(): ReleaseForm {
    if (this.finishing) {
      const ph = this.handle?.finishInfo?.().phase;
      return ph === 'crumble' || ph === 'gone' ? 'crumble' : 'down';
    }
    if (this.form !== 'freeze' || !this.girl || !this.girl.active()) return this.form;
    const g = this.girl.stage();
    return g === 'laugh' || g === 'orbit' || g === 'pose' || g === 'perch' ? g : 'girl';
  }

  // ---------------------------------------------------------------- とどめ → コア → ごほうび
  /** たおした ことに する(開発用。体力を 0 に する → 本物と おなじ とどめの 流れ)。体の 口が 無ければ すぐ とどめの 流れへ */
  defeat(): void {
    if (this.st !== 'present' || this.finishing) return;
    if (this.handle?.damage) this.handle.damage('girl', 1e9); // 少女の 間は 体が ダメージ 0 なので「少女」の 部位で 体力を 0 に する
    else this.killBlow();
  }

  /** 体力 0 の 一撃(gashaBig.ts から)。少女は 座りこむ。BGM は ここで 止める */
  private killBlow(): void {
    if (this.st !== 'present' || this.finishing) return;
    this.finishing = true;
    this.girl?.finish();
    this.env.bgmReset?.();
    // ここで angry(false) は 呼ばない（体は gashaBig.ts の startFinish() で lock() 済み。怒り解除で ふだんの 動きに もどさない）
  }

  /** 1 回の 一撃で ばらまく もの: レア素材の 行ごとに(最小〜最大 × hitScale、最低 1)1 つの 山。山ごとに 光の 柱 */
  private hitStacks(n: number): ItemStack[] {
    const C = RELEASE.core;
    const rng = createRng(Math.imul(this.env.seed | 0, 0x9e3779b1) ^ Math.imul(this.killCount + 1, 0x85ebca6b) ^ Math.imul(n, 0xc2b2ae35) ^ RELEASE.reward.seedSalt);
    return RELEASE.reward.rare.map((row) => ({ item: row.item, count: Math.max(1, Math.round(randInt(rng, row.min, Math.max(row.min, row.max)) * C.hitScale)) }));
  }

  private scatterStacks(at: { x: number; y: number; z: number }, stacks: readonly ItemStack[]): void {
    const C = RELEASE.core;
    for (const st of stacks) this.env.scatter(at, [st], { speedMin: C.scatterSpeed[0], speedMax: C.scatterSpeed[1], upMin: C.scatterUp[0], upMax: C.scatterUp[1] });
  }

  private coreHit(e: { x: number; y: number; z: number; n: number; left: number }): void {
    if (this.st !== 'present') return;
    this.scatterStacks({ x: e.x, y: e.y + RELEASE.core.dropUp, z: e.z }, this.hitStacks(e.n));
    this.env.sound?.('levelUp');
  }

  /** コアを こわした: 実績 → 大きな 一山(忍者装備 1 つ ＋ レア素材) → 少女も くずれる */
  private coreBroken(e: { x: number; y: number; z: number }): void {
    if (this.st !== 'present') return;
    this.readPos();
    this.st = 'defeated';
    this.vanishLeft = BIG.finish.crumble.sec + RELEASE.defeat.safetyExtraSec;
    this.killCount++;
    this.env.record('defeat:gashadokuro');
    this.env.say('がしゃどくろ を たおした！');
    const stacks = rollReward(rewardRng(this.env.seed, this.killCount), RELEASE.reward, this.env.ninja?.() ?? { book: [], have: [] });
    this.scatterStacks({ x: e.x, y: e.y + RELEASE.core.dropUp, z: e.z }, stacks);
    for (const st of stacks) if (isNinjaGear(st.item)) this.env.dropped?.(st.item, 'gasha');
    this.env.sound?.('ready');
    this.girl?.crumble();
  }

  // ---------------------------------------------------------------- 保存（たおした 回数だけ。ボス本体は 保存しない。宝箱は なくなった）
  serialize(): { v: 2; kills: number } {
    return { v: 2, kills: this.killCount };
  }

  /** 保存から もどす。古い 保存(v1: 宝箱の 一覧)は 宝箱が なくなった ので 中身は むし。こわれた データも むし */
  deserialize(data: unknown): void {
    const k = (data as { kills?: unknown } | null)?.kills;
    this.killCount = typeof k === 'number' && Number.isFinite(k) && k >= 0 ? Math.floor(k) : 0;
  }

  // ---------------------------------------------------------------- 毎コマ
  /** 固定ステップ（1/60 秒）ごとに 呼ぶ */
  step(dt: number): void {
    this.clock += dt;
    if (this.st === 'present' || this.st === 'defeated') updateSilhouette();
    if (this.st === 'present') {
      if (this.handle && this.handle.hp() <= 0 && !this.finishing) this.killBlow();
      this.stepGirl();
      this.checkClock += dt;
      if (this.checkClock >= RELEASE.spawn.checkEverySec) {
        this.checkClock = 0;
        this.readPos();
        if (this.bossPos && shouldDespawn(horizontalDistance(this.env.player(), this.bossPos))) this.despawn();
        else this.applyBar();
      }
    } else if (this.st === 'defeated') {
      this.vanishLeft -= dt;
      if (this.vanishLeft <= 0) this.despawn(); // くずれて 消える 合図が 来なくても 片づける
    }
  }

  // ---------------------------------------------------------------- 見る（テスト・開発用）
  info(): { state: ReleaseState; form: ReleaseForm; pos: { x: number; y: number; z: number } | null; distance: number | null; lastDay: number; kills: number } {
    const pos = this.bossPos;
    return {
      state: this.st,
      form: this.formNow(),
      pos: pos ? { ...pos } : null,
      distance: pos ? horizontalDistance(this.env.player(), pos) : null,
      lastDay: this.lastDay,
      kills: this.killCount,
    };
  }
}

export function createGashaRelease(env: ReleaseEnv): GashaRelease {
  return new GashaRelease(env);
}

/** `window.__rikkun.gasha`（開発・テスト用の 窓口） */
export interface GashaHook {
  state(): ReleaseState;
  info: GashaRelease['info'];
  /** すぐ 出す（`{ distance, angleDeg }`）。いる 時は 置きなおす */
  spawn(opts?: SpawnOpts): Promise<boolean>;
  despawn(): void;
  /** たおした ことに する（体力を 0 に して とどめの 流れ。コアを こわすと 実績・ごほうび） */
  defeat(): void;
  /** あさの くじを 引く（day を 省くと 次の 日） */
  morning(day?: number): void;
  /** 調整表（その場で 上書き できる）: 出方・ごほうび = RELEASE、大きな 姿の 戦い = BIG */
  tune: typeof RELEASE;
  bigTune: typeof BIG;
}

export function gashaHook(rel: GashaRelease): GashaHook {
  return {
    state: () => rel.state(),
    info: () => rel.info(),
    spawn: (o) => rel.spawn(o),
    despawn: () => rel.despawn(),
    defeat: () => rel.defeat(),
    morning: (day) => rel.onMorning(day ?? rel.info().lastDay + 1),
    tune: RELEASE,
    bigTune: BIG,
  };
}
