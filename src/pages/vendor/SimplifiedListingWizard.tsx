import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Loader2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Eyebrow, Field, ImageFrame, StatusLabel } from '../../components/DesignSystem';
import { ConversationalCataloger } from '../../components/ConversationalCataloger';
import { useAuth } from '../../auth/useAuthHook';
import { supabase } from '../../lib/supabase';
import { enhanceImageClientSide } from '../../services/imageEnhancement';
import { ProductData } from '../../services/listingConversation';
import { ConversationState } from '../../types/catalogConversation';
import { MarketplaceProduct, getProductImage } from '../../types/marketplace';
import { compressImage } from '../../utils/media';

type WizardStep = 1 | 2 | 3 | 4 | 5;
type DraftProduct = MarketplaceProduct & { conversation_state?: Partial<ConversationState>; catalog_status?: string };

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const SimplifiedListingWizard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<WizardStep>(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [enhancedImageUrl, setEnhancedImageUrl] = useState<string | null>(null);
  const [enhancementStatus, setEnhancementStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [extractedData, setExtractedData] = useState<ProductData>({ title: '', material: '', raw_description: '', quantity: 1 });
  const [conversationState, setConversationState] = useState<Partial<ConversationState>>({});
  const [finalPrice, setFinalPrice] = useState('');
  const [pendingDraft, setPendingDraft] = useState<DraftProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const checkExistingDraft = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error: fetchError } = await supabase.from('products').select('*').eq('vendor_id', user.id).eq('status', 'draft').order('created_at', { ascending: false }).limit(1);
      if (fetchError) throw fetchError;
      if (data?.[0]) setPendingDraft(data[0] as DraftProduct);
    } catch {
      // A missing draft should not interrupt starting a new listing.
    }
  }, [user]);

  useEffect(() => { void checkExistingDraft(); }, [checkExistingDraft]);

  const resumeDraft = (draft: DraftProduct) => {
    setDraftId(draft.id);
    setCapturedImage(getProductImage(draft));
    setConversationState(draft.conversation_state || {});
    setExtractedData({
      title: draft.title || draft.title_en || '',
      material: draft.material || '',
      raw_description: draft.raw_description || draft.description_en || '',
      quantity: draft.quantity || draft.stock_count || 1,
      material_cost: draft.material_cost || undefined,
      labour_days: draft.labour_days || undefined,
    });
    setFinalPrice(draft.final_price?.toString() || '');
    setPendingDraft(null);
    setStep(draft.conversation_state ? 3 : 2);
  };

  const startNew = () => {
    setPendingDraft(null);
    setDraftId(null);
    setCapturedImage(null);
    setExtractedData({ title: '', material: '', raw_description: '', quantity: 1 });
    setConversationState({});
  };

  const selectImage = async (file: File) => {
    setError('');
    setSuccess('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please choose a PNG, JPG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Please choose an image smaller than 5 MB.');
      return;
    }
    setCapturedImage(URL.createObjectURL(file));
    if (!user) {
      setError('Please sign in before creating a listing.');
      return;
    }
    setLoading(true);
    try {
      const id = draftId || crypto.randomUUID();
      const compressed = await compressImage(file);
      const extension = compressed.name.split('.').pop() || 'jpg';
      const path = `originals/${user.id}/${id}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('marketplace-images').upload(path, compressed, { upsert: true });
      if (uploadError) throw uploadError;
      const imageUrl = supabase.storage.from('marketplace-images').getPublicUrl(path).data.publicUrl;
      const { error: draftError } = await supabase.from('products').upsert([{
        id,
        vendor_id: user.id,
        original_image_url: imageUrl,
        studio_image_url: imageUrl,
        title: 'Draft product',
        status: 'draft',
        updated_at: new Date().toISOString(),
      }]);
      if (draftError) throw draftError;
      setDraftId(id);
      setCapturedImage(imageUrl);
      setSuccess('Photo saved. Add a few notes about the piece.');
      setStep(2);
    } catch {
      setError('The photo could not be saved. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const improvePhoto = async () => {
    if (!draftId || !capturedImage) return;
    setEnhancementStatus('processing');
    setError('');
    try {
      const url = await enhanceImageClientSide(draftId, capturedImage);
      setEnhancedImageUrl(url);
      setEnhancementStatus('completed');
    } catch {
      setEnhancementStatus('failed');
      setError('The photo could not be improved. You can continue with the original.');
    }
  };

  const saveImageChoice = async (url: string) => {
    if (!draftId) return;
    const { error: updateError } = await supabase.from('products').update({ studio_image_url: url }).eq('id', draftId);
    if (updateError) {
      setError('The selected image could not be saved.');
      return;
    }
    setCapturedImage(url);
    setEnhancedImageUrl(null);
    setStep(2);
  };

  const updateDraft = async (status: 'draft' | 'pending_review') => {
    if (!draftId) return;
    setLoading(true);
    try {
      const { error: updateError } = await supabase.from('products').update({
        title: extractedData.title || 'Draft product',
        material: extractedData.material || null,
        raw_description: extractedData.raw_description || null,
        quantity: extractedData.quantity || 1,
        material_cost: extractedData.material_cost || null,
        labour_days: extractedData.labour_days || null,
        final_price: finalPrice ? Number(finalPrice) : null,
        status,
        updated_at: new Date().toISOString(),
      }).eq('id', draftId);
      if (updateError) throw updateError;
      if (status === 'pending_review') {
        setSuccess('Your listing has been submitted for review.');
        setTimeout(() => navigate('/vendor/dashboard'), 900);
      } else {
        setSuccess('Draft saved.');
      }
    } catch {
      setError('Your changes could not be saved.');
    } finally {
      setLoading(false);
    }
  };

  const updateFromConversation = (state: ConversationState) => {
    setConversationState(state);
    setExtractedData({
      title: state.productName || '',
      material: state.material || '',
      raw_description: state.description || '',
      quantity: state.quantity || 1,
      material_cost: state.materialCost || undefined,
      labour_days: state.labourDays || undefined,
    });
  };

  return (
    <div className="listing-wizard mx-auto max-w-5xl px-6 pb-28 pt-12 lg:px-10 lg:pt-20">
      <header className="workspace-header grid gap-8 border-b border-stone-300 pb-8 lg:grid-cols-[1fr_0.6fr] lg:items-end">
        <div><Eyebrow>New piece</Eyebrow><h1 className="mt-4 font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">Bring it to life.</h1></div>
        <p className="max-w-xs text-sm leading-7 text-stone-600 lg:justify-self-end">A photograph, your words, and a little time. We will help shape the details.</p>
      </header>

      <div className="wizard-steps flex flex-wrap gap-6 border-b border-stone-300 py-6">
        {['Add product', 'Describe', 'Review', 'Set price', 'Submit'].map((label, index) => <span key={label} className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${step === index + 1 ? 'text-stone-950' : step > index + 1 ? 'text-forest' : 'text-stone-400'}`}>0{index + 1} · {label}</span>)}
      </div>

      {pendingDraft && !draftId && (
        <div className="border-b border-stone-300 py-8"><Eyebrow>Saved draft</Eyebrow><h2 className="mt-3 font-display text-3xl">Continue where you left off?</h2><div className="mt-5 flex gap-5"><Button onClick={() => resumeDraft(pendingDraft)}>Continue draft</Button><Button variant="text" onClick={startNew}>Start a new piece</Button></div></div>
      )}
      {error && <p className="border-b border-stone-300 py-5 text-sm text-red-700">{error}</p>}
      {success && <p className="border-b border-stone-300 py-5 text-sm text-forest">{success}</p>}

      <div className="py-12">
        {step === 1 && (
          <section className="grid gap-12 lg:grid-cols-[0.8fr_1fr]">
            <div><Eyebrow>Add product</Eyebrow><h2 className="mt-4 font-display text-5xl leading-none">Start with an image.</h2><p className="mt-5 max-w-sm text-sm leading-7 text-stone-600">Use natural light when you can. One clear photograph is enough to begin.</p></div>
            <label className="upload-well flex min-h-96 cursor-pointer items-center justify-center border border-dashed border-stone-400 bg-stone-100 p-8 text-center hover:border-stone-950">{loading ? <Loader2 className="h-6 w-6 animate-spin text-stone-600" /> : <span className="space-y-4"><Upload className="mx-auto h-6 w-6 text-stone-600" strokeWidth={1.5} /><span className="block text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">Choose a photograph</span><span className="block text-xs text-stone-500">JPG, PNG, WebP, or GIF · 5 MB maximum</span></span>}<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void selectImage(file); }} className="hidden" /></label>
          </section>
        )}
        {step === 2 && draftId && (
          <section className="listing-conversation grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6"><ImageFrame src={enhancedImageUrl || capturedImage} alt="Product preview" label="Your piece" className="aspect-[4/3]" />{enhancementStatus === 'completed' && enhancedImageUrl ? <div className="flex gap-5"><Button variant="light" onClick={() => void saveImageChoice(capturedImage || '')}>Keep original</Button><Button onClick={() => void saveImageChoice(enhancedImageUrl)}>Use improved image</Button></div> : <button type="button" onClick={() => void improvePhoto()} disabled={enhancementStatus === 'processing'} className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-950">{enhancementStatus === 'processing' ? 'Improving image' : 'Improve image'}</button>}</div>
            <div><Eyebrow>Describe</Eyebrow><h2 className="mt-4 font-display text-5xl leading-none">Tell us about it.</h2><p className="mt-5 mb-8 max-w-md text-sm leading-7 text-stone-600">Speak or write naturally. The catalog notes will remain editable.</p><ConversationalCataloger productId={draftId} selectedLanguage="en" productImageUrl={capturedImage} initialConversationState={conversationState} initialAssistantMessage="What would you like people to know about this piece?" onConversationUpdate={updateFromConversation} onComplete={updateFromConversation} /><div className="mt-8 flex gap-5"><Button variant="light" onClick={() => setStep(1)}>Back</Button><Button disabled={!conversationState.conversationComplete} onClick={() => setStep(3)} className="flex-1 justify-between">Review <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></Button></div></div>
          </section>
        )}
        {step === 3 && (
          <section className="max-w-3xl"><Eyebrow>Review</Eyebrow><h2 className="mt-4 font-display text-5xl leading-none">Make it yours.</h2><div className="mt-10 border-y border-stone-300 py-6"><Field label="Product name" value={extractedData.title || ''} onChange={(event) => setExtractedData((data) => ({ ...data, title: event.target.value }))} placeholder="Name this piece" required /><div className="mt-8"><Field label="Material" value={extractedData.material || ''} onChange={(event) => setExtractedData((data) => ({ ...data, material: event.target.value }))} placeholder="What is it made from?" /></div><div className="mt-8"><Field label="Description" value={extractedData.raw_description || ''} onChange={(event) => setExtractedData((data) => ({ ...data, raw_description: event.target.value }))} placeholder="How is it made?" textarea required /></div></div><div className="mt-8 flex gap-5"><Button variant="light" onClick={() => setStep(2)}>Back</Button><Button onClick={() => setStep(4)} className="flex-1 justify-between">Continue to price <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></Button></div></section>
        )}
        {step === 4 && (
          <section className="grid gap-12 lg:grid-cols-[0.75fr_1fr]"><div><Eyebrow>Set your price</Eyebrow><h2 className="mt-4 font-display text-5xl leading-none">The final word is yours.</h2><p className="mt-5 max-w-sm text-sm leading-7 text-stone-600">Set the price that reflects your material, time, and practice. There is no automatic price claim here.</p></div><div className="border-y border-stone-300 py-8"><Field label="Your price in rupees" value={finalPrice} onChange={(event) => setFinalPrice(event.target.value)} placeholder="0" type="number" required /><div className="mt-8 grid grid-cols-2 gap-6 text-sm"><div><p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">Material cost</p><p className="mt-2 text-stone-950">{extractedData.material_cost ? `₹${extractedData.material_cost}` : 'Not specified'}</p></div><div><p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">Days of work</p><p className="mt-2 text-stone-950">{extractedData.labour_days || 'Not specified'}</p></div></div><div className="mt-10 flex gap-5"><Button variant="light" onClick={() => setStep(3)}>Back</Button><Button onClick={() => setStep(5)} disabled={!finalPrice} className="flex-1 justify-between">Review submission <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></Button></div></div></section>
        )}
        {step === 5 && (
          <section className="grid gap-12 lg:grid-cols-[0.8fr_1fr]"><div><Eyebrow>Submit</Eyebrow><h2 className="mt-4 font-display text-5xl leading-none">Ready when you are.</h2><p className="mt-5 max-w-sm text-sm leading-7 text-stone-600">Your piece will be reviewed before it joins the public collection.</p></div><div className="border-y border-stone-300 py-7"><ImageFrame src={capturedImage} alt={extractedData.title || 'Product'} label="Your piece" className="aspect-[4/3]" /><div className="mt-6 flex items-start justify-between gap-5"><div><h3 className="font-display text-3xl">{extractedData.title || 'Untitled piece'}</h3><p className="mt-2 text-sm text-stone-600">{extractedData.material || 'Material to be confirmed'}</p></div><StatusLabel tone="warning">Pending review</StatusLabel></div><p className="mt-5 border-t border-stone-300 pt-5 text-2xl text-stone-950">₹{Number(finalPrice).toLocaleString('en-IN')}</p><div className="mt-8 flex gap-5"><Button variant="light" onClick={() => setStep(4)}>Edit price</Button><Button disabled={loading} onClick={() => void updateDraft('pending_review')} className="flex-1 justify-between">{loading ? 'Submitting' : 'Submit piece'} <Check className="h-4 w-4" strokeWidth={1.5} /></Button></div></div></section>
        )}
        {!draftId && step !== 1 && <EmptyState title="Start with a photograph." description="Choose a product image to begin your listing." />}
      </div>
    </div>
  );
};

export { SimplifiedListingWizard };
export default SimplifiedListingWizard;
