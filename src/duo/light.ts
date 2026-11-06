import type { DuoView } from './types';

/**
 * COOP-1 作業 2（#399）: 分割の あいだだけ 入る「軽くする 工夫」の 入り切り（§7.2・AC30）。宣言だけ（実装は developer）。テストは light.test.ts。
 *
 * ---- つなぎ目の 約束 ----
 *   new DuoLightGate()   step(view) を 固定ステップごとに 1 回 呼ぶ。返す 値 = `duo.state().light`。
 *   'split' に なった その ステップから true。'split' でなく なっても 120 ステップ（2 秒）は true の まま、120 ステップ目に false に もどる。
 *   とちゅうで また 'split' に なれば true の まま（数え直し）。ルーペ・1 画面だけでは true に ならない。
 *
 * ---- 工夫の 中身（重さの 試作 /mnt/project-files/coop/perf/README.md の D を 本番に 合わせた 決め）----
 *   - 小ブロックの 細かい 形を 近い 16 マスだけ（microRadius = 16。三角形が 約 6 割に へった。いちばん 効いた）
 *   - 読みこむ 輪を 小さく（RING_SMALL。輪が 2 つの あいだは もともと 小さい: 試作の「2 列ちぢめる」と 同じ）
 *   - ルーペの 絵は 近い 16 マス だけ（far を 近く）
 *   - 影は 切る(分割の あいだ)。試作では ほとんど 効かなかったが、費用が 小さいので 入れる
 *   かすみ・影のように 目立つ 物は 分割の 切りかえと 同じ 瞬間に 変える(§7.2)。
 */
export const DUO_LIGHT = {
  /** 小ブロックを 細かく 描く 半径（マス） */
  microRadiusTiles: 16,
  /** 1 画面に もどってから 元に もどすまで（ステップ。120 = 2 秒） */
  restoreSteps: 120,
} as const;

export class DuoLightGate {
  constructor() {
    throw new Error('COOP-1 作業 2: DuoLightGate は まだ 実装されていない');
  }
  step(_view: DuoView): boolean {
    throw new Error('COOP-1 作業 2: 未実装');
  }
}
