'use client';

import React from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { TaxYear } from '@/services/taxCalculator';

interface TaxReportProps {
  taxData: TaxYear;
  onCloseAction: () => void;
  onExportAction: (format: 'turbotax' | 'cointracker' | 'csv' | 'pdf') => void;
}

export default function TaxReport({ taxData, onCloseAction, onExportAction }: TaxReportProps) {
  return (
    <Modal open onCloseAction={onCloseAction} title={`Tax Report ${taxData.year}`} size="lg">
      <div className="space-y-6">
        {/* Summary Section */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-4">Tax Year {taxData.year} Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-sm text-gray-600">Total Capital Gains</div>
              <div className={`text-3xl font-bold ${taxData.totalCapitalGains >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${taxData.totalCapitalGains.toLocaleString()}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-sm text-gray-600">Estimated Tax Due</div>
              <div className="text-3xl font-bold text-orange-600">
                ${taxData.estimatedTax.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold mb-3">Capital Gains Breakdown</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between p-2 bg-orange-50 rounded">
                <span>Short-Term Gains:</span>
                <span className="font-semibold">${taxData.shortTermGains.toLocaleString()}</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Tax Rate:</span>
                <span className="font-semibold">{taxData.shortTermRate}%</span>
              </div>
              <div className="flex justify-between p-2 bg-orange-100 rounded">
                <span>Tax Owed:</span>
                <span className="font-semibold">${(taxData.shortTermGains * taxData.shortTermRate / 100).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2 text-sm mt-4">
              <div className="flex justify-between p-2 bg-green-50 rounded">
                <span>Long-Term Gains:</span>
                <span className="font-semibold">${taxData.longTermGains.toLocaleString()}</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Tax Rate:</span>
                <span className="font-semibold">{taxData.longTermRate}%</span>
              </div>
              <div className="flex justify-between p-2 bg-green-100 rounded">
                <span>Tax Owed:</span>
                <span className="font-semibold">${(taxData.longTermGains * taxData.longTermRate / 100).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-3">Other Income</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between p-2 bg-blue-50 rounded">
                <span>Mining Income:</span>
                <span className="font-semibold">${taxData.miningIncome.toLocaleString()}</span>
              </div>
              <div className="flex justify-between p-2 bg-blue-50 rounded">
                <span>Staking Income:</span>
                <span className="font-semibold">${taxData.stakingIncome.toLocaleString()}</span>
              </div>
              <div className="flex justify-between p-2 bg-blue-50 rounded">
                <span>Interest Income:</span>
                <span className="font-semibold">${taxData.interestIncome.toLocaleString()}</span>
              </div>
              <div className="flex justify-between p-2 bg-blue-50 rounded">
                <span>Airdrop Income:</span>
                <span className="font-semibold">${taxData.airdropIncome.toLocaleString()}</span>
              </div>
              <div className="flex justify-between p-2 bg-blue-100 rounded font-semibold mt-2">
                <span>Total Other Income:</span>
                <span>${taxData.otherIncome.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Method & Jurisdiction */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Calculation Method:</div>
              <div className="font-semibold">{taxData.method}</div>
            </div>
            <div>
              <div className="text-gray-600">Jurisdiction:</div>
              <div className="font-semibold">{taxData.jurisdiction}</div>
            </div>
            <div>
              <div className="text-gray-600">Total Transactions:</div>
              <div className="font-semibold">{taxData.transactions.length}</div>
            </div>
          </div>
        </div>

        {/* Export Actions */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-3">Export Options</h4>
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => onExportAction('turbotax')}
              className="bg-blue-500 hover:bg-blue-600"
            >
              📄 TurboTax (TXF)
            </Button>
            <Button
              onClick={() => onExportAction('cointracker')}
              className="bg-purple-500 hover:bg-purple-600"
            >
              📊 CoinTracker (CSV)
            </Button>
            <Button
              onClick={() => onExportAction('csv')}
              className="bg-green-500 hover:bg-green-600"
            >
              📋 CSV Spreadsheet
            </Button>
            <Button
              onClick={() => onExportAction('pdf')}
              className="bg-red-500 hover:bg-red-600"
            >
              📑 PDF Report
            </Button>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
          <div className="font-semibold text-yellow-900 mb-1">⚠️ Important Notice</div>
          <div className="text-yellow-800">
            This report is based on the calculation method and tax rates for {taxData.jurisdiction}.
            Tax laws are complex and vary by jurisdiction. This tool is for informational purposes only
            and should not be considered professional tax advice. Always consult with a qualified tax
            professional before filing your tax return.
          </div>
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onCloseAction} className="bg-gray-500 hover:bg-gray-600">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
