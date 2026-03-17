// Invoicing Service
// Create and manage payment invoices

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  to: string;
  toName?: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentAddress: string;
  createdAt: number;
  dueDate: number;
  paidAt?: number;
  status: 'draft' | 'pending' | 'paid' | 'expired';
  notes?: string;
  recurring?: {
    frequency: 'weekly' | 'monthly' | 'yearly';
    nextInvoiceDate: number;
  };
}

class InvoicingService {
  private invoices: Map<string, Invoice> = new Map();
  private invoiceCounter = 1000;
  private readonly STORAGE_KEY = 'kubercoin_invoices';

  constructor() {
    this.loadInvoices();
  }

  private loadInvoices() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      data.invoices.forEach((inv: Invoice) => this.invoices.set(inv.id, inv));
      this.invoiceCounter = data.counter || 1000;
    }
  }

  private saveInvoices() {
    const data = {
      invoices: Array.from(this.invoices.values()),
      counter: this.invoiceCounter,
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  createInvoice(
    to: string,
    lineItems: Omit<InvoiceLineItem, 'id' | 'total'>[],
    paymentAddress: string,
    dueDate: number,
    options?: { toName?: string; tax?: number; notes?: string }
  ): Invoice {
    const items: InvoiceLineItem[] = lineItems.map((item, i) => ({
      ...item,
      id: `item_${i}`,
      total: item.quantity * item.unitPrice,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax = options?.tax || 0;
    const total = subtotal + tax;

    const invoice: Invoice = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      invoiceNumber: `INV-${this.invoiceCounter++}`,
      to,
      toName: options?.toName,
      lineItems: items,
      subtotal,
      tax,
      total,
      paymentAddress,
      createdAt: Date.now(),
      dueDate,
      status: 'pending',
      notes: options?.notes,
    };

    this.invoices.set(invoice.id, invoice);
    this.saveInvoices();
    return invoice;
  }

  getInvoices(): Invoice[] {
    return Array.from(this.invoices.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getInvoice(id: string): Invoice | undefined {
    return this.invoices.get(id);
  }

  markAsPaid(id: string): void {
    const invoice = this.invoices.get(id);
    if (!invoice) throw new Error('Invoice not found');

    invoice.status = 'paid';
    invoice.paidAt = Date.now();
    this.saveInvoices();
  }

  exportToPDF(invoice: Invoice): string {
    // In production, use a PDF library
    let pdf = `INVOICE ${invoice.invoiceNumber}\n\n`;
    pdf += `To: ${invoice.toName || invoice.to}\n`;
    pdf += `Date: ${new Date(invoice.createdAt).toLocaleDateString()}\n`;
    pdf += `Due: ${new Date(invoice.dueDate).toLocaleDateString()}\n\n`;
    pdf += `LINE ITEMS:\n`;
    invoice.lineItems.forEach((item) => {
      pdf += `${item.description} x${item.quantity} @ ${item.unitPrice.toFixed(8)} KC = ${item.total.toFixed(8)} KC\n`;
    });
    pdf += `\nSubtotal: ${invoice.subtotal.toFixed(8)} KC\n`;
    if (invoice.tax > 0) pdf += `Tax: ${invoice.tax.toFixed(8)} KC\n`;
    pdf += `TOTAL: ${invoice.total.toFixed(8)} KC\n\n`;
    pdf += `Payment Address: ${invoice.paymentAddress}\n`;
    return pdf;
  }
}

const invoicingService = new InvoicingService();
export default invoicingService;
