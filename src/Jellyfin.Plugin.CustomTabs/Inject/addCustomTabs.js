// ============================================================================
// Custom Tabs Plugin - Complete Hybrid Layout Support
// Original author: Iamparadox (basic tab button creation for legacy layout)
// Extended by: soultaco83(AI assistance) (hybrid layout support, content panels, styling fixes)
// ============================================================================
// This plugin handles both tab buttons AND content display for Jellyfin custom tabs
// Supports three layout types: Modern (MUI Tabs), Hybrid (MUI Buttons), Legacy (Emby)

if (typeof window.customTabsPlugin == 'undefined') {

    window.customTabsPlugin = {
        // Original Iamparadox properties
        initialized: false,
        currentPage: null,
        
        // LLM comment: Added properties for hybrid layout support
        currentLayout: null,           // Tracks which Jellyfin layout is active
        customTabConfigs: [],          // Stores tab configurations from server
        activeTabIndex: null,          // Tracks currently active tab index

        // Kicks off the initialization process
        init: function() {
            console.log('CustomTabs: Initializing plugin');
            // LLM comment: Added layout detection before waiting for UI
            this.detectLayout();
            this.waitForUI();
        },

        // LLM comment: NEW FUNCTION - Detects which Jellyfin layout is currently active
        // Jellyfin has three different UI layouts that require different tab injection methods:
        // - Modern: Uses Material-UI Tabs component (MuiTabs-root)
        // - Hybrid: Uses Material-UI Buttons in toolbar that act like tabs
        // - Legacy: Uses traditional Emby tab slider
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

        // Waits for the necessary page elements to be ready before acting
        // LLM comment: Extended to support multiple layout types
        waitForUI: function() {
            // Check if we are on the home page by looking at the URL hash
            const hash = window.location.hash;
            if (hash !== '' && hash !== '#/home' && hash !== '#/home.html' && !hash.includes('#/home?') && !hash.includes('#/home.html?')) {
                console.debug('CustomTabs: Not on main page, skipping UI check. Hash:', hash);
                return;
            }

            // LLM comment: Re-detect layout in case page was updated
            this.detectLayout();

            // Check if ApiClient is available
            // LLM comment: Extended with layout-specific UI readiness checks
            if (typeof ApiClient !== 'undefined') {
                if (this.currentLayout === 'hybrid') {
                    // LLM comment: For hybrid layout, verify toolbar buttons and content container exist
                    const toolbar = document.querySelector('.MuiToolbar-root');
                    const hasButtons = toolbar && toolbar.querySelectorAll('.MuiButton-root[href*="#/home"]').length > 0;
                    const hasContentContainer = document.querySelector('.page.homePage');
                    
                    if (hasButtons && hasContentContainer) {
                        console.debug('CustomTabs: Hybrid layout UI ready, creating tabs');
                        this.createCustomTabs();
                        return;
                    }
                } else if (this.currentLayout === 'legacy') {
                    // For legacy layout, check for emby-tabs-slider
                    if (document.querySelector('.emby-tabs-slider')) {
                        console.debug('CustomTabs: Legacy layout UI ready, creating tabs');
                        this.createCustomTabs();
                        return;
                    }
                }
            }

            // Wait and check again if UI not ready
            console.debug('CustomTabs: Waiting for UI elements...');
            setTimeout(() => this.waitForUI(), 200);
        },

        // Fetches config and creates the tab elements in the DOM
        // LLM comment: Extended to route to layout-specific creation methods
        createCustomTabs: function() {
            console.debug('CustomTabs: Starting tab creation process');

            if (this.currentLayout === 'hybrid') {
                // LLM comment: Use hybrid-specific tab creation
                this.createHybridTabs();
            } else if (this.currentLayout === 'legacy') {
                // Use legacy tab creation
                this.createLegacyTabs();
            } else {
                console.error('CustomTabs: Unknown layout, cannot create tabs');
            }
        },

        // LLM comment: NEW FUNCTION - Creates tabs for Hybrid layout (MUI Buttons in toolbar)
        // This is more complex than legacy because it must:
        // 1. Create clickable button elements in the toolbar
        // 2. Create corresponding content panels for each tab
        // 3. Handle tab switching and activation
        // 4. Apply proper styling to make content panels full-screen
        createHybridTabs: function() {
            console.log('CustomTabs: Creating tabs for Hybrid layout');

            const toolbar = document.querySelector('.MuiToolbar-root');
            if (!toolbar) {
                console.error('CustomTabs: Could not find MuiToolbar');
                return;
            }

            // LLM comment: Find the container where tab buttons should be inserted
            // Try multiple selectors to handle different Jellyfin versions
            const buttonContainer = toolbar.querySelector('.MuiStack-root') || 
                                  toolbar.querySelector('div:has(> .MuiButton-root[href*="#/home"])') ||
                                  toolbar;

            if (!buttonContainer) {
                console.error('CustomTabs: Could not find button container in toolbar');
                return;
            }

            // LLM comment: IMPORTANT - Label existing Jellyfin tabs with data-tab-index
            // This allows our code to properly identify and select native tabs
            this.labelExistingTabs(buttonContainer);

            // LLM comment: Check if custom tabs already exist to prevent duplicates
            if (buttonContainer.querySelector('[id^="customTabButton_"]')) {
                console.debug('CustomTabs: Custom tabs already exist, skipping creation');
                // Still need to ensure content panels exist and handlers are set up
                this.ensureContentPanelsExist(); // This calls fixAllCustomTabPanelStyling internally
                this.setupHybridTabHandlers();
                this.checkHashAndActivateTab();
                return;
            }

            // Original Iamparadox pattern: Fetch tab configuration from the server
            ApiClient.fetch({
                url: ApiClient.getUrl('CustomTabs/Config'),
                type: 'GET',
                dataType: 'json',
                headers: {
                    accept: 'application/json'
                }
            }).then((configs) => {
                console.debug('CustomTabs: Retrieved config for', configs.length, 'tabs');
                
                // LLM comment: Store configs for later reference
                this.customTabConfigs = configs;

                // LLM comment: DYNAMIC INDEX ASSIGNMENT - Count all existing tabs to find next available index
                // This ensures custom tabs don't conflict with Jellyfin's native tabs
                const existingTabs = this.getAllExistingTabIndexes(buttonContainer);
                const maxExistingIndex = existingTabs.length > 0 ? Math.max(...existingTabs) : -1;
                let nextTabIndex = maxExistingIndex + 1;
                
                console.log(`CustomTabs: Found ${existingTabs.length} existing tabs (indexes: ${existingTabs.join(', ')})`);
                console.log(`CustomTabs: Starting custom tabs at index ${nextTabIndex}`);

                // Original Iamparadox pattern: Loop through configs and create a tab for each one
                // LLM comment: Extended to create both buttons and content panels
                configs.forEach((config, i) => {
                    const customTabId = `customTabButton_${i}`;
                    const tabIndex = nextTabIndex + i;

                    // Final check to ensure this specific tab doesn't already exist
                    if (document.querySelector(`#${customTabId}`)) {
                        console.debug(`CustomTabs: Tab ${customTabId} already exists, skipping`);
                        return;
                    }

                    console.log(`CustomTabs: Creating custom tab "${config.Title}" at index ${tabIndex}`);

                    // LLM comment: Create MUI-styled button element in toolbar
                    const button = document.createElement("a");
                    button.className = "MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-textInherit MuiButton-sizeMedium MuiButton-textSizeMedium MuiButton-colorInherit css-1f20jcn";
                    button.setAttribute("tabindex", "0");
                    button.setAttribute("href", `#/home?tab=${tabIndex}`);
                    button.setAttribute("id", customTabId);
                    button.setAttribute("data-tab-index", tabIndex);
                    button.textContent = config.Title;

                    // LLM comment: Add Material-UI ripple effect element
                    const ripple = document.createElement("span");
                    ripple.className = "MuiTouchRipple-root css-4mb1j7";
                    button.appendChild(ripple);

                    // LLM comment: Add click handler to manage tab switching
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        console.log(`CustomTabs: Custom tab button clicked: ${config.Title} (index ${tabIndex})`);
                        this.switchToTab(tabIndex);
                        history.pushState(null, '', `#/home?tab=${tabIndex}`);
                    });

                    buttonContainer.appendChild(button);
                    console.log(`CustomTabs: Added hybrid tab button ${customTabId} to toolbar`);

                    // LLM comment: Create the content panel that will display when tab is clicked
                    this.createTabContentPanel(i, tabIndex, config);
                    console.log(`CustomTabs: Created content panel for ${customTabId}`);
                });

                console.log('CustomTabs: All custom tabs created successfully (Hybrid layout)');
                
                // LLM comment: Set up event handlers and activate appropriate tab
                this.setupHybridTabHandlers();
                this.checkHashAndActivateTab();
            }).catch((error) => {
                console.error('CustomTabs: Error fetching tab configs:', error);
            });
        },

        // LLM comment: NEW FUNCTION - Labels existing Jellyfin tabs with data-tab-index attribute
        // This is crucial for proper tab selection and management
        labelExistingTabs: function(buttonContainer) {
            const nativeTabs = buttonContainer.querySelectorAll('.MuiButton-root[href*="#/home"]');
            nativeTabs.forEach((tab, index) => {
                if (!tab.hasAttribute('data-tab-index')) {
                    tab.setAttribute('data-tab-index', index);
                    console.log(`CustomTabs: Labeled native tab ${index}:`, tab.textContent.trim());
                }
            });
        },

        // LLM comment: NEW FUNCTION - Gets all existing tab indexes from the toolbar
        // Used to determine what index custom tabs should start at
        getAllExistingTabIndexes: function(buttonContainer) {
            const allTabs = buttonContainer.querySelectorAll('.MuiButton-root[href*="#/home"], [id^="customTabButton_"]');
            const indexes = [];
            
            allTabs.forEach(tab => {
                const tabIndex = tab.getAttribute('data-tab-index');
                if (tabIndex !== null) {
                    indexes.push(parseInt(tabIndex));
                }
            });
            
            return indexes.sort((a, b) => a - b);
        },

        // LLM comment: NEW FUNCTION - Creates the HTML content panel for a custom tab
        // Content panels are hidden by default and shown when their tab is clicked
        createTabContentPanel: function(configIndex, tabIndex, config) {
            const homePage = document.querySelector('.page.homePage');
            if (!homePage) {
                console.error('CustomTabs: Could not find home page container');
                return;
            }

            const panelId = `customTab_${configIndex}`;
            
            // LLM comment: Check if panel already exists
            if (document.querySelector(`#${panelId}`)) {
                console.debug(`CustomTabs: Content panel ${panelId} already exists`);
                return;
            }

            // LLM comment: Create the panel container
            const panel = document.createElement('div');
            panel.id = panelId;
            panel.className = 'customTabPanel';
            panel.setAttribute('data-tab-index', tabIndex);
            panel.style.display = 'none'; // Hidden by default
            
            // LLM comment: Set the panel's HTML content from the config
            panel.innerHTML = config.HtmlContent || '<p>No content configured for this tab.</p>';
            
            homePage.appendChild(panel);
            console.log(`CustomTabs: Created content panel ${panelId} for tab index ${tabIndex}`);
        },

        // LLM comment: NEW FUNCTION - Ensures all custom tab content panels exist
        // This is called on navigation to recreate panels if they were removed
        ensureContentPanelsExist: function() {
            if (this.customTabConfigs.length === 0) {
                console.debug('CustomTabs: No custom tab configs available');
                return;
            }

            const homePage = document.querySelector('.page.homePage');
            if (!homePage) {
                console.error('CustomTabs: Could not find home page container');
                return;
            }

            const toolbar = document.querySelector('.MuiToolbar-root');
            if (!toolbar) return;

            const buttonContainer = toolbar.querySelector('.MuiStack-root') || 
                                  toolbar.querySelector('div:has(> .MuiButton-root[href*="#/home"])') ||
                                  toolbar;
            if (!buttonContainer) return;

            // LLM comment: Calculate starting index for custom tabs
            const existingTabs = this.getAllExistingTabIndexes(buttonContainer);
            const maxExistingIndex = existingTabs.length > 0 ? Math.max(...existingTabs) : -1;
            let nextTabIndex = maxExistingIndex + 1;

            // LLM comment: Create missing panels
            this.customTabConfigs.forEach((config, i) => {
                const panelId = `customTab_${i}`;
                const tabIndex = nextTabIndex + i;

                if (!document.querySelector(`#${panelId}`)) {
                    console.log(`CustomTabs: Recreating missing panel ${panelId}`);
                    this.createTabContentPanel(i, tabIndex, config);
                }
            });

            // LLM comment: Apply styling fixes to all custom panels
            this.fixAllCustomTabPanelStyling();
        },

        // LLM comment: NEW FUNCTION - Applies full-screen styling to all custom tab panels
        // CRITICAL: Fixes the issue where custom tab content doesn't fill the screen properly
        // This must use FIXED positioning, not absolute, to work correctly
        fixAllCustomTabPanelStyling: function() {
            const customPanels = document.querySelectorAll('[id^="customTab_"]');
            
            customPanels.forEach(panel => {
                console.log('CustomTabs: Applying full-screen styling to', panel.id);
                
                // LLM comment: CRITICAL - Use FIXED positioning for true full-screen display
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
                panel.style.zIndex = '1000';
                
                // LLM comment: Also fix child containers to ensure they fill the panel
                const childContainers = panel.querySelectorAll('.sections, div[class*="container"]');
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
                
                // LLM comment: CRITICAL CSS FIX - Rewrite CSS selectors to match actual panel ID
                // If a panel was copied from customTab_0 template but has a different ID,
                // its internal CSS won't work because it references #customTab_0
                const tabIdMatch = panel.id.match(/customTab_(\d+)/);
                if (tabIdMatch && parseInt(tabIdMatch[1]) > 0) {
                    const styleTags = panel.querySelectorAll('style');
                    styleTags.forEach(styleTag => {
                        let cssText = styleTag.textContent;
                        if (cssText.includes('#customTab_0')) {
                            const updatedCss = cssText.replace(/#customTab_0\b/g, `#${panel.id}`);
                            styleTag.textContent = updatedCss;
                            console.log(`CustomTabs: Rewrote CSS for ${panel.id}`);
                        }
                    });
                }
            });
            
            console.log('CustomTabs: Full-screen styling applied to all custom panels');
        },

        // LLM comment: NEW FUNCTION - Sets up click handlers for all tabs (native and custom)
        // This ensures proper tab switching behavior
        setupHybridTabHandlers: function() {
            const toolbar = document.querySelector('.MuiToolbar-root');
            if (!toolbar) return;

            // LLM comment: Find all tabs in the toolbar
            const allTabs = toolbar.querySelectorAll('.MuiButton-root[href*="#/home"], [id^="customTabButton_"]');
            
            allTabs.forEach(tab => {
                // LLM comment: Skip if handler already attached
                if (tab.hasAttribute('data-handler-attached')) return;
                
                tab.addEventListener('click', (e) => {
                    const tabIndex = parseInt(tab.getAttribute('data-tab-index'));
                    
                    // LLM comment: Only handle custom tabs (index >= 2)
                    if (tabIndex >= 2) {
                        e.preventDefault();
                        console.log(`CustomTabs: Tab ${tabIndex} clicked`);
                        this.switchToTab(tabIndex);
                        history.pushState(null, '', `#/home?tab=${tabIndex}`);
                    }
                });
                
                tab.setAttribute('data-handler-attached', 'true');
            });
            
            console.log('CustomTabs: Tab handlers set up');
        },

        // LLM comment: NEW FUNCTION - Checks URL hash and activates the appropriate tab
        // Called after tabs are created and on navigation events
        checkHashAndActivateTab: function() {
            const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
            const tabParam = urlParams.get('tab');
            
            if (tabParam !== null) {
                const tabIndex = parseInt(tabParam);
                console.log(`CustomTabs: URL has tab=${tabIndex}, activating`);
                this.switchToTab(tabIndex);
            } else {
                // LLM comment: No tab specified, activate default (tab 0)
                console.log('CustomTabs: No tab in URL, activating default tab 0');
                this.switchToTab(0);
            }
        },

        // LLM comment: NEW FUNCTION - Switches to the specified tab index
        // This is the core function that handles showing/hiding tab content
        switchToTab: function(tabIndex) {
            console.log(`CustomTabs: Switching to tab ${tabIndex}`);
            this.activeTabIndex = tabIndex;

            // LLM comment: Update button selection states in toolbar
            const toolbar = document.querySelector('.MuiToolbar-root');
            if (toolbar) {
                const allTabs = toolbar.querySelectorAll('.MuiButton-root[href*="#/home"], [id^="customTabButton_"]');
                allTabs.forEach(tab => {
                    const thisTabIndex = parseInt(tab.getAttribute('data-tab-index'));
                    if (thisTabIndex === tabIndex) {
                        tab.classList.add('Mui-selected');
                        tab.setAttribute('aria-selected', 'true');
                    } else {
                        tab.classList.remove('Mui-selected');
                        tab.setAttribute('aria-selected', 'false');
                    }
                });
            }

            // LLM comment: Hide all custom tab panels first
            const allCustomPanels = document.querySelectorAll('[id^="customTab_"]');
            allCustomPanels.forEach(panel => {
                panel.style.display = 'none';
                panel.classList.remove('is-active');
            });

            // LLM comment: Hide or show native Jellyfin content based on tab selection
            const nativeContent = document.querySelector('.page.homePage > div:not([id^="customTab_"])');
            let targetPanel = null;

            if (tabIndex < 2) {
                // LLM comment: Native Jellyfin tab (0 or 1)
                if (nativeContent) {
                    nativeContent.style.display = 'block';
                }
                console.log('CustomTabs: Showing native Jellyfin content for tab', tabIndex);
            } else {
                // LLM comment: Custom tab (2+)
                if (nativeContent) {
                    nativeContent.style.display = 'none';
                }

                // LLM comment: Find the custom panel by its data-tab-index
                targetPanel = document.querySelector(`[id^="customTab_"][data-tab-index="${tabIndex}"]`);
                
                if (!targetPanel) {
                    console.warn(`CustomTabs: No custom panel found for tab index ${tabIndex}, falling back to native`);
                    if (nativeContent) {
                        nativeContent.style.display = 'block';
                    }
                    console.log('CustomTabs: Native Jellyfin tab, letting default behavior handle it');
                    return;
                }
            }

            // LLM comment: Show and style the target custom panel
            if (targetPanel) {
                targetPanel.style.display = 'block';
                targetPanel.classList.add('is-active');
                
                // LLM comment: APPLY FULL-SCREEN STYLING
                // This ensures consistent display even if panels were created before the fix
                if (targetPanel.id && targetPanel.id.startsWith('customTab_')) {
                    console.log('CustomTabs: Applying full-screen styling to', targetPanel.id);
                    
                    // LLM comment: CRITICAL - Use FIXED positioning for true full-screen
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
                    
                    // LLM comment: Also fix child containers immediately
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
                        
                        // LLM comment: CRITICAL CSS FIX - Rewrite CSS selectors if needed
                        const tabIdMatch = targetPanel.id.match(/customTab_(\d+)/);
                        if (tabIdMatch && parseInt(tabIdMatch[1]) > 0) {
                            const styleTags = targetPanel.querySelectorAll('style');
                            styleTags.forEach(styleTag => {
                                let cssText = styleTag.textContent;
                                if (cssText.includes('#customTab_0')) {
                                    const updatedCss = cssText.replace(/#customTab_0\b/g, `#${targetPanel.id}`);
                                    styleTag.textContent = updatedCss;
                                    console.log(`CustomTabs: Rewrote CSS for ${targetPanel.id}`);
                                }
                            });
                        }
                    }, 0);
                    
                    console.log('CustomTabs: Full-screen styling applied successfully');
                }
                
                console.log('CustomTabs: Activated tab panel', targetPanel.id);
            } else {
                console.warn('CustomTabs: Could not find panel for tab index', tabIndex);
                // LLM comment: Try to recreate panels if they're missing
                if (tabIndex >= 2) {
                    console.log('CustomTabs: Attempting to recreate missing custom tab panels');
                    this.ensureContentPanelsExist();
                }
            }
        },

        // Creates tabs for Legacy layout
        // This function is largely unchanged from the original
        createLegacyTabs: function() {
            console.log('CustomTabs: Creating tabs for Legacy layout');

            const tabsSlider = document.querySelector('.emby-tabs-slider');
            if (!tabsSlider) {
                console.debug('CustomTabs: Tabs slider not found');
                return;
            }

            // Prevent creating duplicate tabs
            if (tabsSlider.querySelector('[id^="customTabButton_"]')) {
                console.debug('CustomTabs: Custom tabs already exist in DOM, skipping creation');
                return;
            }

            // Fetch tab configuration from the server
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

                // Loop through configs and create a tab for each one
                configs.forEach((config, i) => {
                    const customTabId = `customTabButton_${i}`;

                    // Final check to ensure this specific tab doesn't already exist
                    if (document.querySelector(`#${customTabId}`)) {
                        console.debug(`CustomTabs: Tab ${customTabId} already exists, skipping`);
                        return; // 'return' here acts like 'continue' in a forEach loop
                    }

                    console.log("CustomTabs: Creating custom tab:", config.Title);

                    // Create tab button elements
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

    // ============================================================================
    // Event Listeners to Handle Navigation
    // Basic event setup
    // LLM comment: Enhanced for hybrid layout support
    // ============================================================================

    // Initial setup when the page is first loaded
    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", () => window.customTabsPlugin.init());
    } else {
        window.customTabsPlugin.init();
    }

    // A single handler for all navigation-style events
    const handleNavigation = () => {
        console.debug('CustomTabs: Navigation detected, re-initializing after delay');
        // Delay helps ensure the DOM has settled after navigation
        setTimeout(() => {
            window.customTabsPlugin.init();
        }, 800);
    };

    // Standard browser navigation (back/forward buttons)
    window.addEventListener("popstate", handleNavigation);

    // Mobile-specific events that can signify a page change
    window.addEventListener("pageshow", handleNavigation);
    window.addEventListener("focus", handleNavigation);

    // Monkey-patch history API to detect navigation
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

    // Handle tab visibility changes
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            console.debug('CustomTabs: Page became visible, checking for tabs');
            setTimeout(() => window.customTabsPlugin.init(), 300);
        }
    });

    // Handle touch events which can also trigger navigation on mobile
    // These events help detect swipe navigation gestures on mobile devices
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
