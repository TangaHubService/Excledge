import { useState, useEffect } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { apiClient } from '../../lib/api-client';

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
  const [organizations, setOrganizations] = useState<MyOrg[]>([]);
  const [loading, setLoading] = useState(true);

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
          Organisations you own or have access to.
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
                <div className="flex items-center px-6 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MyOrganisations;
