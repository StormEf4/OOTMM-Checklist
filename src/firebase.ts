/* Coop outside the Claude hosted page: the same live rooms, kept in the owner's own Firebase project.
   The Firebase libraries load from Google only when Coop is used, so the app stays small and offline-friendly.
   firebase-config.json holds the project's public web config. Leave it empty to turn this off. */
import config from '../firebase-config.json';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

export type FireConfig = { apiKey?: string; authDomain?: string; projectId?: string; appId?: string; [k: string]: unknown };
/* Tests can stand in a config before the app starts. */
export const firebaseConfig = ((globalThis as any).__OOTMM_FIREBASE__ ?? config) as FireConfig;
export const firebaseReady = () => !!(firebaseConfig.apiKey && firebaseConfig.projectId);

/** A document handle shaped like the hosted page's db, so live play can use either one. */
export type LiveDoc = {
  get(): Promise<{ exists: boolean; data(): any }>;
  set(data: any): Promise<void>;
  onSnapshot(next: (snap: any) => void, err?: (e: any) => void): () => void;
};
export type LiveDb = { doc(path: string): LiveDoc };

let pending: Promise<LiveDb | null> | null = null;

/** Signs this device in anonymously and returns a db, or null if Firebase isn't set up or can't be reached. */
export function connectFirebase(): Promise<LiveDb | null> {
  if (!firebaseReady()) return Promise.resolve(null);
  return pending ??= (async () => {
    try {
      const load = (m: string) => import(/* @vite-ignore */ SDK + m);
      const [app, auth, fs] = await Promise.all([load('firebase-app.js'), load('firebase-auth.js'), load('firebase-firestore.js')]);
      const a = app.initializeApp(firebaseConfig, 'ootmm-coop');
      await auth.signInAnonymously(auth.getAuth(a));
      const store = fs.getFirestore(a);
      const wrap = (s: any) => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
      return {
        doc(path: string): LiveDoc {
          const ref = fs.doc(store, path);
          return {
            get: async () => wrap(await fs.getDoc(ref)),
            set: async data => { await fs.setDoc(ref, data); },
            onSnapshot: (next, err) => fs.onSnapshot(ref, (s: any) => next(wrap(s)), (e: any) => err?.(e)),
          };
        },
      };
    } catch {
      pending = null;
      return null;
    }
  })();
}
