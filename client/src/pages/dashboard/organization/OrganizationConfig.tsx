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
    Star
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
    currency?: string;
    isActive: boolean;
    createdAt: string;
    avatar?: string;
};

interface Branch {
    id: number;
    name: string;
    code: string;
    address?: string;
    location?: string;
    status: 'ACTIVE' | 'INACTIVE';
}

export function OrganizationConfig() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { setOrganization: updateGlobalOrg } = useOrganization();

    const [organization, setOrganization] = useState<OrganizationData | null>(null);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSavingOrg, setIsSavingOrg] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

    // Branch dialog state
    const [branchDialogOpen, setBranchDialogOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [branchFormData, setBranchFormData] = useState({
        name: '',
        code: '',
        address: '',
        location: '',
        status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE'
    });

    const isAuthorized = user?.role === 'ADMIN' || user?.role === 'SYSTEM_OWNER';

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const orgId = localStorage.getItem('current_organization_id');
            if (orgId) {
                const [orgResponse, branchesResponse] = await Promise.all([
                    apiClient.getOrganization(orgId),
                    apiClient.getBranches()
                ]);

                if (orgResponse?.organization) {
                    setOrganization(orgResponse.organization);
                }
                setBranches(branchesResponse || []);
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to fetch settings');
        } finally {
            setLoading(false);
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
            await apiClient.updateBranch(branch.id, { ...branch, status: newStatus });
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
                <TabsList className="grid w-full grid-cols-2 lg:w-[400px] bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                    <TabsTrigger value="details" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm">
                        <Building2 className="h-4 w-4 mr-2" />
                        Details
                    </TabsTrigger>
                    <TabsTrigger value="branches" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm">
                        <GitBranch className="h-4 w-4 mr-2" />
                        Branches
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
                                        <TableHead>Location</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {branches.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-12 text-gray-500">
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
