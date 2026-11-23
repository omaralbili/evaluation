// ==========================================
// 2. منطق الطالب وتجربة الامتحان والكاميرا
// ==========================================

let studentMediaStream = null;
let cameraBroadcastInterval = null;
let camAlertCheckInterval = null;
let isActivatingCamera = false; // لمنع اعتبار طلب إذن الكاميرا محاولة غش
let lastCamAlertTimestamp = Date.now();
let examAnswers = {}; // تخزين إجابات الامتحان في الذاكرة لتحديث فوري O(1) دون إجهاد الـ DOM

// فحص دوري سحابي ذكي لاستقبال إشعارات وتنبيهات الأستاذ لفتح الكاميرا (مُحسّن لتحمل 300+ طالب)
function startCamAlertPolling() {
  if (camAlertCheckInterval) clearInterval(camAlertCheckInterval);
  camAlertCheckInterval = setInterval(async () => {
    // التوقف عن الاستعلام إذا كانت الصفحة غير نشطة أو الكاميرا تعمل بالفعل
    if (!isExamActive || studentMediaStream || isActivatingCamera || document.hidden) return;
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
  }, 15000);
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
    if (!studentMediaStream || !videoEl || videoEl.readyState < 2 || document.hidden) return;

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
      try {
        localStorage.setItem(`student_cam_stream_${streamPayload.studentId}`, JSON.stringify(streamPayload));
      } catch (e) {}

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
  }, 10000);
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
  const videoEl = document.getElementById('student-video-element');
  if (videoEl) {
    videoEl.srcObject = null;
  }
  if (currentExam) {
    try {
      localStorage.setItem(`student_cam_stream_${currentExam.student_id}`, JSON.stringify({ active: false }));
    } catch (e) {}
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
  const id = document.getElementById('st-id') ? document.getElementById('st-id').value.trim() : '';
  const examId = document.getElementById('st-exam-code').value.trim().toUpperCase();
  const password = document.getElementById('st-password').value.trim();

  // الرقم التعريفي / الجامعي (ID) اختياري وليس إجبارياً
  if (!name || !grade || !branch || !examId || !password) {
    return Swal.fire('تنبيه', 'يرجى استكمال جميع الحقول المطلوبة (الاسم، الفرقة، الفرع، كود الاختبار، وكلمة المرور)', 'warning');
  }

  // 0. فحص الجلسة محلياً (الدخول لمرة واحدة فقط لعند ما يسلم، ومنع الخروج وإعادة الدخول)
  const studentNorm = name.toLowerCase().replace(/[أإآء]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
  const finishedKey = `exam_done_${examId}_${studentNorm}`;
  const sessionKey = `exam_session_${examId}_${studentNorm}`;

  if (localStorage.getItem(finishedKey)) {
    return Swal.fire({
      title: 'غير مسموح بالدخول!',
      text: 'لقد قمت بأداء هذا الامتحان وتسليمه مسبقاً، ولا يُسمح بالدخول أو الإعادة نهائياً.',
      icon: 'error',
      confirmButtonText: 'حسناً',
      confirmButtonColor: '#e11d48'
    });
  }

  if (localStorage.getItem(sessionKey)) {
    return Swal.fire({
      title: 'غير مسموح بالدخول!',
      text: 'لقد قمت بالدخول لهذا الامتحان مسبقاً! نظام الاختبارات يسمح بالدخول لمرة واحدة فقط حتى التسليم، ولا يُسمح بالخروج وفتح الامتحان مجدداً.',
      icon: 'error',
      confirmButtonText: 'حسناً',
      confirmButtonColor: '#e11d48'
    });
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

  // 2. طلب بدء الامتحان والتحقق السحابي الشامل (الاسم + الامتحان + عدم الخروج وإعادة الدخول + كوتا كلمة المرور)
  const res = await apiCall({
    action: 'get_exam',
    exam_id: examId,
    student_name: name,
    student_id: id,
    student_grade: grade,
    student_branch: branch,
    student_password: password
  });

  if (!res || res.status !== 'success') {
    return Swal.fire('تنبيه أمني', res ? res.message : 'تعذر تحميل بيانات الامتحان', 'warning');
  }

  // تثبيت بدء الجلسة فور استلام الأسئلة لمنع أي خروج وإعادة دخول
  try {
    localStorage.setItem(sessionKey, 'started_' + Date.now());
  } catch(e) {}

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
    exam_token: res.exam_token || '', // توكن جلسة الامتحان الموثق من السيرفر
    questions: secureShuffleArray(res.questions)
  };

  examAnswers = {};
  examWarningsCount = 0;

  // ملء بيانات الترويسة
  document.getElementById('exam-title-display').innerText = res.exam.title || 'الاختبار الإلكتروني';
  const idDisplay = id ? ` | ID: ${id}` : '';
  document.getElementById('student-info-display').innerText = `الطالب: ${name} | ${grade} (${branch})${idDisplay}`;

  // بناء الأسئلة وشريط التنقل السريع بينها
  renderQuestions(currentExam.questions);
  buildQuestionsNav();
  restoreExamAnswersLocally();

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

  const fragment = document.createDocumentFragment();

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

    // دعم عرض صورة توضيحية خفيفة وأنيقة للسؤال بالرجوع للفهرس المباشر لتفادي إدراج نصوص ضخمة داخل الـ HTML
    let imageHtml = '';
    if (q.image) {
      const safeImg = escapeHTML(q.image);
      imageHtml = `
        <div class="mb-3.5 flex flex-col items-start">
          <div class="q-img-thumb relative group cursor-pointer border border-slate-200 rounded-lg overflow-hidden bg-slate-50 hover:border-blue-500 transition-all shadow-sm max-w-sm" onclick="showQuestionImageModalByIndex(${idx})">
            <img src="${safeImg}" alt="صورة السؤال" class="max-h-40 md:max-h-44 w-auto object-contain p-1 rounded" loading="lazy" decoding="async">
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

    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

function showQuestionImageModalByIndex(idx) {
  if (!currentExam || !currentExam.questions || !currentExam.questions[idx]) return;
  const src = currentExam.questions[idx].image;
  if (!src) return;
  showQuestionImageModal(src);
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

// معالجة فورية فائقة السرعة O(1) لاختيار الإجابة دون أي مسح بطيء لكامل شجرة الـ DOM
function selectOption(labelEl, questionIndex, value) {
  const card = labelEl.closest('.question-card') || labelEl.closest('.space-y-2\\.5');
  if (card) {
    const prev = card.querySelector('.option-label.is-selected');
    if (prev && prev !== labelEl) prev.classList.remove('is-selected');
  }
  labelEl.classList.add('is-selected');
  const radio = labelEl.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;

  examAnswers[questionIndex] = String(value);

  // تحديث شريط التقدم وزر التنقل الخاص بهذا السؤال مباشرة في جزء من المللي ثانية
  fastUpdateProgressAndNav(questionIndex);
  saveExamAnswersLocally(); // حفظ تلقائي فوري
}

function fastUpdateProgressAndNav(lastAnsweredIndex) {
  if (!currentExam || !currentExam.questions) return;
  const total = currentExam.questions.length;
  const answered = Object.keys(examAnswers).length;

  const percentage = total > 0 ? (answered / total) * 100 : 0;
  const fill = document.getElementById('exam-progress-fill');
  const label = document.getElementById('exam-progress-text');
  if (fill) fill.style.width = `${percentage}%`;
  if (label) label.innerText = `تمت الإجابة: ${answered} من ${total}`;

  if (lastAnsweredIndex !== undefined) {
    const btn = document.getElementById(`q-nav-${lastAnsweredIndex}`);
    if (btn) btn.classList.add('is-answered');
  } else {
    updateQuestionsNavState();
  }
}

function updateProgressBar() {
  fastUpdateProgressAndNav();
}

// توحيد اسم الطالب لمفاتيح التخزين المحلي (معالجة الهمزات والتاء المربوطة)
function normalizeStudentNameForKey(name) {
  return (name || '').toLowerCase().replace(/[أإآء]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
}

// حفظ تلقائي فوري للإجابات محلياً من الذاكرة دون استعلامات DOM ثقيلة
function saveExamAnswersLocally() {
  if (!currentExam) return;
  try {
    const studentNorm = normalizeStudentNameForKey(currentExam.student_name);
    localStorage.setItem(`exam_answers_${currentExam.exam_id}_${studentNorm}`, JSON.stringify(examAnswers));
  } catch (e) {}
}

// استعادة الإجابات المحفوظة محلياً (عند إعادة تحميل غير مقصودة أثناء الجلسة نفسها)
function restoreExamAnswersLocally() {
  if (!currentExam) return;
  try {
    const studentNorm = normalizeStudentNameForKey(currentExam.student_name);
    const raw = localStorage.getItem(`exam_answers_${currentExam.exam_id}_${studentNorm}`);
    if (!raw) return;
    const answers = JSON.parse(raw);
    if (!answers || typeof answers !== 'object') return;
    examAnswers = answers;

    Object.keys(answers).forEach(qIndex => {
      const radio = document.querySelector(`input[name="q_${qIndex}"][value="${answers[qIndex]}"]`);
      if (radio) {
        radio.checked = true;
        const label = radio.closest('.option-label');
        if (label) label.classList.add('is-selected');
      }
    });
    fastUpdateProgressAndNav();
  } catch (e) {}
}

// بناء شريط التنقل السريع بين الأسئلة مع تمييز المُجاب منها
function buildQuestionsNav() {
  const nav = document.getElementById('questions-nav');
  if (!nav || !currentExam) return;
  nav.innerHTML = '';

  const fragment = document.createDocumentFragment();
  currentExam.questions.forEach((q, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'q-nav-btn';
    btn.id = `q-nav-${q.index}`;
    btn.innerText = String(idx + 1);
    btn.onclick = () => {
      const card = document.getElementById(`q-card-${q.index}`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    fragment.appendChild(btn);
  });
  nav.appendChild(fragment);
  updateQuestionsNavState();
}

function updateQuestionsNavState() {
  if (!currentExam || !currentExam.questions) return;
  currentExam.questions.forEach(q => {
    const btn = document.getElementById(`q-nav-${q.index}`);
    if (!btn) return;
    const answered = Object.prototype.hasOwnProperty.call(examAnswers, String(q.index));
    btn.classList.toggle('is-answered', answered);
  });
}

function startTimer(seconds) {
  // مؤقت مبني على الوقت الفعلي (وليس عد التيكات) حتى لا يتأثر بتجميد التبويب أو بطء الجهاز
  const endAt = Date.now() + seconds * 1000;
  const timerDisplay = document.getElementById('timer-display');
  const timerChip = document.getElementById('timer-chip-container');
  let autoSubmitted = false;

  examTimer = setInterval(() => {
    const remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    if (timerDisplay) {
      timerDisplay.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    if (remaining <= 180 && timerChip) {
      timerChip.classList.add('is-urgent');
    }

    if (remaining <= 0 && !autoSubmitted) {
      autoSubmitted = true;
      clearInterval(examTimer);
      // توزيع عشوائي زمني ذكي (Jittered Slot) لفض تدفق الـ 300 طالب بالتساوي ومنع ضغط السيرفر
      const initialSlotDelay = Math.floor(Math.random() * 3200);
      setTimeout(() => {
        submitExam('انتهى الوقت المحدد للامتحان تلقائياً');
      }, initialSlotDelay);
    }
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

  // 1. تجميع الإجابات بدقة متناهية من الذاكرة السريعة
  const answers = { ...examAnswers };

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
    exam_token: currentExam ? currentExam.exam_token : '', // توكن جلسة الامتحان الموثق
    answers: answers,
    cheat_status: statusReason || 'تم التسليم بواسطة الطالب',
    client_timestamp: Date.now()
  };

  // 2. سجل المعاملات المحلي الفوري (Write-Ahead-Log - WAL) لضمان عدم ضياع أي إجابة تحت أي ظرف
  const studentIdentifier = payload.student_id ? payload.student_id : payload.student_password;
  const backupKey = `exam_wal_backup_${studentIdentifier}_${payload.exam_id}`;
  try {
    localStorage.setItem(backupKey, JSON.stringify(payload));
  } catch (e) {}

  // 3. معالجة التسليم عبر طابور انتظار متزامن فائق التحمل لـ 300+ طالب (Resilient Queue)
  await processSubmissionWithResilientQueue(payload, statusReason, backupKey);
}

/**
 * خوارزمية طابور التسليم المقاومة للتصادم والضغط الشديد (Concurrent Queue with Jittered Exponential Backoff)
 * مصممة هندسياً لتحمل تسليم 300+ طالب في نفس اللحظة دون سقوط أي إجابة وتأكيد استلام الجميع
 */
async function processSubmissionWithResilientQueue(payload, statusReason, backupKey) {
  const MAX_RETRIES = 20; // رفع عدد المحاولات إلى 20 لضمان تسجيل كل طالب مهما كان الضغط
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
      const timeoutId = setTimeout(() => controller.abort(), 20000); // مهلة 20 ثانية لكل محاولة

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (data && (data.status === 'success' || (data.message && data.message.includes('مسبقاً')))) {
        isSuccess = true;
        // وسم إتمام وتسليم الامتحان للطالب محلياً لمنع أي محاولة إعادة دخول
        const studentNorm = normalizeStudentNameForKey(payload.student_name);
        try {
          localStorage.setItem(`exam_done_${payload.exam_id}_${studentNorm}`, 'submitted_' + Date.now());
          localStorage.removeItem(backupKey);
          localStorage.removeItem(`exam_answers_${payload.exam_id}_${studentNorm}`); // مسح الحفظ التلقائي بعد نجاح التسليم
        } catch (e) {}

        // إخفاء قاعة الامتحان والعودة للرئيسية
        document.getElementById('exam-room').classList.add('hidden');
        document.getElementById('navbar').classList.remove('hidden');
        showSection('student-login');

        const reasonStr = String(statusReason || '');
        const isViolation = reasonStr.includes('غش') || reasonStr.includes('مغادرة') || reasonStr.includes('محظورة');
        if (isViolation) {
          Swal.fire({
            title: 'تم قفل الامتحان وإنهاء الجلسة',
            html: `
              <div class="text-right text-sm space-y-2 mt-2">
                <p><b>سبب الإغلاق:</b> <span class="text-red-600 font-bold">${escapeHTML(reasonStr)}</span></p>
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
      } else if (data && data.fatal) {
        // خطأ نهائي غير قابل لإعادة المحاولة (مثل جلسة امتحان غير صالحة): نتوقف ونُبقي الإجابات محفوظة محلياً
        Swal.fire({
          title: 'تعذر تسليم الإجابات',
          text: (data.message || 'حدث خطأ غير متوقع') + ' إجاباتك محفوظة بالكامل على جهازك، يرجى إبلاغ المراقب أو تحديث الصفحة والمحاولة مجدداً.',
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
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
      const jitter = Math.random() * 600;
      const delay = Math.min(800 * Math.pow(1.15, attempt) + jitter, 3500);
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
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('exam_wal_backup_')) {
        keys.push(key);
      }
    }

    keys.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw) {
        const payload = JSON.parse(raw);
        fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        }).then(res => res.json()).then(data => {
          if (data && (data.status === 'success' || (data.message && data.message.includes('مسبقاً')))) {
            localStorage.removeItem(key);
          }
        }).catch(() => {});
      }
    });
  } catch (e) {}
}
