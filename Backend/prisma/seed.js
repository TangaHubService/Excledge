"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const baseFeatures = [
    'Inventory Management',
    'Sales & POS',
    'Purchase order',
    '24/7 support',
];
const subscriptionPlans = [
    {
        title: 'Simple Starter',
        price: 15000,
        period: 'MONTHLY',
        isActive: true,
        popular: true,
        description: 'More power for growing teams — daily backups, priority features, and room to scale.',
        features: [
            '1 user account',
            ...baseFeatures,
        ],
    },
    {
        title: 'Essential',
        price: 40000,
        period: 'MONTHLY',
        isActive: true,
        description: 'Everything you need to get started with inventory, sales, and reporting.',
        features: [
            '4 user accounts',
            ...baseFeatures,
            'Tax declaration service',
            'Quarterly visit',
        ],
    },
    {
        title: 'Professional',
        price: 100000,
        period: 'MONTHLY',
        isActive: true,
        description: 'Everything you need to get started with inventory, sales, and reporting.',
        features: [
            '10 user accounts',
            ...baseFeatures,
            'Payroll management',
            'Tax declaration service',
            'Monthly visit',
        ],
    },
    {
        title: 'Advanced',
        price: 500000,
        period: 'MONTHLY',
        isActive: true,
        description: 'Everything you need to get started with inventory, sales, and reporting.',
        features: [
            'Unlimited user accounts',
            ...baseFeatures,
            'Payroll management',
            'Tax declaration service',
            'QuickBooks Async',
            'Accounting service',
            'Compliance advisory',
            '2 visits a month',
        ],
    },
];
// Helper to extract number of users from feature string
function extractMaxUsers(features) {
    const userFeature = features.find(f => /user account/i.test(f));
    if (!userFeature)
        return 0;
    if (/unlimited/i.test(userFeature))
        return 0; // 0 means unlimited
    const match = userFeature.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
}
async function main() {
    console.log('Starting database seeding...');
    // First, collect all unique features from all plans
    const allFeatures = new Set();
    subscriptionPlans.forEach(plan => {
        plan.features.forEach(feature => allFeatures.add(feature));
    });
    // Create or update features
    const featureMap = {};
    for (const featureName of allFeatures) {
        const feature = await prisma.feature.upsert({
            where: { key: featureName.toLowerCase().replace(/\s+/g, '_') },
            update: {},
            create: {
                name: featureName,
                key: featureName.toLowerCase().replace(/\s+/g, '_'),
                description: featureName
            },
        });
        featureMap[featureName] = feature;
    }
    // Then, create/update subscription plans with their features
    for (const plan of subscriptionPlans) {
        const dbPlan = await prisma.subscriptionPlan.upsert({
            where: { name: plan.title },
            update: {
                description: plan.description,
                price: plan.price,
                currency: 'RWF',
                billingCycle: plan.period,
                isActive: plan.isActive,
                maxUsers: extractMaxUsers(plan.features),
            },
            create: {
                name: plan.title,
                description: plan.description,
                price: plan.price,
                currency: 'RWF',
                billingCycle: plan.period,
                isActive: plan.isActive,
                maxUsers: extractMaxUsers(plan.features),
            },
        });
        // Re-sync features in array order on every run (create AND update), since
        // upsert's update branch doesn't touch relations and row order otherwise
        // reflects whenever the plan was first seeded rather than the array above.
        await prisma.planFeature.deleteMany({ where: { planId: dbPlan.id } });
        for (const featureName of plan.features) {
            await prisma.planFeature.create({
                data: {
                    planId: dbPlan.id,
                    featureId: featureMap[featureName].id,
                },
            });
        }
        console.log(`Processed plan: ${plan.title} `);
    }
    console.log('✅ Database seeding completed successfully');
}
main()
    .catch((e) => {
    console.error('❌ Error during database seeding:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map