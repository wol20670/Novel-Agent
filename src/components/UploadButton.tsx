import { useRef } from 'react';

/** 파일 선택 버튼 + 숨김 input. 외부 제작 이미지 업로드용 공용 컴포넌트. */
export default function UploadButton({
  onFile,
  label = '↥ 업로드',
  accept = 'image/*',
  className = 'btn-ghost',
  disabled,
  title,
}: {
  onFile: (file: File) => void;
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
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          if (ref.current) ref.current.value = '';
        }}
      />
    </>
  );
}
