import { useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "../ui/SearchableSelect";
import { ITEM_CLASSIFICATION_OPTIONS, ITEM_CLASSIFICATION_LABELS } from "../../types/ebm";
import { apiClient } from "../../lib/api-client";
import { cn } from "../../lib/utils";

interface RraItemClassRow {
  itemClsCd: string;
  itemClsNm: string | null;
}

/**
 * Searchable classification picker — text labels only; the RRA code is stored as the option value
 * (not shown in the UI). Typing searches the UNSPSC list synced from RRA (§61); the built-in common
 * classes are always offered too, so the picker still works before the first sync.
 */
export function RraItemClassPicker({
  value,
  onChange,
  invalid,
  required = false,
}: {
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<RraItemClassRow[]>([]);
  const [loading, setLoading] = useState(false);
  // Remember the label of a class picked from the server list so the trigger keeps showing it.
  const [pickedLabel, setPickedLabel] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      apiClient
        .searchRraItemClasses(q, 30)
        .then((res: any) => {
          if (!cancelled) setRemote(((res?.data ?? res)?.items ?? []) as RraItemClassRow[]);
        })
        .catch(() => { if (!cancelled) setRemote([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local = q
      ? ITEM_CLASSIFICATION_OPTIONS.filter((o) => o.label.toLowerCase().includes(q))
      : ITEM_CLASSIFICATION_OPTIONS;
    const seen = new Set(local.map((o) => o.value));
    const fromRra = remote
      .filter((r) => !seen.has(r.itemClsCd))
      .map((r) => ({ value: r.itemClsCd, label: r.itemClsNm?.trim() || "Unnamed classification", sublabel: "RRA" }));
    const merged = [...local, ...fromRra];
    if (value && !merged.some((o) => o.value === value)) {
      merged.unshift({
        value,
        label: ITEM_CLASSIFICATION_LABELS[value] ?? pickedLabel[value] ?? "Selected classification",
      });
    }
    return merged;
  }, [query, remote, value, pickedLabel]);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        RRA item classification{required ? <span className="text-danger"> *</span> : null}
      </label>
      <SearchableSelect
        options={options}
        value={value}
        onChange={(code) => {
          const opt = options.find((o) => o.value === code);
          if (opt) setPickedLabel((m) => ({ ...m, [code]: opt.label }));
          onChange(code);
        }}
        onSearchChange={setQuery}
        loading={loading}
        placeholder={required ? "Select classification…" : "Select classification (optional)"}
        searchPlaceholder="Search classification…"
        emptyText="No matching classification."
        className={cn(
          "h-auto min-h-[42px] rounded-xl border px-3.5 py-2.5",
          invalid ? "border-red-400" : "border-border",
        )}
      />
      <p className="text-xs text-muted-foreground">
        {required
          ? "Required by RRA. Pick the closest matching class for this item."
          : "Pick the closest matching RRA class for this item."}
      </p>
    </div>
  );
}

export default RraItemClassPicker;
