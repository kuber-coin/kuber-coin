'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import templatesService, { TransactionTemplate } from '@/services/templates';
import walletService from '@/services/wallet';

export default function TransactionTemplatesPage() {
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TransactionTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Form state
  const [name, setName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = () => {
    setTemplates(templatesService.getAllTemplates());
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const tagArray = tags.split(',').map((t) => t.trim()).filter((t) => t);
      const template = templatesService.createTemplate(
        name,
        recipient,
        parseFloat(amount),
        note,
        category,
        tagArray
      );

      if (recurringEnabled) {
        templatesService.setRecurring(template.id, frequency);
      }

      setSuccess('Template created successfully!');
      loadTemplates();
      resetForm();
      setShowCreateModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create template');
    }
  };

  const handleUseTemplate = async (template: TransactionTemplate) => {
    try {
      templatesService.useTemplate(template.id);
      // Navigate to send page with pre-filled data
      const params = new URLSearchParams({
        recipient: template.recipient,
        amount: template.amount.toString(),
        note: template.note,
      });
      window.location.href = `/wallet/send?${params.toString()}`;
    } catch (err: any) {
      setError(err.message || 'Failed to use template');
    }
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      templatesService.deleteTemplate(id);
      setSuccess('Template deleted');
      loadTemplates();
    }
  };

  const handleExport = () => {
    const data = templatesService.exportTemplates();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `templates_${Date.now()}.json`;
    a.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    try {
      const count = templatesService.importTemplates(text);
      setSuccess(`Imported ${count} templates`);
      loadTemplates();
    } catch (err: any) {
      setError(err.message || 'Failed to import templates');
    }
  };

  const resetForm = () => {
    setName('');
    setRecipient('');
    setAmount('');
    setNote('');
    setCategory('');
    setTags('');
    setRecurringEnabled(false);
  };

  const filteredTemplates = templates
    .filter((t) => {
      if (searchQuery) {
        return templatesService.searchTemplates(searchQuery).some((st) => st.id === t.id);
      }
      if (filterCategory !== 'all') {
        return t.category === filterCategory;
      }
      return true;
    });

  const categories = Array.from(new Set(templates.map((t) => t.category).filter((c) => c)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/wallet"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
            >
              ← Back
            </Link>
            <h1 className="text-3xl font-bold text-white">Transaction Templates</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition"
            >
              📤 Export
            </button>
            <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition cursor-pointer">
              📥 Import
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
            >
              + Create Template
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-white">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-500/20 border border-green-500 rounded-lg text-white">
            {success}
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-6 flex gap-4">
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white placeholder-purple-300"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6 hover:border-pink-500 transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-1">{template.name}</h3>
                  {template.category && (
                    <span className="text-sm px-2 py-1 bg-purple-600 rounded text-purple-200">
                      {template.category}
                    </span>
                  )}
                </div>
                {template.recurring?.enabled && (
                  <span className="text-2xl" title="Recurring">
                    🔁
                  </span>
                )}
              </div>

              <div className="space-y-2 mb-4 text-purple-200">
                <div className="flex justify-between">
                  <span>Recipient:</span>
                  <span className="font-mono text-sm">{template.recipient.substring(0, 16)}...</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-semibold text-white">{template.amount} KC</span>
                </div>
                {template.note && (
                  <div className="text-sm text-purple-300 italic">
                    &ldquo;{template.note}&rdquo;
                  </div>
                )}
                {template.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {template.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 bg-pink-600/30 rounded text-pink-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-purple-400 mb-4">
                Used {template.useCount} times
                {template.lastUsed && ` • Last used ${new Date(template.lastUsed).toLocaleDateString()}`}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleUseTemplate(template)}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
                >
                  Use Template
                </button>
                <button
                  onClick={() => handleDeleteTemplate(template.id)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}

          {filteredTemplates.length === 0 && (
            <div className="col-span-full text-center py-12 text-purple-300">
              <p className="text-xl mb-2">📝 No templates yet</p>
              <p>Create your first template to get started!</p>
            </div>
          )}
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-purple-900 border border-purple-600 rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold text-white mb-6">Create Template</h2>

              <form onSubmit={handleCreateTemplate} className="space-y-4">
                <div>
                  <label className="block text-purple-200 mb-2">Template Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    placeholder="e.g., Monthly Rent Payment"
                  />
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Recipient Address</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white font-mono text-sm"
                    placeholder="Recipient wallet address"
                  />
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Amount (KC)</label>
                  <input
                    type="number"
                    step="0.00000001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Note (Optional)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    placeholder="Payment description"
                  />
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Category (Optional)</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    placeholder="e.g., Bills, Subscriptions, Donations"
                  />
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    placeholder="e.g., recurring, important, business"
                  />
                </div>

                <div className="border-t border-purple-700 pt-4">
                  <label className="flex items-center gap-2 text-purple-200 mb-2">
                    <input
                      type="checkbox"
                      checked={recurringEnabled}
                      onChange={(e) => setRecurringEnabled(e.target.checked)}
                      className="w-4 h-4"
                    />
                    Enable Recurring Payments
                  </label>

                  {recurringEnabled && (
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as any)}
                      className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetForm();
                    }}
                    className="flex-1 px-6 py-3 bg-purple-700 hover:bg-purple-800 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
                  >
                    Create Template
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
