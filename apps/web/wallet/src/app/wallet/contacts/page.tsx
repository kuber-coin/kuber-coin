'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardBody } from '@/components/Card';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import contactManager, { Contact, ContactGroup } from '@/services/contactManager';
import walletService from '@/services/wallet';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [showCreateContactModal, setShowCreateContactModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  
  const [contactForm, setContactForm] = useState({
    name: '',
    address: '',
    email: '',
    phone: '',
    notes: '',
    tags: [] as string[],
    groupIds: [] as string[],
    isFavorite: false,
  });

  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setContacts(contactManager.getAllContacts());
    setGroups(contactManager.getAllGroups());
  };

  const handleCreateContact = () => {
    try {
      if (selectedContact) {
        contactManager.updateContact(selectedContact.id, contactForm);
      } else {
        contactManager.addContact(contactForm);
      }
      loadData();
      setShowCreateContactModal(false);
      resetContactForm();
      alert(`Contact ${selectedContact ? 'updated' : 'created'} successfully!`);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleCreateGroup = () => {
    try {
      contactManager.createGroup(groupForm.name, groupForm.description, groupForm.color);
      loadData();
      setShowCreateGroupModal(false);
      resetGroupForm();
      alert('Group created successfully!');
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDeleteContact = (id: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      contactManager.deleteContact(id);
      loadData();
    }
  };

  const handleToggleFavorite = (id: string) => {
    const contact = contacts.find(c => c.id === id);
    if (contact) {
      contactManager.updateContact(id, { isFavorite: !contact.isFavorite });
      loadData();
    }
  };

  const handleEditContact = (contact: Contact) => {
    setSelectedContact(contact);
    setContactForm({
      name: contact.name,
      address: contact.address,
      email: contact.email || '',
      phone: contact.phone || '',
      notes: contact.notes || '',
      tags: contact.tags || [],
      groupIds: contact.groupIds || [],
      isFavorite: contact.isFavorite || false,
    });
    setShowCreateContactModal(true);
  };

  const resetContactForm = () => {
    setContactForm({
      name: '',
      address: '',
      email: '',
      phone: '',
      notes: '',
      tags: [],
      groupIds: [],
      isFavorite: false,
    });
    setSelectedContact(null);
  };

  const resetGroupForm = () => {
    setGroupForm({
      name: '',
      description: '',
      color: '#3b82f6',
    });
  };

  const handleExportCSV = () => {
    const csv = contactManager.exportToCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kubercoin-contacts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const imported = contactManager.importFromCSV(csv);
        loadData();
        setShowImportModal(false);
        alert(`Successfully imported ${imported} contacts!`);
      } catch (error: any) {
        alert(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  const addTag = (tag: string) => {
    if (tag && !contactForm.tags.includes(tag)) {
      setContactForm({
        ...contactForm,
        tags: [...contactForm.tags, tag],
      });
    }
  };

  const removeTag = (tag: string) => {
    setContactForm({
      ...contactForm,
      tags: contactForm.tags.filter(t => t !== tag),
    });
  };

  const toggleGroupInForm = (groupId: string) => {
    const newGroups = contactForm.groupIds.includes(groupId)
      ? contactForm.groupIds.filter(id => id !== groupId)
      : [...contactForm.groupIds, groupId];
    setContactForm({ ...contactForm, groupIds: newGroups });
  };

  const filteredContacts = contacts.filter(contact => {
    // Search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !contact.name.toLowerCase().includes(query) &&
        !contact.address.toLowerCase().includes(query) &&
        !(contact.email || '').toLowerCase().includes(query) &&
        !(contact.tags || []).some(tag => tag.toLowerCase().includes(query))
      ) {
        return false;
      }
    }

    // Group filter
    if (selectedGroup !== 'all') {
      if (selectedGroup === 'favorites') {
        if (!contact.isFavorite) return false;
      } else if (selectedGroup === 'untagged') {
        if (contact.tags && contact.tags.length > 0) return false;
      } else {
        if (!(contact.groupIds || []).includes(selectedGroup)) return false;
      }
    }

    // Tag filter
    if (selectedTags.length > 0) {
      if (!selectedTags.some(tag => (contact.tags || []).includes(tag))) {
        return false;
      }
    }

    return true;
  });

  const allTags = Array.from(
    new Set(contacts.flatMap(c => c.tags || []))
  );

  const getContactTransactionStats = async (address: string) => {
    try {
      return await contactManager.getContactTransactionStats(address);
    } catch {
      return { totalSent: 0, totalReceived: 0, transactionCount: 0 };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Contacts</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            variant="secondary"
          >
            {viewMode === 'grid' ? '📋 List' : '🔲 Grid'}
          </Button>
          <Button onClick={() => setShowImportModal(true)} variant="secondary">
            📥 Import
          </Button>
          <Button onClick={handleExportCSV} variant="secondary">
            📤 Export
          </Button>
          <Button onClick={() => setShowCreateGroupModal(true)} variant="secondary">
            📁 New Group
          </Button>
          <Button onClick={() => setShowCreateContactModal(true)}>
            ➕ Add Contact
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardBody>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
            />

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedGroup('all')}
                className={`px-4 py-2 rounded-lg ${
                  selectedGroup === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                All ({contacts.length})
              </button>
              <button
                onClick={() => setSelectedGroup('favorites')}
                className={`px-4 py-2 rounded-lg ${
                  selectedGroup === 'favorites'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                ⭐ Favorites ({contacts.filter(c => c.isFavorite).length})
              </button>
              {groups.map(group => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`px-4 py-2 rounded-lg ${
                    selectedGroup === group.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                  style={{
                    backgroundColor: selectedGroup === group.id ? group.color : undefined,
                  }}
                >
                  {group.name} ({contacts.filter(c => (c.groupIds || []).includes(group.id)).length})
                </button>
              ))}
            </div>

            {allTags.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Filter by tags:</div>
                <div className="flex gap-2 flex-wrap">
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => {
                        setSelectedTags(prev =>
                          prev.includes(tag)
                            ? prev.filter(t => t !== tag)
                            : [...prev, tag]
                        );
                      }}
                      className={`px-3 py-1 rounded-full text-sm ${
                        selectedTags.includes(tag)
                          ? 'bg-purple-500 text-white'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Contacts List */}
      {filteredContacts.length === 0 ? (
        <Card>
          <CardBody>
            <div className="text-center py-12">
              <div className="text-6xl mb-4">👥</div>
              <h2 className="text-xl font-semibold mb-2">
                {searchQuery || selectedTags.length > 0
                  ? 'No contacts found'
                  : 'No contacts yet'}
              </h2>
              <p className="text-gray-600 mb-4">
                {searchQuery || selectedTags.length > 0
                  ? 'Try adjusting your search or filters'
                  : 'Add your first contact to get started'}
              </p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}>
          {filteredContacts.map(contact => {
            // Stats require async call - simplified for now
            const stats = { totalSent: 0, totalReceived: 0, transactionCount: 0 };
            return (
              <Card key={contact.id}>
                <CardBody>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold">{contact.name}</h3>
                        {contact.isFavorite && <span className="text-yellow-500">⭐</span>}
                      </div>
                      <p className="text-sm text-gray-600 break-all mb-2">
                        {contact.address.slice(0, 20)}...{contact.address.slice(-10)}
                      </p>
                      {contact.email && (
                        <p className="text-sm text-gray-600">📧 {contact.email}</p>
                      )}
                      {contact.phone && (
                        <p className="text-sm text-gray-600">📱 {contact.phone}</p>
                      )}
                      {contact.notes && (
                        <p className="text-sm text-gray-600 mt-2">💬 {contact.notes}</p>
                      )}
                      {contact.tags && contact.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-2">
                          {contact.tags.map(tag => (
                            <span
                              key={tag}
                              className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t text-sm text-gray-600 space-y-1">
                        <div>Sent: {stats.totalSent.toFixed(4)} KC</div>
                        <div>Received: {stats.totalReceived.toFixed(4)} KC</div>
                        <div>Transactions: {stats.transactionCount}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleFavorite(contact.id)}
                        className="text-gray-400 hover:text-yellow-500"
                        title={contact.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {contact.isFavorite ? '⭐' : '☆'}
                      </button>
                      <button
                        onClick={() => handleEditContact(contact)}
                        className="text-blue-500 hover:text-blue-700"
                        title="Edit contact"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteContact(contact.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Delete contact"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Contact Modal */}
      {showCreateContactModal && (
        <Modal
          isOpen={showCreateContactModal}
          onCloseAction={() => {
            setShowCreateContactModal(false);
            resetContactForm();
          }}
          title={selectedContact ? 'Edit Contact' : 'Add Contact'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address *
              </label>
              <input
                type="text"
                value={contactForm.address}
                onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="KC..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="+1234567890"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={contactForm.notes}
                onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                placeholder="Additional notes..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  id="tag-input"
                  className="flex-1 px-3 py-2 border rounded-lg"
                  placeholder="Add tag..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addTag((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    const input = document.getElementById('tag-input') as HTMLInputElement;
                    addTag(input.value);
                    input.value = '';
                  }}
                  variant="secondary"
                >
                  Add
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {contactForm.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-800 flex items-center gap-1"
                  >
                    #{tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-purple-600 hover:text-purple-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {groups.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Groups
                </label>
                <div className="flex gap-2 flex-wrap">
                  {groups.map(group => (
                    <button
                      key={group.id}
                      onClick={() => toggleGroupInForm(group.id)}
                      className={`px-3 py-1 rounded-lg ${
                        contactForm.groupIds.includes(group.id)
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                      style={{
                        backgroundColor: contactForm.groupIds.includes(group.id)
                          ? group.color
                          : undefined,
                      }}
                    >
                      {group.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center">
              <input
                type="checkbox"
                checked={contactForm.isFavorite}
                onChange={(e) => setContactForm({ ...contactForm, isFavorite: e.target.checked })}
                className="mr-2"
              />
              <label className="text-sm font-medium text-gray-700">
                ⭐ Add to favorites
              </label>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                onClick={() => {
                  setShowCreateContactModal(false);
                  resetContactForm();
                }}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button onClick={handleCreateContact}>
                {selectedContact ? 'Update' : 'Add'} Contact
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <Modal
          isOpen={showCreateGroupModal}
          onCloseAction={() => {
            setShowCreateGroupModal(false);
            resetGroupForm();
          }}
          title="Create Group"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Family, Friends, Business..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={groupForm.description}
                onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                rows={2}
                placeholder="Group description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color
              </label>
              <input
                type="color"
                value={groupForm.color}
                onChange={(e) => setGroupForm({ ...groupForm, color: e.target.value })}
                className="w-full h-10 border rounded-lg"
              />
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                onClick={() => {
                  setShowCreateGroupModal(false);
                  resetGroupForm();
                }}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button onClick={handleCreateGroup}>Create Group</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <Modal
          isOpen={showImportModal}
          onCloseAction={() => setShowImportModal(false)}
          title="Import Contacts"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select CSV file
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                className="w-full"
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800">
                CSV format: name,address,email,phone,notes,tags
              </p>
              <p className="text-sm text-blue-800 mt-1">
                Tags should be comma-separated within quotes
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button onClick={() => setShowImportModal(false)} variant="secondary">
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
