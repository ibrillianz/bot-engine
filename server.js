// bot-engine/server.js
// PRIVATE REPOSITORY - MAIN API SERVER

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import apiRoutes from './api/endpoints.js';
import { addSecurityHeaders } from './api/middleware/auth.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Security middleware - First line of defense
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Compression middleware
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
}));

// Global rate limiting (before API-specific limits)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Global limit per IP
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'GLOBAL_RATE_LIMIT'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  }
});

app.use(globalLimiter);

// Custom security headers
app.use(addSecurityHeaders);

// Request parsing middleware
app.use(express.json({ 
  limit: '10mb',
  strict: true,
  type: ['application/json']
}));

app.use(express.urlencoded({ 
  extended: false, 
  limit: '10mb' 
}));

// Request logging middleware (production-ready)
app.use((req, res, next) => {
  const startTime = Date.now();
  const originalEnd = res.end;
  
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    // Log request details (would use proper logger in production)
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length') || '0'
    };
    
    if (NODE_ENV === 'production') {
      console.log(JSON.stringify(logData));
    } else {
      console.log(`${logData.method} ${logData.url} - ${logData.statusCode} - ${logData.duration}`);
    }
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
});

// Health check endpoints (before authentication)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    environment: NODE_ENV
  });
});

app.get('/ready', async (req, res) => {
  try {
    // Check critical dependencies
    const checks = {
      server: true,
      memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024, // Less than 500MB
      uptime: process.uptime() > 10 // At least 10 seconds uptime
    };
    
    const allHealthy = Object.values(checks).every(check => check === true);
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'ready' : 'not ready',
      checks: checks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// API routes - All business logic protected here
app.use('/api', apiRoutes);

// Root endpoint - Minimal exposure
app.get('/', (req, res) => {
  res.json({
    service: 'Bot Engine API',
    version: '1.0.0',
    status: 'operational',
    documentation: '/api/docs',
    health: '/health'
  });
});

// API documentation endpoint (minimal info)
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Bot Engine API Documentation',
    version: '1.0.0',
    description: 'Secure API for bot-powered lead generation and pricing calculations',
    endpoints: {
      'POST /api/calculate-price': 'Calculate project pricing based on questionnaire responses',
      'POST /api/validate-pincode': 'Validate service availability for location',
      'POST /api/submit-lead': 'Submit qualified lead data for processing'
    },
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer YOUR_API_KEY'
    },
    support: {
      email: 'support@bot-engine.com',
      documentation: 'https://docs.bot-engine.com'
    }
  });
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: 'The requested API endpoint does not exist',
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /api/docs',
      'POST /api/calculate-price',
      'POST /api/validate-pincode', 
      'POST /api/submit-lead'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Don't expose internal error details in production
  const isDevelopment = NODE_ENV === 'development';
  
  res.status(500).json({
    error: 'Internal server error',
    message: isDevelopment ? error.message : 'Something went wrong',
    code: 'INTERNAL_SERVER_ERROR',
    ...(isDevelopment && { stack: error.stack })
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

// Unhandled promise rejection handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', {
    reason: reason,
    promise: promise,
    timestamp: new Date().toISOString()
  });
  
  // In production, you might want to restart the process
  if (NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Start server based on environment
let server;

if (NODE_ENV === 'production' && process.env.SSL_CERT && process.env.SSL_KEY) {
  // HTTPS server for production
  const httpsOptions = {
    cert: readFileSync(process.env.SSL_CERT),
    key: readFileSync(process.env.SSL_KEY)
  };
  
  server = createServer(httpsOptions, app);
  server.listen(PORT, () => {
    console.log(`🔒 Bot Engine API Server (HTTPS) running on port ${PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`🔑 SSL Certificate loaded`);
    console.log(`📊 Health check: https://localhost:${PORT}/health`);
  });
} else {
  // HTTP server for development
  server = app.listen(PORT, () => {
    console.log(`🚀 Bot Engine API Server (HTTP) running on port ${PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📚 API docs: http://localhost:${PORT}/api/docs`);
    
    if (NODE_ENV === 'development') {
      console.log(`🔧 Development mode - detailed logging enabled`);
    }
  });
}

// Export app for testing
export default app;
