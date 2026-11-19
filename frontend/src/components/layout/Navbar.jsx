import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/useAuth';
import { useCart } from '../../context/useCart';

const Navbar = () => {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not log out. Please try again.');
    }
  };

  return (
    <nav className="navbar navbar-expand-lg sticky-top">
      <div className="container">
        <Link className="navbar-brand" to="/">Pizza Delivery</Link>
        <div className="ms-auto d-flex align-items-center gap-3">
          <Link className="nav-link" to="/">Home</Link>
          <Link className="nav-link" to="/menu">Menu</Link>
          <Link className="build-pizza-link text-nowrap" to="/builder">
            <span aria-hidden="true">🍕</span> Build Your Own Pizza
          </Link>
          <Link className="nav-link" to="/cart">
            Cart{itemCount > 0 && <span className="cart-count" aria-label={`${itemCount} items in cart`}>{itemCount}</span>}
          </Link>
          {!user ? (
            <>
              <Link className="nav-link" to="/login">Login</Link>
              <Link className="btn btn-primary btn-sm" to="/register">Register</Link>
            </>
          ) : (
            <>
              <Link className="nav-link" to="/my-orders">My orders</Link>
              {user.role === 'admin' && <Link className="nav-link" to="/admin">Admin</Link>}
              <Link className="nav-link" to="/profile">Profile</Link>
              <button className="btn btn-outline-light btn-sm" onClick={handleLogout} type="button">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
