"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPreviewSession = createPreviewSession;
exports.getPreviewSession = getPreviewSession;
exports.deletePreviewSession = deletePreviewSession;
const crypto_1 = require("crypto");
// In-memory storage for preview sessions
// In production, consider using Redis for distributed systems
const previewSessions = new Map();
// Clean up expired sessions every hour
setInterval(() => {
    const now = new Date();
    for (const [id, session] of previewSessions.entries()) {
        if (session.expiresAt < now) {
            previewSessions.delete(id);
        }
    }
}, 60 * 60 * 1000); // 1 hour
/**
 * Create a new preview session
 */
function createPreviewSession(organizationId, entityType, validRows, invalidRows) {
    const sessionId = (0, crypto_1.randomUUID)();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    const session = {
        id: sessionId,
        organizationId,
        entityType,
        validRows,
        invalidRows,
        summary: {
            total: validRows.length + invalidRows.length,
            valid: validRows.length,
            invalid: invalidRows.length,
        },
        createdAt: now,
        expiresAt,
    };
    previewSessions.set(sessionId, session);
    return sessionId;
}
/**
 * Get a preview session by ID
 */
function getPreviewSession(sessionId) {
    const session = previewSessions.get(sessionId);
    if (!session) {
        return null;
    }
    // Check if expired
    if (session.expiresAt < new Date()) {
        previewSessions.delete(sessionId);
        return null;
    }
    return session;
}
/**
 * Delete a preview session
 */
function deletePreviewSession(sessionId) {
    return previewSessions.delete(sessionId);
}
