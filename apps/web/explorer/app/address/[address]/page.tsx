import AddressDetailClient from './AddressDetailClient';

type AddressDetailPageProps = Readonly<{
  params: Promise<{ address: string }>;
}>;

export default async function AddressDetailPage({ params }: AddressDetailPageProps) {
  const { address } = await params;
  return <AddressDetailClient address={address} />;
}
