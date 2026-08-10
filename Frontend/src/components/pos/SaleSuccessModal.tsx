"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Printer, Plus, ReceiptText, Download, Share2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../components/ui/dialog"
import { Button } from "../../components/ui/button"

export interface SaleSuccessData {
  id: string | number
  invoiceNumber?: string | null
  receiptNumber?: string | null
  customerName?: string
  totalAmount?: number
  totalItems?: number
  paymentLabel?: string
  amountPaid?: number
  changeReturned?: number
  cashierName?: string
  date?: Date | string
}

interface SaleSuccessModalProps {
  isOpen: boolean
  saleData: SaleSuccessData | null
  onPrint: () => void
  onNewSale: () => void
  onViewInvoice?: () => void
  onDownload?: () => void
  onShare?: () => void
}

export default function SaleSuccessModal({
  isOpen,
  saleData,
  onPrint,
  onNewSale,
  onViewInvoice,
  onDownload,
  onShare,
}: SaleSuccessModalProps) {
  // Keyboard shortcut: Enter → Print Invoice
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      if (isTyping) return
      if (e.key === "Enter") {
        e.preventDefault()
        onPrint()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen, onPrint])

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm p-0 overflow-hidden rounded-2xl border-0 shadow-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          onNewSale()
        }}
      >
        <AnimatePresence>
          {isOpen && saleData && (
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              className="relative px-6 pb-6 pt-8 text-center"
            >
              {/* Check animation */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
                className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50"
              >
                <motion.svg
                  initial="hidden"
                  animate="visible"
                  className="size-9 text-emerald-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <motion.path
                    d="M5 13l4 4L19 7"
                    variants={{
                      hidden: { pathLength: 0, opacity: 0 },
                      visible: {
                        pathLength: 1,
                        opacity: 1,
                        transition: { duration: 0.4, delay: 0.3 },
                      },
                    }}
                  />
                </motion.svg>
              </motion.div>

              <DialogTitle className="text-lg font-bold text-gray-900">
                Sale Completed Successfully!
              </DialogTitle>
              <p className="mt-1 text-sm text-gray-500">
                The transaction has been recorded successfully.
              </p>

              {/* Invoice reference */}
              {(saleData.invoiceNumber || saleData.receiptNumber) && (
                <div className="mx-auto mt-4 flex max-w-xs items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <ReceiptText className="size-4 text-gray-400" />
                    Invoice
                  </div>
                  <span className="font-semibold text-gray-800 tabular-nums">
                    {saleData.receiptNumber || saleData.invoiceNumber}
                  </span>
                </div>
              )}

              <p className="mt-4 text-sm text-emerald-700">
                Thank you! The sale has been completed successfully and inventory has been updated.
              </p>

              {/* Actions */}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={onPrint}
                  size="lg"
                  className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
                >
                  <Printer className="size-4.5" />
                  Print Invoice
                </Button>
                <Button
                  onClick={onNewSale}
                  size="lg"
                  className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Plus className="size-4.5" />
                  New Sale
                </Button>
              </div>

              {(onDownload || onShare) && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  {onDownload && (
                    <Button
                      onClick={onDownload}
                      variant="outline"
                      size="lg"
                      className="flex-1"
                    >
                      <Download className="size-4.5" />
                      Download
                    </Button>
                  )}
                  {onShare && (
                    <Button
                      onClick={onShare}
                      variant="outline"
                      size="lg"
                      className="flex-1"
                    >
                      <Share2 className="size-4.5" />
                      Share
                    </Button>
                  )}
                </div>
              )}

              {onViewInvoice && (
                <button
                  type="button"
                  onClick={onViewInvoice}
                  className="mt-3 text-sm font-medium text-gray-500 underline-offset-4 transition-colors hover:text-blue-600 hover:underline"
                >
                  View Invoice
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
