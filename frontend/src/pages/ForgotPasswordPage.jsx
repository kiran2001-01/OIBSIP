import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const { forgotPassword, verifyResetOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [developmentOtp, setDevelopmentOtp] = useState('');
  const [step, setStep] = useState('email');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      if (step === 'email') {
        const response = await forgotPassword(email);
        setDevelopmentOtp(response.data?.developmentOtp || '');
        setStep('otp');
        toast.success(response.message || 'If an account exists, a reset code was sent.');
      } else {
        await verifyResetOtp(email, otp);
        navigate('/reset-password', { state: { otpVerified: true } });
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to process password reset');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setLoading(true);
    try {
      const response = await forgotPassword(email);
      setDevelopmentOtp(response.data?.developmentOtp || '');
      setOtp('');
      toast.success(response.message || 'If an account exists, a new reset code was sent.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to resend reset code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="mb-3">Forgot password</h2>
        <p className="text-muted mb-4">
          {step === 'email'
            ? 'Enter your email to receive a six-digit reset code.'
            : 'Enter the six-digit code sent to your email to continue.'}
        </p>

        <form onSubmit={handleSubmit}>
          {step === 'email' ? (
            <div className="mb-3">
              <label className="form-label" htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                type="email"
                className="form-control"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          ) : (
            <>
              <p className="small text-muted">Reset code sent to {email}</p>
              {developmentOtp && (
                <div className="alert alert-warning" role="status">
                  Local development OTP: <strong>{developmentOtp}</strong>
                </div>
              )}
              <div className="mb-3">
                <label className="form-label" htmlFor="reset-otp">Six-digit code</label>
                <input
                  id="reset-otp"
                  type="text"
                  className="form-control"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                />
              </div>
              <button type="button" className="btn btn-link px-0 mb-3" onClick={resendOtp} disabled={loading}>
                Resend code
              </button>
            </>
          )}

          <button className="btn btn-primary w-100" type="submit" disabled={loading}>
            {loading
              ? (step === 'email' ? 'Sending code...' : 'Verifying code...')
              : (step === 'email' ? 'Send reset code' : 'Verify code')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
