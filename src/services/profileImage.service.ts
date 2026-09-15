import { supabase } from '../lib/supabase';
import { compressImage } from '../utils/media';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const PROFILE_IMAGE_ALLOWED_TYPES = ALLOWED_TYPES;
export const PROFILE_IMAGE_MAX_BYTES = MAX_FILE_SIZE;

export const validateProfileImageFile = (file: File): string | null => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Please choose a PNG, JPG, or WebP image.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Please choose an image smaller than 5 MB.';
  }
  return null;
};

/** Upload seller profile photo to marketplace-images under profiles/{ownerKey}/. */
export const uploadSellerProfileImage = async (file: File, ownerKey: string): Promise<string> => {
  const validationError = validateProfileImageFile(file);
  if (validationError) throw new Error(validationError);

  const prepared = await compressImage(file);
  const ext = prepared.name.split('.').pop() || 'jpg';
  const storagePath = `profiles/${ownerKey}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('marketplace-images')
    .upload(storagePath, prepared, { upsert: true, contentType: prepared.type || 'image/jpeg' });
  if (uploadError) throw new Error(uploadError.message || 'Profile photo upload failed.');

  return supabase.storage.from('marketplace-images').getPublicUrl(storagePath).data.publicUrl;
};
