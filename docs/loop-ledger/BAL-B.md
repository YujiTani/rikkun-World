test-review | 【軽微】 | e2e/bal-b.spec.ts:117,191 `row.name ?? 'からかさおばけ'` は name が別の文字（例 からかさ）でも通ってしまう。PO の決め（表示名）どおり、期待は name をそのまま使うか、name が 'からかさおばけ' であることも確かめる
test-review | 【軽微】 | e2e/bal-b.spec.ts:92-95,128-132 `out.far`・`nameplate`（遠いとき）・`hpBarIdle` を集めているのに何も確かめていない。16 ブロックより遠いと名前が出ない・たたく前はバーが出ない、を確かめるか、使わない値を消す
test-review | 【軽微】 | e2e/bal-b.spec.ts §6 テスト: ぬりかべ に たいしょう を頼んだ場合（→ おやぶん）が抜けている。ヌシ だけでなく たいしょう も 1 行足すと §2.5 の「たいしょう・ヌシ が当たったら おやぶん」に沿う
test-review | 【軽微】 | e2e/bal-b.spec.ts 全体: 実装の前に赤になることの記録（コミットメッセージや PR）がない。spawn の title・m・窓口がまだないので落ちるはずだが、PR に 1 行書くこと
code-review | 【軽微】 | src/main.ts:1269 頭の上の名前は screen が play 以外（持ち物・メニュー）でも出る。hpBar と同じく play のときだけ更新し、それ以外は空配列を渡すとよい
code-review | 【軽微】 | src/ui/yokaiNameplates.ts:28-32,39-42 二つ名の妖怪がいる間、毎フレーム offsetWidth/offsetHeight を読んでから style を書く（レイアウトの読み書き交互）。数は 1〜2 体なので急ぎでない。幅を text が変わったときだけ測って覚えると安い
code-review | 【軽微】 | src/yokai/ai/YokaiManager.ts announce()/nameplates() 毎フレームの小さい確保（announce の複製・nameplates の push オブジェクト・titleLabel の文字列）。二つ名が出ている間だけなので問題なし。気になるなら再利用に
code-review | 【軽微】 | src/yokai/ai/YokaiManager.ts setTitle() は fits（体が入るか）・おしらせ・音の出来事を通らない（テスト窓口用と読める）。コメントに「テスト用。出現は decidePlace」と一言あると、あとで出現に使われない
code-review | 判定: 合格 | 重大 0・軽微 4。§2.3 の M の式・§2.5 の表・§4.5 の 48 こ・§6 の例外（1 体まで・ぬりかべ おやぶん・体が入らない・おしらせ 180・音を重ねない）どおり。M と二つ名は decidePlace の 1 か所（出現の自動・spawn 窓口の両方から）。二つ名の抽選は別シード titleRng で決定的、出現の乱数の並びも変えない。マージで落ちた物なし（hpBar の型は contracts から re-export、hud に announce・nameplate あり）。check:fast 緑（100 ファイル・1630 テスト）。E2E は回していない（CI）
