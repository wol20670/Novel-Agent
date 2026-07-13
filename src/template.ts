// 입력 양식 템플릿 다운로드: 엑셀(.xlsx) / 텍스트(.txt).

import { downloadBlob } from './zip/buildZip';
import { SAMPLE_STORY } from './sample';

/**
 * 사용자가 작성할 엑셀 양식. 두 시트로 구성:
 *  1) 스토리        — A열=화자, B열=대사/지문/태그 (실제 대본)
 *  2) 작성법(읽어보기) — 태그 설명. 파서가 무시한다.
 * 캐릭터 외형·성격, 배경/CG 프롬프트, GUI 등 모든 "설정"은 앱(에셋·테마 화면)에서 한다.
 */
export async function downloadExcelTemplate(): Promise<void> {
  // 지연 로딩: 무거운 xlsx 는 양식 다운로드 시에만 받아온다(초기 번들 경량화).
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // ── ① 스토리 시트 ──
  const story: string[][] = [
    ['', '#S 맑은 아침, 운동장'],
    ['', '#배경 학교 운동장'],
    ['', '#BGM morning_breeze'],
    ['', '#연출 햇살이 환하게 비추는 아침'],
    ['주인공', '야, 오늘 날씨 진짜 좋다!'],
    ['친구(기쁨)', '맞아, 기분 좋은 아침이야!'],
    ['', '잠시 두 사람은 말없이 서 있었다.'],
    ['', ''],
    ['', '#S 밤, 상가거리'],
    ['', '#배경 네온이 빛나는 상가 거리'],
    ['', '#CG 두 사람이 마주보는 장면'],
    ['', '#연출 슬로우 줌인'],
    ['주인공', '오늘 하루 너랑 있어서 좋았어.'],
    ['', '> 배민규에게 마음을 전한다 -> 배민규와의 대화'],
    ['', '> 안재현에게 마음을 전한다 -> 안재현와의 대화'],
    ['', ''],
    ['', '#S 배민규와의 대화'],
    ['배민규(수줍음)', '저를 선택해주셨군요.'],
    ['', '#점프 밤, 상가거리'],
    ['', ''],
    ['', '#S 안재현와의 대화'],
    ['안재현', '감사합니다.'],
  ];
  const storyHeader = [['A열 = 화자 이름 (비우면 지문/태그)', 'B열 = 대사 · 지문 · #태그 · >선택지']];
  const wsStory = XLSX.utils.aoa_to_sheet([...storyHeader, ...story]);
  wsStory['!cols'] = [{ wch: 18 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsStory, '스토리');

  // ── ② 작성법 안내 시트 (파서 무시) ──
  const guide: string[][] = [
    ['📖 Novel-Agent 입력 양식 — 엑셀은 "대본"만 담습니다'],
    [''],
    ['① [스토리] 시트 — 실제 대본을 적는 곳'],
    ['   • A열 = 화자 이름. 비워두면 지문(나레이션) 또는 태그 행이 됩니다.'],
    ['   • B열 = 대사 / 지문 / 태그를 적습니다.'],
    ['   • #S 장면제목       → 새 장면 시작'],
    ['   • #배경 배경이름     → 배경 (같은 이름끼리 한 번만 생성·공유)'],
    ['   • #BGM 음악이름      → 배경음악'],
    ['   • #복장 캐릭터:의상   → 이 장면의 캐릭터 의상 (예: #복장 한지수:수영복, 여러 명은 쉼표)'],
    ['   • #연출 분위기메모    → 연출/분위기 (이미지 프롬프트에 반영)'],
    ['   • #CG 장면설명       → 그 위치부터 배경이 CG로 바뀌고 등장인물이 사라짐 (장면 끝까지, 대사·음성은 계속)'],
    ['   • #점프 장면제목      → 그 장면으로 이동'],
    ['   • > 선택지 -> 대상장면 → 분기 선택지'],
    ['   • 이름(기쁨): 대사    → 그 표정으로 등장 (표정 생략 시 문맥 자동 선택)'],
    ['     · 표정/의상은 앱 [에셋] 탭에서 추가·이름변경할 수 있습니다(기본 표정 6종 제공).'],
    [''],
    ['② 설정은 엑셀이 아니라 "앱"에서 합니다 (대본만 엑셀)'],
    ['   • 캐릭터 외형·성격 → 에셋 화면의 캐릭터 카드'],
    ['   • 배경 상세 프롬프트 / 기준 배경 참조 → 에셋 화면의 배경 행'],
    ['   • CG 상세 / 참조 인물 → 에셋 화면의 CG 행'],
    ['   • 타이틀·메뉴·테마·폰트·대사창 → 좌측 AI 테마 스튜디오'],
    ['   • 이미지 품질(초안/표준/고품질) → 좌측 OpenAI API 아래'],
    [''],
    ['③ 이 [작성법] 시트는 안내용이라 분석에서 무시됩니다. 지우지 않아도 됩니다.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 72 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, '작성법(읽어보기)');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob(new Blob([out], { type: 'application/octet-stream' }), 'novel-agent-template.xlsx');
}

/** 텍스트 양식(샘플 그대로). */
export function downloadTextTemplate(): void {
  const guide = `# Novel-Agent 텍스트 양식
# 장면:/배경:/BGM:/복장:/연출:/CG:/점프: 으로 태그를, "이름: 대사" 로 대사,
# (괄호) 로 지문, "선택지:" 아래 "> 텍스트 -> 대상장면" 으로 분기를 작성합니다.
# 아래 예시를 지우고 직접 작성하세요.

`;
  downloadBlob(new Blob([guide + SAMPLE_STORY], { type: 'text/plain;charset=utf-8' }), 'novel-agent-template.txt');
}
