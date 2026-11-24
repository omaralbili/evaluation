// ==========================================
// 0. منظومة إدارة الوضع الليلي والنهاري (Dark / Light Theme Suite)
// ==========================================
function initTheme() {
  try {
    const savedTheme = localStorage.getItem('app_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    applyTheme(currentTheme);
  } catch (e) {}
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  try {
    localStorage.setItem('app_theme', theme);
  } catch (e) {}
  updateThemeIcons(theme);
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.classList.contains('dark');
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
}

function updateThemeIcons(theme) {
  const buttons = document.querySelectorAll('.theme-toggle-btn');
  buttons.forEach(btn => {
    if (theme === 'dark') {
      btn.innerHTML = '<i class="fa-solid fa-sun text-amber-400"></i>';
      btn.title = 'تفعيل الوضع النهاري';
    } else {
      btn.innerHTML = '<i class="fa-solid fa-moon text-slate-700"></i>';
      btn.title = 'تفعيل الوضع الليلي';
    }
  });
}

// تهيئة فورية للوضع الليلي عند تحميل الصفحة
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }
}

// تبديل إظهار / إخفاء كلمة المرور (أيقونة العين) للطلاب وأعضاء هيئة التدريس والإدارة
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const currentType = input.getAttribute('type');
  const isPassword = currentType === 'password';
  input.setAttribute('type', isPassword ? 'text' : 'password');

  const icon = btn ? btn.querySelector('i') : null;
  if (icon) {
    if (isPassword) {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    } else {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }
}

// ==========================================
// 1. أمن البيانات ودوال الحماية (Security Suite)
// ==========================================

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debounce(fn, delay = 200) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function secureShuffleArray(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return [];
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function showSection(id) {
  if (isExamActive) return;
  const sections = ['student-login', 'admin-login', 'dashboard'];
  sections.forEach(sec => {
    const el = document.getElementById(sec);
    if (el) el.classList.add('hidden');
  });
  
  const target = document.getElementById(id);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('animate-fade-in');
  }
}

async function apiCall(payload, options = {}) {
  // إرفاق رمز الجلسة تلقائياً مع الطلبات المحمية بعد تسجيل الدخول
  if (currentUser && currentUser.token && !payload.auth_token) {
    payload.auth_token = currentUser.token;
  }
  const showModal = !options.silent && !payload.silent;
  if (showModal) {
    Swal.fire({
      title: 'جاري المعالجة...',
      text: 'يرجى الانتظار ثوانٍ معدودة',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading()
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      throw new Error('invalid_json_response');
    }

    if (showModal) Swal.close();

    // معالجة تلقائية لانتهاء الجلسة
    if (data && data.status === 'error' && typeof data.message === 'string' && data.message.includes('انتهت صلاحية الجلسة')) {
      Swal.fire({
        title: 'انتهت الجلسة',
        text: 'انتهت صلاحية جلسة تسجيل الدخول الحالية، يرجى تسجيل الدخول مجدداً.',
        icon: 'warning',
        confirmButtonText: 'حسناً'
      }).then(() => {
        if (typeof logoutAdmin === 'function' && document.getElementById('dashboard') && !document.getElementById('dashboard').classList.contains('hidden')) {
          logoutAdmin();
        } else if (typeof facultyLogout === 'function' && document.getElementById('faculty-workspace') && !document.getElementById('faculty-workspace').classList.contains('hidden')) {
          facultyLogout();
        }
      });
    }

    return data;
  } catch (e) {
    if (showModal) {
      Swal.fire({
        title: 'خطأ في الاتصال',
        text: 'تعذر الاتصال بالخادم أو انتهت مهلة الاستجابة. يرجى التأكد من اتصال الإنترنت وتحديث النشر.',
        icon: 'error',
        confirmButtonText: 'حسناً'
      });
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// تحميل إعدادات Regex تلقائياً عند بدء الصفحة وفحص أي تسليمات معلقة مع كاش فوري
document.addEventListener('DOMContentLoaded', () => {
  loadSettingsFromServer();
  onGradeChange();
  // وحدة الطالب قد لا تكون محمّلة في كل الصفحات (مثل بوابة هيئة التدريس)
  if (typeof checkAndRecoverPendingSubmissions === 'function') {
    checkAndRecoverPendingSubmissions();
  }
});

async function loadSettingsFromServer() {
  try {
    // 1. استرجاع فوري من الكاش المحلي لمنع أي تأخير في الاستجابة
    const cachedSettings = sessionStorage.getItem('cached_grade_rules');
    if (cachedSettings) {
      try {
        const parsed = JSON.parse(cachedSettings);
        if (parsed && Object.keys(parsed).length > 0) {
          gradeRegexRules = parsed;
          onGradeChange();
          if (typeof populateRegexInputs === 'function') {
            populateRegexInputs();
          }
        }
      } catch (e) {}
    }

    // 2. تحديث متزامن خفيف في الخلفية
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'get_settings' })
    });
    const data = await res.json();
    if (data && data.status === 'success' && data.rules && Object.keys(data.rules).length > 0) {
      gradeRegexRules = data.rules;
      sessionStorage.setItem('cached_grade_rules', JSON.stringify(data.rules));
      onGradeChange();
      if (typeof populateRegexInputs === 'function') {
        populateRegexInputs();
      }
    }
  } catch (e) {
    console.warn("Could not fetch remote settings, using local defaults", e);
  }
}

// تحديث نص تلميح كلمة المرور بناءً على الفرقة المختارة (مخفية أمنياً عن الطالب)
function onGradeChange() {
  // تم إخفاء الـ Regex والأمثلة عن الطالب لأغراض الأمان والسرية
}

// تحميل مكتبة Excel (XLSX ~800KB) كسلاً عند أول تصدير فقط، مع تثبيت سلامة المورد (SRI)
// حتى لا يتحمل كل طالب وزن المكتبة على هاتفه وهي مستخدمة في لوحة الإدارة فقط
let xlsxLoadingPromise = null;
function ensureXlsxLoaded() {
  if (window.XLSX) return Promise.resolve();
  if (xlsxLoadingPromise) return xlsxLoadingPromise;

  xlsxLoadingPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => {
      xlsxLoadingPromise = null;
      reject(new Error('xlsx_load_failed'));
    };
    document.head.appendChild(s);
  });

  return xlsxLoadingPromise;
}
