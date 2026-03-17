// nftMetadata.ts - IPFS and NFT metadata handling

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string }[];
  external_url?: string;
  animation_url?: string;
}

class NFTMetadataService {
  async fetchFromIPFS(ipfsHash: string): Promise<NFTMetadata> {
    const gateway = this.getGatewayBase();
    const response = await fetch(`${gateway}${ipfsHash}`);
    if (!response.ok) {
      throw new Error('Failed to fetch IPFS metadata');
    }
    return response.json();
  }

  resolveIPFSUrl(ipfsUrl: string): string {
    // Convert ipfs:// to https gateway
    if (ipfsUrl.startsWith('ipfs://')) {
      const hash = ipfsUrl.replace('ipfs://', '');
      return `https://ipfs.io/ipfs/${hash}`;
    }
    return ipfsUrl;
  }

  async getImageData(imageUrl: string): Promise<string> {
    return imageUrl;
  }

  async validateMetadata(metadata: any): Promise<boolean> {
    // Basic validation
    if (!metadata.name || !metadata.image) {
      return false;
    }
    return true;
  }

  parseAttributes(attributes: any[]): { trait_type: string; value: string }[] {
    if (!Array.isArray(attributes)) {
      return [];
    }

    return attributes.map(attr => ({
      trait_type: attr.trait_type || 'Unknown',
      value: String(attr.value || ''),
    }));
  }

  async uploadToIPFS(data: any): Promise<string> {
    throw new Error('IPFS upload requires a configured gateway endpoint.');
  }

  private getGatewayBase(): string {
    const base = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs/';
    return base.endsWith('/') ? base : `${base}/`;
  }

  getMediaType(url: string): 'image' | 'video' | 'audio' | 'unknown' {
    const extension = url.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(extension || '')) {
      return 'image';
    }
    if (['mp4', 'webm', 'mov'].includes(extension || '')) {
      return 'video';
    }
    if (['mp3', 'wav', 'ogg'].includes(extension || '')) {
      return 'audio';
    }
    return 'unknown';
  }
}

const nftMetadataService = new NFTMetadataService();
export default nftMetadataService;