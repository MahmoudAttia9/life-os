// app.js — Full Life OS Logic
import {
    auth, onAuthStateChanged, signOut, updateProfile,
    todayStr, getTodayData, saveTodayData as saveTodayDataDoc,
    getDailyData, saveDailyData, dateKeyFromLocalDate, parseDateKey,
    getUserData, saveUserData, getLastNDays,
    uploadAvatar, getBooks, addBook, updateBook, deleteBook as deleteBookDoc
} from './firebase.js';

// Ignore browser extension/injected script runtime noise (e.g., spoofer.js)
const isExternalInjectedError = (text = '') => /spoofer\.js|chrome-extension:|moz-extension:/i.test(String(text || ''));

window.addEventListener('error', (event) => {
    const src = event?.filename || event?.target?.src || '';
    const msg = event?.message || '';
    if (isExternalInjectedError(src) || isExternalInjectedError(msg)) {
        event.preventDefault();
    }
}, true);

window.addEventListener('unhandledrejection', (event) => {
    const reasonText = event?.reason?.stack || event?.reason?.message || String(event?.reason || '');
    if (isExternalInjectedError(reasonText)) {
        event.preventDefault();
    }
});

// ─── State ────────────────────────────────────────────────
let currentUser = null;
let todayData = null;
let userProfile = null;
let books = [];
let activeDate = todayStr();

// Proxy saveTodayData to use the currently active date
async function saveTodayData(data) {
    return saveDailyData(activeDate, data);
}
let timerInterval = null;
let timerRunning = false;
let timerSeconds = 25 * 60;
let timerMode = 'work'; // 'work' | 'break'
let pomodoroCount = 0;
let focusMinutes = 0;
let selectedBookForUpdate = null;
let notificationsReady = false;

const PRAYERS = [
    { key: 'fajr', name: 'الفجر', icon: '🌙' },
    { key: 'duhr', name: 'الظهر', icon: '☀️' },
    { key: 'asr', name: 'العصر', icon: '🌤️' },
    { key: 'maghrib', name: 'المغرب', icon: '🌆' },
    { key: 'isha', name: 'العشاء', icon: '🌃' },
];

const AZKAR = [
    { key: 'azkarMorning', name: 'أذكار الصباح', icon: '🌅' },
    { key: 'azkarEvening', name: 'أذكار المساء', icon: '🌙' },
];

const SUNNAH_ITEMS = [
    { key: 'fajr2', name: 'سنة الفجر (2)', icon: '🌙' },
    { key: 'duhrBefore4', name: 'قبل الظهر (4)', icon: '☀️' },
    { key: 'duhrAfter2', name: 'بعد الظهر (2)', icon: '☀️' },
    { key: 'asrBefore4', name: 'قبل العصر (4)', icon: '🌤️' },
    { key: 'maghribAfter2', name: 'بعد المغرب (2)', icon: '🌆' },
    { key: 'ishaAfter2', name: 'بعد العشاء (2)', icon: '🌃' },
    { key: 'witr', name: 'الوتر', icon: '✨' },
    { key: 'duha', name: 'الضحى', icon: '🌞' }
];

const PRAYER_LOCATIONS = {
    home: 'البيت',
    mosque: 'المسجد'
};

const WORK_CATEGORIES = [
    { key: 'work', name: 'Work', icon: '💼', color: 'rgb(59, 130, 246)' },
    { key: 'course', name: 'Course', icon: '📚', color: 'rgb(139, 92, 246)' },
    { key: 'programming', name: 'Programming', icon: '💻', color: 'rgb(34, 197, 94)' },
    { key: 'college', name: 'Study', icon: '🎓', color: 'rgb(168, 85, 247)' }
];

const DURATION_UNITS = [
    { key: 'hours', label: 'hours', short: 'h' },
    { key: 'days', label: 'days', short: 'd' },
    { key: 'weeks', label: 'weeks', short: 'w' },
    { key: 'months', label: 'months', short: 'm' }
];

const WORK_TABS = ['tasks', 'courses', 'projects', 'stats'];

const ENGLISH_TOPICS = [
    'Productivity', 'Career', 'Health', 'Mindset', 'Communication',
    'Leadership', 'Technology', 'Habits', 'Learning', 'Business'
];

const ENGLISH_WORD_BANK = [
    { word: 'optimize', meaning: 'to make as perfect or effective as possible', field: 'technology', level: 'medium' },
    { word: 'debug', meaning: 'to identify and remove errors from software', field: 'technology', level: 'easy' },
    { word: 'scalable', meaning: 'able to be changed in size or scale', field: 'technology', level: 'hard' },
    { word: 'automation', meaning: 'the use of technology to perform tasks with reduced human assistance', field: 'technology', level: 'medium' },
    { word: 'prioritize', meaning: 'designate or treat as more important than others', field: 'business', level: 'medium' },
    { word: 'strategy', meaning: 'a plan of action designed to achieve a long-term aim', field: 'business', level: 'medium' },
    { word: 'efficient', meaning: 'achieving maximum productivity with minimum wasted effort', field: 'business', level: 'medium', tricky: 'effective-vs-efficient' },
    { word: 'effective', meaning: 'successful in producing a desired or intended result', field: 'business', level: 'medium', tricky: 'effective-vs-efficient' },
    { word: 'deliver', meaning: 'to provide something promised or expected', field: 'business', level: 'easy' },
    { word: 'budget', meaning: 'an estimate of income and expenditure for a set period', field: 'business', level: 'easy' },
    { word: 'hydration', meaning: 'the process of providing adequate water to the body', field: 'health', level: 'medium' },
    { word: 'resilient', meaning: 'able to withstand or recover quickly from difficult conditions', field: 'health', level: 'hard' },
    { word: 'stamina', meaning: 'the ability to sustain prolonged physical or mental effort', field: 'health', level: 'medium' },
    { word: 'nutrition', meaning: 'the process of providing or obtaining the food necessary for health and growth', field: 'health', level: 'easy' },
    { word: 'recovery', meaning: 'a return to a normal state of health, mind, or strength', field: 'sports', level: 'easy' },
    { word: 'momentum', meaning: 'the quantity of motion of a moving body', field: 'sports', level: 'medium' },
    { word: 'discipline', meaning: 'the practice of training people to obey rules or a code of behavior', field: 'sports', level: 'easy' },
    { word: 'consistency', meaning: 'conformity in the application of something, typically that which is necessary for the sake of logic, accuracy, or fairness', field: 'sports', level: 'easy' },
    { word: 'mindset', meaning: 'the established set of attitudes held by someone', field: 'psychology', level: 'medium' },
    { word: 'self-awareness', meaning: 'conscious knowledge of one\'s own character, feelings, motives, and desires', field: 'psychology', level: 'hard' },
    { word: 'confidence', meaning: 'the feeling or belief that one can rely on someone or something', field: 'psychology', level: 'easy' },
    { word: 'adapt', meaning: 'make something suitable for a new use or purpose; modify', field: 'psychology', level: 'easy' },
    { word: 'errand', meaning: 'a short journey undertaken in order to deliver or collect something', field: 'daily-life', level: 'easy' },
    { word: 'commute', meaning: 'travel some distance between one\'s home and place of work on a regular basis', field: 'daily-life', level: 'medium' },
    { word: 'balance', meaning: 'an even distribution of weight enabling someone or something to remain upright and steady', field: 'daily-life', level: 'easy' },
    { word: 'routine', meaning: 'a sequence of actions regularly followed', field: 'daily-life', level: 'easy' },
    { word: 'collaborate', meaning: 'work jointly on an activity, especially to produce or create something', field: 'communication', level: 'easy' },
    { word: 'clarity', meaning: 'the quality of being coherent and intelligible', field: 'communication', level: 'medium' },
    { word: 'persuade', meaning: 'cause someone to do something through reasoning or argument', field: 'communication', level: 'hard' },
    { word: 'insight', meaning: 'the capacity to gain an accurate and deep intuitive understanding of a person or thing', field: 'communication', level: 'medium' }
];

// ─── Duration Conversion Helpers ───
function convertToHours(duration, unit) {
    if (!duration || duration <= 0) return 0;
    switch (unit) {
        case 'minutes': return duration / 60;
        case 'hours': return duration;
        case 'days': return duration * 8; // Assume 8 hours per day
        case 'weeks': return duration * 40; // Assume 40 hours per week
        case 'months': return duration * 160; // Assume 4 weeks per month (160 hours)
        default: return duration;
    }
}

function formatDuration(duration, unit, includeUnit = true) {
    if (!duration || duration <= 0) return '-';
    const labels = {
        minutes: 'min',
        hours: 'hours',
        days: 'days',
        weeks: 'weeks'
    };
    return includeUnit ? `${duration} ${labels[unit] || unit}` : duration;
}

function convertToDays(duration, unit) {
    if (!duration || duration <= 0) return 0;
    switch (unit) {
        case 'hours': return duration / 8;
        case 'days': return duration;
        case 'weeks': return duration * 7;
        case 'months': return duration * 30;
        default: return duration;
    }
}

function ensureWorshipDefaults(target) {
    if (!target.worship) target.worship = {};
    if (!target.worship.prayerLocation) target.worship.prayerLocation = {};
    if (!target.worship.sunnah) target.worship.sunnah = {};
    if (!target.worship.qiyam || typeof target.worship.qiyam !== 'object') {
        target.worship.qiyam = { done: false, rakaat: 0 };
    }

    PRAYERS.forEach((p) => {
        if (typeof target.worship[p.key] !== 'boolean') target.worship[p.key] = false;
        if (!target.worship.prayerLocation[p.key]) target.worship.prayerLocation[p.key] = 'home';
    });

    AZKAR.forEach((a) => {
        if (typeof target.worship[a.key] !== 'boolean') target.worship[a.key] = false;
    });

    SUNNAH_ITEMS.forEach((s) => {
        if (typeof target.worship.sunnah[s.key] !== 'boolean') target.worship.sunnah[s.key] = false;
    });

    if (typeof target.worship.quranPages !== 'number') target.worship.quranPages = 0;
    if (typeof target.worship.qiyam.done !== 'boolean') target.worship.qiyam.done = false;
    if (typeof target.worship.qiyam.rakaat !== 'number') target.worship.qiyam.rakaat = 0;
}

function getDailyQuranGoal() {
    const doneFirstJuz = !!userProfile?.goals?.firstJuzCompleted;
    return doneFirstJuz ? 20 : 22;
}

function getWorshipMetrics(data = todayData) {
    const worship = data?.worship || {};
    const fardDone = PRAYERS.filter((p) => worship[p.key]).length;
    const sunnahDone = SUNNAH_ITEMS.filter((s) => worship.sunnah?.[s.key]).length;
    const azkarDone = AZKAR.filter((a) => worship[a.key]).length;
    const quranPages = worship.quranPages || 0;
    const quranGoal = getDailyQuranGoal();
    const qiyamDone = worship.qiyam?.done ? 1 : 0;

    const totalItems = PRAYERS.length + SUNNAH_ITEMS.length + AZKAR.length + 2;
    const quranCredit = Math.min(quranPages / quranGoal, 1);
    const doneItems = fardDone + sunnahDone + azkarDone + quranCredit + qiyamDone;
    const score = Math.round((doneItems / totalItems) * 100);

    const mosquePrayers = PRAYERS.filter((p) => worship[p.key] && worship.prayerLocation?.[p.key] === 'mosque').length;
    const homePrayers = PRAYERS.filter((p) => worship[p.key] && worship.prayerLocation?.[p.key] !== 'mosque').length;

    return {
        score,
        fardDone,
        sunnahDone,
        azkarDone,
        quranPages,
        quranGoal,
        qiyamDone,
        qiyamRakaat: worship.qiyam?.rakaat || 0,
        mosquePrayers,
        homePrayers
    };
}

function ensureWorkDefaults(target) {
    if (!target.work) target.work = {};
    if (!Array.isArray(target.work.tasks)) target.work.tasks = [];
    if (typeof target.work.pomodoroCount !== 'number') target.work.pomodoroCount = 0;
    if (typeof target.work.focusMinutes !== 'number') target.work.focusMinutes = 0;
    if (!target.work.pomodoroCategory) target.work.pomodoroCategory = 'work';
    if (!target.work.categoryTime) target.work.categoryTime = { work: 0, course: 0, programming: 0, college: 0 };
}

function ensureWorkLibraryDefaults() {
    if (!userProfile) userProfile = {};
    if (!userProfile.workLibrary) userProfile.workLibrary = {};
    if (!Array.isArray(userProfile.workLibrary.courses)) userProfile.workLibrary.courses = [];
    if (!Array.isArray(userProfile.workLibrary.projects)) userProfile.workLibrary.projects = [];
}

function ensureFitnessDefaults(target) {
    if (!userProfile) userProfile = {};
    if (!target.fitness) target.fitness = { done: false, duration: 0, type: '', notes: '' };
    if (!target.fitness.metrics) {
        target.fitness.metrics = userProfile?.fitness?.metrics || {
            weight: 0, height: 0, age: 0, gender: 'male', activity: '1.55',
            waist: 0, neck: 0, hip: 0, bodyFat: 0, bmi: 0, tdee: 0
        };
    }
    if (!userProfile.fitness) userProfile.fitness = { metrics: target.fitness.metrics, weightHistory: [] };
    if (!Array.isArray(userProfile.fitness.weightHistory)) userProfile.fitness.weightHistory = [];
}

// ─── Metrics Calculations ───
function calculateBMI(weight, heightCm) {
    if (!weight || !heightCm) return 0;
    const heightM = heightCm / 100;
    return Math.round((weight / (heightM * heightM)) * 10) / 10;
}

function calculateBodyFat(gender, height, waist, neck, hip = 0) {
    if (!height || !waist || !neck || waist <= neck) return 0;
    let bf = 0;
    try {
        if (gender === 'male') {
            const diff = waist - neck;
            bf = 495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(height)) - 450;
        } else {
            if (!hip || (waist + hip - neck) <= 0) return 0;
            const diff = waist + hip - neck;
            bf = 495 / (1.29579 - 0.35004 * Math.log10(diff) + 0.221 * Math.log10(height)) - 450;
        }
    } catch (e) { return 0; }
    return Math.max(3, Math.min(60, Math.round(bf * 10) / 10));
}

function calculateTDEE(gender, weight, height, age, activity) {
    if (!weight || !height || !age) return 0;
    // Mifflin-St Jeor Formula
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr = gender === 'male' ? bmr + 5 : bmr - 161;
    return Math.round(bmr * parseFloat(activity));
}

function ensureLearningDefaults(target) {
    if (!target.learning) {
        target.learning = {
            done: false,
            mode: 'english', // english | general
            difficulty: 'medium', // easy | medium | hard
            targetWords: 3,
            topic: '',
            dateKey: '',
            entries: [],
            word: '',
            sentence: ''
        };
    }
    if (typeof target.learning.done !== 'boolean') target.learning.done = false;
    if (!['english', 'general'].includes(target.learning.mode)) target.learning.mode = 'english';
    if (!['easy', 'medium', 'hard'].includes(target.learning.difficulty)) target.learning.difficulty = 'medium';
    if (typeof target.learning.targetWords !== 'number') target.learning.targetWords = 3;
    target.learning.targetWords = Math.min(10, Math.max(1, parseInt(target.learning.targetWords) || 3));
    if (target.learning.mode === 'english') target.learning.targetWords = 3;
    if (typeof target.learning.topic !== 'string') target.learning.topic = '';
    if (typeof target.learning.dateKey !== 'string') target.learning.dateKey = '';
    if (!Array.isArray(target.learning.entries)) target.learning.entries = [];
    if (typeof target.learning.word !== 'string') target.learning.word = '';
    if (typeof target.learning.sentence !== 'string') target.learning.sentence = '';
}

function createSeedFromDate(dateKey) {
    return String(dateKey || todayStr()).split('-').join('').split('').reduce((s, ch) => s + Number(ch || 0), 0);
}

function getWordDifficulty(entry, idx) {
    if (entry.level) return entry.level;
    if (idx < 7) return 'easy';
    if (idx < 14) return 'medium';
    return 'hard';
}


function escapeRegExp(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}



function getCoursesCatalog() {
    ensureWorkLibraryDefaults();
    return userProfile.workLibrary.courses;
}

function getProjectsCatalog() {
    ensureWorkLibraryDefaults();
    return userProfile.workLibrary.projects;
}

function getWorkMetrics(data = todayData) {
    const work = data?.work || {};
    const tasksDone = work.tasks?.filter(t => t.done).length || 0;
    const tasksTotal = work.tasks?.length || 0;

    // Course progress: Persistent courses, progress based on consumed hours.
    const coursesData = getCoursesCatalog();
    const courseMetrics = coursesData.map(c => {
        const linkedTasks = work.tasks?.filter(t => t.linkedType === 'course' && t.linkedId === c.id) || [];
        const linkedDone = linkedTasks.filter(t => t.done).length;
        const linkedTotal = linkedTasks.length;
        const totalDurationHours = convertToHours(c.duration, c.durationUnit || 'hours');
        const consumedHours = Math.max(0, Number(c.consumedHours || 0));
        const remainingHours = Math.max(0, totalDurationHours - consumedHours);
        const calculatedProgress = totalDurationHours > 0
            ? Math.round((consumedHours / totalDurationHours) * 100)
            : (linkedTotal > 0 ? Math.round((linkedDone / linkedTotal) * 100) : 0);

        return {
            ...c,
            calculatedProgress,
            linkedTotal,
            linkedDone,
            totalTimeSpentHours: Math.round(consumedHours * 10) / 10,
            remainingHours: Math.round(remainingHours * 10) / 10,
            totalDurationHours
        };
    });
    const courseProgress = courseMetrics.length > 0 ? courseMetrics.reduce((s, c) => s + c.calculatedProgress, 0) / courseMetrics.length : 0;

    // Project progress: Persistent projects, progress based on elapsed days to deadline.
    const projectsData = getProjectsCatalog();
    const projectMetrics = projectsData.map(p => {
        const linkedTasks = work.tasks?.filter(t => t.linkedType === 'project' && t.linkedId === p.id) || [];
        const linkedDone = linkedTasks.filter(t => t.done).length;
        const linkedTotal = linkedTasks.length;
        const totalDurationDays = Math.max(1, Math.round(convertToDays(p.duration, p.durationUnit || 'days')));
        const startDateMs = new Date(p.startDate || todayStr()).getTime();
        const deadlineMs = startDateMs + (totalDurationDays * 24 * 60 * 60 * 1000);
        const nowMs = new Date().setHours(0, 0, 0, 0);
        const remainingDays = Math.max(0, Math.ceil((deadlineMs - nowMs) / (24 * 60 * 60 * 1000)));
        const elapsedDays = Math.max(0, totalDurationDays - remainingDays);
        const calculatedProgress = Math.min(100, Math.round((elapsedDays / totalDurationDays) * 100));

        return {
            ...p,
            calculatedProgress,
            linkedTotal,
            linkedDone,
            remainingDays,
            totalDurationDays
        };
    });
    const projectProgress = projectMetrics.length > 0 ? projectMetrics.reduce((s, p) => s + p.calculatedProgress, 0) / projectMetrics.length : 0;

    const categoryTime = work.categoryTime || {};
    const totalTime = Object.values(categoryTime).reduce((a, b) => a + b, 0);

    return {
        tasksDone,
        tasksTotal,
        taskProgress: tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0,
        courseProgress: Math.round(courseProgress),
        projectProgress: Math.round(projectProgress),
        coursesCount: coursesData.length,
        projectsCount: projectsData.length,
        courseMetrics,
        projectMetrics,
        categoryTime,
        totalTime,
        focusMinutes: work.focusMinutes || 0,
        pomodoroCount: work.pomodoroCount || 0
    };
}

// ─── Auth Guard ───────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    currentUser = user;
    const authOverlay = document.getElementById('authOverlay');
    if (authOverlay) authOverlay.style.display = 'none';
    await initApp();
});



async function initApp() {
    setGlobalLoading(true);
    try {
        [userProfile, books] = await Promise.all([
            getUserData(),
            getBooks()
        ]);

        activeDate = todayStr();
        todayData = await getDailyData(activeDate);

        if (!todayData.worship) todayData.worship = {};
        if (!todayData.work) todayData.work = { tasks: [], focusMinutes: 0, pomodoroCount: 0, courses: [], projects: [], categoryTime: { work: 0, course: 0, programming: 0, college: 0 } };
        if (!todayData.reading) todayData.reading = { pagesRead: 0 };
        if (!todayData.fitness) todayData.fitness = { done: false, duration: 0, type: '', notes: '' };
        if (!todayData.learning) todayData.learning = { done: false, mode: 'english', word: '', sentence: '' };
        ensureWorshipDefaults(todayData);
        ensureWorkDefaults(todayData);
        ensureLearningDefaults(todayData);
        ensureFitnessDefaults(todayData);
        ensureWorkLibraryDefaults();

        if (getCoursesCatalog().length === 0 && (todayData.work?.courses || []).length > 0) {
            userProfile.workLibrary.courses = todayData.work.courses.map(c => ({
                ...c,
                consumedHours: c.consumedHours || 0
            }));
            await saveUserData({ workLibrary: userProfile.workLibrary });
        }
        if (getProjectsCatalog().length === 0 && (todayData.work?.projects || []).length > 0) {
            userProfile.workLibrary.projects = todayData.work.projects.map(p => ({
                ...p,
                startDate: p.startDate || todayStr()
            }));
            await saveUserData({ workLibrary: userProfile.workLibrary });
        }

        updateUserUI();
        await renderDashboard();
        renderWorshipPage();
        renderWorkPage();
        await renderReadingPage();
        await renderFitnessPage();
        await renderLearningPage();
        await renderSleepPage();
        await renderPodcastPage();
        await renderWeeklyGoalsPage();
        await renderNotesPage();
        await renderStatsPage();
        updateWorkTimer();
        setInterval(updateWorkTimer, 60000);
    } catch (err) {
        console.error('Init error:', err);
    } finally {
        setGlobalLoading(false);
    }
    initNotifications();
}

// ─── User UI ──────────────────────────────────────────────
function updateUserUI() {
    const name = currentUser.displayName || 'User';
    const sidebarNameEl = document.getElementById('sidebarName');
    if (sidebarNameEl) sidebarNameEl.textContent = name;
    
    const dashNameEl = document.getElementById('dashName');
    if (dashNameEl) dashNameEl.textContent = name;

    const profileNameEl = document.getElementById('profileName');
    if (profileNameEl) profileNameEl.value = name;

    // Avatars
    const photoURL = currentUser.photoURL || userProfile?.photoURL || userProfile?.avatarDataUrl;
    const sidebarAvatarEl = document.getElementById('sidebarAvatar');
    const dashAvatarEl = document.getElementById('dashHeaderAvatar');
    const profileAvatarEl = document.getElementById('profileAvatarBig');

    if (photoURL) {
        const imgHtml = `<img src="${photoURL}" alt="${name}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        if (sidebarAvatarEl) sidebarAvatarEl.innerHTML = imgHtml;
        if (dashAvatarEl) dashAvatarEl.innerHTML = `<img src="${photoURL}" alt="${name}" loading="lazy">`;
        if (profileAvatarEl) profileAvatarEl.innerHTML = `<img src="${photoURL}" alt="${name}" loading="lazy"><div class="avatar-overlay">📷</div>`;
    } else {
        const initial = name.charAt(0).toUpperCase();
        if (sidebarAvatarEl) sidebarAvatarEl.textContent = initial;
        if (dashAvatarEl) dashAvatarEl.textContent = initial;
        if (profileAvatarEl) profileAvatarEl.innerHTML = `<span style="font-size:40px;font-weight:700;">${initial}</span><div class="avatar-overlay">📷</div>`;
    }

    // Date
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('dashDate').textContent = dateStr;
    document.getElementById('dashDateBadge').textContent = now.toLocaleDateString('en-US');
    document.getElementById('worshipDateBadge').textContent = now.toLocaleDateString('en-US');

    // Day Navigator
    renderDayNavigator();
}

// ─── Day Navigation Logic ─────────────────────────────────
window.goToPrevDay = async () => {
    const d = parseDateKey(activeDate);
    d.setDate(d.getDate() - 1);
    await loadDayData(dateKeyFromLocalDate(d));
};

window.goToNextDay = async () => {
    const d = parseDateKey(activeDate);
    d.setDate(d.getDate() + 1);
    await loadDayData(dateKeyFromLocalDate(d));
};

window.goToToday = async () => {
    if (activeDate === todayStr()) return;
    await loadDayData(todayStr());
};

async function loadDayData(dateKey) {
    activeDate = dateKey;
    setGlobalLoading(true);
    try {
        todayData = await getDailyData(dateKey);

        renderDayNavigator();
        await renderDashboard();
        renderWorshipPage();
        renderWorkPage();
        await renderReadingPage();
        await renderFitnessPage();
        await renderLearningPage();
        await renderSleepPage();
        await renderPodcastPage();
        await renderWeeklyGoalsPage();
        await renderNotesPage();
        await renderStatsPage();

        showToast(`Viewing: ${activeDate}`);
    } catch (err) {
        showToast('Error loading day: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

function renderDayNavigator() {
    const nameEl = document.getElementById('activeDayName');
    const dateEl = document.getElementById('activeDayDate');
    if (!nameEl || !dateEl) return;

    const dateObj = parseDateKey(activeDate);
    const isToday = activeDate === todayStr();

    nameEl.textContent = isToday ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    dateEl.textContent = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── DASHBOARD ────────────────────────────────────────────
async function renderDashboard() {
    if (!todayData) return;
    ensureWorshipDefaults(todayData);
    ensureLearningDefaults(todayData);

    // Calculate scores
    const worship = todayData.worship || {};
    const worshipMetrics = getWorshipMetrics(todayData);
    const worshipScore = worshipMetrics.score;
    const worshipDone = worshipMetrics.fardDone;

    const tasks = todayData.work?.tasks || [];
    const tasksDone = tasks.filter(t => t.done).length;
    const workScore = tasks.length > 0 ? (tasksDone / tasks.length) * 100 : 0;

    const readingGoal = userProfile?.goals?.readingPages || 20;
    const pagesRead = todayData.reading?.pagesRead || 0;
    const readingScore = Math.min((pagesRead / readingGoal) * 100, 100);

    const fitnessScore = todayData.fitness?.done ? 100 : 0;
    const fitnessMins = todayData.fitness?.duration || 0;

    const totalScore = Math.round((worshipScore + workScore + readingScore + fitnessScore) / 4);

    // Update rings
    setRing('scoreRing', totalScore, 50, 8);
    document.getElementById('scorePercent').textContent = totalScore + '%';

    setRing('worshipRing', worshipScore, 24, 5);
    document.getElementById('worshipPct').textContent = Math.round(worshipScore) + '%';
    document.getElementById('worshipVal').textContent = `${worshipDone}/5 + ${worshipMetrics.sunnahDone}/${SUNNAH_ITEMS.length}`;

    setRing('workRing', workScore, 24, 5);
    document.getElementById('workPct').textContent = Math.round(workScore) + '%';
    document.getElementById('workVal').textContent = `${tasksDone} tasks`;
    const dashProgressEl = document.getElementById('dashTasksProgress');
    const dashProgressTextEl = document.getElementById('dashTasksProgressText');
    if (dashProgressEl) dashProgressEl.style.width = Math.round(workScore) + '%';
    if (dashProgressTextEl) dashProgressTextEl.textContent = `${tasksDone} / ${tasks.length}`;

    setRing('readingRing', readingScore, 24, 5);
    document.getElementById('readingPct').textContent = Math.round(readingScore) + '%';
    document.getElementById('readingVal').textContent = `${pagesRead} / ${readingGoal} pages`;

    setRing('fitnessRing', fitnessScore, 24, 5);
    document.getElementById('fitnessPct').textContent = Math.round(fitnessScore) + '%';
    document.getElementById('fitnessVal').textContent = fitnessMins > 0 ? `${fitnessMins} min` : 'Not logged';

    // Score title
    const titles = [
        [0, 'Start your day! 🌅', 'Small steps make a big difference'],
        [25, 'Good start 👍', 'Keep going to reach your goal'],
        [50, 'Halfway there 💪', 'The hard part — keep pushing'],
        [75, 'Almost there 🔥', 'The final stretch!'],
        [90, 'Excellent day ⭐', 'Nearly complete'],
        [100, 'Perfect day 🏆', 'You completed your entire day!']
    ];
    const [, title, desc] = titles.reverse().find(([t]) => totalScore >= t) || titles[0];
    document.getElementById('scoreTitle').textContent = title;
    document.getElementById('scoreDesc').textContent = desc;

    // Prayers quick view
    const prayersEl = document.getElementById('dashPrayers');
    prayersEl.innerHTML = PRAYERS.map(p => `
    <div class="prayer-chip ${worship[p.key] ? 'done' : ''}" onclick="quickTogglePrayer('${p.key}')">
      <div class="prayer-chip-icon">${p.icon}</div>
      <div class="prayer-chip-name">${p.name}</div>
    </div>
  `).join('');

    // Tasks quick view
    const tasksEl = document.getElementById('dashTasks');
    if (tasks.length === 0) {
        tasksEl.innerHTML = '<div class="empty-state" style="padding:20px;"><div class="empty-state-icon">📝</div><div class="empty-state-text">No tasks today</div></div>';
    } else {
        tasksEl.innerHTML = tasks.slice(0, 5).map(t => `
      <div class="task-item ${t.done ? 'done' : ''}">
        <div class="task-dot"></div>
        <span class="task-name">${t.name}</span>
      </div>
    `).join('');
    }

    const dashLearningEl = document.getElementById('dashLearningToday');
    if (dashLearningEl) {
        const courseMetrics = getWorkMetrics(todayData).courseMetrics || [];
        const activeCourse = courseMetrics.filter(c => c.calculatedProgress < 100).sort((a,b) => b.calculatedProgress - a.calculatedProgress)[0];
        const todaySessions = todayData.learning?.sessions || [];
        const todayStudyMins = todaySessions.reduce((s, x) => s + (x.minutes || 0), 0);
        
        let html = '';
        if (todaySessions.length > 0) {
            html = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
              <div style="font-weight:600;font-size:14px;">📖 ${todaySessions.length} session${todaySessions.length !== 1 ? 's' : ''} today</div>
              <span class="badge" style="background:rgba(14,165,233,0.12);color:var(--learning);">${Math.floor(todayStudyMins/60)}h ${todayStudyMins%60}m</span>
            </div>
            ${todaySessions.slice(0, 3).map(s => `<div style="font-size:12px;color:var(--text-muted);padding:2px 0;">${sanitizeInput(s.courseName || 'Study')} — ${s.minutes}min</div>`).join('')}`;
        } else if (activeCourse) {
            html = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div>
                <div style="font-weight:600;font-size:14px;">📚 ${sanitizeInput(activeCourse.name)}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${activeCourse.calculatedProgress}% completed • ${activeCourse.totalTimeSpentHours || 0}h studied</div>
              </div>
              <span class="badge" style="background:rgba(14,165,233,0.12);color:var(--learning);">In progress</span>
            </div>`;
        } else {
            html = '<div class="empty-state" style="padding:16px;"><div class="empty-state-icon" style="font-size:26px;">🧠</div><div class="empty-state-text">No active courses. Explore the Knowledge Hub!</div></div>';
        }
        dashLearningEl.innerHTML = html;
    }

    // Heatmap (28 days)
    await renderHeatmap('dashHeatmap', 28);

    // Streak
    await updateStreak();
}

async function updateStreak() {
    const days = await getLastNDays(30);
    let streak = 0;
    for (const d of days) {
        const s = calcDayScore(d);
        if (s > 0) streak++;
        else break;
    }
    document.getElementById('streakCount').textContent = streak;
}

function calcDayScore(d) {
    if (!d || !d.worship) return 0;
    const prayers = PRAYERS.filter(p => d.worship[p.key]).length;
    const sunnah = SUNNAH_ITEMS.filter(s => d.worship?.sunnah?.[s.key]).length;
    const quranGoal = 20;
    const quranScore = Math.min((d.worship?.quranPages || 0) / quranGoal, 1);
    const qiyam = d.worship?.qiyam?.done ? 1 : 0;

    // Work: tasks + courses + projects (linked)
    const work = d.work || {};
    const tasks = work.tasks || [];
    const taskScore = (tasks.filter(t => t.done).length * 0.5);

    const courses = work.courses || [];
    const courseScore = courses.length > 0 ? courses.reduce((s, c) => s + (c.progress / 100), 0) : 0;

    const projects = work.projects || [];
    const projectScore = projects.length > 0 ? projects.reduce((s, p) => s + (p.progress / 100), 0) : 0;

    const pages = d.reading?.pagesRead || 0;
    const fit = d.fitness?.done ? 1 : 0;

    return prayers + sunnah + quranScore + qiyam + taskScore + courseScore + projectScore + pages + fit;
}

async function renderHeatmap(elId, days) {
    const loadingEl = document.getElementById(elId + 'Loading');
    if (loadingEl) loadingEl.style.display = 'block';

    const data = await getLastNDays(days);
    const el = document.getElementById(elId);
    if (!el) return;

    const maxScore = 10;
    el.innerHTML = [...data].reverse().map(d => {
        const score = calcDayScore(d);
        const level = score === 0 ? 0 : score < 3 ? 1 : score < 6 ? 2 : score < 9 ? 3 : 4;
        return `<div class="heatmap-cell" data-level="${level}" title="${d.date}: ${score} points"></div>`;
    }).join('');

    if (loadingEl) loadingEl.style.display = 'none';
}

// ─── WORSHIP ──────────────────────────────────────────────
function renderWorshipPage() {
    if (!todayData) return;
    ensureWorshipDefaults(todayData);
    const worship = todayData.worship || {};
    const metrics = getWorshipMetrics(todayData);
    const quranGoal = getDailyQuranGoal();
    const quranPct = Math.min(((worship.quranPages || 0) / quranGoal) * 100, 100);

    // --- Update KPI Cards & Hero ---
    const heroScore = document.getElementById('worshipHeroScore');
    if (heroScore) heroScore.textContent = `${metrics.score}%`;

    const heroStatus = document.getElementById('worshipHeroStatus');
    if (heroStatus) {
        if (metrics.score === 100) heroStatus.textContent = "يوم مثالي! بارك الله فيك ✨";
        else if (metrics.score >= 75) heroStatus.textContent = "أداء رائع، استمر في العطاء 🔥";
        else if (metrics.score >= 50) heroStatus.textContent = "أحسنت، أنت في منتصف الطريق 💪";
        else if (metrics.score > 0) heroStatus.textContent = "بداية جيدة، خطوة بخطوة ستصل 🌅";
        else heroStatus.textContent = "ابدأ بخطوة بسيطة والبركة تكمل معاك.";
    }

    const kpiPrayers = document.getElementById('worshipKpiPrayers');
    if (kpiPrayers) kpiPrayers.textContent = `${metrics.fardDone}/5`;

    const kpiMosque = document.getElementById('worshipKpiMosque');
    if (kpiMosque) kpiMosque.textContent = metrics.mosquePrayers;

    const kpiAzkar = document.getElementById('worshipKpiAzkar');
    if (kpiAzkar) kpiAzkar.textContent = `${metrics.azkarDone}/2`;

    const kpiQuran = document.getElementById('worshipKpiQuran');
    if (kpiQuran) kpiQuran.textContent = `${worship.quranPages || 0} ص`;

    const kpiQiyam = document.getElementById('worshipKpiQiyam');
    if (kpiQiyam) kpiQiyam.textContent = worship.qiyam?.done ? (worship.qiyam?.rakaat || 0) : 0;

    // Prayers list
    const prayersList = document.getElementById('prayersList');
    if (prayersList) {
        prayersList.innerHTML = PRAYERS.map(p => `
            <div class="prayer-row ${worship[p.key] ? 'active' : ''}">
                <label class="checkbox-item prayer-main-check">
                    <input type="checkbox" ${worship[p.key] ? 'checked' : ''} id="prayer_${p.key}" onchange="togglePrayer('${p.key}', this.checked)">
                    <div class="checkbox-box"></div>
                    <span class="checkbox-label">${p.icon} ${p.name}</span>
                </label>
                <div class="prayer-place-toggle ${worship.prayerLocation?.[p.key] === 'mosque' ? 'is-mosque' : ''}">
                    <button type="button" class="place-chip ${worship.prayerLocation?.[p.key] === 'home' ? 'active' : ''}" onclick="setPrayerLocation('${p.key}', 'home')">البيت</button>
                    <button type="button" class="place-chip ${worship.prayerLocation?.[p.key] === 'mosque' ? 'active' : ''}" onclick="setPrayerLocation('${p.key}', 'mosque')">المسجد</button>
                </div>
            </div>
        `).join('');
    }

    const prayersDoneCount = document.getElementById('prayersDoneCount');
    if (prayersDoneCount) prayersDoneCount.textContent = `${metrics.fardDone} / 5`;
    
    const placeStats = document.getElementById('prayersPlaceStats');
    if (placeStats) {
        const homeCount = metrics.fardDone - metrics.mosquePrayers;
        placeStats.textContent = `المسجد: ${metrics.mosquePrayers} | البيت: ${homeCount}`;
    }

    // Sunnah
    const sunnahWrap = document.getElementById('sunnahList');
    if (sunnahWrap) {
        sunnahWrap.innerHTML = SUNNAH_ITEMS.map(s => `
            <label class="checkbox-item worship-check-item">
                <input type="checkbox" ${worship.sunnah?.[s.key] ? 'checked' : ''} onchange="toggleSunnah('${s.key}', this.checked)">
                <div class="checkbox-box"></div>
                <span class="checkbox-label">${s.icon} ${s.name}</span>
            </label>
        `).join('');
    }
    const sunnahDoneEl = document.getElementById('sunnahDoneCount');
    if (sunnahDoneEl) sunnahDoneEl.textContent = `${metrics.sunnahDone} / ${SUNNAH_ITEMS.length}`;

    // Azkar
    const azkarList = document.getElementById('azkarList');
    if (azkarList) {
        azkarList.innerHTML = AZKAR.map(a => `
            <label class="checkbox-item worship-check-item">
                <input type="checkbox" ${worship[a.key] ? 'checked' : ''} onchange="toggleAzkar('${a.key}', this.checked)">
                <div class="checkbox-box"></div>
                <span class="checkbox-label">${a.icon} ${a.name}</span>
            </label>
        `).join('');
    }

    // Quran
    const quranInput = document.getElementById('quranPages');
    if (quranInput && document.activeElement !== quranInput) {
        quranInput.value = worship.quranPages || '';
    }
    const quranGoalEl = document.getElementById('quranGoalValue');
    if (quranGoalEl) quranGoalEl.textContent = `${quranGoal} صفحة`;
    const quranHintEl = document.getElementById('quranGoalHint');
    if (quranHintEl) quranHintEl.textContent = quranGoal === 22 ? 'أول جزء: 22 صفحة' : 'باقي الأجزاء: 20 صفحة';
    const quranProgressEl = document.getElementById('quranGoalProgress');
    if (quranProgressEl) quranProgressEl.style.width = quranPct + '%';

    // Qiyam
    const qiyamDoneEl = document.getElementById('qiyamDone');
    const qiyamRakaatEl = document.getElementById('qiyamRakaat');
    const qiyamSummaryEl = document.getElementById('qiyamSummary');
    const qiyamChipsWrap = document.querySelector('.qiyam-quick-actions');

    if (qiyamDoneEl) qiyamDoneEl.checked = !!worship.qiyam?.done;
    if (qiyamRakaatEl) {
        qiyamRakaatEl.disabled = !worship.qiyam?.done;
        if (document.activeElement !== qiyamRakaatEl) {
            qiyamRakaatEl.value = worship.qiyam?.rakaat || '';
        }
    }

    if (qiyamChipsWrap) {
        const rakValues = [2, 4, 8, 11, 13];
        qiyamChipsWrap.innerHTML = rakValues.map(v => `
            <button type="button" class="qiyam-chip ${worship.qiyam?.rakaat === v ? 'active' : ''}" 
                ${!worship.qiyam?.done ? 'disabled' : ''} 
                onclick="saveQiyamRakaat(${v})">${v}</button>
        `).join('');
    }

    if (qiyamSummaryEl) {
        qiyamSummaryEl.textContent = worship.qiyam?.done
            ? `الليلة: ${worship.qiyam?.rakaat || 0} ركعة`
            : 'لم يتم تسجيل قيام الليل';
    }
}



window.togglePrayer = async (key, checked) => {
    if (!todayData) return;
    ensureWorshipDefaults(todayData);
    todayData.worship[key] = typeof checked === 'boolean' ? checked : !todayData.worship[key];
    if (!todayData.worship[key]) todayData.worship.prayerLocation[key] = 'home';
    await saveTodayData({ worship: todayData.worship });
    renderWorshipPage();
    await renderDashboard();
    showToast(todayData.worship[key] ? '✅ Prayer logged' : '↩ Prayer unlogged');
};

window.quickTogglePrayer = async (key) => {
    if (!todayData) return;
    ensureWorshipDefaults(todayData);
    todayData.worship[key] = !todayData.worship[key];
    if (!todayData.worship[key]) todayData.worship.prayerLocation[key] = 'home';
    await saveTodayData({ worship: todayData.worship });
    await renderDashboard();
    renderWorshipPage();
};

window.setPrayerLocation = async (key, location) => {
    if (!todayData) return;
    ensureWorshipDefaults(todayData);
    
    const prevLoc = todayData.worship.prayerLocation[key];
    if (prevLoc === location) return;

    // Trigger animation before updating state
    const rowEl = document.querySelector(`#prayer_${key}`)?.closest('.prayer-row');
    const toggleEl = rowEl?.querySelector('.prayer-place-toggle');
    if (toggleEl) {
        toggleEl.classList.remove('animate-to-mosque', 'animate-to-home');
        void toggleEl.offsetWidth; // Trigger reflow
        toggleEl.classList.add(location === 'mosque' ? 'animate-to-mosque' : 'animate-to-home');
    }

    todayData.worship.prayerLocation[key] = location;
    if (!todayData.worship[key]) todayData.worship[key] = true;

    await saveTodayData({ worship: todayData.worship });
    
    // Slight delay for animation smoothness
    setTimeout(() => {
        renderWorshipPage();
        renderDashboard();
    }, 400);
};

window.toggleSunnah = async (key, checked) => {
    if (!todayData) return;
    ensureWorshipDefaults(todayData);
    todayData.worship.sunnah[key] = typeof checked === 'boolean' ? checked : !todayData.worship.sunnah[key];
    await saveTodayData({ worship: todayData.worship });
    renderWorshipPage();
    await renderDashboard();
};

window.toggleAzkar = async (key, checked) => {
    if (!todayData) return;
    ensureWorshipDefaults(todayData);
    todayData.worship[key] = typeof checked === 'boolean' ? checked : !todayData.worship[key];
    await saveTodayData({ worship: todayData.worship });
    renderWorshipPage();
    await renderDashboard();
};

window.saveQiyamRakaat = async (val) => {
    if (!todayData) return;
    ensureWorshipDefaults(todayData);
    const rakaat = Math.max(0, parseInt(val) || 0);
    todayData.worship.qiyam.rakaat = rakaat;
    todayData.worship.qiyam.done = rakaat > 0;
    
    await saveTodayData({ worship: todayData.worship });
    renderWorshipPage();
    renderDashboard();
};

window.saveQuranPages = async (val) => {
    if (!todayData) return;
    ensureWorshipDefaults(todayData);
    todayData.worship.quranPages = parseInt(val) || 0;
    const quranGoal = getDailyQuranGoal();
    if (!userProfile) userProfile = {};
    if (!userProfile.goals) userProfile.goals = {};
    if (!userProfile.goals.firstJuzCompleted && todayData.worship.quranPages >= quranGoal) {
        userProfile.goals.firstJuzCompleted = true;
        await saveUserData({ goals: userProfile.goals });
    }
    await saveTodayData({ worship: todayData.worship });
    renderWorshipPage();
    await renderDashboard();
};

window.toggleQiyam = async (checked) => {
    if (!todayData) return;
    ensureWorshipDefaults(todayData);
    todayData.worship.qiyam.done = !!checked;
    if (!checked) todayData.worship.qiyam.rakaat = 0;
    await saveTodayData({ worship: todayData.worship });
    renderWorshipPage();
    await renderDashboard();
};

// ─── WORK ─────────────────────────────────────────────────
function renderWorkPage() {
    if (!todayData) return;
    ensureWorkDefaults(todayData);

    if (!todayData) return;
    ensureWorkDefaults(todayData);

    const metrics = getWorkMetrics(todayData);
    const tasks = todayData.work?.tasks || [];
    
    // Update Dashboard & KPI Cards
    const elements = {
        'workTasksProgress': `${metrics.taskProgress}%`,
        'workTasksProgressText': `${metrics.tasksDone}/${metrics.tasksTotal}`,
        'pomodoroCount': metrics.pomodoroCount || 0,
        'focusMinutes': metrics.focusMinutes || 0,
        'workEfficiency': `${metrics.tasksTotal > 0 ? Math.round((metrics.tasksDone / metrics.tasksTotal) * 100) : 0}%`
    };

    for (const [id, val] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) {
            if (id.includes('Progress') && !id.includes('Text')) el.style.width = val;
            else el.textContent = val;
        }
    }

    // Active Tab Logic
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.workNavBtn || 'tasks';
    
    if (activeTab === 'tasks') {
        renderWorkTasks(tasks);
    } else if (activeTab === 'projects') {
        renderWorkProjects(metrics.projectMetrics);
    } else if (activeTab === 'stats') {
        renderWorkAnalytics(metrics);
    }
}

function renderWorkTasks(tasks) {
    const container = document.getElementById('tasksList');
    if (!container) return;

    const sortMode = document.getElementById('taskSort')?.value || 'priority';
    const searchQuery = document.getElementById('workSearch')?.value.toLowerCase() || '';

    let filtered = tasks.filter(t => t.name.toLowerCase().includes(searchQuery));

    // Sort Logic
    filtered.sort((a, b) => {
        if (sortMode === 'priority') {
            const weights = { high: 0, medium: 1, low: 2 };
            return weights[a.priority] - weights[b.priority] || (a.done - b.done);
        }
        if (sortMode === 'newest') return b.id - a.id;
        return a.name.localeCompare(b.name);
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state kinetic-reveal"><div class="empty-icon">🌑</div><p>The void is silent. No tasks found.</p></div>`;
        return;
    }

    const priorityConfig = {
        high: { label: 'HIGH', class: 'high-priority', color: '#EF4444' },
        medium: { label: 'MED', class: 'medium-priority', color: '#FFB800' },
        low: { label: 'LOW', class: 'low-priority', color: '#00D1FF' }
    };
    
    const categoryIcons = {
        work: '💼', study: '📚', project: '🚀', personal: '❤️'
    };

    container.innerHTML = filtered.map(t => {
        const conf = priorityConfig[t.priority] || priorityConfig.medium;
        const catIcon = categoryIcons[t.category] || '📌';
        const catName = t.category ? t.category.charAt(0).toUpperCase() + t.category.slice(1) : 'Task';
        
        return `
            <div class="task-item ${conf.class} kinetic-reveal" data-id="${t.id}">
                <div class="task-checkbox ${t.done ? 'checked' : ''}" onclick="toggleTask(${t.id})">
                    ${t.done ? '✓' : ''}
                </div>
                <div style="flex:1; margin-left: 10px;">
                    <div style="font-size: 15px; font-weight: 500; ${t.done ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${sanitizeInput(t.name)}</div>
                    <div class="task-meta" style="margin-top: 4px;">
                        <span class="priority-tag" style="color:${conf.color}">${conf.label}</span>
                        <span class="link-tag" style="color:var(--text-muted);">${catIcon} ${catName}</span>
                        ${t.linkedType === 'course' && t.linkedName ? `<span class="link-tag" style="color:var(--learning, #0ea5e9);background:rgba(14,165,233,0.1);padding:2px 8px;border-radius:99px;font-size:10px;">📚 ${sanitizeInput(t.linkedName)}${t.estMinutes ? ' • ' + t.estMinutes + 'min' : ''}</span>` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="btn-icon" onclick="startTaskPomodoro(${t.id})" title="Focus on this task">⏱️</button>
                    <button class="btn-icon" onclick="deleteTask(${t.id})" style="opacity:0.5;">🗑</button>
                </div>
            </div>
        `;
    }).join('');
}

// Removed renderWorkCourses from here

function renderWorkProjects(projectMetrics) {
    const container = document.getElementById('projectsList');
    if (!container) return;
    if (projectMetrics.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No projects under construction.</p></div>`;
        return;
    }
    container.innerHTML = projectMetrics.map(p => `
        <div class="card aurora-border" style="margin-bottom:12px; padding:20px;">
            <div style="display:flex; justify-content:space-between;">
                <div>
                    <h3 style="margin:0; font-size:18px; color:var(--aurora-blue);">${sanitizeInput(p.name)}</h3>
                    <p style="font-size:12px; color:var(--text-muted); margin:4px 0;">${p.language} | ${p.tech}</p>
                </div>
                <button class="btn-icon" onclick="deleteProject(${p.id})">🗑</button>
            </div>
            <div style="margin-top:15px;">
                <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:5px;">
                    <span>STATUS</span>
                    <span>${p.calculatedProgress}% Complete</span>
                </div>
                <div class="kpi-progress-bar"><div class="kpi-progress-fill" style="width:${p.calculatedProgress}%; background:var(--aurora-blue);"></div></div>
            </div>
        </div>
    `).join('');
}

function renderWorkAnalytics(metrics) {
    const container = document.getElementById('workStatsContent');
    if (!container) return;
    container.innerHTML = `
        <div class="card section aurora-border">
            <h3 class="kinetic-text">Productivity Pulse</h3>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:15px; margin-top:20px;">
                ${WORK_CATEGORIES.map(cat => `
                    <div style="background:rgba(255,255,255,0.02); padding:15px; border-radius:12px; border-left:3px solid ${cat.color}">
                        <div style="font-size:10px; color:var(--text-muted);">${cat.icon} ${cat.name}</div>
                        <div style="font-size:20px; font-weight:800; margin-top:5px;">${metrics.categoryTime[cat.key] || 0}m</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Interactivity Handlers
window.filterWorkTasks = () => renderWorkPage();

window.editTaskName = async (id, name) => {
    if (!todayData) return;
    const task = todayData.work.tasks.find(t => t.id === id);
    if (task && name.trim()) {
        task.name = name.trim();
        await saveTodayData({ work: todayData.work });
        showToast('Sequence updated 📡');
    }
};

window.startTaskPomodoro = (id) => {
    const task = todayData.work.tasks.find(t => t.id === id);
    if (task) {
        const display = document.getElementById('activePomodoroTask');
        if (display) {
            display.innerHTML = `Active Sector: <strong style="color:var(--gold-electric)">${task.name}</strong>`;
            display.classList.add('aurora-glow');
        }
        if (typeof timerRunning !== 'undefined' && !timerRunning) {
            toggleTimer();
        }
    }
};

window.clearCompletedTasks = async () => {
    if (!todayData || !confirm('Purge completed data from the station?')) return;
    todayData.work.tasks = todayData.work.tasks.filter(t => !t.done);
    await saveTodayData({ work: todayData.work });
    renderWorkPage();
    showToast('Station purged 🧹');
};

// ─── INPUT VALIDATION ────────────────────────────────────────
function sanitizeInput(str) {
    return String(str).trim().slice(0, 100).replace(/[<>]/g, '');
}

function renderSafeMultiline(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

function validateTaskInput(name, priority) {
    if (!name || name.length === 0) throw new Error('⚠️ Add a task name');
    if (name.length > 100) throw new Error('⚠️ Task name is too long');
    if (!['high', 'medium', 'low'].includes(priority)) throw new Error('⚠️ Invalid priority');
    return true;
}

// ─── TASK MANAGEMENT ─────────────────────────────────────────
window.openAddTask = () => {
    document.getElementById('newTaskName').value = '';
    document.getElementById('newTaskPriority').value = 'medium';
    document.getElementById('newTaskCategory').value = 'work';
    // Populate course dropdown
    const courseSelect = document.getElementById('newTaskLinkedCourse');
    if (courseSelect) {
        ensureWorkLibraryDefaults();
        const courses = getCoursesCatalog();
        courseSelect.innerHTML = '<option value="">\u2014 No course linked \u2014</option>' +
            courses.map(c => `<option value="${c.id}">${sanitizeInput(c.name)}</option>`).join('');
        courseSelect.onchange = () => {
            const group = document.getElementById('newTaskEstTimeGroup');
            if (group) group.style.display = courseSelect.value ? 'block' : 'none';
        };
    }
    const estGroup = document.getElementById('newTaskEstTimeGroup');
    if (estGroup) estGroup.style.display = 'none';
    const estInput = document.getElementById('newTaskEstTime');
    if (estInput) estInput.value = '30';
    openModal('addTaskModal');
};

window.addTask = async () => {
    try {
        const name = document.getElementById('newTaskName').value.trim();
        const priority = document.getElementById('newTaskPriority').value;
        const category = document.getElementById('newTaskCategory').value;
        const linkedCourseId = document.getElementById('newTaskLinkedCourse')?.value || '';
        const estMinutes = parseInt(document.getElementById('newTaskEstTime')?.value) || 0;

        validateTaskInput(name, priority);

        ensureWorkDefaults(todayData);
        const task = {
            id: Date.now(),
            name: sanitizeInput(name),
            priority,
            category,
            done: false,
            createdAt: Date.now()
        };

        // Link to course if selected
        if (linkedCourseId) {
            task.linkedType = 'course';
            task.linkedId = parseInt(linkedCourseId);
            task.estMinutes = Math.max(0, Math.min(600, estMinutes));
            const course = getCoursesCatalog().find(c => c.id === task.linkedId);
            if (course) task.linkedName = course.name;
        }

        todayData.work.tasks.push(task);
        await saveTodayData({ work: todayData.work });

        closeModal('addTaskModal');
        renderWorkPage();
        await renderDashboard();
        showToast('✅ Task added');
    } catch (err) {
        showToast(err.message);
    }
};

window.toggleTask = async (taskId) => {
    try {
        ensureWorkDefaults(todayData);
        const task = todayData.work.tasks.find(t => t.id === taskId);
        if (!task) throw new Error('Task not found');

        const wasDone = task.done;
        task.done = !task.done;

        // Auto-log hours to linked course when completing a linked task
        if (task.done && !wasDone && task.linkedType === 'course' && task.linkedId && task.estMinutes > 0) {
            ensureWorkLibraryDefaults();
            const course = getCoursesCatalog().find(c => c.id === task.linkedId);
            if (course) {
                const hoursToAdd = task.estMinutes / 60;
                course.consumedHours = Math.round(((course.consumedHours || 0) + hoursToAdd) * 100) / 100;
                // Log session
                if (!todayData.learning) todayData.learning = {};
                if (!Array.isArray(todayData.learning.sessions)) todayData.learning.sessions = [];
                todayData.learning.sessions.push({
                    courseId: course.id,
                    courseName: course.name,
                    minutes: task.estMinutes,
                    topic: `Task: ${task.name}`,
                    ts: Date.now()
                });
                todayData.learning.done = true;
                await saveUserData({ workLibrary: userProfile.workLibrary });
                await saveTodayData({ work: todayData.work, learning: todayData.learning });
                renderLearningPage();
                renderWorkPage();
                await renderDashboard();
                showToast(`✅ Task done! +${task.estMinutes}min logged to ${sanitizeInput(course.name)}`);
                return;
            }
        }
        // Undo: subtract hours if un-completing a linked task
        if (!task.done && wasDone && task.linkedType === 'course' && task.linkedId && task.estMinutes > 0) {
            ensureWorkLibraryDefaults();
            const course = getCoursesCatalog().find(c => c.id === task.linkedId);
            if (course) {
                const hoursToRemove = task.estMinutes / 60;
                course.consumedHours = Math.max(0, Math.round(((course.consumedHours || 0) - hoursToRemove) * 100) / 100);
                await saveUserData({ workLibrary: userProfile.workLibrary });
            }
        }

        await saveTodayData({ work: todayData.work });
        renderWorkPage();
        await renderDashboard();
    } catch (err) {
        showToast(err.message);
    }
};

window.deleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
        ensureWorkDefaults(todayData);
        const idx = todayData.work.tasks.findIndex(t => t.id === taskId);
        if (idx < 0) throw new Error('Task not found');

        todayData.work.tasks.splice(idx, 1);
        await saveTodayData({ work: todayData.work });
        renderWorkPage();
        await renderDashboard();
        showToast('✅ Task deleted');
    } catch (err) {
        showToast(err.message);
    }
};

// ─── Course Management ───────────────────────────────────────
window.setWorkTab = (tab) => {
    document.querySelectorAll('[data-work-nav-btn]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.workNavBtn === tab);
    });
    
    // Hide all containers
    const ids = ['tasksList', 'projectsList', 'workStatsContent'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
    });

    // Show active container
    const containerId = tab === 'tasks' ? 'tasksList' : 
                       tab === 'projects' ? 'projectsList' : 'workStatsContent';
    
    const container = document.getElementById(containerId);
    if (container) container.hidden = false;

    renderWorkPage();
};

window.openAddCourse = () => {
    document.getElementById('newCourseName').value = '';
    document.getElementById('newCourseInstructor').value = '';
    document.getElementById('newCourseDuration').value = '';
    document.getElementById('newCourseDurationUnit').value = 'hours';
    document.getElementById('newCoursePlatform').value = 'Online';
    openModal('addCourseModal');
};

window.addCourse = async () => {
    try {
        const name = sanitizeInput(document.getElementById('newCourseName').value);
        const instructor = sanitizeInput(document.getElementById('newCourseInstructor').value || '');
        const dur = parseInt(document.getElementById('newCourseDuration').value) || 0;
        const durationUnit = document.getElementById('newCourseDurationUnit').value || 'hours';
        const platform = sanitizeInput(document.getElementById('newCoursePlatform').value || 'Online');

        if (!name) throw new Error('⚠️ Add a course name');
        if (dur <= 0 || dur > 1000) throw new Error('⚠️ Invalid duration');

        ensureWorkLibraryDefaults();
        getCoursesCatalog().push({
            id: Date.now(),
            name,
            instructor,
            duration: dur,
            durationUnit,
            platform,
            consumedHours: 0,
            createdAt: Date.now()
        });

        await saveUserData({ workLibrary: userProfile.workLibrary });
        closeModal('addCourseModal');
        renderLearningPage();
        await renderDashboard();
        showToast('✅ Course added');
    } catch (err) {
        showToast(err.message);
    }
};

window.updateCourseProgress = async (courseId, progress) => {
    try {
        ensureWorkLibraryDefaults();
        const course = getCoursesCatalog().find(c => c.id === courseId);
        if (!course) throw new Error('Course not found');

        const p = Math.min(100, Math.max(0, parseInt(progress) || 0));
        course.progress = p;
        await saveUserData({ workLibrary: userProfile.workLibrary });
        renderLearningPage();
        await renderDashboard();
    } catch (err) {
        showToast(err.message);
    }
};

window.deleteCourse = async (courseId) => {
    if (!confirm('Are you sure you want to delete this course?')) return;
    try {
        ensureWorkLibraryDefaults();
        userProfile.workLibrary.courses = getCoursesCatalog().filter(c => c.id !== courseId);
        await saveUserData({ workLibrary: userProfile.workLibrary });
        renderLearningPage();
        await renderDashboard();
        showToast('✅ Course deleted');
    } catch (err) {
        showToast(err.message);
    }
};

// ─── Programming Project Management ────────────────────────
window.openAddProject = () => {
    document.getElementById('newProjectName').value = '';
    document.getElementById('newProjectTech').value = '';
    document.getElementById('newProjectLang').value = 'javascript';
    document.getElementById('newProjectDuration').value = '';
    document.getElementById('newProjectDurationUnit').value = 'weeks';
    openModal('addProjectModal');
};

window.addProject = async () => {
    try {
        const name = sanitizeInput(document.getElementById('newProjectName').value);
        const tech = sanitizeInput(document.getElementById('newProjectTech').value || '');
        const lang = sanitizeInput(document.getElementById('newProjectLang').value);
        const dur = parseInt(document.getElementById('newProjectDuration').value) || 0;
        const durationUnit = document.getElementById('newProjectDurationUnit').value || 'weeks';

        if (!name) throw new Error('⚠️ Add a project name');
        if (dur <= 0 || dur > 1000) throw new Error('⚠️ Invalid duration');

        ensureWorkLibraryDefaults();
        getProjectsCatalog().push({
            id: Date.now(),
            name,
            tech,
            language: lang,
            duration: dur,
            durationUnit,
            startDate: todayStr(),
            createdAt: Date.now(),
            commits: 0
        });

        await saveUserData({ workLibrary: userProfile.workLibrary });
        closeModal('addProjectModal');
        renderWorkPage();
        await renderDashboard();
        showToast('✅ Project added');
    } catch (err) {
        showToast(err.message);
    }
};

window.updateProjectProgress = async (projectId, progress) => {
    try {
        ensureWorkLibraryDefaults();
        const project = getProjectsCatalog().find(p => p.id === projectId);
        if (!project) throw new Error('Project not found');

        const p = Math.min(100, Math.max(0, parseInt(progress) || 0));
        project.progress = p;
        await saveUserData({ workLibrary: userProfile.workLibrary });
        renderWorkPage();
        await renderDashboard();
    } catch (err) {
        showToast(err.message);
    }
};

window.updateProjectCommits = async (projectId, commits) => {
    try {
        ensureWorkLibraryDefaults();
        const project = getProjectsCatalog().find(p => p.id === projectId);
        if (!project) throw new Error('Project not found');

        const c = Math.max(0, parseInt(commits) || 0);
        if (c > 10000) throw new Error('⚠️ Commit count too large');
        project.commits = c;
        await saveUserData({ workLibrary: userProfile.workLibrary });
        renderWorkPage();
    } catch (err) {
        showToast(err.message);
    }
};

window.deleteProject = async (projectId) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
        ensureWorkLibraryDefaults();
        userProfile.workLibrary.projects = getProjectsCatalog().filter(p => p.id !== projectId);
        await saveUserData({ workLibrary: userProfile.workLibrary });
        renderWorkPage();
        await renderDashboard();
        showToast('✅ Project deleted');
    } catch (err) {
        showToast(err.message);
    }
};

// ─── Category Focus for Pomodoro ───────────────────────────
window.setStudyCategory = (cat) => {
    ensureWorkDefaults(todayData);
    todayData.work.pomodoroCategory = cat;
    
    document.querySelectorAll('[data-category-btn]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.categoryBtn === cat);
    });
    
    showToast(`Focus mode: ${cat.toUpperCase()} 🎯`);
};

window.setStudySubject = () => {
    const input = document.getElementById('studySubjectInput');
    if (input && todayData.work) {
        todayData.work.pomodoroSubject = input.value.trim();
    }
};

// Pomodoro Timer
window.toggleTimer = () => {
    if (timerRunning) {
        clearInterval(timerInterval);
        timerRunning = false;
        document.getElementById('timerBtn').textContent = '▶ Resume';
    } else {
        requestNotificationPermission();
        timerRunning = true;
        document.getElementById('timerBtn').textContent = '⏸ Pause';
        timerInterval = setInterval(async () => {
            timerSeconds--;
            updateTimerDisplay();

            if (timerMode === 'work') focusMinutes = Math.floor((25 * 60 - timerSeconds) / 60);

            if (timerSeconds <= 0) {
                clearInterval(timerInterval);
                timerRunning = false;
                if (timerMode === 'work') {
                    pomodoroCount++;
                    focusMinutes += 25;
                    document.getElementById('pomodoroCount').textContent = pomodoroCount;
                    document.getElementById('focusMinutes').textContent = focusMinutes;
                    if (!todayData.work) todayData.work = { tasks: [], focusMinutes: 0, pomodoroCount: 0, categoryTime: { work: 0, course: 0, programming: 0, college: 0 } };
                    ensureWorkDefaults(todayData);
                    todayData.work.pomodoroCount = pomodoroCount;
                    todayData.work.focusMinutes = focusMinutes;

                    // Track category time
                    const category = todayData.work.currentPomodoro?.category || 'work';
                    if (!todayData.work.categoryTime) todayData.work.categoryTime = { work: 0, course: 0, programming: 0, college: 0 };
                    todayData.work.categoryTime[category] = (todayData.work.categoryTime[category] || 0) + 25;

                    await saveTodayData({ work: todayData.work });
                    timerMode = 'break';
                    timerSeconds = 5 * 60;
                    document.getElementById('timerStatus').textContent = 'Break time ☕';
                    showToast('🎉 Pomodoro complete! Break time');
                    sendPomodoroNotification('Work session complete', '5-minute break.');
                } else {
                    timerMode = 'work';
                    timerSeconds = 25 * 60;
                    document.getElementById('timerStatus').textContent = 'Work time';
                    showToast('💪 Break over! Time to work');
                    sendPomodoroNotification('Break over', 'Start a new work session.');
                }
                document.getElementById('timerBtn').textContent = '▶ Start';
                updateTimerDisplay();
            }
            document.getElementById('focusMinutes').textContent = focusMinutes;
        }, 1000);
    }
};

window.resetTimer = () => {
    clearInterval(timerInterval);
    timerRunning = false;
    timerMode = 'work';
    timerSeconds = 25 * 60;
    updateTimerDisplay();
    document.getElementById('timerBtn').textContent = '▶ Start';
    document.getElementById('timerStatus').textContent = 'Work time';
};

function updateTimerDisplay() {
    const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
    const s = (timerSeconds % 60).toString().padStart(2, '0');
    document.getElementById('timerDisplay').textContent = `${m}:${s}`;
}

function updateWorkTimer() {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    const badge = document.getElementById('workTimeBadge');
    if (badge) badge.textContent = timeStr;

    // Work hours 8am - 6pm
    const startMins = 8 * 60;
    const endMins = 18 * 60;
    const nowMins = h * 60 + m;
    const totalWork = endMins - startMins;

    const display = document.getElementById('workHoursDisplay');
    const progress = document.getElementById('workProgress');

    if (display && progress) {
        if (nowMins >= startMins && nowMins <= endMins) {
            const elapsed = nowMins - startMins;
            const pct = (elapsed / totalWork) * 100;
            const elH = Math.floor(elapsed / 60);
            const elM = elapsed % 60;
            display.textContent = `${elH}h ${elM}m`;
            progress.style.width = pct + '%';
        } else if (nowMins < startMins) {
            display.textContent = 'Before work hours';
            progress.style.width = '0%';
        } else {
            display.textContent = '10h 0m ✓';
            progress.style.width = '100%';
        }
    }
}

// ─── READING ──────────────────────────────────────────────
async function renderReadingPage() {
    if (!todayData) return;
    setSectionLoading('booksList', true, 'Loading library...');

    const pagesRead = todayData.reading?.pagesRead || 0;
    const goal = userProfile?.goals?.readingPages || 20;
    const pct = Math.min((pagesRead / goal) * 100, 100);

    document.getElementById('todayPagesVal').textContent = pagesRead;
    document.getElementById('readingGoalVal').textContent = goal;
    document.getElementById('readingProgressBar').style.width = pct + '%';
    const goalInputEl = document.getElementById('readingGoalInput');
    if (goalInputEl) goalInputEl.value = goal;

    // Current book
    const currentBook = books.find(b => b.status === 'reading');
    const currentBookEl = document.getElementById('currentBookCard');
    if (currentBook) {
        const progress = Math.round((currentBook.currentPage / currentBook.totalPages) * 100);
        currentBookEl.innerHTML = `
      <div class="card" style="border-color:var(--reading);background:var(--reading-bg);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">
          <div>
            <div style="font-size:18px;font-weight:700;margin-bottom:4px;">${currentBook.title}</div>
            <div style="font-size:13px;color:var(--text-muted);">${currentBook.author || ''}</div>
          </div>
          <span class="badge badge-reading">Reading</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="flex:1;">
            <div style="height:6px;background:var(--surface2);border-radius:99px;overflow:hidden;">
              <div style="height:100%;background:var(--reading);border-radius:99px;width:${progress}%;transition:width 0.5s;"></div>
            </div>
          </div>
          <span style="font-family:'Syne',sans-serif;font-weight:700;color:var(--reading);">${progress}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
          <span style="font-size:13px;color:var(--text-muted);">Current page: <strong style="color:var(--text);">${currentBook.currentPage}</strong></span>
          <span style="font-size:13px;color:var(--text-muted);">of: <strong style="color:var(--text);">${currentBook.totalPages}</strong></span>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="openUpdateReading('${currentBook.id}','${currentBook.title}',${currentBook.currentPage},${currentBook.totalPages})">Update page</button>
          <button class="btn btn-ghost btn-sm" onclick="markBookDone('${currentBook.id}')">✅ Finished book</button>
        </div>
      </div>
    `;
    } else {
        currentBookEl.innerHTML = `
      <div class="card empty-state">
        <div class="empty-state-icon">📚</div>
        <div class="empty-state-text">No current book<br><button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="openAddBook()">Add a book</button></div>
      </div>
    `;
    }

    // Books library
    renderBooksLibrary();

    const monthPages = (await getLastNDays(30)).reduce((sum, d) => sum + (d.reading?.pagesRead || 0), 0);
    document.getElementById('monthPagesVal').textContent = monthPages;
}

function renderBooksLibrary() {
    const el = document.getElementById('booksList');
    if (books.length === 0) {
        el.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">📚</div><div class="empty-state-text">Your library is empty — add your first book</div></div>`;
        return;
    }

    el.innerHTML = books.map(b => {
        const progress = b.totalPages > 0 ? Math.round((b.currentPage / b.totalPages) * 100) : 0;
        const statusColors = { reading: 'var(--reading)', done: 'var(--work)', wishlist: 'var(--worship)' };
        const statusNames = { reading: 'Reading', done: 'Completed', wishlist: 'Wishlist' };
        return `
      <div class="card" style="border-top:3px solid ${statusColors[b.status] || 'var(--primary)'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div>
            <div style="font-weight:700;margin-bottom:2px;">${b.title}</div>
            <div style="font-size:12px;color:var(--text-muted);">${b.author || 'Unknown author'}</div>
          </div>
          <button onclick="deleteBook('${b.id}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;">🗑</button>
        </div>
        <div style="height:4px;background:var(--surface2);border-radius:99px;margin-bottom:10px;overflow:hidden;">
          <div style="height:100%;background:${statusColors[b.status] || 'var(--primary)'};border-radius:99px;width:${progress}%;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;color:var(--text-muted);">${b.currentPage} / ${b.totalPages} pages</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${statusColors[b.status] || 'var(--primary)'}22;color:${statusColors[b.status] || 'var(--primary)'};">${statusNames[b.status] || ''}</span>
        </div>
        ${b.status !== 'reading' && b.status !== 'done' ? `<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:10px;" onclick="startReading('${b.id}')">Start reading</button>` : ''}
      </div>
    `;
    }).join('');
}

window.openAddBook = () => openModal('addBookModal');

window.addBook = async () => {
    const title = document.getElementById('newBookName').value.trim();
    const author = document.getElementById('newBookAuthor').value.trim();
    const totalPages = parseInt(document.getElementById('newBookPages').value) || 0;
    if (!title) return;

    const hasReading = books.some(b => b.status === 'reading');
    await addBook({ title, author, totalPages, currentPage: 0, status: hasReading ? 'wishlist' : 'reading', addedAt: Date.now() });
    books = await getBooks();
    closeModal('addBookModal');
    document.getElementById('newBookName').value = '';
    document.getElementById('newBookAuthor').value = '';
    document.getElementById('newBookPages').value = '';
    await renderReadingPage();
    showToast('📚 Book added');
};

window.openUpdateReading = (id, title, current, total) => {
    selectedBookForUpdate = id;
    document.getElementById('updateReadingBookName').textContent = '📖 ' + title;
    document.getElementById('updateCurrentPage').value = current;
    document.getElementById('updateCurrentPage').max = total;
    openModal('updateReadingModal');
};

window.updateBookProgress = async () => {
    const page = parseInt(document.getElementById('updateCurrentPage').value) || 0;
    const book = books.find(b => b.id === selectedBookForUpdate);
    if (!book) return;

    const pagesAdded = Math.max(0, page - book.currentPage);
    await updateBook(selectedBookForUpdate, { currentPage: page });
    books = await getBooks();

    // Add to today's reading
    if (!todayData.reading) todayData.reading = { pagesRead: 0 };
    todayData.reading.pagesRead = (todayData.reading.pagesRead || 0) + pagesAdded;
    await saveTodayData({ reading: todayData.reading });

    closeModal('updateReadingModal');
    await renderReadingPage();
    await renderDashboard();
    showToast(`📖 Updated — read ${pagesAdded} pages today`);
};

window.markBookDone = async (id) => {
    await updateBook(id, { status: 'done' });
    books = await getBooks();
    await renderReadingPage();
    showToast('🎉 Congratulations! Book finished');
};

window.startReading = async (id) => {
    // Mark current reading as wishlist first
    const currentReading = books.find(b => b.status === 'reading');
    if (currentReading) await updateBook(currentReading.id, { status: 'wishlist' });
    await updateBook(id, { status: 'reading' });
    books = await getBooks();
    await renderReadingPage();
};

window.deleteBook = async (id) => {
    if (!confirm('Are you sure you want to delete this book?')) return;
    await deleteBookDoc(id);
    books = await getBooks();
    await renderReadingPage();
    showToast('🗑 Book deleted');
};

// ─── FITNESS ──────────────────────────────────────────────
window.toggleHipInput = () => {
    const gender = document.getElementById('fitGenderSelect').value;
    const hipGroup = document.getElementById('fitHipGroup');
    if (hipGroup) hipGroup.style.display = gender === 'female' ? 'block' : 'none';
};

async function renderFitnessPage() {
    ensureFitnessDefaults(todayData);
    setSectionLoading('fitnessTypeBreakdown', true);

    const last30 = await getLastNDays(30);
    const metrics = todayData.fitness.metrics;
    const hasMetrics = metrics && metrics.weight > 0;

    // Show/Hide Sections
    const setDisplay = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none'; };
    setDisplay('fitBmiGaugeWrap', hasMetrics);
    setDisplay('fitCompWrap', hasMetrics && metrics.bodyFat > 0);
    setDisplay('fitCalWrap', hasMetrics);
    setDisplay('fitBmiAnalysis', hasMetrics);

    // Update UI Metrics
    const safeSetText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    
    safeSetText('fitHeightDisplay', metrics.height || '--');
    safeSetText('fitWeightCurrent', metrics.weight || '--');
    safeSetText('fitBmiValue', metrics.bmi || '0.0');
    safeSetText('fitBodyFatDisplay', metrics.bodyFat || '0.0');
    safeSetText('fitBmrDisplay', metrics.tdee || '0');
    
    // BMI Category & Needle
    const bmi = parseFloat(metrics.bmi) || 0;
    const catEl = document.getElementById('fitBmiCategory');
    const needle = document.getElementById('fitBmiNeedle');
    
    if (catEl) {
        if (bmi < 18.5) catEl.textContent = 'Underweight';
        else if (bmi < 25) catEl.textContent = 'Normal';
        else if (bmi < 30) catEl.textContent = 'Overweight';
        else catEl.textContent = 'Obese';
    }

    if (needle) {
        let pct = 0;
        if (bmi < 18.5) pct = (bmi / 18.5) * 18.5; 
        else if (bmi < 25) pct = 18.5 + ((bmi - 18.5) / 6.5) * 31.5; 
        else if (bmi < 30) pct = 50 + ((bmi - 25) / 5) * 25; 
        else pct = 75 + ((bmi - 30) / 10) * 25; 
        needle.style.left = `${Math.min(100, Math.max(0, pct))}%`;
    }

    // Body Composition Bar
    const leanBar = document.getElementById('fitCompLean');
    const fatBar = document.getElementById('fitCompFat');
    const leanKg = document.getElementById('fitCompLeanKg');
    const fatKg = document.getElementById('fitCompFatKg');
    
    if (leanBar && fatBar && metrics.bodyFat > 0) {
        const bf = parseFloat(metrics.bodyFat) || 0;
        fatBar.style.width = `${bf}%`;
        leanBar.style.width = `${100 - bf}%`;
        
        const fatMass = (metrics.weight * bf) / 100;
        if (leanKg) leanKg.textContent = `${(metrics.weight - fatMass).toFixed(1)} kg`;
        if (fatKg) fatKg.textContent = `${fatMass.toFixed(1)} kg`;
    }

    // Caloric Needs
    safeSetText('fitCalBmr', metrics.bmr || '--'); 
    safeSetText('fitCalMaintain', metrics.tdee || '--');
    safeSetText('fitCalCut', Math.round(metrics.tdee - 500) || '--');
    safeSetText('fitCalBulk', Math.round(metrics.tdee + 300) || '--');

    // Analysis Status
    const statusTitle = document.getElementById('fitBmiStatusTitle');
    const statusIcon = document.getElementById('fitBmiStatusIcon');
    if (statusTitle && bmi > 0) {
        if (bmi >= 18.5 && bmi < 25) {
            statusTitle.textContent = 'Healthy Range';
            if (statusIcon) statusIcon.textContent = '💚';
        } else {
            statusTitle.textContent = 'Attention Needed';
            if (statusIcon) statusIcon.textContent = '⚠️';
        }
    }

    // Fill Inputs
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('fitHeightInput', metrics.height);
    setVal('fitWeightInput', metrics.weight);
    setVal('fitAgeInput', metrics.age);
    setVal('fitGenderSelect', metrics.gender);
    setVal('fitActivitySelect', metrics.activity);
    setVal('fitWaistInput', metrics.waist);
    setVal('fitNeckInput', metrics.neck);
    setVal('fitHipInput', metrics.hip);
    toggleHipInput();

    // Stats Overview
    const weekWorkouts = last30.slice(0, 7).filter(d => d.fitness?.done).length;
    const monthWorkouts = last30.filter(d => d.fitness?.done).length;
    const totalMins = last30.reduce((sum, d) => sum + (d.fitness?.duration || 0), 0);
    
    safeSetText('weekWorkouts', weekWorkouts);
    safeSetText('monthWorkouts', monthWorkouts);
    safeSetText('totalFitnessTime', totalMins);
    
    // Streak
    let streak = 0;
    for (const d of last30) {
        if (d.fitness?.done) streak++;
        else break;
    }
    safeSetText('fitnessStreak', streak);

    // Workout Goal
    const weekGoal = 5;
    const goalPct = Math.min(100, Math.round((weekWorkouts / weekGoal) * 100));
    const goalBar = document.getElementById('fitnessGoalBar');
    if (goalBar) goalBar.style.width = `${goalPct}%`;
    safeSetText('fitnessGoalText', `${weekWorkouts} / ${weekGoal} days`);

    // Type Breakdown
    const typeCounts = { running: 0, football: 0, gym: 0, padel: 0, other: 0 };
    last30.forEach(d => { 
        if (d.fitness?.done) {
            const t = d.fitness.type;
            if (typeCounts[t] !== undefined) typeCounts[t]++;
            else typeCounts['other']++;
        }
    });
    
    const typeWrap = document.getElementById('fitnessTypeBreakdown');
    if (typeWrap) {
        const typeMeta = {
            running: { icon: '🏃', label: 'Running' },
            football: { icon: '⚽', label: 'Football' },
            gym: { icon: '🏋️', label: 'Gym' },
            padel: { icon: '🎾', label: 'Padel' },
            other: { icon: '💪', label: 'Other' }
        };
        typeWrap.innerHTML = Object.entries(typeMeta).map(([k, m]) => `
            <div class="fitness-type-chip">
                <div class="fitness-type-icon">${m.icon}</div>
                <div class="fitness-type-name">${m.label}</div>
                <div class="fitness-type-value">${typeCounts[k]}</div>
            </div>
        `).join('');
    }

    // Weight Chart
    renderWeightChart(last30);

    // Initial Rest Timer Display
    updateRestUI();

    // Workout Log
    const logEl = document.getElementById('workoutLog');
    const logs = last30.filter(d => d.fitness?.done).slice(0, 10);
    if (logEl) {
        if (logs.length === 0) {
            logEl.innerHTML = '<div class="empty-state">No workouts logged yet.</div>';
        } else {
            const icons = { running: '🏃', football: '⚽', gym: '🏋️', padel: '🎾', other: '💪' };
            logEl.innerHTML = logs.map(d => `
                <div class="fitness-log-item">
                    <div class="fitness-log-icon">${icons[d.fitness.type] || '💪'}</div>
                    <div style="flex:1;">
                        <div style="font-weight:700; font-size:14px;">${d.date === todayStr() ? 'Today' : d.date}</div>
                        <div style="font-size:12px; color:var(--text-muted);">${d.fitness.routine ? `<span style="color:var(--fit-primary)">[${d.fitness.routine}]</span> ` : ''}${d.fitness.notes || 'No notes'}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-family:\'Bebas Neue\'; font-size:20px; color:var(--fit-primary);">${d.fitness.duration}m</div>
                    </div>
                </div>
            `).join('');
        }
    }
}

function renderWeightChart(days) {
    const chartEl = document.getElementById('fitWeightTrend');
    if (!chartEl) return;
    const history = [...days].reverse();
    const weights = history.map(d => parseFloat(d.fitness?.metrics?.weight) || 0).filter(w => w > 0);
    const minW = Math.min(...weights, 60) - 2;
    const maxW = Math.max(...weights, 100) + 2;
    const range = (maxW - minW) || 1;

    chartEl.innerHTML = history.map(d => {
        const w = parseFloat(d.fitness?.metrics?.weight) || 0;
        const h = w > 0 ? ((w - minW) / range) * 100 : 5;
        return `
            <div style="flex:1; height:100%; display:flex; flex-direction:column; justify-content:flex-end; position:relative;" title="${d.date}: ${w}kg">
                <div style="width:100%; height:${h}%; background:${w > 0 ? 'var(--fit-primary)' : 'rgba(255,255,255,0.05)'}; border-radius:4px 4px 0 0; transition:height 0.5s;"></div>
            </div>
        `;
    }).join('');
}

window.saveBodyMetrics = async () => {
    const gender = document.getElementById('fitGenderSelect').value;
    const height = parseFloat(document.getElementById('fitHeightInput').value) || 0;
    const weight = parseFloat(document.getElementById('fitWeightInput').value) || 0;
    const age = parseInt(document.getElementById('fitAgeInput').value) || 0;
    const activity = parseFloat(document.getElementById('fitActivitySelect').value) || 1.2;
    const waist = parseFloat(document.getElementById('fitWaistInput').value) || 0;
    const neck = parseFloat(document.getElementById('fitNeckInput').value) || 0;
    const hip = parseFloat(document.getElementById('fitHipInput').value) || 0;
    const manualBF = parseFloat(document.getElementById('fitBodyFatInput').value);

    if (!height || !weight || !age) { showToast('Please fill height, weight, and age', 'error'); return; }

    // Mifflin-St Jeor
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr = gender === 'male' ? bmr + 5 : bmr - 161;
    const tdee = Math.round(bmr * activity);

    const bmi = calculateBMI(weight, height);
    const calculatedBF = calculateBodyFat(gender, height, waist, neck, hip);
    const bodyFat = !isNaN(manualBF) ? manualBF : calculatedBF;

    const metrics = { 
        height, weight, age, gender, activity, waist, neck, hip, 
        bodyFat, bmi, tdee, bmr: Math.round(bmr) 
    };
    
    todayData.fitness.metrics = metrics;
    userProfile.fitness = userProfile.fitness || {};
    userProfile.fitness.metrics = metrics;

    await Promise.all([
        saveTodayData({ fitness: todayData.fitness }),
        saveUserData({ fitness: userProfile.fitness })
    ]);

    showToast('✨ Metrics updated & calculated!');
    renderFitnessPage();
};

window.logBodyWeight = () => {
    const history = userProfile.fitness?.weightHistory || [];
    const logEl = document.getElementById('weightHistoryLog');
    if (logEl) {
        logEl.innerHTML = history.length === 0 
            ? '<div class="empty-state">No weight history found.</div>'
            : history.slice().reverse().map(entry => `
                <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="font-weight:600;">${entry.date}</span>
                    <span style="color:var(--fit-primary); font-weight:700;">${entry.weight} kg</span>
                </div>
            `).join('');
    }
    openModal('weightHistoryModal');
};

window.openLogWorkout = () => {
    const f = todayData.fitness || {};
    document.getElementById('workoutType').value = f.type || 'gym';
    document.getElementById('workoutDuration').value = f.duration || '';
    document.getElementById('workoutNotes').value = f.notes || '';
    document.getElementById('gymRoutine').value = f.routine || '';
    window.toggleGymRoutine();
    openModal('logWorkoutModal');
};

window.toggleGymRoutine = () => {
    const type = document.getElementById('workoutType').value;
    const group = document.getElementById('gymRoutineGroup');
    if (group) group.style.display = (type === 'gym') ? 'block' : 'none';
};

window.logWorkout = async () => {
    const type = document.getElementById('workoutType').value;
    const duration = parseInt(document.getElementById('workoutDuration').value) || 0;
    const notes = document.getElementById('workoutNotes').value.trim();
    const routine = type === 'gym' ? document.getElementById('gymRoutine').value.trim() : '';

    if (!duration) { showToast('Enter duration', 'error'); return; }

    todayData.fitness.done = true;
    todayData.fitness.type = type;
    todayData.fitness.duration = duration;
    todayData.fitness.notes = notes;
    todayData.fitness.routine = routine;

    // Auto-log weight to history if metrics exist
    const weight = todayData.fitness.metrics?.weight;
    if (weight) {
        const history = userProfile.fitness?.weightHistory || [];
        if (!history.find(h => h.date === activeDate)) {
            history.push({ date: activeDate, weight: weight });
            if (!userProfile.fitness) userProfile.fitness = {};
            userProfile.fitness.weightHistory = history.slice(-30);
            await saveUserData({ fitness: userProfile.fitness });
        }
    }

    await saveTodayData({ fitness: todayData.fitness });
    closeModal('logWorkoutModal');
    renderFitnessPage();
    renderDashboard();
    showToast('💪 Workout logged!');
};

// ─── Workout Presets ───

window.applyWorkoutPreset = (type, routine, duration) => {
    document.getElementById('workoutType').value = type;
    document.getElementById('workoutDuration').value = duration || '';
    document.getElementById('gymRoutine').value = routine || '';
    window.toggleGymRoutine();
};

// ─── Rest Timer Logic ───
let restTimerInterval = null;
let restSeconds = 90;
let totalRestSeconds = 90;
let restRunning = false;

window.setRestTimer = (seconds) => {
    clearInterval(restTimerInterval);
    restRunning = false;
    restSeconds = seconds;
    totalRestSeconds = seconds;
    
    // Update active preset UI
    document.querySelectorAll('.fit-rest__preset').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.getAttribute('onclick').match(/\d+/)[0]) === seconds);
    });
    
    const btn = document.getElementById('restTimerBtn');
    if (btn) btn.textContent = '▶ Start';
    
    updateRestUI();
};

window.toggleRestTimer = () => {
    if (restRunning) {
        clearInterval(restTimerInterval);
        restRunning = false;
        const btn = document.getElementById('restTimerBtn');
        if (btn) btn.textContent = '▶ Start';
    } else {
        if (restSeconds <= 0) restSeconds = totalRestSeconds;
        restRunning = true;
        const btn = document.getElementById('restTimerBtn');
        if (btn) btn.textContent = '⏸ Pause';
        
        restTimerInterval = setInterval(() => {
            restSeconds--;
            if (restSeconds <= 0) {
                clearInterval(restTimerInterval);
                restRunning = false;
                restSeconds = 0;
                if (btn) btn.textContent = '▶ Start';
                new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {});
                showToast('⏰ Rest time over!', 'success');
            }
            updateRestUI();
        }, 1000);
    }
};

window.resetRestTimer = () => {
    clearInterval(restTimerInterval);
    restRunning = false;
    restSeconds = totalRestSeconds;
    const btn = document.getElementById('restTimerBtn');
    if (btn) btn.textContent = '▶ Start';
    updateRestUI();
};

function updateRestUI() {
    const display = document.getElementById('restTimerDisplay');
    const bar = document.getElementById('restTimerBar');
    if (!display) return;

    const mins = Math.floor(restSeconds / 60);
    const secs = restSeconds % 60;
    display.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    if (bar) {
        const pct = totalRestSeconds > 0 ? (restSeconds / totalRestSeconds) * 100 : 0;
        bar.style.width = `${pct}%`;
    }
}

// ─── LEARNING: KNOWLEDGE HUB ENGINE ────────────────
async function renderLearningPage() {
    if (!todayData) return;
    ensureWorkDefaults(todayData);
    ensureWorkLibraryDefaults();
    if (!todayData.learning) todayData.learning = {};
    if (!Array.isArray(todayData.learning.sessions)) todayData.learning.sessions = [];

    const metrics = getWorkMetrics(todayData);
    const courseMetrics = metrics.courseMetrics || [];
    const tasks = todayData.work?.tasks || [];
    
    // Render courses list with enhanced cards
    const container = document.getElementById('coursesList');
    if (container) {
        if (courseMetrics.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📚</div><p>No courses in your Knowledge Hub yet.<br>Add your first course to start tracking!</p></div>`;
        } else {
            container.innerHTML = courseMetrics.map(c => {
                const isComplete = c.calculatedProgress >= 100;
                const linkedTasks = tasks.filter(t => t.linkedType === 'course' && t.linkedId === c.id);
                const linkedDone = linkedTasks.filter(t => t.done).length;
                const progressColor = isComplete ? 'var(--success, #10b981)' : 'var(--aurora-blue, #0ea5e9)';
                const totalH = c.totalDurationHours || 0;
                const consumedH = c.totalTimeSpentHours || 0;
                const remainH = c.remainingHours || 0;
                
                return `
                <div class="card aurora-border" style="margin-bottom:14px; padding:20px; ${isComplete ? 'border-color:var(--success, #10b981);' : ''}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div style="flex:1;">
                            <h3 style="margin:0; font-size:18px; color:${progressColor};">${isComplete ? '✅ ' : ''}${sanitizeInput(c.name)}</h3>
                            <p style="font-size:12px; color:var(--text-muted); margin:4px 0;">${sanitizeInput(c.platform)} | ${sanitizeInput(c.instructor) || 'Self-paced'}</p>
                        </div>
                        <div style="display:flex;gap:6px;">
                            ${!isComplete ? `<button class="btn btn-ghost btn-sm" onclick="openLogSession(${c.id})" style="font-size:11px;">📖 Log Session</button>` : ''}
                            <button class="btn-icon" onclick="deleteCourse(${c.id})" style="opacity:0.5;">🗑</button>
                        </div>
                    </div>
                    <div style="margin-top:15px;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:5px;">
                            <span>PROGRESS</span>
                            <span style="font-weight:600;">${c.calculatedProgress}%</span>
                        </div>
                        <div class="kpi-progress-bar"><div class="kpi-progress-fill" style="width:${c.calculatedProgress}%; background:${progressColor};"></div></div>
                    </div>
                    <div style="display:flex; gap:16px; margin-top:12px; flex-wrap:wrap;">
                        <div style="font-size:11px; color:var(--text-muted);">
                            <span style="font-weight:600; color:var(--text);">${consumedH}h</span> studied
                        </div>
                        ${totalH > 0 ? `<div style="font-size:11px; color:var(--text-muted);">
                            <span style="font-weight:600; color:var(--text);">${remainH}h</span> remaining
                        </div>
                        <div style="font-size:11px; color:var(--text-muted);">
                            <span style="font-weight:600; color:var(--text);">${totalH}h</span> total
                        </div>` : ''}
                        ${linkedTasks.length > 0 ? `<div style="font-size:11px; color:var(--learning, #0ea5e9);">
                            📋 ${linkedDone}/${linkedTasks.length} tasks
                        </div>` : ''}
                    </div>
                </div>`;
            }).join('');
        }
    }

    // Today's Study Sessions
    const sessions = todayData.learning.sessions || [];
    const sessionsEl = document.getElementById('learningTodaySessions');
    const badgeEl = document.getElementById('learningTodayBadge');
    if (badgeEl) badgeEl.textContent = `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`;
    
    if (sessionsEl) {
        const todayMins = sessions.reduce((s, x) => s + (x.minutes || 0), 0);
        if (sessions.length === 0) {
            sessionsEl.innerHTML = `<div class="empty-state" style="padding:16px;"><div class="empty-state-text">No study sessions logged today. Start learning!</div></div>`;
        } else {
            sessionsEl.innerHTML = `
                <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Total today: <strong style="color:var(--learning,#0ea5e9);">${Math.floor(todayMins/60)}h ${todayMins%60}m</strong></div>
                ${sessions.map((s, i) => `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
                    <span>📖</span>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:13px;">${sanitizeInput(s.courseName || 'Study session')}</div>
                        <div style="font-size:11px;color:var(--text-muted);">${s.topic ? sanitizeInput(s.topic) : 'General study'}</div>
                    </div>
                    <span style="font-weight:700;color:var(--learning,#0ea5e9);">${s.minutes}m</span>
                    <button onclick="deleteStudySession(${i})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;">🗑</button>
                </div>`).join('')}`;
        }
    }

    // Update KPIs
    const activeCourses = courseMetrics.filter(c => c.calculatedProgress < 100).length;
    const completedCourses = courseMetrics.filter(c => c.calculatedProgress >= 100).length;
    const totalHours = courseMetrics.reduce((sum, c) => sum + (c.totalTimeSpentHours || 0), 0);
    const overallProgress = metrics.courseProgress || 0;
    
    const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    setTxt('learningActiveCourses', activeCourses);
    setTxt('learningCompletedCourses', completedCourses);
    setTxt('learningTotalHours', Math.round(totalHours * 10) / 10);
    setTxt('learningOverallProgress', `${overallProgress}%`);
    
    // Smart Insight
    const insightEl = document.getElementById('learningCourseInsight');
    if (insightEl) {
        if (courseMetrics.length === 0) {
            insightEl.textContent = "Start your learning journey by adding your first course.";
        } else if (activeCourses > 0) {
            const mostProgressed = courseMetrics
                .filter(c => c.calculatedProgress < 100)
                .sort((a,b) => b.calculatedProgress - a.calculatedProgress)[0];
            if (mostProgressed) {
                const remaining = mostProgressed.remainingHours;
                insightEl.innerHTML = `Focus on <strong style="color:var(--aurora-blue)">${sanitizeInput(mostProgressed.name)}</strong> (${mostProgressed.calculatedProgress}% done${remaining > 0 ? `, ~${remaining}h left` : ''}).`;
            }
        } else {
            insightEl.textContent = "🎉 All courses completed! Time to learn something new.";
        }
    }

    // Linked Tasks Insight
    const linkedInsightEl = document.getElementById('learningLinkedTasksText');
    if (linkedInsightEl) {
        const allLinkedTasks = tasks.filter(t => t.linkedType === 'course');
        const pendingLinked = allLinkedTasks.filter(t => !t.done);
        if (allLinkedTasks.length === 0) {
            linkedInsightEl.textContent = "Link tasks to courses from the Work section to auto-track study progress.";
        } else {
            linkedInsightEl.innerHTML = `<strong>${allLinkedTasks.length}</strong> tasks linked to courses. <strong style="color:var(--learning,#0ea5e9);">${pendingLinked.length}</strong> pending today.`;
        }
    }
}

// ─── STUDY SESSION LOGGING ────────────────────────────────
window.openLogSession = (courseId) => {
    ensureWorkLibraryDefaults();
    const course = getCoursesCatalog().find(c => c.id === courseId);
    if (!course) return showToast('Course not found', 'error');
    
    document.getElementById('logSessionCourseId').value = courseId;
    document.getElementById('logSessionCourseName').textContent = '📚 ' + course.name;
    document.getElementById('logSessionHours').value = '0';
    document.getElementById('logSessionMinutes').value = '30';
    document.getElementById('logSessionTopic').value = '';
    
    const totalH = convertToHours(course.duration, course.durationUnit || 'hours');
    const consumed = course.consumedHours || 0;
    const remaining = Math.max(0, totalH - consumed);
    const remEl = document.getElementById('logSessionRemaining');
    if (remEl) {
        remEl.textContent = totalH > 0 
            ? `Progress: ${consumed}h / ${totalH}h (${Math.round(consumed/totalH*100)}%) — ${remaining.toFixed(1)}h remaining`
            : `${consumed}h studied so far`;
    }
    
    openModal('logSessionModal');
};

window.logStudySession = async () => {
    try {
        const courseId = parseInt(document.getElementById('logSessionCourseId').value);
        const hours = parseInt(document.getElementById('logSessionHours').value) || 0;
        const minutes = parseInt(document.getElementById('logSessionMinutes').value) || 0;
        const topic = sanitizeInput(document.getElementById('logSessionTopic').value || '');
        
        const totalMinutes = hours * 60 + minutes;
        if (totalMinutes <= 0) throw new Error('⚠️ Enter study time');
        if (totalMinutes > 720) throw new Error('⚠️ Maximum 12 hours per session');
        
        ensureWorkLibraryDefaults();
        const course = getCoursesCatalog().find(c => c.id === courseId);
        if (!course) throw new Error('Course not found');
        
        // Add consumed hours to course
        const hoursToAdd = totalMinutes / 60;
        course.consumedHours = Math.round(((course.consumedHours || 0) + hoursToAdd) * 100) / 100;
        
        // Log session to today's learning data
        if (!todayData.learning) todayData.learning = {};
        if (!Array.isArray(todayData.learning.sessions)) todayData.learning.sessions = [];
        todayData.learning.sessions.push({
            courseId,
            courseName: course.name,
            minutes: totalMinutes,
            topic: topic || 'General study',
            ts: Date.now()
        });
        todayData.learning.done = true;
        
        await saveUserData({ workLibrary: userProfile.workLibrary });
        await saveTodayData({ learning: todayData.learning });
        
        closeModal('logSessionModal');
        renderLearningPage();
        await renderDashboard();
        showToast(`📖 +${hours > 0 ? hours + 'h ' : ''}${minutes}min logged to ${sanitizeInput(course.name)}`);
    } catch (err) {
        showToast(err.message, 'error');
    }
};

window.deleteStudySession = async (index) => {
    if (!todayData.learning?.sessions?.[index]) return;
    const session = todayData.learning.sessions[index];
    
    // Remove consumed hours from course
    if (session.courseId) {
        ensureWorkLibraryDefaults();
        const course = getCoursesCatalog().find(c => c.id === session.courseId);
        if (course) {
            const hoursToRemove = (session.minutes || 0) / 60;
            course.consumedHours = Math.max(0, Math.round(((course.consumedHours || 0) - hoursToRemove) * 100) / 100);
            await saveUserData({ workLibrary: userProfile.workLibrary });
        }
    }
    
    todayData.learning.sessions.splice(index, 1);
    if (todayData.learning.sessions.length === 0) todayData.learning.done = false;
    await saveTodayData({ learning: todayData.learning });
    renderLearningPage();
    await renderDashboard();
    showToast('Session removed');
};

// ─── STATS ────────────────────────────────────────────────
let _statsRange = 7;
let _radarChart = null, _trendChart = null, _weeklyBarChart = null;

window.changeStatsRange = (range) => {
    _statsRange = range;
    document.querySelectorAll('.stats-range-btn').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.range) === range));
    renderStatsPage();
};

async function renderStatsPage() {
    setSectionLoading('bigHeatmap', true, 'Loading heatmap...');
    const range = _statsRange || 7;
    const allData = await getLastNDays(Math.max(range, 30));
    const rangeData = allData.slice(0, range);
    const last7 = allData.slice(0, 7);

    // ── Helper ──
    const calcArea = (data, fn) => data.reduce((s, d) => s + fn(d), 0);
    const setText = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const setHTML = (id, v) => { const e = document.getElementById(id); if (e) e.innerHTML = v; };

    // ── Worship ──
    const worshipScores = rangeData.map(d => getWorshipMetrics(d).score);
    const worshipAvg = Math.round(worshipScores.reduce((a, b) => a + b, 0) / rangeData.length);
    setText('statsWorshipAvg', worshipAvg + '%');

    // ── Work ──
    const workDone = calcArea(rangeData, d => (d.work?.tasks?.filter(t => t.done).length || 0));
    const workTotal = calcArea(rangeData, d => (d.work?.tasks?.length || 0));
    const workRate = workTotal > 0 ? Math.round((workDone / workTotal) * 100) : 0;
    setText('statsWorkAvg', workRate + '%');

    // ── Reading ──
    const readingPages = calcArea(rangeData, d => d.reading?.pagesRead || 0);
    setText('statsReadingTotal', readingPages + ' pg');

    // ── Fitness ──
    const fitnessDays = rangeData.filter(d => d.fitness?.done).length;
    setText('statsFitnessTotal', fitnessDays + 'd');

    // ── Learning ──
    const learningDays = rangeData.filter(d => d.learning?.done).length;
    setText('statsLearningTotal', learningDays + 'd');

    // ── Trends (compare first half vs second half) ──
    function calcTrend(data, fn) {
        const mid = Math.floor(data.length / 2);
        const firstHalf = data.slice(mid);
        const secondHalf = data.slice(0, mid);
        const avg1 = firstHalf.length ? firstHalf.reduce((s, d) => s + fn(d), 0) / firstHalf.length : 0;
        const avg2 = secondHalf.length ? secondHalf.reduce((s, d) => s + fn(d), 0) / secondHalf.length : 0;
        const diff = avg2 - avg1;
        if (Math.abs(diff) < 1) return '<span class="trend-flat">— steady</span>';
        return diff > 0 ? `<span class="trend-up">▲ +${Math.round(diff)}%</span>` : `<span class="trend-down">▼ ${Math.round(diff)}%</span>`;
    }

    setHTML('statsWorshipTrend', calcTrend(rangeData, d => getWorshipMetrics(d).score));
    setHTML('statsWorkTrend', calcTrend(rangeData, d => { const t = d.work?.tasks || []; return t.length ? (t.filter(x => x.done).length / t.length) * 100 : 0; }));
    setHTML('statsReadingTrend', calcTrend(rangeData, d => Math.min(100, ((d.reading?.pagesRead || 0) / (userProfile?.goals?.readingPages || 20)) * 100)));
    setHTML('statsFitnessTrend', calcTrend(rangeData, d => d.fitness?.done ? 100 : 0));
    setHTML('statsLearningTrend', calcTrend(rangeData, d => d.learning?.done ? 100 : 0));

    // ── Smart Insights ──
    const consistencyDays = last7.filter(d => calcDayScore(d) > 0).length;
    const focusWeek = last7.reduce((s, d) => s + (d.work?.focusMinutes || 0), 0);
    const areaScores = { Worship: worshipAvg, Work: workRate, Reading: Math.min(100, Math.round((readingPages / Math.max(1, (userProfile?.goals?.readingPages || 20) * (range / 7))) * 100)), Fitness: Math.round((fitnessDays / range) * 100), Learning: Math.round((learningDays / range) * 100) };
    const sorted = Object.entries(areaScores).sort((a, b) => b[1] - a[1]);
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];
    const overallScore = Math.round(Object.values(areaScores).reduce((a, b) => a + b, 0) / 5);

    const insightsEl = document.getElementById('statsInsights');
    if (insightsEl) {
        insightsEl.innerHTML = `
        <div class="stats-insight-card">
          <div class="stats-insight-card__icon">🔥</div>
          <div class="stats-insight-card__title">Overall Score</div>
          <div class="stats-insight-card__value" style="color:${overallScore >= 70 ? 'var(--success)' : overallScore >= 40 ? 'var(--warning)' : 'var(--danger)'};">${overallScore}%</div>
          <div class="stats-insight-card__desc">Avg across all areas</div>
        </div>
        <div class="stats-insight-card">
          <div class="stats-insight-card__icon">📅</div>
          <div class="stats-insight-card__title">Consistency</div>
          <div class="stats-insight-card__value" style="color:var(--primary);">${consistencyDays}/7</div>
          <div class="stats-insight-card__desc">Active days this week</div>
        </div>
        <div class="stats-insight-card">
          <div class="stats-insight-card__icon">💪</div>
          <div class="stats-insight-card__title">Strongest</div>
          <div class="stats-insight-card__value" style="color:var(--success);">${strongest[0]}</div>
          <div class="stats-insight-card__desc">${strongest[1]}% performance</div>
        </div>
        <div class="stats-insight-card">
          <div class="stats-insight-card__icon">⚠️</div>
          <div class="stats-insight-card__title">Needs Work</div>
          <div class="stats-insight-card__value" style="color:var(--warning);">${weakest[0]}</div>
          <div class="stats-insight-card__desc">${weakest[1]}% — room to grow</div>
        </div>
        <div class="stats-insight-card">
          <div class="stats-insight-card__icon">⏱️</div>
          <div class="stats-insight-card__title">Focus Time</div>
          <div class="stats-insight-card__value">${focusWeek}m</div>
          <div class="stats-insight-card__desc">Total focus this week</div>
        </div>
        <div class="stats-insight-card">
          <div class="stats-insight-card__icon">📖</div>
          <div class="stats-insight-card__title">Pages Read</div>
          <div class="stats-insight-card__value" style="color:var(--reading);">${readingPages}</div>
          <div class="stats-insight-card__desc">in last ${range} days</div>
        </div>`;
    }

    // ── RADAR CHART — Life Balance ──
    const radarCtx = document.getElementById('statsRadarChart');
    if (radarCtx) {
        if (_radarChart) _radarChart.destroy();
        _radarChart = new Chart(radarCtx, {
            type: 'radar',
            data: {
                labels: ['Worship', 'Work', 'Reading', 'Fitness', 'Learning'],
                datasets: [{
                    label: `Last ${range} days`,
                    data: [areaScores.Worship, areaScores.Work, areaScores.Reading, areaScores.Fitness, areaScores.Learning],
                    backgroundColor: 'rgba(168, 85, 247, 0.15)',
                    borderColor: 'rgba(168, 85, 247, 0.8)',
                    borderWidth: 2,
                    pointBackgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'],
                    pointBorderColor: '#fff',
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20, color: 'rgba(255,255,255,0.4)', backdropColor: 'transparent', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.08)' }, pointLabels: { color: 'rgba(255,255,255,0.8)', font: { size: 12, weight: '600' } } } },
                plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15,15,25,0.9)', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 12, cornerRadius: 8 } }
            }
        });
    }

    // ── LINE CHART — Performance Trends ──
    const trendCtx = document.getElementById('statsTrendChart');
    if (trendCtx) {
        const trendData = [...rangeData].reverse();
        const labels = trendData.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        if (_trendChart) _trendChart.destroy();
        _trendChart = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Worship', data: trendData.map(d => Math.round(getWorshipMetrics(d).score)), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', tension: 0.4, fill: false, borderWidth: 2, pointRadius: range > 14 ? 0 : 3 },
                    { label: 'Work', data: trendData.map(d => { const t = d.work?.tasks || []; return t.length ? Math.round((t.filter(x => x.done).length / t.length) * 100) : 0; }), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', tension: 0.4, fill: false, borderWidth: 2, pointRadius: range > 14 ? 0 : 3 },
                    { label: 'Reading', data: trendData.map(d => Math.min(100, Math.round(((d.reading?.pagesRead || 0) / (userProfile?.goals?.readingPages || 20)) * 100))), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', tension: 0.4, fill: false, borderWidth: 2, pointRadius: range > 14 ? 0 : 3 },
                    { label: 'Fitness', data: trendData.map(d => d.fitness?.done ? 100 : 0), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', tension: 0.4, fill: false, borderWidth: 2, pointRadius: range > 14 ? 0 : 3 },
                    { label: 'Learning', data: trendData.map(d => d.learning?.done ? 100 : 0), borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.08)', tension: 0.4, fill: false, borderWidth: 2, pointRadius: range > 14 ? 0 : 3 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 }, maxTicksLimit: 10 } }, y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 }, callback: v => v + '%' } } },
                plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', usePointStyle: true, padding: 16, font: { size: 11 } } }, tooltip: { backgroundColor: 'rgba(15,15,25,0.9)', padding: 12, cornerRadius: 8 } }
            }
        });
        setText('statsTrendDesc', `Daily scores over the last ${range} days`);
    }

    // ── STACKED BAR CHART — Weekly Breakdown ──
    const barCtx = document.getElementById('statsWeeklyBarChart');
    if (barCtx) {
        const weekData = [...last7].reverse();
        const dayLabels = weekData.map(d => new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }));

        if (_weeklyBarChart) _weeklyBarChart.destroy();
        _weeklyBarChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: dayLabels,
                datasets: [
                    { label: 'Worship', data: weekData.map(d => Math.round(getWorshipMetrics(d).score)), backgroundColor: 'rgba(245,158,11,0.8)', borderRadius: 4, borderSkipped: false },
                    { label: 'Work', data: weekData.map(d => { const t = d.work?.tasks || []; return t.length ? Math.round((t.filter(x => x.done).length / t.length) * 100) : 0; }), backgroundColor: 'rgba(59,130,246,0.8)', borderRadius: 4, borderSkipped: false },
                    { label: 'Reading', data: weekData.map(d => Math.min(100, Math.round(((d.reading?.pagesRead || 0) / (userProfile?.goals?.readingPages || 20)) * 100))), backgroundColor: 'rgba(16,185,129,0.8)', borderRadius: 4, borderSkipped: false },
                    { label: 'Fitness', data: weekData.map(d => d.fitness?.done ? 100 : 0), backgroundColor: 'rgba(239,68,68,0.8)', borderRadius: 4, borderSkipped: false },
                    { label: 'Learning', data: weekData.map(d => d.learning?.done ? 100 : 0), backgroundColor: 'rgba(139,92,246,0.8)', borderRadius: 4, borderSkipped: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { stacked: false, grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 12 } } }, y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 }, callback: v => v + '%' } } },
                plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15,15,25,0.9)', padding: 12, cornerRadius: 8 } }
            }
        });
    }

    // Big heatmap (91 days)
    await renderHeatmap('bigHeatmap', 91);
}



// ─── PROFILE ──────────────────────────────────────────────
window.openProfileModal = () => openModal('profileModal');

window.saveProfile = async () => {
    const name = document.getElementById('profileName').value.trim();

    if (name && name !== currentUser.displayName) {
        await updateProfile(currentUser, { displayName: name });
        currentUser.displayName = name;
    }

    if (!userProfile) userProfile = {};
    await saveUserData({ name });

    updateUserUI();
    closeModal('profileModal');
    renderDashboard();
    showToast('✅ Settings saved');
};

window.saveReadingGoal = async () => {
    if (!userProfile) userProfile = {};
    if (!userProfile.goals) userProfile.goals = {};
    const goalInputEl = document.getElementById('readingGoalInput');
    const readingGoal = Math.max(1, parseInt(goalInputEl?.value || 20) || 20);
    userProfile.goals.readingPages = readingGoal;
    await saveUserData({ goals: userProfile.goals });
    await renderReadingPage();
    await renderDashboard();
    showToast('✅ Reading goal updated');
};

async function buildAvatarDataUrl(file, maxSize = 320, quality = 0.82) {
    const imageUrl = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = imageUrl;
        });

        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context unavailable');
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', quality);
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}

window.handleAvatarChange = async (input) => {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
        showToast('❌ File must be an image', 'error');
        input.value = '';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('❌ Image too large (max 5MB)', 'error');
        input.value = '';
        return;
    }

    const avatarEl = document.getElementById('profileAvatarBig');
    const sidebarAvatarEl = document.getElementById('sidebarAvatar');
    const dashAvatarEl = document.getElementById('dashHeaderAvatar');
    const tempUrl = URL.createObjectURL(file);
    if (avatarEl) avatarEl.innerHTML = `<img src="${tempUrl}" alt="Temp photo" loading="lazy"><div class="avatar-overlay">⏳</div>`;
    if (sidebarAvatarEl) sidebarAvatarEl.innerHTML = `<img src="${tempUrl}" alt="Temp photo" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    if (dashAvatarEl) dashAvatarEl.innerHTML = `<img src="${tempUrl}" alt="Temp photo" loading="lazy">`;

    showToast('⏳ Uploading photo...');
    try {
        const url = await uploadAvatar(file);
        currentUser.photoURL = url;
        if (!userProfile) userProfile = {};
        userProfile.photoURL = url;
        delete userProfile.avatarDataUrl;
        await saveUserData({ photoURL: url, avatarDataUrl: null });
        updateUserUI();
        showToast('✅ Photo updated');
    } catch (e) {
        // Fallback: persist a compressed image in Firestore when Storage fails.
        try {
            const dataUrl = await buildAvatarDataUrl(file);
            if (!userProfile) userProfile = {};
            userProfile.avatarDataUrl = dataUrl;
            userProfile.photoURL = '';
            currentUser.photoURL = '';
            await saveUserData({ avatarDataUrl: dataUrl, photoURL: null });
            updateUserUI();
            showToast('✅ Photo saved locally (Fallback)');
        } catch (fallbackError) {
            updateUserUI();
            showToast(`❌ Failed to upload photo: ${e?.message || 'Unknown error'}`, 'error');
            console.error('Avatar fallback failed', fallbackError);
        }
    } finally {
        URL.revokeObjectURL(tempUrl);
        input.value = '';
    }
};

window.handleLogout = async () => {
    await signOut(auth);
    window.location.href = 'auth.html';
};

// ─── UTILS ────────────────────────────────────────────────
function setRing(id, pct, r, sw) {
    const el = document.getElementById(id);
    if (!el) return;
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    el.style.strokeDasharray = circ;
    el.style.strokeDashoffset = offset;
}

window.switchPage = (name, navEl) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + name)?.classList.add('active');
    if (navEl) navEl.classList.add('active');
    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    // Refresh page data
    if (name === 'worship') renderWorshipPage();
    if (name === 'stats') renderStatsPage();
    if (name === 'fitness') renderFitnessPage();
    if (name === 'reading') renderReadingPage();
    if (name === 'learning') renderLearningPage();
    if (name === 'sleep') renderSleepPage();
    if (name === 'podcast') renderPodcastPage();
    if (name === 'weeklyGoals') renderWeeklyGoalsPage();
    if (name === 'notes') renderNotesPage();
};


window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
};

// Close sidebar when tapping on main content area (mobile)
document.querySelector('.main-content')?.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }
});

// Close sidebar on page switch (mobile)
const _origSwitchPage = window.switchPage;
if (_origSwitchPage) {
    window.switchPage = (name, el) => {
        _origSwitchPage(name, el);
        const sidebar = document.getElementById('sidebar');
        if (sidebar && window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }
    };
}

window.openModal = (id) => document.getElementById(id).classList.add('open');
window.closeModal = (id) => document.getElementById(id).classList.remove('open');

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
    });
});

function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function setGlobalLoading(isLoading) {
    const overlay = document.getElementById('authOverlay');
    if (!overlay) return;
    overlay.style.display = isLoading ? 'flex' : 'none';
}

function setSectionLoading(elId, isLoading, text = 'Loading...') {
    const el = document.getElementById(elId);
    if (!el) return;
    if (isLoading) {
        el.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="loading-spinner" style="margin:0 auto 10px;"></div><div class="empty-state-text">${text}</div></div>`;
    }
}

async function initNotifications() {
    if (!('Notification' in window)) return;
    notificationsReady = Notification.permission === 'granted';
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
        notificationsReady = true;
        return true;
    }
    if (Notification.permission === 'denied') {
        notificationsReady = false;
        return false;
    }
    try {
        const permission = await Notification.requestPermission();
        notificationsReady = permission === 'granted';
        return notificationsReady;
    } catch (err) {
        notificationsReady = false;
        return false;
    }
}

function sendPomodoroNotification(title, body) {
    if (!notificationsReady || !('Notification' in window)) return;
    new Notification(title, { body, icon: '/favicon.ico' });
}

// ─── ELITE SLEEP INTELLIGENCE ENGINE ─────────────────────
let sleepCaffeineQueue = [];
let sleepMainChartInstance = null;
let sleepStagesChartInstance = null;

function ensureSleepDefaults(target) {
    if (!target.sleep) {
        target.sleep = {
            bedtime: '',
            wakeTime: '',
            quality: 7,
            energy: 5,
            mood: 'neutral',
            latency: 15,
            wakeups: 0,
            notes: '',
            stages: { light: 0, deep: 0, rem: 0, awake: 0 },
            factors: { stress: 5, screenTime: 60, temp: 20, hydration: 2.0 },
            caffeineEntries: [],
            optimizationScore: 0
        };
    }
}

function pad2(value) { return String(value).padStart(2, '0'); }

function formatSleepTime(time24) {
    if (!time24) return '--:--';
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${pad2(m)} ${period}`;
}

function calcSleepDuration(bed, wake) {
    if (!bed || !wake) return 0;
    const [bh, bm] = bed.split(':').map(Number);
    const [wh, wm] = wake.split(':').map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 1440;
    return mins;
}

window.switchSleepTab = (tabId, btn) => {
    document.querySelectorAll('.sleep-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sleep-tab-btn').forEach(b => b.classList.remove('active'));
    const content = document.getElementById(`sleepTab-${tabId}`);
    if (content) content.classList.add('active');
    if (btn) btn.classList.add('active');
};

window.openSleepModal = () => {
    ensureSleepDefaults(todayData);
    const s = todayData.sleep;

    document.getElementById('sleepBedtime').value = s.bedtime || '23:30';
    document.getElementById('sleepWakeTime').value = s.wakeTime || '07:30';
    document.getElementById('sleepLatency').value = s.latency || 15;
    document.getElementById('sleepWakeups').value = s.wakeups || 0;
    document.getElementById('sleepQuality').value = s.quality || 7;
    document.getElementById('sleepEnergy').value = s.energy || 5;
    document.getElementById('sleepMood').value = s.mood || 'neutral';

    document.getElementById('sleepStageLight').value = s.stages?.light || '';
    document.getElementById('sleepStageDeep').value = s.stages?.deep || '';
    document.getElementById('sleepStageREM').value = s.stages?.rem || '';
    document.getElementById('sleepStageAwake').value = s.stages?.awake || '';

    document.getElementById('sleepStress').value = s.factors?.stress || 5;
    document.getElementById('sleepScreen').value = s.factors?.screenTime || 60;
    document.getElementById('sleepRoomTemp').value = s.factors?.temp || 20;
    document.getElementById('sleepHydration').value = s.factors?.hydration || 2.0;
    document.getElementById('sleepNotes').value = s.notes || '';

    sleepCaffeineQueue = [...(s.caffeineEntries || [])];
    renderCaffeineQueue();

    openModal('sleepModal');
};

window.closeSleepModal = () => closeModal('sleepModal');

window.addCaffeineEntry = () => {
    const type = document.getElementById('caffeineType').value;
    const time = document.getElementById('caffeineTime').value;
    if (!time) { showToast('Select time for caffeine', 'error'); return; }

    const mgMap = { coffee: 95, espresso: 63, tea: 30, energy: 160, soda: 40, preworkout: 250 };
    sleepCaffeineQueue.push({ type, time, mg: mgMap[type] || 0 });
    renderCaffeineQueue();
};

window.removeCaffeineEntry = (idx) => {
    sleepCaffeineQueue.splice(idx, 1);
    renderCaffeineQueue();
};

function renderCaffeineQueue() {
    const list = document.getElementById('caffeineList');
    if (!list) return;
    list.innerHTML = sleepCaffeineQueue.map((entry, i) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px; margin-bottom: 6px; font-size: 12px;">
            <span>☕ ${entry.type.toUpperCase()} at ${entry.time}</span>
            <div style="display:flex; align-items:center; gap: 8px;">
                <span style="color: var(--sleep-primary); font-weight: 600;">${entry.mg}mg</span>
                <button onclick="removeCaffeineEntry(${i})" style="background:none; border:none; color: #ff4444; cursor:pointer; font-size: 16px;">×</button>
            </div>
        </div>
    `).join('') || '<p style="text-align:center; color: var(--text-muted); font-size: 11px;">No drinks logged yet.</p>';
}

window.saveSleepIntelligence = async () => {
    const bedtime = document.getElementById('sleepBedtime').value;
    const wakeTime = document.getElementById('sleepWakeTime').value;

    if (!bedtime || !wakeTime) { showToast('Bedtime and Wake time are required', 'error'); return; }

    const sleepData = {
        bedtime,
        wakeTime,
        quality: parseInt(document.getElementById('sleepQuality').value),
        energy: parseInt(document.getElementById('sleepEnergy').value),
        mood: document.getElementById('sleepMood').value,
        latency: parseInt(document.getElementById('sleepLatency').value) || 0,
        wakeups: parseInt(document.getElementById('sleepWakeups').value) || 0,
        notes: document.getElementById('sleepNotes').value.trim(),
        stages: {
            light: parseInt(document.getElementById('sleepStageLight').value) || 0,
            deep: parseInt(document.getElementById('sleepStageDeep').value) || 0,
            rem: parseInt(document.getElementById('sleepStageREM').value) || 0,
            awake: parseInt(document.getElementById('sleepStageAwake').value) || 0
        },
        factors: {
            stress: parseInt(document.getElementById('sleepStress').value) || 5,
            screenTime: parseInt(document.getElementById('sleepScreen').value) || 0,
            temp: parseFloat(document.getElementById('sleepRoomTemp').value) || 20,
            hydration: parseFloat(document.getElementById('sleepHydration').value) || 2.0
        },
        caffeineEntries: [...sleepCaffeineQueue]
    };

    // AI Estimation & Scoring
    const totalMinutes = calcSleepDuration(bedtime, wakeTime);
    if (Object.values(sleepData.stages).reduce((a, b) => a + b, 0) === 0) {
        sleepData.stages = estimateSleepStages(totalMinutes, sleepData.quality, sleepData.factors);
    }

    sleepData.optimizationScore = calculateEliteSleepScore(sleepData, totalMinutes);

    todayData.sleep = sleepData;
    await saveTodayData({ sleep: todayData.sleep });

    closeSleepModal();
    await renderSleepPage();
    await renderDashboard();
    showToast('🌙 Sleep Intelligence Analyzed!');
};

function calculateEliteSleepScore(s, totalMins) {
    let durScore = 0;
    if (totalMins >= 420 && totalMins <= 510) durScore = 40;
    else if (totalMins > 510) durScore = Math.max(20, 40 - (totalMins - 510) / 10);
    else durScore = Math.max(0, (totalMins / 420) * 40);

    const totalStages = (s.stages.deep + s.stages.rem + s.stages.light + s.stages.awake) || 1;
    const deepPct = (s.stages.deep / totalStages) * 100;
    const remPct = (s.stages.rem / totalStages) * 100;
    let archScore = 0;
    if (deepPct >= 15 && deepPct <= 25) archScore += 15; else archScore += (deepPct / 20) * 15;
    if (remPct >= 20 && remPct <= 25) archScore += 15; else archScore += (remPct / 22.5) * 15;
    archScore = Math.min(30, archScore);

    const efficiency = ((totalMins - s.latency - (s.wakeups * 5)) / totalMins) * 20;
    const contScore = Math.max(0, Math.min(20, efficiency));
    const subScore = (s.quality / 10) * 5 + (s.energy / 10) * 5;

    return Math.round(Math.min(100, durScore + archScore + contScore + subScore));
}

function estimateSleepStages(total, quality, factors) {
    let deepMult = 1.0;
    let remMult = 1.0;
    if (quality > 8) { deepMult = 1.2; remMult = 1.1; }
    if (factors.stress > 7) { deepMult = 0.7; remMult = 0.8; }
    if (factors.temp > 24) { deepMult = 0.8; }
    const deep = Math.round(total * 0.20 * deepMult);
    const rem = Math.round(total * 0.22 * remMult);
    const awake = Math.round(total * 0.05);
    const light = total - deep - rem - awake;
    return { light, deep, rem, awake };
}

async function renderSleepPage() {
    ensureSleepDefaults(todayData);
    const last30 = await getLastNDays(30);
    const last7 = last30.slice(0, 7);
    const s = todayData.sleep;

    const score = s.optimizationScore || 0;
    setRing('sleepScoreRing', score, 90, 12);
    document.getElementById('sleepScoreVal').textContent = score || '--';

    const greetingEl = document.getElementById('sleepGreeting');
    if (score >= 90) greetingEl.textContent = "PEAK RECOVERY ATTAINED";
    else if (score >= 75) greetingEl.textContent = "OPTIMAL READINESS STATE";
    else if (score >= 50) greetingEl.textContent = "SUB-OPTIMAL RECOVERY";
    else greetingEl.textContent = "CRITICAL FATIGUE DETECTED";

    const briefEl = document.getElementById('sleepAIBrief');
    const totalMins = calcSleepDuration(s.bedtime, s.wakeTime);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    briefEl.textContent = `Last cycle: ${hours}h ${mins}m at ${s.quality}/10 quality. Your efficiency is currently ${totalMins > 0 ? Math.round((totalMins - s.latency) / totalMins * 100) : 0}%.`;

    document.getElementById('sleepMainInsight').textContent = generateAISleepInsight(todayData, last7);
    document.getElementById('sleepAvgDuration').textContent = `${hours}h ${mins}m`;
    document.getElementById('sleepAvgQuality').textContent = `${s.quality}/10`;
    document.getElementById('sleepEfficiency').textContent = `${totalMins > 0 ? Math.round(((totalMins - s.latency - (s.wakeups * 5)) / totalMins) * 100) : 0}%`;

    const bedtimes = last7.filter(d => d.sleep?.bedtime).map(d => {
        const [h, m] = d.sleep.bedtime.split(':').map(Number);
        return h * 60 + m;
    });
    if (bedtimes.length > 1) {
        const avg = bedtimes.reduce((a, b) => a + b) / bedtimes.length;
        const variance = Math.sqrt(bedtimes.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b) / bedtimes.length);
        document.getElementById('sleepConsistency').textContent = variance < 30 ? 'HIGH' : variance < 60 ? 'MED' : 'LOW';
    } else {
        document.getElementById('sleepConsistency').textContent = '--';
    }

    const residual = calculateCaffeineResidual(s.caffeineEntries || [], s.bedtime);
    document.getElementById('caffeineBodyLevel').textContent = `${Math.round(residual)} mg`;
    const caffeineInsight = document.getElementById('caffeineInsight');
    const caffeineStatus = document.getElementById('caffeineStatus');
    if (residual > 50) {
        caffeineInsight.textContent = "High caffeine residual detected. This likely suppressed your Deep Sleep cycles.";
        if (caffeineStatus) { caffeineStatus.textContent = "Elevated"; caffeineStatus.className = "badge badge-fitness"; }
    } else if (residual > 0) {
        caffeineInsight.textContent = "Moderate caffeine impact. Try to clear caffeine 8h before bedtime.";
        if (caffeineStatus) { caffeineStatus.textContent = "Moderate"; caffeineStatus.className = "badge"; }
    } else {
        caffeineInsight.textContent = "Caffeine cleared. Maximum adenosine binding achieved.";
        if (caffeineStatus) { caffeineStatus.textContent = "Optimal"; caffeineStatus.className = "badge"; }
    }

    document.getElementById('hydrationLevel').textContent = `${s.factors?.hydration || 0} L`;
    initSleepCharts(last7);

    const factorTags = document.getElementById('sleepFactorTags');
    const tags = [];
    if (s.factors?.stress > 7) tags.push('<span class="factor-tag factor-neg">High Stress</span>');
    if (s.factors?.screenTime > 90) tags.push('<span class="factor-tag factor-neg">Blue Light Exposure</span>');
    if (s.factors?.temp < 19 || s.factors?.temp > 22) tags.push('<span class="factor-tag factor-neg">Sub-optimal Temp</span>');
    if (s.quality > 8) tags.push('<span class="factor-tag factor-pos">Peak Quality</span>');
    if (totalMins > 450) tags.push('<span class="factor-tag factor-pos">Ideal Duration</span>');
    factorTags.innerHTML = tags.join('') || '<span class="factor-tag">Steady State</span>';

    const logList = document.getElementById('sleepLogList');
    const logEntries = last30.filter(d => d.sleep?.bedtime).slice(0, 15);
    document.getElementById('sleepLogCount').textContent = `${logEntries.length} entries`;
    logList.innerHTML = logEntries.map(d => `
        <div class="sleep-log-item" style="display:flex; justify-content:space-between; align-items:center; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 8px;">
            <div>
                <div style="font-weight: 600; font-size: 14px;">${d.date}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${formatSleepTime(d.sleep.bedtime)} - ${formatSleepTime(d.sleep.wakeTime)} • Quality: ${d.sleep.quality}/10</div>
            </div>
            <div style="text-align: right;">
                <div style="color: var(--sleep-primary); font-weight: 700; font-size: 16px;">${d.sleep.optimizationScore || 0}</div>
                <div style="font-size: 9px; color: var(--text-muted);">SCORE</div>
            </div>
        </div>
    `).join('') || '<div class="empty-state">No logs found.</div>';
}

function calculateCaffeineResidual(entries, bedtimeStr) {
    if (!entries.length || !bedtimeStr) return 0;
    const [bh, bm] = bedtimeStr.split(':').map(Number);
    const bedMinutes = bh * 60 + bm;
    let totalResidual = 0;
    entries.forEach(e => {
        const [eh, em] = e.time.split(':').map(Number);
        const entryMinutes = eh * 60 + em;
        let diff = bedMinutes - entryMinutes;
        if (diff < 0) diff += 1440;
        const hoursDiff = diff / 60;
        totalResidual += e.mg * Math.pow(0.5, hoursDiff / 5.7);
    });
    return totalResidual;
}

function generateAISleepInsight(today, history) {
    const s = today.sleep;
    if (!s.bedtime) return "Initialize your first log to activate the insight engine.";
    const residual = calculateCaffeineResidual(s.caffeineEntries || [], s.bedtime);
    const totalMins = calcSleepDuration(s.bedtime, s.wakeTime);
    if (residual > 60) return "Caffeine levels remained high at sleep onset, likely reducing your Deep Sleep. Try cutting off caffeine 9 hours before bed.";
    if (s.factors?.screenTime > 120) return "High pre-sleep screen exposure detected. Blue light suppresses melatonin; consider using orange filters or reading paper books 1 hour before bed.";
    if (totalMins < 400) return "Sleep duration was below the 7-hour recovery threshold. Your cognitive performance may be impaired by 20-30% today.";
    if (s.factors?.stress > 7) return "High stress detected. Consider 5 minutes of box breathing (4-4-4-4) before your next cycle to lower cortisol.";
    if (s.quality >= 9 && totalMins >= 450) return "Perfect cycle detected. Your recovery and neuroplasticity markers are in the top 5% today.";
    return "Your sleep architecture is stable. Maintaining this consistency for 3 more days will lock in your circadian rhythm.";
}

function initSleepCharts(last7) {
    const ctxMain = document.getElementById('sleepMainChart');
    if (!ctxMain) return;
    const labels = [...last7].reverse().map(d => new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }));
    const durData = [...last7].reverse().map(d => calcSleepDuration(d.sleep?.bedtime || '', d.sleep?.wakeTime || '') / 60);
    const scoreData = [...last7].reverse().map(d => d.sleep?.optimizationScore || 0);
    if (sleepMainChartInstance) sleepMainChartInstance.destroy();
    sleepMainChartInstance = new Chart(ctxMain, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Duration (hrs)',
                data: durData,
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                fill: true,
                tension: 0.4,
                yAxisID: 'y'
            }, {
                label: 'Score',
                data: scoreData,
                borderColor: '#8b5cf6',
                borderDash: [5, 5],
                tension: 0.4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { display: false, min: 0, max: 12 },
                y1: { display: false, min: 0, max: 100 },
                x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } } }
            }
        }
    });

    const ctxStages = document.getElementById('sleepStagesChart');
    if (!ctxStages) return;
    const s = todayData.sleep.stages;
    if (sleepStagesChartInstance) sleepStagesChartInstance.destroy();
    sleepStagesChartInstance = new Chart(ctxStages, {
        type: 'doughnut',
        data: {
            labels: ['Light', 'Deep', 'REM', 'Awake'],
            datasets: [{
                data: [s.light, s.deep, s.rem, s.awake],
                backgroundColor: ['#38bdf8', '#818cf8', '#a78bfa', '#f87171'],
                borderWidth: 0,
                cutout: '75%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
    const stagesList = document.getElementById('sleepStagesList');
    if (stagesList) {
        const total = (s.light + s.deep + s.rem + s.awake) || 1;
        stagesList.innerHTML = [
            { label: 'Deep Sleep', val: s.deep, color: '#818cf8', pct: Math.round(s.deep / total * 100) },
            { label: 'REM Sleep', val: s.rem, color: '#a78bfa', pct: Math.round(s.rem / total * 100) },
            { label: 'Light Sleep', val: s.light, color: '#38bdf8', pct: Math.round(s.light / total * 100) }
        ].map(st => `
            <div style="display:flex; align-items:center; gap: 8px; margin-bottom: 8px; font-size: 11px;">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${st.color}"></div>
                <div style="flex:1;">${st.label}</div>
                <div style="font-weight: 600;">${Math.floor(st.val / 60)}h ${st.val % 60}m</div>
                <div style="color: var(--text-muted); width: 30px; text-align: right;">${st.pct}%</div>
            </div>
        `).join('');
    }
}

window.renderSleepChart = (type) => { };

// ─── PODCAST ──────────────────────────────────────────────
function ensurePodcastDefaults(target) { if (!target.podcast) target.podcast = { sessions: [], goal: 30 }; if (!Array.isArray(target.podcast.sessions)) target.podcast.sessions = []; }

async function renderPodcastPage() {
    ensurePodcastDefaults(todayData);
    const p = todayData.podcast;
    const todayMins = p.sessions.reduce((s, x) => s + (x.minutes || 0), 0);
    const goal = p.goal || 30;
    const pct = Math.min(100, Math.round((todayMins / goal) * 100));
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('podcastTodayMinutes', todayMins); el('podcastGoalMinutes', goal);
    el('podcastRemainingMinutes', Math.max(0, goal - todayMins));
    el('podcastStatusBadge', todayMins >= goal ? 'Goal reached ✅' : todayMins > 0 ? 'In progress' : 'Not started');
    const bar = document.getElementById('podcastProgressBar'); if (bar) bar.style.width = pct + '%';
    const gi = document.getElementById('podcastGoalInput'); if (gi && !gi.value) gi.value = goal;
    el('podcastProgressMeta', todayMins >= goal ? 'Great job! Goal reached 🎉' : `${goal - todayMins} minutes remaining`);
    el('podcastBalanceLabel', todayMins >= goal ? 'Surplus' : 'Remaining');
    el('podcastBalanceSub', todayMins >= goal ? 'extra minutes' : 'minutes left');
    const last30 = await getLastNDays(30);
    const monthMins = last30.reduce((s, d) => s + (d.podcast?.sessions || []).reduce((a, x) => a + (x.minutes || 0), 0), 0);
    el('podcastMonthMinutes', monthMins); el('podcastMonthAvg', (monthMins / 30).toFixed(1));
    // Today sessions
    const tl = document.getElementById('podcastTodayList');
    el('podcastTodaySessionsBadge', `${p.sessions.length} sessions`);
    if (tl) tl.innerHTML = p.sessions.length === 0 ? '<div class="empty-state" style="padding:20px;"><div class="empty-state-text">No sessions today</div></div>' : p.sessions.map((s, i) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);"><span>🎧</span><div style="flex:1;"><div style="font-weight:600;font-size:13px;">${sanitizeInput(s.show || 'Quick session')}</div><div style="font-size:11px;color:var(--text-muted);">${s.platform || ''} ${s.notes ? '• ' + sanitizeInput(s.notes) : ''}</div></div><span style="font-weight:700;color:var(--podcast,#a855f7);">${s.minutes}m</span><button onclick="deletePodcastSession(${i})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;">🗑</button></div>`).join('');
    // Top shows
    const showMap = {};
    last30.forEach(d => (d.podcast?.sessions || []).forEach(s => { const k = s.show || 'Unknown'; showMap[k] = (showMap[k] || 0) + (s.minutes || 0); }));
    const ts = document.getElementById('podcastTopShows');
    const sorted = Object.entries(showMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (ts) ts.innerHTML = sorted.length === 0 ? '<div class="empty-state" style="padding:16px;"><div class="empty-state-text">No data yet</div></div>' : sorted.map(([name, mins]) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><span>${sanitizeInput(name)}</span><span style="font-weight:600;">${mins}m</span></div>`).join('');
    // Week chart
    const last7 = last30.slice(0, 7);
    const wc = document.getElementById('podcastWeekChart');
    if (wc) { const max = Math.max(...last7.map(d => (d.podcast?.sessions || []).reduce((s, x) => s + (x.minutes || 0), 0)), 1); wc.innerHTML = [...last7].reverse().map(d => { const m = (d.podcast?.sessions || []).reduce((s, x) => s + (x.minutes || 0), 0); const h = Math.max((m / max) * 100, m > 0 ? 10 : 0); const day = new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }); return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;justify-content:flex-end;"><span style="font-size:10px;">${m > 0 ? m + 'm' : ''}</span><div style="width:100%;background:${m > 0 ? 'var(--podcast,#a855f7)' : 'var(--surface2)'};border-radius:6px 6px 2px 2px;height:${h}%;min-height:${m > 0 ? '8px' : '0'};opacity:${m > 0 ? 1 : 0.25};"></div><span style="font-size:10px;color:var(--text-muted);">${day}</span></div>`; }).join(''); }
}

window.addPodcastSession = async () => {
    const show = sanitizeInput(document.getElementById('podcastShowInput')?.value || '');
    const mins = parseInt(document.getElementById('podcastMinutesInput')?.value) || 0;
    if (!mins || mins < 1) { showToast('Add minutes', 'error'); return; }
    ensurePodcastDefaults(todayData);
    todayData.podcast.sessions.push({ show: show || 'Quick session', episode: sanitizeInput(document.getElementById('podcastEpisodeInput')?.value || ''), platform: document.getElementById('podcastPlatformInput')?.value || '', category: document.getElementById('podcastCategoryInput')?.value || 'other', minutes: Math.min(300, mins), notes: sanitizeInput(document.getElementById('podcastNotesInput')?.value || ''), ts: Date.now() });
    await saveTodayData({ podcast: todayData.podcast });
    ['podcastShowInput', 'podcastEpisodeInput', 'podcastMinutesInput', 'podcastNotesInput'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    await renderPodcastPage(); showToast('🎧 Session saved!');
};
window.quickAddPodcastMinutes = async () => { const mins = parseInt(document.getElementById('podcastQuickMinutesInput')?.value) || 0; if (!mins) return; ensurePodcastDefaults(todayData); todayData.podcast.sessions.push({ show: 'Quick session', minutes: Math.min(300, mins), ts: Date.now() }); await saveTodayData({ podcast: todayData.podcast }); document.getElementById('podcastQuickMinutesInput').value = ''; await renderPodcastPage(); showToast('🎧 Added!'); };
window.deletePodcastSession = async (i) => { ensurePodcastDefaults(todayData); todayData.podcast.sessions.splice(i, 1); await saveTodayData({ podcast: todayData.podcast }); await renderPodcastPage(); showToast('Deleted'); };
window.savePodcastGoal = async () => { const g = Math.max(5, parseInt(document.getElementById('podcastGoalInput')?.value) || 30); ensurePodcastDefaults(todayData); todayData.podcast.goal = g; await saveTodayData({ podcast: todayData.podcast }); await renderPodcastPage(); showToast('Goal saved!'); };
window.resetPodcastToday = async () => { ensurePodcastDefaults(todayData); todayData.podcast.sessions = []; await saveTodayData({ podcast: todayData.podcast }); await renderPodcastPage(); showToast('Reset!'); };

// ─── GOALS COMMAND CENTER ──────────────────────────────────
function ensureWeeklyGoalsDefaults() { if (!userProfile) userProfile = {}; if (!userProfile.weeklyGoals) userProfile.weeklyGoals = []; if (!userProfile.customGoals) userProfile.customGoals = []; }
function getWeekLabel() { const now = new Date(); const start = new Date(now); start.setDate(now.getDate() - now.getDay()); return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(start.getTime() + 6 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`; }

const GOAL_CAT_ICONS = { health: '🏥', learning: '📚', work: '💼', personal: '👤', fitness: '🏋️', worship: '🕌' };
const GOAL_DURATION_DAYS = { month: 30, quarter: 90, half: 180, year: 365 };

// ── Auto-Tracking Engine ──
// Computes real progress for goals with a non-manual source
function computeGoalProgress(daysData, goal) {
    const src = goal.source;
    if (!src || src === 'manual') return null; // manual goals are user-updated

    let value = 0;
    const exerciseName = (goal.sourceExercise || goal.title || '').toLowerCase();

    for (const d of daysData) {
        switch (src) {
            case 'reading_pages':
                value += d.reading?.pagesRead || 0;
                break;
            case 'podcast_minutes':
                // Sum from sessions array or fallback to minutes field
                if (Array.isArray(d.podcast?.sessions) && d.podcast.sessions.length > 0) {
                    value += d.podcast.sessions.reduce((s, sess) => s + (sess.duration || sess.minutes || 0), 0);
                } else {
                    value += d.podcast?.minutes || 0;
                }
                break;
            case 'podcast_sessions':
                value += Array.isArray(d.podcast?.sessions) ? d.podcast.sessions.length : (d.podcast?.minutes > 0 ? 1 : 0);
                break;
            case 'worship_quran_pages':
                value += d.worship?.quranPages || 0;
                break;
            case 'worship_prayers': {
                const prayers = ['fajr', 'duhr', 'asr', 'maghrib', 'isha'];
                value += prayers.filter(p => d.worship?.[p]).length;
                break;
            }
            case 'fitness_days':
                if (d.fitness?.done) value += 1;
                break;
            case 'fitness_sessions':
                if (Array.isArray(d.fitness?.workouts) && d.fitness.workouts.length > 0) {
                    value += d.fitness.workouts.length;
                } else if (d.fitness?.done) {
                    value += 1;
                }
                break;
            case 'fitness_minutes':
                value += d.fitness?.duration || 0;
                break;
            case 'fitness_reps_exercise':
                // Sum reps from workouts array matching exercise name
                if (Array.isArray(d.fitness?.workouts)) {
                    value += d.fitness.workouts
                        .filter(w => (w.exercise || w.name || '').toLowerCase().includes(exerciseName))
                        .reduce((s, w) => s + (w.reps || 0), 0);
                }
                // Also check top-level fitness reps if exercise matches
                if (d.fitness?.reps && (d.fitness.exercise || '').toLowerCase().includes(exerciseName)) {
                    value += d.fitness.reps;
                }
                break;
            case 'learning_sessions':
                if (d.learning?.done) value += 1;
                break;
            case 'work_tasks_all':
                value += (d.work?.tasks || []).filter(t => t.done).length;
                break;
            case 'work_tasks_high':
                value += (d.work?.tasks || []).filter(t => t.done && t.priority === 'high').length;
                break;
        }
    }
    return value;
}

// Fetches data for the right time period and updates goal.current
async function syncAutoTrackedGoals() {
    ensureWeeklyGoalsDefaults();
    let needSaveWeekly = false;
    let needSaveCustom = false;

    // Weekly goals: use last 7 days
    const weeklyGoals = userProfile.weeklyGoals || [];
    const hasAutoWeekly = weeklyGoals.some(g => g.source && g.source !== 'manual');

    if (hasAutoWeekly) {
        const weekData = await getLastNDays(7);
        for (const g of weeklyGoals) {
            if (!g.source || g.source === 'manual') continue;
            const computed = computeGoalProgress(weekData, g);
            if (computed !== null && computed !== g.current) {
                g.current = computed;
                g.updatedAt = Date.now();
                needSaveWeekly = true;
            }
        }
    }

    // Custom goals: use days since startDate
    const customGoals = userProfile.customGoals || [];
    const hasAutoCustom = customGoals.some(g => g.source && g.source !== 'manual');

    if (hasAutoCustom) {
        for (const g of customGoals) {
            if (!g.source || g.source === 'manual') continue;
            const startDate = g.startDate ? new Date(g.startDate) : new Date();
            const daysSinceStart = Math.max(1, Math.ceil((Date.now() - startDate.getTime()) / 86400000));
            // Limit to 365 days max to avoid huge queries
            const daysToFetch = Math.min(daysSinceStart, 365);
            const periodData = await getLastNDays(daysToFetch);
            const computed = computeGoalProgress(periodData, g);
            if (computed !== null && computed !== g.current) {
                g.current = computed;
                g.updatedAt = Date.now();
                needSaveCustom = true;
            }
        }
    }

    // Save only if changed
    if (needSaveWeekly) await saveUserData({ weeklyGoals: userProfile.weeklyGoals });
    if (needSaveCustom) await saveUserData({ customGoals: userProfile.customGoals });
}


function renderGoalCard(g, i, type) {
    const pct = Math.min(100, g.target > 0 ? Math.round((g.current / g.target) * 100) : 0);
    const isComplete = g.current >= g.target;
    const icon = GOAL_CAT_ICONS[g.category] || '🎯';
    const isManual = !g.source || g.source === 'manual';
    const SOURCE_LABELS = { reading_pages: '📚 Reading pages', podcast_minutes: '🎧 Podcast min', podcast_sessions: '🎧 Podcast sessions', worship_quran_pages: '🕌 Quran pages', worship_prayers: '🕌 Prayers', fitness_days: '🏋️ Active days', fitness_sessions: '🏋️ Workouts', fitness_minutes: '🏋️ Fitness min', fitness_reps_exercise: '🏋️ Reps', learning_sessions: '🧠 Learning', work_tasks_all: '💼 Tasks done', work_tasks_high: '💼 Priority tasks' };
    const sourceLabel = isManual ? 'Manual' : (SOURCE_LABELS[g.source] || 'Auto-tracked');
    const daysLeft = type === 'custom' && g.endDate ? Math.max(0, Math.ceil((new Date(g.endDate) - new Date()) / 86400000)) : null;

    return `<div class="goal-card ${isComplete ? 'is-complete' : ''}">
      <div class="goal-card__header">
        <div style="display:flex;gap:12px;align-items:flex-start;flex:1;min-width:0;">
          <div class="goal-card__icon">${icon}</div>
          <div style="flex:1;min-width:0;">
            <div class="goal-card__title">${sanitizeInput(g.title)}</div>
            <div class="goal-card__meta">
              <span class="goal-card__category cat-${g.category}">${g.category}</span>
              ${g.unit ? `<span>• ${g.unit}</span>` : ''}
              ${daysLeft !== null ? `<span>• ${daysLeft}d left</span>` : ''}
            </div>
          </div>
        </div>
        <div class="goal-card__actions">
          <button class="goal-card__action-btn" onclick="openEditGoalModal('${type}', ${i})" title="Edit">✏️</button>
          <button class="goal-card__action-btn danger" onclick="deleteGoal('${type}', ${i})" title="Delete">🗑</button>
        </div>
      </div>
      <div class="goal-card__progress">
        <div class="goal-card__progress-header">
          <div class="goal-card__progress-values"><strong>${g.current}</strong> / ${g.target} ${g.unit || ''}</div>
          <div class="goal-card__progress-pct">${pct}%</div>
        </div>
        <div class="goal-card__track"><div class="goal-card__fill" style="width:${pct}%"></div></div>
      </div>
      <div class="goal-card__update">
        ${isManual ? `<input type="number" id="goalUpd_${type}_${i}" placeholder="Add" min="0">
          <button class="btn btn-ghost btn-sm" onclick="quickUpdateGoal('${type}', ${i})">Update</button>` :
          `<span class="goal-card__source-badge">${sourceLabel}</span>`}
      </div>
    </div>`;
}

let _goalsSyncing = false;
async function renderWeeklyGoalsPage() {
    ensureWeeklyGoalsDefaults();

    // Auto-sync tracked goals (debounced, non-recursive)
    if (!_goalsSyncing) {
        _goalsSyncing = true;
        try { await syncAutoTrackedGoals(); } catch (e) { console.warn('Goal sync error:', e); }
        _goalsSyncing = false;
    }

    const setText = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setText('weeklyGoalsWeekLabel', `Week: ${getWeekLabel()}`);

    // Render Weekly Goals
    const goals = userProfile.weeklyGoals || [];
    const search = (document.getElementById('weeklyGoalsSearch')?.value || '').toLowerCase();
    const catFilter = document.getElementById('weeklyGoalsCategoryFilter')?.value || 'all';
    const sort = document.getElementById('weeklyGoalsSort')?.value || 'priority';

    let filtered = goals.map((g, i) => ({ ...g, _i: i }));
    if (search) filtered = filtered.filter(g => g.title?.toLowerCase().includes(search));
    if (catFilter !== 'all') filtered = filtered.filter(g => g.category === catFilter);

    if (sort === 'progressDesc') filtered.sort((a, b) => ((b.current / b.target) || 0) - ((a.current / a.target) || 0));
    else if (sort === 'updatedDesc') filtered.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    else if (sort === 'titleAsc') filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else filtered.sort((a, b) => { const pa = a.target > 0 ? (a.target - a.current) / a.target : 1; const pb = b.target > 0 ? (b.target - b.current) / b.target : 1; return pa - pb; });

    const list = document.getElementById('goalsList');
    if (list) {
        if (filtered.length === 0) {
            list.innerHTML = '<div class="empty-state" style="padding:40px;grid-column:1/-1;"><div class="empty-state-icon">🎯</div><div class="empty-state-text">No weekly goals yet. Add your first goal!</div></div>';
        } else {
            list.innerHTML = filtered.map(g => renderGoalCard(g, g._i, 'weekly')).join('');
        }
    }

    // Render Custom Goals
    renderCustomGoalsList();

    // Unified Analytics
    renderGoalsAnalytics();
}

function renderCustomGoalsList(durationFilter = 'all') {
    ensureWeeklyGoalsDefaults();
    const customGoals = userProfile.customGoals || [];
    let filtered = customGoals.map((g, i) => ({ ...g, _i: i }));
    if (durationFilter !== 'all') {
        filtered = filtered.filter(g => g.durationType === durationFilter);
    }

    const list = document.getElementById('customGoalsList');
    if (!list) return;
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:40px;grid-column:1/-1;"><div class="empty-state-icon">🏆</div><div class="empty-state-text">No custom goals yet. Set your first long-term target!</div></div>';
    } else {
        list.innerHTML = filtered.map(g => renderGoalCard(g, g._i, 'custom')).join('');
    }
}

function renderGoalsAnalytics() {
    ensureWeeklyGoalsDefaults();
    const setText = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const weekly = userProfile.weeklyGoals || [];
    const custom = userProfile.customGoals || [];
    const all = [...weekly, ...custom];

    const total = all.length;
    const completed = all.filter(g => g.current >= g.target).length;
    const active = all.filter(g => g.current > 0 && g.current < g.target).length;
    const avgProgress = total > 0 ? Math.round(all.reduce((s, g) => s + Math.min(100, g.target > 0 ? (g.current / g.target) * 100 : 0), 0) / total) : 0;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    setText('totalGoalsCount', total);
    setText('totalGoalsSub', `${weekly.length} weekly + ${custom.length} custom`);
    setText('totalGoalsCompleted', completed);
    setText('totalCompletedSub', `${rate}% success rate`);
    setText('totalGoalsProgress', avgProgress + '%');
    setText('totalGoalsStreak', active);
    setText('totalGoalsRate', rate + '%');
    setText('goalsAnalyticsSummary', total > 0 ? `You have ${total} goals: ${completed} completed, ${active} in progress, ${total - completed - active} not started.` : 'Set your goals to start building insights.');

    // Category breakdown
    const catEl = document.getElementById('goalsCategoryBreakdown');
    if (catEl) {
        const cats = {};
        all.forEach(g => { const c = g.category || 'personal'; if (!cats[c]) cats[c] = { total: 0, done: 0 }; cats[c].total++; if (g.current >= g.target) cats[c].done++; });
        catEl.innerHTML = Object.entries(cats).map(([cat, data]) => `
          <div class="goals-category-chip">
            <div class="goals-category-chip__icon">${GOAL_CAT_ICONS[cat] || '📋'}</div>
            <div class="goals-category-chip__name">${cat}</div>
            <div class="goals-category-chip__value">${data.done}/${data.total}</div>
          </div>
        `).join('') || '<div style="font-size:12px;color:var(--text-muted);">No goals to analyze yet.</div>';
    }
}

// ── Modal Handling ──
window.openAddGoalModal = (type = 'weekly') => {
    document.getElementById('addGoalType').value = type;
    document.getElementById('addGoalTitle').textContent = type === 'custom' ? '🏆 Add Custom Goal' : '🎯 Add Weekly Goal';
    const durGroup = document.getElementById('addGoalDurationGroup');
    if (durGroup) durGroup.style.display = type === 'custom' ? '' : 'none';
    // Reset form
    document.getElementById('newGoalName').value = '';
    document.getElementById('newGoalTarget').value = '10';
    document.getElementById('newGoalUnit').value = '';
    document.getElementById('newGoalSource').value = 'manual';
    openModal('addGoalModal');
};

window.addGoalFromModal = async () => {
    const type = document.getElementById('addGoalType').value;
    const title = sanitizeInput(document.getElementById('newGoalName').value.trim());
    const category = document.getElementById('newGoalCategory').value;
    const source = document.getElementById('newGoalSource').value;
    const target = parseInt(document.getElementById('newGoalTarget').value) || 0;
    const unit = document.getElementById('newGoalUnit')?.value?.trim() || '';
    if (!title || !target) return showToast('Please fill in all fields', 'error');

    ensureWeeklyGoalsDefaults();
    const goal = { title, category, source, target, current: 0, unit, createdAt: Date.now(), updatedAt: Date.now() };

    if (type === 'custom') {
        const durationType = document.getElementById('newGoalDuration').value;
        const days = durationType === 'custom' ? (parseInt(document.getElementById('newGoalCustomDays').value) || 30) : (GOAL_DURATION_DAYS[durationType] || 30);
        goal.durationType = durationType;
        goal.durationDays = days;
        goal.startDate = new Date().toISOString();
        goal.endDate = new Date(Date.now() + days * 86400000).toISOString();
        userProfile.customGoals.push(goal);
        await saveUserData({ customGoals: userProfile.customGoals });
    } else {
        userProfile.weeklyGoals.push(goal);
        await saveUserData({ weeklyGoals: userProfile.weeklyGoals });
    }

    closeModal('addGoalModal');
    await renderWeeklyGoalsPage();
    showToast('🎯 Goal added!');
};

window.openEditGoalModal = (type, i) => {
    ensureWeeklyGoalsDefaults();
    const goals = type === 'custom' ? userProfile.customGoals : userProfile.weeklyGoals;
    const g = goals[i];
    if (!g) return;
    document.getElementById('editGoalType').value = type;
    document.getElementById('editGoalIndex').value = i;
    document.getElementById('editGoalTitle').textContent = type === 'custom' ? '✏️ Edit Custom Goal' : '✏️ Edit Weekly Goal';
    document.getElementById('editGoalName').value = g.title || '';
    document.getElementById('editGoalCategory').value = g.category || 'personal';
    document.getElementById('editGoalSource').value = g.source || 'manual';
    document.getElementById('editGoalTarget').value = g.target || 0;
    openModal('editGoalModal');
};

window.updateGoalFromModal = async () => {
    const type = document.getElementById('editGoalType').value;
    const i = parseInt(document.getElementById('editGoalIndex').value);
    ensureWeeklyGoalsDefaults();
    const goals = type === 'custom' ? userProfile.customGoals : userProfile.weeklyGoals;
    if (!goals[i]) return;
    goals[i].title = sanitizeInput(document.getElementById('editGoalName').value.trim());
    goals[i].category = document.getElementById('editGoalCategory').value;
    goals[i].source = document.getElementById('editGoalSource').value;
    goals[i].target = parseInt(document.getElementById('editGoalTarget').value) || goals[i].target;
    goals[i].updatedAt = Date.now();
    await saveUserData(type === 'custom' ? { customGoals: userProfile.customGoals } : { weeklyGoals: userProfile.weeklyGoals });
    closeModal('editGoalModal');
    await renderWeeklyGoalsPage();
    showToast('✅ Goal updated!');
};

window.quickUpdateGoal = async (type, i) => {
    ensureWeeklyGoalsDefaults();
    const goals = type === 'custom' ? userProfile.customGoals : userProfile.weeklyGoals;
    const val = parseInt(document.getElementById(`goalUpd_${type}_${i}`)?.value) || 0;
    if (!val || !goals[i]) return;
    goals[i].current = (goals[i].current || 0) + val;
    goals[i].updatedAt = Date.now();
    await saveUserData(type === 'custom' ? { customGoals: userProfile.customGoals } : { weeklyGoals: userProfile.weeklyGoals });
    await renderWeeklyGoalsPage();
    showToast('Updated!');
};

window.deleteGoal = async (type, i) => {
    if (!confirm('Delete this goal?')) return;
    ensureWeeklyGoalsDefaults();
    if (type === 'custom') { userProfile.customGoals.splice(i, 1); await saveUserData({ customGoals: userProfile.customGoals }); }
    else { userProfile.weeklyGoals.splice(i, 1); await saveUserData({ weeklyGoals: userProfile.weeklyGoals }); }
    await renderWeeklyGoalsPage();
    showToast('Deleted');
};

// Keep backward compat
window.deleteWeeklyGoal = async (i) => window.deleteGoal('weekly', i);
window.updateWeeklyGoal = async (i) => window.quickUpdateGoal('weekly', i);

window.applyGoalTemplate = (t) => { const templates = { pushups900: { title: 'Push-ups', target: 900, unit: 'reps', category: 'fitness', source: 'fitness_reps_exercise' }, quran70: { title: 'Quran Reading', target: 70, unit: 'pages', category: 'worship', source: 'worship_quran_pages' }, reading150: { title: 'Book Reading', target: 150, unit: 'pages', category: 'learning', source: 'reading_pages' }, podcast210: { title: 'Podcast Listening', target: 210, unit: 'min', category: 'learning', source: 'podcast_minutes' }, fitness240: { title: 'Exercise', target: 240, unit: 'min', category: 'fitness', source: 'fitness_minutes' }, learning5: { title: 'Learning Sessions', target: 5, unit: 'sessions', category: 'learning', source: 'learning_sessions' } }; const tp = templates[t]; if (!tp) return; ensureWeeklyGoalsDefaults(); userProfile.weeklyGoals.push({ ...tp, current: 0, createdAt: Date.now(), updatedAt: Date.now() }); saveUserData({ weeklyGoals: userProfile.weeklyGoals }).then(() => { renderWeeklyGoalsPage(); showToast('🎯 Template applied!'); }); };

// ── Tab & Filter Controls ──
window.switchGoalsTab = (tab) => {
    document.querySelectorAll('.goals-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.goals-tab-btn').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById(`goalsTab-${tab}`);
    if (tabEl) tabEl.style.display = '';
    document.querySelector(`[data-goals-tab="${tab}"]`)?.classList.add('active');
};

window.filterCustomGoals = (dur) => {
    document.querySelectorAll('#customGoalDurationFilter .goal-duration-chip').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-duration="${dur}"]`)?.classList.add('active');
    renderCustomGoalsList(dur);
};

window.toggleCustomDays = () => {
    const sel = document.getElementById('newGoalDuration');
    const group = document.getElementById('addGoalCustomDaysGroup');
    if (group) group.style.display = sel?.value === 'custom' ? '' : 'none';
};

window.handleGoalSourceChange = (prefix) => {
    const src = document.getElementById(`${prefix === 'new' ? 'new' : 'edit'}GoalSource`)?.value || '';
    const exGroup = document.getElementById(`${prefix === 'new' ? 'new' : 'edit'}GoalSourceExerciseGroup`);
    if (exGroup) exGroup.style.display = src === 'fitness_reps_exercise' ? '' : 'none';
};

window.setWeeklyGoalsView = (view) => {
    document.querySelectorAll('.goals-view-btn').forEach(el => { el.classList.toggle('active', el.dataset.goalsView === view); el.setAttribute('aria-pressed', el.dataset.goalsView === view); });
};
window.onWeeklyGoalsControlsChanged = () => { renderWeeklyGoalsPage(); };

// ─── NOTES ────────────────────────────────────────────────
function ensureNotesDefaults() { if (!userProfile) userProfile = {}; if (!Array.isArray(userProfile.notes)) userProfile.notes = []; }

async function renderNotesPage() {
    ensureNotesDefaults();
    const list = document.getElementById('notesList');
    if (!list) return;
    const notes = userProfile.notes || [];
    if (notes.length === 0) { list.innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-state-icon">📝</div><div class="empty-state-text">No notes yet</div></div>'; return; }
    list.innerHTML = notes.map((n, i) => `<div class="card" style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;"><div style="flex:1;"><div style="font-weight:600;">${sanitizeInput(n.title)}</div><div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${renderSafeMultiline(n.content || '')}</div><div style="font-size:11px;color:var(--text-muted);margin-top:6px;">${new Date(n.createdAt).toLocaleDateString('en-US')}</div></div><button onclick="deleteNote(${i})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;">🗑</button></div></div>`).join('');
}

window.filterNotes = (q) => { ensureNotesDefaults(); const list = document.getElementById('notesList'); if (!list) return; const notes = (userProfile.notes || []).filter(n => !q || n.title?.toLowerCase().includes(q.toLowerCase()) || n.content?.toLowerCase().includes(q.toLowerCase())); list.innerHTML = notes.length === 0 ? '<div class="empty-state"><div class="empty-state-text">No matching notes</div></div>' : notes.map((n, i) => `<div class="card" style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;"><div style="flex:1;"><div style="font-weight:600;">${sanitizeInput(n.title)}</div><div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${renderSafeMultiline(n.content || '')}</div></div><button onclick="deleteNote(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);">🗑</button></div></div>`).join(''); };
window.deleteNote = async (i) => { if (!confirm('Delete?')) return; ensureNotesDefaults(); userProfile.notes.splice(i, 1); await saveUserData({ notes: userProfile.notes }); await renderNotesPage(); showToast('Deleted'); };
