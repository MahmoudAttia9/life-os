// firebase.js — Firebase init & global helpers
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  collection, addDoc, getDocs, deleteDoc, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBtHvklnxlP7ZgTvwJrpgMz4cbWiuhq9TM",
  authDomain: "create-project-36d4c.firebaseapp.com",
  projectId: "create-project-36d4c",
  storageBucket: "create-project-36d4c.firebasestorage.app",
  messagingSenderId: "384696044918",
  appId: "1:384696044918:web:d6e7bb4d2f9eb6fcb1fe57",
  measurementId: "G-4T116SY5FZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GLOBAL HELPERS (Hoisted/Top-level) ---
function dateKeyFromLocalDate(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const todayStr = () => dateKeyFromLocalDate(new Date());
const uid = () => auth.currentUser?.uid;

function parseDateKey(dateKey) {
  const target = dateKey || todayStr();
  const [y, m, d] = String(target).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function cloneData(data) {
  if (data == null) return data;
  return JSON.parse(JSON.stringify(data));
}

function withTimeout(promise, timeoutMs = 10000, timeoutMessage = 'Operation timed out') {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(timeoutMessage));
    }, Math.max(1000, timeoutMs || 0));

    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

// --- STORAGE CONFIG ---
const normalizeBucketName = (bucket = '') => String(bucket || '').trim().replace(/^gs:\/\//, '');
const configuredBucket = normalizeBucketName(firebaseConfig.storageBucket);
const inferredModernBucket = normalizeBucketName(`${firebaseConfig.projectId}.firebasestorage.app`);
const inferredLegacyBucket = normalizeBucketName(`${firebaseConfig.projectId}.appspot.com`);

const storageBuckets = [
  configuredBucket,
  inferredModernBucket,
  inferredLegacyBucket
].filter((value, idx, arr) => value && arr.indexOf(value) === idx);

const storageClients = storageBuckets.length
  ? storageBuckets.map((bucket) => getStorage(app, `gs://${bucket}`))
  : [getStorage(app)];

const storage = storageClients[0];
let isAvatarStorageUploadBlocked = false;

// --- CACHE & DATA OPS ---
const CACHE_TTL_MS = 45 * 1000;
const dailyDocCache = new Map();
const lastDaysCache = new Map();
const userDocCache = new Map();
const booksCache = new Map();

function scopedKey(scope, suffix = '') {
  return `${uid() || 'guest'}::${scope}::${suffix}`;
}

function getCachedValue(cache, key, ttlMs = CACHE_TTL_MS) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) {
    cache.delete(key);
    return null;
  }
  return cloneData(entry.value);
}

function setCachedValue(cache, key, value) {
  cache.set(key, { value: cloneData(value), ts: Date.now() });
}

function clearScopedCache(cache, scope) {
  const prefix = `${uid() || 'guest'}::${scope}::`;
  Array.from(cache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) cache.delete(key);
  });
}

function createInitialDailyData(dateKey) {
  return {
    date: dateKey,
    worship: {
      fajr: false,
      duhr: false,
      asr: false,
      maghrib: false,
      isha: false,
      prayerLocation: { fajr: 'home', duhr: 'home', asr: 'home', maghrib: 'home', isha: 'home' },
      sunnah: {
        fajr2: false,
        duhrBefore4: false,
        duhrAfter2: false,
        asrBefore4: false,
        maghribAfter2: false,
        ishaAfter2: false,
        witr: false,
        duha: false
      },
      qiyam: { done: false, rakaat: 0 },
      quranPages: 0,
      azkarMorning: false,
      azkarEvening: false
    },
    work: {
      tasks: [],
      focusMinutes: 0,
      pomodoroCount: 0,
      currentPomodoro: { category: 'work', subject: '' },
      categoryTime: { work: 0, course: 0, programming: 0, college: 0 },
      courses: [],
      projects: [],
      studyFocus: ''
    },
    reading: { pagesRead: 0 },
    podcast: { minutes: 0, sessions: [] },
    fitness: { done: false, duration: 0, reps: 0, type: 'other', exercise: '', notes: '', workouts: [] },
    sleep: {
      bedtime: '',
      wakeTime: '',
      latency: 0,
      wakeups: 0,
      quality: 5,
      energy: 5,
      mood: 'neutral',
      dreamIntensity: 3,
      snoring: false,
      sweating: false,
      breathing: 'normal',
      position: 'back',
      napDuration: 0,
      stages: { light: 0, deep: 0, rem: 0, awake: 0 },
      caffeine: [],
      hydration: { amount: 0, quality: 'normal', electrolytes: false },
      factors: {
        screenTime: 0,
        stress: 5,
        temp: 22,
        noise: 'normal',
        darkness: 'dim',
        workoutTime: '',
        heavyMeal: false,
        alcohol: 0,
        nicotine: false,
        medication: '',
        blueLight: 0,
        meditation: false
      },
      score: 0,
      insights: []
    },
    score: 0
  };
}

// ─── API Methods ──────────────────────────────────────────────
async function getTodayData() {
  return getDailyData(todayStr());
}


async function getDailyData(dateKey = todayStr()) {
  if (!uid()) return null;
  const key = scopedKey('daily', dateKey);
  const cached = getCachedValue(dailyDocCache, key);
  if (cached) return cached;

  const ref_ = doc(db, 'users', uid(), 'daily', dateKey);
  const snap = await getDoc(ref_);
  if (snap.exists()) {
    const data = snap.data();
    setCachedValue(dailyDocCache, key, data);
    return cloneData(data);
  }

  const init = createInitialDailyData(dateKey);
  await setDoc(ref_, init);
  setCachedValue(dailyDocCache, key, init);
  return cloneData(init);
}

async function getDailyDataIfExists(dateKey = todayStr()) {
  if (!uid()) return null;
  const key = scopedKey('daily', dateKey);
  const cached = getCachedValue(dailyDocCache, key);
  if (cached) return cached;

  const snap = await getDoc(doc(db, 'users', uid(), 'daily', dateKey));
  if (!snap.exists()) return null;

  const data = snap.data();
  setCachedValue(dailyDocCache, key, data);
  return cloneData(data);
}

async function saveTodayData(data) {
  return saveDailyData(todayStr(), data);
}

async function saveDailyData(dateKey = todayStr(), data) {
  if (!uid()) return;
  await setDoc(doc(db, 'users', uid(), 'daily', dateKey), data, { merge: true });
  dailyDocCache.delete(scopedKey('daily', dateKey));
  clearScopedCache(lastDaysCache, 'lastDays');
}

async function getUserData() {
  if (!uid()) return null;
  const key = scopedKey('profile', 'self');
  const cached = getCachedValue(userDocCache, key);
  if (cached) return cached;

  const snap = await getDoc(doc(db, 'users', uid()));
  if (!snap.exists()) return null;
  const data = snap.data();
  setCachedValue(userDocCache, key, data);
  return cloneData(data);
}

async function saveUserData(data) {
  if (!uid()) return;
  await setDoc(doc(db, 'users', uid()), data, { merge: true });
  userDocCache.delete(scopedKey('profile', 'self'));
}

// Get last N days data
async function getLastNDays(n, endDateKey = todayStr()) {
  if (!uid()) return [];

  const safeN = Math.max(1, parseInt(n, 10) || 1);
  const safeEndDateKey = String(endDateKey || todayStr());
  const key = scopedKey('lastDays', `${safeN}::${safeEndDateKey}`);
  const cached = getCachedValue(lastDaysCache, key);
  if (cached) return cached;

  const dailyRef = collection(db, 'users', uid(), 'daily');
  const q = query(
    dailyRef,
    where('date', '<=', safeEndDateKey),
    orderBy('date', 'desc'),
    limit(safeN)
  );
  const snap = await getDocs(q);

  const byDate = new Map();
  snap.docs.forEach((docSnap) => {
    const row = docSnap.data() || {};
    const date = row.date || docSnap.id;
    byDate.set(date, { date, ...row });
  });

  const days = [];
  const anchorDate = parseDateKey(safeEndDateKey);
  for (let i = 0; i < safeN; i++) {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() - i);
    days.push(dateKeyFromLocalDate(d));
  }

  const result = days.map((day) => byDate.get(day) || { date: day });
  setCachedValue(lastDaysCache, key, result);

  result.forEach((entry) => {
    if (entry && entry.date && Object.keys(entry).length > 1) {
      setCachedValue(dailyDocCache, scopedKey('daily', entry.date), entry);
    }
  });

  return cloneData(result);
}

// Upload avatar
async function uploadAvatar(file) {
  if (isAvatarStorageUploadBlocked) {
    throw new Error('Avatar storage upload is currently unavailable.');
  }

  const safeName = String(file?.name || 'avatar.jpg').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const objectPath = `avatars/${uid()}/${Date.now()}-${safeName}`;
  let lastError = null;

  for (const client of storageClients) {
    try {
      const storageRef = ref(client, objectPath);
      await withTimeout(
        uploadBytes(storageRef, file, { contentType: file?.type || 'image/jpeg' }),
        4500,
        'Avatar upload timed out'
      );
      const url = await withTimeout(getDownloadURL(storageRef), 4000, 'Avatar URL request timed out');
      await withTimeout(updateProfile(auth.currentUser, { photoURL: url }), 4000, 'Auth update timed out');
      await withTimeout(saveUserData({ photoURL: url, avatarDataUrl: null }), 5000, 'Profile sync timed out');
      return url;
    } catch (error) {
      lastError = error;
    }
  }

  isAvatarStorageUploadBlocked = true;
  throw lastError || new Error('Avatar upload failed.');
}

// Books CRUD
async function getBooks() {
  if (!uid()) return [];
  const key = scopedKey('books', 'all');
  const cached = getCachedValue(booksCache, key);
  if (cached) return cached;

  const snap = await getDocs(collection(db, 'users', uid(), 'books'));
  const result = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  setCachedValue(booksCache, key, result);
  return cloneData(result);
}

async function addBook(data) {
  const ref_ = await addDoc(collection(db, 'users', uid(), 'books'), data);
  booksCache.delete(scopedKey('books', 'all'));
  return ref_;
}

async function updateBook(id, data) {
  await updateDoc(doc(db, 'users', uid(), 'books', id), data);
  booksCache.delete(scopedKey('books', 'all'));
}

async function deleteBook(id) {
  await deleteDoc(doc(db, 'users', uid(), 'books', id));
  booksCache.delete(scopedKey('books', 'all'));
}

export {
  auth, db, storage,
  onAuthStateChanged, signOut, updateProfile,
  todayStr, uid,
  getTodayData, saveTodayData,
  getDailyData, getDailyDataIfExists, saveDailyData,
  getUserData, saveUserData,
  getLastNDays,
  uploadAvatar,
  getBooks, addBook, updateBook, deleteBook,
  dateKeyFromLocalDate, parseDateKey
};
