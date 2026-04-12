/**
 * Upstream Python / face-recognition service (ngrok, LAN IP, or hosted URL).
 * Set FACE_RECOGNITION_UPSTREAM_URL in `.env.local`, e.g. https://xxxx.ngrok-free.dev/api
 */
export function getFaceUpstreamBase(): string {
    const raw =
        process.env.FACE_RECOGNITION_UPSTREAM_URL ||
        "https://rawly-unmeditative-isaura.ngrok-free.dev/api";
    return raw.replace(/\/$/, "");
}

export const faceNgrokHeaders: HeadersInit = {
    "ngrok-skip-browser-warning": "true",
};
