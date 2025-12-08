// Updated Custom Tabs Plugin - Supports both Legacy and Modern (Experimental) layouts
if (typeof window.customTabsPlugin == 'undefined') {

    window.customTabsPlugin = {
        initialized: false,
        currentPage: null,
        currentLayout: null, // 'legacy' or 'modern'

        init: function() {
            console.log('CustomTabs: Initializing plugin');
            this.detectLayout();
            this.waitForUI();
        },

        // Detect which layout is being used
        detectLayout: function() {
            // Check for Material-UI AppBar (modern/experimental layout)
            const hasMuiAppBar = !!document.querySelector('.MuiAppBar-root, [class*="MuiAppBar"]');
            const hasMuiTabs = !!document.querySelector('.MuiTabs-root, [class*="MuiTabs"]');
            
            // Check for old emby tabs
            const hasEmbyTabs = !!document.querySelector('.emby-tabs-slider');
            
            if (hasMuiAppBar || hasMuiTabs) {
                this.currentLayout = 'modern';
                console.log('CustomTabs: Detected Modern/Experimental layout');
            } else if (hasEmbyTabs) {
                this.currentLayout = 'legacy';
                console.log('CustomTabs: Detected Legacy layout');
            } else {
                this.currentLayout = null;
                console.log('CustomTabs: Unable to detect layout');
            }
        },

        waitForUI: function() {
            const hash = window.location.hash;
            if (hash !== '' && hash !== '#/home' && hash !== '#/home.html' && !hash.includes('#/home?') && !hash.includes('#/home.html?')) {
                console.debug('CustomTabs: Not on main page, skipping UI check. Hash:', hash);
                return;
            }

            // Re-detect layout on each check
            this.detectLayout();

            if (typeof ApiClient !== 'undefined') {
                if (this.currentLayout === 'modern') {
                    // For modern layout, check for MUI components
                    const muiAppBar = document.querySelector('.MuiAppBar-root, [class*="MuiAppBar"]');
                    const muiTabs = document.querySelector('.MuiTabs-root, [class*="MuiTabs"]');
                    
                    if (muiAppBar || muiTabs) {
                        console.debug('CustomTabs: Modern layout UI ready, creating tabs');
                        this.createCustomTabs();
                        return;
                    }
                } else if (this.currentLayout === 'legacy') {
                    // For legacy layout, check for emby tabs
                    if (document.querySelector('.emby-tabs-slider')) {
                        console.debug('CustomTabs: Legacy layout UI ready, creating tabs');
                        this.createCustomTabs();
                        return;
                    }
                }
            }

            console.debug('CustomTabs: Waiting for UI elements...');
            setTimeout(() => this.waitForUI(), 200);
        },

        createCustomTabs: function() {
            console.debug('CustomTabs: Starting tab creation process');

            if (this.currentLayout === 'modern') {
                this.createModernTabs();
            } else if (this.currentLayout === 'legacy') {
                this.createLegacyTabs();
            } else {
                console.error('CustomTabs: Unknown layout, cannot create tabs');
            }
        },

        // Create tabs for the modern/experimental layout
        createModernTabs: function() {
            console.log('CustomTabs: Creating tabs for Modern layout');

            // Find the MUI Tabs container
            const muiTabsRoot = document.querySelector('.MuiTabs-root [role="tablist"], .MuiTabs-scroller');
            
            if (!muiTabsRoot) {
                console.error('CustomTabs: Could not find MUI tabs container');
                return;
            }

            // Check if custom tabs already exist
            if (muiTabsRoot.querySelector('[id^="customTabButton_"]')) {
                console.debug('CustomTabs: Custom tabs already exist, skipping creation');
                return;
            }

            // Fetch tab configuration
            ApiClient.fetch({
                url: ApiClient.getUrl('CustomTabs/Config'),
                type: 'GET',
                dataType: 'json',
                headers: {
                    accept: 'application/json'
                }
            }).then((configs) => {
                console.debug('CustomTabs: Retrieved config for', configs.length, 'tabs');

                configs.forEach((config, i) => {
                    const customTabId = `customTabButton_${i}`;

                    if (document.querySelector(`#${customTabId}`)) {
                        console.debug(`CustomTabs: Tab ${customTabId} already exists, skipping`);
                        return;
                    }

                    console.log("CustomTabs: Creating custom tab:", config.Title);

                    // Create MUI-style tab button
                    const button = document.createElement("button");
                    button.type = "button";
                    button.classList.add("MuiButtonBase-root", "MuiTab-root");
                    button.setAttribute("role", "tab");
                    button.setAttribute("aria-selected", "false");
                    button.setAttribute("tabindex", "-1");
                    button.setAttribute("id", customTabId);
                    button.setAttribute("data-index", i + 2);
                    
                    // Tab label
                    const label = document.createElement("span");
                    label.classList.add("MuiTab-label");
                    label.textContent = config.Title;
                    button.appendChild(label);

                    // Tab indicator (underline)
                    const indicator = document.createElement("span");
                    indicator.classList.add("MuiTouchRipple-root");
                    button.appendChild(indicator);

                    // Add click handler
                    button.addEventListener('click', () => {
                        this.switchToCustomTab(i, 'modern');
                    });

                    muiTabsRoot.appendChild(button);
                    console.log(`CustomTabs: Added modern tab ${customTabId}`);
                });

                console.log('CustomTabs: All custom tabs created successfully (Modern layout)');
            }).catch((error) => {
                console.error('CustomTabs: Error fetching tab configs:', error);
            });
        },

        // Create tabs for the legacy layout (your original code)
        createLegacyTabs: function() {
            console.log('CustomTabs: Creating tabs for Legacy layout');

            const tabsSlider = document.querySelector('.emby-tabs-slider');
            if (!tabsSlider) {
                console.debug('CustomTabs: Tabs slider not found');
                return;
            }

            if (tabsSlider.querySelector('[id^="customTabButton_"]')) {
                console.debug('CustomTabs: Custom tabs already exist in DOM, skipping creation');
                return;
            }

            ApiClient.fetch({
                url: ApiClient.getUrl('CustomTabs/Config'),
                type: 'GET',
                dataType: 'json',
                headers: {
                    accept: 'application/json'
                }
            }).then((configs) => {
                console.debug('CustomTabs: Retrieved config for', configs.length, 'tabs');

                const tabsSlider = document.querySelector('.emby-tabs-slider');
                if (!tabsSlider) {
                    console.error('CustomTabs: Tabs slider disappeared unexpectedly');
                    return;
                }

                configs.forEach((config, i) => {
                    const customTabId = `customTabButton_${i}`;

                    if (document.querySelector(`#${customTabId}`)) {
                        console.debug(`CustomTabs: Tab ${customTabId} already exists, skipping`);
                        return;
                    }

                    console.log("CustomTabs: Creating custom tab:", config.Title);

                    const title = document.createElement("div");
                    title.classList.add("emby-button-foreground");
                    title.innerText = config.Title;

                    const button = document.createElement("button");
                    button.type = "button";
                    button.setAttribute("is", "empty-button");
                    button.classList.add("emby-tab-button", "emby-button");
                    button.setAttribute("data-index", i + 2);
                    button.setAttribute("id", customTabId);
                    button.appendChild(title);

                    tabsSlider.appendChild(button);
                    console.log(`CustomTabs: Added legacy tab ${customTabId} to tabs slider`);
                });

                console.log('CustomTabs: All custom tabs created successfully (Legacy layout)');
            }).catch((error) => {
                console.error('CustomTabs: Error fetching tab configs:', error);
            });
        },

        // Switch to a custom tab (for modern layout)
        switchToCustomTab: function(index, layout) {
            console.log(`CustomTabs: Switching to custom tab ${index}`);
            
            // Update tab selection state
            const allTabs = document.querySelectorAll('[role="tab"]');
            allTabs.forEach(tab => {
                tab.setAttribute('aria-selected', 'false');
                tab.classList.remove('Mui-selected');
            });
            
            const selectedTab = document.querySelector(`#customTabButton_${index}`);
            if (selectedTab) {
                selectedTab.setAttribute('aria-selected', 'true');
                selectedTab.classList.add('Mui-selected');
            }

            // Show the corresponding tab panel
            const tabPanels = document.querySelectorAll('[role="tabpanel"], .tabContent');
            tabPanels.forEach(panel => {
                panel.style.display = 'none';
            });

            const customTabPanel = document.querySelector(`#customTab_${index}`);
            if (customTabPanel) {
                customTabPanel.style.display = 'block';
            }
        }
    };

    // --- Event Listeners ---

    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", () => window.customTabsPlugin.init());
    } else {
        window.customTabsPlugin.init();
    }

    const handleNavigation = () => {
        console.debug('CustomTabs: Navigation detected, re-initializing after delay');
        setTimeout(() => {
            window.customTabsPlugin.init();
        }, 800);
    };

    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("pageshow", handleNavigation);
    window.addEventListener("focus", handleNavigation);

    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(history, arguments);
        handleNavigation();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(history, arguments);
        handleNavigation();
    };

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            console.debug('CustomTabs: Page became visible, checking for tabs');
            setTimeout(() => window.customTabsPlugin.init(), 300);
        }
    });

    let touchNavigation = false;
    document.addEventListener("touchstart", () => {
        touchNavigation = true;
    });

    document.addEventListener("touchend", () => {
        if (touchNavigation) {
            setTimeout(() => window.customTabsPlugin.init(), 1000);
            touchNavigation = false;
        }
    });

    console.log('CustomTabs: Plugin setup complete');
}
