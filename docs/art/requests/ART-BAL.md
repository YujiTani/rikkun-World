# pixel-artist への依頼: ART-BAL（#113）二つ名アイコン 3 種・おの 3 本

2026-10-16 art-director。オーナー決定ずみ（合わせ版 AC、`docs/decisions.md`）。

## 読むもの
- `docs/art/DESIGN.md` 13.3（アイコン）・13.4（おの）。見本シート `docs/art/ART-BAL-AC.png` の 3・4 章。
- 仕様: `docs/design/BALANCE.md` §2.8（おの）・§4.7（体力のバー）・§5・§5.1。
- 今の作り方: つるはし `src/ui/itemArtM4.ts` の `pickaxe()`、くわ `src/ui/itemArtM7.ts` の `kuwa()`（16×16 の `Rgba[]`、y = 0 が上、まわり 1 ドットの ふちどり `outline()`）。手に持つ形 `src/camera/heldTools.ts` の `Part`。
- 見本シートを作った試しのコード（考え方の参考。そのまま使わなくてよい）: `/mnt/project-files/balance/art/src/pixels.ts`（共有フォルダ）。

## 作るもの
1. **二つ名アイコン 3 種**（16×16）: おやぶん = 星 1 つ、たいしょう = 星 2 つ、ヌシ = かんむり。丸いバッジ・色・ふちは DESIGN 13.3 のとおり。
   - 関数: `nickIconPixels(tier: 'oyabun' | 'taisho' | 'nushi'): Rgba[]`
2. **おの 3 本のアイコン**（16×16、かた刃）: `wood_axe`（きの おの）・`stone_axe`（いしの おの）・`iron_axe`（てつの おの）。形と色は DESIGN 13.4。つるはし・くわ と同じ ななめの え、ふちどり `#2A1E14`。
   - 関数: `axeItemPixels(item: 'wood_axe' | 'stone_axe' | 'iron_axe'): Rgba[]`（アイテムの名前は開発が変えたら合わせる）
3. **おの 3 本の 手に持つ形**: `Part[]`（え・みね・刃・刃先 の 4 箱。寸法は DESIGN 13.4）。
   - `export const AXE_HELD_PARTS: Record<'wood_axe' | 'stone_axe' | 'iron_axe', Part[]>`（`Part` の型は同じ形で そのファイルに書く）

## 出すファイル（新しいファイルだけ。今のファイルは さわらない。つなぎこみは開発）
- `src/ui/itemArtBal.ts`（1 と 2）
- `src/camera/heldAxes.ts`（3）
- 見本シート `docs/art/ART-BAL-pixel.png`: 下を 1 枚に ならべる。
  - アイコン 3 種を 16・32・48px（整数倍、ドットのまま）。体力のバー（DESIGN 13.3 の寸法・色）の 左に置いた形を、ひるの空 `#6EA8E0` と よるの空 `#1B2350` の上で。
  - ホットバーの マス（64px、背景 `#2A5C99`、ふち 3px: き・いし 白 / てつ 青 `#7FB8FF`、アイコン 48px）に、きの つるはし・いしの つるはし・てつの つるはし・おの 3 本・くわ を ならべる。つるはし（T）・くわ（L）と 形で見分けられること、き・いし・てつ が 色で分かること。
  - 手に持つ形 5 つ（つるはし・おの 3・くわ）を 箱で描いたもの。

## たしかめること（渡す前に 自分で 見本シートを見る）
- アイコン 3 つが 16px で 見分けられ、強さの順（星 1 → 星 2 → かんむり）が分かる（AC23）。
- おのが つるはし・くわ と ちがう形に見え、き・いし・てつ が分かる（AC22）。
- 色は DESIGN 13 章の表の色だけ。光る・点滅する物は 作らない。
- ユニットテスト（`npm run check:fast`）が 通る。新しい関数の テスト（16×16 = 256 ドット、ふちどりの色）を 足してよい。

## 返すもの
作ったファイル、見本シートのパス、数（ドット・箱の数）、DESIGN と ちがう所。自分では コミットしない。
