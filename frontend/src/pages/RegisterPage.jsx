import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';

const RegisterPage = () => {
  const { register, resendVerification } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await register(formData);
      const localVerificationUrl = response.data?.verificationUrl;
      setVerificationUrl(localVerificationUrl || '');

      toast.info(response.message || 'Check your email to activate your account.');
      setVerificationSent(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    try {
      const response = await resendVerification(formData.email.trim());
      setVerificationUrl(response.data?.verificationUrl || '');
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
        <h2 className="mb-3">Create account</h2>
        <p className="text-muted mb-4">Join us and start ordering your favorite pizza.</p>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Full name</label>
            <input
              type="text"
              name="name"
              className="form-control"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Email</label>
            <input
              type="email"
              name="email"
              className="form-control"
              value={formData.email}
              onChange={handleChange}
              required
            />
            <div className="form-text">
              An email verification link will be sent here after registration.
            </div>
          </div>

          {verificationSent && (
            <div className="alert alert-success" role="status">
              <strong>Verification pending:</strong> We sent a verification link to {formData.email}. Your account will be activated only after you verify your email.
              <button className="btn btn-sm btn-outline-success d-block mt-2" type="button" onClick={handleResendVerification} disabled={resending}>
                {resending ? 'Sending...' : 'Resend verification link'}
              </button>
              {verificationUrl && (
                <a className="btn btn-sm btn-link d-block text-start px-0" href={verificationUrl}>
                  Open local verification link
                </a>
              )}
            </div>
          )}

          <div className="mb-3">
            <label className="form-label">Phone</label>
            <input
              type="tel"
              name="phone"
              className="form-control"
              value={formData.phone}
              onChange={handleChange}
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Password</label>
            <input
              type="password"
              name="password"
              className="form-control"
              minLength={10}
              maxLength={72}
              value={formData.password}
              onChange={handleChange}
              required
            />
            <div className="form-text">
              Use at least 10 characters with an uppercase letter, a lowercase letter, and a number.
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">Confirm password</label>
            <input
              type="password"
              name="confirmPassword"
              className="form-control"
              minLength={10}
              maxLength={72}
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          <button className="btn btn-primary w-100" type="submit" disabled={loading || verificationSent}>
            {loading ? 'Registering...' : verificationSent ? 'Verification pending' : 'Register'}
          </button>

          <div className="mt-3 text-center small">
            <span>Already have an account? </span>
            <Link to="/login">Login</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
