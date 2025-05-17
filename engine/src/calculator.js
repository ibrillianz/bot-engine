// bot-engine/src/calculator.js

/**
 * Calculate project cost based on project type, finish tier, and area.
 *
 * Expects `responses` to have:
 * - projectType: "Residential" | "Commercial"
 * - finishTier:  "Economy" | "Standard" | "Premium"
 * - areaSqft:    string or number indicating square footage
 */
export function calculatePrice(responses) {
  const RATES = {
    Residential: {
      Economy:  1200,
      Standard: 1500,
      Premium:  2000
    },
    Commercial: {
      Economy:  800,
      Standard: 1000,
      Premium:  1200
    }
  };

  // Parse area (sqft) from responses; default to 0 if missing/invalid
  const area = parseFloat(responses.areaSqft) || 0;
  const tier = responses.finishTier;
  const type = responses.projectType;

  // Safely look up rate
  const ratePerSqft = (RATES[type] && RATES[type][tier]) || 0;
  return ratePerSqft * area;
}
