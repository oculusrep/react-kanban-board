import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { trackPortalLogin } from '../../hooks/usePortalActivityTracker';

/**
 * PortalLoginPage - Login screen for portal users (clients)
 *
 * - Standard email/password authentication
 * - Forgot password link
 * - Branded with Oculus colors
 */
export default function PortalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // Check if user has portal access
      const { data: contact, error: contactError } = await supabase
        .from('contact')
        .select('id, portal_access_enabled')
        .eq('email', email.toLowerCase())
        .single();

      if (contactError || !contact) {
        await supabase.auth.signOut();
        throw new Error('No portal access found for this account');
      }

      if (!contact.portal_access_enabled) {
        await supabase.auth.signOut();
        throw new Error('Portal access has been disabled for this account');
      }

      // Update last login timestamp
      await supabase
        .from('contact')
        .update({ portal_last_login_at: new Date().toISOString() })
        .eq('id', contact.id);

      // Track login event
      await trackPortalLogin(contact.id);

      // Navigate to portal
      navigate('/portal');
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#011742' }}
    >
      {/* Logo */}
      <div className="mb-8">
        <img
          src="/oculus-logo-white.png"
          alt="Oculus"
          className="h-12"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <h1 className="text-2xl font-bold text-white text-center mt-4">
          Client Portal
        </h1>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">
          Sign In
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#104073' }}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            to="/portal/forgot-password"
            className="text-sm hover:underline"
            style={{ color: '#104073' }}
          >
            Forgot your password?
          </Link>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-8 text-sm text-gray-400">
        Need access? Contact your broker representative.
      </p>
    </div>
  );
}
