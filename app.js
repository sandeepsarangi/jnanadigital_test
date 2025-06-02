// IMPORTANT: This API_BASE_URL now points to your Netlify Function endpoint.
const API_BASE_URL = "/.netlify/functions/index"; 

let user = null;
let attendanceExists = false; // Flag to check if attendance for current date/session is already submitted

// --- Google Authentication Callbacks ---
// This function is called by Google's library after a successful sign-in.
async function handleCredentialResponse(response) {
    if (response.credential) {
        // Decode the ID token to get user information
        const idToken = response.credential;
        const decodedToken = parseJwt(idToken); // Helper to decode JWT

        const userEmail = decodedToken.email.toLowerCase();
        const userName = decodedToken.name || decodedToken.email; // Use name if available, else email

        // Now, use this authenticated email to log into your app's user system
        // This replaces the old email input and login button
        console.log("Google Sign-In successful for:", userEmail);
        await appLogin(userEmail, userName); // Call your app's login logic
    } else {
        console.error("Google Sign-In failed or credential not received.");
        alert("Google Sign-In failed. Please try again.");
    }
}

// Helper function to decode JWT (ID Token)
function parseJwt(token) {
    try {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Error decoding JWT:", e);
        return {};
    }
}

// Your app's actual login logic, now called after Google Auth
async function appLogin(email, name) {
    try {
        // API call to Netlify Function for Users sheet
        const data = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Users', email: email });

        if (!data.length || (data[0].role !== 'teacher' && data[0].role !== 'sponsor')) {
            alert("Authentication failed or not authorized as a teacher/sponsor.");
            return;
        }
        user = data[0]; // Store user data globally
        user.name = name; // Use name from Google profile if available

        // If sponsor, parse assigned villages
        if (user.role === 'sponsor' && user.village) {
            user.assignedVillages = user.village.split(',').map(v => v.trim());
        } else {
            user.assignedVillages = [user.village]; // Even for teachers, make it an array for consistency
        }


        // Show dashboard and set welcome message
        document.getElementById("dashboard-welcome").innerText = `👋 Welcome, ${user.name}`;

        // Adjust dashboard options based on role
        const attendanceReportsBtn = document.getElementById("dashboard-reports-btn");
        if (user.role === 'sponsor') {
            attendanceReportsBtn.style.display = 'flex'; // Show reports button for sponsors
        } else {
            attendanceReportsBtn.style.display = 'none'; // Hide reports button for teachers
        }

        showScreen("teacher-dashboard-screen");

        // Show sign-out button
        document.getElementById('signout-button').style.display = 'block';

        // Initialize date for attendance screen (for when it's accessed)
        document.getElementById("date").valueAsDate = new Date();
        // Set up event listeners for attendance check (for when it's accessed)
        // These listeners will now be set up in showAttendanceScreen
    } catch (error) {
        console.error("App Login error:", error);
        alert("An error occurred during app login. Please try again.");
    }
}

function signOut() {
    // Google Identity Services (GIS) library provides a global sign-out mechanism
    // This removes the user's session in the browser.
    google.accounts.id.disableAutoSelect(); // Prevent auto-relogin
    google.accounts.id.revoke(user.email, () => {
        user = null; // Clear local user data
        alert("You have been signed out.");
        // Redirect to login screen
        showScreen('login-screen');
        // Hide sign-out button
        document.getElementById('signout-button').style.display = 'none';
        // Clear dashboard welcome message
        document.getElementById("dashboard-welcome").innerText = "";
    });
}


// --- Helper for making Netlify Function requests ---
async function makeNetlifyFunctionRequest(method = 'GET', data = null, queryParams = {}) {
    let url = `${API_BASE_URL}`; // Base URL is now the function path

    // Append query parameters
    const params = new URLSearchParams();
    for (const key in queryParams) {
        params.append(key, queryParams[key]);
    }
    if (params.toString()) {
        url += `?${params.toString()}`;
    }

    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Network response was not ok: ${response.status} - ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Netlify Function request failed:", error, url);
        throw error; // Re-throw to be caught by calling function
    }
}


// --- Screen Navigation Functions ---
function showScreen(screenId) {
  // Hide all main content screens
  document.querySelectorAll('.login-screen, .app-screen, .success-screen').forEach(screen => {
    screen.style.display = 'none';
  });
  // Show the requested screen
  document.getElementById(screenId).style.display = 'flex';
}

// The old login function is now replaced by handleCredentialResponse -> appLogin
// function login() { ... } 

function goBackToDashboard() {
    showScreen("teacher-dashboard-screen");
}

// New function to populate village select dropdowns
function populateVillageSelect(selectElementId, defaultVillage = null, onChangeCallback = null) {
    const selectElement = document.getElementById(selectElementId);
    selectElement.innerHTML = ''; // Clear existing options

    const villagesToPopulate = user.assignedVillages || [];

    if (villagesToPopulate.length === 0) {
        selectElement.innerHTML = '<option value="">No villages assigned</option>';
        selectElement.disabled = true;
        return;
    }

    villagesToPopulate.forEach(village => {
        const option = document.createElement('option');
        option.value = village;
        option.textContent = village;
        if (village === defaultVillage) {
            option.selected = true;
        }
        selectElement.appendChild(option);
    });

    // The dropdown should always be enabled if there are options, allowing selection.
    selectElement.disabled = false; // Always enable if there are villages to select

    // Add change listener if provided
    if (onChangeCallback) {
        selectElement.onchange = onChangeCallback;
    }
}


function showAttendanceScreen() {
    showScreen("attendance-screen");
    // Populate village select for attendance screen
    populateVillageSelect('attendance-village-select', user.village, () => {
        loadStudentsForAttendance(document.getElementById('attendance-village-select').value);
        checkExistingAttendance();
    });
    // Load students for the initially selected village
    loadStudentsForAttendance(document.getElementById('attendance-village-select').value);
    // Check if attendance already exists for the current date/session
    checkExistingAttendance();

    // Ensure date/session listeners are set up, but only once
    const dateInput = document.getElementById("date");
    const sessionSelect = document.getElementById("session");
    if (!dateInput.dataset.listenersAdded) {
        dateInput.addEventListener("change", checkExistingAttendance);
        sessionSelect.addEventListener("change", checkExistingAttendance);
        dateInput.dataset.listenersAdded = "true";
    }
}

async function showStudentListScreen() {
    showScreen("student-list-screen");
    const studentListContainer = document.getElementById("student-list");
    studentListContainer.innerHTML = '<p class="loading-text">Loading students...</p>'; // Show loading message
    
    // Determine the default village to load students for
    const defaultVillage = user.role === 'teacher' ? user.village : user.assignedVillages[0];

    // Populate village select for student list screen
    populateVillageSelect('student-list-village-select', defaultVillage, async () => {
        const selectedVillage = document.getElementById('student-list-village-select').value;
        const studentsInSelectedVillage = await fetchStudentsByVillage(selectedVillage);
        await loadStudentList(studentsInSelectedVillage);
    });

    // Load students for the initially selected village
    const studentsToDisplay = await fetchStudentsByVillage(defaultVillage);
    await loadStudentList(studentsToDisplay);
}

// New helper function to fetch students for a specific village
async function fetchStudentsByVillage(village) {
    try {
        // API call to Netlify Function for Students sheet, filtered by village
        const data = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Students', village: village });
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error(`Error fetching students for village ${village}:`, error);
        return [];
    }
}


async function showAddStudentForm() {
    showScreen("add-edit-student-form-screen");
    document.getElementById("form-heading").innerText = "➕ Add New Student";
    await buildDynamicStudentForm(null); // Build an empty form for adding
}

async function showEditStudentForm(studentName) {
    showScreen("add-edit-student-form-screen");
    document.getElementById("form-heading").innerText = "✏️ Edit Student";
    const studentData = await fetchStudentData(studentName);
    if (studentData) {
        await buildDynamicStudentForm(studentData); // Build form with existing data
    } else {
        document.getElementById("dynamic-student-form-container").innerHTML = "<p class='loading-text'>Error loading student data for editing.</p>";
        document.getElementById("form-buttons").innerHTML = `<button class="secondary-button" onclick="showStudentListScreen()">↩️ Back to List</button>`;
    }
}

// Function to navigate back from success screen (e.g., after submit)
function goBack() {
    // Determine where to go back based on context
    // If coming from add/edit student form, go back to student list
    // Otherwise, go back to dashboard
    if (document.getElementById("add-edit-student-form-screen").style.display === 'flex') {
        showStudentListScreen(); // Go back to student list after adding/editing/cancelling
    } else {
        showScreen("teacher-dashboard-screen"); // Go back to dashboard after attendance submission/success
    }
    // Re-check attendance status if returning from a submission
    checkExistingAttendance();
}

// --- NEW: Attendance Reports Screen Functions (Phase 2 & 3) ---
function showAttendanceReportsScreen() {
    showScreen("attendance-reports-screen");
    const reportsVillageFilters = document.getElementById("reports-village-filters");
    const reportsStatsContainer = document.getElementById("reports-stats-container");
    
    reportsVillageFilters.innerHTML = '<p class="loading-text">Loading filters...</p>';
    reportsStatsContainer.innerHTML = '<p class="loading-text">Select a village to view reports.</p>';

    // Build village filter buttons
    const villages = user.assignedVillages || [];
    let filterButtonsHtml = '';

    if (villages.length === 0) {
        reportsVillageFilters.innerHTML = '<p class="loading-text">No villages assigned for reports.</p>';
        return;
    }

    // Add an "All Villages" button if there are multiple villages
    if (villages.length > 1) {
        filterButtonsHtml += `<button class="village-filter-button" data-village="all">All Villages</button>`;
    }

    // Add buttons for each assigned village
    villages.forEach(village => {
        filterButtonsHtml += `<button class="village-filter-button" data-village="${village}">${village}</button>`;
    });

    reportsVillageFilters.innerHTML = filterButtonsHtml;

    // Add event listeners to filter buttons
    document.querySelectorAll('.village-filter-button').forEach(button => {
        button.addEventListener('click', (event) => {
            // Remove active class from all buttons
            document.querySelectorAll('.village-filter-button').forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            event.target.classList.add('active');

            const selectedVillage = event.target.dataset.village;
            generateAttendanceReport(selectedVillage); // Trigger report generation
        });
    });

    // Automatically load report for the first village or "All" by default
    if (villages.length > 0) {
        const defaultReportVillage = villages.length > 1 ? "all" : villages[0];
        // Ensure "All Villages" button is active if selected
        if (defaultReportVillage === "all") {
             document.querySelector('.village-filter-button[data-village="all"]').classList.add('active');
        } else {
             document.querySelector(`.village-filter-button[data-village="${defaultReportVillage}"]`).classList.add('active');
        }
        generateAttendanceReport(defaultReportVillage);
    } else {
        reportsStatsContainer.innerHTML = '<p>No data to display reports.</p>';
    }
}

// Placeholder for report generation (will be expanded in Phase 3)
async function generateAttendanceReport(villageName = "all") {
    const reportsStatsContainer = document.getElementById("reports-stats-container");
    reportsStatsContainer.innerHTML = `<p class="loading-text">Generating report for ${villageName === 'all' ? 'all villages' : villageName}...</p>`;

    // Fetch all attendance data (filtered by village if not "all")
    let attendanceData = [];
    if (villageName === 'all') {
        // Fetch attendance for all assigned villages
        if (user.assignedVillages && user.assignedVillages.length > 0) {
            for (const village of user.assignedVillages) {
                const data = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Attendance', village: village });
                attendanceData = attendanceData.concat(data);
            }
        }
    } else {
        attendanceData = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Attendance', village: villageName });
    }

    // Fetch all student data (filtered by village if not "all")
    let studentData = [];
     if (villageName === 'all') {
        // Fetch students for all assigned villages
        if (user.assignedVillages && user.assignedVillages.length > 0) {
            for (const village of user.assignedVillages) {
                const data = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Students', village: village });
                studentData = studentData.concat(data);
            }
        }
    } else {
        studentData = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Students', village: villageName });
    }

    // --- Data Processing for Charts and Stats ---
    const totalStudentsInScope = studentData.length;
    
    // Group attendance by date and session
    const dailySessionStats = {}; // { 'YYYY-MM-DD': { 'Morning': { present: N, totalMarked: N }, 'Evening': { present: N, totalMarked: N } } }

    // Get last 7 days for chart labels
    const last7Days = Array.from({length: 7}).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0]; //YYYY-MM-DD
    }).reverse(); // To get chronological order

    last7Days.forEach(date => {
        dailySessionStats[date] = {
            'Morning': { present: 0, totalMarked: 0 },
            'Evening': { present: 0, totalMarked: 0 }
        };
    });

    attendanceData.forEach(record => {
        const date = record.date;
        const session = record.session; // 'Morning' or 'Evening'

        if (dailySessionStats[date] && dailySessionStats[date][session]) {
            dailySessionStats[date][session].totalMarked++;
            if (record.present === 'Y') {
                dailySessionStats[date][session].present++;
            }
        }
    });

    // Prepare data for Chart.js
    const chartLabels = last7Days.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); // e.g., "May 28"
    });

    const morningPresentData = [];
    const morningAbsentData = [];
    const eveningPresentData = [];
    const eveningAbsentData = [];

    last7Days.forEach(date => {
        const morningStats = dailySessionStats[date]?.Morning || { present: 0, totalMarked: 0 };
        const eveningStats = dailySessionStats[date]?.Evening || { present: 0, totalMarked: 0 };

        // For stacked bar, the 'absent' part is (total students in scope - present count)
        // The 'totalMarked' is not necessarily total students in scope.
        // Let's assume the gray bar should represent the total students in the selected village(s) (studentData.length)
        // and the colored bar is the present count. The 'absent' part is then `totalStudentsInScope - present`.
        
        morningPresentData.push(morningStats.present);
        morningAbsentData.push(totalStudentsInScope - morningStats.present); // Total students - present

        eveningPresentData.push(eveningStats.present);
        eveningAbsentData.push(totalStudentsInScope - eveningStats.present); // Total students - present
    });


    // --- Render Report HTML ---
    let reportHtml = `<h3>Report for ${villageName === 'all' ? 'All Assigned Villages' : villageName}</h3>`;
    reportHtml += `<p><strong>Total Unique Students in Scope:</strong> ${totalStudentsInScope}</p>`;
    reportHtml += `<p><strong>Total Attendance Records Processed:</strong> ${attendanceData.length}</p>`;

    // Add canvas element for the combined daily chart
    reportHtml += `
        <div class="chart-container">
            <h4>Daily Attendance (Last 7 Days - Morning & Evening)</h4>
            <canvas id="dailyAttendanceBarChart"></canvas>
        </div>
    `;

    reportsStatsContainer.innerHTML = reportHtml;

    // --- Render Chart ---
    // Destroy previous chart instances if they exist to prevent memory leaks/errors
    if (window.dailyBarChartInstance) window.dailyBarChartInstance.destroy();

    const dailyCtx = document.getElementById('dailyAttendanceBarChart').getContext('2d');
    window.dailyBarChartInstance = new Chart(dailyCtx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    label: 'Morning Present',
                    data: morningPresentData,
                    backgroundColor: 'rgba(79, 70, 229, 0.8)', // Blue for present
                    stack: 'morning',
                },
                {
                    label: 'Morning Absent',
                    data: morningAbsentData,
                    backgroundColor: 'rgba(107, 114, 128, 0.4)', // Gray for absent
                    stack: 'morning',
                },
                {
                    label: 'Evening Present',
                    data: eveningPresentData,
                    backgroundColor: 'rgba(34, 197, 94, 0.8)', // Green for present
                    stack: 'evening',
                },
                {
                    label: 'Evening Absent',
                    data: eveningAbsentData,
                    backgroundColor: 'rgba(107, 114, 128, 0.4)', // Gray for absent
                    stack: 'evening',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Allow charts to resize more freely
            scales: {
                x: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    max: 50, // Max Y-axis value
                    ticks: {
                        stepSize: 5, // Stops at 5, 10, 15...
                        callback: function(value) {
                            // Only show specific stops if they are multiples of 5 and within range
                            if (value % 5 === 0 && value >= 0 && value <= 50) {
                                return value;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Number of Students'
                    }
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y;
                            }
                            // Add extra info for total students in scope
                            if (context.dataset.stack === 'morning' && context.dataset.label.includes('Present')) {
                                return [label, `Total Students: ${totalStudentsInScope}`];
                            }
                            if (context.dataset.stack === 'evening' && context.dataset.label.includes('Present')) {
                                return [label, `Total Students: ${totalStudentsInScope}`];
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// --- Attendance Marking Functions ---
function checkExistingAttendance() {
  const date = document.getElementById("date").value;
  const session = document.getElementById("session").value;
  const village = document.getElementById("attendance-village-select").value; // Get selected village
  const submitBtn = document.getElementById("submit-btn");

  if (!date || !session || !village) {
      submitBtn.disabled = true;
      submitBtn.innerText = "Select Date, Session, and Village";
      submitBtn.classList.add("disabled");
      return;
  }

  // API call to Netlify Function for Attendance sheet
  makeNetlifyFunctionRequest('GET', null, { sheet: 'Attendance', date: date, session: session, village: village })
    .then(data => {
      attendanceExists = data.length > 0;
      if (attendanceExists) {
        submitBtn.disabled = true;
        submitBtn.innerText = "✅ Already Submitted";
        submitBtn.classList.add("disabled");
      } else {
        submitBtn.disabled = false;
        submitBtn.innerText = "📤 Submit Attendance";
        submitBtn.classList.remove("disabled");
      }
    })
    .catch(error => {
        console.error("Error checking existing attendance:", error);
        alert("Could not check attendance status. Please try again.");
        submitBtn.disabled = true;
        submitBtn.innerText = "Error Checking Status";
        submitBtn.classList.add("disabled");
    });
}

function loadStudentsForAttendance(village) {
  // Ensure a village is selected before loading students
  if (!village) {
      document.getElementById("students").innerHTML = "<p>Please select a village to load students.</p>";
      return;
  }
  // API call to Netlify Function for Students sheet
  makeNetlifyFunctionRequest('GET', null, { sheet: 'Students', village: village })
    .then(data => {
      const list = data.map(s =>
        `<label><input type='checkbox' data-name='${s.student_name}' /><span>${s.student_name}</span></label>`
      ).join('');
      document.getElementById("students").innerHTML = list;
    })
    .catch(error => {
        console.error("Error loading students for attendance:", error);
        document.getElementById("students").innerHTML = "<p>Error loading student list.</p>";
    });
}

function submit() {
  const session = document.getElementById("session").value;
  const date = document.getElementById("date").value;
  const time = new Date().toLocaleTimeString();
  const marked_by = user.email;
  const village = document.getElementById("attendance-village-select").value; // Get selected village

  const rows = Array.from(document.querySelectorAll("#attendance-screen input[data-name]")).map(input => ({
    date, session,
    student_name: input.dataset.name,
    village,
    present: input.checked ? "Y" : "N",
    marked_by,
    "time recorded": time
  }));

  if (rows.length === 0) {
      alert("No students loaded to submit attendance for.");
      return;
  }
  if (!village) {
      alert("Please select a village before submitting attendance.");
      return;
  }

  // Disable button to prevent multiple submissions
  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.innerText = "Submitting...";
  submitBtn.classList.add("disabled");

  // API call to Netlify Function for Attendance sheet (POST)
  makeNetlifyFunctionRequest('POST', { data: rows }, { sheet: 'Attendance' })
  .then(data => {
    if (data.error) {
        throw new Error(data.error); 
    }
    document.getElementById("success-message").innerText = "Attendance submitted successfully!";
    showScreen("success-screen");
  })
  .catch(error => {
    console.error("Attendance submission error:", error);
    document.getElementById("success-message").innerText = "Error submitting attendance: " + error.message;
    showScreen("success-screen"); 
  })
  .finally(() => {
    checkExistingAttendance();
  });
}

// --- Student List & Add/Edit Student Functions ---

async function fetchStudentData(studentName) {
    try {
        // API call to Netlify Function for Students sheet (GET)
        const data = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Students', student_name: studentName });
        return data.length > 0 ? data[0] : null;
    } catch (error) {
        console.error("Error fetching student data:", error);
        return null;
    }
}

async function loadStudentList(students) { 
    const studentListContainer = document.getElementById("student-list");
    
    if (!students || students.length === 0) {
        studentListContainer.innerHTML = '<p class="loading-text">No students found for your assigned villages.</p>';
        return;
    }

    const studentCardsHtml = await Promise.all(students.map(async (s) => {
        const attendancePercentage = await calculateAttendancePercentage(s.student_name, s.village); 
        return `
            <div class="student-card">
                <span class="student-icon">👤</span>
                <div class="student-info">
                    <div class="student-name">${s.student_name}</div>
                    <div class="student-class">Class: ${s.grade || 'N/A'}</div> </div>
                ${createPercentageRingSvg(attendancePercentage)}
                <button class="edit-student-btn" onclick="showEditStudentForm('${s.student_name.replace(/'/g, "\\'")}')">✏️</button>
            </div>
        `;
    }));
    studentListContainer.innerHTML = studentCardsHtml.join('');

}

async function calculateAttendancePercentage(studentName, village) {
    const today = new Date();
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(today.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0); 
    today.setHours(23, 59, 59, 999); 

    try {
        // API call to Netlify Function for Attendance sheet (GET)
        const allAttendance = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Attendance', student_name: studentName, village: village });

        const recentAttendance = allAttendance.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate >= oneWeekAgo && recordDate <= today;
        });

        const totalSessions = recentAttendance.length;
        const presentSessions = recentAttendance.filter(record => record.present === 'Y').length;

        if (totalSessions === 0) {
            return 0;
        }

        return Math.round((presentSessions / totalSessions) * 100);

    } catch (error) {
        console.error(`Error calculating attendance for ${studentName}:`, error);
        return 'N/A'; 
    }
}

// Function to generate the SVG for the percentage ring
function createPercentageRingSvg(percentage) {
    const radius = 20; 
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - percentage / 100);
    const ringColorClass = percentage >= 60 ? 'blue-ring' : 'red-ring';
    const textColorClass = percentage >= 60 ? 'blue-ring-text' : 'red-ring-text'; 

    return `
        <div class="percentage-ring-container">
            <svg width="50" height="50" viewBox="0 0 50 50">
                <circle class="percentage-ring-bg" cx="25" cy="25" r="${radius}"></circle>
                <circle class="percentage-ring-progress ${ringColorClass}"
                        cx="25" cy="25" r="${radius}"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${strokeDashoffset}"></circle>
                <text class="percentage-text ${textColorClass}" x="25" y="25" text-anchor="middle" dominant-baseline="middle">${percentage}%</text>
            </svg>
        </div>
    `;
}

// --- Dynamic Form Building and Submission ---
async function buildDynamicStudentForm(studentData = null) {
    const formContainer = document.getElementById("dynamic-student-form-container");
    const formButtonsContainer = document.getElementById("form-buttons");
    formContainer.innerHTML = '<p class="loading-text">Building form...</p>';
    formButtonsContainer.innerHTML = ''; 

    try {
        // Define the desired order and configuration for form fields
        const fieldConfig = {
            'student_name': { label: 'Full Name', type: 'text', maxLength: 50, required: true },
            'age': { label: 'Age (1-20)', type: 'number', min: 1, max: 20, required: false },
            'grade': { label: 'Class (1-12)', type: 'number', min: 1, max: 12, required: false },
            'gender': { label: 'Gender', type: 'select', options: ['M', 'F'], required: true },
            'village': { label: 'Village', type: 'select', options: user.assignedVillages, required: true, readOnly: false },
            'notes': { label: 'Notes (max 100 chars)', type: 'textarea', maxLength: 100, required: false },
            'record_added': { label: 'Record Added Date', type: 'date', required: false } 
        };

        let formHtml = '';
        let studentNameForUpdate = ''; 

        // Iterate over the keys of fieldConfig to ensure all desired fields are rendered
        for (const header in fieldConfig) {
            const config = fieldConfig[header];
            
            const id = `form-field-${header}`;
            let value = studentData ? (studentData[header] || '') : '';

            // Special handling for 'record_added' and 'village' in add mode
            if (!studentData) { 
                if (header === 'village') {
                    value = user.village; 
                } else if (header === 'record_added') {
                    value = new Date().toISOString().split('T')[0]; 
                }
            } else { 
                if (header === 'record_added' && value) {
                    try {
                        const dateObj = new Date(value);
                        if (!isNaN(dateObj.getTime())) { 
                            value = dateObj.toISOString().split('T')[0];
                        } else {
                            value = ''; 
                        }
                    } catch (e) {
                        console.warn(`Could not parse date '${value}' for record_added.`, e);
                        value = '';
                    }
                }
            }

            // Determine readOnly attribute based on field config and whether it's edit/add mode
            let currentReadOnlyAttr = '';
            if (config.readOnly || (header === 'record_added' && studentData)) {
                currentReadOnlyAttr = 'readonly';
            }

            const requiredAttr = config.required ? 'required' : '';
            const placeholder = config.label.replace(/\s*\(.*\)/, ''); 

            formHtml += `<label for="${id}" class="left-text">${config.label}:</label>`;

            if (config.type === 'select') {
                formHtml += `<select id="${id}" ${requiredAttr} ${currentReadOnlyAttr}>`;
                formHtml += `<option value="">Select ${placeholder}</option>`;
                if (header === 'village' && config.options) {
                    config.options.forEach(optionValue => {
                        const selected = (value === optionValue) ? 'selected' : '';
                        formHtml += `<option value="${optionValue}" ${selected}>${optionValue}</option>`;
                    });
                } else if (config.options) { 
                    config.options.forEach(optionValue => {
                        const selected = (value === optionValue) ? 'selected' : '';
                        formHtml += `<option value="${optionValue}" ${selected}>${optionValue}</option>`;
                    });
                }
                formHtml += `</select>`;
            } else if (config.type === 'textarea') {
                formHtml += `<textarea id="${id}" maxlength="${config.maxLength}" placeholder="${placeholder}" ${requiredAttr} ${currentReadOnlyAttr}>${value}</textarea>`;
            } else {
                formHtml += `<input type="${config.type}" id="${id}" value="${value}" placeholder="${placeholder}"
                                    ${config.min ? `min="${config.min}"` : ''}
                                    ${config.max ? `max="${config.max}"` : ''}
                                    ${config.maxLength ? `maxlength="${config.maxLength}"` : ''}
                                    ${requiredAttr} ${currentReadOnlyAttr} />`;
            }

            if (header === 'student_name') {
                studentNameForUpdate = value; 
            }
        }

        formContainer.innerHTML = formHtml;

        // Add buttons
        if (studentData) {
            // Edit mode
            formButtonsContainer.innerHTML = `
                <button onclick="updateStudent('${studentNameForUpdate.replace(/'/g, "\\'")}')">💾 Save Changes</button>
                <button class="secondary-button" onclick="showStudentListScreen()">↩️ Cancel</button>
            `;
        } else {
            // Add mode
            formButtonsContainer.innerHTML = `
                <button onclick="addStudent()">💾 Add Student</button>
                <button class="secondary-button" onclick="showStudentListScreen()">↩️ Cancel</button>
            `;
        }

    } catch (error) {
        console.error("Error building dynamic form:", error);
        formContainer.innerHTML = '<p class="loading-text">Error loading form fields. An unexpected error occurred.</p>';
        formButtonsContainer.innerHTML = `<button class="secondary-button" onclick="showStudentListScreen()">↩️ Back to List</button>`;
    }
}


function getFormData() {
    const formData = {};
    const formFields = document.querySelectorAll('#dynamic-student-form-container input, #dynamic-student-form-container select, #dynamic-student-form-container textarea');
    formFields.forEach(field => {
        const header = field.id.replace('form-field-', '');
        formData[header] = field.value;
    });
    console.log("getFormData() output:", formData); 
    return formData;
}

function validateFormData(data) {
    // Basic validation based on fieldConfig
    const fieldConfig = {
        'student_name': { label: 'Full Name', required: true },
        'village': { label: 'Village', required: true },
        'gender': { label: 'Gender', required: true },
        'age': { label: 'Age (1-20)', type: 'number', min: 1, max: 20, required: false },
        'grade': { label: 'Class (1-12)', type: 'number', min: 1, max: 12, required: false },
        'notes': { label: 'Notes (max 100 chars)', maxLength: 100, required: false },
        'record_added': { label: 'Record Added Date', required: false }
    };

    for (const key in fieldConfig) {
        const config = fieldConfig[key];
        const value = data[key];

        const formFieldElement = document.getElementById(`form-field-${key}`);
        const isReadOnly = formFieldElement ? formFieldElement.readOnly : false;

        if (config.required && !value && !isReadOnly) {
            alert(`Please enter ${config.label}.`);
            return false;
        }

        if (config.type === 'number' && value !== '') {
            const numValue = parseInt(value);
            if (isNaN(numValue) || numValue < config.min || numValue > config.max) {
                alert(`Please enter a valid ${config.label} between ${config.min} and ${config.max}.`);
                return false;
            }
        }

        if (config.maxLength && value && value.length > config.maxLength) {
            alert(`${config.label} cannot exceed ${config.maxLength} characters.`);
            return false;
        }
    }
    return true;
}

async function addStudent() {
    const newStudentData = getFormData();
    
    if (!validateFormData(newStudentData)) {
        return;
    }

    const saveBtn = document.querySelector("#form-buttons button[onclick='addStudent()']");
    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";
    saveBtn.classList.add("disabled");

    console.log("Data being sent for add:", newStudentData);

    try {
        const res = await makeNetlifyFunctionRequest('POST', { data: [newStudentData] }, { sheet: 'Students' });
        const data = res;

        console.log("Apps Script response on add:", data);

        if (data.error) {
            throw new Error(data.error);
        }
        document.getElementById("success-message").innerText = "Student added successfully!";
        showScreen("success-screen");
    } catch (error) {
        console.error("Error adding student:", error);
        document.getElementById("success-message").innerText = "Error adding student: " + error.message;
        showScreen("success-screen");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "💾 Add Student";
        saveBtn.classList.remove("disabled");
    }
}

async function updateStudent(originalStudentName) {
    const updatedStudentData = getFormData();
    
    if (!validateFormData(updatedStudentData)) {
        return;
    }

    const saveBtn = document.querySelector("#form-buttons button[onclick*='updateStudent']");
    saveBtn.disabled = true;
    saveBtn.innerText = "Saving Changes...";
    saveBtn.classList.add("disabled");

    console.log("Data being sent for update:", updatedStudentData);

    try {
        const res = await makeNetlifyFunctionRequest('PUT', updatedStudentData, { 
            sheet: 'Students', 
            searchColumn: 'student_name', 
            searchValue: originalStudentName 
        });
        const data = res;

        console.log("Apps Script response on update:", data);

        if (data.error) {
            throw new Error(data.error);
        }
        document.getElementById("success-message").innerText = "Student updated successfully!";
        showScreen("success-screen");
    } catch (error) {
        console.error("Error updating student:", error);
        document.getElementById("success-message").innerText = "Error updating student: " + error.message;
        showScreen("success-screen");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "💾 Save Changes";
        saveBtn.classList.remove("disabled");
    }
}
