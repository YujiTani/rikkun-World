/**
 * #293 リリース: がしゃどくろを ふだんの ゲーム（?proto なし）に 出す 係。
 *  ・ゲームの 1 日（あさ）ごとに くじを 引き（約 3 割）、当たると プレイヤーから 150〜250 ブロック先に 1 体だけ 出す。
 *    出し方は 試作の 置き方（gashaBig.ts の place。プレイヤーの 前方 T.place.distance に 置く）を そのまま 使い、
 *    「どの 向きに 置くか」は deps.player() の yawDeg を 置く 間だけ すりかえて きめる。
 *  ・たおす（体力 0）か、プレイヤーが 遠く（despawnDistance）へ はなれると 消える。消すとは「すごく 遠くへ おき直す」こと
 *    （gashaBig.ts に 片づける 口が まだ 無いため。体力も もどる。次の 出番は また place() で 使いまわす）。
 *  ・たおしたら: 実績を 記録 → BGM を 止める → その 場所に 大きな 宝箱（bigChest.ts）→ 近づくと ひらいて 中身（reward.ts）。
 *  ・遠くは 世界が 読みこまれて いない ので、地面の 高さは 地形から、地ならし（fillBlocks）は 列が 読みこまれる まで 待つ。
 * 数は ぜんぶ releaseTuning.ts。ゲームとの つなぎは ReleaseEnv（main.ts が 渡す）。
 */
import type { Object3D, Scene } from 'three';
import type { ItemStack } from '../contracts';
import type { GashaBigDeps } from '../proto/gashaBig';
import { TUNE as BIG } from '../proto/gashaBigTuning';
import { ChestLogic, chestNear, createChestMesh, type ChestMesh, type ChestPhase } from './bigChest';
import { rewardRng, rollReward } from './reward';
import { RELEASE } from './releaseTuning';
import { faceYawDeg, horizontalDistance, pickSpawnSpot, rollMorning, shouldDespawn, type SpawnSpot } from './spawnRule';

/** 試作の 係（gashaBig.ts の GashaBigHandle）のうち、ここで 使う 口 */
export interface BossHandle {
  /** 作りなおして プレイヤーの 前に 置く（体力も もどる） */
  place(): void;
  hp(): number;
  angry(on: boolean): void;
  walk(on: boolean): void;
  /** `pos: [x, y, z]`（体の 足もと） */
  info(): Record<string, unknown>;
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
  /** 読みこんだ 所の 地面の いちばん 上の ブロックの 高さ（宝箱を 置く とき） */
  groundY(x: number, z: number): number;
  scene: Scene;
  /** 昼夜の 明るさの 係。あれば 宝箱の 材料を 登録して 夜は 暗くする */
  lighting?: { registerTree(root: Object3D, group: 'doll'): number; unregister?(m: unknown): void };
  /** 試作の 係を 読みこんで 作る（初めの 1 回だけ。作る とき すでに place() される）。wrap で 入り口を すりかえる */
  start(wrap: DepsWrap): Promise<BossHandle>;
  /** 落ちた アイテムとして ばらまく（DropField.scatter） */
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
}

export type ReleaseState = 'idle' | 'loading' | 'present' | 'defeated';

interface ChestEntry {
  logic: ChestLogic;
  mesh: ChestMesh;
  x: number;
  y: number;
  z: number;
  stacks: ItemStack[];
  removeAt: number | null;
}

interface PendingFill {
  apply(): void;
  cols: [number, number][];
}

export interface SpawnOpts {
  /** プレイヤーからの 距離（ブロック）。なければ dev.distance */
  distance?: number;
  /** 向きの 角度（度。0 = +x（東）、90 = +z（南））。なければ プレイヤーの 正面 */
  angleDeg?: number;
}

export class GashaRelease {
  private st: ReleaseState = 'idle';
  private handle: BossHandle | null = null;
  private placing: { yawDeg: number } | null = null;
  private parking = false;
  private lastDay = -1;
  private checkClock = 0;
  private lingerLeft = 0;
  private killCount = 0;
  private cancelLoad = false;
  private readonly chestList: ChestEntry[] = [];
  private readonly pending: PendingFill[] = [];
  private bossPos: { x: number; y: number; z: number } | null = null;
  private clock = 0;

  constructor(readonly env: ReleaseEnv) {}

  state(): ReleaseState {
    return this.st;
  }

  // ---------------------------------------------------------------- 入り口のすりかえ（試作の 係に わたす）
  readonly wrap: DepsWrap = (d) => {
    const { giveNinjaTabi: _tabi, fillBlocks, ...rest } = d; // 足袋は ごほうび なので はじめから 着せない
    void _tabi;
    return {
      ...rest,
      // 置く 間だけ「プレイヤーが その 向きを 向いて いる」ことに して、前方に 置かせる
      player: () => {
        const p = d.player();
        return this.placing ? { ...p, yawDeg: this.placing.yawDeg } : p;
      },
      // 読みこんで いない 遠くは 地形の 高さ
      groundY: (x, z) => (this.env.isLoaded(x, z) ? d.groundY(x, z) : this.env.terrainTop(x, z)),
      // 地ならしは 列が そろって から（遠くへ しまう ときは しない）
      fillBlocks: fillBlocks
        ? (x0, y0, z0, x1, y1, z1, id) => this.fill(() => fillBlocks(x0, y0, z0, x1, y1, z1, id), [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) >> 1, (z0 + z1) >> 1]])
        : undefined,
    };
  };

  private fill(apply: () => void, cols: [number, number][]): void {
    if (this.parking) return;
    if (cols.every(([x, z]) => this.env.isLoaded(x, z))) apply();
    else this.pending.push({ apply, cols });
  }

  private flushFills(): void {
    for (let i = 0; i < this.pending.length;) {
      const f = this.pending[i]!;
      if (f.cols.every(([x, z]) => this.env.isLoaded(x, z))) { this.pending.splice(i, 1); f.apply(); } else i++;
    }
  }

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
    this.parking = false;
    BIG.place.distance = spot.distance;
    this.placing = { yawDeg: faceYawDeg(spot.dx, spot.dz) };
    try {
      if (this.handle) {
        this.handle.angry(false);
        this.handle.place();
      } else {
        this.handle = await this.env.start(this.wrap); // この 中で 最初の place() が 行われる
      }
    } catch {
      this.placing = null;
      this.st = 'idle';
      return false;
    }
    this.placing = null;
    if (this.cancelLoad) { this.cancelLoad = false; this.st = 'present'; this.despawn(); return false; }
    this.st = 'present';
    this.checkClock = 0;
    this.readPos();
    this.applyBar();
    this.env.sound?.('ready');
    return true;
  }

  /** 消す（たおされた あとも 遠くはなれた ときも）。体を すごく 遠くへ おき直して、当たりも 見えも しなく する */
  despawn(): void {
    if (this.st === 'loading') { this.cancelLoad = true; return; }
    this.pending.length = 0;
    if (!this.handle || this.st === 'idle') { this.st = 'idle'; return; }
    const p = this.env.player();
    this.parking = true;
    BIG.place.distance = RELEASE.defeat.parkDistance;
    this.placing = { yawDeg: p.yawDeg };
    this.handle.angry(false);
    this.handle.place();
    this.handle.angry(false);
    this.handle.walk(false);
    this.placing = null;
    this.parking = false;
    this.pending.length = 0;
    this.bossPos = null;
    this.st = 'idle';
    this.applyBar();
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

  // ---------------------------------------------------------------- たおした
  /** たおした ことに する（体力が 0 に なった とき 自動で 呼ばれる。開発用にも） */
  defeat(): void {
    if (this.st !== 'present') return;
    this.readPos();
    const at = this.bossPos ?? this.env.player();
    this.st = 'defeated';
    this.lingerLeft = RELEASE.defeat.lingerSec;
    this.killCount++;
    this.env.record('defeat:gashadokuro');
    this.env.say('がしゃどくろ を たおした！');
    this.env.bgmReset?.();
    this.handle?.angry(false);
    this.addChest(at.x, at.z);
  }

  private addChest(x: number, z: number): void {
    const y = this.env.groundY(Math.floor(x), Math.floor(z)) + 1;
    const mesh = createChestMesh();
    mesh.group.position.set(x, y, z);
    const p = this.env.player();
    mesh.group.rotation.y = Math.atan2(p.x - x, p.z - z); // 前（+z）を プレイヤーへ
    mesh.setPose(0, 0);
    this.env.scene.add(mesh.group);
    this.env.lighting?.registerTree(mesh.group, 'doll');
    this.chestList.push({ logic: new ChestLogic(), mesh, x, y, z, stacks: rollReward(rewardRng(this.env.seed, this.killCount)), removeAt: null });
  }

  private removeChest(c: ChestEntry): void {
    this.env.scene.remove(c.mesh.group);
    c.mesh.group.traverse((o) => {
      const m = (o as { material?: unknown }).material;
      if (m) this.env.lighting?.unregister?.(m);
    });
    c.mesh.dispose();
  }

  // ---------------------------------------------------------------- 毎コマ
  /** 固定ステップ（1/60 秒）ごとに 呼ぶ */
  step(dt: number): void {
    this.clock += dt;
    this.stepChests(dt);
    if (this.st === 'present') {
      if (this.handle && this.handle.hp() <= 0) { this.defeat(); return; }
      this.checkClock += dt;
      if (this.checkClock >= RELEASE.spawn.checkEverySec) {
        this.checkClock = 0;
        this.readPos();
        this.flushFills();
        if (this.bossPos && shouldDespawn(horizontalDistance(this.env.player(), this.bossPos))) this.despawn();
        else this.applyBar();
      }
    } else if (this.st === 'defeated') {
      this.lingerLeft -= dt;
      this.checkClock += dt;
      if (this.checkClock >= RELEASE.spawn.checkEverySec) { this.checkClock = 0; this.flushFills(); }
      if (this.lingerLeft <= 0) this.despawn();
    }
  }

  private stepChests(dt: number): void {
    if (this.chestList.length === 0) return;
    const p = this.env.player();
    const C = RELEASE.chest;
    for (let i = this.chestList.length - 1; i >= 0; i--) {
      const c = this.chestList[i]!;
      const r = c.logic.step(dt, chestNear(p, c));
      c.mesh.setPose(c.logic.rise, c.logic.lidDeg);
      if (r.dropNow) {
        this.env.scatter({ x: c.x, y: c.y + C.dropUpOffset, z: c.z }, c.stacks, { speedMin: C.scatterSpeed[0], speedMax: C.scatterSpeed[1], upMin: C.scatterUp[0], upMax: C.scatterUp[1] });
        this.env.sound?.('levelUp');
      }
      if (c.logic.phase === 'open' && c.removeAt === null) c.removeAt = this.clock + C.stayOpenSec;
      if (c.removeAt !== null && this.clock >= c.removeAt) {
        this.chestList.splice(i, 1);
        this.removeChest(c);
      }
    }
  }

  // ---------------------------------------------------------------- 見る（テスト・開発用）
  chests(): { x: number; y: number; z: number; phase: ChestPhase; lidDeg: number; items: string[] }[] {
    return this.chestList.map((c) => ({ x: c.x, y: c.y, z: c.z, phase: c.logic.phase, lidDeg: c.logic.lidDeg, items: c.stacks.map((s) => `${s.item}x${s.count}`) }));
  }

  info(): { state: ReleaseState; pos: { x: number; y: number; z: number } | null; distance: number | null; pendingFills: number; chests: number; lastDay: number; kills: number } {
    const pos = this.bossPos;
    return {
      state: this.st,
      pos: pos ? { ...pos } : null,
      distance: pos ? horizontalDistance(this.env.player(), pos) : null,
      pendingFills: this.pending.length,
      chests: this.chestList.length,
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
  /** たおした ことに する（宝箱・実績・BGM） */
  defeat(): void;
  /** あさの くじを 引く（day を 省くと 次の 日） */
  morning(day?: number): void;
  chests: GashaRelease['chests'];
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
    chests: () => rel.chests(),
    tune: RELEASE,
    bigTune: BIG,
  };
}
