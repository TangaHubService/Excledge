import { Button } from "../ui/Button";
import { CartItem } from "./CartItem";

type CartLine = { productId: string; name: string; qty: number; unitPrice: number; stock: number };

export function CartPanel({
  cart,
  total,
  onInc,
  onDec,
  onPay,
  onClear,
  onHold,
  onResume,
  payDisabled,
}: {
  cart: CartLine[];
  total: number;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onPay: () => void;
  onClear: () => void;
  onHold: () => void;
  onResume: () => void;
  payDisabled: boolean;
}) {
  return (
    <div className="panel cart-panel">
      <h3>Cart</h3>
      <div className="cart-list">
        {cart.map((line) => (
          <CartItem
            key={line.productId}
            name={line.name}
            qty={line.qty}
            unitPrice={line.unitPrice}
            lineTotal={line.qty * line.unitPrice}
            onDec={() => onDec(line.productId)}
            onInc={() => onInc(line.productId)}
          />
        ))}
      </div>
      <div className="total-box">Total: RWF {total.toLocaleString()}</div>
      <div className="pos-shortcuts">F2 search, Enter add first, F9 pay, Esc clear</div>
      <div className="pos-actions">
        <Button onClick={onPay} disabled={payDisabled}>Pay</Button>
        <Button variant="ghost" onClick={onClear}>Clear cart</Button>
        <Button variant="ghost" onClick={onHold}>Hold sale</Button>
        <Button variant="ghost" onClick={onResume}>Resume sale</Button>
      </div>
    </div>
  );
}
