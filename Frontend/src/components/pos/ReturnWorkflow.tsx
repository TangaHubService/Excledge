import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import {
  Search,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Receipt,
  Loader2,
  X,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'

/* ─── Types ─────────────────────────────────────────── */

interface SaleItem {
  id: string
  product: { id: number; name: string; sku?: string }
  quantity: number
  unitPrice: number
  totalPrice: number
  batchNumber?: string
  batchId?: number
}

interface Sale {
  id: string
  saleNumber: string
  totalAmount: number
  createdAt: string
  customer?: { name: string; phone?: string }
  saleItems: SaleItem[]
  branch?: { id: number; name: string }
}

type RestockCondition = 'SELLABLE' | 'DAMAGED' | 'EXPIRED'

interface ReturnItem {
  saleItemId: string
  productName: string
  maxQuantity: number
  quantity: number
  condition: RestockCondition
  unitPrice: number
  batchNumber?: string
  batchId?: number
}

interface ReturnWorkflowProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSearchSale: (query: string) => Promise<Sale[]>
  onFetchSaleById: (saleId: string) => Promise<Sale>
  onSubmitReturn: (data: {
    saleId: string
    reason: string
    items: { saleItemId: string; quantity: number; condition: RestockCondition }[]
  }) => Promise<void>
}

/* ─── Steps ──────────────────────────────────────────── */

type Step = 'search' | 'select-items' | 'confirm' | 'done'

const STEP_LABELS: Record<Step, string> = {
  search: 'Find Sale',
  'select-items': 'Return Items',
  confirm: 'Confirm',
  done: 'Complete',
}

const CONDITION_LABELS: Record<RestockCondition, string> = {
  SELLABLE: 'Sellable — re-shelve',
  DAMAGED: 'Damaged — disposal',
  EXPIRED: 'Expired — disposal',
}

const CONDITION_COLORS: Record<RestockCondition, string> = {
  SELLABLE: 'bg-success/10 text-success border-success/25 dark:bg-success/20 dark:text-emerald-300',
  DAMAGED: 'bg-danger/10 text-danger border-danger/25 dark:bg-danger/20 dark:text-red-300',
  EXPIRED: 'bg-warning/10 text-warning border-warning/30 dark:bg-warning/20 dark:text-amber-300',
}

/* ─── Component ─────────────────────────────────────── */

export function ReturnWorkflow({
  open,
  onOpenChange,
  onSearchSale,
  onFetchSaleById,
  onSubmitReturn,
}: ReturnWorkflowProps) {
  const [step, setStep] = useState<Step>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Sale[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [reason, setReason] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Reset on open */
  useEffect(() => {
    if (open) {
      setStep('search')
      setSearchQuery('')
      setSearchResults([])
      setSelectedSale(null)
      setReturnItems([])
      setReason('')
      setOtherReason('')
      setError(null)
    }
  }, [open])

  /* ── Search sale ─────────────────────────────────────── */
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setError(null)
    try {
      const results = await onSearchSale(searchQuery.trim())
      setSearchResults(results)
    } catch (err: any) {
      setError(err?.message || 'Search failed')
    } finally {
      setSearching(false)
    }
  }, [searchQuery, onSearchSale])

  /* ── Select sale ──────────────────────────────────────── */
  const selectSale = useCallback(async (sale: Sale) => {
    setSearching(true)
    setError(null)
    try {
      const full = await onFetchSaleById(sale.id)
      setSelectedSale(full)
      setReturnItems(
        full.saleItems.map(item => ({
          saleItemId: item.id,
          productName: item.product.name,
          maxQuantity: item.quantity,
          quantity: item.quantity,
          condition: 'SELLABLE' as RestockCondition,
          unitPrice: item.unitPrice,
          batchNumber: item.batchNumber,
          batchId: item.batchId,
        })),
      )
      setStep('select-items')
    } catch (err: any) {
      setError(err?.message || 'Failed to load sale details')
    } finally {
      setSearching(false)
    }
  }, [onFetchSaleById])

  /* ── Update return item ──────────────────────────────── */
  const updateItem = useCallback((saleItemId: string, field: keyof ReturnItem, value: any) => {
    setReturnItems(prev =>
      prev.map(item =>
        item.saleItemId === saleItemId ? { ...item, [field]: value } : item,
      ),
    )
  }, [])

  /* ── Totals ───────────────────────────────────────────── */
  const { totalRefund, totalItems } = useMemo(() => {
    let refund = 0
    let count = 0
    returnItems.forEach(item => {
      if (item.quantity > 0) {
        refund += item.quantity * item.unitPrice
        count += item.quantity
      }
    })
    return { totalRefund: refund, totalItems: count }
  }, [returnItems])

  const isOtherReason = reason === 'OTHER'
  const isReasonValid = reason !== '' && (!isOtherReason || otherReason.trim() !== '')

  /* ── Submit ────────────────────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    if (!selectedSale) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmitReturn({
        saleId: selectedSale.id,
        reason: isOtherReason ? otherReason.trim() : reason,
        items: returnItems
          .filter(item => item.quantity > 0)
          .map(item => ({
            saleItemId: item.saleItemId,
            quantity: item.quantity,
            condition: item.condition,
          })),
      })
      setStep('done')
    } catch (err: any) {
      setError(err?.message || 'Return failed')
    } finally {
      setSubmitting(false)
    }
  }, [selectedSale, reason, otherReason, isOtherReason, returnItems, onSubmitReturn])

  /* ── Close ────────────────────────────────────────────── */
  const handleClose = () => {
    if (!submitting) onOpenChange(false)
  }

  /* ── Render ───────────────────────────────────────────── */
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Process Return</DialogTitle>
          <DialogDescription>
            Walk through the return process step by step.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step indicator ───────────────────────────── */}
        <div className="flex items-center gap-2 px-1">
          {(['search', 'select-items', 'confirm'] as Step[]).map((s, i) => {
            const isActive = step === s
            const isDone = ['done', 'confirm'].includes(step) && s === 'search' ||
                           step === 'confirm' && s === 'select-items' ||
                           step === 'done'
            return (
              <React.Fragment key={s}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      isDone && 'bg-success/15 text-success dark:bg-success/40 dark:text-emerald-300',
                      isActive && 'bg-gray-900 text-white',
                      !isDone && !isActive && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className={cn(
                    'text-xs font-medium hidden sm:inline',
                    isActive && 'text-foreground',
                    !isActive && 'text-muted-foreground',
                  )}>
                    {STEP_LABELS[s]}
                  </span>
                </div>
                {i < 2 && (
                  <div className={cn(
                    'h-px flex-1 min-w-[12px]',
                    isDone ? 'bg-emerald-300' : 'bg-muted',
                  )} />
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* ── Scrollable content ────────────────────────── */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-danger/25 bg-danger/10 p-4 dark:border-red-800 dark:bg-danger/20">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <div className="flex-1 text-sm text-danger dark:text-red-300">{error}</div>
              <button type="button" onClick={() => setError(null)} className="text-danger hover:bg-danger/15 rounded p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ── Step: Search Sale ────────────────────────── */}
          {step === 'search' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Search by receipt number or customer name…"
                    className="h-11 pl-10"
                  />
                </div>
                <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()} className="h-11">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </Button>
              </div>

              {/* Results */}
              <div className="space-y-2">
                {searchResults.length === 0 && !searching && searchQuery && (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Receipt className="h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm text-muted-foreground">No sales found matching your search.</p>
                  </div>
                )}
                {searchResults.map(sale => (
                  <button
                    key={sale.id}
                    type="button"
                    onClick={() => selectSale(sale)}
                    className="flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {sale.saleNumber}
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {sale.customer?.name ?? 'Walk-in'} · {new Date(sale.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      R{sale.totalAmount.toFixed(2)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>

              {searching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}

          {/* ── Step: Select Items to Return ──────────────── */}
          {step === 'select-items' && selectedSale && (
            <div className="space-y-4">
              {/* Sale info header */}
              <div className="flex items-center gap-3 rounded-lg border bg-surface-subtle p-3">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{selectedSale.saleNumber}</p>
                  <p className="text-caption text-muted-foreground">
                    {selectedSale.customer?.name ?? 'Walk-in'} · {new Date(selectedSale.createdAt).toLocaleDateString()}
                    {selectedSale.branch && ` · ${selectedSale.branch.name}`}
                  </p>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-3">
                {returnItems.map(item => (
                  <div
                    key={item.saleItemId}
                    className="rounded-lg border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {item.productName}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {item.batchNumber && `Batch: ${item.batchNumber} · `}
                          Unit price: R{item.unitPrice.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          Sold: {item.maxQuantity}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          Max R{(item.maxQuantity * item.unitPrice).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Quantity + Condition row */}
                    <div className="mt-3 flex items-end gap-3">
                      <div className="flex-1">
                        <Label className="text-caption text-muted-foreground">Return quantity</Label>
                        <div className="mt-1 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateItem(item.saleItemId, 'quantity', Math.max(0, item.quantity - 1))}
                            className="flex h-10 w-10 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-muted"
                          >
                            −
                          </button>
                          <Input
                            type="number"
                            min={0}
                            max={item.maxQuantity}
                            value={item.quantity}
                            onChange={e => {
                              const v = parseInt(e.target.value) || 0
                              updateItem(item.saleItemId, 'quantity', Math.min(Math.max(0, v), item.maxQuantity))
                            }}
                            className="h-10 w-20 text-center text-sm font-bold tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() => updateItem(item.saleItemId, 'quantity', Math.min(item.maxQuantity, item.quantity + 1))}
                            className="flex h-10 w-10 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-muted"
                          >
                            +
                          </button>
                          <span className="text-caption text-muted-foreground ml-1">/ {item.maxQuantity}</span>
                        </div>
                      </div>

                      <div className="w-44">
                        <Label className="text-caption text-muted-foreground">Restocking condition</Label>
                        <Select
                          value={item.condition}
                          onValueChange={v => updateItem(item.saleItemId, 'condition', v)}
                        >
                          <SelectTrigger className="mt-1 h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['SELLABLE', 'DAMAGED', 'EXPIRED'] as RestockCondition[]).map(c => (
                              <SelectItem key={c} value={c}>
                                {CONDITION_LABELS[c]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="w-24 text-right">
                        <Label className="text-caption text-muted-foreground">Total</Label>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          R{(item.quantity * item.unitPrice).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Condition indicator */}
                    <div className="mt-2">
                      <Badge
                        variant="outline"
                        className={cn('text-[10px]', CONDITION_COLORS[item.condition])}
                      >
                        {item.condition === 'SELLABLE' ? '↩️ Will re-shelve' :
                         item.condition === 'DAMAGED' ? '🗑️ Will dispose' :
                         '⏰ Will dispose'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <Label htmlFor="return-reason">
                  Return reason <span className="text-danger">*</span>
                </Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger id="return-reason" className="h-11">
                    <SelectValue placeholder="Select a reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUSTOMER_DEFECT">Customer defect / damage</SelectItem>
                    <SelectItem value="WRONG_ITEM">Wrong item delivered</SelectItem>
                    <SelectItem value="EXPIRED">Expired at time of sale</SelectItem>
                    <SelectItem value="CUSTOMER_RETURN">Customer changed mind</SelectItem>
                    <SelectItem value="QUALITY_ISSUE">Quality issue</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                {isOtherReason && (
                  <Input
                    value={otherReason}
                    onChange={e => setOtherReason(e.target.value)}
                    placeholder="Please specify the reason…"
                    className="h-11"
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Step: Confirmation ────────────────────────── */}
          {step === 'confirm' && selectedSale && (
            <div className="space-y-4">
              {/* Warning */}
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 dark:border-amber-800 dark:bg-warning/20">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div>
                  <p className="font-medium text-warning dark:text-amber-200">Confirm this return</p>
                  <p className="mt-0.5 text-sm text-warning dark:text-amber-300">
                    This will update inventory and the sales ledger. This action cannot be automatically reversed.
                  </p>
                </div>
              </div>

              {/* Summary card */}
              <div className="space-y-3 rounded-lg border bg-surface-subtle p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Sale</span>
                  <span className="text-sm font-medium">{selectedSale.saleNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Items being returned</span>
                  <span className="text-sm font-medium">{totalItems}</span>
                </div>
                {returnItems.filter(i => i.quantity > 0).map(item => (
                  <div key={item.saleItemId} className="flex items-center justify-between pl-4 text-sm">
                    <span className="text-muted-foreground">{item.productName} × {item.quantity}</span>
                    <span>R{(item.quantity * item.unitPrice).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Total refund</span>
                  <span className="text-lg font-bold text-warning">R{totalRefund.toFixed(2)}</span>
                </div>
              </div>

              {/* Stock impact */}
              {returnItems.filter(i => i.quantity > 0 && i.condition === 'SELLABLE').length > 0 && (
                <div className="rounded-lg border border-success/25 bg-success/10 p-3 dark:border-emerald-800 dark:bg-success/10">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium text-success dark:text-emerald-300">
                      Stock impact
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-sm text-success dark:text-emerald-400">
                    {returnItems.filter(i => i.quantity > 0 && i.condition === 'SELLABLE').map(item => (
                      <p key={item.saleItemId}>
                        {item.productName}: +{item.quantity} units {item.batchNumber ? `to batch ${item.batchNumber}` : ''}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {returnItems.filter(i => i.quantity > 0 && i.condition !== 'SELLABLE').length > 0 && (
                <div className="rounded-lg border border-danger/25 bg-danger/10 p-3 dark:border-red-800 dark:bg-danger/10">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-danger" />
                    <span className="text-sm font-medium text-danger dark:text-red-300">
                      Disposal impact
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-sm text-danger dark:text-red-400">
                    {returnItems.filter(i => i.quantity > 0 && i.condition !== 'SELLABLE').map(item => (
                      <p key={item.saleItemId}>
                        {item.productName}: {item.quantity} units → {item.condition === 'DAMAGED' ? 'disposal (damaged)' : 'disposal (expired)'}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Reason summary */}
              <p className="text-sm text-muted-foreground">
                Reason: <span className="font-medium text-foreground">{isOtherReason ? otherReason.trim() : reason}</span>
              </p>
            </div>
          )}

          {/* ── Step: Done ────────────────────────────────── */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 dark:bg-success/30">
                <CheckCircle2 className="h-8 w-8 text-success dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Return Complete</h3>
                <p className="text-sm text-muted-foreground">
                  {totalItems} item(s) returned · R{totalRefund.toFixed(2)} refunded
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <DialogFooter className="flex-row items-center justify-between gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (step === 'select-items') setStep('search')
              else if (step === 'confirm') setStep('select-items')
              else handleClose()
            }}
            disabled={submitting}
            className="h-11 gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 'search' ? 'Cancel' : 'Back'}
          </Button>

          {step === 'search' && searchResults.length > 0 && (
            <p className="text-sm text-muted-foreground">{searchResults.length} sale(s) found</p>
          )}

          {step === 'select-items' && (
            <Button
              type="button"
              onClick={() => setStep('confirm')}
              disabled={totalItems === 0 || !isReasonValid}
              className="h-11 gap-1.5"
            >
              Review Return
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          {step === 'confirm' && (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="h-11 gap-1.5 bg-warning hover:bg-warning/90"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Confirm Return (R{totalRefund.toFixed(2)})
            </Button>
          )}

          {step === 'done' && (
            <Button type="button" onClick={handleClose} className="h-11">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
