export const apiConfig = {
  webAppUrl:
    "https://script.google.com/macros/s/AKfycbx-cUlVFfImRM1XY7ynocmuf8OOkmysgsZSO68rVaxl2bVPBQQ4aOtITmMpYe8WtbW9/exec",
};

export const isApiConfigured =
  apiConfig.webAppUrl.startsWith("https://script.google.com/") &&
  apiConfig.webAppUrl.endsWith("/exec");
