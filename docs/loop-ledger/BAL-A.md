dev / test-review | 【軽微】 | e2e/m3.spec.ts AC17 の `const kinds = {...} // ...;` セミコロンがコメントの中に入っている（ASI で動くが lint で引っかかりうる）。`};` の後にコメントを置く
dev / test-review | 【軽微】 | e2e/bal-a.spec.ts AC11 は hp の結果だけ見ている。playerHit の amount（16・13）も expect すると「なぜその数か」まで確かめられる。armorValue は取って使っていない
dev / test-review | 【軽微】 | AC1（4 種の体力・攻撃力・体当たり・経験値・強さ 1/1.25/1.5/5）と AC6（§4.3 の 44 こ・§4.4 の 8 こ）のユニットは今回の差分に無い。窓口名を開発が決めるため後でよいが、実装と同時に必ず足すこと
dev / code-review | 【軽微】 | src/yokai/stats.ts `damageHearts: r.attack / 2` は ぬりかべ で 2 → 8 に変わる（今は どこからも読まれていない）。使わないなら項目ごと消すか、意味（ハート数）をコメントで書く
dev / code-review | 【軽微】 | src/yokai/stats.ts `yokaiStrength(kind, _m, _title)` の StrengthKind が contracts の YokaiKind と二重定義。#110 で M・二つ名を足すとき、`YokaiTitle` と一緒に contracts か stats の片方にまとめる
dev / code-review | 【軽微】 | src/yokai/stats.ts 攻撃力は BASIS の手書き（2・2・2・16）で、式から出ていない。§2.2・§4.1 が「攻撃力は今のまま」としているので仕様どおりだが、#110 で攻撃力の上がり方（M の半分）を足すとき 1 か所に集めること
