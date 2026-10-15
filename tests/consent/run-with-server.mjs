/**
 * Runs ONE consent suite against a local static-server.mjs of a checkout, in the foreground, then stops the server.
 * The server lives in this process (no background job); the suite is a child process whose exit code is this
 * script's exit code. CONSENT_ORIGIN is set for the suite; every other environment variable passes through.
 *
 *   node tests/consent/run-with-server.mjs <root> <port> <suite.mjs> [args...]
 */
import { spawn } from 'node:child_process';
import { startServer } from './static-server.mjs';

const [root, port, suite, ...args] = process.argv.slice(2);
if (!root || !port || !suite) { console.error('usage: run-with-server.mjs <root> <port> <suite.mjs> [args...]'); process.exit(2); }
const server = await startServer(root, +port);
const rc = await new Promise((done) => {
  const child = spawn(process.execPath, [suite, ...args], { stdio: 'inherit', env: { ...process.env, CONSENT_ORIGIN: `http://localhost:${port}` } });
  child.on('exit', (code, signal) => done(code === null ? 3 : code));
});
await new Promise((done) => server.close(done));
server.closeAllConnections && server.closeAllConnections();
console.log(`run-with-server: ${suite} rc=${rc}; server on ${port} closed`);
process.exit(rc);
