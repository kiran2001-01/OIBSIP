import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { resetPassword } = useAuth();
  const otpVerified = location.state?.otpVerified === true;
  const [formData, setFormData] = useState({ newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      if (!otpVerified) {
        toast.error('Verify the reset code before choosing a new password.');
        return;
      }

      const response = await resetPassword(formData.newPassword, formData.confirmPassword);
      toast.success(response.message || 'Password reset successful');
      navigate('/login');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (!otpVerified) {
    return (
      <div className="container py-5 text-center">
        <div className="auth-card mx-auto">
          <h2>Verify reset code first</h2>
          <p className="text-muted">Enter the code sent to your email before choosing a new password.</p>
          <Link className="btn btn-primary" to="/forgot-password">Request a reset code</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="mb-3">Reset password</h2>
        <p className="text-muted mb-4">
          Use at least 10 characters with an uppercase letter, a lowercase letter, and a number.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">New password</label>
            <input
              type="password"
              name="newPassword"
              className="form-control"
              minLength={10}
              maxLength={72}
              value={formData.newPassword}
              onChange={handleChange}
              required
            />
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

          <button className="btn btn-primary w-100" type="submit" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
