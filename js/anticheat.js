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
      allowOutsideClick: false,
      allowEscapeKey: false
    }).then(() => {
      if (!document.fullscreenElement && isFullscreenSupported()) {
        restoreExamFullscreen();
      }
    });
  } else {
    submitExam(`محاولة غش مؤكدة: ${reason}`);
  }
}

// ==========================================
// 3.0 منظومة الحماية الصارمة ضد أدوات المطورين والكونسول (Anti-DevTools Protection)
// ==========================================

// فحص موثوق للأجهزة (لابتوب / كمبيوتر مكتبي / تابلت)
function isLaptopOrTabletDevice() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';

  // لابتوب أو كمبيوتر مكتبي (Windows, Mac, Linux x86, ChromeOS)
  const isDesktop = /Windows|Macintosh|MacIntel|Linux x86|CrOS/i.test(ua) || 
                    /Win32|Win64|MacIntel/i.test(platform);
  if (isDesktop && !/Android/i.test(ua)) {
    return true; // كمبيوتر مكتبي أو لابتوب
  }

  // تابلت (iPad أو أندرويد تابلت بدون كلمة Mobile أو شاشة لمس عريضة)
  const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) || 
                   (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
                   (platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
                   (Math.min(window.screen.width, window.screen.height) >= 600);
  if (isTablet) return true;

  if (window.innerWidth >= 700) return true;

  return false;
}

let isThreatAlertActive = false;
let isSiteShutdown = false; // محفوظ للتوافق، لم يعد يُستخدم لأي حظر نهائي
let lastThreatAlertAt = 0;
let lastDevToolsAlertAt = 0;

// التعامل العادل مع رصد أدوات المطورين: تنبيه وتسجيل مخالفة فقط
// لا يوجد أي مسح للصفحة أو حظر نهائي للمنصة تحت أي ظرف
function handleDevToolsDetection(reason) {
  const now = Date.now();
  // فترة سماح 60 ثانية بين التنبيهات حتى لا تتكرر النوافذ على الطالب
  if (now - lastDevToolsAlertAt < 60000) return;
  lastDevToolsAlertAt = now;

  if (isExamActive) {
    handleViolation(reason || 'تم رصد فتح أدوات المطورين (DevTools) أثناء الامتحان');
    return;
  }

  const dashboard = document.getElementById('dashboard');
  if (dashboard && !dashboard.classList.contains('hidden')) return; // استثناء لوحة الإدارة

  Swal.fire({
    title: 'أدوات المطورين غير مسموحة',
    text: 'يرجى إغلاق أدوات المطورين (DevTools) قبل بدء الاختبار. لم يتم حظرك، ويمكنك المتابعة بشكل طبيعي.',
    icon: 'warning',
    confirmButtonText: 'حسناً',
    confirmButtonColor: '#2563eb'
  });
}

// اسم قديم محفوظ للتوافق: لم يعد يحظر نهائياً ولا يمسح الصفحة، فقط يسجل تنبيهاً عادلاً
function banUserAndShutdownSite(reason) {
  handleDevToolsDetection(reason);
}

// إظهار تنبيه عند محاولة استخدام اختصارات محظورة (مع منع التكرار المتتالي في نفس اللحظة)
function triggerThreatAlert(reason) {
  const dashboard = document.getElementById('dashboard');
  if (dashboard && !dashboard.classList.contains('hidden')) return;

  // منع احتساب نفس الضغطة أكثر من مرة عند وجود أكثر من مستمع للوحة المفاتيح
  const now = Date.now();
  if (now - lastThreatAlertAt < 800) return;
  lastThreatAlertAt = now;

  // أثناء الامتحان تُسجل مخالفة واحدة عبر المنظومة الموحدة دون نافذة إضافية
  if (isExamActive) {
    handleViolation(reason || 'استخدام اختصار محظور أثناء الامتحان');
    return;
  }

  if (isThreatAlertActive) return;
  isThreatAlertActive = true;

  Swal.fire({
    title: 'إجراء غير مسموح',
    text: reason || 'هذا الاختصار غير مسموح أثناء استخدام المنصة.',
    icon: 'warning',
    confirmButtonText: 'حسناً',
    confirmButtonColor: '#2563eb'
  }).then(() => {
    isThreatAlertActive = false;
  });
}

// حماية صارمة لمنع فتح الـ DevTools والقائمة أثناء دخول الطالب والامتحان (خاص باللابتوب والتابلت)
(function antiDevToolsSuite() {
  // 1. منع قائمة الزر الأيمن بهدوء خارج الامتحان، وبتنبيه مُسجل أثناءه
  document.addEventListener('contextmenu', e => {
    const dashboard = document.getElementById('dashboard');
    if (dashboard && !dashboard.classList.contains('hidden')) return;

    e.preventDefault();
    if (isExamActive) {
      triggerThreatAlert('تم منع النقر بزر الفأرة الأيمن أثناء الامتحان');
    }
    return false;
  }, true);

  // 2. حظر اختصارات فتح أدوات المطورين الفعلية فقط (F12 و Ctrl+Shift+I/J/C/K)
  // ملاحظة مهمة: لا يتم حظر أي حروف عادية أو رموز كتابة مثل الفاصلة العربية أو < >
  // حتى لا يتضرر الطالب أثناء الكتابة الطبيعية
  function interceptDevKeys(e) {
    const dashboard = document.getElementById('dashboard');
    if (dashboard && !dashboard.classList.contains('hidden')) return;

    const key = e.key ? e.key.toLowerCase() : '';
    const code = e.code ? e.code.toLowerCase() : '';
    const keyCode = e.keyCode || e.which || 0;
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    const isF12 = keyCode === 123 || key === 'f12' || code === 'f12';
    const isDevShortcut = isCtrlOrMeta && e.shiftKey && (
      code === 'keyi' || keyCode === 73 || key === 'i' || key === 'ه' ||
      code === 'keyj' || keyCode === 74 || key === 'j' || key === 'ت' ||
      code === 'keyc' || keyCode === 67 || key === 'c' || key === 'ؤ' ||
      code === 'keyk' || keyCode === 75 || key === 'k' || key === 'ن'
    );

    if (isF12 || isDevShortcut) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      triggerThreatAlert('تم منع اختصار أدوات المطورين (F12 / DevTools)');
      return false;
    }
  }

  window.addEventListener('keydown', interceptDevKeys, { capture: true, passive: false });

  // 3. كشف فتح أدوات المطورين بشكل متحفظ وعادل:
  // لا يُحتسب الرصد إلا بعد استمرار القراءة المشبوهة 5 ثوانٍ متتالية،
  // حتى لا يتأثر الطالب بتكبير الصفحة أو تغيير حجم النافذة أو شريط العنوان في الموبايل
  let devtoolsSuspectStreak = 0;

  function checkDevToolsOpened() {
    const dashboard = document.getElementById('dashboard');
    if (dashboard && !dashboard.classList.contains('hidden')) return; // استثناء لوحة الإدارة

    // حصر فحص الفارق في أبعاد الشاشة على أجهزة الديسكتوب واللابتوب فقط لمنع أي تعارض مع تكبير الموبايل
    if (!isLaptopOrTabletDevice() || window.innerWidth < 650) {
      devtoolsSuspectStreak = 0;
      return;
    }

    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    const suspicious = widthDiff > 260 || heightDiff > 320;

    if (suspicious) {
      devtoolsSuspectStreak++;
      if (devtoolsSuspectStreak >= 5) {
        devtoolsSuspectStreak = 0;
        handleDevToolsDetection('تم رصد فتح أدوات المطورين (DevTools)');
      }
    } else {
      devtoolsSuspectStreak = 0;
    }
  }

  // تفعيل الكشف بعد استقرار الصفحة لمنع أي تداخل أولي
  setTimeout(() => {
    setInterval(checkDevToolsOpened, 1000);
  }, 1500);
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

  const isDevToolsCombo = e.key === 'F12' || (isCtrlOrMeta && e.shiftKey && ['i', 'j', 'c', 'k'].includes(key));

  if (
    isDevToolsCombo ||
    e.key === 'PrintScreen' ||
    e.key === 'Escape' ||
    (isCtrlOrMeta && ['c', 'v', 'x', 'u', 's', 'p', 'a'].includes(key)) ||
    (e.altKey && e.key === 'Tab')
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (isDevToolsCombo) {
      triggerThreatAlert('تم منع اختصار أدوات المطورين (F12 / DevTools)');
    } else {
      handleViolation('استخدام اختصار محظور');
    }
    return false;
  }
});

// ==========================================
// 3.1 نظام الحماية المتقدمة والمطلقة ضد تسجيل ولقطات الشاشة (Screen Capture & Recording Prevention)
// ==========================================

// فترة سماح مؤقتة عند الدخول للامتحان (15 ثانية):
// تمنع احتساب نافذة المتصفح "هل تريد حفظ كلمة المرور؟" أو أذونات الكاميرا والشاشة كمحاولة غش أو تعتيم
let examGracePeriodEnd = 0;

function startExamGracePeriod(durationSeconds = 15) {
  examGracePeriodEnd = Date.now() + durationSeconds * 1000;
}

function isExamInGracePeriod() {
  return isExamActive && Date.now() < examGracePeriodEnd;
}

let screenProtectionActive = false;
let blackoutOverlay = null;
let isBlackoutActive = false;
let blackoutStartedAt = 0;

// إظهار شاشة سوداء كاملة فورية وتفريغ عناصر الامتحان من العرض
function showPersistentBlackout(reason) {
  if (!isExamActive || isActivatingCamera || isExamInGracePeriod()) return;
  if (!isBlackoutActive) blackoutStartedAt = Date.now();
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
  if (!isExamActive || isActivatingCamera || isExamInGracePeriod() || !isBlackoutActive) {
    if (isBlackoutActive) removeBlackout();
    return;
  }

  // فترة سماح عادلة: اللمحات العارضة (شريط الإشعارات، تنبيه مؤقت، لمسة زر) لا تُحتسب مخالفة
  // تُحتسب المغادرة مخالفة فقط إذا استمرت ثانيتين فأكثر
  const awayDuration = Date.now() - blackoutStartedAt;
  if (awayDuration >= 2000) {
    handleViolation(reason || 'مغادرة نافذة الامتحان أو محاولة تسجيل/تصوير الشاشة');
  }

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
    if (isExamActive && !document.hidden && document.hasFocus()) {
      handleReturnFromBlur(reason);
    }
  }, 1600);
}

// 1. مراقبة مغادرة الصفحة أو سحب شريط الإشعارات/الاختصارات في الموبايل
window.addEventListener('blur', () => {
  if (isExamActive && !isActivatingCamera && !isExamInGracePeriod()) {
    showPersistentBlackout('فقدان التركيز على شاشة الامتحان أو محاولة تسجيل الشاشة');
  }
});

window.addEventListener('focus', () => {
  if (isExamActive && isBlackoutActive && !isActivatingCamera && !isExamInGracePeriod()) {
    handleReturnFromBlur('العودة بعد مغادرة نافذة الامتحان');
  }
});

document.addEventListener('visibilitychange', () => {
  if (isExamActive && !isActivatingCamera && !isExamInGracePeriod()) {
    if (document.hidden) {
      showPersistentBlackout('مغادرة نافذة الامتحان أو التبديل لتطبيق آخر');
    } else if (isBlackoutActive) {
      handleReturnFromBlur('العودة بعد مغادرة نافذة الامتحان');
    }
  }
});

// ==========================================
// 3.01 منظومة الفرض الصارم لوضع ملء الشاشة وحظر زر Esc
// ==========================================

let fullscreenEnforcerModal = null;

function isFullscreenSupported() {
  return !!(
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled ||
    document.mozFullScreenEnabled ||
    document.msFullscreenEnabled
  );
}

function createFullscreenEnforcerDOM() {
  if (fullscreenEnforcerModal) return;
  const overlay = document.createElement('div');
  overlay.id = 'fullscreen-enforcer-modal';
  overlay.className = 'fixed inset-0 bg-slate-950/95 z-[99999] flex items-center justify-center p-4 text-center hidden';
  overlay.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl border-2 border-rose-500/40 space-y-4 animate-fade-in text-slate-800 dark:text-slate-100">
      <div class="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto text-3xl border border-rose-300 dark:border-rose-800 shadow-inner">
        <i class="fa-solid fa-expand"></i>
      </div>
      <h3 class="text-xl font-black text-slate-900 dark:text-white">وضع ملء الشاشة إلزامي!</h3>
      <p class="text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
        تم رصد الخروج من وضع ملء الشاشة (الضغط على Esc أو تصغير النافذة). يُمنع منعاً باتاً عرض أو متابعة حل الامتحان خارج وضع الشاشة الكاملة لضمان النزاهة التامة ومنع التبديل بين النوافذ.
      </p>
      <div class="bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs p-3 rounded-2xl border border-rose-200 dark:border-rose-900 font-bold flex items-center gap-2 text-right">
        <i class="fa-solid fa-triangle-exclamation text-rose-500 text-lg flex-shrink-0"></i>
        <span>تم تسجيل هذه المحاولة كمخالفة في سجل المراقبة. تكرار ذلك سيؤدي لإغلاق الامتحان فوراً ورصد درجتك الحالية!</span>
      </div>
      <button type="button" id="restore-fullscreen-btn" onclick="restoreExamFullscreen()" class="btn btn-danger w-full py-3 text-sm font-bold shadow-lg shadow-rose-500/25 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all">
        <i class="fa-solid fa-arrows-to-eye ml-1.5"></i> العودة لملء الشاشة واستئناف الامتحان
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  fullscreenEnforcerModal = overlay;
}

function showFullscreenEnforcerModal() {
  createFullscreenEnforcerDOM();
  if (fullscreenEnforcerModal) {
    fullscreenEnforcerModal.classList.remove('hidden');
  }
  // إخفاء فوري وتام لغرفة الامتحان والأسئلة بحيث يستحيل الغش أو قراءة الأسئلة خارج وضع ملء الشاشة
  const examRoom = document.getElementById('exam-room');
  if (examRoom) {
    examRoom.style.visibility = 'hidden';
    examRoom.style.pointerEvents = 'none';
  }
}

function hideFullscreenEnforcerModal() {
  if (fullscreenEnforcerModal) {
    fullscreenEnforcerModal.classList.add('hidden');
  }
  const examRoom = document.getElementById('exam-room');
  if (examRoom) {
    examRoom.style.visibility = 'visible';
    examRoom.style.pointerEvents = 'auto';
  }
}

async function restoreExamFullscreen() {
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      await document.documentElement.webkitRequestFullscreen();
    }
  } catch (e) {
    console.warn("Fullscreen request error:", e);
  }

  // محاولة قفل زر الـ Escape فور إعادة الدخول
  try {
    if (navigator.keyboard && navigator.keyboard.lock) {
      await navigator.keyboard.lock(['Escape']);
    }
  } catch (e) {}

  hideFullscreenEnforcerModal();
}

function handleFullscreenChange() {
  if (!isExamActive || isActivatingCamera || isExamInGracePeriod()) return;

  const isFs = !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );

  if (!isFs) {
    if (isFullscreenSupported()) {
      showFullscreenEnforcerModal();
      handleViolation('الخروج من وضع ملء الشاشة (الضغط على Esc أو محاولة تصغير النافذة)');
    }
  } else {
    hideFullscreenEnforcerModal();
    try {
      if (navigator.keyboard && navigator.keyboard.lock) {
        navigator.keyboard.lock(['Escape']).catch(() => {});
      }
    } catch (e) {}
  }
}

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
  document.addEventListener(evt, handleFullscreenChange);
});

// منع مغادرة أو تحديث صفحة الامتحان (الدخول لمرة واحدة فقط لعند ما يسلم)
window.addEventListener('beforeunload', (e) => {
  if (isExamActive) {
    e.preventDefault();
    e.returnValue = 'تحذير أمني: الخروج من صفحة الامتحان أو تحديثها سيؤدي إلى إنهاء جلستك ورصد إجاباتك ولن تتمكن من الدخول مرة أخرى!';
    return e.returnValue;
  }
});

// إذا قام الطالب بإغلاق المتصفح أو مغادرة الصفحة بالقوة، يتم حفظ ورصد الإجابات فوراً وإنهاء الجلسة
window.addEventListener('pagehide', () => {
  if (isExamActive && currentExam) {
    autoSubmitExamOnExit('إنهاء الجلسة بسبب إغلاق المتصفح أو مغادرة صفحة الامتحان قبل التسليم');
  }
});

function autoSubmitExamOnExit(reason) {
  if (!isExamActive || !currentExam) return;
  isExamActive = false;

  let answers = {};
  if (typeof examAnswers === 'object' && Object.keys(examAnswers).length > 0) {
    answers = { ...examAnswers };
  } else if (currentExam.questions) {
    currentExam.questions.forEach(q => {
      const selected = document.querySelector(`input[name="q_${q.index}"]:checked`);
      if (selected) answers[q.index] = selected.value;
    });
  }

  const payload = {
    action: 'submit_exam',
    exam_id: currentExam.exam_id,
    student_name: currentExam.student_name,
    student_id: currentExam.student_id,
    student_grade: currentExam.student_grade,
    student_branch: currentExam.student_branch,
    student_password: currentExam.student_password,
    exam_token: currentExam.exam_token || '', // توكن جلسة الامتحان الموثق
    answers: answers,
    cheat_status: reason || 'مغادرة صفحة الامتحان قبل التسليم',
    client_timestamp: Date.now()
  };

  const studentNorm = typeof normalizeStudentNameForKey === 'function' 
    ? normalizeStudentNameForKey(currentExam.student_name) 
    : String(currentExam.student_name || '');

  try {
    localStorage.setItem(`exam_done_${currentExam.exam_id}_${studentNorm}`, 'submitted_' + Date.now());
    const studentIdentifier = payload.student_id || payload.student_password;
    localStorage.setItem(`exam_wal_backup_${studentIdentifier}_${payload.exam_id}`, JSON.stringify(payload));
  } catch (e) {}

  const payloadStr = JSON.stringify(payload);
  let beaconSuccess = false;
  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([payloadStr], { type: 'text/plain;charset=utf-8' });
      beaconSuccess = navigator.sendBeacon(API_URL, blob);
    } catch (e) {
      beaconSuccess = false;
    }
  }

  // دعم تكميلي بـ fetch(keepalive) في حال فشل sendBeacon
  if (!beaconSuccess) {
    try {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payloadStr,
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  }
}

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

// حظر إيماءات لقطة الشاشة في الموبايل مع السماح التام بإصبعين للتكبير والتصغير (Pinch-to-Zoom)
function handleMobileTouchRestrictions(e) {
  if (!isExamActive) return;

  // السماح بحرية كاملة باللمس بإصبعين للتكبير وتصغير الشاشة (Pinch to Zoom) في الموبايل
  if (e.touches && e.touches.length === 2) {
    return;
  }

  // إذا تم اللمس بـ 3 أصابع أو أكثر (إيماءات لقطة الشاشة الشهيرة في هواتف شاومي، أوبو، سامسونج وغيرها)
  if (e.touches && e.touches.length >= 3) {
    e.preventDefault();
    e.stopPropagation();
    showPersistentBlackout('تم حظر إيماءة لقطة الشاشة (لمس 3 أصابع)');
    setTimeout(() => {
      handleReturnFromBlur('محاولة أخذ لقطة شاشة عبر اللمس المتعدد');
    }, 1000);
    return false;
  }
}

function handleMobileTouchMove(e) {
  if (!isExamActive) return;

  // السماح بحرية بحركة إصبعين للزووم
  if (e.touches && e.touches.length === 2) {
    return;
  }

  // حظر سحب 3 أصابع لالتقاط الشاشة
  if (e.touches && e.touches.length >= 3) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }
}

// تقييد النقرات والتفاعل: يُسمح فقط باختيار الإجابة، أو تكبير الخط، أو فتح الكاميرا، أو تسليم الاختبار، أو شريط التنقل والوضع الليلي وتحديد المراجعة
function handleExamScreenStrictClick(e) {
  if (!isExamActive) return;

  const target = e.target;
  const isAllowed = target.closest('.option-label') ||
                    target.closest('.option-radio') ||
                    target.closest('input[type="radio"]') ||
                    target.closest('.q-img-thumb') ||
                    target.closest('.q-nav-btn') ||
                    target.closest('.q-flag-btn') ||
                    target.closest('.theme-toggle-btn') ||
                    target.closest('#network-offline-banner') ||
                    target.closest('#fullscreen-enforcer-modal') ||
                    target.closest('#restore-fullscreen-btn') ||
                    target.closest('button[onclick*="adjustExamFontSize"]') ||
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

// علامة مائية أمنية متكررة باسم ورقم الطالب على كامل صفحة الأسئلة
function createSecurityWatermark(name, id) {
  removeSecurityWatermark();
  const wm = document.createElement('div');
  wm.id = 'exam-security-watermark';
  wm.className = 'exam-security-watermark';
  const idText = id ? ` | ID: ${escapeHTML(id)}` : '';
  const text = `الطالب: ${escapeHTML(name)}${idText} | اختبار محمي`;
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
