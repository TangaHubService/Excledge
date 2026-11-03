import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../context/ThemeContext';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { apiClient } from '../../../lib/api-client';
import { Download, FileSpreadsheet, Loader2, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import { toastError } from "../../../lib/friendly-error";
import { ImportPreviewTable } from '../../../components/imports/ImportPreviewTable';
import type { PreviewRow } from '../../../components/imports/ImportPreviewTable';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '../../../components/ui/drawer';

interface CustomerImportProps {
  onSuccess?: () => void;
}

export function CustomerImport({ onSuccess }: CustomerImportProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewData, setPreviewData] = useState<{
    importId: string;
    validRows: PreviewRow[];
    invalidRows: PreviewRow[];
    summary: {
      total: number;
      valid: number;
      invalid: number;
    };
  } | null>(null);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setPreviewData(null);

      // Auto-preview when file is selected
      try {
        setPreviewing(true);
        const response = await apiClient.previewCustomerImport(selectedFile);
        setPreviewData(response);
        setIsPreviewDialogOpen(true);
      } catch (error: any) {
        toastError(error, t('import.failedToPreview'));
      } finally {
        setPreviewing(false);
      }
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await apiClient.downloadCustomerTemplate();
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'customers-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(t('import.templateDownloaded'));
    } catch (error: any) {
      toastError(error, t('import.failedToDownloadTemplate'));
    }
  };


  const handleConfirm = async () => {
    if (!previewData || previewData.validRows.length === 0) {
      toast.error(t('import.noValidRecords'));
      return;
    }

    try {
      setConfirming(true);
      const response = await apiClient.confirmCustomerImport(previewData.importId);

      toast.success(
        `${response.imported} ${t('import.customersImported')}${response.errors > 0 ? ` (${response.errors} ${t('import.errors')})` : ''}`
      );

      // Download error file if available
      if (response.errorFile) {
        const blob = await fetch(response.errorFile).then((r) => r.blob());
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customer-import-errors-${previewData.importId}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

      // Reset state
      setPreviewData(null);
      setIsPreviewDialogOpen(false);

      // Reset file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }

      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      toastError(error, t('import.failedToConfirm'));
    } finally {
      setConfirming(false);
    }
  };

  const handleDownloadErrorFile = async () => {
    if (!previewData) return;

    try {
      const response = await apiClient.downloadCustomerErrorFile(previewData.importId);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customer-import-errors-${previewData.importId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(t('import.errorFileDownloaded'));
    } catch (error: any) {
      toastError(error, t('import.failedToDownloadError'));
    }
  };

  const handleCancel = () => {
    setPreviewData(null);
    setIsPreviewDialogOpen(false);
  };

  const customerColumns = ['name', 'phone', 'email', 'address', 'type', 'balance'];

  return (
    <div className="space-y-6">
      <div className={`p-6 rounded-xl border ${theme === "dark" ? "bg-gray-800/50 border-gray-700" : "bg-card border-border"} shadow-sm`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className={`text-xl font-bold ${theme === "dark" ? "text-white" : "text-foreground"}`}>
              {t('import.customerImport')}
            </h2>
            <p className={`text-sm mt-1 ${theme === "dark" ? "text-muted-foreground" : "text-muted-foreground"}`}>
              {t('messages.customerManageDesc')}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            className={`w-full md:w-auto shadow-sm transition-all hover:shadow-md ${theme === "dark"
              ? "bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-200"
              : "bg-card border-border hover:bg-muted text-foreground"
              }`}
          >
            <Download className="h-4 w-4 mr-2" />
            {t('import.downloadTemplate')}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <label className={`text-sm font-semibold tracking-tight ${theme === "dark" ? "text-gray-200" : "text-foreground"}`}>
              {t('import.selectFile')}
            </label>
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 group ${previewing
                ? "opacity-50 cursor-not-allowed"
                : "cursor-pointer"
                } ${theme === "dark"
                  ? "bg-gray-900/50 border-gray-700 hover:border-primary/50 hover:bg-gray-900"
                  : "bg-surface-subtle/50 border-border hover:border-primary hover:bg-muted"
                }`}
            >
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={previewing}
              />
              <div className="flex flex-col items-center justify-center space-y-3 text-center">
                <div className={`p-3 rounded-full transition-transform group-hover:scale-110 ${theme === "dark" ? "bg-gray-800" : "bg-card shadow-sm"
                  }`}>
                  <FileSpreadsheet className={`h-8 w-8 ${theme === "dark" ? "text-blue-400" : "text-primary"}`} />
                </div>
                <div className="space-y-1">
                  <p className={`text-base font-medium ${theme === "dark" ? "text-gray-200" : "text-foreground"}`}>
                    {previewing ? t('import.previewing') : t('import.selectFile')}
                  </p>
                  <p className={`text-sm ${theme === "dark" ? "text-muted-foreground" : "text-muted-foreground"}`}>
                    Excel files (.xlsx, .xls)
                  </p>
                </div>
              </div>

              {previewing && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/60 rounded-xl backdrop-blur-[1px] z-20">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className={`text-sm font-medium ${theme === "dark" ? "text-white" : "text-foreground"}`}>
                      {t('import.previewing')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Drawer open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DrawerContent
          className={`!max-w-[95vw] !w-[95vw] overflow-y-auto border-none shadow-2xl p-6 ${theme === "dark"
            ? "bg-gray-900 text-gray-100"
            : "bg-card text-foreground"
            }`}
        >
          <DrawerHeader className="mb-6">
            <DrawerTitle className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-foreground"}`}>
              {t('import.previewTitle')}
            </DrawerTitle>
          </DrawerHeader>

          {previewData && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-5 rounded-2xl border transition-all ${theme === "dark"
                  ? "bg-gray-800/50 border-gray-700 hover:bg-gray-800"
                  : "bg-surface-subtle border-border hover:bg-card hover:shadow-md"
                  }`}>
                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${theme === "dark" ? "text-muted-foreground" : "text-muted-foreground"}`}>
                    {t('import.totalRows')}
                  </div>
                  <div className={`text-3xl font-black ${theme === "dark" ? "text-white" : "text-foreground"}`}>
                    {previewData.summary.total}
                  </div>
                </div>
                <div className={`p-5 rounded-2xl border transition-all ${theme === "dark"
                  ? "bg-success/20 border-green-900/30 hover:bg-success/30"
                  : "bg-success/10 border-success/25 hover:bg-card hover:shadow-md"
                  }`}>
                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${theme === "dark" ? "text-green-400" : "text-success"}`}>
                    {t('import.valid')}
                  </div>
                  <div className={`text-3xl font-black ${theme === "dark" ? "text-green-400" : "text-success"}`}>
                    {previewData.summary.valid}
                  </div>
                </div>
                <div className={`p-5 rounded-2xl border transition-all ${theme === "dark"
                  ? "bg-danger/20 border-red-900/30 hover:bg-danger/30"
                  : "bg-danger/10 border-danger/25 hover:bg-card hover:shadow-md"
                  }`}>
                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${theme === "dark" ? "text-red-400" : "text-danger"}`}>
                    {t('import.invalid')}
                  </div>
                  <div className={`text-3xl font-black ${theme === "dark" ? "text-red-400" : "text-danger"}`}>
                    {previewData.summary.invalid}
                  </div>
                </div>
              </div>

              <div className={`rounded-2xl border overflow-hidden ${theme === "dark" ? "border-gray-700 bg-gray-900" : "border-border bg-card"
                }`}>
                <ImportPreviewTable
                  validRows={previewData.validRows}
                  invalidRows={previewData.invalidRows}
                  columns={customerColumns}

                />
              </div>
            </div>
          )}

          <DrawerFooter className={`mt-8 gap-3 sm:gap-0 pt-6 border-t ${theme === "dark" ? "border-gray-800" : "border-border"
            }`}>
            <Button
              variant="ghost"
              onClick={handleCancel}
              disabled={confirming}
              className={`hover:bg-muted font-medium`}
            >
              {t('common.cancel')}
            </Button>
            <div className="flex gap-3 ml-auto">
              {previewData && previewData.invalidRows.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleDownloadErrorFile}
                  disabled={confirming}
                  className={`${theme === "dark"
                    ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                    : "bg-card border-border hover:bg-muted"
                    } font-medium`}
                >
                  <Download className="h-4 w-4 mr-2 text-danger" />
                  {t('import.downloadErrorFile')}
                </Button>
              )}
              <Button
                onClick={handleConfirm}
                disabled={!previewData || previewData.validRows.length === 0 || confirming}
                className="bg-primary hover:bg-primary/90 text-white font-bold shadow-lg shadow-blue-500/20 px-6 transition-all active:scale-95"
              >
                {confirming ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {t('import.saveValidRecords')} ({previewData?.summary.valid || 0})
                  </>
                )}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
