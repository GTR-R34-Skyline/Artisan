import React from 'react';
import VoiceProfileCapture from './VoiceProfileCapture';
import { ArtisanProfileState } from '../types/profileConversation';
import { SupportedLanguageCode } from '../types/catalogConversation';
import { supabase } from '../lib/supabase';

const VendorRegistration: React.FC = () => {
  const submitApplication = async (profile: ArtisanProfileState, language: SupportedLanguageCode) => {
    const specialties = Array.from(new Set([...profile.skills, ...profile.specialties, ...profile.materials])).filter(Boolean);
    const { error } = await supabase.from('vendor_applications').insert([{
      name: profile.name?.trim(),
      email: profile.email?.trim(),
      phone: profile.phone?.trim(),
      service_type: 'marketplace',
      description: profile.story?.trim(),
      specialties,
      languages: Array.from(new Set([language, ...profile.languagesSpoken])),
      experience_years: profile.experienceYears,
      location: profile.location?.trim(),
      status: 'pending',
    }]);
    if (error) {
      throw new Error('We could not submit your application. Please try again.');
    }
  };

  return <VoiceProfileCapture onSubmit={submitApplication} />;
};

export default VendorRegistration;
