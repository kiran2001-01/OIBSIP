const steps = [
  { status: 'Pending', label: 'Order received' },
  { status: 'Confirmed', label: 'Confirmed' },
  { status: 'Preparing', label: 'Preparing' },
  { status: 'Out for Delivery', label: 'Out for delivery' },
  { status: 'Delivered', label: 'Delivered' }
];

const OrderProgress = ({ orderStatus, paymentStatus }) => {
  if (orderStatus === 'Cancelled') {
    const message = paymentStatus === 'refund_pending'
      ? 'This order was cancelled. Its refund is being processed.'
      : paymentStatus === 'refunded'
        ? 'This order was cancelled and the payment was refunded.'
        : paymentStatus === 'refund_failed'
          ? 'This order was cancelled, but its refund failed. Please contact support.'
          : 'This order was cancelled.';

    return <p className="alert alert-secondary mt-4 mb-0" role="status">{message}</p>;
  }

  const activeIndex = Math.max(0, steps.findIndex((step) => step.status === orderStatus));
  const statusMessage = paymentStatus === 'pending'
    ? 'Waiting for payment confirmation.'
    : `Current status: ${orderStatus}.`;

  return (
    <section className="order-progress-section mt-4" aria-label="Order progress">
      <h2 className="h5 fw-bold">Order progress</h2>
      <ol className="order-progress">
        {steps.map((step, index) => {
          const isComplete = index < activeIndex;
          const isActive = index === activeIndex;
          const classNames = [
            'order-progress-step',
            isComplete ? 'is-complete' : '',
            isActive ? 'is-active' : ''
          ].filter(Boolean).join(' ');

          return (
            <li
              className={classNames}
              key={step.status}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="order-progress-marker" aria-hidden="true">
                {isComplete ? '✓' : index + 1}
              </span>
              <span className="order-progress-label">{step.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-muted small mb-0" role="status">{statusMessage}</p>
    </section>
  );
};

export default OrderProgress;
