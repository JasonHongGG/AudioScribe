export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
export const SUPPORTED_MEDIA_EXTENSIONS = ['.mp3', '.wav', '.mp4', '.mkv', '.ogg', '.flac', '.m4a'];

export function isVideoPath(path: string): boolean {
    const normalized = path.toLowerCase();
    return VIDEO_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function isSupportedMediaPath(path: string): boolean {
    const normalized = path.toLowerCase();
    return SUPPORTED_MEDIA_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function getFileNameFromPath(path: string): string {
    return path.split(/[/\\]/).pop() || 'Unknown File';
}