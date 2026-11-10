// HOUSE-2A（#364）名前の ヘルプ（ばしょ・しゅるいの ボタンに のせて 12 コマで 出る）。仕様 §2.3・AC9b。DOM・three なし。
// 置き場所（カーソルの 近く・画面の ふちで 止める）と 見た目は 画面（src/ui/houseEditor/）の 係。ここは「何の ボタンに のせて、いつ 出るか・何と 書くか」。
import type { EditorState } from '../editor/model';
import { PART_NAME, PARTS, kindName, splitKind, type Part } from './kinds';

/** ヘルプの 数（コマ ＝ 1/60 秒） */
const TIP = {
  /** のせてから 出るまで（12 コマ ＝ 0.2 秒）。出て いる 間に となりへ うつる ときは 待たない */
  showFrames: 12,
} as const;

const TIP_BTN = /^(part|roof|wall|window|door|deco)-(.+)$/;

/** ヘルプが 出る ボタンか（ばしょ・しゅるいの ボタン。窓口の 画面に 見えて いるかは 呼ぶ 側が 見る） */
const isTipButton = (id: string): boolean => TIP_BTN.test(id);

export class HoverTip {
  private id: string | null = null;
  private frames = 0;
  private shownId: string | null = null;

  /** のせた／はなした。visible ＝ いま 画面に 見えて いる ボタンか（見えない ボタンは のせた ことに しない） */
  hover(id: string | null, visible: (id: string) => boolean): void {
    if (id === null || !isTipButton(id) || !visible(id)) {
      this.reset();
      return;
    }
    if (id === this.id) return;
    const wasShown = this.shownId !== null;
    this.id = id;
    this.frames = 0;
    this.shownId = wasShown ? id : null; // 出て いる 間は となりへ 待たずに うつる
  }

  /** 1 コマ。出て いる／待って いる ボタンが 見えなく なったら 消す */
  tick(visible: (id: string) => boolean): void {
    if (this.id === null) return;
    if (!visible(this.id)) {
      this.reset();
      return;
    }
    if (this.shownId === null && ++this.frames >= TIP.showFrames) this.shownId = this.id;
  }

  reset(): void {
    this.id = null;
    this.frames = 0;
    this.shownId = null;
  }

  /** 出て いる ヘルプの ボタン（出て いなければ null） */
  get shown(): string | null {
    return this.shownId;
  }
}

/** ヘルプの 字（しゅるいの ボタン ＝ 名前 1 行・ばしょの ボタン ＝ ばしょの 名前 ＋「いま: 〇〇」） */
export function tipLines(id: string, s: Readonly<EditorState>): string[] {
  const m = TIP_BTN.exec(id);
  if (!m) return [];
  if (m[1] === 'part') {
    const part = m[2] as Part;
    if (!(PARTS as readonly string[]).includes(part)) return [];
    return [PART_NAME[part], `いま: ${nowOf(part, s)}`];
  }
  return [kindName(m[2]!)];
}

/** いま えらんで いる 物の 名前（かざりは 数） */
function nowOf(part: Part, s: Readonly<EditorState>): string {
  if (part === 'deco') return s.deco.length > 0 ? `${s.deco.length} つ` : 'なし';
  const kind = { roof: s.roof, wall: s.wall, window: s.windowKind, door: s.door }[part];
  return kindName(kind);
}

/** 見本で 光らせる 部分の 名前（ポップアップの しゅるいの ボタン → やね・かべ・まど・と・えんとつ・のれん・はなだん・しゃちほこ）。ほかは null */
export function glowPartOf(id: string): string | null {
  const m = TIP_BTN.exec(id);
  if (!m || m[1] === 'part') return null;
  return m[1] === 'deco' ? splitKind(m[2]!).form : m[1]!;
}
