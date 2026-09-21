import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyC49VUOAVwkz_hQPXSS-sdNddHeLKgzNcQ',
  authDomain: 'cybernet-6d25f.firebaseapp.com',
  projectId: 'cybernet-6d25f',
  storageBucket: 'cybernet-6d25f.firebasestorage.app',
  messagingSenderId: '848288216333',
  appId: '1:848288216333:web:a0d051c9572ff9a272ac44',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig as any);

export const auth = getAuth(app);

