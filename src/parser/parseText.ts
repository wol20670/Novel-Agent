// 텍스트 직접 입력 포맷 파서.
//
//   장면: 맑은 아침, 운동장
//   배경: 학교 운동장
//   BGM: morning_breeze
//   연출: 햇살이 환하게 비추는 아침
//
//   주인공: 야, 오늘 날씨 진짜 좋다!
//   (잠시 두 사람은 말없이 서 있었다.)
//   선택지:
//   > 앞자리에 앉는다.
//   > 창가 자리에 앉는다.

import { SceneBuilder, applyTag, type BuildResult } from './sceneBuilder';

const FIELD = /^(장면|배경|BGM|연출|CG|점프)\s*[:：]\s*(.*)$/i;

export function parseText(input: string): BuildResult {
  const b = new SceneBuilder();
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  let inChoiceBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      inChoiceBlock = false;
      continue;
    }

    // 선택지 항목
    if (line.startsWith('>')) {
      applyTag(b, line);
      continue;
    }
    if (/^선택지\s*[:：]?\s*$/.test(line)) {
      inChoiceBlock = true;
      continue;
    }
    inChoiceBlock = false;

    // 필드형 태그 (장면:/배경:/BGM: ...)
    const m = line.match(FIELD);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2];
      const map: Record<string, string> = {
        '장면': '#S ',
        '배경': '#배경 ',
        bgm: '#BGM ',
        '연출': '#연출 ',
        cg: '#CG ',
        '점프': '#점프 ',
      };
      applyTag(b, (map[key] ?? '#') + val);
      continue;
    }

    // 지문: (괄호) 로 감싼 문장
    if (line.startsWith('(') && line.endsWith(')')) {
      b.addNarration(line.slice(1, -1));
      continue;
    }

    // 대사: "이름: 대사"
    const di = line.indexOf(':');
    const di2 = line.indexOf('：');
    const idx = di2 >= 0 && (di < 0 || di2 < di) ? di2 : di;
    if (idx > 0) {
      const speaker = line.slice(0, idx).trim();
      const text = line.slice(idx + 1).trim();
      // 화자 이름에 공백이 많거나 콜론 뒤가 비면 지문 취급
      if (speaker && text && speaker.length <= 20 && !speaker.includes(' ')) {
        b.addDialogue(speaker, text);
        continue;
      }
    }

    // 그 외는 지문(나레이션)
    void inChoiceBlock;
    b.addNarration(line);
  }

  return b.finish();
}
