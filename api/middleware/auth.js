// bot-engine/api/middleware/auth.js
// PRIVATE REPOSITORY - AUTHENTICATION AND ACCESS CONTROL

import crypto from 'crypto';
import { validateApiKeyFormat } from './validation.js';

// In-memory store for development (would use Redis/Database in production)
const apiKeyStore = new Map();
const usageStore = new Map();

// Client configuration (would be stored in database)
const CLIENT_CONFIG = {
  'tener_interiors': {
    apiKey: 'bot_prod_tener_abc123def456ghi789jkl',
    tier: 'professional',
    maxRequests: 2000,
    allowedEndpoints: ['calculate-price', 'validate-pincode', 'submit-lead'],
    domains: ['tener-interiors.vercel.app', 'tenerinteriors.com']
  },
  'salon_assist_demo': {
    apiKey: 'bot_dev_salon_xyz789abc123def456ghi',
    tier: 'starter', 
    maxRequests: 500,
    allowedEndpoints: ['calculate-price', 'validate-pincode'],
    domains: ['salon-assist.vercel.app']
  }
  // More clients would be configured here
};

/**
 * Validate API key middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Next middleware function
 */
export async function validateApiKey(req, res, next) {
  try {
    const apiKey = req.headers.authorization?.replace('Bearer ', '') || 
                   req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required',
        code: 'MISSING_API_KEY'
      });
    }

    // Validate API key format
    if (!validateApiKeyFormat(apiKey)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key format',
        code: 'INVALID_API_KEY_FORMAT'
      });
    }

    // Find client by API key
    const clientId = findClientByApiKey(apiKey);
    if (!clientId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'UNAUTHORIZED'
      });
    }

    const clientConfig = CLIENT_CONFIG[clientId];
    
    // Check if endpoint is allowed for this client
    const endpoint = getEndpointFromPath(req.path);
    if (!clientConfig.allowedEndpoints.includes(endpoint)) {
      return res.status(403).json({
        success: false,
        error: 'Endpoint not allowed for your subscription tier',
        code: 'ENDPOINT_FORBIDDEN'
      });
    }

    // Check rate limits
    const rateLimitCheck = await checkRateLimit(clientId, endpoint);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: rateLimitCheck.retryAfter
      });
    }

    // Add client info to request for downstream use
    req.client = {
      id: clientId,
      tier: clientConfig.tier,
      config: clientConfig
    };

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': clientConfig.maxRequests,
      'X-RateLimit-Remaining': rateLimitCheck.remaining,
      'X-RateLimit-Reset': rateLimitCheck.resetTime
    });

    next();

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication service unavailable',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
}

/**
 * Log API usage for billing and analytics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function logApiUsage(req, res, next) {
  // Capture request start time
  req.startTime = Date.now();

  // Override res.json to capture response data
  const originalJson = res.json;
  res.json = function(data) {
    const responseTime = Date.now() - req.startTime;
    
    // Log usage asynchronously
    setImmediate(() => {
      logUsageRecord({
        clientId: req.client?.id,
        endpoint: getEndpointFromPath(req.path),
        method: req.method,
        statusCode: res.statusCode,
        responseTime: responseTime,
        timestamp: new Date().toISOString(),
        requestSize: req.get('content-length') || 0,
        responseSize: JSON.stringify(data).length,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: res.statusCode < 400
      });
    });

    return originalJson.call(this, data);
  };

  next();
}

/**
 * Enhanced usage logging with business intelligence
 * @param {Object} req - Express request object  
 * @param {string} action - Specific action being logged
 * @param {Object} metadata - Additional tracking data
 */
export async function logApiUsage(req, action, metadata = {}) {
  const usageRecord = {
    clientId: req.client?.id,
    action: action,
    endpoint: getEndpointFromPath(req.path),
    timestamp: new Date().toISOString(),
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    requestId: req.get('x-request-id') || generateRequestId(),
    ...metadata
  };

  // Store usage record (would be database in production)
  const clientUsage = usageStore.get(req.client?.id) || [];
  clientUsage.push(usageRecord);
  usageStore.set(req.client?.id, clientUsage);

  // In production, this would write to analytics database
  console.log('API Usage:', JSON.stringify(usageRecord));
}

/**
 * Check rate limits for client and endpoint
 * @param {string} clientId - Client identifier
 * @param {string} endpoint - API endpoint
 * @returns {Object} Rate limit status
 */
async function checkRateLimit(clientId, endpoint) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour window
  const clientConfig = CLIENT_CONFIG[clientId];
  
  if (!clientConfig) {
    return { allowed: false, retryAfter: windowMs };
  }

  // Get client's usage in current window
  const clientUsage = usageStore.get(clientId) || [];
  const windowStart = now - windowMs;
  
  // Count requests in current window
  const recentRequests = clientUsage.filter(record => 
    new Date(record.timestamp).getTime() > windowStart &&
    record.endpoint === endpoint
  );

  const requestCount = recentRequests.length;
  const maxRequests = clientConfig.maxRequests;
  const remaining = Math.max(0, maxRequests - requestCount);

  return {
    allowed: requestCount < maxRequests,
    remaining: remaining,
    resetTime: new Date(windowStart + windowMs).toISOString(),
    retryAfter: remaining === 0 ? windowMs : null
  };
}

/**
 * Find client ID by API key
 * @param {string} apiKey - API key to lookup
 * @returns {string|null} Client ID or null if not found
 */
function findClientByApiKey(apiKey) {
  for (const [clientId, config] of Object.entries(CLIENT_CONFIG)) {
    if (config.apiKey === apiKey) {
      return clientId;
    }
  }
  return null;
}

/**
 * Extract endpoint name from request path
 * @param {string} path - Request path
 * @returns {string} Endpoint name
 */
function getEndpointFromPath(path) {
  // Remove /api/ prefix and extract endpoint name
  const cleanPath = path.replace(/^\/api\//, '');
  return cleanPath.split('/')[0] || 'unknown';
}

/**
 * Generate unique request ID for tracking
 * @returns {string} Unique request identifier
 */
function generateRequestId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Store usage record for billing and analytics
 * @param {Object} record - Usage record to store
 */
function logUsageRecord(record) {
  // In production, this would write to:
  // - Analytics database for business intelligence
  // - Billing system for usage-based pricing
  // - Monitoring system for alerts and metrics
  
  const clientId = record.clientId;
  const existing = usageStore.get(clientId) || [];
  existing.push(record);
  
  // Keep only last 1000 records per client in memory
  if (existing.length > 1000) {
    existing.splice(0, existing.length - 1000);
  }
  
  usageStore.set(clientId, existing);
}

/**
 * Get client usage statistics
 * @param {string} clientId - Client identifier
 * @param {string} timeframe - Time period ('hour', 'day', 'month')
 * @returns {Object} Usage statistics
 */
export function getClientUsageStats(clientId, timeframe = 'hour') {
  const usage = usageStore.get(clientId) || [];
  const now = Date.now();
  
  const timeframes = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000
  };
  
  const windowMs = timeframes[timeframe] || timeframes.hour;
  const windowStart = now - windowMs;
  
  const recentUsage = usage.filter(record => 
    new Date(record.timestamp).getTime() > windowStart
  );
  
  const stats = {
    totalRequests: recentUsage.length,
    successfulRequests: recentUsage.filter(r => r.success).length,
    errorRequests: recentUsage.filter(r => !r.success).length,
    averageResponseTime: 0,
    endpointBreakdown: {},
    timeframe: timeframe
  };
  
  // Calculate average response time
  if (recentUsage.length > 0) {
    const totalResponseTime = recentUsage.reduce((sum, r) => sum + (r.responseTime || 0), 0);
    stats.averageResponseTime = Math.round(totalResponseTime / recentUsage.length);
  }
  
  // Endpoint usage breakdown
  recentUsage.forEach(record => {
    const endpoint = record.endpoint || 'unknown';
    stats.endpointBreakdown[endpoint] = (stats.endpointBreakdown[endpoint] || 0) + 1;
  });
  
  return stats;
}

/**
 * Middleware to add security headers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function addSecurityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Powered-By': 'Bot-Engine-API'
  });
  
  next();
}
