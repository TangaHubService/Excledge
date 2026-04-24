import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";
import { success, error as apiError } from "../utils/apiResponse";

const router = Router();

router.use(authenticate);
router.use(requireOrganizationAccess());

// Get all warehouses
router.get("/:organizationId", async (req, res) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { includeInactive } = req.query;
    
    const where: any = { organizationId };
    
    if (includeInactive !== 'true') {
      where.isActive = true;
    }

    const warehouses = await prisma.warehouse.findMany({
      where,
      orderBy: { name: 'asc' }
    });

    res.json(success(warehouses));
  } catch (e: any) {
    console.error("[getWarehouses]", e);
    res.status(500).json(apiError("Failed to get warehouses"));
  }
});

// Get single warehouse
router.get("/:organizationId/:id", async (req, res) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const id = parseInt(req.params.id);

    const warehouse = await prisma.warehouse.findFirst({
      where: { id, organizationId }
    });

    if (!warehouse) {
      return res.status(404).json(apiError("Warehouse not found"));
    }

    res.json(success(warehouse));
  } catch (e: any) {
    console.error("[getWarehouse]", e);
    res.status(500).json(apiError("Failed to get warehouse"));
  }
});

// Create warehouse
router.post("/:organizationId", async (req, res) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { name, code, address, isDefault } = req.body;

    // Check for duplicate code
    if (code) {
      const existing = await prisma.warehouse.findFirst({
        where: { organizationId, code }
      });
      if (existing) {
        return res.status(400).json(apiError("Warehouse code already exists"));
      }
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.warehouse.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        name,
        code,
        address,
        isDefault: isDefault || false,
        organizationId
      }
    });

    res.status(201).json(success(warehouse));
  } catch (e: any) {
    console.error("[createWarehouse]", e);
    res.status(500).json(apiError("Failed to create warehouse"));
  }
});

// Update warehouse
router.put("/:organizationId/:id", async (req, res) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const id = parseInt(req.params.id);
    const { name, code, address, isActive, isDefault } = req.body;

    const existing = await prisma.warehouse.findFirst({
      where: { id, organizationId }
    });

    if (!existing) {
      return res.status(404).json(apiError("Warehouse not found"));
    }

    // Check for duplicate code
    if (code && code !== existing.code) {
      const duplicate = await prisma.warehouse.findFirst({
        where: { organizationId, code, NOT: { id } }
      });
      if (duplicate) {
        return res.status(400).json(apiError("Warehouse code already exists"));
      }
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.warehouse.updateMany({
        where: { organizationId, isDefault: true, NOT: { id } },
        data: { isDefault: false }
      });
    }

    const warehouse = await prisma.warehouse.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(code && { code }),
        ...(address !== undefined && { address }),
        ...(isActive !== undefined && { isActive }),
        ...(isDefault !== undefined && { isDefault })
      }
    });

    res.json(success(warehouse));
  } catch (e: any) {
    console.error("[updateWarehouse]", e);
    res.status(500).json(apiError("Failed to update warehouse"));
  }
});

// Delete warehouse
router.delete("/:organizationId/:id", async (req, res) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const id = parseInt(req.params.id);

    const warehouse = await prisma.warehouse.findFirst({
      where: { id, organizationId }
    });

    if (!warehouse) {
      return res.status(404).json(apiError("Warehouse not found"));
    }

    // Check if warehouse has batches
    const batchCount = await prisma.batch.count({
      where: { warehouseId: id }
    });

    if (batchCount > 0) {
      return res.status(400).json(apiError("Cannot delete warehouse with batches"));
    }

    await prisma.warehouse.update({
      where: { id },
      data: { isActive: false }
    });

    res.json(success({ message: "Warehouse deleted" }));
  } catch (e: any) {
    console.error("[deleteWarehouse]", e);
    res.status(500).json(apiError("Failed to delete warehouse"));
  }
});

export default router;