import crypto from 'node:crypto';

export function randomSeedToken(length = 64): string {
  return crypto.randomBytes(length / 2).toString('hex');
}
