// bot-engine/api/middleware/validation.js
// PRIVATE REPOSITORY - SECURITY VALIDATION LAYER

import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Validate request data against schema requirements
 * @param {Object} data - Request body data
 * @param {Object} schema - Validation schema with required/optional fields
 * @returns {Object} Validation result with errors if any
 */
export function validateRequestData(data, schema) {
  const errors = [];
  const { required = [], optional = [] } = schema;

  // Check required fields
  for (const field of required) {
    if (!data || data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate data types and formats for provided fields
  const allFields = [...required, ...optional];
  
  for (const field in data) {
    if (!allFields.includes(field)) {
      errors.push(`Unexpected field: ${field}`);
      continue;
    }

    // Field-specific validation
    const fieldError = validateField(field, data[field]);
    if (fieldError) {
      errors.push(fieldError);
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * Sanitize input data to prevent XSS and injection attacks
 * @param {Object} data - Raw input data
 * @returns {Object} Sanitized data
 */
export function sanitizeInput(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
}

/**
 * Sanitize individual values based on type
 * @param {any} value - Value to sanitize
 * @returns {any} Sanitized value
 */
function sanitizeValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    // Remove potentially malicious content
    let sanitized = DOMPurify.sanitize(value);
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit string length to prevent DoS
    if (sanitized.length > 1000) {
      sanitized = sanitized.substring(0, 1000);
    }
    
    return sanitized;
  }

  if (typeof value === 'number') {
    // Validate number is finite and within reasonable bounds
    if (!Number.isFinite(value) || value < -1000000 || value > 1000000) {
      return 0;
    }
    return value;
  }

  if (typeof value === 'boolean') {
    return Boolean(value);
  }

  if (Array.isArray(value)) {
    // Limit array size and sanitize each element
    return value.slice(0, 50).map(item => sanitizeValue(item));
  }

  if (typeof value === 'object') {
    // Recursively sanitize object properties
    const sanitizedObj = {};
    let propCount = 0;
    
    for (const [key, val] of Object.entries(value)) {
      // Limit object properties to prevent DoS
      if (propCount >= 50) break;
      
      const sanitizedKey = sanitizeValue(key);
      if (typeof sanitizedKey === 'string' && sanitizedKey.length > 0) {
        sanitizedObj[sanitizedKey] = sanitizeValue(val);
        propCount++;
      }
    }
    
    return sanitizedObj;
  }

  // For unknown types, convert to string and sanitize
  return sanitizeValue(String(value));
}

/**
 * Validate specific fields based on business rules
 * @param {string} fieldName - Name of the field
 * @param {any} value - Value to validate
 * @returns {string|null} Error message or null if valid
 */
function validateField(fieldName, value) {
  switch (fieldName) {
    case 'email':
      if (typeof value !== 'string' || !validator.isEmail(value)) {
        return 'Invalid email format';
      }
      break;

    case 'phone':
      const phoneStr = String(value).replace(/\D/g, '');
      if (phoneStr.length < 10 || phoneStr.length > 12) {
        return 'Invalid phone number length';
      }
      // Indian mobile number validation
      const indianMobile = phoneStr.slice(-10);
      if (!/^[6-9]\d{9}$/.test(indianMobile)) {
        return 'Invalid Indian mobile number format';
      }
      break;

    case 'pincode':
      const pincodeStr = String(value);
      if (!/^\d{6}$/.test(pincodeStr)) {
        return 'Pincode must be 6 digits';
      }
      break;

    case 'name':
      if (typeof value !== 'string' || value.length < 2 || value.length > 50) {
        return 'Name must be between 2-50 characters';
      }
      if (!/^[a-zA-Z\s.'-]+$/.test(value)) {
        return 'Name contains invalid characters';
      }
      break;

    case 'botType':
      const validBots = ['kavya', 'arjun', 'priya', 'rohan'];
      if (!validBots.includes(String(value).toLowerCase())) {
        return 'Invalid bot type specified';
      }
      break;

    case 'projectType':
      const validProjectTypes = ['Residential', 'Commercial'];
      if (!validProjectTypes.includes(value)) {
        return 'Invalid project type';
      }
      break;

    case 'finishTier':
      const validTiers = ['Economy', 'Standard', 'Premium'];
      if (!validTiers.includes(value)) {
        return 'Invalid finish tier';
      }
      break;

    case 'clientType':
      const validClientTypes = ['interiors', 'salon', 'tutor'];
      if (!validClientTypes.includes(String(value).toLowerCase())) {
        return 'Invalid client type';
      }
      break;

    case 'timeline':
      const validTimelines = ['rush', 'normal', 'flexible'];
      if (!validTimelines.includes(String(value).toLowerCase())) {
        return 'Invalid timeline option';
      }
      break;

    case 'areaSqft':
      const area = parseFloat(value);
      if (isNaN(area) || area < 100 || area > 50000) {
        return 'Area must be between 100-50000 sq ft';
      }
      break;

    case 'sessionId':
      if (typeof value !== 'string' || value.length < 10 || value.length > 100) {
        return 'Invalid session ID format';
      }
      break;

    case 'clientId':
      if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) {
        return 'Invalid client ID format';
      }
      break;

    case 'responses':
      if (typeof value !== 'object' || Array.isArray(value)) {
        return 'Responses must be an object';
      }
      break;

    case 'userData':
      if (typeof value !== 'object' || Array.isArray(value)) {
        return 'User data must be an object';
      }
      break;

    case 'pricing':
      if (typeof value !== 'object' || Array.isArray(value)) {
        return 'Pricing data must be an object';
      }
      break;

    case 'marketingConsent':
      if (typeof value !== 'boolean') {
        return 'Marketing consent must be boolean';
      }
      break;

    // Material selection validations
    case 'flooring':
      const validFlooring = ['marble-granite', 'premium-tiles', 'engineered-wood', 'laminate', 'standard-tiles', 'vinyl'];
      if (!validFlooring.includes(String(value).toLowerCase())) {
        return 'Invalid flooring option';
      }
      break;

    case 'kitchen':
      const validKitchen = ['premium-modular', 'standard-modular', 'semi-modular', 'basic'];
      if (!validKitchen.includes(String(value).toLowerCase())) {
        return 'Invalid kitchen option';
      }
      break;

    case 'lighting':
      const validLighting = ['designer', 'premium', 'standard', 'basic'];
      if (!validLighting.includes(String(value).toLowerCase())) {
        return 'Invalid lighting option';
      }
      break;

    case 'paint':
      const validPaint = ['premium', 'standard', 'economy'];
      if (!validPaint.includes(String(value).toLowerCase())) {
        return 'Invalid paint option';
      }
      break;

    case 'furniture':
      const validFurniture = ['custom', 'premium-modular', 'standard-modular', 'ready-made'];
      if (!validFurniture.includes(String(value).toLowerCase())) {
        return 'Invalid furniture option';
      }
      break;

    case 'spaceType':
      // Residential space types
      const residentialSpaces = ['full-home', 'kitchen', 'bedroom', 'living-room', 'bathroom', 'dining-room'];
      // Commercial space types
      const commercialSpaces = ['office', 'retail', 'restaurant', 'clinic', 'showroom', 'warehouse'];
      const validSpaces = [...residentialSpaces, ...commercialSpaces];
      
      if (!validSpaces.includes(String(value).toLowerCase())) {
        return 'Invalid space type';
      }
      break;

    case 'requirements':
      if (typeof value === 'string' && value.length > 500) {
        return 'Requirements text too long (max 500 characters)';
      }
      break;

    default:
      // For unknown fields, just ensure they're not excessively large
      if (typeof value === 'string' && value.length > 1000) {
        return `Field ${fieldName} is too long`;
      }
      break;
  }

  return null; // Field is valid
}

/**
 * Validate API key format and structure
 * @param {string} apiKey - API key to validate
 * @returns {boolean} Whether API key format is valid
 */
export function validateApiKeyFormat(apiKey) {
  if (typeof apiKey !== 'string') {
    return false;
  }

  // API key format: prefix_environment_randomstring
  // Example: bot_prod_abc123def456
  const apiKeyPattern = /^bot_(dev|staging|prod)_[a-zA-Z0-9]{24,32}$/;
  return apiKeyPattern.test(apiKey);
}

/**
 * Rate limiting validation for API usage
 * @param {string} clientId - Client identifier
 * @param {string} endpoint - API endpoint being accessed
 * @returns {Object} Rate limit validation result
 */
export function validateRateLimit(clientId, endpoint) {
  // This would typically check against a Redis cache or database
  // For now, return a simple validation structure
  
  const rateLimits = {
    'calculate-price': { requests: 1000, window: '1h' },
    'validate-pincode': { requests: 500, window: '1h' },
    'submit-lead': { requests: 100, window: '1h' }
  };

  const limit = rateLimits[endpoint] || { requests: 100, window: '1h' };

  return {
    allowed: true, // This would be calculated based on actual usage
    limit: limit.requests,
    window: limit.window,
    remaining: limit.requests - 1,
    resetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
}

/**
 * Validate request origin and referrer for additional security
 * @param {Object} req - Express request object
 * @returns {boolean} Whether request origin is valid
 */
export function validateRequestOrigin(req) {
  const origin = req.get('Origin') || req.get('Referer');
  
  if (!origin) {
    // Allow requests without origin (mobile apps, direct API calls)
    return true;
  }

  // List of allowed domains (would be configurable per client)
  const allowedDomains = [
    'vercel.app',
    'netlify.app',
    'herokuapp.com',
    'bot-engine.com',
    // Client-specific domains would be added here
  ];

  try {
    const originUrl = new URL(origin);
    const domain = originUrl.hostname;
    
    return allowedDomains.some(allowedDomain => 
      domain === allowedDomain || domain.endsWith('.' + allowedDomain)
    );
  } catch (error) {
    return false;
  }
}
