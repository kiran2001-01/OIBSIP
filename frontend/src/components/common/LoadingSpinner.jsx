import PropTypes from 'prop-types';
import { PropagateLoader } from 'react-spinners';

const LoadingSpinner = ({ text = 'Loading...' }) => (
  <div
    className="d-flex flex-column justify-content-center align-items-center w-100"
    style={{ minHeight: '65vh' }}
    role="status"
    aria-live="polite"
  >
    <div className="mb-4" style={{ height: '30px' }}>
        <PropagateLoader color="#f59e0b" size={17} speedMultiplier={1.1} />
    </div>
    {text && <p className="text-muted fw-semibold mt-2">{text}</p>}
  </div>
);

LoadingSpinner.propTypes = {
  text: PropTypes.string
};

export default LoadingSpinner;
