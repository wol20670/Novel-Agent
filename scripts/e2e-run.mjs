// e2e 를 "한 명령으로 재현 가능하게" 돌리기 위한 orchestration — 빌드 → 프리뷰 기동 → 기존 e2e 실행
// → 정리. **기존 scripts/e2e.mjs 는 한 줄도 건드리지 않는다**(assertion·의미 무변경, BASE_URL 만 넘긴다).
//
//   npm run check:full     # = npm run check && node scripts/e2e-run.mjs
//
// 이 스크립트가 막는 함정 셋:
//  ① **스테일 dist** — `npm run build` 는 OneDrive 에서 에러 없이 exit 127 로 죽으면서 **옛 dist 를
//     그대로 남긴다**(CLAUDE.md). 그러면 e2e 가 몇 달 전 코드를 검사하고 통과한다. 그래서 매 실행마다
//     mkdtemp 로 **새 임시 폴더**에 빌드하고(스테일이 구조적으로 불가) exit code 와 산출물 존재를 확인한다.
//  ② **고정 포트 오탐** — 좀비 `vite preview` 가 4173 을 점유하고 있으면 새 프리뷰는 --strictPort 로
//     죽는데 readiness 폴링은 **옛 서버의 200** 을 볼 수 있다(= 옛 빌드로 e2e 를 돌리는 false PASS).
//     그래서 free port 를 잡아 쓰고, HTTP 200 만으로 판정하지 않고 **응답 본문이 방금 빌드한
//     index.html 과 같은지** 확인하며, **child 조기 종료**도 함께 감시한다.
//  ③ **좀비 프로세스** — npx 셸 래퍼를 거치면 child.kill() 이 손자를 못 죽인다. 그래서 vite 바이너리를
//     node 로 **직접** 실행한다.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 60_000;
const CLOSE_TIMEOUT_MS = 5_000;

const log = (...a) => console.log('[e2e-run]', ...a);

let tmpRoot = null;
let preview = null;
let previewExited = null; // child 가 먼저 죽으면 여기에 사유가 담긴다

/** child 종료 요청 → 실제 close 확인 → (그 다음에) 임시 폴더 제거. 순서가 계약이다. */
async function cleanup() {
  if (preview && preview.exitCode === null && preview.signalCode === null) {
    const pid = preview.pid;
    log('preview 종료 요청 (pid', pid + ')');
    const closed = new Promise((resolve) => preview.once('close', resolve));
    preview.kill();
    const ok = await Promise.race([
      closed.then(() => true),
      new Promise((r) => setTimeout(() => r(false), CLOSE_TIMEOUT_MS)),
    ]);
    if (!ok) {
      preview.kill('SIGKILL');
      const forced = await Promise.race([
        closed.then(() => true),
        new Promise((r) => setTimeout(() => r(false), CLOSE_TIMEOUT_MS)),
      ]);
      if (!forced) {
        // 실패로 만들지 않는다 — 결과 판정과 무관한 정리 단계다. 다만 조용히 넘어가면 다음 실행이
        // 좀비에게 당하므로 반드시 알린다(Windows 에서 실제로 겪는 상황이다).
        // ⚠️ **"모든 node 프로세스를 죽이라"고 안내하지 않는다** — 사용자의 무관한 node 작업까지
        //    날린다. 우리가 띄운 그 프로세스의 pid 만 정확히 알려주고 판단은 사람에게 맡긴다.
        console.warn(
          `[e2e-run] ⚠️ preview(pid ${pid}) 가 종료되지 않았다. 이 PID 하나만 수동 종료할 것.`,
        );
      }
    }
  }
  preview = null;
  if (tmpRoot && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = null;
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
    child.once('error', (e) => resolve({ code: 1, error: e }));
    child.once('close', (code) => resolve({ code: code ?? 1 }));
  });
}

/** 지금 비어 있는 포트를 OS 에게 받아온다(고정 4173 을 쓰지 않는 이유는 위 ② 참고). */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, HOST, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 준비 완료 판정 — 셋을 동시에 본다.
 *  · preview child 가 먼저 죽으면 즉시 실패(200 을 기다리지 않는다)
 *  · HTTP 200
 *  · **본문이 방금 빌드한 index.html 과 동일**(다른 서버·옛 빌드가 응답하는 경우를 구조적으로 배제)
 */
async function waitReady(url, expectedHtml) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = '아직 시도 없음';
  while (Date.now() < deadline) {
    if (previewExited) throw new Error(`preview 가 준비 전에 종료됐다 (${previewExited})`);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        last = `HTTP ${res.status}`;
      } else {
        const body = await res.text();
        if (body === expectedHtml) return;
        // 200 인데 본문이 다르다 = **다른 서버/옛 빌드**가 응답하고 있다는 뜻이다(막으려던 바로 그 상황).
        last = 'HTTP 200 이지만 본문이 방금 빌드한 index.html 과 다르다(다른 서버가 응답 중?)';
      }
    } catch (e) {
      last = `연결 실패: ${e.cause?.code ?? e.message}`;
    }
    await sleep(250);
  }
  throw new Error(`preview 준비 시간 초과(${READY_TIMEOUT_MS}ms) — ${url} · 마지막 상태: ${last}`);
}

async function main() {
  if (!existsSync(VITE)) throw new Error(`vite 바이너리를 찾지 못했다: ${VITE} (npm ci 먼저)`);

  tmpRoot = mkdtempSync(join(tmpdir(), 'novel-agent-e2e-'));
  const distDir = join(tmpRoot, 'dist');
  log('임시 빌드 폴더:', distDir);

  // ① 빌드 — exit code 와 산출물을 둘 다 확인한다(조용한 실패를 통과로 만들지 않는다).
  const built = await run(process.execPath, [VITE, 'build', '--outDir', distDir, '--emptyOutDir']);
  if (built.code !== 0) throw new Error(`vite build 실패 (exit ${built.code})`);
  const indexPath = join(distDir, 'index.html');
  const assetsDir = join(distDir, 'assets');
  const hasJs =
    existsSync(assetsDir) && readdirSync(assetsDir).some((f) => f.endsWith('.js'));
  if (!existsSync(indexPath) || !hasJs) {
    throw new Error('빌드 산출물이 없다 — vite build 가 조용히 죽었을 수 있다(CLAUDE.md OneDrive 함정)');
  }
  const expectedHtml = readFileSync(indexPath, 'utf8');

  // ② 프리뷰 — free port + --strictPort(포트를 뺏겼으면 조용히 옮겨가지 않고 죽는다).
  const port = await freePort();
  const base = `http://${HOST}:${port}`;
  log('preview 기동:', base);
  // ⚠️ `--host 127.0.0.1` 을 반드시 준다 — vite preview 의 기본 host 는 'localhost' 인데 Windows 에서는
  // 그게 **::1(IPv6)에만** 바인딩될 수 있다. 그러면 서버는 정상인데 127.0.0.1 폴링이 ECONNREFUSED 로
  // 계속 실패해 readiness 가 타임아웃한다(실제로 겪음). 접속 주소와 바인딩 주소를 같은 값으로 못박는다.
  preview = spawn(
    process.execPath,
    [VITE, 'preview', '--outDir', distDir, '--host', HOST, '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  preview.once('error', (e) => {
    previewExited = `spawn error: ${e.message}`;
  });
  preview.once('close', (code, signal) => {
    previewExited = previewExited ?? `exit ${code ?? ''}${signal ? ' ' + signal : ''}`;
  });

  await waitReady(base + '/', expectedHtml);
  log('preview 준비 완료(본문이 방금 빌드한 index.html 과 일치)');

  // ③ 기존 e2e 를 그대로 실행한다(무수정 — BASE_URL 만 넘긴다).
  const e2e = await run(process.execPath, [join(ROOT, 'scripts', 'e2e.mjs')], {
    env: { ...process.env, BASE_URL: base },
  });
  if (e2e.code !== 0) {
    console.error(
      '[e2e-run] e2e 실패 — 브라우저가 없다면: npx playwright install chromium',
    );
  }
  return e2e.code;
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    log(`${sig} 수신 — 정리 후 종료`);
    await cleanup();
    process.exit(sig === 'SIGINT' ? 130 : 143);
  });
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (e) {
  console.error('[e2e-run] ❌', e.message);
  exitCode = 1;
} finally {
  await cleanup();
}
process.exit(exitCode);
