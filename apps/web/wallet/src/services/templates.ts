// Transaction Templates Service
// Save and manage reusable transaction templates

export interface TransactionTemplate {
  id: string;
  name: string;
  recipient: string;
  amount: number;
  note: string;
  category: string;
  tags: string[];
  recurring?: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    nextExecution?: number;
  };
  createdAt: number;
  lastUsed?: number;
  useCount: number;
}

class TemplatesService {
  private templates: Map<string, TransactionTemplate> = new Map();
  private readonly STORAGE_KEY = 'kubercoin_transaction_templates';

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  constructor() {
    this.loadTemplates();
  }

  private loadTemplates() {
    if (!this.isBrowser()) return;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const templatesArray = JSON.parse(stored);
        templatesArray.forEach((template: TransactionTemplate) => {
          this.templates.set(template.id, template);
        });
      }
    } catch {
      // Ignore storage/parse errors
    }
  }

  private saveTemplates() {
    if (!this.isBrowser()) return;
    try {
      const templatesArray = Array.from(this.templates.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(templatesArray));
    } catch {
      // Ignore storage write errors
    }
  }

  createTemplate(
    name: string,
    recipient: string,
    amount: number,
    note: string = '',
    category: string = '',
    tags: string[] = []
  ): TransactionTemplate {
    const template: TransactionTemplate = {
      id: `tmpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      recipient,
      amount,
      note,
      category,
      tags,
      createdAt: Date.now(),
      useCount: 0,
    };

    this.templates.set(template.id, template);
    this.saveTemplates();
    return template;
  }

  getTemplate(id: string): TransactionTemplate | undefined {
    return this.templates.get(id);
  }

  getAllTemplates(): TransactionTemplate[] {
    return Array.from(this.templates.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  updateTemplate(id: string, updates: Partial<TransactionTemplate>): boolean {
    const template = this.templates.get(id);
    if (!template) return false;

    Object.assign(template, updates);
    this.saveTemplates();
    return true;
  }

  deleteTemplate(id: string): boolean {
    const deleted = this.templates.delete(id);
    if (deleted) {
      this.saveTemplates();
    }
    return deleted;
  }

  useTemplate(id: string): TransactionTemplate | undefined {
    const template = this.templates.get(id);
    if (!template) return undefined;

    template.useCount++;
    template.lastUsed = Date.now();
    this.saveTemplates();
    return template;
  }

  searchTemplates(query: string): TransactionTemplate[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTemplates().filter(
      (t) =>
        t.name.toLowerCase().includes(lowerQuery) ||
        t.recipient.toLowerCase().includes(lowerQuery) ||
        t.note.toLowerCase().includes(lowerQuery) ||
        t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  getTemplatesByCategory(category: string): TransactionTemplate[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  getTemplatesByTag(tag: string): TransactionTemplate[] {
    return this.getAllTemplates().filter((t) => t.tags.includes(tag));
  }

  setRecurring(
    id: string,
    frequency: 'daily' | 'weekly' | 'monthly'
  ): boolean {
    const template = this.templates.get(id);
    if (!template) return false;

    template.recurring = {
      enabled: true,
      frequency,
      nextExecution: this.calculateNextExecution(frequency),
    };

    this.saveTemplates();
    return true;
  }

  private calculateNextExecution(frequency: 'daily' | 'weekly' | 'monthly'): number {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    switch (frequency) {
      case 'daily':
        return now + day;
      case 'weekly':
        return now + 7 * day;
      case 'monthly':
        return now + 30 * day;
    }
  }

  getDueTemplates(): TransactionTemplate[] {
    const now = Date.now();
    return this.getAllTemplates().filter(
      (t) => t.recurring?.enabled && t.recurring.nextExecution && t.recurring.nextExecution <= now
    );
  }

  exportTemplates(): string {
    return JSON.stringify(Array.from(this.templates.values()), null, 2);
  }

  importTemplates(jsonData: string): number {
    try {
      const templates = JSON.parse(jsonData);
      let imported = 0;

      templates.forEach((template: TransactionTemplate) => {
        if (!this.templates.has(template.id)) {
          this.templates.set(template.id, template);
          imported++;
        }
      });

      this.saveTemplates();
      return imported;
    } catch (error) {
      throw new Error('Invalid template data');
    }
  }

  clearAllTemplates(): void {
    this.templates.clear();
    if (!this.isBrowser()) return;
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {
      // Ignore storage write errors
    }
  }
}

const templatesService = new TemplatesService();
export default templatesService;
