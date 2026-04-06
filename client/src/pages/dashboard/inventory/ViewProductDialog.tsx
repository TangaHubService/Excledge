import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { useTheme } from "../../../context/ThemeContext";
import { type Product } from "../../../types";
import { useTranslation } from "react-i18next";
import { History, Edit } from "lucide-react";
import InventoryHistoryDialog from "./InventoryHistoryDialog";
import StockAdjustmentDialog from "./StockAdjustmentDialog";


// Helper function to compute remaining days
function getDaysRemaining(expiryDate: string) {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export default function ViewProductDialog({
  viewProduct,
  setViewProduct,
  onStockUpdated,
}: {
  viewProduct: Product | null;
  setViewProduct: (product: Product | null) => void;
  onStockUpdated?: () => void;
}) {

  const { t } = useTranslation();
  const { theme } = useTheme();
  const [showHistory, setShowHistory] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);


  return (
    <Dialog
      open={!!viewProduct}
      onOpenChange={(open) => !open && setViewProduct(null)}
    >
      <DialogContent
        className={`sm:max-w-[500px] ${theme === "dark"
          ? "bg-gray-900 border-gray-700 text-gray-100"
          : "bg-white border-gray-200"
          }`}
      >
        <DialogHeader>
          <DialogTitle
            className={theme === "dark" ? "text-white" : "text-gray-900"}
          >
            {t('inventory.productDetails')}
          </DialogTitle>

        </DialogHeader>

        {viewProduct && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p
                  className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                    }`}
                >
                  {t('common.name')}
                </p>
                <p className="mt-1">{viewProduct.name}</p>
              </div>
              <div>
                <p
                  className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                    }`}
                >
                  ID
                </p>
                <p className="mt-1 font-mono text-sm select-all break-all">{viewProduct.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p
                  className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                    }`}
                >
                  {t('inventory.category')}
                </p>
                <p className="mt-1">{viewProduct.category || t('common.na')}</p>
              </div>
              <div>
                <p
                  className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                    }`}
                >
                  {t('inventory.unitPrice')}
                </p>
                <p className="mt-1">{viewProduct.unitPrice} Frw</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p
                  className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                    }`}
                >
                  {t('inventory.quantity')}
                </p>
                <p className="mt-1">{viewProduct.quantity || 0}</p>
              </div>
              <div>
                <p
                  className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                    }`}
                >
                  {t('inventory.minStock')}
                </p>
                <p className="mt-1">{viewProduct.minStock || 0}</p>
              </div>
            </div>

            {viewProduct.batchNumber && (
              <div>
                <p
                  className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                    }`}
                >
                  {t('inventory.batchNumber')}
                </p>
                <p className="mt-1 font-mono">{viewProduct.batchNumber}</p>
              </div>
            )}

            {viewProduct.expiryDate && (
              <div>
                <p
                  className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                    }`}
                >
                  {t('inventory.expiryDate')}
                </p>
                <p className="mt-1">
                  {new Date(viewProduct.expiryDate).toLocaleDateString()}
                  <span className="ml-2 text-sm text-gray-500">
                    ({t('inventory.daysRemainingCount', { count: getDaysRemaining(viewProduct.expiryDate) })})
                  </span>
                </p>
              </div>
            )}

            {viewProduct.description && (
              <div>
                <p
                  className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"
                    }`}
                >
                  {t('common.description')}
                </p>
                <p className="mt-1 text-sm">{viewProduct.description}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowHistory(true)}
              className={
                theme === "dark" ? "border-gray-700 hover:bg-gray-800" : ""
              }
            >
              <History className="h-4 w-4 mr-2" />
              {t('inventory.viewHistory')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAdjustment(true)}
              className={
                theme === "dark" ? "border-gray-700 hover:bg-gray-800" : ""
              }
            >
              <Edit className="h-4 w-4 mr-2" />
              {t('inventory.adjustStock')}
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setViewProduct(null)}
            className={
              theme === "dark" ? "border-gray-700 hover:bg-gray-800" : ""
            }
          >
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Inventory History Dialog */}
      <InventoryHistoryDialog
        productId={viewProduct?.id || null}
        productName={viewProduct?.name}
        open={showHistory}
        onOpenChange={setShowHistory}
      />

      {/* Stock Adjustment Dialog */}
      <StockAdjustmentDialog
        productId={viewProduct?.id || null}
        productName={viewProduct?.name}
        currentStock={viewProduct?.quantity}
        open={showAdjustment}
        onOpenChange={setShowAdjustment}
        onSuccess={() => {
          onStockUpdated?.();
          setViewProduct(null); // Close product dialog after adjustment
        }}
      />
    </Dialog>
  );
}
