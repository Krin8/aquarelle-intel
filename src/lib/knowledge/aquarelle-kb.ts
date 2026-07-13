export const AQUARELLE_KB = {
  company: "Aquarelle India",
  business: "Premium woven shirt manufacturer and product development partner serving international fashion and lifestyle brands.",
  coreExpertise: [
    "High-quality woven apparel manufacturing",
    "Private-label manufacturing",
    "OEM/ODM apparel production",
    "End-to-end apparel development",
    "Sampling & Product engineering",
    "Fabric sourcing",
    "Garment manufacturing & Finishing",
    "Quality assurance",
    "Global supply chain support"
  ],
  productPortfolio: [
    "Premium Woven Shirts", "Oxford Shirts", "Poplin Shirts", "Twill Shirts", "Linen Shirts",
    "Linen Blends", "Stretch Shirts", "Business Shirts", "Casual Shirts", "Resort Shirts",
    "Overshirts", "Flannel Shirts", "Heavyweight Flannels", "Corduroy Shirts", "Indigo Shirts",
    "Denim Shirts", "Printed Shirts", "Embroidered Shirts", "Women's Shirts"
  ],
  collectionCapabilities: [
    "Seasonal Collections", "Fashion Collections", "Capsule Collections", "Heritage Collections",
    "Core Essentials", "Bright Linen Collections", "Winter Essentials", "Leisure Linen Collections",
    "Sustainable Collections"
  ],
  fabricAndMaterialExpertise: [
    "Oxford", "Poplin", "Twill", "Chambray", "Flannel", "Linen", "Cotton Linen", "Stretch Cotton",
    "Organic Cotton", "BCI Cotton", "Recycled Cotton", "Denim", "Indigo", "Corduroy", "Seersucker",
    "Yarn Dyed Fabrics", "Printed Fabrics", "Embroidery","TENCEL™", "TENCEL™ Overdyed Fabrics", "Slub Cotton",
    "Herringbone Fabrics", "Overdyed Fabrics", "Dobby Stripe", "Laundered Indigo Fabrics"
  ],
  sustainabilityCapabilities: [
    "Organic Cotton", "BCI Cotton", "Recycled Cotton", "Responsible material sourcing",
    "Sustainable dyeing", "Lower environmental impact fabrics", "Eco-conscious manufacturing",
    "Sustainable collections", "Energy-conscious production"
  ],
  manufacturingCapabilities: [
    "Product Design Support", "Sampling", "Pattern Development", "Fabric Engineering",
    "Garment Manufacturing", "Quality Assurance", "Product Finishing", "Large-scale Production",
    "Private Label Manufacturing", "OEM Manufacturing", "ODM Manufacturing", "Global Supply Chain Support"
  ],
  valueProposition: [
    "Premium quality", "Fashion-forward development", "High manufacturing standards",
    "Sustainable manufacturing", "Strong fabric innovation", "Scalable production",
    "Reliable delivery", "International manufacturing expertise", "Customization",
    "Private label capability", "Fashion product development expertise"
  ],
  specialization: [
    "Premium Woven Shirts", "Private Label Manufacturing", "Product Development", "Fabric Innovation"
  ],

  customerType: [
    "Fashion Brands", "Lifestyle Brands", "Department Stores", "Retailers", "Private Labels"
  ],

  manufacturingModel: [
    "OEM", "ODM", "Private Label"
  ]
};

export function getAquarelleContextString() {
  return `
--- AQUARELLE INDIA KNOWLEDGE BASE ---
Business: ${AQUARELLE_KB.business}

Core Expertise:
${AQUARELLE_KB.coreExpertise.map(e => `- ${e}`).join('\n')}

Product Portfolio:
${AQUARELLE_KB.productPortfolio.join(', ')}

Fabric Expertise:
${AQUARELLE_KB.fabricAndMaterialExpertise.join(', ')}

Sustainability Initiatives:
${AQUARELLE_KB.sustainabilityCapabilities.join(', ')}

Manufacturing Capabilities:
${AQUARELLE_KB.manufacturingCapabilities.join(', ')}

Value Proposition:
${AQUARELLE_KB.valueProposition.join(', ')}
--- END AQUARELLE KNOWLEDGE BASE ---
  `.trim();
}
