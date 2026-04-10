import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { emailService } from "../services/email.service";

export const productExpiryAlertJob = cron.schedule("0 8 * * *", async () => {
  console.log("Running product expiry alert job...");

  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const organizations = await prisma.organization.findMany({
    where: { isActive: true },
    include: {
      userOrganizations: {
        where: {
          OR: [{ role: "ADMIN" }, { role: "ACCOUNTANT" }, { role: "SELLER" }],
        },
        include: { user: true },
      },
    },
  });

  let totalAlertsSent = 0;

  for (const organization of organizations) {
    const expiringProducts = await prisma.product.findMany({
      where: {
        organizationId: organization.id,
        expiryDate: {
          not: null,
          lte: thirtyDaysFromNow,
        },
      },
      orderBy: {
        expiryDate: "asc",
      },
    });

    if (expiringProducts.length > 0) {
      const productsWithDays = expiringProducts.map((product) => {
        const daysRemaining = Math.ceil(
          (product.expiryDate!.getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24)
        );
        return {
          ...product,
          daysRemaining,
        };
      });

      // Send email to all admins and managers
      for (const userOrg of organization.userOrganizations) {
        try {
          await emailService.sendExpiryAlert(
            userOrg.user.email,
            organization.name,
            productsWithDays
          );
          totalAlertsSent++;
        } catch (error) {
          console.error(
            `Failed to send expiry alert to ${userOrg.user.email}:`,
            error
          );
        }
      }
    }
  }

  console.log(`Sent ${totalAlertsSent} product expiry alerts`);
});

export const dailyReportJob = cron.schedule("0 22 * * *", async () => {
  console.log("Running daily report job...");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const organizations = await prisma.organization.findMany({
    where: {
      isActive: true,
      subscriptions: {
        some: {
          status: { in: ['ACTIVE', 'TRIALING'] },
          endDate: { gte: new Date() }
        }
      }
    },
    include: {
      userOrganizations: {
        where: {
          role: "ADMIN",
        },
        include: { user: true },
      },
    },
  });

  let totalReportsSent = 0;

  for (const organization of organizations) {
    // Find the owner (first admin typically, or we can look for specific role if available)
    const owner = organization.userOrganizations[0]?.user;
    if (!owner) continue;

    // Get today's sales
    const sales = await prisma.sale.findMany({
      where: {
        organizationId: organization.id,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    const totalSales = sales.reduce(
      (sum, sale) => sum + Number(sale.totalAmount),
      0
    );
    const cashSales = sales.reduce(
      (sum, sale) => sum + Number(sale.cashAmount),
      0
    );
    const insuranceSales = sales.reduce(
      (sum, sale) => sum + Number(sale.insuranceAmount),
      0
    );

    const lowStockProducts = await prisma.product.count({
      where: {
        organizationId: organization.id,
        quantity: {
          lte: 10,
        },
      },
    });

    const expiringSoonProducts = await prisma.product.count({
      where: {
        organizationId: organization.id,
        expiryDate: {
          not: null,
          gte: new Date(),
          lte: thirtyDaysFromNow,
        },
      },
    });

    const expiredProducts = await prisma.product.count({
      where: {
        organizationId: organization.id,
        expiryDate: {
          not: null,
          lt: new Date(),
        },
      },
    });

    // Get customer debts
    const customers = await prisma.customer.findMany({
      where: {
        organizationId: organization.id,
        balance: {
          gt: 0,
        },
      },
    });

    const totalDebt = customers.reduce(
      (sum, customer) => sum + Number(customer.balance),
      0
    );

    const reportData = {
      totalSales,
      transactionCount: sales.length,
      cashSales,
      insuranceSales,
      lowStockCount: lowStockProducts,
      expiringSoonCount: expiringSoonProducts,
      expiredCount: expiredProducts,
      totalDebt,
      debtorCount: customers.length,
    };

    try {
      await emailService.sendDailyReport(
        owner.email,
        organization.name,
        reportData
      );
      totalReportsSent++;
    } catch (error) {
      console.error(
        `Failed to send daily report to ${owner.email}:`,
        error
      );
    }
  }

  console.log(`Sent ${totalReportsSent} daily reports`);
});
