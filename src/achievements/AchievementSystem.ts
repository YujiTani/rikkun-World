import type {
  AchievementDef,
  AchievementId,
  AchievementModalPort,
  AchievementShow,
  AchievementShowSource,
  CelebrateBusyPort,
  CombatEvent,
  CraftEvent,
  DayPhase,
  DefeatWith,
  DigEvent,
  AnimalEvent,
  FarmEvent,
  ItemId,
  M6Settings,
  ScreenMode,
  StorageEvent,
  Vec3,
  WorldRegions,
  YokaiKind,
} from '../contracts';
import { CROP_KINDS } from '../contracts';
import {
  ACHIEVEMENT_DEFS,
  ARMOR_ITEMS,
  ARMOR_RECIPES,
  CRAFT_RECIPE_NAMES,
  DEFS_BY_STAT,
  DEF_BY_ID,
  DEF_INDEX,
  MEDAL_RANK,
  PICKAXE_RECIPES,
  VISIT_PLACES,
  WEAPON_RECIPES,
} from './defs';

/** 記録の上限（§5） */
export const STAT_CAP = 2_000_000_000;
/** うみ: みず の中にいて 中心から この きょり以上（§4.2 J） */
export const SEA_MIN_DIST = 60;
/** ちょうじょう: 頂上の列から 横にこの きょり以内（§4.2 J） */
export const PEAK_RADIUS = 3;

export type AchSettings = Pick<
  M6Settings,
  | 'achieveSmallBatch'
  | 'achieveSmallMaxWait'
  | 'achieveCooldown'
  | 'achieveCooldownEarly'
  | 'achieveEarlyTicks'
  | 'achieveCalmHurtTicks'
  | 'achieveCalmYokaiDist'
  | 'achieveCalmMaxWait'
  | 'achieveLowHp'
  | 'achieveModalRows'
  | 'achieveChainTicks'
  | 'achieveChainCount'
>;

export type AchievementEvent =
  | { type: 'unlock'; tick: number; id: AchievementId; silent: boolean }
  | { type: 'modalOpen'; tick: number; ids: AchievementId[] }
  | { type: 'modalClose'; tick: number; ids: AchievementId[] };

/** 毎ステップ つなぎ込みが わたす 今の状態 */
export interface StepContext {
  tick: number;
  /** time.day() */
  day: number;
  mode: ScreenMode;
  /** この更新が 画面ステップで いくつ分か（あそぶ 1、もちもの 1/timeScale = 4、止まっているとき 0） */
  screenSteps: number;
  position: Vec3;
  velocityY: number;
  onGround: boolean;
  inWater: boolean;
  /** やられた画面のあいだ */
  dead: boolean;
  /** 妖怪の位置（しずか判定用） */
  yokai: ReadonlyArray<{ position: Vec3; state?: string }>;
  level: number;
  /** そうび: [head, body, arms, legs] */
  armor: ReadonlyArray<ItemId | null>;
  regions: WorldRegions | null;
}

export interface DefeatInfo {
  kind: YokaiKind;
  tick: number;
  with: DefeatWith;
  /** たおした ステップの プレイヤーの体力 */
  hp: number;
}

export interface AchievementRow {
  id: AchievementId;
  series: string;
  category: AchievementDef['category'];
  tier: number;
  goal: number;
  medal: AchievementDef['medal'];
  small: boolean;
  name: string;
  unlocked: boolean;
  day: number | null;
  seen: boolean;
}

const LOG_MAX = 512;

export class AchievementSystem implements AchievementShowSource {
  private stats_: Record<string, number> = {};
  private walkAcc = 0;
  private unlocked = new Map<AchievementId, number>();
  private seen = new Set<AchievementId>();
  /** じっせき ページで 見た */
  private viewed = new Set<AchievementId>();
  private pending: AchievementId[] = [];
  private log: AchievementEvent[] = [];
  private batch: AchievementId[] = [];
  private unlockListeners: Array<(def: AchievementDef, silent: boolean) => void> = [];

  private now = 0;
  private tickNow = 0;
  private dayNow = 0;
  private version_ = 0;
  private lastCloseAt: number | null = null;
  private lastHurtAt = -1e12;
  /** WEAPON-6: 今の 3 段で 当たった 段（ビット 1・2・4） */
  private comboHit = 0;
  private oldestSmallAt: number | null = null;
  private cond1Since: number | null = null;
  private calm = true;
  private deadNow = false;
  private modeNow: ScreenMode = 'play';
  private defeatTicks: number[] = [];
  private lastPos: Vec3 | null = null;
  private prevOnGround = true;

  private modal: AchievementModalPort | null = null;
  private busy: CelebrateBusyPort | null = null;

  constructor(private readonly settings: () => AchSettings) {}

  // ------------------------------------------------------------ 取りつけ

  /** B の おめでとう画面の口・演出が出ているかの口をつなぐ */
  attach(modal: AchievementModalPort, busy: CelebrateBusyPort): void {
    this.modal = modal;
    this.busy = busy;
    modal.onClosed((shown) => this.onClosed(shown));
  }

  onUnlock(fn: (def: AchievementDef, silent: boolean) => void): void {
    this.unlockListeners.push(fn);
  }

  /** 画面（じっせき ページ）が 作り直しの目印に使う */
  version(): number {
    return this.version_;
  }

  // ------------------------------------------------------------ 読む

  defs(): readonly AchievementDef[] {
    return ACHIEVEMENT_DEFS;
  }

  stats(): Record<string, number> {
    return { ...this.stats_ };
  }

  stat(key: string): number {
    return this.stats_[key] ?? 0;
  }

  list(): AchievementRow[] {
    return ACHIEVEMENT_DEFS.map((d) => ({
      id: d.id,
      series: d.series,
      category: d.category,
      tier: d.tier,
      goal: d.goal,
      medal: d.medal,
      small: d.small,
      name: d.name,
      unlocked: this.unlocked.has(d.id),
      day: this.unlocked.get(d.id) ?? null,
      seen: this.seen.has(d.id),
    }));
  }

  isUnlocked(id: AchievementId): boolean {
    return this.unlocked.has(id);
  }
  dayOf(id: AchievementId): number | null {
    return this.unlocked.get(id) ?? null;
  }
  isViewed(id: AchievementId): boolean {
    return this.viewed.has(id);
  }
  unlockedCount(): number {
    return this.unlocked.size;
  }
  pendingIds(): AchievementId[] {
    return [...this.pending];
  }

  /** 呼ぶと空になる */
  events(): AchievementEvent[] {
    const e = this.log;
    this.log = [];
    return e;
  }

  // ------------------------------------------------------------ 準備用

  record(key: string, n = 1, silent = false): void {
    this.run(() => {
      if (key === 'level') this.setMax('level', n, silent);
      else this.bump(key, n, silent);
    });
  }

  reset(): void {
    this.stats_ = {};
    this.walkAcc = 0;
    this.unlocked.clear();
    this.seen.clear();
    this.viewed.clear();
    this.pending = [];
    this.batch = [];
    this.lastCloseAt = null;
    this.oldestSmallAt = null;
    this.cond1Since = null;
    this.defeatTicks = [];
    this.version_++;
  }

  /** 見せていない列があれば 待ち時間・しずか を無視して 今 出す */
  flush(): AchievementShow | null {
    const show = this.buildShow();
    if (!show) return null;
    if (this.modal && !this.modal.isOpen() && this.modal.open(show)) this.log_({ type: 'modalOpen', tick: this.tickNow, ids: [...show.ids] });
    return show;
  }

  // ------------------------------------------------------------ 出来事を聞く

  feedDig(events: readonly DigEvent[]): void {
    if (events.length === 0) return;
    this.run(() => {
      for (const e of events) {
        if (e.type === 'break') {
          this.bump(`break:${e.id}`, 1);
          this.bump('break:*', 1);
        } else if (e.type === 'place') {
          this.bump(`place:${e.id}`, 1);
          this.bump('place:*', 1);
        }
      }
    });
  }

  feedCraft(events: readonly CraftEvent[]): void {
    if (events.length === 0) return;
    this.run(() => {
      for (const e of events) {
        if (e.type === 'craft') {
          this.bump(`craft:${e.recipe}`, 1);
          this.bump('craft:*', 1);
          if (e.recipe === 'ya') this.bump('craftItems:ya', e.count);
          this.derivedCraft();
        } else if (e.type === 'bakeDone') {
          this.bump(`bake:${e.recipe}`, 1);
          this.bump('bake:*', 1);
        } else if (e.type === 'pickup') {
          this.bump(`obtain:${e.item}`, e.count);
          this.bump('pickup:*', e.count);
        }
      }
    });
  }

  feedCombat(events: readonly CombatEvent[]): void {
    if (events.length === 0) return;
    this.run(() => {
      for (const e of events) {
        if (e.type === 'playerHit') {
          this.lastHurtAt = this.now;
          if (e.blocked) this.bump('guard', 1);
        } else if (e.type === 'fallHurt') {
          this.lastHurtAt = this.now;
        } else if (e.type === 'death') {
          this.bump('death', 1);
        } else if (e.type === 'pickup') {
          this.bump('bagBack', 1);
        }
      }
    });
  }

  feedDefeat(d: DefeatInfo): void {
    this.run(() => {
      this.bump(`defeat:${d.kind}`, 1);
      this.bump('defeat:*', 1);
      this.bump(`defeatWith:${d.with}`, 1);
      const s = this.settings();
      if (d.hp >= 1 && d.hp <= s.achieveLowHp) this.bump('defeatLow', 1);
      const t = this.defeatTicks;
      t.push(d.tick);
      while (t.length > 0 && d.tick - t[0] > s.achieveChainTicks) t.shift();
      if (t.length >= s.achieveChainCount) {
        t.length = 0;
        this.bump('chain', 1);
      }
    });
  }

  feedStorage(events: readonly StorageEvent[]): void {
    if (events.length === 0) return;
    this.run(() => {
      for (const e of events) {
        if (e.type === 'drop') this.bump('drop:*', e.count);
        else if (e.type === 'store') this.bump('store:*', e.count);
        else this.bump('storeFull', 1);
      }
    });
  }

  /** 農業の出来事（M7 §4.7）。つなぎ込みが `farm.drainEvents()` の列を わたす */
  feedFarm(events: readonly FarmEvent[]): void {
    if (events.length === 0) return;
    this.run(() => {
      for (const e of events) {
        switch (e.type) {
          case 'till':
            this.bump('till', 1);
            break;
          case 'plant':
            this.bump(`plant:${e.kind}`, 1);
            this.bump('plant:*', 1);
            break;
          case 'harvest':
            this.bump(`harvest:${e.kind}`, 1);
            this.bump('harvest:*', 1);
            if (e.wet) this.bump('harvestWet', 1);
            // M7-2: ごきげん の 作物（A が `happy` を 入れる。契約 の 型に 無い 間 は 読み取り だけ）
            if (e.happy) this.bump('harvestPet', 1);
            this.setMax('harvest:kinds', CROP_KINDS.filter((k) => this.stat(`harvest:${k}`) > 0).length);
            break;
          case 'wild':
            this.bump(`wild:${e.kind}`, 1);
            this.bump('wild:*', 1);
            this.setMax('wild:kinds', CROP_KINDS.filter((k) => this.stat(`wild:${k}`) > 0).length);
            this.derivedFind();
            break;
          case 'eat':
            this.bump(`eat:${e.item}`, 1);
            // LIVE-1 §4.5: `eat:*` は やさい だけ（たまご では ふやさない）
            if (e.item !== 'egg') this.bump('eat:*', 1);
            break;
          case 'seedFound':
            this.bump(`seedFrom:${e.from}`, 1);
            this.derivedFind();
            break;
          case 'visitOldFarm':
            this.bump('visit:oldfarm', 1);
            break;
          case 'pour':
            // はたけ 0 の まく は 数えない
            if (e.tiles > 0) this.bump('water:*', 1);
            break;
          case 'bucketPlace':
            this.bump('bucketPlace', 1);
            break;
          case 'pet':
            // ごきげん に した 回数（'again'・'wild' は 数えない）
            if (e.result === 'happy') this.bump('pet:*', 1);
            break;
          default:
            break;
        }
      }
    });
  }

  /**
   * LIVE-1 畜産の出来事（§4.5）。つなぎ込みが `animals.events()` の列を わたす。
   * feed = やさい を たべた、friend = なかま に なった、pet = なかま を なでた（やせい は 数えない）、egg = たまご を おとした
   */
  feedAnimals(events: readonly AnimalEvent[]): void {
    if (events.length === 0) return;
    this.run(() => {
      for (const e of events) {
        switch (e.type) {
          case 'feed':
            this.bump('feed:chicken', 1);
            this.bump('feed:*', 1);
            break;
          case 'friend':
            this.bump('friend:chicken', 1);
            this.bump('friend:*', 1);
            break;
          case 'pet':
            if (e.friend) {
              this.bump('petAnimal:chicken', 1);
              this.bump('petAnimal:*', 1);
            }
            break;
          case 'egg':
            this.bump('egg:chicken', 1);
            this.bump('egg:*', 1);
            break;
          default:
            break;
        }
      }
    });
  }

  /** たね の ありか 4 つ（ふるい たんす・やせい・くさ・ようかい） */
  private derivedFind(): void {
    const n = [this.stat('seedFrom:oldfarm'), this.stat('wild:*'), this.stat('seedFrom:grass'), this.stat('seedFrom:yokai')].filter((v) => v > 0).length;
    this.setMax('seedFrom:all', n);
  }

  /** WEAPON-2: たいきゅうの 出来事（持ち物と 防具の 2 本をまとめて わたす）。こわれた: マス番号 = 道具、部位 = 防具 */
  feedWear(events: ReadonlyArray<{ type: 'wearLow' | 'toolBreak'; slot: number | string }>): void {
    if (events.length === 0) return;
    this.run(() => {
      for (const e of events) {
        if (e.type !== 'toolBreak') continue;
        this.bump(typeof e.slot === 'number' ? 'toolBroken' : 'armorBroken', 1);
      }
    });
  }

  /** WEAPON-6: 刀の 出来事。1 回の 3 段で 1・2・3 段目が どれも 当たったら `bladeCombo3` */
  feedBlade(events: ReadonlyArray<{ type: string; step?: number }>): void {
    if (events.length === 0) return;
    this.run(() => {
      for (const e of events) {
        if (e.type === 'techStart') {
          if (e.step === 1 || e.step === undefined) this.comboHit = 0;
        } else if (e.type === 'techHit' && e.step && e.step >= 1 && e.step <= 3) {
          this.comboHit |= 1 << (e.step - 1);
          if (this.comboHit === 7) {
            this.comboHit = 0;
            this.bump('bladeCombo3', 1);
          }
        }
      }
    });
  }

  /** WEAPON-2: たいきゅうが 実際に n へった（`WearResult.worn`。道具・防具の 合計 `wearTotal`） */
  feedWorn(n: number): void {
    if (!(n > 0)) return;
    this.run(() => this.bump('wearTotal', n));
  }

  feedArrow(kind: 'shot' | 'hit'): void {
    this.run(() => this.bump(kind === 'shot' ? 'arrowShot' : 'arrowHit', 1));
  }

  /** 「もちもの が いっぱい」の合図が出た */
  feedFull(): void {
    this.run(() => this.bump('full', 1));
  }

  feedPhase(phase: DayPhase): void {
    this.run(() => {
      if (phase === 'night') this.bump('night', 1);
      else if (phase === 'day') this.bump('morning', 1);
    });
  }

  // ------------------------------------------------------------ 毎ステップ

  update(ctx: StepContext): void {
    this.run(() => {
      this.tickNow = ctx.tick;
      this.dayNow = ctx.day;
      this.modeNow = ctx.mode;
      this.deadNow = ctx.dead;
      const counting = ctx.mode === 'play' || ctx.mode === 'inventory';
      const steps = counting ? Math.max(0, ctx.screenSteps) : 0;
      if (steps > 0) {
        this.now += steps;
        this.bump('playTicks', steps);
      }
      this.sampleBody(ctx);
      this.sampleState(ctx, false);
      this.sampleCalm(ctx);
      this.updateCond1();
      if (counting && this.modal && !this.modal.isOpen()) {
        const show = this.nextShow();
        if (show && this.modal.open(show)) this.log_({ type: 'modalOpen', tick: this.tickNow, ids: [...show.ids] });
      }
    });
  }

  /** ロードした直後: 今の状態で決まるもの（レベル・防具）を しずかに取る */
  syncSilently(ctx: Pick<StepContext, 'level' | 'armor'>): void {
    this.run(() => this.sampleState(ctx, true));
  }

  // ------------------------------------------------------------ おめでとう画面に出すきまり

  nextShow(): AchievementShow | null {
    if (this.pending.length === 0 || this.deadNow) return null;
    if (this.modeNow !== 'play' && this.modeNow !== 'inventory') return null;
    if (!this.cond1()) return null;
    const s = this.settings();
    const cd = this.stat('playTicks') < s.achieveEarlyTicks ? s.achieveCooldownEarly : s.achieveCooldown;
    if (this.lastCloseAt !== null && this.now - this.lastCloseAt < cd) return null;
    const forced = this.cond1Since !== null && this.now - this.cond1Since >= s.achieveCalmMaxWait;
    if (!this.calm && !forced) return null;
    return this.buildShow();
  }

  pendingCount(): number {
    return this.pending.length;
  }

  isFirstMade(kind: 'craft' | 'bake', recipe: string): boolean {
    return this.stat(`${kind}:${recipe}`) === 0;
  }

  // ------------------------------------------------------------ 保存

  serialize(): unknown {
    const unlocked: Record<string, number> = {};
    for (const [k, v] of this.unlocked) unlocked[k] = v;
    return {
      v: 1,
      stats: { ...this.stats_ },
      walk: this.walkAcc,
      unlocked,
      seen: [...this.seen],
      viewed: [...this.viewed],
      pending: [...this.pending],
    };
  }

  deserialize(data: unknown): void {
    this.reset();
    this.now = 0;
    this.lastHurtAt = -1e12;
    this.lastPos = null;
    if (!data || typeof data !== 'object') return;
    const d = data as Record<string, unknown>;
    const stats = d.stats as Record<string, unknown> | undefined;
    if (stats && typeof stats === 'object') {
      for (const [k, v] of Object.entries(stats)) {
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) this.stats_[k] = Math.min(STAT_CAP, v);
      }
    }
    if (typeof d.walk === 'number' && Number.isFinite(d.walk) && d.walk >= 0) this.walkAcc = d.walk;
    else this.walkAcc = this.stat('walk');
    const un = d.unlocked as Record<string, unknown> | undefined;
    if (un && typeof un === 'object') {
      for (const [k, v] of Object.entries(un)) if (DEF_BY_ID.has(k)) this.unlocked.set(k, typeof v === 'number' ? v : 0);
    }
    const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string' && this.unlocked.has(i)) : []);
    for (const i of ids(d.seen)) this.seen.add(i);
    for (const i of ids(d.viewed)) this.viewed.add(i);
    for (const i of ids(d.pending)) if (!this.seen.has(i) && !this.pending.includes(i)) this.pending.push(i);
    this.oldestSmallAt = this.pending.some((i) => DEF_BY_ID.get(i)?.small) ? 0 : null;
    this.version_++;
  }

  // ------------------------------------------------------------ 中のしくみ

  private run(fn: () => void): void {
    fn();
    this.endBatch();
  }

  private log_(e: AchievementEvent): void {
    this.log.push(e);
    if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
  }

  private bump(key: string, n: number, silent = false): void {
    if (!(n > 0)) return;
    if (key === 'walk') this.walkAcc = Math.min(STAT_CAP, this.walkAcc + n);
    const next = key === 'walk' ? Math.floor(this.walkAcc) : Math.min(STAT_CAP, (this.stats_[key] ?? 0) + n);
    this.setStat(key, next, silent);
  }

  private setMax(key: string, v: number, silent = false): void {
    if (v > (this.stats_[key] ?? 0)) this.setStat(key, Math.min(STAT_CAP, v), silent);
  }

  private setStat(key: string, v: number, silent: boolean): void {
    if (this.stats_[key] === v) return;
    this.stats_[key] = v;
    const defs = DEFS_BY_STAT.get(key);
    if (!defs) return;
    for (const d of defs) {
      if (v < d.goal) break;
      if (!this.unlocked.has(d.id)) this.unlock(d, silent);
    }
  }

  private unlock(d: AchievementDef, silent: boolean): void {
    this.unlocked.set(d.id, this.dayNow);
    this.log_({ type: 'unlock', tick: this.tickNow, id: d.id, silent });
    this.version_++;
    if (silent) {
      this.seen.add(d.id);
      this.viewed.add(d.id);
    } else {
      this.batch.push(d.id);
    }
    for (const fn of this.unlockListeners) fn(d, silent);
  }

  /** 同じステップで取ったものは 表の順で 列に入れる */
  private endBatch(): void {
    if (this.batch.length === 0) return;
    this.batch.sort((a, b) => (DEF_INDEX.get(a) ?? 0) - (DEF_INDEX.get(b) ?? 0));
    for (const id of this.batch) {
      this.pending.push(id);
      if (DEF_BY_ID.get(id)?.small && this.oldestSmallAt === null) this.oldestSmallAt = this.now;
    }
    this.batch = [];
  }

  private derivedCraft(): void {
    const count = (ids: readonly string[]): number => ids.filter((r) => this.stat(`craft:${r}`) > 0).length;
    this.setMax('craft:pickaxes', count(PICKAXE_RECIPES));
    this.setMax('craft:weapons', count(WEAPON_RECIPES));
    this.setMax('craft:armors', count(ARMOR_RECIPES));
    this.setMax('craft:everything', count(CRAFT_RECIPE_NAMES.map(([id]) => id)));
  }

  private sampleBody(ctx: StepContext): void {
    const p = ctx.position;
    const last = this.lastPos;
    if (last) {
      const d = Math.hypot(p.x - last.x, p.z - last.z);
      if (d > 0 && d <= 1 && !ctx.dead) this.bump('walk', d);
      last.x = p.x;
      last.y = p.y;
      last.z = p.z;
    } else {
      this.lastPos = { x: p.x, y: p.y, z: p.z };
    }
    if (this.prevOnGround && !ctx.onGround && ctx.velocityY > 0) this.bump('jump', 1);
    this.prevOnGround = ctx.onGround;
    if (ctx.regions) this.sampleVisits(ctx.regions, p, ctx.inWater);
  }

  private visit(name: string): void {
    this.bump(`visit:${name}`, 1);
    let n = 0;
    for (const v of VISIT_PLACES) if (this.stat(`visit:${v}`) > 0) n++;
    this.setMax('visit:all', n);
  }

  private sampleVisits(r: WorldRegions, p: Vec3, inWater: boolean): void {
    const inCircle = (c: { cx: number; cz: number; r: number }): boolean => (p.x - c.cx) ** 2 + (p.z - c.cz) ** 2 <= c.r * c.r;
    const inRect = (c: { x0: number; z0: number; x1: number; z1: number }): boolean =>
      p.x >= Math.min(c.x0, c.x1) && p.x <= Math.max(c.x0, c.x1) && p.z >= Math.min(c.z0, c.z1) && p.z <= Math.max(c.z0, c.z1);
    const need = (n: string): boolean => this.stat(`visit:${n}`) === 0;
    if (need('mountain') && inCircle(r.mountain)) this.visit('mountain');
    if (need('forest') && inCircle(r.forest)) this.visit('forest');
    if (need('meadow') && inCircle(r.meadow)) this.visit('meadow');
    if (need('spring') && inCircle(r.spring)) this.visit('spring');
    if (need('pond') && inCircle(r.pond)) this.visit('pond');
    if (need('flat') && inRect(r.flat)) this.visit('flat');
    if (need('river') && r.river.some(inRect)) this.visit('river');
    if (need('sea') && inWater && Math.hypot(p.x - r.center.x, p.z - r.center.z) >= SEA_MIN_DIST) this.visit('sea');
    if (need('peak') && Math.hypot(p.x - r.mountain.peak.x, p.z - r.mountain.peak.z) <= PEAK_RADIUS && p.y >= r.mountain.peak.h) this.visit('peak');
  }

  private sampleState(ctx: Pick<StepContext, 'level' | 'armor'>, silent: boolean): void {
    this.setMax('level', ctx.level, silent);
    let all = ctx.armor.length >= ARMOR_ITEMS.length;
    for (const a of ctx.armor) {
      if (a) {
        if (this.stat(`wear:${a}`) === 0) this.setStat(`wear:${a}`, 1, silent);
      } else {
        all = false;
      }
    }
    if (all) this.setMax('wearAll', 1, silent);
  }

  private sampleCalm(ctx: StepContext): void {
    const s = this.settings();
    let calm = this.now - this.lastHurtAt >= s.achieveCalmHurtTicks;
    if (calm && this.busy && (this.busy.bannerShowing() || this.busy.levelUpShowing())) calm = false;
    if (calm) {
      const r2 = s.achieveCalmYokaiDist * s.achieveCalmYokaiDist;
      for (const y of ctx.yokai) {
        if (y.state === 'dying') continue;
        const dx = y.position.x - ctx.position.x;
        const dz = y.position.z - ctx.position.z;
        if (dx * dx + dz * dz <= r2) {
          calm = false;
          break;
        }
      }
    }
    this.calm = calm;
  }

  private cond1(): boolean {
    const s = this.settings();
    let small = 0;
    for (const id of this.pending) {
      if (DEF_BY_ID.get(id)?.small) small++;
      else return true;
    }
    if (small >= s.achieveSmallBatch) return true;
    return small > 0 && this.oldestSmallAt !== null && this.now - this.oldestSmallAt >= s.achieveSmallMaxWait;
  }

  private updateCond1(): void {
    if (this.cond1()) {
      if (this.cond1Since === null) this.cond1Since = this.now;
    } else {
      this.cond1Since = null;
    }
  }

  private buildShow(): AchievementShow | null {
    if (this.pending.length === 0) return null;
    let main = this.pending[0];
    let best = -1;
    for (const id of this.pending) {
      const rank = MEDAL_RANK[DEF_BY_ID.get(id)!.medal];
      if (rank > best) {
        best = rank;
        main = id;
      }
    }
    const rows = this.settings().achieveModalRows;
    const others = this.pending.length - 1;
    return { ids: [...this.pending], mainId: main, more: Math.max(0, others - rows) };
  }

  /** じっせき ページで 見た ことにする（あたらしい を消す） */
  markViewed(ids: Iterable<AchievementId>): void {
    for (const id of ids) if (this.unlocked.has(id)) this.viewed.add(id);
    this.version_++;
  }

  private onClosed(shown: AchievementId[]): void {
    for (const id of shown) this.seen.add(id);
    const set = new Set(shown);
    this.pending = this.pending.filter((id) => !set.has(id));
    this.oldestSmallAt = this.pending.some((id) => DEF_BY_ID.get(id)?.small) ? this.now : null;
    this.lastCloseAt = this.now;
    this.cond1Since = null;
    this.version_++;
    this.log_({ type: 'modalClose', tick: this.tickNow, ids: [...shown] });
  }
}
