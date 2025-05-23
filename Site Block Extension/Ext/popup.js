document.addEventListener('DOMContentLoaded', () => {
    const toggleBlocking = document.getElementById('toggleBlocking');
    const statusText = document.getElementById('statusText');
    const optionsButton = document.getElementById('optionsButton');

    // Function to update the UI based on Lock-In Mode
    function updateUIAccordingToLockInMode(isLockInModeEnabled) {
        toggleBlocking.disabled = isLockInModeEnabled;
        if (isLockInModeEnabled) {
            // Optionally, provide a visual cue that it's locked
            toggleBlocking.style.cursor = 'not-allowed';
        } else {
            toggleBlocking.style.cursor = 'pointer';
        }
    }

    // Load current blocking status and Lock-In Mode status
    chrome.storage.local.get(['isBlockingEnabled', 'isLockInModeEnabled'], (result) => {
        const isEnabled = result.isBlockingEnabled !== false; // Default to true if not set
        const lockInEnabled = result.isLockInModeEnabled === true; // Default to false

        toggleBlocking.checked = isEnabled;
        statusText.textContent = isEnabled ? 'ON' : 'OFF';
        statusText.classList.toggle('on', isEnabled); // Use 'on' class for green
        statusText.classList.toggle('off', !isEnabled); // Use 'off' class for red

        updateUIAccordingToLockInMode(lockInEnabled);
    });

    // Handle toggle switch change
    toggleBlocking.addEventListener('change', () => {
        const isEnabled = toggleBlocking.checked;
        chrome.storage.local.set({ isBlockingEnabled: isEnabled }, () => {
            statusText.textContent = isEnabled ? 'ON' : 'OFF';
            statusText.classList.toggle('on', isEnabled);
            statusText.classList.toggle('off', !isEnabled);
            // Send message to background script to update blocking
            chrome.runtime.sendMessage({ action: 'updateBlockingStatus', isEnabled: isEnabled });
        });
    });

    // Handle options button click
    optionsButton.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    });

    // Listen for changes to Lock-In Mode from other parts of the extension (e.g., options page)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.isLockInModeEnabled !== undefined) {
            updateUIAccordingToLockInMode(changes.isLockInModeEnabled.newValue);
        }
    });
});
