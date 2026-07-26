export const apiConfig = {
  webAppUrl:
    "https://script.google.com/macros/s/AKfycbwHjgAFp6ZrKLgpgmKuSCVGujKohyBRBitSsERsvruaFtFeDWREJcj_uqQRZdY1p4ym/exec",
};

export const isApiConfigured =
  apiConfig.webAppUrl.startsWith("https://script.google.com/") &&
  apiConfig.webAppUrl.endsWith("/exec");
