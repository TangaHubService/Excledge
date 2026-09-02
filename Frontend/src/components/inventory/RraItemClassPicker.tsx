import { useEffect, useRef, useState } from "react";
import { Search, Loader2, X, Cloud } from "lucide-react";
import { apiClient } from "../../lib/api-client";
import { toast } from "react-toastify";

interface RraItemClass {
  itemClsCd: string;
  itemClsNm: string | null;
  itemClsLvl: number | null;
  taxTyCd: string | null;
}

/**
 * Typeahead over the locally-cached RRA item-classification list
 * (/itemClass/selectItemsClass, RRA checklist §61). Replaces the free-text
 * "class code" input so a real UNSPSC-style code is chosen from the
 * authoritative list; the field still accepts a manually-typed code and an
 * empty value (falls back to the org default classification).
 */
export function RraItemClassPicker({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RraItemClass[]>([]);
  const [loading, setLoading] = useState(false);
  const [cachedTotal, setCachedTotal] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiClient.searchRraItemClasses(query.trim() || undefined, 30);
        const data = (res as any)?.data ?? res;
        if (!alive) return;
        setResults(data?.items ?? []);
        setCachedTotal(data?.cachedTotal ?? 0);
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [query, open]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await apiClient.syncRraItemClasses();
      const out = (res as any)?.data ?? res;
      toast.success(`Synced ${out?.upserted ?? 0} classifications from RRA`);
      setQuery((q) => q); // retrigger search
    } catch (e: any) {
      toast.error(e?.message ?? "Could not sync classifications from RRA");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-1.5" ref={boxRef}>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">RRA item classification</label>
      <div className="relative">
        <div
          className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-blue-500/50 dark:bg-gray-900 ${
            invalid ? "border-red-400" : "border-gray-200 dark:border-gray-700"
          }`}
        >
          <Search className="size-4 shrink-0 text-gray-400" />
          <input
            value={open ? query : value}
            onChange={(e) => { setQuery(e.target.value); onChange(e.target.value.replace(/\D/g, "").slice(0, 10)); }}
            onFocus={() => { setOpen(true); setQuery(""); }}
            inputMode="numeric"
            placeholder={value ? value : "Search code or name, or type a code"}
            className="w-full bg-transparent outline-none dark:text-white"
          />
          {value && (
            <button type="button" onClick={() => { onChange(""); setQuery(""); }} className="shrink-0 text-gray-400 hover:text-gray-600">
              <X className="size-4" />
            </button>
          )}
        </div>

        {open && (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
            {loading ? (
              <div className="flex items-center gap-2 px-3.5 py-3 text-sm text-gray-400">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3.5 py-3 text-sm text-gray-500">
                {cachedTotal === 0 ? (
                  <>
                    No classifications cached yet.
                    <button type="button" onClick={sync} disabled={syncing} className="ml-1 font-medium text-blue-600 hover:underline">
                      {syncing ? "Syncing…" : "Sync from RRA"}
                    </button>
                  </>
                ) : (
                  "No matching classification."
                )}
              </div>
            ) : (
              results.map((r) => (
                <button
                  key={r.itemClsCd}
                  type="button"
                  onClick={() => { onChange(r.itemClsCd); setQuery(""); setOpen(false); }}
                  className="flex w-full items-start justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-950/40"
                >
                  <span>
                    <span className="font-mono text-xs text-gray-500">{r.itemClsCd}</span>
                    <span className="ml-2">{r.itemClsNm ?? "—"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {r.taxTyCd ? `tax ${r.taxTyCd}` : ""}{r.itemClsLvl != null ? ` · L${r.itemClsLvl}` : ""}
                  </span>
                </button>
              ))
            )}
            {results.length > 0 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-3.5 py-2 text-xs text-gray-400 dark:border-gray-800">
                <span>{cachedTotal ?? 0} cached</span>
                <button type="button" onClick={sync} disabled={syncing} className="flex items-center gap-1 text-blue-600 hover:underline">
                  <Cloud className="size-3.5" /> {syncing ? "Syncing…" : "Refresh from RRA"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400">Leave blank to use the organization&apos;s default classification.</p>
    </div>
  );
}

export default RraItemClassPicker;
