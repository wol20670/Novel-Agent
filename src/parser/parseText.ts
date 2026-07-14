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

import { SceneBuilder, applyTag, splitJointSpeaker, type BuildResult } from './sceneBuilder';

const FIELD = /^(장면|배경|BGM|복장|연출|CG|점프|글언어|목소리언어)\s*[:：]\s*(.*)$/i;

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

    // 원시 # 태그(엑셀 B열과 동일 문법 허용) — #아이템/#배경/#CG/#S 등. 알 수 없는 #는 연출로 흡수.
    if (line.startsWith('#')) {
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
        '복장': '#복장 ',
        '연출': '#연출 ',
        cg: '#CG ',
        '점프': '#점프 ',
        '글언어': '#설정_글언어 ',
        '목소리언어': '#설정_목소리언어 ',
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
      // URL("http://...")의 "//"를 대사 구분자로 오인하지 않도록 콜론 뒤가 "//"면 대사 판정 제외.
      const looksUrl = line.slice(idx + 1).startsWith('//');
      // "12:30 정각이었다" 같은 시각·비율 표기는 화자가 숫자로만 구성되면 대사로 받지 않는다.
      const looksNumeric = /^\d+$/.test(speaker);
      // 합동 화자("A & B" / "A, B")는 구분자로 둘 이상이 분해되면 공백이 있어도 대사로 받는다.
      // 그 외엔 단일 화자 휴리스틱(공백 없는 짧은 이름)으로 지문 오인을 막는다.
      const looksJoint = splitJointSpeaker(speaker).length >= 2;
      const looksSingle = speaker.length <= 20 && !speaker.includes(' ');
      if (speaker && text && !looksUrl && !looksNumeric && (looksJoint || looksSingle)) {
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
