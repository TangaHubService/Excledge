export function CategoryFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
}) {
  return (
    <select className="pos-category-filter" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All categories</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
