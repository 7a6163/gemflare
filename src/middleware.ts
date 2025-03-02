import { Context, Next } from 'hono';
import { CloudflareBindings } from './types';
import { verifyPassword } from './utils';
import { getCookie } from 'hono/cookie';

// Basic authentication middleware
export async function basicAuth(c: Context<{ Bindings: CloudflareBindings }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return unauthorized(c);
  }
  
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = atob(base64Credentials);
  const [username, password] = credentials.split(':');
  
  // Check against admin credentials
  if (username === c.env.ADMIN_USERNAME) {
    const isValid = await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH);
    if (isValid) {
      return next();
    }
  }
  
  return unauthorized(c);
}

// JWT authentication middleware (for web UI)
export async function jwtAuth(c: Context<{ Bindings: CloudflareBindings }>, next: Next) {
  const token = getCookie(c, 'auth_token');
  
  if (!token) {
    return c.redirect('/login');
  }
  
  try {
    // In a real implementation, you would verify the JWT token
    // This is a simplified version
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    if (payload.exp < Date.now() / 1000) {
      return c.redirect('/login');
    }
    
    c.set('user', payload);
    return next();
  } catch (e) {
    return c.redirect('/login');
  }
}

// Helper function for unauthorized responses
function unauthorized(c: Context) {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="GemFlare"'
    }
  });
}
