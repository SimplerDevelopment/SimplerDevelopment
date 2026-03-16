import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { uploadToS3 } from '@/lib/s3/upload';
import { auth } from '@/lib/auth';
import sharp from 'sharp';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB default
const ALLOWED_TYPES = process.env.ALLOWED_FILE_TYPES?.split(',') || [];

export async function POST(request: NextRequest) {
  try {
    // const session = await auth();
    // if (!session?.user) {
    //   return NextResponse.json(
    //     { success: false, error: 'Unauthorized' },
    //     { status: 401 }
    //   );
    // }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const alt = formData.get('alt') as string | null;
    const caption = formData.get('caption') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (ALLOWED_TYPES.length > 0 && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `File type ${file.type} not allowed` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File size exceeds ${MAX_FILE_SIZE} bytes` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get image dimensions if it's an image
    let width: number | null = null;
    let height: number | null = null;

    if (file.type.startsWith('image/')) {
      try {
        const metadata = await sharp(buffer).metadata();
        width = metadata.width || null;
        height = metadata.height || null;
      } catch (error) {
        console.error('Error extracting image metadata:', error);
        // Continue without dimensions if extraction fails
      }
    }

    // Upload to S3
    const uploadResult = await uploadToS3(buffer, file.name, file.type);

    // Save to database
    const [newMedia] = await db
      .insert(media)
      .values({
        filename: file.name,
        storedFilename: uploadResult.storedFilename,
        mimeType: uploadResult.mimeType,
        fileSize: uploadResult.fileSize,
        url: uploadResult.url,
        width,
        height,
        alt: alt || null,
        caption: caption || null,
        // uploadedBy: parseInt(session.user.id as string),
      })
      .returning();

    return NextResponse.json(
      { success: true, data: newMedia },
      { status: 201 }
    );
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Upload failed' },
      { status: 500 }
    );
  }
}
