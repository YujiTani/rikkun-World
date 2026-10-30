import type * as THREE from 'three';
import type { TimeOfDay, VoxelWorld, YokaiKind, YokaiState } from '../../contracts';
import { COUNTRY_TABLE } from '../../world/gen/countryTable';
import type { Rng } from '../../world/gen/random';
import { bodyInWall } from '../../world/wall';
import { YOKAI_DRAW_ORDER, effectiveRow, pickYokaiKind, weightOf, type YokaiRow } from '../countryPick';
import { Chochin } from '../models/chochin';
import { Karakasa } from '../models/karakasa';
import { Nurikabe } from '../models/nurikabe';
import { Rokurokubi } from '../models/rokurokubi';
import { TakoHachimaki } from '../models/tako_hachimaki';
import type { YokaiBase } from '../common';
import type { StaggerBook } from '../stagger';
import { YOKAI_STATS, yokaiStrength } from '../stats';
import { KIND_TRAITS } from '../traits';
import { syncTransform } from './body';
import { AI_CONST, KIND_AI, type YokaiConfig } from './config';
import { DEG, type Ent, type YokaiField } from './entity';
import type { YokaiEvents } from './events';
import type { SpawnOptions, YokaiManagerOptions } from './managerTypes';
import type { YokaiPlacement } from './placement';
import { swimOf, swimTarget, waterDepthBelow, swimYAt } from './swimTerrain';
import { collectFloors, groundSupport, isRoofed, isUnderground } from './terrain';

/** 水の 列で 出る 確率の 分母（重み ÷ 100） */
const SWIM_WEIGHT_UNIT = 100;

interface SpawnerDeps {
  world: VoxelWorld;
  time: Pick<TimeOfDay, 'phase'>;
  f: YokaiField;
  config: YokaiConfig;
  events: Pick<YokaiEvents, 'emit' | 'tick'>;
  /** countryTable・countryOf・canSpawnAt・light・groundY を 使うときに 読む */
  opts: Pick<YokaiManagerOptions, 'countryTable' | 'countryOf' | 'canSpawnAt' | 'light' | 'groundY'>;
  /** 出した妖怪の 見た目・体力のバーを 入れる 入れ物 */
  group: THREE.Group;
  rng: Rng;
  stag: Pick<StaggerBook, 'get'>;
  placement: Pick<YokaiPlacement, 'decidePlace'>;
  /** 妖怪の攻撃が「当たりを見る」瞬間に 呼ぶ（model.onHit に つなぐ） */
  onModelHit: (e: Ent, box: { cx: number; cy: number; cz: number; w: number; h: number; d: number }) => void;
}

/** 高さの はんいを 整数に する ときの 誤差の ゆるし（足が 52.0000001 など でも ちょうどの 床を 外さない） */
const HEIGHT_EPS = 1e-6;

/** 「プレイヤーを 見つけている」状態（MINE-1A §4.3）。どれにも ならないまま 長く たつと 去る */
const FOUND_STATES: ReadonlySet<YokaiState> = new Set<YokaiState>(['chase', 'attack', 'retreat', 'search']);

/**
 * 出現と片づけの係: 妖怪を作る、自動で出す（場所・国・種類のくじ）、遠すぎる妖怪を消す、あさに帰らせる。
 */
const MODEL_OF = {
  karakasa: () => new Karakasa(),
  chochin: () => new Chochin(),
  nurikabe: () => new Nurikabe(),
  rokurokubi: () => new Rokurokubi(),
  tako_hachimaki: () => new TakoHachimaki(),
} satisfies Record<YokaiKind, () => YokaiBase>;

export class YokaiSpawner {
  private nextId = 1;
  private spawnCountdown = 0;
  private readonly floorScratch: number[] = [];

  constructor(private readonly d: SpawnerDeps) {}

  /** テスト用の出し方（決まった数にする）。出た id を返す */
  spawnByHand(kind: YokaiKind, x: number, y: number, z: number, opts: SpawnOptions): number {
    const { events } = this.d;
    const e = this.create(kind, x, y, z, (opts.yawDeg ?? 0) * DEG, false);
    e.ai = opts.ai ?? true;
    e.age = 1000;
    events.emit({ type: 'spawn', tick: events.tick(), id: e.id, kind, position: { x, y, z } });
    // テスト用の出し方は 決まった数にする（m を省くと 1・title を省くと なし）。出た場所で決めるのは 自動の出現だけ
    this.d.placement.decidePlace(e, opts.title ?? 'none', opts.m === 'auto' ? undefined : (opts.m ?? 1));
    return e.id;
  }

  private create(kind: YokaiKind, x: number, y: number, z: number, yaw: number, appear: boolean): Ent {
    const { f, group, rng } = this.d;
    const model = MODEL_OF[kind]();
    if (model instanceof Chochin) model.fireLayer = group;
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
      wanderLeft: 30 + Math.floor(rng() * 90),
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
      airSafe: false,
      knockDx: 0,
      knockDz: 0,
      knockTotal: 0,
      knockT: 0,
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
      swim: null,
      // 自動で 出た 妖怪だけ 見つけられない まま 去る（MINE-1A §4.3。ふくらんで 出てくるのも 自動の 出現だけ）
      auto: appear,
      foundAt: f.steps,
    };
    model.onHit = (ev) => this.d.onModelHit(e, ev.box);
    model.root.scale.setScalar(Math.max(e.appearScale, 1e-4));
    group.add(model.root);
    f.ents.push(e);
    syncTransform(e);
    return e;
  }

  /** 光の少ない場所か: 空が見えない（上がふさがっている）か、よる */
  spawnTick(): void {
    if (!this.d.config.yokaiAutoSpawn) return;
    if (this.spawnCountdown > 0) {
      this.spawnCountdown--;
      return;
    }
    // 間かくと 上限は プレイヤーが 今 いる 所（地上か 地下）の 数を 使う（MINE-1A §4.3）
    const under = this.playerUnder();
    const interval = under ? this.d.config.yokaiSpawnIntervalUnder : this.d.config.yokaiSpawnInterval;
    this.spawnCountdown = Math.max(1, interval) - 1;
    this.trySpawn(under);
  }

  /** プレイヤーは 地下に いるか。groundY（生成の 地形の 高さ）が なければ いつも 地上 */
  private playerUnder(): boolean {
    const { f, opts } = this.d;
    return opts.groundY !== undefined && isUnderground(f.py, opts.groundY(f.px, f.pz));
  }

  /** COUNTRY-1: その場所の 国の行（行 × 倍率の 合計が 0 なら ものさしの行 = はらっぱ） */
  private rowAt(x: number, z: number): { country: string; row: YokaiRow } {
    const { opts, config } = this.d;
    const table = opts.countryTable ?? COUNTRY_TABLE;
    const country = opts.countryOf ? opts.countryOf(x, z) : 'harappa';
    const base = table.find((r) => r.kind === 'harappa')?.yokai ?? {};
    const row = table.find((r) => r.kind === country)?.yokai ?? {};
    return { country, row: effectiveRow(row, config.yokaiWeights, base) };
  }

  /** テストの窓口 `yokai.spawnWeights(x, z)`: その場所で 使う 行 × 全体の倍率（ぬりかべ の 同時の数は 入れない） */
  spawnWeights(x: number, z: number): { country: string; weights: Record<string, number> } {
    const { country, row } = this.rowAt(x, z);
    const weights: Record<string, number> = {};
    for (const k of YOKAI_DRAW_ORDER) weights[k] = weightOf(row, this.d.config.yokaiWeights, k);
    return { country, weights };
  }

  /** 数に上限がある妖怪（traits.limitedCount = ぬりかべ）が 今 何体 いるか */
  private countLimited(): number {
    let n = 0;
    for (const e of this.d.f.ents) if (KIND_TRAITS[e.kind].limitedCount) n++;
    return n;
  }

  private trySpawn(under: boolean): void {
    const { world, time, f, config, opts, rng, events } = this.d;
    if (f.ents.length >= (under ? config.yokaiMaxUnder : config.yokaiMax)) return;
    const night = time.phase() === 'night';
    const minD = Math.max(config.yokaiSpawnMinDist, config.yokaiSpawnNearExclude);
    const maxD = Math.max(minD, config.yokaiSpawnMaxDist);
    // 出る 高さ: 床の 足の 高さが プレイヤーの 足 ±yokaiSpawnHeight の 中（地上も 地下も 同じ。MINE-1A §4.3）
    const lo = Math.ceil(f.py - config.yokaiSpawnHeight - HEIGHT_EPS);
    const hi = Math.floor(f.py + config.yokaiSpawnHeight + HEIGHT_EPS);
    for (let t = 0; t < AI_CONST.spawnTries; t++) {
      const a = rng() * Math.PI * 2;
      const d = minD + rng() * (maxD - minD);
      const x = f.px + Math.sin(a) * d;
      const z = f.pz - Math.cos(a) * d;
      if (!bodyInWall(x, z, 2)) continue;
      // 出る場所は 読みこんでいる列だけ。つなぎ込みが「描く輪のメッシュずみの列」を聞く窓口を渡す
      if (!world.isLoaded(Math.floor(x), Math.floor(z))) continue;
      if (opts.canSpawnAt && !opts.canSpawnAt(x, z)) continue;
      // 立てる床（固くて、はっぱ・水でない、上が空気）を 足 ±yokaiSpawnHeight の 中だけ 列から集めて、1 つえらぶ
      const floors = this.floorScratch;
      const ix = Math.floor(x);
      const iz = Math.floor(z);
      const water = collectFloors(world, ix, iz, lo, hi, floors);
      // M5: みず の列（うみ・かわ・いずみ・いけ）には 陸の 妖怪は 出ない。およぐ 妖怪（TAKO-1）だけ 出る。見るのは 足 ±yokaiSpawnHeight の 中だけ
      if (water) {
        let waterTop = -1; // はんいの 中で 列の いちばん 上の 水の マスの 高さ
        for (let y = Math.min(hi, world.size.y - 1); y >= lo && waterTop < 0; y--) if (world.getBlock(ix, y, iz) === 'water') waterTop = y;
        if (waterTop >= 0 && this.trySpawnSwimmer(x, z, waterTop)) return;
        continue;
      }
      if (floors.length === 0) continue;
      const top = floors[Math.floor(rng() * floors.length)]!;
      // COUNTRY-1 §3.3: 場所 → 国 → 種類。種類は その場所の 国の行で えらぶ（だめなら この ためしは しっぱい）
      const limitedFull = this.countLimited() >= config.nurikabeMax;
      const kind = pickYokaiKind(this.rowAt(x, z).row, config.yokaiWeights, limitedFull, rng());
      if (!kind) continue;
      const ai = KIND_AI[kind];
      const T = groundSupport(world, x, z, top, ai);
      if (Number.isNaN(T)) continue;
      // 光の少ない場所だけ: 屋根の下、またはよる
      const light = opts.light;
      if (light) {
        if (!light.isDarkForSpawn(x, T, z)) continue;
        // M3 AC3: ゆうがたの終わりごろで空の光が弱まっても、外（空の下）には出ない。出るのは屋根の下か、よる
        if (!night && !isRoofed(world, x, T, z, ai.height)) continue;
      } else if (!isRoofed(world, x, T, z, ai.height) && !night) continue;
      const e = this.create(kind, x, T, z, rng() * Math.PI * 2, true);
      events.emit({ type: 'spawn', tick: events.tick(), id: e.id, kind, position: { x, y: T, z } });
      this.d.placement.decidePlace(e, null);
      return;
    }
  }

  /**
   * TAKO-1 §4.3: 水の 列に およぐ 妖怪を 出す。ひる・よる どちらも（暗さ・屋根は 見ない）。
   * 出る 確率 = その 国の 行の 重み ÷ 100（重みの 倍率も かける）。同時の 数の 上限は config.takoHachimakiMax。
   * 水の 深さが たりない 列・体が 入らない 所には 出さない。出せたら true。
   */
  private trySpawnSwimmer(x: number, z: number, waterTop: number): boolean {
    const { world, config, events, rng } = this.d;
    const { row } = this.rowAt(x, z);
    for (const kind of YOKAI_DRAW_ORDER) {
      const sw = swimOf({ kind });
      if (!sw) continue;
      if (this.countSwimmers() >= config.takoHachimakiMax) return false;
      if (!(rng() < weightOf(row, config.yokaiWeights, kind) / SWIM_WEIGHT_UNIT)) continue;
      const surface = waterTop + 1;
      if (waterDepthBelow(world, x, z, surface, sw.minWaterDepth) < sw.minWaterDepth) return false;
      const ai = KIND_AI[kind];
      const y = swimYAt(surface, ai, sw.depthSpawn);
      if (Number.isNaN(swimTarget(world, ai, sw, x, z, y, 0))) return false;
      const e = this.create(kind, x, y, z, rng() * Math.PI * 2, true);
      events.emit({ type: 'spawn', tick: events.tick(), id: e.id, kind, position: { x, y, z } });
      this.d.placement.decidePlace(e, null);
      return true;
    }
    return false;
  }

  /** およぐ 妖怪が 今 何体 いるか */
  private countSwimmers(): number {
    let n = 0;
    for (const e of this.d.f.ents) if (KIND_TRAITS[e.kind].swims) n++;
    return n;
  }

  /** M5: プレイヤーから水平 64 より遠い妖怪は、そのステップで静かに消える（落とし物なし） */
  farTick(): void {
    const { world, f } = this.d;
    const lim = AI_CONST.farRemoveDist;
    for (const e of f.ents) {
      if (e.remove) continue;
      const dx = e.x - f.px;
      const dz = e.z - f.pz;
      if (dx * dx + dz * dz > lim * lim) e.remove = true;
      // 列が捨てられたら、その列の妖怪は 静かに消す（VOX-D。落とし物なし）
      else if (!world.isLoaded(Math.floor(e.x), Math.floor(e.z))) e.remove = true;
    }
  }

  leaveTick(): void {
    const { world, time, f, config, rng, stag } = this.d;
    if (time.phase() !== 'dawn') return;
    for (const e of f.ents) {
      if (KIND_TRAITS[e.kind].swims) continue; // 水の 中の 妖怪は ひるも いる（あさに 帰らない）
      if (e.leaveAt < 0 && e.state !== 'dying' && e.state !== 'leaving') {
        if (isRoofed(world, e.x, e.y, e.z, e.dims.height)) {
          e.leaveAt = -2; // 屋根の下の妖怪は残ってよい
          continue;
        }
        const attackTicks = Math.ceil(YOKAI_STATS[e.kind].attackSeconds * 60);
        const room = Math.max(1, config.yokaiLeaveTicks - 66 - attackTicks - 2);
        e.leaveAt = f.steps + Math.floor(rng() * room);
      }
      // よろけている 間は 帰らない（よろけが おわってから）
      if (e.leaveAt >= 0 && f.steps >= e.leaveAt && e.state !== 'attack' && e.state !== 'dying' && e.state !== 'leaving' && !stag.get(e.id)) {
        this.startLeave(e, 'dawn');
      }
    }
  }

  /**
   * MINE-1A §4.3: 自動で 出た 妖怪が プレイヤーを 見つけない まま yokaiForgetSteps ステップ たつと、夜明けと 同じ 去りかたで そっと 去る（おとし物は ない）。
   * 見つけると（chase・attack・retreat・search）数えなおし。ヌシと 手で 出した 妖怪は 去らない。横 64 より 遠いと 消える きまり（farTick）とは べつ
   */
  forgetTick(): void {
    const { f, config, stag } = this.d;
    for (const e of f.ents) {
      if (!e.auto || e.remove || e.state === 'dying' || e.state === 'leaving') continue;
      if (FOUND_STATES.has(e.state)) {
        e.foundAt = f.steps;
        continue;
      }
      if (f.steps - e.foundAt < config.yokaiForgetSteps || e.title === 'nushi') continue;
      // よろけている 間は 去らない（夜明けと 同じ。よろけが おわってから）
      if (!stag.get(e.id)) this.startLeave(e, 'forget');
    }
  }

  private startLeave(e: Ent, why: 'dawn' | 'forget'): void {
    const { events } = this.d;
    e.state = 'leaving';
    e.model.die();
    events.emit({ type: 'leave', tick: events.tick(), id: e.id, kind: e.kind, position: { x: e.x, y: e.y, z: e.z }, why });
  }
}
