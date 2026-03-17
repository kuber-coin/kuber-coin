'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import nftService, { NFT, NFTCollection } from '@/services/nftService';
import { NFTGallery } from '@/components/NFTGallery';
import { NFTDetails } from '@/components/NFTDetails';

export default function NFTPage() {
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [collections, setCollections] = useState<NFTCollection[]>([]);
  const [filteredNFTs, setFilteredNFTs] = useState<NFT[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCollection, setSelectedCollection] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'rarity' | 'price' | 'recent'>('recent');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [nfts, selectedCollection, sortBy]);

  const loadData = () => {
    const allNFTs = nftService.getAllNFTs();
    const allCollections = nftService.getCollections();
    setNfts(allNFTs);
    setCollections(allCollections);
  };

  const applyFiltersAndSort = () => {
    let filtered = selectedCollection === 'all' 
      ? nfts 
      : nftService.filterNFTs(selectedCollection);

    filtered = nftService.sortNFTs(filtered, sortBy);
    setFilteredNFTs(filtered);
  };

  const handleSendNFT = async (nftId: string) => {
    const toAddress = prompt('Enter recipient address:');
    if (!toAddress) return;

    try {
      const txHash = await nftService.sendNFT(nftId, toAddress);
      alert(`NFT sent successfully!\nTransaction: ${txHash}`);
      setSelectedNFT(null);
      loadData();
    } catch (error: any) {
      alert(`Error sending NFT: ${error.message}`);
    }
  };

  const handleListForSale = async (nftId: string) => {
    const priceStr = prompt('Enter sale price (in KC):');
    if (!priceStr) return;

    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
      alert('Invalid price');
      return;
    }

    try {
      await nftService.listForSale(nftId, price);
      alert('NFT listed for sale successfully!');
      setSelectedNFT(null);
    } catch (error: any) {
      alert(`Error listing NFT: ${error.message}`);
    }
  };

  const totalValue = nfts.reduce((sum, nft) => sum + nft.floorPrice, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">NFT Gallery</h1>
          <p className="text-gray-600 mt-1">Your digital collectibles</p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant={viewMode === 'grid' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('grid')}
          >
            ⊞ Grid
          </Button>
          <Button
            variant={viewMode === 'list' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('list')}
          >
            ☰ List
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Total NFTs</div>
          <div className="text-3xl font-bold">{nfts.length}</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Collections</div>
          <div className="text-3xl font-bold text-purple-600">{collections.length}</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Total Value</div>
          <div className="text-3xl font-bold text-green-600">{totalValue.toFixed(2)} KC</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Avg. Rarity</div>
          <div className="text-3xl font-bold text-orange-600">
            {nfts.length > 0 ? Math.round(nfts.reduce((sum, nft) => sum + nft.rarity, 0) / nfts.length) : 0}
          </div>
        </Card>
      </div>

      {/* Collections */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Collections</h2>
        <div className="grid grid-cols-2 gap-4">
          {collections.map((collection) => (
            <Card key={collection.id} className="p-4 bg-gray-50">
              <h3 className="font-semibold text-lg mb-2">{collection.name}</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Owned:</span>
                  <span className="font-semibold ml-1">{collection.ownedCount}</span>
                </div>
                <div>
                  <span className="text-gray-600">Floor:</span>
                  <span className="font-semibold ml-1">{collection.floorPrice} KC</span>
                </div>
                <div>
                  <span className="text-gray-600">Supply:</span>
                  <span className="font-semibold ml-1">{collection.totalSupply.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-600">24h Vol:</span>
                  <span className="font-semibold ml-1">{collection.volume24h} KC</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Card>

      {/* Filters and Sorting */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div>
              <label className="text-sm text-gray-600 mr-2">Collection:</label>
              <select
                value={selectedCollection}
                onChange={(e) => setSelectedCollection(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Collections</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.name}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-600 mr-2">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="recent">Recently Acquired</option>
                <option value="name">Name</option>
                <option value="rarity">Rarity</option>
                <option value="price">Price</option>
              </select>
            </div>
          </div>

          <div className="text-sm text-gray-600">
            Showing {filteredNFTs.length} of {nfts.length} NFTs
          </div>
        </div>
      </Card>

      {/* NFT Gallery */}
      <NFTGallery
        nfts={filteredNFTs}
        viewMode={viewMode}
        onSelectNFTAction={setSelectedNFT}
      />

      {/* NFT Details Modal */}
      {selectedNFT && (
        <NFTDetails
          nft={selectedNFT}
          onCloseAction={() => setSelectedNFT(null)}
          onSendAction={handleSendNFT}
          onListAction={handleListForSale}
        />
      )}
    </div>
  );
}
