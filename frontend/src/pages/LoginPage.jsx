import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [role, setRole] = useState(
    searchParams.get('role') === 'admin' ? 'admin' : 'user'
  );
  const { login, adminLogin, resendVerification } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (newRole === 'admin') {
      setSearchParams({ role: 'admin' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      if (role === 'admin') {
        const response = await adminLogin(formData.email.trim(), formData.password);
        toast.success(response.message || 'Admin login successful');
        navigate('/admin', { replace: true });
      } else {
        const response = await login(formData.email.trim(), formData.password);
        toast.success(response.message || 'Login successful');
        navigate('/');
      }
    } catch (error) {
      if (role === 'admin' && error.response?.status === 403) {
        toast.error('Access denied. Only administrators are authorized to log in here.');
      } else {
        toast.error(error.response?.data?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!formData.email) {
      toast.error('Enter your email address first.');
      return;
    }

    setResending(true);
    try {
      const response = await resendVerification(formData.email);
      const verificationUrl = response.data?.verificationUrl;
      if (verificationUrl) {
        const link = new URL(verificationUrl);
        navigate(`${link.pathname}${link.search}`);
        return;
      }
      toast.success(response.message || 'Verification email sent.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not resend verification email.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* User / Admin Toggle */}
        <div className="btn-group w-100 mb-4" role="group" aria-label="Select login role">
          <button
            type="button"
            className={`btn ${role === 'user' ? 'btn-primary' : 'btn-outline-primary'}`}
            aria-pressed={role === 'user'}
            onClick={() => handleRoleChange('user')}
          >
            <i className="bi bi-person me-2" aria-hidden="true" />
            Customer
          </button>
          <button
            type="button"
            className={`btn ${role === 'admin' ? 'btn-primary' : 'btn-outline-primary'}`}
            aria-pressed={role === 'admin'}
            onClick={() => handleRoleChange('admin')}
          >
            <i className="bi bi-shield-lock me-2" aria-hidden="true" />
            Admin
          </button>
        </div>

        {role === 'admin' ? (
          <>
            <span className="badge text-bg-warning mb-2">Admin Portal</span>
            <h2 className="mb-2">Administrator Sign In</h2>
            <p className="text-muted mb-4">Sign in with authorized administrator credentials.</p>
          </>
        ) : (
          <>
            <h2 className="mb-2">Customer Login</h2>
            <p className="text-muted mb-4">Welcome back! Please sign in to continue.</p>
          </>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              type="email"
              id="login-email"
              name="email"
              className="form-control"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="login-password">Password</label>
            <div className="password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                id="login-password"
                name="password"
                className="form-control"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                required
              />
              <button
                className="password-visibility-toggle"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
              </button>
            </div>
          </div>

          {role === 'user' ? (
            <div className="d-flex justify-content-between mb-3 small">
              <Link to="/forgot-password">Forgot password?</Link>
              <Link to="/register">Create account</Link>
            </div>
          ) : (
            <div className="alert alert-light border small text-muted mb-3">
              <i className="bi bi-info-circle me-1" />
              User registration is not available for administrator accounts.
            </div>
          )}

          <button className="btn btn-primary w-100" disabled={loading} type="submit">
            {loading ? 'Signing in...' : role === 'admin' ? 'Admin Sign In' : 'Login'}
          </button>

          {role === 'user' && (
            <button
              className="btn btn-link w-100 mt-2"
              disabled={resending}
              type="button"
              onClick={handleResendVerification}
            >
              {resending ? 'Sending...' : 'Resend verification email'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
