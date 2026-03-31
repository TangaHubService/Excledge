import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

type Branch = { id: string; name: string };

type BranchContextType = {
  branchId: string;
  setBranchId: (id: string) => void;
  branches: Branch[];
  isLoading: boolean;
};

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branchId, setBranchId] = useState<string>(() => localStorage.getItem("active_branch") || "");

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const res = await api.get("/branches");
      return res.data.data;
    },
  });

  useEffect(() => {
    if (!branchId && branches.length > 0) {
      const firstId = branches[0].id;
      setBranchId(firstId);
      localStorage.setItem("active_branch", firstId);
    }
  }, [branches, branchId]);

  const handleSetBranch = (id: string) => {
    setBranchId(id);
    localStorage.setItem("active_branch", id);
  };

  return (
    <BranchContext.Provider value={{ branchId, setBranchId: handleSetBranch, branches, isLoading }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) throw new Error("useBranch must be used within a BranchProvider");
  return context;
}
