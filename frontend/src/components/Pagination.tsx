export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pagination">
      <button className="btn ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} / {totalPages}
      </span>
      <button className="btn ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  );
}
