// 입력 양식 템플릿 다운로드: 엑셀(.xlsx) / 텍스트(.txt).

import * as XLSX from 'xlsx';
import { downloadBlob } from './zip/buildZip';
import { SAMPLE_STORY } from './sample';

/** 사용자가 작성할 엑셀 양식. A열=화자, B열=대사/지문/태그. */
export function downloadExcelTemplate(): void {
  const rows: (string)[][] = [
    ['', '#S 맑은 아침, 운동장'],
    ['', '#배경 학교 운동장'],
    ['', '#BGM morning_breeze'],
    ['', '#연출 햇살이 환하게 비추는 아침'],
    ['주인공', '야, 오늘 날씨 진짜 좋다!'],
    ['친구', '맞아, 기분 좋은 아침이야.'],
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
    ['배민규', '저를 선택해주셨군요.'],
    ['', '#점프 밤, 상가거리'],
    ['', ''],
    ['', '#S 안재현와의 대화'],
    ['안재현', '감사합니다.'],
  ];
  const header = [['A열: 화자(이름)', 'B열: 대사 · 지문 · 태그(#, >)']];
  const ws = XLSX.utils.aoa_to_sheet([...header, ...rows]);
  ws['!cols'] = [{ wch: 16 }, { wch: 48 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '스토리');
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
