import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ShoppingBag, Users, Package, FileText, X } from 'lucide-react'
import { apiClient } from '../../lib/api-client'

interface GlobalSearchModalProps {
  isOpen: boolean
  onClose: () => void
}

interface SearchResult {
  id: string | number
  title: string
  subtitle?: string
  category: 'Pages' | 'Products' | 'Sales' | 'Customers'
  path: string
}

const STATIC_PAGES: SearchResult[] = [
  { id: 'p-1', title: 'Dashboard', subtitle: 'Overview & business analytics', category: 'Pages', path: '/dashboard' },
  { id: 'p-3', title: 'POS / Sales Register', subtitle: 'Process new sales', category: 'Pages', path: '/dashboard/sales/new' },
  { id: 'p-4', title: 'All Inventory', subtitle: 'Stock management', category: 'Pages', path: '/dashboard/inventory' },
  { id: 'p-5', title: 'Customers', subtitle: 'Customer database & accounts', category: 'Pages', path: '/dashboard/customers' },
  { id: 'p-6', title: 'Debt Management', subtitle: 'Outstanding debt tracking', category: 'Pages', path: '/dashboard/debt' },
  { id: 'p-7', title: 'Low Stock Items', subtitle: 'Critical inventory alerts', category: 'Pages', path: '/dashboard/low-stock' },
  { id: 'p-8', title: 'Stock Movements', subtitle: 'Audit log of stock transfers', category: 'Pages', path: '/dashboard/ledger-history' },
]

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (isOpen) onClose()
        else setQuery('')
      }
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!query.trim()) {
      setResults(STATIC_PAGES)
      return
    }

    const q = query.toLowerCase()
    const matchingPages = STATIC_PAGES.filter(
      p => p.title.toLowerCase().includes(q) || (p.subtitle && p.subtitle.toLowerCase().includes(q))
    )

    let isMounted = true
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const dynamicResults: SearchResult[] = []
        
        // Search products
        try {
          const prodRes = await apiClient.getProducts({ search: query, limit: 5 })
          const prods = prodRes?.products || prodRes?.data || []
          if (Array.isArray(prods)) {
            prods.slice(0, 5).forEach((p: any) => {
              dynamicResults.push({
                id: `prod-${p.id}`,
                title: p.name,
                subtitle: `Stock: ${p.quantity} | SKU: ${p.sku || 'N/A'}`,
                category: 'Products',
                path: `/dashboard/inventory`,
              })
            })
          }
        } catch {
          // ignore
        }

        // Search customers
        try {
          const custRes = await apiClient.getCustomers({ search: query, limit: 4 })
          const custs = custRes?.customers || custRes?.data || []
          if (Array.isArray(custs)) {
            custs.slice(0, 4).forEach((c: any) => {
              dynamicResults.push({
                id: `cust-${c.id}`,
                title: c.name,
                subtitle: c.phone || c.email || 'Customer',
                category: 'Customers',
                path: `/dashboard/customers`,
              })
            })
          }
        } catch {
          // ignore
        }

        if (isMounted) {
          setResults([...matchingPages, ...dynamicResults])
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }, 300)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [query])

  if (!isOpen) return null

  const handleSelect = (result: SearchResult) => {
    navigate(result.path)
    onClose()
  }

  const getIcon = (category: string) => {
    switch (category) {
      case 'Products': return <Package className="h-4 w-4 text-primary" />
      case 'Sales': return <ShoppingBag className="h-4 w-4 text-emerald-500" />
      case 'Customers': return <Users className="h-4 w-4 text-purple-500" />
      default: return <FileText className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-gray-900/60 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Header */}
        <div className="relative flex items-center px-4 border-b border-border">
          <Search className="h-5 w-5 text-muted-foreground mr-3 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, sales, customers, or navigate..."
            className="w-full py-4 text-sm bg-transparent text-foreground placeholder-gray-400 focus:outline-none"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-muted-foreground hover:text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-2 py-0.5 ml-2 text-xs font-semibold text-muted-foreground bg-muted rounded">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div className="overflow-y-auto p-2 space-y-1 flex-1">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
              Searching data...
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors text-left group"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                    {getIcon(item.category)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-primary">
                      {item.title}
                    </p>
                    {item.subtitle && (
                      <p className="text-xs text-muted-foreground">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground font-medium">
                  {item.category}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-surface-subtle border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Navigate with click or arrow keys</span>
          <span>Quick Search</span>
        </div>
      </div>
    </div>
  )
}
