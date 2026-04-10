"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const subscriptionPlans = [
    // Free Trial Plan
    {
        title: 'Free Trial',
        description: '14-day free trial with full access to all features',
        price: 0,
        period: 'MONTHLY',
        isActive: true,
        maxUsers: 5,
        features: [
            'Inventory Management',
            'Sales Tracking',
            'Basic Reports'
        ]
    },
    {
        title: 'Simple Starter',
        description: 'Simple Starter plan',
        price: 50000,
        period: 'MONTHLY',
        features: [
            'Inventory Management',
            'Sells & POS',
            '24/7 support',
            'Purchase order',
            '2 user account'
        ]
    },
    {
        title: 'Essential',
        description: 'Essential plan',
        price: 100000,
        period: 'MONTHLY',
        features: [
            'Inventory Management',
            'Sells & POS',
            '24/7 support',
            'Purchase order',
            '5 user account',
            'Quarterly visit',
            'Tax declaration service'
        ]
    },
    {
        title: 'Professional',
        description: 'Professional plan',
        price: 300000,
        period: 'MONTHLY',
        popular: true,
        features: [
            'Inventory Management',
            'Sells & POS',
            '24/7 support',
            'Purchase order',
            '10 user account',
            'Monthly visit',
            'Tax declaration service',
            'Payroll management'
        ]
    },
    {
        title: 'Advanced',
        description: 'Advanced plan',
        price: 500000,
        period: 'MONTHLY',
        features: [
            'Inventory Management',
            'Sells & POS',
            '24/7 support',
            'Purchase order',
            'Unlimited user account',
            '2 visit a month',
            'Tax declaration service',
            'Payroll management',
            'Accounting service',
            'Compliance advisory',
            'Quick book Async'
        ]
    }
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