// 家を 建てる 流れの つなぎ役（HOUSE-1C PR-2 #340）。建築中の 家・一覧と 上空の 視点・みずもり・どうづき・完成の 盛り上げを まとめて 持ち、
// HouseSystem が 1 ステップごとに update を 呼ぶ。DOM・three なし。世界は 窓口（HouseWorld）だけで 読む。
import type { BlockId, ItemId, Vec3 } from '../../contracts';
import { isVanishingFlora } from '../../world/blocks/flora';
import { isLeafId } from '../../world/blocks/blockTypes';
import { recordHouse, writeShape } from '../shape';
import type { HouseBook } from '../book';
import type { Blueprint } from '../editor/blueprint';
import { houseBuildTicks, needBonusOf, type NeedRow } from '../editor/model';
import { standY, type HouseWorld } from '../ground';
import type { ArchitectManager } from '../manager';
import { HouseBuilder, type ActiveBuild, type BuilderSave } from './builder';
import { HouseCelebrate } from './celebrate';
import { BuildFlow, doorOffset, type FlowPlan } from './flow';
import { LevelTool } from './level';
import { findSites, type Site } from './sites';
import { Dozuki } from './tamp';
import { EVICT, HAMMER_HEAR_RANGE, KEEP_OUT, SITE, buildingSay, toolKindOf } from './tuning';

/** 音・演出の 知らせ（wire/house.ts が 鳴らす）。hammer は 戸から HAMMER_HEAR_RANGE 以内の ときだけ 来る */
export type HouseSfx = { k: 'level' } | { k: 'dozuki'; hard: boolean } | { k: 'start' } | { k: 'hammer' } | { k: 'done' };

type BuildWorld = HouseWorld & { setBlock(x: number, y: number, z: number, id: BlockId): boolean };

export interface GlueDeps {
  world: BuildWorld;
  player(): Vec3;
  held(): ItemId | null;
  /** 持ち物の せっけいず（マスの 番号つき） */
  plans(): Array<Blueprint & { slot: number }>;
  /** くらの 数 */
  have(item: ItemId): number;
  /** くらから へらす */
  consume(item: ItemId, n: number): number;
  /** テスト用の 建築の 長さ（0 以下 ＝ 式） */
  buildTicks(): number;
  book: HouseBook;
  manager: Pick<ArchitectManager, 'assignBuild' | 'finishBuild' | 'get'>;
  /** いま 話して いる 建築士さん（なければ null） */
  speaker(): string | null;
  /** いちばん はじめの 建築士さんの id（話して いない ときの 代わり） */
  fallbackArchitect(): string | null;
  play(e: HouseSfx): void;
  teleport(x: number, y: number, z: number): void;
  /** 箱の 中の 動物・妖怪を 外の 立てる 場所（spots。近い 順。足りなければ くりかえす）へ */
  evict(box: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }, spots: readonly Vec3[]): void;
}

export class BuildGlue {
  readonly builder: HouseBuilder;
  readonly flow: BuildFlow;
  readonly level: LevelTool;
  readonly dozuki: Dozuki;
  readonly celebrate = new HouseCelebrate();
  /** 世界の 歩数（どうづきの 20 ステップの 数え） */
  private steps = 0;

  constructor(private readonly d: GlueDeps) {
    const w = d.world;
    this.level = new LevelTool((x, y, z) => {
      if (!w.isSolid(x, y, z)) return false;
      const id = String(w.getBlock(x, y, z));
      return !isLeafId(id);
    });
    this.dozuki = new Dozuki(w);
    this.builder = new HouseBuilder({ world: w, shape: (b) => writeShape(w, b.bp, b.at), record: (b) => this.record(b) });
    this.flow = new BuildFlow({
      plans: () => this.cards(),
      findSites: (bp) => this.sitesFor(bp),
      begin: (slot, bp, site) => this.begin(slot, bp, site),
    });
  }

  // ------------------------------------------------------------ 材料・一覧

  /** せっけいずの 材料（おまけを ひく）。slot 以外の 形も そのまま 受ける */
  needRows(bp: Pick<Blueprint, 'w' | 'd' | 'windows' | 'furniture'>): Array<NeedRow & { bonus: number }> {
    return needBonusOf(bp, (item) => this.d.have(item), this.builder.firstBonus());
  }

  /** 一覧の カード（画面用）: マスの 番号・名前・中の よこ たて・材料が そろって いるか */
  pickList(): Array<{ slot: number; name: string; w: number; d: number; enough: boolean }> {
    return this.cards().map((c) => ({ slot: c.slot, name: c.bp.name.front + c.bp.name.back, w: c.bp.w, d: c.bp.d, enough: c.enough }));
  }

  private cards(): FlowPlan[] {
    return this.d.plans().map((bp) => ({ slot: bp.slot, bp, enough: this.needRows(bp).every((r) => r.short === 0) }));
  }

  // ------------------------------------------------------------ 場所

  /** 床の 段の 高さ（プレイヤーの 足の すぐ 下） */
  private floorY(): number {
    return Math.floor(this.d.player().y + 1e-6) - 1;
  }

  private sitesFor(bp: Blueprint): Site[] {
    const p = this.d.player();
    const a = this.builder.active();
    const used = a ? [{ x: a.at.x, y: a.at.y, z: a.at.z, w: a.bp.w + 2, d: a.bp.d + 2 }] : [];
    return findSites(this.d.world, Math.floor(p.x), this.floorY(), Math.floor(p.z), bp.w + 2, bp.d + 2, doorOffset(bp), used);
  }

  // ------------------------------------------------------------ 建築のはじまり

  /** ［ここに たてる］: 材料を へらし、草花を 消し、中の プレイヤー・動物・妖怪を 外へ、建築士さんを 戸の 前へ、足場を 立てる。はじめられたら true */
  private begin(slot: number, bp: Blueprint, site: Site): boolean {
    if (this.builder.active()) return false;
    const plan = this.d.plans().find((p) => p.slot === slot);
    if (!plan) return false;
    const rows = this.needRows(plan);
    if (rows.some((r) => r.short > 0)) return false;
    const w = this.d.world;
    const outW = bp.w + 2;
    const outD = bp.d + 2;
    const doorX = site.x + doorOffset(bp);
    // 草花は 消える（箱の 中と 戸の 前）
    for (let h = 1; h <= KEEP_OUT.levels; h++) for (let z = 0; z < outD; z++) for (let x = 0; x < outW; x++) if (isVanishingFlora(w.getBlock(site.x + x, site.y + h, site.z + z))) w.setBlock(site.x + x, site.y + h, site.z + z, 'air');
    for (let h = 1; h <= SITE.doorFrontClear; h++) if (isVanishingFlora(w.getBlock(doorX, site.y + h, site.z + outD))) w.setBlock(doorX, site.y + h, site.z + outD, 'air');
    for (const r of rows) if (r.need > 0) this.d.consume(r.item, r.need);
    // 中に いる 物を 外（戸の 前の、しらべた 列から 近い 立てる 所）へ
    const box = { x0: site.x, z0: site.z, x1: site.x + outW, z1: site.z + outD, y0: site.y + 1, y1: site.y + KEEP_OUT.levels + 1 };
    const spots = this.outSpots(box, doorX, site.z + outD, site.y + 1);
    const out = spots[0]!;
    const p = this.d.player();
    if (p.x >= box.x0 && p.x < box.x1 && p.z >= box.z0 && p.z < box.z1 && p.y >= box.y0 - 1.2 && p.y < box.y1) this.d.teleport(out.x, out.y, out.z);
    this.d.evict(box, spots);
    // 建築士さんを 戸の 前へ
    const id = this.d.speaker() ?? this.d.fallbackArchitect() ?? 'first';
    const spot = { x: doorX, z: site.z + outD };
    const stood = this.d.manager.assignBuild(id, spot, null);
    const get = this.d.manager.get(id);
    const home = stood ?? (get ? { x: Math.floor(get.x), y: get.y, z: Math.floor(get.z) } : null);
    this.builder.start({ number: bp.number, bp: { w: bp.w, d: bp.d, windows: bp.windows, furniture: bp.furniture.map((f) => ({ ...f })), name: { front: bp.name.front, back: bp.name.back } }, at: { x: site.x, y: site.y, z: site.z }, architect: id, home }, this.d.buildTicks() > 0 ? this.d.buildTicks() : houseBuildTicks(bp));
    this.d.play({ k: 'start' });
    return true;
  }

  /**
   * 外へ うつす 先。戸の 前の 列（場所さがしで 空きを しらべた 列）から 近い 順に、実際に 立てる 列（箱の 外・standY）を 集める。
   * ひとつも 見つからない ときは 戸の 前の 列の 床の 高さ（フォールバック）
   */
  private outSpots(box: { x0: number; z0: number; x1: number; z1: number }, fx: number, fz: number, fy: number): Vec3[] {
    const out: Vec3[] = [];
    for (let r = 0; r <= EVICT.radius && out.length < EVICT.spots; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || out.length >= EVICT.spots) continue;
          const x = fx + dx;
          const z = fz + dz;
          if (x >= box.x0 && x < box.x1 && z >= box.z0 && z < box.z1) continue;
          const y = standY(this.d.world, x, z);
          if (y !== null) out.push({ x: x + 0.5, y, z: z + 0.5 });
        }
      }
    }
    return out.length > 0 ? out : [{ x: fx + 0.5, y: fy, z: fz + 0.5 }];
  }

  // ------------------------------------------------------------ 完成

  /** 完成の 記録（houses()・盛り上げ）。形の 書きこみは builder が 場所の 読みこみを 待って shape で する */
  private record(b: Pick<ActiveBuild, 'number' | 'bp' | 'at'>): void {
    const rec = recordHouse(this.d.book, b.bp, b.number, b.at);
    this.celebrate.fire(rec.name);
    this.d.play({ k: 'done' });
  }

  // ------------------------------------------------------------ 1 ステップ

  /** 世界の 時間が すすんで いる 間だけ。建築の 進み・とんかち・完成 */
  update(): void {
    this.steps++;
    this.celebrate.step();
    const a = this.builder.active();
    const arch = a ? this.d.manager.get(a.architect) : undefined;
    const done = this.builder.update();
    if (done) this.d.manager.finishBuild(done.architect);
    if (a && arch?.takeHit() && this.heard(a)) this.d.play({ k: 'hammer' });
  }

  /** 戸から 16 マス 以内か（とんかちの 音が 聞こえる） */
  private heard(a: ActiveBuild): boolean {
    const p = this.d.player();
    return Math.hypot(p.x - (a.at.x + doorOffset(a.bp) + 0.5), p.z - (a.at.z + a.bp.d + 2)) <= HAMMER_HEAR_RANGE;
  }

  // ------------------------------------------------------------ 道具

  /** みずもりで ブロックを 右クリック */
  useLevel(x: number, y: number, z: number): void {
    this.level.setBase(x, y, z);
    this.d.play({ k: 'level' });
  }

  /** どうづきで ブロックを 右クリック（20 ステップに 1 回だけ 効く） */
  useTamp(x: number, y: number, z: number): void {
    const r = this.dozuki.tap(x, y, z, this.steps);
    if (r.kind !== 'cooling') this.d.play({ k: 'dozuki', hard: r.kind === 'soft' });
  }

  levelView(): ReturnType<LevelTool['view']> {
    const p = this.d.player();
    return this.level.view(toolKindOf(this.d.held()) === 'level', p.x, p.z);
  }

  // ------------------------------------------------------------ 窓口

  busyText(): string | null {
    const v = this.builder.view();
    return v ? buildingSay(v.name, v.leftText) : null;
  }

  // ------------------------------------------------------------ 保存

  serialize(): BuilderSave {
    return this.builder.serialize();
  }

  load(raw: unknown): void {
    this.builder.load(raw);
    this.level.setBaseNone();
    this.dozuki.reset();
    this.flow.reset();
    this.restoreArchitect();
  }

  /** 読みこんだ あと 建築中の 家が あれば、建築士さんを 戸の 前へ もどす */
  private restoreArchitect(): void {
    const a = this.builder.active();
    if (!a) return;
    this.d.manager.assignBuild(a.architect, { x: a.at.x + doorOffset(a.bp), z: a.at.z + a.bp.d + 2 }, a.home ? { x: a.home.x, z: a.home.z } : null);
  }
}
