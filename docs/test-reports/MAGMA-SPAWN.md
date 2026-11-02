# MAGMA-SPAWN テスト
- ユニット: `src/debug/magmaDemo.test.ts`（見本の 中身・マグマの ますが あふれない・列が なければ 置かない）、`src/world/gen/liquidPonds.test.ts`（はじめの そばの いけ 5 シード・広場の 外・滝の ブロック・マグマの 滝が たきつぼと つながり 量 かわらず へりの 外に 出ない・決まり・3 しゅるい）
- 既存: surface・generateChunk・mineOres・seeThrough（ぬけ 0）すべて 通る。golden 6 セクション 作り直し（§6）
- E2E: `e2e/magma-spawn.spec.ts`（自然の マグマの 滝: わきみずが ある・スタートから 7 マス 以上・マグマ 10 マス 以上・たきつぼと つながる ／ 見本: こげた・こくようせき・わきみず 2 つ・マグマ 量 8）
- 画面: `/workspace/magma-spawn-shots/`
- ユニット だけ: 升目の いけの 頻度・はじめから 40 以内に ない・水の 滝の つながり（E2E は マグマの 滝 だけ）
