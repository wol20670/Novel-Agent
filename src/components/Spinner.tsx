export default function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </span>
  );
}
