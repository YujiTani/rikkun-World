import type { AchievementId, AchievementModalPort, AchievementShow, CelebrateBusyPort, CraftMadeEvent, ModalScreenState, ScreenState } from '../../contracts';
import { CRAFT_SOUNDS, type CraftSoundName } from '../../fx/craftSounds';
import type { SoundFx, Tone } from '../../fx/sound';
import { createBadge, popAnimation, type MedalTier, type Rarity4 } from '../theme';
import { markUrl } from '../medalArt';
import { BannerModel } from './bannerModel';
import { ComboModel } from './comboModel';
import { flashPeriods, flashPerSecond, type CelebrateSettings, CELEBRATE } from './config';
import { ModalModel, type ModalCloseResult } from './modalModel';
import { SparkPool } from './sparkModel';
import { BannerView, createLockTag, EffectsView, ModalView, type ModalRowInfo } from './views';
import { starLights } from './bannerModel';
import './celebrate.css';

export interface SoundEntry {
  name: string;
  pitch: number;
}

/** 実績 1 つの見た目（C が出す。メダルの中の絵は アイテムの絵か medalArt の印） */
export interface AchievementLook {
  name: string;
  tier: MedalTier;
  artUrl: string;
}

export interface CelebrateDeps {
  /** 横断幕・つぶ・おめでとう画面を置く所（#hud） */
  hud: HTMLElement;
  /** メダルの印を置く所（S2 の B おしらせ のかたまり。なければ hud） */
  badgeParent?: HTMLElement;
  sound: Pick<SoundFx, 'playTones'>;
  screen: ScreenState & ModalScreenState;
  settings: () => CelebrateSettings;
  /** 作る画面の そのレシピの マスの要素（見えていなければ null） */
  tileEl(recipe: string): HTMLElement | null;
  itemName(item: string): string;
  /** めずらしさ 0〜3 */
  itemRarity(item: string): Rarity4;
  itemIconUrl(item: string): string;
  achievement(id: AchievementId): AchievementLook;
  /** M4 の ばんざい・レベルアップの演出が出ているか */
  levelUpShowing(): boolean;
}

const MAIN_TIER_GOLD = new Set<MedalTier>(['gold', 'rainbow']);

/**
 * 演出と おめでとう画面（M6 B）。つなぎ込みが作って、毎ステップ `step()` を呼ぶ。
 * - 作った（A の `CraftMadeEvent`）→ `made(e)`、作れなかった → `failed()`
 * - C へ: `modal`（AchievementModalPort）・`busy`（CelebrateBusyPort）。メダルの印の数は `setPending(n)`
 */
export class CelebrateUi {
  readonly banner: BannerModel;
  readonly combo: ComboModel;
  readonly modalModel: ModalModel;
  readonly modal: AchievementModalPort;
  readonly busy: CelebrateBusyPort;

  private readonly fx: EffectsView;
  private readonly bannerView: BannerView;
  private readonly modalView: ModalView;
  private readonly lockTag: HTMLElement;
  private readonly badgeEl: HTMLElement;
  private readonly badgeNum: HTMLElement;
  private craftSounds: SoundEntry[] = [];
  private achSounds: SoundEntry[] = [];
  private pending = 0;
  private closedFns: ((shown: AchievementId[]) => void)[] = [];
  private readonly sparks = new SparkPool();
  private guard = (e: Event): void => this.blockKey(e);

  constructor(private readonly d: CelebrateDeps) {
    this.banner = new BannerModel(d.settings);
    this.combo = new ComboModel(d.settings);
    this.modalModel = new ModalModel(d.settings);
    this.fx = new EffectsView(d.hud, this.sparks);
    this.bannerView = new BannerView(d.hud);
    this.modalView = new ModalView(d.hud);
    this.lockTag = createLockTag(d.hud, () => d.screen.relock());

    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'cel-badge';
    this.badgeEl.id = 'medal-badge';
    const img = document.createElement('img');
    img.className = 'rk-art';
    img.alt = '';
    img.src = markUrl('medal');
    this.badgeNum = createBadge(0, 'accent');
    this.badgeEl.append(img, this.badgeNum);
    this.badgeEl.hidden = true;
    (d.badgeParent ?? d.hud).append(this.badgeEl);

    const mv = this.modalView;
    mv.parts.scrim.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (mv.isOnButton(e.target)) this.modalModel.buttonDown();
    });
    mv.parts.scrim.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      this.finish(this.modalModel.pointerUp(mv.isOnButton(e.target)));
    });
    mv.parts.scrim.addEventListener('click', (e) => e.stopPropagation());

    const self = this;
    this.modal = {
      open: (show) => self.openModal(show),
      isOpen: () => self.modalModel.isOpen(),
      onClosed: (fn) => void self.closedFns.push(fn),
    };
    this.busy = { bannerShowing: () => self.banner.showing(), levelUpShowing: () => d.levelUpShowing() };
  }

  // ---------------------------------------------------------------- 作る

  /** A の「つくった」。ふつう（2 回目から）は ぽよん・つぶ・チャイム、はじめては 横断幕 */
  made(e: CraftMadeEvent): void {
    const combo = this.combo.made();
    const tile = this.d.tileEl(e.recipe);
    const r = tile?.getBoundingClientRect();
    const cx = r ? r.left + r.width / 2 : window.innerWidth / 2;
    const cy = r ? r.top + r.height / 2 : window.innerHeight / 2;
    const rarity = this.d.itemRarity(e.item);
    const pitch = ComboModel.pitch(combo);
    if (e.first) {
      const res = this.banner.enqueue(e.recipe, e.item, e.kind);
      if (res !== 'dropped') {
        if (res === 'shown') this.bannerSound('bannerSpin');
      }
      this.sparkAt(cx, cy, 12);
      return;
    }
    if (tile) this.fx.startPoyon(tile);
    this.sparkAt(cx, cy, ComboModel.sparkCount(combo));
    if (rarity >= 2) this.fx.startRing(cx, cy, rarity);
    this.fx.setCombo(combo, cx + (r ? r.width / 2 : 0) - 24, cy - (r ? r.height / 2 : 0));
    const chime = `chime${Math.min(4, rarity + 1)}` as CraftSoundName;
    this.craftSounds.push({ name: 'craft', pitch }, { name: chime, pitch });
    this.d.sound.playTones(CRAFT_SOUNDS.craft as readonly Tone[], pitch);
    this.d.sound.playTones(CRAFT_SOUNDS[chime] as readonly Tone[], pitch);
  }

  /** 作れなかった（ぷぷ）。コンボは 0 */
  failed(): void {
    this.combo.failed();
  }

  private sparkAt(x: number, y: number, n: number): void {
    this.sparks.burst(x, y, n);
  }

  private play(name: CraftSoundName): void {
    this.d.sound.playTones(CRAFT_SOUNDS[name] as readonly Tone[]);
  }

  // ---------------------------------------------------------------- メダルの印

  setPending(n: number): void {
    if (n === this.pending) return;
    const up = n > this.pending;
    this.pending = n;
    this.badgeEl.hidden = n <= 0;
    this.badgeNum.textContent = String(n);
    if (up) {
      popAnimation(this.badgeEl);
      this.achSound('badge');
    }
  }

  badge(): { visible: boolean; count: number } {
    return { visible: this.pending > 0, count: this.pending };
  }

  // ---------------------------------------------------------------- おめでとう画面

  private openModal(show: AchievementShow): boolean {
    if (!this.modalModel.open(show)) return false;
    this.d.screen.openModal();
    const main = this.d.achievement(show.mainId);
    const rows: ModalRowInfo[] = this.modalModel.rowIds().map((id) => this.d.achievement(id));
    const more = Math.max(show.more, show.ids.length - 1 - rows.length);
    this.modalView.show(main, rows, more);
    this.achSound('modal');
    if (MAIN_TIER_GOLD.has(main.tier)) this.achSound('modalSparkle');
    window.addEventListener('keydown', this.guard, true);
    window.addEventListener('keyup', this.guard, true);
    return true;
  }

  private blockKey(e: Event): void {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  private finish(shown: AchievementId[] | null): boolean {
    if (!shown) return false;
    this.modalView.hide();
    window.removeEventListener('keydown', this.guard, true);
    window.removeEventListener('keyup', this.guard, true);
    this.achSound('close');
    this.d.screen.closeModal();
    for (const f of this.closedFns) f(shown);
    return true;
  }

  /** テストの窓口 `achievements.close()` */
  close(): { ok: boolean; reason: ModalCloseResult['reason'] } {
    const r = this.modalModel.press();
    if (r.result.ok) this.finish(r.shown);
    return r.result;
  }

  // ---------------------------------------------------------------- 毎ステップ

  /** 毎ステップ（Game.onUpdate）。画面ステップは 1 ÷ timeScale 進む。時間が止まっているあいだは進まない */
  step(): void {
    const mode = this.d.screen.mode();
    if (mode === 'celebrate') {
      if (this.modalModel.step()) this.achSound('closeReady');
      const age = this.modalModel.ageSteps();
      this.modalView.paint(age, this.modalModel.buttonEnabled(), this.d.settings().achieveCloseDelay, starLights(age - 36, age >= 36));
      return;
    }
    const ts = mode === 'guide' ? 0 : this.d.screen.timeScale();
    const amount = ts > 0 ? 1 / ts : 0;
    if (amount > 0) {
      for (const ev of this.banner.step(amount)) {
        if (ev.type === 'fanfare') this.bannerSound('fanfare');
        else this.bannerSound('bannerSpin');
      }
      this.combo.step(amount);
    }
    this.fx.step(amount, this.combo.label());
    this.bannerView.paint(this.banner.look(), this.bannerInfo());
    this.lockTag.hidden = !this.d.screen.lockDenied();
  }

  private bannerSound(name: 'fanfare' | 'bannerSpin'): void {
    this.craftSounds.push({ name, pitch: 0 });
    this.play(name);
  }

  private bannerInfo() {
    const i = this.banner.info();
    if (!i) return null;
    const r = this.d.itemRarity(i.item);
    return { name: this.d.itemName(i.item), iconUrl: this.d.itemIconUrl(i.item), rarity: r, stars: r + 1 };
  }

  private achSound(name: 'badge' | 'modal' | 'modalSparkle' | 'closeReady' | 'close'): void {
    this.achSounds.push({ name, pitch: 0 });
    const tones = name === 'close' ? CRAFT_SOUNDS.tab : name === 'modal' ? CRAFT_SOUNDS.modal : CRAFT_SOUNDS[name];
    this.d.sound.playTones(tones as readonly Tone[]);
  }

  // ---------------------------------------------------------------- テストの窓口

  /** `craft.fx()` */
  fxInfo() {
    const b = this.banner.info();
    return {
      banner: b ? { recipe: b.recipe, item: b.item, phase: b.phase, age: b.age, rotationDeg: b.rotationDeg, scale: b.scale } : null,
      bannerQueue: this.banner.queue(),
      combo: this.combo.combo(),
      flashPeriods: flashPeriods(),
      flashPerSecond: flashPerSecond(),
    };
  }

  /** `craft.sounds()`（呼ぶと空） */
  drainCraftSounds(): SoundEntry[] {
    const o = this.craftSounds;
    this.craftSounds = [];
    return o;
  }

  /** `achievements.sounds()`（呼ぶと空）。名前は badge・modal・modalSparkle・closeReady・close */
  drainAchievementSounds(): string[] {
    const o = this.achSounds.map((s) => s.name);
    this.achSounds = [];
    return o;
  }

  /** `achievements.modal()` の B の分 */
  modalInfo() {
    return this.modalModel.view(flashPeriods());
  }

  dispose(): void {
    window.removeEventListener('keydown', this.guard, true);
    window.removeEventListener('keyup', this.guard, true);
    this.fx.dispose();
    this.bannerView.dispose();
    this.modalView.parts.scrim.remove();
    this.lockTag.remove();
    this.badgeEl.remove();
  }
}

export { CELEBRATE };
