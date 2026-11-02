import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2, Plus, Search, Shield, User, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "../../../components/ui/drawer";
import { apiClient } from "../../../lib/api-client";
import { toast } from "react-toastify";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { AppToggle } from "../../../components/ui/AppToggle";
import { useTranslation } from "react-i18next";
import { useDebounce } from "../../../hooks/use-debounce";

interface User {
  id?: string;
  name?: string;
  email: string;
  role: string;
  branch?: string;
  isActive?: boolean;
}

const roleColors = {
  Admin:
    "bg-danger/15 text-danger dark:bg-danger/20 dark:text-red-400 border-danger/25 dark:border-red-800",
  Manager:
    "bg-primary/15 text-primary border-primary/30",
  Accountant:
    "bg-purple-500/15 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400 border-purple-500/25 dark:border-purple-800",
  Pharmacist:
    "bg-muted text-foreground border-border",
};

/** API returns `{ users, pagination }`; older clients may expect a bare array or `{ data }`. */
function usersFromListResponse(res: unknown): User[] {
  if (!res || typeof res !== "object") return [];
  const r = res as Record<string, unknown>;
  if (Array.isArray(r.users)) return r.users as User[];
  if (Array.isArray(r.data)) return r.data as User[];
  if (Array.isArray(res)) return res as User[];
  return [];
}

export const UserManagement = () => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 400);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [users, setUsers] = useState<User[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    role: "",
    branchId: "",
  });
  const [branches, setBranches] = useState<Array<{ id: number; name: string; code: string }>>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [disablingUserId, setDisablingUserId] = useState<string | null>(null);
  const [reactivatingUserId, setReactivatingUserId] = useState<string | null>(null);

  // Get current logged-in user
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  // Helper functions to determine user permissions
  const isCurrentUser = (userId?: string) => userId === currentUser.id;
  const isAdmin = (userRole: string) => userRole.toUpperCase() === 'ADMIN';
  const currentUserIsAdmin = isAdmin(currentUser.role || '');
  // Admins may edit anyone except themselves and other Admins (role/status changes on an
  // Admin are System-Owner-only; the backend enforces this too — this is UX, not the security boundary).
  const canEdit = (userId?: string, userRole?: string) =>
    currentUserIsAdmin && !isCurrentUser(userId) && !isAdmin(userRole || '');
  const canDisable = (userId?: string, userRole?: string) =>
    currentUserIsAdmin && !isCurrentUser(userId) && !isAdmin(userRole || '');

  const filteredUsers = users.filter(
    (user) =>
      user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        const params = {
          ...(statusFilter !== 'all' && { status: statusFilter }),
          ...(debouncedSearchTerm && { search: debouncedSearchTerm }),
          sortBy,
          sortOrder,
        };
        const response = await apiClient.getUsers(params);
        setUsers(usersFromListResponse(response));
      } catch (error) {
        console.error("Failed to fetch users:", error);
        toast.error(t('userManagement.failedToLoad'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, [t, statusFilter, debouncedSearchTerm, sortBy, sortOrder]);

  const sortHeader = (label: string, key: string) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-primary"
      onClick={() => {
        setSortOrder(sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc');
        setSortBy(key);
      }}
    >
      {label}
      {sortBy !== key ? <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" /> : sortOrder === 'asc'
        ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
        : <ChevronDown className="h-3.5 w-3.5 text-primary" />}
    </button>
  );

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const orgId = apiClient.getOrganizationId();
        if (!orgId) return;
        const response = await apiClient.getBranches();
        const data = Array.isArray(response) ? response : (response as any)?.branches ?? (response as any)?.data ?? [];
        setBranches(data);
      } catch {
        // Branches are optional; silently ignore
      }
    };
    fetchBranches();
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    try {
      setInviteLoading(true);

      // Validation: Only admins can assign admin role
      if (formData.role === 'ADMIN' && !currentUserIsAdmin) {
        toast.error(t('userManagement.noPermission'));
        setInviteLoading(false);
        return;
      }

      if (editingUserId) {
        // Update existing user's role
        const orgId = apiClient.getOrganizationId();
        await apiClient.request(`/users/${orgId}/update/${editingUserId}`, {
          method: "PUT",
          body: JSON.stringify({ role: formData.role }),
        });

        setUsers((prev) =>
          prev.map((u) => (u.id === editingUserId ? { ...u, role: formData.role } : u))
        );
        toast.success(t('userManagement.userUpdated'));
      } else {
        const invitePayload = {
          email: formData.email,
          role: formData.role,
          branchId: formData.branchId ? parseInt(formData.branchId) : null,
        };
        const response = await apiClient.inviteUser(invitePayload);

        // Check the response type
        if (response.invitation) {
          // Invitation sent (for existing or new users)
          toast.success(t('userManagement.invitationSent'));
        } else if (response.message && response.message.includes("added to organization")) {
          // Direct addition (fallback case)
          toast.success(t('userManagement.userAdded'));
          // Refresh the users list to show the newly added user
          const updatedUsers = await apiClient.getUsers();
          setUsers(usersFromListResponse(updatedUsers));
        } else {
          // New user invitation
          toast.success(t('userManagement.userInvited'));
        }
      }

      setInviteLoading(false);
      setIsDialogOpen(false);
      setEditingUserId(null);
    } catch (error: unknown) {
      console.error("Failed to create/update user:", error);
      const errorMessage = error instanceof Error ? error.message : t('userManagement.failedToInvite');
      toast.error(errorMessage);
    }
    setFormData({ email: "", role: "", branchId: "" });
  };

  const handleDisableUser = async (userId?: string) => {
    if (!userId) return;
    setDisablingUserId(userId);
    try {
      // find user
      const user = users.find((u) => u.id === userId);
      if (!user) return;

      const orgId = apiClient.getOrganizationId();
      const newIsActive = !user.isActive;

      await apiClient.request(`/users/${orgId}/update/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: newIsActive }),
      });

      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: newIsActive } : u)));
      toast.success(newIsActive ? t('userManagement.userEnabled') : t('userManagement.userDisabled'));
    } catch (error) {
      console.error("Failed to toggle user status:", error);
      toast.error(t('userManagement.failedToUpdate'));
    } finally {
      setDisablingUserId(null);
    }
  };

  const handleReactivateUser = async (userId?: string) => {
    if (!userId) return;
    setReactivatingUserId(userId);
    try {
      const orgId = apiClient.getOrganizationId();
      await apiClient.reactivateUser(orgId, userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: true } : u)));
      toast.success(t('userManagement.userReactivated'));
    } catch (error) {
      console.error("Failed to reactivate user:", error);
      toast.error(t('userManagement.failedToReactivate'));
    } finally {
      setReactivatingUserId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="h-8 bg-muted rounded w-64 mb-2"></div>
              <div className="h-4 bg-muted rounded w-48"></div>
            </div>
            <div className="h-10 bg-muted rounded-md w-32"></div>
          </div>

          {/* Search and Filter Skeleton */}
          <div className="flex items-center justify-between mb-6">
            <div className="w-1/3">
              <div className="h-10 bg-muted rounded-md"></div>
            </div>
            <div className="flex space-x-2">
              <div className="h-10 bg-muted rounded-md w-24"></div>
              <div className="h-10 bg-muted rounded-md w-32"></div>
            </div>
          </div>

          {/* Table Skeleton */}
          <div className="bg-card rounded-lg shadow overflow-hidden">
            <TableSkeleton
              rows={5}
              columns={5}
              className="w-full"
              rowHeight="h-4"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t('userManagement.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('userManagement.description')}
            </p>
          </div>
          {currentUserIsAdmin && (
            <button
              onClick={() => setIsDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('userManagement.addUser')}
            </button>
          )}
        </div>

        {/* Role Permissions Info */}
        <div className="bg-card rounded-lg border border-border">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t('userManagement.rolePermissions')}
            </h2>
          </div>

          <div className="p-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border bg-danger/15 text-danger dark:bg-danger/20 dark:text-red-400 border-danger/25 dark:border-red-800">
                  {t('userManagement.roles.admin')}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t('userManagement.roles.adminDesc')}
                </p>
              </div>
              <div className="space-y-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border bg-purple-500/15 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400 border-purple-500/25 dark:border-purple-800">
                  {t('userManagement.roles.accountant')}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t('userManagement.roles.accountantDesc')}
                </p>
              </div>
              <div className="space-y-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border bg-muted text-foreground border-border">
                  {t('userManagement.roles.seller')}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t('userManagement.roles.sellerDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-card rounded-lg border border-border">
          <div className="p-6 border-b border-border">
            <div className="flex gap-4 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t('userManagement.searchUsers')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg bg-card text-foreground placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'disabled')}
                className="px-3 py-2 border border-border rounded-lg bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">{t('common.all') || 'All'}</option>
                <option value="active">{t('common.active') || 'Active'}</option>
                <option value="disabled">{t('userManagement.disabled') || 'Disabled'}</option>
              </select>
            </div>
          </div>

          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-foreground">
                      {sortHeader(t('userManagement.user'), 'name')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-foreground">
                      {sortHeader('Email', 'email')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-foreground">
                      {sortHeader('Role', 'role')}
                    </th>

                    <th className="text-left py-3 px-4 text-sm font-medium text-foreground">
                      {sortHeader('Status', 'status')}
                    </th>

                    <th className="text-left py-3 px-4 text-sm font-medium text-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-border hover:bg-muted"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
                            <User className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {user.name}
                            </span>
                            {isCurrentUser(user.id) && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary/15 text-primary border border-primary/30">
                                {t('userManagement.you')}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border dark:text-white ${roleColors[user.role as keyof typeof roleColors]
                            }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${user.isActive === true
                            ? "bg-success/15 text-success dark:bg-success/20 dark:text-green-400 border-success/25 dark:border-green-800"
                            : "bg-muted text-foreground border-border"
                            }`}
                        >
                          {user.isActive ? t('common.active') : t('userManagement.disable')}d
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <div className="relative group">
                            <button
                              onClick={() => {
                                if (canEdit(user.id, user.role)) {
                                  setIsDialogOpen(true);
                                  setEditingUserId(user.id || null);
                                  setFormData({ email: user.email, role: user.role, branchId: "" });
                                }
                              }}
                              disabled={!canEdit(user.id, user.role)}
                              className={`px-3 py-1 text-sm rounded-lg transition-colors ${canEdit(user.id, user.role)
                                ? 'text-foreground hover:bg-muted'
                                : 'text-muted-foreground cursor-not-allowed opacity-60'
                                }`}
                            >
                              Edit
                            </button>
                            {!canEdit(user.id, user.role) && (
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                {t('userManagement.cannotEditOwn')}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!user.id) return;
                              try {
                                await apiClient.syncUserToRra(user.id);
                                toast.success(`Synced ${user.name || user.email} to RRA`);
                              } catch (e: unknown) {
                                toast.error(e instanceof Error ? e.message : 'RRA user sync failed');
                              }
                            }}
                            className="px-3 py-1 text-sm rounded-lg transition-colors text-foreground hover:bg-muted"
                            title="Push this user account to VSDC"
                          >
                            Sync RRA
                          </button>

                          <div className="relative group flex items-center gap-2 px-1">
                            <AppToggle
                              checked={!!user?.isActive}
                              onChange={() => canDisable(user?.id, user.role) && handleDisableUser(user?.id)}
                              disabled={!canDisable(user?.id, user.role)}
                              loading={disablingUserId === user.id}
                              size="small"
                              aria-label={user?.isActive ? t('userManagement.disable') : t('userManagement.enable')}
                            />
                            <span className="text-sm text-muted-foreground">
                              {disablingUserId === user.id
                                ? (user?.isActive ? t('userManagement.disabling') : t('userManagement.enabling'))
                                : (user?.isActive ? t('userManagement.disable') : t('userManagement.enable'))}
                            </span>
                            {!canDisable(user?.id, user.role) && disablingUserId !== user.id && (
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                {isCurrentUser(user.id)
                                  ? t('userManagement.cannotDisableOwn')
                                  : t('userManagement.adminCannotDisable')}
                              </div>
                            )}
                          </div>
                          {!user.isActive && canEdit(user.id, user.role) && (
                            <button
                              onClick={() => handleReactivateUser(user.id)}
                              disabled={reactivatingUserId === user.id}
                              className="px-3 py-1 text-sm rounded-lg transition-colors bg-success/15 text-success hover:bg-green-200 dark:bg-success/20 dark:text-green-400 dark:hover:bg-success/30 border border-success/25 dark:border-green-800"
                            >
                              {reactivatingUserId === user.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                t('userManagement.reactivate') || 'Reactivate'
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Add User Dialog */}
        <Drawer open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DrawerContent className="bg-card border-border w-full max-w-md mx-auto">
            <DrawerHeader className="flex items-center justify-between border-b border-border p-6">
              <DrawerTitle className="text-xl font-semibold text-foreground">
                {editingUserId ? t('userManagement.editUser') : t('userManagement.addUser')}
              </DrawerTitle>
              <DrawerClose asChild>
                <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </DrawerClose>
            </DrawerHeader>
            <div className="p-6 space-y-4">
              <em className="text-sm text-muted-foreground">
                {editingUserId
                  ? t('userManagement.updateUserRole')
                  : t('userManagement.inviteUserDesc')}
                {currentUserIsAdmin && " " + t('userManagement.adminNote')}
              </em>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  placeholder={t('userManagement.enterUserEmail')}
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={!!editingUserId}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Role
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{t('userManagement.selectRole')}</option>
                  {currentUserIsAdmin && <option value="ADMIN">ADMIN</option>}
                  <option value="BRANCH_MANAGER">BRANCH MANAGER</option>
                  <option value="ACCOUNTANT">ACCOUNTANT</option>
                  <option value="SELLER">SELLER</option>
                </select>
                {currentUserIsAdmin && (
                  <p className="text-xs text-muted-foreground">
                    {t('userManagement.onlyAdminsNote')}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Branch (optional)
                </label>
                <select
                  name="branchId"
                  value={formData.branchId}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">All branches (org-wide access)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Leave empty for org-wide access. Selecting a branch restricts the user to that branch only.
                </p>
              </div>
              <button
                onClick={handleSubmit}
                className="w-full px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors"
              >
                {inviteLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" /> {t('userManagement.inviting')}
                  </span>
                ) : (
                  t('userManagement.send')
                )}
              </button>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
};
