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
