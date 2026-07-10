import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'th'

const dict = {
  en: {
    'nav.goals': 'Goals',
    'nav.today': 'Today',
    'nav.week': 'This Week',
    'nav.logout': 'Log out',
    'banner.demo': "You're viewing a demo — sign up to save your own goals",
    'banner.signup': 'Sign up',

    'login.tagline': 'Sign in to tend your goals',
    'login.taglineRegister': 'Create a new account',
    'login.email': 'Email',
    'login.password': 'Password (min 8 characters)',
    'login.signin': 'Sign in',
    'login.signup': 'Sign up',
    'login.working': 'Working…',
    'login.demo': '✨ Try Demo (no signup)',
    'login.or': 'or',
    'login.toSignup': 'No account? Sign up',
    'login.toSignin': 'Have an account? Sign in',
    'login.error': 'Something went wrong',

    'common.loading': 'Loading…',
    'common.loadFailed': 'Failed to load:',
    'common.add': 'Add',
    'common.remove': 'Remove',
    'common.cancel': 'Cancel',
    'common.save': 'Save',

    'type.rollup': 'Rolls up from children',
    'type.stages': 'Stage checklist',
    'type.numeric': 'Numeric target',
    'type.checklist': 'Child checklist',
    'type.manual': 'Manual %',
    'type.daily': 'Daily habit',
    'type.weekly': 'Weekly commitment',

    'dash.today': 'Today',
    'dash.allDone': 'All done for today! Your bonsai is thriving 🌱',
    'dash.noHabits': 'No daily habits yet — add a goal with type "Daily habit" to build your routine.',
    'dash.streak': 'Current streak',
    'dash.thisWeek': 'This Week',
    'dash.noWeekly': 'No active weekly commitments.',
    'dash.yourGoals': 'Your Goals',
    'dash.addGoal': 'Add a big goal…',
    'dash.noGoals': 'No goals yet — add your first one above.',
    'dash.consistency': 'Consistency',
    'dash.archived': 'Archived goals',
    'dash.restore': 'Restore',

    'week.title': 'This Week',
    'week.none': 'No active weekly goals (progressType = weekly).',
    'week.pass': '✓ Pass',
    'week.fail': '✗ Fail',
    'week.noAttempts': 'no attempts yet',
    'week.last4': 'Last 4 weeks',

    'today.title': 'Today',
    'today.none': 'No habits yet (create a goal with progressType = daily).',

    'heatmap.caption': 'Darker days = more habits completed · solid green = all done',
    'heatmap.empty': 'The heatmap appears once you have daily habits.',

    'detail.back': '← Back',
    'detail.addSubgoal': 'Add subgoal',
    'detail.ai': 'Break down with AI',
    'detail.aiBusy': 'Breaking down…',
    'detail.aiContext': 'Optional context for the AI (constraints, background, preferences)…',
    'detail.aiGo': 'Break down',
    'detail.needsKey': 'AI breakdown needs an LLM API key. Bring your own key (Anthropic, OpenAI, or Gemini) — it takes a minute to set up.',
    'detail.openSettings': 'Open Settings',
    'detail.addUnder': 'Add a subgoal under',
    'detail.deleteConfirm': 'Delete this goal and its whole subtree?',
    'detail.deleteOneConfirm': 'and its subtree — delete?',
    'detail.hint': 'Drag nodes to arrange (saved automatically) · Click a node to edit its progress',
    'detail.rename': 'Rename',
    'detail.archive': 'Archive',
    'detail.archiveConfirm': 'Archive this goal? It disappears from views but can be restored from the dashboard.',
    'detail.notFound': 'Goal not found',

    'editor.addStep': 'Add a step…',
    'editor.subgoalTitle': 'Subgoal title…',
    'editor.done': 'Mark as done',
    'editor.checklistDone': 'Completed (checklist parents count children by done status)',

    'settings.title': 'Settings',
    'settings.aiTitle': 'AI provider (bring your own key)',
    'settings.aiDesc': '"Break down with AI" uses your own LLM API key. The key is validated, encrypted at rest, and never shown again — only its last 4 characters.',
    'settings.noKey': 'No key configured yet — AI breakdown is disabled until you add one.',
    'settings.keyPlaceholder': 'Paste your API key…',
    'settings.testSave': 'Test & Save',
    'settings.testing': 'Testing key…',
    'settings.removeKeyConfirm': 'Remove your API key?',
    'settings.accountTitle': 'Account',
    'settings.currentPassword': 'Current password',
    'settings.newPassword': 'New password (min 8 characters)',
    'settings.changePassword': 'Change password',
    'settings.passwordChanged': 'Password changed',
    'settings.deleteAccount': 'Delete account',
    'settings.deleteConfirm': 'Delete your account and ALL data? This cannot be undone.',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
  },
  th: {
    'nav.goals': 'เป้าหมาย',
    'nav.today': 'วันนี้',
    'nav.week': 'สัปดาห์นี้',
    'nav.logout': 'ออกจากระบบ',
    'banner.demo': 'คุณกำลังดูโหมดตัวอย่าง — สมัครสมาชิกเพื่อเก็บเป้าหมายของคุณเอง',
    'banner.signup': 'สมัครสมาชิก',

    'login.tagline': 'เข้าสู่ระบบเพื่อดูแลเป้าหมายของคุณ',
    'login.taglineRegister': 'สร้างบัญชีใหม่',
    'login.email': 'อีเมล',
    'login.password': 'รหัสผ่าน (อย่างน้อย 8 ตัว)',
    'login.signin': 'เข้าสู่ระบบ',
    'login.signup': 'สมัครสมาชิก',
    'login.working': 'กำลังดำเนินการ…',
    'login.demo': '✨ ลองเดโม (ไม่ต้องสมัคร)',
    'login.or': 'หรือ',
    'login.toSignup': 'ยังไม่มีบัญชี? สมัครสมาชิก',
    'login.toSignin': 'มีบัญชีแล้ว? เข้าสู่ระบบ',
    'login.error': 'เกิดข้อผิดพลาด',

    'common.loading': 'กำลังโหลด…',
    'common.loadFailed': 'โหลดไม่สำเร็จ:',
    'common.add': 'เพิ่ม',
    'common.remove': 'ลบ',
    'common.cancel': 'ยกเลิก',
    'common.save': 'บันทึก',

    'type.rollup': 'เฉลี่ยจากเป้าย่อย',
    'type.stages': 'เป็นขั้นตอน',
    'type.numeric': 'ตัวเลขสะสม',
    'type.checklist': 'เช็คลิสต์',
    'type.manual': 'กรอกเอง',
    'type.daily': 'ทำทุกวัน',
    'type.weekly': 'ทำรายสัปดาห์',

    'dash.today': 'วันนี้',
    'dash.allDone': 'วันนี้ครบแล้ว! บอนไซของคุณกำลังงอกงาม 🌱',
    'dash.noHabits': 'ยังไม่มี habit รายวัน — เพิ่มเป้าหมายชนิด "ทำทุกวัน" เพื่อเริ่มสร้างกิจวัตร',
    'dash.streak': 'สตรีคปัจจุบัน',
    'dash.thisWeek': 'สัปดาห์นี้',
    'dash.noWeekly': 'ไม่มีเป้ารายสัปดาห์ที่กำลังทำอยู่',
    'dash.yourGoals': 'เป้าหมายของคุณ',
    'dash.addGoal': 'เพิ่มเป้าหมายใหญ่…',
    'dash.noGoals': 'ยังไม่มีเป้าหมาย เริ่มเพิ่มเป้าแรกด้านบนได้เลย',
    'dash.consistency': 'ความสม่ำเสมอ',
    'dash.archived': 'เป้าหมายที่เก็บเข้าคลัง',
    'dash.restore': 'กู้คืน',

    'week.title': 'สัปดาห์นี้',
    'week.none': 'ไม่มีเป้ารายสัปดาห์ที่ active',
    'week.pass': '✓ ผ่าน',
    'week.fail': '✗ ไม่ผ่าน',
    'week.noAttempts': 'ยังไม่มีบันทึก',
    'week.last4': '4 สัปดาห์ล่าสุด',

    'today.title': 'วันนี้',
    'today.none': 'ยังไม่มี habit (สร้างเป้าชนิดทำทุกวัน)',

    'heatmap.caption': 'สีเข้ม = ทำ habit ได้มากวันนั้น · เขียวทึบ = ครบทุกตัว',
    'heatmap.empty': 'Heatmap จะแสดงเมื่อมี habit รายวัน',

    'detail.back': '← กลับ',
    'detail.addSubgoal': 'เพิ่มเป้าย่อย',
    'detail.ai': 'แตกเป้าด้วย AI',
    'detail.aiBusy': 'กำลังแตกเป้า…',
    'detail.aiContext': 'บริบทเพิ่มเติมสำหรับ AI (ข้อจำกัด พื้นฐาน ความชอบ)…',
    'detail.aiGo': 'แตกเป้า',
    'detail.needsKey': 'การแตกเป้าด้วย AI ต้องใช้ API key ของคุณเอง (Anthropic, OpenAI หรือ Gemini) — ตั้งค่าแป๊บเดียวเสร็จ',
    'detail.openSettings': 'เปิดหน้าตั้งค่า',
    'detail.addUnder': 'เพิ่มเป้าย่อยใต้',
    'detail.deleteConfirm': 'ลบเป้าหมายนี้และเป้าย่อยทั้งหมด?',
    'detail.deleteOneConfirm': 'และเป้าย่อยทั้งหมด — ลบเลยไหม?',
    'detail.hint': 'ลาก node เพื่อจัดตำแหน่ง (บันทึกอัตโนมัติ) · คลิก node เพื่อแก้ progress',
    'detail.rename': 'เปลี่ยนชื่อ',
    'detail.archive': 'เก็บเข้าคลัง',
    'detail.archiveConfirm': 'เก็บเป้านี้เข้าคลัง? มันจะหายจากทุกหน้าแต่กู้คืนได้จาก dashboard',
    'detail.notFound': 'ไม่พบเป้าหมายนี้',

    'editor.addStep': 'เพิ่มขั้นตอน…',
    'editor.subgoalTitle': 'ชื่อเป้าย่อย…',
    'editor.done': 'ทำเสร็จแล้ว',
    'editor.checklistDone': 'เสร็จแล้ว (เป้าแบบเช็คลิสต์นับจากสถานะ done ของลูก)',

    'settings.title': 'ตั้งค่า',
    'settings.aiTitle': 'AI provider (ใช้ key ของคุณเอง)',
    'settings.aiDesc': 'ปุ่ม "แตกเป้าด้วย AI" ใช้ API key ของคุณเอง — key จะถูกตรวจสอบ เข้ารหัสก่อนเก็บ และไม่แสดงอีก (เห็นแค่ 4 ตัวท้าย)',
    'settings.noKey': 'ยังไม่ได้ตั้ง key — ปุ่ม AI จะใช้ไม่ได้จนกว่าจะเพิ่ม',
    'settings.keyPlaceholder': 'วาง API key ของคุณ…',
    'settings.testSave': 'ทดสอบและบันทึก',
    'settings.testing': 'กำลังทดสอบ key…',
    'settings.removeKeyConfirm': 'ลบ API key ของคุณ?',
    'settings.accountTitle': 'บัญชี',
    'settings.currentPassword': 'รหัสผ่านปัจจุบัน',
    'settings.newPassword': 'รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)',
    'settings.changePassword': 'เปลี่ยนรหัสผ่าน',
    'settings.passwordChanged': 'เปลี่ยนรหัสผ่านแล้ว',
    'settings.deleteAccount': 'ลบบัญชี',
    'settings.deleteConfirm': 'ลบบัญชีและข้อมูลทั้งหมด? ย้อนกลับไม่ได้นะ',
    'settings.language': 'ภาษา',
    'settings.theme': 'ธีม',
  },
} as const

export type I18nKey = keyof typeof dict.en

interface I18nContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: I18nKey) => string
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  t: k => dict.en[k],
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    (localStorage.getItem('bonsai_lang') as Lang) === 'th' ? 'th' : 'en')

  const setLang = (l: Lang) => {
    localStorage.setItem('bonsai_lang', l)
    setLangState(l)
  }

  const t = (key: I18nKey) => dict[lang][key] ?? dict.en[key]

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
