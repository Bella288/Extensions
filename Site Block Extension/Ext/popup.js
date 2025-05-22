document.addEventListener('DOMContentLoaded', function() {
    const websiteInput = document.getElementById('websiteInput');
    const addWebsiteButton = document.getElementById('addWebsite');
    const blockedWebsitesList = document.getElementById('blockedWebsitesList');

    // Load blocked websites when the popup opens
    loadBlockedWebsites();

    addWebsiteButton.addEventListener('click', addWebsite);
    blockedWebsitesList.addEventListener('click', function(event) {
        if (event.target.classList.contains('remove-btn')) {
            removeWebsite(event.target.dataset.website);
        }
    });

    async function addWebsite() {
        let url = websiteInput.value.trim();
        if (url) {
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url; // Prepend https for consistency
            }
            try {
                const urlObj = new URL(url);
                const domain = urlObj.hostname;

                chrome.storage.sync.get('blockedSites', function(data) {
                    let blockedSites = data.blockedSites || [];
                    if (!blockedSites.includes(domain)) {
                        blockedSites.push(domain);
                        chrome.storage.sync.set({ 'blockedSites': blockedSites }, function() {
                            websiteInput.value = '';
                            loadBlockedWebsites();
                            console.log('Website added:', domain);
                            // Notify background script to update blocking rules
                            chrome.runtime.sendMessage({ action: "updateBlockingRules" });
                        });
                    } else {
                        alert('This website is already on the blocklist.');
                    }
                });
            } catch (e) {
                alert('Please enter a valid URL or domain (e.g., example.com)');
                console.error('Invalid URL:', url, e);
            }
        }
    }

    function removeWebsite(website) {
        chrome.storage.sync.get('blockedSites', function(data) {
            let blockedSites = data.blockedSites || [];
            const updatedSites = blockedSites.filter(site => site !== website);
            chrome.storage.sync.set({ 'blockedSites': updatedSites }, function() {
                loadBlockedWebsites();
                console.log('Website removed:', website);
                // Notify background script to update blocking rules
                chrome.runtime.sendMessage({ action: "updateBlockingRules" });
            });
        });
    }

    function loadBlockedWebsites() {
        chrome.storage.sync.get('blockedSites', function(data) {
            const blockedSites = data.blockedSites || [];
            blockedWebsitesList.innerHTML = '';
            if (blockedSites.length === 0) {
                blockedWebsitesList.innerHTML = '<li>No websites blocked yet.</li>';
                return;
            }
            blockedSites.forEach(site => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${site}</span>
                    <button class="remove-btn" data-website="${site}">Remove</button>
                `;
                blockedWebsitesList.appendChild(li);
            });
        });
    }
});