import cron from "node-cron"
import { prisma } from "../lib/prisma"
import { emailService } from "../services/email.service"

export const subscriptionReminderJob = cron.schedule("0 9 * * *", async () => {
  console.log("Running subscription reminder job...")

  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

  const threeDaysFromNow = new Date()
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)

  const expiringSubscriptions = await prisma.subscription.findMany({
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
  })

  for (const subscription of expiringSubscriptions) {
    const daysLeft = Math.ceil((subscription.endDate!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))

    const owner = subscription.organization.userOrganizations[0]?.user
    if (owner) {
      await emailService.sendSubscriptionReminder(owner.email, subscription.organization.name, daysLeft)
    }
  }

  console.log(`Sent ${expiringSubscriptions.length} subscription reminders`)
})

export const expireSubscriptionsJob = cron.schedule("0 22 * * *", async () => {
  console.log("Running subscription expiry job...")

  const expiredSubscriptions = await prisma.subscription.updateMany({
    where: {
      status: "ACTIVE",
      endDate: {
        lt: new Date(),
      },
    },
    data: {
      status: "EXPIRED",
    },
  })

  const expiredOrganizations = await prisma.subscription.findMany({
    where: {
      status: "EXPIRED",
    },
    select: {
      organizationId: true,
    },
  })

  await prisma.organization.updateMany({
    where: {
      id: {
        in: expiredOrganizations.map((s) => s.organizationId),
      },
    },
    data: {
      isActive: false,
    },
  })

  console.log(`Expired ${expiredSubscriptions.count} subscriptions`)
})
