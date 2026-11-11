// HOUSE-2A（#364）①「そと」の しゅるいを えらぶ・かざりを つける・あかりを かえる。仕様 docs/design/HOUSE-2.md §2.3・§5。DOM・three なし。
// 作りかけの 読み書き・もどす の 記録・ふきだしは 持ち主（controller.ts）の 係。ここは えらびかたの きまり（おぼえた 物だけ・かざりは 形ごとに 1 つ・「あたらしい！」の 印・ふきだし）。
import { LIGHT_KINDS, splitKind, type Part } from '../recipes/kinds';
import type { RecipeLog } from '../recipes/log';
import { cloneState, sameForm, type EditorState } from './model';
import { MSG, roofNoneMsg, type DecoKind, type LightKind, type Step } from './tuning';

/** 持ち主に たのむ こと（持ち主 ぜんぶは わたさない） */
export interface KindHost {
  /** 作りかけ（読むだけ） */
  state(): EditorState;
  /** 状態を 履歴に 積む。part ＝ ① の ばしょ（もどすで ポップアップが その ばしょへ 切りかわる）。かわらなければ 何もしない（false） */
  commit(next: EditorState, step: Step, part?: Part): boolean;
  say(text: string): void;
}

/** かざりの 形 → ふきだしに 出す 名前（やね なしで つかない 物） */
const ROOF_DECO_NAME: Readonly<Record<string, string>> = { entotsu: 'えんとつ', shachi: 'しゃちほこ' };

export class KindEdit {
  constructor(
    private readonly host: KindHost,
    private readonly recipes: RecipeLog,
  ) {}

  /** やね・かべ・まど・と を えらぶ（今と 同じ・おぼえて いない・知らない 物は false） */
  set(part: Exclude<Part, 'deco'>, kind: string): boolean {
    const s = this.host.state();
    if (!this.recipes.kindOk(part, kind) || this.current(s, part) === kind) return false;
    const next = cloneState(s);
    if (part === 'roof') next.roof = kind as EditorState['roof'];
    else if (part === 'wall') next.wall = kind as EditorState['wall'];
    else if (part === 'window') next.windowKind = kind as EditorState['windowKind'];
    else next.door = kind as EditorState['door'];
    this.recipes.clearMark(`${part}-${kind}`);
    const ok = this.host.commit(next, 'soto', part);
    if (ok) this.warn(next, part, kind);
    return ok;
  }

  /** かざり: 同じ 物は はずす・同じ 形の ちがう 案は 入れかえ・形が ちがえば ふえる（1 回の 操作） */
  deco(kind: string): boolean {
    const s = this.host.state();
    if (!this.recipes.kindOk('deco', kind)) return false;
    const k = kind as DecoKind;
    const next = cloneState(s);
    const at = next.deco.findIndex((q) => sameForm(q, k));
    if (at < 0) next.deco.push(k);
    else if (next.deco[at] === k) next.deco.splice(at, 1);
    else next.deco[at] = k;
    this.recipes.clearMark(`deco-${kind}`);
    const ok = this.host.commit(next, 'soto', 'deco');
    if (ok) this.warn(next, 'deco', kind);
    return ok;
  }

  /** あかり（② の もどす 1 回）。今と 同じ 物は 何も かわらず ふきだし（ちょうちんも ほかの あかりも。あかりは ひとつ ひつよう） */
  light(kind: string): boolean {
    const s = this.host.state();
    if (!(LIGHT_KINDS as readonly string[]).includes(kind) || !this.recipes.lightOk(kind)) return false;
    if (s.light === kind) {
      this.host.say(MSG.light);
      return false;
    }
    const next = cloneState(s);
    next.light = kind as LightKind;
    this.recipes.clearMark(`light-${kind}`);
    return this.host.commit(next, 'naka');
  }

  private current(s: Readonly<EditorState>, part: Exclude<Part, 'deco'>): string {
    return { roof: s.roof, wall: s.wall, window: s.windowKind, door: s.door }[part];
  }

  /** つかない 組みあわせの ふきだし（つけた ことには なる。材料は 0。§2.3） */
  private warn(next: Readonly<EditorState>, part: Part, kind: string): void {
    if (part === 'wall' && kind === 'none') {
      this.host.say(MSG.wallNone);
      return;
    }
    if (next.roof === 'none') {
      const form = splitKind(kind).form;
      const name = part === 'roof' ? next.deco.map((d) => ROOF_DECO_NAME[splitKind(d).form]).find((n) => n !== undefined) : part === 'deco' && next.deco.includes(kind as DecoKind) ? ROOF_DECO_NAME[form] : undefined;
      if (name !== undefined) {
        this.host.say(roofNoneMsg(name));
        return;
      }
    }
    if (part === 'deco' && splitKind(kind).form === 'hanadan' && next.deco.includes(kind as DecoKind) && next.windows === 0) this.host.say(MSG.noWindowHanadan);
  }
}
