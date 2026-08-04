import { useRef } from 'react';

/**
 * 파일 선택 버튼 + 숨김 input. 외부 제작 이미지 업로드용 공용 컴포넌트.
 * 기존 호출부는 전부 onFile(단일 파일)만 쓰므로 그 계약은 그대로 두고, 메인 메뉴 GUI 일괄
 * 업로드처럼 여러 장을 한 번에 받아야 하는 곳만 multiple+onFiles 를 얹어 쓰게 한다(둘 다 optional).
 */
export default function UploadButton({
  onFile,
  onFiles,
  multiple,
  label = '↥ 업로드',
  accept = 'image/*',
  className = 'btn-ghost',
  disabled,
  title,
}: {
  onFile?: (file: File) => void;
  /** multiple 일 때 선택된 전체 파일 목록. onFile 대신(또는 함께) 쓸 수 있다. */
  onFiles?: (files: File[]) => void;
  multiple?: boolean;
  label?: React.ReactNode;
  accept?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={className} disabled={disabled} title={title} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length) {
            onFiles?.(files);
            if (files[0]) onFile?.(files[0]);
          }
          if (ref.current) ref.current.value = '';
        }}
      />
    </>
  );
}
