/*
  Firebase project configuration for MapPe.

  This block is not a secret: it identifies the project to Google and is visible
  to anyone who opens the page. What actually protects the project is:
    - Authentication > Settings > Authorized domains (add localhost and any host you deploy to)
    - Which sign-in providers you enable
    - Security rules on Firestore / Storage if you add them later
    - Optional API key restrictions in Google Cloud Console (HTTP referrers)

  Keep real secrets (service accounts, admin keys) out of this folder entirely.
*/
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAf5PJpSXNXTvafUKhrnWRiMu-gicGCBoQ",
  authDomain: "vykpm1.firebaseapp.com",
  projectId: "vykpm1",
  storageBucket: "vykpm1.firebasestorage.app",
  messagingSenderId: "450422318130",
  appId: "1:450422318130:web:bf28e9fd799bd4074cc82b",
  measurementId: "G-QTCTLCW68D"
};

// Firebase JS SDK version used from the Google CDN. Bump in one place.
window.FIREBASE_SDK_VERSION = "12.19.0";

// Where the dashboard lives, and where the login page lives.
window.LOGIN_CONFIG = { dashboardUrl: "./index.html", loginUrl: "./login-story.html" };

// Analytics is off by default: it adds requests and does nothing for sign-in.
// Set to true once you are serving over https from an authorized domain.
window.FIREBASE_ENABLE_ANALYTICS = false;
