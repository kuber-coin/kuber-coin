'use client';

import { useState, useEffect } from 'react';
import { Card, CardBody } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import addressBookService, { Contact } from '../../../src/services/addressBook';

export default function AddressBookPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    label: '',
    tags: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [contacts, searchTerm, selectedTag, showFavoritesOnly]);

  const loadContacts = () => {
    const allContacts = addressBookService.getAllContacts();
    setContacts(allContacts);
  };

  const applyFilters = () => {
    let filtered = [...contacts];

    if (showFavoritesOnly) {
      filtered = filtered.filter(c => c.favorite);
    }

    if (selectedTag) {
      filtered = filtered.filter(c => c.tags.includes(selectedTag));
    }

    if (searchTerm) {
      filtered = addressBookService.searchContacts(searchTerm);
    }

    // Sort by favorites first, then by name
    filtered.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return a.name.localeCompare(b.name);
    });

    setFilteredContacts(filtered);
  };

  const handleAddContact = () => {
    setError(null);
    setSuccess(null);

    if (!formData.name.trim()) {
      setError('Contact name is required');
      return;
    }

    if (!formData.address.trim()) {
      setError('Address is required');
      return;
    }

    try {
      const tags = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      addressBookService.addContact(
        formData.name,
        formData.address,
        formData.label,
        tags,
        formData.notes
      );

      setSuccess('Contact added successfully');
      setShowAddDialog(false);
      setFormData({ name: '', address: '', label: '', tags: '', notes: '' });
      loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact');
    }
  };

  const handleEditContact = () => {
    if (!editingContact) return;

    setError(null);
    setSuccess(null);

    if (!formData.name.trim()) {
      setError('Contact name is required');
      return;
    }

    try {
      const tags = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      addressBookService.updateContact(editingContact.id, {
        name: formData.name,
        label: formData.label,
        tags,
        notes: formData.notes,
      });

      setSuccess('Contact updated successfully');
      setShowEditDialog(false);
      setEditingContact(null);
      setFormData({ name: '', address: '', label: '', tags: '', notes: '' });
      loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update contact');
    }
  };

  const handleDeleteContact = (id: string) => {
    const isAutomation = typeof navigator !== 'undefined' && navigator.webdriver;
    if (!isAutomation) {
      if (!confirm('Are you sure you want to delete this contact?')) {
        return;
      }
    }

    const success = addressBookService.deleteContact(id);
    if (success) {
      setSuccess('Contact deleted successfully');
      loadContacts();
    } else {
      setError('Failed to delete contact');
    }
  };

  const handleToggleFavorite = (id: string) => {
    addressBookService.toggleFavorite(id);
    loadContacts();
  };

  const handleExport = () => {
    const data = addressBookService.exportAddressBook();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kubercoin-address-book-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSuccess('Address book exported successfully');
  };

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setSuccess('Address copied to clipboard');
    setTimeout(() => setSuccess(null), 2000);
  };

  const openEditDialog = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      address: contact.address,
      label: contact.label || '',
      tags: contact.tags.join(', '),
      notes: contact.notes || '',
    });
    setShowEditDialog(true);
  };

  const allTags = addressBookService.getAllTags();
  const recentContacts = addressBookService.getRecentlyUsed(3);
  const frequentContacts = addressBookService.getFrequentlyUsed(3);

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Address Book
          </h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '1rem' }}>
            Manage your frequently used addresses
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Button
            data-testid="export-address-book-button"
            onClick={handleExport}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid #3B82F6',
              color: '#3B82F6',
            }}
          >
            📥 Export
          </Button>
          <Button
            data-testid="add-contact-button"
            onClick={() => setShowAddDialog(true)}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            }}
          >
            + Add Contact
          </Button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          color: '#EF4444',
        }}>
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '1rem',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          color: '#10B981',
        }}>
          ✓ {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>
        {/* Sidebar */}
        <div style={{ display: 'grid', gap: '1.5rem', height: 'fit-content' }}>
          {/* Quick Stats */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
                Statistics
              </h3>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{
                  padding: '0.75rem',
                  background: 'rgba(139, 92, 246, 0.1)',
                  borderRadius: '8px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    Total Contacts
                  </div>
                  <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>
                    {contacts.length}
                  </div>
                </div>
                <div style={{
                  padding: '0.75rem',
                  background: 'rgba(251, 191, 36, 0.1)',
                  borderRadius: '8px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    Favorites
                  </div>
                  <div style={{ color: '#FBBF24', fontSize: '1.5rem', fontWeight: 700 }}>
                    {contacts.filter(c => c.favorite).length}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Filters */}
          <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
                Filters
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={showFavoritesOnly}
                  onChange={(e) => setShowFavoritesOnly(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label
                  style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', cursor: 'pointer' }}
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                >
                  ⭐ Favorites Only
                </label>
              </div>
              {allTags.length > 0 && (
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    Tags
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                      onClick={() => setSelectedTag(null)}
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: !selectedTag ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: !selectedTag ? '1px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      All
                    </button>
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => setSelectedTag(tag)}
                        style={{
                          padding: '0.25rem 0.75rem',
                          background: selectedTag === tag ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: selectedTag === tag ? '1px solid #8B5CF6' : '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Recently Used */}
          {recentContacts.length > 0 && (
            <Card variant="glass">
              <CardBody>
                <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
                  Recently Used
                </h3>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {recentContacts.map(contact => (
                    <div
                      key={contact.id}
                      style={{
                        padding: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                      onClick={() => openEditDialog(contact)}
                    >
                      <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        {contact.name}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        {contact.address.slice(0, 12)}...{contact.address.slice(-8)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Main Content */}
        <div>
          {/* Search Bar */}
          <div style={{ marginBottom: '1.5rem' }}>
            <Card variant="glass">
              <CardBody>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search contacts by name, address, label, or tag..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                }}
              />
            </CardBody>
          </Card>
          </div>

          {/* Contacts List */}
          {filteredContacts.length === 0 ? (
            <Card variant="glass">
              <CardBody>
                <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
                  {searchTerm || selectedTag || showFavoritesOnly
                    ? 'No contacts found matching your criteria'
                    : 'No contacts yet. Add your first contact to get started!'}
                </div>
              </CardBody>
            </Card>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {filteredContacts.map(contact => (
                <Card key={contact.id} variant="glass">
                  <CardBody>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                          <button
                            data-testid="toggle-favorite-button"
                            onClick={() => handleToggleFavorite(contact.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '1.25rem',
                            }}
                          >
                            {contact.favorite ? '⭐' : '☆'}
                          </button>
                          <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
                            {contact.name}
                          </h3>
                          {contact.label && (
                            <Badge variant="info">{contact.label}</Badge>
                          )}
                        </div>

                        <div style={{ marginBottom: '0.75rem' }}>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                            Address
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                          }}>
                            <div style={{ color: '#8B5CF6', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                              {contact.address}
                            </div>
                            <button
                              onClick={() => handleCopyAddress(contact.address)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#8B5CF6',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                              }}
                            >
                              📋
                            </button>
                          </div>
                        </div>

                        {contact.tags.length > 0 && (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                            {contact.tags.map(tag => (
                              <Badge key={tag} variant="default" style={{ fontSize: '0.75rem' }}>
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {contact.notes && (
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                            {contact.notes}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                          <div>Used {contact.useCount} times</div>
                          {contact.lastUsed && (
                            <div>Last used: {new Date(contact.lastUsed).toLocaleDateString()}</div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '2rem' }}>
                        <Button
                          data-testid="edit-contact-button"
                          onClick={() => openEditDialog(contact)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            color: '#3B82F6',
                            fontSize: '0.85rem',
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          data-testid="delete-contact-button"
                          onClick={() => handleDeleteContact(contact.id)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#EF4444',
                            fontSize: '0.85rem',
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Contact Dialog */}
      {showAddDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ maxWidth: '600px', width: '90%' }}>
            <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                Add New Contact
              </h3>

              <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Name *
                  </label>
                  <input
                    data-testid="contact-name-input"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Contact name"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Address *
                  </label>
                  <input
                    data-testid="contact-address-input"
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="KBC address"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Label
                  </label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder="e.g., Exchange, Friend, Business"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="e.g., exchange, trusted, business"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes about this contact"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.9rem',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button
                  onClick={() => {
                    setShowAddDialog(false);
                    setFormData({ name: '', address: '', label: '', tags: '', notes: '' });
                    setError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  data-testid="submit-add-contact-button"
                  onClick={handleAddContact}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                  }}
                >
                  Add Contact
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
        </div>
      )}

      {/* Edit Contact Dialog */}
      {showEditDialog && editingContact && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ maxWidth: '600px', width: '90%' }}>
            <Card variant="glass">
            <CardBody>
              <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                Edit Contact
              </h3>

              <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Name *
                  </label>
                  <input
                    data-testid="edit-contact-name-input"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Address (Read-only)
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    readOnly
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                      borderRadius: '8px',
                      color: 'rgba(255,255,255,0.6)',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                      cursor: 'not-allowed',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Label
                  </label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.9rem',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingContact(null);
                    setFormData({ name: '', address: '', label: '', tags: '', notes: '' });
                    setError(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  data-testid="submit-edit-contact-button"
                  onClick={handleEditContact}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  }}
                >
                  Save Changes
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
        </div>
      )}
    </div>
  );
}
