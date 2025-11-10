import logger from "../logger";

export interface BlobImage {
  blob: Blob;
  mimeType: string;
}

export interface Base64Image {
  data: string;
  mimeType: string;
}

/**
 * Service for processing images
 */
export class ImageProcessingService {
  /**
   * Converts a Blob to base64 encoded string
   * @param blob - Blob to convert
   * @returns Base64 encoded string
   */
  async convertBlobToBase64(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString("base64");
  }

  /**
   * Converts an array of blob images to base64 encoded images
   * @param blobImages - Array of blob images
   * @returns Array of base64 encoded images
   */
  async convertBlobsToBase64(blobImages: BlobImage[]): Promise<Base64Image[]> {
    logger.info("Converting blob images to base64", {
      count: blobImages.length,
    });

    return Promise.all(
      blobImages.map(async (img) => ({
        data: await this.convertBlobToBase64(img.blob),
        mimeType: img.mimeType,
      }))
    );
  }
}
