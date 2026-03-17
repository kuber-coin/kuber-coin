import BlockDetailClient from './BlockDetailClient';

type BlockPageProps = Readonly<{ params: Promise<{ hash: string }> }>;

export default async function BlockPage({ params }: BlockPageProps) {
  const { hash } = await params;
  return <BlockDetailClient hash={hash} />;
}
