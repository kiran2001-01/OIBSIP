const sendControllerError = (res, error, context, message, statusCode = 500) => {
  console.error(`${context}:`, error);
  return res.status(statusCode).json({
    success: false,
    message
  });
};

module.exports = sendControllerError;
