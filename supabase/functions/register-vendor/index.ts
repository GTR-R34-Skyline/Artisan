import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // CORS Preflight Requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { name, phone, language, locationState } = await req.json();
    if (!name || !phone) {
      return new Response(JSON.stringify({ error: 'Name and Phone parameters are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Supabase configuration is missing in environment variables' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const email = `${phone}@artisan.local`;
    const password = `vendor_${phone}_password`;

    let userId: string;

    // Check if the profile already exists in the database
    const { data: profileList, error: profileError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('phone_number', phone);

    if (profileError) {
      throw new Error(`Database check failed: ${profileError.message}`);
    }

    if (profileList && profileList.length > 0) {
      userId = profileList[0].id;
    } else {
      // Create a confirmed user using the admin client
      const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto confirms email, avoiding SMTP activation requirement
        user_metadata: {
          full_name: name,
          role: 'vendor'
        }
      });

      if (createError) {
        throw new Error(`Auth user creation failed: ${createError.message}`);
      }

      if (!userData.user) {
        throw new Error('Auth creation returned empty payload');
      }

      userId = userData.user.id;
    }

    // Upsert profiles and vendors table rows
    const { error: profileUpsertError } = await adminClient
      .from('profiles')
      .upsert({
        id: userId,
        role: 'vendor',
        full_name: name,
        phone_number: phone,
        preferred_language: language || null,
        location_state: typeof locationState === 'string' ? locationState.trim() : null
      });

    if (profileUpsertError) {
      throw new Error(`Profile record creation failed: ${profileUpsertError.message}`);
    }

    const { error: vendorUpsertError } = await adminClient
      .from('vendors')
      .upsert({
        id: userId,
        craft_type: 'Handloom / Handicrafts',
        gi_certified: false,
        verification_status: 'pending'
      });

    if (vendorUpsertError) {
      throw new Error(`Vendor record creation failed: ${vendorUpsertError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        email,
        password,
        userId
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error("Vendor registration error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
