// In /server/src/lib/prisma.ts
import { PrismaClient } from '@prisma/client'

// Add global prisma client to prevent multiple instances in development
declare global {
    var prisma: PrismaClient | undefined
}

const prisma = global.prisma || new PrismaClient({
    log: ['error', 'warn'],
    transactionOptions: {
        maxWait: 30000,    // Increased to 30 seconds
        timeout: 60000,    // Increased to 60 seconds
    },
})

// In development, store the Prisma client in the global object to prevent hot-reloading issues
if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma
}

export { prisma }