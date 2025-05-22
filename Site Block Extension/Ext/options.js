document.addEventListener('DOMContentLoaded', function() {
    const redirectUrlInput = document.getElementById('redirectUrl');
    const saveRedirectUrlButton = document.getElementById('saveRedirectUrl');

    const domainForStringInput = document.getElementById('domainForString');
    const stringToAllowInput = document.getElementById('stringToAllow');
    const addAllowedStringButton = document.getElementById('addAllowedString');
    const allowedStringsUl = document.getElementById('allowedStringsUl');

    const dayCheckboxes = document.querySelectorAll('.day-checkboxes input[type="checkbox"]');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const addScheduleButton = document.getElementById('addSchedule');
    const schedulesUl = document.getElementById('schedulesUl');

    loadSettings();

    saveRedirectUrlButton.addEventListener('click', saveRedirectUrl);
    addAllowedStringButton.addEventListener('click', addAllowedString);
    allowedStringsUl.addEventListener('click', function(event) {
        if (event.target.classList.contains('remove-btn')) {
            removeAllowedString(event.target.dataset.domain);
        }
    });

    addScheduleButton.addEventListener('click', addSchedule);
    schedulesUl.addEventListener('click', function(event) {
        if (event.target.classList.contains('remove-btn')) {
            removeSchedule(parseInt(event.target.dataset.index));
        }
    });

    function loadSettings() {
        chrome.storage.sync.get(['redirectUrl', 'allowedStrings', 'schedules'], function(data) {
            redirectUrlInput.value = data.redirectUrl || 'https://www.google.com';
            loadAllowedStrings(data.allowedStrings || {});
            loadSchedules(data.schedules || []);
        });
    }

    function saveRedirectUrl() {
        const url = redirectUrlInput.value.trim();
        if (url) {
            chrome.storage.sync.set({ 'redirectUrl': url }, function() {
                console.log('Redirect URL saved:', url);
                alert('Redirect URL saved!');
                chrome.runtime.sendMessage({ action: "updateBlockingRules" }); // Notify background script
            });
        } else {
            alert('Please enter a valid redirect URL.');
        }
    }

    function addAllowedString() {
        const domain = domainForStringInput.value.trim();
        const string = stringToAllowInput.value.trim();
        if (domain && string) {
            chrome.storage.sync.get('allowedStrings', function(data) {
                let allowedStrings = data.allowedStrings || {};
                allowedStrings[domain] = string;
                chrome.storage.sync.set({ 'allowedStrings': allowedStrings }, function() {
                    domainForStringInput.value = '';
                    stringToAllowInput.value = '';
                    loadAllowedStrings(allowedStrings);
                    console.log('Allowed string added/updated:', domain, string);
                    chrome.runtime.sendMessage({ action: "updateBlockingRules" }); // Notify background script
                });
            });
        } else {
            alert('Please enter both a domain and a string.');
        }
    }

    function removeAllowedString(domain) {
        chrome.storage.sync.get('allowedStrings', function(data) {
            let allowedStrings = data.allowedStrings || {};
            delete allowedStrings[domain];
            chrome.storage.sync.set({ 'allowedStrings': allowedStrings }, function() {
                loadAllowedStrings(allowedStrings);
                console.log('Allowed string removed for:', domain);
                chrome.runtime.sendMessage({ action: "updateBlockingRules" }); // Notify background script
            });
        });
    }

    function loadAllowedStrings(allowedStrings) {
        allowedStringsUl.innerHTML = '';
        if (Object.keys(allowedStrings).length === 0) {
            allowedStringsUl.innerHTML = '<li>No allowed strings configured.</li>';
            return;
        }
        for (const domain in allowedStrings) {
            const li = document.createElement('li');
            li.innerHTML = `
                <span><strong>${domain}:</strong> "${allowedStrings[domain]}"</span>
                <button class="remove-btn" data-domain="${domain}">Remove</button>
            `;
            allowedStringsUl.appendChild(li);
        }
    }

    function addSchedule() {
        const selectedDays = Array.from(dayCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => parseInt(cb.value));
        const startTime = startTimeInput.value;
        const endTime = endTimeInput.value;

        if (selectedDays.length === 0 || !startTime || !endTime) {
            alert('Please select at least one day and enter both start and end times.');
            return;
        }

        if (startTime >= endTime) {
            alert('Start time must be before end time.');
            return;
        }

        const newSchedule = {
            days: selectedDays,
            startTime: startTime,
            endTime: endTime
        };

        chrome.storage.sync.get('schedules', function(data) {
            let schedules = data.schedules || [];
            schedules.push(newSchedule);
            chrome.storage.sync.set({ 'schedules': schedules }, function() {
                // Clear inputs
                dayCheckboxes.forEach(cb => cb.checked = false);
                startTimeInput.value = '';
                endTimeInput.value = '';
                loadSchedules(schedules);
                console.log('Schedule added:', newSchedule);
                chrome.runtime.sendMessage({ action: "updateBlockingRules" }); // Notify background script to update alarms
            });
        });
    }

    function removeSchedule(index) {
        chrome.storage.sync.get('schedules', function(data) {
            let schedules = data.schedules || [];
            schedules.splice(index, 1);
            chrome.storage.sync.set({ 'schedules': schedules }, function() {
                loadSchedules(schedules);
                console.log('Schedule removed at index:', index);
                chrome.runtime.sendMessage({ action: "updateBlockingRules" }); // Notify background script to update alarms
            });
        });
    }

    function loadSchedules(schedules) {
        schedulesUl.innerHTML = '';
        if (schedules.length === 0) {
            schedulesUl.innerHTML = '<li>No schedules configured.</li>';
            return;
        }
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        schedules.forEach((schedule, index) => {
            const li = document.createElement('li');
            const readableDays = schedule.days.map(day => dayNames[day]).join(', ');
            li.className = 'schedule-item';
            li.innerHTML = `
                <span><strong>Days:</strong> ${readableDays}</span><br>
                <span><strong>Time:</strong> ${schedule.startTime} - ${schedule.endTime}</span>
                <button class="remove-btn" data-index="${index}">Remove</button>
            `;
            schedulesUl.appendChild(li);
        });
    }
});