// 에셋 바이너리의 MIME → 저장 파일 확장자 규칙. Ren'Py 생성과 무관한 공용 파일 규칙이라
// renpy/generate.ts 가 아니라 여기(import 가 없는 잎 모듈)에 둔다 — project/store/zip 세 계층이
// 같은 규칙을 써야 하는데, 어느 한쪽 폴더에 두면 그쪽을 향하는 새 의존이 생긴다.

/**
 * 오디오 blob 의 실제 MIME → 확장자. 성우 음성은 TTS 생성(Typecast, mp3 요청)뿐 아니라 사용자가
 * "📁 파일로 적용"으로 임의 포맷(wav 등)을 올릴 수도 있어, BGM 처럼 확장자를 mp3 로 무조건 고정하면
 * 안 됨(고정하면 Ren'Py 가 다른 포맷 바이트를 mp3 로 잘못 디코드 시도해 무음/오류가 날 수 있음).
 * 알 수 없는 타입은 mp3 로 폴백(기존 동작 유지, TTS 기본 요청 포맷).
 */
export function extFromMime(mime: string | undefined): 'mp3' | 'wav' {
  return mime?.includes('wav') ? 'wav' : 'mp3';
}
