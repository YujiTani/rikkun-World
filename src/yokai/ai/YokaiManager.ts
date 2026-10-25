import * as THREE from 'three';
import type {
  TimeOfDay,
  Vec3,
  VoxelWorld,
  W2Settings,
  YokaiEvent,
  YokaiHurtBy,
  YokaiInfo,
  YokaiKind,
  YokaiKnock,
  YokaiRayHit,
  YokaiTitle,
  YokaiWorld,
} from '../../contracts';
import { createW2Settings } from '../../contracts';
import { createRng, type Rng } from '../../world/gen/random';
import type { YokaiBase } from '../common';
import { createStaggerBook, type StaggerBook, type StaggerBy, type StaggerInfo } from '../stagger';
import { YOKAI_STATS } from '../stats';
import { boxesOf, syncTransform } from './body';
import { YokaiChaser } from './chase';
import { AI_CONST, createYokaiConfig, type YokaiConfig } from './config';
import { YokaiContact } from './contact';
import { YokaiDefeat } from './defeat';
import { BurstFx } from './effects';
import { DT, type Ent, type YokaiField } from './entity';
import { YokaiEvents } from './events';
import { YokaiFall } from './fall';
import { YokaiFireballs } from './fireballs';
import { aabbOverlap, obbBounds, rayObb, yawToward, type Aabb, type OBox } from './geometry';
import { disposeHpBarMaterials, type HpBarState } from './hpBar';
import { YokaiHurt } from './hurt';
import type { AnnounceInfo, FireballView, HookYokaiEvent, PlayerLike, SpawnOptions, YokaiManagerOptions } from './managerTypes';
import { YokaiMover } from './mover';
import { YokaiPlacement } from './placement';
import { YokaiPresenter } from './presenter';
import { YokaiReeler } from './reeler';
import { YokaiSpawner } from './spawner';
import { YokaiStone } from './stone';

// 外から使う型の名前は、これまでどおり この ファイルから 読める
export type { HookYokaiEvent, SpawnOptions, YokaiManagerOptions } from './managerTypes';

const tmpBox: Aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

/**
 * 妖怪たち（出現・AI・攻撃・火の玉・たおれる・帰る）。仕様 M3-combat §2.3〜§2.5・§2.9・§4.2〜§4.4
 *
 * 中身は「係」ごとの部品に分けてある（同じ ai/ フォルダ）。このクラスは、部品を作ってつなぎ、
 * 毎ステップの順番（update・stepEntity）と、外へ見せる窓口（YokaiWorld ＋ テストの窓口）だけを持つ。
 *   出現と片づけ spawner.ts ／ 場所と二つ名 placement.ts ／ 追いかけと向き chase.ts ／ 歩く・ぶつかる mover.ts
 *   落下と水 fall.ts ／ 石とつぶす stone.ts ／ 攻撃と当たり contact.ts ／ 火の玉 fireballs.ts ／ ダメージ hurt.ts
 *   たおす defeat.ts ／ よろけ reeler.ts ／ 見た目 presenter.ts ／ 出来事 events.ts
 */
export class YokaiManager implements YokaiWorld {
  readonly config: YokaiConfig;
  /** シーンに入れる */
  readonly group = new THREE.Group();

  private readonly getPlayer: () => PlayerLike;
  private readonly S: W2Settings;
  private readonly stagBook: StaggerBook;
  private readonly burst = new BurstFx();
  /** 係どうしで共有する「いまのステップ」（妖怪の列・ステップの数・プレイヤーの足もと） */
  private readonly f: YokaiField = { ents: [], steps: 0, px: 0, py: 0, pz: 0 };
  /** 部品は ここから 呼ぶときに 読む（つなぎ込みやテストが あとから 書きかえても 効く） */
  private readonly opts: YokaiManagerOptions;

  private readonly events: YokaiEvents;
  private readonly presenter: YokaiPresenter;
  private readonly reward: YokaiDefeat;
  private readonly hurt: YokaiHurt;
  private readonly mover: YokaiMover;
  private readonly fall: YokaiFall;
  private readonly stone: YokaiStone;
  private readonly reeler: YokaiReeler;
  private readonly fireballs: YokaiFireballs;
  private readonly contact: YokaiContact;
  private readonly chaser: YokaiChaser;
  private readonly placement: YokaiPlacement;
  private readonly spawner: YokaiSpawner;

  private readonly boxList: OBox[] = [];
  private readonly aimPool: { id: number; min: Vec3; max: Vec3 }[] = [];
  private readonly aimView: { id: number; min: Vec3; max: Vec3 }[] = [];

  /** 妖怪の列（係どうしで共有する入れ物 `f` の中身。テストも この名前で のぞく） */
  private get ents(): Ent[] {
    return this.f.ents;
  }

  constructor(options: YokaiManagerOptions) {
    this.opts = options;
    const opts = this.opts;
    const world: VoxelWorld = opts.world;
    const time: TimeOfDay = opts.time;
    const f = this.f;
    this.getPlayer = opts.getPlayer;
    this.S = opts.settings ?? createW2Settings();
    this.stagBook = createStaggerBook(this.S);
    this.config = opts.config ?? createYokaiConfig();
    const rng: Rng = createRng((opts.seed ?? 20240612) ^ 0x7a11);
    const titleRng: Rng = createRng((opts.seed ?? 20240612) ^ 0x71713);
    const nushiRng: Rng = createRng((opts.seed ?? 20240612) ^ 0x1e6e17d); // WEAPON-7 §2.3: ヌシの 表は べつの 乱数（ほかの ドロップの 列を ずらさない）
    this.group.add(this.burst.group);

    const events = (this.events = new YokaiEvents(f, opts.tick ?? null));
    const presenter = (this.presenter = new YokaiPresenter(this.group, f, time, opts, this.stagBook));
    const reward = (this.reward = new YokaiDefeat({
      drops: opts.drops,
      inventory: opts.inventory,
      stag: this.stagBook,
      events,
      opts,
      rng,
      nushiRng,
      settings: this.S,
    }));
    this.hurt = new YokaiHurt({ f, config: this.config, stag: this.stagBook, events, opts, marks: presenter, reward });
    const mover = (this.mover = new YokaiMover({ world, f, config: this.config }));
    const fall = (this.fall = new YokaiFall({ world, config: this.config, events, marks: presenter, reward }));
    const stone = (this.stone = new YokaiStone({ world, reward, opts }));
    const reeler = (this.reeler = new YokaiReeler({ f, stag: this.stagBook, opts }));
    const fireballs = (this.fireballs = new YokaiFireballs({ world, f, combat: opts.combat, events, opts, settings: this.S, hurt: this.hurt, reeler, burst: this.burst }));
    const contact = (this.contact = new YokaiContact({ f, combat: opts.combat, config: this.config, events, opts, reeler, stone, fireballs }));
    this.chaser = new YokaiChaser({ world, f, combat: opts.combat, config: this.config, events, opts, rng, mover, fall });
    const placement = (this.placement = new YokaiPlacement({ world, f, events, opts, titleRng, marks: presenter }));
    this.spawner = new YokaiSpawner({
      world,
      time,
      f,
      config: this.config,
      events,
      opts,
      group: this.group,
      rng,
      stag: this.stagBook,
      placement,
      onModelHit: (e, box) => contact.onModelHit(e, box),
    });
  }

  // ---------------------------------------------------------------- YokaiWorld

  /** その妖怪の見た目（ふちどり用。いなければ null） */
  modelOf(id: number): YokaiBase | null {
    return this.ents.find((q) => q.id === id)?.model ?? null;
  }

  list(): YokaiInfo[] {
    return this.ents.map((e) => this.presenter.infoOf(e));
  }

  /** ねらい補助用（CHAR-1 第 5.2 版）: 妖怪の当たりの箱（ねらいと同じに広げた箱）の 世界の外接の箱。毎回 同じ入れ物を使いまわす */
  aimBoxes(): readonly { id: number; min: Vec3; max: Vec3 }[] {
    let n = 0;
    for (const e of this.ents) {
      syncTransform(e);
      for (const b of boxesOf(e, this.boxList)) {
        b.hx += AI_CONST.hitPad;
        b.hy += AI_CONST.hitPad;
        b.hz += AI_CONST.hitPad;
        const bb = obbBounds(b, e.x, e.y, e.z, e.yaw, tmpBox);
        let o = this.aimPool[n];
        if (!o) this.aimPool[n] = o = { id: 0, min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
        o.id = e.id;
        o.min.x = bb.minX; o.min.y = bb.minY; o.min.z = bb.minZ;
        o.max.x = bb.maxX; o.max.y = bb.maxY; o.max.z = bb.maxZ;
        this.aimView[n] = o;
        n++;
      }
    }
    this.aimView.length = n;
    return this.aimView;
  }

  raycast(origin: Vec3, dir: Vec3, maxDistance: number): YokaiRayHit | null {
    let best: YokaiRayHit | null = null;
    for (const e of this.ents) {
      syncTransform(e);
      for (const b of boxesOf(e, this.boxList)) {
        // 攻撃を受ける判定だけ、左右・上下に広げる（ぶつかり・置けないの箱は広げない）
        b.hx += AI_CONST.hitPad;
        b.hy += AI_CONST.hitPad;
        b.hz += AI_CONST.hitPad;
        const d = rayObb(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, b, e.x, e.y, e.z, e.yaw);
        if (d >= 0 && d <= maxDistance && (best === null || d < best.distance)) {
          best = { id: e.id, kind: e.kind, distance: d };
        }
      }
    }
    return best;
  }

  /** テスト用: 体力を 決める（最大を こえて も よい。0 以下 は 1 に する） */
  setHp(id: number, hp: number): boolean {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.state === 'dying' || e.state === 'leaving' || e.remove) return false;
    if (hp <= 0) {
      // 0 以下は たおす（経験値・ドロップなし。テストで「たおれかけ」を作る）
      e.hp = 0;
      this.presenter.showMarks(e);
      this.reward.defeat(e, false);
      return true;
    }
    e.hp = hp;
    this.presenter.showMarks(e);
    return true;
  }

  /** knock（WEAPON-2）: 押す 距離（水平。省くと 1.0）・上への 初速（省くと 0）。ぬりかべ は 押されない */
  damage(id: number, amount: number, from: Vec3, knock?: YokaiKnock, by: YokaiHurtBy = 'player'): number {
    return this.hurt.hurtYokai(id, amount, from, knock, by);
  }

  /** WEAPON-9 §5.3.1: (x, z) の ほうへ 水平に dist だけ すいよせる。ふだんの 当たり判定の 中で 動く（かべで 止まる）。上下は かえない */
  pull(id: number, x: number, z: number, dist: number): void {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.state === 'dying' || e.state === 'leaving' || e.remove || e.knockLeft > 0) return;
    const dx = x - e.x;
    const dz = z - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6 || !(dist > 0)) return;
    this.mover.walk(e, dx / d, dz / d, Math.min(dist, d));
    syncTransform(e);
  }

  occupies(x: number, y: number, z: number): boolean {
    const cell: Aabb = { minX: x, maxX: x + 1, minY: y, maxY: y + 1, minZ: z, maxZ: z + 1 };
    for (const e of this.ents) {
      syncTransform(e);
      for (const b of boxesOf(e, this.boxList)) {
        if (aabbOverlap(obbBounds(b, e.x, e.y, e.z, e.yaw, tmpBox), cell)) return true;
      }
    }
    return false;
  }

  drainEvents(): YokaiEvent[] {
    return this.events.drainEvents();
  }

  // ---------------------------------------------------------------- LIVE-4: マッチョ と いっしょ に たたかう ための 口

  /** この ステップ の「きっかけ」を 取り出す（呼ぶと 空）。数 は かえない。`hit` = りっくん が 体力 を へらした、`hurt` = りっくん の 体力 を へらした（火の玉 は うった 妖怪） */
  takeCues(): { hit: number[]; hurt: number[] } | null {
    return this.events.takeCues();
  }

  /** マッチョ が たたく 相手 の 体（水平 の 半径・高さ・たおれた か 帰る か）。いなければ null */
  fightBody(id: number): { x: number; y: number; z: number; radius: number; height: number; state: 'alive' | 'dying' | 'leaving'; sliding: boolean } | null {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    const state = e.state === 'dying' ? 'dying' : e.state === 'leaving' ? 'leaving' : 'alive';
    return { x: e.x, y: e.y, z: e.z, radius: e.dims.radius, height: e.dims.height, state, sliding: e.knockLeft > 0 };
  }

  /** ねらい の しるし（顔）を 置く 場所: 体力 の バー の すぐ 上。二つ名 の 名前 が 出て いる ときは `titled` */
  markAnchor(id: number): { x: number; y: number; z: number; titled: boolean } | null {
    return this.presenter.markAnchor(id);
  }

  // ---------------------------------------------------------------- テストの窓口用

  /** 前に呼んでから起きた出来事（呼ぶと空になる）。画面側の列とは別 */
  takeHookEvents(): HookYokaiEvent[] {
    return this.events.takeHookEvents();
  }

  spawn(kind: YokaiKind, x: number, y: number, z: number, opts: SpawnOptions = {}): number {
    return this.spawner.spawnByHand(kind, x, y, z, opts);
  }

  /** 妖怪と火の玉をすぐ全部消す（イベントは出さない） */
  clear(): void {
    this.placement.clearAnnounce();
    for (const e of this.ents) this.disposeEnt(e);
    this.f.ents = [];
    this.fireballs.clear();
    this.stagBook.clear();
  }

  private disposeEnt(e: Ent): void {
    this.group.remove(e.model.root);
    if (e.marks) {
      this.group.remove(e.marks.group);
      e.marks.dispose();
    }
    e.model.dispose();
  }

  dispose(): void {
    this.clear();
    this.burst.dispose();
    disposeHpBarMaterials();
  }

  // ---------------------------------------------------------------- 1 ステップ

  update(dt: number = DT): void {
    const f = this.f;
    f.steps++;
    // よろけ（WEAPON-5）: このステップに よろけている 妖怪を 決めてから のこりを へらす（90 ステップ ぶん 動かない）
    for (const e of f.ents) e.stag = this.stagBook.get(e.id) !== null;
    this.stagBook.step();
    this.placement.tickAnnounce();
    const p = this.getPlayer();
    f.px = p.position.x;
    f.py = p.position.y;
    f.pz = p.position.z;

    this.spawner.spawnTick();
    this.spawner.leaveTick();
    this.spawner.farTick();

    for (const e of f.ents) this.stepEntity(e, dt);
    this.mover.separate();
    this.contact.contactTick();
    this.fireballs.tick(dt);
    this.burst.update(dt);

    this.presenter.applyLight();
    this.presenter.tickMarks();

    if (this.hasRemoved()) {
      const keep: Ent[] = [];
      for (const e of f.ents) {
        if (e.remove) {
          this.stagBook.remove(e.id);
          this.events.emit(
            { type: 'remove', tick: this.events.tick(), id: e.id, kind: e.kind, position: { x: e.x, y: e.y, z: e.z } },
            true,
          );
          this.disposeEnt(e);
        } else keep.push(e);
      }
      f.ents = keep;
    }
  }

  private hasRemoved(): boolean {
    for (const e of this.ents) if (e.remove) return true;
    return false;
  }

  // ---------------------------------------------------------------- 1 体の 1 ステップ

  private stepEntity(e: Ent, dt: number): void {
    const f = this.f;
    if (e.state === 'dying' || e.state === 'leaving') {
      syncTransform(e);
      e.model.update(dt);
      if (e.model.dead) e.remove = true;
      return;
    }
    if (e.state === 'appear') {
      e.age++;
      e.appearScale = Math.min(1, e.age / AI_CONST.appearTicks);
      e.model.root.scale.setScalar(Math.max(e.appearScale, 1e-4) * e.bodyScale);
      if (e.age >= AI_CONST.appearTicks) e.state = 'idle';
    } else if (e.stag) {
      this.reeler.pose(e);
    } else {
      this.reeler.clear(e);
      if (e.ai) this.chaser.think(e, dt);
    }
    if (e.kind === 'nurikabe' && this.stone.stoneTick(e)) return;
    this.mover.applyKnock(e);
    // よろけ中の ちょうちんは その場で ふわふわ（高さも かえない）
    if (!this.fall.rise(e, dt) && !(e.stag && e.dims.flies)) this.fall.settle(e, dt);
    this.fall.endAirSafe(e);
    if (e.y < AI_CONST.voidY) {
      e.remove = true;
      return;
    }
    if (e.state === 'attack') e.attackSteps++;
    syncTransform(e);
    e.model.update(dt);
    if (e.state === 'attack' && e.model.attackPhase() === null) {
      e.state = 'chase';
      e.attackSteps = 0;
      e.cool = Math.round(YOKAI_STATS[e.kind].cooldownSeconds * 60);
      e.bestDist = Infinity;
      e.lastProgress = f.steps;
    }
  }

  // ---------------------------------------------------------------- 見た目・名前・二つ名の窓口

  /** 体力のバーの 状態（テスト窓口 hud.hpBar 用）。いない id は null */
  hpBarInfo(id: number): HpBarState | null {
    return this.presenter.hpBarInfo(id);
  }

  /** テスト窓口 yokai.palette 用: 色の段階・暗さ・いまの材料の色（テクスチャなし）・ぬりかべの もよう（2 色のテクスチャ）の色 */
  paletteInfo(id: number): { stage: 1 | 2 | 3; brightness: number; colors: number[]; textureColors: number[] } | null {
    return this.presenter.paletteInfo(id);
  }

  /** テスト窓口 yokai.marks 用: 頭の印・ヌシの光 */
  marksInfo(id: number): ReturnType<YokaiPresenter['marksInfo']> {
    return this.presenter.marksInfo(id);
  }

  /** 二つ名を決めなおす（体力・攻撃力・大きさを 計算しなおす。体力は割合をたもつ。§6 のきまりを通る） */
  setTitle(id: number, title: YokaiTitle): boolean {
    return this.placement.setTitle(id, title);
  }

  /** 登場のおしらせ（テスト窓口 hud.announce と画面用）。出ていなければ null */
  announce(): AnnounceInfo | null {
    return this.placement.announce();
  }

  /** 頭の上の名前（テスト窓口 hud.nameplate 用）。いない id は null。二つ名なしは visible = false */
  nameplateInfo(id: number): { visible: boolean; text: string } | null {
    return this.presenter.nameplateInfo(id);
  }

  /** 画面に出す名前の一覧（二つ名の妖怪で 16 ブロック以内。バーの上に置く） */
  nameplates(out: { id: number; text: string; x: number; y: number; z: number; dist: number }[] = []): typeof out {
    return this.presenter.nameplates(out);
  }

  /** テストの窓口 `yokai.spawnWeights(x, z)`: その場所で 使う 行 × 全体の倍率（ぬりかべ の 同時の数は 入れない） */
  spawnWeights(x: number, z: number): { country: string; weights: Record<string, number> } {
    return this.spawner.spawnWeights(x, z);
  }

  // ---------------------------------------------------------------- 火の玉・よろけの窓口

  /** テスト用: いま飛んでいる火の玉の数（はね返した分も 数える） */
  fireballCount(): number {
    return this.fireballs.count();
  }

  /** テスト窓口 `yokai.fireballList()`: 飛んでいる 火の玉（コピー） */
  fireballList(): FireballView[] {
    return this.fireballs.list();
  }

  /** index 番めの 火の玉を はね返す。できたら true（もう はね返した・消えた 火の玉は false） */
  reflectFireball(index: number): boolean {
    return this.fireballs.reflect(index);
  }

  /** よろけの のこり（なければ null）。窓口 `yokai.stagger(id)` */
  stagger(id: number): StaggerInfo | null {
    return this.stagBook.get(id);
  }

  /** 画面の よろけアイコン用: 2 倍が のこっている 妖怪。頭の上の 位置（名前・バーより 上） */
  staggerIcons(out: { id: number; x: number; y: number; z: number; titled: boolean }[] = []): typeof out {
    return this.presenter.staggerIcons(out);
  }

  /** 窓口 `hud.staggerIcon(id)`: いない id は null。アイコンは 2 倍が のこっている あいだ 見える */
  staggerIconInfo(id: number): { visible: boolean } | null {
    return this.presenter.staggerIconInfo(id);
  }

  /** 攻撃を 取り消して よろける（パリィの 成功・はね返しが 当たった）。できたら true */
  applyStagger(id: number, by: StaggerBy): boolean {
    return this.reeler.applyStagger(id, by);
  }

  /**
   * テスト窓口 `yokai.attackNow(id)`: すぐ 攻撃を 始めさせる（ai が false でも。きょり・次の攻撃までは 見ない）。
   * hitInSteps = 攻撃を 始めてから 当たりを 見るまで（ちょうちんは 火の玉を 投げるまで）。できない（倒れかけ など）は null。
   */
  attackNow(id: number): { hitInSteps: number } | null {
    const f = this.f;
    const e = f.ents.find((q) => q.id === id);
    if (!e || e.state === 'dying' || e.state === 'leaving' || e.state === 'appear' || e.state === 'attack' || e.remove) return null;
    const dx = f.px - e.x;
    const dz = f.pz - e.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) e.yaw = yawToward(dx / d, dz / d); // プレイヤーの方を すぐ向く
    if (e.kind === 'rokurokubi' && !this.chaser.planNeck(e)) return null;
    this.chaser.startAttack(e);
    return { hitInSteps: Math.round(YOKAI_STATS[e.kind].hitSeconds * 60) };
  }
}
