import { SEA_Y, type VoxelWorld, type YokaiTitle } from '../../contracts';
import type { Rng } from '../../world/gen/random';
import { colorStage, locationMAt } from '../location';
import { YOKAI_STATS, yokaiStrength } from '../stats';
import { ANNOUNCE_TICKS, TITLE_RULES, isBigTitle, limitTitle, rollTitle, titleAnnounceText } from '../title';
import { boxFreeAt, scaledDims } from './body';
import { applyDollBrightness } from './brightness';
import { AI_CONST } from './config';
import type { Ent, YokaiField } from './entity';
import type { YokaiEvents } from './events';
import type { AnnounceInfo, YokaiManagerOptions } from './managerTypes';
import type { YokaiPresenter } from './presenter';
import { swimOf, swimTarget } from './swimTerrain';
import { groundSupport } from './terrain';

interface PlacementDeps {
  world: VoxelWorld;
  f: YokaiField;
  events: Pick<YokaiEvents, 'emit' | 'tick'>;
  /** origin・seaY・strength を 使うときに 読む */
  opts: Pick<YokaiManagerOptions, 'origin' | 'seaY' | 'strength'>;
  /** 二つ名の抽選（出現の乱数の並びを変えないように別に持つ） */
  titleRng: Rng;
  marks: Pick<YokaiPresenter, 'refreshBar'>;
}

/**
 * 場所と二つ名の係: 出た場所の倍率 M と二つ名を決め、体力・攻撃力・経験値・大きさ・色を計算する。登場のおしらせも持つ。
 */
export class YokaiPlacement {
  private announceNow: AnnounceInfo | null = null;

  constructor(private readonly d: PlacementDeps) {}

  /** 1 ステップぶん おしらせの のこりを へらす */
  tickAnnounce(): void {
    if (this.announceNow && --this.announceNow.ticksLeft <= 0) this.announceNow = null;
  }

  clearAnnounce(): void {
    this.announceNow = null;
  }

  /** 登場のおしらせ（テスト窓口 hud.announce と画面用）。出ていなければ null */
  announce(): AnnounceInfo | null {
    return this.announceNow ? { ...this.announceNow } : null;
  }

  /** 二つ名を決めなおす（体力・攻撃力・大きさを 計算しなおす。体力は割合をたもつ。§6 のきまりを通る） */
  setTitle(id: number, title: YokaiTitle): boolean {
    const e = this.d.f.ents.find((q) => q.id === id);
    if (!e || e.remove) return false;
    const taken = this.bigTaken(e);
    this.applyStats(e, limitTitle(e.kind, title, taken));
    this.d.marks.refreshBar(e);
    return true;
  }

  /** たいしょう・ヌシ が（ほかに）いるか。たおれた・帰る・消える物は数えない */
  private bigTaken(except: Ent | null): boolean {
    return this.d.f.ents.some((q) => q !== except && isBigTitle(q.title) && !q.remove && q.state !== 'dying' && q.state !== 'leaving');
  }

  /**
   * 出すと決まった場所で M と二つ名を決める（出現で呼ぶのは ここ 1 か所。VOX-B・VOX-G の出現は create のあとに これを呼べばよい）。
   * request = null なら 抽選（シード付き）。m を省くと 出た場所 (x, y, z) から。
   * 体が入らない所では 二つ名なし（§6）。
   */
  decidePlace(e: Ent, request: YokaiTitle | null, m?: number): void {
    const { opts, events } = this.d;
    const origin = opts.origin?.() ?? { x: 0, z: 0 };
    e.m = m ?? locationMAt({ x: e.x, y: e.y, z: e.z }, origin, opts.seaY?.() ?? SEA_Y);
    const taken = this.bigTaken(e);
    let title = request === null ? rollTitle(this.d.titleRng, e.kind, taken) : limitTitle(e.kind, request, taken);
    if (title !== 'none' && !this.fits(e, title)) title = 'none';
    this.applyStats(e, title);
    if (title === 'none') return;
    const text = titleAnnounceText(e.model.displayName, title);
    if (text && (title === 'taisho' || title === 'nushi')) this.announceNow = { text, icon: title, ticksLeft: ANNOUNCE_TICKS };
    events.emit({ type: 'titleSound', tick: events.tick(), id: e.id, kind: e.kind, title });
  }

  /** その二つ名の大きさの体が ここに入るか（のぼれる段・はやさは 変えない） */
  private fits(e: Ent, title: YokaiTitle): boolean {
    const { world } = this.d;
    const dims = scaledDims(e.kind, TITLE_RULES[title].bodyScale);
    const swim = swimOf(e);
    if (swim) return !Number.isNaN(swimTarget(world, dims, swim, e.x, e.z, e.y, 0)); // およぐ: 体の 箱が ぜんぶ 水の 中
    if (dims.flies) {
      const r = dims.radius;
      return boxFreeAt(world, e.x - r, e.y + 0.5, e.z - r, e.x + r, e.y + dims.height, e.z + r);
    }
    return !Number.isNaN(groundSupport(world, e.x, e.z, e.y, dims, AI_CONST.maxDrop, !YOKAI_STATS[e.kind].avoidsWater));
  }

  /** M と二つ名から 体力・攻撃力・経験値・大きさ・色を決める */
  private applyStats(e: Ent, title: YokaiTitle): void {
    const st = yokaiStrength(e.kind, e.m, title, this.d.opts.strength ?? 'normal');
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
}
