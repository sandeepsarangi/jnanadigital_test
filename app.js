/*
  Student Attendance App
  Core Functionality
*/

// Mock User Data (replace with actual authentication and user data)
let currentUser = null; // Will be set after Google Sign-In
let currentTeacherData = null; // Will hold teacher-specific data like assigned villages

// Mock Firestore data structure (for demonstration if not using actual Firestore)
const mockFirestoreDB = {
    teachers: {
        "teacher1_google_id": { name: "Teacher Alice", email: "alice@example.com", assignedVillages: ["villageA", "villageB"] },
        "teacher2_google_id": { name: "Teacher Bob", email: "bob@example.com", assignedVillages: ["villageC"] }
    },
    villages: {
        "villageA": { name: "Village A", students: ["student1", "student2"] },
        "villageB": { name: "Village B", students: ["student3"] },
        "villageC": { name: "Village C", students: ["student4", "student5", "student6"] }
    },
    students: {
        "student1": { name: "John Doe", class: "5", villageId: "villageA" },
        "student2": { name: "Jane Smith", class: "4", villageId: "villageA" },
        "student3": { name: "Mike Brown", class: "5", villageId: "villageB" },
        "student4": { name: "Emily White", class: "3", villageId: "villageC" },
        "student5": { name: "Chris Green", class: "4", villageId: "villageC" },
        "student6": { name: "Sarah Blue", class: "3", villageId: "villageC" }
    },
    attendance: [] // { date: "YYYY-MM-DD", session: "Morning/Evening", villageId: "villageX", studentId: "studentY", present: true/false, notes: "..." }
};

// --- Authentication ---
function handleCredentialResponse(response) {
    // For simplicity, we're not validating the token here. In a real app, you MUST.
    // Send response.credential (the JWT ID token) to your backend for verification and to get/create a user session.
    const decodedToken = parseJwt(response.credential);
    console.log("ID: " + decodedToken.sub);
    console.log('Full Name: ' + decodedToken.name);
    console.log('Given Name: ' + decodedToken.given_name);
    console.log('Family Name: ' + decodedToken.family_name);
    console.log("Image URL: " + decodedToken.picture);
    console.log("Email: " + decodedToken.email);

    // Mock user session
    currentUser = {
        uid: decodedToken.sub, // Using Google User ID as our app's UID
        name: decodedToken.name,
        email: decodedToken.email,
        picture: decodedToken.picture
    };

    // Simulate fetching teacher data based on email or UID
    // In a real app, this would be an async call to your backend/Firestore
    currentTeacherData = Object.values(mockFirestoreDB.teachers).find(t => t.email === currentUser.email);
    if (!currentTeacherData) {
        // If teacher not found, create a mock entry or handle as new teacher
        // For this demo, let's assume the first teacher if email doesn't match
        currentTeacherData = mockFirestoreDB.teachers["teacher1_google_id"] || { assignedVillages: [] };
        console.warn("Mock: Teacher data not found for email, using default or empty.");
    }


    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('teacher-dashboard-screen').style.display = 'flex';
    document.getElementById('dashboard-welcome').textContent = `Welcome, ${currentUser.name}!`;
    
    // Show reports button if teacher has assigned villages (example logic)
    if (currentTeacherData && currentTeacherData.assignedVillages && currentTeacherData.assignedVillages.length > 0) {
        document.getElementById('dashboard-reports-btn').style.display = 'flex';
    } else {
        document.getElementById('dashboard-reports-btn').style.display = 'none';
    }

    document.getElementById('signout-button').style.display = 'block'; // Show sign-out button
}

function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
}

function signOut() {
    // In a real app, you'd also invalidate the session on the backend.
    // For Google Sign-In, you might want to call google.accounts.id.disableAutoSelect();
    // or google.accounts.id.revoke(currentUser.email, done => { console.log('consent revoked') });
    // For simplicity, just resetting UI here.
    google.accounts.id.disableAutoSelect(); // Helps prevent auto sign-in next time
    currentUser = null;
    currentTeacherData = null;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('teacher-dashboard-screen').style.display = 'none';
    document.getElementById('attendance-screen').style.display = 'none';
    document.getElementById('student-list-screen').style.display = 'none';
    document.getElementById('add-edit-student-form-screen').style.display = 'none';
    document.getElementById('attendance-reports-screen').style.display = 'none';
    document.getElementById('success-screen').style.display = 'none';
    document.getElementById('signout-button').style.display = 'none';
    console.log('User signed out.');
}


// --- Navigation & Screen Management ---
function showScreen(screenId) {
    ['login-screen', 'teacher-dashboard-screen', 'attendance-screen', 'student-list-screen', 'add-edit-student-form-screen', 'attendance-reports-screen', 'success-screen'].forEach(id => {
        document.getElementById(id).style.display = (id === screenId) ? 'flex' : 'none';
    });
}

function goBackToDashboard() {
    showScreen('teacher-dashboard-screen');
}

function goBack() { // Generic back function, often to dashboard or previous relevant screen
    // This might need more context in a real app
    if (document.getElementById('attendance-screen').style.display === 'flex' ||
        document.getElementById('student-list-screen').style.display === 'flex' ||
        document.getElementById('attendance-reports-screen').style.display === 'flex') {
        goBackToDashboard();
    } else if (document.getElementById('add-edit-student-form-screen').style.display === 'flex') {
        showStudentListScreen(); // Go back to student list from form
    } else {
        showScreen('teacher-dashboard-screen'); // Default fallback
    }
}

// --- Core App Logic: Villages & Students (Simulated Async) ---
async function getAssignedVillagesForTeacher(teacherId) {
    // Simulate API call
    return new Promise(resolve => {
        setTimeout(() => {
            if (currentTeacherData && currentTeacherData.assignedVillages) {
                const villages = currentTeacherData.assignedVillages.map(villageId => ({
                    id: villageId,
                    name: mockFirestoreDB.villages[villageId]?.name || "Unknown Village"
                }));
                resolve(villages);
            } else {
                resolve([]);
            }
        }, 100); // Short delay
    });
}

async function getStudentsByVillage(villageId) {
    // Simulate API call
    return new Promise(resolve => {
        setTimeout(() => {
            const villageStudents = Object.entries(mockFirestoreDB.students)
                .filter(([id, data]) => data.villageId === villageId)
                .map(([id, data]) => ({ id, ...data }));
            resolve(villageStudents);
        }, 100);
    });
}

async function getAllStudentsForTeacher(teacherId) {
    // Simulate API call to get all students across assigned villages
    return new Promise(async resolve => {
        const assignedVillages = await getAssignedVillagesForTeacher(teacherId);
        let allStudents = [];
        for (const village of assignedVillages) {
            const studentsInVillage = await getStudentsByVillage(village.id);
            allStudents = allStudents.concat(studentsInVillage);
        }
        resolve(allStudents);
    });
}


// --- Attendance Screen ---
async function showAttendanceScreen() {
    showScreen('attendance-screen');
    const villageSelect = document.getElementById('attendance-village-select');
    const studentsDiv = document.getElementById('students');
    const dateInput = document.getElementById('date');
    dateInput.valueAsDate = new Date(); // Default to today

    villageSelect.innerHTML = '<option value="">Loading villages...</option>';
    studentsDiv.innerHTML = '<p class="loading-text">Please select a village.</p>';

    const assignedVillages = await getAssignedVillagesForTeacher(currentUser.uid);

    if (assignedVillages.length === 0) {
        villageSelect.innerHTML = '<option value="">No villages assigned</option>';
        studentsDiv.innerHTML = '<p class="loading-text">No villages available to mark attendance.</p>';
        document.getElementById('submit-btn').disabled = true;
        return;
    }

    villageSelect.innerHTML = '<option value="">Select Village</option>';
    assignedVillages.forEach(village => {
        const option = document.createElement('option');
        option.value = village.id;
        option.textContent = village.name;
        villageSelect.appendChild(option);
    });
    document.getElementById('submit-btn').disabled = true; // Disabled until village and students load

    villageSelect.onchange = async () => {
        const selectedVillageId = villageSelect.value;
        studentsDiv.innerHTML = ''; // Clear previous students
        if (!selectedVillageId) {
            studentsDiv.innerHTML = '<p class="loading-text">Please select a village.</p>';
            document.getElementById('submit-btn').disabled = true;
            return;
        }

        studentsDiv.innerHTML = '<p class="loading-text">Loading students...</p>';
        const students = await getStudentsByVillage(selectedVillageId);
        studentsDiv.innerHTML = ''; // Clear loading text

        if (students.length === 0) {
            studentsDiv.innerHTML = '<p class="loading-text">No students found in this village.</p>';
            document.getElementById('submit-btn').disabled = true;
            return;
        }

        students.forEach(student => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = student.id;
            checkbox.checked = true; // Default to present
            checkbox.dataset.studentName = student.name; // Store name for submission

            const span = document.createElement('span');
            span.textContent = student.name;

            label.appendChild(checkbox);
            label.appendChild(span);
            studentsDiv.appendChild(label);
        });
        document.getElementById('submit-btn').disabled = false;
    };
}

async function submitAttendance() {
    const villageId = document.getElementById('attendance-village-select').value;
    const date = document.getElementById('date').value;
    const session = document.getElementById('session').value;
    const studentCheckboxes = document.querySelectorAll('#students input[type="checkbox"]');

    if (!villageId || !date || !session) {
        // In a real app, use a custom modal, not alert
        console.error("Please select village, date, and session.");
        // showCustomAlert("Please select village, date, and session.");
        return;
    }

    const attendanceData = [];
    studentCheckboxes.forEach(checkbox => {
        attendanceData.push({
            date,
            session,
            villageId,
            studentId: checkbox.value,
            studentName: checkbox.dataset.studentName, // Good to have for easier reporting
            present: checkbox.checked,
            teacherId: currentUser.uid,
            timestamp: new Date().toISOString()
        });
    });

    console.log("Submitting Attendance:", attendanceData);
    // Simulate saving to Firestore
    mockFirestoreDB.attendance.push(...attendanceData);

    document.getElementById('success-message').textContent = 'Attendance submitted successfully!';
    showScreen('success-screen');
}

// --- Student Management Screen ---
async function showStudentListScreen() {
    showScreen('student-list-screen');
    const villageSelect = document.getElementById('student-list-village-select');
    const studentListDiv = document.getElementById('student-list');
    
    villageSelect.innerHTML = '<option value="">Loading villages...</option>';
    studentListDiv.innerHTML = '<p class="loading-text">Please select a village.</p>';
    document.getElementById('add-student-button').style.display = 'none'; // Hide until village selected

    const assignedVillages = await getAssignedVillagesForTeacher(currentUser.uid);

    if (assignedVillages.length === 0) {
        villageSelect.innerHTML = '<option value="">No villages assigned</option>';
        studentListDiv.innerHTML = '<p class="loading-text">No villages available to manage students.</p>';
        return;
    }

    villageSelect.innerHTML = '<option value="">Select Village</option>';
    assignedVillages.forEach(village => {
        const option = document.createElement('option');
        option.value = village.id;
        option.textContent = village.name;
        villageSelect.appendChild(option);
    });

    villageSelect.onchange = async () => {
        const selectedVillageId = villageSelect.value;
        studentListDiv.innerHTML = ''; 
        if (!selectedVillageId) {
            studentListDiv.innerHTML = '<p class="loading-text">Please select a village.</p>';
            document.getElementById('add-student-button').style.display = 'none';
            return;
        }
        document.getElementById('add-student-button').style.display = 'block';
        studentListDiv.innerHTML = '<p class="loading-text">Loading students...</p>';
        await renderStudentList(selectedVillageId);
    };
}

async function renderStudentList(villageId) {
    const studentListDiv = document.getElementById('student-list');
    const students = await getStudentsByVillage(villageId);
    studentListDiv.innerHTML = ''; 

    if (students.length === 0) {
        studentListDiv.innerHTML = '<p class="loading-text">No students found in this village. Click "Add New Student" to add some!</p>';
        return;
    }

    students.forEach(student => {
        const card = document.createElement('div');
        card.classList.add('student-card');
        // In a real app, you might fetch individual attendance percentage here or pass it
        const attendancePercentage = Math.floor(Math.random() * 51) + 50; // Mock percentage

        card.innerHTML = `
            <span class="student-icon">🧑‍🎓</span>
            <div class="student-info">
                <div class="student-name">${student.name}</div>
                <div class="student-class">Class: ${student.class || 'N/A'}</div>
            </div>
            ${createPercentageRing(attendancePercentage)}
            <button class="edit-student-btn" onclick="showEditStudentForm('${student.id}', '${villageId}')">✏️</button>
        `;
        studentListDiv.appendChild(card);
    });
}

function createPercentageRing(percentage) {
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;
    const ringColorClass = percentage >= 75 ? 'blue-ring' : 'red-ring';
    const textColorClass = percentage >= 75 ? 'blue-ring-text' : 'red-ring-text';

    return `
        <div class="percentage-ring-container">
            <svg width="50" height="50" viewBox="0 0 50 50">
                <circle class="percentage-ring-bg" cx="25" cy="25" r="${radius}"></circle>
                <circle class="percentage-ring-progress ${ringColorClass}"
                        cx="25" cy="25" r="${radius}"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${offset}">
                </circle>
                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="percentage-text ${textColorClass}">
                    ${percentage}%
                </text>
            </svg>
        </div>
    `;
}

// --- Add/Edit Student Form ---
let currentEditingStudentId = null;
let currentEditingStudentVillageId = null;

function showAddStudentForm() {
    currentEditingStudentId = null; // Ensure it's a new student
    currentEditingStudentVillageId = document.getElementById('student-list-village-select').value;
    if (!currentEditingStudentVillageId) {
        // showCustomAlert("Please select a village first from the student list.");
        console.error("Please select a village first from the student list.");
        return;
    }
    document.getElementById('form-heading').textContent = '➕ Add New Student';
    renderStudentForm();
    showScreen('add-edit-student-form-screen');
}

async function showEditStudentForm(studentId, villageId) {
    currentEditingStudentId = studentId;
    currentEditingStudentVillageId = villageId;
    document.getElementById('form-heading').textContent = '✏️ Edit Student';
    
    // Fetch student data (mocked)
    const studentData = mockFirestoreDB.students[studentId];
    if (!studentData) {
        console.error("Student not found for editing");
        // showCustomAlert("Student data not found.");
        goBack(); // Go back to student list
        return;
    }
    renderStudentForm(studentData);
    showScreen('add-edit-student-form-screen');
}

function renderStudentForm(studentData = {}) {
    const formContainer = document.getElementById('dynamic-student-form-container');
    const villageName = mockFirestoreDB.villages[currentEditingStudentVillageId]?.name || "Selected Village";

    formContainer.innerHTML = `
        <label class="left-text" for="student-name">Student Name:</label>
        <input type="text" id="student-name" value="${studentData.name || ''}" placeholder="Enter student's full name">

        <label class="left-text" for="student-class">Class/Grade:</label>
        <input type="text" id="student-class" value="${studentData.class || ''}" placeholder="e.g., 5th, Class 3">
        
        <label class="left-text" for="student-village-display">Village:</label>
        <input type="text" id="student-village-display" value="${villageName}" disabled> 
        
        <label class="left-text" for="student-notes">Notes (Optional):</label>
        <textarea id="student-notes" placeholder="Any relevant notes about the student...">${studentData.notes || ''}</textarea>
    `;
    // Notes field might not be in your original studentData structure, add if needed

    const formButtonsDiv = document.getElementById('form-buttons');
    formButtonsDiv.innerHTML = `
        <button onclick="saveStudentData()">💾 Save Student</button>
        <button class="secondary-button" onclick="cancelStudentForm()">❌ Cancel</button>
    `;
    if (currentEditingStudentId) { // Add delete button only if editing
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️ Delete Student';
        deleteBtn.classList.add('secondary-button'); // Or a different class for delete
        deleteBtn.style.backgroundColor = '#ef4444'; // Red for delete
        deleteBtn.style.marginTop = '10px';
        deleteBtn.onclick = () => deleteStudent(currentEditingStudentId, currentEditingStudentVillageId);
        formButtonsDiv.appendChild(deleteBtn);
    }
}

async function saveStudentData() {
    const name = document.getElementById('student-name').value.trim();
    const studentClass = document.getElementById('student-class').value.trim();
    const notes = document.getElementById('student-notes').value.trim();

    if (!name || !studentClass) {
        // showCustomAlert("Student Name and Class are required.");
        console.error("Student Name and Class are required.");
        return;
    }

    const studentPayload = {
        name,
        class: studentClass,
        villageId: currentEditingStudentVillageId,
        notes // Add notes if you have this field
    };

    if (currentEditingStudentId) { // Editing existing student
        console.log("Updating student:", currentEditingStudentId, studentPayload);
        mockFirestoreDB.students[currentEditingStudentId] = { ...mockFirestoreDB.students[currentEditingStudentId], ...studentPayload };
    } else { // Adding new student
        const newStudentId = `student${Object.keys(mockFirestoreDB.students).length + 1}_${Date.now()}`; // Simple unique ID
        console.log("Adding new student:", newStudentId, studentPayload);
        mockFirestoreDB.students[newStudentId] = studentPayload;
        // Also add to village's student list if your structure requires it
        if (mockFirestoreDB.villages[currentEditingStudentVillageId]) {
            mockFirestoreDB.villages[currentEditingStudentVillageId].students.push(newStudentId);
        }
    }
    
    document.getElementById('success-message').textContent = `Student ${currentEditingStudentId ? 'updated' : 'added'} successfully!`;
    showScreen('success-screen');
    // Ensure the student list screen is refreshed or re-rendered after success
    // For now, goBack will eventually lead to student list, which should re-fetch.
}

function cancelStudentForm() {
    showStudentListScreen(); // Go back to the list
}

async function deleteStudent(studentId, villageId) {
    // In a real app, show a confirmation modal here!
    // const confirmed = await showConfirmationModal("Are you sure you want to delete this student? This action cannot be undone.");
    // if (!confirmed) return;

    console.log("Deleting student:", studentId, "from village:", villageId);
    // Remove student from mock DB
    delete mockFirestoreDB.students[studentId];
    // Remove student from village's student list
    if (mockFirestoreDB.villages[villageId] && mockFirestoreDB.villages[villageId].students) {
        mockFirestoreDB.villages[villageId].students = mockFirestoreDB.villages[villageId].students.filter(sId => sId !== studentId);
    }
    // Also, consider deleting related attendance records or anonymizing them.

    document.getElementById('success-message').textContent = 'Student deleted successfully.';
    showScreen('success-screen');
    // Student list will refresh when navigating back.
}


// --- Attendance Reports Screen ---
let attendanceReportChart = null; // To hold the chart instance

async function showAttendanceReportsScreen() {
    showScreen('attendance-reports-screen');

    const allVillagesButton = document.getElementById('report-all-villages-btn');
    const villageSelect = document.getElementById('report-village-select');
    const statsContainer = document.getElementById('reports-stats-container');
    // const chartContainer = document.getElementById('attendance-chart-container'); // If using charts

    // Clear previous state
    villageSelect.innerHTML = '';
    statsContainer.innerHTML = '<p class="loading-text">Loading report options...</p>';
    // if (chartContainer) chartContainer.style.display = 'none';
    if (attendanceReportChart) {
        attendanceReportChart.destroy();
        attendanceReportChart = null;
    }

    const assignedVillages = await getAssignedVillagesForTeacher(currentUser.uid);
    const allAssignedVillageIds = assignedVillages.map(v => v.id);

    if (assignedVillages.length > 0) {
        villageSelect.disabled = false;
        allVillagesButton.disabled = false;

        // Populate dropdown
        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = "Select Specific Village";
        villageSelect.appendChild(defaultOption);

        assignedVillages.forEach(village => {
            const option = document.createElement('option');
            option.value = village.id;
            option.textContent = village.name;
            villageSelect.appendChild(option);
        });

        // Event listener for "All Villages" button
        allVillagesButton.onclick = () => {
            villageSelect.value = ""; // Reset dropdown
            allVillagesButton.classList.add('active');
            loadReportData(null, allAssignedVillageIds);
        };

        // Event listener for dropdown
        villageSelect.onchange = () => {
            const selectedVillageId = villageSelect.value;
            if (selectedVillageId) {
                allVillagesButton.classList.remove('active');
                loadReportData(selectedVillageId);
            } else {
                // If "Select Specific Village" (empty value) is chosen, default to "All Villages"
                if (!allVillagesButton.classList.contains('active')) {
                    allVillagesButton.click();
                }
            }
        };

        // Initial load: "All Villages"
        allVillagesButton.classList.add('active');
        villageSelect.value = "";
        loadReportData(null, allAssignedVillageIds);

    } else {
        villageSelect.innerHTML = '<option value="">No villages assigned</option>';
        villageSelect.disabled = true;
        allVillagesButton.disabled = true;
        allVillagesButton.classList.remove('active');
        statsContainer.innerHTML = '<p class="loading-text">No villages assigned to generate reports.</p>';
    }
}


async function loadReportData(villageId, allAssignedVillageIds = []) {
    const statsContainer = document.getElementById('reports-stats-container');
    // const chartContainer = document.getElementById('attendance-chart-container');
    statsContainer.innerHTML = '<p class="loading-text">Fetching attendance data...</p>';
    // if (chartContainer) chartContainer.style.display = 'none';
     if (attendanceReportChart) {
        attendanceReportChart.destroy();
        attendanceReportChart = null;
    }


    // Simulate fetching attendance data
    // In a real app, this would be a Firestore query
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay

    let relevantAttendance = [];
    let reportTitle = "";

    if (villageId) { // Specific village
        relevantAttendance = mockFirestoreDB.attendance.filter(a => a.villageId === villageId);
        const villageDetails = mockFirestoreDB.villages[villageId];
        reportTitle = villageDetails ? `Report for ${villageDetails.name}` : "Report for Selected Village";
    } else if (allAssignedVillageIds.length > 0) { // All assigned villages
        relevantAttendance = mockFirestoreDB.attendance.filter(a => allAssignedVillageIds.includes(a.villageId));
        reportTitle = "Report for All Assigned Villages";
    } else { // No specific village and no assigned villages (should be handled by UI disabling)
        statsContainer.innerHTML = '<p>No data to display. Please select a filter or ensure villages are assigned.</p>';
        return;
    }
    
    if (relevantAttendance.length === 0) {
        statsContainer.innerHTML = `<h3>${reportTitle}</h3><p>No attendance records found for this selection.</p>`;
        return;
    }

    // --- Basic Stats Calculation ---
    const totalRecords = relevantAttendance.length;
    const presentCount = relevantAttendance.filter(a => a.present).length;
    const absentCount = totalRecords - presentCount;
    const overallAttendancePercentage = totalRecords > 0 ? ((presentCount / totalRecords) * 100).toFixed(1) : 0;

    // Group by student for individual stats
    const studentAttendance = {};
    relevantAttendance.forEach(record => {
        if (!studentAttendance[record.studentId]) {
            studentAttendance[record.studentId] = {
                name: record.studentName || mockFirestoreDB.students[record.studentId]?.name || "Unknown Student",
                present: 0,
                total: 0
            };
        }
        studentAttendance[record.studentId].total++;
        if (record.present) {
            studentAttendance[record.studentId].present++;
        }
    });

    // --- Display Stats ---
    let statsHTML = `<h3>${reportTitle}</h3>`;
    statsHTML += `<p><strong>Overall Attendance:</strong> ${overallAttendancePercentage}% (${presentCount} present / ${absentCount} absent out of ${totalRecords} records)</p>`;
    
    statsHTML += `<h4>Individual Student Summary:</h4>`;
    if (Object.keys(studentAttendance).length > 0) {
        statsHTML += `<ul style="list-style-type: none; padding-left: 0;">`;
        for (const studentId in studentAttendance) {
            const stud = studentAttendance[studentId];
            const studPercentage = stud.total > 0 ? ((stud.present / stud.total) * 100).toFixed(1) : 0;
            statsHTML += `<li style="margin-bottom: 5px;"><strong>${stud.name}:</strong> ${studPercentage}% (${stud.present}/${stud.total} days)</li>`;
        }
        statsHTML += `</ul>`;
    } else {
        statsHTML += `<p>No individual student data to display for this selection.</p>`;
    }
    
    statsContainer.innerHTML = statsHTML;

    // --- Optional: Generate Chart ---
    // Example: Bar chart of attendance per student
    // if (Object.keys(studentAttendance).length > 0 && Chart) { // Check if Chart.js is loaded
    //     if (chartContainer) chartContainer.style.display = 'block';
    //     const chartLabels = Object.values(studentAttendance).map(s => s.name);
    //     const chartDataPresent = Object.values(studentAttendance).map(s => s.present);
    //     const chartDataAbsent = Object.values(studentAttendance).map(s => s.total - s.present);

    //     const ctx = document.getElementById('attendanceReportChart')?.getContext('2d');
    //     if (ctx) {
    //         attendanceReportChart = new Chart(ctx, {
    //             type: 'bar',
    //             data: {
    //                 labels: chartLabels,
    //                 datasets: [
    //                     {
    //                         label: 'Present Days',
    //                         data: chartDataPresent,
    //                         backgroundColor: 'rgba(75, 192, 192, 0.6)',
    //                         borderColor: 'rgba(75, 192, 192, 1)',
    //                         borderWidth: 1
    //                     },
    //                     {
    //                         label: 'Absent Days',
    //                         data: chartDataAbsent,
    //                         backgroundColor: 'rgba(255, 99, 132, 0.6)',
    //                         borderColor: 'rgba(255, 99, 132, 1)',
    //                         borderWidth: 1
    //                     }
    //                 ]
    //             },
    //             options: {
    //                 responsive: true,
    //                 maintainAspectRatio: false,
    //                 scales: {
    //                     y: { beginAtZero: true, stacked: true },
    //                     x: { stacked: true }
    //                 },
    //                 plugins: {
    //                     title: { display: true, text: 'Student Attendance Breakdown' }
    //                 }
    //             }
    //         });
    //     }
    // }
}


// --- Initialization ---
window.onload = () => {
    // Check if user was already signed in (e.g., if auto_select was true or page reloaded)
    // This is a simplified check. Google's GSI client handles some of this.
    // If you need to persist login across page loads without auto-signin,
    // you'd typically store a session token (securely!) and validate it.

    // For this demo, if currentUser is somehow set (e.g. by a quick auto-signin if configured), show dashboard
    if (currentUser) {
        handleCredentialResponse({ credential: "mock_credential_if_needed_for_flow" }); // Re-trigger flow if needed
    } else {
        showScreen('login-screen'); // Default to login
    }
};

// Make functions globally accessible if they are called from HTML onclick attributes
window.handleCredentialResponse = handleCredentialResponse;
window.signOut = signOut;
window.showAttendanceScreen = showAttendanceScreen;
window.showStudentListScreen = showStudentListScreen;
window.showAttendanceReportsScreen = showAttendanceReportsScreen;
window.goBackToDashboard = goBackToDashboard;
window.goBack = goBack;
window.submitAttendance = submitAttendance; // Changed from submit() to submitAttendance()
window.showAddStudentForm = showAddStudentForm;
window.showEditStudentForm = showEditStudentForm;
window.saveStudentData = saveStudentData;
window.cancelStudentForm = cancelStudentForm;
window.deleteStudent = deleteStudent;

