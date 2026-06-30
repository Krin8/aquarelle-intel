import { NextResponse } from 'next/server';

// This global is set by region-actions.ts during a scan
declare global {
  // eslint-disable-next-line no-var
  var regionScanProgress: {
    region: string;
    phase: 'researching_fairs' | 'discovering' | 'processing' | 'done' | 'error';
    totalBrands: number;
    currentIndex: number;
    currentBrand: string;
    currentStep: string;
    isScanning: boolean;
    errors: string[];
    completedBrands: string[];
    startedAt: number;
  } | undefined;
}

export async function GET() {
  const progress = globalThis.regionScanProgress || {
    region: '',
    phase: 'done',
    totalBrands: 0,
    currentIndex: 0,
    currentBrand: '',
    currentStep: '',
    isScanning: false,
    errors: [],
    completedBrands: [],
    startedAt: 0,
  };

  return NextResponse.json(progress);
}
