/**
 * Validation utilities for forms and inputs
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate an amount
 */
export function validateAmount(amount: string, max?: number): ValidationResult {
  if (!amount || amount.trim() === '') {
    return { valid: false, error: 'Amount is required' };
  }

  const num = Number.parseFloat(amount);
  
  if (Number.isNaN(num)) {
    return { valid: false, error: 'Amount must be a valid number' };
  }

  if (num <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  if (max !== undefined && num > max) {
    return { valid: false, error: `Amount cannot exceed ${max}` };
  }

  return { valid: true };
}

/**
 * Validate a blockchain address
 */
export function validateAddress(address: string): ValidationResult {
  if (!address || address.trim() === '') {
    return { valid: false, error: 'Address is required' };
  }

  // Basic validation - adjust for your specific address format
  if (address.length < 26 || address.length > 62) {
    return { valid: false, error: 'Invalid address length' };
  }

  if (!/^[a-zA-Z0-9]+$/.test(address)) {
    return { valid: false, error: 'Address contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate a transaction hash
 */
export function validateTxHash(hash: string): ValidationResult {
  if (!hash || hash.trim() === '') {
    return { valid: false, error: 'Transaction hash is required' };
  }

  if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
    return { valid: false, error: 'Invalid transaction hash format' };
  }

  return { valid: true };
}

/**
 * Validate a block height
 */
export function validateBlockHeight(height: string): ValidationResult {
  if (!height || height.trim() === '') {
    return { valid: false, error: 'Block height is required' };
  }

  const num = Number.parseInt(height, 10);
  
  if (Number.isNaN(num)) {
    return { valid: false, error: 'Block height must be a number' };
  }

  if (num < 0) {
    return { valid: false, error: 'Block height cannot be negative' };
  }

  return { valid: true };
}

/**
 * Validate an email address
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim() === '') {
    return { valid: false, error: 'Email is required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true };
}

/**
 * Validate a password
 */
export function validatePassword(password: string, minLength: number = 8): ValidationResult {
  if (!password) {
    return { valid: false, error: 'Password is required' };
  }

  if (password.length < minLength) {
    return { valid: false, error: `Password must be at least ${minLength} characters` };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  return { valid: true };
}

/**
 * Validate a URL
 */
export function validateUrl(url: string): ValidationResult {
  if (!url || url.trim() === '') {
    return { valid: false, error: 'URL is required' };
  }

  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate a port number
 */
export function validatePort(port: string): ValidationResult {
  const num = Number.parseInt(port, 10);
  
  if (Number.isNaN(num)) {
    return { valid: false, error: 'Port must be a number' };
  }

  if (num < 1 || num > 65535) {
    return { valid: false, error: 'Port must be between 1 and 65535' };
  }

  return { valid: true };
}
