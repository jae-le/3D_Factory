import { spawnSync } from 'node:child_process'

const r = spawnSync('npx vitest run src/drawing/seedPlan.test.ts', {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, UPDATE_SEED: '1' },
})
process.exit(r.status ?? 1)
