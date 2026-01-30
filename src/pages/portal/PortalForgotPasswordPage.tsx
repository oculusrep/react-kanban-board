import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

/**
 * PortalForgotPasswordPage - Password reset request for portal users
 *
 * - Sends password reset email via Supabase
 * - Branded with Oculus colors
 */
export default function PortalForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Verify email has portal access first
      const { data: contact, error: contactError } = await supabase
        .from('contact')
        .select('id, portal_access_enabled')
        .eq('email', email.toLowerCase())
        .single();

      if (contactError || !contact) {
        // Don't reveal if email exists or not for security
        setSuccess(true);
        return;
      }

      if (!contact.portal_access_enabled) {
        // Still show success to not reveal account status
        setSuccess(true);
        return;
      }

      // Send password reset email
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/portal/reset-password`,
      });

      if (resetError) throw resetError;

      setSuccess(true);
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

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
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Check Your Email</h2>
          <p className="text-gray-600 mb-6">
            If an account exists for {email}, you will receive a password reset link shortly.
          </p>
          <Link
            to="/portal/login"
            className="inline-block px-6 py-2 text-white font-medium rounded-lg transition-colors"
            style={{ backgroundColor: '#104073' }}
          >
            Back to Login
          </Link>
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

      {/* Reset Card */}
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">
          Reset Password
        </h2>
        <p className="text-gray-600 text-center mb-6">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#104073' }}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Sending...
              </span>
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            to="/portal/login"
            className="text-sm hover:underline"
            style={{ color: '#104073' }}
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
