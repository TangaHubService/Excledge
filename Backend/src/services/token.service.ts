import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_ACCESS_EXPIRY = '15m';  // Access token expires in 15 minutes
const JWT_REFRESH_EXPIRY = '7d';  // Refresh token expires in 7 days

export interface TokenPayload {
  userId: number;
  email: string;
  role?: string;
  /** Active tenant for RBAC; use with UserOrganization.role semantics */
  activeOrganizationId?: number;
  /** All organizations the user belongs to */
  organizationIds?: number[];
  /** @deprecated Prefer activeOrganizationId; kept for older clients */
  organizationId?: number | number[];
  /** Active / selected branch for the current organization scope */
  activeBranchId?: number | null;
  /** All branch IDs the user is assigned to within the active organization */
  branchIds?: number[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Generate a pair of access and refresh tokens */
export function generateTokenPair(payload: TokenPayload): TokenPair {
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRY,
  });

  const refreshToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRY,
  });

  return { accessToken, refreshToken };
}

/** Generate only a new access token from a valid refresh token */
export function generateAccessToken(
  refreshToken: string,
  newPayload: TokenPayload
): string {
  try {
    // Verify the refresh token is still valid
    jwt.verify(refreshToken, JWT_SECRET);
    
    // Generate a new access token with updated payload
    const accessToken = jwt.sign(newPayload, JWT_SECRET, {
      expiresIn: JWT_ACCESS_EXPIRY,
    });

    return accessToken;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}

/** Verify and decode any JWT token */
export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/** Calculate the expiry date for refresh token storage */
export function getRefreshTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);
  return expiry;
}

/** Calculate the expiry date for access token storage (for DB record) */
export function getAccessTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 15);
  return expiry;
}
