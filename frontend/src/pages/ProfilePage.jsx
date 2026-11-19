import { useAuth } from '../context/useAuth';
import { toast } from 'react-toastify';

const ProfilePage = () => {
  const { user, logout } = useAuth();
  const displayName = user?.name?.trim() || 'Pizza lover';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not log out. Please try again.');
    }
  };

  if (!user) {
    return <div className="container py-5">Please log in to view your profile.</div>;
  }

  return (
    <main className="container profile-page py-5">
      <section className="profile-card mx-auto">
        <header className="profile-header">
          <div className="profile-avatar" role="img" aria-label={`${displayName} avatar`}>
            {initials}
          </div>
          <div className="profile-heading">
            <span className="profile-eyebrow">Your account</span>
            <h1 className="h2 fw-bold mb-1">{displayName}</h1>
            <p className="text-muted mb-0">Your profile and account details</p>
          </div>
          <span className={`profile-verification ${user.emailVerified ? 'is-verified' : 'is-pending'}`}>
            <i className={`bi ${user.emailVerified ? 'bi-patch-check-fill' : 'bi-envelope-exclamation-fill'}`} aria-hidden="true" />
            {user.emailVerified ? 'Email verified' : 'Email not verified'}
          </span>
        </header>

        <div className="profile-details">
          <div className="profile-detail">
            <span className="profile-detail-icon"><i className="bi bi-person" aria-hidden="true" /></span>
            <div>
              <span className="profile-detail-label">Name</span>
              <strong>{user.name || 'Not provided'}</strong>
            </div>
          </div>
          <div className="profile-detail">
            <span className="profile-detail-icon"><i className="bi bi-envelope" aria-hidden="true" /></span>
            <div>
              <span className="profile-detail-label">Email address</span>
              <strong>{user.email || 'Not provided'}</strong>
            </div>
          </div>
          <div className="profile-detail">
            <span className="profile-detail-icon"><i className="bi bi-telephone" aria-hidden="true" /></span>
            <div>
              <span className="profile-detail-label">Phone number</span>
              <strong>{user.phone || 'Not provided'}</strong>
            </div>
          </div>
        </div>

        <div className="profile-actions">
          <button className="btn btn-outline-danger" onClick={handleLogout} type="button">
            <i className="bi bi-box-arrow-right me-2" aria-hidden="true" />
            Log out
          </button>
        </div>
      </section>
    </main>
  );
};

export default ProfilePage;
