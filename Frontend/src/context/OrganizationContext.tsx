import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { apiClient } from '../lib/api-client';

interface Organization {
    id: number;
    name: string;
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
    email?: string;
    /** Prisma / API may return uppercase TIN */
    TIN?: string;
    tin?: string;
    ebmDeviceId?: string | null;
    ebmSerialNo?: string | null;
    avatar?: string;
    businessType?: string;
    hasActiveSubscription?: boolean;
    subscriptionStatus?: string | null;
    subscriptionEndDate?: string | null;
    daysUntilExpiry?: number | null;
    graceDaysRemaining?: number | null;
    graceDayLabel?: string | null;
    subscriptionWarningLevel?: string | null;
    subscriptionWarningMessage?: string | null;
    role?: string;
    isOwner?: boolean;
    vatRegistered?: boolean;
    isTaxExempt?: boolean;
}

interface OrganizationContextType {
    organization: Organization | null;
    setOrganization: (org: Organization | null) => void;
    refreshOrganization: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [organization, setOrganizationState] = useState<Organization | null>(null);

    // Persist so a reload does not fall back to the stale login-time copy.
    const setOrganization = (org: Organization | null) => {
        setOrganizationState(org);
        if (org) localStorage.setItem('organization', JSON.stringify(org));
    };

    const loadOrganization = async () => {
        const storedOrg = localStorage.getItem('organization');
        const orgId = localStorage.getItem('current_organization_id');

        if (orgId) {
            let cached: Organization | null = null;
            if (storedOrg) {
                try {
                    const parsedOrg = JSON.parse(storedOrg);
                    if (String(parsedOrg.id) === orgId) {
                        cached = parsedOrg;
                        setOrganizationState(parsedOrg);
                    }
                } catch (e) {
                    console.error('Failed to parse stored organization:', e);
                }
            }

            // Always refresh: the cached copy may lack or predate fields like vatRegistered.
            try {
                const organizationData = await apiClient.getOrganization(orgId);
                if (organizationData?.organization) {
                    setOrganization({ ...(cached ?? {}), ...organizationData.organization });
                }
            } catch (error) {
                console.error('Failed to fetch organization:', error);
            }
        }
    };

    // Load organization on mount, and when a new org is set via localStorage by another tab
    useEffect(() => {
        loadOrganization();

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'current_organization_id' || e.key === 'organization') {
                loadOrganization();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    return (
        <OrganizationContext.Provider value={{ organization, setOrganization, refreshOrganization: loadOrganization }}>
            {children}
        </OrganizationContext.Provider>
    );
};

export const useOrganization = (): OrganizationContextType => {
    const context = useContext(OrganizationContext);
    if (!context) {
        throw new Error('useOrganization must be used within an OrganizationProvider');
    }
    return context;
};
