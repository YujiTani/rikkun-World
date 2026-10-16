export interface Png {
  width: number;
  height: number;
  data: Uint8Array;
}
export type Cell = [number, number, number, number, number, number];
export interface Packed {
  width: number;
  height: number;
  cells: Cell[];
}
export function decodePng(buf: Uint8Array): Png;
export function encodePng(png: Png): Buffer;
export function packMotion(src: Png, frames: number): { png: Png; packed: Packed };
export function buildAll(srcDir: string, opts?: { encode?: boolean }): {
  atlas: Record<string, unknown>;
  pngs: Record<string, Png>;
  files: Record<string, Buffer>;
  report: Record<string, { width: number; height: number; bytes: number }>;
};
