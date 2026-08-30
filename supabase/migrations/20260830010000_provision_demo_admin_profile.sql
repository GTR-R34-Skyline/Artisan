DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  SELECT id
  INTO admin_user_id
  FROM auth.users
  WHERE lower(email) = 'admin@artisan.market'
  LIMIT 1;

  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, role, full_name, preferred_language)
    VALUES (admin_user_id, 'admin', 'System Admin', 'en')
    ON CONFLICT (id) DO UPDATE
      SET role = 'admin',
          full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
          preferred_language = COALESCE(public.profiles.preferred_language, EXCLUDED.preferred_language);
  END IF;
END;
$$;
