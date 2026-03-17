'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import TaxReport from '@/components/TaxReport';
import taxCalculator, { TaxMethod, TaxYear } from '@/services/taxCalculator';
import capitalGains from '@/services/capitalGains';
import taxExport from '@/services/taxExport';

export default function TaxPage() {
  const [taxYear, setTaxYear] = useState<number>(2025);
  const [method, setMethod] = useState<TaxMethod>('FIFO');
  const [jurisdiction, setJurisdiction] = useState('US');
  const [taxData, setTaxData] = useState<TaxYear | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    loadTaxData();
  }, [taxYear, method, jurisdiction]);

  const loadTaxData = async () => {
    setIsCalculating(true);
    try {
      const data = await taxCalculator.calculateTaxYear(taxYear, method, jurisdiction);
      setTaxData(data);
    } catch (error) {
      console.error('Tax calculation error:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleExport = (format: 'turbotax' | 'cointracker' | 'csv' | 'pdf') => {
    if (!taxData) return;

    try {
      const exported = taxExport.exportTaxData(taxData, format);
      
      if (format === 'pdf') {
        // Open PDF in new window
        window.open(exported, '_blank');
      } else {
        // Download file
        const blob = new Blob([exported], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kubercoin_tax_${taxYear}_${format}.${format === 'csv' ? 'csv' : 'txt'}`;
        a.click();
        URL.revokeObjectURL(url);
      }
      
      alert(`Tax data exported successfully as ${format.toUpperCase()}!`);
    } catch (error: any) {
      alert('Export failed: ' + error.message);
    }
  };

  const washSales = taxData ? capitalGains.detectWashSales(taxData.transactions) : [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Tax Reporting & Compliance</h1>
        <p className="text-gray-600">
          Calculate capital gains, track cost basis, and generate tax reports for multiple jurisdictions
        </p>
      </div>

      {/* Tax Report Modal */}
      {showReport && taxData && (
        <TaxReport
          taxData={taxData}
          onCloseAction={() => setShowReport(false)}
          onExportAction={handleExport}
        />
      )}

      {/* Configuration */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <label className="block text-sm font-medium mb-2">Tax Year</label>
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(parseInt(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg"
          >
            {[2025, 2024, 2023, 2022, 2021].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </Card>

        <Card className="p-4">
          <label className="block text-sm font-medium mb-2">Calculation Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as TaxMethod)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="FIFO">FIFO (First In, First Out)</option>
            <option value="LIFO">LIFO (Last In, First Out)</option>
            <option value="HIFO">HIFO (Highest In, First Out)</option>
            <option value="SpecificID">Specific Identification</option>
          </select>
        </Card>

        <Card className="p-4">
          <label className="block text-sm font-medium mb-2">Jurisdiction</label>
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="US">United States</option>
            <option value="UK">United Kingdom</option>
            <option value="EU">European Union</option>
            <option value="CA">Canada</option>
            <option value="AU">Australia</option>
          </select>
        </Card>
      </div>

      {/* Summary Cards */}
      {taxData && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-gray-600">Total Capital Gains</div>
            <div className={`text-2xl font-bold ${taxData.totalCapitalGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${taxData.totalCapitalGains.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Short: ${taxData.shortTermGains.toLocaleString()} | Long: ${taxData.longTermGains.toLocaleString()}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-gray-600">Taxable Income</div>
            <div className="text-2xl font-bold">${taxData.taxableIncome.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Based on {method} method</div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-gray-600">Estimated Tax Due</div>
            <div className="text-2xl font-bold text-orange-600">
              ${taxData.estimatedTax.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">{jurisdiction} rates applied</div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-gray-600">Total Transactions</div>
            <div className="text-2xl font-bold">{taxData.transactions.length}</div>
            <div className="text-xs text-gray-500 mt-1">
              {taxData.transactions.filter(t => t.type === 'buy').length} buys | 
              {taxData.transactions.filter(t => t.type === 'sell').length} sells
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Capital Gains Breakdown */}
        <div className="col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Capital Gains Breakdown</h2>
              <Button onClick={() => setShowReport(true)} disabled={!taxData}>
                📊 View Full Report
              </Button>
            </div>

            {isCalculating ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                <div className="mt-4 text-gray-600">Calculating taxes...</div>
              </div>
            ) : taxData ? (
              <div className="space-y-4">
                {/* Short-term gains */}
                <div className="p-4 bg-orange-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-lg">Short-Term Capital Gains</div>
                      <div className="text-sm text-gray-600">Assets held ≤ 1 year</div>
                    </div>
                    <div className={`text-2xl font-bold ${taxData.shortTermGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${taxData.shortTermGains.toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-gray-600">Tax Rate</div>
                      <div className="font-semibold">{taxData.shortTermRate}%</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Tax Owed</div>
                      <div className="font-semibold">${(taxData.shortTermGains * taxData.shortTermRate / 100).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Transactions</div>
                      <div className="font-semibold">{taxData.transactions.filter(t => t.holdingPeriod! <= 365).length}</div>
                    </div>
                  </div>
                </div>

                {/* Long-term gains */}
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-lg">Long-Term Capital Gains</div>
                      <div className="text-sm text-gray-600">Assets held &gt; 1 year</div>
                    </div>
                    <div className={`text-2xl font-bold ${taxData.longTermGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${taxData.longTermGains.toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-gray-600">Tax Rate</div>
                      <div className="font-semibold">{taxData.longTermRate}%</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Tax Owed</div>
                      <div className="font-semibold">${(taxData.longTermGains * taxData.longTermRate / 100).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Transactions</div>
                      <div className="font-semibold">{taxData.transactions.filter(t => t.holdingPeriod! > 365).length}</div>
                    </div>
                  </div>
                </div>

                {/* Income breakdown */}
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="font-semibold mb-3">Other Taxable Income</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Mining Rewards</span>
                      <span className="font-semibold">${taxData.miningIncome.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Staking Rewards</span>
                      <span className="font-semibold">${taxData.stakingIncome.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Interest Income</span>
                      <span className="font-semibold">${taxData.interestIncome.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Airdrops/Forks</span>
                      <span className="font-semibold">${taxData.airdropIncome.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-200">
                      <span className="font-semibold">Total Other Income</span>
                      <span className="font-bold">${taxData.otherIncome.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No tax data available for {taxYear}
              </div>
            )}
          </Card>

          {/* Transaction History */}
          {taxData && taxData.transactions.length > 0 && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Transaction History ({taxData.transactions.length})</h2>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-2">Date</th>
                      <th className="text-left py-2 px-2">Type</th>
                      <th className="text-right py-2 px-2">Amount</th>
                      <th className="text-right py-2 px-2">Cost Basis</th>
                      <th className="text-right py-2 px-2">Proceeds</th>
                      <th className="text-right py-2 px-2">Gain/Loss</th>
                      <th className="text-center py-2 px-2">Term</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxData.transactions.slice(0, 50).map((tx, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-2">{new Date(tx.date).toLocaleDateString()}</td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            tx.type === 'buy' ? 'bg-green-100 text-green-800' :
                            tx.type === 'sell' ? 'bg-red-100 text-red-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {tx.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="text-right py-2 px-2">{tx.amount.toFixed(4)} KC</td>
                        <td className="text-right py-2 px-2">${tx.costBasis?.toLocaleString() || '-'}</td>
                        <td className="text-right py-2 px-2">${tx.proceeds?.toLocaleString() || '-'}</td>
                        <td className={`text-right py-2 px-2 font-semibold ${
                          (tx.gainLoss || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {tx.gainLoss !== undefined ? `$${tx.gainLoss.toLocaleString()}` : '-'}
                        </td>
                        <td className="text-center py-2 px-2">
                          {tx.holdingPeriod !== undefined && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              tx.holdingPeriod > 365 ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                            }`}>
                              {tx.holdingPeriod > 365 ? 'Long' : 'Short'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column - Actions & Warnings */}
        <div className="space-y-6">
          {/* Export Options */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Export Tax Data</h2>
            <div className="space-y-3">
              <Button
                onClick={() => handleExport('turbotax')}
                disabled={!taxData}
                className="w-full bg-blue-500 hover:bg-blue-600"
              >
                📄 Export to TurboTax
              </Button>
              <Button
                onClick={() => handleExport('cointracker')}
                disabled={!taxData}
                className="w-full bg-purple-500 hover:bg-purple-600"
              >
                📊 Export to CoinTracker
              </Button>
              <Button
                onClick={() => handleExport('csv')}
                disabled={!taxData}
                className="w-full bg-green-500 hover:bg-green-600"
              >
                📋 Export as CSV
              </Button>
              <Button
                onClick={() => handleExport('pdf')}
                disabled={!taxData}
                className="w-full bg-red-500 hover:bg-red-600"
              >
                📑 Generate PDF Report
              </Button>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
              <div className="font-semibold text-blue-900 mb-1">💡 Tip</div>
              <div className="text-blue-800">
                Download all formats for your records. PDF for review, TurboTax/CoinTracker for filing.
              </div>
            </div>
          </Card>

          {/* Wash Sales Warning */}
          {washSales.length > 0 && (
            <Card className="p-6 bg-yellow-50 border-yellow-200">
              <h2 className="text-lg font-semibold text-yellow-900 mb-3">⚠️ Wash Sales Detected</h2>
              <p className="text-sm text-yellow-800 mb-3">
                {washSales.length} potential wash sale{washSales.length > 1 ? 's' : ''} detected.
                These may affect your deductible losses.
              </p>
              <div className="space-y-2">
                {washSales.slice(0, 3).map((ws, idx) => (
                  <div key={idx} className="p-2 bg-white rounded text-xs">
                    <div className="font-semibold">{new Date(ws.saleDate).toLocaleDateString()}</div>
                    <div className="text-gray-600">
                      Sold {ws.amount} KC at loss, repurchased within 30 days
                    </div>
                    <div className="text-red-600 font-semibold">
                      Disallowed Loss: ${ws.disallowedLoss.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
              {washSales.length > 3 && (
                <div className="text-center mt-2 text-sm text-yellow-800">
                  + {washSales.length - 3} more wash sales
                </div>
              )}
            </Card>
          )}

          {/* Tax Tips */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">📚 Tax Tips</h2>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span>•</span>
                <span>Hold assets &gt;1 year for lower long-term capital gains rates</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>Consider tax-loss harvesting to offset gains</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>Avoid wash sales by waiting 31 days before repurchasing</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>Track cost basis carefully using consistent method</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>Mining/staking rewards are taxed as ordinary income</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>Consult a tax professional for complex situations</span>
              </li>
            </ul>
          </Card>

          {/* Disclaimer */}
          <Card className="p-6 bg-red-50 border-red-200">
            <div className="text-sm text-red-800">
              <div className="font-semibold mb-2">⚠️ Important Disclaimer</div>
              <p>
                This tool provides estimates only and should not be considered tax advice.
                Tax laws vary by jurisdiction and change frequently. Always consult with a
                qualified tax professional before filing your taxes.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
