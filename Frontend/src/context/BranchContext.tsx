import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiClient } from '../lib/api-client';
import { useOrganization } from './OrganizationContext';

export interface Branch {
    id: number;
    name: string;
    code: string;
    location?: string;
    address?: string;
    phone?: string;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    isPrimary?: boolean;
    _count?: {
        sales: number;
        batches: number;
        userBranches: number;
    };
}

interface BranchContextType {
    // User's assigned branches
    userBranches: Branch[];

    // Currently selected branch (null = "All branches")
    selectedBranchId: number | null;

    // Primary branch (user's default)
    primaryBranch: Branch | null;

    // Loading state
    loading: boolean;

    // Actions
    setSelectedBranch: (id: number | null) => void;
    refreshBranches: () => Promise<void>;

    // Helpers
    canAccessAllBranches: boolean;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

interface BranchProviderProps {
    children: ReactNode;
}

export const BranchProvider: React.FC<BranchProviderProps> = ({ children }) => {
    const [userBranches, setUserBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
    const [primaryBranch, setPrimaryBranch] = useState<Branch | null>(null);
    const [loading, setLoading] = useState(true);
    const [canAccessAllBranches, setCanAccessAllBranches] = useState(false);

    const refreshBranches = async () => {
        try {
            setLoading(true);

            const orgId = localStorage.getItem('current_organization_id');

            // Get user role
            let userRole = null;
            try {
                const storedUser = localStorage.getItem('user');
                if (storedUser) {
                    const user = JSON.parse(storedUser);
                    userRole = user.role;
                }
            } catch (e) {
                console.error('Failed to parse user from localStorage:', e);
            }

            const canAccessAll = userRole === 'ADMIN' || userRole === 'SYSTEM_OWNER';
            setCanAccessAllBranches(canAccessAll);

            console.log('[BranchContext] Fetching branches:', { orgId, userRole, canAccessAll });

            // Fetch branches
            let branches = [];
            if (canAccessAll && orgId) {
                console.log(`[BranchContext] Fetching all branches for org: ${orgId}`);
                const response = await apiClient.get(`/branches/${orgId}`);
                branches = response.data || [];
                console.log(`[BranchContext] Received ${branches.length} branches:`, branches);
            } else {
                console.log('[BranchContext] Fetching user-assigned branches');
                const response = await apiClient.get(`/branches/user/all${orgId ? `?organizationId=${orgId}` : ''}`);
                branches = response.data || [];
                console.log(`[BranchContext] Received ${branches.length} user branches:`, branches);
            }
            setUserBranches(branches);

            // Find primary branch
            const primary = branches.find((b: Branch) => b.isPrimary) || branches[0] || null;
            setPrimaryBranch(primary);

            // Handle initial selection
            const savedOrgId = localStorage.getItem('branch_org_id');
            const savedBranchId = localStorage.getItem('selected_branch_id');

            // If we switched organizations, reset selection
            if (savedOrgId !== String(orgId)) {
                if (canAccessAll) {
                    // Default to "All branches" for admins
                    setSelectedBranchId(null);
                    localStorage.setItem('selected_branch_id', 'all');
                } else if (branches.length === 1) {
                    // Auto-select single branch
                    setSelectedBranchId(branches[0].id);
                    localStorage.setItem('selected_branch_id', String(branches[0].id));
                } else if (primary) {
                    // Select primary branch
                    setSelectedBranchId(primary.id);
                    localStorage.setItem('selected_branch_id', String(primary.id));
                } else {
                    // Fallback to null
                    setSelectedBranchId(null);
                    localStorage.setItem('selected_branch_id', 'all');
                }
                localStorage.setItem('branch_org_id', String(orgId));
            }
            // Restore existing selection if valid
            else if (savedBranchId) {
                if (savedBranchId === 'all') {
                    setSelectedBranchId(null);
                } else {
                    const branchId = parseInt(savedBranchId);
                    const isValid = branches.some((b: Branch) => b.id === branchId);
                    if (isValid) {
                        setSelectedBranchId(branchId);
                    } else {
                        // Branch no longer exists, reset to default
                        console.log('[BranchContext] Saved branch no longer exists, resetting to default');
                        setSelectedBranchId(canAccessAll ? null : (primary?.id || null));
                        localStorage.setItem('selected_branch_id', canAccessAll ? 'all' : String(primary?.id || 'all'));
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch branches:', error);

            // Fallback: try to get branches from organization endpoint (old API)
            try {
                const orgId = localStorage.getItem('organization_id');
                if (orgId) {
                    const fallbackResponse = await apiClient.get(`/organizations/${orgId}/branches`);
                    const branches = fallbackResponse.data || [];
                    setUserBranches(branches);

                    if (branches.length > 0) {
                        setPrimaryBranch(branches[0]);
                        setSelectedBranchId(branches[0].id);
                    }
                }
            } catch (fallbackError) {
                console.error('Fallback branch fetch failed:', fallbackError);
            }
        } finally {
            setLoading(false);
        }
    };

    const { organization } = useOrganization();
    useEffect(() => {
        refreshBranches();
    }, [organization?.id]);

    const handleSetSelectedBranch = (id: number | null) => {
        setSelectedBranchId(id);
        localStorage.setItem('selected_branch_id', id === null ? 'all' : String(id));
    };

    return (
        <BranchContext.Provider
            value={{
                userBranches,
                selectedBranchId,
                primaryBranch,
                loading,
                setSelectedBranch: handleSetSelectedBranch,
                refreshBranches,
                canAccessAllBranches,
            }}
        >
            {children}
        </BranchContext.Provider>
    );
};

export const useBranch = () => {
    const context = useContext(BranchContext);
    if (context === undefined) {
        throw new Error('useBranch must be used within a BranchProvider');
    }
    return context;
};

// Helper hook to get branch query parameter for API requests
export const useBranchQueryParam = () => {
    const { selectedBranchId } = useBranch();

    // Return query parameter string or empty string
    return selectedBranchId !== null ? `branchId=${selectedBranchId}` : '';
};
