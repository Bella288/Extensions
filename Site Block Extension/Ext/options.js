document.addEventListener('DOMContentLoaded', () => {
    const blockedSiteInput = document.getElementById('blockedSiteInput');
    const addBlockedSiteButton = document.getElementById('addBlockedSite');
    const blockedSitesList = document.getElementById('blockedSitesList');

    const exceptionInput = document.getElementById('exceptionInput');
    const addExceptionButton = document.getElementById('addException');
    const exceptionsList = document.getElementById('exceptionsList');

    const blockStartTimeInput = document.getElementById('blockStartTime');
    const blockEndTimeInput = document.getElementById('blockEndTime');
    const enableTimeBlockingCheckbox = document.getElementById('enableTimeBlocking');

    const saveSettingsButton = document.getElementById('saveSettings');

    const toggleLockInModeButton = document.getElementById('toggleLockInMode');
    const lockInModeStatusText = document.getElementById('lockInModeStatus');

    let blockedSites = [];
    let exceptions = [];
    let isLockInModeEnabled = false; // Track current state in options page

    // --- Helper Functions ---

    function renderList(list, ulElement, type) {
        ulElement.innerHTML = '';
        if (list.length === 0) {
            ulElement.innerHTML = '<li class="text-gray-500">No items added yet.</li>';
            return;
        }
        list.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'list-item'; // Apply custom class
            li.innerHTML = `
                <span class="text-gray-800">${item}</span>
                <button data-index="${index}" data-type="${type}"
                        class="remove-button"> Remove
                </button>
            `;
            ulElement.appendChild(li);
        });
        addRemoveEventListeners();
        applyLockInModeState(); // Re-apply state to new remove buttons
    }

    function addRemoveEventListeners() {
        document.querySelectorAll('.remove-button').forEach(button => { // Use custom class
            button.onclick = (event) => {
                // Only allow removal if Lock-In Mode is NOT enabled
                if (isLockInModeEnabled) {
                    showCustomAlert("Lock-In Mode is active. Please disable it to remove items.");
                    return;
                }
                const index = parseInt(event.target.dataset.index);
                const type = event.target.dataset.type;

                if (type === 'blockedSites') {
                    blockedSites.splice(index, 1);
                    renderList(blockedSites, blockedSitesList, 'blockedSites');
                } else if (type === 'exceptions') {
                    exceptions.splice(index, 1);
                    renderList(exceptions, exceptionsList, 'exceptions');
                }
            };
        });
    }

    /**
     * Shows a custom alert message.
     * @param {string} message The message to display.
     */
    function showCustomAlert(message) {
        const alertBox = document.createElement('div');
        alertBox.textContent = message;
        alertBox.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #ef4444; /* red-500 */
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            font-family: "Inter", sans-serif;
            font-size: 1rem;
        `;
        document.body.appendChild(alertBox);

        setTimeout(() => {
            alertBox.style.opacity = '1';
        }, 10);

        setTimeout(() => {
            alertBox.style.opacity = '0';
            alertBox.addEventListener('transitionend', () => alertBox.remove());
        }, 3000);
    }

    /**
     * Shows a custom confirmation dialog.
     * @param {string} message The confirmation message.
     * @returns {Promise<boolean>} A promise that resolves to true if confirmed, false otherwise.
     */
    function showCustomConfirm(message) {
        return new Promise(resolve => {
            const confirmOverlay = document.createElement('div');
            confirmOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.6);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            `;

            const confirmBox = document.createElement('div');
            confirmBox.style.cssText = `
                background-color: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
                text-align: center;
                font-family: "Inter", sans-serif;
                max-width: 400px;
                width: 90%;
            `;

            const messagePara = document.createElement('p');
            messagePara.textContent = message;
            messagePara.style.cssText = `
                margin-bottom: 25px;
                font-size: 1.1rem;
                color: #333;
            `;

            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                justify-content: center;
                gap: 15px;
            `;

            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = 'Confirm';
            confirmBtn.style.cssText = `
                background-color: #22c55e; /* green-500 */
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 1rem;
                transition: background-color 0.2s ease;
            `;
            confirmBtn.onmouseover = () => confirmBtn.style.backgroundColor = '#16a34a'; /* green-600 */
            confirmBtn.onmouseout = () => confirmBtn.style.backgroundColor = '#22c55e';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = `
                background-color: #ef4444; /* red-500 */
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 1rem;
                transition: background-color 0.2s ease;
            `;
            cancelBtn.onmouseover = () => cancelBtn.style.backgroundColor = '#dc2626'; /* red-600 */
            cancelBtn.onmouseout = () => cancelBtn.style.backgroundColor = '#ef4444';

            confirmBtn.onclick = () => {
                document.body.removeChild(confirmOverlay);
                resolve(true);
            };
            cancelBtn.onclick = () => {
                document.body.removeChild(confirmOverlay);
                resolve(false);
            };

            buttonContainer.appendChild(confirmBtn);
            buttonContainer.appendChild(cancelBtn);
            confirmBox.appendChild(messagePara);
            confirmBox.appendChild(buttonContainer);
            confirmOverlay.appendChild(confirmBox);
            document.body.appendChild(confirmOverlay);
        });
    }


    /**
     * Applies the Lock-In Mode state to various UI elements.
     */
    function applyLockInModeState() {
        blockedSiteInput.disabled = isLockInModeEnabled;
        addBlockedSiteButton.disabled = isLockInModeEnabled;
        exceptionInput.disabled = isLockInModeEnabled;
        addExceptionButton.disabled = isLockInModeEnabled;
        blockStartTimeInput.disabled = isLockInModeEnabled;
        blockEndTimeInput.disabled = isLockInModeEnabled;
        enableTimeBlockingCheckbox.disabled = isLockInModeEnabled;
        saveSettingsButton.disabled = isLockInModeEnabled;

        // Disable remove buttons for existing list items
        document.querySelectorAll('.remove-button').forEach(button => {
            button.disabled = isLockInModeEnabled;
        });

        // Update Lock-In Mode button text and style
        toggleLockInModeButton.textContent = isLockInModeEnabled ? 'Disable Lock-In Mode' : 'Enable Lock-In Mode';
        toggleLockInModeButton.classList.toggle('active', isLockInModeEnabled);
        lockInModeStatusText.textContent = isLockInModeEnabled ? 'Lock-In Mode is ON' : 'Lock-In Mode is OFF';
    }


    // --- Load Settings ---
    function loadSettings() {
        chrome.storage.local.get(['blockedSites', 'exceptions', 'blockStartTime', 'blockEndTime', 'enableTimeBlocking', 'isLockInModeEnabled'], (result) => {
            blockedSites = result.blockedSites || [];
            exceptions = result.exceptions || [];
            blockStartTimeInput.value = result.blockStartTime || '';
            blockEndTimeInput.value = result.blockEndTime || '';
            enableTimeBlockingCheckbox.checked = result.enableTimeBlocking !== false; // Default to true
            isLockInModeEnabled = result.isLockInModeEnabled === true; // Default to false

            renderList(blockedSites, blockedSitesList, 'blockedSites');
            renderList(exceptions, exceptionsList, 'exceptions');
            applyLockInModeState(); // Apply state after loading
        });
    }

    // --- Event Listeners ---

    addBlockedSiteButton.addEventListener('click', () => {
        if (isLockInModeEnabled) {
            showCustomAlert("Lock-In Mode is active. Please disable it to add sites.");
            return;
        }
        const site = blockedSiteInput.value.trim();
        if (site && !blockedSites.includes(site)) {
            blockedSites.push(site);
            blockedSiteInput.value = '';
            renderList(blockedSites, blockedSitesList, 'blockedSites');
        }
    });

    addExceptionButton.addEventListener('click', () => {
        if (isLockInModeEnabled) {
            showCustomAlert("Lock-In Mode is active. Please disable it to add exceptions.");
            return;
        }
        const exception = exceptionInput.value.trim();
        if (exception && !exceptions.includes(exception)) {
            exceptions.push(exception);
            exceptionInput.value = '';
            renderList(exceptions, exceptionsList, 'exceptions');
        }
    });

    saveSettingsButton.addEventListener('click', () => {
        if (isLockInModeEnabled) {
            showCustomAlert("Lock-In Mode is active. Please disable it to save settings.");
            return;
        }
        const settings = {
            blockedSites: blockedSites,
            exceptions: exceptions,
            blockStartTime: blockStartTimeInput.value,
            blockEndTime: blockEndTimeInput.value,
            enableTimeBlocking: enableTimeBlockingCheckbox.checked,
            isLockInModeEnabled: isLockInModeEnabled // Ensure this is saved
        };

        chrome.storage.local.set(settings, () => {
            console.log('Settings saved:', settings);
            // Send message to background script to update rules
            chrome.runtime.sendMessage({ action: 'updateRules' });
            // Provide visual feedback to the user (e.g., a temporary message)
            const saveMessage = document.createElement('div');
            saveMessage.textContent = 'Settings saved successfully!';
            saveMessage.className = 'save-message'; // Apply custom class
            document.body.appendChild(saveMessage);

            // Animate fade in and fade out
            setTimeout(() => {
                saveMessage.style.opacity = '1';
            }, 10); // Small delay to allow reflow before transition

            setTimeout(() => {
                saveMessage.style.opacity = '0';
                saveMessage.addEventListener('transitionend', () => saveMessage.remove());
            }, 3000);
        });
    });

    toggleLockInModeButton.addEventListener('click', async () => {
        let confirmMessage = isLockInModeEnabled
            ? "Are you sure you want to DISABLE Lock-In Mode? This will allow changes to your blocking settings."
            : "Are you sure you want to ENABLE Lock-In Mode? This will prevent easy changes to your blocking settings.";

        const confirmed = await showCustomConfirm(confirmMessage);

        if (confirmed) {
            isLockInModeEnabled = !isLockInModeEnabled;
            chrome.storage.local.set({ isLockInModeEnabled: isLockInModeEnabled }, () => {
                applyLockInModeState();
                // Inform background script about the change in lock-in mode
                chrome.runtime.sendMessage({ action: 'updateLockInModeStatus', isEnabled: isLockInModeEnabled });
                showCustomAlert(`Lock-In Mode ${isLockInModeEnabled ? 'ENABLED' : 'DISABLED'}.`);
            });
        }
    });

    // Initial load of settings
    loadSettings();
});
