export async function enhanceImageClientSide(productId: string, originalImageUrl: string): Promise<string> {
  const { supabase } = await import('../lib/supabase');
  const { data, error } = await supabase.functions.invoke('enhance-image', {
    body: {
      productId,
      originalImageUrl,
    },
  });

  if (error) {
    throw new Error(error.message || 'Image enhancement failed. Please try again.');
  }

  if (!data?.enhancedImageUrl) {
    throw new Error('Image enhancement service returned no image URL.');
  }

  return data.enhancedImageUrl as string;
}
