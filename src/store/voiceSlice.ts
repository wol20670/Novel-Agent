import type { Locale, Character } from '../types';
import { baseLocaleOf } from '../types';
import { sleep } from '../generators/shared/retry';
import { collectVoiceTargets, type VoiceBatchItem } from '../generators/voice/collectByCharacter';
import { typecastTTS, getSubscription } from '../generators/voice/typecastProvider';
import { estimateVoiceCostForProject } from '../generators/voice/estimate';
import { aiConfig } from '../config/aiConfig';
import { deleteAsset } from '../storage/assetStore';
import { extFromMime } from '../renpy/generate';
import type { State } from './types';
import type { SliceCreator } from './context';
import { safeFileName, applyVoiceUpdates, type VoiceAttachUpdate } from './helpers';

export const createVoiceSlice: SliceCreator<
  Pick<State, 'attachLineVoice' | 'detachLineVoice' | 'batchVoiceCharacter' | 'batchVoiceAll' | 'estimateVoiceCost'>
> = (set, get, ctx) => {
  const { flash, autoSave, commitAssetSwap, uploadAsset } = ctx;

  // attachLineVoice 의 핵심 로직만 분리(autoSave/flash 없음) — 일괄 생성(batchVoiceCharacter)이
  // 수백 줄을 반복 호출할 때 매번 저장·토스트가 튀지 않도록, 루프 안에선 이걸로 조용히 누적하고
  // autoSave()/flash() 는 호출측이 끝나고 한 번만 부른다. 단일 적용(attachLineVoice)도 이걸 재사용.
  // collector 를 주면(배치 경로) scenes 전체 재빌드 set() 을 즉시 하지 않고 목록에만 쌓아둔다 —
  // 호출측이 배치 끝에 applyVoiceUpdates 로 딱 1번만 커밋한다(autoTranslateAll 과 동일한 절충).
  // 업로드(uploadAsset)·이전 에셋 삭제는 배치 여부와 무관하게 항상 즉시 수행(에셋 자체는 배치가
  // 중단돼도 남아 있어야 함 — commitAssetSwap 의 "set→autoSave→delete" 관례와 같은 이유).
  const attachVoiceQuiet = async (
    sceneId: string,
    lineIndex: number,
    locale: Locale,
    blob: Blob,
    charName: string,
    collector?: VoiceAttachUpdate[],
  ): Promise<void> => {
    const scene = get().project.scenes.find((s) => s.id === sceneId);
    const line = scene?.lines[lineIndex];
    if (!scene || !line || line.kind !== 'dialogue') return;
    const mime = blob.type || 'audio/mpeg';
    const ext = extFromMime(blob.type);
    const file = new File([blob], `voice_${safeFileName(charName)}_${lineIndex}_${locale}.${ext}`, {
      type: mime,
    });
    const id = await uploadAsset(file, 'voice', file.name);
    const prev = line.voiceAssetIds?.[locale];
    if (collector) {
      collector.push({ sceneId, lineIndex, locale, assetId: id });
    } else {
      set((s) => ({
        project: {
          ...s.project,
          voiceLocales: s.project.voiceLocales?.includes(locale)
            ? s.project.voiceLocales
            : [...(s.project.voiceLocales ?? []), locale],
          scenes: s.project.scenes.map((sc) =>
            sc.id === sceneId
              ? {
                  ...sc,
                  lines: sc.lines.map((l, i) =>
                    i === lineIndex && l.kind === 'dialogue'
                      ? { ...l, voiced: true, voiceAssetIds: { ...l.voiceAssetIds, [locale]: id } }
                      : l,
                  ),
                }
              : sc,
          ),
        },
      }));
    }
    if (prev) await deleteAsset(prev).catch(() => {});
  };

  // 배치 확인창·완료 메시지에 쓸 잔여 크레딧(plan_credits - used_credits) — 조회 실패해도(키
  // 오류·네트워크 등) 배치 자체엔 영향 없게 베스트에포트로 undefined 폴백.
  const subscriptionRemaining = async (key: string): Promise<number | undefined> => {
    try {
      const sub = await getSubscription(key);
      return sub.planCredits - sub.usedCredits;
    } catch {
      return undefined;
    }
  };

  // batchVoiceCharacter/batchVoiceAll 공유 — 확인창·크레딧 전후 조회는 호출측이 하고, 이 함수는
  // "이 캐릭터의 미생성 대사를 순차 생성·적용"만 담당한다(batchVoiceAll 이 여러 캐릭터를 돌 때
  // 캐릭터마다 확인창이 다시 뜨지 않게 분리).
  const runCharacterVoiceBatch = async (
    charName: string,
    locale: Locale,
    voicePreset: NonNullable<Character['voice']>,
    items: VoiceBatchItem[],
    key: string,
    collector: VoiceAttachUpdate[],
  ): Promise<{ done: number; failed: number; totalSeconds: number; creditsExhausted: boolean }> => {
    // 연속 호출을 곧바로 이어 붙이면 매 줄이 레이트리밋(429)에 걸림(실사용에서 확인) — 요청 사이에
    // 일정 간격을 두고, 그래도 429 나면 지수 백오프(2s→4s→8s)로 최대 3회 재시도한다.
    const PACE_MS = 900;
    let done = 0;
    let failed = 0;
    let totalSeconds = 0;
    let creditsExhausted = false;
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (idx > 0) await sleep(PACE_MS);
      const params = {
        voiceId: voicePreset.voiceId,
        text: item.text,
        language: locale,
        model: voicePreset.model || aiConfig.voice.defaultModel,
        emotion: voicePreset.emotion,
        intensity: voicePreset.intensity,
        settings: voicePreset.settings,
      };
      let result;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= 3; attempt++) {
        try {
          result = await typecastTTS(params, key);
          lastErr = undefined;
          break;
        } catch (e) {
          lastErr = e;
          const isRateLimit = /레이트 리밋/.test((e as Error).message);
          if (!isRateLimit || attempt === 3) break; // 레이트리밋 아니면 즉시 포기, 마지막 시도면 종료
          await sleep(2000 * 2 ** attempt); // 2s, 4s, 8s
        }
      }
      if (!result) {
        failed++;
        console.warn('[보이스 일괄생성] 실패:', item.sceneId, item.lineIndex, lastErr);
        // 크레딧 소진(402)이면 나머지 줄도 전부 실패할 게 뻔하니 재시도 없이 배치 전체를 중단한다.
        if (lastErr instanceof Error && /크레딧이 부족/.test(lastErr.message)) {
          creditsExhausted = true;
          break;
        }
        continue;
      }
      totalSeconds += result.seconds;
      try {
        await attachVoiceQuiet(item.sceneId, item.lineIndex, locale, result.blob, charName, collector);
        done++;
      } catch (e) {
        failed++;
        console.warn('[보이스 일괄생성] 적용 실패:', item.sceneId, item.lineIndex, e);
      }
    }
    return { done, failed, totalSeconds, creditsExhausted };
  };

  return {
    attachLineVoice: async (sceneId, lineIndex, locale, blob, charName) => {
      try {
        await attachVoiceQuiet(sceneId, lineIndex, locale, blob, charName);
        autoSave();
        flash(`이 대사에 ${locale.toUpperCase()} 음성을 적용했습니다 — Ren'Py 내보내기에 반영됩니다.`);
      } catch (e) {
        flash((e as Error).message, 'error');
      }
    },

    detachLineVoice: async (sceneId, lineIndex, locale) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      const line = scene?.lines[lineIndex];
      if (!scene || !line || line.kind !== 'dialogue') return;
      const prev = line.voiceAssetIds?.[locale];
      if (!prev) return;
      await commitAssetSwap(
        (s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              sc.id === sceneId
                ? {
                    ...sc,
                    lines: sc.lines.map((l, i) => {
                      if (i !== lineIndex || l.kind !== 'dialogue') return l;
                      const next = { ...l.voiceAssetIds };
                      delete next[locale];
                      const stillVoiced = Object.keys(next).length > 0;
                      return { ...l, voiceAssetIds: next, voiced: stillVoiced };
                    }),
                  }
                : sc,
            ),
          },
        }),
        [prev],
      );
      flash(`${locale.toUpperCase()} 음성을 해제했습니다.`);
    },

    batchVoiceCharacter: async (charName, locale) => {
      const project = get().project;
      const char = project.characters.find((c) => c.name === charName);
      const voicePreset = char?.voice;
      if (!voicePreset) {
        flash('먼저 이 캐릭터의 보이스를 골라 "💾 캐릭터에 저장"하세요.', 'error');
        return;
      }
      const key = get().typecastKey.trim();
      if (!key) {
        flash('Typecast 키가 필요합니다(왼쪽 패널에서 입력).', 'error');
        return;
      }
      const base = baseLocaleOf(project);
      const items = collectVoiceTargets(project, charName, locale, base);
      if (!items.length) {
        flash('일괄 생성할 빈 대사가 없습니다(이미 모두 채워짐).');
        return;
      }

      // 대사 하나당 크레딧이 얼마나 드는지 감을 잡을 수 있게, 배치 전후로 잔량을 재서 확인창·완료
      // 메시지에 같이 보여준다(베스트에포트 — 조회 실패해도 배치 자체엔 영향 없음, 조용히 생략).
      const creditsBefore = await subscriptionRemaining(key);
      const estimate = get().voiceEstimate?.perChar.find((c) => c.name === charName);
      const remainNote = creditsBefore !== undefined ? `잔여 ${creditsBefore}` : '잔여 크레딧 확인 실패';
      const confirmMsg = estimate
        ? `예상 정확히 ${estimate.estCredits}크레딧 소모(${remainNote}). 진행할까요?`
        : `${remainNote}. 진행할까요? (예상 비용은 "💡 비용 계산"으로 먼저 확인할 수 있습니다)`;
      if (!window.confirm(confirmMsg)) return;

      const busyKey = `batch:voice:${charName}`;
      set((s) => ({ busy: { ...s.busy, [busyKey]: true } }));
      let outcome: { done: number; failed: number; totalSeconds: number; creditsExhausted: boolean };
      const collector: VoiceAttachUpdate[] = [];
      try {
        outcome = await runCharacterVoiceBatch(charName, locale, voicePreset, items, key, collector);
      } finally {
        // 배치 동안 모아둔 음성 적용분을 여기서 딱 1번만 커밋 — 중간에 크레딧 소진으로 중단돼도
        // 그때까지 생성된 음성은 반드시 반영/저장된다(autoTranslateAll 과 동일한 절충).
        if (collector.length) {
          const { scenes, locales } = applyVoiceUpdates(get().project.scenes, collector);
          set((s) => ({
            project: {
              ...s.project,
              scenes,
              voiceLocales: Array.from(new Set([...(s.project.voiceLocales ?? []), ...locales])),
            },
          }));
        }
        set((s) => ({ busy: { ...s.busy, [busyKey]: false } }));
      }
      autoSave();
      const creditsAfter = await subscriptionRemaining(key);
      const creditsNote =
        creditsBefore !== undefined && creditsAfter !== undefined
          ? ` · 크레딧 ${creditsBefore - creditsAfter} 소진(잔여 ${creditsAfter})`
          : '';
      if (outcome.creditsExhausted) {
        flash(
          `${charName} 보이스 일괄 생성 중단 — ${outcome.done}건 적용 후 크레딧 소진. 충전/다음 달 후 재실행하면 이어서 생성됩니다.` +
            creditsNote,
          'error',
        );
        return;
      }
      const msg =
        `${charName} 보이스 일괄 생성 완료 — ${outcome.done}건 적용` +
        (outcome.failed ? ` · ${outcome.failed}건 실패(재시도 가능)` : '') +
        creditsNote;
      flash(msg, outcome.failed ? 'error' : 'success');
    },

    batchVoiceAll: async (locale) => {
      const project = get().project;
      const key = get().typecastKey.trim();
      if (!key) {
        flash('Typecast 키가 필요합니다(왼쪽 패널에서 입력).', 'error');
        return;
      }
      const base = baseLocaleOf(project);
      const targets = project.characters
        .filter((c): c is Character & { voice: NonNullable<Character['voice']> } => !!c.voice)
        .map((c) => ({ char: c, items: collectVoiceTargets(project, c.name, locale, base) }))
        .filter((t) => t.items.length > 0);
      if (!targets.length) {
        flash('일괄 생성할 빈 대사가 없습니다(프리셋이 저장된 캐릭터가 없거나 이미 모두 채워짐).', 'error');
        return;
      }

      const creditsBefore = await subscriptionRemaining(key);
      const estimateTotal = get().voiceEstimate?.totalCredits;
      const remainNote = creditsBefore !== undefined ? `잔여 ${creditsBefore}` : '잔여 크레딧 확인 실패';
      const confirmMsg = estimateTotal
        ? `전체 캐릭터 예상 정확히 ${estimateTotal}크레딧 소모(${remainNote}). 진행할까요?`
        : `${remainNote}. 프리셋이 저장된 모든 캐릭터를 순차 생성할까요? (예상 비용은 "💡 비용 계산"으로 먼저 확인할 수 있습니다)`;
      if (!window.confirm(confirmMsg)) return;

      set((s) => ({ busy: { ...s.busy, 'batch:voice:all': true } }));
      let totalDone = 0;
      let totalFailed = 0;
      let totalSeconds = 0;
      let creditsExhausted = false;
      // 여러 캐릭터를 순차 처리하는 배치 전체가 collector 하나를 공유 — 캐릭터마다 커밋하면
      // 여전히 캐릭터 수만큼 리렌더/자동저장이 튀므로, 전체를 한 번에 묶어야 실질 효과가 있다.
      const collector: VoiceAttachUpdate[] = [];
      try {
        for (const { char, items } of targets) {
          const busyKey = `batch:voice:${char.name}`;
          set((s) => ({ busy: { ...s.busy, [busyKey]: true } }));
          let outcome;
          try {
            outcome = await runCharacterVoiceBatch(char.name, locale, char.voice, items, key, collector);
          } finally {
            set((s) => ({ busy: { ...s.busy, [busyKey]: false } }));
          }
          totalDone += outcome.done;
          totalFailed += outcome.failed;
          totalSeconds += outcome.totalSeconds;
          if (outcome.creditsExhausted) {
            creditsExhausted = true;
            break;
          }
        }
      } finally {
        if (collector.length) {
          const { scenes, locales } = applyVoiceUpdates(get().project.scenes, collector);
          set((s) => ({
            project: {
              ...s.project,
              scenes,
              voiceLocales: Array.from(new Set([...(s.project.voiceLocales ?? []), ...locales])),
            },
          }));
        }
        set((s) => ({ busy: { ...s.busy, 'batch:voice:all': false } }));
      }
      autoSave();
      const creditsAfter = await subscriptionRemaining(key);
      const creditsNote =
        creditsBefore !== undefined && creditsAfter !== undefined
          ? ` · 크레딧 ${creditsBefore - creditsAfter} 소진(잔여 ${creditsAfter})`
          : '';
      if (creditsExhausted) {
        flash(
          `전체 보이스 일괄 생성 중단 — ${totalDone}건 적용 후 크레딧 소진. 충전/다음 달 후 재실행하면 이어서 생성됩니다.` +
            creditsNote,
          'error',
        );
        return;
      }
      flash(
        `전체 보이스 일괄 생성 완료 — ${totalDone}건 적용` +
          (totalFailed ? ` · ${totalFailed}건 실패(재시도 가능)` : '') +
          creditsNote,
        totalFailed ? 'error' : 'success',
      );
    },

    // 글자수 합=크레딧이라 API 호출이 필요 없다(키 없이도 즉시 계산 — Typecast 이관 전 Predict
    // Duration 샘플링 방식과 달리 동기 함수, 스피너·busy 상태도 필요 없어졌다).
    estimateVoiceCost: () => {
      const project = get().project;
      const base = baseLocaleOf(project);
      const result = estimateVoiceCostForProject(project, base);
      set({ voiceEstimate: result });
      if (!result.perChar.length) {
        flash('예상 비용을 계산할 대사가 없습니다(프리셋이 저장된 캐릭터가 없거나 남은 대사가 없음).', 'error');
        return;
      }
      const msg =
        `예상 비용 계산 완료 — 정확히 ${result.totalCredits}크레딧(약 ${Math.round(result.totalSeconds)}초, ${result.totalLines}줄)` +
        (result.noPreset.length ? ` · 프리셋 없음 ${result.noPreset.length}명` : '') +
        (result.overLimit.length ? ` · 2000자 초과 ${result.overLimit.length}줄(생성 실패 가능)` : '');
      flash(msg, 'success');
    },
  };
};
