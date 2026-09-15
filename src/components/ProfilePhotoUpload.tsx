import React, { useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { useLocale } from '../i18n/LocaleContext';
import { uploadSellerProfileImage, validateProfileImageFile } from '../services/profileImage.service';

interface ProfilePhotoUploadProps {
  ownerKey: string;
  value: string | null;
  onChange: (url: string | null) => void;
  className?: string;
}

const ProfilePhotoUpload: React.FC<ProfilePhotoUploadProps> = ({
  ownerKey,
  value,
  onChange,
  className = '',
}) => {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const displayUrl = previewUrl || value;

  const handleFile = async (file: File) => {
    setError('');
    const validationError = validateProfileImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);
    try {
      const publicUrl = await uploadSellerProfileImage(file, ownerKey);
      onChange(publicUrl);
    } catch (uploadError) {
      setPreviewUrl(null);
      onChange(null);
      setError(uploadError instanceof Error ? uploadError.message : t('onboarding.profilePhoto.error'));
    } finally {
      setUploading(false);
    }
  };

  const clearPhoto = () => {
    setPreviewUrl(null);
    onChange(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={`profile-photo-upload ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{t('onboarding.profilePhoto.label')}</p>
      <div className="mt-4 flex items-start gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden border border-stone-300 bg-stone-100">
          {displayUrl ? (
            <img src={displayUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-stone-400">
              <Upload className="h-5 w-5" strokeWidth={1.25} />
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-ivory/80">
              <Loader2 className="h-5 w-5 animate-spin text-stone-600" strokeWidth={1.25} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-950 underline decoration-stone-300 underline-offset-4 disabled:opacity-50"
            >
              {displayUrl ? t('onboarding.profilePhoto.replace') : t('onboarding.profilePhoto.upload')}
            </button>
            {displayUrl && !uploading && (
              <button
                type="button"
                onClick={clearPhoto}
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 hover:text-stone-950"
              >
                <X className="h-3 w-3" strokeWidth={1.5} />
                {t('onboarding.profilePhoto.remove')}
              </button>
            )}
          </div>
          <p className="mt-2 text-xs leading-5 text-stone-500">{t('onboarding.profilePhoto.hint')}</p>
          {error && <p className="mt-2 border-l-2 border-amber-700 pl-3 text-xs leading-5 text-stone-700">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default ProfilePhotoUpload;
