'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import EmojiPicker from './EmojiPicker';
import transactionSearch from '@/services/transactionSearch';

interface TransactionNoteProps {
  txId: string;
  onUpdate?: () => void;
}

export default function TransactionNote({ txId, onUpdate }: TransactionNoteProps) {
  const [showModal, setShowModal] = useState(false);
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState<string>('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);

  React.useEffect(() => {
    loadMetadata();
  }, [txId]);

  const loadMetadata = () => {
    const metadata = transactionSearch.getMetadata(txId);
    if (metadata) {
      setNote(metadata.note || '');
      setTags(metadata.tags || []);
      setCategory(metadata.category || '');
      setAttachments(metadata.attachments || []);
    }
  };

  const handleSave = () => {
    if (note.trim()) {
      transactionSearch.setNote(txId, note);
    }

    if (tags.length > 0) {
      transactionSearch.setTags(txId, tags);
    }

    if (category) {
      transactionSearch.setCategory(txId, category as any);
    }

    // Save attachments
    attachments.forEach(url => {
      if (!transactionSearch.getMetadata(txId)?.attachments?.includes(url)) {
        transactionSearch.addAttachment(txId, url);
      }
    });

    setShowModal(false);
    if (onUpdate) onUpdate();
  };

  const handleAddTag = () => {
    const tag = prompt('Enter tag name:');
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleEmojiSelect = (emoji: string) => {
    setNote(note + emoji);
    setShowEmojiPicker(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments = Array.from(files).map(file => {
      return URL.createObjectURL(file);
    });

    setAttachments([...attachments, ...newAttachments]);
  };

  const handleRemoveAttachment = (url: string) => {
    setAttachments(attachments.filter(a => a !== url));
    transactionSearch.removeAttachment(txId, url);
  };

  const metadata = transactionSearch.getMetadata(txId);
  const hasNote = metadata?.note || metadata?.tags?.length || metadata?.category;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`px-3 py-1 rounded-lg text-sm ${
          hasNote
            ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        {hasNote ? '💬 Edit Note' : '💬 Add Note'}
      </button>

      <Modal
        isOpen={showModal}
        onCloseAction={() => setShowModal(false)}
        title="Transaction Note"
      >
        <div className="space-y-4">
          {/* Note Editor */}
          <div>
            <label className="block text-sm font-medium mb-2">Note</label>
            <div className="relative">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note for this transaction..."
                className="w-full px-3 py-2 border rounded-lg min-h-[100px] pr-12"
              />
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="absolute right-2 top-2 text-2xl hover:scale-110 transition-transform"
              >
                😊
              </button>
            </div>

            {showEmojiPicker && (
              <div className="mt-2">
                <EmojiPicker onSelect={handleEmojiSelect} />
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="">Select category</option>
              <option value="income">💰 Income</option>
              <option value="expense">💸 Expense</option>
              <option value="transfer">🔄 Transfer</option>
              <option value="trading">📈 Trading</option>
              <option value="other">📦 Other</option>
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-2">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm flex items-center gap-2"
                >
                  #{tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-yellow-900"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <Button onClick={handleAddTag} size="sm" variant="secondary">
              ➕ Add Tag
            </Button>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium mb-2">Attachments</label>
            <div className="space-y-2 mb-2">
              {attachments.map((url, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📎</span>
                    <span className="text-sm truncate">Attachment {index + 1}</span>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      View
                    </a>
                    <button
                      onClick={() => handleRemoveAttachment(url)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id={`file-upload-${txId}`}
                accept="image/*,.pdf"
              />
              <label htmlFor={`file-upload-${txId}`} style={{ cursor: 'pointer' }}>
                <span className="inline-block px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 hover:bg-gray-200 transition-colors">
                  📎 Upload Attachment
                </span>
              </label>
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Upload receipts, invoices, or other documents related to this transaction.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4">
            <Button onClick={() => setShowModal(false)} variant="secondary">
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
