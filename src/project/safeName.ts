// 파일/폴더명 안전화 헬퍼 — 프로젝트 전역에 거의 동일한 구현이 산발해 있던 것을 모았다.
//
// ⚠️ 아래 두 함수는 "합치면 안 된다" — 서로 다른 문자 클래스를 쓴다:
//  - sanitizeAscii: `[^\w가-힣-]+` 밖의 모든 문자(공백·이모지·기타 특수문자 포함)를 `_` 로 뭉갠다.
//    ZIP 내보내기 파일명(다운로드 파일명이라 브라우저·OS 어디서 열려도 안전해야 함)에 쓴다.
//  - sanitizeWindowsPath: 윈도우 예약 문자(`\/:*?"<>|`)만 제거하고 공백은 `_` 로, 나머지 문자
//    (한글·이모지 등)는 그대로 둔다. File System Access API 로 실제 OS 폴더명을 만들 때 쓴다
//    (한글 폴더명을 보존해야 Ren'Py 런처가 프로젝트를 알아보기 쉽다).
// 두 정규식을 하나로 통일하면 기존 프로젝트의 ZIP 파일명·폴더 동기화 대상 디렉터리명이 달라져
// (이미 그 이름으로 동기화된 폴더와 어긋나거나, 사용자가 알던 파일명이 바뀌는) 회귀가 난다.
// src/store.ts 의 safeFileName() (에셋 업로드 원본 파일명)은 sanitizeWindowsPath(s, 50, 'asset')
// 로 이 모듈에 통합됐다 — 로직이 동일함(4단계 replace 체인 + slice 후 fallback)을 확인 후 이관.

/**
 * ZIP 내보내기 파일명용 — `[^\w가-힣-]+` 밖은 전부 `_`. name 이 falsy 면 fallback 을 대신 정제한다
 * (원본 두 구현과 동일하게 치환 "후" 재확인은 하지 않는다 — 연속된 비허용 문자는 항상 `_` 하나로
 * 뭉쳐지므로 name 이 truthy 인 한 결과가 빈 문자열이 될 수 없다).
 */
export function sanitizeAscii(name: string, maxLen: number, fallback: string): string {
  return (name || fallback).replace(/[^\w가-힣-]+/g, '_').slice(0, maxLen);
}

/** 실제 OS 폴더명용 — 윈도우 예약 문자만 제거, 한글 등은 보존. 빈 결과면 fallback. */
export function sanitizeWindowsPath(name: string, maxLen: number, fallback: string): string {
  const cleaned = (name || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '') // 윈도우 금지문자 제거
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen);
  return cleaned || fallback;
}
