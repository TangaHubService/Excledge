export function CartItem({
  name,
  qty,
  unitPrice,
  lineTotal,
  onDec,
  onInc,
}: {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="cart-row">
      <div>
        <strong>{name}</strong>
        <small>RWF {unitPrice.toLocaleString()}</small>
      </div>
      <div className="qty">
        <button onClick={onDec}>-</button>
        <span>{qty}</span>
        <button onClick={onInc}>+</button>
      </div>
      <div>RWF {lineTotal.toLocaleString()}</div>
    </div>
  );
}
