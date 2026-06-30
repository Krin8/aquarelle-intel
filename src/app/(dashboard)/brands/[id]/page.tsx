import { notFound } from 'next/navigation';
import { getBrand } from '@/actions/brand-actions';
import { getPitchTemplates } from '@/actions/pitch-actions';
import { BrandProfileClient } from '@/components/BrandProfileClient';

export default async function BrandProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const brand = await getBrand(id);

  if (!brand) {
    notFound();
  }

  const templates = await getPitchTemplates();

  return <BrandProfileClient brand={brand} pitchTemplates={templates} />;
}
