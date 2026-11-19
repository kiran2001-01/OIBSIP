import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { getImageUrl } from '../utils/imageUrl';

const HomePage = () => {
  const { user } = useAuth();

  return (
    <main className="home-page">
      <section className="pizza-hero container" aria-labelledby="home-heading">
        <div className="pizza-hero-copy">
          <span className="pizza-kicker"><span aria-hidden="true">✦</span> Fresh from our oven</span>
          <h1 id="home-heading">Good food.<br /><em>Good mood.</em></h1>
          <p>Big flavours, crisp crusts, and your favourite toppings delivered hot to your door.</p>
          <div className="pizza-hero-actions">
            <Link to="/menu" className="btn btn-light btn-lg">Explore menu <span aria-hidden="true">→</span></Link>
            <Link to="/builder" className="hero-text-link">Build your own <span aria-hidden="true">→</span></Link>
          </div>
          <div className="pizza-stats" aria-label="Pizza Delivery highlights">
            <div><strong>5K<span>+</span></strong><small>Happy customers</small></div>
            <div><strong>18K<span>+</span></strong><small>Pizzas delivered</small></div>
            <div><strong>240<span>+</span></strong><small>Five-star reviews</small></div>
          </div>
        </div>
        <div className="pizza-hero-art">
          <div className="hero-sun" />
          <span className="hero-ingredient ingredient-one" aria-hidden="true">🍅</span>
          <span className="hero-ingredient ingredient-two" aria-hidden="true">🫒</span>
          <span className="hero-ingredient ingredient-three" aria-hidden="true">🌿</span>
          <img src={getImageUrl('/uploads/pizzas/veg-extravaganza.jpg')} alt="Fresh vegetable pizza" />
          <div className="hero-price" aria-label="Pizza starts at 249 rupees">
            <span className="hero-price-star" aria-hidden="true">✦</span>
            <span className="hero-price-label">STARTS AT</span>
            <strong>₹249</strong>
            <small>per pizza</small>
          </div>
        </div>
      </section>
      <section className="container home-benefits" aria-label="Why choose Pizza Delivery">
        <div className="benefit-card"><span>🍕</span><div><strong>Made your way</strong><small>Pick every topping</small></div></div>
        <div className="benefit-card"><span>⚡</span><div><strong>Fast delivery</strong><small>Hot in every bite</small></div></div>
        <div className="benefit-card"><span>🔒</span><div><strong>Safe checkout</strong><small>Simple and secure</small></div></div>
        <div className="benefit-card benefit-card-link"><div><strong>{user ? 'Welcome back!' : 'Ready to eat?'}</strong><small>See what’s cooking</small></div><Link to="/menu" aria-label="Open pizza menu">→</Link></div>
      </section>
    </main>
  );
};

export default HomePage;
