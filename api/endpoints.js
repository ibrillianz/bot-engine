// bot-engine/api/endpoints.js
// PRIVATE REPOSITORY - SECURE API ENDPOINTS

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { calculateDetailedPrice, validateServiceArea } from '../engine/src/calculator.js';
import { submitToGoogleSheets } from './integrations/googleSheets.js';
import { validateApiKey, logApiUsage } from './middleware/auth.js';
import { sanitizeInput, validateRequestData } from './middleware/validation.js';

const router = express.Router();

// Rate limiting for API protection
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each client to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// CORS configuration for client domains
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // List of allowed client domains (will be configurable per client)
    const allowedOrigins = [
      'https://tener-interiors.vercel.app',
      'https://salon-assist.vercel.app',
      'https://tutor-assist.vercel.app',
      // Client-specific domains will be added here
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-ID', 'X-Request-ID']
};

// Apply middleware
router.use(cors(corsOptions));
router.use(apiLimiter);
router.use(express.json({ limit: '10mb' }));
router.use(validateApiKey); // Custom authentication middleware
router.use(logApiUsage); // Usage tracking for billing

/**
 * POST /api/calculate-price
 * Calculate project pricing based on questionnaire responses
 */
router.post('/calculate-price', async (req, res) => {
  try {
    // Validate and sanitize request data
    const validation = validateRequestData(req.body, {
      required: ['responses', 'botType', 'clientType'],
      optional: ['sessionId', 'timestamp']
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.errors
      });
    }

    const { responses, botType, clientType, sessionId } = sanitizeInput(req.body);

    // Validate bot type
    const validBots = ['kavya', 'arjun', 'priya', 'rohan'];
    if (!validBots.includes(botType.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bot type specified'
      });
    }

    // Calculate pricing using proprietary algorithm
    const pricingResult = calculateDetailedPrice(responses, botType, clientType);

    if (!pricingResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Pricing calculation failed',
        fallbackQuote: '₹15,00,000 - ₹25,00,000'
      });
    }

    // Log successful calculation for analytics
    await logApiUsage(req, 'price_calculation', {
      botType,
      clientType,
      finalPrice: pricingResult.pricing.finalPrice,
      sessionId
    });

    // Return pricing with minimal exposure of business logic
    res.json({
      success: true,
      quote: pricingResult.pricing.priceRange.display,
      pricing: {
        range: pricingResult.pricing.priceRange,
        currency: pricingResult.pricing.currency
      },
      specialist: {
        name: getBotDisplayName(botType),
        expertise: getBotExpertise(botType)
      },
      metadata: {
        calculatedAt: pricingResult.metadata.calculatedAt,
        validUntil: getQuoteValidityDate()
      }
    });

  } catch (error) {
    console.error('Price calculation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      fallbackQuote: '₹15,00,000 - ₹25,00,000'
    });
  }
});

/**
 * POST /api/validate-pincode
 * Check service availability for given pincode
 */
router.post('/validate-pincode', async (req, res) => {
  try {
    const validation = validateRequestData(req.body, {
      required: ['pincode'],
      optional: ['serviceType']
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pincode provided'
      });
    }

    const { pincode, serviceType } = sanitizeInput(req.body);

    // Validate pincode format (6 digits for India)
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pincode format. Please enter 6-digit pincode.'
      });
    }

    // Check service availability
    const serviceValidation = validateServiceArea(pincode, serviceType || 'interiors');

    // Log pincode check for business intelligence
    await logApiUsage(req, 'pincode_validation', {
      pincode,
      serviceType,
      isServiceable: serviceValidation.isServiceable
    });

    res.json({
      success: true,
      serviceable: serviceValidation.isServiceable,
      delivery: serviceValidation.estimatedDelivery,
      serviceLevel: serviceValidation.serviceLevel,
      message: serviceValidation.isServiceable 
        ? 'Great! We provide services in your area.' 
        : 'Sorry, we don\'t service this area yet. We\'ll notify you when available.'
    });

  } catch (error) {
    console.error('Pincode validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Service validation failed'
    });
  }
});

/**
 * POST /api/submit-lead
 * Process and store final lead submission
 */
router.post('/submit-lead', async (req, res) => {
  try {
    const validation = validateRequestData(req.body, {
      required: ['userData', 'responses', 'pricing', 'botType', 'clientId'],
      optional: ['sessionId', 'marketingConsent']
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Incomplete lead data',
        details: validation.errors
      });
    }

    const { userData, responses, pricing, botType, clientId, marketingConsent, sessionId } = sanitizeInput(req.body);

    // Validate user data completeness
    if (!userData.name || !userData.phone || !userData.email) {
      return res.status(400).json({
        success: false,
        error: 'Name, phone, and email are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate phone format (Indian mobile)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(userData.phone.replace(/\D/g, '').slice(-10))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      });
    }

    // Prepare lead data for storage
    const leadData = {
      // User information
      name: userData.name,
      phone: userData.phone,
      email: userData.email,
      
      // Project details
      projectType: responses.projectType,
      spaceType: responses.spaceType,
      finishTier: responses.finishTier,
      materials: JSON.stringify(responses.materials || {}),
      timeline: responses.timeline,
      specialRequirements: responses.requirements || '',
      
      // Pricing information
      quotedPrice: pricing.display,
      botSpecialist: getBotDisplayName(botType),
      
      // Consent and compliance
      primaryConsent: true, // Required for lead processing
      marketingConsent: marketingConsent || false,
      
      // Metadata
      submittedAt: new Date().toISOString(),
      clientId: clientId,
      sessionId: sessionId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    // Submit to client's Google Sheets (secure integration)
    const submissionResult = await submitToGoogleSheets(clientId, leadData);

    if (!submissionResult.success) {
      throw new Error('Failed to store lead data');
    }

    // Log successful lead submission
    await logApiUsage(req, 'lead_submission', {
      clientId,
      botType,
      quotedPrice: pricing.display,
      hasMarketingConsent: marketingConsent
    });

    // Return success response (minimal data exposure)
    res.json({
      success: true,
      message: 'Thank you! Your quote request has been submitted successfully.',
      leadId: submissionResult.leadId,
      estimatedResponse: '24 hours',
      nextSteps: 'Our design specialist will contact you within 24 hours to discuss your project.'
    });

  } catch (error) {
    console.error('Lead submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit lead. Please try again.',
      supportContact: 'support@bot-engine.com'
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint for monitoring
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Helper functions (business logic abstraction)
function getBotDisplayName(botType) {
  const botNames = {
    'kavya': 'Kavya - Premium Specialist',
    'arjun': 'Arjun - Design Expert', 
    'priya': 'Priya - Budget Specialist',
    'rohan': 'Rohan - Commercial Expert'
  };
  return botNames[botType.toLowerCase()] || 'Design Specialist';
}

function getBotExpertise(botType) {
  const expertise = {
    'kavya': 'Luxury residential interiors with premium materials',
    'arjun': 'Functional design with quality materials and smart budgets',
    'priya': 'Cost-effective beautiful homes with practical solutions',
    'rohan': 'Commercial spaces for enhanced business success'
  };
  return expertise[botType.toLowerCase()] || 'Interior design expert';
}

function getQuoteValidityDate() {
  const validity = new Date();
  validity.setDate(validity.getDate() + 30); // 30 days validity
  return validity.toISOString();
}

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('API Error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: 'Please contact support if this issue persists'
  });
});

export default router;
