import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useToast } from "../toast";
import { queryKeys } from "../api/queryKeys";
import { useBranch } from "../context/BranchContext";
import { POSLayout } from "../components/pos/POSLayout";
import { SearchBar } from "../components/pos/SearchBar";
import { ProductCard } from "../components/pos/ProductCard";
import { CartPanel } from "../components/pos/CartPanel";
import { PaymentModal } from "../components/pos/PaymentModal";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";

type CatalogItem = {
  id: string;
  name: string;
  categoryId: string;
  unitPrice: number;
  stock: number;
};

type CartLine = { productId: string; name: string; qty: number; unitPrice: number; stock: number };

export function POSPage() {
  const { push } = useToast();
  const qc = useQueryClient();
  const { branchId } = useBranch();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "MOBILE_MONEY">("CASH");
  const [clearOpen, setClearOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const catalog = useQuery({
    queryKey: queryKeys.posCatalog({ search, branchId }),
    enabled: !!branchId,
    queryFn: async () => (await api.get("/pos/catalog", { params: { search, branchId } })).data.data as CatalogItem[],
  });

  const total = useMemo(() => cart.reduce((sum, x) => sum + x.qty * x.unitPrice, 0), [cart]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const checkout = useMutation({
    mutationFn: async () =>
      api.post("/pos/checkout", {
        paymentMethod,
        items: cart.map((c) => ({ productId: c.productId, quantity: c.qty })),
      }),
    onSuccess: () => {
      setCart([]);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      push({ type: "success", message: "Sale completed successfully" });
    },
    onError: () => push({ type: "error", message: "Insufficient stock" }),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "F9") {
        event.preventDefault();
        if (cart.length && !checkout.isPending) setPaymentOpen(true);
      }
      if (event.key === "Escape" && cart.length) {
        setClearOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cart.length, checkout]);

  const addToCart = (item: CatalogItem) => {
    setCart((prev) => {
      const exists = prev.find((x) => x.productId === item.id);
      if (exists) return prev.map((x) => (x.productId === item.id ? { ...x, qty: Math.min(x.qty + 1, x.stock) } : x));
      return [...prev, { productId: item.id, name: item.name, qty: 1, unitPrice: item.unitPrice, stock: item.stock }];
    });
  };

  const saveHold = () => localStorage.setItem("held-sale", JSON.stringify(cart));

  return (
    <>
      <POSLayout
        left={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            <SearchBar
              inputRef={searchRef}
              value={search}
              onChange={setSearch}
              onEnter={() => {
                if ((catalog.data?.length ?? 0) > 0) addToCart(catalog.data![0]);
              }}
            />
            
            <div className="product-grid" style={{ flex: 1 }}>
              {catalog.isLoading ? (
                Array.from({ length: 9 }).map((_, i) => <div key={i} className="skeleton" style={{ height: '220px' }} />)
              ) : (catalog.data ?? []).length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No products found</div>
              ) : (
                (catalog.data ?? []).map((p) => (
                  <ProductCard key={p.id} name={p.name} price={p.unitPrice} stock={p.stock} onAdd={() => addToCart(p)} />
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #d1d5db' }}>
              <button className="btn btn-clear-pos" onClick={() => setClearOpen(true)} style={{ padding: '8px 24px' }}>Clear Cart</button>
              <button className="btn btn-hold" onClick={saveHold} style={{ padding: '8px 24px' }}>Hold Sale</button>
            </div>
          </div>
        }
        right={
          <CartPanel
            cart={cart}
            total={total}
            onInc={(id) => setCart((s) => s.map((x) => x.productId === id ? { ...x, qty: Math.min(x.stock, x.qty + 1) } : x))}
            onDec={(id) => setCart((s) => s.map((x) => x.productId === id ? { ...x, qty: Math.max(0, x.qty - 1) } : x).filter(x => x.qty > 0))}
            onPay={() => setPaymentOpen(true)}
            onClear={() => setClearOpen(true)}
          />
        }
      />
      <Modal open={clearOpen} title="Clear cart?" onClose={() => setClearOpen(false)}>
        <p>This will remove all items from cart.</p>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setClearOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => { setCart([]); setClearOpen(false); }}>Yes, clear</Button>
        </div>
      </Modal>
      <PaymentModal
        open={paymentOpen}
        total={total}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        onClose={() => setPaymentOpen(false)}
        loading={checkout.isPending}
        onConfirm={() => {
          checkout.mutate();
          setPaymentOpen(false);
        }}
      />
    </>
  );
}
