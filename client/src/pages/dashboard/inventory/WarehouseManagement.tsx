import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../context/ThemeContext';
import { apiClient } from '../../../lib/api-client';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/ui/dialog';
import { Loader2, Plus, Edit, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';
import { toast } from 'react-toastify';

interface Warehouse {
  id: number;
  name: string;
  code?: string | null;
  address?: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function WarehouseManagement() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    isDefault: false,
  });

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getWarehouses();
      setWarehouses(Array.isArray(data) ? data : data.warehouses || []);
    } catch (err: any) {
      console.error('Error fetching warehouses:', err);
      setError(err.message || 'Failed to load warehouses');
      toast.error(err.message || 'Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (warehouse?: Warehouse) => {
    if (warehouse) {
      setEditingWarehouse(warehouse);
      setFormData({
        name: warehouse.name,
        code: warehouse.code || '',
        address: warehouse.address || '',
        isDefault: warehouse.isDefault,
      });
    } else {
      setEditingWarehouse(null);
      setFormData({
        name: '',
        code: '',
        address: '',
        isDefault: false,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingWarehouse(null);
    setFormData({
      name: '',
      code: '',
      address: '',
      isDefault: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error(t('inventory.warehouseNameRequired') || 'Warehouse name is required');
      return;
    }

    try {
      if (editingWarehouse) {
        await apiClient.updateWarehouse(editingWarehouse.id, {
          name: formData.name,
          code: formData.code || undefined,
          address: formData.address || undefined,
          isDefault: formData.isDefault,
        });
        toast.success(t('inventory.warehouseUpdated') || 'Warehouse updated successfully');
      } else {
        await apiClient.createWarehouse({
          name: formData.name,
          code: formData.code || undefined,
          address: formData.address || undefined,
          isDefault: formData.isDefault,
        });
        toast.success(t('inventory.warehouseCreated') || 'Warehouse created successfully');
      }
      handleCloseDialog();
      fetchWarehouses();
    } catch (err: any) {
      console.error('Error saving warehouse:', err);
      toast.error(err.message || 'Failed to save warehouse');
    }
  };

  const handleDelete = async (warehouse: Warehouse) => {
    if (!confirm(t('inventory.confirmDeleteWarehouse') || `Are you sure you want to delete "${warehouse.name}"?`)) {
      return;
    }

    try {
      await apiClient.deleteWarehouse(warehouse.id);
      toast.success(t('inventory.warehouseDeleted') || 'Warehouse deleted successfully');
      fetchWarehouses();
    } catch (err: any) {
      console.error('Error deleting warehouse:', err);
      toast.error(err.message || 'Failed to delete warehouse');
    }
  };

  const handleToggleActive = async (warehouse: Warehouse) => {
    try {
      await apiClient.updateWarehouse(warehouse.id, {
        isActive: !warehouse.isActive,
      });
      toast.success(t('inventory.warehouseUpdated') || 'Warehouse updated successfully');
      fetchWarehouses();
    } catch (err: any) {
      console.error('Error updating warehouse:', err);
      toast.error(err.message || 'Failed to update warehouse');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className={`text-2xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          {t('inventory.warehouseManagement') || 'Warehouse Management'}
        </h1>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          {t('inventory.addWarehouse') || 'Add Warehouse'}
        </Button>
      </div>

      <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
        <CardHeader>
          <CardTitle className={theme === 'dark' ? 'text-white' : ''}>
            {t('inventory.warehouses') || 'Warehouses'} ({warehouses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">{error}</div>
          ) : warehouses.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {t('inventory.noWarehouses') || 'No warehouses found. Create your first warehouse.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className={theme === 'dark' ? 'border-gray-700' : ''}>
                    <TableHead className="whitespace-nowrap">{t('common.name')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('inventory.code') || 'Code'}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('common.address')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('common.status')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('inventory.default') || 'Default'}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((warehouse) => (
                    <TableRow
                      key={warehouse.id}
                      className={theme === 'dark' ? 'border-gray-700 hover:bg-gray-800' : 'hover:bg-gray-50'}
                    >
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <WarehouseIcon className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{warehouse.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {warehouse.code || '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {warehouse.address || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={warehouse.isActive 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                          }
                        >
                          {warehouse.isActive ? t('common.active') : t('common.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {warehouse.isDefault && (
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {t('common.default') || 'Default'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(warehouse)}
                            className="h-8 w-8 p-0"
                            title={warehouse.isActive ? t('common.deactivate') : t('common.activate')}
                          >
                            {warehouse.isActive ? '✓' : '✗'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(warehouse)}
                            className="h-8 w-8 p-0"
                            title={t('common.edit')}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(warehouse)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            title={t('common.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className={`sm:max-w-[500px] ${
            theme === 'dark'
              ? 'bg-gray-900 border-gray-700 text-gray-100'
              : 'bg-white border-gray-200'
          }`}
        >
          <DialogHeader>
            <DialogTitle className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
              {editingWarehouse
                ? t('inventory.editWarehouse') || 'Edit Warehouse'
                : t('inventory.addWarehouse') || 'Add Warehouse'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  {t('common.name')} *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">
                  {t('inventory.code') || 'Code'} ({t('common.optional')})
                </Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., WH-001"
                  className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">
                  {t('common.address')} ({t('common.optional')})
                </Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="isDefault" className="cursor-pointer">
                  {t('inventory.setAsDefault') || 'Set as default warehouse'}
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                className={theme === 'dark' ? 'border-gray-700 hover:bg-gray-800' : ''}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit">
                {editingWarehouse ? t('common.save') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
