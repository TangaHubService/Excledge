export function StateView({
  isLoading,
  isError,
  isEmpty,
}: {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
}) {
  if (isLoading) return <p>Loading...</p>;
  if (isError) return <p>Something went wrong.</p>;
  if (isEmpty) return <p>No data found.</p>;
  return null;
}
