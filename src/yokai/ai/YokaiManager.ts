import { isLeafId } from '../../world/blocks/blockTypes';
import * as THREE from 'three';
import { bodyInWall } from '../../world/wall';
import type {
  BlockId,
  Inventory,
  ItemId,
  LightField,
  PlayerCombat,
  PlayerState,
  TimeOfDay,
  ItemStack,
  Vec3,
  VoxelWorld,
  YokaiEvent,
  YokaiInfo,
  YokaiKnock,
  YokaiKind,
  YokaiRayHit,
  YokaiState,
  YokaiTitle,
  YokaiWorld,
} from '../../contracts';
import type { Fireball } from '../models/chochin';
import { Chochin } from '../models/chochin';
import { Karakasa } from '../models/karakasa';
import { Nurikabe } from '../models/nurikabe';
import { Rokurokubi } from '../models/rokurokubi';
import type { YokaiBase } from '../common';
import { SEA_Y, createW2Settings, type W2Settings } from '../../contracts';
import { bearingOf } from '../../combat/parry';
import { createStaggerBook, type StaggerBy, type StaggerInfo } from '../stagger';
import { colorStage, locationMAt } from '../location';
import { YOKAI_STATS, yokaiStrength } from '../stats';
import { ANNOUNCE_TICKS, TITLE_RULES, isBigTitle, limitTitle, rollTitle, titleAnnounceText, titleLabel } from '../title';
import { fallDamage } from '../../combat/config';
import { createRng, type Rng } from '../../world/gen/random';
import { applyDollBrightness } from './brightness';
import { AI_CONST, KIND_AI, YOKAI_DROPS, createYokaiConfig, type KindAi, type YokaiConfig } from './config';
import { BurstFx } from './effects';
import {
  aabbOverlap,
  angleDiff,
  obbBounds,
  rayObb,
  toLocalXZ,
  toWorldXZ,
  yawToward,
  type Aabb,
  type OBox,
} from './geometry';
import { findNeckRoute, type P3 } from './neckRoute';
import { HP_BAR, HpBar, disposeHpBarMaterials, hpBarState, type HpBarState } from './hpBar';
import { flySurface, groundSupport, isRoofed, settleGround } from './terrain';

const DT = 1 / 60;
const DEG = Math.PI / 180;

/** テストの窓口用の出来事（画面用の YokaiEvent に、消えた・ドロップを足したもの） */
export type HookYokaiEvent =
  | YokaiEvent
  | { type: 'remove'; tick: number; id: number; kind: YokaiKind; position: Vec3 }
  | { type: 'drop'; tick: number; id: number; kind: YokaiKind; item: ItemId; count: number; added: number };

/** プレイヤーの位置と向きだけがあればよい */
export type PlayerLike = Pick<PlayerState, 'position'>;

export interface YokaiManagerOptions {
  world: VoxelWorld;
  time: TimeOfDay;
  /** 足もとの中央 */
  getPlayer: () => PlayerLike;
  combat: PlayerCombat;
  inventory: Inventory;
  /** あれば ドロップを地面にばらまく（なければ そのまま持ち物に入れる）。`DropField` がそのまま使える */
  drops?: {
    scatter(position: Vec3, stacks: ItemStack[], opts?: { kind?: 'death' | 'yokai' }): number;
  };
  /** 出来事に付ける「ゲームの何ステップ目か」。なければ update を呼んだ回数 */
  tick?: () => number;
  seed?: number;
  config?: YokaiConfig;
  /** 光（M4）。あれば 出現は「暗い所」、明るさは足もとの光。なければ 時刻だけで決める */
  light?: Pick<LightField, 'level'> & {
    isDarkForSpawn(x: number, y: number, z: number): boolean;
    brightness(x: number, y: number, z: number): number;
  };
  /** 足もとの光の下限（人形の明るさ） */
  lightMin?: number;
  /** プレイヤーが妖怪をたおした（経験値用。xp = 場所の倍率 M と二つ名を入れた数） */
  onDefeat?: (kind: YokaiKind, info: DefeatInfo) => void;
  /** あれば、妖怪が出てよい (x, z) か聞く（VOX-D: つなぎ込みが「描く輪のメッシュずみの列」を渡す。無ければ 読みこんでいる列ならどこでも） */
  canSpawnAt?: (x: number, z: number) => boolean;
  /** はじまりの場所（水平）。世界の設定から読む。複数なら いちばん近い所から d をはかる。省くと (0, 0) */
  origin?: () => { x: number; z: number } | readonly { x: number; z: number }[];
  /** 海面の高さ。世界の設定（contracts の SEA_Y）。省くと SEA_Y */
  seaY?: () => number;
  /** ブロックがこわれた・石になった（くだけるつぶ・音用。1 回の出来事ぶんをまとめて渡す） */
  onBlocks?: (cells: { x: number; y: number; z: number; from: BlockId; to: BlockId }[], why: 'crush' | 'stone') => void;
  /** WEAPON-5: 設定の入れ物（よろけ・はね返し。なければ 初期値） */
  settings?: W2Settings;
  /** WEAPON-5: パリィ。妖怪の攻撃・火の玉が プレイヤーに当たる直前に聞く（なければ 今のまま） */
  parry?: YokaiParryPort;
  /** WEAPON-5: よろけ・2 倍・はね返しが当たった 出来事を パリィの 出来事の 列へ */
  onParryEvent?: (e: { type: 'stagger' | 'staggerDouble' | 'reflectHit'; yokaiId: number; by?: StaggerBy; damage?: number }) => void;
}

/** パリィの 答え（`createParry().hit` と 同じ形のうち 使う分） */
export interface YokaiParryVerdict {
  result: 'success' | 'early' | 'fail' | 'none';
  /** early のとき 半分にした 数 */
  amount: number;
}

export interface YokaiParryPort {
  /** dirDeg = プレイヤーの足もとから 来た向き（0 = 北。null = 真上・真下）。amount = 元のダメージ */
  hit(h: { by: 'attack' | 'fireball'; yokaiId: number | null; dirDeg: number | null; amount: number }): YokaiParryVerdict;
}

/** 飛んでいる 火の玉の 見た目の 情報（テストの窓口 `yokai.fireballList()`） */
export interface FireballView {
  position: Vec3;
  dir: Vec3;
  speed: number;
  reflected: boolean;
  owner: number;
}

/** たおした妖怪の 経験値・二つ名（onDefeat に渡す） */
export interface DefeatInfo {
  xp: number;
  title: YokaiTitle;
  m: number;
}

export interface SpawnOptions {
  /** false なら動かない・攻撃しない（たたかれる・押される・たおれるはする） */
  ai?: boolean;
  yawDeg?: number;
  /** 二つ名を決めて出す（テスト用。省くと なし。たいしょう・ヌシ は 1 体まで、ぬりかべ は おやぶん まで） */
  title?: YokaiTitle;
  /** 場所の倍率を決めて出す（テスト用。省くと 1。'auto' なら 自動の出現と同じに 出た場所から決める） */
  m?: number | 'auto';
}

interface Ent {
  id: number;
  kind: YokaiKind;
  model: YokaiBase;
  x: number;
  y: number;
  z: number;
  /** ラジアン。0 = 北（-Z）、時計回り */
  yaw: number;
  hp: number;
  maxHp: number;
  state: YokaiState;
  ai: boolean;
  age: number;
  /** 次の攻撃までのこり */
  cool: number;
  attackSteps: number;
  vy: number;
  /** AI を 止めた ちょうちんが 置かれた 高さ（これより 下へは おりない。WEAPON-5 のテスト用） */
  homeY: number;
  wanderLeft: number;
  wandering: boolean;
  wanderYaw: number;
  bestDist: number;
  lastProgress: number;
  /** いま かけている明るさ（光があるとき。変わったときだけ色を塗りなおす） */
  bright: number;
  searchSteps: number;
  lastSeenX: number;
  lastSeenZ: number;
  knockLeft: number;
  /** ノックバックの 1 ステップ あたりの 水平の 距離 */
  knockStep: number;
  /** 上へ の 初速（ブロック/秒）。0 より 大きい あいだ は うきあがっている */
  knockUpV: number;
  knockDx: number;
  knockDz: number;
  motion: 'wait' | 'move';
  leaveAt: number;
  marks: HpBar | null;
  marksLeft: number;
  /** 二つ名（出たときに決める） */
  title: YokaiTitle;
  /** 出た場所の倍率 M */
  m: number;
  /** 1 回の攻撃力・たおしたときの経験値・はやさの倍率・ドロップを引く回数・からだの大きさ（M と二つ名から） */
  attack: number;
  xp: number;
  speedMul: number;
  dropRolls: number;
  bodyScale: number;
  /** 体の大きさを入れた 動きの数（半径・高さ。のぼれる段などは そのまま） */
  dims: KindAi;
  /** 色の段階の うすい色の上乗せ（0 = なし） */
  stage: 1 | 2 | 3;
  appearScale: number;
  remove: boolean;
  /** 落ち始めた高さ（落ちていなければ NaN） */
  fallFrom: number;
  /** からかさ: ゆらゆら落ちている最中か、その経過ステップ */
  floating: boolean;
  swayStep: number;
  /** ぬりかべ: みず でかたまった度合い 0〜1 */
  stone: number;
  /** WEAPON-5: このステップは よろけている（ステップのはじめに 決める） */
  stag: boolean;
  /** WEAPON-5: よろけの ふらつきの 位相 */
  stagPhase: number;
}

interface LiveFireball {
  fb: Fireball;
  owner: number;
  /** 出した妖怪の攻撃力（出した時点の数） */
  damage: number;
  /** WEAPON-5: はね返した（プレイヤーには もう 当たらない） */
  reflected: boolean;
}

/** 登場のおしらせ（画面の上のまん中） */
export interface AnnounceInfo {
  text: string;
  icon: 'taisho' | 'nushi';
  ticksLeft: number;
}

const tmp = { x: 0, z: 0 };
const tmpBox: Aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const tmpBox2: Aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const tmpVec = new THREE.Vector3();

const dimsCache = new Map<string, KindAi>();

/** 体の大きさ s 倍の 動きの数（半径・高さ・頭の上の高さ だけ s 倍。のぼれる段・はやさ・見つける距離は そのまま） */
function scaledDims(kind: YokaiKind, s: number): KindAi {
  if (s === 1) return KIND_AI[kind];
  const key = `${kind}|${s}`;
  let d = dimsCache.get(key);
  if (!d) {
    const b = KIND_AI[kind];
    d = { ...b, radius: b.radius * s, height: b.height * s, marksHeight: b.marksHeight * s };
    dimsCache.set(key, d);
  }
  return d;
}

/** 妖怪たち（出現・AI・攻撃・火の玉・たおれる・帰る）。仕様 M3-combat §2.3〜§2.5・§2.9・§4.2〜§4.4 */
export class YokaiManager implements YokaiWorld {
  readonly config: YokaiConfig;
  /** シーンに入れる */
  readonly group = new THREE.Group();

  private readonly world: VoxelWorld;
  private readonly time: TimeOfDay;
  private readonly getPlayer: () => PlayerLike;
  private readonly combat: PlayerCombat;
  private readonly inventory: Inventory;
  private readonly drops: YokaiManagerOptions['drops'];
  private readonly tickFn: (() => number) | null;
  private readonly rng: Rng;
  /** 二つ名の抽選（出現の乱数の並びを変えないように別に持つ） */
  private readonly titleRng: Rng;
  private announceNow: AnnounceInfo | null = null;
  private readonly burst = new BurstFx();

  private readonly S: W2Settings;
  private readonly stagBook;
  private ents: Ent[] = [];
  private fireballs: LiveFireball[] = [];
  private freeFireballs: Fireball[] = [];
  private nextId = 1;
  private steps = 0;
  private spawnCountdown = 0;
  private lastBrightness = 1;
  private screenEvents: YokaiEvent[] = [];
  private hookEvents: HookYokaiEvent[] = [];

  // 今のステップのプレイヤー
  private px = 0;
  private py = 0;
  private pz = 0;

  private readonly opts: YokaiManagerOptions;

  constructor(opts: YokaiManagerOptions) {
    this.opts = opts;
    this.world = opts.world;
    this.time = opts.time;
    this.getPlayer = opts.getPlayer;
    this.combat = opts.combat;
    this.inventory = opts.inventory;
    this.drops = opts.drops;
    this.tickFn = opts.tick ?? null;
    this.S = opts.settings ?? createW2Settings();
    this.stagBook = createStaggerBook(this.S);
    this.config = opts.config ?? createYokaiConfig();
    this.rng = createRng((opts.seed ?? 20240612) ^ 0x7a11);
    this.titleRng = createRng((opts.seed ?? 20240612) ^ 0x71713);
    this.group.add(this.burst.group);
  }

  // ---------------------------------------------------------------- YokaiWorld

  /** その妖怪の見た目（ふちどり用。いなければ null） */
  modelOf(id: number): YokaiBase | null {
    return this.ents.find((q) => q.id === id)?.model ?? null;
  }

  list(): YokaiInfo[] {
    return this.ents.map((e) => this.infoOf(e));
  }

  private infoOf(e: Ent): YokaiInfo {
    let yawDeg = (e.yaw / DEG) % 360;
    if (yawDeg < 0) yawDeg += 360;
    return {
      id: e.id,
      kind: e.kind,
      position: { x: e.x, y: e.y, z: e.z },
      yawDeg,
      hp: e.hp,
      maxHp: e.maxHp,
      state: e.state,
      attackTick: e.state === 'attack' ? e.attackSteps : 0,
      scale: e.state === 'dying' || e.state === 'leaving' ? e.model.scale : e.appearScale,
      name: e.model.displayName,
      title: e.title,
      m: e.m,
      attack: e.attack,
    };
  }

  /** 当たりの箱（足もとからの位置を妖怪の向きで見たもの）。たおれているあいだは無い */
  private boxesOf(e: Ent, out: OBox[]): OBox[] {
    out.length = 0;
    if (e.state === 'dying' || e.state === 'leaving') return out;
    switch (e.kind) {
      case 'karakasa':
        out.push({ cx: 0, cy: 0.9, cz: 0, hx: 0.75, hy: 0.9, hz: 0.75 });
        break;
      case 'chochin':
        out.push({ cx: 0, cy: 1.1, cz: 0, hx: 0.4, hy: 0.6, hz: 0.4 });
        break;
      case 'nurikabe':
        // ねている（攻撃の 90〜195 ステップ目）あいだは、ねた形
        if (e.state === 'attack' && e.attackSteps >= 90 && e.attackSteps < 195) {
          out.push({ cx: 0, cy: 0.4, cz: -1.9, hx: 1.3, hy: 0.4, hz: 1.5 });
        } else {
          out.push({ cx: 0, cy: 1.5, cz: 0, hx: 1.3, hy: 1.5, hz: 0.4 });
        }
        break;
      case 'rokurokubi': {
        out.push({ cx: 0, cy: 0.9, cz: 0, hx: 0.35, hy: 0.9, hz: 0.225 });
        const h = (e.model as Rokurokubi).headCenter(tmpVec);
        out.push({ cx: h.x, cy: h.y, cz: h.z, hx: 0.3, hy: 0.3, hz: 0.3 });
        break;
      }
    }
    if (e.bodyScale !== 1) {
      for (const b of out) {
        b.cx *= e.bodyScale;
        b.cy *= e.bodyScale;
        b.cz *= e.bodyScale;
        b.hx *= e.bodyScale;
        b.hy *= e.bodyScale;
        b.hz *= e.bodyScale;
      }
    }
    return out;
  }

  private readonly boxList: OBox[] = [];
  private readonly floorScratch: number[] = [];

  private readonly aimPool: { id: number; min: Vec3; max: Vec3 }[] = [];
  private readonly aimView: { id: number; min: Vec3; max: Vec3 }[] = [];

  /** ねらい補助用（CHAR-1 第 5.2 版）: 妖怪の当たりの箱（ねらいと同じに広げた箱）の 世界の外接の箱。毎回 同じ入れ物を使いまわす */
  aimBoxes(): readonly { id: number; min: Vec3; max: Vec3 }[] {
    let n = 0;
    for (const e of this.ents) {
      this.syncTransform(e);
      for (const b of this.boxesOf(e, this.boxList)) {
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
      this.syncTransform(e);
      for (const b of this.boxesOf(e, this.boxList)) {
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
      this.showMarks(e);
      this.defeat(e, false);
      return true;
    }
    e.hp = hp;
    this.showMarks(e);
    return true;
  }

  /** knock（WEAPON-2）: 押す 距離（水平。省くと 1.0）・上への 初速（省くと 0）。ぬりかべ は 押されない */
  damage(id: number, amount: number, from: Vec3, knock?: YokaiKnock): number {
    return this.hurtYokai(id, amount, from, knock);
  }

  /** ダメージ。よろけ中の 最初の 1 回は 2 倍（WEAPON-5）。実際に 与えた 数を 返す（当たらなければ 0） */
  private hurtYokai(id: number, amount: number, from: Vec3, knock?: YokaiKnock): number {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.state === 'dying' || e.state === 'leaving' || e.remove) return 0;
    const wasDouble = this.stagBook.hasDouble(id);
    amount = this.stagBook.damage(id, amount);
    if (wasDouble) this.opts.onParryEvent?.({ type: 'staggerDouble', yokaiId: id, damage: amount });
    e.hp = Math.max(0, Math.round((e.hp - amount) * 100 + 1e-7) / 100); // WEAPON-4: 0.01 の位に まるめる（小数の 誤差で のこさない）
    this.showMarks(e);
    if (e.hp <= 0) {
      this.defeat(e);
      return amount;
    }
    e.model.hit();
    this.emit({ type: 'hurt', tick: this.tick(), id: e.id, kind: e.kind, position: { x: e.x, y: e.y, z: e.z } });
    if (e.kind !== 'nurikabe') {
      let dx = e.x - from.x;
      let dz = e.z - from.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-6) {
        dx = -Math.sin(e.yaw) * -1;
        dz = Math.cos(e.yaw);
      } else {
        dx /= d;
        dz /= d;
      }
      e.knockDx = dx;
      e.knockDz = dz;
      e.knockLeft = AI_CONST.knockbackTicks;
      e.knockStep = (knock ? Math.max(0, knock.dist) : this.config.knockback) / AI_CONST.knockbackTicks;
      e.knockUpV = knock && knock.up > 0 ? knock.up : 0;
    }
    return amount;
  }

  occupies(x: number, y: number, z: number): boolean {
    const cell: Aabb = { minX: x, maxX: x + 1, minY: y, maxY: y + 1, minZ: z, maxZ: z + 1 };
    for (const e of this.ents) {
      this.syncTransform(e);
      for (const b of this.boxesOf(e, this.boxList)) {
        if (aabbOverlap(obbBounds(b, e.x, e.y, e.z, e.yaw, tmpBox), cell)) return true;
      }
    }
    return false;
  }

  drainEvents(): YokaiEvent[] {
    const out = this.screenEvents;
    this.screenEvents = [];
    return out;
  }

  // ---------------------------------------------------------------- テストの窓口用

  /** 前に呼んでから起きた出来事（呼ぶと空になる）。画面側の列とは別 */
  takeHookEvents(): HookYokaiEvent[] {
    const out = this.hookEvents;
    this.hookEvents = [];
    return out;
  }

  spawn(kind: YokaiKind, x: number, y: number, z: number, opts: SpawnOptions = {}): number {
    const e = this.create(kind, x, y, z, (opts.yawDeg ?? 0) * DEG, false);
    e.ai = opts.ai ?? true;
    e.age = 1000;
    this.emit({ type: 'spawn', tick: this.tick(), id: e.id, kind, position: { x, y, z } });
    // テスト用の出し方は 決まった数にする（m を省くと 1・title を省くと なし）。出た場所で決めるのは 自動の出現だけ
    this.decidePlace(e, opts.title ?? 'none', opts.m === 'auto' ? undefined : (opts.m ?? 1));
    return e.id;
  }

  /** 妖怪と火の玉をすぐ全部消す（イベントは出さない） */
  clear(): void {
    this.announceNow = null;
    for (const e of this.ents) this.disposeEnt(e);
    this.ents = [];
    for (const f of this.fireballs) this.killFireball(f, false);
    this.fireballs = [];
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
    this.steps++;
    // よろけ（WEAPON-5）: このステップに よろけている 妖怪を 決めてから のこりを へらす（90 ステップ ぶん 動かない）
    for (const e of this.ents) e.stag = this.stagBook.get(e.id) !== null;
    this.stagBook.step();
    if (this.announceNow && --this.announceNow.ticksLeft <= 0) this.announceNow = null;
    const p = this.getPlayer();
    this.px = p.position.x;
    this.py = p.position.y;
    this.pz = p.position.z;

    this.spawnTick();
    this.leaveTick();
    this.farTick();

    for (const e of this.ents) this.stepEntity(e, dt);
    this.separate();
    this.contactTick();
    this.fireballTick(dt);
    this.burst.update(dt);

    // 暗さ（暗くしないものは brightness.ts が除く）
    const light = this.opts.light;
    if (light) {
      const min = this.opts.lightMin ?? 0.3;
      for (const e of this.ents) {
        const bb = Math.max(min, light.brightness(e.x, e.y + 0.5, e.z));
        if (bb !== e.bright) {
          e.bright = bb;
          applyDollBrightness(e.model, e.kind, bb, e.stage);
        }
      }
    } else {
      const b = this.time.dollBrightness();
      if (b !== 1 || this.lastBrightness !== 1) {
        for (const e of this.ents) applyDollBrightness(e.model, e.kind, b, e.stage);
      }
      this.lastBrightness = b;
    }

    for (const e of this.ents) {
      if (e.marksLeft > 0) e.marksLeft--;
      if (e.state === 'dying' || e.state === 'leaving') {
        e.marks?.hide();
        continue;
      }
      if (e.title === 'none' && !e.marks?.shown) continue;
      this.refreshBar(e);
    }

    if (this.ents.some((e) => e.remove)) {
      const keep: Ent[] = [];
      for (const e of this.ents) {
        if (e.remove) {
          this.stagBook.remove(e.id);
          this.emit(
            { type: 'remove', tick: this.tick(), id: e.id, kind: e.kind, position: { x: e.x, y: e.y, z: e.z } },
            true,
          );
          this.disposeEnt(e);
        } else keep.push(e);
      }
      this.ents = keep;
    }
  }

  private tick(): number {
    return this.tickFn ? this.tickFn() : this.steps;
  }

  private emit(ev: HookYokaiEvent, hookOnly = false): void {
    if (!hookOnly && ev.type !== 'remove' && ev.type !== 'drop') this.screenEvents.push(ev);
    this.hookEvents.push(ev);
    if (this.hookEvents.length > 3000) this.hookEvents.splice(0, 1000);
    if (this.screenEvents.length > 3000) this.screenEvents.splice(0, 1000);
  }

  // ---------------------------------------------------------------- 出現と帰る

  private create(kind: YokaiKind, x: number, y: number, z: number, yaw: number, appear: boolean): Ent {
    let model: YokaiBase;
    switch (kind) {
      case 'karakasa':
        model = new Karakasa();
        break;
      case 'chochin':
        model = new Chochin();
        (model as Chochin).fireLayer = this.group;
        break;
      case 'nurikabe':
        model = new Nurikabe();
        break;
      default:
        model = new Rokurokubi();
        break;
    }
    const hp = YOKAI_STATS[kind].hp;
    const st = yokaiStrength(kind);
    const e: Ent = {
      id: this.nextId++,
      kind,
      model,
      x,
      y,
      z,
      yaw,
      hp,
      maxHp: hp,
      state: appear ? 'appear' : 'idle',
      ai: true,
      bright: 1,
      age: 0,
      cool: 0,
      attackSteps: 0,
      vy: 0,
      homeY: y,
      wanderLeft: 30 + Math.floor(this.rng() * 90),
      wandering: false,
      wanderYaw: 0,
      bestDist: 0,
      lastProgress: 0,
      searchSteps: 0,
      lastSeenX: x,
      lastSeenZ: z,
      knockLeft: 0,
      knockStep: 0,
      knockUpV: 0,
      knockDx: 0,
      knockDz: 0,
      motion: 'wait',
      leaveAt: -1,
      marks: null,
      marksLeft: 0,
      title: 'none',
      m: 1,
      attack: st.attack,
      xp: st.xp,
      speedMul: 1,
      dropRolls: 1,
      bodyScale: 1,
      dims: KIND_AI[kind],
      stage: 1,
      appearScale: appear ? 0 : 1,
      remove: false,
      fallFrom: NaN,
      floating: false,
      swayStep: 0,
      stone: 0,
      stag: false,
      stagPhase: 0,
    };
    model.onHit = (ev) => this.onModelHit(e, ev.box);
    model.root.scale.setScalar(Math.max(e.appearScale, 1e-4));
    this.group.add(model.root);
    this.ents.push(e);
    this.syncTransform(e);
    return e;
  }

  /** 光の少ない場所か: 空が見えない（上がふさがっている）か、よる */
  private spawnTick(): void {
    if (!this.config.yokaiAutoSpawn) return;
    if (this.spawnCountdown > 0) {
      this.spawnCountdown--;
      return;
    }
    this.spawnCountdown = Math.max(1, this.config.yokaiSpawnInterval) - 1;
    this.trySpawn();
  }

  private pickKind(): YokaiKind | null {
    const nuri = this.ents.filter((e) => e.kind === 'nurikabe').length;
    const kinds: YokaiKind[] = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'];
    let total = 0;
    const w: number[] = [];
    for (const k of kinds) {
      let v = this.config.yokaiWeights[k] ?? 0;
      if (k === 'nurikabe' && nuri >= this.config.nurikabeMax) v = 0;
      w.push(Math.max(0, v));
      total += Math.max(0, v);
    }
    if (total <= 0) return null;
    let r = this.rng() * total;
    for (let i = 0; i < kinds.length; i++) {
      if (r < w[i]!) return kinds[i]!;
      r -= w[i]!;
    }
    return kinds[kinds.length - 1]!;
  }

  private trySpawn(): void {
    if (this.ents.length >= this.config.yokaiMax) return;
    const kind = this.pickKind();
    if (!kind) return;
    const ai = KIND_AI[kind];
    const night = this.time.phase() === 'night';
    const minD = Math.max(this.config.yokaiSpawnMinDist, this.config.yokaiSpawnNearExclude);
    const maxD = Math.max(minD, this.config.yokaiSpawnMaxDist);
    for (let t = 0; t < AI_CONST.spawnTries; t++) {
      const a = this.rng() * Math.PI * 2;
      const d = minD + this.rng() * (maxD - minD);
      const x = this.px + Math.sin(a) * d;
      const z = this.pz - Math.cos(a) * d;
      if (!bodyInWall(x, z, 2)) continue;
      // 出る場所は 読みこんでいる列だけ。つなぎ込みが「描く輪のメッシュずみの列」を聞く窓口を渡す
      if (!this.world.isLoaded(Math.floor(x), Math.floor(z))) continue;
      if (this.opts.canSpawnAt && !this.opts.canSpawnAt(x, z)) continue;
      // 立てる床（固くて、はっぱ・水でない、上が空気）を列から集めて、1 つえらぶ
      const floors = this.floorScratch;
      floors.length = 0;
      const ix = Math.floor(x);
      const iz = Math.floor(z);
      let waterColumn = false;
      // 高さ 352 でも 速いように、あるなら 列のいちばん上の ブロックから 下へ見る
      const topFn = (this.world as { topY?: (x: number, z: number) => number }).topY;
      const yTop = typeof topFn === 'function' ? Math.min(this.world.size.y - 2, topFn.call(this.world, ix, iz)) : this.world.size.y - 2;
      for (let y = yTop; y >= 0; y--) {
        if (this.world.getBlock(ix, y, iz) === 'water') waterColumn = true;
        if (!this.world.isSolid(ix, y, iz) || this.world.isSolid(ix, y + 1, iz)) continue;
        const b = this.world.getBlock(ix, y, iz);
        if (isLeafId(b) || b === 'water') continue;
        floors.push(y + 1);
      }
      // M5: みず の列（うみ・かわ・いずみ・いけ）には出ない
      if (waterColumn || floors.length === 0) continue;
      const top = floors[Math.floor(this.rng() * floors.length)]!;
      const T = groundSupport(this.world, x, z, top, ai);
      if (Number.isNaN(T)) continue;
      // 光の少ない場所だけ: 屋根の下、またはよる
      const light = this.opts.light;
      if (light) {
        if (!light.isDarkForSpawn(x, T, z)) continue;
        // M3 AC3: ゆうがたの終わりごろで空の光が弱まっても、外（空の下）には出ない。出るのは屋根の下か、よる
        if (!night && !isRoofed(this.world, x, T, z, ai.height)) continue;
      } else if (!isRoofed(this.world, x, T, z, ai.height) && !night) continue;
      const e = this.create(kind, x, T, z, this.rng() * Math.PI * 2, true);
      this.emit({ type: 'spawn', tick: this.tick(), id: e.id, kind, position: { x, y: T, z } });
      this.decidePlace(e, null);
      return;
    }
  }

  /** M5: プレイヤーから水平 64 より遠い妖怪は、そのステップで静かに消える（落とし物なし） */
  private farTick(): void {
    const lim = AI_CONST.farRemoveDist;
    for (const e of this.ents) {
      if (e.remove) continue;
      const dx = e.x - this.px;
      const dz = e.z - this.pz;
      if (dx * dx + dz * dz > lim * lim) e.remove = true;
      // 列が捨てられたら、その列の妖怪は 静かに消す（VOX-D。落とし物なし）
      else if (!this.world.isLoaded(Math.floor(e.x), Math.floor(e.z))) e.remove = true;
    }
  }

  private leaveTick(): void {
    if (this.time.phase() !== 'dawn') return;
    for (const e of this.ents) {
      if (e.leaveAt < 0 && e.state !== 'dying' && e.state !== 'leaving') {
        if (isRoofed(this.world, e.x, e.y, e.z, e.dims.height)) {
          e.leaveAt = -2; // 屋根の下の妖怪は残ってよい
          continue;
        }
        const attackTicks = Math.ceil(YOKAI_STATS[e.kind].attackSeconds * 60);
        const room = Math.max(1, this.config.yokaiLeaveTicks - 66 - attackTicks - 2);
        e.leaveAt = this.steps + Math.floor(this.rng() * room);
      }
      // よろけている 間は 帰らない（よろけが おわってから）
      if (e.leaveAt >= 0 && this.steps >= e.leaveAt && e.state !== 'attack' && e.state !== 'dying' && e.state !== 'leaving' && !this.stagBook.get(e.id)) {
        this.startLeave(e);
      }
    }
  }

  private startLeave(e: Ent): void {
    e.state = 'leaving';
    e.model.die();
    this.emit({ type: 'leave', tick: this.tick(), id: e.id, kind: e.kind, position: { x: e.x, y: e.y, z: e.z } });
  }

  // ---------------------------------------------------------------- たおす

  /** byPlayer が false（落下など）なら、ドロップも経験値もなし */
  private defeat(e: Ent, byPlayer = true): void {
    this.stagBook.remove(e.id);
    e.state = 'dying';
    e.model.die();
    if (byPlayer) this.opts.onDefeat?.(e.kind, { xp: e.xp, title: e.title, m: e.m });
    let total = 0;
    // 二つ名は 表を引く回数がふえる（おやぶん 2・たいしょう 3・ヌシ 4）
    for (let roll = 0; roll < (byPlayer ? e.dropRolls : 0); roll++) {
      for (const row of YOKAI_DROPS[e.kind]) {
        if (this.rng() >= row.chance) continue;
        const count = 1 + Math.floor(this.rng() * row.max);
        const left = this.drops
          ? count - this.drops.scatter({ x: e.x, y: e.y, z: e.z }, [{ item: row.item, count }], { kind: 'yokai' })
          : this.inventory.add(row.item, count);
        const added = count - left;
        total += added;
        this.emit({ type: 'drop', tick: this.tick(), id: e.id, kind: e.kind, item: row.item, count, added }, true);
      }
    }
    this.emit({
      type: 'defeat',
      tick: this.tick(),
      id: e.id,
      kind: e.kind,
      position: { x: e.x, y: e.y, z: e.z },
      reward: total,
      title: e.title,
    });
  }

  private showMarks(e: Ent): void {
    e.marksLeft = HP_BAR.ticks;
    this.refreshBar(e);
  }

  /** 体力のバーの 状態（テスト窓口 hud.hpBar 用）。いない id は null */
  hpBarInfo(id: number): HpBarState | null {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    return this.barStateOf(e);
  }

  /** テスト窓口 yokai.palette 用: 色の段階・暗さ・いまの材料の色（テクスチャなし）・ぬりかべの もよう（2 色のテクスチャ）の色 */
  paletteInfo(id: number): { stage: 1 | 2 | 3; brightness: number; colors: number[]; textureColors: number[] } | null {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    const colors = new Set<number>();
    const tex = new Set<number>();
    e.model.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const mm = m as THREE.MeshBasicMaterial;
        const data = (mm.map?.image as { data?: Uint8Array } | undefined)?.data;
        if (!mm.map) colors.add(mm.color.getHex());
        else if (data) {
          const own = new Set<number>();
          for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 0) own.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
          if (own.size <= 2 && !own.has(0x222222)) for (const c of own) tex.add(c);
        }
      }
    });
    return { stage: e.stage, brightness: e.bright, colors: [...colors], textureColors: [...tex] };
  }

  /** テスト窓口 yokai.marks 用: 頭の印・ヌシの光 */
  marksInfo(id: number): {
    mark: 'none' | 'hachimaki' | 'crown';
    markColors: number[];
    markOnHead: boolean;
    glow: null | { color: number; opacity: number; additive: boolean; lift: number };
  } | null {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    const n = e.model.nickInfo();
    let glow = null;
    if (n.glow) {
      const mat = n.glow.material as THREE.MeshBasicMaterial;
      const g = n.glow.geometry as THREE.BoxGeometry;
      glow = {
        color: mat.color.getHex(),
        opacity: mat.opacity,
        additive: mat.blending === THREE.AdditiveBlending,
        lift: (n.glow.position.y - g.parameters.height / 2) / Math.max(1e-6, e.model.size.height),
      };
    }
    return { mark: n.kind, markColors: n.markColors, markOnHead: n.markOnHead, glow };
  }

  /** テスト窓口用: 出現は decidePlace を通る（§6 のきまりもそこ）。これは あとから 二つ名を かえる口 */
  /** 二つ名を決めなおす（体力・攻撃力・大きさを 計算しなおす。体力は割合をたもつ。§6 のきまりを通る） */
  setTitle(id: number, title: YokaiTitle): boolean {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.remove) return false;
    const taken = this.bigTaken(e);
    this.applyStats(e, limitTitle(e.kind, title, taken));
    this.refreshBar(e);
    return true;
  }

  /** 登場のおしらせ（テスト窓口 hud.announce と画面用）。出ていなければ null */
  announce(): AnnounceInfo | null {
    return this.announceNow ? { ...this.announceNow } : null;
  }

  /** 頭の上の名前（テスト窓口 hud.nameplate 用）。いない id は null。二つ名なしは visible = false */
  nameplateInfo(id: number): { visible: boolean; text: string } | null {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    return { visible: this.nameVisible(e), text: titleLabel(e.model.displayName, e.title) };
  }

  /** 画面に出す名前の一覧（二つ名の妖怪で 16 ブロック以内。バーの上に置く） */
  nameplates(out: { id: number; text: string; x: number; y: number; z: number; dist: number }[] = []): typeof out {
    out.length = 0;
    for (const e of this.ents) {
      if (!this.nameVisible(e)) continue;
      out.push({
        id: e.id,
        text: titleLabel(e.model.displayName, e.title),
        x: e.x,
        y: e.y + e.dims.marksHeight + HP_BAR.barHeight * 0.75 + 0.1,
        z: e.z,
        dist: Math.hypot(this.px - e.x, this.pz - e.z),
      });
    }
    return out;
  }

  private nameVisible(e: Ent): boolean {
    if (e.title === 'none' || e.state === 'dying' || e.state === 'leaving') return false;
    return Math.hypot(this.px - e.x, this.pz - e.z) <= HP_BAR.titleRange;
  }

  /** たいしょう・ヌシ が（ほかに）いるか。たおれた・帰る・消える物は数えない */
  private bigTaken(except: Ent | null): boolean {
    return this.ents.some((q) => q !== except && isBigTitle(q.title) && !q.remove && q.state !== 'dying' && q.state !== 'leaving');
  }

  /**
   * 出すと決まった場所で M と二つ名を決める（出現で呼ぶのは ここ 1 か所。VOX-B・VOX-G の出現は create のあとに これを呼べばよい）。
   * request = null なら 抽選（シード付き）。m を省くと 出た場所 (x, y, z) から。
   * 体が入らない所では 二つ名なし（§6）。
   */
  private decidePlace(e: Ent, request: YokaiTitle | null, m?: number): void {
    const origin = this.opts.origin?.() ?? { x: 0, z: 0 };
    e.m = m ?? locationMAt({ x: e.x, y: e.y, z: e.z }, origin, this.opts.seaY?.() ?? SEA_Y);
    const taken = this.bigTaken(e);
    let title = request === null ? rollTitle(this.titleRng, e.kind, taken) : limitTitle(e.kind, request, taken);
    if (title !== 'none' && !this.fits(e, title)) title = 'none';
    this.applyStats(e, title);
    if (title === 'none') return;
    const text = titleAnnounceText(e.model.displayName, title);
    if (text && (title === 'taisho' || title === 'nushi')) this.announceNow = { text, icon: title, ticksLeft: ANNOUNCE_TICKS };
    this.emit({ type: 'titleSound', tick: this.tick(), id: e.id, kind: e.kind, title });
  }

  /** その二つ名の大きさの体が ここに入るか（のぼれる段・はやさは 変えない） */
  private fits(e: Ent, title: YokaiTitle): boolean {
    const dims = scaledDims(e.kind, TITLE_RULES[title].bodyScale);
    if (dims.flies) {
      const r = dims.radius;
      return this.boxFreeAt(e.x - r, e.y + 0.5, e.z - r, e.x + r, e.y + dims.height, e.z + r);
    }
    return !Number.isNaN(groundSupport(this.world, e.x, e.z, e.y, dims, AI_CONST.maxDrop, !YOKAI_STATS[e.kind].avoidsWater));
  }

  /** M と二つ名から 体力・攻撃力・経験値・大きさ・色を決める */
  private applyStats(e: Ent, title: YokaiTitle): void {
    const st = yokaiStrength(e.kind, e.m, title);
    const t = TITLE_RULES[title];
    const full = e.hp >= e.maxHp;
    const ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    e.title = title;
    if (e.model.nickTitle !== title) {
      e.model.setNickMarks(title);
      applyDollBrightness(e.model, e.kind, e.bright, e.stage); // 印の色にも 夜の暗さ・段階を かける
    }
    e.maxHp = st.hp;
    e.hp = full ? st.hp : Math.max(1, Math.ceil(st.hp * ratio));
    e.attack = st.attack;
    e.xp = st.xp;
    e.speedMul = st.speedMul;
    e.dropRolls = st.dropRolls;
    e.bodyScale = t.bodyScale;
    e.dims = scaledDims(e.kind, t.bodyScale);
    e.model.root.scale.setScalar(Math.max(e.appearScale, 1e-4) * e.bodyScale);
    const stage = colorStage(e.m);
    if (stage !== e.stage || stage > 1) {
      e.stage = stage;
      applyDollBrightness(e.model, e.kind, e.bright, stage);
    }
  }

  private barStateOf(e: Ent): HpBarState {
    const dist = Math.hypot(this.px - e.x, this.pz - e.z);
    return hpBarState(e.hp, e.maxHp, e.title, dist, e.marksLeft);
  }

  private refreshBar(e: Ent): void {
    const s = this.barStateOf(e);
    if (!s.visible) {
      e.marks?.hide();
      return;
    }
    e.marks ??= new HpBar();
    if (e.marks.group.parent !== this.group) this.group.add(e.marks.group);
    e.marks.show(s);
    this.placeMarks(e);
  }

  private placeMarks(e: Ent): void {
    const m = e.marks!;
    m.group.position.set(e.x, e.y + e.dims.marksHeight, e.z);
    // プレイヤーの方を向く（板が見える向き）
    m.group.rotation.y = Math.atan2(this.px - e.x, this.pz - e.z);
  }

  // ---------------------------------------------------------------- 1 体の 1 ステップ

  private syncTransform(e: Ent): void {
    e.model.root.position.set(e.x, e.y, e.z);
    e.model.root.rotation.y = -e.yaw;
  }

  private stepEntity(e: Ent, dt: number): void {
    if (e.state === 'dying' || e.state === 'leaving') {
      this.syncTransform(e);
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
      this.staggerPose(e);
    } else {
      this.staggerClear(e);
      if (e.ai) this.think(e, dt);
    }
    if (e.kind === 'nurikabe' && this.stoneTick(e)) return;
    this.applyKnock(e);
    // よろけ中の ちょうちんは その場で ふわふわ（高さも かえない）
    if (!this.rise(e, dt) && !(e.stag && e.dims.flies)) this.settle(e, dt);
    if (e.y < AI_CONST.voidY) {
      e.remove = true;
      return;
    }
    if (e.state === 'attack') e.attackSteps++;
    this.syncTransform(e);
    e.model.update(dt);
    if (e.state === 'attack' && e.model.attackPhase() === null) {
      e.state = 'chase';
      e.attackSteps = 0;
      e.cool = Math.round(YOKAI_STATS[e.kind].cooldownSeconds * 60);
      e.bestDist = Infinity;
      e.lastProgress = this.steps;
    }
  }

  private setMotion(e: Ent, m: 'wait' | 'move'): void {
    if (e.motion === m || e.state === 'attack') return;
    e.motion = m;
    e.model.setMotion(m);
  }

  private think(e: Ent, dt: number): void {
    const ai = KIND_AI[e.kind];
    e.age++;
    if (e.state !== 'attack' && e.cool > 0) e.cool--;
    const dx = this.px - e.x;
    const dz = this.pz - e.z;
    const dist = Math.hypot(dx, dz);
    const dy = this.py - e.y;
    const targetable = !this.combat.dead();
    const speed = this.speedOf(e);
    let moved = 0;

    const notice = (): boolean =>
      targetable && dist <= ai.sight && Math.abs(dy) <= AI_CONST.sightDy;

    switch (e.state) {
      case 'attack':
        return;
      case 'idle':
      case 'wander': {
        if (notice()) {
          this.enterChase(e, dist);
          break;
        }
        moved = this.wanderTick(e, dt, speed);
        break;
      }
      case 'search': {
        if (notice()) {
          this.enterChase(e, dist);
          break;
        }
        e.searchSteps++;
        const sdx = e.lastSeenX - e.x;
        const sdz = e.lastSeenZ - e.z;
        const sd = Math.hypot(sdx, sdz);
        if (sd < 0.7 || e.searchSteps >= AI_CONST.searchTicks) {
          this.toRest(e);
          break;
        }
        moved = this.moveToward(e, sdx / sd, sdz / sd, speed, dt);
        break;
      }
      default: {
        // chase / retreat
        moved = this.chaseTick(e, dt, dist, dy, targetable);
        break;
      }
    }
    this.setMotion(e, moved > 1e-5 ? 'move' : 'wait');
  }

  private toRest(e: Ent): void {
    e.state = 'idle';
    e.wandering = false;
    e.wanderLeft = AI_CONST.wanderRest[0] + Math.floor(this.rng() * (AI_CONST.wanderRest[1] - AI_CONST.wanderRest[0]));
  }

  private enterChase(e: Ent, dist: number): void {
    e.state = 'chase';
    e.bestDist = dist;
    e.lastProgress = this.steps;
  }

  private wanderTick(e: Ent, dt: number, speed: number): number {
    if (!this.config.yokaiWander) {
      e.state = 'idle';
      return 0;
    }
    e.wanderLeft--;
    if (e.wanderLeft <= 0) {
      if (e.wandering) {
        this.toRest(e);
      } else {
        e.wandering = true;
        e.state = 'wander';
        e.wanderYaw = this.rng() * Math.PI * 2;
        e.wanderLeft = AI_CONST.wanderWalk[0] + Math.floor(this.rng() * (AI_CONST.wanderWalk[1] - AI_CONST.wanderWalk[0]));
      }
    }
    if (!e.wandering) {
      e.state = 'idle';
      return 0;
    }
    const m = this.moveToward(e, Math.sin(e.wanderYaw), -Math.cos(e.wanderYaw), speed * AI_CONST.wanderSpeedRate, dt);
    if (m < 1e-6) {
      // 行けない: 向きを変えて休む
      this.toRest(e);
    }
    return m;
  }

  /** 向きをゆっくり変えながら、(dirx, dirz) の方へ進む。ぬりかべは向いている方へしか進まない。進んだ距離を返す */
  private moveToward(e: Ent, dirx: number, dirz: number, speed: number, dt: number): number {
    const want = yawToward(dirx, dirz);
    this.turn(e, want, dt);
    if (e.kind === 'nurikabe') {
      if (Math.abs(angleDiff(e.yaw, want)) > 30 * DEG) return 0;
      return this.walk(e, Math.sin(e.yaw), -Math.cos(e.yaw), speed * dt);
    }
    return this.walk(e, dirx, dirz, speed * dt);
  }

  private turn(e: Ent, want: number, dt: number): void {
    const maxTurn = KIND_AI[e.kind].turnDegPerSec * DEG * dt;
    const d = angleDiff(e.yaw, want);
    e.yaw += Math.abs(d) <= maxTurn ? d : Math.sign(d) * maxTurn;
  }

  private chaseTick(e: Ent, dt: number, dist: number, dy: number, targetable: boolean): number {
    const ai = KIND_AI[e.kind];
    if (!targetable || dist > ai.giveUp || Math.abs(dy) > AI_CONST.sightDy * 2) {
      this.lose(e);
      return 0;
    }
    e.lastSeenX = this.px;
    e.lastSeenZ = this.pz;
    const speed = this.speedOf(e);
    const ux = dist > 1e-6 ? (this.px - e.x) / dist : 0;
    const uz = dist > 1e-6 ? (this.pz - e.z) / dist : -1;
    const canAttack = e.cool <= 0 && e.age >= AI_CONST.noAttackTicks && e.stone < AI_CONST.stoneNoAttack;
    let moved = 0;
    let hold = 0;
    switch (e.kind) {
      case 'karakasa': {
        hold = 1.5;
        if (canAttack && dist <= YOKAI_STATS.karakasa.reach + AI_CONST.attackPad && Math.abs(dy) <= 2.5 + AI_CONST.attackPadY) {
          this.turn(e, yawToward(ux, uz), 1);
          this.startAttack(e);
          return 0;
        }
        if (dist > hold) moved = this.moveToward(e, ux, uz, speed, dt);
        else this.turn(e, yawToward(ux, uz), dt);
        break;
      }
      case 'chochin': {
        hold = 4.3;
        if (e.state === 'retreat' ? dist < 4 : dist < 3) {
          e.state = 'retreat';
          this.turn(e, yawToward(ux, uz), dt);
          moved = this.walk(e, -ux, -uz, speed * dt);
          return moved;
        }
        e.state = 'chase';
        if (canAttack && dist >= 4 && dist <= YOKAI_STATS.chochin.reach) {
          this.turn(e, yawToward(ux, uz), 1);
          this.startAttack(e);
          return 0;
        }
        if (dist > hold) moved = this.moveToward(e, ux, uz, speed, dt);
        else this.turn(e, yawToward(ux, uz), dt);
        break;
      }
      case 'nurikabe': {
        hold = 2.2;
        // 前 3・はば 2.6 の中にいるときだけ
        toLocalXZ(this.px - e.x, this.pz - e.z, e.yaw, tmp);
        const fwd = -tmp.z;
        if (canAttack && fwd > 0 && fwd <= YOKAI_STATS.nurikabe.reach && Math.abs(tmp.x) <= 1.3 + AI_CONST.attackPad && Math.abs(dy) <= 2.5 + AI_CONST.attackPadY) {
          this.startAttack(e);
          return 0;
        }
        if (dist > hold) moved = this.moveToward(e, ux, uz, speed, dt);
        else this.turn(e, yawToward(ux, uz), dt);
        break;
      }
      default: {
        // ろくろくび
        hold = 5.5;
        if (dist < 2) {
          e.state = 'retreat';
          this.turn(e, yawToward(ux, uz), dt);
          moved = this.walk(e, -ux, -uz, speed * dt);
          return moved;
        }
        e.state = 'chase';
        if (canAttack && dist <= YOKAI_STATS.rokurokubi.reach && this.planNeck(e)) {
          this.turn(e, yawToward(ux, uz), 1);
          this.startAttack(e);
          return 0;
        }
        if (dist > hold) moved = this.moveToward(e, ux, uz, speed, dt);
        else this.turn(e, yawToward(ux, uz), dt);
        break;
      }
    }
    // 3 秒間 0.5 も近づけなかったらあきらめる（近づきたいとき だけ数える）
    if (dist > hold + 0.5) {
      if (dist < e.bestDist - AI_CONST.progressDist) {
        e.bestDist = dist;
        e.lastProgress = this.steps;
      } else if (this.steps - e.lastProgress >= AI_CONST.progressTicks) {
        this.lose(e);
        return 0;
      }
    } else {
      e.bestDist = dist;
      e.lastProgress = this.steps;
    }
    return moved;
  }

  private lose(e: Ent): void {
    e.state = 'search';
    e.searchSteps = 0;
    this.setMotion(e, 'wait');
  }

  private startAttack(e: Ent): void {
    // ねらう所（プレイヤーの足もと）を、妖怪から見た位置で渡す
    this.setAim(e);
    if (e.kind === 'rokurokubi') this.sendNeckRoute(e);
    this.setMotion(e, 'wait');
    e.state = 'attack';
    e.attackSteps = 0;
    this.syncTransform(e);
    e.model.attack();
    this.emit({ type: 'attackStart', tick: this.tick(), id: e.id, kind: e.kind });
  }

  private readonly neckFrom: P3 = { x: 0, y: 0, z: 0 };
  private readonly neckTo: P3 = { x: 0, y: 0, z: 0 };
  private neckCorners: P3[] = [];

  /** ろくろくびの首が とどく道すじがあるか（あれば neckCorners に入れる）。まっすぐ通れなくても、2 回までの曲がりで行ければ OK */
  private planNeck(e: Ent): boolean {
    this.neckFrom.x = e.x;
    this.neckFrom.y = e.y + 1.0;
    this.neckFrom.z = e.z;
    this.neckTo.x = this.px;
    this.neckTo.y = this.py + 1.3;
    this.neckTo.z = this.pz;
    const r = findNeckRoute((x, y, z) => this.world.isSolid(x, y, z), this.neckFrom, this.neckTo, YOKAI_STATS.rokurokubi.reach);
    if (!r) return false;
    this.neckCorners = r;
    return true;
  }

  /** 曲がり角を、妖怪の向きで見た位置にして model へ渡す */
  private sendNeckRoute(e: Ent): void {
    const local: P3[] = [];
    for (const c of this.neckCorners) {
      toLocalXZ(c.x - e.x, c.z - e.z, e.yaw, tmp);
      local.push({ x: tmp.x, y: c.y - e.y, z: tmp.z });
    }
    (e.model as Rokurokubi).setNeckRoute(local);
  }

  private setAim(e: Ent): void {
    toLocalXZ(this.px - e.x, this.pz - e.z, e.yaw, tmp);
    e.model.aim.set(tmp.x, this.py - e.y, tmp.z);
  }

  // ---------------------------------------------------------------- 歩く・ぶつかる

  /** (dirx, dirz) へ distance だけ進む。ぶつかるときは軸ごとにずらす。進んだ距離を返す */
  private walk(e: Ent, dirx: number, dirz: number, distance: number): number {
    const nx = e.x + dirx * distance;
    const nz = e.z + dirz * distance;
    if (this.place(e, nx, nz)) return distance;
    if (Math.abs(dirx) > 1e-6 && this.place(e, nx, e.z)) return Math.abs(dirx * distance);
    if (Math.abs(dirz) > 1e-6 && this.place(e, e.x, nz)) return Math.abs(dirz * distance);
    return 0;
  }

  /** (x, z) に動けるなら動く */
  private place(e: Ent, x: number, z: number): boolean {
    const ai = e.dims;
    if (ai.flies) {
      const r = ai.radius;
      if (!bodyInWall(x, z, r, AI_CONST.edgeMargin)) return false;
      if (!this.world.isLoaded(Math.floor(x), Math.floor(z))) return false;
      const s = flySurface(this.world, x, z, e.y);
      if (s === null) return false;
      const ny = e.y + Math.max(-AI_CONST.hoverRate * DT, Math.min(AI_CONST.hoverRate * DT, s - e.y));
      const yy = ny + 0.5;
      if (!this.boxFreeAt(x - r, yy, z - r, x + r, ny + 1.7, z + r)) return false;
      e.x = x;
      e.z = z;
      return true;
    }
    const allowWater = !YOKAI_STATS[e.kind].avoidsWater;
    let t = groundSupport(this.world, x, z, e.y, ai, AI_CONST.maxDrop, allowWater);
    if (Number.isNaN(t) && (e.state === 'chase' || e.state === 'search') && this.py < e.y - AI_CONST.maxDrop) {
      // プレイヤーが下にいるときは、深い段差も歩いて降りる。みず の上・落ちて倒れる深さ・足場なしは降りない
      t = groundSupport(this.world, x, z, e.y, ai, AI_CONST.chaseMaxDrop, allowWater);
      if (
        !Number.isNaN(t) &&
        e.kind !== 'karakasa' && // からかさ は ゆらゆら落ちて ダメージなし
        this.world.getBlock(Math.floor(x), Math.floor(t), Math.floor(z)) !== 'water' &&
        fallDamage(e.y - t, this.config.safeFallHeight, this.config.fallDamagePerBlock) >= e.hp
      ) {
        t = NaN;
      }
    }
    if (Number.isNaN(t)) return false;
    e.x = x;
    e.z = z;
    return true;
  }

  private boxFreeAt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    const e = 1e-6;
    for (let y = Math.floor(y0 + e); y <= Math.floor(y1 - e); y++) {
      for (let x = Math.floor(x0 + e); x <= Math.floor(x1 - e); x++) {
        for (let z = Math.floor(z0 + e); z <= Math.floor(z1 - e); z++) {
          if (this.world.isSolid(x, y, z)) return false;
        }
      }
    }
    return true;
  }

  /** 足もとの高さを地面に合わせる（のぼる・落ちる。ちょうちんは地面や水面から浮く） */
  private settle(e: Ent, dt: number): void {
    const ai = e.dims;
    if (ai.flies) {
      const s = flySurface(this.world, e.x, e.z, e.y);
      if (s === null) return;
      // WEAPON-5: AI を 止めた ちょうちん（テスト用）は 置いた 高さより 下へは おりない
      const d = (e.ai ? s : Math.max(s, e.homeY)) - e.y;
      const step = AI_CONST.hoverRate * dt;
      e.y += Math.abs(d) <= step ? d : Math.sign(d) * step;
      return;
    }
    const t = settleGround(this.world, e.x, e.z, e.y, ai);
    if (t > e.y + 1e-6) {
      e.y = Math.min(t, e.y + AI_CONST.riseRate * dt);
      e.vy = 0;
      e.fallFrom = NaN;
    } else if (e.y > t + 1e-6) {
      if (Number.isNaN(e.fallFrom)) {
        e.fallFrom = e.y;
        e.floating = e.kind === 'karakasa' && e.y - t >= AI_CONST.floatMinDrop - 1e-6;
        e.swayStep = 0;
      }
      if (e.floating) this.sway(e, dt);
      e.vy = Math.min(e.floating ? AI_CONST.floatFallSpeed : 25, e.vy + 25 * dt);
      e.y = Math.max(t, e.y - e.vy * dt);
      if (e.y <= t) {
        e.vy = 0;
        this.land(e, t);
      }
    } else {
      e.vy = 0;
      if (!Number.isNaN(e.fallFrom)) this.land(e, t);
    }
  }

  /** からかさ: 落ち葉のように 横にゆれてかたむく。ゆれた先が かべ・みず なら ずれない */
  private sway(e: Ent, dt: number): void {
    const w = (Math.PI * 2) / AI_CONST.floatSwayPeriod;
    const t0 = e.swayStep * dt;
    e.swayStep++;
    const t1 = e.swayStep * dt;
    e.model.fallTilt = AI_CONST.floatTiltDeg * DEG * Math.cos(w * t1);
    const d = AI_CONST.floatSwayAmp * (Math.sin(w * t1) - Math.sin(w * t0));
    const nx = e.x + Math.cos(e.yaw) * d;
    const nz = e.z + Math.sin(e.yaw) * d;
    const ai = e.dims;
    const r = ai.radius;
    if (!bodyInWall(nx, nz, r, AI_CONST.edgeMargin)) return;
    if (!this.world.isLoaded(Math.floor(nx), Math.floor(nz))) return;
    if (!this.boxFreeAt(nx - r, e.y + 0.05, nz - r, nx + r, e.y + ai.height, nz + r)) return;
    const g = settleGround(this.world, nx, nz, e.y, ai);
    if (!Number.isFinite(g) || this.world.getBlock(Math.floor(nx), Math.floor(g), Math.floor(nz)) === 'water') return;
    e.x = nx;
    e.z = nz;
  }

  /** ぬりかべ: みず の中でかたまる（足もとが みず のマス）。石になったら true */
  private stoneTick(e: Ent): boolean {
    const inWater = this.world.getBlock(Math.floor(e.x), Math.floor(e.y + 1e-6), Math.floor(e.z)) === 'water';
    const before = e.stone;
    e.stone = Math.max(0, Math.min(1, e.stone + (inWater ? 1 : -1) / AI_CONST.stoneTicks));
    if (e.stone !== before) {
      e.model.stoneness = e.stone;
      applyDollBrightness(e.model, e.kind, e.bright, e.stage);
    }
    if (e.stone < 1 - 1e-9) return false;
    // 石になった: 体が重なる 空気・みず のマスだけ石に。経験値・ドロップは ふつうに出す
    const changed: { x: number; y: number; z: number; from: BlockId; to: BlockId }[] = [];
    const lo = Math.floor(e.y + 1e-6);
    const body: OBox = { cx: 0, cy: 1.5, cz: 0, hx: 1.3, hy: 1.5, hz: 0.4 };
    this.forCells(e, body, lo, lo + 2, (x, y, z) => {
      const b = this.world.getBlock(x, y, z);
      if (b === 'air' || b === 'water') {
        if (this.world.setBlock(x, y, z, 'stone')) changed.push({ x, y, z, from: b, to: 'stone' });
      }
    });
    const y0 = e.y;
    e.y += 3.2; // ドロップは石の上に出す
    this.defeat(e);
    e.y = y0;
    e.remove = true;
    if (changed.length > 0) this.opts.onBlocks?.(changed, 'stone');
    return true;
  }

  /** 向きのついた箱 b（足もとから見た位置）が重なるマスを、y の下から上まで順に fn へ渡す */
  private forCells(e: Ent, b: OBox, yLo: number, yHi: number, fn: (x: number, y: number, z: number) => void): void {
    const bb = obbBounds(b, e.x, e.y, e.z, e.yaw, tmpBox);
    const c = Math.abs(Math.cos(e.yaw));
    const s = Math.abs(Math.sin(e.yaw));
    const x0 = Math.floor(bb.minX + 1e-6);
    const x1 = Math.floor(bb.maxX - 1e-6);
    const z0 = Math.floor(bb.minZ + 1e-6);
    const z1 = Math.floor(bb.maxZ - 1e-6);
    const m = 0.5 * (c + s) - 1e-6;
    for (let y = yLo; y <= yHi; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          toLocalXZ(x + 0.5 - e.x, z + 0.5 - e.z, e.yaw, tmp);
          if (Math.abs(tmp.x - b.cx) < b.hx + m && Math.abs(tmp.z - b.cz) < b.hz + m) fn(x, y, z);
        }
      }
    }
  }

  /** ぬりかべ の たおれこみ: たおれた体が重なるマスと その真下 1 段をこわす（start_torch・みず・いちばん下の段は除く。落とし物なし） */
  private crush(e: Ent): void {
    const lying: OBox = { cx: 0, cy: 0.4, cz: -1.9, hx: 1.3, hy: 0.4, hz: 1.5 };
    const lo = Math.floor(e.y + 1e-6);
    const hi = Math.floor(e.y + 0.8 - 1e-6);
    const changed: { x: number; y: number; z: number; from: BlockId; to: BlockId }[] = [];
    this.forCells(e, lying, lo - 1, hi, (x, y, z) => {
      if (y <= 0) return;
      const b = this.world.getBlock(x, y, z);
      if (b === 'air' || b === 'outside' || b === 'water' || b === 'start_torch') return;
      if (this.world.setBlock(x, y, z, 'air')) changed.push({ x, y, z, from: b, to: 'air' });
    });
    if (changed.length > 0) this.opts.onBlocks?.(changed, 'crush');
  }

  /** 体（足もと か 腰）が みず のマスにあるか */
  private inWater(e: Ent): boolean {
    const ix = Math.floor(e.x);
    const iz = Math.floor(e.z);
    return this.world.getBlock(ix, Math.floor(e.y + 1e-6), iz) === 'water' || this.world.getBlock(ix, Math.floor(e.y + 0.9), iz) === 'water';
  }

  /** 歩く速さ（みず の中は ×waterSpeedMul） */
  private speedOf(e: Ent): number {
    let s = YOKAI_STATS[e.kind].speed * e.speedMul;
    if (!KIND_AI[e.kind].flies && this.inWater(e)) s *= this.config.waterSpeedMul;
    if (e.stone > 0) s *= 1 - (1 - AI_CONST.stoneSlowMin) * e.stone;
    return s;
  }

  /** 地面に着いた。落ちた高さに応じて落下ダメージ（みず に着いたら 0）。倒れてもドロップ・経験値なし */
  private land(e: Ent, ground: number): void {
    const from = e.fallFrom;
    e.fallFrom = NaN;
    if (e.floating || e.kind === 'karakasa') {
      e.floating = false;
      e.model.fallTilt = 0;
      return;
    }
    if (Number.isNaN(from) || !Number.isFinite(ground)) return;
    if (this.world.getBlock(Math.floor(e.x), Math.floor(ground), Math.floor(e.z)) === 'water') return;
    const dmg = fallDamage(from - ground, this.config.safeFallHeight, this.config.fallDamagePerBlock);
    if (dmg <= 0) return;
    e.hp = Math.max(0, e.hp - dmg);
    this.showMarks(e);
    if (e.hp <= 0) {
      this.defeat(e, false);
      return;
    }
    e.model.hit();
    this.emit({ type: 'hurt', tick: this.tick(), id: e.id, kind: e.kind, position: { x: e.x, y: e.y, z: e.z } });
  }

  /** 上への 初速で うきあがる。うきあがっている あいだ true（その ステップ は 地面あわせ を しない） */
  private rise(e: Ent, dt: number): boolean {
    if (e.knockUpV <= 0) return false;
    const ny = e.y + e.knockUpV * dt;
    e.knockUpV -= 25 * dt;
    const r = e.dims.radius;
    const blocked = !this.boxFreeAt(e.x - r, ny + e.dims.height - 0.05, e.z - r, e.x + r, ny + e.dims.height, e.z + r);
    if (e.knockUpV <= 0 || blocked) {
      e.knockUpV = 0;
      e.vy = 0;
      return false;
    }
    e.y = ny;
    return true;
  }

  private applyKnock(e: Ent): void {
    if (e.knockLeft <= 0) return;
    if (this.walk(e, e.knockDx, e.knockDz, e.knockStep) <= 0) e.knockLeft = 0;
    else e.knockLeft--;
  }

  /** 妖怪どうし・プレイヤーと重ならないように軽く押しあう */
  private separate(): void {
    const n = this.ents.length;
    for (let i = 0; i < n; i++) {
      const a = this.ents[i]!;
      if (a.state === 'dying' || a.state === 'leaving') continue;
      const ra = a.dims.radius;
      for (let j = i + 1; j < n; j++) {
        const b = this.ents[j]!;
        if (b.state === 'dying' || b.state === 'leaving') continue;
        const rb = b.dims.radius;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = ra + rb;
        if (d >= min || Math.abs(a.y - b.y) > 1.5) continue;
        if (d < 1e-6) {
          dx = 1;
          dz = 0;
        } else {
          dx /= d;
          dz /= d;
        }
        const push = Math.min(0.05, (min - d) / 2);
        if (b.state !== 'attack' && !b.stag) this.walk(b, dx, dz, push);
        if (a.state !== 'attack' && !a.stag) this.walk(a, -dx, -dz, push);
      }
      const dx = a.x - this.px;
      const dz = a.z - this.pz;
      const d = Math.hypot(dx, dz);
      const min = ra + AI_CONST.playerWidth / 2;
      if (!a.stag && d < min && this.py < a.y + a.dims.height && this.py + AI_CONST.playerHeight > a.y + (KIND_AI[a.kind].flies ? 0.5 : 0)) {
        const ux = d < 1e-6 ? 1 : dx / d;
        const uz = d < 1e-6 ? 0 : dz / d;
        this.walk(a, ux, uz, Math.min(0.08, min - d));
      }
    }
  }

  // ---------------------------------------------------------------- 攻撃の当たり

  /** 妖怪の体（当たりの箱）にふれたら ダメージ。むてきのあいだは combat 側で はじかれる */
  private contactTick(): void {
    const dmg = this.config.contactDamage;
    if (!(dmg > 0) || this.combat.dead()) return;
    const pb = this.playerBox(tmpBox);
    for (const e of this.ents) {
      if (e.state === 'dying' || e.state === 'leaving' || e.state === 'appear' || e.state === 'attack' || e.stag) continue; // 攻撃中は攻撃のダメージだけ。よろけ中は 体当たりしない
      for (const b of this.boxesOf(e, this.boxList)) {
        if (aabbOverlap(obbBounds(b, e.x, e.y, e.z, e.yaw, tmpBox2), pb) && this.localOverlap(e, b)) {
          if (this.combat.damage(e.kind === 'nurikabe' ? dmg * AI_CONST.nurikabeContactMul : dmg, e.kind, { x: e.x, y: e.y, z: e.z })) return;
          break;
        }
      }
    }
  }

  private playerBox(out: Aabb, padXZ = 0, padY = 0): Aabb {
    const h = AI_CONST.playerWidth / 2 + padXZ;
    out.minX = this.px - h;
    out.maxX = this.px + h;
    out.minZ = this.pz - h;
    out.maxZ = this.pz + h;
    out.minY = this.py - padY;
    out.maxY = this.py + AI_CONST.playerHeight + padY;
    return out;
  }

  private onModelHit(e: Ent, box: { cx: number; cy: number; cz: number; w: number; h: number; d: number }): void {
    toWorldXZ(box.cx * e.bodyScale, box.cz * e.bodyScale, e.yaw, tmp);
    const wpos = { x: e.x + tmp.x, y: e.y + box.cy * e.bodyScale, z: e.z + tmp.z };
    if (e.kind === 'chochin') {
      this.takeFireball(e);
      this.emit({ type: 'attackHit', tick: this.tick(), id: e.id, kind: e.kind, hitPlayer: false, position: wpos });
      this.emit({ type: 'fireball', tick: this.tick(), id: e.id, position: wpos });
      return;
    }
    // 箱をワールドでの外わくにして、プレイヤーの体の箱と重なるか
    const bs = e.bodyScale;
    const ob: OBox = { cx: box.cx * bs, cy: box.cy * bs, cz: box.cz * bs, hx: (box.w / 2) * bs, hy: (box.h / 2) * bs, hz: (box.d / 2) * bs };
    const padXZ = AI_CONST.attackPad;
    const padY = AI_CONST.attackPadY;
    const hit =
      aabbOverlap(obbBounds(ob, e.x, e.y, e.z, e.yaw, tmpBox), this.playerBox(tmpBox2, padXZ, padY)) &&
      this.localOverlap(e, ob, padXZ, padY);
    // WEAPON-5: パリィに 聞く（ろくろくびは 首の頭への 向き、ほかは 妖怪の足もとへの 向き）
    let dmg = e.attack;
    if (hit) {
      const v = this.askParry('attack', e.id, e.kind === 'rokurokubi' ? wpos : { x: e.x, y: e.y, z: e.z }, e.attack);
      if (v?.result === 'success') {
        // 受けた: 攻撃は 取り消し（ダメージ 0・押されない・こわさない・attackHit なし）
        this.applyStagger(e.id, 'parry');
        return;
      }
      if (v?.result === 'early') dmg = v.amount;
    }
    if (e.kind === 'nurikabe') this.crush(e);
    this.emit({ type: 'attackHit', tick: this.tick(), id: e.id, kind: e.kind, hitPlayer: hit, position: wpos });
    if (hit) this.combat.damage(dmg, e.kind, { x: e.x, y: e.y, z: e.z });
  }

  /** パリィに 聞く。パリィの 窓口が なければ null（今のまま） */
  private askParry(by: 'attack' | 'fireball', yokaiId: number | null, from: Vec3, amount: number): YokaiParryVerdict | null {
    const port = this.opts.parry;
    if (!port) return null;
    const dirDeg = bearingOf({ x: this.px, y: this.py, z: this.pz }, from);
    return port.hit({ by, yokaiId, dirDeg, amount });
  }

  /** 妖怪の向きで見た箱と、プレイヤーの箱の重なり（向きのついた箱のきちんとした判定） */
  private localOverlap(e: Ent, b: OBox, padXZ = 0, padY = 0): boolean {
    toLocalXZ(this.px - e.x, this.pz - e.z, e.yaw, tmp);
    const c = Math.abs(Math.cos(e.yaw));
    const s = Math.abs(Math.sin(e.yaw));
    const hp = (AI_CONST.playerWidth / 2 + padXZ) * (c + s);
    const ly = this.py + AI_CONST.playerHeight / 2 - e.y;
    return (
      Math.abs(tmp.x - b.cx) < b.hx + hp &&
      Math.abs(ly - b.cy) < b.hy + AI_CONST.playerHeight / 2 + padY &&
      Math.abs(tmp.z - b.cz) < b.hz + hp
    );
  }

  // ---------------------------------------------------------------- 火の玉

  /** ちょうちんが出した火の玉を、妖怪から離して管理する（ちょうちんが消えても飛びつづける） */
  private takeFireball(e: Ent): void {
    const model = e.model as Chochin;
    const idx = model.fireballs.findIndex((f) => f.alive && f.traveled === 0);
    if (idx < 0) return;
    const fb = model.fireballs.splice(idx, 1)[0]!;
    this.fireballs.push({ fb, owner: e.id, damage: e.attack, reflected: false });
    const spare = this.freeFireballs.pop();
    if (spare) model.fireballs.push(spare);
  }

  private killFireball(f: LiveFireball, withBurst: boolean): void {
    f.fb.alive = false;
    f.fb.group.visible = false;
    if (withBurst) this.burst.spawn(f.fb.position.x, f.fb.position.y, f.fb.position.z);
    this.freeFireballs.push(f.fb);
  }

  private fireballTick(dt: number): void {
    if (this.fireballs.length === 0) return;
    const pb = this.playerBox(tmpBox);
    const keep: LiveFireball[] = [];
    const half = AI_CONST.fireballBox / 2;
    for (const f of this.fireballs) {
      f.fb.update(dt);
      const p = f.fb.position;
      const kind: YokaiKind = 'chochin';
      let end = false;
      let hitPlayer = false;
      if (!f.fb.alive) {
        end = true; // 8 ブロックで消えた
      } else if (
        !this.world.isLoaded(p.x, p.z) || p.y < 0 || p.y >= this.world.size.y
      ) {
        end = true;
      } else if (this.world.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
        end = true;
      } else {
        tmpBox2.minX = p.x - half;
        tmpBox2.maxX = p.x + half;
        tmpBox2.minY = p.y - half;
        tmpBox2.maxY = p.y + half;
        tmpBox2.minZ = p.z - half;
        tmpBox2.maxZ = p.z + half;
        if (f.reflected) {
          // はね返した 火の玉: 妖怪に 当たる（プレイヤーには もう 当たらない）
          if (this.reflectedHit(f, tmpBox2)) end = true;
        } else if (aabbOverlap(tmpBox2, pb)) {
          // WEAPON-5: 受けの間なら はね返す（火の玉は のこる）。おしいは 半分で 消える
          const v = this.askParry('fireball', f.owner, { x: p.x, y: p.y, z: p.z }, f.damage);
          if (v?.result === 'success') {
            this.reflectOne(f);
          } else {
            hitPlayer = true;
            end = true;
            this.combat.damage(v?.result === 'early' ? v.amount : f.damage, kind, { x: p.x, y: p.y, z: p.z }, 'ball');
          }
        }
      }
      if (end) {
        this.emit({ type: 'fireballEnd', tick: this.tick(), position: { x: p.x, y: p.y, z: p.z }, hitPlayer });
        this.killFireball(f, true);
      } else {
        keep.push(f);
      }
    }
    this.fireballs = keep;
  }

  /** テスト用: いま飛んでいる火の玉の数（はね返した分も 数える） */
  fireballCount(): number {
    return this.fireballs.length;
  }

  // ---------------------------------------------------------------- WEAPON-5: 火の玉の はね返し・よろけ

  /** テスト窓口 `yokai.fireballList()`: 飛んでいる 火の玉（コピー） */
  fireballList(): FireballView[] {
    return this.fireballs.map((f) => ({
      position: { x: f.fb.position.x, y: f.fb.position.y, z: f.fb.position.z },
      dir: { x: f.fb.dir.x, y: f.fb.dir.y, z: f.fb.dir.z },
      speed: f.fb.speed,
      reflected: f.reflected,
      owner: f.owner,
    }));
  }

  /** index 番めの 火の玉を はね返す。できたら true（もう はね返した・消えた 火の玉は false） */
  reflectFireball(index: number): boolean {
    const f = this.fireballs[index];
    if (!f || f.reflected || !f.fb.alive) return false;
    this.reflectOne(f);
    return true;
  }

  /** 投げた ちょうちんの 当たりの箱の まん中へ（そのときの 位置。追いかけない）。いなければ 来た向きの 逆 */
  private reflectOne(f: LiveFireball): void {
    const fb = f.fb;
    const owner = this.ents.find((q) => q.id === f.owner);
    let dx = -fb.dir.x;
    let dy = -fb.dir.y;
    let dz = -fb.dir.z;
    if (owner && owner.state !== 'dying' && owner.state !== 'leaving' && !owner.remove) {
      const tx = owner.x - fb.position.x;
      const ty = owner.y + owner.dims.height / 2 - fb.position.y;
      const tz = owner.z - fb.position.z;
      if (Math.hypot(tx, ty, tz) > 1e-6) {
        dx = tx;
        dy = ty;
        dz = tz;
      }
    }
    const rf = this.S.reflectFireball;
    fb.reflect(tmpVec.set(dx, dy, dz), rf.speed, rf.range);
    f.reflected = true;
  }

  /** はね返した 火の玉 f(box = 火の玉の 箱) が 妖怪に 当たったか。当たったら ダメージ・よろけ。 */
  private reflectedHit(f: LiveFireball, fbBox: Aabb): boolean {
    for (const e of this.ents) {
      if (e.state === 'dying' || e.state === 'leaving' || e.state === 'appear' || e.remove) continue;
      for (const b of this.boxesOf(e, this.boxList)) {
        if (!aabbOverlap(obbBounds(b, e.x, e.y, e.z, e.yaw, tmpBox), fbBox)) continue;
        const p = f.fb.position;
        const amount = f.damage * this.S.reflectFireball.damageMul;
        const dealt = this.hurtYokai(e.id, amount, { x: p.x, y: p.y, z: p.z });
        this.opts.onParryEvent?.({ type: 'reflectHit', yokaiId: e.id, damage: dealt });
        if ((e.state as YokaiState) !== 'dying') this.applyStagger(e.id, 'reflect');
        return true;
      }
    }
    return false;
  }

  /** そのステップの 次の攻撃までの ステップ数 */
  private coolTicks(kind: YokaiKind): number {
    return Math.round(YOKAI_STATS[kind].cooldownSeconds * 60);
  }

  /** よろけの のこり（なければ null）。窓口 `yokai.stagger(id)` */
  stagger(id: number): StaggerInfo | null {
    return this.stagBook.get(id);
  }

  /** 画面の よろけアイコン用: 2 倍が のこっている 妖怪。頭の上の 位置（名前・バーより 上） */
  staggerIcons(out: { id: number; x: number; y: number; z: number; titled: boolean }[] = []): typeof out {
    out.length = 0;
    for (const id of this.stagBook.ids()) {
      const e = this.ents.find((q) => q.id === id);
      if (!e || e.state === 'dying' || e.state === 'leaving' || e.remove || !this.stagBook.hasDouble(id)) continue;
      out.push({ id, x: e.x, y: e.y + e.dims.marksHeight + HP_BAR.barHeight * 0.75 + 0.1, z: e.z, titled: e.title !== 'none' });
    }
    return out;
  }

  /** 窓口 `hud.staggerIcon(id)`: いない id は null。アイコンは 2 倍が のこっている あいだ 見える */
  staggerIconInfo(id: number): { visible: boolean } | null {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.remove) return null;
    return { visible: e.state !== 'dying' && e.state !== 'leaving' && this.stagBook.hasDouble(id) };
  }

  /** 攻撃を 取り消して よろける（パリィの 成功・はね返しが 当たった）。できたら true */
  applyStagger(id: number, by: StaggerBy): boolean {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.state === 'dying' || e.state === 'leaving' || e.remove) return false;
    if (e.state === 'attack') {
      // 攻撃は 取り消し（このあと 当たらない）。つぎの 攻撃までを はかり直す
      e.model.setMotion('wait');
      e.motion = 'wait';
      e.state = 'chase';
      e.attackSteps = 0;
      e.bestDist = Infinity;
      e.lastProgress = this.steps;
    } else if (e.motion === 'move') {
      e.model.setMotion('wait');
      e.motion = 'wait';
    }
    e.cool = this.coolTicks(e.kind);
    this.stagBook.stagger(id, by);
    e.stag = true;
    e.stagPhase = 0;
    this.opts.onParryEvent?.({ type: 'stagger', yokaiId: id, by });
    return true;
  }

  /** よろけている 間の すがた（ふらふら）。歩かない・向きを かえない・攻撃しない。次の攻撃までを 数えはじめない */
  private staggerPose(e: Ent): void {
    e.cool = this.coolTicks(e.kind);
    e.stagPhase++;
    const t = e.stagPhase;
    e.model.staggerTilt = Math.sin(t * 0.32) * 0.2;
    e.model.staggerTwist = Math.sin(t * 0.21 + 1) * 0.3;
  }

  private staggerClear(e: Ent): void {
    if (e.model.staggerTilt !== 0 || e.model.staggerTwist !== 0) {
      e.model.staggerTilt = 0;
      e.model.staggerTwist = 0;
    }
  }

  /**
   * テスト窓口 `yokai.attackNow(id)`: すぐ 攻撃を 始めさせる（ai が false でも。きょり・次の攻撃までは 見ない）。
   * hitInSteps = 攻撃を 始めてから 当たりを 見るまで（ちょうちんは 火の玉を 投げるまで）。できない（倒れかけ など）は null。
   */
  attackNow(id: number): { hitInSteps: number } | null {
    const e = this.ents.find((q) => q.id === id);
    if (!e || e.state === 'dying' || e.state === 'leaving' || e.state === 'appear' || e.state === 'attack' || e.remove) return null;
    const dx = this.px - e.x;
    const dz = this.pz - e.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) e.yaw = yawToward(dx / d, dz / d); // プレイヤーの方を すぐ向く
    if (e.kind === 'rokurokubi' && !this.planNeck(e)) return null;
    this.startAttack(e);
    return { hitInSteps: Math.round(YOKAI_STATS[e.kind].hitSeconds * 60) };
  }
}
