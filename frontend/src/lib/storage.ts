import { supabase } from './supabase';

export type Bucket = 'shop-logos' | 'shop-photos' | 'barbers' | 'haircuts';

export function cropToAspect(file: File, ratio: number, maxW = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (sw / sh > ratio) { sw = sh * ratio; sx = (img.width - sw) / 2; } else { sh = sw / ratio; sy = (img.height - sh) / 2; }
      const w = Math.min(maxW, sw), h = Math.round(w / ratio);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível processar a imagem.'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => reject(new Error('Ficheiro de imagem inválido.'));
    img.src = url;
  });
}

export async function uploadImage(bucket: Bucket, shopId: string, file: File, ratio: number): Promise<string> {
  const blob = await cropToAspect(file, ratio);
  const path = `${shopId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
