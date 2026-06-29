"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const upload_controller_1 = require("../controllers/upload.controller");
const router = (0, express_1.Router)();
// Image upload endpoint
router.post('/image', upload_controller_1.upload.single('image'), upload_controller_1.uploadImage);
exports.default = router;
