export const success = (data: any, message?: string) => ({
    success: true,
    data,
    message,
});

export const error = (message: string, code?: string, details?: any) => ({
    success: false,
    error: message,
    code,
    details,
});

/**
 * The error's message when it is meant for users (business rules like "Insufficient stock");
 * the fallback when it is a database or runtime internal that would only confuse them.
 */
export const publicMessage = (err: any, fallback: string): string => {
    const msg = typeof err?.message === 'string' ? err.message.trim() : '';
    if (!msg) return fallback;
    if (String(err?.name ?? '').startsWith('PrismaClient')) return fallback;
    if (/prisma|invocation|constraint|Cannot read propert|is not a function|is not defined|undefined|ECONN|ETIMEDOUT|\n/i.test(msg)) return fallback;
    return msg;
};
