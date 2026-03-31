export function SearchBar({
  value,
  onChange,
  onEnter,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <input
      ref={inputRef}
      className="pos-search"
      placeholder="Search product or barcode"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter?.();
        }
      }}
    />
  );
}
