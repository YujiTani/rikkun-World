/**
 * 上の 帯の テロップの 文（NINJA-1 §3.2）。出どころで かえる。名前は ［漢字｜よみ］ の まま わたす（ふりがなは 出す ときに withRuby）。
 *  nushi（ヌシが おとした 武器。今まで どおり）/ gasha（がしゃどくろが おとした 忍者装備）/ chest（宝箱に 入って いた 忍者装備）
 */
export type TelopSource = 'nushi' | 'gasha' | 'chest';

/** 名前の まえと あとの 文（名前の ところだけ 強調の 枠で かこむ ため、2 つに 分けて 持つ） */
export function telopParts(source: TelopSource): { pre: string; post: string } {
  switch (source) {
    case 'gasha':
      return { pre: 'がしゃどくろ が ', post: ' を おとした！' };
    case 'chest':
      return { pre: 'たからばこ に ', post: ' が はいって いた！' };
    default:
      return { pre: 'ヌシ が ', post: ' を おとした！' };
  }
}

export function telopText(source: TelopSource, name: string): string {
  const p = telopParts(source);
  return `${p.pre}${name}${p.post}`;
}
