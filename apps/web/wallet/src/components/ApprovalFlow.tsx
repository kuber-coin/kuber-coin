'use client';

import { useState } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { PendingTransaction } from '@/services/multisigWallet';

interface ApprovalFlowProps {
  transactions: PendingTransaction[];
  walletRequiredSignatures: number;
  currentUserId: string;
  onSignAction: (txId: string) => void;
  onRejectAction: (txId: string, reason?: string) => void;
}

export function ApprovalFlow({
  transactions,
  walletRequiredSignatures,
  currentUserId,
  onSignAction,
  onRejectAction,
}: ApprovalFlowProps) {
  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  if (transactions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h3 className="text-xl font-semibold mb-2">No Pending Approvals</h3>
        <p className="text-gray-600">All transactions have been processed</p>
      </Card>
    );
  }

  const handleSignClick = (txId: string) => {
    onSignAction(txId);
  };

  const handleRejectClick = (txId: string) => {
    setSelectedTx(txId);
    setShowRejectModal(true);
  };

  const confirmReject = () => {
    if (selectedTx) {
      onRejectAction(selectedTx, rejectReason || undefined);
      setShowRejectModal(false);
      setSelectedTx(null);
      setRejectReason('');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold">Pending Approvals</h3>
        <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
          {transactions.length} pending
        </span>
      </div>

      {transactions.map((tx) => {
        const progress = (tx.signatures.length / walletRequiredSignatures) * 100;
        const hasUserSigned = tx.signatures.some(s => s.signerId === currentUserId);
        const isTimeLocked = tx.executionDate && tx.executionDate > Date.now();
        const timeUntilExecution = isTimeLocked
          ? Math.ceil((tx.executionDate! - Date.now()) / (60 * 60 * 1000))
          : 0;

        return (
          <Card key={tx.id} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h4 className="text-lg font-semibold">{tx.description}</h4>
                  {isTimeLocked && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                      ⏰ Time-locked
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">To:</span>
                    <span className="font-mono">{tx.to.substring(0, 16)}...{tx.to.substring(tx.to.length - 8)}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Amount:</span>
                    <span className="text-lg font-bold text-gray-900">{tx.amount.toLocaleString()} KC</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Fee:</span>
                    <span>{tx.fee} KC</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Created:</span>
                    <span>{formatTimeAgo(tx.createdDate)}</span>
                  </div>
                  {isTimeLocked && (
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">Executes in:</span>
                      <span className="text-purple-700 font-medium">{timeUntilExecution}h</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Approval Progress */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Approval Progress: {tx.signatures.length} of {walletRequiredSignatures}
                </span>
                <span className="text-sm font-bold text-blue-600">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    progress >= 100 ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>

            {/* Signatures List */}
            {tx.signatures.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-gray-700 mb-2">Signatures Received:</h5>
                <div className="space-y-2">
                  {tx.signatures.map((sig, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      <span className="text-green-600">✓</span>
                      <span className="font-medium">{sig.signerName}</span>
                      <span className="text-gray-500">•</span>
                      <span className="text-gray-500">{formatTimeAgo(sig.signedDate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rejections List */}
            {tx.rejections.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <h5 className="text-sm font-medium text-red-900 mb-2">Rejections:</h5>
                <div className="space-y-2">
                  {tx.rejections.map((rejection, index) => (
                    <div key={index} className="text-sm text-red-800">
                      <div className="flex items-center space-x-2">
                        <span className="text-red-600">✕</span>
                        <span className="font-medium">{rejection.signerName}</span>
                        <span className="text-red-500">•</span>
                        <span className="text-red-500">{formatTimeAgo(rejection.rejectedDate)}</span>
                      </div>
                      {rejection.reason && (
                        <div className="ml-6 text-red-700 italic">"{rejection.reason}"</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-3">
              {hasUserSigned ? (
                <div className="flex items-center space-x-2 text-green-600">
                  <span className="text-xl">✓</span>
                  <span className="font-medium">You have signed this transaction</span>
                </div>
              ) : (
                <>
                  <Button
                    variant="primary"
                    onClick={() => handleSignClick(tx.id)}
                    className="flex-1"
                  >
                    ✍️ Sign Transaction
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleRejectClick(tx.id)}
                    className="flex-1 bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    ✕ Reject
                  </Button>
                </>
              )}
            </div>

            {/* Execution Notice */}
            {tx.signatures.length >= walletRequiredSignatures && !isTimeLocked && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  ✅ <strong>Ready for execution:</strong> This transaction has enough signatures and will be executed shortly.
                </p>
              </div>
            )}

            {tx.signatures.length >= walletRequiredSignatures && isTimeLocked && (
              <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm text-purple-800">
                  ⏰ <strong>Time-locked:</strong> This transaction will execute in {timeUntilExecution} hours after the lock period.
                </p>
              </div>
            )}
          </Card>
        );
      })}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4">Reject Transaction</h3>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (optional)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why you're rejecting this transaction..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none"
                  rows={4}
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>⚠️ Warning:</strong> Rejecting this transaction will cancel it permanently. This action cannot be undone.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectReason('');
                    setSelectedTx(null);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={confirmReject}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  Confirm Rejection
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
