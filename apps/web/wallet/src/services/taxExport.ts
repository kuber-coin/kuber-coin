import { TaxYear } from './taxCalculator';

class TaxExport {
  exportTaxData(taxData: TaxYear, format: 'turbotax' | 'cointracker' | 'csv' | 'pdf'): string {
    switch (format) {
      case 'turbotax':
        return this.exportToTurboTax(taxData);
      case 'cointracker':
        return this.exportToCoinTracker(taxData);
      case 'csv':
        return this.exportToCSV(taxData);
      case 'pdf':
        return this.generatePDF(taxData);
      default:
        throw new Error('Unsupported format');
    }
  }

  private exportToTurboTax(taxData: TaxYear): string {
    // TurboTax TXF format
    let txf = 'V042\n'; // Version
    txf += 'AKubercoin Tax Export\n';
    txf += `D${new Date().toLocaleDateString()}\n`;
    txf += '^\n';
    
    // Add capital gains transactions
    taxData.transactions
      .filter(tx => tx.type === 'sell')
      .forEach(tx => {
        const term = tx.holdingPeriod! > 365 ? 'D' : 'TD';
        txf += `${term}\n`;
        txf += `N321\n`; // Form 8949 code
        txf += `C1\n`;
        txf += `LKubercoin (${tx.amount} KC)\n`;
        txf += `D${new Date(tx.date).toLocaleDateString()}\n`;
        txf += `D${new Date(tx.date).toLocaleDateString()}\n`;
        txf += `$${tx.proceeds}\n`;
        txf += `$${tx.costBasis}\n`;
        txf += '^\n';
      });
    
    return txf;
  }

  private exportToCoinTracker(taxData: TaxYear): string {
    // CoinTracker CSV format
    const headers = [
      'Date',
      'Received Quantity',
      'Received Currency',
      'Sent Quantity',
      'Sent Currency',
      'Fee Amount',
      'Fee Currency',
      'Tag'
    ].join(',');
    
    const rows = taxData.transactions.map(tx => {
      if (tx.type === 'buy') {
        return [
          new Date(tx.date).toISOString(),
          tx.amount,
          'KC',
          tx.amount * tx.price,
          'USD',
          '0',
          'USD',
          'buy'
        ].join(',');
      } else if (tx.type === 'sell') {
        return [
          new Date(tx.date).toISOString(),
          tx.amount * tx.price,
          'USD',
          tx.amount,
          'KC',
          '0',
          'USD',
          'sell'
        ].join(',');
      } else {
        return [
          new Date(tx.date).toISOString(),
          tx.amount,
          'KC',
          '0',
          'USD',
          '0',
          'USD',
          tx.type
        ].join(',');
      }
    });
    
    return [headers, ...rows].join('\n');
  }

  private exportToCSV(taxData: TaxYear): string {
    const headers = [
      'Date',
      'Type',
      'Amount (KC)',
      'Price (USD)',
      'Cost Basis (USD)',
      'Proceeds (USD)',
      'Gain/Loss (USD)',
      'Holding Period (days)',
      'Term'
    ].join(',');
    
    const rows = taxData.transactions.map(tx => {
      return [
        new Date(tx.date).toLocaleDateString(),
        tx.type,
        tx.amount.toFixed(4),
        tx.price.toFixed(2),
        tx.costBasis?.toFixed(2) || '',
        tx.proceeds?.toFixed(2) || '',
        tx.gainLoss?.toFixed(2) || '',
        tx.holdingPeriod || '',
        tx.holdingPeriod && tx.holdingPeriod > 365 ? 'Long' : 'Short'
      ].join(',');
    });
    
    return [headers, ...rows].join('\n');
  }

  private generatePDF(taxData: TaxYear): string {
    // In production, use a PDF library like jsPDF
    // For now, return a data URL that opens a print-friendly HTML page
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kubercoin Tax Report ${taxData.year}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
          h2 { color: #555; margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #007bff; color: white; }
          .summary { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .summary-item { display: flex; justify-content: space-between; margin: 10px 0; }
          .label { font-weight: bold; }
          .value { color: #007bff; }
          .positive { color: #28a745; }
          .negative { color: #dc3545; }
          @media print { 
            body { margin: 20px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Print Report</button>
        
        <h1>Kubercoin Tax Report</h1>
        <p><strong>Tax Year:</strong> ${taxData.year}</p>
        <p><strong>Calculation Method:</strong> ${taxData.method}</p>
        <p><strong>Jurisdiction:</strong> ${taxData.jurisdiction}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
        
        <div class="summary">
          <h2>Summary</h2>
          <div class="summary-item">
            <span class="label">Total Capital Gains:</span>
            <span class="value ${taxData.totalCapitalGains >= 0 ? 'positive' : 'negative'}">
              $${taxData.totalCapitalGains.toLocaleString()}
            </span>
          </div>
          <div class="summary-item">
            <span class="label">Short-Term Gains (${taxData.shortTermRate}%):</span>
            <span class="value">$${taxData.shortTermGains.toLocaleString()}</span>
          </div>
          <div class="summary-item">
            <span class="label">Long-Term Gains (${taxData.longTermRate}%):</span>
            <span class="value">$${taxData.longTermGains.toLocaleString()}</span>
          </div>
          <div class="summary-item">
            <span class="label">Other Income:</span>
            <span class="value">$${taxData.otherIncome.toLocaleString()}</span>
          </div>
          <div class="summary-item">
            <span class="label">Total Taxable Income:</span>
            <span class="value">$${taxData.taxableIncome.toLocaleString()}</span>
          </div>
          <div class="summary-item">
            <span class="label">Estimated Tax Due:</span>
            <span class="value negative">$${taxData.estimatedTax.toLocaleString()}</span>
          </div>
        </div>
        
        <h2>Transaction Details</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Price</th>
              <th>Cost Basis</th>
              <th>Proceeds</th>
              <th>Gain/Loss</th>
              <th>Term</th>
            </tr>
          </thead>
          <tbody>
            ${taxData.transactions.map(tx => `
              <tr>
                <td>${new Date(tx.date).toLocaleDateString()}</td>
                <td>${tx.type.toUpperCase()}</td>
                <td>${tx.amount.toFixed(4)} KC</td>
                <td>$${tx.price.toFixed(2)}</td>
                <td>${tx.costBasis ? '$' + tx.costBasis.toFixed(2) : '-'}</td>
                <td>${tx.proceeds ? '$' + tx.proceeds.toFixed(2) : '-'}</td>
                <td class="${(tx.gainLoss || 0) >= 0 ? 'positive' : 'negative'}">
                  ${tx.gainLoss !== undefined ? '$' + tx.gainLoss.toFixed(2) : '-'}
                </td>
                <td>${tx.holdingPeriod !== undefined ? (tx.holdingPeriod > 365 ? 'Long' : 'Short') : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div style="margin-top: 40px; padding: 20px; background-color: #fff3cd; border: 1px solid #ffc107;">
          <p><strong>Disclaimer:</strong> This report is for informational purposes only and should not be considered tax advice. 
          Tax laws vary by jurisdiction and change frequently. Please consult with a qualified tax professional before filing your taxes.</p>
        </div>
      </body>
      </html>
    `;
    
    // Return as data URL
    const blob = new Blob([html], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }
}

const taxExport = new TaxExport();
export default taxExport;
