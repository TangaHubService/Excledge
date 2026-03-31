import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useToast } from "../toast";
import { useEffect } from "react";

function sanitizeParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === "string" && value.trim() === "") return false;
      return true;
    }),
  );
}

export function useReportQuery<T>(key: unknown[], endpoint: string, params: Record<string, unknown>) {
  const { push } = useToast();
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await api.get(endpoint, { params: sanitizeParams(params) })).data as {
        data: T[];
        meta: { total: number; page: number; limit: number };
      },
  });
  useEffect(() => {
    if (query.isError) push({ type: "error", message: "Failed to load report data" });
  }, [query.isError, push]);
  return query;
}
