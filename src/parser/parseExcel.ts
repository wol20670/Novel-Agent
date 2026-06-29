// 엑셀(.xlsx/.xls) 파서 — 첫 시트의 "대본"만 읽는다.
// A열 = 화자 이름(있으면 대사), B열 = 대사·지문·태그.
//   - A열 있음            → 대사
//   - A열 없음 + B열 일반  → 지문(나레이션)
//   - A열 없음 + B열 #/>   → 태그·선택지(applyTag 가 처리)
//
// 캐릭터 외형·성격, 배경/CG 프롬프트, GUI 등 "설정"은 엑셀이 아니라 앱(에셋·테마 화면)에서
// 관리한다. 엑셀은 대본 전용이다.

import { SceneBuilder, applyTag, type BuildResult } from './sceneBuilder';

export async function parseWorkbook(data: ArrayBuffer): Promise<BuildResult> {
  // 지연 로딩: 무거운 xlsx 는 엑셀 분석 시에만 받아온다(초기 번들 경량화).
  const XLSX = await import('xlsx');
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  });

  const b = new SceneBuilder();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const a = String(row[0] ?? '').trim();
    const col = String(row[1] ?? '').trim();
    if (!a && !col) continue;
    // 양식의 설명용 헤더 행("A열: 화자…" / "B열: 대사…")은 데이터가 아니므로 건너뛴다.
    if (i === 0 && (/^A열/.test(a) || /^B열/.test(col))) continue;

    if (a) {
      // 화자가 있으면 대사 (B열이 비어도 화자 표시만 있는 행은 건너뜀)
      if (col) b.addDialogue(a, col);
      continue;
    }
    // A열 비어있음 → 태그/선택지 우선 시도, 아니면 지문
    if (!applyTag(b, col)) {
      b.addNarration(col);
    }
  }
  return b.finish();
}
