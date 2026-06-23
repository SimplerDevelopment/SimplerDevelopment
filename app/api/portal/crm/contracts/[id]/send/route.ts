import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmContracts, crmContractSigners } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { resend } from '@/lib/email';
import crypto from 'crypto';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'esign' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { id } = await params;
  const contractId = parseInt(id, 10);

  const [contract] = await db.select().from(crmContracts)
    .where(and(eq(crmContracts.id, contractId), eq(crmContracts.clientId, client.id)));

  if (!contract) return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });
  if (contract.status !== 'draft' && contract.status !== 'sent') {
    return NextResponse.json({ success: false, message: 'Contract cannot be sent in its current state' }, { status: 400 });
  }

  const signers = await db.select().from(crmContractSigners)
    .where(eq(crmContractSigners.contractId, contractId));

  if (signers.length === 0) {
    return NextResponse.json({ success: false, message: 'Add at least one signer before sending' }, { status: 400 });
  }

  // Generate document hash for tamper detection
  const contentToHash = JSON.stringify({ clauses: contract.clauses, lineItems: contract.lineItems, fees: contract.fees });
  const documentHash = crypto.createHash('sha256').update(contentToHash).digest('hex');

  // Update contract status
  await db.update(crmContracts).set({
    status: 'sent',
    sentAt: new Date(),
    documentHash,
    updatedAt: new Date(),
  }).where(eq(crmContracts.id, contractId));

  // Send signing emails to each signer
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://simplerdevelopment.com';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com';

  for (const signer of signers) {
    const signingUrl = `${baseUrl}/contract/${signer.token}`;
    try {
      await resend.emails.send({
        from: `${client.company || 'Simpler Development'} <${fromEmail}>`,
        to: signer.email,
        subject: `Contract for your signature: ${contract.title}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
            <div style="padding:32px;background:#f8fafc;border-bottom:1px solid #e2e8f0;text-align:center;">
              <h1 style="margin:0;font-size:22px;color:#0f172a;">Contract Ready for Signature</h1>
            </div>
            <div style="padding:32px;">
              <p style="color:#334155;">Hi ${signer.name},</p>
              <p style="color:#334155;">${client.company || 'We'} have sent you a contract to review and sign:</p>
              <div style="background:#f1f5f9;border-radius:8px;padding:20px;margin:24px 0;">
                <p style="margin:0;font-weight:600;color:#0f172a;">${contract.title}</p>
                ${contract.summary ? `<p style="margin:8px 0 0;color:#64748b;font-size:14px;">${contract.summary}</p>` : ''}
              </div>
              <a href="${signingUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Review & Sign</a>
              <p style="margin-top:24px;font-size:13px;color:#94a3b8;">This link is unique to you. Do not share it.</p>
            </div>
          </div>
        `,
      });
    } catch (err) {
      console.error(`[contracts/send] Failed to email ${signer.email}:`, err);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      status: 'sent',
      contractUrl: `${baseUrl}/contract/${contract.clientToken}`,
      signerCount: signers.length,
    },
  });
}
