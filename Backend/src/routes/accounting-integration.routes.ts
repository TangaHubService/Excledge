import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";
import { enqueueInventoryOpeningSnapshot, isAccountingIntegrationEnabled } from "../services/accounting-outbox.service";

const router = Router();

router.use(authenticate);

/** Queues current stock by branch as Accounting's opening inventory (requested from the Accounting app). */
router.post(
  "/:organizationId/inventory-opening",
  requireOrganizationAccess(),
  authorize("SYSTEM_OWNER", "ADMIN", "ACCOUNTANT"),
  async (req, res) => {
    if (!isAccountingIntegrationEnabled()) {
      return res.status(409).json({ success: false, error: "Accounting integration is turned off for this Excel Edge server" });
    }
    const organizationId = Number(req.params.organizationId);
    if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
      return res.status(400).json({ success: false, error: "Invalid organization" });
    }
    try {
      const data = await enqueueInventoryOpeningSnapshot(organizationId);
      return res.status(202).json({ success: true, data });
    } catch (e) {
      return res.status(500).json({ success: false, error: (e as Error).message });
    }
  },
);

export default router;
