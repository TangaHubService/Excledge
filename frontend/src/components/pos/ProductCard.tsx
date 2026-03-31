export function ProductCard({
  name,
  price,
  stock,
  onAdd,
}: {
  name: string;
  price: number;
  stock: number;
  onAdd: () => void;
}) {
  return (
    <button className="product-card" onClick={onAdd} disabled={stock <= 0} title={stock <= 0 ? "Out of stock" : "Add to cart"}>
      <strong>{name}</strong>
      <span>RWF {price.toLocaleString()}</span>
      <small>{stock <= 0 ? "Out of stock" : `Stock: ${stock}`}</small>
    </button>
  );
}
