import { spawn } from 'node:child_process';
import { mkdir, cp, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const port = process.env.PORT || process.env.PLAYWRIGHT_PORT || '3250';
const hostname = process.env.HOSTNAME || '127.0.0.1';
const isWindows = process.platform === 'win32';

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = (() => {
      if (isWindows && cmd === 'npm') {
        const quoted = [cmd, ...args]
          .map((a) => (/[\s"]/u.test(a) ? `"${a.replaceAll('"', '""')}"` : a))
          .join(' ');
        return spawn('cmd.exe', ['/d', '/s', '/c', quoted], {
          cwd: root,
          stdio: 'inherit',
          shell: false,
          env: { ...process.env, ...env },
        });
      }

      return spawn(cmd, args, {
        cwd: root,
        stdio: 'inherit',
        shell: false,
        env: { ...process.env, ...env },
      });
    })();

    const display = `${cmd} ${args.join(' ')}`.trim();
    child.on('error', (err) => reject(err));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${display} failed with code ${code}`));
    });
  });
}

async function main() {
  // For E2E tests, point the wallet API at a port that immediately refuses
  // connections. This ensures all API calls fail fast → services use local
  // fallback without waiting for timeouts. Port 1 on localhost refuses instantly.
  const buildEnv = {
    NEXT_PUBLIC_WALLET_API_URL: 'http://127.0.0.1:1',
  };
  await run('npm', ['run', 'build'], { env: buildEnv });

  // Next standalone output needs static assets available under the standalone folder.
  const standaloneDir = path.join(root, '.next', 'standalone');
  const standaloneStaticDir = path.join(standaloneDir, '.next', 'static');
  const srcStaticDir = path.join(root, '.next', 'static');

  await mkdir(path.dirname(standaloneStaticDir), { recursive: true });

  if (await pathExists(srcStaticDir)) {
    await cp(srcStaticDir, standaloneStaticDir, { recursive: true, force: true });
  }

  const publicDir = path.join(root, 'public');
  const standalonePublicDir = path.join(standaloneDir, 'public');
  if (await pathExists(publicDir)) {
    await cp(publicDir, standalonePublicDir, { recursive: true, force: true });
  }

  const serverPath = path.join(standaloneDir, 'server.js');
  if (!(await pathExists(serverPath))) {
    throw new Error('Standalone server not found. Expected .next/standalone/server.js after build.');
  }

  const env = { PORT: port, HOSTNAME: hostname };
  await run('node', [serverPath], { env });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
