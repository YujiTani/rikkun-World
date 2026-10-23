# 虹のシャイニング: ドームの見た目はブランチの白いドーム（2026-10-22 yuzu）
- PR #243（main）のにじの帯ではなく、WEAPON-9 の白いドーム（カメラを引いて外から見せる・すいこみのつぶ・向きで変わる斬撃）を使う。ふちはなめらかに直す。
- のせ直しの PR で docs/decisions/2026-10-22-niji-dome-look.md として入れる。
- 虹の ふつうの 攻撃の 軌跡（弧）は plain の まま。にじ色の 板の 斬撃は slashView（nijiFx.slash）が 受け持つので、軌跡まで rainbow に すると 二重に 見える（2026-10-21 proto-feedback「斬撃 A は OK」）。
