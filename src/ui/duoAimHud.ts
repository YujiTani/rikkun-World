/**
 * COOP-1 5f-1（docs/design/COOP-1.md 1.16 §3.7 (g) ①・§9.13・§12.0）: 2 人の とき、照準（＋）まわりの 表示を その人の 半分の 中に 出す。
 * - 2P の アクションヒント（1P と 同じ `actionHintLines` の 答え ＋ ボタンの 絵の 種類）。
 * - ＋マーク・おしらせの 印・技の ロック・構えの しるし・弓の 丸を 各半分の ＋に ついていく ように 置く。
 * import しただけでは document を さわらない（部品は class `DuoAimHud` が 参加した ときに 作る）。
 */
import type { BladeState, BladeStance, BowStage, W2Settings } from '../contracts';
import type { LeftClickKind, RightClickPreview } from '../dig/rightClick';
import { halfOf, newViewRectsScratch, viewRects, type ViewRects } from '../duo/viewRects';
import { createCrosshairMark } from '../camera/crosshair';
import type { BindMap } from '../input/gamepad/binds';
import type { LastInput } from '../input/gamepad/reader';
import type { PadFace } from '../input/gamepad/mapping';
import { facesForAction } from '../input/gamepad/rebind';
import { ActionHint, type HintPadFace, type HintPadKind } from './actionHint';
import { actionHintLines, type ActionHintCtx, type ActionHintLines } from './actionHintModel';
import { AimMarks } from './aimMarks';
import { BladeHud } from './bladeHud';
import { Notice } from './notice';
import { TEXT } from './settings/padBadge';
import './duoAimHud.css';

/** ボタンの 絵の 種類（マウス か パッドの 肩ボタン） */
export type HintPad = HintPadKind;
export type ActionHintView = ActionHintLines & { pad: HintPad };

/** その人の 半分の ヒントを 作る ための 入力（人ごと。2P の 物が 1P に 混ざらない） */
export interface DuoHintInput {
  who: 1 | 2;
  /** 2 人で あそんで いるか。false の ときは who 2 は 出さず、pad は いつも 'mouse'（1 人の ときは 今の まま） */
  duo: boolean;
  /** 設定「ヒント」（1P の 設定と 共通） */
  hintOn: boolean;
  /** 遊びの 画面 */
  playing: boolean;
  /** ＋マークが 見える（1P の 見下ろしでは 出ない） */
  crosshairVisible: boolean;
  /** その人が 倒れている */
  down: boolean;
  /** その人の もちもの画面・とりごやの メニュー・本が 開いている */
  open: { inventory: boolean; coopMenu: boolean; book: boolean };
  /** `dig.previewRightClick()` の 答え（その人の ほる係） */
  right: RightClickPreview | null;
  /** `dig.previewLeftClick()` の 答え */
  left: LeftClickKind | null;
  /** その人の もちもの・だっこ・ツルハシ／刀・わ */
  ctx: ActionHintCtx;
  /** `duo.padIndex(who)` */
  padIndex: number | null;
  /** 1P の パッドか マウスかを 決める のに 使う（2P は 見ない） */
  lastInput: LastInput;
}

/**
 * その人の ヒントの ctx を 書きかえる（毎ステップ 同じ 入れものに 書く。new しない）。1P の step.ts と 同じ 形:
 * だっこ中（`carrying`）は 左に「ほる」を 出さず、だっこの わ（`carryProgress`）が 渡る。2P も だっこ できる ので 2P の 分も ここを 通る（5f-1 × 5c）。
 */
export function fillHintCtx(ctx: ActionHintCtx, tool: { item: ActionHintCtx['held']; kind: string }, carryProgress: number, carrying: boolean): void {
  ctx.held = tool.item;
  ctx.heldIsPickaxe = tool.kind === 'pickaxe';
  ctx.heldIsBlade = tool.kind === 'blade';
  ctx.carryProgress = carryProgress;
  ctx.carrying = carrying;
}

/** 2 人の とき 1P は 1P の パッドが 使われて いれば パッド、そうでなければ マウス。2P は いつも パッド。1 人の ときは いつも マウス */
function padOf(who: 1 | 2, duo: boolean, padIndex: number | null, lastInput: LastInput): HintPad {
  if (!duo) return 'mouse';
  if (who === 2) return 'pad';
  return padIndex !== null && lastInput === 'gamepad' ? 'pad' : 'mouse';
}

/**
 * その人の 半分に 出す ヒント。条件が そろえば `actionHintLines` の 答え ＋ pad。出す 物が 何も なければ null。
 * 1P と 2P の 答えは `actionHintLines`（ui/actionHintModel.ts）だけから 作る（語の 表は そこの 1 か所）。
 */
export function actionHintView(i: DuoHintInput): ActionHintView | null {
  if (i.who === 2 && !i.duo) return null;
  if (!i.hintOn || !i.playing || !i.crosshairVisible || i.down) return null;
  if (i.open.inventory || i.open.coopMenu || i.open.book) return null;
  const lines = actionHintLines(i.right, i.left, i.ctx);
  if (!lines.left && !lines.right) return null;
  return { ...lines, pad: padOf(i.who, i.duo, i.padIndex, i.lastInput) };
}

/** 左の 札（primary）・右の 札（secondary）に 付いている 最初の 面。ついて いなければ null */
function hintFaces(binds: BindMap): { left: PadFace | null; right: PadFace | null } {
  return { left: facesForAction(binds, 'primary')[0] ?? null, right: facesForAction(binds, 'secondary')[0] ?? null };
}

/** 左の 札・右の 札の 面の 名前（ZR／ZL／L／R／A／B／X／Y ...）。はじめの 割り当ては ZR／ZL。ついて いなければ null */
export function hintFaceLabels(binds: BindMap): { left: string | null; right: string | null } {
  const f = hintFaces(binds);
  return { left: f.left ? (TEXT[f.left] ?? null) : null, right: f.right ? (TEXT[f.right] ?? null) : null };
}

/** 照準まわりの 部品（＋に 対する 置き場所の 名前） */
export type AimPart = 'cross' | 'hint' | 'notice' | 'stance' | 'techLock';

/**
 * ＋の 中心から 各部品の 基準の 点までの ずれ（設計 px = 1280 幅の とき）。
 * token = tokens.css の `--rk-sp-N`〔clamp(d×0.85, d/12.8 vw, d×1.5)〕と 同じ 式で 画面の 幅に 合わせる。fixed = そのままの px。
 * 1 人の ときの css（actionHint.css の top、notice.css の left/top、aimMarks.css の left）と 同じ 関係。
 */
const AIM_OFFSETS: Record<AimPart, { dx: number; dy: number; token: boolean }> = {
  cross: { dx: 0, dy: 0, token: true },
  hint: { dx: 0, dy: 24, token: true }, // ＋の すぐ下 = --rk-sp-5
  notice: { dx: 12, dy: 12, token: true }, // ＋の 右下 = --rk-sp-3
  stance: { dx: 28, dy: 0, token: false }, // ＋の 右 28px
  techLock: { dx: 0, dy: 0, token: true }, // ＋に 重なる
};
/** tokens.css の --rk-sp-N の 式の 係数（最小 0.85 倍・最大 1.5 倍・設計の 画面の はば 1280） */
const TOKEN_MIN = 0.85;
const TOKEN_MAX = 1.5;
const TOKEN_DESIGN_W = 1280;

function tokenPx(design: number, viewW: number): number {
  return Math.min(design * TOKEN_MAX, Math.max(design * TOKEN_MIN, (design / TOKEN_DESIGN_W) * viewW));
}

/** 画面ぜんたいの はば（CSS px）。`vw` の もと */
function viewWidth(r: ViewRects): number {
  return r.second ? r.second.x + r.second.w : r.main.x + r.main.w;
}

/** ＋マークの 中心（CSS px）。1 人の 全面なら 1 つ（画面の まん中）、左右なら 2 つ（各半分の まん中） */
export function crosshairSpots(rects: ViewRects): { who: 1 | 2; x: number; y: number }[] {
  const out: { who: 1 | 2; x: number; y: number }[] = [];
  for (const who of [1, 2] as const) {
    const r = halfOf(rects, who);
    if (r) out.push({ who, x: r.x + r.w / 2, y: r.y + r.h / 2 });
  }
  return out;
}

/** その人（by なし＝ 1P）の 半分の ＋に 対する 部品の 基準の 点。2P が いなくて by=2 なら null */
export function aimPartAt(rects: ViewRects, by: 1 | 2 | undefined, part: AimPart): { x: number; y: number } | null {
  const r = halfOf(rects, by ?? 1);
  if (!r) return null;
  const o = AIM_OFFSETS[part];
  const w = viewWidth(rects);
  return { x: r.x + r.w / 2 + (o.token ? tokenPx(o.dx, w) : o.dx), y: r.y + r.h / 2 + (o.token ? tokenPx(o.dy, w) : o.dy) };
}

// ---- ここから 画面（DOM）----

/** 位置を 置く 部品 1 つ（el の `--aim-x`／`--aim-y` に part の 基準の 点を 書く） */
interface Placed {
  el: HTMLElement;
  part: AimPart;
}

export interface DuoAimHudDeps {
  hud: HTMLElement;
  /** 1P の 部品（今までの 要素を そのまま 2 人の 間 1P の 半分に 置く） */
  hint1: ActionHint;
  notice1: Notice;
  aimMarks1: AimMarks;
  bladeHud1: BladeHud;
  crosshair1: { visible(): boolean };
  w2: () => W2Settings;
  /** 1P・2P の パッドの 割り当て（画面の 大きさが かわった ときと 参加した ときだけ 読む） */
  binds1: () => BindMap;
  binds2: () => BindMap;
}

/** 2P の 部品（参加して はじめて 作る） */
interface Built {
  hint2: ActionHint;
  notice2: Notice;
  blade2: BladeHud;
  marks2: AimMarks;
  cross: [HTMLDivElement, HTMLDivElement];
  placed: [Placed[], Placed[]];
}

/** 2P の 照準まわりの その ステップの ようす（duoPlay が 毎ステップ 入れる。使いまわす） */
export interface DuoAimStep2 {
  hint: ActionHintView | null;
  crossVisible: boolean;
  blade: BladeState | null;
  stance: BladeStance | null;
  bowStage: BowStage;
  dt: number;
}

export class DuoAimHud {
  private b: Built | null = null;
  private on = false;
  private readonly scratch = newViewRectsScratch();
  private sizeKey = '';
  private crossShown: [boolean | null, boolean | null] = [null, null];
  private belowHint: [boolean, boolean] = [false, false];
  private placed1: Placed[] | null = null;

  constructor(private readonly d: DuoAimHudDeps) {}

  /** 参加した / やめた。やめたら 2P の 部品を ぜんぶ かくし、1P の 部品を 今までの 位置（50%）に もどす */
  setJoined(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.sizeKey = '';
    if (on) {
      this.b ??= this.build();
      this.crossShown[0] = this.crossShown[1] = null;
      this.refreshFaces();
      return;
    }
    const b = this.b;
    if (b) {
      for (const c of b.cross) c.hidden = true;
      b.hint2.update({});
      b.notice2.clear();
      b.marks2.update({ stance: null, bowStage: 0 });
      b.blade2.update(IDLE_BLADE);
    }
    this.d.hint1.setPad('mouse');
    for (const list of [this.placed1 ?? [], ...(b?.placed ?? [])]) for (const p of list) this.clearPlace(p.el);
    this.setBelow(1, false);
    this.setBelow(2, false);
  }

  private build(): Built {
    const { hud } = this.d;
    const cross: [HTMLDivElement, HTMLDivElement] = [this.makeCross(1), this.makeCross(2)];
    hud.append(cross[0], cross[1]);
    const hint2 = new ActionHint(hud, 2);
    const notice2 = new Notice(hud, undefined, 2);
    const blade2 = new BladeHud(hud, this.d.w2, 2);
    const marks2 = new AimMarks(hud, 2);
    this.placed1 = [
      { el: this.d.hint1.el, part: 'hint' },
      { el: this.d.notice1.signalEl, part: 'notice' },
      { el: this.d.notice1.textEl, part: 'cross' },
      { el: this.d.aimMarks1.stanceEl, part: 'stance' },
      { el: this.d.aimMarks1.bowEl, part: 'cross' },
      { el: this.d.bladeHud1.lockEl, part: 'techLock' },
    ];
    const placed: [Placed[], Placed[]] = [
      [{ el: cross[0], part: 'cross' }],
      [
        { el: cross[1], part: 'cross' },
        { el: hint2.el, part: 'hint' },
        { el: notice2.signalEl, part: 'notice' },
        { el: notice2.textEl, part: 'cross' },
        { el: marks2.stanceEl, part: 'stance' },
        { el: marks2.bowEl, part: 'cross' },
        { el: blade2.lockEl, part: 'techLock' },
      ],
    ];
    return { hint2, notice2, blade2, marks2, cross, placed };
  }

  private makeCross(who: 1 | 2): HTMLDivElement {
    const el = createCrosshairMark();
    el.className = `duo-crosshair duo-crosshair-p${who}`;
    el.setAttribute('data-testid', `duo-crosshair-p${who}`);
    el.hidden = true;
    return el;
  }

  private clearPlace(el: HTMLElement): void {
    el.style.removeProperty('--aim-x');
    el.style.removeProperty('--aim-y');
    if (el.classList.contains('duo-crosshair')) {
      el.style.removeProperty('left');
      el.style.removeProperty('top');
    }
  }

  /** 画面の 大きさが かわった とき（と 参加した とき）だけ 置きなおす。毎ステップ 呼んでよい（同じ 大きさなら 何も しない） */
  layout(w: number, h: number): void {
    const b = this.b;
    if (!b || !this.on) return;
    const key = `${w}x${h}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    const rects = viewRects('split', 'split', 1, w, h, this.scratch);
    const lists: [Placed[], Placed[]] = [[...(this.placed1 ?? []), ...b.placed[0]], b.placed[1]];
    for (const who of [1, 2] as const) {
      for (const p of lists[who - 1]!) {
        const at = aimPartAt(rects, who, p.part);
        if (!at) continue;
        p.el.style.setProperty('--aim-x', `${at.x}px`);
        p.el.style.setProperty('--aim-y', `${at.y}px`);
        if (p.el.classList.contains('duo-crosshair')) {
          p.el.style.left = `${at.x}px`;
          p.el.style.top = `${at.y}px`;
        }
      }
    }
    this.refreshFaces();
  }

  /** パッドの 札の 面の 名前を 今の 割り当てから 書く（変わった ときだけ 書き換わる） */
  private refreshFaces(): void {
    const b = this.b;
    if (!b) return;
    b.hint2.setFaces(...faceArts(this.d.binds2()));
    this.d.hint1.setFaces(...faceArts(this.d.binds1()));
  }

  /** 1P の 部品の 毎ステップ（2 人の 間）: 半分の ＋・ヒントの 絵の 種類・おしらせを ヒントの 下に さげる */
  step1(padIndex: number | null, lastInput: LastInput): void {
    const b = this.b;
    if (!b || !this.on) return;
    this.d.hint1.setPad(padOf(1, true, padIndex, lastInput));
    this.showCross(0, this.d.crosshair1.visible());
    this.setBelow(1, !this.d.hint1.el.hidden);
  }

  /** 2P の 部品の 毎ステップ（2 人の 間） */
  step2(s: DuoAimStep2): void {
    const b = this.b;
    if (!b || !this.on) return;
    if (s.hint) {
      b.hint2.setPad(s.hint.pad);
      b.hint2.update(s.hint);
    } else b.hint2.update({});
    this.showCross(1, s.crossVisible);
    this.setBelow(2, !b.hint2.el.hidden);
    b.notice2.update(s.dt);
    b.marks2.update({ stance: s.stance, bowStage: s.bowStage });
    b.blade2.update(s.blade ?? IDLE_BLADE);
  }

  private showCross(i: 0 | 1, v: boolean): void {
    const b = this.b!;
    if (this.crossShown[i] === v) return;
    this.crossShown[i] = v;
    b.cross[i].hidden = !v;
  }

  private setBelow(who: 1 | 2, below: boolean): void {
    if (this.belowHint[who - 1] === below) return;
    this.belowHint[who - 1] = below;
    const n = who === 1 ? this.d.notice1 : this.b?.notice2;
    if (!n) return;
    for (const el of [n.signalEl, n.textEl]) {
      if (below) el.setAttribute('data-below-hint', '');
      else el.removeAttribute('data-below-hint');
    }
  }

  /** 2P の おしらせの 窓口（2P の 半分の ＋の 右下に 出す）。2P が いなければ 何も しない */
  readonly notice2: Pick<Notice, 'showSignal'> = { showSignal: (kind) => this.b?.notice2.showSignal(kind) };

  /** `duo.actionHint(who)`: その人の 半分に 出ている ヒント。出ていない・2P が いない → null */
  hint(who: 1 | 2): ActionHintView | null {
    if (who === 2 && !this.on) return null;
    const h = who === 1 ? this.d.hint1 : this.b?.hint2;
    if (!h) return null;
    const cur = h.current();
    return cur.left || cur.right ? { ...cur, pad: h.pad() } : null;
  }
}

/** 刀を 持っていない ときの 状態（技の ロックを 消す ために 渡す） */
const IDLE_BLADE = { item: null } as unknown as BladeState;

/** 左の 札・右の 札の 面の 絵（面の 名前＋字）。ついて いなければ null */
function faceArts(binds: BindMap): [HintPadFace | null, HintPadFace | null] {
  const f = hintFaces(binds);
  const art = (face: PadFace | null): HintPadFace | null => (face ? { face, label: TEXT[face] ?? '' } : null);
  return [art(f.left), art(f.right)];
}
