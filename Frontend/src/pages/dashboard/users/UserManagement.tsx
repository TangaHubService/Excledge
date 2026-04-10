import { useEffect, useState } from "react";
import { Loader2, Plus, Search, Shield, User, X } from "lucide-react";
import { apiClient } from "../../../lib/api-client";
import { toast } from "react-toastify";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { useTranslation } from "react-i18next";

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
    "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800",
  Manager:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  Accountant:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  Pharmacist:
    "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600",
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
  const [users, setUsers] = useState<User[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    role: "",
  });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [disablingUserId, setDisablingUserId] = useState<string | null>(null);

  // Get current logged-in user
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  // Helper functions to determine user permissions
  const isCurrentUser = (userId?: string) => userId === currentUser.id;
  const isAdmin = (userRole: string) => userRole.toUpperCase() === 'ADMIN';
  const currentUserIsAdmin = isAdmin(currentUser.role || '');
  const canEdit = (userId?: string) => currentUserIsAdmin && !isCurrentUser(userId);
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
        const response = await apiClient.getUsers();
        setUsers(usersFromListResponse(response));
      } catch (error) {
        console.error("Failed to fetch users:", error);
        toast.error(t('userManagement.failedToLoad'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, [t]);

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
        const response = await apiClient.inviteUser(formData);

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
    setFormData({ email: "", role: "" });
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-64 mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-48"></div>
            </div>
            <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md w-32"></div>
          </div>

          {/* Search and Filter Skeleton */}
          <div className="flex items-center justify-between mb-6">
            <div className="w-1/3">
              <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md"></div>
            </div>
            <div className="flex space-x-2">
              <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md w-24"></div>
              <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md w-32"></div>
            </div>
          </div>

          {/* Table Skeleton */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('userManagement.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t('userManagement.description')}
            </p>
          </div>
          {currentUserIsAdmin && (
            <button
              onClick={() => setIsDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('userManagement.addUser')}
            </button>
          )}
        </div>

        {/* Role Permissions Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t('userManagement.rolePermissions')}
            </h2>
          </div>

          <div className="p-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800">
                  {t('userManagement.roles.admin')}
                </span>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('userManagement.roles.adminDesc')}
                </p>
              </div>
              <div className="space-y-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400 border-purple-200 dark:border-purple-800">
                  {t('userManagement.roles.accountant')}
                </span>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('userManagement.roles.accountantDesc')}
                </p>
              </div>
              <div className="space-y-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                  {t('userManagement.roles.seller')}
                </span>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('userManagement.roles.sellerDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
              <input
                type="text"
                placeholder={t('userManagement.searchUsers')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                      {t('userManagement.user')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                      Role
                    </th>

                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                      Status
                    </th>

                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 dark:bg-blue-500">
                            <User className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {user.name}
                            </span>
                            {isCurrentUser(user.id) && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                {t('userManagement.you')}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
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
                            ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600"
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
                                if (canEdit(user.id)) {
                                  setIsDialogOpen(true);
                                  setEditingUserId(user.id || null);
                                  setFormData({ email: user.email, role: user.role });
                                }
                              }}
                              disabled={!canEdit(user.id)}
                              className={`px-3 py-1 text-sm rounded-lg transition-colors ${canEdit(user.id)
                                ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                : 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-60'
                                }`}
                            >
                              Edit
                            </button>
                            {!canEdit(user.id) && (
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                {t('userManagement.cannotEditOwn')}
                              </div>
                            )}
                          </div>

                          <div className="relative group">
                            <button
                              onClick={() => canDisable(user?.id, user.role) && handleDisableUser(user?.id)}
                              disabled={disablingUserId === user.id || !canDisable(user?.id, user.role)}
                              className={`px-3 py-1 text-sm rounded-lg transition-colors ${disablingUserId === user.id
                                ? 'text-gray-500 cursor-not-allowed opacity-60'
                                : canDisable(user?.id, user.role)
                                  ? 'text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                  : 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-60'
                                }`}
                            >
                              {disablingUserId === user.id ? (
                                <span className="flex items-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  {user?.isActive ? t('userManagement.disabling') : t('userManagement.enabling')}
                                </span>
                              ) : (
                                user?.isActive ? t('userManagement.disable') : t('userManagement.enable')
                              )}
                            </button>
                            {!canDisable(user?.id, user.role) && disablingUserId !== user.id && (
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                {isCurrentUser(user.id)
                                  ? t('userManagement.cannotDisableOwn')
                                  : t('userManagement.adminCannotDisable')}
                              </div>
                            )}
                          </div>
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
        {isDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {editingUserId ? t('userManagement.editUser') : t('userManagement.addUser')}
                </h2>
                <button
                  onClick={() => setIsDialogOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <em className="text-sm text-gray-600 dark:text-gray-400">
                  {editingUserId
                    ? t('userManagement.updateUserRole')
                    : t('userManagement.inviteUserDesc')}
                  {currentUserIsAdmin && " " + t('userManagement.adminNote')}
                </em>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-900 dark:text-white">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    placeholder={t('userManagement.enterUserEmail')}
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={!!editingUserId}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-60"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-900 dark:text-white">
                    Role
                  </label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  >
                    <option value="">{t('userManagement.selectRole')}</option>
                    {currentUserIsAdmin && <option value="ADMIN">ADMIN</option>}
                    <option value="ACCOUNTANT">ACCOUNTANT</option>
                    <option value="SELLER">SELLER</option>
                  </select>
                  {currentUserIsAdmin && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('userManagement.onlyAdminsNote')}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSubmit}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
