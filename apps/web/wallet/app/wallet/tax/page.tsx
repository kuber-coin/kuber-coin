'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import taxService, { TaxReport, TaxTransaction } from '@/services/taxService';

const TaxCharts = dynamic(() => import('./TaxCharts'), { ssr: false, loading: () => null });

export default function TaxPage() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [method, setMethod] = useState<'FIFO' | 'LIFO' | 'HIFO' | 'Specific ID'>('FIFO');
  const [jurisdiction, setJurisdiction] = useState('US');
  const [report, setReport] = useState<TaxReport | null>(null);
  const [transactions, setTransactions] = useState<TaxTransaction[]>([]);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  
  // Form state
  const [txType, setTxType] = useState<TaxTransaction['type']>('buy');
  const [txAmount, setTxAmount] = useState('');
  const [txFiatValue, setTxFiatValue] = useState('');
  const [txFee, setTxFee] = useState('');
  const [txDescription, setTxDescription] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadTransactions();
  }, [selectedYear]);

  const loadTransactions = () => {
    const txs = taxService.getTransactionsByYear(selectedYear);
    setTransactions(txs);
  };

  const handleGenerateReport = () => {
    try {
      const newReport = taxService.generateReport(selectedYear, jurisdiction, method);
      setReport(newReport);
      setSuccess('Report generated successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    }
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      taxService.addTransaction(
        txType,
        parseFloat(txAmount),
        parseFloat(txFiatValue),
        'USD',
        parseFloat(txFee) || 0,
        `manual_${Date.now()}`,
        txDescription
      );

      setSuccess('Transaction added');
      setShowAddTransaction(false);
      setTxAmount('');
      setTxFiatValue('');
      setTxFee('');
      setTxDescription('');
      loadTransactions();
      setReport(null); // Clear report to regenerate
    } catch (err: any) {
      setError(err.message || 'Failed to add transaction');
    }
  };

  const handleExportCSV = () => {
    if (!report) return;
    const csv = taxService.exportToCSV(report);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax_report_${selectedYear}.csv`;
    a.click();
  };

  const handleExportPDF = () => {
    if (!report) return;
    const pdf = taxService.exportToPDF(report);
    const blob = new Blob([pdf], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax_report_${selectedYear}.txt`;
    a.click();
  };

  const handleExportForm8949 = () => {
    if (!report) return;
    const form = taxService.exportForm8949(report);
    const blob = new Blob([form], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `form_8949_${selectedYear}.csv`;
    a.click();
  };

  const gainLossData = report ? [
    { name: 'Gains', value: report.totalGains, color: '#22c55e' },
    { name: 'Losses', value: report.totalLosses, color: '#ef4444' },
  ] : [];

  const termData = report ? [
    { name: 'Short-Term', value: Math.abs(report.shortTermGains), color: '#f97316' },
    { name: 'Long-Term', value: Math.abs(report.longTermGains), color: '#3b82f6' },
  ] : [];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/wallet" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition">
              ← Back
            </Link>
            <h1 className="text-3xl font-bold text-white">📊 Tax Reporting</h1>
          </div>
          <button
            onClick={() => setShowAddTransaction(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition"
          >
            + Add Transaction
          </button>
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

        {/* Report Configuration */}
        <div className="mb-6 bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Report Configuration</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-purple-200 mb-2">Tax Year</label>
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(parseInt(e.target.value));
                  setReport(null);
                }}
                className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white"
              >
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-purple-200 mb-2">Cost Basis Method</label>
              <select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value as any);
                  setReport(null);
                }}
                className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white"
              >
                <option value="FIFO">FIFO (First In First Out)</option>
                <option value="LIFO">LIFO (Last In First Out)</option>
                <option value="HIFO">HIFO (Highest In First Out)</option>
                <option value="Specific ID">Specific Identification</option>
              </select>
            </div>

            <div>
              <label className="block text-purple-200 mb-2">Jurisdiction</label>
              <select
                value={jurisdiction}
                onChange={(e) => {
                  setJurisdiction(e.target.value);
                  setReport(null);
                }}
                className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600 rounded-lg text-white"
              >
                <option value="US">United States</option>
                <option value="UK">United Kingdom</option>
                <option value="EU">European Union</option>
                <option value="CA">Canada</option>
                <option value="AU">Australia</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleGenerateReport}
                disabled={transactions.length === 0}
                className="w-full px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold disabled:opacity-50"
              >
                Generate Report
              </button>
            </div>
          </div>

          <div className="mt-4 text-sm text-purple-300">
            {transactions.length} transaction(s) in {selectedYear}
          </div>
        </div>

        {/* Report Summary */}
        {report && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-6">
                <div className="text-green-200 mb-2">Total Income</div>
                <div className="text-3xl font-bold text-white">
                  ${report.totalIncome.toFixed(2)}
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-6">
                <div className="text-blue-200 mb-2">Total Gains</div>
                <div className="text-3xl font-bold text-white">
                  ${report.totalGains.toFixed(2)}
                </div>
              </div>

              <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-lg p-6">
                <div className="text-red-200 mb-2">Total Losses</div>
                <div className="text-3xl font-bold text-white">
                  ${report.totalLosses.toFixed(2)}
                </div>
              </div>

              <div className={`bg-gradient-to-br rounded-lg p-6 ${
                report.netGains >= 0 ? 'from-purple-600 to-pink-600' : 'from-gray-600 to-gray-700'
              }`}>
                <div className={`mb-2 ${report.netGains >= 0 ? 'text-purple-200' : 'text-gray-200'}`}>
                  Net Gains
                </div>
                <div className="text-3xl font-bold text-white">
                  ${report.netGains.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Charts */}
            <TaxCharts
              gainLossData={gainLossData}
              termData={termData}
              totalGains={report.totalGains}
              totalLosses={report.totalLosses}
              shortTermGains={report.shortTermGains}
              longTermGains={report.longTermGains}
            />

            {/* Capital Gains Table */}
            {report.capitalGains.length > 0 && (
              <div className="bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Capital Gains/Losses ({report.capitalGains.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-purple-700">
                        <th className="text-left text-purple-300 py-2">Sale Date</th>
                        <th className="text-left text-purple-300 py-2">Amount</th>
                        <th className="text-right text-purple-300 py-2">Cost Basis</th>
                        <th className="text-right text-purple-300 py-2">Sale Price</th>
                        <th className="text-right text-purple-300 py-2">Gain/Loss</th>
                        <th className="text-center text-purple-300 py-2">Term</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.capitalGains.slice(0, 10).map((gain) => (
                        <tr key={gain.id} className="border-b border-purple-800">
                          <td className="py-2 text-white">
                            {new Date(gain.saleDate).toLocaleDateString()}
                          </td>
                          <td className="py-2 text-white">{gain.amount.toFixed(8)} KC</td>
                          <td className="py-2 text-right text-white">
                            ${gain.costBasis.toFixed(2)}
                          </td>
                          <td className="py-2 text-right text-white">
                            ${gain.salePrice.toFixed(2)}
                          </td>
                          <td className={`py-2 text-right font-semibold ${
                            gain.gain >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            ${gain.gain >= 0 ? '+' : ''}{gain.gain.toFixed(2)}
                          </td>
                          <td className="py-2 text-center">
                            <span className={`px-2 py-1 rounded text-xs ${
                              gain.isLongTerm 
                                ? 'bg-blue-500/30 text-blue-300'
                                : 'bg-orange-500/30 text-orange-300'
                            }`}>
                              {gain.isLongTerm ? 'Long' : 'Short'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {report.capitalGains.length > 10 && (
                    <div className="mt-4 text-center text-purple-300 text-sm">
                      + {report.capitalGains.length - 10} more (download full report)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Export Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleExportCSV}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg transition font-semibold"
              >
                📥 Export CSV
              </button>
              <button
                onClick={handleExportPDF}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition font-semibold"
              >
                📄 Export PDF
              </button>
              {jurisdiction === 'US' && (
                <button
                  onClick={handleExportForm8949}
                  className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg transition font-semibold"
                >
                  📋 Form 8949
                </button>
              )}
            </div>
          </div>
        )}

        {!report && transactions.length > 0 && (
          <div className="text-center py-12 bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg">
            <span className="text-6xl mb-4 block">📊</span>
            <h2 className="text-2xl font-bold text-white mb-2">Generate Tax Report</h2>
            <p className="text-purple-200 mb-4">
              Configure your report settings above and click Generate Report
            </p>
          </div>
        )}

        {transactions.length === 0 && (
          <div className="text-center py-12 bg-purple-800/50 backdrop-blur border border-purple-600 rounded-lg">
            <span className="text-6xl mb-4 block">📝</span>
            <h2 className="text-2xl font-bold text-white mb-2">No Transactions</h2>
            <p className="text-purple-200 mb-4">
              Add transactions for {selectedYear} to generate a tax report
            </p>
            <button
              onClick={() => setShowAddTransaction(true)}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
            >
              Add Transaction
            </button>
          </div>
        )}

        {/* Add Transaction Modal */}
        {showAddTransaction && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-purple-900 border border-purple-600 rounded-lg p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold text-white mb-4">Add Transaction</h2>

              <form onSubmit={handleAddTransaction} className="space-y-4">
                <div>
                  <label className="block text-purple-200 mb-2">Type</label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as any)}
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                    <option value="send">Send</option>
                    <option value="receive">Receive</option>
                    <option value="mining">Mining</option>
                    <option value="staking">Staking</option>
                  </select>
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Amount (KC)</label>
                  <input
                    type="number"
                    step="0.00000001"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Fiat Value (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={txFiatValue}
                    onChange={(e) => setTxFiatValue(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Fee (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={txFee}
                    onChange={(e) => setTxFee(e.target.value)}
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-purple-200 mb-2">Description</label>
                  <input
                    type="text"
                    value={txDescription}
                    onChange={(e) => setTxDescription(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-purple-800/50 border border-purple-600 rounded-lg text-white"
                    placeholder="Payment description"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddTransaction(false)}
                    className="flex-1 px-4 py-2 bg-purple-700 hover:bg-purple-800 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition font-semibold"
                  >
                    Add
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
