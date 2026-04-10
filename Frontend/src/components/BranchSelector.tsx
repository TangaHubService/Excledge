import React, { useState } from 'react';
import { useBranch } from '../context/BranchContext';
import {
    ChevronDown,
    Layers,
    Building,
    Search,
    X
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useTranslation } from 'react-i18next';

export const BranchSelector: React.FC<{ toolbar?: boolean }> = ({ toolbar = false }) => {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');
    const {
        userBranches,
        selectedBranchId,
        setSelectedBranch,
        loading,
        canAccessAllBranches
    } = useBranch();

    if (loading || userBranches.length === 0) return null;

    const filteredBranches = userBranches.filter(b =>
        b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getTriggerLabel = () => {
        if (selectedBranchId === null) {
            return t('common.all_branches') || 'All Branches';
        }
        const branch = userBranches.find(b => b.id === selectedBranchId);
        return branch?.name || 'Select Branch';
    };

    const handleBranchChange = (value: string) => {
        if (value === 'all') {
            setSelectedBranch(null);
        } else {
            setSelectedBranch(Number(value));
        }
    };

    return (
        <DropdownMenu onOpenChange={(open) => !open && setSearchTerm('')}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={
                        toolbar
                            ? 'h-9 max-w-[200px] border-white/25 bg-white/10 px-3 font-medium text-white shadow-none transition-colors hover:bg-white/15'
                            : 'h-9 border-gray-200 bg-white px-3 font-medium shadow-sm transition-all group hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'
                    }
                >
                    <div className="flex max-w-[200px] items-center gap-2">
                        <div className={toolbar ? 'text-slate-300' : 'text-blue-600 dark:text-blue-400'}>
                            <Layers className="h-4 w-4 shrink-0" />
                        </div>
                        <span
                            className={`truncate text-sm font-semibold ${
                                toolbar ? 'text-white' : 'text-gray-700 dark:text-gray-200'
                            }`}
                        >
                            {getTriggerLabel()}
                        </span>
                        <ChevronDown
                            className={`h-4 w-4 shrink-0 transition-colors ${
                                toolbar
                                    ? 'text-slate-400 group-hover:text-white'
                                    : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200'
                            }`}
                        />
                    </div>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[280px] p-0 overflow-hidden">
                {/* Search Input */}
                <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search branches..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-9 text-sm bg-transparent border-gray-200 dark:border-gray-700/50"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-2.5 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
                            >
                                <X className="h-3 w-3 text-gray-400" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Branch List */}
                <div className="max-h-[300px] overflow-y-auto p-1">
                    <DropdownMenuLabel className="text-[10px] text-gray-400 uppercase tracking-widest font-black px-2 py-2 bg-white dark:bg-gray-950 sticky top-0 z-10">
                        Select Branch
                    </DropdownMenuLabel>

                    {filteredBranches.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                            <Building className="h-8 w-8 text-gray-200 dark:text-gray-800 mx-auto mb-2" />
                            <p className="text-xs text-gray-500">No branches found matching "{searchTerm}"</p>
                        </div>
                    ) : (
                        <DropdownMenuRadioGroup
                            value={selectedBranchId?.toString() || 'all'}
                            onValueChange={handleBranchChange}
                        >
                            {/* "All Branches" option (only for admins) */}
                            {canAccessAllBranches && (
                                <DropdownMenuRadioItem
                                    value="all"
                                    className="py-2.5 focus:bg-blue-50 dark:focus:bg-blue-900/20"
                                >
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                                All Branches
                                            </span>
                                            <span className="text-[9px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full font-bold">
                                                ALL
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 font-medium">
                                            View data from all branches
                                        </span>
                                    </div>
                                </DropdownMenuRadioItem>
                            )}

                            {/* Individual branches */}
                            {filteredBranches.map(branch => (
                                <DropdownMenuRadioItem
                                    key={branch.id}
                                    value={branch.id.toString()}
                                    className="py-2.5 focus:bg-blue-50 dark:focus:bg-blue-900/20"
                                >
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                                {branch.name}
                                            </span>
                                            {branch.isPrimary && (
                                                <span className="text-[9px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-bold">
                                                    PRIMARY
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-gray-400 font-medium">
                                            Code: {branch.code}
                                        </span>
                                    </div>
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
