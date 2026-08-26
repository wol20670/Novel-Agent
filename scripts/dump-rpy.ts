// 출력 회귀 0 증명용 덤프 — 여러 구성으로 generateRenpyFiles 를 돌려 .rpy 텍스트를 폴더에 쓴다.
// 생성기(generate.ts / gui/*)를 건드리는 작업에서 "기능을 안 켠 프로젝트의 출력은 1바이트도
// 안 달라진다"를 증명하는 데 쓴다(CLAUDE.md "출력 회귀 0 증명법").
//
//   npm run dump:rpy -- <출력폴더>        # 작업 전 커밋에서 한 번
//   ...작업...
//   npm run dump:rpy -- <출력폴더2>       # 작업 후
//   diff -r <출력폴더> <출력폴더2>        # 아무것도 안 나와야 정상
//
// ⚠️ 출력 폴더는 **OneDrive 밖**(스크래치패드 등)으로 줄 것 — 리포 안에 쓰면 vite/esbuild 와 같은
// exit 127 함정에 걸려 조용히 옛 산출물이 남고, 그걸 통과로 착각하게 된다(CLAUDE.md 환경 함정).
// 완료 로그("덤프 완료")가 안 찍혔으면 실패다.
//
// 구성 목록 자체는 scripts/renpyConfigs.ts 에 있다(golden 게이트와 공유하는 단일 소스).
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generateRenpyFiles } from '../src/renpy/generate';
import { renpyConfigs } from './renpyConfigs';

const OUT = process.argv[2];
if (!OUT) {
  console.error('사용법: npm run dump:rpy -- <출력폴더>  (OneDrive 밖 경로)');
  process.exit(1);
}
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });

const configs = renpyConfigs();

let n = 0;
for (const [name, project] of Object.entries(configs)) {
  const { files } = generateRenpyFiles(project);
  for (const f of files) {
    const p = join(OUT, name, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.content, 'utf8');
    n++;
  }
}
console.log(`덤프 완료: ${Object.keys(configs).length}구성 / ${n}파일 → ${OUT}`);
