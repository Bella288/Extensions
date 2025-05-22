let blockedSites = [];
let allowedStrings = {}; // { domain: "string" }
let redirectUrl = 'https://www.google.com'; // Default redirect
let schedules = []; // [{ days: [], startTime: "HH:MM", endTime: "HH:MM" }]

// Load settings on startup
loadSettings();

chrome.storage.sync.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync') {
        if (changes.blockedSites) {
            blockedSites = changes.blockedSites.newValue || [];
            updateBlockingRules();
        }
        if (changes.allowedStrings) {
            allowedStrings = changes.allowedStrings.newValue || {};
        }
        if (changes.redirectUrl) {
            redirectUrl = changes.redirectUrl.newValue || 'https://www.google.com';
        }
        if (changes.schedules) {
            schedules = changes.schedules.newValue || [];
            updateSchedulingAlarms();
        }
    }
});

function loadSettings() {
    chrome.storage.sync.get(['blockedSites', 'allowedStrings', 'redirectUrl', 'schedules'], function(data) {
        blockedSites = data.blockedSites || [];
        allowedStrings = data.allowedStrings || {};
        redirectUrl = data.redirectUrl || 'https://www.google.com';
        schedules = data.schedules || [];
        updateBlockingRules();
        updateSchedulingAlarms();
        console.log("Settings loaded:", { blockedSites, allowedStrings, redirectUrl, schedules });
    });
}

// Function to check if a website should be blocked based on current time and schedules
function shouldBlockBasedOnSchedule() {
    if (schedules.length === 0) {
        return true; // If no schedules, always block if on blocklist
    }

    const now = new Date();
    const currentDay = now.getDay(); // 0 for Sunday, 6 for Saturday
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

    for (const schedule of schedules) {
        const { days, startTime, endTime } = schedule;
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        const scheduleStartTime = startHour * 60 + startMinute;
        const scheduleEndTime = endHour * 60 + endMinute;

        if (days.includes(currentDay) && currentTime >= scheduleStartTime && currentTime <= scheduleEndTime) {
            return true; // Within a scheduled block time
        }
    }
    return false; // Not within any scheduled block time
}

function handleWebRequest(details) {
    const url = new URL(details.url);
    const domain = url.hostname;

    // Check if the domain is in the blockedSites list
    if (blockedSites.includes(domain)) {
        // 1. Check schedule
        if (!shouldBlockBasedOnSchedule()) {
            return { cancel: false }; // Not within a scheduled block time, so don't block
        }

        // 2. Check for allowed string (if configured for this domain)
        const specificString = allowedStrings[domain];
        if (specificString) {
            // We need to check the page content for the string.
            // This is complex and might require a content script or a separate request.
            // For simplicity, for now, we'll assume if an allowed string is set,
            // we'll *try* to check it. A more robust solution involves injecting content scripts.
            // For webRequestBlocking, we can't directly inspect the page content.
            // A common workaround is to allow the request and then have a content script
            // perform the check and redirect if needed.
            // For the purpose of webRequestBlocking, we'll block if the string isn't present
            // in the URL, but the ideal implementation would be a content script.
            if (details.url.includes(specificString)) {
                console.log(`Allowed ${domain} due to string: "${specificString}" in URL.`);
                return { cancel: false };
            } else {
                // If allowed string is set and not in URL, we assume it's blocked for now.
                // A better approach would be to check page content.
                console.log(`Blocking ${domain}. Allowed string "${specificString}" not found in URL.`);
                return { redirectUrl: redirectUrl };
            }
        } else {
            // No allowed string configured, simply block
            console.log(`Blocking ${domain}. No allowed string configured.`);
            return { redirectUrl: redirectUrl };
        }
    }
    return { cancel: false }; // Not a blocked site
}


function updateBlockingRules() {
    // Remove existing listener to prevent duplicates
    if (chrome.webRequest.onBeforeRequest.hasListener(handleWebRequest)) {
        chrome.webRequest.onBeforeRequest.removeListener(handleWebRequest);
    }

    if (blockedSites.length > 0) {
        const patterns = blockedSites.map(site => `*://*.${site}/*`);
        console.log("Setting webRequest listener for patterns:", patterns);
        chrome.webRequest.onBeforeRequest.addListener(
            handleWebRequest, { urls: patterns, types: ["main_frame"] }, ["blocking"]
        );
    } else {
        console.log("No websites to block, webRequest listener not active.");
    }
}

// Listener for messages from popup.js or options.js to update blocking rules
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "updateBlockingRules") {
        loadSettings(); // Reload all settings and then update rules
        console.log("Received message to update blocking rules.");
    }
});

// Scheduling Alarms
function updateSchedulingAlarms() {
    chrome.alarms.clearAll(() => {
        console.log("Cleared all existing alarms.");
        schedules.forEach((schedule, index) => {
            const { days, startTime, endTime } = schedule;
            const [startHour, startMinute] = startTime.split(':').map(Number);
            const [endHour, endMinute] = endTime.split(':').map(Number);

            // Set alarms for start and end times for each scheduled day
            for (const day of days) {
                // Alarm to start blocking
                const startDateTime = getNextAlarmTime(day, startHour, startMinute);
                chrome.alarms.create(`block-start-${index}-${day}`, {
                    when: startDateTime.getTime(),
                    periodInMinutes: 24 * 60 // Repeat daily
                });
                console.log(`Alarm for block start on day ${day} at ${startTime} created. Next trigger: ${startDateTime}`);

                // Alarm to end blocking
                const endDateTime = getNextAlarmTime(day, endHour, endMinute);
                chrome.alarms.create(`block-end-${index}-${day}`, {
                    when: endDateTime.getTime(),
                    periodInMinutes: 24 * 60 // Repeat daily
                });
                console.log(`Alarm for block end on day ${day} at ${endTime} created. Next trigger: ${endDateTime}`);
            }
        });
    });
}

function getNextAlarmTime(targetDay, targetHour, targetMinute) {
    const now = new Date();
    let nextAlarm = new Date();
    nextAlarm.setHours(targetHour, targetMinute, 0, 0);

    const currentDay = now.getDay();

    // Calculate days until the target day
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) {
        daysToAdd += 7; // Target day is in the next week
    }

    nextAlarm.setDate(now.getDate() + daysToAdd);

    // If the time has already passed today, set for next week
    if (nextAlarm.getTime() <= now.getTime()) {
        nextAlarm.setDate(nextAlarm.getDate() + 7);
    }
    return nextAlarm;
}

chrome.alarms.onAlarm.addListener(function(alarm) {
    console.log("Alarm triggered:", alarm.name);
    // When an alarm triggers, simply re-evaluate the blocking rules
    // since `shouldBlockBasedOnSchedule` will now return the correct state.
    updateBlockingRules();
});

// Initial update on install/first run
chrome.runtime.onInstalled.addListener(() => {
    loadSettings();
});