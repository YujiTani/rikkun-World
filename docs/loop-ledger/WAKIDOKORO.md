# WAKIDOKORO loop ledger
- 設計: 名前（id は 保存の ため かえない）・5 方向（向き なし）・こわせる が 落とさない・むてき 共用（熱は 30、妖怪 90）・燃焼 タイマーは 出たら 0。
- アート: 渦 4 コマ（2 本うで 45° ずつ）、たきつぼは いしの くぼみ に 水 / マグマ。
- 開発: springs.ts（5 出口・上限）、liquidCore.ts（2 方向）、PlayerCombat（heatHurt）、DropField（燃焼・マグマに うく）、bagVisuals（炎）、voxelMaterial（渦の コマ）。
- テスト: ユニット・E2E 緑。ゆずの 追加: minFall 5・負荷 上限 64。頻度の 調整は ゆずが 自然の マグマを 見つけた ので とりやめ（もとの まま）。
- レビュー: perf ratchet・knip・eslint は main と 同じ。
