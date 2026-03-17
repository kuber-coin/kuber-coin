/**
 * Address Book Service for KuberCoin Wallet
 * Manages contacts and frequently used addresses
 */

export interface Contact {
  id: string;
  name: string;
  address: string;
  label?: string;
  tags: string[];
  notes?: string;
  favorite: boolean;
  createdAt: number;
  lastUsed?: number;
  useCount: number;
}

class AddressBookService {
  private contacts: Map<string, Contact> = new Map();

  constructor() {
    this.loadContacts();
  }

  /**
   * Load contacts from localStorage
   */
  private loadContacts(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('kubercoin_address_book');
      if (stored) {
        const contacts = JSON.parse(stored);
        this.contacts = new Map(Object.entries(contacts));
      }
    } catch (error) {
      console.error('Failed to load address book:', error);
    }
  }

  /**
   * Save contacts to localStorage
   */
  private saveContacts(): void {
    if (typeof window === 'undefined') return;

    try {
      const contactsObj = Object.fromEntries(this.contacts);
      localStorage.setItem('kubercoin_address_book', JSON.stringify(contactsObj));
    } catch (error) {
      console.error('Failed to save address book:', error);
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add a new contact
   */
  addContact(
    name: string,
    address: string,
    label?: string,
    tags: string[] = [],
    notes?: string
  ): Contact {
    // Check if address already exists
    const existing = Array.from(this.contacts.values()).find(c => c.address === address);
    if (existing) {
      throw new Error('This address is already in your address book');
    }

    const contact: Contact = {
      id: this.generateId(),
      name,
      address,
      label,
      tags,
      notes,
      favorite: false,
      createdAt: Date.now(),
      useCount: 0,
    };

    this.contacts.set(contact.id, contact);
    this.saveContacts();
    return contact;
  }

  /**
   * Update a contact
   */
  updateContact(
    id: string,
    updates: Partial<Omit<Contact, 'id' | 'createdAt' | 'useCount'>>
  ): Contact | null {
    const contact = this.contacts.get(id);
    if (!contact) return null;

    const updated = { ...contact, ...updates };
    this.contacts.set(id, updated);
    this.saveContacts();
    return updated;
  }

  /**
   * Delete a contact
   */
  deleteContact(id: string): boolean {
    const deleted = this.contacts.delete(id);
    if (deleted) {
      this.saveContacts();
    }
    return deleted;
  }

  /**
   * Get a contact by ID
   */
  getContact(id: string): Contact | undefined {
    return this.contacts.get(id);
  }

  /**
   * Get a contact by address
   */
  getContactByAddress(address: string): Contact | undefined {
    return Array.from(this.contacts.values()).find(c => c.address === address);
  }

  /**
   * Get all contacts
   */
  getAllContacts(): Contact[] {
    return Array.from(this.contacts.values());
  }

  /**
   * Get favorite contacts
   */
  getFavorites(): Contact[] {
    return this.getAllContacts().filter(c => c.favorite);
  }

  /**
   * Get recently used contacts
   */
  getRecentlyUsed(limit: number = 5): Contact[] {
    return this.getAllContacts()
      .filter(c => c.lastUsed)
      .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
      .slice(0, limit);
  }

  /**
   * Get frequently used contacts
   */
  getFrequentlyUsed(limit: number = 5): Contact[] {
    return this.getAllContacts()
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);
  }

  /**
   * Search contacts
   */
  searchContacts(query: string): Contact[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllContacts().filter(contact =>
      contact.name.toLowerCase().includes(lowerQuery) ||
      contact.address.toLowerCase().includes(lowerQuery) ||
      contact.label?.toLowerCase().includes(lowerQuery) ||
      contact.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      contact.notes?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get contacts by tag
   */
  getContactsByTag(tag: string): Contact[] {
    return this.getAllContacts().filter(contact =>
      contact.tags.includes(tag)
    );
  }

  /**
   * Toggle favorite status
   */
  toggleFavorite(id: string): boolean {
    const contact = this.contacts.get(id);
    if (!contact) return false;

    contact.favorite = !contact.favorite;
    this.contacts.set(id, contact);
    this.saveContacts();
    return contact.favorite;
  }

  /**
   * Record address usage
   */
  recordUsage(address: string): void {
    const contact = this.getContactByAddress(address);
    if (contact) {
      contact.lastUsed = Date.now();
      contact.useCount++;
      this.contacts.set(contact.id, contact);
      this.saveContacts();
    }
  }

  /**
   * Get all unique tags
   */
  getAllTags(): string[] {
    const tags = new Set<string>();
    this.getAllContacts().forEach(contact => {
      contact.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }

  /**
   * Export address book
   */
  exportAddressBook(): string {
    return JSON.stringify(Array.from(this.contacts.values()), null, 2);
  }

  /**
   * Import address book
   */
  importAddressBook(jsonData: string): { success: number; failed: number } {
    try {
      const contacts: Contact[] = JSON.parse(jsonData);
      let success = 0;
      let failed = 0;

      contacts.forEach(contact => {
        try {
          // Check if address already exists
          if (this.getContactByAddress(contact.address)) {
            failed++;
            return;
          }

          this.contacts.set(contact.id, contact);
          success++;
        } catch (err) {
          failed++;
        }
      });

      this.saveContacts();
      return { success, failed };
    } catch (error) {
      throw new Error('Invalid address book data');
    }
  }
}

// Export singleton instance
const addressBookService = new AddressBookService();
export default addressBookService;
