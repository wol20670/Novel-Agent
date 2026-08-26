// Ren'Py 생성 출력 회귀 게이트 — 커밋된 golden(구성 → 경로 → SHA-256)과 지금 생성 결과를 대조한다.
//
// 이 테스트가 고정하는 것: **리팩터가 생성 출력을 1바이트도 바꾸지 않았다.**
// 이 테스트가 알려주지 않는 것: 내용이 **어떻게** 달라졌는지 — 그건 기존 경로로 본다.
//   npm run dump:rpy -- <폴더A>   (변경 전)  /  npm run dump:rpy -- <폴더B>   (변경 후)  →  diff -r A B
//
// ⚠️ golden 갱신은 **`npm run golden:update` 로만** 한다. 이 테스트는 golden 을 절대 쓰지 않는다
//    (자동 갱신 경로를 만들면 게이트가 스스로를 통과시킨다).
// ⚠️ 구성 수를 숫자로 못박지 않는다 — 의도적으로 구성을 추가하면 golden diff 가 잡는다.
import { describe, it, expect } from 'vitest';
import {
  buildGoldenManifest,
  diffManifest,
  type GoldenManifest,
} from '../scripts/renpyGolden';
import goldenJson from './golden/renpy-files.json';

const golden = goldenJson as GoldenManifest;

describe("Ren'Py golden — 생성 출력 회귀 0", () => {
  it('생성 결과가 커밋된 golden 과 완전히 일치한다', async () => {
    const actual = await buildGoldenManifest();

    // sanity — 빌더가 조용히 빈 결과를 내면 아래 핵심 단언이 공허하게 통과한다.
    expect(Object.keys(actual).length).toBeGreaterThan(0);
    for (const [name, files] of Object.entries(actual)) {
      expect(Object.keys(files).length, `구성 ${name} 의 생성 파일이 0개다`).toBeGreaterThan(0);
    }

    // 핵심 — 실패 메시지에 added/removed/changed 경로가 그대로 실린다.
    expect(diffManifest(golden, actual)).toEqual([]);
  });
});
