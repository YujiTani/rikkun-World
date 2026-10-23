import { it } from 'vitest';
import { buildBig } from '../gashaBig';
it('p', () => {
  const m = buildBig();
  const rows = m.hits.filter((h) => h.joint === 'Hips').slice(0, 14).map((h) => `${h.name} c(${h.c.toArray().map((v) => v.toFixed(0))}) half(${h.half.map((v) => v.toFixed(1))})`);
  console.error('\n' + rows.join('\n') + '\nscale ' + m.scale);
});
