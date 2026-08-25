/**
 * Production startup configuration for Requisor
 * Handles proper environment setup and error handling
 */

import { config } from './config/environment';
import { logger } from './services/logger';

export function setupProductionEnvironment() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    logger.info('backend', 'Setting up production environment', {
      domain: config.urls.app,
      port: config.ports.server
    });
    
    // Ensure required environment variables are available
    const requiredVars = ['DATABASE_URL'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      logger.error('backend', 'Missing required environment variables', {
        missingVars
      });
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    logger.info('backend', 'Production environment setup complete');
  }
}

export function getProductionPort(): number {
  return parseInt(process.env.PORT || '80', 10);
}