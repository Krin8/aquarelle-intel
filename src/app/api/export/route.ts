import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandIds = searchParams.getAll('brandId');
  const type = searchParams.get('type') || 'contacts'; // contacts, brands

  try {
    let csvString = '';

    if (type === 'contacts') {
      const contacts = await prisma.contact.findMany({
        where: brandIds.length > 0 ? { brandId: { in: brandIds } } : undefined,
        include: { brand: true }
      });

      // CSV Header
      csvString = 'Brand Name,Brand Website,Contact Name,Role,Department,Seniority,Email,Phone,Buyer Type,Confidence,Source\n';

      // CSV Rows
      contacts.forEach(c => {
        const row = [
          c.brand.name,
          c.brand.website,
          c.name,
          c.role || '',
          c.department || '',
          c.seniority || '',
          c.email || '',
          c.phone || '',
          c.buyerType,
          c.confidenceScore.toString(),
          c.source
        ].map(val => `"${val.replace(/"/g, '""')}"`).join(',');

        csvString += row + '\n';
      });
    }

    return new NextResponse(csvString, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="aquarelle_export_${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    return new NextResponse('Error generating export', { status: 500 });
  }
}
