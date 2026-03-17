// socialRecovery.ts - Social recovery with trusted contacts

export interface TrustedContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address: string;
  addedDate: number;
  verified: boolean;
  shareAssigned: boolean;
}

export interface RecoveryRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  initiatedDate: number;
  requiredApprovals: number;
  approvals: {
    contactId: string;
    contactName: string;
    approvedDate: number;
    signature: string;
  }[];
  rejections: {
    contactId: string;
    contactName: string;
    rejectedDate: number;
    reason?: string;
  }[];
}

class SocialRecovery {
  private trustedContacts: Map<string, TrustedContact>;
  private recoveryRequests: Map<string, RecoveryRequest>;
  private readonly STORAGE_KEY_CONTACTS = 'kubercoin_social_contacts';
  private readonly STORAGE_KEY_REQUESTS = 'kubercoin_social_requests';

  constructor() {
    this.trustedContacts = new Map();
    this.recoveryRequests = new Map();
    this.loadContacts();
    this.loadRequests();
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private loadContacts() {
    if (!this.isBrowser()) return;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_CONTACTS);
      if (!stored) return;
      const contacts = JSON.parse(stored) as TrustedContact[];
      contacts.forEach((contact) => this.trustedContacts.set(contact.id, contact));
    } catch {
      // ignore storage errors
    }
  }

  private saveContacts() {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(
        this.STORAGE_KEY_CONTACTS,
        JSON.stringify(Array.from(this.trustedContacts.values()))
      );
    } catch {
      // ignore storage errors
    }
  }

  private loadRequests() {
    if (!this.isBrowser()) return;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_REQUESTS);
      if (!stored) return;
      const requests = JSON.parse(stored) as RecoveryRequest[];
      requests.forEach((request) => this.recoveryRequests.set(request.id, request));
    } catch {
      // ignore storage errors
    }
  }

  private saveRequests() {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(
        this.STORAGE_KEY_REQUESTS,
        JSON.stringify(Array.from(this.recoveryRequests.values()))
      );
    } catch {
      // ignore storage errors
    }
  }

  getTrustedContacts(): TrustedContact[] {
    return Array.from(this.trustedContacts.values());
  }

  async addTrustedContact(name: string, email: string, phone: string, address: string): Promise<TrustedContact> {
    const contactId = `tc_${Date.now()}`;

    const contact: TrustedContact = {
      id: contactId,
      name,
      email,
      phone,
      address,
      addedDate: Date.now(),
      verified: false,
      shareAssigned: false,
    };

    this.trustedContacts.set(contactId, contact);
    this.saveContacts();
    return contact;
  }

  async verifyContact(contactId: string): Promise<boolean> {
    const contact = this.trustedContacts.get(contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }

    contact.verified = true;
    this.trustedContacts.set(contactId, contact);
    this.saveContacts();
    return true;
  }

  async assignShare(contactId: string, shareData: string): Promise<boolean> {
    const contact = this.trustedContacts.get(contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }

    if (!contact.verified) {
      throw new Error('Contact must be verified before assigning share');
    }

    contact.shareAssigned = true;
    this.trustedContacts.set(contactId, contact);
    this.saveContacts();
    return true;
  }

  async initiateRecovery(requiredApprovals: number): Promise<RecoveryRequest> {
    const requestId = `recovery_${Date.now()}`;

    const request: RecoveryRequest = {
      id: requestId,
      status: 'pending',
      initiatedDate: Date.now(),
      requiredApprovals,
      approvals: [],
      rejections: [],
    };

    this.recoveryRequests.set(requestId, request);
    this.saveRequests();
    return request;
  }

  async approveRecovery(requestId: string, contactId: string, signature: string = ''): Promise<RecoveryRequest> {
    const request = this.recoveryRequests.get(requestId);
    if (!request) {
      throw new Error('Recovery request not found');
    }

    const contact = this.trustedContacts.get(contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }

    request.approvals.push({
      contactId,
      contactName: contact.name,
      approvedDate: Date.now(),
      signature,
    });

    if (request.approvals.length >= request.requiredApprovals) {
      request.status = 'approved';
    }

    this.recoveryRequests.set(requestId, request);
    this.saveRequests();
    return request;
  }

  async rejectRecovery(requestId: string, contactId: string, reason?: string): Promise<RecoveryRequest> {
    const request = this.recoveryRequests.get(requestId);
    if (!request) {
      throw new Error('Recovery request not found');
    }

    const contact = this.trustedContacts.get(contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }

    request.rejections.push({
      contactId,
      contactName: contact.name,
      rejectedDate: Date.now(),
      reason,
    });

    request.status = 'rejected';
    this.recoveryRequests.set(requestId, request);
    this.saveRequests();
    return request;
  }

  getRecoveryRequest(requestId: string): RecoveryRequest | undefined {
    return this.recoveryRequests.get(requestId);
  }

  async removeTrustedContact(contactId: string): Promise<boolean> {
    const removed = this.trustedContacts.delete(contactId);
    if (removed) this.saveContacts();
    return removed;
  }
}

const socialRecovery = new SocialRecovery();
export default socialRecovery;