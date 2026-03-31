import { Trash2, Plus, Minus, Package, ShoppingCart } from "lucide-react";

type CartItem = { 
  productId: string; 
  name: string; 
  qty: number; 
  unitPrice: number; 
  stock: number;
};

export function CartPanel({
  cart,
  total,
  onInc,
  onDec,
  onPay,
  onClear,
}: {
  cart: CartItem[];
  total: number;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onPay: () => void;
  onClear: () => void;
  payDisabled?: boolean;
}) {
  const tax = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#334155' }}>Cart</h2>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {cart.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', opacity: 0.5 }}>
            <ShoppingCart size={48} strokeWidth={1} />
            <p>Cart is empty</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.productId} className="cart-item-standard">
              <div className="cart-item-img">
                <Package size={20} strokeWidth={1.5} color="#94a3b8" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: '13px' }}>{item.name}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>1 x RWF {item.unitPrice.toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <button 
                  onClick={() => onDec(item.productId)} 
                  style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                >
                  <Minus size={12} />
                </button>
                <div style={{ fontSize: '13px', fontWeight: 700, width: '20px', textAlign: 'center' }}>{item.qty}</div>
                <button 
                  onClick={() => onInc(item.productId)}
                  style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                >
                  <Plus size={12} />
                </button>
              </div>
              <button 
                onClick={() => onDec(item.productId)} 
                style={{ padding: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', display: 'grid', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px' }}>
          <span style={{ color: '#64748b' }}>Subtotal:</span>
          <span style={{ fontWeight: 600 }}>RWF {total.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px' }}>
          <span style={{ color: '#64748b' }}>Tax:</span>
          <span style={{ fontWeight: 600 }}>RWF {tax}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', marginTop: '8px', borderTop: '2px solid #e2e8f0', paddingTop: '12px' }}>
          <span style={{ fontWeight: 700, color: '#334155' }}>Total:</span>
          <span style={{ fontWeight: 800, color: '#1e293b' }}>RWF {total.toLocaleString()}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        <button className="btn btn-clear-pos" onClick={onClear} style={{ height: '48px' }}>
          Clear Cart
        </button>
        <button className="btn btn-charge" onClick={onPay} disabled={cart.length === 0}>
          Charge RWF {total.toLocaleString()}
        </button>
      </div>
    </div>
  );
}
