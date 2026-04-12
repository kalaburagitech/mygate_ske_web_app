import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Downscale and recompress visit photos before upload to cut storage and load time.
 * Keeps aspect ratio; max width/height MAX_EDGE px.
 */
export async function prepareVisitPhotoForUpload(localUri: string): Promise<string> {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(
            localUri,
            (w, h) => resolve({ width: w, height: h }),
            (e) => reject(e)
        );
    });

    const maxDim = Math.max(width, height);
    const actions: ImageManipulator.Action[] = [];
    if (maxDim > MAX_EDGE) {
        const scale = MAX_EDGE / maxDim;
        actions.push({
            resize: {
                width: Math.max(1, Math.round(width * scale)),
                height: Math.max(1, Math.round(height * scale)),
            },
        });
    }

    const result = await ImageManipulator.manipulateAsync(
        localUri,
        actions,
        { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
}
