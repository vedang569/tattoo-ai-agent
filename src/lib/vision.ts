import vision from '@google-cloud/vision';

const client = new vision.ImageAnnotatorClient();

export async function verifyPaymentScreenshot(imageUrl: string): Promise<boolean> {
  try {
    const [result] = await client.textDetection(imageUrl);
    const detections = result.textAnnotations;
    if (!detections || detections.length === 0) return false;
    const fullText = detections[0].description?.toLowerCase() || "";
    const keywords = ['success', 'paid', 'transaction', 'completed', 'received', 'utr', 'reference'];
    return keywords.some(word => fullText.includes(word));
  } catch (error) {
    console.error("OCR Error:", error);
    return false;
  }
}