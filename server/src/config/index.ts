import dotenv from "dotenv"

dotenv.config()

export const config = {
  appName: process.env.APP_NAME || "Exceldge-ERP",
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET as string,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  dpo: {
    companyToken: process.env.DPO_COMPANY_TOKEN || "",
    serviceType: process.env.DPO_SERVICE_TYPE || "",
    apiUrl: process.env.DPO_API_URL || "https://secure.3gdirectpay.com",
  },
  email: {
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number.parseInt(process.env.EMAIL_PORT || "587"),
    user: process.env.EMAIL_USER || "",
    password: process.env.EMAIL_PASSWORD || "",
    from: process.env.EMAIL_FROM || "noreply@exceldge-erp.com",
  },
  subscription: {
    monthly: Number.parseFloat(process.env.MONTHLY_PRICE || "29.99"),
    quarterly: Number.parseFloat(process.env.QUARTERLY_PRICE || "79.99"),
    yearly: Number.parseFloat(process.env.YEARLY_PRICE || "299.99"),
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
  ebm: {
    enabled: process.env.ENABLE_EBM === "true" || false,
    apiUrl: process.env.EBM_API_URL || "",
    apiKey: process.env.EBM_API_KEY || "",
    apiSecret: process.env.EBM_API_SECRET || "",
    environment: process.env.EBM_ENVIRONMENT || "sandbox", // sandbox | production
  },
}
