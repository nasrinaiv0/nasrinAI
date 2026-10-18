import { HttpError } from '../http/errors.js';

// Shared authorization primitives for provider adapters. Call these on the
// server for every operation; a client-supplied account/resource ID is never
// proof of ownership. Return 404 for mismatched ownership to avoid disclosing
// whether another user's connection exists.
export function requireIntegrationUser(caller) {
  if (caller?.actor?.type !== 'user' || typeof caller.userId !== 'string' || !caller.userId) {
    throw new HttpError(401, 'integration_sign_in_required', 'Sign in to connect and manage your accounts.');
  }
  if (typeof caller.tenantId !== 'string' || !caller.tenantId) {
    throw new HttpError(403, 'integration_access_denied', 'This account cannot manage integrations.');
  }
  return Object.freeze({ userId: caller.userId, tenantId: caller.tenantId });
}

export function assertIntegrationConnectionOwner(caller, connection) {
  const identity = requireIntegrationUser(caller);
  if (!connection || connection.userId !== identity.userId || connection.tenantId !== identity.tenantId) {
    throw new HttpError(404, 'integration_not_found', 'Connected account not found.');
  }
  return connection;
}

// Only safe metadata should be returned to clients. Provider adapters must
// explicitly map their own response to this shape rather than serializing rows.
export function publicIntegrationConnection(connection) {
  if (!connection || typeof connection !== 'object') {
    throw new TypeError('connection is required');
  }
  const allowed = ['id', 'provider', 'accountId', 'accountLabel', 'status', 'scopes', 'connectedAt', 'updatedAt'];
  const result = {};
  for (const key of allowed) {
    if (connection[key] !== undefined) result[key] = connection[key];
  }
  return result;
}
