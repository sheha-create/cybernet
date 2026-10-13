const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/operation-not-allowed':
    'This sign-in method is disabled. In the Firebase console open Authentication > Sign-in method and enable it.',
  'auth/configuration-not-found':
    'No sign-in provider is enabled. In the Firebase console open Authentication and click "Get started", then enable a provider.',
  'auth/unauthorized-domain':
    'This domain is not authorised. In the Firebase console open Authentication > Settings > Authorized domains and add it.',
  'auth/invalid-api-key':
    'The Firebase API key was rejected. Check VITE_FIREBASE_API_KEY in your .env file.',
  'auth/api-key-not-found':
    'The Firebase API key was rejected. Check VITE_FIREBASE_API_KEY in your .env file.',
  'auth/app-not-authorized':
    'This Firebase project is not authorised for sign-in. Check the project id in your .env file.',
  'auth/invalid-credential':
    'Incorrect email or password.',
  'auth/user-not-found':
    'No account exists for that email address.',
  'auth/wrong-password':
    'Incorrect email or password.',
  'auth/invalid-email':
    'That email address is not valid.',
  'auth/email-already-in-use':
    'An account already exists for that email address. Try signing in instead.',
  'auth/weak-password':
    'Choose a password with at least 6 characters.',
  'auth/missing-password':
    'Enter your password.',
  'auth/popup-closed-by-user':
    'The sign-in window was closed before finishing.',
  'auth/popup-blocked':
    'Your browser blocked the sign-in popup. Allow popups for this site and try again.',
  'auth/cancelled-popup-request':
    'A sign-in window was already open. Close it and try again.',
  'auth/network-request-failed':
    'Network error while contacting Firebase. Check your connection.',
  'auth/too-many-requests':
    'Too many attempts. Wait a moment and try again.',
  'auth/user-disabled':
    'This account has been disabled.',
};

export function describeAuthError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

  if (AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];

  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message)
    : String(error ?? '');

  if (!message) return 'Something went wrong. Please try again.';
  return code ? `${code.replace('auth/', '').replace(/-/g, ' ')}: ${message}` : message;
}
