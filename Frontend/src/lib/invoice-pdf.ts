/**
 * Invoice PDF generation.
 *
 * Mounts InvoicePreview into a hidden fixed staging element, captures it, and
 * assembles the canvas into exact A4 pages. The staging element is only made
 * visible in html2canvas's clone, so it never flashes on the user's screen.
 *
 * Key rules for html2canvas:
 *  - The cloned element must be a visible painted box (not hidden / off-screen).
 *  - Images must use crossOrigin="anonymous" and be loaded before capture.
 *  - Canvas elements (QR code) must be fully drawn before capture.
 *  - All styles must be inline — Tailwind CSS classes are NOT available inside
 *    the detached render stage.
 */
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import type { EbmInvoice } from "./invoice"
import { InvoicePreview } from "../components/invoice/preview"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Wait for all <img> tags inside the container to finish loading. */
async function waitForImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll("img"))
  if (!imgs.length) return
  await Promise.allSettled(
    imgs.map(
      (img) =>
        new Promise<void>((res) => {
          if (img.complete && img.naturalWidth > 0) return res()
          img.onload = () => res()
          img.onerror = () => res()
        }),
    ),
  )
}

/** Wait for all <canvas> elements to be non-empty (QR codes drawn by qrcode lib). */
async function waitForCanvases(container: HTMLElement): Promise<void> {
  const canvases = Array.from(container.querySelectorAll("canvas"))
  if (!canvases.length) return
  // Poll up to 2 s for canvases to receive pixels
  const deadline = Date.now() + 2000
  const poll = (): Promise<void> =>
    new Promise<void>((resolve) => {
      const check = () => {
        const allPainted = canvases.every((c) => {
          try {
            const ctx = c.getContext("2d")
            if (!ctx) return true
            const data = ctx.getImageData(0, 0, Math.min(c.width, 10), Math.min(c.height, 10)).data
            return data.some((v, i) => i % 4 !== 3 && v < 240)
          } catch {
            return true
          }
        })
        if (allPainted || Date.now() > deadline) return resolve()
        requestAnimationFrame(check)
      }
      check()
    })
  await poll()
}

/**
 * Captures the stage once and slices the raster into precisely filled A4 pages.
 * This avoids html2pdf's automatic page-break calculation, which could append a
 * blank page when a receipt was close to the end of an A4 sheet.
 */
async function captureInvoiceAsPdf(stage: HTMLElement): Promise<Blob | null> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ])

  const stageHeight = Math.ceil(stage.getBoundingClientRect().height)
  const canvas = await html2canvas(stage, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: "#ffffff",
    width: 860,
    height: stageHeight,
    windowWidth: 860,
    windowHeight: Math.max(window.innerHeight, stageHeight),
    // The real stage remains hidden; reveal only the document clone used by
    // html2canvas so the customer never sees a temporary invoice preview.
    onclone: (clonedDocument) => {
      const clone = clonedDocument.querySelector<HTMLElement>("[data-invoice-export-stage]")
      if (!clone) return
      clone.style.visibility = "visible"
      clone.style.position = "absolute"
      clone.style.left = "0"
      clone.style.top = "0"
      clone.style.zIndex = "0"
    },
  })

  if (!canvas.width || !canvas.height) return null

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true })
  const margin = 5
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const printableWidth = pageWidth - margin * 2
  const printableHeight = pageHeight - margin * 2
  const pixelsPerPage = Math.max(1, Math.floor(canvas.width * (printableHeight / printableWidth)))

  let sourceY = 0
  let page = 0
  while (sourceY < canvas.height) {
    const sourceHeight = Math.min(pixelsPerPage, canvas.height - sourceY)
    const pageCanvas = document.createElement("canvas")
    pageCanvas.width = canvas.width
    pageCanvas.height = sourceHeight
    const context = pageCanvas.getContext("2d")
    if (!context) return null

    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    context.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sourceHeight,
      0,
      0,
      pageCanvas.width,
      pageCanvas.height,
    )

    if (page > 0) pdf.addPage()
    const renderedHeight = (sourceHeight / canvas.width) * printableWidth
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.98),
      "JPEG",
      margin,
      margin,
      printableWidth,
      renderedHeight,
      undefined,
      "FAST",
    )

    sourceY += sourceHeight
    page += 1
  }

  return pdf.output("blob")
}

/**
 * Rasterises an EbmInvoice into an A4 PDF blob.
 * Returns `null` on failure.
 */
export async function invoiceToPdfBlob(
  invoice: EbmInvoice | null | undefined,
): Promise<Blob | null> {
  if (!invoice) return null

  const stage = document.createElement("div")
  let root: ReturnType<typeof createRoot> | null = null

  try {
    // Keep the stage in normal renderable layout, but never show it in the app.
    // html2canvas reveals its clone in `captureInvoiceAsPdf` above.
    stage.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "width:860px",
      "min-height:100px",
      "background:#ffffff",
      "z-index:-1",
      "pointer-events:none",
      "visibility:hidden",
      "font-family:Arial,Helvetica,sans-serif",
      "overflow:visible",
      "-webkit-print-color-adjust:exact",
      "print-color-adjust:exact",
    ].join(";")
    stage.dataset.invoiceExportStage = "true"
    document.body.appendChild(stage)

    root = createRoot(stage)
    root.render(createElement(InvoicePreview, { data: invoice }))

    // React commit + browser paint (2 frames)
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    // Font loading
    try { await document.fonts.ready } catch { /* ok */ }

    // Image loading (rra.png, company logo, QR image if present)
    await waitForImages(stage)

    // Canvas loading (client-side QR code drawn by qrcode lib)
    await waitForCanvases(stage)

    // Extra buffer for async QR/SVG layout before the canvas is captured.
    await sleep(200)

    const blob = await captureInvoiceAsPdf(stage)

    if (!(blob instanceof Blob) || blob.size < 3000) {
      console.error("Invoice PDF blob is too small or invalid, size =", blob?.size)
      return null
    }

    return blob
  } catch (err) {
    console.error("invoiceToPdfBlob failed:", err)
    return null
  } finally {
    try { root?.unmount() } catch { /* ok */ }
    await sleep(80)
    try { stage.remove() } catch { /* ok */ }
  }
}

/** Triggers a browser download of the invoice as a PDF. */
export async function downloadInvoicePdf(
  invoice: EbmInvoice | null | undefined,
  filename: string,
): Promise<boolean> {
  const blob = await invoiceToPdfBlob(invoice)
  if (!blob) return false

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return true
}

/**
 * Shares the exact same PDF that is downloaded/printed. On browsers without
 * file sharing support (notably desktop Firefox), it falls back to a download
 * and returns `false` so callers can explain what happened if needed.
 */
export async function shareInvoicePdf(
  invoice: EbmInvoice | null | undefined,
  filename: string,
): Promise<boolean> {
  const blob = await invoiceToPdfBlob(invoice)
  if (!blob) return false

  const file = new File([blob], filename, { type: "application/pdf" })
  const shareData: ShareData = {
    title: filename.replace(/\.pdf$/i, ""),
    files: [file],
  }

  if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(shareData))) {
    await navigator.share(shareData)
    return true
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
  return false
}
