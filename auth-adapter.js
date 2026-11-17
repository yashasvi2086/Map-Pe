window.LOGIN_AUTH_STATE = "loading";
try {
/*
  Firebase implementation of the login page's adapter contract.

  The page calls window.LOGIN_AUTH.signIn / signUp / google. When this file is
  loaded, Firebase takes priority over the page's browser-storage fallback.

  Load order matters: firebase-config.js must run first.
*/
const VERSION = window.FIREBASE_SDK_VERSION || "12.19.0";
const CDN = `https://www.gstatic.com/firebasejs/${VERSION}`;

const { initializeApp } = await import(`${CDN}/firebase-app.js`);
const {
  getAuth, setPersistence, browserLocalPersistence, useDeviceLanguage,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  GoogleAuthProvider, onAuthStateChanged, signOut, sendPasswordResetEmail, updateProfile
} = await import(`${CDN}/firebase-auth.js`);

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// Keep the session across reloads so the dashboard guard can see it.
await setPersistence(auth, browserLocalPersistence).catch(() => { });

/* Firebase error codes are precise but unreadable in a UI. Translate the ones
   users actually hit, and pass anything unexpected through unchanged. */
const MESSAGES = {
  "auth/invalid-email": "That email address is not valid.",
  "auth/missing-password": "Enter your password.",
  "auth/user-not-found": "No account exists for that email. Switch to Sign up to create one.",
  "auth/wrong-password": "That password is incorrect.",
  "auth/invalid-credential": "That email and password combination did not match an account.",
  "auth/email-already-in-use": "An account already exists for that email. Switch to Login.",
  "auth/weak-password": "Firebase needs at least 6 characters for the password.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "Network problem reaching Firebase. Check your connection.",
  "auth/operation-not-allowed": "That sign-in method is not enabled in the Firebase console yet.",
  "auth/unauthorized-domain": "This address is not in Firebase Authentication > Settings > Authorized domains.",
  "auth/popup-closed-by-user": "The Google window closed before sign-in finished.",
  "auth/cancelled-popup-request": "Another sign-in window was already open."
};

function translate(error) {
  const readable = MESSAGES[error?.code];
  return readable ? new Error(readable) : (error instanceof Error ? error : new Error(String(error)));
}

async function run(task) {
  try { return await task(); }
  catch (error) { throw translate(error); }
}

window.LOGIN_AUTH = {
  auth,
  updateProfile: (displayName) => run(() => updateProfile(auth.currentUser, { displayName })),
  signIn: (email, password) => run(() => signInWithEmailAndPassword(auth, email.trim(), password)),
  signUp: (email, password) => run(() => createUserWithEmailAndPassword(auth, email.trim(), password)),

  async google() {
    try {
      return await signInWithPopup(auth, provider);
    } catch (error) {
      // Blocked popups are common on mobile browsers; fall back to a redirect.
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(error?.code)) {
        await signInWithRedirect(auth, provider);
        return new Promise(() => { }); // the page navigates away; never resolves here
      }
      throw translate(error);
    }
  },

  resetPassword: (email) => run(() => sendPasswordResetEmail(auth, email.trim())),
  signOut: () => signOut(auth),
  onUser: (callback) => onAuthStateChanged(auth, callback)
};

// Completes a redirect-based Google sign-in when the browser comes back.
getRedirectResult(auth).then(result => {
  if (result?.user) location.assign(window.LOGIN_CONFIG.dashboardUrl);
}).catch(error => {
  window.LOGIN_AUTH_ERROR = translate(error).message;
  window.dispatchEvent(new Event("login-auth:error"));
});

if (window.FIREBASE_ENABLE_ANALYTICS) {
  import(`${CDN}/firebase-analytics.js`)
    .then(async ({ getAnalytics, isSupported }) => { if (await isSupported()) getAnalytics(app); })
    .catch(() => { });
}

// The login page listens for this so its "demo mode" note disappears.
window.LOGIN_AUTH_STATE = "ready";
window.dispatchEvent(new Event("login-auth:ready"));

} catch (error) {
  window.LOGIN_AUTH_STATE = "error";
  window.LOGIN_AUTH_ERROR = "Firebase could not load. Check your internet connection and reload the page. " + (error.message || "");
  window.dispatchEvent(new Event("login-auth:error"));
}
