import { spawnSync } from 'node:child_process'

const r = spawnSync('npx vitest run src/objects/seed/seedPlacements.test.ts', {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, UPDATE_SEED: '1' },
})
process.exit(r.status ?? 1)
