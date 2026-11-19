import { Link } from 'react-router-dom';

const Footer = () => (
  <footer className="app-footer">
    <div className="container d-flex flex-wrap justify-content-between align-items-center gap-3">
      <span>© {new Date().getFullYear()} Pizza Delivery</span>
      <nav className="d-flex gap-3" aria-label="Footer navigation">
        <Link to="/menu">Menu</Link>
        <Link to="/my-orders">My orders</Link>
      </nav>
    </div>
  </footer>
);

export default Footer;
