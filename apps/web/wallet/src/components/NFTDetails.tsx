'use client';

import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { NFT } from '@/services/nftService';
import { useState } from 'react';

interface NFTDetailsProps {
  nft: NFT;
  onCloseAction: () => void;
  onSendAction?: (nftId: string) => void;
  onListAction?: (nftId: string) => void;
}

export function NFTDetails({ nft, onCloseAction, onSendAction, onListAction }: NFTDetailsProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'attributes' | 'history'>('details');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">{nft.name}</h2>
            <button onClick={onCloseAction} className="text-gray-500 hover:text-gray-700 text-2xl">
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left: Image */}
            <div>
              <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 mb-4">
                <img
                  src={nft.image}
                  alt={nft.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23ddd" width="400" height="400"/%3E%3Ctext x="200" y="200" text-anchor="middle" dy=".3em" fill="%23999" font-size="32"%3ENFT%3C/text%3E%3C/svg%3E';
                  }}
                />
              </div>

              <div className="space-y-2">
                <Button
                  variant="primary"
                  onClick={() => onSendAction?.(nft.id)}
                  className="w-full"
                >
                  📤 Send NFT
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => onListAction?.(nft.id)}
                  className="w-full"
                >
                  💰 List for Sale
                </Button>
              </div>
            </div>

            {/* Right: Details */}
            <div>
              {/* Tabs */}
              <div className="flex space-x-4 border-b mb-4">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`pb-2 px-1 ${
                    activeTab === 'details'
                      ? 'border-b-2 border-blue-500 font-semibold text-blue-600'
                      : 'text-gray-600'
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setActiveTab('attributes')}
                  className={`pb-2 px-1 ${
                    activeTab === 'attributes'
                      ? 'border-b-2 border-blue-500 font-semibold text-blue-600'
                      : 'text-gray-600'
                  }`}
                >
                  Attributes
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`pb-2 px-1 ${
                    activeTab === 'history'
                      ? 'border-b-2 border-blue-500 font-semibold text-blue-600'
                      : 'text-gray-600'
                  }`}
                >
                  History
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'details' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Collection</h3>
                    <p className="text-gray-700">{nft.collection}</p>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-2">Description</h3>
                    <p className="text-gray-700">{nft.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-600 mb-1">Token ID</h4>
                      <p className="font-mono">#{nft.tokenId}</p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-600 mb-1">Rarity Score</h4>
                      <p className="font-semibold">{nft.rarity}/100</p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-600 mb-1">Floor Price</h4>
                      <p className="font-semibold">{nft.floorPrice} KC</p>
                    </div>

                    {nft.lastSale && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-600 mb-1">Last Sale</h4>
                        <p className="text-sm">{new Date(nft.lastSale).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-1">Contract Address</h4>
                    <p className="font-mono text-xs break-all">{nft.contractAddress}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-1">Owner</h4>
                    <p className="font-mono text-xs break-all">{nft.owner}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-1">Creator</h4>
                    <p className="font-mono text-xs break-all">{nft.creator}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-1">Metadata</h4>
                    <p className="font-mono text-xs break-all">{nft.metadata}</p>
                  </div>
                </div>
              )}

              {activeTab === 'attributes' && (
                <div className="space-y-3">
                  {nft.attributes.map((attr, index) => (
                    <Card key={index} className="p-4 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-600 uppercase mb-1">
                            {attr.trait_type}
                          </div>
                          <div className="font-semibold">{attr.value}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-600">Rarity</div>
                          <div className="text-sm font-medium text-purple-600">
                            {Math.floor(Math.random() * 30 + 10)}%
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-3">
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Minted</span>
                      <span className="text-sm text-gray-600">
                        {new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">By: {nft.creator.substring(0, 16)}...</div>
                  </Card>

                  {nft.lastSale && (
                    <Card className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Sale</span>
                        <span className="text-sm text-gray-600">
                          {new Date(nft.lastSale).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-sm">
                        <div className="text-gray-600">Price: <span className="font-semibold text-gray-900">{nft.floorPrice} KC</span></div>
                        <div className="text-gray-600 mt-1">From: {nft.creator.substring(0, 16)}...</div>
                        <div className="text-gray-600">To: {nft.owner.substring(0, 16)}...</div>
                      </div>
                    </Card>
                  )}

                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Transfer</span>
                      <span className="text-sm text-gray-600">
                        {new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">To current owner</div>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
