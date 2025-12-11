// Scope everything in a check to avoid re-declaring the plugin
if (typeof window.customTabsPlugin == 'undefined') {

    // Define the plugin on the window object for universal access
    window.customTabsPlugin = {
        initialized: false,
        currentPage: null,
        tabsCreated: false,
        lastInitTime: 0,
        initDebounceDelay: 2000, // Increased to 2 seconds to prevent rapid re-init
        tabElements: [], // Store references to created tabs

        // ===== NEW: UI version detection flags =====
        isModernUI: false,
        isLegacyUI: false,

        // Kicks off the process with aggressive debouncing
        init: function() {
            const now = Date.now();
            
            // Aggressive debounce: Don't re-init if called within delay period
            if (now - this.lastInitTime < this.initDebounceDelay) {
                console.debug('CustomTabs: Init debounced, skipping (called too soon)');
                return;
            }
            
            // If tabs already exist and are visible, skip entirely
            if (this.tabsCreated && this.tabsStillExist()) {
                console.debug('CustomTabs: Tabs already exist and are visible, skipping init');
                return;
            }
            
            this.lastInitTime = now;
            console.log('CustomTabs: Initializing plugin');
            this.waitForUI();
        },

        // Check if our tabs still exist in the DOM
        tabsStillExist: function() {
            const container = document.querySelector('[class*="MuiToolbar"]') || 
                            document.querySelector('.emby-tabs-slider');
            if (!container) return false;
            
            const existingTabs = container.querySelectorAll('[data-custom-tab="true"]');
            return existingTabs.length > 0 && existingTabs[0].isConnected;
        },

        // ===== NEW: Detect UI version (Modern 10.12+ vs Legacy 10.11-) =====
        detectUIVersion: function() {
            // Check for Material UI components (10.12+)
            this.isModernUI = !!(document.querySelector('.MuiButton-root') || 
                               document.querySelector('[class*="MuiToolbar"]'));
            
            // Check for Legacy UI elements (10.11 and below)
            this.isLegacyUI = !!document.querySelector('.emby-tabs-slider');
            
            if (this.isModernUI) {
                console.debug('CustomTabs: Detected Modern UI (10.12+)');
            } else if (this.isLegacyUI) {
                console.debug('CustomTabs: Detected Legacy UI (10.11-)');
            }
            
            return this.isModernUI || this.isLegacyUI;
        },

        // Waits for the necessary page elements to be ready before acting
        waitForUI: function() {
            const hash = window.location.hash;
            
            // ===== NEW: Check if viewing a custom tab =====
            if (hash.includes('#/customTab_')) {
                console.debug('CustomTabs: On custom tab page, showing content');
                this.showCustomTabContent();
                return;
            }
            
            // Check if we are on the home page by looking at the URL hash
            if (hash !== '' && hash !== '#/home' && hash !== '#/home.html' && !hash.includes('#/home?') && !hash.includes('#/home.html?')) {
                console.debug('CustomTabs: Not on main page, skipping UI check. Hash:', hash);
                return;
            }

            // ===== MODIFIED: Detect UI version first =====
            if (!this.detectUIVersion()) {
                console.debug('CustomTabs: UI version not detected yet, waiting...');
                setTimeout(() => this.waitForUI(), 200);
                return;
            }

            // If the UI is ready, create tabs; otherwise, wait and check again
            if (typeof ApiClient !== 'undefined') {
                // ===== MODIFIED: Check appropriate container based on UI version =====
                const uiReady = this.isModernUI 
                    ? document.querySelector('[class*="MuiToolbar"]')
                    : document.querySelector('.emby-tabs-slider');
                
                if (uiReady) {
                    console.debug('CustomTabs: UI elements available on main page, creating tabs');
                    this.createCustomTabs();
                } else {
                    console.debug('CustomTabs: Waiting for UI elements on main page...');
                    setTimeout(() => this.waitForUI(), 200);
                }
            } else {
                console.debug('CustomTabs: Waiting for UI elements on main page...');
                setTimeout(() => this.waitForUI(), 200);
            }
        },

        // ===== NEW: Display custom tab content =====
        showCustomTabContent: function() {
            const hash = window.location.hash;
            const match = hash.match(/#\/customTab_(\d+)/);
            
            if (!match) {
                console.error('CustomTabs: Invalid custom tab hash:', hash);
                return;
            }
            
            const tabIndex = parseInt(match[1], 10);
            console.debug('CustomTabs: Showing content for tab index:', tabIndex);
            
            // Fetch tab configuration
            ApiClient.fetch({
                url: ApiClient.getUrl('CustomTabs/Config'),
                type: 'GET',
                dataType: 'json',
                headers: {
                    accept: 'application/json'
                }
            }).then((configs) => {
                if (tabIndex >= configs.length) {
                    console.error('CustomTabs: Tab index out of range:', tabIndex);
                    return;
                }
                
                const config = configs[tabIndex];
                console.debug('CustomTabs: Displaying content for:', config.Title);
                
                // Find the main Jellyfin content container
                // Try multiple selectors to find the right container
                let contentArea = document.querySelector('[data-role="page"]') ||
                                 document.querySelector('.page') ||
                                 document.querySelector('.mainAnimatedPages') || 
                                 document.querySelector('[class*="MuiContainer"]') ||
                                 document.querySelector('.view');
                
                if (!contentArea) {
                    // If we can't find a specific container, target the main content area
                    const main = document.querySelector('main') || document.querySelector('#content');
                    if (main) {
                        contentArea = main;
                    } else {
                        console.error('CustomTabs: Could not find content area');
                        return;
                    }
                }
                
                // Ensure all parent containers have proper height
                let parent = contentArea;
                while (parent && parent !== document.body) {
                    parent.style.height = '100%';
                    parent.style.minHeight = '100%';
                    parent = parent.parentElement;
                }
                
                // Set html and body to full height
                document.documentElement.style.height = '100%';
                document.body.style.height = '100%';
                document.body.style.overflow = 'hidden';
                
                // Set the content area itself to full height
                contentArea.style.height = '100%';
                contentArea.style.minHeight = '100vh';
                contentArea.style.position = 'relative';
                contentArea.style.overflow = 'hidden';
                
                // Clear existing content completely and hide page elements
                Array.from(contentArea.children).forEach(child => {
                    child.style.display = 'none';
                    child.remove();
                });
                contentArea.innerHTML = '';
                
                // Get the header height to calculate available space
                const header = document.querySelector('header') || 
                              document.querySelector('[class*="MuiAppBar"]') ||
                              document.querySelector('.skinHeader');
                const headerHeight = header ? header.offsetHeight : 0;
                
                console.debug('CustomTabs: Header height:', headerHeight, 'px');
                
                // Create custom tab content container with full available height
                const customContent = document.createElement('div');
                customContent.className = 'customTabContent';
                customContent.id = `customTabPage_${tabIndex}`;
                customContent.setAttribute('data-role', 'page');
                
                // Calculate height accounting for header
                const contentHeight = headerHeight > 0 
                    ? `calc(100vh - ${headerHeight}px)` 
                    : '100vh';
                
                customContent.style.cssText = `
                    width: 100%;
                    height: ${contentHeight};
                    min-height: ${contentHeight};
                    max-height: ${contentHeight};
                    position: fixed;
                    top: ${headerHeight}px;
                    left: 0;
                    right: 0;
                    overflow: hidden;
                    margin: 0;
                    padding: 0;
                    background: var(--background, #101010);
                    z-index: 1;
                `;
                
                // Create wrapper for the content with flex fallback
                const contentWrapper = document.createElement('div');
                contentWrapper.style.cssText = `
                    width: 100%;
                    height: 100%;
                    min-height: 100%;
                    max-height: 100%;
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                `;
                contentWrapper.innerHTML = config.ContentHtml;
                
                customContent.appendChild(contentWrapper);
                
                // Ensure iframes take full size with absolute positioning
                const iframes = contentWrapper.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    // Apply comprehensive styling for both absolute and flex layouts
                    iframe.style.cssText = `
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        min-height: 100%;
                        max-height: 100%;
                        border: 0;
                        margin: 0;
                        padding: 0;
                        display: block;
                        flex: 1 1 auto;
                    `;
                    
                    console.debug('CustomTabs: Styled iframe with dimensions:', 
                                 iframe.offsetWidth, 'x', iframe.offsetHeight);
                });
                
                // If no iframe, ensure content fills height
                if (iframes.length === 0) {
                    const contentDivs = contentWrapper.querySelectorAll('div');
                    if (contentDivs.length > 0) {
                        contentDivs[0].style.height = '100%';
                        contentDivs[0].style.minHeight = '100%';
                        contentDivs[0].style.flex = '1 1 auto';
                    }
                }
                
                contentArea.appendChild(customContent);
                
                // Hide any "page not found" messages immediately and after delay
                const hidePageNotFound = () => {
                    // Hide any error messages
                    document.querySelectorAll('h1, h2, .pageTitle, [class*="error"], [class*="Error"]').forEach(el => {
                        const text = el.textContent.toLowerCase();
                        if (text.includes('page not found') || 
                            text.includes('not found') ||
                            text.includes('404')) {
                            el.style.display = 'none';
                            if (el.parentElement) {
                                el.parentElement.style.display = 'none';
                            }
                        }
                    });
                    
                    // Hide any divs that contain "page not found" text
                    document.querySelectorAll('div').forEach(el => {
                        if (el.textContent.toLowerCase().includes('page not found') && 
                            el.textContent.length < 100) { // Only short divs to avoid hiding content
                            el.style.display = 'none';
                        }
                    });
                };
                
                hidePageNotFound();
                setTimeout(hidePageNotFound, 100); // Check again after render
                setTimeout(hidePageNotFound, 500); // And once more after animations
                
                // Add resize handler to maintain proper sizing
                const handleResize = () => {
                    const header = document.querySelector('header') || 
                                  document.querySelector('[class*="MuiAppBar"]') ||
                                  document.querySelector('.skinHeader');
                    const headerHeight = header ? header.offsetHeight : 0;
                    const contentHeight = headerHeight > 0 
                        ? `calc(100vh - ${headerHeight}px)` 
                        : '100vh';
                    
                    if (customContent && customContent.isConnected) {
                        customContent.style.height = contentHeight;
                        customContent.style.minHeight = contentHeight;
                        customContent.style.maxHeight = contentHeight;
                        customContent.style.top = `${headerHeight}px`;
                    }
                    
                    console.debug('CustomTabs: Resized to height:', contentHeight);
                };
                
                // Store handler for cleanup
                customContent.resizeHandler = handleResize;
                window.addEventListener('resize', handleResize);
                
                // Log final dimensions for debugging
                setTimeout(() => {
                    console.log('CustomTabs: Content displayed for:', config.Title);
                    console.log('CustomTabs: Container dimensions:', 
                               customContent.offsetWidth, 'x', customContent.offsetHeight);
                    
                    const iframe = customContent.querySelector('iframe');
                    if (iframe) {
                        console.log('CustomTabs: Iframe dimensions:', 
                                   iframe.offsetWidth, 'x', iframe.offsetHeight);
                    }
                }, 100);
            }).catch((error) => {
                console.error('CustomTabs: Error fetching tab content:', error);
            });
        },

        // ===== NEW: Create Material UI tab for 10.12+ =====
        createModernTab: function(config, index) {
            const customTabId = `customTabButton_${index}`;
            
            // Create main anchor element with Material UI classes
            const link = document.createElement('a');
            link.className = 'MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-textInherit MuiButton-sizeMedium MuiButton-textSizeMedium MuiButton-colorInherit css-1f20jcn';
            link.setAttribute('tabindex', '0');
            link.setAttribute('href', `#/customTab_${index}`);
            link.setAttribute('id', customTabId);
            link.setAttribute('data-custom-tab', 'true');
            
            // Create icon container
            const iconSpan = document.createElement('span');
            iconSpan.className = 'MuiButton-icon MuiButton-startIcon MuiButton-iconSizeMedium css-1ygddt1';
            
            // Create SVG icon
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-iguwhy');
            svg.setAttribute('focusable', 'false');
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('viewBox', '0 0 24 24');
            
            // Create icon path (document/page icon)
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z');
            
            svg.appendChild(path);
            iconSpan.appendChild(svg);
            link.appendChild(iconSpan);
            
            // Add tab title text
            link.appendChild(document.createTextNode(config.Title));
            
            // Create ripple effect container
            const ripple = document.createElement('span');
            ripple.className = 'MuiTouchRipple-root css-4mb1j7';
            link.appendChild(ripple);
            
            // Add click handler to show content
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.debug('CustomTabs: Tab clicked:', config.Title);
                window.location.hash = `#/customTab_${index}`;
                this.showCustomTabContent();
            });
            
            return link;
        },

        // Fetches config and creates the tab elements in the DOM
        createCustomTabs: function() {
            console.debug('CustomTabs: Starting tab creation process');

            // ===== MODIFIED: Branch based on UI version =====
            if (this.isModernUI) {
                this.createModernTabs();
            } else if (this.isLegacyUI) {
                this.createLegacyTabs();
            }
        },

        // ===== NEW: Create tabs for Modern UI (10.12+) =====
        createModernTabs: function() {
            console.debug('CustomTabs: Creating Modern UI tabs');

            // Find the Material UI navigation container
            const container = document.querySelector('[class*="MuiToolbar"]') || 
                            document.querySelector('nav[class*="Mui"]');
            
            if (!container) {
                console.debug('CustomTabs: Modern UI container not found');
                return;
            }

            // Check for existing tabs - if they exist and are connected, NEVER touch them
            const existingCustomTabs = Array.from(container.querySelectorAll('[data-custom-tab="true"]'));
            
            if (existingCustomTabs.length > 0) {
                const allConnected = existingCustomTabs.every(tab => tab.isConnected && document.body.contains(tab));
                
                if (allConnected) {
                    console.debug('CustomTabs: All custom tabs exist and are connected, skipping creation');
                    this.tabsCreated = true;
                    return;
                }
                
                // Only remove truly orphaned tabs (not connected to DOM)
                existingCustomTabs.forEach(tab => {
                    if (!tab.isConnected) {
                        console.debug('CustomTabs: Removing orphaned tab (not connected)');
                        tab.remove();
                    }
                });
                
                // Re-check after cleanup - if any tabs remain, don't create new ones
                if (container.querySelector('[data-custom-tab="true"]')) {
                    console.debug('CustomTabs: Custom tabs still exist after cleanup, skipping creation');
                    this.tabsCreated = true;
                    return;
                }
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
                console.debug('CustomTabs: Retrieved config for', configs.length, 'Modern UI tabs');

                // Find existing library tabs
                const existingTabs = container.querySelectorAll('.MuiButton-root:not([data-custom-tab="true"])');
                let lastTab = existingTabs[existingTabs.length - 1];
                
                if (!lastTab) {
                    console.error('CustomTabs: No existing tabs found in Modern UI to insert after');
                    return;
                }

                // Create and insert each custom tab
                configs.forEach((config, i) => {
                    const tabElement = this.createModernTab(config, i);
                    
                    // Insert AFTER existing tabs (non-destructive)
                    lastTab.parentNode.insertBefore(tabElement, lastTab.nextSibling);
                    lastTab = tabElement; // Update for next iteration
                    
                    console.log('CustomTabs: Added Modern UI tab:', config.Title);
                });

                console.log('CustomTabs: All Modern UI custom tabs created successfully');
                
                // Mark tabs as created
                this.tabsCreated = true;
                
                // Verify tabs are visible
                const createdTabs = container.querySelectorAll('[data-custom-tab="true"]');
                console.log('CustomTabs: Verified', createdTabs.length, 'tabs in DOM');
                
                // Log their visibility
                createdTabs.forEach((tab, idx) => {
                    const isVisible = tab.offsetParent !== null;
                    console.log(`CustomTabs: Tab ${idx} visible:`, isVisible);
                });
            }).catch((error) => {
                console.error('CustomTabs: Error fetching Modern UI tab configs:', error);
            });
        },

        // ===== ORIGINAL: Legacy tab creation (10.11 and below) - UNCHANGED =====
        createLegacyTabs: function() {
            const tabsSlider = document.querySelector('.emby-tabs-slider');
            if (!tabsSlider) {
                console.debug('CustomTabs: Tabs slider not found');
                return;
            }

            // Check for existing tabs - if they exist and are connected, NEVER touch them
            const existingTabs = tabsSlider.querySelectorAll('[id^="customTabButton_"]');
            
            if (existingTabs.length > 0) {
                const allConnected = Array.from(existingTabs).every(tab => tab.isConnected && document.body.contains(tab));
                
                if (allConnected) {
                    console.debug('CustomTabs: All custom tabs exist and are connected, skipping creation');
                    this.tabsCreated = true;
                    return;
                }
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
                    
                    // Add click handler to show content
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        console.debug('CustomTabs: Legacy tab clicked:', config.Title);
                        window.location.hash = `#/customTab_${i}`;
                        this.showCustomTabContent();
                    });

                    tabsSlider.appendChild(button);
                    console.log(`CustomTabs: Added tab ${customTabId} to tabs slider`);
                });

                console.log('CustomTabs: All custom tabs created successfully');
                
                // Mark tabs as created
                this.tabsCreated = true;
            }).catch((error) => {
                console.error('CustomTabs: Error fetching tab configs:', error);
            });
        }
    };

    // --- Event Listeners to Handle Navigation ---

    // Initial setup when the page is first loaded
    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", () => window.customTabsPlugin.init());
    } else {
        window.customTabsPlugin.init();
    }

    // A single handler for all navigation-style events with aggressive debouncing
    let navigationTimeout = null;
    const handleNavigation = () => {
        // Clear any pending navigation handler
        if (navigationTimeout) {
            clearTimeout(navigationTimeout);
        }
        
        // Aggressive debounced navigation handler
        navigationTimeout = setTimeout(() => {
            console.debug('CustomTabs: Navigation detected, checking tabs');
            window.customTabsPlugin.init();
        }, 2000); // Increased to 2 seconds
    };

    // Standard browser navigation (back/forward buttons)
    window.addEventListener("popstate", handleNavigation);

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

    // Handle tab visibility changes only if tabs don't exist
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && !window.customTabsPlugin.tabsStillExist()) {
            console.debug('CustomTabs: Page became visible, tabs missing, checking');
            setTimeout(() => window.customTabsPlugin.init(), 1000);
        }
    });

    console.log('CustomTabs: Plugin setup complete');
}
