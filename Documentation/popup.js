// popup.js

// COMMON: It's best practice to wrap your JavaScript code in a 'DOMContentLoaded' listener.
// This ensures that the HTML document is fully loaded and parsed before your script
// attempts to access or manipulate any HTML elements. Without this, your script might
// try to select an element that hasn't been created yet, leading to errors.
document.addEventListener('DOMContentLoaded', function() {
    // COMMON: Get references to HTML elements by their ID.
    // This allows you to interact with these elements in your JavaScript.
    const messageElement = document.getElementById('message');
    const myButton = document.getElementById('myButton');
    const statusDiv = document.getElementById('status');

    // POSSIBLE: Example of directly manipulating the DOM in the popup.
    messageElement.textContent = 'Hello from the popup!';

    // COMMON: Add an event listener to a button. When the button is clicked,
    // the function inside the listener will execute.
    myButton.addEventListener('click', function() {
        statusDiv.textContent = 'Button clicked, sending message...';

        // COMMON: Communicate with the background script.
        // `chrome.runtime.sendMessage()` sends a one-time message to other parts of your extension.
        // The first argument is the message object (can be any JSON-serializable value).
        // The second argument is a callback function that receives a response from the receiver.
        chrome.runtime.sendMessage({ action: "popupButtonClicked", data: "some_data_from_popup" }, function(response) {
            console.log("Response from background:", response);
            statusDiv.textContent = response.status; // Update status based on background response
            alert("Button clicked in popup!"); // Simple alert for demonstration
        });

        // COMMON: Interact with the currently active tab using the 'scripting' API.
        // Requires "activeTab" and "scripting" permissions in manifest.json.
        // `chrome.tabs.query()` finds tabs that match specific properties. Here, it finds the active tab in the current window.
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0]) { // Check if a tab was found
                // `chrome.scripting.executeScript()` injects and executes JavaScript code into a tab.
                // 'target' specifies the tab ID.
                // 'function' is the function to execute in the tab's context.
                // The function here will run as a content script within the active tab.
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    function: (popupData) => { // Functions injected this way can accept arguments.
                        // This code runs INSIDE the web page, not the popup.
                        console.log("Hello from content script injected by popup! Received:", popupData);
                        alert(`Message from extension: ${popupData}`);
                        // You can also manipulate the page's DOM here:
                        // document.body.style.backgroundColor = 'lightblue';
                    },
                    args: ["Data from popup for content script!"] // Arguments passed to the injected function.
                }, () => {
                    console.log("Script injected into active tab.");
                });
            }
        });
    });

    // COMMON: Retrieve data from Chrome's synchronized storage.
    // `chrome.storage.sync.get()` retrieves data from the synchronized storage area.
    // Data stored here is synced across the user's Chrome instances if they are signed in.
    // It takes an array of keys or a single key string. The callback receives an object
    // where keys are the requested keys and values are the retrieved data.
    chrome.storage.sync.get(['myStoredValue'], function(result) {
        if (result.myStoredValue) {
            console.log('Value retrieved from storage:', result.myStoredValue);
            // You might update a UI element with the retrieved value.
            // messageElement.textContent = `Stored: ${result.myStoredValue}`;
        } else {
            console.log('No value found in storage for "myStoredValue".');
        }
    });

    // COMMON: Store data in Chrome's synchronized storage.
    // `chrome.storage.sync.set()` saves data to the synchronized storage area.
    // It takes an object where keys are the data keys and values are the data to store.
    // The callback indicates completion.
    chrome.storage.sync.set({ 'myStoredValue': 'This is some data from popup.js' }, function() {
        console.log('Value stored successfully from popup.js!');
    });

    // POSSIBLE: Using local storage instead of sync storage (data not synced across devices).
    // chrome.storage.local.get(['localData'], function(result) { /* ... */ });
    // chrome.storage.local.set({ 'localData': 'Only on this machine' }, function() { /* ... */ });
});
