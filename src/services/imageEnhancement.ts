export type EnhanceImageOptions = {
  productCategory?: string | null;
};

export async function enhanceImageClientSide(
  productId: string,
  originalImageUrl: string,
  options: EnhanceImageOptions = {}
): Promise<string> {
  const { supabase } = await import('../lib/supabase');
  const body: Record<string, string> = {
    productId,
    originalImageUrl,
  };

  if (options.productCategory && options.productCategory.trim()) {
    body.productCategory = options.productCategory.trim();
  }

  const { data, error } = await supabase.functions.invoke('enhance-image', { body });

  if (error) {
    throw new Error(error.message || 'Image enhancement failed. Please try again.');
  }

  if (data?.error && typeof data.error === 'string') {
    throw new Error(data.error);
  }

  if (!data?.enhancedImageUrl || typeof data.enhancedImageUrl !== 'string') {
    throw new Error('Image enhancement service returned no image URL.');
  }

  return data.enhancedImageUrl;
}
