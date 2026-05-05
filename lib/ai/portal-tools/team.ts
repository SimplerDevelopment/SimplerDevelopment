/**
 * Team / profile / suggested-projects AI tools.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import {
  clientMembers, clients, users,
  suggestedProjects, suggestedProjectRequests,
} from '@/lib/db/schema';
import { eq, and, isNull, or } from 'drizzle-orm';

export const teamTools: Anthropic.Tool[] = [
  {
    name: 'get_suggested_projects',
    description: 'Get suggested projects the client can request (pre-built project templates).',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_my_team',
    description: 'Get all team members with their roles for this client account.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_my_profile',
    description: 'Get the current user profile and client account details.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'request_suggested_project',
    description: 'Submit a request for a suggested project. Only call AFTER the client confirms.',
    input_schema: {
      type: 'object' as const,
      properties: {
        suggested_project_id: { type: 'number', description: 'The suggested project ID' },
        message: { type: 'string', description: 'Additional message or notes from client' },
      },
      required: ['suggested_project_id'],
    },
  },
  {
    name: 'update_profile',
    description: 'Update the client profile (name, company, phone, website, address). Only update fields the client explicitly asked to change. Confirm first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Full name' },
        company: { type: 'string', description: 'Company name' },
        phone: { type: 'string', description: 'Phone number' },
        website: { type: 'string', description: 'Website URL' },
        address: { type: 'string', description: 'Address' },
      },
      required: [],
    },
  },
  {
    name: 'invite_team_member',
    description: 'Invite a new team member to the client account. Only call AFTER the client confirms name, email, and role.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Full name of the new member' },
        email: { type: 'string', description: 'Email address' },
        role: { type: 'string', enum: ['admin', 'member', 'viewer'], description: 'Role to assign' },
      },
      required: ['name', 'email', 'role'],
    },
  },
];

export type TeamHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const teamHandlers: Record<string, TeamHandler> = {
  get_suggested_projects: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: suggestedProjects.id,
      title: suggestedProjects.title,
      description: suggestedProjects.description,
      category: suggestedProjects.category,
      estimatedPrice: suggestedProjects.estimatedPrice,
      estimatedTimeline: suggestedProjects.estimatedTimeline,
      features: suggestedProjects.features,
      icon: suggestedProjects.icon,
    }).from(suggestedProjects)
      .where(and(
        eq(suggestedProjects.active, true),
        or(isNull(suggestedProjects.clientId), eq(suggestedProjects.clientId, clientId)),
      ))
      .orderBy(suggestedProjects.order);

    return rows.map(p => ({
      ...p,
      estimatedPriceDollars: p.estimatedPrice ? (p.estimatedPrice / 100).toFixed(2) : 'Quote on request',
    }));
  },

  get_my_team: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: clientMembers.id,
      role: clientMembers.role,
      createdAt: clientMembers.createdAt,
      userName: users.name,
      userEmail: users.email,
      userId: users.id,
    }).from(clientMembers)
      .innerJoin(users, eq(users.id, clientMembers.userId))
      .where(eq(clientMembers.clientId, clientId));
    return rows;
  },

  get_my_profile: async (_input, clientId, _userId) => {
    const [client] = await db.select({
      id: clients.id,
      company: clients.company,
      phone: clients.phone,
      website: clients.website,
      address: clients.address,
      userName: users.name,
      userEmail: users.email,
    }).from(clients)
      .innerJoin(users, eq(users.id, clients.userId))
      .where(eq(clients.id, clientId)).limit(1);
    return client ?? { error: 'Profile not found' };
  },

  request_suggested_project: async (input, clientId, _userId) => {
    const suggestedProjectId = input.suggested_project_id as number;
    const message = input.message as string | undefined;

    const [sp] = await db.select().from(suggestedProjects)
      .where(and(eq(suggestedProjects.id, suggestedProjectId), eq(suggestedProjects.active, true))).limit(1);
    if (!sp) return { error: 'Suggested project not found' };

    const [req] = await db.insert(suggestedProjectRequests).values({
      suggestedProjectId,
      clientId,
      message: message ?? null,
      status: 'pending',
    }).returning();

    return { success: true, requestId: req.id, message: `Request for "${sp.title}" submitted. The team will review it shortly.` };
  },

  update_profile: async (input, clientId, _userId) => {
    const { name, company, phone, website, address } = input as {
      name?: string; company?: string; phone?: string; website?: string; address?: string;
    };

    // Update user name if provided
    if (name) {
      const [client] = await db.select({ userId: clients.userId })
        .from(clients).where(eq(clients.id, clientId)).limit(1);
      if (client) {
        await db.update(users).set({ name, updatedAt: new Date() })
          .where(eq(users.id, client.userId));
      }
    }

    // Update client fields if provided
    const clientUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (company !== undefined) clientUpdate.company = company;
    if (phone !== undefined) clientUpdate.phone = phone;
    if (website !== undefined) clientUpdate.website = website;
    if (address !== undefined) clientUpdate.address = address;

    await db.update(clients).set(clientUpdate)
      .where(eq(clients.id, clientId));

    return { success: true, message: 'Profile updated.' };
  },

  invite_team_member: async (input, clientId, userId) => {
    const name = input.name as string;
    const email = input.email as string;
    const role = input.role as string;

    // Check if user already exists
    let [existingUser] = await db.select().from(users)
      .where(eq(users.email, email)).limit(1);

    if (!existingUser) {
      // Create a new user with a temporary password (they'll need to set it up)
      const bcrypt = await import('bcryptjs');
      const tempPassword = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
      [existingUser] = await db.insert(users).values({
        name,
        email,
        password: tempPassword,
        role: 'client',
      }).returning();
    }

    // Check if already a member
    const [existing] = await db.select().from(clientMembers)
      .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, existingUser.id))).limit(1);
    if (existing) return { error: `${email} is already a team member.` };

    await db.insert(clientMembers).values({
      clientId,
      userId: existingUser.id,
      role,
      invitedBy: userId,
    });

    return { success: true, message: `${name} (${email}) invited as ${role}.` };
  },
};
