// 입력 양식 템플릿 다운로드: 엑셀(.xlsx) / 텍스트(.txt).

import * as XLSX from 'xlsx';
import { downloadBlob } from './zip/buildZip';
import { SAMPLE_STORY } from './sample';

/**
 * 사용자가 작성할 엑셀 양식. 세 시트로 구성:
 *  1) 스토리        — A열=화자, B열=대사/지문/태그 (실제 대본)
 *  2) 캐릭터 설정   — 이름/외형/성격 (선택, 일러스트 일관성용)
 *  3) 작성법(읽어보기) — 태그·컬럼 설명. 파서가 무시한다.
 */
export function downloadExcelTemplate(): void {
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

  // ── ② 캐릭터 설정 시트 (이름은 스토리의 화자와 같게) ──
  const chars: string[][] = [
    ['이름', '외형', '성격'],
    ['친구', '갈색 짧은 머리, 밝은 셔츠, 둥근 눈', '활발하고 다정한 동급생, 17세'],
    ['배민규', '검은 단정한 머리, 교복, 차분한 눈매', '진지하고 속 깊은 성격'],
    ['안재현', '밝은 갈색 웨이브 머리, 캐주얼 복장', '자유분방하고 장난기 많음'],
  ];
  const wsChars = XLSX.utils.aoa_to_sheet(chars);
  wsChars['!cols'] = [{ wch: 12 }, { wch: 36 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsChars, '캐릭터 설정');

  // ── ③ 작성법 안내 시트 (파서 무시) ──
  const guide: string[][] = [
    ['📖 Novel-Agent 입력 양식 — 시트 3개로 구성됩니다'],
    [''],
    ['① [스토리] 시트 — 실제 대본을 적는 곳'],
    ['   • A열 = 화자 이름. 비워두면 지문(나레이션) 또는 태그 행이 됩니다.'],
    ['   • B열 = 대사 / 지문 / 태그를 적습니다.'],
    ['   • #S 장면제목       → 새 장면 시작'],
    ['   • #배경 배경이름     → 배경 (같은 이름끼리 한 번만 생성·공유)'],
    ['   • #BGM 음악이름      → 배경음악'],
    ['   • #연출 분위기메모    → 연출/분위기 (이미지 프롬프트에 반영)'],
    ['   • #CG 장면설명       → CG 한 컷'],
    ['   • #점프 장면제목      → 그 장면으로 이동'],
    ['   • > 선택지 -> 대상장면 → 분기 선택지'],
    ['   • 이름(기쁨): 대사    → 그 표정으로 등장 (표정 생략 시 문맥 자동 선택)'],
    ['     · 표정 종류: 기본 / 기쁨 / 슬픔 / 화남 / 놀람 / 수줍음'],
    [''],
    ['② [캐릭터 설정] 시트 — 캐릭터 외형·성격 (선택, 강력 권장)'],
    ['   • 이름 / 외형 / 성격 3칸. 대본의 화자 이름과 똑같이 적으면 자동 적용됩니다.'],
    ['   • 외형 = 같은 인물을 일관되게 그리는 핵심 (예: 갈색 단발, 교복, 푸른 눈)'],
    ['   • 성격 = 그림의 분위기·표정 참고 (예: 밝고 장난기 많은 17세)'],
    ['   • 비워도 됩니다. 앱의 에셋 화면에서 직접 입력해도 동일하게 적용됩니다.'],
    [''],
    ['③ 이 [작성법] 시트는 안내용이라 분석에서 무시됩니다. 지우지 않아도 됩니다.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, '작성법(읽어보기)');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob(new Blob([out], { type: 'application/octet-stream' }), 'novel-agent-template.xlsx');
}

/** 텍스트 양식(샘플 그대로). */
export function downloadTextTemplate(): void {
  const guide = `# Novel-Agent 텍스트 양식
# 장면:/배경:/BGM:/연출:/CG:/점프: 으로 태그를, "이름: 대사" 로 대사,
# (괄호) 로 지문, "선택지:" 아래 "> 텍스트 -> 대상장면" 으로 분기를 작성합니다.
# 아래 예시를 지우고 직접 작성하세요.

`;
  downloadBlob(new Blob([guide + SAMPLE_STORY], { type: 'text/plain;charset=utf-8' }), 'novel-agent-template.txt');
}
