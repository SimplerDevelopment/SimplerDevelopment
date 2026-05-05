/**
 * Service catalog + service-request AI tools.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { services, clientServices, serviceRequests } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const servicesTools: Anthropic.Tool[] = [
  {
    name: 'get_services_catalog',
    description: 'Get available services the client can subscribe to, with pricing and features.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_my_services',
    description: 'Get services the client is currently subscribed to.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'request_service',
    description: 'Submit a request for a service from the catalog. Only call AFTER the client confirms.',
    input_schema: {
      type: 'object' as const,
      properties: {
        service_id: { type: 'number', description: 'The service ID to request' },
        message: { type: 'string', description: 'Additional message or notes from client' },
      },
      required: ['service_id'],
    },
  },
];

export type ServicesHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const servicesHandlers: Record<string, ServicesHandler> = {
  get_services_catalog: async (_input, _clientId, _userId) => {
    const rows = await db.select({
      id: services.id,
      name: services.name,
      slug: services.slug,
      description: services.description,
      category: services.category,
      price: services.price,
      billingCycle: services.billingCycle,
      features: services.features,
    }).from(services).where(eq(services.active, true));

    return rows.map(s => ({
      ...s,
      priceDollars: (s.price / 100).toFixed(2),
    }));
  },

  get_my_services: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: clientServices.id,
      serviceId: clientServices.serviceId,
      status: clientServices.status,
      startDate: clientServices.startDate,
      renewalDate: clientServices.renewalDate,
      serviceName: services.name,
      serviceCategory: services.category,
      price: services.price,
      billingCycle: services.billingCycle,
    }).from(clientServices)
      .innerJoin(services, eq(services.id, clientServices.serviceId))
      .where(eq(clientServices.clientId, clientId));

    return rows.map(r => ({
      ...r,
      priceDollars: (r.price / 100).toFixed(2),
    }));
  },

  request_service: async (input, clientId, _userId) => {
    const serviceId = input.service_id as number;
    const message = input.message as string | undefined;

    const [svc] = await db.select().from(services)
      .where(and(eq(services.id, serviceId), eq(services.active, true))).limit(1);
    if (!svc) return { error: 'Service not found' };

    const [req] = await db.insert(serviceRequests).values({
      serviceId,
      clientId,
      message: message ?? null,
      status: 'pending',
    }).returning();

    return { success: true, requestId: req.id, message: `Request for "${svc.name}" submitted. The team will review it shortly.` };
  },
};
