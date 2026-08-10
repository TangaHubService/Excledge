import { FileText, Mail, MapPin, Phone } from "lucide-react"
import type { EbmInvoice } from "../../../lib/invoice"
import { safeText } from "./format"
import { FlagBar } from "./Branding"
import { C } from "./theme"

type HeaderData = Pick<EbmInvoice, "company">

/**
 * Top invoice masthead. The RRA artwork is deliberately limited to the supplied
 * mark on the left; the right-side certification area stays empty until a real
 * RRA EBM certificate is issued.
 */
export function InvoiceHeader({ data }: { data: HeaderData }) {
  const company = data.company
  const companyName = safeText(company?.name)
  const contactLines = [
    { Icon: MapPin, value: safeText(company?.address) },
    { Icon: Phone, value: safeText(company?.phone) },
    { Icon: Mail, value: safeText(company?.email) },
    { Icon: FileText, value: company?.tin ? `TIN: ${company.tin}` : "—" },
  ].filter((line) => line.value !== "—")

  return (
    <header style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "stretch", minHeight: 156 }}>
        <div style={{ width: 166, minWidth: 166, borderRight: `1px solid ${C.muted}`, padding: "2px 18px 0 0", boxSizing: "border-box", textAlign: "center" }}>
          <img
            src="/rra.png"
            alt="Rwanda Revenue Authority"
            style={{ display: "block", width: 118, height: 114, margin: "0 auto", objectFit: "contain" }}
          />
          <div style={{ color: C.navy, fontSize: 9.5, fontWeight: 900, lineHeight: 1.25, textTransform: "uppercase", whiteSpace: "nowrap" }}>Rwanda Revenue Authority</div>
          <div style={{ color: C.navy, fontSize: 7, fontWeight: 700, lineHeight: 1.35, marginTop: 4, textTransform: "uppercase", whiteSpace: "nowrap" }}>Taxes for Growth and Development</div>
        </div>

        <div style={{ flex: 1, minWidth: 0, padding: "3px 24px 0 28px" }}>
          <h1 style={{ margin: 0, color: C.ink, fontWeight: 900, fontSize: 25, lineHeight: 1.12, letterSpacing: 0.25, textTransform: "uppercase", overflowWrap: "anywhere" }}>
            {companyName}
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 13 }}>
            {contactLines.map(({ Icon, value }) => (
              <div key={value} style={{ display: "flex", alignItems: "flex-start", gap: 10, color: C.body, fontSize: 11.5 }}>
                <Icon style={{ width: 14, height: 14, flexShrink: 0, color: C.ink, marginTop: 0 }} />
                <span style={{ lineHeight: 1.3 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reserved exclusively for a genuine RRA EBM-certified seal. */}
        <div aria-label="Reserved certification seal area" style={{ width: 126, minWidth: 126, minHeight: 130 }} />
      </div>

      <div style={{ position: "relative", borderTop: `1px solid ${C.muted}`, marginTop: 16, paddingTop: 18, textAlign: "center" }}>
        <div style={{ position: "absolute", top: -2, left: "50%", width: 174, transform: "translateX(-50%)" }}>
          <FlagBar style={{ height: 4, borderRadius: 0 }} />
        </div>
        <div style={{ color: C.navy, fontWeight: 900, fontSize: 31, letterSpacing: 0.4, lineHeight: 1, textTransform: "uppercase" }}>Invoice</div>
      </div>
    </header>
  )
}
