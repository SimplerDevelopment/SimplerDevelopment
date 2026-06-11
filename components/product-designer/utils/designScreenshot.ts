import html2canvas from 'html2canvas';

// Supabase removed in sd2026 port — uploads will be wired to sd2026 storage in a later wave.
// TODO(designer): wire screenshot uploads to /api/storefront/{siteId}/uploads (Wave 1C).
const supabase: any = null;

export interface DesignScreenshotResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
  fileName?: string;
}

/**
 * Captures a screenshot of the design canvas and uploads it to Supabase
 * @param designId - The ID of the design being saved
 * @param designName - The name of the design
 * @returns Promise with the result containing the uploaded image URL
 */
export const captureAndUploadDesignScreenshot = async (
  designId: number | null,
  designName: string
): Promise<DesignScreenshotResult> => {
  try {
    // Check if Supabase is configured
    if (!supabase) {
      return {
        success: false,
        error: 'Screenshot upload is not yet wired in sd2026; will be implemented in Wave 1C.'
      };
    }

    // Find the main design canvas element
    const canvasElement = document.getElementById('productEditorMainView');

    if (!canvasElement) {
      return {
        success: false,
        error: 'Design canvas element not found. Cannot capture screenshot.'
      };
    }

    // Configure html2canvas options for better quality
    const html2canvasOptions = {
      allowTaint: true,
      useCORS: true,
      scale: 2, // Higher resolution for better quality
      backgroundColor: '#ffffff',
      width: canvasElement.scrollWidth,
      height: canvasElement.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      // Exclude UI elements that shouldn't be in the screenshot
      ignoreElements: (element: Element) => {
        return element.classList.contains('ignore-screenshot') ||
               element.classList.contains('selection-box') ||
               element.classList.contains('layer-controls');
      }
    };

    // Capture the design canvas
    console.log('Capturing design screenshot...');
    const canvas = await html2canvas(canvasElement, html2canvasOptions);

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          throw new Error('Failed to convert canvas to blob');
        }
      }, 'image/png', 0.9);
    });

    // Generate filename with timestamp and design info
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = designName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const fileName = `design-screenshots/${designId || 'new'}_${sanitizedName}_${timestamp}.png`;

    console.log('Uploading screenshot to Supabase...');

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('products')
      .upload(fileName, blob, {
        contentType: 'image/png',
        cacheControl: '3600'
      });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    // Get the public URL for the uploaded image
    const { data: urlData } = supabase.storage
      .from('products')
      .getPublicUrl(fileName);

    const imageUrl = urlData.publicUrl;

    console.log('Design screenshot uploaded successfully:', imageUrl);

    return {
      success: true,
      imageUrl,
      fileName
    };

  } catch (error) {
    console.error('Error capturing and uploading design screenshot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred while capturing screenshot'
    };
  }
};

/**
 * Captures a screenshot of the design canvas without uploading
 * Useful for preview or local storage purposes
 * @returns Promise with the canvas data URL
 */
export const captureDesignScreenshot = async (): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
  try {
    const canvasElement = document.getElementById('productEditorMainView');

    if (!canvasElement) {
      return {
        success: false,
        error: 'Design canvas element not found. Cannot capture screenshot.'
      };
    }

    const html2canvasOptions = {
      allowTaint: true,
      useCORS: true,
      scale: 1.5,
      backgroundColor: '#ffffff',
      width: canvasElement.scrollWidth,
      height: canvasElement.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (element: Element) => {
        return element.classList.contains('ignore-screenshot') ||
               element.classList.contains('selection-box') ||
               element.classList.contains('layer-controls');
      }
    };

    const canvas = await html2canvas(canvasElement, html2canvasOptions);
    const dataUrl = canvas.toDataURL('image/png', 0.9);

    return {
      success: true,
      dataUrl
    };

  } catch (error) {
    console.error('Error capturing design screenshot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred while capturing screenshot'
    };
  }
};