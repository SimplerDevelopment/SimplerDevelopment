// Barrel: re-exports the entire DB schema. Consumers should keep importing
// from `@/lib/db/schema` (or `./schema`) and never reach in to the domain
// modules directly — the public surface is locked here.

export * from './auth';
export * from './sites';
export * from './cms';
export * from './crm';
export * from './pm';
export * from './brain';
export * from './store';
export * from './email';
export * from './surveys';
export * from './tools';
export * from './billing';
export * from './approvals';
export * from './audit';
export * from './chat';export * from './collab';
export * from './workflows';export * from './snapshots';
export * from './trigger-links';
