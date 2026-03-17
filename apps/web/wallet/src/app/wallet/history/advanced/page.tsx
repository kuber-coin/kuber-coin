'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardBody } from '@/components/Card';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import transactionSearch, { SearchFilters, SearchPreset, TransactionCategory } from '@/services/transactionSearch';
import walletService from '@/services/wallet';

export default function AdvancedSearchPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [filteredTxs, setFilteredTxs] = useState<any[]>([]);
  const [selectedTxs, setSelectedTxs] = useState<Set<string>>(new Set());
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [presets, setPresets] = useState<SearchPreset[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  
  const [filters, setFilters] = useState<SearchFilters>({
    dateFrom: undefined,
    dateTo: undefined,
    amountMin: undefined,
    amountMax: undefined,
    feeMin: undefined,
    feeMax: undefined,
    confirmationsMin: undefined,
    type: undefined,
    categories: [],
    tags: [],
    contactAddress: undefined,
  });

  const [newPreset, setNewPreset] = useState({
    name: '',
    description: '',
  });

  const [categoryForm, setCategoryForm] = useState({
    txId: '',
    category: 'expense' as TransactionCategory,
  });

  const COLORS = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];
  
  const categories: TransactionCategory[] = ['income', 'expense', 'transfer', 'trading', 'other'];

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters().catch(console.error);
  }, [searchQuery, filters, transactions, useRegex]);

  const loadData = async () => {
    const allTxs = await transactionSearch.getAllTransactions();
    setTransactions(allTxs);
    setPresets(transactionSearch.getPresets());
  };

  const applyFilters = async () => {
    let results = [...transactions];

    // Apply text search
    if (searchQuery) {
      results = await transactionSearch.search(searchQuery, useRegex);
    }

    // Apply filters
    results = transactionSearch.filter(results, filters);

    setFilteredTxs(results);
  };

  const handleApplyPreset = async (preset: SearchPreset) => {
    setFilters(preset.filters);
    setSelectedPreset(preset.id);
    await applyFilters();
  };

  const handleSavePreset = () => {
    try {
      transactionSearch.savePreset(newPreset.name, newPreset.description, filters);
      loadData();
      setShowPresetModal(false);
      setNewPreset({ name: '', description: '' });
      alert('Preset saved successfully!');
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDeletePreset = (id: string) => {
    if (confirm('Are you sure you want to delete this preset?')) {
      transactionSearch.deletePreset(id);
      loadData();
      if (selectedPreset === id) {
        setSelectedPreset(null);
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedTxs.size === filteredTxs.length) {
      setSelectedTxs(new Set());
    } else {
      setSelectedTxs(new Set(filteredTxs.map(tx => tx.id)));
    }
  };

  const handleSelectTx = (txId: string) => {
    const newSelected = new Set(selectedTxs);
    if (newSelected.has(txId)) {
      newSelected.delete(txId);
    } else {
      newSelected.add(txId);
    }
    setSelectedTxs(newSelected);
  };

  const handleBulkTag = () => {
    const tag = prompt('Enter tag name:');
    if (!tag) return;

    selectedTxs.forEach(txId => {
      transactionSearch.addTag(txId, tag);
    });
    
    loadData();
    alert(`Tagged ${selectedTxs.size} transactions`);
    setSelectedTxs(new Set());
  };

  const handleBulkCategorize = () => {
    const category = prompt('Enter category (income/expense/transfer/trading/other):');
    if (!category || !categories.includes(category as TransactionCategory)) {
      alert('Invalid category');
      return;
    }

    selectedTxs.forEach(txId => {
      transactionSearch.setCategory(txId, category as TransactionCategory);
    });
    
    loadData();
    alert(`Categorized ${selectedTxs.size} transactions`);
    setSelectedTxs(new Set());
  };

  const handleBulkExport = () => {
    const selectedTransactions = filteredTxs.filter(tx => selectedTxs.has(tx.id));
    const csv = transactionSearch.exportToCSV(selectedTransactions);
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCategoryStats = () => {
    const stats: Record<string, { count: number; total: number }> = {};
    
    filteredTxs.forEach(tx => {
      const category = tx.category || 'other';
      if (!stats[category]) {
        stats[category] = { count: 0, total: 0 };
      }
      stats[category].count++;
      stats[category].total += tx.amount || 0;
    });

    return Object.entries(stats).map(([category, data]) => ({
      category,
      count: data.count,
      total: data.total,
      percentage: (data.count / filteredTxs.length) * 100,
    }));
  };

  const resetFilters = () => {
    setFilters({
      dateFrom: undefined,
      dateTo: undefined,
      amountMin: undefined,
      amountMax: undefined,
      feeMin: undefined,
      feeMax: undefined,
      confirmationsMin: undefined,
      type: undefined,
      categories: [],
      tags: [],
      contactAddress: undefined,
    });
    setSearchQuery('');
    setUseRegex(false);
    setSelectedPreset(null);
  };

  const allTags = Array.from(
    new Set(transactions.flatMap(tx => tx.tags || []))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Advanced Transaction Search</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowFilterModal(true)}>
            🔍 Advanced Filters
          </Button>
          <Button onClick={() => setShowPresetModal(true)} variant="secondary">
            💾 Save Preset
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <Card>
        <CardBody>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search transactions (notes, labels, addresses)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-4 py-2 border rounded-lg"
              />
              <Button onClick={resetFilters} variant="secondary">
                Clear
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useRegex}
                  onChange={(e) => setUseRegex(e.target.checked)}
                />
                <span className="text-sm">Use regex</span>
              </label>

              <div className="text-sm text-gray-600">
                {filteredTxs.length} of {transactions.length} transactions
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Presets */}
      {presets.length > 0 && (
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-3">Saved Presets</h3>
            <div className="flex gap-2 flex-wrap">
              {presets.map(preset => (
                <div key={preset.id} className="flex items-center gap-1">
                  <button
                    onClick={() => handleApplyPreset(preset)}
                    className={`px-4 py-2 rounded-lg ${
                      selectedPreset === preset.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => handleDeletePreset(preset.id)}
                    className="text-red-500 hover:text-red-700"
                    title="Delete preset"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Active Filters */}
      {(filters.dateFrom || filters.dateTo || filters.amountMin || filters.amountMax || 
        filters.categories.length > 0 || filters.tags.length > 0) && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Active Filters</h3>
              <Button onClick={resetFilters} variant="secondary" size="sm">
                Clear All
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {filters.dateFrom && (
                <span className="px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                  From: {filters.dateFrom.toLocaleDateString()}
                </span>
              )}
              {filters.dateTo && (
                <span className="px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                  To: {filters.dateTo.toLocaleDateString()}
                </span>
              )}
              {filters.amountMin !== undefined && (
                <span className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                  Min: {filters.amountMin} KC
                </span>
              )}
              {filters.amountMax !== undefined && (
                <span className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                  Max: {filters.amountMax} KC
                </span>
              )}
              {filters.categories.map(cat => (
                <span key={cat} className="px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-800">
                  {cat}
                </span>
              ))}
              {filters.tags.map(tag => (
                <span key={tag} className="px-3 py-1 rounded-full text-sm bg-yellow-100 text-yellow-800">
                  #{tag}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Bulk Actions */}
      {selectedTxs.size > 0 && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="font-semibold">
                {selectedTxs.size} transaction{selectedTxs.size !== 1 ? 's' : ''} selected
              </div>
              <div className="flex gap-2">
                <Button onClick={handleBulkTag} variant="secondary">
                  🏷️ Tag
                </Button>
                <Button onClick={handleBulkCategorize} variant="secondary">
                  📁 Categorize
                </Button>
                <Button onClick={handleBulkExport} variant="secondary">
                  📤 Export
                </Button>
                <Button onClick={() => setSelectedTxs(new Set())} variant="secondary">
                  Clear Selection
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Category Statistics */}
      {filteredTxs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardBody>
              <h3 className="font-semibold mb-4">Transactions by Category</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={getCategoryStats()}
                    dataKey="count"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(props: any) => `${props.category}: ${props.percentage.toFixed(1)}%`}
                  >
                    {getCategoryStats().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h3 className="font-semibold mb-4">Category Details</h3>
              <div className="space-y-3">
                {getCategoryStats().map((stat, index) => (
                  <div key={stat.category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <div>
                        <div className="font-semibold capitalize">{stat.category}</div>
                        <div className="text-sm text-gray-600">{stat.count} transactions</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{stat.total.toFixed(4)} KC</div>
                      <div className="text-sm text-gray-600">{stat.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Transactions List */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Search Results</h3>
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {selectedTxs.size === filteredTxs.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {filteredTxs.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔍</div>
              <h2 className="text-xl font-semibold mb-2">No transactions found</h2>
              <p className="text-gray-600">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTxs.map(tx => (
                <div
                  key={tx.id}
                  className={`p-4 border rounded-lg hover:bg-gray-50 cursor-pointer ${
                    selectedTxs.has(tx.id) ? 'bg-blue-50 border-blue-300' : ''
                  }`}
                  onClick={() => handleSelectTx(tx.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={selectedTxs.has(tx.id)}
                          onChange={() => handleSelectTx(tx.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="font-semibold">{tx.id.slice(0, 16)}...</div>
                        {tx.category && (
                          <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800 capitalize">
                            {tx.category}
                          </span>
                        )}
                      </div>
                      
                      {tx.note && (
                        <div className="text-sm text-gray-600 mb-1">💬 {tx.note}</div>
                      )}
                      
                      <div className="text-sm text-gray-600">
                        {new Date(tx.timestamp).toLocaleString()}
                      </div>
                      
                      {tx.tags && tx.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-2">
                          {tx.tags.map((tag: string) => (
                            <span
                              key={tag}
                              className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <div className="font-bold text-lg">{tx.amount?.toFixed(4) || '0.0000'} KC</div>
                      <div className="text-sm text-gray-600">Fee: {tx.fee?.toFixed(6) || '0.000000'} KC</div>
                      {tx.confirmations !== undefined && (
                        <div className="text-sm text-gray-600">{tx.confirmations} confirmations</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Filter Modal */}
      {showFilterModal && (
        <Modal
          isOpen={showFilterModal}
          onCloseAction={() => setShowFilterModal(false)}
          title="Advanced Filters"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date From
                </label>
                <input
                  type="date"
                  value={filters.dateFrom?.toISOString().split('T')[0] || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    dateFrom: e.target.value ? new Date(e.target.value) : undefined,
                  })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date To
                </label>
                <input
                  type="date"
                  value={filters.dateTo?.toISOString().split('T')[0] || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    dateTo: e.target.value ? new Date(e.target.value) : undefined,
                  })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Amount (KC)
                </label>
                <input
                  type="number"
                  value={filters.amountMin || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    amountMin: e.target.value ? parseFloat(e.target.value) : undefined,
                  })}
                  className="w-full px-3 py-2 border rounded-lg"
                  step="0.0001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Amount (KC)
                </label>
                <input
                  type="number"
                  value={filters.amountMax || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    amountMax: e.target.value ? parseFloat(e.target.value) : undefined,
                  })}
                  className="w-full px-3 py-2 border rounded-lg"
                  step="0.0001"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Fee (KC)
                </label>
                <input
                  type="number"
                  value={filters.feeMin || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    feeMin: e.target.value ? parseFloat(e.target.value) : undefined,
                  })}
                  className="w-full px-3 py-2 border rounded-lg"
                  step="0.000001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Confirmations
                </label>
                <input
                  type="number"
                  value={filters.confirmationsMin || ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    confirmationsMin: e.target.value ? parseInt(e.target.value) : undefined,
                  })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categories
              </label>
              <div className="flex gap-2 flex-wrap">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      const newCategories = filters.categories.includes(cat)
                        ? filters.categories.filter(c => c !== cat)
                        : [...filters.categories, cat];
                      setFilters({ ...filters, categories: newCategories });
                    }}
                    className={`px-3 py-1 rounded-lg capitalize ${
                      filters.categories.includes(cat)
                        ? 'bg-purple-500 text-white'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {allTags.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                <div className="flex gap-2 flex-wrap max-h-32 overflow-y-auto">
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => {
                        const newTags = filters.tags.includes(tag)
                          ? filters.tags.filter(t => t !== tag)
                          : [...filters.tags, tag];
                        setFilters({ ...filters, tags: newTags });
                      }}
                      className={`px-3 py-1 rounded-full text-sm ${
                        filters.tags.includes(tag)
                          ? 'bg-yellow-500 text-white'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4">
              <Button onClick={() => setShowFilterModal(false)} variant="secondary">
                Close
              </Button>
              <Button onClick={async () => { await applyFilters(); setShowFilterModal(false); }}>
                Apply Filters
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Save Preset Modal */}
      {showPresetModal && (
        <Modal
          isOpen={showPresetModal}
          onCloseAction={() => setShowPresetModal(false)}
          title="Save Filter Preset"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preset Name *
              </label>
              <input
                type="text"
                value={newPreset.name}
                onChange={(e) => setNewPreset({ ...newPreset, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="My Filter Preset"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={newPreset.description}
                onChange={(e) => setNewPreset({ ...newPreset, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                placeholder="Description of this filter preset..."
              />
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button onClick={() => setShowPresetModal(false)} variant="secondary">
                Cancel
              </Button>
              <Button onClick={handleSavePreset}>
                Save Preset
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
