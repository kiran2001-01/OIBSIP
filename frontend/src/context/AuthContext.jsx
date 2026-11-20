import { useEffect, useMemo, useState } from 'react';
import AuthContext from './auth-context';
import api from '../services/api';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    localStorage.removeItem('pizza_token');
    localStorage.removeItem('pizza_user');

    const fetchCurrentUser = async () => {
      try {
        const response = await api.get('/auth/me');
        setUser(response.data?.data?.user || null);
      } catch (error) {
        setUser(null);
        if (error.response?.status !== 401) {
          console.error('Unable to restore the current session:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const payload = response.data?.data;

    setUser(payload?.user || null);

    return response.data;
  };

  const adminLogin = async (email, password) => {
    const response = await api.post('/auth/admin-login', { email, password });
    const payload = response.data?.data;

    setUser(payload?.user || null);

    return response.data;
  };

  const register = async (formData) => {
    const response = await api.post('/auth/register', formData);
    return response.data;
  };

  const requestRegistrationVerification = async (email) => {
    const response = await api.post('/auth/request-registration-verification', { email });
    return response.data;
  };

  const verifyEmail = async (tokenValue) => {
    const response = await api.get(`/auth/verify-email?token=${tokenValue}`);
    return response.data;
  };

  const resendVerification = async (email) => {
    const response = await api.post('/auth/resend-verification', { email });
    return response.data;
  };

  const forgotPassword = async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  };

  const verifyResetOtp = async (email, otp) => {
    const response = await api.post('/auth/verify-reset-otp', { email, otp });
    return response.data;
  };

  const resetPassword = async (newPassword, confirmPassword) => {
    const response = await api.post('/auth/reset-password', { newPassword, confirmPassword });
    return response.data;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Clear the local session even when the API is temporarily unavailable.
      // The next request/reload can restore the server session once the API is back.
      setUser(null);
      return {
        success: true,
        message: 'Logged out on this device'
      };
    }

    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      adminLogin,
      register,
      requestRegistrationVerification,
      verifyEmail,
      resendVerification,
      forgotPassword,
      verifyResetOtp,
      resetPassword,
      logout
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
