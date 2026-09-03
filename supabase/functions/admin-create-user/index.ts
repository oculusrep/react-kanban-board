// Admin Create User Edge Function
//
// Creates an OVIS user: the auth.users login plus the matching public.user row.
//
// Why this exists: the browser used to call supabase.auth.admin.createUser()
// directly from useUsers.createUser. The auth.admin.* namespace requires a
// service_role key and the app client is built with the publishable key, so
// that call could never succeed — "+ Create User" was dead. The service_role
// key belongs on the server, so the whole operation moved here.
//
// The caller is verified inside the function: an authenticated JWT alone is not
// enough, the caller's public.user row must carry an admin role. Without that
// check any signed-in user could mint an admin account, since the function
// itself runs with service_role.
//
// To deploy:
// npx supabase functions deploy admin-create-user

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_ROLES = ['admin', 'broker_full'];

interface CreateUserRequest {
  email: string;
  password: string;
  userData: {
    name: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string;
    ovis_role: string;
    mobile_phone?: string | null;
    active?: boolean;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Who is calling? Validate the JWT the browser sent.
    //    getUser(token) on the service client rather than a second client built
    //    from SUPABASE_ANON_KEY: this project has its legacy anon/service_role
    //    keys disabled, so an anon-key client is rejected before it can check
    //    anything.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const { data: callerAuth, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !callerAuth?.user) {
      return json({ error: 'Not signed in' }, 401);
    }

    // 2. Is the caller allowed to create users? Same role gate as
    //    admin_update_user / admin_delete_user.
    const { data: callerRow, error: roleErr } = await admin
      .from('user')
      .select('ovis_role')
      .eq('auth_user_id', callerAuth.user.id)
      .maybeSingle();

    if (roleErr) {
      console.error('Caller lookup failed:', roleErr);
      return json({ error: 'Could not verify caller permissions' }, 500);
    }
    if (!callerRow || !ADMIN_ROLES.includes(callerRow.ovis_role ?? '')) {
      return json({ error: 'Only administrators can create users' }, 403);
    }

    // 3. Validate input before creating anything.
    const body = (await req.json()) as CreateUserRequest;
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password ?? '';
    const userData = body?.userData;

    if (!email) return json({ error: 'Email is required' }, 400);
    if (password.length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, 400);
    }
    if (!userData?.ovis_role) return json({ error: 'Role is required' }, 400);
    if (!userData?.name?.trim()) return json({ error: 'Name is required' }, 400);

    // A duplicate public.user row is the more likely mistake, and catching it
    // here avoids creating an auth login we'd immediately have to roll back.
    const { data: dupe } = await admin
      .from('user')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (dupe) {
      return json({ error: `A user with email ${email} already exists` }, 409);
    }

    // 4. Create the login.
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no confirmation round-trip; admin set the password
    });

    if (authError || !authData?.user) {
      console.error('createUser (auth) failed:', authError);
      return json({ error: authError?.message || 'Failed to create the login' }, 400);
    }

    // 5. Create the OVIS user row. On failure, remove the login we just made so
    //    a retry isn't blocked by a half-created account.
    const { data: inserted, error: insertError } = await admin
      .from('user')
      .insert([
        {
          name: userData.name.trim(),
          first_name: userData.first_name || null,
          last_name: userData.last_name || null,
          email,
          ovis_role: userData.ovis_role,
          mobile_phone: userData.mobile_phone || null,
          active: userData.active ?? true,
          auth_user_id: authData.user.id,
        },
      ])
      .select('id, name, email, ovis_role, active')
      .single();

    if (insertError) {
      console.error('createUser (user row) failed, rolling back auth user:', insertError);
      const { error: rollbackError } = await admin.auth.admin.deleteUser(authData.user.id);
      if (rollbackError) {
        console.error('Rollback of auth user failed:', rollbackError);
        return json(
          {
            error: `${insertError.message} — and the login could not be rolled back. Auth user ${authData.user.id} is orphaned.`,
          },
          500,
        );
      }
      return json({ error: insertError.message }, 400);
    }

    console.log(`Created user ${inserted.id} (${email}) by ${callerAuth.user.id}`);
    return json({ success: true, user: inserted }, 200);
  } catch (error) {
    console.error('admin-create-user error:', error);
    return json({ error: (error as Error)?.message || 'Internal server error' }, 500);
  }
});
