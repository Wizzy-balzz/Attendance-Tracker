/* =====================================================================
   ATTENDKIT — ATTENDANCE TRACKER
   Vanilla JavaScript Application Logic
   Sections:
     1. State & Constants
     2. LocalStorage Helpers
     3. Utility Helpers (date, id, escaping)
     4. Toast Notifications
     5. Confirmation Modal
     6. Edit Student Modal
     7. Student CRUD Operations
     8. Attendance Operations
     9. Rendering (table, stats, filters, search, sort)
    10. CSV Export / Import
    11. Theme Toggle
    12. Sidebar Toggle (mobile)
    13. Live Date & Time
    14. Event Listeners / Init
   ===================================================================== */

/* --------------------- 1. STATE & CONSTANTS --------------------- */

const STORAGE_KEY = "attendkit_students";
const THEME_KEY = "attendkit_theme";

// Application state held in memory, synced with localStorage
let students = [];          // array of student objects
let currentFilter = "all";  // 'all' | 'present' | 'absent'
let searchTerm = "";        // current search query
let sortAscending = true;   // toggles A-Z / Z-A
let pendingDeleteId = null; // id awaiting confirmation for deletion
let pendingModalAction = null; // callback executed if confirm modal is accepted
let editingStudentId = null; // id of student currently being edited

/* --------------------- 2. LOCALSTORAGE HELPERS --------------------- */

/**
 * Persists the current `students` array to localStorage.
 */
const saveStudents = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
  } catch (err) {
    console.error("Failed to save students:", err);
    showToast("Could not save data to local storage.", "error");
  }
};

/**
 * Loads students from localStorage into memory. Falls back to an
 * empty array if nothing is stored or the data is corrupted.
 */
const loadStudents = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    students = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load students:", err);
    students = [];
  }
};

/* --------------------- 3. UTILITY HELPERS --------------------- */

/** Generates a reasonably unique id for a new student. */
const generateId = () => `stu_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

/** Returns today's date key in YYYY-MM-DD format (used for history lookups). */
const todayKey = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/** Escapes HTML to prevent injection when rendering student names. */
const escapeHtml = (str) =>
  str.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

/** Returns initials (up to 2 letters) for a student's avatar bubble. */
const getInitials = (name) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Gets today's attendance status for a student ('present' | 'absent'). */
const getTodayStatus = (student) => student.history[todayKey()] || "absent";

/** Calculates the overall attendance percentage for a student across all recorded days. */
const getAttendancePercent = (student) => {
  const entries = Object.values(student.history);
  if (entries.length === 0) return 0;
  const presentDays = entries.filter((status) => status === "present").length;
  return Math.round((presentDays / entries.length) * 100);
};

/* --------------------- 4. TOAST NOTIFICATIONS --------------------- */

const TOAST_ICONS = {
  success: "fa-solid fa-circle-check",
  error: "fa-solid fa-circle-exclamation",
  info: "fa-solid fa-circle-info",
  warning: "fa-solid fa-triangle-exclamation",
};

/**
 * Displays a temporary toast notification.
 * @param {string} message - text to display
 * @param {'success'|'error'|'info'|'warning'} type - toast style
 */
const showToast = (message, type = "info") => {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="${TOAST_ICONS[type] || TOAST_ICONS.info}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  // Auto-dismiss after 3 seconds with a fade-out animation
  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

/* --------------------- 5. CONFIRMATION MODAL --------------------- */

const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");

/**
 * Opens the confirmation modal with a custom title/message and stores
 * the action to run if the user confirms.
 */
const openConfirmModal = (title, message, onConfirm) => {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  pendingModalAction = onConfirm;
  modalBackdrop.classList.add("show");
};

const closeConfirmModal = () => {
  modalBackdrop.classList.remove("show");
  pendingModalAction = null;
  pendingDeleteId = null;
};

document.getElementById("modalCancelBtn").addEventListener("click", closeConfirmModal);
document.getElementById("modalConfirmBtn").addEventListener("click", () => {
  if (typeof pendingModalAction === "function") pendingModalAction();
  closeConfirmModal();
});
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeConfirmModal();
});

/* --------------------- 6. EDIT STUDENT MODAL --------------------- */

const editModalBackdrop = document.getElementById("editModalBackdrop");
const editStudentInput = document.getElementById("editStudentInput");

const openEditModal = (student) => {
  editingStudentId = student.id;
  editStudentInput.value = student.name;
  editModalBackdrop.classList.add("show");
  setTimeout(() => editStudentInput.focus(), 100);
};

const closeEditModal = () => {
  editModalBackdrop.classList.remove("show");
  editingStudentId = null;
};

document.getElementById("editCancelBtn").addEventListener("click", closeEditModal);
editModalBackdrop.addEventListener("click", (e) => {
  if (e.target === editModalBackdrop) closeEditModal();
});

document.getElementById("editSaveBtn").addEventListener("click", () => {
  const newName = editStudentInput.value.trim();

  if (!newName) {
    showToast("Student name cannot be empty.", "error");
    return;
  }

  const duplicate = students.some(
    (s) => s.id !== editingStudentId && s.name.toLowerCase() === newName.toLowerCase()
  );
  if (duplicate) {
    showToast("Another student already has this name.", "error");
    return;
  }

  const student = students.find((s) => s.id === editingStudentId);
  if (student) {
    student.name = newName;
    saveStudents();
    renderAll();
    showToast("Student name updated successfully.", "success");
  }
  closeEditModal();
});

/* --------------------- 7. STUDENT CRUD OPERATIONS --------------------- */

/** Adds a new student after validating for empty input and duplicates. */
const addStudent = (name) => {
  const trimmedName = name.trim();

  if (!trimmedName) {
    showToast("Please enter a student name.", "error");
    return false;
  }

  const isDuplicate = students.some(
    (s) => s.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (isDuplicate) {
    showToast(`"${trimmedName}" already exists in the list.`, "error");
    return false;
  }

  students.push({
    id: generateId(),
    name: trimmedName,
    history: {}, // { "YYYY-MM-DD": "present" | "absent" }
  });

  saveStudents();
  renderAll();
  showToast(`${trimmedName} added successfully.`, "success");
  return true;
};

/** Removes a student permanently by id. */
const deleteStudent = (id) => {
  const student = students.find((s) => s.id === id);
  if (!student) return;

  students = students.filter((s) => s.id !== id);
  saveStudents();
  renderAll();
  showToast(`${student.name} was removed.`, "success");
};

/* --------------------- 8. ATTENDANCE OPERATIONS --------------------- */

/** Toggles a student's status for today between present and absent. */
const toggleAttendance = (id) => {
  const student = students.find((s) => s.id === id);
  if (!student) return;

  const current = getTodayStatus(student);
  student.history[todayKey()] = current === "present" ? "absent" : "present";

  saveStudents();
  renderAll();
};

/** Clears today's attendance mark for every student (keeps history of past days). */
const resetTodayAttendance = () => {
  const today = todayKey();
  students.forEach((s) => delete s.history[today]);
  saveStudents();
  renderAll();
  showToast("Today's attendance has been reset.", "success");
};

/** Wipes every student and all attendance history permanently. */
const resetDatabase = () => {
  students = [];
  saveStudents();
  renderAll();
  showToast("Database has been reset.", "success");
};

/* --------------------- 9. RENDERING --------------------- */

const tableBody = document.getElementById("studentTableBody");
const emptyState = document.getElementById("emptyState");
const activeFilterChip = document.getElementById("activeFilterChip");

/** Returns the filtered + searched + sorted list ready for display. */
const getVisibleStudents = () => {
  let list = [...students];

  // Apply search filter
  if (searchTerm) {
    list = list.filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }

  // Apply status filter
  if (currentFilter === "present") {
    list = list.filter((s) => getTodayStatus(s) === "present");
  } else if (currentFilter === "absent") {
    list = list.filter((s) => getTodayStatus(s) === "absent");
  }

  // Apply alphabetical sort
  list.sort((a, b) =>
    sortAscending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
  );

  return list;
};

/** Renders the student table rows based on current filter/search/sort state. */
const renderTable = () => {
  const visible = getVisibleStudents();
  tableBody.innerHTML = "";

  emptyState.classList.toggle("show", visible.length === 0);

  visible.forEach((student, index) => {
    const status = getTodayStatus(student);
    const percent = getAttendancePercent(student);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="student-name-cell">
        <span class="student-avatar">${getInitials(student.name)}</span>${escapeHtml(student.name)}
      </td>
      <td>
        <button class="status-badge ${status}" data-toggle-id="${student.id}" title="Click to toggle attendance">
          <i class="fa-solid ${status === "present" ? "fa-circle-check" : "fa-circle-xmark"}"></i>
          ${status === "present" ? "Present" : "Absent"}
        </button>
      </td>
      <td>
        <div class="percent-cell">
          <div class="percent-track"><div class="percent-fill" style="width:${percent}%"></div></div>
          <span class="percent-text">${percent}%</span>
        </div>
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn edit" data-edit-id="${student.id}" title="Edit name"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn delete" data-delete-id="${student.id}" title="Delete student"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;

    tableBody.appendChild(row);
  });

  const chipLabels = { all: "All Students", present: "Present", absent: "Absent" };
  activeFilterChip.textContent = `${chipLabels[currentFilter]} (${visible.length})`;
};

/** Recomputes and displays dashboard statistics. */
const renderStats = () => {
  const total = students.length;
  const presentToday = students.filter((s) => getTodayStatus(s) === "present").length;
  const absentToday = total - presentToday;
  const percentage = total === 0 ? 0 : Math.round((presentToday / total) * 100);

  document.getElementById("totalStudents").textContent = total;
  document.getElementById("presentCount").textContent = presentToday;
  document.getElementById("absentCount").textContent = absentToday;
  document.getElementById("attendancePercent").textContent = `${percentage}%`;
};

/** Master render function: refreshes table + stats together. */
const renderAll = () => {
  renderTable();
  renderStats();
};

/* ---------- Delegated event listeners for dynamically rendered rows ---------- */

tableBody.addEventListener("click", (e) => {
  const toggleBtn = e.target.closest("[data-toggle-id]");
  const editBtn = e.target.closest("[data-edit-id]");
  const deleteBtn = e.target.closest("[data-delete-id]");

  if (toggleBtn) {
    toggleAttendance(toggleBtn.dataset.toggleId);
  } else if (editBtn) {
    const student = students.find((s) => s.id === editBtn.dataset.editId);
    if (student) openEditModal(student);
  } else if (deleteBtn) {
    const student = students.find((s) => s.id === deleteBtn.dataset.deleteId);
    if (student) {
      openConfirmModal(
        "Delete Student?",
        `This will permanently remove "${student.name}" and their attendance history.`,
        () => deleteStudent(student.id)
      );
    }
  }
});

/* --------------------- 10. CSV EXPORT / IMPORT --------------------- */

/** Exports current attendance snapshot (today) as a downloadable CSV file. */
const exportToCsv = () => {
  if (students.length === 0) {
    showToast("There are no students to export.", "warning");
    return;
  }

  const rows = [["Name", "Status (Today)", "Attendance %"]];
  students.forEach((s) => {
    rows.push([s.name, getTodayStatus(s), `${getAttendancePercent(s)}%`]);
  });

  const csvContent = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance_${todayKey()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast("Attendance exported as CSV.", "success");
};

/** Parses an uploaded CSV file and adds any new student names found in it. */
const importFromCsv = (file) => {
  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const text = event.target.result;
      const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

      let addedCount = 0;
      let skippedCount = 0;

      lines.forEach((line, index) => {
        // Take the first column as the name; skip a possible header row
        const firstCell = line.split(",")[0].replace(/"/g, "").trim();
        if (!firstCell) return;
        if (index === 0 && firstCell.toLowerCase() === "name") return;

        const isDuplicate = students.some(
          (s) => s.name.toLowerCase() === firstCell.toLowerCase()
        );

        if (isDuplicate) {
          skippedCount++;
        } else {
          students.push({ id: generateId(), name: firstCell, history: {} });
          addedCount++;
        }
      });

      saveStudents();
      renderAll();
      showToast(`Imported ${addedCount} student(s), skipped ${skippedCount} duplicate(s).`, "success");
    } catch (err) {
      console.error("CSV import failed:", err);
      showToast("Could not read the CSV file. Please check its format.", "error");
    }
  };

  reader.onerror = () => showToast("Error reading the selected file.", "error");
  reader.readAsText(file);
};

/* --------------------- 11. THEME TOGGLE --------------------- */

const applyTheme = (theme) => {
  document.body.setAttribute("data-theme", theme);
  const icon = document.querySelector("#themeToggle i");
  icon.className = theme === "light" ? "fa-solid fa-sun" : "fa-solid fa-moon";
  localStorage.setItem(THEME_KEY, theme);
};

const initTheme = () => {
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(savedTheme);
};

document.getElementById("themeToggle").addEventListener("click", () => {
  const isLight = document.body.getAttribute("data-theme") === "light";
  applyTheme(isLight ? "dark" : "light");
});

/* --------------------- 12. SIDEBAR TOGGLE (MOBILE) --------------------- */

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

const openSidebar = () => {
  sidebar.classList.add("open");
  overlay.classList.add("show");
};

const closeSidebar = () => {
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
};

document.getElementById("hamburgerBtn").addEventListener("click", openSidebar);
overlay.addEventListener("click", closeSidebar);

/* --------------------- 13. LIVE DATE & TIME --------------------- */

const updateDateTime = () => {
  const now = new Date();

  const dateOptions = { weekday: "short", year: "numeric", month: "short", day: "numeric" };
  document.getElementById("currentDate").textContent = now.toLocaleDateString(undefined, dateOptions);
  document.getElementById("currentTime").textContent = now.toLocaleTimeString();
};

/* --------------------- 14. EVENT LISTENERS / INIT --------------------- */

// Add student form submission
document.getElementById("addStudentForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("newStudentInput");
  const success = addStudent(input.value);
  if (success) input.value = "";
});

// Live search
document.getElementById("searchInput").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderTable();
});

// Sort toggle button
document.getElementById("sortBtn").addEventListener("click", () => {
  sortAscending = !sortAscending;
  const icon = document.querySelector("#sortBtn i");
  icon.className = sortAscending ? "fa-solid fa-arrow-down-a-z" : "fa-solid fa-arrow-down-z-a";
  document.getElementById("sortBtn").innerHTML = `<i class="${icon.className}"></i> Sort ${sortAscending ? "A–Z" : "Z–A"}`;
  renderTable();
});

// Sidebar filter navigation (All / Present / Absent)
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderTable();
    closeSidebar(); // auto-close on mobile after selecting
  });
});

// CSV export / import
document.getElementById("exportCsvBtn").addEventListener("click", exportToCsv);
document.getElementById("importCsvBtn").addEventListener("click", () => {
  document.getElementById("importCsvInput").click();
});
document.getElementById("importCsvInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importFromCsv(file);
  e.target.value = ""; // allow re-importing the same file later
});

// Reset today's attendance (with confirmation)
document.getElementById("resetAttendanceBtn").addEventListener("click", () => {
  openConfirmModal(
    "Reset Today's Attendance?",
    "This clears today's present/absent marks for all students but keeps their names and history.",
    resetTodayAttendance
  );
});

// Reset entire database (with confirmation)
document.getElementById("resetDbBtn").addEventListener("click", () => {
  openConfirmModal(
    "Reset Entire Database?",
    "This permanently deletes ALL students and their attendance history. This cannot be undone.",
    resetDatabase
  );
});

/**
 * Application entry point: loads saved data, sets up the UI, and
 * starts the live clock.
 */
const init = () => {
  loadStudents();
  initTheme();
  renderAll();
  updateDateTime();
  setInterval(updateDateTime, 1000);
};

document.addEventListener("DOMContentLoaded", init);/* =====================================================================
   ATTENDKIT — ATTENDANCE TRACKER
   Vanilla JavaScript Application Logic
   Sections:
     1. State & Constants
     2. LocalStorage Helpers
     3. Utility Helpers (date, id, escaping)
     4. Toast Notifications
     5. Confirmation Modal
     6. Edit Student Modal
     7. Student CRUD Operations
     8. Attendance Operations
     9. Rendering (table, stats, filters, search, sort)
    10. CSV Export / Import
    11. Theme Toggle
    12. Sidebar Toggle (mobile)
    13. Live Date & Time
    14. Event Listeners / Init
   ===================================================================== */

/* --------------------- 1. STATE & CONSTANTS --------------------- */

const STORAGE_KEY = "attendkit_students";
const THEME_KEY = "attendkit_theme";

// Application state held in memory, synced with localStorage
let students = [];          // array of student objects
let currentFilter = "all";  // 'all' | 'present' | 'absent'
let searchTerm = "";        // current search query
let sortAscending = true;   // toggles A-Z / Z-A
let pendingDeleteId = null; // id awaiting confirmation for deletion
let pendingModalAction = null; // callback executed if confirm modal is accepted
let editingStudentId = null; // id of student currently being edited

/* --------------------- 2. LOCALSTORAGE HELPERS --------------------- */

/**
 * Persists the current `students` array to localStorage.
 */
const saveStudents = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
  } catch (err) {
    console.error("Failed to save students:", err);
    showToast("Could not save data to local storage.", "error");
  }
};

/**
 * Loads students from localStorage into memory. Falls back to an
 * empty array if nothing is stored or the data is corrupted.
 */
const loadStudents = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    students = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load students:", err);
    students = [];
  }
};

/* --------------------- 3. UTILITY HELPERS --------------------- */

/** Generates a reasonably unique id for a new student. */
const generateId = () => `stu_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

/** Returns today's date key in YYYY-MM-DD format (used for history lookups). */
const todayKey = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/** Escapes HTML to prevent injection when rendering student names. */
const escapeHtml = (str) =>
  str.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

/** Returns initials (up to 2 letters) for a student's avatar bubble. */
const getInitials = (name) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Gets today's attendance status for a student ('present' | 'absent'). */
const getTodayStatus = (student) => student.history[todayKey()] || "absent";

/** Calculates the overall attendance percentage for a student across all recorded days. */
const getAttendancePercent = (student) => {
  const entries = Object.values(student.history);
  if (entries.length === 0) return 0;
  const presentDays = entries.filter((status) => status === "present").length;
  return Math.round((presentDays / entries.length) * 100);
};

/* --------------------- 4. TOAST NOTIFICATIONS --------------------- */

const TOAST_ICONS = {
  success: "fa-solid fa-circle-check",
  error: "fa-solid fa-circle-exclamation",
  info: "fa-solid fa-circle-info",
  warning: "fa-solid fa-triangle-exclamation",
};

/**
 * Displays a temporary toast notification.
 * @param {string} message - text to display
 * @param {'success'|'error'|'info'|'warning'} type - toast style
 */
const showToast = (message, type = "info") => {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="${TOAST_ICONS[type] || TOAST_ICONS.info}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  // Auto-dismiss after 3 seconds with a fade-out animation
  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

/* --------------------- 5. CONFIRMATION MODAL --------------------- */

const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");

/**
 * Opens the confirmation modal with a custom title/message and stores
 * the action to run if the user confirms.
 */
const openConfirmModal = (title, message, onConfirm) => {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  pendingModalAction = onConfirm;
  modalBackdrop.classList.add("show");
};

const closeConfirmModal = () => {
  modalBackdrop.classList.remove("show");
  pendingModalAction = null;
  pendingDeleteId = null;
};

document.getElementById("modalCancelBtn").addEventListener("click", closeConfirmModal);
document.getElementById("modalConfirmBtn").addEventListener("click", () => {
  if (typeof pendingModalAction === "function") pendingModalAction();
  closeConfirmModal();
});
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeConfirmModal();
});

/* --------------------- 6. EDIT STUDENT MODAL --------------------- */

const editModalBackdrop = document.getElementById("editModalBackdrop");
const editStudentInput = document.getElementById("editStudentInput");

const openEditModal = (student) => {
  editingStudentId = student.id;
  editStudentInput.value = student.name;
  editModalBackdrop.classList.add("show");
  setTimeout(() => editStudentInput.focus(), 100);
};

const closeEditModal = () => {
  editModalBackdrop.classList.remove("show");
  editingStudentId = null;
};

document.getElementById("editCancelBtn").addEventListener("click", closeEditModal);
editModalBackdrop.addEventListener("click", (e) => {
  if (e.target === editModalBackdrop) closeEditModal();
});

document.getElementById("editSaveBtn").addEventListener("click", () => {
  const newName = editStudentInput.value.trim();

  if (!newName) {
    showToast("Student name cannot be empty.", "error");
    return;
  }

  const duplicate = students.some(
    (s) => s.id !== editingStudentId && s.name.toLowerCase() === newName.toLowerCase()
  );
  if (duplicate) {
    showToast("Another student already has this name.", "error");
    return;
  }

  const student = students.find((s) => s.id === editingStudentId);
  if (student) {
    student.name = newName;
    saveStudents();
    renderAll();
    showToast("Student name updated successfully.", "success");
  }
  closeEditModal();
});

/* --------------------- 7. STUDENT CRUD OPERATIONS --------------------- */

/** Adds a new student after validating for empty input and duplicates. */
const addStudent = (name) => {
  const trimmedName = name.trim();

  if (!trimmedName) {
    showToast("Please enter a student name.", "error");
    return false;
  }

  const isDuplicate = students.some(
    (s) => s.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (isDuplicate) {
    showToast(`"${trimmedName}" already exists in the list.`, "error");
    return false;
  }

  students.push({
    id: generateId(),
    name: trimmedName,
    history: {}, // { "YYYY-MM-DD": "present" | "absent" }
  });

  saveStudents();
  renderAll();
  showToast(`${trimmedName} added successfully.`, "success");
  return true;
};

/** Removes a student permanently by id. */
const deleteStudent = (id) => {
  const student = students.find((s) => s.id === id);
  if (!student) return;

  students = students.filter((s) => s.id !== id);
  saveStudents();
  renderAll();
  showToast(`${student.name} was removed.`, "success");
};

/* --------------------- 8. ATTENDANCE OPERATIONS --------------------- */

/** Toggles a student's status for today between present and absent. */
const toggleAttendance = (id) => {
  const student = students.find((s) => s.id === id);
  if (!student) return;

  const current = getTodayStatus(student);
  student.history[todayKey()] = current === "present" ? "absent" : "present";

  saveStudents();
  renderAll();
};

/** Clears today's attendance mark for every student (keeps history of past days). */
const resetTodayAttendance = () => {
  const today = todayKey();
  students.forEach((s) => delete s.history[today]);
  saveStudents();
  renderAll();
  showToast("Today's attendance has been reset.", "success");
};

/** Wipes every student and all attendance history permanently. */
const resetDatabase = () => {
  students = [];
  saveStudents();
  renderAll();
  showToast("Database has been reset.", "success");
};

/* --------------------- 9. RENDERING --------------------- */

const tableBody = document.getElementById("studentTableBody");
const emptyState = document.getElementById("emptyState");
const activeFilterChip = document.getElementById("activeFilterChip");

/** Returns the filtered + searched + sorted list ready for display. */
const getVisibleStudents = () => {
  let list = [...students];

  // Apply search filter
  if (searchTerm) {
    list = list.filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }

  // Apply status filter
  if (currentFilter === "present") {
    list = list.filter((s) => getTodayStatus(s) === "present");
  } else if (currentFilter === "absent") {
    list = list.filter((s) => getTodayStatus(s) === "absent");
  }

  // Apply alphabetical sort
  list.sort((a, b) =>
    sortAscending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
  );

  return list;
};

/** Renders the student table rows based on current filter/search/sort state. */
const renderTable = () => {
  const visible = getVisibleStudents();
  tableBody.innerHTML = "";

  emptyState.classList.toggle("show", visible.length === 0);

  visible.forEach((student, index) => {
    const status = getTodayStatus(student);
    const percent = getAttendancePercent(student);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="student-name-cell">
        <span class="student-avatar">${getInitials(student.name)}</span>${escapeHtml(student.name)}
      </td>
      <td>
        <button class="status-badge ${status}" data-toggle-id="${student.id}" title="Click to toggle attendance">
          <i class="fa-solid ${status === "present" ? "fa-circle-check" : "fa-circle-xmark"}"></i>
          ${status === "present" ? "Present" : "Absent"}
        </button>
      </td>
      <td>
        <div class="percent-cell">
          <div class="percent-track"><div class="percent-fill" style="width:${percent}%"></div></div>
          <span class="percent-text">${percent}%</span>
        </div>
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn edit" data-edit-id="${student.id}" title="Edit name"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn delete" data-delete-id="${student.id}" title="Delete student"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;

    tableBody.appendChild(row);
  });

  const chipLabels = { all: "All Students", present: "Present", absent: "Absent" };
  activeFilterChip.textContent = `${chipLabels[currentFilter]} (${visible.length})`;
};

/** Recomputes and displays dashboard statistics. */
const renderStats = () => {
  const total = students.length;
  const presentToday = students.filter((s) => getTodayStatus(s) === "present").length;
  const absentToday = total - presentToday;
  const percentage = total === 0 ? 0 : Math.round((presentToday / total) * 100);

  document.getElementById("totalStudents").textContent = total;
  document.getElementById("presentCount").textContent = presentToday;
  document.getElementById("absentCount").textContent = absentToday;
  document.getElementById("attendancePercent").textContent = `${percentage}%`;
};

/** Master render function: refreshes table + stats together. */
const renderAll = () => {
  renderTable();
  renderStats();
};

/* ---------- Delegated event listeners for dynamically rendered rows ---------- */

tableBody.addEventListener("click", (e) => {
  const toggleBtn = e.target.closest("[data-toggle-id]");
  const editBtn = e.target.closest("[data-edit-id]");
  const deleteBtn = e.target.closest("[data-delete-id]");

  if (toggleBtn) {
    toggleAttendance(toggleBtn.dataset.toggleId);
  } else if (editBtn) {
    const student = students.find((s) => s.id === editBtn.dataset.editId);
    if (student) openEditModal(student);
  } else if (deleteBtn) {
    const student = students.find((s) => s.id === deleteBtn.dataset.deleteId);
    if (student) {
      openConfirmModal(
        "Delete Student?",
        `This will permanently remove "${student.name}" and their attendance history.`,
        () => deleteStudent(student.id)
      );
    }
  }
});

/* --------------------- 10. CSV EXPORT / IMPORT --------------------- */

/** Exports current attendance snapshot (today) as a downloadable CSV file. */
const exportToCsv = () => {
  if (students.length === 0) {
    showToast("There are no students to export.", "warning");
    return;
  }

  const rows = [["Name", "Status (Today)", "Attendance %"]];
  students.forEach((s) => {
    rows.push([s.name, getTodayStatus(s), `${getAttendancePercent(s)}%`]);
  });

  const csvContent = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance_${todayKey()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast("Attendance exported as CSV.", "success");
};

/** Parses an uploaded CSV file and adds any new student names found in it. */
const importFromCsv = (file) => {
  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const text = event.target.result;
      const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

      let addedCount = 0;
      let skippedCount = 0;

      lines.forEach((line, index) => {
        // Take the first column as the name; skip a possible header row
        const firstCell = line.split(",")[0].replace(/"/g, "").trim();
        if (!firstCell) return;
        if (index === 0 && firstCell.toLowerCase() === "name") return;

        const isDuplicate = students.some(
          (s) => s.name.toLowerCase() === firstCell.toLowerCase()
        );

        if (isDuplicate) {
          skippedCount++;
        } else {
          students.push({ id: generateId(), name: firstCell, history: {} });
          addedCount++;
        }
      });

      saveStudents();
      renderAll();
      showToast(`Imported ${addedCount} student(s), skipped ${skippedCount} duplicate(s).`, "success");
    } catch (err) {
      console.error("CSV import failed:", err);
      showToast("Could not read the CSV file. Please check its format.", "error");
    }
  };

  reader.onerror = () => showToast("Error reading the selected file.", "error");
  reader.readAsText(file);
};

/* --------------------- 11. THEME TOGGLE --------------------- */

const applyTheme = (theme) => {
  document.body.setAttribute("data-theme", theme);
  const icon = document.querySelector("#themeToggle i");
  icon.className = theme === "light" ? "fa-solid fa-sun" : "fa-solid fa-moon";
  localStorage.setItem(THEME_KEY, theme);
};

const initTheme = () => {
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(savedTheme);
};

document.getElementById("themeToggle").addEventListener("click", () => {
  const isLight = document.body.getAttribute("data-theme") === "light";
  applyTheme(isLight ? "dark" : "light");
});

/* --------------------- 12. SIDEBAR TOGGLE (MOBILE) --------------------- */

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

const openSidebar = () => {
  sidebar.classList.add("open");
  overlay.classList.add("show");
};

const closeSidebar = () => {
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
};

document.getElementById("hamburgerBtn").addEventListener("click", openSidebar);
overlay.addEventListener("click", closeSidebar);

/* --------------------- 13. LIVE DATE & TIME --------------------- */

const updateDateTime = () => {
  const now = new Date();

  const dateOptions = { weekday: "short", year: "numeric", month: "short", day: "numeric" };
  document.getElementById("currentDate").textContent = now.toLocaleDateString(undefined, dateOptions);
  document.getElementById("currentTime").textContent = now.toLocaleTimeString();
};

/* --------------------- 14. EVENT LISTENERS / INIT --------------------- */

// Add student form submission
document.getElementById("addStudentForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("newStudentInput");
  const success = addStudent(input.value);
  if (success) input.value = "";
});

// Live search
document.getElementById("searchInput").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderTable();
});

// Sort toggle button
document.getElementById("sortBtn").addEventListener("click", () => {
  sortAscending = !sortAscending;
  const icon = document.querySelector("#sortBtn i");
  icon.className = sortAscending ? "fa-solid fa-arrow-down-a-z" : "fa-solid fa-arrow-down-z-a";
  document.getElementById("sortBtn").innerHTML = `<i class="${icon.className}"></i> Sort ${sortAscending ? "A–Z" : "Z–A"}`;
  renderTable();
});

// Sidebar filter navigation (All / Present / Absent)
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderTable();
    closeSidebar(); // auto-close on mobile after selecting
  });
});

// CSV export / import
document.getElementById("exportCsvBtn").addEventListener("click", exportToCsv);
document.getElementById("importCsvBtn").addEventListener("click", () => {
  document.getElementById("importCsvInput").click();
});
document.getElementById("importCsvInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importFromCsv(file);
  e.target.value = ""; // allow re-importing the same file later
});

// Reset today's attendance (with confirmation)
document.getElementById("resetAttendanceBtn").addEventListener("click", () => {
  openConfirmModal(
    "Reset Today's Attendance?",
    "This clears today's present/absent marks for all students but keeps their names and history.",
    resetTodayAttendance
  );
});

// Reset entire database (with confirmation)
document.getElementById("resetDbBtn").addEventListener("click", () => {
  openConfirmModal(
    "Reset Entire Database?",
    "This permanently deletes ALL students and their attendance history. This cannot be undone.",
    resetDatabase
  );
});

/**
 * Application entry point: loads saved data, sets up the UI, and
 * starts the live clock.
 */
const init = () => {
  loadStudents();
  initTheme();
  renderAll();
  updateDateTime();
  setInterval(updateDateTime, 1000);
};

document.addEventListener("DOMContentLoaded", init);