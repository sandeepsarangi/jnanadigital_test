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
        } else if (user.village) { // Ensure teachers also have assignedVillages as an array
            user.assignedVillages = [user.village.trim()]; 
        } else {
            user.assignedVillages = []; // Handle cases where village might be empty/undefined
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
    if (user && user.email) { // Check if user and user.email are defined
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
    } else { // Fallback if user or user.email is not set
        user = null;
        alert("You have been signed out (local session cleared).");
        showScreen('login-screen');
        document.getElementById('signout-button').style.display = 'none';
        document.getElementById("dashboard-welcome").innerText = "";
    }
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
        console.error("Netlify Function request failed:", error, "URL:", url, "Options:", options);
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
  const screenElement = document.getElementById(screenId);
  if (screenElement) {
      screenElement.style.display = 'flex';
  } else {
      console.error(`Screen with ID "${screenId}" not found.`);
  }
}

function goBackToDashboard() {
    showScreen("teacher-dashboard-screen");
}

// New function to populate village select dropdowns
function populateVillageSelect(selectElementId, defaultVillage = null, onChangeCallback = null) {
    const selectElement = document.getElementById(selectElementId);
    if (!selectElement) {
        console.error(`Select element with ID "${selectElementId}" not found.`);
        return;
    }
    selectElement.innerHTML = ''; // Clear existing options

    const villagesToPopulate = user && user.assignedVillages ? user.assignedVillages : [];


    if (villagesToPopulate.length === 0) {
        const noVillageOption = document.createElement('option');
        noVillageOption.value = "";
        noVillageOption.textContent = 'No villages assigned';
        selectElement.appendChild(noVillageOption);
        selectElement.disabled = true;
        if (onChangeCallback) onChangeCallback(); // Call callback even if no villages
        return;
    }
    
    // Add a "Select Village" prompt if not for reports screen or if desired
    if (selectElementId !== 'report-village-select' || villagesToPopulate.length > 1) {
        const promptOption = document.createElement('option');
        promptOption.value = "";
        promptOption.textContent = "Select Village";
        selectElement.appendChild(promptOption);
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

    selectElement.disabled = false;

    if (onChangeCallback) {
        selectElement.onchange = onChangeCallback;
    }
}


function showAttendanceScreen() {
    showScreen("attendance-screen");
    const villageSelect = document.getElementById('attendance-village-select');
    const initialVillage = user && user.village ? user.village : (user && user.assignedVillages && user.assignedVillages.length > 0 ? user.assignedVillages[0] : "");

    populateVillageSelect('attendance-village-select', initialVillage, () => {
        loadStudentsForAttendance(document.getElementById('attendance-village-select').value);
        checkExistingAttendance();
    });
    
    if (initialVillage) {
        loadStudentsForAttendance(initialVillage);
    } else {
         document.getElementById("students").innerHTML = "<p class='loading-text'>Please select a village to load students.</p>";
    }
    checkExistingAttendance();

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
    studentListContainer.innerHTML = '<p class="loading-text">Loading students...</p>'; 
    
    const defaultVillage = user && user.role === 'teacher' ? user.village : (user && user.assignedVillages && user.assignedVillages.length > 0 ? user.assignedVillages[0] : null);

    populateVillageSelect('student-list-village-select', defaultVillage, async () => {
        const selectedVillage = document.getElementById('student-list-village-select').value;
        if (selectedVillage) {
            studentListContainer.innerHTML = '<p class="loading-text">Loading students...</p>';
            const studentsInSelectedVillage = await fetchStudentsByVillage(selectedVillage);
            await loadStudentList(studentsInSelectedVillage);
        } else {
            studentListContainer.innerHTML = '<p class="loading-text">Please select a village.</p>';
        }
    });

    if (defaultVillage) {
        const studentsToDisplay = await fetchStudentsByVillage(defaultVillage);
        await loadStudentList(studentsToDisplay);
    } else if (user && user.assignedVillages && user.assignedVillages.length === 0) {
         studentListContainer.innerHTML = '<p class="loading-text">No villages assigned.</p>';
    } else {
        studentListContainer.innerHTML = '<p class="loading-text">Please select a village.</p>';
    }
}

async function fetchStudentsByVillage(village) {
    if (!village) return []; // Do not fetch if village is empty or null
    try {
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
    await buildDynamicStudentForm(null);
}

async function showEditStudentForm(studentName) {
    showScreen("add-edit-student-form-screen");
    document.getElementById("form-heading").innerText = "✏️ Edit Student";
    const studentData = await fetchStudentData(studentName);
    if (studentData) {
        await buildDynamicStudentForm(studentData);
    } else {
        document.getElementById("dynamic-student-form-container").innerHTML = "<p class='loading-text'>Error loading student data for editing.</p>";
        document.getElementById("form-buttons").innerHTML = `<button class="secondary-button" onclick="showStudentListScreen()">↩️ Back to List</button>`;
    }
}

function goBack() {
    const addEditScreen = document.getElementById("add-edit-student-form-screen");
    const successScreen = document.getElementById("success-screen");

    if (successScreen && successScreen.style.display === 'flex') {
        const formHeading = document.getElementById("form-heading");
        if (formHeading && (formHeading.innerText.includes("Add New Student") || formHeading.innerText.includes("Edit Student"))) {
            showStudentListScreen();
        } else {
            showScreen("teacher-dashboard-screen");
        }
    } else if (addEditScreen && addEditScreen.style.display === 'flex') { 
        showStudentListScreen(); 
    } else { 
        showScreen("teacher-dashboard-screen"); 
    }

    if (document.getElementById("attendance-screen").style.display === 'flex') {
        checkExistingAttendance();
    }
}

// --- MODIFIED Attendance Reports Screen Function ---
function showAttendanceReportsScreen() {
    showScreen("attendance-reports-screen");
    const reportsVillageFilters = document.getElementById("reports-village-filters");
    const reportsStatsContainer = document.getElementById("reports-stats-container");

    if (!reportsVillageFilters || !reportsStatsContainer) {
        console.error("Report screen elements not found!");
        return;
    }
    
    reportsVillageFilters.innerHTML = ''; 
    reportsStatsContainer.innerHTML = '<p class="loading-text">Select a filter to view reports.</p>';

    if (!user || !user.assignedVillages) {
        reportsVillageFilters.innerHTML = '<p class="loading-text">User data or assigned villages not available.</p>';
        reportsStatsContainer.innerHTML = ''; 
        return;
    }

    const villages = user.assignedVillages;

    const allBtn = document.createElement('button');
    allBtn.id = 'report-all-villages-btn';
    allBtn.classList.add('village-filter-button'); 
    allBtn.textContent = 'All Villages';
    reportsVillageFilters.appendChild(allBtn);

    const villageSelect = document.createElement('select');
    villageSelect.id = 'report-village-select'; 
    reportsVillageFilters.appendChild(villageSelect);

    if (villages.length === 0) {
        reportsVillageFilters.innerHTML = '<p class="loading-text">No villages assigned for reports.</p>';
        allBtn.disabled = true; 
        villageSelect.disabled = true; 
        const noVillageOption = document.createElement('option');
        noVillageOption.textContent = "No Villages";
        villageSelect.appendChild(noVillageOption);
        reportsStatsContainer.innerHTML = ''; 
        return;
    }

    const defaultOption = document.createElement('option');
    defaultOption.value = ""; 
    defaultOption.textContent = "Select Specific Village";
    villageSelect.appendChild(defaultOption);

    villages.forEach(village => {
        const option = document.createElement('option');
        option.value = village;
        option.textContent = village;
        villageSelect.appendChild(option);
    });
    
    allBtn.disabled = false;
    villageSelect.disabled = false;

    allBtn.addEventListener('click', () => {
        villageSelect.value = ""; 
        allBtn.classList.add('active');
        generateAttendanceReport("all");
    });

    villageSelect.addEventListener('change', () => {
        const selectedVillage = villageSelect.value;
        if (selectedVillage) { 
            allBtn.classList.remove('active');
            generateAttendanceReport(selectedVillage);
        } else { 
            if (!allBtn.classList.contains('active')) { 
                allBtn.click(); 
            }
        }
    });

    allBtn.click(); 
}


async function generateAttendanceReport(villageName = "all") {
    const reportsStatsContainer = document.getElementById("reports-stats-container");
    reportsStatsContainer.innerHTML = `<p class="loading-text">Generating report for ${villageName === 'all' ? 'all villages' : villageName}...</p>`;

    let attendanceData = [];
    const villagesToQuery = villageName === 'all' ? (user && user.assignedVillages ? user.assignedVillages : []) : [villageName];
    
    try {
        for (const village of villagesToQuery) {
            if (village) { 
                const data = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Attendance', village: village });
                attendanceData = attendanceData.concat(data);
            }
        }
    } catch (error) {
        console.error("Error fetching attendance data for report:", error);
        reportsStatsContainer.innerHTML = `<p>Error fetching attendance data. Please try again.</p>`;
        return;
    }

    let studentData = [];
    try {
        for (const village of villagesToQuery) {
             if (village) { 
                const data = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Students', village: village });
                studentData = studentData.concat(data);
            }
        }
    } catch (error) {
        console.error("Error fetching student data for report:", error);
    }

    const totalStudentsInScope = studentData.length;
    
    const dailySessionStats = {}; 
    const last7Days = Array.from({length: 7}).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0]; 
    }).reverse(); 

    last7Days.forEach(date => {
        dailySessionStats[date] = {
            'Morning': { present: 0, totalMarked: 0, studentsInvolved: new Set() },
            'Evening': { present: 0, totalMarked: 0, studentsInvolved: new Set() }
        };
    });

    attendanceData.forEach(record => {
        const date = record.date;
        const session = record.session; 
        const studentName = record.student_name;

        if (dailySessionStats[date] && dailySessionStats[date][session]) {
            dailySessionStats[date][session].totalMarked++;
            dailySessionStats[date][session].studentsInvolved.add(studentName);
            if (record.present === 'Y') {
                dailySessionStats[date][session].present++;
            }
        }
    });
    
    // Calculate average percentages
    let morningPercentages = [];
    let eveningPercentages = [];

    last7Days.forEach(date => {
        const morningStat = dailySessionStats[date]['Morning'];
        if (morningStat.studentsInvolved.size > 0) {
            morningPercentages.push((morningStat.present / morningStat.studentsInvolved.size) * 100);
        }

        const eveningStat = dailySessionStats[date]['Evening'];
        if (eveningStat.studentsInvolved.size > 0) {
            eveningPercentages.push((eveningStat.present / eveningStat.studentsInvolved.size) * 100);
        }
    });

    const avgMorningPercentage = morningPercentages.length > 0 ? (morningPercentages.reduce((a, b) => a + b, 0) / morningPercentages.length).toFixed(1) : "N/A";
    const avgEveningPercentage = eveningPercentages.length > 0 ? (eveningPercentages.reduce((a, b) => a + b, 0) / eveningPercentages.length).toFixed(1) : "N/A";


    const chartLabels = last7Days.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const morningPresentData = [];
    const morningAbsentData = [];
    const eveningPresentData = [];
    const eveningAbsentData = [];

    last7Days.forEach(date => {
        const morningStats = dailySessionStats[date]?.Morning || { present: 0, studentsInvolved: new Set() };
        const eveningStats = dailySessionStats[date]?.Evening || { present: 0, studentsInvolved: new Set() };
        
        const morningStudentsInvolvedCount = morningStats.studentsInvolved.size;
        const eveningStudentsInvolvedCount = eveningStats.studentsInvolved.size;

        morningPresentData.push(morningStats.present);
        morningAbsentData.push(morningStudentsInvolvedCount > 0 ? morningStudentsInvolvedCount - morningStats.present : 0);

        eveningPresentData.push(eveningStats.present);
        eveningAbsentData.push(eveningStudentsInvolvedCount > 0 ? eveningStudentsInvolvedCount - eveningStats.present : 0);
    });

    // Construct HTML for stats and chart
    let reportHtml = `<h3>Report for ${villageName === 'all' ? 'All Assigned Villages' : villageName}</h3>`;
    
    reportHtml += `<div class="report-summary-stats">`;
    reportHtml += `  <div class="stat-item">`;
    reportHtml += `    <span class="stat-label">Total Students</span>`;
    reportHtml += `    <span class="stat-value">${totalStudentsInScope}</span>`;
    reportHtml += `  </div>`;
    reportHtml += `  <div class="stat-item">`;
    reportHtml += `    <span class="stat-label">Avg. Morning Attendance (7d)</span>`;
    reportHtml += `    <span class="stat-value">${avgMorningPercentage}${avgMorningPercentage !== "N/A" ? "%" : ""}</span>`;
    reportHtml += `  </div>`;
    reportHtml += `  <div class="stat-item">`;
    reportHtml += `    <span class="stat-label">Avg. Evening Attendance (7d)</span>`;
    reportHtml += `    <span class="stat-value">${avgEveningPercentage}${avgEveningPercentage !== "N/A" ? "%" : ""}</span>`;
    reportHtml += `  </div>`;
    reportHtml += `</div>`;

    reportHtml += `
        <div class="chart-container">
            <h4>Daily Attendance (Last 7 Days - Morning & Evening)</h4>
            <canvas id="dailyAttendanceBarChart"></canvas>
        </div>
    `;

    reportsStatsContainer.innerHTML = reportHtml;

    if (window.dailyBarChartInstance) window.dailyBarChartInstance.destroy();

    const canvasElement = document.getElementById('dailyAttendanceBarChart');
    if (typeof Chart === 'undefined' || !canvasElement) {
        console.error("Chart.js not loaded or canvas element 'dailyAttendanceBarChart' not found.");
        reportsStatsContainer.innerHTML += "<p style='color:red;'>Could not render chart. Chart library or canvas missing.</p>";
        return;
    }
    const dailyCtx = canvasElement.getContext('2d');

    window.dailyBarChartInstance = new Chart(dailyCtx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    label: 'Morning Present',
                    data: morningPresentData,
                    backgroundColor: 'rgba(79, 70, 229, 0.8)', 
                    stack: 'morning',
                },
                {
                    label: 'Morning Absent (of marked)',
                    data: morningAbsentData,
                    backgroundColor: 'rgba(107, 114, 128, 0.4)', 
                    stack: 'morning',
                },
                {
                    label: 'Evening Present',
                    data: eveningPresentData,
                    backgroundColor: 'rgba(34, 197, 94, 0.8)', 
                    stack: 'evening',
                },
                {
                    label: 'Evening Absent (of marked)',
                    data: eveningAbsentData,
                    backgroundColor: 'rgba(107, 114, 128, 0.4)', 
                    stack: 'evening',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Date' }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: 'Number of Students Marked' },
                    ticks: { 
                        stepSize: Math.max(1, Math.ceil(Math.max(1, ...morningPresentData, ...morningAbsentData, ...eveningPresentData, ...eveningAbsentData) / 10)) 
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
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) { label += context.parsed.y; }
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
      const villageSelect = document.getElementById("attendance-village-select");
      const village = villageSelect ? villageSelect.value : null; 
      const submitBtn = document.getElementById("submit-btn");

      if (!date || !session || !village) {
          if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.innerText = "Select Date, Session, and Village";
              submitBtn.classList.add("disabled");
          }
          return;
      }

      makeNetlifyFunctionRequest('GET', null, { sheet: 'Attendance', date: date, session: session, village: village })
        .then(data => {
          attendanceExists = data.length > 0;
          if (submitBtn) {
              if (attendanceExists) {
                submitBtn.disabled = true;
                submitBtn.innerText = "✅ Already Submitted";
                submitBtn.classList.add("disabled");
              } else {
                submitBtn.disabled = false;
                submitBtn.innerText = "📤 Submit Attendance";
                submitBtn.classList.remove("disabled");
              }
          }
        })
        .catch(error => {
            console.error("Error checking existing attendance:", error);
            alert("Could not check attendance status. Please try again.");
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = "Error Checking Status";
                submitBtn.classList.add("disabled");
            }
        });
    }

    function loadStudentsForAttendance(village) {
      const studentsContainer = document.getElementById("students");
      if (!village) {
          studentsContainer.innerHTML = "<p class='loading-text'>Please select a village to load students.</p>";
          return;
      }
      studentsContainer.innerHTML = "<p class='loading-text'>Loading students...</p>";
      makeNetlifyFunctionRequest('GET', null, { sheet: 'Students', village: village })
        .then(data => {
          if (data && data.length > 0) {
            const list = data.map(s =>
                `<label><input type='checkbox' data-name='${s.student_name}' checked /><span>${s.student_name}</span></label>` // Default to checked
            ).join('');
            studentsContainer.innerHTML = list;
          } else {
            studentsContainer.innerHTML = "<p class='loading-text'>No students found in this village.</p>";
          }
        })
        .catch(error => {
            console.error("Error loading students for attendance:", error);
            studentsContainer.innerHTML = "<p class='loading-text'>Error loading student list.</p>";
        });
    }

    function submit() { 
      const session = document.getElementById("session").value;
      const date = document.getElementById("date").value;
      const time = new Date().toLocaleTimeString();
      const marked_by = user ? user.email : 'unknown_user';
      const village = document.getElementById("attendance-village-select").value;

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

      const submitBtn = document.getElementById("submit-btn");
      submitBtn.disabled = true;
      submitBtn.innerText = "Submitting...";
      submitBtn.classList.add("disabled");

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
            studentListContainer.innerHTML = '<p class="loading-text">No students found for the selected village.</p>';
            return;
        }
    
        const studentCardsHtml = await Promise.all(students.map(async (s) => {
            const studentName = s.student_name || "Unknown Student";
            const studentVillage = s.village || (user && user.village ? user.village : (user && user.assignedVillages && user.assignedVillages.length > 0 ? user.assignedVillages[0] : "Unknown Village"));
            const attendancePercentage = await calculateAttendancePercentage(studentName, studentVillage); 
            return `
                <div class="student-card">
                    <span class="student-icon">👤</span>
                    <div class="student-info">
                        <div class="student-name">${studentName}</div>
                        <div class="student-class">Class: ${s.grade || 'N/A'}</div> </div>
                    ${createPercentageRingSvg(attendancePercentage)}
                    <button class="edit-student-btn" onclick="showEditStudentForm('${studentName.replace(/'/g, "\\'")}')">✏️</button>
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
            const allAttendance = await makeNetlifyFunctionRequest('GET', null, { sheet: 'Attendance', student_name: studentName, village: village });
    
            const recentAttendance = allAttendance.filter(record => {
                if (!record.date || typeof record.date !== 'string') return false;
                try {
                    const recordDate = new Date(record.date);
                    return recordDate >= oneWeekAgo && recordDate <= today;
                } catch (e) {
                    console.warn(`Invalid date format for record: ${record.date}`);
                    return false;
                }
            });
    
            const totalSessions = recentAttendance.length;
            const presentSessions = recentAttendance.filter(record => record.present === 'Y').length;
    
            if (totalSessions === 0) {
                return 0;
            }
    
            return Math.round((presentSessions / totalSessions) * 100);
    
        } catch (error) {
            console.error(`Error calculating attendance for ${studentName} in ${village}:`, error);
            return 0; 
        }
    }
    
    function createPercentageRingSvg(percentage) {
        const radius = 20; 
        const circumference = 2 * Math.PI * radius;
        const numericPercentage = typeof percentage === 'number' ? percentage : 0;
        const offset = circumference - (numericPercentage / 100) * circumference;
        const ringColorClass = numericPercentage >= 60 ? 'blue-ring' : 'red-ring';
        const textColorClass = numericPercentage >= 60 ? 'blue-ring-text' : 'red-ring-text'; 
    
        return `
            <div class="percentage-ring-container">
                <svg width="50" height="50" viewBox="0 0 50 50">
                    <circle class="percentage-ring-bg" cx="25" cy="25" r="${radius}"></circle>
                    <circle class="percentage-ring-progress ${ringColorClass}"
                            cx="25" cy="25" r="${radius}"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${offset}"></circle>
                    <text class="percentage-text ${textColorClass}" x="25" y="25" text-anchor="middle" dominant-baseline="middle">${numericPercentage}%</text>
                </svg>
            </div>
        `;
    }
    
    async function buildDynamicStudentForm(studentData = null) {
        const formContainer = document.getElementById("dynamic-student-form-container");
        const formButtonsContainer = document.getElementById("form-buttons");
        formContainer.innerHTML = '<p class="loading-text">Building form...</p>';
        formButtonsContainer.innerHTML = ''; 
    
        try {
            const fieldConfig = {
                'student_name': { label: 'Full Name', type: 'text', maxLength: 50, required: true },
                'age': { label: 'Age (1-20)', type: 'number', min: 1, max: 20, required: false },
                'grade': { label: 'Class (1-12)', type: 'number', min: 1, max: 12, required: false },
                'gender': { label: 'Gender', type: 'select', options: ['M', 'F'], required: true },
                'village': { label: 'Village', type: 'select', options: user && user.assignedVillages ? user.assignedVillages : [], required: true, readOnly: false },
                'notes': { label: 'Notes (max 100 chars)', type: 'textarea', maxLength: 100, required: false },
                'record_added': { label: 'Record Added Date', type: 'date', required: false, readOnly: true } 
            };
    
            let formHtml = '';
            let studentNameForUpdate = ''; 
    
            for (const header in fieldConfig) {
                const config = fieldConfig[header];
                const id = `form-field-${header}`;
                let value = studentData ? (studentData[header] || '') : '';
    
                if (!studentData) { 
                    if (header === 'village' && user && user.assignedVillages && user.assignedVillages.length === 1) { 
                        value = user.assignedVillages[0];
                    } else if (header === 'village' && user && user.village && user.assignedVillages && !user.assignedVillages.includes(user.village)) { 
                         value = user.village; 
                    }
                    if (header === 'record_added') {
                        value = new Date().toISOString().split('T')[0]; 
                    }
                } else { 
                    if (header === 'record_added' && value) {
                        try {
                            const dateObj = new Date(value);
                            value = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : '';
                        } catch (e) { value = ''; }
                    }
                }
    
                let currentReadOnlyAttr = (config.readOnly || (header === 'record_added')) ? 'readonly' : ''; 
                const requiredAttr = config.required ? 'required' : '';
                const placeholder = config.label.replace(/\s*\(.*\)/, ''); 
    
                formHtml += `<label for="${id}" class="left-text">${config.label}:</label>`;
    
                if (config.type === 'select') {
                    formHtml += `<select id="${id}" ${requiredAttr} ${currentReadOnlyAttr}>`;
                    formHtml += `<option value="">Select ${placeholder}</option>`;
                    const optionsSource = (header === 'village' && user && user.assignedVillages) ? user.assignedVillages : config.options;
                    if (optionsSource) {
                        optionsSource.forEach(optionValue => {
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
    
                if (header === 'student_name' && studentData) { 
                    studentNameForUpdate = studentData.student_name || '';
                }
            }
    
            formContainer.innerHTML = formHtml;
    
            if (studentData) {
                formButtonsContainer.innerHTML = `
                    <button onclick="updateStudent('${studentNameForUpdate.replace(/'/g, "\\'")}')">💾 Save Changes</button>
                    <button class="secondary-button" onclick="showStudentListScreen()">↩️ Cancel</button>
                `;
            } else {
                formButtonsContainer.innerHTML = `
                    <button onclick="addStudent()">💾 Add Student</button>
                    <button class="secondary-button" onclick="showStudentListScreen()">↩️ Cancel</button>
                `;
            }
    
        } catch (error) {
            console.error("Error building dynamic form:", error);
            formContainer.innerHTML = '<p class="loading-text">Error loading form fields.</p>';
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
        return formData;
    }
    
    function validateFormData(data) {
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
                if (isNaN(numValue) || (config.min !== undefined && numValue < config.min) || (config.max !== undefined && numValue > config.max)) {
                    alert(`Please enter a valid ${config.label}${config.min !== undefined && config.max !== undefined ? ` between ${config.min} and ${config.max}` : ''}.`);
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
        if (!validateFormData(newStudentData)) return;
    
        const saveBtn = document.querySelector("#form-buttons button[onclick='addStudent()']");
        saveBtn.disabled = true; saveBtn.innerText = "Saving..."; saveBtn.classList.add("disabled");
    
        try {
            const res = await makeNetlifyFunctionRequest('POST', { data: [newStudentData] }, { sheet: 'Students' });
            if (res.error) throw new Error(res.error);
            document.getElementById("success-message").innerText = "Student added successfully!";
            showScreen("success-screen");
        } catch (error) {
            console.error("Error adding student:", error);
            document.getElementById("success-message").innerText = "Error adding student: " + error.message;
            showScreen("success-screen");
        } finally {
            saveBtn.disabled = false; saveBtn.innerText = "💾 Add Student"; saveBtn.classList.remove("disabled");
        }
    }
    
    async function updateStudent(originalStudentName) {
        const updatedStudentData = getFormData();
        if (!validateFormData(updatedStudentData)) return;
    
        const saveBtn = document.querySelector("#form-buttons button[onclick*='updateStudent']");
        saveBtn.disabled = true; saveBtn.innerText = "Saving Changes..."; saveBtn.classList.add("disabled");
        
        try {
            const res = await makeNetlifyFunctionRequest('PUT', updatedStudentData, { 
                sheet: 'Students', 
                searchColumn: 'student_name', 
                searchValue: originalStudentName 
            });
            if (res.error) throw new Error(res.error);
            document.getElementById("success-message").innerText = "Student updated successfully!";
            showScreen("success-screen");
        } catch (error) {
            console.error("Error updating student:", error);
            document.getElementById("success-message").innerText = "Error updating student: " + error.message;
            showScreen("success-screen");
        } finally {
            saveBtn.disabled = false; saveBtn.innerText = "💾 Save Changes"; saveBtn.classList.remove("disabled");
        }
    }

    // Make functions globally available if called from HTML onclicks that are not dynamically set
    window.handleCredentialResponse = handleCredentialResponse;
    window.signOut = signOut;
    window.showAttendanceScreen = showAttendanceScreen;
    window.showStudentListScreen = showStudentListScreen;
    window.showAddStudentForm = showAddStudentForm;
    window.showEditStudentForm = showEditStudentForm;
    window.goBackToDashboard = goBackToDashboard;
    window.goBack = goBack;
    window.submit = submit; 
    window.addStudent = addStudent;
    window.updateStudent = updateStudent;
    window.showAttendanceReportsScreen = showAttendanceReportsScreen;

