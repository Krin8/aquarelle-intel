import prisma from '@/lib/db';
import { generateStructuredResponse } from '../router';
import { getAquarelleContextString } from '@/lib/knowledge/aquarelle-kb';

export async function generateWinStrategy(supplierId: string, brandId: string) {
  try {
    const supplier = await prisma.supplierProfile.findUnique({ where: { id: supplierId } });
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!supplier || !brand) throw new Error('Data not found');

    const systemPrompt = `You are a Principal AI Engineer, Enterprise Sales Strategist, and Supply Chain Intelligence Expert.
Our platform generates Competitive Win Strategies for Aquarelle Group (our company) against incumbent suppliers.

Aquarelle Capabilities:
${getAquarelleContextString()}

Analyze how Aquarelle can displace or outperform this incumbent supplier.
Generate the Win Strategy and a list of specific Supply Chain Gaps where Aquarelle has an advantage.

Return ONLY a JSON object matching this interface:
{
  "winStrategy": {
    "whyCustomerUsesThem": "string",
    "businessValueProvided": "string",
    "likelyPainPoints": "string",
    "vulnerabilities": "string",
    "whatAquarelleDoesBetter": "string",
    "capabilitiesToEmphasize": ["string"],
    "capabilitiesToAvoid": ["string"],
    "matchingAquarelleProducts": ["string"],
    "sustainabilityToHighlight": ["string"],
    "expectedObjections": ["string"],
    "recommendedResponses": ["string"],
    "recommendedSalesStrategy": "string",
    "estimatedWinProbability": 0.0 to 100.0,
    "confidenceScore": 0.0 to 100.0,
    "aiReasoning": "string"
  },
  "gaps": [
    {
      "gapCategory": "string (Manufacturing, Sustainability, Technology, Quality, Cost, Delivery)",
      "description": "string",
      "canAquarelleSolveIt": boolean,
      "aquarelleCapability": "string",
      "expectedRoi": "string",
      "businessImpact": "string",
      "implementationEffort": "string (low, medium, high)",
      "priority": "string (low, medium, high)",
      "confidence": 0.0 to 100.0
    }
  ]
}`;

    const userPrompt = `Target Brand: ${brand.name}
Incumbent Supplier (Competitor): ${supplier.name}

Current Supplier Profile Data:
Products: ${supplier.productsManufactured}
Automation: ${supplier.automationLevel}
Lead Time: ${supplier.leadTime}
Strengths: ${supplier.strengths}
Weaknesses: ${supplier.weaknesses}`;

    const { result } = await generateStructuredResponse<any>(
      systemPrompt,
      userPrompt,
      (text: string) => {
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
      }
    );

    const ws = result.winStrategy;

    await prisma.winStrategy.upsert({
      where: { supplierId },
      update: {
        whyCustomerUsesThem: ws.whyCustomerUsesThem,
        businessValueProvided: ws.businessValueProvided,
        likelyPainPoints: ws.likelyPainPoints,
        vulnerabilities: ws.vulnerabilities,
        whatAquarelleDoesBetter: ws.whatAquarelleDoesBetter,
        capabilitiesToEmphasize: JSON.stringify(ws.capabilitiesToEmphasize || []),
        capabilitiesToAvoid: JSON.stringify(ws.capabilitiesToAvoid || []),
        matchingAquarelleProducts: JSON.stringify(ws.matchingAquarelleProducts || []),
        sustainabilityToHighlight: JSON.stringify(ws.sustainabilityToHighlight || []),
        expectedObjections: JSON.stringify(ws.expectedObjections || []),
        recommendedResponses: JSON.stringify(ws.recommendedResponses || []),
        recommendedSalesStrategy: ws.recommendedSalesStrategy,
        estimatedWinProbability: ws.estimatedWinProbability,
        confidenceScore: ws.confidenceScore,
        aiReasoning: ws.aiReasoning
      },
      create: {
        supplierId,
        whyCustomerUsesThem: ws.whyCustomerUsesThem,
        businessValueProvided: ws.businessValueProvided,
        likelyPainPoints: ws.likelyPainPoints,
        vulnerabilities: ws.vulnerabilities,
        whatAquarelleDoesBetter: ws.whatAquarelleDoesBetter,
        capabilitiesToEmphasize: JSON.stringify(ws.capabilitiesToEmphasize || []),
        capabilitiesToAvoid: JSON.stringify(ws.capabilitiesToAvoid || []),
        matchingAquarelleProducts: JSON.stringify(ws.matchingAquarelleProducts || []),
        sustainabilityToHighlight: JSON.stringify(ws.sustainabilityToHighlight || []),
        expectedObjections: JSON.stringify(ws.expectedObjections || []),
        recommendedResponses: JSON.stringify(ws.recommendedResponses || []),
        recommendedSalesStrategy: ws.recommendedSalesStrategy,
        estimatedWinProbability: ws.estimatedWinProbability,
        confidenceScore: ws.confidenceScore,
        aiReasoning: ws.aiReasoning
      }
    });

    if (result.gaps && result.gaps.length > 0) {
      await prisma.supplierGap.deleteMany({ where: { supplierId } });
      
      await prisma.supplierGap.createMany({
        data: result.gaps.map((g: any) => ({
          supplierId,
          gapCategory: g.gapCategory,
          description: g.description,
          canAquarelleSolveIt: g.canAquarelleSolveIt,
          aquarelleCapability: g.aquarelleCapability,
          expectedRoi: g.expectedRoi,
          businessImpact: g.businessImpact,
          implementationEffort: g.implementationEffort,
          priority: g.priority,
          confidence: g.confidence
        }))
      });
    }

    console.log(`[WinStrategyGenerator] Completed strategy for ${supplier.name}`);
  } catch (error) {
    console.error(`[WinStrategyGenerator] Failed:`, error);
  }
}
