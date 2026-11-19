import { Link } from 'react-router-dom';

const NotFoundPage = () => {
  return (
    <div className="container py-5 text-center">
      <div className="auth-card mx-auto">
        <h1 className="display-4">404</h1>
        <h2>Page not found</h2>
        <p className="text-muted">The page you are looking for does not exist.</p>
        <Link to="/" className="btn btn-primary mt-3">Return home</Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
