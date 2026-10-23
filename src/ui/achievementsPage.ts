import type { AchievementDef, ItemId } from '../contracts';
import { ACHIEVEMENT_DEFS, CATEGORY_LABEL, CATEGORY_ORDER } from '../achievements/defs';
import type { AchievementSystem } from '../achievements/AchievementSystem';
import type { AchievementsPageModel } from '../achievements/pageModel';
import { animalIconUrl } from './animalArt';
import { withRuby } from './text';
import { heartPixels } from './heartsModel';
import { anyIconUrl, drawPixels } from './itemIcon';
import { createBar, createChip, createMedal, createTab, createTooltip, setBar, setTabState } from './theme';
import './achievementsPage.css';

/** もちもの画面の側の口（InventoryScreen が合う） */
export interface AchievementsPageHost {
  pageSlot: HTMLElement;
  setTab(t: 'items' | 'achievements' | 'log'): void;
  isOpen(): boolean;
}

const CATEGORY_ICON: Record<string, ItemId | 'clock'> = {
  farm: 'tomato',
  break: 'iron_pickaxe',
  place: 'brick',
  craft: 'furnace',
  collect: 'paper',
  fight: 'katana',
  level: 'crystal',
  adventure: 'clock',
  places: 'lantern',
};

/** メダルの中の絵になる アイテム（なければ 絵なし） */
function artOf(d: AchievementDef): ItemId | 'droplet' | 'heart' | 'chicken' | null {
  const s = d.stat;
  const fm = farmArt(s);
  if (fm) return fm;
  const m = /^(?:break|place|craft|bake|obtain|wear):([a-z_]+)$/.exec(s);
  if (m && m[1] !== 'pickaxes' && m[1] !== 'weapons' && m[1] !== 'armors' && m[1] !== 'everything') return m[1] as ItemId;
  const w = /^defeatWith:([a-z_]+)$/.exec(s);
  if (w) return (w[1] === 'hand' ? null : w[1] === 'pickaxe' ? 'iron_pickaxe' : w[1]) as ItemId | null;
  if (s === 'craftItems:ya') return 'ya';
  if (s === 'craft:pickaxes') return 'iron_pickaxe';
  if (s === 'craft:weapons') return 'katana';
  if (s === 'craft:armors') return 'yoroi';
  if (s === 'craft:everything') return 'furnace';
  if (s === 'wearAll') return 'kabuto';
  if (s === 'arrowShot' || s === 'arrowHit') return 'ya';
  if (s === 'bagBack') return 'cloth';
  return null;
}

/** そだてる の メダルの絵（はたけ は上の面、みず は しずく） */
function farmArt(s: string): ItemId | 'droplet' | 'heart' | 'chicken' | null {
  const h = /^(?:harvest|wild):(onion|tomato|pumpkin|eggplant)$/.exec(s);
  if (h) return h[1] as ItemId;
  switch (s) {
    case 'till': return 'farmland';
    case 'plant:*': return 'seed_tomato';
    case 'harvest:*': case 'harvest:kinds': case 'wild:*': case 'wild:kinds': case 'eat:*': return 'tomato';
    case 'harvestWet': return 'droplet';
    // M7-2: じょうろ・スプリンクラー・ハート
    case 'water:*': return 'watering_can';
    case 'place:sprinkler': return 'sprinkler';
    case 'bucketPlace': return 'water_bucket';
    case 'pet:*': case 'harvestPet': return 'heart';
    // LIVE-1: にわとり（friend・feed・petAnimal）・たまご（egg・eat:egg）
    case 'friend:*': case 'feed:*': case 'petAnimal:*': return 'chicken';
    case 'egg:*': case 'eat:egg': return 'egg';
    case 'visit:oldfarm': return 'farmland';
    case 'seedFrom:oldfarm': case 'seedFrom:grass': case 'seedFrom:yokai': case 'seedFrom:all': return 'seed_onion';
    default: return null;
  }
}

let heartUrl: string | undefined;
function heartIconUrl(): string {
  if (!heartUrl) {
    const c = document.createElement('canvas');
    drawPixels(c, heartPixels('full'));
    heartUrl = c.toDataURL();
  }
  return heartUrl;
}

function mark(def: AchievementDef): string | undefined {
  const a = artOf(def);
  if (!a) return undefined;
  return a === 'heart' ? heartIconUrl() : a === 'chicken' ? animalIconUrl('chicken') : anyIconUrl(a);
}

/** その実績の メダルの中の絵（アイテムの絵。なければ undefined）。おめでとう画面も同じものを使う */
export function achievementArtUrl(def: AchievementDef): string | undefined {
  return mark(def);
}

/** じっせき ページ（M6 §2.7）。S1 の部品だけで作る。毎フレーム `update()` を呼ぶ */
export class AchievementsPage {
  readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly bar: ReturnType<typeof createBar>;
  private readonly cats: HTMLElement;
  private readonly list: HTMLDivElement;
  private readonly catTabs = new Map<string, HTMLButtonElement>();
  private readonly tip = createTooltip();
  private builtVersion = -1;
  private builtCategory = '';
  private renderedCategory = '';

  constructor(
    private readonly sys: AchievementSystem,
    private readonly model: AchievementsPageModel,
    private readonly host: AchievementsPageHost,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'rk-root rk-panel ach-page';
    const head = document.createElement('div');
    head.className = 'ach-head';
    this.title = document.createElement('div');
    this.title.className = 'ach-title';
    this.bar = createBar('xp', 0);
    head.append(this.title, this.bar.root);
    const body = document.createElement('div');
    body.className = 'ach-body';
    this.cats = document.createElement('div');
    this.cats.className = 'ach-cats';
    this.list = document.createElement('div');
    this.list.className = 'ach-list';
    for (const id of CATEGORY_ORDER) {
      const t = createTab({
        text: CATEGORY_LABEL[id],
        onClick: () => {
          this.model.setCategory(id);
          this.update();
        },
      });
      const icon = CATEGORY_ICON[id];
      const img = document.createElement('img');
      img.className = 'rk-art ach-cat-icon';
      img.alt = '';
      img.src = anyIconUrl(icon);
      t.prepend(img);
      this.catTabs.set(id, t);
      this.cats.append(t);
    }
    body.append(this.cats, this.list);
    this.el.append(head, body);
    this.tip.root.classList.add('ach-tip');
    this.tip.root.hidden = true;
    this.el.append(this.tip.root);
    host.pageSlot.append(this.el);
  }

  /** 毎フレーム: タブの出入りと 取った実績の変化を 画面に映す */
  update(): void {
    const open = this.host.isOpen();
    // 出入りの検出（見た にする）は軽いので毎フレーム。重い ui() は見えていて変わったときだけ
    this.model.sync(open);
    const visible = open && this.model.tab() === 'achievements';
    // pageSlot の 出し入れは もちもの画面（できごと ページと 同じ場所を 使う）。ここでは 自分だけ 出し入れする
    this.el.style.display = visible ? '' : 'none';
    if (!visible) {
      this.builtVersion = -1; // 見えるようになったら作り直す
      return;
    }
    const key = `${this.model.category()}`;
    const ver = this.sys.version();
    if (ver === this.builtVersion && key === this.builtCategory) return;
    const ui = this.model.ui(open);
    this.builtVersion = ver;
    this.builtCategory = key;
    for (const c of ui.categories) {
      const t = this.catTabs.get(c.id);
      if (t) setTabState(t, { selected: c.id === ui.category, dot: c.dot });
    }
    this.title.textContent = `じっせき ${ui.unlocked} / ${ui.total}`;
    setBar(this.bar, ui.unlocked / ui.total);
    this.renderRows(ui);
  }

  private renderRows(ui: ReturnType<AchievementsPageModel['ui']>): void {
    const keep = this.renderedCategory === ui.category ? this.list.scrollTop : 0; // 分類が変わったら いちばん上
    this.renderedCategory = ui.category;
    this.list.replaceChildren();
    const byId = new Map(ACHIEVEMENT_DEFS.map((d) => [d.id, d]));
    for (const r of ui.rows) {
      const def = byId.get(r.id)!;
      const row = document.createElement('div');
      row.className = 'rk-card ach-row';
      row.dataset.id = r.id;
      row.dataset.unlocked = String(r.unlocked);
      const medal = r.unlocked ? createMedal(def.medal, 48, mark(def)) : createMedal('locked', 48);
      const text = document.createElement('div');
      text.className = 'ach-row__text';
      const name = document.createElement('div');
      name.className = 'ach-row__name';
      name.innerHTML = r.shown ? withRuby(def.name) : '？？？'; // 名前は ［漢字｜よみ］ → ふりがなつき（WEAPON-7 §2.7）
      text.append(name);
      if (r.unlocked) {
        const day = document.createElement('div');
        day.className = 'ach-row__day';
        day.textContent = `${(this.sys.dayOf(r.id) ?? 0) + 1} にちめ`;
        text.append(day);
      }
      row.append(medal, text);
      if (r.shown) {
        const tag = r.isNew
          ? createChip({ text: 'NEW', tone: 'info' })
          : r.unlocked
            ? createChip({ html: withRuby('［達成｜たっせい］'), tone: 'ok' })
            : createChip({ html: withRuby('［未達成｜みたっせい］'), tone: 'mute' });
        tag.classList.add('ach-tag', r.isNew ? 'ach-new' : r.unlocked ? 'ach-tag--ok' : 'ach-tag--mute');
        row.append(tag);
      }
      if (r.next) {
        row.classList.add('ach-row--next');
        if (r.progress) {
          const { now, goal } = r.progress;
          const bar = createBar('xp', now / goal);
          bar.root.classList.add('ach-row__bar');
          const cap = document.createElement('div');
          cap.className = 'ach-row__cap';
          cap.textContent = `いま ${now} / ${goal}`;
          text.append(bar.root, cap);
        }
      }
      row.addEventListener('mouseenter', () => this.showTip(row, def, r.unlocked, r.shown));
      row.addEventListener('mouseleave', () => {
        this.tip.root.hidden = true;
      });
      this.list.append(row);
    }
    this.list.scrollTop = keep;
  }

  private showTip(row: HTMLElement, def: AchievementDef, unlocked: boolean, shown = unlocked): void {
    const t = this.tip;
    const nameSpan = document.createElement('span');
    nameSpan.innerHTML = shown ? withRuby(def.name) : '？？？';
    t.name.replaceChildren(unlocked ? createMedal(def.medal, 96, mark(def)) : createMedal('locked', 96), nameSpan);
    t.desc.textContent = '';
    t.root.hidden = false;
    // パネルは 小さい画面で縮めてあるので、画面の座標 → パネルの中の座標 に直す
    const host = this.el.getBoundingClientRect();
    const k = host.width / (this.el.offsetWidth || 1) || 1;
    const r = row.getBoundingClientRect();
    const tw = t.root.getBoundingClientRect().width;
    const th = t.root.getBoundingClientRect().height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = 4;
    let x = r.left;
    let y = r.bottom;
    if (y + th > vh - m) y = r.top - th; // 下に入らない → 上に出す
    if (x + tw > vw - m) x = r.right - tw; // 右に入らない → 左へ
    x = Math.min(Math.max(m, x), Math.max(m, vw - tw - m));
    y = Math.min(Math.max(m, y), Math.max(m, vh - th - m));
    t.root.style.left = `${(x - host.left) / k}px`;
    t.root.style.top = `${(y - host.top) / k}px`;
  }

  dispose(): void {
    this.el.remove();
  }
}
