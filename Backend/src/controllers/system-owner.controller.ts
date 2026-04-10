import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export const systemOwnerController = {
  async getDashboardStats(req: Request, res: Response) {
    try {
      const [
        totalOrganizations,
        activeOrganizations,
        totalUsers,
        activeSubscriptions,
        totalRevenue,
        pendingPayments,
      ] = await Promise.all([
        prisma.organization.count(),
        prisma.organization.count({ where: { isActive: true } }),
        prisma.user.count(),
        prisma.subscription.count({ where: { status: "ACTIVE" } }),
        prisma.payment.aggregate({
          where: { status: "COMPLETED" },
          _sum: { amount: true },
        }),
        prisma.payment.count({ where: { status: "PENDING" } }),
      ]);

      const recentOrganizations = await prisma.organization.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          userOrganizations: {
            where: { isOwner: true },
            include: { user: true },
          },
          subscriptions: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const expiringSubscriptions = await prisma.subscription.count({
        where: {
          status: "ACTIVE",
          endDate: {
            lte: sevenDaysFromNow,
            gte: new Date(),
          },
        },
      });

      res.json({
        stats: {
          totalOrganizations,
          activeOrganizations,
          inactiveOrganizations: totalOrganizations - activeOrganizations,
          totalUsers,
          activeSubscriptions,
          expiringSubscriptions,
          totalRevenue: totalRevenue._sum.amount || 0,
          pendingPayments,
        },
        recentOrganizations: recentOrganizations.map((o) => ({
          id: o.id,
          name: o.name,
          businessType: o.businessType,
          owner: o.userOrganizations[0]?.user.name || "N/A",
          ownerEmail: o.userOrganizations[0]?.user.email || "N/A",
          isActive: o.isActive,
          createdAt: o.createdAt,
          subscription: o.subscriptions[0] || null,
        })),
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  },

  async getAllOrganizations(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, search, status, businessType } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } },
        ];
      }

      if (status === "active" || status === "inactive") {
        where.isActive = status === "active";
      }

      if (businessType) {
        where.businessType = businessType;
      }

      const [organizations, total] = await Promise.all([
        prisma.organization.findMany({
          where,
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit),
          include: {
            userOrganizations: {
              where: { isOwner: true },
              include: { user: true },
            },
            subscriptions: {
              where: { status: "ACTIVE" },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            _count: {
              select: {
                products: true,
                sales: true,
                customers: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.organization.count({ where }),
      ]);

      res.json({
        organizations: organizations.map((o) => ({
          id: o.id,
          name: o.name,
          businessType: o.businessType,
          address: o.address,
          phone: o.phone,
          email: o.email,
          isActive: o.isActive,
          owner: o.userOrganizations[0]?.user || null,
          subscription: o.subscriptions[0] || null,
          stats: {
            products: o._count.products,
            sales: o._count.sales,
            customers: o._count.customers,
          },
          createdAt: o.createdAt,
        })),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  },

  async getOrganizationDetails(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);

      const organization = await prisma.organization.findUnique({
        where: { id },
        include: {
          userOrganizations: {
            include: { user: true },
          },
          subscriptions: {
            orderBy: { createdAt: "desc" },
            include: {
              payments: {
                orderBy: { createdAt: "desc" },
              },
            },
          },
          _count: {
            select: {
              products: true,
              sales: true,
              customers: true,
            },
          },
        },
      });

      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization details:", error);
      res.status(500).json({ error: "Failed to fetch organization details" });
    }
  },

  async updateOrganizationStatus(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const { isActive } = req.body;

      const organization = await prisma.organization.update({
        where: { id },
        data: { isActive },
      });

      res.json({ message: "Organization status updated", organization });
    } catch (error) {
      console.error("Error updating organization status:", error);
      res.status(500).json({ error: "Failed to update organization status" });
    }
  },

  async getAllPharmacies(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, search, status } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } },
        ];
      }

      if (status === "active" || status === "inactive") {
        where.isActive = status === "active";
      }

      const [organizations, total] = await Promise.all([
        prisma.organization.findMany({
          where,
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit),
          include: {
            userOrganizations: {
              where: { isOwner: true },
              include: { user: true },
            },
            subscriptions: {
              where: { status: "ACTIVE" },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            _count: {
              select: {
                products: true,
                sales: true,
                customers: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.organization.count({ where }),
      ]);

      res.json({
        pharmacies: organizations.map((p) => ({
          id: p.id,
          name: p.name,
          address: p.address,
          phone: p.phone,
          email: p.email,
          isActive: p.isActive,
          owner: p.userOrganizations[0]?.user || null,
          subscription: p.subscriptions[0] || null,
          stats: {
            products: p._count.products,
            sales: p._count.sales,
            customers: p._count.customers,
          },
          createdAt: p.createdAt,
        })),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching pharmacies:", error);
      res.status(500).json({ error: "Failed to fetch pharmacies" });
    }
  },

  async getAllOrganizationDetails(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);

      const organization = await prisma.organization.findUnique({
        where: { id },
        include: {
          userOrganizations: {
            include: { user: true },
          },
          subscriptions: {
            orderBy: { createdAt: "desc" },
            include: {
              payments: {
                orderBy: { createdAt: "desc" },
              },
            },
          },
          _count: {
            select: {
              products: true,
              sales: true,
              customers: true,
            },
          },
        },
      });

      if (!organization) {
        return res.status(404).json({ error: "organization not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization details:", error);
      res.status(500).json({ error: "Failed to fetch organization details" });
    }
  },

  async updateorganizationStatus(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const { isActive } = req.body;

      const organization = await prisma.organization.update({
        where: { id },
        data: { isActive },
      });

      res.json({ message: "organization status updated", organization });
    } catch (error) {
      console.error("Error updating organization status:", error);
      res.status(500).json({ error: "Failed to update organization status" });
    }
  },

  async getAllSubscriptions(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, status } = req.query;

      const where: any = {};
      if (status) {
        where.status = status;
      }

      const [subscriptions, total] = await Promise.all([
        prisma.subscription.findMany({
          where,
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit),
          include: {
            organization: {
              include: {
                userOrganizations: {
                  where: { isOwner: true },
                  include: { user: true },
                },
              },
            },
            payments: {
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.subscription.count({ where }),
      ]);

      res.json({
        subscriptions,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  },

  async getExpiringSubscriptions(req: Request, res: Response) {
    try {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const subscriptions = await prisma.subscription.findMany({
        where: {
          status: "ACTIVE",
          endDate: {
            lte: sevenDaysFromNow,
            gte: new Date(),
          },
        },
        include: {
          organization: {
            include: {
              userOrganizations: {
                where: { isOwner: true },
                include: { user: true },
              },
            },
          },
        },
        orderBy: { endDate: "asc" },
      });

      res.json(subscriptions);
    } catch (error) {
      console.error("Error fetching expiring subscriptions:", error);
      res.status(500).json({ error: "Failed to fetch expiring subscriptions" });
    }
  },

  async getAllPayments(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, status } = req.query;

      const where: any = {};
      if (status) {
        where.status = status;
      }

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit),
          include: {
            subscription: {
              include: {
                organization: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.payment.count({ where }),
      ]);

      res.json({
        payments,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  },

  async getPendingPayments(req: Request, res: Response) {
    try {
      const payments = await prisma.payment.findMany({
        where: { status: "PENDING" },
        include: {
          subscription: {
            include: {
              organization: {
                include: {
                  userOrganizations: {
                    where: { isOwner: true },
                    include: { user: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(payments);
    } catch (error) {
      console.error("Error fetching pending payments:", error);
      res.status(500).json({ error: "Failed to fetch pending payments" });
    }
  },

  async getRevenueAnalytics(req: Request, res: Response) {
    try {
      const { period = "monthly" } = req.query;

      let dateFormat: string;

      switch (period) {
        case "daily":
          dateFormat = "%Y-%m-%d";
          break;
        case "monthly":
          dateFormat = "%Y-%m";
          break;
        case "yearly":
          dateFormat = "%Y";
          break;
        default:
          dateFormat = "%Y-%m";
      }

      const revenue = await prisma.$queryRaw`
        SELECT 
          TO_CHAR("paidAt", ${dateFormat}) as period,
          SUM(amount) as total,
          COUNT(*) as count
        FROM payments
        WHERE status = 'COMPLETED'
        GROUP BY period
        ORDER BY period DESC
        LIMIT 12
      `;

      const totalRevenue = await prisma.payment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
      });

      res.json({
        revenue,
        totalRevenue: totalRevenue._sum.amount || 0,
      });
    } catch (error) {
      console.error("Error fetching revenue analytics:", error);
      res.status(500).json({ error: "Failed to fetch revenue analytics" });
    }
  },

  async getGrowthAnalytics(req: Request, res: Response) {
    try {
      const organizationGrowth = await prisma.$queryRaw`
        SELECT 
          TO_CHAR("createdAt", '%Y-%m') as month,
          COUNT(*) as count
        FROM organizations
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `;

      const userGrowth = await prisma.$queryRaw`
        SELECT 
          TO_CHAR("createdAt", '%Y-%m') as month,
          COUNT(*) as count
        FROM users
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `;

      res.json({
        organizationGrowth,
        userGrowth,
      });
    } catch (error) {
      console.error("Error fetching growth analytics:", error);
      res.status(500).json({ error: "Failed to fetch growth analytics" });
    }
  },
};
