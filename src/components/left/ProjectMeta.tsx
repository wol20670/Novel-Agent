import { useStore } from '../../store';
import { GENRE_OPTIONS, DEFAULT_GENRE } from '../../renpy/gui';
import type { GenreId } from '../../renpy/gui';
import ThemeStudio from './ThemeStudio';

export default function ProjectMeta() {
  // project 전체 대신 실제로 쓰는 6개 필드만 — 대사 편집 등 무관한 저장에도 이 섹션 전체가
  // 리렌더될 이유가 없다(whole-project 셀렉터는 project 가 매 mutate 마다 새 객체라 항상 걸린다).
  const title = useStore((s) => s.project.title);
  const author = useStore((s) => s.project.author);
  const width = useStore((s) => s.project.width);
  const height = useStore((s) => s.project.height);
  const genre = useStore((s) => s.project.genre);
  const credits = useStore((s) => s.project.credits);
  const update = useStore((s) => s.updateProjectMeta);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="section-title">프로젝트 설정</h2>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="label">제목</span>
          <input className="field" value={title} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div>
          <span className="label">저자</span>
          <input className="field" value={author} onChange={(e) => update({ author: e.target.value })} />
        </div>
        <div>
          <span className="label">가로 (px)</span>
          <input
            type="number"
            className="field"
            value={width}
            onChange={(e) => update({ width: Number(e.target.value) || 1280 })}
          />
        </div>
        <div>
          <span className="label">세로 (px)</span>
          <input
            type="number"
            className="field"
            value={height}
            onChange={(e) => update({ height: Number(e.target.value) || 720 })}
          />
        </div>
      </div>
      <div>
        <span className="label">GUI 테마 (장르)</span>
        <select
          className="field"
          value={genre ?? DEFAULT_GENRE}
          onChange={(e) => update({ genre: e.target.value as GenreId })}
        >
          {GENRE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-500 leading-snug mt-1">
          메인/게임 메뉴·대사창·색·전환이 장르에 맞게 바뀝니다. 자체 제작 GUI(외부 GUI 이미지 의존 없음).
        </p>
      </div>

      <div>
        <span className="label">크레딧 / 라이선스 고지 (게임 내 표시)</span>
        <textarea
          className="field text-xs h-20 resize-y"
          placeholder={'사용한 일러스트·BGM·효과음·성우 등의 출처와 라이선스를 적으세요.\n예) 배경 일러스트: ○○○ / BGM: △△△ (CC-BY 4.0)\n상업 배포 전 반드시 정리 — 엔진·나눔고딕 라이선스는 자동 표기됩니다.'}
          value={credits ?? ''}
          onChange={(e) => update({ credits: e.target.value })}
        />
      </div>

      <ThemeStudio />
    </section>
  );
}
