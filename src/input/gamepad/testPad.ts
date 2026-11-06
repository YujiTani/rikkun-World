/** ユニットテストだけが 使う 偽パッド・偽 Storage(本番からは import しない) */

export function fakePad(index: number, opts: { buttons?: number[]; axes?: number[]; connected?: boolean } = {}): Gamepad {
  const b = Array(16).fill(false);
  for (const i of opts.buttons ?? []) b[i] = true;
  return {
    id: 'Xbox Controller (STANDARD GAMEPAD Vendor: 045e)',
    index,
    connected: opts.connected ?? true,
    mapping: 'standard',
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons: b.map((pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })),
    timestamp: 0,
    vibrationActuator: undefined as unknown as GamepadHapticActuator,
  } as unknown as Gamepad;
}

/** 書いた 回数を 数える Storage。throwOn で 投げる 向きを えらべる */
export class FakeStorage implements Storage {
  readonly data = new Map<string, string>();
  writes = 0;
  constructor(
    init: Record<string, string> = {},
    private readonly throwOn: { get?: boolean; set?: boolean } = {},
  ) {
    for (const [k, v] of Object.entries(init)) this.data.set(k, v);
  }
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    if (this.throwOn.get) throw new Error('blocked');
    return this.data.get(key) ?? null;
  }
  key(i: number): string | null {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.throwOn.set) throw new Error('blocked');
    this.writes++;
    this.data.set(key, value);
  }
}
