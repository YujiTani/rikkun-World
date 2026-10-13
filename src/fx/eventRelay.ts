/**
 * 出来事の列を 1 か所で drain したあと、もう 1 つの受け手へ配る入れ物。
 * 同じ列を 2 か所で drain すると 先に読んだ側が 空にして 後ろの受け手に 何も来ない（ゆみの音・表示が 出ない）。
 * 配る側は `give(list)`、受け手は `take()`（読むと空になる。毎フレーム new しない）。
 */
const NONE: readonly never[] = [];

export class EventRelay<T> {
  private buf: readonly T[] = NONE;

  give(list: readonly T[]): void {
    if (list.length > 0) this.buf = this.buf === NONE ? list : this.buf.concat(list);
  }

  take(): readonly T[] {
    const r = this.buf;
    this.buf = NONE;
    return r;
  }
}
