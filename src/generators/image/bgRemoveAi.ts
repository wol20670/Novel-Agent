// 무료 ML 세그멘테이션 누끼 — Transformers.js + MODNet(둘 다 Apache-2.0, 상업적 이용 가능).
// 색 기반이 아니라 "전경(인물) 의미 분리"라, 캐릭터가 흰 옷을 입든 배경이 흰색이든 색 충돌이 없다.
//  - 첫 실행 시 모델(~수십 MB)을 HuggingFace CDN 에서 받아 브라우저 캐시에 저장 → 이후 오프라인 동작.
//  - 무거운 의존성이므로 동적 import 로 분리: 이 누끼를 실제로 쓸 때만 로드(메인 번들 영향 없음).
//  - 모델 교체: MODEL_ID 만 다른 Apache-2.0 모델(예: 'BritishWerewolf/U-2-Net')로 바꾸면 된다.

const MODEL_ID = 'Xenova/modnet';

type Segmenter = (input: string) => Promise<RawImageLike | RawImageLike[]>;
interface RawImageLike {
  toBlob(type?: string, quality?: number): Promise<Blob>;
}

let segmenterPromise: Promise<Segmenter> | null = null;

/** 모델을 한 번만 로드해 재사용(표정 6종 연속 누끼 시 재다운로드 방지). */
async function getSegmenter(): Promise<Segmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const transformers = await import('@huggingface/transformers');
      // 단일 스레드 강제 → SharedArrayBuffer/교차출처격리(COOP·COEP) 없이도 안전하게 동작.
      const wasm = transformers.env.backends?.onnx?.wasm;
      if (wasm) wasm.numThreads = 1;
      const seg = await transformers.pipeline('background-removal', MODEL_ID);
      return seg as unknown as Segmenter;
    })().catch((e) => {
      segmenterPromise = null; // 실패(네트워크 등)는 캐시하지 않음 → 다음에 재시도
      throw e;
    });
  }
  return segmenterPromise;
}

/** ML 세그멘테이션으로 배경 제거(투명 PNG). Anlas 0, 오프라인(첫 1회 모델 다운로드 후). */
export async function aiRemoveBackground(blob: Blob): Promise<Blob> {
  const segmenter = await getSegmenter();
  const url = URL.createObjectURL(blob);
  try {
    const out = await segmenter(url);
    const result = Array.isArray(out) ? out[0] : out;
    const png = await result.toBlob('image/png');
    console.info('%c[누끼] AI 세그멘테이션 처리 (Anlas 0, MODNet)', 'color:#4ade80');
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}
