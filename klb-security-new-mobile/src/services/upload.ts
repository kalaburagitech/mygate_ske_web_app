import { API_URL } from './api';

/**
 * Uploads an image to Convex File Storage via the web API.
 * 
 * Flow:
 * 1. Call POST /api/upload/generate-url to get a one-time Convex storage upload URL.
 * 2. Fetch the local image file from its URI.
 * 3. PUT the blob directly to the Convex upload URL.
 * 4. Return the storageId (assetId) from the response.
 *
 * @param uri - Local file URI of the image (from ImagePicker)
 * @returns storageId string (assetId) to store in the log record
 */
export async function uploadImage(uri: string): Promise<string> {
    try {
        const urlRes = await fetch(`${API_URL}/upload/generate-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!urlRes.ok) {
            const errorText = await urlRes.text();
            throw new Error(`Failed to get upload URL (${urlRes.status}): ${errorText}`);
        }

        const { uploadUrl } = await urlRes.json();
        if (!uploadUrl) {
            throw new Error('Upload URL not returned from server');
        }

        console.log(`[Upload] Got upload URL: ${uploadUrl.substring(0, 30)}...`);

        // Step 2: Fetch the image from the local URI
        const imageRes = await fetch(uri);
        const blob = await imageRes.blob();
        console.log(`[Upload] Blob created: ${blob.size} bytes, type: ${blob.type}`);

        // Step 3: POST the image blob directly to Convex storage (NOT PUT)
        // Convex expects a POST to the uploadUrl
        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'image/jpeg' },
            body: blob,
        });

        if (!uploadRes.ok) {
            const errorText = await uploadRes.text();
            throw new Error(`Image upload to storage failed (${uploadRes.status}): ${errorText}`);
        }

        const { storageId } = await uploadRes.json();
        if (!storageId) {
            throw new Error('storageId not returned from Convex storage');
        }

        return storageId;
    } catch (error: any) {
        console.error('[Upload] Error in uploadImage:', error);
        throw error;
    }
}

