import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

export function PaymentModal({
  open,
  total,
  paymentMethod,
  onPaymentMethodChange,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  total: number;
  paymentMethod: "CASH" | "MOBILE_MONEY";
  onPaymentMethodChange: (method: "CASH" | "MOBILE_MONEY") => void;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Modal open={open} title="Confirm payment" onClose={onClose}>
      <p>Amount: RWF {total.toLocaleString()}</p>
      <select value={paymentMethod} onChange={(e) => onPaymentMethodChange(e.target.value as "CASH" | "MOBILE_MONEY")}>
        <option value="CASH">Cash</option>
        <option value="MOBILE_MONEY">Mobile Money</option>
      </select>
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={loading} onClick={onConfirm}>Confirm payment</Button>
      </div>
    </Modal>
  );
}
