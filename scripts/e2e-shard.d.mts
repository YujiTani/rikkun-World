export function specFiles(dir?: string): string[];
export function countTests(src: string): number;
export function splitByTime(files: string[], times: Record<string, number>, n: number, counts?: Record<string, number>): string[][];
export function loadTimes(table?: string, dir?: string): Record<string, number>;
