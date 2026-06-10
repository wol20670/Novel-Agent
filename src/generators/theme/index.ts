// AI 테마 생성 오케스트레이터.
// 키 있으면 LLM 으로 GuiTheme 코어 생성 → 검증/대비보정, 없거나 실패하면 오프라인 시드 변형.
// 어느 경로든 buildTheme 을 거치므로 결과는 항상 유효한 GuiTheme.

import type { Project } from '../../types';
import type { GenreId, GuiTheme } from '../../renpy/gui/theme';
import { PRESETS } from '../../renpy/gui/theme';
import { buildTheme, seededVariation } from './buildTheme';
import { openaiTheme } from './openaiTheme';

export interface GenerateThemeArgs {
  project: Project;
  mood?: string;
  apiKey?: string;
}

export interface GeneratedTheme {
  theme: GuiTheme;
  source: 'ai' | 'offline';
  /** 표시용 메모(컨셉 설명 또는 폴백 사유). */
  note?: string;
}

/** 파싱된 장면에서 짧은 시놉시스(제목+장면제목+앞부분 대사)를 만든다. */
export function buildSynopsis(project: Project, maxLen = 700): string {
  const parts: string[] = [];
  for (const s of project.scenes) {
    parts.push(`# ${s.title}`);
    if (s.background) parts.push(`(배경: ${s.background})`);
    for (const line of s.lines.slice(0, 3)) {
      parts.push(line.kind === 'dialogue' ? `${line.speaker}: ${line.text}` : line.text);
    }
    if (parts.join('\n').length > maxLen) break;
  }
  return parts.join('\n').slice(0, maxLen);
}

function genreLabel(genre: GenreId): string {
  return (PRESETS[genre] ?? PRESETS.romance).label;
}

/** 현재 프로젝트 + 분위기 입력으로 GuiTheme 을 생성한다. */
export async function generateTheme({ project, mood, apiKey }: GenerateThemeArgs): Promise<GeneratedTheme> {
  const genre = (project.genre ?? 'romance') as GenreId;
  const moodLine = (mood ?? '').trim();
  const synopsis = buildSynopsis(project);
  const context = [
    `장르: ${genreLabel(genre)}`,
    `제목: ${project.title}`,
    moodLine ? `분위기/요청: ${moodLine}` : '',
    synopsis ? `시놉시스:\n${synopsis}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (apiKey) {
    try {
      const core = await openaiTheme(context, { apiKey });
      const label = `AI · ${moodLine || genreLabel(genre)}`.slice(0, 48);
      return { theme: buildTheme(core, genre, label), source: 'ai', note: core.rationale };
    } catch (e) {
      // AI 실패 → 오프라인 변형으로 폴백(중단하지 않음).
      const seed = moodLine || synopsis || project.title;
      const label = `오프라인 · ${moodLine || genreLabel(genre)}`.slice(0, 48);
      return {
        theme: buildTheme(seededVariation(genre, seed), genre, label),
        source: 'offline',
        note: `AI 호출 실패 → 오프라인 변형 사용 (${(e as Error).message})`,
      };
    }
  }

  // 키 없음: 결정적 오프라인 변형.
  const seed = moodLine || synopsis || project.title;
  const label = `오프라인 · ${moodLine || genreLabel(genre)}`.slice(0, 48);
  return { theme: buildTheme(seededVariation(genre, seed), genre, label), source: 'offline' };
}
