import { supabase } from '../lib/supabase';
import { ProfileConversationRequest, ProfileConversationResponse } from '../types/profileConversation';

export class ProfileConversationService {
  static async sendTurn(payload: ProfileConversationRequest): Promise<ProfileConversationResponse> {
    const { data, error } = await supabase.functions.invoke('profile-conversation', {
      body: payload,
    });

    if (error) {
      throw new Error(error.message || 'Unable to process your response right now.');
    }

    if (!data || typeof data !== 'object' || typeof data.assistantMessage !== 'string') {
      throw new Error('The conversation response was incomplete. Please try again.');
    }

    return data as ProfileConversationResponse;
  }
}
