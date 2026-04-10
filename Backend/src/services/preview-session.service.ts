import { randomUUID } from "crypto"

export interface PreviewSession {
  id: string
  organizationId: number
  entityType: "customer" | "supplier"
  validRows: any[]
  invalidRows: any[]
  summary: {
    total: number
    valid: number
    invalid: number
  }
  createdAt: Date
  expiresAt: Date
}

// In-memory storage for preview sessions
// In production, consider using Redis for distributed systems
const previewSessions = new Map<string, PreviewSession>()

// Clean up expired sessions every hour
setInterval(() => {
  const now = new Date()
  for (const [id, session] of previewSessions.entries()) {
    if (session.expiresAt < now) {
      previewSessions.delete(id)
    }
  }
}, 60 * 60 * 1000) // 1 hour

/**
 * Create a new preview session
 */
export function createPreviewSession(
  organizationId: number,
  entityType: "customer" | "supplier",
  validRows: any[],
  invalidRows: any[]
): string {
  const sessionId = randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour from now

  const session: PreviewSession = {
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
  }

  previewSessions.set(sessionId, session)
  return sessionId
}

/**
 * Get a preview session by ID
 */
export function getPreviewSession(sessionId: string): PreviewSession | null {
  const session = previewSessions.get(sessionId)
  
  if (!session) {
    return null
  }

  // Check if expired
  if (session.expiresAt < new Date()) {
    previewSessions.delete(sessionId)
    return null
  }

  return session
}

/**
 * Delete a preview session
 */
export function deletePreviewSession(sessionId: string): boolean {
  return previewSessions.delete(sessionId)
}
