// 한글 제목/이름을 Ren'Py(=Python) 식별자로 안전 변환한다.
// Ren'Py 라벨·define 이름은 ASCII 식별자가 가장 안전하므로 prefix + 일련번호로 발급하고,
// 원본 표시명은 별도로 보관한다.

export class SlugMap {
  private map = new Map<string, string>();
  private counter = 0;
  constructor(private prefix: string) {}

  /** key(원본 제목/이름)에 대한 안정적 식별자를 발급/조회. */
  get(key: string): string {
    const k = key.trim();
    const existing = this.map.get(k);
    if (existing) return existing;
    this.counter += 1;
    // 가독성을 위해 ASCII 단어가 있으면 살짝 반영
    const ascii = k
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 16);
    const slug = ascii
      ? `${this.prefix}_${this.counter}_${ascii}`
      : `${this.prefix}_${this.counter}`;
    this.map.set(k, slug);
    return slug;
  }

  has(key: string): boolean {
    return this.map.has(key.trim());
  }
}

/** 에셋 파일명용 슬러그(확장자 제외). 한글이면 해시 기반 영문명. */
export function fileSlug(name: string, fallback: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ascii || fallback;
}
