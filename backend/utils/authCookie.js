// const AUTH_COOKIE_NAME = "pizza_auth";
// const RESET_COOKIE_NAME = "pizza_password_reset";

// const authCookieOptions = () => ({
//   httpOnly: true,
//   secure: process.env.NODE_ENV === "production",
//   sameSite: "lax",
//   path: "/"
// });

// const resetCookieOptions = () => ({
//   httpOnly: true,
//   secure: process.env.NODE_ENV === "production",
//   sameSite: "lax",
//   path: "/api/auth/reset-password"
// });

// const setAuthCookie = (res, token) => {
//   res.cookie(AUTH_COOKIE_NAME, token, {
//     ...authCookieOptions(),
//     maxAge: 24 * 60 * 60 * 1000
//   });
// };

// const clearAuthCookie = (res) => {
//   res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions());
// };

// const setResetCookie = (res, token) => {
//   res.cookie(RESET_COOKIE_NAME, token, {
//     ...resetCookieOptions(),
//     maxAge: 10 * 60 * 1000
//   });
// };

// const clearResetCookie = (res) => {
//   res.clearCookie(RESET_COOKIE_NAME, resetCookieOptions());
// };

// const getCookieValue = (req, name) => {
//   const cookieHeader = req.headers.cookie || "";
//   const tokenCookie = cookieHeader
//     .split(";")
//     .map((cookie) => cookie.trim())
//     .find((cookie) => cookie.startsWith(`${name}=`));

//   if (!tokenCookie) {
//     return "";
//   }

//   try {
//     return decodeURIComponent(tokenCookie.slice(name.length + 1));
//   } catch {
//     return "";
//   }
// };

// const getAuthToken = (req) => getCookieValue(req, AUTH_COOKIE_NAME);
// const getResetToken = (req) => getCookieValue(req, RESET_COOKIE_NAME);

// module.exports = {
//   AUTH_COOKIE_NAME,
//   RESET_COOKIE_NAME,
//   setAuthCookie,
//   clearAuthCookie,
//   getAuthToken,
//   setResetCookie,
//   clearResetCookie,
//   getResetToken
// };

const AUTH_COOKIE_NAME = "pizza_auth";
const RESET_COOKIE_NAME = "pizza_password_reset";

const isProduction = () => process.env.NODE_ENV === "production";

const authCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: isProduction() ? "none" : "lax",
  path: "/"
});

const resetCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: isProduction() ? "none" : "lax",
  path: "/api/auth/reset-password"
});

const setAuthCookie = (res, token) => {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...authCookieOptions(),
    maxAge: 24 * 60 * 60 * 1000
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions());
};

const setResetCookie = (res, token) => {
  res.cookie(RESET_COOKIE_NAME, token, {
    ...resetCookieOptions(),
    maxAge: 10 * 60 * 1000
  });
};

const clearResetCookie = (res) => {
  res.clearCookie(RESET_COOKIE_NAME, resetCookieOptions());
};

const getCookieValue = (req, name) => {
  const cookieHeader = req.headers.cookie || "";
  const tokenCookie = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  if (!tokenCookie) {
    return "";
  }

  try {
    return decodeURIComponent(tokenCookie.slice(name.length + 1));
  } catch {
    return "";
  }
};

const getAuthToken = (req) => getCookieValue(req, AUTH_COOKIE_NAME);
const getResetToken = (req) => getCookieValue(req, RESET_COOKIE_NAME);

module.exports = {
  AUTH_COOKIE_NAME,
  RESET_COOKIE_NAME,
  setAuthCookie,
  clearAuthCookie,
  getAuthToken,
  setResetCookie,
  clearResetCookie,
  getResetToken
};