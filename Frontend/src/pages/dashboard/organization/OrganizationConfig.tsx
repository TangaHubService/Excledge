import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Building2,
    MapPin,
    Plus,
    Edit,
    Loader2,
    Save,
    Info,
    GitBranch,
    ShieldCheck,
    Calendar,
    Activity,
    Phone,
    Mail,
    Fingerprint,
    Star,
    AlertTriangle,
    CheckCircle2,
    Package,
    RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../../components/ui/dialog';
import { Badge } from '../../../components/ui/badge';
import PhoneInputWithCountryCode from '../../../components/PhoneInputWithCountryCode';
import { apiClient } from '../../../lib/api-client';
import { toast } from 'react-toastify';
import { useAuth } from '../../../context/AuthContext';
import { useOrganization } from '../../../context/OrganizationContext';

type OrganizationData = {
    id: number;
    name: string;
    address: string;
    phone?: string;
    email?: string;
    TIN?: string;
    ebmDeviceId?: string | null;
    ebmSerialNo?: string | null;
    currency?: string;
    isActive: boolean;
    createdAt: string;
    avatar?: string;
};

interface Branch {
    id: number;
    name: string;
    code: string;
    bhfId?: string | null;
    address?: string;
    location?: string;
    status: 'ACTIVE' | 'INACTIVE';
}

type VsdcReadinessReport = {
    summary: {
        ready: boolean;
        organizationReady: boolean;
        branchesReady: boolean;
        productsReady: boolean;
    };
    organization: {
        id: number;
        name: string;
        missingFields: string[];
    };
    branches: {
        total: number;
        readyCount: number;
        missingCount: number;
        missingFieldCounts: {
            bhfId: number;
        };
        items: Array<{
            id: number;
            name: string;
            code: string;
            bhfId?: string | null;
            location?: string | null;
            address?: string | null;
            status: 'ACTIVE' | 'INACTIVE';
            missingFields: string[];
        }>;
    };
    products: {
        total: number;
        readyCount: number;
        missingCount: number;
        missingFieldCounts: {
            itemCode: number;
            itemClassCode: number;
            packageUnitCode: number;
            quantityUnitCode: number;
        };
        items: Array<{
            id: number;
            name: string;
            sku?: string | null;
            category?: string | null;
            batchNumber?: string | null;
            quantity: number;
            itemCode?: string | null;
            itemClassCode?: string | null;
            packageUnitCode?: string | null;
            quantityUnitCode?: string | null;
            missingFields: string[];
        }>;
    };
};

type VsdcSyncSnapshot = {
    snapshotType: 'INIT_INFO' | 'CODE_TABLES' | 'BRANCHES' | 'NOTICES';
    endpointPath: string;
    submissionStatus: 'PENDING' | 'SUBMITTED' | 'SUCCESS' | 'FAILED' | 'RETRYING';
    errorMessage: string | null;
    lastSyncedAt: string | null;
    summary: {
        itemCount: number | null;
        groupCount: number | null;
        preview: string[];
        topLevelKeys: string[];
        resultCode: string | null;
        resultMessage: string | null;
    } | null;
};

type VsdcSyncReport = {
    canSync: boolean;
    gatewayConfigured: boolean;
    mockMode: boolean;
    missingConfigurationFields: string[];
    branchContext: {
        branchId: number | null;
        branchName: string | null;
        branchCode: string | null;
        bhfId: string;
        usedFallbackBhfId: boolean;
    } | null;
    snapshots: {
        initInfo: VsdcSyncSnapshot | null;
        codeTables: VsdcSyncSnapshot | null;
        branches: VsdcSyncSnapshot | null;
        notices: VsdcSyncSnapshot | null;
    };
};

type VsdcStockSyncSnapshot = {
    snapshotType: 'BRANCH_MASTER' | 'ITEM_MASTER' | 'STOCK_MASTER' | 'STOCK_MOVEMENTS';
    endpointPath: string;
    submissionStatus: 'PENDING' | 'SUBMITTED' | 'SUCCESS' | 'FAILED' | 'RETRYING';
    errorMessage: string | null;
    lastSyncedAt: string | null;
    summary: {
        itemCount: number | null;
        groupCount: number | null;
        preview: string[];
        topLevelKeys: string[];
        resultCode: string | null;
        resultMessage: string | null;
    } | null;
};

type VsdcStockSyncReport = {
    canSync: boolean;
    gatewayConfigured: boolean;
    mockMode: boolean;
    missingConfigurationFields: string[];
    branchContext: {
        branchId: number | null;
        branchName: string | null;
        branchCode: string | null;
        bhfId: string;
        usedFallbackBhfId: boolean;
    } | null;
    summary: {
        activeBranches: number;
        activeProducts: number;
        syncableBranches: number;
        syncableProducts: number;
        blockedBranches: number;
        blockedProducts: number;
        stockPositions: number;
        movementRowsPendingSync: number;
    };
    snapshots: {
        branchMaster: VsdcStockSyncSnapshot | null;
        itemMaster: VsdcStockSyncSnapshot | null;
        stockMaster: VsdcStockSyncSnapshot | null;
        stockMovements: VsdcStockSyncSnapshot | null;
    };
};

type VsdcReadinessBranchItem = VsdcReadinessReport['branches']['items'][number];
type VsdcReadinessProductItem = VsdcReadinessReport['products']['items'][number];
type BranchBackfillDraft = {
    bhfId: string;
};
type ProductBackfillDraft = {
    itemCode: string;
    itemClassCode: string;
    packageUnitCode: string;
    quantityUnitCode: string;
};

const organizationFieldLabels: Record<string, string> = {
    TIN: 'Organization TIN',
    ebmDeviceId: 'VSDC Device ID',
    ebmSerialNo: 'VSDC Serial Number',
};

const branchFieldLabels: Record<string, string> = {
    bhfId: 'Branch BHF ID',
};

const productFieldLabels: Record<string, string> = {
    itemCode: 'Item Code',
    itemClassCode: 'Item Class Code',
    packageUnitCode: 'Package Unit Code',
    quantityUnitCode: 'Quantity Unit Code',
};

const vsdcSyncCardMeta: Array<{
    key: keyof VsdcSyncReport['snapshots'];
    title: string;
    description: string;
}> = [
    {
        key: 'initInfo',
        title: 'Init Info',
        description: 'Device and taxpayer initialization snapshot from the VSDC gateway.',
    },
    {
        key: 'codeTables',
        title: 'Code Tables',
        description: 'Reference codes for tax, item classification, and unit mappings.',
    },
    {
        key: 'branches',
        title: 'Branch Lookup',
        description: 'Official branch/BHF lookup result returned by the VSDC gateway.',
    },
    {
        key: 'notices',
        title: 'Notices',
        description: 'Operational notices or announcements returned by the VSDC gateway.',
    },
];

const vsdcStockSyncCardMeta: Array<{
    key: keyof VsdcStockSyncReport['snapshots'];
    title: string;
    description: string;
}> = [
    {
        key: 'branchMaster',
        title: 'Branch Master Sync',
        description: 'Pushes active branch/BHF master data to the configured VSDC stock endpoint.',
    },
    {
        key: 'itemMaster',
        title: 'Item Master Sync',
        description: 'Pushes active product master data and official item/unit codes.',
    },
    {
        key: 'stockMaster',
        title: 'Stock Master Sync',
        description: 'Publishes the current positive stock balance snapshot by branch and product.',
    },
    {
        key: 'stockMovements',
        title: 'Stock Movement Sync',
        description: 'Publishes inventory ledger deltas since the last stock-movement sync snapshot.',
    },
];

const buildBranchBackfillDrafts = (report: VsdcReadinessReport | null): Record<number, BranchBackfillDraft> => {
    if (!report) {
        return {};
    }

    return report.branches.items.reduce<Record<number, BranchBackfillDraft>>((drafts, branch) => {
        drafts[branch.id] = {
            bhfId: branch.bhfId ?? '',
        };
        return drafts;
    }, {});
};

const buildProductBackfillDrafts = (report: VsdcReadinessReport | null): Record<number, ProductBackfillDraft> => {
    if (!report) {
        return {};
    }

    return report.products.items.reduce<Record<number, ProductBackfillDraft>>((drafts, product) => {
        drafts[product.id] = {
            itemCode: product.itemCode ?? '',
            itemClassCode: product.itemClassCode ?? '',
            packageUnitCode: product.packageUnitCode ?? '',
            quantityUnitCode: product.quantityUnitCode ?? '',
        };
        return drafts;
    }, {});
};

export function OrganizationConfig() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { setOrganization: updateGlobalOrg } = useOrganization();

    const [organization, setOrganization] = useState<OrganizationData | null>(null);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSavingOrg, setIsSavingOrg] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isRefreshingReadiness, setIsRefreshingReadiness] = useState(false);
    const [isRunningVsdcSync, setIsRunningVsdcSync] = useState(false);
    const [isRunningVsdcStockSync, setIsRunningVsdcStockSync] = useState(false);
    const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
    const [readiness, setReadiness] = useState<VsdcReadinessReport | null>(null);
    const [vsdcSync, setVsdcSync] = useState<VsdcSyncReport | null>(null);
    const [vsdcStockSync, setVsdcStockSync] = useState<VsdcStockSyncReport | null>(null);
    const [branchBackfillDrafts, setBranchBackfillDrafts] = useState<Record<number, BranchBackfillDraft>>({});
    const [productBackfillDrafts, setProductBackfillDrafts] = useState<Record<number, ProductBackfillDraft>>({});
    const [savingBranchBackfillId, setSavingBranchBackfillId] = useState<number | null>(null);
    const [savingProductBackfillId, setSavingProductBackfillId] = useState<number | null>(null);

    // Branch dialog state
    const [branchDialogOpen, setBranchDialogOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [branchFormData, setBranchFormData] = useState({
        name: '',
        code: '',
        bhfId: '',
        address: '',
        location: '',
        status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE'
    });

    const isAuthorized = user?.role === 'ADMIN' || user?.role === 'SYSTEM_OWNER';

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setBranchBackfillDrafts(buildBranchBackfillDrafts(readiness));
        setProductBackfillDrafts(buildProductBackfillDrafts(readiness));
    }, [readiness]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const orgId = localStorage.getItem('current_organization_id');
            if (orgId) {
                const [orgResult, branchesResult, readinessResult, syncResult, stockSyncResult] = await Promise.allSettled([
                    apiClient.getOrganization(orgId),
                    apiClient.getBranches(),
                    apiClient.getOrganizationVsdcReadiness(orgId),
                    apiClient.getOrganizationVsdcSync(orgId),
                    apiClient.getOrganizationVsdcStockSync(orgId)
                ]);

                if (orgResult.status === 'fulfilled' && orgResult.value?.organization) {
                    setOrganization(orgResult.value.organization);
                }

                if (branchesResult.status === 'fulfilled') {
                    setBranches(branchesResult.value || []);
                } else {
                    setBranches([]);
                }

                if (readinessResult.status === 'fulfilled') {
                    setReadiness(readinessResult.value?.readiness || null);
                } else {
                    setReadiness(null);
                    console.error('Failed to fetch VSDC readiness:', readinessResult.reason);
                }

                if (syncResult.status === 'fulfilled') {
                    setVsdcSync(syncResult.value?.sync || null);
                } else {
                    setVsdcSync(null);
                    console.error('Failed to fetch VSDC sync status:', syncResult.reason);
                }

                if (stockSyncResult.status === 'fulfilled') {
                    setVsdcStockSync(stockSyncResult.value?.stockSync || null);
                } else {
                    setVsdcStockSync(null);
                    console.error('Failed to fetch VSDC stock sync status:', stockSyncResult.reason);
                }
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to fetch settings');
        } finally {
            setLoading(false);
        }
    };

    const handleRunVsdcSync = async () => {
        const orgId = localStorage.getItem('current_organization_id');
        if (!orgId || !isAuthorized) return;

        setIsRunningVsdcSync(true);
        try {
            const response = await apiClient.runOrganizationVsdcSync(orgId, 'ALL');
            setVsdcSync(response?.sync || null);
            toast.success(response?.message || 'VSDC reference sync completed');
        } catch (error: any) {
            toast.error(error.message || 'Failed to run VSDC reference sync');
        } finally {
            setIsRunningVsdcSync(false);
        }
    };

    const handleRunVsdcStockSync = async () => {
        const orgId = localStorage.getItem('current_organization_id');
        if (!orgId || !isAuthorized) return;

        setIsRunningVsdcStockSync(true);
        try {
            const response = await apiClient.runOrganizationVsdcStockSync(orgId, 'ALL');
            setVsdcStockSync(response?.stockSync || null);
            toast.success(response?.message || 'VSDC stock sync completed');
        } catch (error: any) {
            toast.error(error.message || 'Failed to run VSDC stock sync');
        } finally {
            setIsRunningVsdcStockSync(false);
        }
    };

    const handleRefreshReadiness = async () => {
        const orgId = localStorage.getItem('current_organization_id');
        if (!orgId) return;

        setIsRefreshingReadiness(true);
        try {
            const readinessResponse = await apiClient.getOrganizationVsdcReadiness(orgId);
            setReadiness(readinessResponse?.readiness || null);
            toast.success('VSDC readiness report refreshed');
        } catch (error: any) {
            toast.error(error.message || 'Failed to refresh VSDC readiness');
        } finally {
            setIsRefreshingReadiness(false);
        }
    };

    const refreshBranchAndReadinessData = async () => {
        const orgId = localStorage.getItem('current_organization_id');
        if (!orgId) return;

        const [branchesResult, readinessResult, stockSyncResult] = await Promise.allSettled([
            apiClient.getBranches(),
            apiClient.getOrganizationVsdcReadiness(orgId),
            apiClient.getOrganizationVsdcStockSync(orgId),
        ]);

        if (branchesResult.status === 'fulfilled') {
            setBranches(branchesResult.value || []);
        } else {
            console.error('Failed to refresh branches after VSDC backfill update:', branchesResult.reason);
        }

        if (readinessResult.status === 'fulfilled') {
            setReadiness(readinessResult.value?.readiness || null);
        } else {
            console.error('Failed to refresh VSDC readiness after backfill update:', readinessResult.reason);
            throw readinessResult.reason;
        }

        if (stockSyncResult.status === 'fulfilled') {
            setVsdcStockSync(stockSyncResult.value?.stockSync || null);
            return;
        }

        console.error('Failed to refresh VSDC stock sync after backfill update:', stockSyncResult.reason);
        throw stockSyncResult.reason;
    };

    const handleBranchBackfillDraftChange = (branchId: number, value: string) => {
        setBranchBackfillDrafts((prev) => ({
            ...prev,
            [branchId]: {
                bhfId: value,
            },
        }));
    };

    const handleProductBackfillDraftChange = (
        productId: number,
        field: keyof ProductBackfillDraft,
        value: string
    ) => {
        setProductBackfillDrafts((prev) => ({
            ...prev,
            [productId]: {
                itemCode: prev[productId]?.itemCode ?? '',
                itemClassCode: prev[productId]?.itemClassCode ?? '',
                packageUnitCode: prev[productId]?.packageUnitCode ?? '',
                quantityUnitCode: prev[productId]?.quantityUnitCode ?? '',
                [field]: value,
            },
        }));
    };

    const handleBranchBackfillSave = async (branch: VsdcReadinessBranchItem) => {
        if (!isAuthorized) {
            return;
        }

        const bhfId = (branchBackfillDrafts[branch.id]?.bhfId ?? branch.bhfId ?? '').trim();
        if (!bhfId) {
            toast.error('Branch BHF ID is required before saving');
            return;
        }

        setSavingBranchBackfillId(branch.id);
        try {
            await apiClient.updateBranch(branch.id, { bhfId });
            await refreshBranchAndReadinessData();
            toast.success(`Branch "${branch.name}" VSDC data updated`);
        } catch (error: any) {
            toast.error(error.message || 'Failed to update branch VSDC data');
        } finally {
            setSavingBranchBackfillId(null);
        }
    };

    const handleProductBackfillSave = async (product: VsdcReadinessProductItem) => {
        if (!isAuthorized) {
            return;
        }

        const payload: ProductBackfillDraft = {
            itemCode: (productBackfillDrafts[product.id]?.itemCode ?? product.itemCode ?? '').trim(),
            itemClassCode: (productBackfillDrafts[product.id]?.itemClassCode ?? product.itemClassCode ?? '').trim(),
            packageUnitCode: (productBackfillDrafts[product.id]?.packageUnitCode ?? product.packageUnitCode ?? '').trim(),
            quantityUnitCode: (productBackfillDrafts[product.id]?.quantityUnitCode ?? product.quantityUnitCode ?? '').trim(),
        };

        const missingPayloadFields = Object.entries(payload)
            .filter(([, value]) => value.length === 0)
            .map(([field]) => productFieldLabels[field] || field);

        if (missingPayloadFields.length > 0) {
            toast.error(`Complete all required product VSDC fields before saving: ${missingPayloadFields.join(', ')}`);
            return;
        }

        setSavingProductBackfillId(product.id);
        try {
            await apiClient.updateProduct(String(product.id), payload);
            await refreshBranchAndReadinessData();
            toast.success(`Product "${product.name}" VSDC data updated`);
        } catch (error: any) {
            toast.error(error.message || 'Failed to update product VSDC data');
        } finally {
            setSavingProductBackfillId(null);
        }
    };

    const handleOrgSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!organization || !isAuthorized) return;

        setIsSavingOrg(true);
        try {
            const response = await apiClient.updateOrganization(organization);
            updateGlobalOrg(organization as any);
            toast.success(response.message || t('companySettings.updateSuccess'));
        } catch (error: any) {
            toast.error(error.message || t('companySettings.updateError'));
        } finally {
            setIsSavingOrg(false);
        }
    };

    const handleAvatarUpload = async (file: File) => {
        if (!file || !isAuthorized) return;

        // Check file type
        if (!file.type.match('image.*')) {
            toast.error(t('companySettings.imageOnly') || 'Please select an image file');
            return;
        }

        // Check file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            toast.error(t('companySettings.fileSizeError') || 'File size must be less than 5MB');
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('avatar', file);

            // Create preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewAvatar(reader.result as string);
            };
            reader.readAsDataURL(file);

            // Upload to server
            await apiClient.uploadAvatar(formData);
            toast.success(t('companySettings.avatarSuccess') || 'Logo updated successfully');
            fetchData();
        } catch (error: any) {
            toast.error(error.message || t('companySettings.avatarError') || 'Failed to upload logo');
        } finally {
            setIsUploading(false);
        }
    };

    const handleBranchCreate = () => {
        setEditingBranch(null);
        setBranchFormData({
            name: '',
            code: '',
            bhfId: '',
            address: '',
            location: '',
            status: 'ACTIVE'
        });
        setBranchDialogOpen(true);
    };

    const handleBranchEdit = (branch: Branch) => {
        setEditingBranch(branch);
        setBranchFormData({
            name: branch.name,
            code: branch.code,
            bhfId: branch.bhfId || '',
            address: branch.address || '',
            location: branch.location || '',
            status: branch.status
        });
        setBranchDialogOpen(true);
    };

    const handleBranchSave = async () => {
        try {
            if (editingBranch) {
                await apiClient.updateBranch(editingBranch.id, branchFormData);
                toast.success(t('branches.updated') || 'Branch updated');
            } else {
                await apiClient.createBranch(branchFormData);
                toast.success(t('branches.created') || 'Branch created');
            }
            setBranchDialogOpen(false);
            fetchData();
        } catch (error: any) {
            toast.error(error.message || 'Failed to save branch');
        }
    };

    const handleBranchToggleStatus = async (branch: Branch) => {
        const newStatus = branch.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        try {
            await apiClient.updateBranch(branch.id, {
                ...branch,
                bhfId: branch.bhfId || undefined,
                status: newStatus
            });
            toast.success(`Branch ${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully`);
            fetchData();
        } catch (error: any) {
            toast.error(error.message || 'Failed to update branch status');
        }
    };

    const handleSetDefaultBranch = async (branch: Branch) => {
        try {
            await apiClient.setDefaultBranch(branch.id);
            toast.success(t('branches.setDefault') || 'Default branch updated');
            fetchData();
        } catch (error: any) {
            toast.error(error.message || 'Failed to set default branch');
        }
    };

    if (loading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {t('nav.organizationConfig')}
                </h1>
                <p className="text-gray-500 dark:text-gray-400">
                    Manage your organization profile, contact information, and business branches.
                </p>
            </div>

            <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:w-[620px] bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                    <TabsTrigger value="details" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm">
                        <Building2 className="h-4 w-4 mr-2" />
                        Details
                    </TabsTrigger>
                    <TabsTrigger value="branches" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm">
                        <GitBranch className="h-4 w-4 mr-2" />
                        Branches
                    </TabsTrigger>
                    <TabsTrigger value="vsdc" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm">
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        VSDC Readiness
                    </TabsTrigger>
                </TabsList>

                {/* Organization Details Tab */}
                <TabsContent value="details" className="mt-6">
                    <Card className="border-none shadow-xl bg-white dark:bg-gray-800 overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-blue-600/5 to-indigo-600/5 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Info className="h-5 w-5 text-blue-600" />
                                        <CardTitle>Organization Profile</CardTitle>
                                    </div>
                                    <CardDescription>
                                        Basic information about your business entity.
                                    </CardDescription>
                                </div>
                                <div className="relative group">
                                    <div className="h-20 w-20 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-200 dark:border-gray-600 group-hover:border-blue-400 transition-colors">
                                        {previewAvatar || organization?.avatar ? (
                                            <img
                                                src={previewAvatar || organization?.avatar}
                                                alt="Organization logo"
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <Building2 className="h-8 w-8 text-gray-400" />
                                        )}
                                    </div>
                                    {isAuthorized && (
                                        <label className="absolute -bottom-2 -right-2 bg-blue-600 text-white p-1.5 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors shadow-lg border-2 border-white dark:border-gray-800">
                                            {isUploading ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Plus className="h-3 w-3" />
                                            )}
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept="image/*"
                                                onChange={(e) => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
                                                disabled={isUploading}
                                            />
                                        </label>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <form onSubmit={handleOrgSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-gray-400" />
                                            Organization Name
                                        </Label>
                                        <Input
                                            value={organization?.name || ''}
                                            onChange={(e) => setOrganization(prev => prev ? { ...prev, name: e.target.value } : null)}
                                            disabled={!isAuthorized || isSavingOrg}
                                            className="rounded-xl"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <Fingerprint className="h-4 w-4 text-gray-400" />
                                            Organization Code / TIN
                                        </Label>
                                        <Input
                                            value={organization?.TIN || ''}
                                            onChange={(e) => setOrganization(prev => prev ? { ...prev, TIN: e.target.value } : null)}
                                            disabled={!isAuthorized || isSavingOrg}
                                            className="rounded-xl"
                                        />
                                    </div>

                                    <div className="space-y-2 md:col-span-2">
                                        <Label className="flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-gray-400" />
                                            RRA EBM / VSDC — device ID
                                        </Label>
                                        <Input
                                            value={organization?.ebmDeviceId ?? ''}
                                            onChange={(e) => setOrganization(prev => prev ? { ...prev, ebmDeviceId: e.target.value } : null)}
                                            disabled={!isAuthorized || isSavingOrg}
                                            placeholder="From RRA registration (VSDC)"
                                            className="rounded-xl"
                                        />
                                    </div>

                                    <div className="space-y-2 md:col-span-2">
                                        <Label className="flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-gray-400" />
                                            RRA EBM / VSDC — serial number
                                        </Label>
                                        <Input
                                            value={organization?.ebmSerialNo ?? ''}
                                            onChange={(e) => setOrganization(prev => prev ? { ...prev, ebmSerialNo: e.target.value } : null)}
                                            disabled={!isAuthorized || isSavingOrg}
                                            placeholder="Device / controller serial from RRA"
                                            className="rounded-xl"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <Mail className="h-4 w-4 text-gray-400" />
                                            Email Address
                                        </Label>
                                        <Input
                                            type="email"
                                            value={organization?.email || ''}
                                            onChange={(e) => setOrganization(prev => prev ? { ...prev, email: e.target.value } : null)}
                                            disabled={!isAuthorized || isSavingOrg}
                                            className="rounded-xl"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-gray-400" />
                                            Contact Phone
                                        </Label>
                                        <PhoneInputWithCountryCode
                                            value={organization?.phone || ''}
                                            onChange={(value: string) => setOrganization(prev => prev ? { ...prev, phone: value } : null)}
                                            disabled={!isAuthorized || isSavingOrg}
                                            className="rounded-xl"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-gray-400" />
                                            Headquarters Address
                                        </Label>
                                        <Input
                                            value={organization?.address || ''}
                                            onChange={(e) => setOrganization(prev => prev ? { ...prev, address: e.target.value } : null)}
                                            disabled={!isAuthorized || isSavingOrg}
                                            className="rounded-xl"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <Activity className="h-4 w-4 text-gray-400" />
                                            Status
                                        </Label>
                                        <div className="flex items-center h-10 px-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700">
                                            <Badge variant={organization?.isActive ? "default" : "destructive"} className="rounded-full">
                                                {organization?.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-gray-400" />
                                            Created On
                                        </Label>
                                        <Input
                                            value={organization?.createdAt ? new Date(organization.createdAt).toLocaleDateString() : 'N/A'}
                                            disabled
                                            className="rounded-xl bg-gray-50 dark:bg-gray-900 grayscale opacity-60"
                                        />
                                    </div>
                                </div>

                                {isAuthorized && (
                                    <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
                                        <Button
                                            type="submit"
                                            disabled={isSavingOrg}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl shadow-lg shadow-blue-500/20"
                                        >
                                            {isSavingOrg ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                            Save Changes
                                        </Button>
                                    </div>
                                )}
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Branch Management Tab */}
                <TabsContent value="branches" className="mt-6">
                    <Card className="border-none shadow-xl bg-white dark:bg-gray-800">
                        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-indigo-600/5 to-purple-600/5">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <GitBranch className="h-5 w-5 text-indigo-600" />
                                    Business Branches
                                </CardTitle>
                                <CardDescription>
                                    Logical units for branch-aware reporting and data management.
                                </CardDescription>
                            </div>
                            {isAuthorized && (
                                <Button onClick={handleBranchCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Branch
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-gray-50/50 dark:bg-gray-900/50">
                                    <TableRow>
                                        <TableHead className="pl-6">Name</TableHead>
                                        <TableHead>Code</TableHead>
                                        <TableHead>BHF ID</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {branches.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                                                No branches found for this organization.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        branches.map((branch) => (
                                            <TableRow key={branch.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors">
                                                <TableCell className="font-medium pl-6">
                                                    {branch.name}
                                                </TableCell>
                                                <TableCell>
                                                    <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                                        {branch.code}
                                                    </code>
                                                </TableCell>
                                                <TableCell>
                                                    {branch.bhfId ? (
                                                        <code className="text-xs bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded">
                                                            {branch.bhfId}
                                                        </code>
                                                    ) : (
                                                        <span className="text-gray-400">Not set</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>{branch.location || 'Not specified'}</TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={branch.status === 'ACTIVE' ? "default" : "outline"}
                                                        className="rounded-full"
                                                    >
                                                        {branch.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <div className="flex justify-end gap-2">
                                                        {isAuthorized && (
                                                            <>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleSetDefaultBranch(branch)}
                                                                    title="Set as Default"
                                                                    className="text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                                                                >
                                                                    <Star className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleBranchToggleStatus(branch)}
                                                                    title={branch.status === 'ACTIVE' ? "Deactivate" : "Activate"}
                                                                    className={branch.status === 'ACTIVE' ? "text-slate-400 hover:text-amber-600" : "text-green-600"}
                                                                >
                                                                    <ShieldCheck className="h-4 w-4" />
                                                                </Button>
                                                                <Button variant="ghost" size="sm" onClick={() => handleBranchEdit(branch)} className="text-blue-600 hover:bg-blue-50">
                                                                    <Edit className="h-4 w-4" />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="vsdc" className="mt-6 space-y-6">
                    <Card className="border-none shadow-xl bg-white dark:bg-gray-800 overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-emerald-600/5 to-blue-600/5 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-5 w-5 text-emerald-600" />
                                        <CardTitle>VSDC Verification Readiness</CardTitle>
                                    </div>
                                    <CardDescription>
                                        This report shows which organization settings, branches, and products still block formal VSDC verification.
                                    </CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={handleRefreshReadiness}
                                    disabled={isRefreshingReadiness}
                                    className="rounded-xl"
                                >
                                    {isRefreshingReadiness ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                    )}
                                    Refresh Report
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            {readiness ? (
                                <>
                                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                                        <Card className={`border ${readiness.summary.ready ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20'}`}>
                                            <CardContent className="p-4">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <p className="text-sm text-gray-500 dark:text-gray-400">Overall</p>
                                                        <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                                                            {readiness.summary.ready ? 'Ready for backfill completion' : 'Action required'}
                                                        </p>
                                                    </div>
                                                    {readiness.summary.ready ? (
                                                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                                    ) : (
                                                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card className="border border-gray-200 dark:border-gray-700">
                                            <CardContent className="p-4">
                                                <p className="text-sm text-gray-500 dark:text-gray-400">Organization setup</p>
                                                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                                                    {readiness.organization.missingFields.length}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    missing required org-level fields
                                                </p>
                                            </CardContent>
                                        </Card>

                                        <Card className="border border-gray-200 dark:border-gray-700">
                                            <CardContent className="p-4">
                                                <p className="text-sm text-gray-500 dark:text-gray-400">Branches blocked</p>
                                                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                                                    {readiness.branches.missingCount}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    of {readiness.branches.total} active branches
                                                </p>
                                            </CardContent>
                                        </Card>

                                        <Card className="border border-gray-200 dark:border-gray-700">
                                            <CardContent className="p-4">
                                                <p className="text-sm text-gray-500 dark:text-gray-400">Products blocked</p>
                                                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                                                    {readiness.products.missingCount}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    of {readiness.products.total} active products
                                                </p>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <Card className="border border-gray-200 dark:border-gray-700 shadow-none">
                                        <CardHeader className="pb-3">
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                                <div className="space-y-1">
                                                    <CardTitle className="text-base">Official Reference Sync</CardTitle>
                                                    <CardDescription>
                                                        Run the VSDC init-info, code-table, branch, and notices endpoints and cache the latest snapshot for verification prep.
                                                    </CardDescription>
                                                </div>
                                                {isAuthorized && (
                                                    <Button
                                                        onClick={handleRunVsdcSync}
                                                        disabled={isRunningVsdcSync}
                                                        className="rounded-xl"
                                                    >
                                                        {isRunningVsdcSync ? (
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        ) : (
                                                            <RefreshCw className="h-4 w-4 mr-2" />
                                                        )}
                                                        Run Full Sync
                                                    </Button>
                                                )}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0 space-y-4">
                                            {vsdcSync ? (
                                                <>
                                                    <div className="flex flex-wrap gap-2 text-xs">
                                                        <Badge variant="outline" className="rounded-full">
                                                            {vsdcSync.mockMode ? 'Mock mode' : 'Gateway mode'}
                                                        </Badge>
                                                        <Badge
                                                            variant="outline"
                                                            className={`rounded-full ${vsdcSync.gatewayConfigured ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300' : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300'}`}
                                                        >
                                                            {vsdcSync.gatewayConfigured ? 'Gateway configured' : 'Gateway not configured'}
                                                        </Badge>
                                                        {vsdcSync.branchContext && (
                                                            <Badge
                                                                variant="outline"
                                                                className={`rounded-full ${vsdcSync.branchContext.usedFallbackBhfId ? 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300' : ''}`}
                                                            >
                                                                Sync BHF: {vsdcSync.branchContext.bhfId}
                                                                {vsdcSync.branchContext.branchName ? ` (${vsdcSync.branchContext.branchName})` : ''}
                                                                {vsdcSync.branchContext.usedFallbackBhfId ? ' fallback' : ''}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    {vsdcSync.missingConfigurationFields.length > 0 && (
                                                        <div className="space-y-2">
                                                            <p className="text-sm text-amber-700 dark:text-amber-300">
                                                                Complete these organization fields before sync can run:
                                                            </p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {vsdcSync.missingConfigurationFields.map((field) => (
                                                                    <Badge key={field} variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                                        {organizationFieldLabels[field] || field}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {!isAuthorized && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                                            An organization admin is required to trigger VSDC reference sync.
                                                        </p>
                                                    )}

                                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                                        {vsdcSyncCardMeta.map((card) => {
                                                            const snapshot = vsdcSync.snapshots[card.key];
                                                            const statusClass =
                                                                snapshot?.submissionStatus === 'SUCCESS'
                                                                    ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'
                                                                    : snapshot?.submissionStatus === 'FAILED'
                                                                        ? 'border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300'
                                                                        : 'border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300';

                                                            return (
                                                                <Card key={card.key} className="border border-gray-200 dark:border-gray-700 shadow-none">
                                                                    <CardContent className="p-4 space-y-3">
                                                                        <div className="flex items-start justify-between gap-3">
                                                                            <div>
                                                                                <p className="font-semibold text-gray-900 dark:text-white">{card.title}</p>
                                                                                <p className="text-xs text-gray-500 dark:text-gray-400">{card.description}</p>
                                                                            </div>
                                                                            <Badge variant="outline" className={`rounded-full ${statusClass}`}>
                                                                                {snapshot?.submissionStatus || 'NOT_RUN'}
                                                                            </Badge>
                                                                        </div>

                                                                        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                                                                            <p>Endpoint: <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">{snapshot?.endpointPath || 'Not configured yet'}</code></p>
                                                                            <p>Last synced: {snapshot?.lastSyncedAt ? new Date(snapshot.lastSyncedAt).toLocaleString() : 'Never'}</p>
                                                                            {snapshot?.summary?.itemCount !== null && snapshot?.summary?.itemCount !== undefined && (
                                                                                <p>Items: {snapshot.summary.itemCount}</p>
                                                                            )}
                                                                            {snapshot?.summary?.groupCount !== null && snapshot?.summary?.groupCount !== undefined && (
                                                                                <p>Groups: {snapshot.summary.groupCount}</p>
                                                                            )}
                                                                        </div>

                                                                        {snapshot?.summary?.preview?.length ? (
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {snapshot.summary.preview.map((item) => (
                                                                                    <Badge key={`${card.key}-${item}`} variant="outline" className="rounded-full">
                                                                                        {item}
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <p className="text-xs text-gray-500 dark:text-gray-400">No preview data cached yet.</p>
                                                                        )}

                                                                        {(snapshot?.errorMessage || snapshot?.summary?.resultMessage) && (
                                                                            <p className={`text-xs ${snapshot?.submissionStatus === 'FAILED' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                                {snapshot?.errorMessage || snapshot?.summary?.resultMessage}
                                                                            </p>
                                                                        )}
                                                                    </CardContent>
                                                                </Card>
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    <span className="text-sm">VSDC reference sync status is not available yet.</span>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card className="border border-gray-200 dark:border-gray-700 shadow-none">
                                        <CardHeader className="pb-3">
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                                <div className="space-y-1">
                                                    <CardTitle className="text-base">Official Stock Sync</CardTitle>
                                                    <CardDescription>
                                                        Run branch master, item master, stock master, and stock movement sync against the configured VSDC stock endpoints.
                                                    </CardDescription>
                                                </div>
                                                {isAuthorized && (
                                                    <Button
                                                        onClick={handleRunVsdcStockSync}
                                                        disabled={isRunningVsdcStockSync}
                                                        className="rounded-xl"
                                                    >
                                                        {isRunningVsdcStockSync ? (
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        ) : (
                                                            <RefreshCw className="h-4 w-4 mr-2" />
                                                        )}
                                                        Run Full Stock Sync
                                                    </Button>
                                                )}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0 space-y-4">
                                            {vsdcStockSync ? (
                                                <>
                                                    <div className="flex flex-wrap gap-2 text-xs">
                                                        <Badge variant="outline" className="rounded-full">
                                                            {vsdcStockSync.mockMode ? 'Mock mode' : 'Gateway mode'}
                                                        </Badge>
                                                        <Badge
                                                            variant="outline"
                                                            className={`rounded-full ${vsdcStockSync.gatewayConfigured ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300' : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300'}`}
                                                        >
                                                            {vsdcStockSync.gatewayConfigured ? 'Gateway configured' : 'Gateway not configured'}
                                                        </Badge>
                                                        {vsdcStockSync.branchContext && (
                                                            <Badge
                                                                variant="outline"
                                                                className={`rounded-full ${vsdcStockSync.branchContext.usedFallbackBhfId ? 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300' : ''}`}
                                                            >
                                                                Sync BHF: {vsdcStockSync.branchContext.bhfId}
                                                                {vsdcStockSync.branchContext.branchName ? ` (${vsdcStockSync.branchContext.branchName})` : ''}
                                                                {vsdcStockSync.branchContext.usedFallbackBhfId ? ' fallback' : ''}
                                                            </Badge>
                                                        )}
                                                        <Badge variant="outline" className="rounded-full">
                                                            Stock positions: {vsdcStockSync.summary.stockPositions}
                                                        </Badge>
                                                        <Badge variant="outline" className="rounded-full">
                                                            Pending movement rows: {vsdcStockSync.summary.movementRowsPendingSync}
                                                        </Badge>
                                                    </div>

                                                    {vsdcStockSync.missingConfigurationFields.length > 0 && (
                                                        <div className="space-y-2">
                                                            <p className="text-sm text-amber-700 dark:text-amber-300">
                                                                Complete these organization fields before stock sync can run:
                                                            </p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {vsdcStockSync.missingConfigurationFields.map((field) => (
                                                                    <Badge key={field} variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                                        {organizationFieldLabels[field] || field}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="flex flex-wrap gap-2 text-xs">
                                                        <Badge
                                                            variant="outline"
                                                            className={`rounded-full ${vsdcStockSync.summary.blockedBranches > 0 ? 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300' : ''}`}
                                                        >
                                                            Branches blocked: {vsdcStockSync.summary.blockedBranches}
                                                        </Badge>
                                                        <Badge
                                                            variant="outline"
                                                            className={`rounded-full ${vsdcStockSync.summary.blockedProducts > 0 ? 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300' : ''}`}
                                                        >
                                                            Products blocked: {vsdcStockSync.summary.blockedProducts}
                                                        </Badge>
                                                        <Badge variant="outline" className="rounded-full">
                                                            Syncable branches: {vsdcStockSync.summary.syncableBranches}/{vsdcStockSync.summary.activeBranches}
                                                        </Badge>
                                                        <Badge variant="outline" className="rounded-full">
                                                            Syncable products: {vsdcStockSync.summary.syncableProducts}/{vsdcStockSync.summary.activeProducts}
                                                        </Badge>
                                                    </div>

                                                    {!isAuthorized && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                                            An organization admin is required to trigger VSDC stock sync.
                                                        </p>
                                                    )}

                                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                                        {vsdcStockSyncCardMeta.map((card) => {
                                                            const snapshot = vsdcStockSync.snapshots[card.key];
                                                            const statusClass =
                                                                snapshot?.submissionStatus === 'SUCCESS'
                                                                    ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'
                                                                    : snapshot?.submissionStatus === 'FAILED'
                                                                        ? 'border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300'
                                                                        : 'border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300';

                                                            return (
                                                                <Card key={card.key} className="border border-gray-200 dark:border-gray-700 shadow-none">
                                                                    <CardContent className="p-4 space-y-3">
                                                                        <div className="flex items-start justify-between gap-3">
                                                                            <div>
                                                                                <p className="font-semibold text-gray-900 dark:text-white">{card.title}</p>
                                                                                <p className="text-xs text-gray-500 dark:text-gray-400">{card.description}</p>
                                                                            </div>
                                                                            <Badge variant="outline" className={`rounded-full ${statusClass}`}>
                                                                                {snapshot?.submissionStatus || 'NOT_RUN'}
                                                                            </Badge>
                                                                        </div>

                                                                        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                                                                            <p>Endpoint: <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">{snapshot?.endpointPath || 'Not configured yet'}</code></p>
                                                                            <p>Last synced: {snapshot?.lastSyncedAt ? new Date(snapshot.lastSyncedAt).toLocaleString() : 'Never'}</p>
                                                                            {snapshot?.summary?.itemCount !== null && snapshot?.summary?.itemCount !== undefined && (
                                                                                <p>Items: {snapshot.summary.itemCount}</p>
                                                                            )}
                                                                            {snapshot?.summary?.groupCount !== null && snapshot?.summary?.groupCount !== undefined && (
                                                                                <p>Groups: {snapshot.summary.groupCount}</p>
                                                                            )}
                                                                        </div>

                                                                        {snapshot?.summary?.preview?.length ? (
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {snapshot.summary.preview.map((item) => (
                                                                                    <Badge key={`${card.key}-${item}`} variant="outline" className="rounded-full">
                                                                                        {item}
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <p className="text-xs text-gray-500 dark:text-gray-400">No preview data cached yet.</p>
                                                                        )}

                                                                        {(snapshot?.errorMessage || snapshot?.summary?.resultMessage) && (
                                                                            <p className={`text-xs ${snapshot?.submissionStatus === 'FAILED' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                                {snapshot?.errorMessage || snapshot?.summary?.resultMessage}
                                                                            </p>
                                                                        )}
                                                                    </CardContent>
                                                                </Card>
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    <span className="text-sm">VSDC stock sync status is not available yet.</span>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card className="border border-gray-200 dark:border-gray-700 shadow-none">
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-base">Organization Blockers</CardTitle>
                                            <CardDescription>
                                                These fields must be configured from the Details tab before the organization can be verification-ready.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                            {readiness.organization.missingFields.length === 0 ? (
                                                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    <span className="text-sm">Organization-level VSDC fields are complete.</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {readiness.organization.missingFields.map((field) => (
                                                        <Badge key={field} variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                            {organizationFieldLabels[field] || field}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card className="border border-gray-200 dark:border-gray-700 shadow-none">
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center gap-2">
                                                <GitBranch className="h-4 w-4 text-indigo-600" />
                                                <CardTitle className="text-base">Branch Master Data</CardTitle>
                                            </div>
                                            <CardDescription>
                                                Branches without a BHF ID will fail fiscalization. You can backfill the missing value directly here.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="pt-0 space-y-4">
                                            <div className="flex flex-wrap gap-2 text-xs">
                                                <Badge variant="outline" className="rounded-full">
                                                    Ready: {readiness.branches.readyCount}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                    Missing BHF ID: {readiness.branches.missingFieldCounts.bhfId}
                                                </Badge>
                                            </div>

                                            {!isAuthorized && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    An organization admin is required to save branch backfill changes.
                                                </p>
                                            )}

                                            {readiness.branches.items.length === 0 ? (
                                                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    <span className="text-sm">All active branches have the required VSDC BHF ID.</span>
                                                </div>
                                            ) : (
                                                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
                                                    <Table>
                                                        <TableHeader className="bg-gray-50/70 dark:bg-gray-900/60">
                                                            <TableRow>
                                                                <TableHead>Name</TableHead>
                                                                <TableHead>Code</TableHead>
                                                                <TableHead>Location</TableHead>
                                                                <TableHead>Missing fields</TableHead>
                                                                <TableHead>BHF ID</TableHead>
                                                                <TableHead className="text-right">Action</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {readiness.branches.items.map((branch) => {
                                                                const branchDraft = branchBackfillDrafts[branch.id] ?? { bhfId: branch.bhfId ?? '' };
                                                                const canSaveBranch = branchDraft.bhfId.trim().length > 0;

                                                                return (
                                                                    <TableRow key={branch.id}>
                                                                        <TableCell className="font-medium">{branch.name}</TableCell>
                                                                        <TableCell>
                                                                            <code className="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-700">{branch.code}</code>
                                                                        </TableCell>
                                                                        <TableCell>{branch.location || branch.address || 'Not set'}</TableCell>
                                                                        <TableCell>
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {branch.missingFields.map((field) => (
                                                                                    <Badge key={field} variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                                                        {branchFieldLabels[field] || field}
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell className="min-w-[180px]">
                                                                            <Input
                                                                                value={branchDraft.bhfId}
                                                                                onChange={(e) => handleBranchBackfillDraftChange(branch.id, e.target.value)}
                                                                                placeholder="e.g. 00"
                                                                                disabled={!isAuthorized || savingBranchBackfillId === branch.id}
                                                                                className="h-9 rounded-lg font-mono text-xs uppercase"
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="text-right">
                                                                            <Button
                                                                                size="sm"
                                                                                onClick={() => handleBranchBackfillSave(branch)}
                                                                                disabled={!isAuthorized || savingBranchBackfillId === branch.id || !canSaveBranch}
                                                                                className="rounded-lg"
                                                                            >
                                                                                {savingBranchBackfillId === branch.id ? (
                                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                                ) : (
                                                                                    <>
                                                                                        <Save className="h-4 w-4 mr-2" />
                                                                                        Save
                                                                                    </>
                                                                                )}
                                                                            </Button>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                );
                                                            })}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card className="border border-gray-200 dark:border-gray-700 shadow-none">
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center gap-2">
                                                <Package className="h-4 w-4 text-blue-600" />
                                                <CardTitle className="text-base">Product Master Data</CardTitle>
                                            </div>
                                            <CardDescription>
                                                Products missing official item and unit codes will now be blocked from fiscalization. You can backfill the codes directly from this table.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="pt-0 space-y-4">
                                            <div className="flex flex-wrap gap-2 text-xs">
                                                <Badge variant="outline" className="rounded-full">
                                                    Ready: {readiness.products.readyCount}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                    Missing item code: {readiness.products.missingFieldCounts.itemCode}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                    Missing item class: {readiness.products.missingFieldCounts.itemClassCode}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                    Missing package unit: {readiness.products.missingFieldCounts.packageUnitCode}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                    Missing quantity unit: {readiness.products.missingFieldCounts.quantityUnitCode}
                                                </Badge>
                                            </div>

                                            {!isAuthorized && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    An organization admin is required to save product backfill changes.
                                                </p>
                                            )}

                                            {readiness.products.items.length === 0 ? (
                                                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    <span className="text-sm">All active products have the required VSDC item and unit codes.</span>
                                                </div>
                                            ) : (
                                                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
                                                    <Table>
                                                        <TableHeader className="bg-gray-50/70 dark:bg-gray-900/60">
                                                            <TableRow>
                                                                <TableHead>ID</TableHead>
                                                                <TableHead>Product</TableHead>
                                                                <TableHead>SKU</TableHead>
                                                                <TableHead>Category</TableHead>
                                                                <TableHead>Qty</TableHead>
                                                                <TableHead>Missing fields</TableHead>
                                                                <TableHead>Item code</TableHead>
                                                                <TableHead>Item class</TableHead>
                                                                <TableHead>Package unit</TableHead>
                                                                <TableHead>Quantity unit</TableHead>
                                                                <TableHead className="text-right">Action</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {readiness.products.items.map((product) => {
                                                                const productDraft = productBackfillDrafts[product.id] ?? {
                                                                    itemCode: product.itemCode ?? '',
                                                                    itemClassCode: product.itemClassCode ?? '',
                                                                    packageUnitCode: product.packageUnitCode ?? '',
                                                                    quantityUnitCode: product.quantityUnitCode ?? '',
                                                                };
                                                                const canSaveProduct = Object.values(productDraft).every((value) => value.trim().length > 0);

                                                                return (
                                                                    <TableRow key={product.id}>
                                                                        <TableCell>
                                                                            <code className="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-700">{product.id}</code>
                                                                        </TableCell>
                                                                        <TableCell className="font-medium">{product.name}</TableCell>
                                                                        <TableCell>{product.sku || 'Not set'}</TableCell>
                                                                        <TableCell>{product.category || 'Uncategorized'}</TableCell>
                                                                        <TableCell>{product.quantity}</TableCell>
                                                                        <TableCell>
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {product.missingFields.map((field) => (
                                                                                    <Badge key={field} variant="outline" className="rounded-full border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                                                        {productFieldLabels[field] || field}
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell className="min-w-[150px]">
                                                                            <Input
                                                                                value={productDraft.itemCode}
                                                                                onChange={(e) => handleProductBackfillDraftChange(product.id, 'itemCode', e.target.value)}
                                                                                placeholder="Official item code"
                                                                                disabled={!isAuthorized || savingProductBackfillId === product.id}
                                                                                className={`h-9 rounded-lg font-mono text-xs uppercase ${product.missingFields.includes('itemCode') ? 'border-amber-300 focus-visible:ring-amber-500' : ''}`}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="min-w-[150px]">
                                                                            <Input
                                                                                value={productDraft.itemClassCode}
                                                                                onChange={(e) => handleProductBackfillDraftChange(product.id, 'itemClassCode', e.target.value)}
                                                                                placeholder="Official class code"
                                                                                disabled={!isAuthorized || savingProductBackfillId === product.id}
                                                                                className={`h-9 rounded-lg font-mono text-xs uppercase ${product.missingFields.includes('itemClassCode') ? 'border-amber-300 focus-visible:ring-amber-500' : ''}`}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="min-w-[150px]">
                                                                            <Input
                                                                                value={productDraft.packageUnitCode}
                                                                                onChange={(e) => handleProductBackfillDraftChange(product.id, 'packageUnitCode', e.target.value)}
                                                                                placeholder="Official package unit"
                                                                                disabled={!isAuthorized || savingProductBackfillId === product.id}
                                                                                className={`h-9 rounded-lg font-mono text-xs uppercase ${product.missingFields.includes('packageUnitCode') ? 'border-amber-300 focus-visible:ring-amber-500' : ''}`}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="min-w-[150px]">
                                                                            <Input
                                                                                value={productDraft.quantityUnitCode}
                                                                                onChange={(e) => handleProductBackfillDraftChange(product.id, 'quantityUnitCode', e.target.value)}
                                                                                placeholder="Official quantity unit"
                                                                                disabled={!isAuthorized || savingProductBackfillId === product.id}
                                                                                className={`h-9 rounded-lg font-mono text-xs uppercase ${product.missingFields.includes('quantityUnitCode') ? 'border-amber-300 focus-visible:ring-amber-500' : ''}`}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="text-right">
                                                                            <Button
                                                                                size="sm"
                                                                                onClick={() => handleProductBackfillSave(product)}
                                                                                disabled={!isAuthorized || savingProductBackfillId === product.id || !canSaveProduct}
                                                                                className="rounded-lg"
                                                                            >
                                                                                {savingProductBackfillId === product.id ? (
                                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                                ) : (
                                                                                    <>
                                                                                        <Save className="h-4 w-4 mr-2" />
                                                                                        Save
                                                                                    </>
                                                                                )}
                                                                            </Button>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                );
                                                            })}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </>
                            ) : (
                                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span className="text-sm">VSDC readiness data is not available yet.</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Branch Upsert Dialog */}
            <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-indigo-600 text-white">
                        <DialogTitle className="text-xl font-bold">
                            {editingBranch ? 'Edit Branch' : 'Create New Branch'}
                        </DialogTitle>
                        <DialogDescription className="text-indigo-100">
                            Enter the details for your business branch.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-4 bg-white dark:bg-gray-800">
                        <div className="space-y-2">
                            <Label htmlFor="branch-name">Branch Name</Label>
                            <Input
                                id="branch-name"
                                value={branchFormData.name}
                                onChange={(e) => setBranchFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="e.g. Kigali Heights, Downtown Outlet"
                                className="rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="branch-code">Branch Identifier/Code</Label>
                            <Input
                                id="branch-code"
                                value={branchFormData.code}
                                onChange={(e) => setBranchFormData(prev => ({ ...prev, code: e.target.value }))}
                                placeholder="e.g. KGL-01, DWT-02"
                                className="rounded-xl font-mono text-sm uppercase"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="branch-bhf-id">VSDC BHF ID</Label>
                            <Input
                                id="branch-bhf-id"
                                value={branchFormData.bhfId}
                                onChange={(e) => setBranchFormData(prev => ({ ...prev, bhfId: e.target.value }))}
                                placeholder="e.g. 00, 01, 12"
                                className="rounded-xl font-mono text-sm uppercase"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="branch-location">Location / Area</Label>
                            <Input
                                id="branch-location"
                                value={branchFormData.location}
                                onChange={(e) => setBranchFormData(prev => ({ ...prev, location: e.target.value }))}
                                placeholder="e.g. Gasabo, Kigali"
                                className="rounded-xl"
                            />
                        </div>
                    </div>
                    <DialogFooter className="p-6 bg-gray-50 dark:bg-gray-900/50 flex gap-2">
                        <Button variant="ghost" onClick={() => setBranchDialogOpen(false)} className="rounded-xl">
                            Cancel
                        </Button>
                        <Button onClick={handleBranchSave} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4">
                            {editingBranch ? 'Update Branch' : 'Create Branch'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
