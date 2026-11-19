import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const { verifyEmail } = useAuth();
  const token = searchParams.get('token');
  const [status, setStatus] = useState(token ? 'verifying' : 'invalid');
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (!token || verificationStarted.current) {
      if (!token) {
        toast.error('Verification token is missing.');
      }
      return;
    }
    verificationStarted.current = true;

    const verify = async () => {
      try {
        const response = await verifyEmail(token);
        setStatus('success');
        toast.success(response.message || 'Email verified successfully');
      } catch (error) {
        setStatus('failed');
        toast.error(error.response?.data?.message || 'Verification failed');
      }
    };

    verify();
  }, [token, verifyEmail]);

  if (status === 'verifying') {
    return <div className="container py-5 text-center">Verifying your email...</div>;
  }

  if (status === 'success') {
    return (
      <div className="container py-5 text-center">
        <div className="auth-card mx-auto">
          <h2>Email verified</h2>
          <p className="text-muted">Your account has been activated successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-5 text-center">
      <div className="auth-card mx-auto">
        <h2>Verification failed</h2>
        <p className="text-muted">The token may be expired or invalid.</p>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
