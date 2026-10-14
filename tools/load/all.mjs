// All the load tests in a row against one server, each shorter than on its own: HTTP requests,
// accounts, then players in the world.
//   npm run load [-- [url] [--players=30]]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { options, target, stopped, reportErrors } from './lib.mjs';

const opts = options('npm run load [-- [url] [options]]  — every load test, one after another', { players: 30 });
const server = await target(opts.url);
const env = { ...process.env, LOAD_URL: '', LOAD_THROWAWAY: server.throwaway ? '1' : '' };
const failed = [];
for (const [test, ...args] of [['http', '--duration=10'], ['auth', '--duration=10'], ['players', `--bots=${opts.players}`, '--duration=30', '--join-rate=10']]) {
  if (stopped()) break;
  console.log(`\n=== load:${test}`);
  const file = fileURLToPath(new URL(`./${test}.mjs`, import.meta.url));
  const { status } = spawnSync(process.execPath, [file, server.base, ...args], { stdio: 'inherit', env });
  if (status !== 0) failed.push(test);
}
console.log(`\n=== ${failed.length ? `not clean: ${failed.join(', ')}` : 'all clean'}`);
const errors = reportErrors(server);
await server.stop();
process.exit(failed.length || errors ? 1 : 0);
