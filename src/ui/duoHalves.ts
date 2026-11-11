import type { Camera } from 'three';
import type { DayPhase } from '../contracts';
import type { TimeSettings } from '../time/config';
import { halfOf, newViewRectsScratch, viewRects, type Rect, type ViewRects } from '../duo/viewRects';
import { DUO_TUNING } from '../duo/tuning';
import { StaggerIcons, type StaggerIconItem } from '../fx/parryFx';
import { createBuffModel, type BuffModel, type BuffWanted } from './buffIconsModel';
import { BuffIcons } from './buffIcons';
import { Clock } from './clock';
import type { ClockPhases } from './clockModel';
import { CraftHint } from './craftHint';
import { DamageEdge } from './damageEdge';
import type { DeathScreen } from './deathScreen';
import { tokenPx, viewWidth } from './duoAimHud';
import { DUO_HALF_ID, halfId, type HalfKey } from './duoHalfIds';
import { clampToHalf, ndcToHalf } from './halfProject';
import { HomeNotice } from './homeNotice';
import { InkDim } from './inkDim';
import type { MachoMarkInput, MachoMarks } from './machoMarks';
import { TitleAnnounce, type AnnounceState } from './titleAnnounce';
import { YokaiNameplates, type NameplateItem } from './yokaiNameplates';
import './duoHalves.css';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g) #13〜#22b・§9.13・§12.0）: 2 人の とき、出る 物は ぜんぶ その 人の 半分の 中。
 * 「どの 要素を どの 半分に 置くか」の 純関数（DOM・Three.js なし。duoHalves.test.ts）と、2P の 半分の 部品を 持つ class `DuoHalves`（参加して はじめて 作る）。
 * 1P の 要素は 今の 要素を 使い回し（2 人の あいだ だけ data-testid を 足す）、2 人の ときの 位置は ui/duoHalves.css（`html[data-duo]`）。1 人の ときは 何も かわらない。
 * import しただけでは document を さわらない。
 */

export { DUO_HALF_ID, halfId, type HalfKey };
export { clampToHalf, ndcToHalf };

export type Who = 1 | 2;
/** 実績の 持ち主などの 「だれの 物か」。世界で 1 つの 物は 'world' */
export type Owner = Who | 'world';

/** だれの 半分に 出すか（'world' = 両方に 同じ 物 / 'who' = 起こした 人・もちぬし・ねらった 人 / 'owners' = 持ち主の 列から きめる） */
export const HALF_OWNER = {
  titleAnnounce: 'world', // #13 世界で 1 つ → 両方の 半分の 上に 同じ 物
  homeNotice: 'who', // #14 復活した 人の 半分
  damageEdge: 'who', // #15 当たった 人の 半分の ふち
  death: 'who', // #16 倒れた 人の 半分だけ
  clock: 'world', // #17 各半分の 外がわの 上すみに 同じ 物 2 つ
  band: 'owners', // #18 達成した 人の 半分（世界が 達成した 物は 両方）
  banner: 'who', // #19 横断幕・紙ふぶき: 2 人の とき 1P の 半分だけ
  hudNotice: 'who', // #20 つくれる マーク（メダルの 印は 1P だけ。hudNoticeShow）
  nameplate: 'who', // #21 半分ごとに その 半分の カメラ
  buffPlate: 'who', // #22 その人の ホットバーの 札
  noticeName: 'who', // #22a えらんだ 人の 半分
  inkDim: 'who', // #22b すみを かぶった 人の 半分だけ
} as const satisfies Record<HalfKey, 'world' | 'who' | 'owners'>;

/** その 半分の 高さに 対する 上はしの 割合（今の css の top と 同じ 数。titleAnnounce.css 14%・homeNotice.css 30%・celebrate.css 横断幕 22%） */
export const HALF_SLOT_RATIO = { titleAnnounce: 0.14, homeNotice: 0.3, banner: 0.22 } as const;

// ---- だれの 半分か（毎回 新しい 配列を 作らない ために 定数を 返す）----
const ONE: readonly Who[] = [1];
const TWO: readonly Who[] = [2];
const BOTH: readonly Who[] = [1, 2];

/** 持ち主の 半分。1 人（joined=false）は いつも [1]（全面） */
export function halvesOf(owner: Owner, joined: boolean): readonly Who[] {
  if (!joined) return ONE;
  return owner === 'world' ? BOTH : owner === 1 ? ONE : TWO;
}

/** 持ち主の 列の 和（順番は 1, 2）。空・null（セーブから 戻した 物）・'world' が まざれば 両方 */
export function halvesOfAll(owners: readonly (Owner | null)[], joined: boolean): readonly Who[] {
  if (!joined) return ONE;
  if (owners.length === 0) return BOTH;
  let has1 = false;
  let has2 = false;
  for (const o of owners) {
    if (o === null || o === 'world') return BOTH;
    if (o === 1) has1 = true;
    else has2 = true;
  }
  return has1 && has2 ? BOTH : has1 ? ONE : TWO;
}

/** HALF_OWNER で 振りわける */
export function halvesForKey(key: HalfKey, joined: boolean, who: Who = 1, owners: readonly Owner[] = []): readonly Who[] {
  const o = HALF_OWNER[key];
  return o === 'world' ? halvesOf('world', joined) : o === 'who' ? halvesOf(who, joined) : halvesOfAll(owners, joined);
}

/** 1.17: もちもの画面・家の 画面・にわとりの メニューを 開いた とき 消す 半分 = 開いた 人の 半分だけ（1 人の ときは 今の まま ぜんぶ = [1]） */
export function halvesCoveredBy(who: Who, joined: boolean): readonly Who[] {
  return halvesOf(who, joined);
}

/** 1.17: つくれる マークは 各自の 半分、メダルの 印（実績の 保留数）は 世界で 1 つ → 2 人の とき 1P の 半分だけ。2P が いなくて who=2 は 何も 出さない */
export function hudNoticeShow(who: Who, joined: boolean, craftable: boolean, medals: number, out: { craft: boolean; medal: number } = { craft: false, medal: 0 }): { craft: boolean; medal: number } {
  const none = who === 2 && !joined;
  out.craft = !none && craftable;
  out.medal = none || who === 2 ? 0 : medals;
  return out;
}

// ---- 置き場所 ----
export type HalfSlot = 'titleAnnounce' | 'homeNotice' | 'clock' | 'band' | 'banner' | 'noticeName';

/** tokens.css の sp-5（設計 24px）。時計の 外がわの 上すみ・すき間 */
const SP5 = 24;

/** 中央に そろえる 部品（半分の はば × hotbarFit が いちばん 広い はば） */
function isCentered(slot: HalfSlot): boolean {
  return slot === 'titleAnnounce' || slot === 'homeNotice' || slot === 'band' || slot === 'banner';
}

/** 2 人の とき（2P の 半分が ある）true */
function isSplit(rects: ViewRects): boolean {
  return halfOf(rects, 2) !== null;
}

/** その 半分の 中の 基準の 点（CSS px）。2P が いなくて who=2 は null。y = null は css〔--duo-band-top・bottom〕で 決まる */
export function slotAt(rects: ViewRects, who: Who, slot: HalfSlot): { x: number; y: number | null } | null {
  const r = halfOf(rects, who);
  if (!r) return null;
  if (slot === 'clock') {
    const sp = tokenPx(SP5, viewWidth(rects));
    if (!isSplit(rects)) return { x: r.x + r.w - sp, y: sp }; // 1 人: 右上（今の まま）
    return { x: who === 1 ? r.x + sp : r.x + r.w - sp, y: sp };
  }
  const x = r.x + r.w / 2;
  if (slot === 'band' || slot === 'noticeName') return { x, y: null };
  return { x, y: r.y + HALF_SLOT_RATIO[slot] * r.h };
}

/** 中央に そろえる 部品の いちばん 広い はば。2 人の とき 半分の はば × hotbarFit。それ以外・1 人の ときは null（今の css の まま） */
export function slotMaxWidth(rects: ViewRects, who: Who, slot: HalfSlot): number | null {
  const r = halfOf(rects, who);
  if (!r || !isSplit(rects) || !isCentered(slot)) return null;
  return r.w * DUO_TUNING.hotbarFit;
}

/** つくれる マーク（#hud-notice）の 右はし x = 半分の まん中 + ホットバーの はば × 縮め倍 / 2 */
export function hudNoticeRight(rects: ViewRects, who: Who, hotbarW: number, duoScale: number): number | null {
  const r = halfOf(rects, who);
  return r ? r.x + r.w / 2 + (hotbarW * duoScale) / 2 : null;
}

/** 時計の 箱（CSS px。size = DOM の 実測）。2 人の 1P = 左上・2P = 右上・1 人 = 右上。2P が いなくて who=2 は null。矢印が よける 四角に 使う */
export function clockBoxAt(rects: ViewRects, who: Who, size: { w: number; h: number }, out: Rect = { x: 0, y: 0, w: 0, h: 0 }): Rect | null {
  const at = slotAt(rects, who, 'clock');
  if (!at) return null;
  const right = !isSplit(rects) || who === 2;
  out.x = right ? at.x - size.w : at.x;
  out.y = at.y ?? 0;
  out.w = size.w;
  out.h = size.h;
  return out;
}

// ---- 2P の 半分の 部品（DOM。参加して はじめて 作る）----

/** 1P の 部品（今の 要素。2 人の あいだ だけ 目印を つけ、css が 1P の 半分に おさめる） */
export interface Halves1P {
  titleAnnounce: TitleAnnounce;
  clock: Clock;
  homeNotice: HomeNotice;
  edge: DamageEdge;
  inkDim: InkDim;
  deathScreen: DeathScreen;
  buff: BuffIcons;
  craft: CraftHint;
  nameplates: YokaiNameplates;
  /** 1P の ひるみの 印（2P の 分は twin として つなぐ） */
  stagger: StaggerIcons;
  macho: MachoMarks;
}

export interface DuoHalvesDeps {
  hud: HTMLElement;
  clockPhases?: ClockPhases;
  p1: Halves1P;
  /** 2P の ホットバーの 上の かたまり（`#hud-self-p2`）。バフの 札を 入れる */
  cluster2: () => HTMLElement;
  /** 上の 帯（2 つ）と 横断幕・紙ふぶき（1P の 半分）。ui/celebrate/index.ts の CelebrateUi */
  celebrate: { setDuo(on: boolean): void; setHalf(rect: Rect | null): void };
}

/** 1P の 区画に 毎ステップ 渡す 世界の 物（step.ts が 入れる。区画ごとの 投げは beforePane の projectPane） */
export interface PaneFeed {
  plates: readonly NameplateItem[];
  stagger: readonly StaggerIconItem[];
  /** 名札・ひるみの 印を 出して よい（遊びの 画面） */
  visible: boolean;
  macho: MachoMarkInput | null;
}

interface Built {
  title: TitleAnnounce;
  clock: Clock;
  home: HomeNotice;
  edge: DamageEdge;
  ink: InkDim;
  buff: BuffIcons;
  buffModel: BuffModel;
  craft: CraftHint;
  plates: YokaiNameplates;
  stagger: StaggerIcons;
}

const NO_ITEMS: readonly NameplateItem[] = [];

export class DuoHalves {
  private b: Built | null = null;
  private on = false;
  /** 2P の 名札の 材料（毎ステップ 同じ 入れものに 書く） */
  readonly plates2: NameplateItem[] = [];
  /** 1P の 区画に 渡す 世界の 物 */
  readonly feed: PaneFeed = { plates: NO_ITEMS, stagger: [], visible: false, macho: null };
  /** 時計の 実測（clock-p1・clock-p2。箱の 大きさ。0 なら まだ） */
  private readonly clockSize_ = { w: 0, h: 0 };
  private measureCount = 0;
  private covered = false;
  private readonly vs = newViewRectsScratch();
  private sizeKey = '';

  constructor(private readonly d: DuoHalvesDeps) {}

  get joined(): boolean {
    return this.on;
  }

  private build(): Built {
    const { hud } = this.d;
    return {
      title: new TitleAnnounce(hud, 2),
      clock: new Clock(hud, this.d.clockPhases, 2),
      home: new HomeNotice(hud, 2),
      edge: new DamageEdge(hud, 2),
      ink: new InkDim(hud, 2),
      buff: new BuffIcons(hud, 2, this.d.cluster2()),
      buffModel: createBuffModel(),
      craft: new CraftHint(hud, undefined, 2),
      plates: new YokaiNameplates(hud, 2),
      stagger: new StaggerIcons(hud, './models/fx/'),
    };
  }

  /** 参加した / やめた。やめたら 2P の 分を かくし、1P の 目印を はずす */
  setJoined(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    const p = this.d.p1;
    if (on) {
      this.b ??= this.build();
      p.stagger.twin = this.b.stagger;
    } else {
      p.stagger.twin = null;
    }
    const b = this.b;
    if (b) {
      b.title.mark(on);
      b.clock.mark(on);
      b.home.mark(on);
      b.edge.mark(on);
      b.ink.mark(on);
      b.buff.mark(on);
      b.plates.mark(on);
      if (!on) {
        b.title.sync(null);
        b.home.clear();
        b.edge.clear();
        b.ink.set(0);
        b.buff.sync([]);
        b.craft.update(false, 0);
        b.plates.hideAll();
        b.stagger.hideAll();
        this.plates2.length = 0;
      }
    }
    p.titleAnnounce.mark(on);
    p.clock.mark(on);
    p.homeNotice.mark(on);
    p.edge.mark(on);
    p.inkDim.mark(on);
    p.deathScreen.mark(on);
    p.buff.mark(on);
    p.craft.mark(on);
    p.nameplates.mark(on);
    this.covered = false;
    this.sizeKey = '';
    this.d.celebrate.setDuo(on);
    if (!on) this.d.celebrate.setHalf(null);
  }

  /** 画面の 大きさが かわった とき（と 参加した とき）だけ 紙ふぶきの 区画（1P の 半分）を 置きなおす。毎ステップ 呼んでよい */
  layout(w: number, h: number): void {
    if (!this.on) return;
    const key = `${w}x${h}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    this.d.celebrate.setHalf(halfOf(viewRects('split', 'split', 1, w, h, this.vs), 1));
  }

  /** 世界で 1 つの 物（#13 おしらせ・#17 時刻）を 2P の 半分にも 同じ 物で。音は ここでは 鳴らさない */
  world(announce: AnnounceState | null, phase: DayPhase, dayTick: number, settings: TimeSettings, day: number): void {
    const b = this.b;
    if (!b || !this.on) return;
    b.title.sync(announce);
    b.clock.set(phase);
    b.clock.setTime(dayTick, settings, day);
  }

  /** 2P の 戦いの 出来事の 画面の 動き（lifeUiOf の 答え。'down' は 今の duo-p2-down が 受け持つ ので ここでは 何も しない） */
  life(action: 'edge' | 'down' | 'respawn'): void {
    const b = this.b;
    if (!b || !this.on) return;
    if (action === 'edge') b.edge.flash();
    else if (action === 'respawn') b.home.show();
  }

  /** 毎ステップ 1 回: 時間を すすめる・すみの 暗さ・バフ・つくれる マーク（`halvesCoveredBy` で covered = 開いた 人の 半分〔halvesCoveredBy〕に 2P の 半分が ふくまれる とき 2P の 分を 消す） */
  step(dt: number, ink: number, buffs: readonly BuffWanted[], reduced: boolean, craftable: boolean, covered: readonly Who[]): void {
    const b = this.b;
    if (!b || !this.on) return;
    b.edge.update(dt);
    b.home.update(dt);
    b.ink.set(ink);
    b.buff.sync(b.buffModel.step(buffs, reduced));
    b.craft.update(craftable, dt);
    b.stagger.advance();
    this.d.p1.stagger.advance();
    const hide = covered.includes(2);
    if (hide !== this.covered) {
      this.covered = hide;
      const v = hide ? 'hidden' : '';
      b.clock.el.style.visibility = v;
      b.home.el.style.visibility = v;
      if (b.craft.el.parentElement) b.craft.el.parentElement.style.visibility = v;
    }
  }

  /** 時計の 実測の 大きさ（矢印が よける 箱の もと）。30 回に 1 回 はかりなおす（毎ステップ 呼んでも レイアウトを 毎回 読まない）。2P が いなくて who=2 は null */
  clockSize(who: Who): { w: number; h: number } | null {
    const el = who === 1 ? this.d.p1.clock.el : this.b?.clock.el;
    if (!el || (who === 2 && !this.on)) return null;
    if (this.clockSize_.w === 0 || ++this.measureCount % 30 === 0) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) {
        this.clockSize_.w = w;
        this.clockSize_.h = h;
      }
    }
    return this.clockSize_.w > 0 ? this.clockSize_ : null;
  }

  /** 区画を 描く 直前（beforePane）: その 区画の カメラ・矩形で 名札・ひるみの 印・マッチョの 印を 投げる（aspect は もう 区画の もの） */
  projectPane(cam: Camera, who: Who, pane: Rect): void {
    if (!this.on) return; // 2 人でない ときは 1P の 今の 投げ方（step.ts）が 受け持つ
    const p = this.d.p1;
    const f = this.feed;
    if (who === 1) {
      p.nameplates.update(f.plates, cam, pane);
      p.stagger.update(f.stagger, cam, f.visible, pane, false);
      if (f.macho) p.macho.update(f.macho, cam, f.visible, pane);
    } else if (this.b) {
      this.b.plates.update(this.plates2, cam, pane);
      this.b.stagger.update(f.stagger, cam, f.visible, pane, false);
    }
  }
}
