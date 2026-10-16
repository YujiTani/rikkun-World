# RARITY-7 指摘台帳

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | design | design-reviewer | 【軽微】§4.3・AC9: 設定 `itemRarity` を持つ場所と、`itemRarity()`（モジュールの関数）がそれを読むつなぎ方が書いていない。ほる設定は `createDigConfig()` ごとの入れ物なので、関数が読む先が決まらない。ユニットテストの間で値が残らないよう、元に戻す方法（毎回作り直す／リセット関数）も一言ほしい | 書き足し | G1 | 直した（版 2: §4.2 に `resetItemRarity()`、§4.3 に置き場所・つなぎ方・戻し方、AC9 に戻る確かめ） |
| 1 | design | design-reviewer | 【軽微】§3.1・§3.2 と AC4 の食いちがい: §3.1 は「漢字なら ruby（例: 伝説（でんせつ））」と許すが、AC4 は漢字なしだけ通す。`word: string` は `textContent` で出す（`craftPanel.detail.ts:154`）ので ruby マークは入らない。「ことばは かな・カタカナだけ」にそろえるのが安全 | 言い回し | G2 | 直した（版 2: §3.1・§3.2 を かな・カタカナだけに） |
| 1 | design | design-reviewer | 【軽微】§9: `src/ui/craftModelM6.test.ts:62` が `rarityWord` を `'めずらしい'` と決め打ち。`info.test.ts:111` と同じ理由（3 段目のことばを案で変えたとき）でこわれるのに表にない。`rarityTier('rare').word` と比べる直しを足す | 一覧のもれ | G3 | 直した（版 2: §9 に 1 行） |
| 1 | design | design-reviewer | 【軽微】AC14: 「たんすのマスのふちの色」を何で読むか書いていない。`hotbar.ts`・`craftPanel.ts` は `data-rarity` を付けるが、`storageScreen.ts` は付けない（`parts.ts` 経由）。計算された色を読む対象（セレクタ）か、`data-rarity` を足すかを決める | 確かめ方のあいまいさ | G4 | 直した（版 2: たんすのマスに `data-rarity` を足す〈§8.1〉、AC14 で data-rarity と計算された borderColor を読む） |
| 1 | design | design-reviewer | 【軽微】AC7・AC15: 案 A/B が未決。「選ばれた案」とあるので、オーナー確認①の前にテストを書く場合は案 A で書く、と一言ほしい（案 B になったら AC7・AC15 と `craft.test.ts:61` を直す） | 書き足し | G5 | 直した（版 2: §7 の表の下に追記） |
| 1 | dev | code-reviewer | 【軽微】`e2e/rarity7.spec.ts` AC14: `IDS`・`DROP_MAX` を数で書いているのは §7 の「ここで決めた」範囲なので可。ただしホットバーのふちを `borderTopColor` で読んでいる（仕様は `borderColor`）。実装でマスが片側だけ色を変えると見逃すので、四辺そろう形なら `borderColor` に合わせるとよい | 書き足し | T1 | 直した（ホットバーのふちを borderColor で読む形に） |
| 1 | art | art-reviewer | 【重大】ツールチップ（`docs/screenshots/RARITY-7/tooltip-legendary.png`、ui-gate の rarity-7-tooltip）に「ことば＋宝石」の行がない。案 A のシートは星の下に「◆ でんせつ」の行がある。星だけだと 6 歳は 7 つ数えにくい。星の下に宝石つきのことばを足す（つくる画面のせつめいには「でんせつ」が出ているのでそろえる） | 案との食いちがい | A1 | 直した（ツールチップに 宝石＋ことば の行 `.tip-word`） |
| 1 | art | art-reviewer | 【軽微】ツールチップの星が、段の数だけの ★（`starText`）で、案 A のような うすい空の星（7 こ中いくつか）がない。「7 つのうち いくつ」が見えるよう、空の星をうすく足すとよい | 案との食いちがい | A2 | しない（PO: 空の星は なくてよい） |
| 1 | art | art-reviewer | 【軽微】7 段目のツールチップに、案 A の にじ色（名前 1 字ずつ・ふちの にじ）がなく、きいろ 1 色。でんせつの特別感が ホットバーより弱い | 案との食いちがい | A3 | 直した（7 段目の名前を にじ色に。reduced-motion で止める） |
| 1 | art | art-reviewer | 【軽微】おいわいの横断幕（`banner-legendary-1280x800.png`）の ★7 が 黒っぽく、オレンジの帯の上で 読みにくい。めずらしさの色（またはきん）にする。また、見出しの 物が つるはし（もとは 0 段）で、ファイル名の「legendary」と 絵が合っていない（検査用に 段を上げたのなら その旨を 残す） | 色・撮り方 | A4 | 直した（★ を くらい色＋しろい ふち。検査用に wood_pickaxe を 7 段にしたスクショ） |
| 1 | art | art-reviewer | 【軽微】えらんだ マスの きいろいわく（#FFC83D）と 4 段（きん #FFD23F）が近い。`hotbar-7tiers-epic-selected.png` では 外がわの わくで 区別はできるが、4 段は 1 マスの 色だけでは差が小さい。わくの 太さか 色（白みのある きいろ・白との 二重）で もう少し はなす。ホットバーは 7 段とも 形（宝石）が ちがい、白黒でも 区別できる点は 合格 | 区別 | A5 | 直した（すきま 2px を くらい色でうめる。1b1913e） |
| 1 | art | art-reviewer | 【軽微】つくる画面のせつめいで「ようかい に むけて…」の 行が 下で 切れている（`craft-detail-legendary.png`）。めずらしさの 変更ではないが 7 段目の 星の行が 増えた 画面で 目立つ | 配置 | A6 | しない（「▼ つづき」で 中を動かす 作りで、切れて見えるのは スクロールの途中。めずらしさの変更ではない） |
| 2 | dev | code-reviewer | 【軽微】`src/drops/rarity7.test.ts` に AC10（dirt を epic/mythic/legendary にして 20 回ほる→毎回 1 こ、`dropMax {legendary:3}` で 1〜3 こ）と AC11（袋 rarity `superRare`/`legendary` のセーブ読み込み、`banana` はアイテムの段階）の確かめがない。`DigSystem.test.ts`・`DropField.test.ts` にも epic/legendary の確かめなし。足す | テストの抜け | R1 | 直した（DigSystem.test・DropField.test に AC10・AC11） |
| 2 | dev | code-reviewer | 【軽微】`src/fx/bagVisuals.ts:72` のコメント「にじ色に流すのは 4 段目だけ。仮」が古い（今は 7 段目だけ）。直す | 言い回し | R2 | 直した |
| 2 | dev | code-reviewer | 【軽微】`src/fx/combatFx.test.ts` は `'legendary' as never` で型をごまかしている（Rarity は 7 つなので不要）。外す | 読みにくさ | R3 | 直した |
