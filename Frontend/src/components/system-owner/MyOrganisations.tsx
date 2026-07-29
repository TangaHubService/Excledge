import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ExternalLink, Loader2, ChevronRight } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/AuthContext';
import { useOrganization } from '../../context/OrganizationContext';

interface MyOrg {
  id: number;
  name: string;
  businessType: string;
  address: string;
  phone: string;
  email: string;
  role: string;
  isOwner: boolean;
  isActive: boolean;
}

const MyOrganisations: React.FC = () => {
  const navigate = useNavigate();
  const { refreshUserProfile } = useAuth();
  const { setOrganization } = useOrganization();
  const [organizations, setOrganizations] = useState<MyOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<number | null>(null);

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        setLoading(true);
        const data = await apiClient.getUserOrganizations();
        const orgs = Array.isArray(data) ? data : (data.organizations || []);
        setOrganizations(orgs);
      } catch (err) {
        console.error('Failed to load organizations:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrgs();
  }, []);

  const handleViewOrg = async (org: MyOrg) => {
    if (switching !== null) return;
    setSwitching(org.id);
    try {
      localStorage.removeItem('branch_scope');
      localStorage.removeItem('selected_branch_ids');

      const response = await apiClient.switchOrganization({ organizationId: org.id });

      if (response.organization && response.token && response.user) {
        localStorage.setItem('current_organization_id', String(org.id));
        localStorage.setItem('organization', JSON.stringify({
          ...response.organization,
          role: org.role,
          isOwner: org.isOwner,
        }));

        setOrganization({
          id: response.organization.id,
          name: response.organization.name,
          businessType: response.organization.businessType,
          address: response.organization.address,
          phone: response.organization.phone,
          email: response.organization.email,
          avatar: response.organization.avatar,
          hasActiveSubscription: response.organization.hasActiveSubscription,
          role: org.role,
          isOwner: org.isOwner,
        });

        apiClient.setToken(response.token);
        localStorage.setItem('token', response.token);

        // Preserve SYSTEM_OWNER role
        await refreshUserProfile();

        navigate('/dashboard', { replace: true });
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to switch organization:', err);
    } finally {
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">My Organisations</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Organisations you own or have access to. Click View to open an organisation.
        </p>
      </div>

      {organizations.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">No organisations</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            You are not a member of any organisation yet.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg border border-gray-200 dark:border-gray-700">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {organizations.map((org) => (
              <li key={org.id}>
                <div className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <div className="flex items-center min-w-0 flex-1">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="ml-4 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {org.name}
                        </span>
                        {org.isOwner && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400">
                            Owner
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          {org.role}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span>{org.businessType}</span>
                        {org.email && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{org.email}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleViewOrg(org)}
                    disabled={switching === org.id}
                    className="ml-4 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {switching === org.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    {switching === org.id ? 'Opening...' : 'View'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-4">
        <p>
          You can also switch organisations using the organisation switcher in the sidebar header.
          To return to the System Admin dashboard, click the Excledge logo in the sidebar.
        </p>
      </div>
    </div>
  );
};

export default MyOrganisations;
