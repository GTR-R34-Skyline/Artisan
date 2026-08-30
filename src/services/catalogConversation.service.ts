import { supabase } from '../lib/supabase';
import { CatalogConversationRequest, CatalogConversationResponse } from '../types/catalogConversation';

export class CatalogConversationService {
  static async sendTurn(payload: CatalogConversationRequest): Promise<CatalogConversationResponse> {
    const { data, error } = await supabase.functions.invoke('catalog-conversation', {
      body: payload,
    });

    if (error) {
      throw new Error(error.message || 'Unable to process the recording right now.');
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Unexpected assistant response. Please try again.');
    }

    const response = data as CatalogConversationResponse;
    if (typeof response.assistantMessage !== 'string') {
      throw new Error('Assistant response is incomplete. Please retry.');
    }

    return response;
  }
}
