import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';

const AdminLoginPage = () => {
  const navigate = useNavigate();
  const { adminLogin } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await adminLogin(formData.email.trim(), formData.password);
      toast.success(response.message || 'Admin login successful');
      navigate('/admin', { replace: true });
    } catch (error) {
      const message = error.response?.status === 403
        ? 'Access denied. Only administrators are authorized to log in here.'
        : error.response?.data?.message || 'Admin login failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="admin-login-heading">
        <p className="text-uppercase text-muted small fw-semibold mb-2">Pizza Delivery</p>
        <h1 id="admin-login-heading" className="h2 fw-bold mb-2">Administrator sign in</h1>
        <p className="text-muted mb-4">Sign in with your administrator credentials.</p>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label" htmlFor="admin-login-email">Email</label>
            <input
              id="admin-login-email"
              name="email"
              type="email"
              className="form-control"
              autoComplete="username"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="admin-login-password">Password</label>
            <input
              id="admin-login-password"
              name="password"
              type="password"
              className="form-control"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>
          <button className="btn btn-primary w-100" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Admin sign in'}
          </button>
          <a href="/login" className="btn btn-link w-100 mt-2 text-decoration-none small">
            ← Switch to Customer Login
          </a>
        </form>
      </section>
    </main>
  );
};

export default AdminLoginPage;
