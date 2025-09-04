// api/blob/upload.js
import { handleUpload } from '@vercel/blob/client';

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  return handleUpload({
    req, res,
    onBeforeGenerateToken: async () => ({
      access: 'public',
      addRandomSuffix: true,
      allowedContentTypes: ['application/zip'],
    }),
    onUploadCompleted: async ({ blob }) => {
      console.log('[blob uploaded]', {
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        pathname: blob.pathname,
        size: blob.size,
      });
    },
  });
}
