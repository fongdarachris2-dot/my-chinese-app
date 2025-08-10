// src/lib/firebase-core.ts
import { initializeApp, getApps } from 'firebase/app';

const firebaseConfig = {
  // ✅ 把你原本的 firebaseConfig 複製進來（apiKey, authDomain, projectId...）
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
