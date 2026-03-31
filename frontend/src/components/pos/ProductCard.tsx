import { Package } from "lucide-react";

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
  const isLowStock = stock < 20;

  return (
    <article className="product-card-standard" onClick={onAdd}>
      <div className="product-card-img">
        <Package size={48} strokeWidth={1} style={{ opacity: 0.2 }} />
        {isLowStock && (
          <div style={{ position: 'absolute', top: '8px', left: '8px', background: '#f97316', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
            Low Stock
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h4>{name}</h4>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
          <div>
            <div className="price">RWF {price.toLocaleString()}</div>
            <div className="stock">Stock: {stock}</div>
          </div>
        </div>
      </div>
    </article>
  );
}
