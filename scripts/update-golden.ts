// golden 매니페스트 갱신 — **명시적으로 이 명령을 실행할 때만** tests/golden/renpy-files.json 을 쓴다.
//
//   npm run golden:update
//
// ⚠️ 테스트(`tests/renpy-golden.test.ts`)는 golden 을 **절대 쓰지 않는다**(자동 갱신 금지).
// ⚠️ 이 스크립트는 리포 안에 파일을 쓰므로 OneDrive exit 127 함정 사거리다 — **완료 로그가 안 찍혔으면
//    실패다**. 갱신 직후 `npm run test` 로 자기검증할 것(조용히 죽었으면 golden 테스트가 실패한다).
// ⚠️ 결정론 증명은 `git diff` 가 아니라 **scratch 사본과의 byte 비교**로 한다(최초 생성 시점의
//    golden 은 untracked 라 git diff 가 아무것도 못 본다 — CLAUDE.md 참고).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildGoldenManifest, serializeManifest } from './renpyGolden';

const OUT = join(process.cwd(), 'tests', 'golden', 'renpy-files.json');

const manifest = await buildGoldenManifest();
const configs = Object.keys(manifest).length;
const files = Object.values(manifest).reduce((n, m) => n + Object.keys(m).length, 0);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serializeManifest(manifest), 'utf8');

console.log(`갱신 완료: ${configs}구성 / ${files}파일 → ${OUT}`);
