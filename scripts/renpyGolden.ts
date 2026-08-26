// Ren'Py 생성 출력의 golden 매니페스트(구성 → 경로 → SHA-256) 빌더/비교기.
// `scripts/update-golden.ts`(갱신)와 `tests/renpy-golden.test.ts`(게이트)가 공유한다 —
// 두 곳이 각자 해시·정렬 규칙을 가지면 그 순간 판정이 갈라진다.
//
// ⚠️ **node 내장 모듈을 import 하지 말 것**(@types/node 미설치 + 테스트에서 import 된다).
//    해시는 WebCrypto(`crypto.subtle`)를 쓴다 — lib.dom 이 타입을 주고 node 24 에도 전역으로 있다.
// ⚠️ 이 매니페스트는 **"무엇이 달라졌는가"까지만** 알려준다. 실제 내용 diff 는 기존
//    `npm run dump:rpy -- <폴더>` 두 벌을 `diff -r` 하는 경로로 본다(CLAUDE.md).
import { generateRenpyFiles } from '../src/renpy/generate';
import { renpyConfigs } from './renpyConfigs';

/** 구성 이름 → (생성 경로 → 내용 SHA-256 hex). 키는 항상 정렬돼 있다. */
export type GoldenManifest = Record<string, Record<string, string>>;

const has = (o: Record<string, unknown>, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 키를 정렬해 다시 담는다(JSON.stringify 가 삽입 순서를 그대로 쓰므로 직렬화 결정론의 근거다). */
function sortedEntries(rec: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(rec).sort()) out[k] = rec[k];
  return out;
}

/**
 * 모든 구성을 생성해 경로별 해시를 만든다.
 *
 * ⚠️ 같은 구성에서 같은 path 가 두 번 나오면 **즉시 throw** 한다 — Record 로 접으면 앞 값이 조용히
 * 덮여 생성기의 file-list 결함(중복 방출)을 golden 이 못 잡는다.
 */
export async function buildGoldenManifest(): Promise<GoldenManifest> {
  const configs = renpyConfigs();
  const manifest: GoldenManifest = {};
  for (const name of Object.keys(configs).sort()) {
    const { files } = generateRenpyFiles(configs[name]);
    const byPath: Record<string, string> = {};
    for (const f of files) {
      if (has(byPath, f.path)) throw new Error(`duplicate generated path: ${name}/${f.path}`);
      byPath[f.path] = await sha256Hex(f.content);
    }
    manifest[name] = sortedEntries(byPath);
  }
  return manifest;
}

/** golden 파일에 쓰는 정본 직렬화(끝 개행 포함). 갱신 스크립트만 쓴다. */
export function serializeManifest(manifest: GoldenManifest): string {
  return JSON.stringify(manifest, null, 2) + '\n';
}

/**
 * golden 대비 actual 의 차이를 사람이 읽는 줄로 낸다(빈 배열 = 회귀 없음).
 * 실패 메시지에 그대로 실리므로 **어떤 구성의 어떤 경로가** 달라졌는지가 바로 보여야 한다.
 */
export function diffManifest(golden: GoldenManifest, actual: GoldenManifest): string[] {
  const out: string[] = [];
  const names = Array.from(new Set([...Object.keys(golden), ...Object.keys(actual)])).sort();
  for (const name of names) {
    if (!has(golden, name)) {
      out.push(`config added: ${name}`);
      continue;
    }
    if (!has(actual, name)) {
      out.push(`config removed: ${name}`);
      continue;
    }
    const g = golden[name];
    const a = actual[name];
    const paths = Array.from(new Set([...Object.keys(g), ...Object.keys(a)])).sort();
    for (const p of paths) {
      if (!has(g, p)) out.push(`added: ${name}/${p}`);
      else if (!has(a, p)) out.push(`removed: ${name}/${p}`);
      else if (g[p] !== a[p]) out.push(`changed: ${name}/${p}`);
    }
  }
  return out;
}
