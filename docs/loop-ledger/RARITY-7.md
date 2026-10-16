# RARITY-7 指摘台帳

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | design | design-reviewer | 【軽微】§4.3・AC9: 設定 `itemRarity` を持つ場所と、`itemRarity()`（モジュールの関数）がそれを読むつなぎ方が書いていない。ほる設定は `createDigConfig()` ごとの入れ物なので、関数が読む先が決まらない。ユニットテストの間で値が残らないよう、元に戻す方法（毎回作り直す／リセット関数）も一言ほしい | 書き足し | G1 | 直した（版 2: §4.2 に `resetItemRarity()`、§4.3 に置き場所・つなぎ方・戻し方、AC9 に戻る確かめ） |
| 1 | design | design-reviewer | 【軽微】§3.1・§3.2 と AC4 の食いちがい: §3.1 は「漢字なら ruby（例: 伝説（でんせつ））」と許すが、AC4 は漢字なしだけ通す。`word: string` は `textContent` で出す（`craftPanel.detail.ts:154`）ので ruby マークは入らない。「ことばは かな・カタカナだけ」にそろえるのが安全 | 言い回し | G2 | 直した（版 2: §3.1・§3.2 を かな・カタカナだけに） |
| 1 | design | design-reviewer | 【軽微】§9: `src/ui/craftModelM6.test.ts:62` が `rarityWord` を `'めずらしい'` と決め打ち。`info.test.ts:111` と同じ理由（3 段目のことばを案で変えたとき）でこわれるのに表にない。`rarityTier('rare').word` と比べる直しを足す | 一覧のもれ | G3 | 直した（版 2: §9 に 1 行） |
| 1 | design | design-reviewer | 【軽微】AC14: 「たんすのマスのふちの色」を何で読むか書いていない。`hotbar.ts`・`craftPanel.ts` は `data-rarity` を付けるが、`storageScreen.ts` は付けない（`parts.ts` 経由）。計算された色を読む対象（セレクタ）か、`data-rarity` を足すかを決める | 確かめ方のあいまいさ | G4 | 直した（版 2: たんすのマスに `data-rarity` を足す〈§8.1〉、AC14 で data-rarity と計算された borderColor を読む） |
| 1 | design | design-reviewer | 【軽微】AC7・AC15: 案 A/B が未決。「選ばれた案」とあるので、オーナー確認①の前にテストを書く場合は案 A で書く、と一言ほしい（案 B になったら AC7・AC15 と `craft.test.ts:61` を直す） | 書き足し | G5 | 直した（版 2: §7 の表の下に追記） |
