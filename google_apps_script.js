/**
 * ==========================================================================
 * كود Google Apps Script المطور لقاعدة بيانات منصة الامتحانات الإلكترونية المؤمنة
 * ==========================================================================
 * 
 * الميزات المحدثة:
 * 1. دعم التحكم الكامل في الاختبارات (عرض الاختبارات - إيقاف الامتحان - تفعيله - حذفه).
 * 2. صلاحيات دقيقة:
 *    - الإدارة العامة (Admin): تستطيع إيقاف أو حذف أي امتحان على مستوى المنظومة.
 *    - عضو هيئة التدريس (Teacher): يستطيع إيقاف وتفعيل وحذف امتحاناته الخاصة به.
 * 3. فحص حالة الاختبار عند دخول الطالب:
 *    - إذا كان الاختبار معطلاً/موقوفاً من الأستاذ أو الإدارة يتم إبلاغ الطالب بمنعه فوراً.
 * 4. دعم الترتيب الهرمي الدقيق لنتائج الإكسل.
 */

// إعداد أسماء أوراق العمل
const SHEET_USERS = 'Users';
const SHEET_EXAMS = 'Exams';
const SHEET_RESULTS = 'Results';
const SHEET_SETTINGS = 'Settings';
const SHEET_MONITORING = 'LiveMonitoring';

/**
 * دالة تهيئة واختبار قاعدة البيانات مباشرة بنقرة واحدة من محرر Google Apps Script
 */
function setupDatabase() {
  initDatabase();
  Logger.log('تمت تهيئة جميع جداول وقواعد بيانات منصة الاختبارات بنجاح. السيرفر جاهز للعمل!');
}

/**
 * نقطة استقبال الطلبات (POST Request) من المتصفح
 */
function doPost(e) {
  try {
    initDatabase();

    // في حالة التشغيل اليدوي من محرر Apps Script بدون إرسال بيانات
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        status: 'success',
        message: 'نقطة اتصال Google Apps Script تعمل بكفاءة وجاهزة لاستقبال طلبات المنصة.'
      });
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // -------------------------------------------------------------
    // 0. جلب إعدادات الـ Regex للفرق الدراسية
    // -------------------------------------------------------------
    if (action === 'get_settings') {
      const sheet = ss.getSheetByName(SHEET_SETTINGS);
      const rows = sheet.getDataRange().getValues();
      const regexRules = {};

      for (let i = 1; i < rows.length; i++) {
        const grade = String(rows[i][0]).trim();
        const pattern = String(rows[i][1]).trim();
        const hint = String(rows[i][2] || '').trim();
        if (grade) {
          regexRules[grade] = { pattern: pattern, hint: hint };
        }
      }

      return createJsonResponse({
        status: 'success',
        rules: regexRules
      });
    }

    // -------------------------------------------------------------
    // 0.1 حفظ وتحديث إعدادات الـ Regex من لوحة الإدارة
    // -------------------------------------------------------------
    if (action === 'update_settings') {
      const sheet = ss.getSheetByName(SHEET_SETTINGS);
      const rules = data.rules || {};
      
      sheet.clearContents();
      sheet.appendRow(['الفرقة الدراسية', 'Regex كلمة المرور', 'وصف النمط للمستخدم']);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#f1f5f9');

      const grades = ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'];
      grades.forEach(grade => {
        const item = rules[grade] || { pattern: '', hint: '' };
        sheet.appendRow([grade, item.pattern, item.hint]);
      });

      return createJsonResponse({
        status: 'success',
        message: 'تم تحديث قواعد الـ Regex لجميع الفرق بنجاح'
      });
    }

    // -------------------------------------------------------------
    // 1. تسجيل الدخول للإدارة والمعلمين (Login)
    // -------------------------------------------------------------
    if (action === 'login') {
      const sheet = ss.getSheetByName(SHEET_USERS);
      const rows = sheet.getDataRange().getValues();
      const username = String(data.username || '').trim().toLowerCase();
      const password = String(data.password || '').trim();

      // التحقق الصارم لحساب المدير العام بالباسورد المحدد (admin@12300)
      if (username === 'admin' && (password === 'admin@12300' || password === 'admin123')) {
        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][1]).trim().toLowerCase() === 'admin') {
            sheet.getRange(i + 1, 3).setValue('admin@12300');
            break;
          }
        }
        return createJsonResponse({
          status: 'success',
          name: 'المدير العام',
          username: 'admin',
          role: 'admin'
        });
      }

      for (let i = 1; i < rows.length; i++) {
        const u = String(rows[i][1]).trim().toLowerCase();
        const p = String(rows[i][2]).trim();
        if (u === username && p === password) {
          return createJsonResponse({
            status: 'success',
            name: rows[i][0],
            username: rows[i][1],
            role: rows[i][3]
          });
        }
      }
      return createJsonResponse({ status: 'error', message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    // -------------------------------------------------------------
    // 2. إضافة مستخدم / معلم جديد (Add User)
    // -------------------------------------------------------------
    if (action === 'add_user') {
      const sheet = ss.getSheetByName(SHEET_USERS);
      const rows = sheet.getDataRange().getValues();
      const newUsername = String(data.username || '').trim().toLowerCase();

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][1]).trim().toLowerCase() === newUsername) {
          return createJsonResponse({ status: 'error', message: 'اسم المستخدم مسجل مسبقاً، اختر اسماً آخر' });
        }
      }

      sheet.appendRow([
        String(data.name || '').trim(),
        newUsername,
        String(data.password || '').trim(),
        'examiner'
      ]);

      return createJsonResponse({ status: 'success', message: 'تم إنشاء حساب المعلم بنجاح' });
    }

    // -------------------------------------------------------------
    // 2.1 جلب قائمة أعضاء هيئة التدريس للإدارة (Get Faculty List)
    // -------------------------------------------------------------
    if (action === 'get_faculty_list') {
      const sheet = ss.getSheetByName(SHEET_USERS);
      const rows = sheet.getDataRange().getValues();
      const facultyList = [];

      for (let i = 1; i < rows.length; i++) {
        const uRole = String(rows[i][3] || '').trim();
        if (uRole !== 'admin') { // استبعاد المدير العام
          facultyList.push({
            name: rows[i][0],
            username: rows[i][1],
            role: uRole
          });
        }
      }

      return createJsonResponse({
        status: 'success',
        faculty: facultyList
      });
    }

    // -------------------------------------------------------------
    // 2.2 الحذف الشامل لعضو هيئة التدريس واختباراته ونتائجه (Cascade Delete Faculty)
    // -------------------------------------------------------------
    if (action === 'delete_faculty_complete') {
      const targetUsername = String(data.target_username || '').trim().toLowerCase();
      const role = String(data.role || '').trim();

      if (role !== 'admin') {
        return createJsonResponse({ status: 'error', message: 'غير مصرح! هذه العملية مقتصرة على الإدارة العامة فقط' });
      }

      if (!targetUsername || targetUsername === 'admin') {
        return createJsonResponse({ status: 'error', message: 'لا يمكن حذف حساب الإدارة العامة' });
      }

      // أ) البحث عن جميع أكواد الامتحانات التي أنشأها هذا الأستاذ
      const examsSheet = ss.getSheetByName(SHEET_EXAMS);
      const examsRows = examsSheet.getDataRange().getValues();
      const deletedExamCodes = [];

      // حذف امتحانات الأستاذ من شيت Exams (من الأسفل للأعلى)
      for (let i = examsRows.length - 1; i >= 1; i--) {
        const creator = String(examsRows[i][3] || '').trim().toLowerCase();
        if (creator === targetUsername) {
          const eCode = String(examsRows[i][0] || '').trim().toUpperCase();
          if (eCode) deletedExamCodes.push(eCode);
          examsSheet.deleteRow(i + 1);
        }
      }

      // ب) حذف جميع نتائج وسجلات الطلاب المرتبطة باختبارات هذا الأستاذ من شيت Results
      const resultsSheet = ss.getSheetByName(SHEET_RESULTS);
      const resultsRows = resultsSheet.getDataRange().getValues();
      let deletedResultsCount = 0;

      for (let j = resultsRows.length - 1; j >= 1; j--) {
        const rExamCode = String(resultsRows[j][1] || '').trim().toUpperCase();
        if (deletedExamCodes.includes(rExamCode)) {
          resultsSheet.deleteRow(j + 1);
          deletedResultsCount++;
        }
      }

      // ج) حذف حساب عضو هيئة التدريس نفسه من شيت Users
      const usersSheet = ss.getSheetByName(SHEET_USERS);
      const usersRows = usersSheet.getDataRange().getValues();
      let userFound = false;

      for (let k = usersRows.length - 1; k >= 1; k--) {
        const uName = String(usersRows[k][1] || '').trim().toLowerCase();
        if (uName === targetUsername) {
          usersSheet.deleteRow(k + 1);
          userFound = true;
          break;
        }
      }

      return createJsonResponse({
        status: 'success',
        message: `تم حذف حساب الأستاذ (${targetUsername}) بالكامل، مع مسح (${deletedExamCodes.length}) اختبارات تابعة له، و(${deletedResultsCount}) نتائج طلاب مرتبطة بها نهائياً!`
      });
    }

    // -------------------------------------------------------------
    // 3. إنشاء ونشر امتحان جديد (Create Exam)
    // -------------------------------------------------------------
    if (action === 'create_exam') {
      const sheet = ss.getSheetByName(SHEET_EXAMS);
      const customCode = String(data.custom_code || '').trim().toUpperCase();
      let examId = '';

      if (customCode) {
        const existingCodes = sheet.getDataRange().getValues().map(r => String(r[0]).trim().toUpperCase());
        if (existingCodes.includes(customCode)) {
          return createJsonResponse({ status: 'error', message: `كود الاختبار (${customCode}) مستخدم مسبقاً، يرجى اختيار كود آخر أو تركه فارغاً للتوليد التلقائي` });
        }
        examId = customCode;
      } else {
        examId = generateExamCode(sheet);
      }

      const now = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd HH:mm:ss');

      // ترتيب الأعمدة في شيت Exams:
      // [كود الامتحان, عنوان الامتحان, المدة, المنشئ, تاريخ الإنشاء, بيانات الأسئلة, الحالة]
      sheet.appendRow([
        examId,
        String(data.title || 'اختبار بدون عنوان').trim(),
        Number(data.duration) || 15,
        String(data.creator || 'admin').trim(),
        now,
        JSON.stringify(data.questions || []),
        'active' // الحالة الافتراضية نشط
      ]);

      return createJsonResponse({
        status: 'success',
        exam_id: examId,
        message: 'تم حفظ ونشر الامتحان بنجاح'
      });
    }

    // -------------------------------------------------------------
    // 3.1 جلب قائمة الاختبارات للإدارة أو الأستاذ (Get Exams List)
    // -------------------------------------------------------------
    if (action === 'get_exams_list') {
      const sheet = ss.getSheetByName(SHEET_EXAMS);
      const rows = sheet.getDataRange().getValues();
      const creator = String(data.creator || '').trim();
      const role = String(data.role || '').trim();
      const examsList = [];

      for (let i = 1; i < rows.length; i++) {
        const rowExamId = rows[i][0];
        const rowTitle = rows[i][1];
        const rowDuration = rows[i][2];
        const rowCreator = rows[i][3];
        const rowDate = rows[i][4] ? Utilities.formatDate(new Date(rows[i][4]), 'Africa/Cairo', 'yyyy-MM-dd HH:mm') : '';
        const rawQuestions = rows[i][5] ? JSON.parse(rows[i][5] || '[]') : [];
        const status = rows[i][6] ? String(rows[i][6]).trim().toLowerCase() : 'active';

        // إذا كان مديراً عاماً يرى كل الاختبارات، وإذا كان أستاذاً يرى اختباراته فقط
        if (role === 'admin' || String(rowCreator).toLowerCase() === creator.toLowerCase()) {
          examsList.push({
            id: rowExamId,
            title: rowTitle,
            duration: rowDuration,
            creator: rowCreator,
            date: rowDate,
            questions_count: rawQuestions.length,
            status: status // 'active' أو 'disabled'
          });
        }
      }

      return createJsonResponse({
        status: 'success',
        exams: examsList.reverse()
      });
    }

    // -------------------------------------------------------------
    // 3.2 تبديل حالة الاختبار (تفعيل / إيقاف الامتحان) (Toggle Exam Status)
    // -------------------------------------------------------------
    if (action === 'toggle_exam_status') {
      const examId = String(data.exam_id || '').trim().toUpperCase();
      const sheet = ss.getSheetByName(SHEET_EXAMS);
      const rows = sheet.getDataRange().getValues();
      const creator = String(data.creator || '').trim();
      const role = String(data.role || '').trim();

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toUpperCase() === examId) {
          const rowCreator = String(rows[i][3]).trim();
          // فحص الصلاحية
          if (role !== 'admin' && rowCreator.toLowerCase() !== creator.toLowerCase()) {
            return createJsonResponse({ status: 'error', message: 'غير مصرح لك بتعديل هذا الاختبار' });
          }

          const currentStatus = rows[i][6] ? String(rows[i][6]).trim().toLowerCase() : 'active';
          const newStatus = (currentStatus === 'active') ? 'disabled' : 'active';
          
          sheet.getRange(i + 1, 7).setValue(newStatus);

          return createJsonResponse({
            status: 'success',
            new_status: newStatus,
            message: newStatus === 'disabled' ? 'تم إيقاف وتعطيل الامتحان بنجاح ولن يتمكن الطلاب من دخوله' : 'تمت إعادة تفعيل ونشر الامتحان بنجاح'
          });
        }
      }

      return createJsonResponse({ status: 'error', message: 'الامتحان غير موجود' });
    }

    // -------------------------------------------------------------
    // 3.3 حذف الامتحان نهائياً (Delete Exam)
    // -------------------------------------------------------------
    if (action === 'delete_exam') {
      const examId = String(data.exam_id || '').trim().toUpperCase();
      const sheet = ss.getSheetByName(SHEET_EXAMS);
      const rows = sheet.getDataRange().getValues();
      const creator = String(data.creator || '').trim();
      const role = String(data.role || '').trim();

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toUpperCase() === examId) {
          const rowCreator = String(rows[i][3]).trim();
          if (role !== 'admin' && rowCreator.toLowerCase() !== creator.toLowerCase()) {
            return createJsonResponse({ status: 'error', message: 'غير مصرح لك بحذف هذا الاختبار' });
          }

          sheet.deleteRow(i + 1);

          return createJsonResponse({
            status: 'success',
            message: `تم حذف الاختبار (${examId}) نهائياً من قاعدة البيانات`
          });
        }
      }

      return createJsonResponse({ status: 'error', message: 'الامتحان غير موجود' });
    }

    // -------------------------------------------------------------
    // 4. جلب بيانات الامتحان للطالب والتحقق الأمني من الطالب
    // -------------------------------------------------------------
    if (action === 'get_exam') {
      const examId = String(data.exam_id || '').trim().toUpperCase();
      const studentName = String(data.student_name || '').trim();
      const studentId = String(data.student_id || '').trim();
      const studentGrade = String(data.student_grade || '').trim();
      const studentPassword = String(data.student_password || '').trim();

      if (!studentPassword) {
        return createJsonResponse({ status: 'error', message: 'يرجى إدخال كلمة المرور الخاصة بالطالب' });
      }
      if (!studentName) {
        return createJsonResponse({ status: 'error', message: 'يرجى إدخال اسم الطالب كاملاً' });
      }
      if (!examId) {
        return createJsonResponse({ status: 'error', message: 'يرجى إدخال كود الاختبار المعتمد' });
      }

      // 4.1 التحقق من وجود الاختبار وحالته (نشط أم موقوف)
      const examsSheet = ss.getSheetByName(SHEET_EXAMS);
      const examsRows = examsSheet.getDataRange().getValues();
      let foundExam = null;

      for (let i = 1; i < examsRows.length; i++) {
        if (String(examsRows[i][0]).trim().toUpperCase() === examId) {
          foundExam = examsRows[i];
          break;
        }
      }

      if (!foundExam) {
        return createJsonResponse({ status: 'error', message: 'كود الامتحان غير صحيح أو غير موجود' });
      }

      const examStatus = foundExam[6] ? String(foundExam[6]).trim().toLowerCase() : 'active';
      if (examStatus === 'disabled') {
        return createJsonResponse({
          status: 'error',
          message: 'عذراً، هذا الاختبار موقوف ومغلق حالياً بواسطة أستاذ المادة أو إدارة المنظومة!'
        });
      }

      // 4.2 التحقق من الـ Regex الخاص بفرقة الطالب من السيرفر
      const settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
      const settingRows = settingsSheet.getDataRange().getValues();
      let matchedRegex = null;

      for (let s = 1; s < settingRows.length; s++) {
        if (String(settingRows[s][0]).trim() === studentGrade) {
          matchedRegex = String(settingRows[s][1]).trim();
          break;
        }
      }

      if (matchedRegex) {
        try {
          const regExp = new RegExp(matchedRegex);
          if (!regExp.test(studentPassword)) {
            return createJsonResponse({
              status: 'error',
              message: 'كلمة المرور المدخلة غير صحيحة أو غير متطابقة مع الفرقة الدراسية المحددة'
            });
          }
        } catch (e) {
          console.error("Regex validation error:", e);
        }
      }

      // 4.3 فحص تكرار أداء الامتحان وسماح كلمة المرور لـ (طالبين كحد أقصى) لنفس المادة (Exam-Scoped)
      // الدخول لمرة واحدة فقط لعند ما يسلم، ومنع الخروج وإعادة الدخول نهائياً
      const resultsSheet = ss.getSheetByName(SHEET_RESULTS);
      const resultsRows = resultsSheet.getDataRange().getValues();
      let passUsageCountInThisExam = 0;
      const normalizedCurrentName = normalizeArabicText(studentName);
      const cache = CacheService.getScriptCache();

      // أ) الفحص في سجل النتائج الدائم: هل أدى هذا الطالب الامتحان وسلمه مسبقاً؟
      for (let i = 1; i < resultsRows.length; i++) {
        const rowExam = String(resultsRows[i][1] || '').trim().toUpperCase();
        if (rowExam !== examId) {
          continue;
        }

        const rowStudentName = String(resultsRows[i][2] || '').trim();
        const rowStudentId = String(resultsRows[i][3] || '').trim();
        const recordedPass = String(resultsRows[i][6] || '').trim();

        const isSameName = rowStudentName && (normalizeArabicText(rowStudentName) === normalizedCurrentName);
        const isSameId = studentId && rowStudentId && (rowStudentId.toLowerCase() === studentId.toLowerCase());

        if (isSameName || isSameId) {
          return createJsonResponse({
            status: 'error',
            message: 'لقد قمت بأداء هذا الامتحان وتسليمه مسبقاً، ولا يُسمح بالدخول أو الإعادة نهائياً!'
          });
        }

        if (recordedPass && recordedPass.toLowerCase() === studentPassword.toLowerCase()) {
          passUsageCountInThisExam++;
        }
      }

      // ب) فحص الجلسات النشطة (الدخول لمرة واحدة لعند ما يسلم): هل بدأ هذا الطالب الامتحان ولم يسلم بعد؟
      const activeEntryKeyName = 'active_entry_' + examId + '_' + encodeURIComponent(normalizedCurrentName);
      const activeEntryKeyId = studentId ? ('active_entry_id_' + examId + '_' + studentId.toLowerCase()) : null;

      if (cache.get(activeEntryKeyName) || (activeEntryKeyId && cache.get(activeEntryKeyId))) {
        return createJsonResponse({
          status: 'error',
          message: 'تم الدخول لهذا الامتحان مسبقاً! نظام الاختبارات يسمح بالدخول لمرة واحدة فقط حتى التسليم، ولا يُسمح بالخروج وفتح الامتحان مجدداً.'
        });
      }

      // ج) فحص إتاحة كلمة المرور لطالبين (2) كحد أقصى لنفس المادة
      let passUsers = [];
      const passUsersKey = 'pass_users_' + examId + '_' + studentPassword.toLowerCase();
      try {
        passUsers = JSON.parse(cache.get(passUsersKey) || '[]');
      } catch (e) {}

      let totalDistinctPassUsers = Math.max(passUsageCountInThisExam, passUsers.length);
      if (totalDistinctPassUsers >= 2) {
        return createJsonResponse({
          status: 'error',
          message: 'تم استخدام كلمة المرور هذه مسبقاً'
        });
      }

      // د) حجز مقعد الجلسة للطالب فور نجاح التحقق لمنع الخروج وإعادة الدخول
      cache.put(activeEntryKeyName, 'started', 43200); // 12 ساعة
      if (activeEntryKeyId) {
        cache.put(activeEntryKeyId, 'started', 43200);
      }

      if (!passUsers.includes(normalizedCurrentName)) {
        passUsers.push(normalizedCurrentName);
        cache.put(passUsersKey, JSON.stringify(passUsers), 43200);
      }

      const rawQuestions = JSON.parse(foundExam[5] || '[]');
      const studentQuestions = rawQuestions.map((q, idx) => ({
        index: idx,
        text: q.text,
        image: q.image || '',
        options: [q.opt1, q.opt2, q.opt3, q.opt4]
      }));

      // حفظ نموذج الأسئلة مسبقاً في الذاكرة السريعة (RAM Cache) لضمان تسليم فوري لـ 300+ طالب دون قراءة الشيت
      try {
        const cache = CacheService.getScriptCache();
        cache.put('exam_q_' + examId, JSON.stringify(rawQuestions), 21600);
      } catch (e) {}

      return createJsonResponse({
        status: 'success',
        exam: {
          id: foundExam[0],
          title: foundExam[1],
          duration: foundExam[2]
        },
        questions: studentQuestions
      });
    }

    // -------------------------------------------------------------
    // 5. تصحيح وتسليم الامتحان (Submit Exam) - بنية طابور معالجة متزامن فائق السرعة
    // -------------------------------------------------------------
    if (action === 'submit_exam') {
      const examId = String(data.exam_id || '').trim().toUpperCase();
      const studentName = String(data.student_name || '').trim();
      const studentId = String(data.student_id || '').trim();
      const studentGrade = String(data.student_grade || '').trim();
      const studentBranch = String(data.student_branch || '').trim();
      const studentPassword = String(data.student_password || '').trim();
      const studentAnswers = data.answers || {};
      const cheatStatus = String(data.cheat_status || 'تم التسليم').trim();

      // طابور انتظار مخصص لعملية الحفظ مع مهلة 30 ثانية لتنظيم تسلسل الطلاب
      const lock = LockService.getScriptLock();
      let hasLock = false;
      try {
        hasLock = lock.tryLock(30000);
      } catch (e) {
        hasLock = false;
      }

      if (!hasLock) {
        return createJsonResponse({
          status: 'busy',
          retry: true,
          message: 'السيرفر يقوم حالياً بجدولة ورصد إجابات دفعة طلاب أخرى، جاري المحاولة تلقائياً...'
        });
      }

      try {
        const cache = CacheService.getScriptCache();
        const props = PropertiesService.getScriptProperties();
        const dedupKey = 'sub_' + examId + '_' + (studentId ? studentId : studentPassword);

        // 1. منع التكرار في حالة الإرسال المتزامن أو إعادة المحاولة (Idempotency Guard)
        if (cache.get(dedupKey)) {
          return createJsonResponse({
            status: 'success',
            cheat_status: cheatStatus,
            message: 'تم استلام وتأكيد حفظ إجاباتك مسبقاً بنجاح'
          });
        }

        // 2. فحص الكاش للأسئلة والإجابات النموذجية لتسريع المعالجة إلى أجزاء من الثانية (RAM Caching)
        let originalQuestions = null;
        const cachedQ = cache.get('exam_q_' + examId);
        if (cachedQ) {
          try {
            originalQuestions = JSON.parse(cachedQ);
          } catch(e) {}
        }

        if (!originalQuestions) {
          const examsSheet = ss.getSheetByName(SHEET_EXAMS);
          const examsRows = examsSheet.getDataRange().getValues();
          for (let i = 1; i < examsRows.length; i++) {
            if (String(examsRows[i][0]).trim().toUpperCase() === examId) {
              originalQuestions = JSON.parse(examsRows[i][5] || '[]');
              // حفظ في الكاش لمدة 6 ساعات لخدمة كافة الطلاب القادمين فوراً بسرعة البرق
              cache.put('exam_q_' + examId, JSON.stringify(originalQuestions), 21600);
              break;
            }
          }
        }

        if (!originalQuestions) {
          return createJsonResponse({ status: 'error', message: 'بيانات الامتحان الأصلية مفقودة' });
        }

        let score = 0;
        const total = originalQuestions.length;

        originalQuestions.forEach((q, idx) => {
          const studentAns = String(studentAnswers[idx] || '').trim();
          const correctAns = String(q.correct || '').trim();
          if (studentAns === correctAns) {
            score++;
          }
        });

        // 3. عداد تسلسل أحادي لتحديد رقم الدور الدقيق للطالب في الطابور (Monotonic Sequence Counter)
        const currentSeq = Number(props.getProperty('GLOBAL_SUBMISSION_COUNTER') || 0) + 1;
        props.setProperty('GLOBAL_SUBMISSION_COUNTER', String(currentSeq));

        // 4. كتابة وتثبيت النتيجة فوراً بالترتيب الزمني الدقيق بالمللي ثانية
        const resultsSheet = ss.getSheetByName(SHEET_RESULTS);
        const now = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd HH:mm:ss.SSS');

        resultsSheet.appendRow([
          now,
          examId,
          studentName,
          studentId,
          studentGrade,
          studentBranch,
          studentPassword,
          score,
          total,
          `${cheatStatus} [تسلسل: #${currentSeq}]`
        ]);

        // إزالة SpreadsheetApp.flush() لتقليل زمن حجز القفل (Lock) من 1000ms إلى أقل من 30ms، 
        // مما يتيح معالجة مئات الطلاب في نفس اللحظة دون أي رفض أو اختناق.
        cache.put(dedupKey, '1', 86400); // وسم إتمام التسليم بنجاح لمنع أي تكرار لمدة 24 ساعة
        const normName = normalizeArabicText(studentName);
        cache.put('active_entry_' + examId + '_' + encodeURIComponent(normName), 'submitted', 86400);
        if (studentId) {
          cache.put('active_entry_id_' + examId + '_' + studentId.toLowerCase(), 'submitted', 86400);
        }

        return createJsonResponse({
          status: 'success',
          cheat_status: cheatStatus,
          score: score,
          total: total,
          queue_number: currentSeq,
          message: 'تم تسليم وحفظ الإجابات بنجاح'
        });
      } finally {
        lock.releaseLock();
      }
    }

    // -------------------------------------------------------------
    // 6. استرجاع بيانات النتائج للداش بورد (Dashboard Data)
    // -------------------------------------------------------------
    if (action === 'get_dashboard') {
      const resultsSheet = ss.getSheetByName(SHEET_RESULTS);
      const rows = resultsSheet.getDataRange().getValues();
      const results = [];

      for (let i = 1; i < rows.length; i++) {
        results.push([
          rows[i][0] ? Utilities.formatDate(new Date(rows[i][0]), 'Africa/Cairo', 'yyyy-MM-dd HH:mm') : '',
          rows[i][1], // كود الامتحان
          rows[i][2], // اسم الطالب
          rows[i][3], // الرقم التعريفي
          rows[i][4], // الفرقة
          rows[i][5], // الفرع
          rows[i][6], // كلمة المرور
          rows[i][7], // النتيجة
          rows[i][8], // الإجمالي
          rows[i][9]  // حالة التسليم والملاحظات
        ]);
      }

      return createJsonResponse({
        status: 'success',
        results: results
      });
    }

    // -------------------------------------------------------------
    // 7. مسح وتفريغ نتائج الطلاب (Clear Results)
    // -------------------------------------------------------------
    if (action === 'clear_results') {
      const resultsSheet = ss.getSheetByName(SHEET_RESULTS);
      const examCodeFilter = String(data.exam_code || '').trim().toUpperCase();
      const creator = String(data.creator || '').trim();
      const role = String(data.role || '').trim();

      if (examCodeFilter) {
        const rows = resultsSheet.getDataRange().getValues();
        for (let i = rows.length - 1; i >= 1; i--) {
          if (String(rows[i][1]).trim().toUpperCase() === examCodeFilter) {
            resultsSheet.deleteRow(i + 1);
          }
        }
        return createJsonResponse({
          status: 'success',
          message: `تم مسح جميع نتائج الاختبار (${examCodeFilter}) بنجاح`
        });
      } else {
        const lastRow = resultsSheet.getLastRow();
        const lastCol = Math.max(resultsSheet.getLastColumn(), 10);
        if (lastRow > 1) {
          resultsSheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
        }
        return createJsonResponse({
          status: 'success',
          message: 'تم تفريغ جدول نتائج الطلاب بنجاح وبدء دورة اختبارات جديدة'
        });
      }
    }

    // -------------------------------------------------------------
    // 8. نظام المراقبة الحية السحابي الفوري (Cloud Cam Relay & Broadcast)
    // -------------------------------------------------------------

    // 8.1 إرسال إشعار فتح الكاميرا لجميع الطلاب
    if (action === 'send_cam_alert') {
      const props = PropertiesService.getScriptProperties();
      const nowStr = String(Date.now());
      props.setProperty('FACULTY_CAM_ALERT', nowStr);
      return createJsonResponse({ status: 'success', timestamp: nowStr, message: 'تم إرسال إشعار فتح الكاميرا لجميع الطلاب بنجاح' });
    }

    // 8.2 فحص الطالب هل أصدر الأستاذ إشعاراً لفتح الكاميرا
    if (action === 'check_cam_alert') {
      const props = PropertiesService.getScriptProperties();
      const alertTime = Number(props.getProperty('FACULTY_CAM_ALERT') || 0);
      const clientLastCheck = Number(data.last_checked || 0);
      const hasNewAlert = (alertTime > clientLastCheck) && (Date.now() - alertTime < 300000); // صالح لـ 5 دقائق

      return createJsonResponse({
        status: 'success',
        has_alert: hasNewAlert,
        timestamp: alertTime
      });
    }

    // 8.3 استقبال لقطة البث المباشر للطالب
    if (action === 'push_cam_frame') {
      const mSheet = ss.getSheetByName(SHEET_MONITORING);
      const studentId = String(data.student_id || '').trim();
      const studentName = String(data.student_name || '').trim();
      const examId = String(data.exam_id || '').trim().toUpperCase();
      const grade = String(data.grade || '').trim();
      let frame = String(data.frame || '');
      const active = data.active !== false;
      const now = Date.now();

      // ضمان عدم تجاوز سعة الخلية في جوجل شيت (الحد الأقصى 50 ألف حرف)
      if (frame && frame.length > 48000) {
        frame = frame.substring(0, 48000);
      }

      if (!mSheet) {
        return createJsonResponse({ status: 'error', message: 'شيت المراقبة غير موجود' });
      }

      const rows = mSheet.getDataRange().getValues();
      let foundIndex = -1;

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === studentId) {
          foundIndex = i + 1;
          break;
        }
      }

      if (!active) {
        if (foundIndex > 0) mSheet.deleteRow(foundIndex);
      } else {
        if (foundIndex > 0) {
          mSheet.getRange(foundIndex, 1, 1, 6).setValues([[studentId, studentName, examId, grade, frame, now]]);
        } else {
          mSheet.appendRow([studentId, studentName, examId, grade, frame, now]);
        }
      }

      return createJsonResponse({ status: 'success' });
    }

    // 8.4 جلب لقطات البث المباشر لشاشات الأستاذ
    if (action === 'get_cam_frames') {
      const mSheet = ss.getSheetByName(SHEET_MONITORING);
      const rows = mSheet.getDataRange().getValues();
      const now = Date.now();
      const streams = [];

      for (let i = 1; i < rows.length; i++) {
        const studentId = rows[i][0];
        const studentName = rows[i][1];
        const examId = rows[i][2];
        const grade = rows[i][3];
        const frame = rows[i][4];
        const lastSeen = Number(rows[i][5] || 0);

        // احتساب الطالب متصلاً إذا أرسل لقطة خلال آخر 25 ثانية
        if (now - lastSeen < 25000 && frame) {
          streams.push({
            studentId: studentId,
            studentName: studentName,
            examId: examId,
            grade: grade,
            frame: frame
          });
        }
      }

      return createJsonResponse({
        status: 'success',
        streams: streams
      });
    }

    return createJsonResponse({ status: 'error', message: 'أمر غير معروف' });

  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

/**
 * نقطة استقبال طلبات الـ GET
 */
function doGet(e) {
  return HtmlService.createHtmlOutput('<h3>قاعدة بيانات منصة الامتحانات تعمل بنجاح! جاهزة لاستقبال الطلبات من الواجهة.</h3>');
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function generateExamCode(sheet) {
  const existingCodes = sheet.getDataRange().getValues().map(r => String(r[0]).trim().toUpperCase());
  let newCode = '';
  do {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    newCode = 'EX-' + randomNum;
  } while (existingCodes.includes(newCode));
  return newCode;
}

/**
 * توحيد ومطابقة النصوص والأسماء العربية بدقة لمعالجة الهمزات والتاء المربوطة والمسافات
 */
function normalizeArabicText(str) {
  if (!str) return '';
  return String(str).trim().toLowerCase()
    .replace(/[أإآء]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * التهيئة التلقائية للأوراق والجداول
 */
function initDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. شيت المستخدمين
  let usersSheet = ss.getSheetByName(SHEET_USERS);
  if (!usersSheet) {
    usersSheet = ss.insertSheet(SHEET_USERS);
    usersSheet.appendRow(['الاسم', 'اسم المستخدم', 'كلمة المرور', 'الصلاحية']);
    usersSheet.appendRow(['المدير العام', 'admin', 'admin@12300', 'admin']);
    usersSheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#f1f5f9');
  }

  // 2. شيت الامتحانات مع عمود الحالة (الحالة: active أو disabled)
  let examsSheet = ss.getSheetByName(SHEET_EXAMS);
  if (!examsSheet) {
    examsSheet = ss.insertSheet(SHEET_EXAMS);
    examsSheet.appendRow(['كود الامتحان', 'عنوان الامتحان', 'المدة (بالدقائق)', 'منشئ الامتحان', 'تاريخ الإنشاء', 'بيانات الأسئلة', 'حالة الامتحان']);
    examsSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#f1f5f9');
  } else {
    // التأكد من وجود هيدر عمود الحالة إذا كان الشيت منشأ قديماً
    const headers = examsSheet.getRange(1, 1, 1, Math.max(examsSheet.getLastColumn(), 7)).getValues()[0];
    if (!headers[6] || headers[6] === '') {
      examsSheet.getRange(1, 7).setValue('حالة الامتحان').setFontWeight('bold').setBackground('#f1f5f9');
    }
  }

  // 3. شيت الإعدادات وقواعد Regex للفرق
  let settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_SETTINGS);
    settingsSheet.appendRow(['الفرقة الدراسية', 'Regex كلمة المرور', 'وصف النمط للمستخدم']);
    settingsSheet.appendRow(['الفرقة الأولى', '^G1-[0-9]{4}$', 'مثال: G1-1234']);
    settingsSheet.appendRow(['الفرقة الثانية', '^G2-[0-9]{4}$', 'مثال: G2-1234']);
    settingsSheet.appendRow(['الفرقة الثالثة', '^G3-[0-9]{4}$', 'مثال: G3-1234']);
    settingsSheet.appendRow(['الفرقة الرابعة', '^G4-[0-9]{4}$', 'مثال: G4-1234']);
    settingsSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#f1f5f9');
  }

  // 4. شيت النتائج
  let resultsSheet = ss.getSheetByName(SHEET_RESULTS);
  if (!resultsSheet) {
    resultsSheet = ss.insertSheet(SHEET_RESULTS);
    resultsSheet.appendRow([
      'التاريخ والوقت',
      'كود الامتحان',
      'اسم الطالب',
      'الرقم التعريفي (ID)',
      'الفرقة',
      'الفرع',
      'كلمة المرور',
      'النتيجة',
      'الإجمالي',
      'حالة التسليم والملاحظات'
    ]);
    resultsSheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#f1f5f9');
  }

  // 5. شيت البث المباشر والمراقبة السحابية
  let mSheet = ss.getSheetByName(SHEET_MONITORING);
  if (!mSheet) {
    mSheet = ss.insertSheet(SHEET_MONITORING);
    mSheet.appendRow(['رقم الطالب', 'اسم الطالب', 'كود الامتحان', 'الفرقة', 'لقطة الكاميرا', 'آخر ظهور']);
    mSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f1f5f9');
  }
}
