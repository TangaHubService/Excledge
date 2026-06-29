"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ebm_outbox_controller_1 = require("../controllers/ebm-outbox.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/:organizationId/ebm-outbox', auth_middleware_1.authenticate, ebm_outbox_controller_1.getEbmOutbox);
router.post('/:organizationId/ebm-outbox/:id/check-status', auth_middleware_1.authenticate, ebm_outbox_controller_1.checkEbmOutboxStatus);
exports.default = router;
