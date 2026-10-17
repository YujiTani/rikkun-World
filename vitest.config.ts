import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // #184: 8192 四方を 数えるユニット（biome.test.ts）は expect を 数百万回 呼ぶので 5 秒では足りない
    testTimeout: 120_000,
  },
});
