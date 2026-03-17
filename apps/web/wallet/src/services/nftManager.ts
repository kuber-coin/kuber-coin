// NFT Manager Service
// View and manage NFT collections

export interface NFT {
  id: string;
  tokenId: string;
  name: string;
  description: string;
  collection: string;
  image: string;
  owner: string;
  creator: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  attributes: { trait_type: string; value: string }[];
  mintedAt: number;
  lastSale?: { price: number; date: number };
}

export interface MintNFTInput {
  name: string;
  description: string;
  collection: string;
  image: string;
  owner: string;
  creator: string;
  rarity: NFT['rarity'];
  mintPriceKC: number;
  attributes?: { trait_type: string; value: string }[];
}

class NFTManagerService {
  private nfts: Map<string, NFT> = new Map();
  private readonly STORAGE_KEY = 'kubercoin_nfts';
  private hasLoaded = false;

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  constructor() {
    this.loadNFTs();
  }

  private loadNFTs() {
    if (!this.isBrowser() || this.hasLoaded) return;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const nfts = JSON.parse(stored);
        nfts.forEach((n: NFT) => this.nfts.set(n.id, n));
      }
    } catch {
      // Ignore storage/parse errors
    } finally {
      this.hasLoaded = true;
    }
  }

  private saveNFTs() {
    if (!this.isBrowser()) return;
    try {
      const nfts = Array.from(this.nfts.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nfts));
    } catch {
      // Ignore storage write errors
    }
  }


  getNFTs(filter?: { collection?: string; rarity?: string; owner?: string }): NFT[] {
    this.loadNFTs();
    let nfts = Array.from(this.nfts.values());

    if (filter?.collection) {
      nfts = nfts.filter((n) => n.collection === filter.collection);
    }
    if (filter?.rarity) {
      nfts = nfts.filter((n) => n.rarity === filter.rarity);
    }
    if (filter?.owner) {
      nfts = nfts.filter((n) => n.owner === filter.owner);
    }

    return nfts.sort((a, b) => b.mintedAt - a.mintedAt);
  }

  getNFT(id: string): NFT | undefined {
    this.loadNFTs();
    return this.nfts.get(id);
  }

  getCollections(): string[] {
    this.loadNFTs();
    const collections = new Set(Array.from(this.nfts.values()).map((n) => n.collection));
    return Array.from(collections).sort();
  }

  mintNFT(input: MintNFTInput): NFT {
    this.loadNFTs();

    const name = input.name.trim();
    const collection = input.collection.trim();
    const owner = input.owner.trim();
    const creator = input.creator.trim() || owner;
    const description = input.description.trim();

    if (!name) throw new Error('NFT name is required');
    if (!collection) throw new Error('Collection is required');
    if (!owner) throw new Error('Owner address is required');
    if (!Number.isFinite(input.mintPriceKC) || input.mintPriceKC <= 0) {
      throw new Error('Mint price must be greater than zero');
    }

    const now = Date.now();
    const nft: NFT = {
      id: `nft_${now}_${Math.random().toString(36).slice(2, 10)}`,
      tokenId: `KC-${now.toString(36).toUpperCase()}`,
      name,
      description,
      collection,
      image: input.image.trim() || '🖼️',
      owner,
      creator,
      rarity: input.rarity,
      attributes: input.attributes && input.attributes.length > 0
        ? input.attributes
        : [
            { trait_type: 'Mint Price', value: `${input.mintPriceKC} KC` },
            { trait_type: 'Network', value: 'KuberCoin' },
          ],
      mintedAt: now,
      lastSale: { price: input.mintPriceKC, date: now },
    };

    this.nfts.set(nft.id, nft);
    this.saveNFTs();
    return nft;
  }

  transferNFT(nftId: string, toAddress: string): void {
    this.loadNFTs();
    const nft = this.nfts.get(nftId);
    if (!nft) throw new Error('NFT not found');
    if (!toAddress.trim()) throw new Error('Recipient address is required');

    nft.owner = toAddress;
    this.saveNFTs();
  }

  getCollectionStats(collection: string): {
    totalNFTs: number;
    floorPrice: number;
    totalVolume: number;
    owners: number;
  } {
    this.loadNFTs();
    const collectionNFTs = this.getNFTs({ collection });
    
    const prices = collectionNFTs
      .filter((n) => n.lastSale)
      .map((n) => n.lastSale!.price);

    return {
      totalNFTs: collectionNFTs.length,
      floorPrice: prices.length > 0 ? Math.min(...prices) : 0,
      totalVolume: prices.reduce((sum, p) => sum + p, 0),
      owners: new Set(collectionNFTs.map((n) => n.owner)).size,
    };
  }
}

const nftManager = new NFTManagerService();
export default nftManager;
