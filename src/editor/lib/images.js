const MAX_SIDE = 2400; // pixels, for the longest side
const ACCEPTED = /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/;

export async function prepareImage(file) {
    if (!ACCEPTED.test(file.type) && !/\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name)) {
        throw new Error('not-an-image');
    }
    // Redrawing a GIF on a canvas would keep only its first frame, losing any animation.
    if (file.type === 'image/gif') return file;

    // Decode the file into pixels the browser can draw.
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        throw new Error('unreadable');
    }

    // Scale down (never up) so the longest side is at most MAX_SIDE.
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    
    // Draw it onto an off-screen canvas at the new size...
    const canvas = document.createElement('canvas');
    canvas.width = width;  canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    
    // ...and export the canvas as WebP at 86% quality. Some older Safari versions can't
    // make WebP and quietly return a PNG instead; in that case use JPEG.
    let blob = await toBlob(canvas, 'image/webp', 0.86);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.88);
    if (!blob) throw new Error('unreadable');
    
    // A small JPEG/WebP that came out bigger after re-encoding: keep the original.
    if (scale === 1 && /^image\/(jpeg|webp)$/.test(file.type) && file.size <= blob.size) return file;
    
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    // Keep the original name (the server uses it for the final file name), new extension.
    return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.' + ext, { type: blob.type });
}
