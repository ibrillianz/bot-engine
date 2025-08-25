// bot-engine/engine/src/calculator.js
// PRIVATE REPOSITORY - ALL BUSINESS LOGIC PROTECTED

/**
 * Enhanced pricing calculator with all business factors
 * This file contains proprietary pricing algorithms and multipliers
 */

const PRICING_CONFIG = {
  // Base rates per sqft by project type and finish tier
  BASE_RATES: {
    Residential: {
      Economy: 1200,
      Standard: 1500, 
      Premium: 2000
    },
    Commercial: {
      Economy: 800,
      Standard: 1000,
      Premium: 1200
    }
  },

  // Bot personality multipliers (PROPRIETARY)
  BOT_MULTIPLIERS: {
    'kavya': 1.4,    // Premium residential specialist
    'arjun': 1.0,    // Mid-range residential specialist  
    'priya': 0.7,    // Budget residential specialist
    'rohan': 1.2     // Commercial space specialist
  },

  // Material cost multipliers (PROPRIETARY PRICING STRATEGY)
  MATERIAL_MULTIPLIERS: {
    flooring: {
      'marble-granite': 1.8,
      'premium-tiles': 1.4,
      'engineered-wood': 1.6,
      'laminate': 1.2,
      'standard-tiles': 1.0,
      'vinyl': 0.8
    },
    kitchen: {
      'premium-modular': 2.2,
      'standard-modular': 1.5,
      'semi-modular': 1.2,
      'basic': 0.9
    },
    lighting: {
      'designer': 2.0,
      'premium': 1.5,
      'standard': 1.2,
      'basic': 0.8
    },
    paint: {
      'premium': 1.4,
      'standard': 1.0,
      'economy': 0.7
    },
    furniture: {
      'custom': 2.5,
      'premium-modular': 1.8,
      'standard-modular': 1.3,
      'ready-made': 1.0
    }
  },

  // Regional pricing variations (BUSINESS INTELLIGENCE)
  REGION_MULTIPLIERS: {
    // Metro cities - higher rates
    'mumbai': 1.3,
    'delhi': 1.25,
    'bangalore': 1.2,
    'pune': 1.15,
    'hyderabad': 1.1,
    
    // Tier-2 cities - standard rates
    'chennai': 1.0,
    'kolkata': 1.0,
    'ahmedabad': 0.95,
    
    // Tier-3 cities - lower rates
    'default': 0.85
  },

  // Timeline urgency multipliers (BUSINESS STRATEGY)
  TIMELINE_MULTIPLIERS: {
    'rush': 1.4,        // 15-30 days - rush job premium
    'normal': 1.0,      // 45-60 days - standard timeline
    'flexible': 0.95    // 90+ days - slight discount for flexibility
  },

  // Project scope complexity (PROPRIETARY CALCULATION)
  SCOPE_MULTIPLIERS: {
    'full-renovation': 1.2,
    'partial-renovation': 1.0,
    'fresh-interiors': 0.9,
    'single-room': 0.8
  }
};

/**
 * Main pricing calculation function
 * @param {Object} responses - All questionnaire responses
 * @param {string} botType - Selected bot personality
 * @param {string} clientType - Client industry (interiors/salon/tutor)
 * @returns {Object} Detailed pricing breakdown
 */
export function calculateDetailedPrice(responses, botType, clientType = 'interiors') {
  try {
    // Parse and validate inputs
    const area = parseFloat(responses.areaSqft) || 1000; // Default 1000 sqft if not provided
    const projectType = responses.projectType || 'Residential';
    const finishTier = responses.finishTier || 'Standard';
    
    // Get base rate per sqft
    const baseRatePerSqft = PRICING_CONFIG.BASE_RATES[projectType]?.[finishTier] || 1200;
    let totalPrice = baseRatePerSqft * area;

    // Apply bot personality multiplier (CORE BUSINESS LOGIC)
    const botMultiplier = PRICING_CONFIG.BOT_MULTIPLIERS[botType.toLowerCase()] || 1.0;
    totalPrice *= botMultiplier;

    // Calculate material cost impact (PROPRIETARY ALGORITHM)
    const materialMultiplier = calculateMaterialMultiplier(responses);
    totalPrice *= materialMultiplier;

    // Apply regional pricing (COMPETITIVE ADVANTAGE)
    const regionMultiplier = getRegionMultiplier(responses.pincode);
    totalPrice *= regionMultiplier;

    // Timeline urgency adjustment (BUSINESS STRATEGY)
    const timelineMultiplier = PRICING_CONFIG.TIMELINE_MULTIPLIERS[responses.timeline] || 1.0;
    totalPrice *= timelineMultiplier;

    // Project scope complexity (VALUE OPTIMIZATION)
    const scopeMultiplier = PRICING_CONFIG.SCOPE_MULTIPLIERS[responses.projectScope] || 1.0;
    totalPrice *= scopeMultiplier;

    // Generate pricing tiers for display (SALES STRATEGY)
    const pricingTiers = generatePricingTiers(totalPrice);

    // Create detailed breakdown (TRANSPARENCY + TRUST)
    return {
      success: true,
      pricing: {
        basePrice: Math.round(baseRatePerSqft * area),
        finalPrice: Math.round(totalPrice),
        priceRange: pricingTiers,
        currency: 'INR'
      },
      breakdown: {
        botSpecialist: botType,
        botMultiplier: botMultiplier,
        materialFactor: materialMultiplier,
        regionFactor: regionMultiplier,
        timelineFactor: timelineMultiplier,
        scopeFactor: scopeMultiplier
      },
      metadata: {
        calculatedAt: new Date().toISOString(),
        area: area,
        projectType: projectType,
        finishTier: finishTier
      }
    };

  } catch (error) {
    return {
      success: false,
      error: 'Pricing calculation failed',
      fallbackPrice: '₹15,00,000 - ₹25,00,000' // Safe fallback for UI
    };
  }
}

/**
 * Calculate material selection impact on pricing (PROPRIETARY)
 */
function calculateMaterialMultiplier(responses) {
  let materialMultiplier = 1.0;
  
  // Flooring impact
  if (responses.flooring) {
    materialMultiplier *= PRICING_CONFIG.MATERIAL_MULTIPLIERS.flooring[responses.flooring] || 1.0;
  }
  
  // Kitchen fixtures impact
  if (responses.kitchen) {
    materialMultiplier *= PRICING_CONFIG.MATERIAL_MULTIPLIERS.kitchen[responses.kitchen] || 1.0;
  }
  
  // Lighting impact
  if (responses.lighting) {
    materialMultiplier *= PRICING_CONFIG.MATERIAL_MULTIPLIERS.lighting[responses.lighting] || 1.0;
  }
  
  // Paint quality impact
  if (responses.paint) {
    materialMultiplier *= PRICING_CONFIG.MATERIAL_MULTIPLIERS.paint[responses.paint] || 1.0;
  }
  
  // Furniture impact
  if (responses.furniture) {
    materialMultiplier *= PRICING_CONFIG.MATERIAL_MULTIPLIERS.furniture[responses.furniture] || 1.0;
  }

  return materialMultiplier;
}

/**
 * Get regional pricing multiplier based on pincode (BUSINESS INTELLIGENCE)
 */
function getRegionMultiplier(pincode) {
  if (!pincode) return 1.0;
  
  // Extract city from pincode (simplified logic)
  const pincodeStr = pincode.toString();
  
  // Mumbai: 400xxx
  if (pincodeStr.startsWith('400')) return PRICING_CONFIG.REGION_MULTIPLIERS.mumbai;
  
  // Delhi: 110xxx, 121xxx, 122xxx
  if (pincodeStr.startsWith('110') || pincodeStr.startsWith('121') || pincodeStr.startsWith('122')) {
    return PRICING_CONFIG.REGION_MULTIPLIERS.delhi;
  }
  
  // Bangalore: 560xxx
  if (pincodeStr.startsWith('560')) return PRICING_CONFIG.REGION_MULTIPLIERS.bangalore;
  
  // Pune: 411xxx, 412xxx
  if (pincodeStr.startsWith('411') || pincodeStr.startsWith('412')) {
    return PRICING_CONFIG.REGION_MULTIPLIERS.pune;
  }
  
  // Hyderabad: 500xxx
  if (pincodeStr.startsWith('500')) return PRICING_CONFIG.REGION_MULTIPLIERS.hyderabad;
  
  // Default for other areas
  return PRICING_CONFIG.REGION_MULTIPLIERS.default;
}

/**
 * Generate pricing tiers for sales psychology (CONVERSION OPTIMIZATION)
 */
function generatePricingTiers(basePrice) {
  const lowerBound = Math.round(basePrice * 0.85);
  const upperBound = Math.round(basePrice * 1.15);
  
  return {
    min: lowerBound,
    max: upperBound,
    display: `₹${formatPrice(lowerBound)} - ₹${formatPrice(upperBound)}`
  };
}

/**
 * Format price for Indian currency display
 */
function formatPrice(amount) {
  return new Intl.NumberFormat('en-IN').format(amount);
}

/**
 * Validate service availability by pincode (BUSINESS OPERATIONS)
 */
export function validateServiceArea(pincode, serviceType = 'interiors') {
  // Service area validation logic (PROPRIETARY BUSINESS DATA)
  const servicePincodes = {
    interiors: [
      // Metro cities
      '400', '110', '560', '411', '500', // Mumbai, Delhi, Bangalore, Pune, Hyderabad
      // Tier-2 cities  
      '600', '700', '380', '302', '226'  // Chennai, Kolkata, Ahmedabad, Jaipur, Lucknow
    ],
    salon: [
      '400', '110', '560', '411', '500', '600'
    ],
    tutor: [
      '400', '110', '560', '411', '500', '600', '700'
    ]
  };
  
  const pincodeStr = pincode.toString().substring(0, 3);
  const serviceAreas = servicePincodes[serviceType] || servicePincodes.interiors;
  
  return {
    isServiceable: serviceAreas.includes(pincodeStr),
    estimatedDelivery: getEstimatedDelivery(pincodeStr),
    serviceLevel: getServiceLevel(pincodeStr)
  };
}

function getEstimatedDelivery(pincodePrefix) {
  const metroAreas = ['400', '110', '560', '411', '500'];
  return metroAreas.includes(pincodePrefix) ? '45-60 days' : '60-90 days';
}

function getServiceLevel(pincodePrefix) {
  const metroAreas = ['400', '110', '560', '411', '500'];
  return metroAreas.includes(pincodePrefix) ? 'premium' : 'standard';
}
