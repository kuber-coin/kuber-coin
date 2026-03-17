'use client';

import { NFT } from '@/services/nftService';
import { Card } from '@/components/Card';

interface NFTGalleryProps {
  nfts: NFT[];
  viewMode: 'grid' | 'list';
  onSelectNFTAction: (nft: NFT) => void;
}

export function NFTGallery({ nfts, viewMode, onSelectNFTAction }: NFTGalleryProps) {
  if (nfts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🖼️</div>
        <h3 className="text-xl font-semibold mb-2">No NFTs Found</h3>
        <p className="text-gray-600">Your NFT collection will appear here</p>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-4">
        {nfts.map((nft) => (
          <Card
            key={nft.id}
            className="p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => onSelectNFTAction(nft)}
          >
            <div className="flex items-center space-x-4">
              <img
                src={nft.image}
                alt={nft.name}
                className="w-24 h-24 rounded-lg object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%23999"%3ENFT%3C/text%3E%3C/svg%3E';
                }}
              />

              <div className="flex-1">
                <h3 className="font-semibold text-lg">{nft.name}</h3>
                <p className="text-sm text-gray-600 mb-2">{nft.collection}</p>

                <div className="flex items-center space-x-4 text-sm">
                  <div>
                    <span className="text-gray-600">Floor:</span>
                    <span className="font-semibold ml-1">{nft.floorPrice} KC</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Rarity:</span>
                    <span className="font-semibold ml-1">{nft.rarity}/100</span>
                  </div>
                  {nft.lastSale && (
                    <div>
                      <span className="text-gray-600">Last Sale:</span>
                      <span className="font-semibold ml-1">
                        {new Date(nft.lastSale).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm text-gray-600 mb-1">Token ID</div>
                <div className="font-mono text-sm">#{nft.tokenId}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // Grid view
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {nfts.map((nft) => (
        <Card
          key={nft.id}
          className="overflow-hidden cursor-pointer hover:shadow-xl transition-all transform hover:-translate-y-1"
          onClick={() => onSelectNFTAction(nft)}
        >
          <div className="aspect-square relative">
            <img
              src={nft.image}
              alt={nft.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300"%3E%3Crect fill="%23ddd" width="300" height="300"/%3E%3Ctext x="150" y="150" text-anchor="middle" dy=".3em" fill="%23999" font-size="24"%3ENFT%3C/text%3E%3C/svg%3E';
              }}
            />

            <div className="absolute top-2 right-2">
              <span className="px-2 py-1 bg-purple-600 text-white rounded text-xs font-medium">
                {nft.rarity}/100
              </span>
            </div>
          </div>

          <div className="p-4">
            <h3 className="font-semibold text-lg mb-1 truncate">{nft.name}</h3>
            <p className="text-sm text-gray-600 mb-3">{nft.collection}</p>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-600">Floor Price</div>
                <div className="font-semibold">{nft.floorPrice} KC</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-600">Token ID</div>
                <div className="font-mono text-sm">#{nft.tokenId}</div>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
