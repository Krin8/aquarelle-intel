import prisma from '@/lib/db';
import { generateStructuredResponse } from '../router';
import { generateWinStrategy } from './win-strategy-generator';
import { getAquarelleContextString } from '@/lib/knowledge/aquarelle-kb';

export async function analyzeSupplier(supplierId: string, brandId: string) {
  try {
    const supplier = await prisma.supplierProfile.findUnique({ where: { id: supplierId } });
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!supplier || !brand) throw new Error('Supplier or Brand not found');

    console.log(`[SupplierAnalyzer] Analyzing ${supplier.name} for brand ${brand.name}...`);

    const systemPrompt = `You are a Global Sourcing Director and Supply Chain Intelligence Expert. 
Analyze the supplier's expected capabilities, strengths, and weaknesses based on industry knowledge of typical suppliers in their region and category.
If they are a known entity, use your knowledge to provide specific details.

Return ONLY a JSON object matching this interface:
{
  "companyOverview": "string",
  "productsManufactured": ["string"],
  "categoriesHandled": ["string"],
  "manufacturingCapabilities": ["string"],
  "fabricExpertise": ["string"],
  "capacity": "string",
  "productionScale": "string",
  "countriesServed": ["string"],
  "automationLevel": "string (e.g. High, Medium, Low)",
  "digitalMaturity": "string",
  "qualityCertifications": ["string"],
  "complianceCertifications": ["string"],
  "sustainabilityInitiatives": ["string"],
  "esgPerformance": "string",
  "leadTime": "string",
  "speedToMarket": "string",
  "moq": "string",
  "flexibility": "string",
  "pricingPosition": "string",
  "deliveryPerformance": "string",
  "customerPortfolio": ["string"],
  "brandReputation": "string",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "uniqueCapabilities": ["string"],
  "competitiveAdvantages": ["string"],
  "riskFactors": ["string"]
}`;

    const { result } = await generateStructuredResponse<any>(
      systemPrompt,
      `Supplier: ${supplier.name}\nBrand: ${brand.name}\nType: ${supplier.type}\nLocation: ${supplier.location}`,
      (text: string) => {
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
      },
      'ollama' // prefer local model for volume or gemini for quality
    );

    await prisma.supplierProfile.update({
      where: { id: supplierId },
      data: {
        companyOverview: result.companyOverview,
        productsManufactured: JSON.stringify(result.productsManufactured || []),
        categoriesHandled: JSON.stringify(result.categoriesHandled || []),
        manufacturingCapabilities: JSON.stringify(result.manufacturingCapabilities || []),
        fabricExpertise: JSON.stringify(result.fabricExpertise || []),
        capacity: result.capacity,
        productionScale: result.productionScale,
        countriesServed: JSON.stringify(result.countriesServed || []),
        automationLevel: result.automationLevel,
        digitalMaturity: result.digitalMaturity,
        qualityCertifications: JSON.stringify(result.qualityCertifications || []),
        complianceCertifications: JSON.stringify(result.complianceCertifications || []),
        sustainabilityInitiatives: JSON.stringify(result.sustainabilityInitiatives || []),
        esgPerformance: result.esgPerformance,
        leadTime: result.leadTime,
        speedToMarket: result.speedToMarket,
        moq: result.moq,
        flexibility: result.flexibility,
        pricingPosition: result.pricingPosition,
        deliveryPerformance: result.deliveryPerformance,
        customerPortfolio: JSON.stringify(result.customerPortfolio || []),
        brandReputation: result.brandReputation,
        strengths: JSON.stringify(result.strengths || []),
        weaknesses: JSON.stringify(result.weaknesses || []),
        uniqueCapabilities: JSON.stringify(result.uniqueCapabilities || []),
        competitiveAdvantages: JSON.stringify(result.competitiveAdvantages || []),
        riskFactors: JSON.stringify(result.riskFactors || [])
      }
    });

    console.log(`[SupplierAnalyzer] Generating Win Strategy against ${supplier.name}...`);
    await generateWinStrategy(supplierId, brandId);

  } catch (error) {
    console.error(`[SupplierAnalyzer] Failed to analyze supplier ${supplierId}:`, error);
  }
}
