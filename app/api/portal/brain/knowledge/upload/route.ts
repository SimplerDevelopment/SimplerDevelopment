import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { createNote } from '@/lib/brain/notes';
import { uploadToS3 } from '@/lib/s3/upload';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB

/**
 * POST /api/portal/brain/knowledge/upload
 *
 * Multipart endpoint that uploads a file to S3 and creates a brain_note in
 * one shot. The note can carry the usual metadata (title, body, tags,
 * relationship link) — title defaults to the filename if omitted.
 */
export async function POST(request: Request) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  let formData: globalThis.FormData;
  try {
    formData = (await request.formData()) as unknown as globalThis.FormData;
  } catch {
    return NextResponse.json({ success: false, message: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ success: false, message: 'File is empty' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({
      success: false,
      message: `File exceeds ${Math.round(MAX_FILE_SIZE / 1048576)}MB limit`,
    }, { status: 400 });
  }

  const titleField = formData.get('title');
  const bodyField = formData.get('body');
  const tagsField = formData.get('tags');
  const confidentialityField = formData.get('confidentialityLevel');
  const pinnedField = formData.get('pinned');
  const relationshipOverlayIdField = formData.get('relationshipOverlayId');
  const meetingIdField = formData.get('meetingId');
  const companyIdField = formData.get('companyId');
  const dealIdField = formData.get('dealId');
  const contactIdField = formData.get('contactId');

  // Title falls back to the filename — that's almost always what users want
  // when they just drag-drop a file in.
  const title = (typeof titleField === 'string' && titleField.trim())
    ? titleField.trim()
    : file.name;

  let tags: string[] = [];
  if (typeof tagsField === 'string' && tagsField.trim()) {
    try {
      const parsed = JSON.parse(tagsField);
      if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
    } catch {
      // tolerate comma-separated as a fallback
      tags = tagsField.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let uploadResult;
  try {
    uploadResult = await uploadToS3(buffer, file.name, file.type || 'application/octet-stream');
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? `Upload failed: ${err.message}` : 'Upload failed',
    }, { status: 500 });
  }

  const note = await createNote({
    clientId: result.client.id,
    title,
    body: typeof bodyField === 'string' ? bodyField : '',
    tags,
    confidentialityLevel: typeof confidentialityField === 'string' && ['standard', 'restricted', 'confidential'].includes(confidentialityField)
      ? (confidentialityField as 'standard' | 'restricted' | 'confidential')
      : 'standard',
    pinned: pinnedField === 'true',
    relationshipOverlayId: typeof relationshipOverlayIdField === 'string' ? parseInt(relationshipOverlayIdField, 10) || null : null,
    meetingId: typeof meetingIdField === 'string' ? parseInt(meetingIdField, 10) || null : null,
    companyId: typeof companyIdField === 'string' ? parseInt(companyIdField, 10) || null : null,
    dealId: typeof dealIdField === 'string' ? parseInt(dealIdField, 10) || null : null,
    contactId: typeof contactIdField === 'string' ? parseInt(contactIdField, 10) || null : null,
    source: 'document_import',
    attachmentUrl: uploadResult.url,
    attachmentFilename: file.name,
    attachmentMimeType: uploadResult.mimeType,
    attachmentFileSize: uploadResult.fileSize,
    attachmentStoredKey: uploadResult.storedFilename,
    createdBy: result.userId,
  });

  return NextResponse.json({ success: true, data: note }, { status: 201 });
}
