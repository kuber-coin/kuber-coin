/**
 * Transaction Labels Service
 * Manages transaction notes, tags, and labels
 */

export interface TransactionLabel {
  txid: string;
  note?: string;
  tags: string[];
  category?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LabelTemplate {
  id: string;
  name: string;
  note: string;
  tags: string[];
  category?: string;
}

class TransactionLabelsService {
  private labels: Map<string, TransactionLabel>;
  private templates: LabelTemplate[];
  private listeners: Set<() => void>;

  constructor() {
    this.labels = new Map();
    this.templates = [];
    this.listeners = new Set();
    // Client components can be pre-rendered on the server; avoid localStorage there.
    if (typeof window !== 'undefined') {
      this.loadLabels();
      this.loadTemplates();
    }
  }

  private loadLabels() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('kubercoin_transaction_labels');
      if (stored) {
        const labelsArray: TransactionLabel[] = JSON.parse(stored);
        this.labels = new Map(labelsArray.map((label) => [label.txid, label]));
      }
    } catch (err) {
      console.error('Failed to load transaction labels:', err);
    }
  }

  private saveLabels() {
    if (typeof window === 'undefined') return;

    try {
      const labelsArray = Array.from(this.labels.values());
      localStorage.setItem('kubercoin_transaction_labels', JSON.stringify(labelsArray));
      this.notifyListeners();
    } catch (err) {
      console.error('Failed to save transaction labels:', err);
    }
  }

  private loadTemplates() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('kubercoin_label_templates');
      if (stored) {
        this.templates = JSON.parse(stored);
      } else {
        // Default templates
        this.templates = [
          {
            id: 'personal',
            name: 'Personal',
            note: 'Personal transaction',
            tags: ['personal'],
            category: 'personal',
          },
          {
            id: 'business',
            name: 'Business',
            note: 'Business expense',
            tags: ['business', 'expense'],
            category: 'business',
          },
          {
            id: 'mining',
            name: 'Mining',
            note: 'Mining reward',
            tags: ['mining', 'income'],
            category: 'mining',
          },
          {
            id: 'exchange',
            name: 'Exchange',
            note: 'Exchange transfer',
            tags: ['exchange'],
            category: 'exchange',
          },
          {
            id: 'payment',
            name: 'Payment',
            note: 'Payment received',
            tags: ['payment', 'income'],
            category: 'income',
          },
        ];
        this.saveTemplates();
      }
    } catch (err) {
      console.error('Failed to load label templates:', err);
    }
  }

  private saveTemplates() {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem('kubercoin_label_templates', JSON.stringify(this.templates));
    } catch (err) {
      console.error('Failed to save label templates:', err);
    }
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  addLabel(txid: string, note?: string, tags: string[] = [], category?: string): TransactionLabel {
    const now = Date.now();
    const label: TransactionLabel = {
      txid,
      note,
      tags,
      category,
      createdAt: now,
      updatedAt: now,
    };

    this.labels.set(txid, label);
    this.saveLabels();
    return label;
  }

  updateLabel(txid: string, updates: Partial<Omit<TransactionLabel, 'txid' | 'createdAt'>>): boolean {
    const label = this.labels.get(txid);
    if (!label) {
      return false;
    }

    const updatedLabel: TransactionLabel = {
      ...label,
      ...updates,
      updatedAt: Date.now(),
    };

    this.labels.set(txid, updatedLabel);
    this.saveLabels();
    return true;
  }

  deleteLabel(txid: string): boolean {
    const deleted = this.labels.delete(txid);
    if (deleted) {
      this.saveLabels();
    }
    return deleted;
  }

  getLabel(txid: string): TransactionLabel | undefined {
    return this.labels.get(txid);
  }

  getAllLabels(): TransactionLabel[] {
    return Array.from(this.labels.values());
  }

  getLabelsByTag(tag: string): TransactionLabel[] {
    return this.getAllLabels().filter((label) =>
      label.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
    );
  }

  getLabelsByCategory(category: string): TransactionLabel[] {
    return this.getAllLabels().filter(
      (label) => label.category?.toLowerCase() === category.toLowerCase()
    );
  }

  searchLabels(query: string): TransactionLabel[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllLabels().filter(
      (label) =>
        label.note?.toLowerCase().includes(lowerQuery) ||
        label.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
        label.category?.toLowerCase().includes(lowerQuery) ||
        label.txid.toLowerCase().includes(lowerQuery)
    );
  }

  getAllTags(): string[] {
    const tagsSet = new Set<string>();
    this.getAllLabels().forEach((label) => {
      label.tags.forEach((tag) => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }

  getAllCategories(): string[] {
    const categoriesSet = new Set<string>();
    this.getAllLabels().forEach((label) => {
      if (label.category) {
        categoriesSet.add(label.category);
      }
    });
    return Array.from(categoriesSet).sort();
  }

  // Template Management
  getTemplates(): LabelTemplate[] {
    return [...this.templates];
  }

  getTemplate(id: string): LabelTemplate | undefined {
    return this.templates.find((t) => t.id === id);
  }

  applyTemplate(txid: string, templateId: string): TransactionLabel | null {
    const template = this.getTemplate(templateId);
    if (!template) {
      return null;
    }

    return this.addLabel(txid, template.note, [...template.tags], template.category);
  }

  addTemplate(template: Omit<LabelTemplate, 'id'>): LabelTemplate {
    const newTemplate: LabelTemplate = {
      ...template,
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    this.templates.push(newTemplate);
    this.saveTemplates();
    return newTemplate;
  }

  updateTemplate(id: string, updates: Partial<Omit<LabelTemplate, 'id'>>): boolean {
    const index = this.templates.findIndex((t) => t.id === id);
    if (index === -1) {
      return false;
    }

    this.templates[index] = {
      ...this.templates[index],
      ...updates,
    };

    this.saveTemplates();
    return true;
  }

  deleteTemplate(id: string): boolean {
    const initialLength = this.templates.length;
    this.templates = this.templates.filter((t) => t.id !== id);
    
    if (this.templates.length < initialLength) {
      this.saveTemplates();
      return true;
    }
    
    return false;
  }

  // Export/Import
  exportLabels(): string {
    const data = {
      labels: Array.from(this.labels.values()),
      templates: this.templates,
      exportedAt: Date.now(),
    };
    return JSON.stringify(data, null, 2);
  }

  importLabels(jsonData: string): { success: number; failed: number } {
    try {
      const data = JSON.parse(jsonData);
      let success = 0;
      let failed = 0;

      if (data.labels && Array.isArray(data.labels)) {
        data.labels.forEach((label: TransactionLabel) => {
          try {
            // Don't overwrite existing labels
            if (!this.labels.has(label.txid)) {
              this.labels.set(label.txid, label);
              success++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        });
      }

      if (data.templates && Array.isArray(data.templates)) {
        data.templates.forEach((template: LabelTemplate) => {
          try {
            // Don't overwrite existing templates
            if (!this.templates.find((t) => t.id === template.id)) {
              this.templates.push(template);
              success++;
            }
          } catch {
            // Silently skip failed template imports
          }
        });
      }

      this.saveLabels();
      this.saveTemplates();

      return { success, failed };
    } catch (err) {
      console.error('Failed to import labels:', err);
      return { success: 0, failed: 0 };
    }
  }

  // Bulk operations
  bulkAddLabels(labels: Array<{ txid: string; note?: string; tags?: string[]; category?: string }>): number {
    let added = 0;
    labels.forEach(({ txid, note, tags, category }) => {
      try {
        this.addLabel(txid, note, tags, category);
        added++;
      } catch {
        // Skip failed additions
      }
    });
    return added;
  }

  bulkDeleteLabels(txids: string[]): number {
    let deleted = 0;
    txids.forEach((txid) => {
      if (this.deleteLabel(txid)) {
        deleted++;
      }
    });
    return deleted;
  }

  clearAllLabels(): void {
    this.labels.clear();
    this.saveLabels();
  }
}

// Export singleton instance
const transactionLabelsService = new TransactionLabelsService();
export default transactionLabelsService;
