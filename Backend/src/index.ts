import dotenv from "dotenv";
dotenv.config();

// Critical Security Check
if (!process.env.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in environment variables.");
  process.exit(1);
}

import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import cors from "cors";
import bodyParser from "body-parser";
import { initSocket } from "./utils/socket";
import authRoutes from "./routes/auth.routes";
import organizationRoutes from "./routes/organization.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import salesRoutes from "./routes/sales.routes";
import inventoryRoutes from "./routes/inventory.routes";
import customerRoutes from "./routes/customer.routes";
import userRoutes from "./routes/user.routes";
import reportRoutes from "./routes/report.routes";
import systemOwnerRoutes from "./routes/system-owner.routes";
import subscriptionRoutes from "./routes/subscription.routes";
import supplierRoutes from "./routes/supplier.routes";
import purchaseOrderRoutes from "./routes/purchaseOrder.routes";
import activityLogRoutes from "./routes/activity-log.routes";
import notificationRoutes from "./routes/notification.routes";
import debtPaymentRoutes from "./routes/debtPayment.routes";
import batchRoutes from "./routes/batch.routes";
import branchRoutes from "./routes/branch.routes";
import expenseRoutes from "./routes/expense.routes";
import supplierPaymentRoutes from "./routes/supplier-payment.routes";
import stockTransferRoutes from "./routes/stock-transfer.routes";

import { errorHandler } from "./middleware/error.middleware";
import webhookRoutes from "./routes/paypack-webhook.routes";
import {
  subscriptionReminderJob,
  expireSubscriptionsJob,
} from "./jobs/subscription.job";

import {
  productExpiryAlertJob,
  dailyReportJob,
} from "./jobs/product-expiry.job";
import { ebmQueueJob } from "./jobs/ebm-queue.job";
import pesapalRoutes from "./routes/pesapal.route";
import uploadRoutes from "./routes/upload.route";

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

/* ----------------------------------
   🔐 FIXED CORS CONFIG
------------------------------------- */

const corsOptions: any = {
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-branch-scope", "x-branch-ids"],
};

// CORS middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));


/* ----------------------------------
   🔄 WEBHOOKS FIRST — RAW BODY
------------------------------------- */
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

/* ----------------------------------
   🔌 SOCKET.IO INITIALIZATION
------------------------------------- */

initSocket(httpServer);

/* ----------------------------------
   📌 API ROUTES
------------------------------------- */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: "Too many login attempts from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/auth/verify-email", authLimiter);
app.use("/api/auth/resend-verification", authLimiter);
app.use("/api/auth/request-password-reset", authLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/users", userRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/system-owner", systemOwnerRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/debt-payments", debtPaymentRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/pesapal", pesapalRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/supplier-payments", supplierPaymentRoutes);
app.use("/api/stock-transfers", stockTransferRoutes);

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

/* ----------------------------------
   🏥 HEALTH CHECK
------------------------------------- */

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Business Management API is running" })
})

app.use(errorHandler);

/* ----------------------------------
   ⏰ CRON JOBS — prevent running twice
------------------------------------- */

if (process.env.RUN_JOBS !== "false") {
  subscriptionReminderJob.start();
  expireSubscriptionsJob.start();
  productExpiryAlertJob.start();
  dailyReportJob.start();
  ebmQueueJob.start();
}


/* ----------------------------------
   🚀 START SERVER
------------------------------------- */

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
