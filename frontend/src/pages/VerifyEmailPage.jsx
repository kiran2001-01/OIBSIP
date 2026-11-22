import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const { verifyEmail } = useAuth();
  const token = searchParams.get('token');
  const isRegistrationVerification = searchParams.get('mode') === 'registration';
  const verificationMode = isRegistrationVerification ? 'registration' : undefined;
  const registrationEmail = isRegistrationVerification ? searchParams.get('email') : undefined;
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
        const response = await verifyEmail(token, {
          mode: verificationMode,
          email: registrationEmail
        });
        if (response.data?.registrationVerified) {
          localStorage.setItem('registration_verified_email', response.data.email);
          localStorage.setItem('registration_verification_token', response.data.registrationVerificationToken);
        }
        setStatus('success');
        toast.success(response.message || 'Email verified successfully');
      } catch (error) {
        setStatus('failed');
        toast.error(error.response?.data?.message || 'Verification failed');
      }
    };

    verify();
  }, [registrationEmail, token, verificationMode, verifyEmail]);

  if (status === 'verifying') {
    return <div className="container py-5 text-center">Verifying your email...</div>;
  }

  if (status === 'success') {
    return (
      <div className="container py-5 text-center">
        <div className="auth-card mx-auto">
          <h2>Email verified</h2>
          <p className="text-muted">
            {isRegistrationVerification
              ? 'Your email is verified. Return to the registration form to create your account.'
              : 'Your account has been created and activated successfully.'}
          </p>
          <Link className="btn btn-primary" to={isRegistrationVerification ? `/register?email=${encodeURIComponent(searchParams.get('email') || '')}` : '/login'}>
            {isRegistrationVerification ? 'Continue registration' : 'Continue to login'}
          </Link>
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
