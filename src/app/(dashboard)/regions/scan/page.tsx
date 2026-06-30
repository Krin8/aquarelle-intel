import prisma from '@/lib/db';
import { RegionScanClient } from '@/components/RegionScanClient';

export default async function RegionScanPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; minScore?: string }>;
}) {
  const params = await searchParams;
  const region = params.region || '';

  // Fetch brands for the pre-selected region (if any)
  let brands: any[] = [];
  if (region) {
    brands = await prisma.brand.findMany({
      where: { region },
      orderBy: { pipelineScore: 'desc' },
      include: {
        _count: {
          select: {
            contacts: true,
            aiAnalyses: true,
          },
        },
      },
    });
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Region Discovery</h1>
          <p className="page-subtitle">
            Discover and analyze apparel brands by region
          </p>
        </div>
      </div>

      <RegionScanClient initialBrands={brands} />
    </div>
  );
}
