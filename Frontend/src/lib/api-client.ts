const API_URL = import.meta.env.VITE_PUBLIC_API_URL || 'http://localhost:5000';

const REFRESH_TOKEN_KEY = 'refresh_token';

// Helper function to handle JWT expiration and logout
const handleTokenExpiration = () => {
  // Clear all authentication-related data from localStorage
  localStorage.removeItem('token');
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem('user');
  localStorage.removeItem('current_organization_id');
  // Clear all localStorage to ensure clean state
  localStorage.clear();
  // Redirect to login page
  window.location.href = '/login';
};

/** Backend returns accessToken + refreshToken on login; older flows used token (e.g. switch-organization). */
function extractAccessToken(body: {
  accessToken?: string;
  token?: string;
  refreshToken?: string;
}): string | undefined {
  return body.accessToken ?? body.token;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("token", token);
    }
  }

  /** Store access + refresh tokens from login/refresh responses. */
  persistAuthFromResponse(body: {
    accessToken?: string;
    token?: string;
    refreshToken?: string;
  }) {
    const access = extractAccessToken(body);
    if (access) {
      this.setToken(access);
    }
    if (typeof window !== "undefined" && body.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, body.refreshToken);
    }
  }

  private authPathExemptFromRefreshRetry(endpoint: string): boolean {
    return (
      endpoint.startsWith('/auth/login') ||
      endpoint.startsWith('/auth/signup') ||
      endpoint.startsWith('/auth/refresh')
    );
  }

  private async tryRefreshAccessToken(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!rt) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.persistAuthFromResponse(data);
      return !!extractAccessToken(data);
    } catch {
      return false;
    }
  }

  /** When access JWT is expired, obtain a new pair using the stored refresh token (e.g. on app load). */
  async trySilentRefresh(): Promise<boolean> {
    return this.tryRefreshAccessToken();
  }

  getToken() {
    if (!this.token && typeof window !== "undefined") {
      this.token = localStorage.getItem("token");
    }
    return this.token;
  }

  getOrganizationId() {
    const organizationId = localStorage.getItem("current_organization_id");
    if (!organizationId) {
      throw new Error("Organization ID not found");
    }
    return organizationId;
  }

  async get(endpoint: string, options: RequestInit = {}) {
    const data = await this.request(endpoint, { ...options, method: "GET" });
    return { data }; // Wrap in data property to match Axios-like usage in some contexts
  }

  async getOrders(organizationId: string) {
    return this.request(`/organizations/${organizationId}/purchase-orders`, {
      method: 'GET',
    });
  }

  async request(
    endpoint: string,
    options: RequestInit & { _authRetried?: boolean } = {}
  ): Promise<any> {
    const { _authRetried, ...fetchOptions } = options;
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(fetchOptions.headers as Record<string, string>),
    };

    // Only set Content-Type to application/json if not FormData and not already set
    if (!(fetchOptions.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    if (
      response.status === 401 &&
      !_authRetried &&
      !this.authPathExemptFromRefreshRetry(endpoint) &&
      typeof window !== 'undefined'
    ) {
      const refreshed = await this.tryRefreshAccessToken();
      if (refreshed) {
        return this.request(endpoint, { ...fetchOptions, _authRetried: true });
      }
    }

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "An error occurred" }));
      const error = new Error(errorData.message || errorData.error || "An error occurred");
      // Attach response data for better error handling
      (error as any).response = {
        status: response.status,
        data: errorData
      };
      throw error;
    }

    return response.json();
  }

  async requestFile(endpoint: string, options: RequestInit = {}) {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      // Handle JWT expiration (401 Unauthorized)
      if (response.status === 401) {
        handleTokenExpiration();
        const error = new Error("Session expired. Please login again.");
        (error as any).response = {
          status: response.status,
          data: { error: "Unauthorized" }
        };
        throw error;
      }

      const errorData = await response
        .json()
        .catch(() => ({ error: "An error occurred" }));
      const error = new Error(errorData.message || errorData.error || "An error occurred");
      // Attach response data for better error handling
      (error as any).response = {
        status: response.status,
        data: errorData
      };
      throw error;
    }

    return response;
  }

  // Auth endpoints
  async signup(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) {
    const response = await this.request("/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    });
    this.persistAuthFromResponse(response);
    return response;
  }

  async login(data: { email: string; password: string }) {
    const response = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    this.persistAuthFromResponse(response);
    return response;
  }

  async switchOrganization(data: { organizationId: string | number }) {
    const response = await this.request("/auth/switch-organization", {
      method: "POST",
      body: JSON.stringify(data),
    });
    this.persistAuthFromResponse(response as { accessToken?: string; token?: string; refreshToken?: string });
    return response;
  }

  async logout() {
    localStorage.removeItem("token");
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  async changePassword(data: { currentPassword: string; newPassword: string }) {
    return this.request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    }
    );
  }

  async verifyAccount(data: { code: string }) {
    return this.request("/auth/verify-account", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async resendVerificationCode(data: { email: string }) {
    return this.request("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async resetPassword(data: { code: string; newPassword: string }) {
    return this.request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async requestPasswordReset(data: { email: string }) {
    return this.request("/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createOrganization(data: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  }) {
    return this.request("/organizations", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
    });
  }

  async getUserOrganizations() {
    return this.request("/organizations");
  }

  async getOrganization(id: string) {
    return this.request(`/organizations/${id}`);
  }

  async getOrganizationVsdcReadiness(id: string) {
    return this.request(`/organizations/${id}/vsdc-readiness`);
  }

  async getOrganizationVsdcSync(id: string) {
    return this.request(`/organizations/${id}/vsdc-sync`);
  }

  async runOrganizationVsdcSync(
    id: string,
    target: "ALL" | "INIT_INFO" | "CODE_TABLES" | "BRANCHES" | "NOTICES" = "ALL"
  ) {
    return this.request(`/organizations/${id}/vsdc-sync`, {
      method: "POST",
      body: JSON.stringify({ target }),
    });
  }

  async getOrganizationVsdcStockSync(id: string) {
    return this.request(`/organizations/${id}/vsdc-stock-sync`);
  }

  async runOrganizationVsdcStockSync(
    id: string,
    target: "ALL" | "BRANCH_MASTER" | "ITEM_MASTER" | "STOCK_MASTER" | "STOCK_MOVEMENTS" = "ALL"
  ) {
    return this.request(`/organizations/${id}/vsdc-stock-sync`, {
      method: "POST",
      body: JSON.stringify({ target }),
    });
  }

  async updateOrganization(data: any) {
    return this.request(`/organizations/${this.getOrganizationId()}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async updateProfile(formData: any, id: string | number) {
    return this.request(`/users/${this.getOrganizationId()}/update/${id}`, {
      method: "PUT",
      body: JSON.stringify(formData),
    });
  }

  async updateProfileImage(formData: FormData, id: string | number) {
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/users/profile-image/${id}`, {
      method: "PUT",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to update profile image" }));
      throw new Error(error.error || "Failed to update profile image");
    }

    return response.json();
  }

  async uploadAvatar(formData: FormData) {
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/organizations/avatar/${this.getOrganizationId()}`, {
      method: "PUT",
      headers,
      body: formData,
    });

    if (!response.ok) {
      // Handle JWT expiration (401 Unauthorized)
      if (response.status === 401) {
        handleTokenExpiration();
        throw new Error("Session expired. Please login again.");
      }
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to upload avatar" }));
      throw new Error(error.error || "Failed to upload avatar");
    }

    return response.json();
  }

  // Dashboard endpoints
  async getDashboardStats(days = "7") {
    return this.request(`/dashboard/stats/${this.getOrganizationId()}?days=${days}`);
  }

  async getSalesTrend(days = "7") {
    return this.request(
      `/dashboard/sales-trend/${this.getOrganizationId()}?days=${days}`
    );
  }

  async getTopSellingProducts() {
    return this.request(`/dashboard/${this.getOrganizationId()}/top-selling-products`);
  }

  async getDetailedInventory(query?: any) {
    return this.request(`/dashboard/${this.getOrganizationId()}/detailed-inventory?${query}`);
  }

  async getNotifications() {
    return this.request(`/dashboard/notifications/${this.getOrganizationId()}`);
  }

  async fetchNotifications(params?: { unread?: boolean; page?: number; pageSize?: number }) {
    const query = params ? `?${new URLSearchParams({
      ...(params.unread !== undefined ? { unread: String(params.unread) } : {}),
      ...(params.page ? { page: String(params.page) } : {}),
      ...(params.pageSize ? { pageSize: String(params.pageSize) } : {}),
    }).toString()}` : '';
    return this.request(`/notifications/${this.getOrganizationId()}${query}`);
  }

  async markNotificationRead(id: string) {
    return this.request(`/notifications/${this.getOrganizationId()}/${id}/read`, {
      method: 'PATCH',
    });
  }

  // Add to api-client.ts
  async refundSale(saleId: string, data: { reason?: string; items?: Array<{ saleItemId: string; quantity: number }> }) {
    const organizationId = this.getOrganizationId();
    return this.request(`/sales/${saleId}/refund/${organizationId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Activity Logs endpoints
  async getActivityLogs(params?: {
    startDate?: string;
    endDate?: string;
    userId?: string;
    type?: string;
    entityType?: string;
    entityId?: string;
    page?: number;
    limit?: number;
  }) {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return this.request(`/activity-logs/${this.getOrganizationId()}${query}`);
  }

  // Sales endpoints
  async createSale(data: any) {
    return this.request(`/sales/${this.getOrganizationId()}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSales(params?: any) {
    const query = new URLSearchParams({ ...params }).toString();
    return this.request(`/sales/${this.getOrganizationId()}?${query}`);
  }

  async getSale(id: string) {
    return this.request(`/sales/${this.getOrganizationId()}/${id}`);
  }

  async recordSaleReprint(id: string) {
    return this.request(`/sales/${this.getOrganizationId()}/${id}/reprint`, {
      method: "POST",
    });
  }

  async recordPayment(id: string, data: { amount: number }) {
    return this.request(`/sales/${id}/${this.getOrganizationId()}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Inventory endpoints
  async getProducts(params?: Record<string, any>) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return this.request(`/inventory/products/${this.getOrganizationId()}${query}`);
  }

  async createProduct(data: any) {
    return this.request(`/inventory/${this.getOrganizationId()}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createProducts(data: any, branchId?: number | null) {
    const query = branchId ? `?branchId=${branchId}` : "";
    return this.request(`/inventory/${this.getOrganizationId()}/products${query}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProduct(id: string, data: any) {
    return this.request(`/inventory/${this.getOrganizationId()}/product/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProduct(id: string) {
    return this.request(`/inventory/${this.getOrganizationId()}/product/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
    });
  }

  async getExpiringProducts(params?: any) {
    const query = new URLSearchParams({
      organizationId: this.getOrganizationId(),
      ...params,
    }).toString();
    return this.request(`/inventory/products/${this.getOrganizationId()}/expiring?${query}`);
  }

  // Customer endpoints
  async getCustomers(params?: any) {
    const query = new URLSearchParams({ ...params }).toString();
    return this.request(`/customers/${this.getOrganizationId()}?${query}`);
  }

  async getCustomerById(id: string, organizationId?: string | number) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(`/customers/${org}/${id}`);
  }

  async createCustomer(data: any) {
    return this.request(`/customers/${this.getOrganizationId()}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCustomer(id: string, data: any) {
    return this.request(`/customers/${id}/${this.getOrganizationId()}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getCustomerDebtors() {
    return this.request(`/customers/debtors?pharmacyId=${this.getOrganizationId()}`);
  }

  async profile() {
    return this.request("/auth/me",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      }
    );
  }

  // System Owner endpoints
  async getSystemOwnerDashboardStats() {
    return this.request('/system-owner/dashboard/stats');
  }

  // User endpoints
  async getUsers() {
    return this.request(`/users/${this.getOrganizationId()}`);
  }

  async inviteUser(data: { email: string; role: string }) {
    return this.request(`/organizations/${this.getOrganizationId()}/invite`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async bulkInviteUsers(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("organizationId", this.getOrganizationId());

    const token = this.getToken();
    const response = await fetch(`${API_URL}/organizations/${this.getOrganizationId()}/bulk-invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      // Handle JWT expiration (401 Unauthorized)
      if (response.status === 401) {
        handleTokenExpiration();
        throw new Error("Session expired. Please login again.");
      }
      const error = await response
        .json()
        .catch(() => ({ error: "An error occurred" }));
      throw new Error(error.error || "An error occurred");
    }

    return response.json();
  }

  async getInvitationDetails(token: string) {
    return this.request(`/organizations/get-invitation/${token}`);
  }

  async acceptInvitation(token: string, name: string) {
    return this.request(`/organizations/accept-invitation/${token}`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async declineInvitation(token: string) {
    return this.request(`/organizations/decline-invitation/${token}`);
  }

  async getExpiredProducts(params?: any) {
    const query = new URLSearchParams(params).toString();
    return this.request(
      `/inventory/products/${this.getOrganizationId()}/expired?${query}`
    );
  }

  async getLowStockProducts(params?: any) {
    const query = new URLSearchParams(params).toString();
    return this.request(
      `/inventory/products/${this.getOrganizationId()}/low-stock?${query}`
    );
  }

  // Reports endpoints
  async getSalesReport(filters: {
    startDate: string;
    endDate: string;
    category?: string;
    status?: string;
    sellerId?: string;
    product?: string;
    maxAmount?: number;
    page?: number;
    limit?: number;
    branchId?: number | null;
  }) {
    const params = new URLSearchParams({
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    if (filters.category && filters.category !== 'all') {
      params.append('category', filters.category);
    }
    if (filters.status && filters.status !== 'all') {
      params.append('status', filters.status);
    }
    if (filters.sellerId && filters.sellerId !== 'all') {
      params.append('sellerId', filters.sellerId);
    }
    if (filters.product) {
      params.append('product', filters.product);
    }
    if (filters.page) {
      params.append('page', filters.page.toString());
    }
    if (filters.limit) {
      params.append('limit', filters.limit.toString());
    }
    if (filters.branchId !== undefined) {
      params.append('branchId', filters.branchId === null ? 'null' : filters.branchId.toString());
    }

    return this.request(
      `/reports/sales/${this.getOrganizationId()}?${params.toString()}`
    );
  }

  async getInventoryReport(query?: any) {
    const params = new URLSearchParams(query);
    return this.request(`/reports/inventory/${this.getOrganizationId()}?${params.toString()}`);
  }

  async getDebtorsReport() {
    return this.request(`/reports/debtors/${this.getOrganizationId()}`);
  }

  async getDebtPaymentsReport(startDate: string, endDate: string) {
    return this.request(
      `/reports/debt-payments/${this.getOrganizationId()}?startDate=${startDate}&endDate=${endDate}`
    );
  }

  async getCashFlowReport(startDate: string, endDate: string) {
    return this.request(
      `/reports/cash-flow/${this.getOrganizationId()}?startDate=${startDate}&endDate=${endDate}`
    );
  }

  async getStockReport(params: { startDate: string; endDate: string; productId?: string; category?: string }) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/reports/stock/${this.getOrganizationId()}?${query}`);
  }

  async getStockHistory(params: {
    productId?: string;
    batchNumber?: string;
    startDate?: string;
    endDate?: string;
    userId?: string;
    type?: string;
    limit?: number;
    page?: number;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/reports/stock-history/${this.getOrganizationId()}?${query}`);
  }

  async exportReport(reportType: string, params: any) {
    const query = new URLSearchParams(params).toString();
    const token = this.getToken();
    const response = await fetch(`${API_URL}/reports/export/${reportType}/${this.getOrganizationId()}?${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Handle JWT expiration (401 Unauthorized)
      if (response.status === 401) {
        handleTokenExpiration();
        throw new Error("Session expired. Please login again.");
      }
      throw new Error("Export failed");
    }

    const blob = await response.blob();
    return blob;
  }

  // System Owner endpoints
  async getSystemOwnerStats() {
    return this.request(`/system-owner/dashboard/stats/${this.getOrganizationId()}`);
  }

  async getAllPharmacies(params?: any) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return this.request(`/system-owner/pharmacies${query}`);
  }

  async updatePharmacyStatus(id: string, isActive: boolean) {
    return this.request(`/system-owner/pharmacies/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
  }

  async getAllSubscriptions(params?: any) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return this.request(`/system-owner/subscriptions${query}`);
  }

  async getRevenueAnalytics(period = "monthly") {
    return this.request(`/system-owner/analytics/revenue?period=${period}`);
  }

  // Subscription endpoints
  async getPharmacySubscription() {
    return this.request(`/subscriptions/organization/${this.getOrganizationId()}`);
  }

  async createSubscription(data: { planType: string }) {
    return this.request("/subscriptions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async renewSubscription(id: string) {
    return this.request(`/subscriptions/${id}/renew`, {
      method: "POST",
    });
  }

  // Payment endpoints
  async verifyPayment(id: string) {
    return this.request(`/payments/${id}/verify`, {
      method: "POST",
    });
  }
  // Supplier endpoints
  async getSuppliers(organizationId: string | number, params?: any) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    const response = await this.request(`/suppliers/${organizationId}${query}`);
    return Array.isArray(response) ? { suppliers: response } : response;
  }

  async createSupplier(organizationId: string | number, data: any) {
    return this.request(`/suppliers/${organizationId}`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async updateSupplier(id: string | number, data: any, organizationId?: string | number) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(`/suppliers/${org}/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  async deleteSupplier(id: string | number, organizationId?: string | number) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(`/suppliers/${org}/${id}`, {
      method: "DELETE",
    })
  }

  async deleteCustomer(id: string, organizationId?: string | number) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(`/customers/${id}/${org}`, {
      method: "DELETE",
    })
  }

  // Purchase Order endpoints
  async getPurchaseOrders(organizationId: string | number, params?: any) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : ""
    return this.request(`/purchase-orders/${organizationId}${query}`)
  }

  async createPurchaseOrder(organizationId: string | number, data: any) {
    return this.request(`/purchase-orders/${organizationId}`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async updatePurchaseOrderStatus(
    id: string | number,
    status: string,
    organizationId?: string | number,
    options?: {
      branchId?: number | null;
      receivedItems?: Array<{
        productId: number;
        quantity?: number;
        unitCost?: number;
        batchNumber?: string;
        expiryDate?: string;
      }>;
    }
  ) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(`/purchase-orders/${org}/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        branchId: options?.branchId,
        receivedItems: options?.receivedItems,
      }),
    })
  }

  async getPurchaseOrder(id: string | number) {
    return this.request(`/purchase-orders/${id}`)
  }

  async deletePurchaseOrder(id: string | number, organizationId?: string | number) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(`/purchase-orders/${org}/${id}`, {
      method: "DELETE",
    })
  }

  private stockTransferBranchQs(branchId?: number | null) {
    if (branchId === undefined || branchId === null) return "";
    return `?branchId=${branchId}`;
  }

  async getStockTransfers(organizationId?: string | number, branchId?: number | null) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(`/stock-transfers/${org}${this.stockTransferBranchQs(branchId)}`);
  }

  async createStockTransfer(
    organizationId: string | number,
    data: {
      fromBranchId: number;
      toBranchId: number;
      notes?: string;
      items: Array<{ productId: number; quantity: number }>;
    },
    branchId?: number | null
  ) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(`/stock-transfers/${org}${this.stockTransferBranchQs(branchId)}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async approveStockTransfer(
    organizationId: string | number,
    id: number,
    branchId?: number | null
  ) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(
      `/stock-transfers/${org}/${id}/approve${this.stockTransferBranchQs(branchId)}`,
      { method: "POST" }
    );
  }

  async rejectStockTransfer(
    organizationId: string | number,
    id: number,
    branchId?: number | null
  ) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(
      `/stock-transfers/${org}/${id}/reject${this.stockTransferBranchQs(branchId)}`,
      { method: "POST" }
    );
  }

  async completeStockTransfer(
    organizationId: string | number,
    id: number,
    branchId?: number | null
  ) {
    const org = organizationId ?? this.getOrganizationId();
    return this.request(
      `/stock-transfers/${org}/${id}/complete${this.stockTransferBranchQs(branchId)}`,
      { method: "POST" }
    );
  }

  // In your api-client.ts or similar file

  // Record a debt payment
  async recordDebtPayment(saleId: string, data: {
    amount: number;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
  }) {
    return this.request(`/debt-payments/${saleId}/${this.getOrganizationId()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Get payment history for a sale
  async getSalePaymentHistory(saleId: string) {
    return this.request(`/debt-payments/sale/${saleId}/${this.getOrganizationId()}`);
  }

  // Get payment history for a customer
  async getCustomerPaymentHistory(customerId: string) {
    return this.request(`/debt-payments/customer/${customerId}/${this.getOrganizationId()}`);
  }

  // Get outstanding debts
  async getOutstandingDebts() {
    return this.request(`/debt-payments/outstanding/${this.getOrganizationId()}`);
  }

  // Get all payment history with optional filters
  async getAllPaymentHistory(filters: {
    paymentMethod?: string;
    customerName?: string;
    recordedByName?: string;
    startDate?: string;
    endDate?: string;
  } = {}) {
    const queryParams = new URLSearchParams();

    if (filters.paymentMethod) queryParams.append('paymentMethod', filters.paymentMethod);
    if (filters.customerName) queryParams.append('customerName', filters.customerName);
    if (filters.recordedByName) queryParams.append('recordedByName', filters.recordedByName);
    if (filters.startDate) queryParams.append('startDate', filters.startDate);
    if (filters.endDate) queryParams.append('endDate', filters.endDate);

    const queryString = queryParams.toString();
    return this.request(`/debt-payments/all/${this.getOrganizationId()}${queryString ? '?' + queryString : ''}`);
  }

  async getOrganizationSubscriptions() {
    const organizationId = this.getOrganizationId();
    return this.request(`/subscriptions/organizations/${organizationId}/subscriptions`);
  };

  async getPaymentHistory() {
    const organizationId = this.getOrganizationId();
    const token = this.getToken();
    const response = this.request(
      `/subscriptions/organizations/${organizationId}/payments`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response;
  };

  async initiatePesapalPayment(planId: string) {
    const organizationId = this.getOrganizationId();
    return this.request(`/subscriptions/organizations/${organizationId}/plans/${planId}/pesapal/initiate`, {
      method: "POST",
    });
  };

  async verifyPesapalPayment(orderTrackingId: string, planId: string) {
    return this.request(`/pesapal/organizations/${this.getOrganizationId()}/plans/${planId}/transaction-status/${orderTrackingId}`);
  }

  async processPesapalWebhook(orderTrackingId: string, merchantReference: string) {
    return this.request(`/pesapal/callback`, {
      method: "POST",
      body: JSON.stringify({
        OrderTrackingId: orderTrackingId,
        OrderNotificationType: "CALLBACK",
        OrderMerchantReference: merchantReference
      }),
    });
  }
  async cancelSubscription(subscriptionId: string) {
    const organizationId = this.getOrganizationId();
    return this.request(`/subscriptions/organizations/${organizationId}/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
    });
  }
  async reactivateSubscription(subscriptionId: string) {
    const organizationId = this.getOrganizationId();
    return this.request(`/subscriptions/organizations/${organizationId}/subscriptions/${subscriptionId}/reactivate`, {
      method: "POST",
    });
  }

  // ============================================
  // Inventory Ledger Endpoints
  // ============================================

  /**
   * Add stock to inventory (Stock IN)
   * @param data Stock addition details
   */
  async addStockToInventory(data: {
    productId: number;
    quantity: number;
    movementType: 'PURCHASE' | 'RETURN_CUSTOMER' | 'TRANSFER_IN' | 'INITIAL_STOCK' | 'ADJUSTMENT_IN';
    warehouseId?: number | null;
    unitCost?: number;
    reference?: string;
    referenceType?: string;
    batchNumber?: string;
    expiryDate?: string;
    note?: string;
    metadata?: Record<string, any>;
  }) {
    return this.request(`/inventory/${this.getOrganizationId()}/ledger/in`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Remove stock from inventory (Stock OUT)
   * @param data Stock removal details
   */
  async removeStockFromInventory(data: {
    productId: number;
    quantity: number;
    movementType: 'SALE' | 'DAMAGE' | 'EXPIRED' | 'TRANSFER_OUT' | 'ADJUSTMENT_OUT';
    warehouseId?: number | null;
    reference?: string;
    referenceType?: string;
    note?: string;
    metadata?: Record<string, any>;
  }) {
    return this.request(`/inventory/${this.getOrganizationId()}/ledger/out`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Adjust stock (can be positive or negative)
   * @param data Stock adjustment details
   */
  async adjustInventoryStock(data: {
    productId: number;
    quantity: number; // Can be positive or negative
    branchId?: number | null;
    unitCost?: number;
    reference?: string;
    referenceType?: string;
    note?: string;
    metadata?: Record<string, any>;
  }) {
    return this.request(`/inventory/${this.getOrganizationId()}/ledger/adjustment`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get ledger entries with filtering and pagination
   * @param params Filter and pagination parameters
   */
  async getInventoryLedger(params?: {
    productId?: number;
    warehouseId?: number | null;
    movementType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams: Record<string, string> = {};
    if (params?.productId) queryParams.productId = params.productId.toString();
    if (params?.warehouseId !== undefined) {
      queryParams.warehouseId = params.warehouseId === null ? 'null' : params.warehouseId.toString();
    }
    if (params?.movementType) queryParams.movementType = params.movementType;
    if (params?.startDate) queryParams.startDate = params.startDate;
    if (params?.endDate) queryParams.endDate = params.endDate;
    if (params?.page) queryParams.page = params.page.toString();
    if (params?.limit) queryParams.limit = params.limit.toString();

    const query = Object.keys(queryParams).length > 0
      ? `?${new URLSearchParams(queryParams).toString()}`
      : '';
    return this.request(`/inventory/${this.getOrganizationId()}/ledger${query}`);
  }

  /**
   * Get inventory summary since inception or from a specific date
   * @param params Summary parameters
   */
  async getInventorySummary(params?: {
    productId?: number;
    branchId?: number | null;
    from?: 'inception' | string; // Date string or 'inception'
  }) {
    const queryParams: Record<string, string> = {};
    if (params?.productId) queryParams.productId = params.productId.toString();
    if (params?.branchId !== undefined) {
      queryParams.branchId = params.branchId === null ? 'null' : params.branchId.toString();
    }
    if (params?.from) queryParams.from = params.from;

    const query = Object.keys(queryParams).length > 0
      ? `?${new URLSearchParams(queryParams).toString()}`
      : '';
    return this.request(`/inventory/${this.getOrganizationId()}/ledger/summary${query}`);
  }

  /**
   * Get current stock for a product (calculated from ledger)
   * @param productId Product ID
   * @param warehouseId Optional warehouse ID (null for main warehouse)
   */
  async getCurrentStock(productId: number, warehouseId?: number | null) {
    const query = warehouseId !== undefined
      ? `?warehouseId=${warehouseId === null ? 'null' : warehouseId}`
      : '';
    return this.request(`/inventory/${this.getOrganizationId()}/ledger/current-stock/${productId}${query}`);
  }

  /**
   * Get complete inventory history for a product since inception
   * @param productId Product ID
   * @param warehouseId Optional warehouse ID (null for main warehouse)
   */
  async getInventoryHistory(productId: number, branchId?: number | null) {
    const query = branchId !== undefined
      ? `?branchId=${branchId === null ? 'null' : branchId}`
      : '';
    return this.request(`/inventory/${this.getOrganizationId()}/ledger/history/${productId}${query}`);
  }

  /**
   * Recalculate product stock from ledger (useful for data integrity)
   * @param productId Product ID
   * @param warehouseId Optional warehouse ID (null for main warehouse)
   */
  async recalculateProductStock(productId: number, warehouseId?: number | null) {
    return this.request(`/inventory/${this.getOrganizationId()}/ledger/recalculate/${productId}`, {
      method: 'POST',
      body: JSON.stringify({ warehouseId: warehouseId === undefined ? null : warehouseId }),
    });
  }

  // ============================================
  // Warehouse Endpoints
  // ============================================

  /**
   * Get all warehouses for the organization
   */
  async getWarehouses() {
    return this.request(`/warehouses/${this.getOrganizationId()}`, {
      method: 'GET',
    });
  }

  /**
   * Get warehouse by ID
   * @param warehouseId Warehouse ID
   */
  async getWarehouseById(warehouseId: number) {
    return this.request(`/warehouses/${this.getOrganizationId()}/${warehouseId}`, {
      method: 'GET',
    });
  }

  /**
   * Create a new warehouse
   * @param data Warehouse data
   */
  async createWarehouse(data: {
    name: string;
    code?: string;
    address?: string;
    isDefault?: boolean;
  }) {
    return this.request(`/warehouses/${this.getOrganizationId()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update warehouse
   * @param warehouseId Warehouse ID
   * @param data Warehouse data
   */
  async updateWarehouse(warehouseId: number, data: {
    name?: string;
    code?: string;
    address?: string;
    isActive?: boolean;
    isDefault?: boolean;
  }) {
    return this.request(`/warehouses/${this.getOrganizationId()}/${warehouseId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete warehouse
   * @param warehouseId Warehouse ID
   */
  async deleteWarehouse(warehouseId: number) {
    return this.request(`/warehouses/${this.getOrganizationId()}/${warehouseId}`, {
      method: 'DELETE',
    });
  }

  // ==================== Batch Management ====================

  /**
   * Get batches for a product
   */
  async getBatches(productId: number, warehouseId?: number | null, includeInactive?: boolean) {
    const params = new URLSearchParams();
    if (warehouseId !== undefined) params.append('warehouseId', warehouseId === null ? 'null' : warehouseId.toString());
    if (includeInactive) params.append('includeInactive', 'true');
    const query = params.toString() ? `?${params}` : '';
    return this.request(`/batches/${this.getOrganizationId()}/product/${productId}${query}`);
  }

  /**
   * Get a single batch by ID
   */
  async getBatch(batchId: number) {
    return this.request(`/batches/${this.getOrganizationId()}/${batchId}`);
  }

  /**
   * Create a new batch
   */
  async createBatch(data: {
    productId: number;
    batchNumber: string;
    quantity: number;
    unitCost: number;
    expiryDate?: string;
    warehouseId?: number | null;
    reference?: string;
    referenceType?: string;
  }) {
    return this.request(`/batches/${this.getOrganizationId()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Select batches for sale (FIFO/LIFO/AVERAGE)
   */
  async selectBatches(data: {
    productId: number;
    quantity: number;
    method: 'FIFO' | 'LIFO' | 'AVERAGE';
    warehouseId?: number | null;
  }) {
    return this.request(`/batches/${this.getOrganizationId()}/select`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ==================== Branch Management ====================

  /**
   * Get all branches
   */
  async getBranches(includeInactive?: boolean) {
    const query = includeInactive ? '?includeInactive=true' : '';
    return this.request(`/branches/${this.getOrganizationId()}${query}`);
  }

  /**
   * Get a single branch
   */
  async getBranch(branchId: number) {
    return this.request(`/branches/${this.getOrganizationId()}/${branchId}`);
  }

  /**
   * Get default branch
   */
  async getDefaultBranch() {
    return this.request(`/branches/${this.getOrganizationId()}/default`);
  }

  /**
   * Create a branch
   */
  async createBranch(data: {
    name: string;
    code?: string;
    bhfId?: string;
    address?: string;
    location?: string;
    phone?: string;
    isDefault?: boolean;
    status?: 'ACTIVE' | 'INACTIVE';
  }) {
    return this.request(`/branches/${this.getOrganizationId()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a branch
   */
  async updateBranch(branchId: number, data: {
    name?: string;
    code?: string;
    bhfId?: string;
    address?: string;
    location?: string;
    phone?: string;
    isDefault?: boolean;
    status?: 'ACTIVE' | 'INACTIVE';
  }) {
    return this.request(`/branches/${this.getOrganizationId()}/${branchId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchId: number) {
    return this.request(`/branches/${this.getOrganizationId()}/${branchId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Set default branch
   */
  async setDefaultBranch(branchId: number) {
    return this.request(`/branches/${this.getOrganizationId()}/${branchId}/default`, {
      method: 'PUT',
    });
  }

  // ==================== Excel Imports ====================

  /**
   * Import customers from Excel
   */
  async importCustomers(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request(`/customers/${this.getOrganizationId()}/import`, {
      method: 'POST',
      headers: {}, // Let browser set Content-Type with boundary
      body: formData,
    });
  }

  /**
   * Download customer import template
   */
  async downloadCustomerTemplate() {
    return this.requestFile(`/customers/${this.getOrganizationId()}/import/template`);
  }

  /**
   * Import suppliers from Excel
   */
  async importSuppliers(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request(`/suppliers/${this.getOrganizationId()}/import`, {
      method: 'POST',
      headers: {}, // Let browser set Content-Type with boundary
      body: formData,
    });
  }

  /**
   * Download supplier import template
   */
  async downloadSupplierTemplate() {
    return this.requestFile(`/suppliers/${this.getOrganizationId()}/import/template`);
  }

  /**
   * Preview customer import - validates but does not save
   */
  async previewCustomerImport(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request(`/customers/${this.getOrganizationId()}/import/preview`, {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Confirm customer import - saves valid records
   */
  async confirmCustomerImport(importId: string) {
    return this.request(`/customers/${this.getOrganizationId()}/import/confirm`, {
      method: 'POST',
      body: JSON.stringify({ importId }),
    });
  }

  /**
   * Download customer error file
   */
  async downloadCustomerErrorFile(importId: string) {
    return this.requestFile(`/customers/${this.getOrganizationId()}/import/errors/${importId}`);
  }

  /**
   * Preview supplier import - validates but does not save
   */
  async previewSupplierImport(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request(`/suppliers/${this.getOrganizationId()}/import/preview`, {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Confirm supplier import - saves valid records
   */
  async confirmSupplierImport(importId: string) {
    return this.request(`/suppliers/${this.getOrganizationId()}/import/confirm`, {
      method: 'POST',
      body: JSON.stringify({ importId }),
    });
  }

  /**
   * Download supplier error file
   */
  async downloadSupplierErrorFile(importId: string) {
    return this.requestFile(`/suppliers/${this.getOrganizationId()}/import/errors/${importId}`);
  }

  // ==================== Profit Reports ====================

  /**
   * Get profit report for a date range
   */
  async getProfitReport(startDate: string, endDate: string, productId?: number) {
    const params = new URLSearchParams({
      startDate,
      endDate,
    });
    if (productId) params.append('productId', productId.toString());
    return this.request(`/reports/${this.getOrganizationId()}/profit?${params.toString()}`);
  }

  /**
   * Get profit summary for a sale
   */
  async getSaleProfitSummary(saleId: number) {
    return this.request(`/sales/${this.getOrganizationId()}/${saleId}/profit`);
  }

  // ==================== Expense Management ====================

  async createExpense(data: any) {
    return this.request(`/expenses/${this.getOrganizationId()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getExpenses(params?: any) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return this.request(`/expenses/${this.getOrganizationId()}${query}`);
  }

  async deleteExpense(id: string | number) {
    return this.request(`/expenses/${this.getOrganizationId()}/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== Supplier Payments ====================

  async recordSupplierPayment(data: any) {
    return this.request(`/supplier-payments/${this.getOrganizationId()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSupplierPayments(params?: any) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return this.request(`/supplier-payments/${this.getOrganizationId()}${query}`);
  }
}

export const apiClient = new ApiClient();
