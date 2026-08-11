import { effectiveExpressions } from '../types';
import { stripOutfitRefs } from './helpers';
import type { State } from './types';
import type { SliceCreator } from './context';

export const createCharacterSlice: SliceCreator<
  Pick<
    State,
    | 'updateCharacter'
    | 'clearCharacterSprites'
    | 'setCharacterI18nName'
    | 'addExpression'
    | 'renameExpression'
    | 'removeExpression'
    | 'setExpressionNote'
    | 'addOutfit'
    | 'removeOutfit'
    | 'addOutfitRule'
    | 'removeOutfitRule'
  >
> = (set, get, ctx) => {
  const { flash, autoSave, commitAssetSwap } = ctx;
  return {
    clearCharacterSprites: async (name) => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return;
      const toDelete = Object.values(char.expressions).filter((x): x is string => !!x);
      await commitAssetSwap(
        (s) => ({
          project: {
            ...s.project,
            characters: s.project.characters.map((c) =>
              c.name === name ? { ...c, expressions: {} } : c,
            ),
          },
        }),
        toDelete, // 건별 delete 루프 → 단일 트랜잭션 배치(의도적 통일 ③)
      );
      flash(`${name} 스프라이트를 비웠습니다.`);
    },

    updateCharacter: (name, patch) => {
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) => (c.name === name ? { ...c, ...patch } : c)),
        },
      }));
      autoSave();
    },

    addExpression: (name) => {
      const n = name.trim();
      if (!n) return;
      const cur = effectiveExpressions(get().project.expressions);
      if (cur.includes(n)) return flash('이미 있는 표정입니다.');
      set((s) => ({ project: { ...s.project, expressions: [...cur, n] } }));
      autoSave();
      flash(`'${n}' 표정을 추가했습니다.`);
    },

    setExpressionNote: (name, value) => {
      const v = value.trim();
      set((s) => {
        const notes = { ...s.project.expressionNotes };
        if (v) notes[name] = v;
        else delete notes[name];
        return { project: { ...s.project, expressionNotes: Object.keys(notes).length ? notes : undefined } };
      });
      autoSave();
    },

    renameExpression: (oldName, newName) => {
      const next = newName.trim();
      if (oldName === '기본') return flash('기본 표정은 이름을 바꿀 수 없습니다.');
      if (!next || next === oldName) return;
      const cur = effectiveExpressions(get().project.expressions);
      if (!cur.includes(oldName)) return;
      if (cur.includes(next)) return flash('이미 있는 표정 이름입니다.');
      set((s) => ({
        project: {
          ...s.project,
          expressions: cur.map((e) => (e === oldName ? next : e)),
          // 이 표정을 설명하던 한 줄 메모(AI 프롬프트용)도 키를 따라간다 — 안 옮기면 이름을 바꾸는
          // 순간 그 설명이 조용히 사라져(원래 이름을 다시 안 쓰면 영영 못 찾음), AI 배정이 그 표정을
          // 다시 헷갈리기 시작한다("옅은 미소"였다는 걸 잊는 것과 같다).
          expressionNotes: (() => {
            if (!s.project.expressionNotes || !(oldName in s.project.expressionNotes)) return s.project.expressionNotes;
            const notes = { ...s.project.expressionNotes };
            notes[next] = notes[oldName];
            delete notes[oldName];
            return notes;
          })(),
          // 각 캐릭터의 표정→에셋 키 이전(이미 만든 입화 유지) — 기본 의상 + 24종까지 갈 수 있는
          // 추가 의상(c.outfits[].expressions)도 같은 키를 쓰므로 빠뜨리면 그 의상만 옛 이름에 눌러
          // 붙어 있다가(스프라이트가 있어도) removeExpression 이 못 찾아 고아로 남는다.
          characters: s.project.characters.map((c) => {
            const migrate = (ex: Partial<Record<string, string>>) => {
              if (!(oldName in ex)) return ex;
              const next2 = { ...ex };
              next2[next] = next2[oldName];
              delete next2[oldName];
              return next2;
            };
            const expressions = migrate(c.expressions);
            const outfits = c.outfits?.map((o) => ({ ...o, expressions: migrate(o.expressions) }));
            if (expressions === c.expressions && outfits === c.outfits) return c;
            return { ...c, expressions, ...(outfits ? { outfits } : {}) };
          }),
          // 대사에 지정된 표정 이름도 함께 이전 — 작가 수동(emotion)뿐 아니라 AI 배정(emotionAuto)도
          // 같은 이름 공간을 쓴다(안 옮기면 resolve.ts 의 "선언된 표정 목록" 검증에 걸려 조용히
          // 휴리스틱으로 떨어진다 — 유령 표정 취급을 당한다).
          scenes: s.project.scenes.map((sc) => ({
            ...sc,
            lines: sc.lines.map((l) => {
              if (l.kind !== 'dialogue') return l;
              if (l.emotion !== oldName && l.emotionAuto !== oldName) return l;
              return {
                ...l,
                emotion: l.emotion === oldName ? next : l.emotion,
                emotionAuto: l.emotionAuto === oldName ? next : l.emotionAuto,
              };
            }),
          })),
        },
      }));
      autoSave();
      flash(`표정 이름을 '${oldName}' → '${next}' 로 바꿨습니다.`);
    },

    removeExpression: async (name) => {
      if (name === '기본') return flash('기본 표정은 삭제할 수 없습니다.');
      const cur = effectiveExpressions(get().project.expressions);
      if (!cur.includes(name)) return;
      // 해당 표정으로 만든 입화 에셋 수집(삭제용) — 기본 의상뿐 아니라 추가 의상(c.outfits[])도
      // 같은 표정 키를 쓰므로 함께 걷지 않으면 그 파일들은 참조가 사라졌는데도 IndexedDB 에
      // 계속 남는다(고아 에셋 스윕조차 "이 표정이 있었다"는 걸 모르니 대상이 아니었다).
      const toDelete: string[] = [];
      for (const c of get().project.characters) {
        const id = c.expressions[name];
        if (id) toDelete.push(id);
        for (const o of c.outfits ?? []) {
          const oid = o.expressions[name];
          if (oid) toDelete.push(oid);
        }
      }
      await commitAssetSwap(
        (s) => ({
          project: {
            ...s.project,
            expressions: cur.filter((e) => e !== name),
            // 이 표정의 설명 메모도 함께 삭제 — 안 지우면 이름을 재활용(같은 이름으로 addExpression)
            // 했을 때 엉뚱한 옛 설명이 되살아난다.
            expressionNotes: (() => {
              if (!s.project.expressionNotes || !(name in s.project.expressionNotes)) return s.project.expressionNotes;
              const notes = { ...s.project.expressionNotes };
              delete notes[name];
              return notes;
            })(),
            characters: s.project.characters.map((c) => {
              const strip = (ex: Partial<Record<string, string>>) => {
                if (!(name in ex)) return ex;
                const next = { ...ex };
                delete next[name];
                return next;
              };
              const expressions = strip(c.expressions);
              const outfits = c.outfits?.map((o) => ({ ...o, expressions: strip(o.expressions) }));
              if (expressions === c.expressions && outfits === c.outfits) return c;
              return { ...c, expressions, ...(outfits ? { outfits } : {}) };
            }),
            // 대사에 남아 있던 참조도 지운다 — 안 지우면 삭제된 이름이 유령 표정으로 남아
            // resolve.ts 의 "선언된 표정 목록" 검증에 걸려 (조용히 휴리스틱으로 떨어지긴 하지만)
            // 사용자 눈엔 "분명 지웠는데 왜 아직 값이 있지"로 보인다.
            scenes: s.project.scenes.map((sc) => ({
              ...sc,
              lines: sc.lines.map((l) => {
                if (l.kind !== 'dialogue') return l;
                if (l.emotion !== name && l.emotionAuto !== name) return l;
                return {
                  ...l,
                  emotion: l.emotion === name ? undefined : l.emotion,
                  emotionAuto: l.emotionAuto === name ? undefined : l.emotionAuto,
                };
              }),
            })),
          },
        }),
        toDelete,
      );
      flash(`'${name}' 표정을 삭제했습니다.`);
    },

    addOutfit: (charName, name) => {
      const n = name.trim();
      if (!n) return;
      if (n === '기본') return flash("'기본'은 예약된 의상 이름입니다.");
      const char = get().project.characters.find((c) => c.name === charName);
      if (!char) return;
      if (char.outfits?.some((o) => o.name === n)) return flash('이미 있는 의상입니다.');
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) =>
            c.name === charName
              ? { ...c, outfits: [...(c.outfits ?? []), { name: n, expressions: {} }] }
              : c,
          ),
        },
      }));
      autoSave();
      flash(`'${charName}'에 '${n}' 의상을 추가했습니다. 표정별 입화를 업로드하세요.`);
    },

    setCharacterI18nName: (charName, locale, value) => {
      const v = value.trim();
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) => {
            if (c.name !== charName) return c;
            const i18nName = { ...c.i18nName };
            if (v) i18nName[locale] = v;
            else delete i18nName[locale];
            return { ...c, i18nName: Object.keys(i18nName).length ? i18nName : undefined };
          }),
        },
      }));
      autoSave();
    },

    removeOutfit: async (charName, name) => {
      const char = get().project.characters.find((c) => c.name === charName);
      const o = char?.outfits?.find((x) => x.name === name);
      if (!o) return;
      const toDelete = Object.values(o.expressions).filter((x): x is string => !!x);
      await commitAssetSwap(
        (s) => ({
          project: {
            ...s.project,
            characters: s.project.characters.map((c) =>
              c.name === charName ? { ...c, outfits: (c.outfits ?? []).filter((x) => x.name !== name) } : c,
            ),
            // 이 의상을 가리키던 장면 참조도 제거(기본 의상으로 복귀) — 장면 시작 의상(#복장)과
            // 줄 단위 전환(Line.outfits) 두 자리 모두. stripOutfitRefs 단일 소스.
            scenes: stripOutfitRefs(s.project.scenes, charName, name),
            // 이 의상을 가리키던 배경 키워드 규칙도 함께 제거(가리키는 대상이 사라짐).
            outfitRules: s.project.outfitRules?.filter((r) => !(r.charName === charName && r.outfit === name)),
          },
        }),
        toDelete,
      );
      flash(`'${charName}'의 '${name}' 의상을 삭제했습니다.`);
    },

    addOutfitRule: (charName, outfit, keyword) => {
      const kw = keyword.trim();
      if (!kw) return;
      set((s) => {
        const rules = s.project.outfitRules ?? [];
        if (rules.some((r) => r.charName === charName && r.outfit === outfit && r.keyword === kw)) return s;
        return { project: { ...s.project, outfitRules: [...rules, { charName, outfit, keyword: kw }] } };
      });
      autoSave();
    },

    removeOutfitRule: (index) => {
      set((s) => ({
        project: { ...s.project, outfitRules: (s.project.outfitRules ?? []).filter((_, i) => i !== index) },
      }));
      autoSave();
    },
  };
};
