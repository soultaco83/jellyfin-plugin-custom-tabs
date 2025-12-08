// Updated Custom Tabs Plugin - Handles Jellyfin 10.12.0 Hybrid Layout
// The new "modern" layout uses MUI Button links in the toolbar, not MuiTabs
if (typeof window.customTabsPlugin == 'undefined') {

    window.customTabsPlugin = {
        initialized: false,
        currentPage: null,
        currentLayout: null, // 'legacy', 'hybrid', or 'modern'

        init: function() {
            console.log('CustomTabs: Initializing plugin');
            this.detectLayout();
            this.waitForUI();
        },

        // Detect which layout is being used
        detectLayout: function() {
            // Check for different tab implementations
            const hasMuiAppBar = !!document.querySelector('.MuiAppBar-root');
            const hasMuiTabs = !!document.querySelector('.MuiTabs-root');
            const hasToolbarButtons = document.querySelectorAll('.MuiToolbar-root .MuiButton-root[href*="#/home"]').length > 0;
            const hasEmbyTabs = !!document.querySelector('.emby-tabs-slider');
            
            if (hasMuiTabs) {
                // True modern layout with MUI Tabs component
                this.currentLayout = 'modern';
                console.log('CustomTabs: Detected Modern layout (MUI Tabs)');
            } else if (hasMuiAppBar && hasToolbarButtons) {
                // Hybrid layout: MUI AppBar with Button links as tabs
                this.currentLayout = 'hybrid';
                console.log('CustomTabs: Detected Hybrid layout (MUI Buttons as tabs)');
            } else if (hasEmbyTabs) {
                // Pure legacy layout
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
                if (this.currentLayout === 'hybrid') {
                    // Check for MUI Toolbar with button links
                    const toolbar = document.querySelector('.MuiToolbar-root');
                    const hasButtons = toolbar && toolbar.querySelectorAll('.MuiButton-root[href*="#/home"]').length > 0;
                    
                    if (hasButtons) {
                        console.debug('CustomTabs: Hybrid layout UI ready, creating tabs');
                        this.createCustomTabs();
                        return;
                    }
                } else if (this.currentLayout === 'modern') {
                    // Check for MUI Tabs
                    if (document.querySelector('.MuiTabs-root')) {
                        console.debug('CustomTabs: Modern layout UI ready, creating tabs');
                        this.createCustomTabs();
                        return;
                    }
                } else if (this.currentLayout === 'legacy') {
                    // Check for emby tabs
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

            if (this.currentLayout === 'hybrid') {
                this.createHybridTabs();
            } else if (this.currentLayout === 'modern') {
                this.createModernTabs();
            } else if (this.currentLayout === 'legacy') {
                this.createLegacyTabs();
            } else {
                console.error('CustomTabs: Unknown layout, cannot create tabs');
            }
        },

        // Create tabs for hybrid layout (MUI Button links in toolbar)
        createHybridTabs: function() {
            console.log('CustomTabs: Creating tabs for Hybrid layout');

            // Find the container for tab buttons
            // They're usually in a MuiStack within the MuiToolbar
            const toolbar = document.querySelector('.MuiToolbar-root');
            if (!toolbar) {
                console.error('CustomTabs: Could not find MuiToolbar');
                return;
            }

            // Find the stack/container that holds the Home and Favorites buttons
            const buttonContainer = toolbar.querySelector('.MuiStack-root') || 
                                  toolbar.querySelector('div:has(> .MuiButton-root[href*="#/home"])') ||
                                  toolbar;

            if (!buttonContainer) {
                console.error('CustomTabs: Could not find button container in toolbar');
                return;
            }

            // Check if custom tabs already exist
            if (buttonContainer.querySelector('[id^="customTabButton_"]')) {
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

                // Get the next tab index (count existing home tabs)
                const existingTabs = buttonContainer.querySelectorAll('.MuiButton-root[href*="#/home"]');
                let nextTabIndex = existingTabs.length;

                configs.forEach((config, i) => {
                    const customTabId = `customTabButton_${i}`;

                    if (document.querySelector(`#${customTabId}`)) {
                        console.debug(`CustomTabs: Tab ${customTabId} already exists, skipping`);
                        return;
                    }

                    console.log("CustomTabs: Creating custom tab:", config.Title);

                    // Create MUI Button link (matching Jellyfin's structure)
                    const button = document.createElement("a");
                    button.className = "MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-textInherit MuiButton-sizeMedium MuiButton-textSizeMedium MuiButton-colorInherit css-1f20jcn";
                    button.setAttribute("tabindex", "0");
                    button.setAttribute("href", `#/home?tab=${nextTabIndex + i}`);
                    button.setAttribute("id", customTabId);

                    // Add button text
                    button.textContent = config.Title;

                    // Add ripple effect container (for MUI)
                    const ripple = document.createElement("span");
                    ripple.className = "MuiTouchRipple-root css-4mb1j7";
                    button.appendChild(ripple);

                    // Append to container
                    buttonContainer.appendChild(button);
                    console.log(`CustomTabs: Added hybrid tab ${customTabId}`);
                });

                console.log('CustomTabs: All custom tabs created successfully (Hybrid layout)');
            }).catch((error) => {
                console.error('CustomTabs: Error fetching tab configs:', error);
            });
        },

        // Create tabs for true modern layout (MUI Tabs component)
        createModernTabs: function() {
            console.log('CustomTabs: Creating tabs for Modern layout');

            const muiTabsRoot = document.querySelector('.MuiTabs-root [role="tablist"], .MuiTabs-scroller');
            
            if (!muiTabsRoot) {
                console.error('CustomTabs: Could not find MUI tabs container');
                return;
            }

            if (muiTabsRoot.querySelector('[id^="customTabButton_"]')) {
                console.debug('CustomTabs: Custom tabs already exist, skipping creation');
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

                configs.forEach((config, i) => {
                    const customTabId = `customTabButton_${i}`;

                    if (document.querySelector(`#${customTabId}`)) {
                        console.debug(`CustomTabs: Tab ${customTabId} already exists, skipping`);
                        return;
                    }

                    console.log("CustomTabs: Creating custom tab:", config.Title);

                    const button = document.createElement("button");
                    button.type = "button";
                    button.classList.add("MuiButtonBase-root", "MuiTab-root");
                    button.setAttribute("role", "tab");
                    button.setAttribute("aria-selected", "false");
                    button.setAttribute("tabindex", "-1");
                    button.setAttribute("id", customTabId);
                    button.setAttribute("data-index", i + 2);
                    
                    const label = document.createElement("span");
                    label.classList.add("MuiTab-label");
                    label.textContent = config.Title;
                    button.appendChild(label);

                    const indicator = document.createElement("span");
                    indicator.classList.add("MuiTouchRipple-root");
                    button.appendChild(indicator);

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

        // Create tabs for legacy layout
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
