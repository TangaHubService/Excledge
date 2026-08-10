import { useEffect, useRef } from "react"
import { QrCode } from "lucide-react"
import type { EbmInvoice } from "../../../lib/invoice"
import { dashEvery4, formatDateShort, formatTime, safeText } from "./format"
import { C } from "./theme"

type EbmSectionProps = Pick<EbmInvoice, "sdcInformation" | "verification" | "invoice" | "branding">

function QrCanvas({ payload }: { payload: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!payload || !canvasRef.current) return
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toCanvas(canvasRef.current!, payload, {
        width: 100,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      }).catch(console.error)
    })
  }, [payload])

  return <canvas ref={canvasRef} style={{ width: 100, height: 100, display: "block" }} />
}

/** Official verification data. It is shown only after fiscalisation returns real SDC data. */
export function EBMSection({ data }: { data: EbmSectionProps }) {
  const sdc = data.sdcInformation
  const qrImage = data.verification?.qrCodeImage
  const qrPayload = data.verification?.qrPayload
  const signature = safeText(sdc?.receiptSignature)
  const internalData = safeText(sdc?.internalData)
  const hasSdc = Boolean(qrImage || qrPayload || (sdc?.receiptNumber && sdc?.internalData && sdc?.receiptSignature))

  if (!hasSdc) return null

  const leftRows = [
    { label: "SDC ID", value: safeText(sdc?.sdcId) },
    { label: "RECEIPT NUMBER", value: safeText(sdc?.receiptNumber ?? data.invoice?.receiptNumber) },
    { label: "MRC", value: safeText(sdc?.mrcNo) },
    { label: "INTERNAL DATA", value: internalData === "—" ? "—" : dashEvery4(internalData) },
  ]
  const rightRows = [
    { label: "RECEIPT SIGNATURE", value: signature === "—" ? "—" : dashEvery4(signature) },
    { label: "DATE", value: formatDateShort(sdc?.date ?? data.invoice?.invoiceDate) },
    { label: "TIME", value: formatTime(sdc?.time ?? data.invoice?.time) },
  ]

  const labelStyle: React.CSSProperties = { width: 116, padding: "0 4px 6px 0", color: C.ink, fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", verticalAlign: "top", whiteSpace: "nowrap" }
  const colonStyle: React.CSSProperties = { width: 12, padding: "0 4px 6px 0", color: C.body, fontSize: 9.5, fontWeight: 700, textAlign: "center", verticalAlign: "top" }
  const valueStyle: React.CSSProperties = { paddingBottom: 6, color: C.body, fontSize: 9.5, fontWeight: 500, lineHeight: 1.25, verticalAlign: "top", overflowWrap: "anywhere" }

  const renderRows = (rows: typeof leftRows) => rows.map((row) => (
    <tr key={row.label}>
      <td style={labelStyle}>{row.label}</td>
      <td style={colonStyle}>:</td>
      <td style={valueStyle}>{row.value}</td>
    </tr>
  ))

  return (
    <section style={{ display: "flex", marginTop: 10, border: `1.5px solid ${C.green}`, borderRadius: 8, overflow: "hidden", background: "#FFFFFF" }}>
      <div style={{ width: 194, minWidth: 194, padding: "9px 12px", borderRight: `1px solid ${C.borderStrong}`, textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ color: C.green, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase" }}>Verify Invoice</div>
        <div style={{ width: 110, height: 110, margin: "6px auto 0", border: `1px solid ${C.green}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#FFFFFF" }}>
          {qrImage ? (
            <img src={qrImage} alt="Invoice QR verification code" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : qrPayload ? <QrCanvas payload={qrPayload} /> : (
            <QrCode style={{ width: 28, height: 28, color: C.faint }} />
          )}
        </div>
        <p style={{ margin: "5px 0 0", color: C.body, fontSize: 8.5, lineHeight: 1.28 }}>
          Scan the QR code using RRA EBMVerify app to verify the authenticity of this invoice.
        </p>
      </div>

      <div style={{ flex: 1, minWidth: 0, padding: "9px 16px 8px" }}>
        <div style={{ color: C.green, fontSize: 10.5, fontWeight: 900, letterSpacing: 0.6, textAlign: "center", textTransform: "uppercase" }}>SDC Information</div>
        <div style={{ display: "flex", gap: 22, marginTop: 9 }}>
          <table style={{ width: "56%", borderCollapse: "collapse", tableLayout: "fixed" }}><tbody>{renderRows(leftRows)}</tbody></table>
          <table style={{ flex: 1, borderCollapse: "collapse", tableLayout: "fixed" }}><tbody>{renderRows(rightRows)}</tbody></table>
        </div>
        <div style={{ marginTop: 1, color: C.body, fontSize: 10, textAlign: "center" }}>
          Powered by <span style={{ color: C.navy, fontWeight: 900, letterSpacing: 0.3, textTransform: "uppercase" }}>{safeText(data.branding?.poweredBy)}</span>
        </div>
      </div>
    </section>
  )
}
