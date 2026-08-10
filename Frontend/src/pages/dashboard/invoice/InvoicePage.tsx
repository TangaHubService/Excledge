import { useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useReactToPrint } from "react-to-print"
import { ArrowLeft, FileDown, Loader2, Printer, RefreshCw, ReceiptText, Share2 } from "lucide-react"
import { toast } from "react-toastify"
import { saveAs } from "file-saver"
import { apiClient } from "../../../lib/api-client"
import { getInvoiceFilename, unwrapInvoice } from "../../../lib/invoice"
import { invoiceToPdfBlob, shareInvoicePdf } from "../../../lib/invoice-pdf"
import { InvoicePreview } from "../../../components/invoice/preview"
import { Button } from "../../../components/ui/button"
import { Skeleton } from "../../../components/ui/skeleton"

const A4_PAGE_CSS = `@page { size: A4; margin: 6mm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tr, thead { break-inside: avoid; page-break-inside: avoid; }
  section { break-inside: avoid; page-break-inside: avoid; }`

function InvoiceSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[210mm] space-y-4">
      <div className="flex flex-wrap justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-3 w-52" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-28 w-56 rounded-xl" />
        </div>
      </div>
      <Skeleton className="mx-auto h-6 w-36" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <div className="flex justify-end">
        <Skeleton className="h-44 w-full max-w-md rounded-xl" />
      </div>
    </div>
  )
}

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const paperRef = useRef<HTMLDivElement>(null)
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const [isSharing, setIsSharing] = useState(false)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => unwrapInvoice(await apiClient.getInvoice(id!)),
    enabled: !!id,
    retry: 1,
    // Keep the preview in sync with server-side changes (status / payment /
    // fiscalization) while the page is open.
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })

  const handlePrint = useReactToPrint({
    contentRef: paperRef,
    documentTitle: data?.invoice.invoiceNumber ?? `invoice-${id}`,
    pageStyle: A4_PAGE_CSS,
  })

  const handlePdfDownload = async () => {
    if (!data) return
    try {
      setIsPdfGenerating(true)
      const filename = getInvoiceFilename(data, id)
      const blob = await invoiceToPdfBlob(data)
      if (!blob) throw new Error("PDF generation failed")
      saveAs(blob, filename)
      toast.success("PDF downloaded")
    } catch (error) {
      console.error("PDF generation failed:", error)
      toast.error("Failed to generate PDF. Use Print > Save as PDF instead.")
    } finally {
      setIsPdfGenerating(false)
    }
  }

  const handleShare = async () => {
    if (!data) return
    try {
      setIsSharing(true)
      const filename = getInvoiceFilename(data, id)
      const shared = await shareInvoicePdf(data, filename)
      toast.success(shared ? "Invoice ready to share" : "Your browser downloaded the invoice instead")
    } catch (error: unknown) {
      // Closing the browser share sheet is not a failed invoice operation.
      if (error instanceof DOMException && error.name === "AbortError") return
      console.error("Invoice share failed:", error)
      toast.error("Failed to prepare invoice sharing")
    } finally {
      setIsSharing(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6 dark:bg-slate-950">
      <style>{A4_PAGE_CSS}</style>
      <div className="mx-auto max-w-5xl px-4">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm print:hidden">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <div>
              <h1 className="text-sm font-bold text-slate-900">ERP Invoice</h1>
              <p className="text-[11px] text-slate-500">
                {data ? `${data.invoice.invoiceNumber} · ${data.invoice.paymentMethod || "—"}` : "Loading invoice…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching || !data}
            >
              {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handlePdfDownload} disabled={isPdfGenerating || !data}>
              {isPdfGenerating ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare} disabled={isSharing || !data}>
              {isSharing ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
              Share
            </Button>
            <Button size="sm" onClick={() => handlePrint?.()} disabled={!data}>
              <Printer className="size-4" /> Print
            </Button>
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <InvoiceSkeleton />
        ) : isError ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <ReceiptText className="h-10 w-10 text-red-500" />
            <h2 className="text-base font-bold text-slate-900">Could not load the invoice</h2>
            <p className="text-sm text-slate-500">
              The invoice could not be fetched from the server. Please try again.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/sales")}>
                Go to Sales
              </Button>
              <Button size="sm" onClick={() => refetch()}>
                <RefreshCw className="size-4" /> Retry
              </Button>
            </div>
          </div>
        ) : !data ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <ReceiptText className="h-10 w-10 text-slate-300" />
            <h2 className="text-base font-bold text-slate-900">No invoice found</h2>
            <p className="text-sm text-slate-500">There is no data to display for this invoice.</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/sales")}>
              Go to Sales
            </Button>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-200/60 p-4 sm:p-6 print:bg-transparent print:p-0">
            <InvoicePreview ref={paperRef} data={data} />
          </div>
        )}
      </div>
    </div>
  )
}
