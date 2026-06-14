import { useMemo } from 'react';
import { useOrganization } from '../context/OrganizationContext';

export type VsdcStatus = 'healthy' | 'warning' | 'blocked';

interface VsdcStatusResult {
  status: VsdcStatus;
  hoursSinceSync: number;
  message: string | null;
}

const TWENTY_TWO_HOURS_MS = 22 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function useVsdcOnlineStatus(): VsdcStatusResult {
  const { organization } = useOrganization();

  return useMemo(() => {
    const lastContact = (organization as any)?.lastSuccessfulVdsContact
      ? new Date((organization as any).lastSuccessfulVdsContact)
      : null;

    if (!lastContact) {
      return { status: 'healthy', hoursSinceSync: 0, message: null };
    }

    const elapsed = Date.now() - lastContact.getTime();
    const hoursSinceSync = Math.floor(elapsed / (60 * 60 * 1000));

    if (elapsed >= TWENTY_FOUR_HOURS_MS) {
      return {
        status: 'blocked',
        hoursSinceSync,
        message:
          `CRITICAL: EBM System Locked. Receipt generation blocked due to >24h VSDC disconnection. Contact administration.`,
      };
    }

    if (elapsed >= TWENTY_TWO_HOURS_MS) {
      const hoursUntilBlock = 24 - hoursSinceSync;
      return {
        status: 'warning',
        hoursSinceSync,
        message:
          `EBM Connection Alert: VSDC has not synced in ${hoursSinceSync}h. System will lock in ${hoursUntilBlock}h. Check your local Tomcat container or internet connection.`,
      };
    }

    return { status: 'healthy', hoursSinceSync, message: null };
  }, [organization]);
}
