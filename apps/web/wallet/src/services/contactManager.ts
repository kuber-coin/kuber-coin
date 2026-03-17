import walletService from './wallet';

export interface Contact {
  id: string;
  name: string;
  address: string;
  email?: string;
  phone?: string;
  notes?: string;
  tags?: string[];
  groupIds?: string[];
  isFavorite?: boolean;
  createdAt: Date;
  lastTransactionAt?: Date;
}

export interface ContactGroup {
  id: string;
  name: string;
  description?: string;
  color: string;
  createdAt: Date;
}

export interface TransactionStats {
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
}

class ContactManager {
  private readonly CONTACTS_KEY = 'kubercoin_contacts';
  private readonly GROUPS_KEY = 'kubercoin_contact_groups';

  getAllContacts(): Contact[] {
    const data = localStorage.getItem(this.CONTACTS_KEY);
    if (!data) return [];
    
    return JSON.parse(data).map((contact: any) => ({
      ...contact,
      createdAt: new Date(contact.createdAt),
      lastTransactionAt: contact.lastTransactionAt ? new Date(contact.lastTransactionAt) : undefined,
    }));
  }

  getAllGroups(): ContactGroup[] {
    const data = localStorage.getItem(this.GROUPS_KEY);
    if (!data) return [];
    
    return JSON.parse(data).map((group: any) => ({
      ...group,
      createdAt: new Date(group.createdAt),
    }));
  }

  private saveContacts(contacts: Contact[]): void {
    localStorage.setItem(this.CONTACTS_KEY, JSON.stringify(contacts));
  }

  private saveGroups(groups: ContactGroup[]): void {
    localStorage.setItem(this.GROUPS_KEY, JSON.stringify(groups));
  }

  addContact(contactData: Omit<Contact, 'id' | 'createdAt'>): Contact {
    if (!contactData.name || contactData.name.trim() === '') {
      throw new Error('Contact name is required');
    }

    if (!contactData.address || !contactData.address.startsWith('KC')) {
      throw new Error('Valid Kubercoin address is required');
    }

    const contacts = this.getAllContacts();
    
    // Check for duplicate address
    if (contacts.some(c => c.address === contactData.address)) {
      throw new Error('Contact with this address already exists');
    }

    const contact: Contact = {
      ...contactData,
      id: `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };

    contacts.push(contact);
    this.saveContacts(contacts);

    return contact;
  }

  updateContact(id: string, updates: Partial<Omit<Contact, 'id' | 'createdAt'>>): Contact {
    const contacts = this.getAllContacts();
    const index = contacts.findIndex(c => c.id === id);
    
    if (index === -1) {
      throw new Error('Contact not found');
    }

    // Check for duplicate address if address is being updated
    if (updates.address && updates.address !== contacts[index].address) {
      if (contacts.some(c => c.id !== id && c.address === updates.address)) {
        throw new Error('Contact with this address already exists');
      }
    }

    contacts[index] = {
      ...contacts[index],
      ...updates,
    };

    this.saveContacts(contacts);
    return contacts[index];
  }

  deleteContact(id: string): boolean {
    const contacts = this.getAllContacts();
    const filtered = contacts.filter(c => c.id !== id);
    
    if (filtered.length === contacts.length) {
      return false;
    }

    this.saveContacts(filtered);
    return true;
  }

  getContactByAddress(address: string): Contact | undefined {
    const contacts = this.getAllContacts();
    return contacts.find(c => c.address === address);
  }

  searchContacts(query: string): Contact[] {
    const contacts = this.getAllContacts();
    const lowerQuery = query.toLowerCase();

    return contacts.filter(
      c =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.address.toLowerCase().includes(lowerQuery) ||
        (c.email || '').toLowerCase().includes(lowerQuery) ||
        (c.tags || []).some(tag => tag.toLowerCase().includes(lowerQuery)) ||
        (c.notes || '').toLowerCase().includes(lowerQuery)
    );
  }

  getContactsByTag(tag: string): Contact[] {
    const contacts = this.getAllContacts();
    return contacts.filter(c => (c.tags || []).includes(tag));
  }

  getContactsByGroup(groupId: string): Contact[] {
    const contacts = this.getAllContacts();
    return contacts.filter(c => (c.groupIds || []).includes(groupId));
  }

  getFavoriteContacts(): Contact[] {
    const contacts = this.getAllContacts();
    return contacts.filter(c => c.isFavorite);
  }

  // Group Management
  createGroup(name: string, description?: string, color: string = '#3b82f6'): ContactGroup {
    if (!name || name.trim() === '') {
      throw new Error('Group name is required');
    }

    const groups = this.getAllGroups();
    
    if (groups.some(g => g.name === name)) {
      throw new Error('Group with this name already exists');
    }

    const group: ContactGroup = {
      id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      color,
      createdAt: new Date(),
    };

    groups.push(group);
    this.saveGroups(groups);

    return group;
  }

  updateGroup(id: string, updates: Partial<Omit<ContactGroup, 'id' | 'createdAt'>>): ContactGroup {
    const groups = this.getAllGroups();
    const index = groups.findIndex(g => g.id === id);
    
    if (index === -1) {
      throw new Error('Group not found');
    }

    groups[index] = {
      ...groups[index],
      ...updates,
    };

    this.saveGroups(groups);
    return groups[index];
  }

  deleteGroup(id: string): boolean {
    const groups = this.getAllGroups();
    const filtered = groups.filter(g => g.id !== id);
    
    if (filtered.length === groups.length) {
      return false;
    }

    // Remove group from all contacts
    const contacts = this.getAllContacts();
    contacts.forEach(contact => {
      if (contact.groupIds?.includes(id)) {
        contact.groupIds = contact.groupIds.filter(gId => gId !== id);
      }
    });
    this.saveContacts(contacts);

    this.saveGroups(filtered);
    return true;
  }

  // Transaction Statistics
  async getContactTransactionStats(address: string): Promise<TransactionStats> {
    try {
      const wallet = walletService.getActiveWallet();
      if (!wallet) {
        return { totalSent: 0, totalReceived: 0, transactionCount: 0 };
      }

      const allTxs = await walletService.getTransactionHistory(wallet.address);
      const contactTxs = allTxs.filter(
        (tx) =>
          (tx.outputs?.some((out: any) => out.address === address) ?? false) ||
          (tx.inputs?.some((inp: any) => inp.address === address) ?? false)
      );

      let totalSent = 0;
      let totalReceived = 0;

      contactTxs.forEach((tx: any) => {
        const outputs = tx.outputs ?? [];
        const inputs = tx.inputs ?? [];
        // Check if we sent to this address
        const sentToContact = outputs
          .filter((out: any) => out.address === address)
          .reduce((sum: number, out: any) => sum + out.amount, 0);
        
        // Check if we received from this address
        const receivedFromContact = inputs
          .filter((inp: any) => inp.address === address)
          .reduce((sum: number, inp: any) => sum + inp.amount, 0);

        totalSent += sentToContact;
        totalReceived += receivedFromContact;
      });

      return {
        totalSent,
        totalReceived,
        transactionCount: contactTxs.length,
      };
    } catch {
      return { totalSent: 0, totalReceived: 0, transactionCount: 0 };
    }
  }

  getRecentContacts(limit: number = 5): Contact[] {
    const contacts = this.getAllContacts();
    
    // Sort by last transaction date
    const sorted = contacts
      .filter(c => c.lastTransactionAt)
      .sort((a, b) => {
        if (!a.lastTransactionAt || !b.lastTransactionAt) return 0;
        return b.lastTransactionAt.getTime() - a.lastTransactionAt.getTime();
      });

    return sorted.slice(0, limit);
  }

  // Import/Export
  exportToCSV(): string {
    const contacts = this.getAllContacts();
    
    const headers = ['name', 'address', 'email', 'phone', 'notes', 'tags', 'favorite'];
    const rows = contacts.map(c => [
      c.name,
      c.address,
      c.email || '',
      c.phone || '',
      c.notes || '',
      (c.tags || []).join(';'),
      c.isFavorite ? 'true' : 'false',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  }

  importFromCSV(csv: string): number {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) {
      throw new Error('Invalid CSV format');
    }

    // Skip header row
    const dataLines = lines.slice(1);
    let imported = 0;

    dataLines.forEach(line => {
      try {
        // Parse CSV line (handle quoted values)
        const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
        if (!matches || matches.length < 2) return;

        const values = matches.map(v => v.replace(/^"|"$/g, '').trim());
        
        const [name, address, email, phone, notes, tags, favorite] = values;

        if (!name || !address) return;

        const contactData = {
          name,
          address,
          email: email || undefined,
          phone: phone || undefined,
          notes: notes || undefined,
          tags: tags ? tags.split(';').filter(t => t) : undefined,
          isFavorite: favorite === 'true',
        };

        // Check if contact already exists
        const existing = this.getContactByAddress(address);
        if (existing) {
          this.updateContact(existing.id, contactData);
        } else {
          this.addContact(contactData);
        }

        imported++;
      } catch (error) {
        console.error('Failed to import contact:', error);
      }
    });

    return imported;
  }

  // Analytics
  async getTopContacts(limit: number = 5): Promise<Array<Contact & TransactionStats>> {
    const contacts = this.getAllContacts();
    
    const contactsWithStats = await Promise.all(contacts.map(async contact => ({
      ...contact,
      ...(await this.getContactTransactionStats(contact.address)),
    })));

    // Sort by total transaction volume (sent + received)
    contactsWithStats.sort((a, b) => {
      const aTotal = a.totalSent + a.totalReceived;
      const bTotal = b.totalSent + b.totalReceived;
      return bTotal - aTotal;
    });

    return contactsWithStats.slice(0, limit);
  }

  getAllTags(): string[] {
    const contacts = this.getAllContacts();
    const tags = new Set<string>();
    
    contacts.forEach(contact => {
      (contact.tags || []).forEach(tag => tags.add(tag));
    });

    return Array.from(tags).sort();
  }
}

const contactManager = new ContactManager();
export default contactManager;
