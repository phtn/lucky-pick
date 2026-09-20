import { type FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
  type UserCredential
} from 'firebase/auth'

export const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID
} satisfies FirebaseOptions

const requiredConfig = {
  PUBLIC_FIREBASE_API_KEY: firebaseConfig.apiKey,
  PUBLIC_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  PUBLIC_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  PUBLIC_FIREBASE_APP_ID: firebaseConfig.appId
}

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean)
const missingConfig = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([name]) => name)

if (missingConfig.length > 0) {
  throw new Error(`Missing Firebase configuration: ${missingConfig.join(', ')}`)
}

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const googleProvider = new GoogleAuthProvider()
let authStateReady = false

export function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider)
}

export function signOutCurrentUser(): Promise<void> {
  return signOut(auth)
}

export function subscribeToAuthState(onStoreChange: () => void): () => void {
  return onAuthStateChanged(auth, () => {
    authStateReady = true
    onStoreChange()
  })
}

export function getCurrentUser(): User | null {
  return auth.currentUser
}

export function getServerAuthUser(): User | null {
  return null
}

export function getAuthStateReady(): boolean {
  return authStateReady
}

export function getServerAuthStateReady(): boolean {
  return false
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in with Google to access your files.')

  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${await user.getIdToken()}`)
  return await fetch(input, { ...init, headers })
}
