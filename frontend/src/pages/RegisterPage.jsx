import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';

const RegisterPage = () => {
  const { register, requestRegistrationVerification } = useAuth();
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get('email') || '';
  const savedEmail = localStorage.getItem('registration_verified_email');
  const savedToken = localStorage.getItem('registration_verification_token');
  const initiallyVerified = Boolean(savedEmail && savedToken && savedEmail === initialEmail.trim().toLowerCase());
  const [formData, setFormData] = useState({
    name: '',
    email: initialEmail,
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailVerified, setEmailVerified] = useState(initiallyVerified);
  const [verificationToken, setVerificationToken] = useState(initiallyVerified ? savedToken : '');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === 'email') {
      const normalizedEmail = value.trim().toLowerCase();
      const savedEmail = localStorage.getItem('registration_verified_email');
      if (normalizedEmail !== savedEmail) {
        setEmailVerified(false);
        setVerificationToken('');
      }
    }
  };

  const handleVerifyEmail = async () => {
    const email = formData.email.trim().toLowerCase();
    if (!email) {
      toast.error('Enter your email address first.');
      return;
    }

    setVerifyingEmail(true);
    try {
      const response = await requestRegistrationVerification(email);
      toast.info(response.message || 'Check your email for the verification link.');
      if (response.data?.verificationUrl) {
        window.open(response.data.verificationUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not send the verification link.');
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!emailVerified || !verificationToken || formData.email.trim().toLowerCase() !== localStorage.getItem('registration_verified_email')) {
      toast.error('Complete email verification before registering.');
      return;
    }

    setLoading(true);
    try {
      const response = await register({ ...formData, registrationVerificationToken: verificationToken });
      localStorage.removeItem('registration_verified_email');
      localStorage.removeItem('registration_verification_token');
      toast.success(response.message || 'Registration successful. You can now log in.');
      setEmailVerified(false);
      setVerificationToken('');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="mb-3">Create account</h2>
        <p className="text-muted mb-4">Verify your email first, then complete the registration form.</p>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Full name</label>
            <input type="text" name="name" className="form-control" value={formData.name} onChange={handleChange} required />
          </div>

          <div className="mb-3">
            <label className="form-label">Email</label>
            <div className="input-group">
              <input type="email" name="email" className="form-control" value={formData.email} onChange={handleChange} required />
              <button className="btn btn-outline-primary" type="button" onClick={handleVerifyEmail} disabled={verifyingEmail || emailVerified}>
                {emailVerified ? 'Email verified' : verifyingEmail ? 'Sending...' : 'Verify email'}
              </button>
            </div>
            <div className="form-text">A verification link will be sent to this email. Your account is not created until you verify it.</div>
          </div>

          <div className="mb-3">
            <label className="form-label">Phone</label>
            <input type="tel" name="phone" className="form-control" value={formData.phone} onChange={handleChange} required />
          </div>

          <div className="mb-3">
            <label className="form-label">Password</label>
            <input type="password" name="password" className="form-control" minLength={10} maxLength={72} value={formData.password} onChange={handleChange} required />
            <div className="form-text">Use at least 10 characters with an uppercase letter, a lowercase letter, and a number.</div>
          </div>

          <div className="mb-3">
            <label className="form-label">Confirm password</label>
            <input type="password" name="confirmPassword" className="form-control" minLength={10} maxLength={72} value={formData.confirmPassword} onChange={handleChange} required />
          </div>

          <button className="btn btn-primary w-100" type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Register'}
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
