// bot-engine/api/integrations/googleSheets.js
// PRIVATE REPOSITORY - GOOGLE SHEETS INTEGRATION

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import crypto from 'crypto';

// Client-specific Google Sheets configuration (would be stored in secure database)
const SHEETS_CONFIG = {
  'tener_interiors': {
    spreadsheetId: '1ABC123_TENER_SPREADSHEET_ID_XYZ789',
    worksheetName: 'Leads',
    serviceAccountEmail: 'bot-engine-tener@project-id.iam.gserviceaccount.com',
    privateKey: process.env.TENER_SHEETS_PRIVATE_KEY
  },
  'salon_assist_demo': {
    spreadsheetId: '1DEF456_SALON_SPREADSHEET_ID_ABC123',
    worksheetName: 'Customer_Inquiries', 
    serviceAccountEmail: 'bot-engine-salon@project-id.iam.gserviceaccount.com',
    privateKey: process.env.SALON_SHEETS_PRIVATE_KEY
  }
  // Each client gets their own secure sheet configuration
};

// Lead data schema for consistent formatting
const LEAD_SCHEMA = {
  // Customer Information
  timestamp: 'Submission Date',
  leadId: 'Lead ID',
  name: 'Customer Name',
  phone: 'Phone Number', 
  email: 'Email Address',
  
  // Project Details
  projectType: 'Project Type',
  spaceType: 'Space Type',
  finishTier: 'Finish Tier',
  timeline: 'Timeline',
  specialRequirements: 'Special Requirements',
  
  // Pricing Information
  quotedPrice: 'Quoted Price',
  botSpecialist: 'Bot Specialist',
  
  // Business Intelligence
  materials: 'Material Preferences',
  
  // Compliance & Consent
  primaryConsent: 'Primary Consent',
  marketingConsent: 'Marketing Consent',
  
  // Technical Metadata
  sessionId: 'Session ID',
  ipAddress: 'IP Address',
  userAgent: 'User Agent'
};

/**
 * Submit lead data to client's Google Sheet
 * @param {string} clientId - Client identifier
 * @param {Object} leadData - Lead information to store
 * @returns {Object} Submission result with success status and lead ID
 */
export async function submitToGoogleSheets(clientId, leadData) {
  try {
    // Get client's sheet configuration
    const sheetConfig = SHEETS_CONFIG[clientId];
    if (!sheetConfig) {
      throw new Error(`No sheet configuration found for client: ${clientId}`);
    }

    // Authenticate with Google Sheets API
    const serviceAccountAuth = new JWT({
      email: sheetConfig.serviceAccountEmail,
      key: sheetConfig.privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    // Initialize Google Sheet
    const doc = new GoogleSpreadsheet(sheetConfig.spreadsheetId, serviceAccountAuth);
    await doc.loadInfo();

    // Get or create worksheet
    let sheet = doc.sheetsByTitle[sheetConfig.worksheetName];
    if (!sheet) {
      sheet = await doc.addSheet({ 
        title: sheetConfig.worksheetName,
        headerValues: Object.values(LEAD_SCHEMA)
      });
    }

    // Load sheet headers
    await sheet.loadHeaderRow();

    // Generate unique lead ID
    const leadId = generateLeadId(clientId);

    // Format lead data for sheet insertion
    const formattedData = formatLeadData({
      ...leadData,
      leadId: leadId,
      timestamp: new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    });

    // Validate required fields before submission
    const validationResult = validateLeadData(formattedData);
    if (!validationResult.isValid) {
      throw new Error(`Lead data validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Insert lead data into sheet
    const newRow = await sheet.addRow(formattedData);

    // Log successful submission
    console.log(`Lead submitted successfully - Client: ${clientId}, Lead ID: ${leadId}`);

    return {
      success: true,
      leadId: leadId,
      rowNumber: newRow.rowNumber,
      submittedAt: formattedData.timestamp,
      message: 'Lead data stored successfully'
    };

  } catch (error) {
    console.error('Google Sheets submission error:', error);
    
    // Return error without exposing sensitive details
    return {
      success: false,
      error: 'Failed to store lead data',
      errorCode: 'SHEETS_SUBMISSION_FAILED',
      details: error.message.includes('authentication') ? 
        'Authentication failed' : 'Storage service unavailable'
    };
  }
}

/**
 * Format lead data according to sheet schema
 * @param {Object} leadData - Raw lead data
 * @returns {Object} Formatted data matching sheet headers
 */
function formatLeadData(leadData) {
  const formatted = {};

  // Map each field to sheet column header
  for (const [key, columnHeader] of Object.entries(LEAD_SCHEMA)) {
    let value = leadData[key];
    
    // Format specific field types
    switch (key) {
      case 'phone':
        // Format phone number consistently
        value = formatPhoneNumber(value);
        break;
        
      case 'materials':
        // Convert materials object to readable string
        value = formatMaterials(value);
        break;
        
      case 'primaryConsent':
      case 'marketingConsent':
        // Convert boolean to readable text
        value = value ? 'Yes' : 'No';
        break;
        
      case 'specialRequirements':
        // Ensure text fields are strings and limit length
        value = String(value || '').substring(0, 500);
        break;
        
      case 'ipAddress':
        // Anonymize IP for privacy (keep first 3 octets)
        value = anonymizeIpAddress(value);
        break;
        
      case 'userAgent':
        // Limit user agent length
        value = String(value || '').substring(0, 200);
        break;
        
      default:
        // Default formatting - ensure it's a string
        value = value !== null && value !== undefined ? String(value) : '';
    }
    
    formatted[columnHeader] = value;
  }

  return formatted;
}

/**
 * Validate lead data completeness
 * @param {Object} leadData - Lead data to validate
 * @returns {Object} Validation result
 */
function validateLeadData(leadData) {
  const errors = [];
  const requiredFields = [
    'Customer Name', 
    'Phone Number', 
    'Email Address',
    'Project Type',
    'Quoted Price',
    'Primary Consent'
  ];

  // Check required fields
  for (const field of requiredFields) {
    if (!leadData[field] || String(leadData[field]).trim() === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate email format
  const email = leadData['Email Address'];
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Invalid email format');
  }

  // Validate phone format
  const phone = leadData['Phone Number'];
  if (phone && !/^\+91-\d{10}$|^\d{10}$/.test(phone.replace(/\s/g, ''))) {
    errors.push('Invalid phone format');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * Generate unique lead ID
 * @param {string} clientId - Client identifier
 * @returns {string} Unique lead ID
 */
function generateLeadId(clientId) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(3).toString('hex');
  const clientPrefix = clientId.substring(0, 4).toUpperCase();
  
  return `${clientPrefix}-${timestamp}-${random}`.toUpperCase();
}

/**
 * Format phone number consistently
 * @param {string} phone - Raw phone number
 * @returns {string} Formatted phone number
 */
function formatPhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Handle Indian mobile numbers
  let cleanNumber = digits;
  if (digits.startsWith('91') && digits.length === 12) {
    cleanNumber = digits.substring(2);
  }
  
  if (cleanNumber.length === 10 && /^[6-9]/.test(cleanNumber)) {
    return `+91-${cleanNumber}`;
  }
  
  return phone; // Return original if formatting fails
}

/**
 * Format materials object into readable string
 * @param {Object|string} materials - Materials data
 * @returns {string} Formatted materials description
 */
function formatMaterials(materials) {
  if (!materials) return '';
  
  if (typeof materials === 'string') {
    try {
      materials = JSON.parse(materials);
    } catch (e) {
      return materials;
    }
  }
  
  if (typeof materials === 'object') {
    const parts = [];
    
    if (materials.flooring) parts.push(`Flooring: ${materials.flooring}`);
    if (materials.kitchen) parts.push(`Kitchen: ${materials.kitchen}`);
    if (materials.lighting) parts.push(`Lighting: ${materials.lighting}`);
    if (materials.paint) parts.push(`Paint: ${materials.paint}`);
    if (materials.furniture) parts.push(`Furniture: ${materials.furniture}`);
    
    return parts.join(', ');
  }
  
  return String(materials);
}

/**
 * Anonymize IP address for privacy compliance
 * @param {string} ipAddress - Full IP address
 * @returns {string} Anonymized IP address
 */
function anonymizeIpAddress(ipAddress) {
  if (!ipAddress) return '';
  
  const parts = ipAddress.split('.');
  if (parts.length === 4) {
    // Keep first 3 octets, mask the last one
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  
  return 'xxx.xxx.xxx.xxx';
}

/**
 * Initialize sheet headers if needed
 * @param {string} clientId - Client identifier
 * @returns {Object} Initialization result
 */
export async function initializeClientSheet(clientId) {
  try {
    const sheetConfig = SHEETS_CONFIG[clientId];
    if (!sheetConfig) {
      throw new Error(`No sheet configuration found for client: ${clientId}`);
    }

    const serviceAccountAuth = new JWT({
      email: sheetConfig.serviceAccountEmail,
      key: sheetConfig.privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const doc = new GoogleSpreadsheet(sheetConfig.spreadsheetId, serviceAccountAuth);
    await doc.loadInfo();

    let sheet = doc.sheetsByTitle[sheetConfig.worksheetName];
    if (!sheet) {
      sheet = await doc.addSheet({ 
        title: sheetConfig.worksheetName,
        headerValues: Object.values(LEAD_SCHEMA)
      });
    }

    return {
      success: true,
      sheetId: sheet.sheetId,
      title: sheet.title,
      rowCount: sheet.rowCount
    };

  } catch (error) {
    console.error('Sheet initialization error:', error);
    return {
      success: false,
      error: 'Failed to initialize sheet'
