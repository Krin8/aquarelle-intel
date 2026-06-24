import prisma from '@/lib/db';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';

export default async function AnalyticsPage() {
  const [
    totalBrands,
    brandsByStatus,
    totalContacts,
    totalInsights,
    brandsBySegment
  ] = await Promise.all([
    prisma.brand.count(),
    prisma.brand.groupBy({
      by: ['status'],
      _count: { _all: true }
    }),
    prisma.contact.count(),
    prisma.aIAnalysis.count(),
    prisma.brand.groupBy({
      by: ['segment'],
      _count: { _all: true }
    })
  ]);

  const stats = {
    totalBrands,
    statusCounts: brandsByStatus.reduce((acc, curr) => ({
      ...acc,
      [curr.status]: curr._count._all
    }), {} as Record<string, number>),
    totalContacts,
    totalInsights,
    segmentCounts: brandsBySegment.reduce((acc, curr) => ({
      ...acc,
      [curr.segment || 'Unknown']: curr._count._all
    }), {} as Record<string, number>),
  };

  return <AnalyticsDashboard initialStats={stats} />;
}
