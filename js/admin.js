
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

  if (!res || res.status !== 'success' || !res.exams || res.exams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">لا توجد اختبارات منشورة حتى الآن</td></tr>`;
    return;
  }

  const rowsHtml = res.exams.map(exam => {
    const isActive = exam.status === 'active';
    return `
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
            <button onclick="showExamAnalytics('${escapeHTML(exam.id)}')" class="btn btn-outline text-xs py-1 px-2.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50">
              <i class="fa-solid fa-chart-pie"></i> تحليلات
            </button>
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
  }).join('');

  tbody.innerHTML = rowsHtml;

  // تعبئة قائمة اختيار الامتحان في لوحة التحليلات
  const select = document.getElementById('analytics-exam-select');
  if (select) {
    const currentVal = select.value;
    select.innerHTML = res.exams.map(e => `<option value="${escapeHTML(e.id)}">${escapeHTML(e.id)} - ${escapeHTML(e.title)}</option>`).join('');
    if (currentVal && res.exams.some(e => e.id === currentVal)) select.value = currentVal;
  }
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

  if (!res || res.status !== 'success' || !res.faculty || res.faculty.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">لا يوجد أعضاء هيئة تدريس مسجلين حالياً</td></tr>`;
    return;
  }

  tbody.innerHTML = res.faculty.map(f => `
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
  `).join('');
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

  renderAdminOverviewCards(res.results);

  const tbody = document.getElementById('results-table-body');
  if (!tbody) return;

  if (res.results.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400">لا توجد نتائج مسجلة حتى الآن</td></tr>`;
    return;
  }

  const reversed = [...res.results].reverse();
  tbody.innerHTML = reversed.map(row => {
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

    return `
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
  }).join('');
}

function isFlaggedStatusText(statusText) {
  const s = String(statusText || '');
  return s.includes('غش') || s.includes('محظورة') || s.includes('مغادرة');
}

// بطاقات النظرة العامة أعلى لوحة الإدارة: ملخص فوري لكل النتائج المحملة
function renderAdminOverviewCards(results) {
  const container = document.getElementById('admin-overview-cards');
  if (!container) return;

  const total = results.length;
  const examCodes = new Set();
  let sumPct = 0;
  let passCount = 0;
  let todayCount = 0;
  let flaggedCount = 0;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  results.forEach(row => {
    if (row[1]) examCodes.add(String(row[1]));
    const score = Number(row[7]) || 0;
    const totalQ = Number(row[8]) || 0;
    const pct = totalQ > 0 ? (score / totalQ) * 100 : 0;
    sumPct += pct;
    if (pct >= 50) passCount++;
    if (String(row[0] || '').startsWith(todayStr)) todayCount++;
    if (isFlaggedStatusText(row[9])) flaggedCount++;
  });

  const avgPct = total > 0 ? Math.round((sumPct / total) * 10) / 10 : 0;
  const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;

  const cards = [
    { icon: 'fa-inbox', color: 'blue', value: total, label: 'إجمالي التسليمات' },
    { icon: 'fa-file-circle-check', color: 'indigo', value: examCodes.size, label: 'امتحانات عليها نتائج' },
    { icon: 'fa-chart-line', color: 'sky', value: avgPct + '%', label: 'متوسط الدرجات' },
    { icon: 'fa-graduation-cap', color: 'emerald', value: passRate + '%', label: 'نسبة النجاح' },
    { icon: 'fa-calendar-day', color: 'amber', value: todayCount, label: 'تسليمات اليوم' },
    { icon: 'fa-flag', color: 'rose', value: flaggedCount, label: 'حالات مخالفة' }
  ];

  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600'
  };

  container.innerHTML = cards.map(c => `
    <div class="app-card p-3 flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg ${colorMap[c.color]} flex items-center justify-center shrink-0">
        <i class="fa-solid ${c.icon}"></i>
      </div>
      <div class="min-w-0">
        <div class="text-lg font-extrabold text-slate-900 leading-tight">${c.value}</div>
        <div class="text-[11px] text-slate-500 font-semibold truncate">${c.label}</div>
      </div>
    </div>
  `).join('');
}

function filterResultsTable() {
  const filterInput = document.getElementById('filter-exam-code');
  const query = (filterInput ? filterInput.value : '').trim().toUpperCase();
  const flaggedOnly = document.getElementById('filter-flagged-only') && document.getElementById('filter-flagged-only').checked;
  const rows = document.querySelectorAll('#results-table-body tr');

  rows.forEach(row => {
    const text = (row.textContent || '').toUpperCase();
    const matchesQuery = !query || text.includes(query);
    const matchesFlagged = !flaggedOnly || isFlaggedStatusText(text);
    row.style.display = (matchesQuery && matchesFlagged) ? '' : 'none';
  });
}

// نسخة debounced لسرعة الاستجابة أثناء الكتابة في حقل البحث
const debouncedFilterResultsTable = typeof debounce === 'function' ? debounce(filterResultsTable, 120) : filterResultsTable;

async function exportResultsToExcel() {
  // تحميل مكتبة التصدير كسلاً عند أول استخدام فقط
  Swal.fire({
    title: 'جاري تجهيز أداة التصدير...',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });
  try {
    await ensureXlsxLoaded();
    Swal.close();
  } catch (e) {
    return Swal.fire('خطأ في التحميل', 'تعذر تحميل مكتبة التصدير. تحقق من اتصال الإنترنت وحاول مرة أخرى.', 'error');
  }

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

  const filterInput = document.getElementById('filter-exam-code') || document.getElementById('filter-faculty-results');
  const filterVal = filterInput ? filterInput.value.trim() : '';
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

// ==========================================
// 5. تحليلات الامتحانات (مشتركة بين الإدارة العامة وهيئة التدريس)
// ==========================================

// عرض لوحة تحليلات امتحان محدد داخل الحاوية المخصصة بالصفحة
async function showExamAnalytics(examId) {
  const panel = document.getElementById('analytics-panel');
  const container = document.getElementById('analytics-result');
  if (!panel || !container) return;

  const select = document.getElementById('analytics-exam-select');
  if (select && examId) select.value = examId;

  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  container.innerHTML = `
    <div class="p-8 text-center text-slate-400">
      <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2 text-indigo-400"></i>
      <p class="text-xs font-bold">جاري حساب التحليلات من قاعدة البيانات...</p>
    </div>
  `;

  const res = await apiCall({ action: 'get_exam_analytics', exam_id: examId, silent: true });
  if (!res || res.status !== 'success') {
    container.innerHTML = `
      <div class="p-6 text-center text-rose-500 text-xs font-bold">
        <i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(res && res.message ? res.message : 'تعذر جلب التحليلات، تحقق من الاتصال وأعد المحاولة')}
      </div>
    `;
    return;
  }

  renderExamAnalytics(container, res);
}

function renderExamAnalytics(container, data) {
  const exam = data.exam || {};

  if (!data.submissions) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 border rounded-xl bg-slate-50">
        <i class="fa-solid fa-chart-simple text-3xl mb-2 text-slate-300"></i>
        <p class="text-xs font-bold">لا توجد تسليمات مسجلة بعد للامتحان (${escapeHTML(exam.id || '')}) - تظهر التحليلات هنا فور بدء الطلاب في التسليم</p>
      </div>
    `;
    return;
  }

  const statCards = [
    { label: 'عدد التسليمات', value: data.submissions, icon: 'fa-inbox', cls: 'bg-blue-50 text-blue-600' },
    { label: 'متوسط الدرجة', value: data.average_pct + '%', icon: 'fa-chart-line', cls: 'bg-sky-50 text-sky-600' },
    { label: 'نسبة النجاح', value: data.pass_rate + '%', icon: 'fa-graduation-cap', cls: 'bg-emerald-50 text-emerald-600' },
    { label: 'أعلى درجة', value: data.max_pct + '%', icon: 'fa-arrow-trend-up', cls: 'bg-teal-50 text-teal-600' },
    { label: 'أقل درجة', value: data.min_pct + '%', icon: 'fa-arrow-trend-down', cls: 'bg-amber-50 text-amber-600' },
    { label: 'حالات مخالفة', value: data.flagged_count, icon: 'fa-flag', cls: 'bg-rose-50 text-rose-600' }
  ];

  const bucketLabels = ['0 - 20%', '20 - 40%', '40 - 60%', '60 - 80%', '80 - 100%'];
  const bucketColors = ['bg-rose-400', 'bg-amber-400', 'bg-yellow-400', 'bg-lime-500', 'bg-emerald-500'];
  const totalSubs = data.submissions;
  const distBar = (data.distribution || []).map((count, i) => {
    const w = totalSubs > 0 ? (count / totalSubs) * 100 : 0;
    return w > 0 ? `<div class="${bucketColors[i]} h-full" style="width:${w}%" title="${bucketLabels[i]}: ${count} طالب"></div>` : '';
  }).join('');
  const distLegend = bucketLabels.map((l, i) => `
    <span class="flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
      <span class="w-2.5 h-2.5 rounded-sm ${bucketColors[i]}"></span> ${l} (${(data.distribution || [])[i] || 0})
    </span>
  `).join('');

  let questionsHtml = '';
  if (data.question_stats_available && data.question_stats && data.question_stats.length > 0) {
    const sorted = [...data.question_stats].sort((a, b) => (a.correct_pct === null ? 101 : a.correct_pct) - (b.correct_pct === null ? 101 : b.correct_pct));
    questionsHtml = `
      <div class="pt-4 border-t">
        <h4 class="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2">
          <i class="fa-solid fa-list-check text-indigo-600"></i> تحليل صعوبة الأسئلة (الأصعب أولاً - نسبة من أجابوا صحيحاً)
        </h4>
        <div class="space-y-2">
          ${sorted.map(q => {
            const pct = q.correct_pct === null ? 0 : q.correct_pct;
            const barCls = pct >= 70 ? 'bg-emerald-500' : (pct >= 40 ? 'bg-amber-400' : 'bg-rose-500');
            const textCls = pct >= 70 ? 'text-emerald-700' : (pct >= 40 ? 'text-amber-700' : 'text-rose-700');
            return `
              <div class="flex items-center gap-3">
                <span class="w-7 h-7 shrink-0 rounded-md bg-slate-100 text-slate-600 text-[11px] font-extrabold flex items-center justify-center">${q.index}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-[11px] font-semibold text-slate-700 truncate mb-1">${escapeHTML(q.text)}</div>
                  <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div class="${barCls} h-full rounded-full transition-all" style="width:${pct}%"></div>
                  </div>
                </div>
                <span class="text-[11px] font-extrabold ${textCls} w-12 text-left shrink-0" dir="ltr">${pct}%</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else {
    questionsHtml = `
      <div class="pt-4 border-t">
        <p class="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
          <i class="fa-solid fa-circle-info"></i>
          تحليل صعوبة الأسئلة يظهر تلقائياً للتسليمات الجديدة بعد هذا التحديث، التسليمات السابقة لا تحتوي تفاصيل كل سؤال.
        </p>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h4 class="text-sm font-extrabold text-slate-900">${escapeHTML(exam.title || '')}</h4>
        <p class="text-[11px] text-slate-500 font-semibold mt-0.5">كود الامتحان: <span class="font-mono font-bold text-indigo-600">${escapeHTML(exam.id || '')}</span> · ${escapeHTML(exam.questions_count || 0)} سؤال · بقلم ${escapeHTML(exam.creator || '-')}</p>
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-4">
      ${statCards.map(c => `
        <div class="border border-slate-200 rounded-xl p-2.5 flex items-center gap-2.5 bg-white">
          <div class="w-9 h-9 rounded-lg ${c.cls} flex items-center justify-center shrink-0 text-sm">
            <i class="fa-solid ${c.icon}"></i>
          </div>
          <div class="min-w-0">
            <div class="text-base font-extrabold text-slate-900 leading-tight">${c.value}</div>
            <div class="text-[10px] text-slate-500 font-bold truncate">${c.label}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="mb-1">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[11px] font-bold text-slate-600">توزيع درجات الطلاب</span>
      </div>
      <div class="h-3.5 bg-slate-100 rounded-full overflow-hidden flex">${distBar}</div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2">${distLegend}</div>
    </div>

    ${questionsHtml}
  `;
}

// استدعاء التحليلات من القائمة المنسدلة مباشرة
function showExamAnalyticsFromSelect() {
  const select = document.getElementById('analytics-exam-select');
  if (select && select.value) showExamAnalytics(select.value);
}
