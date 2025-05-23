// Default settings
const DEFAULT_SETTINGS = {
    blockedSites: [],
    exceptions: [],
    blockStartTime: '',
    blockEndTime: '',
    enableTimeBlocking: false,
    isBlockingEnabled: true, // Global toggle for blocking
    isLockInModeEnabled: false // New: Lock-In Mode status
};

let currentSettings = { ...DEFAULT_SETTINGS };
const BLOCKED_PAGE_URL = chrome.runtime.getURL("blocked.html");
const RULE_ID_OFFSET = 1000; // Offset for dynamic rule IDs to avoid conflicts

/**
 * Loads settings from chrome.storage.local and updates currentSettings.
 * @returns {Promise<void>} A promise that resolves when settings are loaded.
 */
async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(DEFAULT_SETTINGS, (result) => {
            currentSettings = { ...DEFAULT_SETTINGS, ...result };
            console.log('Settings loaded:', currentSettings);
            resolve();
        });
    });
}

/**
 * Checks if the current time falls within the defined block period.
 * @returns {boolean} True if blocking is active based on time, false otherwise.
 */
function isTimeBlocked() {
    if (!currentSettings.enableTimeBlocking || !currentSettings.blockStartTime || !currentSettings.blockEndTime) {
        return false;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

    const [startHour, startMinute] = currentSettings.blockStartTime.split(':').map(Number);
    const [endHour, endMinute] = currentSettings.blockEndTime.split(':').map(Number);

    const blockStartMinutes = startHour * 60 + startMinute;
    const blockEndMinutes = endHour * 60 + endMinute;

    if (blockStartMinutes < blockEndMinutes) {
        // Normal blocking within the same day (e.g., 9:00 to 17:00)
        return currentTime >= blockStartMinutes && currentTime < blockEndMinutes;
    } else {
        // Blocking spans across midnight (e.g., 22:00 to 06:00)
        return currentTime >= blockStartMinutes || currentTime < blockEndMinutes;
    }
}

/**
 * Generates robust URL filters based on the input string.
 * It tries to handle domains (with/without www, http/https) and specific URL parts.
 * @param {string} input The string from blockedSites or exceptions.
 * @returns {Array<string>} An array of urlFilter strings for declarativeNetRequest.
 */
function createUrlFilters(input) {
    const filters = new Set(); // Use a Set to avoid duplicate filters

    // If the input already contains declarativeNetRequest wildcards, use it directly
    if (input.includes('*') || input.includes('?')) {
        filters.add(input);
        return Array.from(filters);
    }

    // Attempt to parse as a URL to extract hostname.
    // Prepend 'https://' if no protocol to help URL constructor.
    let tempUrl;
    try {
        tempUrl = new URL(input.startsWith('http://') || input.startsWith('https://') ? input : `https://${input}`);
    } catch (e) {
        // If it's not a valid URL (e.g., just a word or phrase), treat as a substring match
        filters.add(`*${input}*`);
        return Array.from(filters);
    }

    const hostname = tempUrl.hostname;
    const path = tempUrl.pathname;
    const search = tempUrl.search;
    const hash = tempUrl.hash;

    // Case 1: Input is a simple domain (e.g., "youtube.com", "www.youtube.com")
    // We want to block/allow the domain and all its subdomains for any protocol.
    // This covers: http://youtube.com, https://youtube.com, http://www.youtube.com, https://www.youtube.com, http://sub.youtube.com, etc.
    if (path === '/' && !search && !hash) { // It's likely just a domain
        const rootDomain = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
        filters.add(`*://*.${rootDomain}/*`); // Covers all subdomains (including www) and root domain
        filters.add(`*://*${rootDomain}/*`); // Redundant with above, but good for explicit root match
    } else {
        // Case 2: Input is a specific URL, subdomain, or contains a path/query/hash.
        // Match the exact string provided, ensuring it works as a substring match for full URLs.
        filters.add(`*${input}*`);
    }

    return Array.from(filters);
}

/**
 * Generates declarativeNetRequest rules based on current settings.
 * @returns {Array<object>} An array of declarativeNetRequest rules.
 */
function generateDynamicRules() {
    const rules = [];
    let ruleIdCounter = RULE_ID_OFFSET;

    // Determine if blocking should be active based on global toggle and time
    const shouldApplyBlocking = currentSettings.isBlockingEnabled && (!currentSettings.enableTimeBlocking || isTimeBlocked());

    if (!shouldApplyBlocking) {
        return rules; // No rules needed if blocking is globally off or outside time window
    }

    // Create rules for blocked sites
    currentSettings.blockedSites.forEach(site => {
        const filters = createUrlFilters(site);
        filters.forEach(urlFilter => {
            rules.push({
                id: ruleIdCounter++,
                priority: 1, // Blocking rules have lower priority
                action: {
                    type: "redirect",
                    redirect: { url: BLOCKED_PAGE_URL }
                },
                condition: {
                    urlFilter: urlFilter,
                    resourceTypes: ["main_frame"]
                }
            });
        });
    });

    // Create rules for exceptions (allow rules, higher priority)
    currentSettings.exceptions.forEach(exception => {
        const filters = createUrlFilters(exception);
        filters.forEach(urlFilter => {
            rules.push({
                id: ruleIdCounter++,
                priority: 2, // Exception rules have higher priority to override blocking rules
                action: { type: "allow" },
                condition: {
                    urlFilter: urlFilter,
                    resourceTypes: ["main_frame"]
                }
            });
        });
    });

    return rules;
}

/**
 * Updates the dynamic declarativeNetRequest rules.
 */
async function updateDeclarativeNetRequestRules() {
    const newRules = generateDynamicRules();
    const existingDynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
    const oldRulesIds = existingDynamicRules.map(rule => rule.id);

    // Filter to only remove rules that were created by this extension
    const rulesToRemove = oldRulesIds.filter(id => id >= RULE_ID_OFFSET);

    console.log('Existing dynamic rules IDs:', oldRulesIds);
    console.log('Rules to remove (based on offset):', rulesToRemove);
    console.log('Rules to add (newly generated):', newRules.map(rule => rule.id));

    try {
        // Step 1: Remove all dynamic rules managed by this extension
        if (rulesToRemove.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: rulesToRemove
            });
            console.log('Successfully removed old rules.');
        } else {
            console.log('No old rules to remove.');
        }

        // Step 2: Add the newly generated rules
        if (newRules.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: newRules
            });
            console.log('Successfully added new rules.');
        } else {
            console.log('No new rules to add.');
        }

        console.log('Declarative Net Request rules update process completed.');
    } catch (error) {
        console.error('Error updating declarativeNetRequest rules:', error);
    }
}

/**
 * Schedules or clears alarms for time-based blocking.
 */
function scheduleTimeAlarms() {
    chrome.alarms.clear('blockStart');
    chrome.alarms.clear('blockEnd');

    if (currentSettings.enableTimeBlocking && currentSettings.blockStartTime && currentSettings.blockEndTime) {
        const now = new Date();
        const today = now.toDateString();

        // Calculate next block start time
        const [startHour, startMinute] = currentSettings.blockStartTime.split(':').map(Number);
        let startTime = new Date(`${today} ${startHour}:${startMinute}:00`);
        if (startTime < now) { // If start time already passed today, schedule for tomorrow
            startTime.setDate(startTime.getDate() + 1);
        }

        // Calculate next block end time
        const [endHour, endMinute] = currentSettings.blockEndTime.split(':').map(Number);
        let endTime = new Date(`${today} ${endHour}:${endMinute}:00`);
        const blockStartMinutes = startHour * 60 + startMinute;
        const blockEndMinutes = endHour * 60 + endMinute;

        if (endTime < now && blockStartMinutes < blockEndMinutes) { // If end time passed and not spanning midnight
            endTime.setDate(endTime.getDate() + 1);
        } else if (endTime < startTime && blockStartMinutes >= blockEndMinutes) { // If spanning midnight, end time is next day
             endTime.setDate(endTime.getDate() + 1);
        }


        chrome.alarms.create('blockStart', { when: startTime.getTime(), periodInMinutes: 24 * 60 });
        chrome.alarms.create('blockEnd', { when: endTime.getTime(), periodInMinutes: 24 * 60 });

        console.log(`Alarms scheduled: Block Start at ${startTime.toLocaleTimeString()}, Block End at ${endTime.toLocaleTimeString()}`);
    } else {
        console.log('Time-based blocking disabled or times not set, alarms cleared.');
    }
}

/**
 * Updates all blocking rules and listeners based on current settings.
 */
async function applyRules() {
    await loadSettings(); // Ensure settings are fresh
    await updateDeclarativeNetRequestRules(); // Apply declarativeNetRequest rules
    scheduleTimeAlarms();
}

// --- Event Listeners ---

// Listen for messages from popup.js and options.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateBlockingStatus') {
        currentSettings.isBlockingEnabled = request.isEnabled;
        chrome.storage.local.set({ isBlockingEnabled: request.isEnabled }, () => {
            applyRules(); // Re-apply all rules based on new global status
            console.log('Global blocking status updated to:', request.isEnabled);
        });
    } else if (request.action === 'updateRules') {
        applyRules(); // Re-apply all rules after options page saves
        console.log('Rules updated from options page.');
    } else if (request.action === 'updateLockInModeStatus') {
        // Update currentSettings with the new Lock-In Mode status
        currentSettings.isLockInModeEnabled = request.isEnabled;
        console.log('Lock-In Mode status updated to:', request.isEnabled);
        // No need to re-apply declarativeNetRequest rules for this, as it only affects UI
    }
});

// Listen for alarms to trigger time-based blocking changes
chrome.alarms.onAlarm.addListener((alarm) => {
    console.log('Alarm fired:', alarm.name);
    if (alarm.name === 'blockStart' || alarm.name === 'blockEnd') {
        // Re-evaluate blocking status based on time and re-apply rules
        applyRules();
    }
});

// Initial setup when the service worker starts
applyRules();

// Periodically check time-based blocking status to ensure accuracy,
// especially if the browser was closed and reopened, or for minor clock drifts.
// This alarm runs every 5 minutes and re-applies rules.
chrome.alarms.create('periodicCheck', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'periodicCheck') {
        console.log('Performing periodic check for time-based blocking.');
        applyRules();
    }
});
