import type { LookSource } from '../../contracts';

type PushLook = LookSource & { push?(dx: number, dy: number): void };

/** マウス look とパッド look を足す */
export class CombinedLook implements LookSource {
  constructor(
    private readonly a: PushLook,
    private readonly b: PushLook,
  ) {}
  /** テスト窓口 input.look 用（マウス側へ） */
  push(dx: number, dy: number): void {
    this.a.push?.(dx, dy);
  }
  consume(): { dx: number; dy: number } {
    const x = this.a.consume();
    const y = this.b.consume();
    return { dx: x.dx + y.dx, dy: x.dy + y.dy };
  }
}
