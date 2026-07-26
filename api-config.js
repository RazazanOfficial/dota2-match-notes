export const apiConfig = {
  webAppUrl:
    "https://script.google.com/macros/s/AKfycbxiAeEj194pF_9SVbdheBAe1dcuUYFQ7WHsPbWmwnjZ1U5AGITT8vJ4eKBhMH_F-0Fw/exec",
};

export const isApiConfigured =
  apiConfig.webAppUrl.startsWith("https://script.google.com/") &&
  apiConfig.webAppUrl.endsWith("/exec");
