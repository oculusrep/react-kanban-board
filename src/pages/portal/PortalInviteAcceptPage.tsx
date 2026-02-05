import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

/**
 * PortalInviteAcceptPage - Page where invited users set up their account
 *
 * - Validates invite token from URL
 * - Allows user to set password
 * - Creates auth account and links to contact
 */
export default function PortalInviteAcceptPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [contact, setContact] = useState<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError('Invalid invite link. Please check your email and try again.');
        setLoading(false);
        return;
      }

      try {
        // Find contact with this invite token
        const { data, error: fetchError } = await supabase
          .from('contact')
          .select('id, email, first_name, last_name, portal_invite_status, portal_invite_expires_at')
          .eq('portal_invite_token', token)
          .single();

        if (fetchError || !data) {
          // Token not found - could be invalid, expired, or a new invite was sent (which regenerates the token)
          // Try to provide more helpful information by checking the invite_log
          const { data: logData } = await supabase
            .from('portal_invite_log')
            .select('status, sent_at, contact_id')
            .eq('invite_token', token)
            .order('sent_at', { ascending: false })
            .limit(1);

          if (logData && logData.length > 0) {
            const log = logData[0];
            if (log.status === 'accepted') {
              setError('This invite link has already been used to create an account. Please sign in instead.');
            } else if (log.status === 'expired') {
              setError('This invite link has expired. Please contact your broker for a new invite.');
            } else if (log.status === 'revoked') {
              setError('This invite link has been revoked. Please contact your broker for a new invite.');
            } else {
              // Token was in log but not found on contact - likely a new invite was sent
              setError('This invite link is no longer valid. A newer invite may have been sent - please check your email for the most recent invite, or contact your broker.');
            }
          } else {
            // Token not found anywhere
            setError('This invite link is not valid. Please check your email for the correct link, or contact your broker for a new invite.');
          }
          setLoading(false);
          return;
        }

        // Check if invite is expired
        if (data.portal_invite_expires_at) {
          const expiresAt = new Date(data.portal_invite_expires_at);
          if (expiresAt < new Date()) {
            // Mark invite as expired
            await supabase
              .from('contact')
              .update({ portal_invite_status: 'expired' })
              .eq('id', data.id);

            // Update the log entry status to expired
            await supabase
              .from('portal_invite_log')
              .update({ status: 'expired' })
              .eq('invite_token', token);

            setError('This invite link has expired. Please contact your broker for a new invite.');
            setLoading(false);
            return;
          }
        }

        // Check if already accepted
        if (data.portal_invite_status === 'accepted') {
          setError('This invite link has already been used to create an account. Please sign in instead.');
          setLoading(false);
          return;
        }

        if (!data.email) {
          setError('No email address found for this contact. Please contact your broker.');
          setLoading(false);
          return;
        }

        setContact(data);
      } catch (err) {
        console.error('Error validating token:', err);
        setError('An error occurred. Please try again later.');
      } finally {
        setLoading(false);
      }
    }

    validateToken();
  }, [token]);

  const validatePassword = () => {
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      return false;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validatePassword() || !contact) return;

    setSubmitting(true);
    setError(null);

    try {
      // Create the auth user account
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: contact.email,
        password,
        options: {
          data: {
            contact_id: contact.id,
            is_portal_user: true,
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError('An account with this email already exists. Please sign in instead.');
        } else {
          throw signUpError;
        }
        return;
      }

      // Update contact record with accepted status using RPC (bypasses RLS)
      const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_portal_invite', {
        p_contact_id: contact.id,
        p_auth_user_id: authData.user?.id,
      });

      if (rpcError) throw rpcError;
      if (rpcResult && !rpcResult.success) {
        throw new Error(rpcResult.error || 'Failed to complete invite acceptance');
      }

      setSuccess(true);

      // Auto sign-in and redirect after a delay
      setTimeout(async () => {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: contact.email,
          password,
        });

        if (!signInError) {
          navigate('/portal');
        } else {
          navigate('/portal/login');
        }
      }, 2000);
    } catch (err: any) {
      console.error('Error accepting invite:', err);
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#011742' }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Validating invite...</p>
        </div>
      </div>
    );
  }

  if (error && !contact) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: '#011742' }}
      >
        <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-8 text-center">
          <svg
            className="mx-auto h-16 w-16 text-red-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid Invite</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/portal/login"
            className="inline-block px-6 py-2 text-white font-medium rounded-lg transition-colors"
            style={{ backgroundColor: '#104073' }}
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: '#011742' }}
      >
        <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-8 text-center">
          <svg
            className="mx-auto h-16 w-16 text-green-500 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Account Created!</h2>
          <p className="text-gray-600">
            Your account has been set up successfully. Redirecting you to the portal...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#011742' }}
    >
      {/* Logo */}
      <div className="mb-8 text-center">
        <img
          src="/Images/Oculus_02-Long - white.png"
          alt="Oculus"
          className="h-12 mx-auto"
        />
        <h1 className="text-2xl font-bold text-white text-center mt-4">
          OVIS Client Portal
        </h1>
      </div>

      {/* Setup Card */}
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">
          Welcome, {contact?.first_name || 'there'}!
        </h2>
        <p className="text-gray-600 text-center mb-6">
          Set up your password to complete your account setup.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={contact?.email || ''}
              disabled
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Create Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Re-enter your password"
            />
          </div>

          {passwordError && (
            <p className="text-sm text-red-600">{passwordError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#104073' }}
          >
            {submitting ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Creating Account...
              </span>
            ) : (
              'Create Account'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
