/**
 * منظومة الأمان والتحكم البرمجي - منصة الاختبارات المؤمنة
 * تتضمن:
 * 1. دعم الفرقة (الأولى - الثانية - الثالثة - الرابعة) والفرع (المنصورة - منية النصر - ميت غمر)
 * 2. تطبيق Regex مخصص لكل فرقة دراسية يتم جلبه وتعديله من لوحة الإدارة
 * 3. التحقق الصارم من عدم تكرار كلمة المرور نهائياً بين الطلاب عبر قاعدة البيانات
 * 4. نظام منع الغش الدقيق، حظر فتح أي تبويبات أو اختصارات، ووضع ملء الشاشة
 */

// رابط Google Apps Script الخاص بقاعدة البيانات
const API_URL = "https://script.google.com/macros/s/AKfycbwc14BGyAzlPv7FFA2kdVuBKpVNMxyO5XekIQCP39BhDd-fVjki5cclHqP1bG5doLNh/exec";

let currentUser = null;
let currentExam = null;
let examTimer = null;
let isExamActive = false;
let examWarningsCount = 0;
const MAX_ALLOWED_WARNINGS = 2;

// قواعد Regex الافتراضية للفرق
let gradeRegexRules = {
  'الفرقة الأولى': { pattern: '^G1-[0-9]{4}$', hint: 'تبدأ بـ G1- متبوعة بـ 4 أرقام مثل: G1-1234' },
  'الفرقة الثانية': { pattern: '^G2-[0-9]{4}$', hint: 'تبدأ بـ G2- متبوعة بـ 4 أرقام مثل: G2-1234' },
  'الفرقة الثالثة': { pattern: '^G3-[0-9]{4}$', hint: 'تبدأ بـ G3- متبوعة بـ 4 أرقام مثل: G3-1234' },
  'الفرقة الرابعة': { pattern: '^G4-[0-9]{4}$', hint: 'تبدأ بـ G4- متبوعة بـ 4 أرقام مثل: G4-1234' }
};

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

function secureShuffleArray(arr) {
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

async function apiCall(payload) {
  Swal.fire({
    title: 'جاري المعالجة...',
    text: 'يرجى الانتظار ثوانٍ معدودة',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    Swal.close();
    return data;
  } catch (e) {
    Swal.fire({
      title: 'خطأ في الاتصال',
      text: 'تعذر الاتصال بالخادم. يرجى التأكد من اتصال الإنترنت وتحديث تطبيق Google Apps Script.',
      icon: 'error',
      confirmButtonText: 'حسناً'
    });
    return null;
  }
}

// تحميل إعدادات Regex تلقائياً عند بدء الصفحة وفحص أي تسليمات معلقة
document.addEventListener('DOMContentLoaded', () => {
  loadSettingsFromServer();
  onGradeChange();
  checkAndRecoverPendingSubmissions();
});

async function loadSettingsFromServer() {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'get_settings' })
    });
    const data = await res.json();
    if (data && data.status === 'success' && data.rules && Object.keys(data.rules).length > 0) {
      gradeRegexRules = data.rules;
      onGradeChange();
      populateRegexInputs();
    }
  } catch (e) {
    console.warn("Could not fetch remote settings, using local defaults", e);
  }
}

// تحديث نص تلميح كلمة المرور بناءً على الفرقة المختارة (مخفية أمنياً عن الطالب)
function onGradeChange() {
  // تم إخفاء الـ Regex والأمثلة عن الطالب لأغراض الأمان والسرية
}

// ==========================================
// 2. منطق الطالب وتجربة الامتحان والكاميرا
// ==========================================

let studentMediaStream = null;
let cameraBroadcastInterval = null;
let camAlertCheckInterval = null;
let isActivatingCamera = false; // لمنع اعتبار طلب إذن الكاميرا محاولة غش
let lastCamAlertTimestamp = Date.now();

// فحص دوري سحابي ذكي لاستقبال إشعارات وتنبيهات الأستاذ لفتح الكاميرا (مُحسّن لتحمل 300+ طالب)
function startCamAlertPolling() {
  if (camAlertCheckInterval) clearInterval(camAlertCheckInterval);
  camAlertCheckInterval = setInterval(async () => {
    if (!isExamActive || studentMediaStream || isActivatingCamera) return;
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'check_cam_alert',
          last_checked: lastCamAlertTimestamp
        })
      });
      const data = await res.json();
      if (data && data.has_alert) {
        lastCamAlertTimestamp = data.timestamp;
        showFacultyCamRequestAlert();
      }
    } catch (err) {}
  }, 12000);
}

function showFacultyCamRequestAlert() {
  if (studentMediaStream || isActivatingCamera) return;
  isActivatingCamera = true;
  Swal.fire({
    title: 'تنبيه أمني من أستاذ المادة!',
    text: 'طلب مراقب الاختبار تفعيل الكاميرا الآن للمراقبة الحية المباشرة. يرجى الضغط على زر تفعيل الكاميرا لمتابعة الاختبار.',
    icon: 'warning',
    confirmButtonText: 'تفعيل الكاميرا الآن',
    confirmButtonColor: '#059669',
    allowOutsideClick: false
  }).then(() => {
    toggleStudentCamera();
  });
}

// دعم التنبيه المحلي السريع أيضاً
window.addEventListener('storage', (e) => {
  if (e.key === 'faculty_cam_request_broadcast' && isExamActive) {
    showFacultyCamRequestAlert();
  }
});

async function toggleStudentCamera() {
  const btn = document.getElementById('student-camera-btn');
  const icon = document.getElementById('student-camera-icon');
  const label = document.getElementById('student-camera-label');
  const previewBox = document.getElementById('student-cam-preview-box');
  const videoEl = document.getElementById('student-video-element');

  // إذا كانت الكاميرا تعمل بالفعل -> إيقافها
  if (studentMediaStream) {
    stopStudentCamera();
    if (btn) btn.classList.replace('btn-success', 'btn-outline');
    if (icon) {
      icon.className = 'fa-solid fa-video-slash text-slate-400';
    }
    if (label) label.innerText = 'تشغيل الكاميرا';
    if (previewBox) previewBox.classList.add('hidden');
    return;
  }

  // وضع مؤشر تفعيل الكاميرا لتجميد كشف الغش مؤقتاً أثناء ظهور نافذة إذن المتصفح
  isActivatingCamera = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      audio: false
    });

    studentMediaStream = stream;
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.play();
    }

    if (btn) {
      btn.classList.remove('btn-outline');
      btn.classList.add('btn-success');
    }
    if (icon) {
      icon.className = 'fa-solid fa-video text-white';
    }
    if (label) label.innerText = 'إيقاف الكاميرا';
    if (previewBox) previewBox.classList.remove('hidden');

    // إعادة الشاشة لوضع ملء الشاشة إذا ألغاه إذن المتصفح
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {}

    // بدء بث اللقطات الحية للأستاذ سحابياً ومحلياً
    startCameraBroadcast();

  } catch (err) {
    Swal.fire({
      title: 'تعذر الوصول للكاميرا',
      text: 'يرجى السماح بصلاحية الكاميرا من إعدادات المتصفح لمتابعة المراقبة المباشرة.',
      icon: 'warning',
      confirmButtonText: 'حسناً'
    });
  } finally {
    // إتاحة ثوانٍ للتأقلم ثم إعادة تفعيل كواشف الغش
    setTimeout(() => {
      isActivatingCamera = false;
    }, 1500);
  }
}

function startCameraBroadcast() {
  if (cameraBroadcastInterval) clearInterval(cameraBroadcastInterval);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 240;
  canvas.height = 180;
  const videoEl = document.getElementById('student-video-element');

  cameraBroadcastInterval = setInterval(async () => {
    if (!studentMediaStream || !videoEl || videoEl.readyState < 2) return;

    try {
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const frameData = canvas.toDataURL('image/jpeg', 0.4);

      const streamPayload = {
        studentId: currentExam ? currentExam.student_id : 'guest',
        studentName: currentExam ? currentExam.student_name : 'طالب',
        grade: currentExam ? currentExam.student_grade : '',
        examId: currentExam ? currentExam.exam_id : '',
        frame: frameData,
        active: true,
        timestamp: Date.now()
      };

      // بث محلي
      localStorage.setItem(`student_cam_stream_${streamPayload.studentId}`, JSON.stringify(streamPayload));

      // بث سحابي عبر Google Apps Script لقاعة مراقبة الأستاذ
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'push_cam_frame',
          student_id: streamPayload.studentId,
          student_name: streamPayload.studentName,
          exam_id: streamPayload.examId,
          grade: streamPayload.grade,
          frame: frameData,
          active: true
        })
      }).catch(() => {});

    } catch (e) {}
  }, 6500);
}

function stopStudentCamera() {
  if (cameraBroadcastInterval) {
    clearInterval(cameraBroadcastInterval);
    cameraBroadcastInterval = null;
  }
  if (studentMediaStream) {
    studentMediaStream.getTracks().forEach(track => track.stop());
    studentMediaStream = null;
  }
  if (currentExam) {
    localStorage.setItem(`student_cam_stream_${currentExam.student_id}`, JSON.stringify({ active: false }));
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'push_cam_frame',
        student_id: currentExam.student_id,
        active: false
      })
    }).catch(() => {});
  }
}

async function startStudentExam(e) {
  e.preventDefault();
  const name = document.getElementById('st-name').value.trim();
  const grade = document.getElementById('st-grade').value.trim();
  const branch = document.getElementById('st-branch').value.trim();
  const id = document.getElementById('st-id').value.trim();
  const examId = document.getElementById('st-exam-code').value.trim().toUpperCase();
  const password = document.getElementById('st-password').value.trim();

  if (!name || !grade || !branch || !id || !examId || !password) {
    return Swal.fire('تنبيه', 'يرجى استكمال جميع البيانات بدقة (الاسم، الفرقة، الفرع، الـ ID، الكود، وكلمة المرور)', 'warning');
  }

  // 1. التحقق من تطابق كلمة المرور مع Regex الفرقة المختارة في الفرونت إند أولاً
  const currentRule = gradeRegexRules[grade];
  if (currentRule && currentRule.pattern) {
    try {
      const regExp = new RegExp(currentRule.pattern);
      if (!regExp.test(password)) {
        return Swal.fire({
          title: 'خطأ في كلمة المرور!',
          text: 'كلمة المرور المدخلة غير صحيحة أو غير متطابقة مع الفرقة الدراسية المحددة.',
          icon: 'error'
        });
      }
    } catch (err) {
      console.error("Local Regex Validation Error:", err);
    }
  }

  // 2. طلب بدء الامتحان والتحقق السحابي (Regex + فحص عدم تكرار كلمة المرور نهائياً)
  const res = await apiCall({
    action: 'get_exam',
    exam_id: examId,
    student_id: id,
    student_grade: grade,
    student_branch: branch,
    student_password: password
  });

  if (!res || res.status !== 'success') {
    return Swal.fire('تنبيه أمني', res ? res.message : 'تعذر تحميل بيانات الامتحان', 'warning');
  }

  // محاولة الدخول لوضع ملء الشاشة
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch (err) {
    console.warn("Fullscreen permission blocked or not permitted directly");
  }

  currentExam = {
    exam_id: examId,
    student_name: name,
    student_id: id,
    student_grade: grade,
    student_branch: branch,
    student_password: password,
    questions: secureShuffleArray(res.questions)
  };

  examWarningsCount = 0;

  // ملء بيانات الترويسة
  document.getElementById('exam-title-display').innerText = res.exam.title || 'الاختبار الإلكتروني';
  document.getElementById('student-info-display').innerText = `الطالب: ${name} | ${grade} (${branch}) | ID: ${id}`;

  // بناء الأسئلة
  renderQuestions(currentExam.questions);

  // إخفاء الأقسام وإظهار قاعة الامتحان
  document.getElementById('student-login').classList.add('hidden');
  document.getElementById('navbar').classList.add('hidden');
  document.getElementById('exam-room').classList.remove('hidden');

  document.body.classList.add('exam-active-mode');
  createSecurityWatermark(name, id);

  isExamActive = true;
  startTimer(res.exam.duration * 60);
  updateProgressBar();
  startCamAlertPolling();
  enableScreenCaptureProtection();
}

function renderQuestions(questions) {
  const container = document.getElementById('questions-container');
  container.innerHTML = '';

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card animate-fade-in';
    card.id = `q-card-${q.index}`;

    const safeText = escapeHTML(q.text);

    let optionsHtml = '';
    q.options.forEach((opt, optIdx) => {
      const safeOpt = escapeHTML(opt);
      const val = optIdx + 1;
      optionsHtml += `
        <label class="option-label" onclick="selectOption(this, '${q.index}', '${val}')">
          <input type="radio" name="q_${q.index}" value="${val}" class="option-radio">
          <span>${safeOpt}</span>
        </label>
      `;
    });

    // دعم عرض صورة توضيحية خفيفة وأنيقة للسؤال دون أن تأخذ حيزاً كبيراً
    let imageHtml = '';
    if (q.image) {
      const safeImg = escapeHTML(q.image);
      imageHtml = `
        <div class="mb-3.5 flex flex-col items-start">
          <div class="q-img-thumb relative group cursor-pointer border border-slate-200 rounded-lg overflow-hidden bg-slate-50 hover:border-blue-500 transition-all shadow-sm max-w-sm" onclick="showQuestionImageModal('${safeImg}')">
            <img src="${safeImg}" alt="صورة السؤال" class="max-h-40 md:max-h-44 w-auto object-contain p-1 rounded" loading="lazy">
            <div class="absolute bottom-1 left-1 bg-slate-900/80 text-white text-[10px] px-2 py-0.5 rounded flex items-center gap-1 font-sans">
              <i class="fa-solid fa-magnifying-glass-plus"></i> انقر للتكبير
            </div>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">السؤال ${idx + 1} من ${questions.length}</span>
      </div>
      <p class="font-bold text-base md:text-lg mb-3 text-slate-900 leading-relaxed">${safeText}</p>
      ${imageHtml}
      <div class="space-y-2.5">
        ${optionsHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

function showQuestionImageModal(src) {
  Swal.fire({
    imageUrl: src,
    imageAlt: 'صورة السؤال التوضيحية',
    showCloseButton: true,
    showConfirmButton: false,
    width: 'auto',
    padding: '0.8rem',
    customClass: {
      image: 'max-h-[75vh] w-auto object-contain rounded-lg shadow-sm m-0'
    }
  });
}

function selectOption(labelEl, questionIndex, value) {
  const parent = labelEl.closest('.space-y-2\\.5');
  if (parent) {
    parent.querySelectorAll('.option-label').forEach(lbl => lbl.classList.remove('is-selected'));
  }
  labelEl.classList.add('is-selected');
  const radio = labelEl.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;

  updateProgressBar();
}

function updateProgressBar() {
  if (!currentExam || !currentExam.questions) return;
  const total = currentExam.questions.length;
  let answered = 0;

  currentExam.questions.forEach(q => {
    if (document.querySelector(`input[name="q_${q.index}"]:checked`)) {
      answered++;
    }
  });

  const percentage = total > 0 ? (answered / total) * 100 : 0;
  const fill = document.getElementById('exam-progress-fill');
  const label = document.getElementById('exam-progress-text');
  if (fill) fill.style.width = `${percentage}%`;
  if (label) label.innerText = `تمت الإجابة: ${answered} من ${total}`;
}

function startTimer(seconds) {
  let remaining = seconds;
  const timerDisplay = document.getElementById('timer-display');
  const timerChip = document.getElementById('timer-chip-container');

  examTimer = setInterval(() => {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    if (timerDisplay) {
      timerDisplay.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    if (remaining <= 180 && timerChip) {
      timerChip.classList.add('is-urgent');
    }

    if (remaining <= 0) {
      clearInterval(examTimer);
      // توزيع عشوائي زمني ذكي (Jittered Slot) لفض تدفق الـ 300 طالب بالتساوي ومنع ضغط السيرفر
      const initialSlotDelay = Math.floor(Math.random() * 3200);
      setTimeout(() => {
        submitExam('انتهى الوقت المحدد للامتحان تلقائياً');
      }, initialSlotDelay);
    }
    remaining--;
  }, 1000);
}

function confirmExitAndSubmit() {
  if (!isExamActive) return;

  const total = currentExam ? currentExam.questions.length : 0;
  let answered = 0;
  if (currentExam) {
    currentExam.questions.forEach(q => {
      if (document.querySelector(`input[name="q_${q.index}"]:checked`)) answered++;
    });
  }

  const unAnswered = total - answered;
  let textMsg = 'هل أنت متأكد من حفظ إجاباتك والخروج من الامتحان؟';
  if (unAnswered > 0) {
    textMsg = `تنبيه: يوجد ${unAnswered} أسئلة لم تجب عليها. عند الخروج سيتم رصد الدرجة للإجابات المحلولة فقط وإنهاء الجلسة.`;
  }

  Swal.fire({
    title: 'تأكيد حفظ الإجابات والخروج',
    text: textMsg,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم، احفظ إجاباتي واخرج',
    cancelButtonText: 'الاستمرار في الحل',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#64748b'
  }).then(res => {
    if (res.isConfirmed) {
      submitExam('تم حفظ الإجابات والخروج بواسطة الطالب');
    }
  });
}

function confirmExamSubmission() {
  confirmExitAndSubmit();
}

async function submitExam(statusReason) {
  if (!isExamActive) return;
  isExamActive = false;
  clearInterval(examTimer);
  if (camAlertCheckInterval) {
    clearInterval(camAlertCheckInterval);
    camAlertCheckInterval = null;
  }
  disableScreenCaptureProtection();
  document.body.classList.remove('exam-active-mode');
  removeSecurityWatermark();

  // 1. تجميع الإجابات بدقة متناهية
  const answers = {};
  if (currentExam && currentExam.questions) {
    currentExam.questions.forEach(q => {
      const selected = document.querySelector(`input[name="q_${q.index}"]:checked`);
      if (selected) answers[q.index] = selected.value;
    });
  }

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  stopStudentCamera();

  const payload = {
    action: 'submit_exam',
    exam_id: currentExam ? currentExam.exam_id : '',
    student_name: currentExam ? currentExam.student_name : '',
    student_id: currentExam ? currentExam.student_id : '',
    student_grade: currentExam ? currentExam.student_grade : '',
    student_branch: currentExam ? currentExam.student_branch : '',
    student_password: currentExam ? currentExam.student_password : '',
    answers: answers,
    cheat_status: statusReason,
    client_timestamp: Date.now()
  };

  // 2. سجل المعاملات المحلي الفوري (Write-Ahead-Log - WAL) لضمان عدم ضياع أي إجابة تحت أي ظرف
  const backupKey = `exam_wal_backup_${payload.student_id}_${payload.exam_id}`;
  try {
    localStorage.setItem(backupKey, JSON.stringify(payload));
  } catch (e) {}

  // 3. معالجة التسليم عبر طابور انتظار متزامن فائق التحمل لـ 300+ طالب (Resilient Queue)
  await processSubmissionWithResilientQueue(payload, statusReason, backupKey);
}

/**
 * خوارزمية طابور التسليم المقاومة للتصادم والضغط الشديد (Concurrent Queue with Jittered Exponential Backoff)
 * مصممة هندسياً لتحمل تسليم 300+ طالب في نفس اللحظة دون سقوط أي إجابة
 */
async function processSubmissionWithResilientQueue(payload, statusReason, backupKey) {
  const MAX_RETRIES = 8;
  let attempt = 0;
  let isSuccess = false;

  Swal.fire({
    title: 'جاري تسجيل وتأكيد إجاباتك...',
    html: `
      <div class="text-center space-y-3 py-2">
        <div class="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        <p class="text-xs text-slate-600 font-semibold leading-relaxed" id="submission-queue-status">يتم الآن جدولة وتثبيت بياناتك بالترتيب في قاعدة البيانات...</p>
        <span class="inline-block text-[11px] bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-mono" id="submission-attempt-chip">المحاولة 1 من ${MAX_RETRIES}</span>
      </div>
    `,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false
  });

  while (attempt < MAX_RETRIES && !isSuccess) {
    attempt++;

    const statusEl = document.getElementById('submission-queue-status');
    const chipEl = document.getElementById('submission-attempt-chip');
    if (chipEl) chipEl.innerText = `المحاولة ${attempt} من ${MAX_RETRIES}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // مهلة 25 ثانية لكل محاولة

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (data && data.status === 'success') {
        isSuccess = true;
        // حذف النسخة الاحتياطية المحلية فور تأكيد الاستلام السحابي
        try { localStorage.removeItem(backupKey); } catch (e) {}

        // إخفاء قاعة الامتحان والعودة للرئيسية
        document.getElementById('exam-room').classList.add('hidden');
        document.getElementById('navbar').classList.remove('hidden');
        showSection('student-login');

        const isViolation = statusReason.includes('غش') || statusReason.includes('مغادرة') || statusReason.includes('محظورة');
        if (isViolation) {
          Swal.fire({
            title: 'تم قفل الامتحان وإنهاء الجلسة',
            html: `
              <div class="text-right text-sm space-y-2 mt-2">
                <p><b>سبب الإغلاق:</b> <span class="text-red-600 font-bold">${escapeHTML(statusReason)}</span></p>
                <p class="text-xs text-slate-500">تم تسجيل المخالفة وحفظ النتيجة في سجل المراقبة بنجاح.</p>
              </div>
            `,
            icon: 'error',
            confirmButtonText: 'إغلاق',
            confirmButtonColor: '#e11d48'
          });
        } else {
          const queueText = data.queue_number ? `<span class="inline-block bg-sky-50 text-sky-700 px-3 py-1 rounded-full text-xs font-mono font-bold mt-1">رقم الدور في الطابور: #${data.queue_number}</span>` : '';
          Swal.fire({
            title: 'تم استلام وتأكيد إجاباتك بنجاح!',
            html: `
              <div class="text-center text-sm space-y-2 mt-2">
                <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2 text-xl border border-emerald-200">
                  <i class="fa-solid fa-check"></i>
                </div>
                <p class="font-bold text-slate-800">شكراً لك، تم رصد درجاتك وحفظ إجاباتك كاملة في قاعدة البيانات بنجاح.</p>
                ${queueText}
                <p class="text-xs text-slate-500 mt-2">ستُعلن النتائج لاحقاً من قِبل أستاذ المادة أو إدارة الكلية.</p>
              </div>
            `,
            icon: 'success',
            confirmButtonText: 'العودة للرئيسية',
            confirmButtonColor: '#2563eb'
          });
        }
        return;
      } else {
        // إذا كان السيرفر مشغولاً بجدولة رصد دفعة طلاب أخرى
        if (statusEl) {
          statusEl.innerText = data.message || 'السيرفر يقوم بترتيب رصد إجابات دفعة الطلاب حالياً، جاري إعادة المحاولة آلياً...';
        }
      }
    } catch (err) {
      if (statusEl) {
        statusEl.innerText = 'جاري إعادة الاتصال بالسيرفر وتثبيت النتيجة... يرجى الانتظار ثوانٍ معدودة';
      }
    }

    if (!isSuccess && attempt < MAX_RETRIES) {
      // خوارزمية التراجع العشوائي (Jittered Exponential Backoff) لفض التزاحم العادل بين الطلاب
      const jitter = Math.random() * 800;
      const delay = Math.min(1000 * Math.pow(1.35, attempt) + jitter, 5000);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // في حال فشل كل المحاولات (انقطاع كامل في إنترنت الطالب مثلاً)
  Swal.fire({
    title: 'إجاباتك محفوظة بأمان تام',
    html: `
      <div class="text-right text-sm space-y-2 mt-2">
        <p class="text-amber-800 font-bold">جميع إجاباتك محفوظة بالكامل على جهازك ولم يُفقد أي شيء!</p>
        <p class="text-xs text-slate-600">يبدو أن هناك ضغطاً كثيفاً أو ضعفاً في اتصال الإنترنت حالياً. يرجى الضغط على زر "إعادة إرسال الإجابات الآن" فور توفر الاتصال.</p>
      </div>
    `,
    icon: 'warning',
    confirmButtonText: 'إعادة إرسال الإجابات الآن',
    confirmButtonColor: '#059669',
    allowOutsideClick: false
  }).then(() => {
    processSubmissionWithResilientQueue(payload, statusReason, backupKey);
  });
}

/**
 * فحص تلقائي لأي تسليمات محلية معلقة لم تصل للسيرفر بسبب انقطاع مفاجئ وإعادة إرسالها فور فتح الموقع
 */
function checkAndRecoverPendingSubmissions() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('exam_wal_backup_')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const payload = JSON.parse(raw);
          fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          }).then(res => res.json()).then(data => {
            if (data && data.status === 'success') {
              localStorage.removeItem(key);
            }
          }).catch(() => {});
        }
      }
    }
  } catch (e) {}
}

// ==========================================
// 3. نظام المراقبة وحماية النزاهة (Anti-Cheat)
// ==========================================

function handleViolation(reason) {
  if (!isExamActive) return;

  examWarningsCount++;
  if (examWarningsCount <= MAX_ALLOWED_WARNINGS) {
    Swal.fire({
      title: `تحذير أمني (${examWarningsCount}/${MAX_ALLOWED_WARNINGS})`,
      text: `${reason}. تكرار هذا التصرف سيؤدي إلى إنهاء الامتحان فوراً واحتساب النتيجة الحالية!`,
      icon: 'warning',
      confirmButtonText: 'العودة للامتحان فوراً',
      confirmButtonColor: '#e11d48',
      allowOutsideClick: false
    }).then(() => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });
  } else {
    submitExam(`محاولة غش مؤكدة: ${reason}`);
  }
}

// حماية صارمة لمنع فتح الـ DevTools والقائمة أثناء دخول الطالب
(function antiDevToolsSuite() {
  // 1. حظر الكليك يمين بالكامل في صفحة دخول الطالب والامتحان لمنع خيار Inspect
  document.addEventListener('contextmenu', e => {
    // مسموح فقط إذا كان في لوحة الإدارة
    const isDashboard = !document.getElementById('dashboard').classList.contains('hidden');
    if (!isDashboard) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // 2. حظر مفاتيح المطورين واختصارات لوحة المفاتيح بشكل دائم في شاشة الطالب والامتحان
  window.addEventListener('keydown', e => {
    const isDashboard = !document.getElementById('dashboard').classList.contains('hidden');
    if (isDashboard) return; // استثناء لوحة الإدارة

    const key = e.key ? e.key.toLowerCase() : '';
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    // حظر F12 وحظر Ctrl+Shift+I / J / C وحظر Ctrl+U وحظر Ctrl+S
    if (
      e.key === 'F12' ||
      e.keyCode === 123 ||
      (isCtrlOrMeta && e.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 'k')) ||
      (isCtrlOrMeta && (key === 'u' || key === 's' || key === 'p'))
    ) {
      e.preventDefault();
      e.stopPropagation();
      Swal.fire({
        title: 'إجراء محظور أمنياً!',
        text: 'تم تعطيل أدوات المطورين (Developer Tools) لحماية نزاهة الاختبار.',
        icon: 'error',
        timer: 2000,
        showConfirmButton: false
      });
      return false;
    }
  }, true);

  // 3. تعطيل شاشة الـ Console كلياً وتفريغها لمنع حقن أي كود
  try {
    const dummyFn = function () {};
    ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace', 'dir'].forEach(method => {
      console[method] = dummyFn;
    });
  } catch (err) {}

  // 4. تقنية كشف فتح الـ DevTools عبر كاسر التصحيح (Debugger Trap) أثناء الاختبار
  setInterval(() => {
    if (isExamActive) {
      const startTime = performance.now();
      debugger;
      const endTime = performance.now();
      if (endTime - startTime > 100) {
        handleViolation('محاولة فتح أدوات فحص المطورين Console/DevTools');
      }
    }
  }, 1000);
})();

document.addEventListener('keydown', e => {
  if (!isExamActive) return;

  const key = e.key ? e.key.toLowerCase() : '';
  const isCtrlOrMeta = e.ctrlKey || e.metaKey;

  if (isCtrlOrMeta && (key === 't' || key === 'n' || key === 'w' || key === 'q')) {
    e.preventDefault();
    e.stopPropagation();
    handleViolation('محاولة فتح تبويب أو نافذة جديدة');
    return false;
  }

  if (
    e.key === 'F12' ||
    e.key === 'PrintScreen' ||
    e.key === 'Escape' ||
    (isCtrlOrMeta && ['c', 'v', 'x', 'u', 's', 'p', 'a'].includes(key)) ||
    (isCtrlOrMeta && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
    (e.altKey && e.key === 'Tab')
  ) {
    e.preventDefault();
    e.stopPropagation();
    handleViolation('استخدام اختصار محظور');
    return false;
  }
});

// ==========================================
// 3.1 نظام الحماية المتقدمة والمطلقة ضد تسجيل ولقطات الشاشة (Screen Capture & Recording Prevention)
// ==========================================

let screenProtectionActive = false;
let blackoutOverlay = null;
let isBlackoutActive = false;

// إظهار شاشة سوداء كاملة فورية وتفريغ عناصر الامتحان من العرض
function showPersistentBlackout(reason) {
  if (!isExamActive || isActivatingCamera) return;
  isBlackoutActive = true;

  if (!blackoutOverlay) {
    createBlackoutOverlayDOM();
  }

  if (blackoutOverlay) {
    blackoutOverlay.classList.remove('hidden');
  }

  const examRoom = document.getElementById('exam-room');
  if (examRoom) {
    examRoom.style.visibility = 'hidden';
    examRoom.style.opacity = '0';
  }

  const questionsContainer = document.getElementById('questions-container');
  if (questionsContainer) {
    questionsContainer.style.display = 'none';
  }
}

// استعادة الشاشة فقط بعد أن يعود الطالب للنافذة ويقر بالتحذير
function handleReturnFromBlur(reason) {
  if (!isExamActive || isActivatingCamera || !isBlackoutActive) return;

  handleViolation(reason || 'مغادرة نافذة الامتحان أو محاولة تسجيل/تصوير الشاشة');

  // استعادة العرض
  removeBlackout();
}

function removeBlackout() {
  isBlackoutActive = false;
  if (blackoutOverlay) {
    blackoutOverlay.classList.add('hidden');
  }
  const examRoom = document.getElementById('exam-room');
  if (examRoom) {
    examRoom.style.visibility = 'visible';
    examRoom.style.opacity = '1';
  }
  const questionsContainer = document.getElementById('questions-container');
  if (questionsContainer) {
    questionsContainer.style.display = 'block';
  }
}

function triggerBlackout(reason) {
  showPersistentBlackout(reason);
  setTimeout(() => {
    if (isExamActive && !document.hidden && document.hasFocus && document.hasFocus()) {
      handleReturnFromBlur(reason);
    }
  }, 1600);
}

// 1. مراقبة مغادرة الصفحة أو سحب شريط الإشعارات/الاختصارات في الموبايل
window.addEventListener('blur', () => {
  if (isExamActive && !isActivatingCamera) {
    showPersistentBlackout('فقدان التركيز على شاشة الامتحان أو محاولة تسجيل الشاشة');
  }
});

window.addEventListener('focus', () => {
  if (isExamActive && isBlackoutActive && !isActivatingCamera) {
    handleReturnFromBlur('العودة بعد مغادرة نافذة الامتحان');
  }
});

document.addEventListener('visibilitychange', () => {
  if (isExamActive && !isActivatingCamera) {
    if (document.hidden) {
      showPersistentBlackout('مغادرة نافذة الامتحان أو التبديل لتطبيق آخر');
    } else if (isBlackoutActive) {
      handleReturnFromBlur('العودة بعد مغادرة نافذة الامتحان');
    }
  }
});

document.addEventListener('fullscreenchange', () => {
  if (isExamActive && !document.fullscreenElement) {
    if (isActivatingCamera) return;
    showPersistentBlackout('الخروج من وضع ملء الشاشة');
    handleReturnFromBlur('الخروج من وضع ملء الشاشة');
  }
});

function createBlackoutOverlayDOM() {
  if (!blackoutOverlay) {
    blackoutOverlay = document.createElement('div');
    blackoutOverlay.id = 'exam-blackout-overlay';
    blackoutOverlay.className = 'screen-blackout-overlay hidden';
    blackoutOverlay.innerHTML = `
      <div class="space-y-3">
        <i class="fa-solid fa-eye-slash text-5xl text-rose-500 mb-2"></i>
        <h2 class="text-xl font-bold">تم تعتيم الشاشة - تسجيل أو لقطة الشاشة محظورة</h2>
        <p class="text-xs text-slate-300">يُمنع منعاً باتاً تسجيل أو التقاط صورة لصفحة الامتحان حفاظاً على السرية والنزاهة.</p>
      </div>
    `;
    document.body.appendChild(blackoutOverlay);
  }
}

// تفعيل كل حمايات تسجيل ولقطات الشاشة ومنع أي إجراءات غير مصرح بها
function enableScreenCaptureProtection() {
  screenProtectionActive = true;
  createBlackoutOverlayDOM();

  // 1. حظر واجهات تسجيل ومشاركة الشاشة للمتصفح
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    navigator.mediaDevices.getDisplayMedia = function () {
      triggerBlackout('تم حظر تسجيل ومشاركة الشاشة');
      return Promise.reject(new DOMException('Screen recording is restricted during exam', 'NotAllowedError'));
    };
  }

  // 2. تعتيم فوري عند الضغط على مفاتيح لقطة الشاشة
  window.addEventListener('keyup', handleScreenCaptureKeys, true);
  window.addEventListener('keydown', handleScreenCaptureKeys, true);

  // 3. منع لقطات الشاشة عبر نافذة الطباعة (Ctrl+P / Command+P)
  window.addEventListener('beforeprint', handleBeforePrint);
  window.addEventListener('afterprint', handleAfterPrint);

  // 4. حظر النسخ والقص وتفريغ الحافظة
  document.addEventListener('copy', handleClipboardBlock, true);
  document.addEventListener('cut', handleClipboardBlock, true);

  // 5. حظر اللمس المتعدد على الهواتف (إيماءات الـ 3 أصابع وإصبعين للقطة الشاشة والتكبير)
  window.addEventListener('touchstart', handleMobileTouchRestrictions, { passive: false });
  window.addEventListener('touchmove', handleMobileTouchMove, { passive: false });

  // 6. حظر أي نقرات غير مصرح بها (منع التحديد، القوائم المنبثقة، الضغط المطول)
  document.addEventListener('click', handleExamScreenStrictClick, true);
}

function disableScreenCaptureProtection() {
  screenProtectionActive = false;
  removeBlackout();
  window.removeEventListener('keyup', handleScreenCaptureKeys, true);
  window.removeEventListener('keydown', handleScreenCaptureKeys, true);
  window.removeEventListener('beforeprint', handleBeforePrint);
  window.removeEventListener('afterprint', handleAfterPrint);
  document.removeEventListener('copy', handleClipboardBlock, true);
  document.removeEventListener('cut', handleClipboardBlock, true);
  window.removeEventListener('touchstart', handleMobileTouchRestrictions, { passive: false });
  window.removeEventListener('touchmove', handleMobileTouchMove, { passive: false });
  document.removeEventListener('click', handleExamScreenStrictClick, true);
}

// حظر إيماءات اللمس المتعدد في الموبايل فوراً
function handleMobileTouchRestrictions(e) {
  if (!isExamActive) return;

  // إذا تم اللمس بأكثر من إصبع واحد (3 أصابع للقطة الشاشة أو إصبعين للتكبير)
  if (e.touches && e.touches.length > 1) {
    e.preventDefault();
    e.stopPropagation();
    showPersistentBlackout('تم حظر لمس متعدد محظور (إيماءة لقطة شاشة)');
    setTimeout(() => {
      handleReturnFromBlur('محاولة أخذ لقطة شاشة عبر اللمس المتعدد');
    }, 1000);
    return false;
  }
}

function handleMobileTouchMove(e) {
  if (!isExamActive) return;
  if (e.touches && e.touches.length > 1) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }
}

// تقييد النقرات والتفاعل: يُسمح فقط باختيار الإجابة، أو فتح الكاميرا، أو تسليم الاختبار
function handleExamScreenStrictClick(e) {
  if (!isExamActive) return;

  const target = e.target;
  const isAllowed = target.closest('.option-label') ||
                    target.closest('.option-radio') ||
                    target.closest('input[type="radio"]') ||
                    target.closest('.q-img-thumb') ||
                    target.closest('#student-camera-btn') ||
                    target.closest('#student-cam-preview-box') ||
                    target.closest('button[onclick*="Exit"]') ||
                    target.closest('button[onclick*="Submit"]') ||
                    target.closest('.swal2-container');

  if (!isAllowed) {
    // منع استدعاء أي إجراءات إضافية على الشاشة
    e.stopPropagation();
  }
}

function handleClipboardBlock(e) {
  if (isExamActive) {
    e.preventDefault();
    if (e.clipboardData) {
      e.clipboardData.setData('text/plain', '');
    }
  }
}

function handleScreenCaptureKeys(e) {
  if (!isExamActive || !screenProtectionActive) return;

  const key = e.key ? e.key.toLowerCase() : '';
  const code = e.code ? e.code.toLowerCase() : '';
  const isCtrlOrMeta = e.ctrlKey || e.metaKey;

  // فحص أزرار لقطات الشاشة الشهيرة (PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5)
  if (
    key === 'printscreen' ||
    key === 'snapshot' ||
    code === 'printscreen' ||
    e.keyCode === 44 ||
    (isCtrlOrMeta && (key === 'p' || key === 's')) ||
    (e.metaKey && e.shiftKey && (key === '3' || key === '4' || key === '5')) ||
    (e.shiftKey && (e.metaKey || key === 'meta') && (key === 's' || code === 'keys')) ||
    (e.code === 'KeyS' && e.shiftKey && (e.metaKey || e.ctrlKey))
  ) {
    e.preventDefault();
    e.stopPropagation();

    // تشغيل الشاشة السوداء فوراً
    showPersistentBlackout('تم حظر محاولة أخذ لقطة شاشة أو تسجيل الشاشة');

    // مسح الحافظة Clipboard لمنع حفظ الصورة
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('');
      }
    } catch (err) {}

    setTimeout(() => {
      handleReturnFromBlur('محاولة أخذ لقطة شاشة');
    }, 1200);

    return false;
  }
}

function handleBeforePrint() {
  if (isExamActive) {
    showPersistentBlackout('محاولة طباعة أو تصوير الشاشة');
  }
}

function handleAfterPrint() {
  if (isExamActive) {
    handleReturnFromBlur('محاولة طباعة أو تصوير الشاشة');
  }
}

// علامة مائية أمنية متكررة باسم ورقم الطالب على كامل صفحة الأسئلة
function createSecurityWatermark(name, id) {
  removeSecurityWatermark();
  const wm = document.createElement('div');
  wm.id = 'exam-security-watermark';
  wm.className = 'exam-security-watermark';
  const text = `الطالب: ${escapeHTML(name)} | ID: ${escapeHTML(id)} | اختبار محمي`;
  let items = '';
  for (let i = 0; i < 28; i++) {
    items += `<div class="watermark-item">${text}</div>`;
  }
  wm.innerHTML = items;
  const examRoom = document.getElementById('exam-room');
  if (examRoom) examRoom.appendChild(wm);
}

function removeSecurityWatermark() {
  const wm = document.getElementById('exam-security-watermark');
  if (wm) wm.remove();
}

function handleBeforePrint() {
  if (isExamActive) {
    triggerBlackout('محاولة طباعة أو تصوير الشاشة');
  }
}

function handleAfterPrint() {
  removeBlackout();
}

// ==========================================
// 4. لوحة الإدارة العامة (Admin Dashboard & Regex)
// ==========================================

async function adminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('adm-user').value.trim();
  const password = document.getElementById('adm-pass').value.trim();

  if (!username || !password) {
    return Swal.fire('تنبيه', 'يرجى إدخال اسم المستخدم وكلمة المرور', 'warning');
  }

  const res = await apiCall({ action: 'login', username, password });
  if (res && res.status === 'success') {
    if (res.role !== 'admin') {
      return Swal.fire('تنبيه', 'هذه اللوحة مخصصة للمدير العام فقط. أعضاء هيئة التدريس يدخلون من بوابتهم الخاصة.', 'info');
    }

    currentUser = res;
    document.getElementById('dash-username').innerText = escapeHTML(res.name);
    showSection('dashboard');
    populateRegexInputs();
    loadAdminExamsList();
    loadFacultyAccountsList();
    loadDashboardData();
  } else {
    Swal.fire('خطأ في تسجيل الدخول', res ? res.message : 'بيانات الدخول غير صحيحة', 'error');
  }
}

function populateRegexInputs() {
  const grades = [
    { key: 'الفرقة الأولى', id: '1' },
    { key: 'الفرقة الثانية', id: '2' },
    { key: 'الفرقة الثالثة', id: '3' },
    { key: 'الفرقة الرابعة', id: '4' }
  ];

  grades.forEach(g => {
    const rule = gradeRegexRules[g.key] || { pattern: '', hint: '' };
    const pInput = document.getElementById(`regex-grade-${g.id}`);
    const hInput = document.getElementById(`hint-grade-${g.id}`);
    if (pInput) pInput.value = rule.pattern;
    if (hInput) hInput.value = rule.hint;
  });
}

async function saveRegexSettings() {
  const updatedRules = {
    'الفرقة الأولى': {
      pattern: document.getElementById('regex-grade-1').value.trim(),
      hint: document.getElementById('hint-grade-1').value.trim()
    },
    'الفرقة الثانية': {
      pattern: document.getElementById('regex-grade-2').value.trim(),
      hint: document.getElementById('hint-grade-2').value.trim()
    },
    'الفرقة الثالثة': {
      pattern: document.getElementById('regex-grade-3').value.trim(),
      hint: document.getElementById('hint-grade-3').value.trim()
    },
    'الفرقة الرابعة': {
      pattern: document.getElementById('regex-grade-4').value.trim(),
      hint: document.getElementById('hint-grade-4').value.trim()
    }
  };

  const res = await apiCall({ action: 'update_settings', rules: updatedRules });
  if (res && res.status === 'success') {
    gradeRegexRules = updatedRules;
    onGradeChange();
    Swal.fire('تم بنجاح', 'تم حفظ وتحديث قواعد الـ Regex لجميع الفرق في Google Sheets', 'success');
  }
}

async function addExaminer(e) {
  e.preventDefault();
  const name = document.getElementById('new-ex-name').value.trim();
  const username = document.getElementById('new-ex-user').value.trim();
  const password = document.getElementById('new-ex-pass').value.trim();

  if (!name || !username || !password) {
    return Swal.fire('تنبيه', 'يرجى استكمال جميع بيانات الحساب الجديد', 'warning');
  }

  const res = await apiCall({ action: 'add_user', name, username, password });
  if (res && res.status === 'success') {
    Swal.fire('تم بنجاح', res.message, 'success');
    e.target.reset();
    loadFacultyAccountsList();
  } else {
    Swal.fire('تعذر الحفظ', res ? res.message : 'حدث خطأ أثناء الإضافة', 'error');
  }
}

async function loadAdminExamsList() {
  if (!currentUser) return;
  const res = await apiCall({
    action: 'get_exams_list',
    creator: currentUser.username,
    role: currentUser.role
  });

  const tbody = document.getElementById('admin-exams-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!res || res.status !== 'success' || !res.exams || res.exams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">لا توجد اختبارات منشورة حتى الآن</td></tr>`;
    return;
  }

  res.exams.forEach(exam => {
    const isActive = exam.status === 'active';
    tbody.innerHTML += `
      <tr>
        <td><span class="font-bold text-blue-600 font-mono">${escapeHTML(exam.id)}</span></td>
        <td class="font-semibold text-slate-800">${escapeHTML(exam.title)}</td>
        <td><span class="badge badge-primary text-[11px]">${escapeHTML(exam.creator)}</span></td>
        <td>${escapeHTML(exam.duration)} دقيقة</td>
        <td>${escapeHTML(exam.questions_count)} سؤال</td>
        <td class="text-xs text-slate-500 font-mono">${escapeHTML(exam.date)}</td>
        <td>
          <span class="badge ${isActive ? 'badge-success' : 'badge-danger'}">
            <i class="fa-solid ${isActive ? 'fa-check' : 'fa-pause'}"></i>
            ${isActive ? 'نشط ومتاح للطلاب' : 'موقوف ومغلق'}
          </span>
        </td>
        <td>
          <div class="flex items-center gap-1.5">
            <button onclick="toggleExamStatusAdmin('${escapeHTML(exam.id)}')" class="btn btn-outline text-xs py-1 px-2.5 ${isActive ? 'text-amber-600 border-amber-300 hover:bg-amber-50' : 'text-emerald-600 border-emerald-300 hover:bg-emerald-50'}">
              <i class="fa-solid ${isActive ? 'fa-pause' : 'fa-play'}"></i>
              ${isActive ? 'إيقاف مؤقت' : 'تفعيل'}
            </button>
            <button onclick="deleteExamConfirmAdmin('${escapeHTML(exam.id)}')" class="btn btn-outline text-xs py-1 px-2.5 text-rose-600 border-rose-200 hover:bg-rose-50">
              <i class="fa-solid fa-trash-can"></i> حذف
            </button>
          </div>
        </td>
      </tr>
    `;
  });
}

async function toggleExamStatusAdmin(examId) {
  const res = await apiCall({
    action: 'toggle_exam_status',
    exam_id: examId,
    creator: currentUser ? currentUser.username : '',
    role: currentUser ? currentUser.role : 'admin'
  });

  if (res && res.status === 'success') {
    Swal.fire('تم بنجاح', res.message, 'success');
    loadAdminExamsList();
  } else {
    Swal.fire('خطأ', res ? res.message : 'تعذر تغيير حالة الامتحان', 'error');
  }
}

async function deleteExamConfirmAdmin(examId) {
  Swal.fire({
    title: 'تأكيد حذف الاختبار نهائياً',
    text: `هل أنت متأكد من حذف الاختبار (${examId}) نهائياً من قاعدة البيانات؟ سيتم مسح بيانات الامتحان ولن يتمكن أي طالب من دخوله.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم، احذف الامتحان',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#64748b'
  }).then(async (result) => {
    if (result.isConfirmed) {
      const res = await apiCall({
        action: 'delete_exam',
        exam_id: examId,
        creator: currentUser ? currentUser.username : '',
        role: currentUser ? currentUser.role : 'admin'
      });

      if (res && res.status === 'success') {
        Swal.fire('تم الحذف', res.message, 'success');
        loadAdminExamsList();
      } else {
        Swal.fire('خطأ', res ? res.message : 'تعذر حذف الامتحان', 'error');
      }
    }
  });
}

async function loadFacultyAccountsList() {
  if (!currentUser || currentUser.role !== 'admin') return;

  const res = await apiCall({ action: 'get_faculty_list' });
  const tbody = document.getElementById('faculty-accounts-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!res || res.status !== 'success' || !res.faculty || res.faculty.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">لا يوجد أعضاء هيئة تدريس مسجلين حالياً</td></tr>`;
    return;
  }

  res.faculty.forEach(f => {
    tbody.innerHTML += `
      <tr>
        <td class="font-semibold text-slate-800">${escapeHTML(f.name)}</td>
        <td class="font-mono text-xs font-bold text-sky-700">${escapeHTML(f.username)}</td>
        <td><span class="badge badge-primary text-[11px]">واضع امتحانات</span></td>
        <td>
          <button onclick="confirmCascadeDeleteFaculty('${escapeHTML(f.username)}', '${escapeHTML(f.name)}')" class="btn btn-outline text-xs py-1 px-2.5 text-rose-600 border-rose-200 hover:bg-rose-50 font-bold">
            <i class="fa-solid fa-user-xmark"></i> حذف الأستاذ واختباراته ونتائجه
          </button>
        </td>
      </tr>
    `;
  });
}

async function confirmCascadeDeleteFaculty(username, name) {
  Swal.fire({
    title: 'تأكيد الحذف الشامل والنهائي!',
    html: `
      <div class="text-right text-xs space-y-2 mt-2">
        <p class="text-sm font-bold text-rose-600">تحذير أمني شديد:</p>
        <p>أنت على وشك حذف الأستاذ: <b>${escapeHTML(name)} (${escapeHTML(username)})</b>.</p>
        <div class="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-1">
          <p>• سيتم حذف حساب الأستاذ ولن يتمكن من الدخول مجدداً.</p>
          <p>• سيتم حذف <b>جميع الامتحانات</b> التي أنشأها الأستاذ.</p>
          <p>• سيتم حذف <b>كافة نتائج الطلاب وسجلاتهم</b> المرتبطة باختباراته نهائياً من الشيت.</p>
        </div>
        <p class="font-bold text-slate-700">لا يمكن التراجع عن هذا الإجراء إطلاقاً!</p>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم، احذف الأستاذ وكل ما يخصه',
    cancelButtonText: 'إلغاء التراجع',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#64748b'
  }).then(async (result) => {
    if (result.isConfirmed) {
      const res = await apiCall({
        action: 'delete_faculty_complete',
        target_username: username,
        role: currentUser ? currentUser.role : 'admin'
      });

      if (res && res.status === 'success') {
        Swal.fire('تم الحذف الشامل بنجاح', res.message, 'success');
        loadFacultyAccountsList();
        loadAdminExamsList();
        loadDashboardData();
      } else {
        Swal.fire('خطأ', res ? res.message : 'تعذر تنفيذ الحذف', 'error');
      }
    }
  });
}

async function loadDashboardData() {
  const res = await apiCall({ action: 'get_dashboard' });
  if (!res || res.status !== 'success' || !res.results) return;

  const tbody = document.getElementById('results-table-body');
  tbody.innerHTML = '';

  if (res.results.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400">لا توجد نتائج مسجلة حتى الآن</td></tr>`;
    return;
  }

  const reversed = [...res.results].reverse();
  reversed.forEach(row => {
    const safeDate = escapeHTML(row[0]);
    const safeCode = escapeHTML(row[1]);
    const safeName = escapeHTML(row[2]);
    const safeId = escapeHTML(row[3]);
    const safeGrade = escapeHTML(row[4] || '-');
    const safeBranch = escapeHTML(row[5] || '-');
    const safePass = escapeHTML(row[6] || '-');
    const safeScore = escapeHTML(row[7]);
    const safeTotal = escapeHTML(row[8]);
    const safeStatus = escapeHTML(row[9]);

    const isCheat = String(safeStatus).includes('غش') || String(safeStatus).includes('محظورة') || String(safeStatus).includes('مغادرة');

    tbody.innerHTML += `
      <tr>
        <td class="text-slate-500 font-mono text-xs">${safeDate}</td>
        <td><span class="font-bold text-blue-600">${safeCode}</span></td>
        <td class="font-semibold text-slate-800">${safeName}</td>
        <td class="font-mono text-xs">${safeId}</td>
        <td><span class="badge badge-primary text-[11px]">${safeGrade}</span></td>
        <td class="text-xs font-semibold text-slate-600">${safeBranch}</td>
        <td class="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded">${safePass}</td>
        <td><span class="font-bold text-slate-900">${safeScore} / ${safeTotal}</span></td>
        <td>
          <span class="badge ${isCheat ? 'badge-danger' : 'badge-success'}">
            <i class="fa-solid ${isCheat ? 'fa-triangle-exclamation' : 'fa-check'}"></i>
            ${safeStatus}
          </span>
        </td>
      </tr>
    `;
  });
}

function filterResultsTable() {
  const query = document.getElementById('filter-exam-code').value.trim().toUpperCase();
  const rows = document.querySelectorAll('#results-table-body tr');

  rows.forEach(row => {
    const text = row.innerText.toUpperCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
}

function exportResultsToExcel() {
  const table = document.getElementById('results-table');
  if (!table) return;

  const headerRow = table.querySelector('thead tr');
  const bodyRows = Array.from(table.querySelectorAll('tbody tr')).filter(row => row.style.display !== 'none');

  if (bodyRows.length === 0 || (bodyRows.length === 1 && bodyRows[0].cells.length <= 1)) {
    return Swal.fire('تنبيه', 'لا توجد نتائج متاحة لتصديرها حالياً', 'warning');
  }

  // رؤوس الأعمدة
  const headerCells = Array.from(headerRow.querySelectorAll('th')).map(th => th.innerText.trim());

  // استخراج بيانات الصفوف
  let dataRows = bodyRows.map(row => {
    return Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
  });

  // تحديد أولويات الترتيب للفروع: المنصورة ثم منية النصر ثم ميت غمر
  const branchPriority = {
    'المنصورة': 1,
    'منية النصر': 2,
    'منيه النصر': 2,
    'ميت غمر': 3
  };

  // تحديد أولويات الترتيب للفرق: الأولى ثم الثانية ثم الثالثة ثم الرابعة
  const gradePriority = {
    'الفرقة الأولى': 1,
    'الفرقة الاولى': 1,
    'الأولى': 1,
    'الاولى': 1,
    'الفرقة الثانية': 2,
    'الفرقة التانية': 2,
    'الثانية': 2,
    'التانية': 2,
    'الفرقة الثالثة': 3,
    'الفرقة التالتة': 3,
    'الثالثة': 3,
    'التالتة': 3,
    'الفرقة الرابعة': 4,
    'الرابعة': 4
  };

  // ترتيب البيانات: فرع المنصورة ثم منية النصر ثم ميت غمر، وداخل كل فرع: الأولى ثم الثانية ثم الثالثة ثم الرابعة
  dataRows.sort((a, b) => {
    // عمود الفرقة هو الفهرس 4 وعمود الفرع هو الفهرس 5
    const gradeA = a[4] || '';
    const gradeB = b[4] || '';
    const branchA = a[5] || '';
    const branchB = b[5] || '';

    const branchOrderA = branchPriority[branchA] || 99;
    const branchOrderB = branchPriority[branchB] || 99;

    if (branchOrderA !== branchOrderB) {
      return branchOrderA - branchOrderB;
    }

    const gradeOrderA = gradePriority[gradeA] || 99;
    const gradeOrderB = gradePriority[gradeB] || 99;

    if (gradeOrderA !== gradeOrderB) {
      return gradeOrderA - gradeOrderB;
    }

    // إذا تساوى الفرع والفرقة يتم الترتيب حسب اسم الطالب أفقياً
    const nameA = a[2] || '';
    const nameB = b[2] || '';
    return nameA.localeCompare(nameB, 'ar');
  });

  // تجميع الرأس والبيانات المرتبة
  const finalSheetData = [headerCells, ...dataRows];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(finalSheetData);

  ws['!cols'] = [
    { wch: 20 }, // التاريخ والوقت
    { wch: 15 }, // كود الامتحان
    { wch: 26 }, // اسم الطالب
    { wch: 16 }, // الرقم التعريفي
    { wch: 16 }, // الفرقة
    { wch: 16 }, // الفرع
    { wch: 18 }, // كلمة المرور
    { wch: 12 }, // النتيجة
    { wch: 30 }  // حالة التسليم
  ];

  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.Views) wb.Workbook.Views = [];
  wb.Workbook.Views[0] = { RTL: true };

  XLSX.utils.book_append_sheet(wb, ws, 'النتائج مرتبة');

  const filterVal = document.getElementById('filter-exam-code') ? document.getElementById('filter-exam-code').value.trim() : '';
  const fileName = filterVal
    ? `نتائج_مرتبة_${filterVal}_${new Date().toISOString().slice(0, 10)}.xlsx`
    : `كشف_النتائج_مرتباً_فروع_وفرق_${new Date().toISOString().slice(0, 10)}.xlsx`;

  XLSX.writeFile(wb, fileName);
}

async function confirmClearResultsAdmin() {
  Swal.fire({
    title: 'تأكيد تفريغ نتائج الطلاب',
    text: 'تأكد من تنزيل كشف الـ Excel أولاً. هل تريد بالتأكيد تفريغ ومسح جميع نتائج الطلاب من قاعدة البيانات؟',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم، مسح وتفريغ الكل',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#64748b'
  }).then(async (result) => {
    if (result.isConfirmed) {
      const filterVal = document.getElementById('filter-exam-code') ? document.getElementById('filter-exam-code').value.trim() : '';
      const res = await apiCall({
        action: 'clear_results',
        exam_code: filterVal,
        creator: currentUser ? currentUser.username : '',
        role: currentUser ? currentUser.role : 'admin'
      });

      if (res && res.status === 'success') {
        Swal.fire('تم التفريغ بنجاح', res.message, 'success');
        loadDashboardData();
      } else {
        Swal.fire('خطأ', res ? res.message : 'تعذر مسح النتائج', 'error');
      }
    }
  });
}

function logoutAdmin() {
  currentUser = null;
  showSection('student-login');
}
