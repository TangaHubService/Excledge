import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { useTheme } from "../../../context/ThemeContext";
import { useTranslation } from "react-i18next";
import { useBranch } from "../../../context/BranchContext";
import { apiClient } from "../../../lib/api-client";
import { toast } from "react-toastify";
import { Loader2 } from "lucide-react";

interface Branch {
  id: number;
  name: string;
  code?: string;
  address?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

interface StockAdjustmentDialogProps {
  productId: number | null;
  productName?: string;
  currentStock?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function StockAdjustmentDialog({
  productId,
  productName,
  currentStock,
  open,
  onOpenChange,
  onSuccess,
}: StockAdjustmentDialogProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { selectedBranchId } = useBranch();
  const [quantity, setQuantity] = useState<string>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>(selectedBranchId?.toString() || '');
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    if (open) {
      fetchBranches();
      if (selectedBranchId) {
        setBranchId(selectedBranchId.toString());
      }
    }
  }, [open, selectedBranchId]);

  const fetchBranches = async () => {
    try {
      setLoadingBranches(true);
      const data = await apiClient.getBranches();
      setBranches(Array.isArray(data) ? data : data.branches || []);
    } catch (error) {
      console.error('Error fetching branches:', error);
      // Don't show error toast, just use empty array (branch selection is optional)
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productId) return;

    const adjustmentQty = parseFloat(quantity);
    if (isNaN(adjustmentQty) || adjustmentQty === 0) {
      toast.error(t('inventory.invalidAdjustment'));
      return;
    }

    // Check if negative adjustment would result in negative stock
    if (adjustmentQty < 0 && currentStock !== undefined && currentStock + adjustmentQty < 0) {
      toast.error(t('inventory.insufficientStock'));
      return;
    }

    try {
      setLoading(true);
      await apiClient.adjustInventoryStock({
        productId,
        quantity: adjustmentQty,
        branchId: branchId ? (branchId === 'null' ? null : parseInt(branchId)) : undefined,
        note: note || undefined,
        reference: `ADJ-${productId}-${Date.now()}`,
        referenceType: 'ADJUSTMENT',
      });

      toast.success(t('inventory.stockAdjusted'));
      setQuantity('');
      setNote('');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error adjusting stock:', error);
      toast.error(error.message || t('inventory.adjustmentFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setQuantity('');
      setNote('');
      setBranchId('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={`sm:max-w-[500px] ${theme === "dark"
          ? "bg-gray-900 border-gray-700 text-gray-100"
          : "bg-white border-gray-200"
          }`}
      >
        <DialogHeader>
          <DialogTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>
            {t('inventory.adjustStock')} {productName && `- ${productName}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {currentStock !== undefined && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  {t('inventory.currentStock')}: <span className="font-semibold">{currentStock}</span>
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="quantity">
                {t('inventory.adjustmentQuantity')} *
              </Label>
              <Input
                id="quantity"
                type="number"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={t('inventory.enterQuantity')}
                required
                className={theme === "dark" ? "bg-gray-800 border-gray-700" : ""}
                disabled={loading}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('inventory.adjustmentHint')}
              </p>
              {/* Preview of new stock value */}
              {quantity && !isNaN(parseFloat(quantity)) && currentStock !== undefined && (
                <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-700 dark:text-green-400">
                    <span className="font-medium">{t('inventory.currentStock')}:</span> {currentStock}
                    {' + '}
                    <span className="font-medium">{parseFloat(quantity) > 0 ? '+' : ''}{parseFloat(quantity)}</span>
                    {' = '}
                    <span className="font-bold text-green-800 dark:text-green-300">
                      {currentStock + parseFloat(quantity)}
                    </span>
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    {t('inventory.newStockWillBe') || 'New stock will be'}: <strong>{currentStock + parseFloat(quantity)}</strong>
                  </p>
                </div>
              )}
            </div>

            {branches.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="branch">
                  {t('inventory.branch') || 'Branch'} ({t('common.optional')})
                </Label>
                <select
                  id="branch"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${theme === "dark"
                    ? "bg-gray-800 border-gray-700 text-gray-100"
                    : "bg-white border-gray-300 text-gray-900"
                    }`}
                  disabled={loading || loadingBranches}
                >
                  <option value="">{t('inventory.mainBranch') || 'Main Branch (Default)'}</option>
                  {branches.map((br) => (
                    <option key={br.id} value={br.id.toString()}>
                      {br.name} {br.code ? `(${br.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="note">
                {t('common.note')} ({t('common.optional')})
              </Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('inventory.adjustmentNotePlaceholder')}
                rows={3}
                className={theme === "dark" ? "bg-gray-800 border-gray-700" : ""}
                disabled={loading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className={theme === "dark" ? "border-gray-700 hover:bg-gray-800" : ""}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={loading || !quantity}
              className="min-w-[100px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.processing')}
                </>
              ) : (
                t('inventory.adjust')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
