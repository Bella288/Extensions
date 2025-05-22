let blockedSites = [];
let allowedStrings = {}; // { domain: "string" }
let redirectUrl = 'https://www.google.com'; // Default redirect
let schedules = []; // [{ days: [], startTime: "HH:MM", endTime: "HH:MM" }]
let currentBlockingEnabled = true; // Overall flag for scheduling

// Load settings on startup
loadSettings();

chrome.storage.sync.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync') {
        if (changes.blockedSites) {
            blockedSites = changes.blockedSites.newValue || [];
            updateDeclarativeNetRequestRules(); // Update rules when blocklist changes
        }
        if (changes.allowedStrings) {
            allowedStrings = changes.allowedStrings.newValue || {};
            updateDeclarativeNetRequestRules(); // Update rules if allowed strings change
        }
        if (changes.redirectUrl) {
            redirectUrl = changes.redirectUrl.newValue || 'https://www.google.com';
            updateDeclarativeNetRequestRules(); // Update rules if redirect URL changes
        }
        if (changes.schedules) {
            schedules = changes.schedules.newValue || [];
            updateSchedulingAlarms(); // Update alarms when schedules change
            checkAndApplyScheduleBlocking(); // Also re-evaluate blocking state immediately based on new schedules
        }
    }
});

function loadSettings() {
    chrome.storage.sync.get(['blockedSites', 'allowedStrings', 'redirectUrl', 'schedules'], function(data) {
        blockedSites = data.blockedSites || [];
        allowedStrings = data.allowedStrings || {};
        redirectUrl = data.redirectUrl || 'https://www.google.com';
        schedules = data.schedules || [];
        console.log("Settings loaded:", { blockedSites, allowedStrings, redirectUrl, schedules });

        // Initial setup of rules and alarms
        updateDeclarativeNetRequestRules();
        updateSchedulingAlarms();
        checkAndApplyScheduleBlocking(); // Check initial schedule state
    });
}

// Function to check if a website should be blocked based on current time and schedules
function shouldBlockBasedOnSchedule() {
    if (schedules.length === 0) {
        return true; // If no schedules, always block if on blocklist (i.e., schedules don't override)
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

// Function to update declarativeNetRequest rules
async function updateDeclarativeNetRequestRules() {
    const rulesToAdd = [];
    let ruleIdCounter = 1; // Start from 1 for new rules

    // Only generate rules if blocking is currently enabled by schedule
    if (currentBlockingEnabled) {
        for (const site of blockedSites) {
            const domain = site;
            const allowedString = allowedStrings[domain];

            if (allowedString) {
                // Rule to allow if string is present (higher priority)
                rulesToAdd.push({
                    "id": ruleIdCounter++,
                    "priority": 2, // Higher priority to allow
                    "action": { "type": "allow" },
                    "condition": {
                        "urlFilter": `*://*.${domain}/*${allowedString}*`,
                        "resourceTypes": ["main_frame", "sub_frame", "media", "script", "font", "image", "xmlhttprequest", "stylesheet", "other"]
                    }
                });

                // Rule to block the domain if the allowed string is NOT present
                // This relies on the 'allow' rule taking precedence.
                rulesToAdd.push({
                    "id": ruleIdCounter++,
                    "priority": 1, // Lower priority
                    "action": { "type": "redirect", "redirect": { "url": redirectUrl } },
                    "condition": {
                        "urlFilter": `*://*.${domain}/*`,
                        "resourceTypes": ["main_frame", "sub_frame", "media", "script", "font", "image", "xmlhttprequest", "stylesheet", "other"]
                    }
                });

            } else {
                // Simple block if no allowed string
                rulesToAdd.push({
                    "id": ruleIdCounter++,
                    "priority": 1,
                    "action": { "type": "redirect", "redirect": { "url": redirectUrl } },
                    "condition": {
                        "urlFilter": `*://*.${domain}/*`,
                        "resourceTypes": ["main_frame", "sub_frame", "media", "script", "font", "image", "xmlhttprequest", "stylesheet", "other"]
                    }
                });
            }
        }
    }

    try {
        // 1. Get all current dynamic rules
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingRuleIds = existingRules.map(rule => rule.id);

        // 2. Remove all existing dynamic rules
        if (existingRuleIds.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: existingRuleIds
            });
            console.log("Removed existing declarative net request rules.");
        }

        // 3. Add the new set of rules if there are any
        if (rulesToAdd.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: rulesToAdd
            });
            console.log("Added new declarative net request rules:", rulesToAdd);
        } else {
            console.log("No blocking rules to add.");
        }
    } catch (e) {
        console.error("Error updating declarative net request rules:", e);
    }
}

// Function to check the current time against schedules and enable/disable blocking
function checkAndApplyScheduleBlocking() {
    const shouldBeBlocking = shouldBlockBasedOnSchedule();
    if (shouldBeBlocking !== currentBlockingEnabled) {
        currentBlockingEnabled = shouldBeBlocking;
        console.log(`Blocking state changed to: ${currentBlockingEnabled ? "Enabled" : "Disabled"} by schedule.`);
        updateDeclarativeNetRequestRules(); // Re-apply rules based on new state
    }
}


// Listener for messages from popup.js or options.js to update blocking rules
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "updateBlockingRules") {
        loadSettings(); // Reload all settings and then update rules/alarms
        console.log("Received message to update blocking rules from UI.");
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
                    periodInMinutes: 24 * 60 // Repeat daily (effectively a daily alarm)
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

    // If the time has already passed *today* for the target day, set for next week.
    // This handles cases where `targetDay` is the same as `currentDay` but the `targetHour:targetMinute` has passed.
    if (nextAlarm.getTime() <= now.getTime()) {
        nextAlarm.setDate(nextAlarm.getDate() + 7);
    }
    return nextAlarm;
}

chrome.alarms.onAlarm.addListener(function(alarm) {
    console.log("Alarm triggered:", alarm.name);
    // When an alarm triggers, re-evaluate the blocking rules based on the current schedule state.
    checkAndApplyScheduleBlocking();
});

// Initial update on install/first run
chrome.runtime.onInstalled.addListener(() => {
    loadSettings();
});