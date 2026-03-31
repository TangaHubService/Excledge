import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Modal } from "../components/ui/Modal";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../toast";
import { queryKeys } from "../api/queryKeys";
import { POSLayout } from "../components/pos/POSLayout";
import { SearchBar } from "../components/pos/SearchBar";
import { CategoryFilter } from "../components/pos/CategoryFilter";
import { ProductCard } from "../components/pos/ProductCard";
import { CartPanel } from "../components/pos/CartPanel";
import { PaymentModal } from "../components/pos/PaymentModal";
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
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "MOBILE_MONEY">("CASH");
  const [clearOpen, setClearOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const branches = useQuery({ queryKey: ["branches"], queryFn: async () => (await api.get("/branches")).data.data });
  const categories = useQuery({ queryKey: ["categories"], queryFn: async () => (await api.get("/categories")).data.data });
  const catalog = useQuery({
    queryKey: queryKeys.posCatalog({ branchId, search, categoryId }),
    enabled: !!branchId,
    queryFn: async () => (await api.get("/pos/catalog", { params: { branchId, search, categoryId: categoryId || undefined } })).data.data as CatalogItem[],
  });

  const total = useMemo(() => cart.reduce((sum, x) => sum + x.qty * x.unitPrice, 0), [cart]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const checkout = useMutation({
    mutationFn: async () =>
      api.post("/pos/checkout", {
        branchId,
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
        if (cart.length && branchId && !checkout.isPending) setPaymentOpen(true);
      }
      if (event.key === "Escape" && cart.length) {
        setClearOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [branchId, cart.length, checkout]);

  const addToCart = (item: CatalogItem) => {
    setCart((prev) => {
      const exists = prev.find((x) => x.productId === item.id);
      if (exists) return prev.map((x) => (x.productId === item.id ? { ...x, qty: Math.min(x.qty + 1, x.stock) } : x));
      return [...prev, { productId: item.id, name: item.name, qty: 1, unitPrice: item.unitPrice, stock: item.stock }];
    });
  };

  const saveHold = () => localStorage.setItem("held-sale", JSON.stringify(cart));
  const resumeHold = () => {
    const raw = localStorage.getItem("held-sale");
    if (raw) setCart(JSON.parse(raw));
  };

  return (
    <>
      <POSLayout
        top={
          <>
            <h1>POS</h1>
            <div className="pos-top-controls">
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Select branch</option>
                {(branches.data ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <span>Cashier: Current User</span>
            </div>
          </>
        }
        left={
          <>
            <div className="toolbar">
              <SearchBar
                inputRef={searchRef}
                value={search}
                onChange={setSearch}
                onEnter={() => {
                  if ((catalog.data?.length ?? 0) > 0) addToCart(catalog.data![0]);
                }}
              />
              <CategoryFilter value={categoryId} onChange={setCategoryId} options={categories.data ?? []} />
            </div>
            <div className="product-grid">
              {catalog.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={90} />)
              ) : (catalog.data ?? []).length === 0 ? (
                <p>No products found</p>
              ) : (
                (catalog.data ?? []).map((p) => (
                  <ProductCard key={p.id} name={p.name} price={p.unitPrice} stock={p.stock} onAdd={() => addToCart(p)} />
                ))
              )}
            </div>
          </>
        }
        right={
          <CartPanel
            cart={cart}
            total={total}
            onDec={(id) => setCart((s) => s.map((x) => x.productId === id ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}
            onInc={(id) => setCart((s) => s.map((x) => x.productId === id ? { ...x, qty: Math.min(x.stock, x.qty + 1) } : x))}
            onPay={() => setPaymentOpen(true)}
            onClear={() => setClearOpen(true)}
            onHold={saveHold}
            onResume={resumeHold}
            payDisabled={!cart.length || !branchId}
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
