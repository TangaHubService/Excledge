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
}

interface OrganizationContextType {
    organization: Organization | null;
    setOrganization: (org: Organization | null) => void;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [organization, setOrganization] = useState<Organization | null>(null);

    // Load organization from localStorage on mount, or fetch from API if needed
    useEffect(() => {
        const loadOrganization = async () => {
            const storedOrg = localStorage.getItem('organization');
            const orgId = localStorage.getItem('current_organization_id');

            if (orgId) {
                // If we have organizationId, try to load from localStorage first
                if (storedOrg) {
                    try {
                        const parsedOrg = JSON.parse(storedOrg);
                        setOrganization(parsedOrg);
                        return;
                    } catch (e) {
                        console.error('Failed to parse stored organization:', e);
                    }
                }

                // If not in localStorage or parse failed, fetch from API
                try {
                    const organizationData = await apiClient.getOrganization(orgId);
                    if (organizationData?.organization) {
                        setOrganization(organizationData.organization);
                        localStorage.setItem('organization', JSON.stringify(organizationData.organization));
                    }
                } catch (error) {
                    console.error('Failed to fetch organization:', error);
                }
            }
        };

        loadOrganization();
    }, []);

    return (
        <OrganizationContext.Provider value={{ organization, setOrganization }}>
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
