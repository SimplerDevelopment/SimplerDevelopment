import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3/upload';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let fileBuffer: Buffer;
    let filename: string;
    let mimeType: string;

    // Handle multipart/form-data (regular file upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No file provided' },
          { status: 400 }
        );
      }

      // Debug: Log what we received
      console.log('Received file type:', typeof file);
      console.log('File instanceof Blob:', file instanceof Blob);
      console.log('File constructor:', file?.constructor?.name);

      // Handle both File and Blob objects
      if (file instanceof Blob) {
        filename = (file as File).name || `upload-${Date.now()}.png`;
        mimeType = file.type || 'image/png';
        const arrayBuffer = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
      } else if (typeof file === 'string') {
        // Handle if n8n sends base64 string directly
        filename = `upload-${Date.now()}.png`;
        mimeType = 'image/png';
        const base64Data = file.replace(/^data:[^;]+;base64,/, '');
        fileBuffer = Buffer.from(base64Data, 'base64');
      } else if (Buffer.isBuffer(file)) {
        // Handle if it's already a buffer
        filename = `upload-${Date.now()}.png`;
        mimeType = 'image/png';
        fileBuffer = file;
      } else {
        // Return detailed error for debugging
        const fileAny = file as any;
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid file format',
            debug: {
              type: typeof fileAny,
              constructor: fileAny?.constructor?.name,
              isBlob: fileAny instanceof Blob
            }
          },
          { status: 400 }
        );
      }
    }
    // Handle JSON with base64 data (for workflow integration)
    else if (contentType.includes('application/json')) {
      const body = await request.json();

      if (!body.data || !body.filename) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: data, filename' },
          { status: 400 }
        );
      }

      filename = body.filename;
      mimeType = body.mimeType || 'application/octet-stream';

      // Handle base64 data
      const base64Data = body.data.replace(/^data:[^;]+;base64,/, '');
      fileBuffer = Buffer.from(base64Data, 'base64');
    } else {
      return NextResponse.json(
        { success: false, error: 'Unsupported content type. Use multipart/form-data or application/json' },
        { status: 400 }
      );
    }

    // Upload to S3
    const result = await uploadToS3(fileBuffer, filename, mimeType);

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
        storedFilename: result.storedFilename,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      },
      { status: 500 }
    );
  }
}
