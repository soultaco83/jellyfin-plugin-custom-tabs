// Custom Tabs Plugin - Complete Hybrid Layout Support
// Handles both tab buttons AND content display
if (typeof window.customTabsPlugin == 'undefined') {

    window.customTabsPlugin = {
        initialized: false,
        currentPage: null,
        currentLayout: null,
        customTabConfigs: [],
        activeTabIndex: null,

        init: function() {
            console.log('CustomTabs: Initializing plugin');
            this.detectLayout();
            this.waitForUI();
        },

        detectLayout: function() {
            const hasMuiAppBar = !!document.querySelector('.MuiAppBar-root');
            const hasMuiTabs = !!document.querySelector('.MuiTabs-root');
            const hasToolbarButtons = document.querySelectorAll('.MuiToolbar-root .MuiButton-root[href*="#/home"]').length > 0;
            const hasEmbyTabs = !!document.querySelector('.emby-tabs-slider');
            
            if (hasMuiTabs) {
                this.currentLayout = 'modern';
                console.log('CustomTabs: Detected Modern layout (MUI Tabs)');
            } else if (hasMuiAppBar && hasToolbarButtons) {
                this.currentLayout = 'hybrid';
                console.log('CustomTabs: Detected Hybrid layout (MUI Buttons as tabs)');
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

            this.detectLayout();

            if (typeof ApiClient !== 'undefined') {
                if (this.currentLayout === 'hybrid') {
                    const toolbar = document.querySelector('.MuiToolbar-root');
                    const hasButtons = toolbar && toolbar.querySelectorAll('.MuiButton-root[href*="#/home"]').length > 0;
                    const hasContentContainer = document.querySelector('.page.homePage');
                    
                    if (hasButtons && hasContentContainer) {
                        console.debug('CustomTabs: Hybrid layout UI ready, creating tabs');
                        this.createCustomTabs();
                        return;
                    }
                } else if (this.currentLayout === 'legacy') {
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
            } else if (this.currentLayout === 'legacy') {
                this.createLegacyTabs();
            } else {
                console.error('CustomTabs: Unknown layout, cannot create tabs');
            }
        },

        createHybridTabs: function() {
            console.log('CustomTabs: Creating tabs for Hybrid layout');

            const toolbar = document.querySelector('.MuiToolbar-root');
            if (!toolbar) {
                console.error('CustomTabs: Could not find MuiToolbar');
                return;
            }

            const buttonContainer = toolbar.querySelector('.MuiStack-root') || 
                                  toolbar.querySelector('div:has(> .MuiButton-root[href*="#/home"])') ||
                                  toolbar;

            if (!buttonContainer) {
                console.error('CustomTabs: Could not find button container in toolbar');
                return;
            }

            // IMPORTANT: Set data-tab-index on existing Jellyfin tabs for proper selection
            this.labelExistingTabs(buttonContainer);

            // Check if custom tabs already exist
            if (buttonContainer.querySelector('[id^="customTabButton_"]')) {
                console.debug('CustomTabs: Custom tabs already exist, skipping creation');
                // Still need to ensure content panels exist and set up handlers
                this.ensureContentPanelsExist(); // This will call fixAllCustomTabPanelStyling internally
                this.setupHybridTabHandlers();
                this.checkHashAndActivateTab();
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
                
                this.customTabConfigs = configs;

                // DYNAMIC: Count ALL existing tabs to find the next available index
                const existingTabs = this.getAllExistingTabIndexes(buttonContainer);
                const maxExistingIndex = existingTabs.length > 0 ? Math.max(...existingTabs) : -1;
                let nextTabIndex = maxExistingIndex + 1;
                
                console.log(`CustomTabs: Found ${existingTabs.length} existing tabs (indexes: ${existingTabs.join(', ')})`);
                console.log(`CustomTabs: Starting custom tabs at index ${nextTabIndex}`);

                // Create buttons and content panels
                configs.forEach((config, i) => {
                    const customTabId = `customTabButton_${i}`;
                    const tabIndex = nextTabIndex + i;

                    if (document.querySelector(`#${customTabId}`)) {
                        console.debug(`CustomTabs: Tab ${customTabId} already exists, skipping`);
                        return;
                    }

                    console.log(`CustomTabs: Creating custom tab "${config.Title}" at index ${tabIndex}`);

                    // Create button in toolbar
                    const button = document.createElement("a");
                    button.className = "MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-textInherit MuiButton-sizeMedium MuiButton-textSizeMedium MuiButton-colorInherit css-1f20jcn";
                    button.setAttribute("tabindex", "0");
                    button.setAttribute("href", `#/home?tab=${tabIndex}`);
                    button.setAttribute("id", customTabId);
                    button.setAttribute("data-tab-index", tabIndex);
                    button.textContent = config.Title;

                    const ripple = document.createElement("span");
                    ripple.className = "MuiTouchRipple-root css-4mb1j7";
                    button.appendChild(ripple);

                    // Add click handler to prevent default and handle tab switching
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        console.log(`CustomTabs: Custom tab button clicked: ${config.Title} (index ${tabIndex})`);
                        this.switchToTab(tabIndex);
                        history.pushState(null, '', `#/home?tab=${tabIndex}`);
                    });

                    buttonContainer.appendChild(button);
                    console.log(`CustomTabs: Added hybrid tab button ${customTabId} to toolbar`);

                    // Create content panel
                    this.createTabContentPanel(i, tabIndex, config);
                    console.log(`CustomTabs: Created content panel for ${customTabId}`);
                });

                console.log('CustomTabs: All custom tabs created successfully (Hybrid layout)');
                
                // Set up handlers and check if we should activate a custom tab
                this.setupHybridTabHandlers();
                this.checkHashAndActivateTab();
                
            }).catch((error) => {
                console.error('CustomTabs: Error fetching tab configs:', error);
            });
        },

        getAllExistingTabIndexes: function(buttonContainer) {
            // Get all existing tab indexes from Jellyfin's native tabs
            const indexes = [];
            const existingButtons = buttonContainer.querySelectorAll('.MuiButton-root[href*="#/"]');
            
            existingButtons.forEach(btn => {
                // Skip our custom tabs
                if (btn.id && btn.id.startsWith('customTabButton_')) {
                    return;
                }
                
                const href = btn.getAttribute('href') || '';
                
                // Extract tab index from href
                const match = href.match(/[?&]tab=(\d+)/);
                if (match) {
                    indexes.push(parseInt(match[1]));
                } else if (href === '#/' || href === '#/home' || href.includes('#/home?') && !href.includes('tab=')) {
                    // This is the home tab (index 0)
                    indexes.push(0);
                }
            });
            
            // Remove duplicates and sort
            return [...new Set(indexes)].sort((a, b) => a - b);
        },

        labelExistingTabs: function(buttonContainer) {
            // Label existing Jellyfin tabs with data-tab-index for proper selection
            const existingButtons = buttonContainer.querySelectorAll('.MuiButton-root[href*="#/"]');
            
            existingButtons.forEach(btn => {
                if (btn.getAttribute('data-tab-index')) {
                    return; // Already labeled
                }
                
                // Skip our custom tabs
                if (btn.id && btn.id.startsWith('customTabButton_')) {
                    return;
                }
                
                const href = btn.getAttribute('href') || '';
                const text = btn.textContent.trim();
                
                let tabIndex = null;
                
                // Extract tab index from href
                const match = href.match(/[?&]tab=(\d+)/);
                if (match) {
                    // Has explicit tab parameter (e.g., #/home?tab=1)
                    tabIndex = parseInt(match[1]);
                } else if (href === '#/' || href === '#/home' || (href.includes('#/home') && !href.includes('tab='))) {
                    // This is the home tab (no tab parameter = index 0)
                    tabIndex = 0;
                }
                
                if (tabIndex !== null) {
                    btn.setAttribute('data-tab-index', tabIndex);
                    console.debug(`CustomTabs: Labeled "${text}" button as tab ${tabIndex}`);
                    
                    // Add click handler to existing tabs
                    // Store the original handler to avoid duplicates
                    if (!btn.hasAttribute('data-custom-tabs-handler')) {
                        btn.setAttribute('data-custom-tabs-handler', 'true');
                        
                        const originalHref = btn.getAttribute('href');
                        btn.addEventListener('click', (e) => {
                            // For native Jellyfin tabs, we'll let them handle their own content
                            // but we still update button states for visual consistency
                            this.updateButtonStates(tabIndex);
                        });
                    }
                }
            });
        },

        updateButtonStates: function(activeIndex) {
            // Just update visual states without switching content
            const toolbar = document.querySelector('.MuiToolbar-root');
            if (!toolbar) return;
            
            const buttonContainer = toolbar.querySelector('.MuiStack-root') || toolbar;
            const allButtons = buttonContainer.querySelectorAll('.MuiButton-root[href*="#/"]');
            
            allButtons.forEach(btn => {
                const btnTabIndex = parseInt(btn.getAttribute('data-tab-index') || '0');
                
                if (btnTabIndex === activeIndex) {
                    btn.style.opacity = '1';
                    btn.style.fontWeight = 'bold';
                } else {
                    btn.style.opacity = '0.7';
                    btn.style.fontWeight = 'normal';
                }
            });
        },

        createTabContentPanel: function(configIndex, tabIndex, config) {
            // Find the home page container
            const homePage = document.querySelector('.page.homePage');
            if (!homePage) {
                console.error('CustomTabs: Could not find home page container');
                return;
            }

            // Check if panel already exists
            if (document.querySelector(`#customTab_${configIndex}`)) {
                console.debug(`CustomTabs: Panel customTab_${configIndex} already exists`);
                return;
            }

            // Create tab panel
            const panel = document.createElement('div');
            panel.className = 'tabContent pageTabContent';
            panel.id = `customTab_${configIndex}`;
            panel.setAttribute('data-index', tabIndex);
            panel.style.display = 'none';
            
            // CRITICAL: Use FIXED positioning for viewport-relative full-screen
            // This ensures panels fill the entire browser window, not just parent container
            panel.style.position = 'fixed';
            panel.style.top = '0';
            panel.style.left = '0';
            panel.style.right = '0';
            panel.style.bottom = '0';
            panel.style.width = '100vw';
            panel.style.height = '100vh';
            panel.style.padding = '0';
            panel.style.margin = '0';
            panel.style.overflow = 'hidden';
            panel.style.zIndex = '1000'; // Above other Jellyfin elements
            
            // Insert the HTML content from config
            panel.innerHTML = config.ContentHtml;

            // CRITICAL: Also style any child containers to fill space
            // Many iframe configs wrap the iframe in a .sections div
            setTimeout(() => {
                const childContainers = panel.querySelectorAll('.sections, div:not(.requestIframe)');
                childContainers.forEach(container => {
                    container.style.width = '100%';
                    container.style.height = '100%';
                    container.style.position = 'absolute';
                    container.style.top = '0';
                    container.style.left = '0';
                    container.style.right = '0';
                    container.style.bottom = '0';
                    container.style.padding = '0';
                    container.style.margin = '0';
                });
                
                // Ensure iframes are properly sized
                const iframes = panel.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    // Let the iframe's CSS handle positioning, but ensure it's visible
                    iframe.style.display = 'block';
                    console.log(`CustomTabs: Styled iframe in panel ${panel.id}`);
                });
            }, 0);

            // Append to home page
            homePage.appendChild(panel);
            console.log(`CustomTabs: Created content panel customTab_${configIndex} with full viewport styling`);
        },

        ensureContentPanelsExist: function() {
            // Check if content panels exist, recreate if missing
            if (!this.customTabConfigs || this.customTabConfigs.length === 0) {
                console.debug('CustomTabs: No custom tab configs stored, fetching...');
                
                ApiClient.fetch({
                    url: ApiClient.getUrl('CustomTabs/Config'),
                    type: 'GET',
                    dataType: 'json',
                    headers: {
                        accept: 'application/json'
                    }
                }).then((configs) => {
                    this.customTabConfigs = configs;
                    this.recreateContentPanels();
                }).catch((error) => {
                    console.error('CustomTabs: Error fetching tab configs:', error);
                });
            } else {
                this.recreateContentPanels();
            }
        },

        recreateContentPanels: function() {
            // Get button container to count existing tabs dynamically
            const toolbar = document.querySelector('.MuiToolbar-root');
            if (!toolbar) return;
            
            const buttonContainer = toolbar.querySelector('.MuiStack-root') || toolbar;
            
            // DYNAMIC: Get all existing tab indexes
            const existingTabs = this.getAllExistingTabIndexes(buttonContainer);
            const maxExistingIndex = existingTabs.length > 0 ? Math.max(...existingTabs) : -1;
            const nextTabIndex = maxExistingIndex + 1;

            console.log(`CustomTabs: Recreating panels - starting at tab index ${nextTabIndex}`);

            this.customTabConfigs.forEach((config, i) => {
                const tabIndex = nextTabIndex + i;
                const panelId = `customTab_${i}`;
                
                if (!document.querySelector(`#${panelId}`)) {
                    console.log(`CustomTabs: Recreating missing panel ${panelId} at tab index ${tabIndex}`);
                    this.createTabContentPanel(i, tabIndex, config);
                }
            });
        },

        setupHybridTabHandlers: function() {
            // Handle browser back/forward
            window.addEventListener('popstate', () => {
                this.checkHashAndActivateTab();
            });

            // Handle hash changes
            window.addEventListener('hashchange', () => {
                this.checkHashAndActivateTab();
            });
        },

        checkHashAndActivateTab: function() {
            const hash = window.location.hash;
            const match = hash.match(/[?&]tab=(\d+)/);
            
            if (match) {
                const tabIndex = parseInt(match[1]);
                this.switchToTab(tabIndex);
            }
        },

        switchToTab: function(tabIndex) {
            console.log('CustomTabs: Switching to tab', tabIndex);
            
            this.activeTabIndex = tabIndex;

            // Update button states
            const toolbar = document.querySelector('.MuiToolbar-root');
            if (toolbar) {
                const buttonContainer = toolbar.querySelector('.MuiStack-root') || toolbar;
                
                // Make sure existing tabs are labeled
                this.labelExistingTabs(buttonContainer);
                
                const allButtons = buttonContainer.querySelectorAll('.MuiButton-root[href*="#/"]');
                allButtons.forEach(btn => {
                    const btnTabIndex = parseInt(btn.getAttribute('data-tab-index') || '0');
                    
                    if (btnTabIndex === tabIndex) {
                        btn.style.opacity = '1';
                        btn.style.fontWeight = 'bold';
                    } else {
                        btn.style.opacity = '0.7';
                        btn.style.fontWeight = 'normal';
                    }
                });
            }

            // Make sure home page container is set up for absolute positioning
            const homePage = document.querySelector('.page.homePage');
            if (homePage) {
                homePage.style.position = 'relative';
                homePage.style.height = '100%';
                homePage.style.width = '100%';
            }

            // Hide all tab panels
            const allPanels = document.querySelectorAll('.tabContent.pageTabContent');
            allPanels.forEach(panel => {
                panel.style.display = 'none';
                panel.classList.remove('is-active');
            });

            // Show the selected panel
            let targetPanel = null;
            
            // Check if it's a custom tab (check by data-index attribute)
            const customTabPanel = document.querySelector(`.tabContent[data-index="${tabIndex}"]`);
            if (customTabPanel) {
                targetPanel = customTabPanel;
                console.log('CustomTabs: Found custom tab panel', customTabPanel.id);
            } else if (tabIndex === 0) {
                // Home tab
                targetPanel = document.querySelector('#homeTab');
            } else {
                // Try to find by matching href in existing buttons (for native Jellyfin tabs)
                const matchingButton = toolbar?.querySelector(`.MuiButton-root[data-tab-index="${tabIndex}"]`);
                if (matchingButton) {
                    // This is a native Jellyfin tab, let Jellyfin handle it
                    console.log('CustomTabs: Native Jellyfin tab, letting default behavior handle it');
                    return;
                }
            }

            if (targetPanel) {
                targetPanel.style.display = 'block';
                targetPanel.classList.add('is-active');
                
                // APPLY FULL-SCREEN STYLING TO ALL CUSTOM TABS (ANY WITH ID STARTING WITH customTab_)
                // This ensures consistent styling even if panels were created before the fix
                if (targetPanel.id && targetPanel.id.startsWith('customTab_')) {
                    console.log('CustomTabs: Applying full-screen styling to', targetPanel.id);
                    
                    // CRITICAL: Use FIXED positioning for true full-screen
                    targetPanel.style.position = 'fixed';
                    targetPanel.style.top = '0';
                    targetPanel.style.left = '0';
                    targetPanel.style.right = '0';
                    targetPanel.style.bottom = '0';
                    targetPanel.style.width = '100vw';
                    targetPanel.style.height = '100vh';
                    targetPanel.style.padding = '0';
                    targetPanel.style.margin = '0';
                    targetPanel.style.overflow = 'hidden';
                    targetPanel.style.zIndex = '1000';
                    
                    // Also fix any child containers
                    setTimeout(() => {
                        const childContainers = targetPanel.querySelectorAll('.sections, div[class*="container"]');
                        childContainers.forEach(container => {
                            container.style.width = '100%';
                            container.style.height = '100%';
                            container.style.position = 'absolute';
                            container.style.top = '0';
                            container.style.left = '0';
                            container.style.right = '0';
                            container.style.bottom = '0';
                            container.style.padding = '0';
                            container.style.margin = '0';
                        });
                    }, 0);
                    
                    console.log('CustomTabs: Full-screen styling applied successfully');
                }
                
                console.log('CustomTabs: Activated tab panel', targetPanel.id);
            } else {
                console.warn('CustomTabs: Could not find panel for tab index', tabIndex);
                // Try to recreate panels if they're missing
                if (tabIndex >= 2) {
                    console.log('CustomTabs: Attempting to recreate missing custom tab panels');
                    this.ensureContentPanelsExist();
                }
            }
        },

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

    console.log('CustomTabs: Plugin setup complete');
}
