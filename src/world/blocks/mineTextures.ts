/**
 * MINE-1B（#349）の 16×16 の 絵。元の 絵は art/MINE-1/<名前>/<名前>_rows.txt（yuzu OK の 見本）と
 * docs/art/design/07-mine.md 20.10（チョークの しるし B2「てがき（ほそ線）」）。
 *
 * ・ブロックの 平らな 絵 9 まい: ねんど・せっかいせき・しっくい は ふつうの 面の 絵。
 *   ほたるいし・きんの いし・すいしょうの いし・ダイヤの いし・せきたん・てつ（B「とびだす つぶ」）の 絵は、
 *   16 ブロックより 遠くの 平らな 絵（箱の 段・LOD）と アイテムの 絵に つかう（近くの つぶは render/looks/oreGrains.ts）
 * ・せきたん・てつの 絵は 今の 絵 `coal_ore`・`iron_ore` を かえず（calm.test が 見る）、新しい 名前 `coal_ore_b`・`iron_ore_b` で 足す
 * ・チョークの しるし: 3 まいの 手がき × 4 向き（絵の 中で 右・左・上・下 を さす）。
 *   向きを きめた あとで 右下に かげを つける（仕様 20.10「かげは はんてんの あとに つける ので いつも 右下」）
 * 乱数なし（場所の きまった 並びだけ）。
 */

type Rgba = readonly [number, number, number, number];
const N = 16;
const CLEAR: Rgba = [0, 0, 0, 0];
const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

// ---------------------------------------------------------------- 平らな 絵（ブロック）

/** 平らな 絵の 名前（ブロックの id と そろえる。せきたん・てつだけ 今の 絵と 分ける ため `_b`） */
export const MINE_FLAT_TILE_NAMES = ['nendo', 'sekkaiseki', 'shikkui', 'hotaruishi', 'kin_ore', 'suisho_ore', 'diamond_ore', 'coal_ore_b', 'iron_ore_b'] as const;
export type MineFlatTileName = (typeof MINE_FLAT_TILE_NAMES)[number];

interface FlatArt {
  rows: readonly string[];
  /** 文字 → 色 */
  pal: Readonly<Record<string, string>>;
}

/** 16 ぎょうの 絵（art/MINE-1 の _rows.txt を そのまま。文字は 点の 多い 順） */
const FLAT: Readonly<Record<MineFlatTileName, FlatArt>> = {
  // ねんど: 地 #A57252 に 明るい すじ 2 本・こい すじ 2 本（左右に ずらして 地層に）
  nendo: {
    rows: [
      'AAAAAAAAAAAAACAA',
      'CAAAAAAAAAAAAAAA',
      'AAACAAAAAABAAAAA',
      'AAAAAAAAAAAAAAAA',
      'ACCCCCCCAAABAAAA',
      'AAAAAAAAACCCCCCA',
      'AAAAAAAABAAAAAAA',
      'AAAAAAABAAAAAAAA',
      'CAAAAAAAAAAAAAAA',
      'AAAAAAAAAAABAAAA',
      'AACACAAAAAAAAAAA',
      'BBBBBBAAAAAAAAAA',
      'AAAAAAABBBBBBBCA',
      'AAAAAAACAAAAAAAA',
      'AAAAAAABAABAAAAA',
      'AAAAAAAABAAAAAAA',
    ],
    pal: { A: '#A57252', B: '#9A6A4C', C: '#AF7C5B' },
  },
  // せっかいせき: 灰みの 白に なみの しま 2 本と 小さな かいがら
  sekkaiseki: {
    rows: [
      'AAABAAAABAAAAAAA',
      'AABAAAACAADDAAAA',
      'AAAABABAADAADAAA',
      'AAAAAAAAAAAAAAAA',
      'BAAAAAAAAAAABAAA',
      'BBBAACBBBAAABBBA',
      'AAABBBAAABBBAAAB',
      'AAACAAAAAAAAAAAA',
      'CAADDAAACAAAAAAA',
      'AADAADAAABABAACA',
      'ACBCAAAAAAAACAAA',
      'AAAAAAAAAAAAAACA',
      'BBBAAAABBBBAAAAB',
      'AAABBBBCABABBBBA',
      'AAAAAAAAAAAAAAAA',
      'AAAAAAAAAAAAAAAA',
    ],
    pal: { A: '#D2CCC1', B: '#C5BFB2', C: '#D7D2C8', D: '#BAB4A7' },
  },
  // しっくい: あたたかい 白。上と 左の はし 1 点が 目地（ならべると 線に なる）
  shikkui: {
    rows: [
      'BBBBBBBBBBBBBBBB',
      'BAAACCAAAAAAAAAA',
      'BAAAAAAAAACAAAAA',
      'BAADAAAAAAAAAAAA',
      'BAAAAAAAAAAADAAA',
      'BAAAAAAAAAAAAADA',
      'BAAAAAAAAAAAAAAA',
      'BAAACAAAAAAAAAAA',
      'BAAAAAAAACAAAAAA',
      'BAAAAAAAAAAAAAAA',
      'BAACAAADAAAAAAAA',
      'BAAAAAAAAAAAAAAA',
      'BAAAAAADAAAAAAAA',
      'BDAAAAAAAAAAAAAA',
      'BAACADAAAAAAAAAC',
      'BAAAAAAAAAAAAAAA',
    ],
    pal: { A: '#E8E2D1', B: '#C9BFA9', C: '#EFEADD', D: '#D4CBB7' },
  },
  // ほたるいし: こい 青灰の 石に 光る つぶ 5 つ（芯 1 マス ＋ 下の わ）
  hotaruishi: {
    rows: [
      'AAABCBAEAABCBAAA',
      'AABBCBBDABBCBBAA',
      'AACCFCCAACCFCCEA',
      'AABBCBBAABBCBBAD',
      'EAABCBAAAABCBAAA',
      'AAEDAAAAAAAAEAAA',
      'ABCBAAADAAADAAEA',
      'BBCBBAAABCBAAAAA',
      'CCFCCAABBCBBDEAA',
      'BBCBBAACCFCCAAAA',
      'DBCBAAABBCBBAAAA',
      'AAABCBAABCBAAAAA',
      'AABBCBBAAADAAAAA',
      'AACCFCCAAAAAAAAA',
      'DABBCBBAAAAAAAAA',
      'AAABCBAAAAAAADAD',
    ],
    pal: { A: '#5F666F', B: '#93BD52', C: '#C9E56E', D: '#666C76', E: '#5A6069', F: '#EEF8B2' },
  },
  // きんの いし: 石に 小さな 金の 粒 3 つ（左上の 1 マスが 光）
  kin_ore: {
    rows: [
      'AAAAAAAAAAAAAAAA',
      'ADAACCAAAAAAAAAA',
      'CAEEBBAAAAADAAAA',
      'ACEEBBAAACAAAAAA',
      'AABBBBCACAACACCC',
      'AABBBBAAAAAADAAA',
      'AACAAAAAAADAAAAA',
      'AAAACACAAAAAAAAA',
      'AACACAADAAAAAAAA',
      'AADDAAAADEEBBAAA',
      'AAAAAAAAAEEBBAAA',
      'AAAEEAAAABBBBAAA',
      'ADAEEAAAABBBBAAA',
      'DAAAAAAAADAACACA',
      'AAADAADADAAADAAA',
      'AACAAAAAAAAAAAAA',
    ],
    pal: { A: '#8E8E8E', B: '#EBB840', C: '#828282', D: '#9A9A9A', E: '#FFF0B4' },
  },
  // すいしょうの いし: くぼみの 中から 水色の はしら（太い 1 本 ＋ 細い 3 本）
  suisho_ore: {
    rows: [
      'AAAAAAAAAAAAAAAA',
      'ABAACCAAAAAAAAAA',
      'CAABAAAAAAABAAAA',
      'ACBAADDEECADDAAA',
      'AAACADDEEAADDCCC',
      'AAAABEEEEAAABAAA',
      'AACAAEEEEABAAAAA',
      'AAAACACAAAAAAAAA',
      'AACACAABAAAAAAAA',
      'AABBADDABDDAAAAA',
      'AAAAADDAADDAAAAA',
      'AAAAAAAAAAAAAAAA',
      'ABAAAAAAAAAAAAAA',
      'BAAAAAAAABAACACA',
      'AAABAABABAAABAAA',
      'AACAAAAAAAAAAAAA',
    ],
    pal: { A: '#8E8E8E', B: '#9A9A9A', C: '#828282', D: '#E0F7FC', E: '#8CDAF2' },
  },
  // ダイヤの いし: 白い ひし形の 石 1 つ（右上に ピンク・左下に きいろの きらっ）＋ 小さな かけら
  diamond_ore: {
    rows: [
      'AAAAAAAAAAAAAAAA',
      'AEAADDAAAAAAAAAA',
      'DAAEAAAAAAAEBBAA',
      'ADEAAAAAADAABBAA',
      'AAADAADADAADADDD',
      'AAAAEAABBAAAEAAA',
      'AADAAAABBAEAAAAA',
      'AAAADBBBBGGAAAAA',
      'AADADBBBBGGAAAAA',
      'AAEBBBBFFCCCCAAA',
      'AAABBBBFFCCCCAAA',
      'AAAAAHHCCCCAAAAA',
      'AEAAAHHCCCCAAAAA',
      'EAAAAAACCEAADADA',
      'AAAEAAECCAAAEAAA',
      'AADAAAAAAAAAAAAA',
    ],
    pal: { A: '#8E8E8E', B: '#FBFDFF', C: '#AEB6DE', D: '#828282', E: '#9A9A9A', F: '#E3E8F8', G: '#FFD3EA', H: '#FFF1B0' },
  },
  // せきたん（B）: 石に うすい 板 3 まい（よこの すじ。左はしが つや）
  coal_ore_b: {
    rows: [
      'AAAAAAAAAAAAAAAA',
      'ADAABBAAAAAAAAAA',
      'BAEECCCAAAADAAAA',
      'ABEECCCAABAAAAAA',
      'AAABAABABAABABBB',
      'AAAADAAAAAAADAAA',
      'AABAAAAAAADAAAAA',
      'AAAABABAAEECCCAA',
      'AABABAADAEECCCAA',
      'AADDAAAADAAAAAAA',
      'AAAAAAAAAAAAAAAA',
      'AAEECCCAAAAAAAAA',
      'ADEECCCAAAAAAAAA',
      'DAAAAAAAADAABABA',
      'AAADAADADAAADAAA',
      'AABAAAAAAAAAAAAA',
    ],
    pal: { A: '#8E8E8E', B: '#828282', C: '#3A3442', D: '#9A9A9A', E: '#5E5869' },
  },
  // てつ（B）: 石に まるい こぶ 2 つ（＋ の 形。まん中が 光）
  iron_ore_b: {
    rows: [
      'AAAAAAAAAAAAAAAA',
      'AEAACCAAAAAAAAAA',
      'CAAEAAAAAABDBAAA',
      'ACEAAAAAABBDBBAA',
      'AAACAACACDDFDDCC',
      'AAAAEAAAABBDBBAA',
      'AACAAAAAAABDBAAA',
      'AAAACACAAAAAAAAA',
      'AACACAAEAAAAAAAA',
      'AAEBDBAAEAAAAAAA',
      'AABBDBBAAAAAAAAA',
      'AADDFDDAAAAAAAAA',
      'AEBBDBBAAAAAAAAA',
      'EAABDBAAAEAACACA',
      'AAAEAAEAEAAAEAAA',
      'AACAAAAAAAAAAAAA',
    ],
    pal: { A: '#8E8E8E', B: '#82462A', C: '#828282', D: '#A85E38', E: '#9A9A9A', F: '#CC8452' },
  },
};

function paintFlat(name: MineFlatTileName): Rgba[] {
  const { rows, pal } = FLAT[name];
  const out: Rgba[] = [];
  for (const row of rows) for (const ch of row) out.push(pal[ch] === undefined ? CLEAR : hex(pal[ch]!));
  return out;
}

// ---------------------------------------------------------------- チョークの しるし（B2「てがき（ほそ線）」）

/** 絵の 中で 矢が さす 向き（e = 右・w = 左・n = 上・s = 下） */
export type ChalkImageDir = 'n' | 'e' | 's' | 'w';
export const CHALK_SHEETS = 3;
export const CHALK_TILE_NAMES = ([1, 2, 3] as const).flatMap((k) => (['n', 'e', 's', 'w'] as const).map((d) => `chalk_${k}_${d}` as const));
export type ChalkTileName = (typeof CHALK_TILE_NAMES)[number];

/** しるしの 絵の 色（W = チョークの 白〔真っ白 なし〕・G = ざらざら・H = 光）。かげ `s` は 向きを きめた あとで つけ直す ので 元の 絵の `s` は 読まない */
const CHALK_COLOR: Readonly<Record<string, string>> = { W: '#F2F0EA', G: '#DCD7CB', H: '#FAF9F5' };
/** 右下の かげ（石と ほぼ 同じ 明るさの 灰） */
const CHALK_SHADOW = '#9C968C';

/** 右を さす 3 まい（16 ぎょう。`.` と `s` は すきとおる） */
const CHALK_SHEET_ROWS: readonly (readonly string[])[] = [
  [
    '................',
    '................',
    '.........Ws.....',
    '.........Gs.....',
    '.........sWWs...',
    '..........sWWs..',
    '...........sGWWs',
    '..Ws...WGHWWWGWW',
    '.WWWWWWWWWGWWWWs',
    '.sWWGGWsssssHWss',
    '..ssssss...HWss.',
    '...........Wss..',
    '...........ss...',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '.........Ws.....',
    '.........GWGs...',
    '.........sWWWs..',
    '..........sWWWs.',
    '...........sGWWs',
    '.......WWWWHHWGG',
    'WWWWHGWWWGWWWWWs',
    'WWWWWWWsssssWWss',
    'ssssssss...WWss.',
    '..........WWss..',
    '..........WWs...',
    '..........sss...',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '.........Ws.....',
    '.........WWWs...',
    '.........ssWWs..',
    '...........WWs..',
    '...........sWWs.',
    '.WWWWWWWWWWHWWWs',
    '.WWHWWGWWWWWWWWs',
    '.sssssssssssWGWs',
    '...........WWHss',
    '..........WWHss.',
    '.........WWWss..',
    '.........sWss...',
    '..........ss....',
    '................',
  ],
];

/** 白い 点だけの 絵（右むき）。null = すきとおる */
function chalkBase(sheet: number): (string | null)[][] {
  return CHALK_SHEET_ROWS[sheet].map((row) => [...row].map((ch) => (CHALK_COLOR[ch] !== undefined ? CHALK_COLOR[ch]! : null)));
}

/** 向きを きめる: 右を さす 絵 a を、さす 向きに あわせて 左右 はんてん（左）・90 度 まわす（上・下）する */
function orientChalk(a: (string | null)[][], dir: ChalkImageDir): (string | null)[][] {
  const at = (r: number, c: number): string | null => a[r]![c]!;
  const out: (string | null)[][] = [];
  for (let r = 0; r < N; r++) {
    const row: (string | null)[] = [];
    for (let c = 0; c < N; c++) {
      // new[r][c] = old[...]: e = そのまま / w = 左右 はんてん / n = 左まわり 90 度 / s = 右まわり 90 度
      row.push(dir === 'e' ? at(r, c) : dir === 'w' ? at(r, N - 1 - c) : dir === 'n' ? at(c, N - 1 - r) : at(N - 1 - c, r));
    }
    out.push(row);
  }
  return out;
}

/** 線の 右・下・右下に かげを 1 点ずつ（線の 点でない 所だけ。向きを きめた あとの 絵で） */
function paintChalk(sheet: number, dir: ChalkImageDir): Rgba[] {
  const m = orientChalk(chalkBase(sheet), dir);
  const out: Rgba[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const own = m[r]![c];
      if (own !== null && own !== undefined) {
        out.push(hex(own));
        continue;
      }
      const shaded = (r > 0 && m[r - 1]![c] !== null) || (c > 0 && m[r]![c - 1] !== null) || (r > 0 && c > 0 && m[r - 1]![c - 1] !== null);
      out.push(shaded ? hex(CHALK_SHADOW) : CLEAR);
    }
  }
  return out;
}

/** しるしの 絵の 名前（sheet = 0〜2、dir = 絵の 中で 矢が さす 向き） */
export function chalkTileName(sheet: number, dir: ChalkImageDir): ChalkTileName {
  return `chalk_${(sheet % CHALK_SHEETS) + 1}_${dir}` as ChalkTileName;
}

// ---------------------------------------------------------------- まとめ

/** このファイルが 描く 絵の 名前（アトラスの うしろに 足す） */
export const MINE_TILE_NAMES: readonly (MineFlatTileName | ChalkTileName)[] = [...MINE_FLAT_TILE_NAMES, ...CHALK_TILE_NAMES];
export type MineTileName = (typeof MINE_TILE_NAMES)[number];

const FLAT_SET: ReadonlySet<string> = new Set(MINE_FLAT_TILE_NAMES);
const CHALK_SET: ReadonlySet<string> = new Set(CHALK_TILE_NAMES);

export function isMineTile(name: string): name is MineTileName {
  return FLAT_SET.has(name) || CHALK_SET.has(name);
}

export function paintMineTile(name: MineTileName): Rgba[] {
  if (FLAT_SET.has(name)) return paintFlat(name as MineFlatTileName);
  // chalk_<まい>_<向き>
  const sheet = Number(name.charAt(6)) - 1;
  return paintChalk(sheet, name.charAt(8) as ChalkImageDir);
}
