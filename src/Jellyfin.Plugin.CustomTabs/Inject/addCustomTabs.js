// Scope everything in a check to avoid re-declaring the plugin
if (typeof window.customTabsPlugin == 'undefined') {

    // Define the plugin on the window object for universal access
    window.customTabsPlugin = {
        initialized: false,
        currentPage: null,
        layoutType: null, // 'modern' or 'legacy'
        tabConfigs: null,
        panelsCreated: false,

        // Kicks off the process
        init: function() {
            console.log('CustomTabs: Initializing plugin');
            this.detectLayout();
            this.waitForUI();
        },

        // Detect whether we're using Modern (experimental) or Legacy (stable) layout
        // For 10.12+, Modern layout is the default
        detectLayout: function() {
            // Check for Jellyfin version if available
            const jellyfinVersion = window.ApiClient?.serverVersion?.() || '';
            const is1012OrNewer = jellyfinVersion.startsWith('10.12') || 
                                  jellyfinVersion.startsWith('10.13') ||
                                  jellyfinVersion.startsWith('10.14');
            
            // Modern layout indicators (10.12+ default):
            // 1. Has MUI-based drawer/sidebar
            // 2. Uses React Router
            // 3. Experimental app shell structure
            // 4. No hash routing (Modern uses path routing)
            
            const hasModernDrawer = document.querySelector('[class*="MuiDrawer"]') || 
                                    document.querySelector('.main-drawer-experimental') ||
                                    document.querySelector('[data-testid="main-drawer"]');
            
            const hasModernAppBar = document.querySelector('[class*="MuiAppBar"]');
            
            // Check for the new experimental home structure
            const hasExperimentalHome = document.querySelector('[class*="HomePage_"]') ||
                                        document.querySelector('[data-page="home"]') ||
                                        document.querySelector('.experimental-home');
            
            // Modern layout uses path routing, legacy uses hash routing (#/)
            const usesHashRouting = window.location.hash.startsWith('#/');
            const usesPathRouting = !usesHashRouting && window.location.pathname !== '/';
            
            // Legacy layout indicators (10.11 and below)
            const hasLegacyTabs = document.querySelector('.headerTabs.sectionTabs');
            const hasLegacyHomeTab = document.querySelector('#homeTab');
            const hasLegacyIndexPage = document.querySelector('#indexPage[data-controller="home"]');
            
            // Decision logic:
            // 1. If explicitly 10.12+, default to modern unless legacy elements present
            // 2. If MUI components found, it's modern
            // 3. If hash routing AND legacy tabs present, it's legacy
            // 4. If no clear indicators, check for emby-tabs-slider context
            
            if (is1012OrNewer || hasModernDrawer || hasModernAppBar || hasExperimentalHome) {
                // Even on 10.12+, check if user switched to legacy layout
                if (hasLegacyHomeTab && hasLegacyTabs && usesHashRouting) {
                    this.layoutType = 'legacy';
                    console.log('CustomTabs: Detected Legacy layout (user preference on 10.12)');
                } else {
                    this.layoutType = 'modern';
                    console.log('CustomTabs: Detected Modern layout (10.12+ default)');
                }
            } else if (usesHashRouting && (hasLegacyTabs || hasLegacyHomeTab || hasLegacyIndexPage)) {
                this.layoutType = 'legacy';
                console.log('CustomTabs: Detected Legacy layout (hash routing + legacy elements)');
            } else {
                // Final check: look for specific DOM patterns
                const tabsSlider = document.querySelector('.emby-tabs-slider');
                const mainView = document.querySelector('.mainAnimatedPages') || 
                                 document.querySelector('[data-type="page"]');
                
                if (tabsSlider && mainView && usesHashRouting) {
                    this.layoutType = 'legacy';
                    console.log('CustomTabs: Detected Legacy layout (fallback)');
                } else {
                    this.layoutType = 'modern';
                    console.log('CustomTabs: Defaulting to Modern layout');
                }
            }
        },

        // Waits for the necessary page elements to be ready before acting
        waitForUI: function() {
            // Check if we are on the home page by looking at the URL
            const hash = window.location.hash;
            const pathname = window.location.pathname;
            
            // Check both hash-based routing (legacy) and path-based routing (modern)
            const isHomePage = hash === '' || 
                               hash === '#/home' || 
                               hash === '#/home.html' || 
                               hash.includes('#/home?') || 
                               hash.includes('#/home.html?') ||
                               pathname === '/home' ||
                               pathname.endsWith('/home') ||
                               pathname === '/' ||
                               pathname.endsWith('/web/') ||
                               pathname.endsWith('/web/index.html');

            if (!isHomePage && hash !== '' && !pathname.endsWith('/')) {
                console.debug('CustomTabs: Not on main page, skipping UI check. Hash:', hash, 'Path:', pathname);
                return;
            }

            if (this.layoutType === 'modern') {
                this.waitForModernUI();
            } else {
                this.waitForLegacyUI();
            }
        },

        // Wait for Modern layout UI elements
        waitForModernUI: function() {
            // Modern layout ready indicators
            const drawerReady = document.querySelector('[class*="MuiDrawer"]') ||
                                document.querySelector('[class*="MuiList"]') ||
                                document.querySelector('nav[class*="drawer"]') ||
                                document.querySelector('.mainDrawer');
            
            const apiReady = typeof ApiClient !== 'undefined';

            if (apiReady && drawerReady) {
                console.debug('CustomTabs: Modern layout UI ready, creating tabs');
                this.createModernTabs();
            } else if (apiReady) {
                // API is ready but drawer not found - might be a different page structure
                console.debug('CustomTabs: API ready but drawer not found, trying alternative');
                this.createModernTabs();
            } else {
                console.debug('CustomTabs: Waiting for Modern UI elements...');
                setTimeout(() => this.waitForModernUI(), 200);
            }
        },

        // Wait for Legacy layout UI elements
        waitForLegacyUI: function() {
            if (typeof ApiClient !== 'undefined' && document.querySelector('.emby-tabs-slider')) {
                console.debug('CustomTabs: Legacy layout UI ready, creating tabs');
                this.createLegacyTabs();
            } else {
                console.debug('CustomTabs: Waiting for Legacy UI elements...');
                setTimeout(() => this.waitForLegacyUI(), 200);
            }
        },

        // Fetch tab configs from server
        fetchConfigs: function() {
            return ApiClient.fetch({
                url: ApiClient.getUrl('CustomTabs/Config'),
                type: 'GET',
                dataType: 'json',
                headers: {
                    accept: 'application/json'
                }
            });
        },

        // Create tabs for Modern layout (sidebar/drawer navigation)
        createModernTabs: function() {
            console.debug('CustomTabs: Starting tab creation process for Modern layout');

            // Prevent duplicate creation
            if (document.querySelector('[id^="customTabModern_"]')) {
                console.debug('CustomTabs: Modern custom tabs already exist, skipping creation');
                return;
            }

            this.fetchConfigs().then((configs) => {
                console.debug('CustomTabs: Retrieved config for', configs.length, 'tabs');
                this.tabConfigs = configs;

                // Find the navigation drawer/sidebar - try multiple selectors
                // The Modern layout uses MUI components
                let drawer = document.querySelector('[class*="MuiDrawer"] [class*="MuiList"]');
                
                if (!drawer) {
                    // Try finding the main navigation list
                    drawer = document.querySelector('nav ul') ||
                             document.querySelector('.mainDrawer-scrollContainer ul') ||
                             document.querySelector('[role="navigation"] ul') ||
                             document.querySelector('.MuiList-root');
                }

                if (!drawer) {
                    console.warn('CustomTabs: Could not find Modern drawer navigation, trying alternative');
                    this.createModernTabsHeader(configs);
                    return;
                }

                console.log('CustomTabs: Found drawer, adding tabs');

                configs.forEach((config, i) => {
                    const customTabId = `customTabModern_${i}`;

                    if (document.querySelector(`#${customTabId}`)) {
                        console.debug(`CustomTabs: Tab ${customTabId} already exists, skipping`);
                        return;
                    }

                    console.log("CustomTabs: Creating modern custom tab:", config.Title);

                    // Create a navigation item that matches the MUI styling
                    const listItem = document.createElement('li');
                    listItem.id = customTabId;
                    listItem.className = 'MuiListItem-root MuiListItemButton-root MuiButtonBase-root';
                    listItem.setAttribute('role', 'button');
                    listItem.setAttribute('tabindex', '0');
                    listItem.style.cssText = `
                        display: flex;
                        align-items: center;
                        padding: 8px 16px;
                        cursor: pointer;
                        color: inherit;
                        text-decoration: none;
                    `;

                    // Add icon placeholder
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'MuiListItemIcon-root';
                    iconSpan.innerHTML = '<span class="material-icons" style="font-size: 24px;">tab</span>';
                    iconSpan.style.cssText = 'min-width: 40px; color: inherit;';

                    // Create the text content
                    const textSpan = document.createElement('span');
                    textSpan.className = 'MuiListItemText-root';
                    textSpan.innerHTML = `<span class="MuiTypography-root MuiListItemText-primary">${config.Title}</span>`;

                    listItem.appendChild(iconSpan);
                    listItem.appendChild(textSpan);

                    // Add hover effect
                    listItem.addEventListener('mouseenter', function() {
                        this.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                    });
                    listItem.addEventListener('mouseleave', function() {
                        this.style.backgroundColor = '';
                    });

                    // Add click handler to show tab content
                    listItem.addEventListener('click', () => {
                        this.showModernTabContent(i, config);
                    });

                    drawer.appendChild(listItem);
                    console.log(`CustomTabs: Added modern tab ${customTabId} to drawer`);
                });

                console.log('CustomTabs: All custom tabs created successfully (Modern layout)');
            }).catch((error) => {
                console.error('CustomTabs: Error fetching tab configs:', error);
            });
        },

        // Alternative: Add tabs to the header area for Modern layout
        createModernTabsHeader: function(configs) {
            console.log('CustomTabs: Creating header-based tabs for Modern layout');

            // Find or create a container in the header
            let header = document.querySelector('[class*="MuiAppBar"]') ||
                         document.querySelector('.skinHeader') ||
                         document.querySelector('header');

            if (!header) {
                console.error('CustomTabs: Could not find header for Modern tabs');
                return;
            }

            // Check if container already exists
            let tabsContainer = document.querySelector('#customTabsModernContainer');
            if (!tabsContainer) {
                tabsContainer = document.createElement('div');
                tabsContainer.id = 'customTabsModernContainer';
                tabsContainer.style.cssText = `
                    display: flex;
                    gap: 4px;
                    align-items: center;
                    margin-left: 16px;
                `;

                // Find a good place to insert
                const toolbar = header.querySelector('[class*="MuiToolbar"]') || header;
                toolbar.appendChild(tabsContainer);
            }

            configs.forEach((config, i) => {
                const customTabId = `customTabModernHeader_${i}`;

                if (document.querySelector(`#${customTabId}`)) {
                    return;
                }

                const button = document.createElement('button');
                button.id = customTabId;
                button.type = 'button';
                button.textContent = config.Title;
                button.style.cssText = `
                    background: transparent;
                    border: none;
                    color: inherit;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 14px;
                    font-family: inherit;
                    border-radius: 4px;
                    transition: background-color 0.2s;
                `;

                button.addEventListener('mouseenter', function() {
                    this.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                });
                button.addEventListener('mouseleave', function() {
                    this.style.backgroundColor = 'transparent';
                });

                button.addEventListener('click', () => {
                    this.showModernTabContent(i, config);
                });

                tabsContainer.appendChild(button);
                console.log(`CustomTabs: Added header tab ${customTabId}`);
            });
        },

        // Show content for a Modern layout tab
        showModernTabContent: function(index, config) {
            console.log('CustomTabs: Showing modern tab content for:', config.Title);

            // Find or create the content overlay
            let contentArea = document.querySelector('#customTabsContentArea');
            
            if (!contentArea) {
                contentArea = document.createElement('div');
                contentArea.id = 'customTabsContentArea';
                contentArea.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: var(--theme-background, #181818);
                    z-index: 9999;
                    overflow: auto;
                    padding: 64px 20px 20px 20px;
                `;
                
                // Add close button
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '&times; Close';
                closeBtn.style.cssText = `
                    position: fixed;
                    top: 10px;
                    right: 20px;
                    font-size: 18px;
                    background: rgba(255,255,255,0.1);
                    border: none;
                    color: white;
                    cursor: pointer;
                    z-index: 10000;
                    padding: 8px 16px;
                    border-radius: 4px;
                `;
                closeBtn.addEventListener('click', () => {
                    contentArea.style.display = 'none';
                });
                contentArea.appendChild(closeBtn);
                
                // Add content container
                const contentContainer = document.createElement('div');
                contentContainer.id = 'customTabsContentContainer';
                contentContainer.style.cssText = 'max-width: 1200px; margin: 0 auto;';
                contentArea.appendChild(contentContainer);
                
                document.body.appendChild(contentArea);
            }

            // Update content
            const contentContainer = contentArea.querySelector('#customTabsContentContainer');
            contentContainer.innerHTML = config.ContentHtml;
            contentArea.style.display = 'block';
            
            // Allow clicking outside content to close
            contentArea.addEventListener('click', function(e) {
                if (e.target === contentArea) {
                    contentArea.style.display = 'none';
                }
            });
        },

        // Create tabs for Legacy layout (header tabs)
        createLegacyTabs: function() {
            console.debug('CustomTabs: Starting tab creation process for Legacy layout');

            const tabsSlider = document.querySelector('.emby-tabs-slider');
            if (!tabsSlider) {
                console.debug('CustomTabs: Tabs slider not found');
                return;
            }

            // Prevent creating duplicate tabs if they already exist
            if (tabsSlider.querySelector('[id^="customTabButton_"]')) {
                console.debug('CustomTabs: Custom tabs already exist in DOM, skipping creation');
                return;
            }

            // Fetch tab configuration from the server
            this.fetchConfigs().then((configs) => {
                console.debug('CustomTabs: Retrieved config for', configs.length, 'tabs (Legacy)');
                this.tabConfigs = configs;

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
                        return;
                    }

                    console.log("CustomTabs: Creating legacy custom tab:", config.Title);

                    const title = document.createElement("div");
                    title.classList.add("emby-button-foreground");
                    title.innerText = config.Title;

                    const button = document.createElement("button");
                    button.type = "button";
                    button.setAttribute("is", "emby-button");
                    button.classList.add("emby-tab-button", "emby-button");
                    button.setAttribute("data-index", i + 2);
                    button.setAttribute("id", customTabId);
                    button.appendChild(title);

                    tabsSlider.appendChild(button);
                    console.log(`CustomTabs: Added legacy tab ${customTabId} to tabs slider`);
                });

                // Create content panels if they don't exist
                // This is essential for 10.12 where TransformationPatches might not work
                this.createLegacyContentPanels(configs);

                console.log('CustomTabs: All custom tabs created successfully (Legacy layout)');
            }).catch((error) => {
                console.error('CustomTabs: Error fetching tab configs:', error);
            });
        },

        // Create content panels for legacy tabs (needed for 10.12+)
        createLegacyContentPanels: function(configs) {
            // Find the container for tab content
            // This could be different depending on Jellyfin version
            let contentContainer = document.querySelector('.tabContent[data-index="1"]')?.parentElement ||
                                   document.querySelector('#favoritesTab')?.parentElement ||
                                   document.querySelector('.pageTabContent')?.parentElement ||
                                   document.querySelector('.homeSections')?.closest('.view');

            if (!contentContainer) {
                // Try to find the main view container
                contentContainer = document.querySelector('.mainAnimatedPage.homePage') ||
                                   document.querySelector('[data-controller="home"]') ||
                                   document.querySelector('.homePage');
            }

            if (!contentContainer) {
                console.warn('CustomTabs: Could not find content container for panels');
                // As a last resort, we'll handle clicks to show overlay
                this.setupLegacyClickHandlersWithOverlay(configs);
                return;
            }

            configs.forEach((config, i) => {
                const panelId = `customTab_${i}`;
                
                // Check if panel already exists
                if (document.querySelector(`#${panelId}`)) {
                    console.debug(`CustomTabs: Panel ${panelId} already exists`);
                    return;
                }

                // Create the content panel
                const panel = document.createElement('div');
                panel.className = 'tabContent pageTabContent';
                panel.id = panelId;
                panel.setAttribute('data-index', i + 2);
                panel.style.display = 'none'; // Hidden by default
                panel.innerHTML = config.ContentHtml;

                contentContainer.appendChild(panel);
                console.log(`CustomTabs: Created content panel ${panelId}`);
            });

            this.panelsCreated = true;

            // Setup click handlers to show/hide panels
            this.setupLegacyClickHandlers(configs);
        },

        // Setup click handlers for legacy tabs
        setupLegacyClickHandlers: function(configs) {
            configs.forEach((config, i) => {
                const buttonId = `customTabButton_${i}`;
                const panelId = `customTab_${i}`;
                const button = document.querySelector(`#${buttonId}`);
                
                if (button) {
                    // Remove any existing click handlers
                    const newButton = button.cloneNode(true);
                    button.parentNode.replaceChild(newButton, button);
                    
                    newButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.switchToLegacyTab(i);
                    });
                }
            });
        },

        // Setup click handlers with overlay for legacy tabs (fallback when no container found)
        setupLegacyClickHandlersWithOverlay: function(configs) {
            configs.forEach((config, i) => {
                const buttonId = `customTabButton_${i}`;
                const button = document.querySelector(`#${buttonId}`);
                
                if (button) {
                    // Remove any existing click handlers
                    const newButton = button.cloneNode(true);
                    button.parentNode.replaceChild(newButton, button);
                    
                    newButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Use the modern overlay approach
                        this.showModernTabContent(i, config);
                    });
                }
            });
        },

        // Switch to a legacy tab
        switchToLegacyTab: function(index) {
            const panel = document.querySelector(`#customTab_${index}`);
            
            if (!panel) {
                console.error(`CustomTabs: Could not find panel for tab index ${index}`);
                // Fall back to overlay
                if (this.tabConfigs && this.tabConfigs[index]) {
                    this.showModernTabContent(index, this.tabConfigs[index]);
                }
                return;
            }

            // Hide all tab content panels
            const allPanels = document.querySelectorAll('.tabContent, .pageTabContent');
            allPanels.forEach(p => {
                p.style.display = 'none';
                p.classList.remove('is-active');
            });

            // Show the selected panel
            panel.style.display = 'block';
            panel.classList.add('is-active');

            // Update active state on buttons
            const allButtons = document.querySelectorAll('.emby-tab-button');
            allButtons.forEach(btn => {
                btn.classList.remove('emby-tab-button-active');
            });

            const activeButton = document.querySelector(`#customTabButton_${index}`);
            if (activeButton) {
                activeButton.classList.add('emby-tab-button-active');
            }

            console.log(`CustomTabs: Switched to tab ${index}`);
        },

        // Re-detect and reinitialize on navigation
        reinitialize: function() {
            this.layoutType = null;
            this.detectLayout();
            this.waitForUI();
        }
    };

    // --- Event Listeners to Handle Navigation ---

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
            window.customTabsPlugin.reinitialize();
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

    // Handle tab visibility changes (e.g., user switches to another tab and back)
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            console.debug('CustomTabs: Page became visible, checking for tabs');
            setTimeout(() => window.customTabsPlugin.reinitialize(), 300);
        }
    });

    // Handle touch events which can also trigger navigation on mobile
    let touchNavigation = false;
    document.addEventListener("touchstart", () => {
        touchNavigation = true;
    });

    document.addEventListener("touchend", () => {
        if (touchNavigation) {
            setTimeout(() => window.customTabsPlugin.reinitialize(), 1000);
            touchNavigation = false;
        }
    });

    console.log('CustomTabs: Plugin setup complete');
}