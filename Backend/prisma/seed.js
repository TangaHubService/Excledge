"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const subscriptionPlans = [
    {
        title: 'Simple Starter',
        description: 'More power for growing teams — daily backups, priority features, and room to scale.',
        price: 15000,
        period: 'MONTHLY',
        popular: true,
        features: [
            '1 user account',
            'Inventory Management',
            'Sales & POS',
            'Purchase order',
            '24/7 support'
        ],
    },
    {
        title: 'Essential',
        description: 'Everything you need to get started with inventory, sales, and reporting.',
        price: 40000,
        period: 'MONTHLY',
        features: [
            '4 user accounts',
            'Inventory Management',
            'Sales & POS',
            'Purchase order',
            'Tax declaration service',
            'Quarterly visit',
            '24/7 support'
        ],
    },
    {
        title: 'Professional',
        description: 'Everything you need to get started with inventory, sales, and reporting.',
        price: 100000,
        period: 'MONTHLY',
        features: [
            '10 user accounts',
            'Inventory Management',
            'Sales & POS',
            'Purchase order',
            'Payroll management',
            'Tax declaration service',
            'Monthly visit',
            '24/7 support'
        ],
    },
    {
        title: 'Advanced',
        description: 'Everything you need to get started with inventory, sales, and reporting.',
        price: 500000,
        period: 'MONTHLY',
        features: [
            'Unlimited user accounts',
            'Inventory Management',
            'Sales & POS',
            'Purchase order',
            'Payroll management',
            'QuickBooks Async',
            'Accounting service',
            'Tax declaration service',
            'Compliance advisory',
            '2 visits a month',
            '24/7 support'
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
        await prisma.subscriptionPlan.upsert({
            where: { name: plan.title },
            update: {
                description: plan.description,
                price: plan.price,
                currency: 'RWF',
                billingCycle: plan.period,
                isActive: plan.isActive !== undefined ? plan.isActive : true,
                maxUsers: plan.maxUsers !== undefined ? plan.maxUsers : extractMaxUsers(plan.features)
            },
            create: {
                name: plan.title,
                description: plan.description,
                price: plan.price,
                currency: 'RWF',
                billingCycle: plan.period,
                isActive: plan.isActive !== undefined ? plan.isActive : true,
                maxUsers: plan.maxUsers !== undefined ? plan.maxUsers : extractMaxUsers(plan.features),
                features: {
                    create: plan.features.map(featureName => ({
                        feature: { connect: { key: featureMap[featureName].key } },
                    })),
                },
            },
        });
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