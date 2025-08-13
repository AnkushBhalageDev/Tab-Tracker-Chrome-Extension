
const getToday = () => new Date().toISOString().split('T')[0];

// Gets a 'YYYY-Www' string for the current week (e.g., 2025-W33)
const getThisWeek = () => {
  const now = new Date();
  const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
  const pastDaysOfYear = (now - firstDayOfYear) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
};

// Gets a 'YYYY-MM' string for the current month
const getThisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// Extracts the domain from a URL
const getDomainFromUrl = (urlString) => {
  try {
    const url = new URL(urlString);
    return url.hostname;
  } catch (error) {
    return null; // Invalid URL
  }
};


// --- Data Initialization and Storage ---
let activeTabInfo = { id: null, startTime: null, url: null };
let isIdle = false;

// Universal function to initialize data for a given time period key
const initializePeriodData = async (key) => {
  const data = await chrome.storage.local.get(key);
  if (!data[key]) {
    const initialData = {
      tabsOpened: 0,
      tabsClosed: 0,
      timeData: {}, // Will store time by tabId for daily, and by domain for weekly/monthly
    };
    await chrome.storage.local.set({ [key]: initialData });
    return initialData;
  }
  return data[key];
};

// Main function to update time spent across all periods
const updateTimeSpent = async () => {
  if (!activeTabInfo.id || !activeTabInfo.startTime || isIdle) {
    return;
  }

  const timeSpent = Date.now() - activeTabInfo.startTime;
  if (timeSpent < 100) return; // Ignore very brief intervals

  const domain = getDomainFromUrl(activeTabInfo.url);
  if (!domain) return; // Don't track time for non-standard URLs

  const todayKey = getToday();
  const weekKey = getThisWeek();
  const monthKey = getThisMonth();

  // Get data for all periods
  const [dailyData, weeklyData, monthlyData] = await Promise.all([
    initializePeriodData(todayKey),
    initializePeriodData(weekKey),
    initializePeriodData(monthKey),
  ]);

  // Update Daily Data (by specific tab ID and URL)
  if (!dailyData.timeData[activeTabInfo.id]) {
    dailyData.timeData[activeTabInfo.id] = { url: activeTabInfo.url, title: 'Loading...', timeSpent: 0 };
  }
  dailyData.timeData[activeTabInfo.id].timeSpent += timeSpent;

  // Update Weekly and Monthly Data (by domain)
  weeklyData.timeData[domain] = (weeklyData.timeData[domain] || 0) + timeSpent;
  monthlyData.timeData[domain] = (monthlyData.timeData[domain] || 0) + timeSpent;

  // Save all updated data back to storage
  await chrome.storage.local.set({
    [todayKey]: dailyData,
    [weekKey]: weeklyData,
    [monthKey]: monthlyData,
  });

  // Reset start time for the current active tab
  activeTabInfo.startTime = Date.now();
};


// --- Chrome Event Listeners ---

chrome.runtime.onInstalled.addListener(() => {
  console.log("Tab Tracker Extension Installed/Updated.");
  initializePeriodData(getToday());
  initializePeriodData(getThisWeek());
  initializePeriodData(getThisMonth());
});

chrome.tabs.onCreated.addListener(async () => {
  const keys = [getToday(), getThisWeek(), getThisMonth()];
  const data = await chrome.storage.local.get(keys);
  for (const key of keys) {
    const periodData = data[key] || await initializePeriodData(key);
    periodData.tabsOpened += 1;
    await chrome.storage.local.set({ [key]: periodData });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await updateTimeSpent(); // Final update before closing
  const keys = [getToday(), getThisWeek(), getThisMonth()];
  const data = await chrome.storage.local.get(keys);
  for (const key of keys) {
    const periodData = data[key] || await initializePeriodData(key);
    periodData.tabsClosed += 1;
    await chrome.storage.local.set({ [key]: periodData });
  }
  if (activeTabInfo.id === tabId) {
    activeTabInfo = { id: null, startTime: null, url: null };
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await updateTimeSpent();
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url && tab.url.startsWith('http')) {
      activeTabInfo = { id: tab.id, startTime: Date.now(), url: tab.url };
      // Also update the title in daily data
      const todayKey = getToday();
      const dailyData = await initializePeriodData(todayKey);
      if (dailyData.timeData[tab.id]) {
        dailyData.timeData[tab.id].title = tab.title;
        await chrome.storage.local.set({[todayKey]: dailyData});
      }
    } else {
      activeTabInfo = { id: null, startTime: null, url: null };
    }
  } catch (e) {
    activeTabInfo = { id: null, startTime: null, url: null };
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === activeTabInfo.id && (changeInfo.url || changeInfo.title)) {
    await updateTimeSpent();
    activeTabInfo.url = tab.url; // Update URL for tracking
    // Update URL and title in daily data
    const todayKey = getToday();
    const dailyData = await initializePeriodData(todayKey);
    if (dailyData.timeData[tabId]) {
      dailyData.timeData[tabId].url = tab.url;
      dailyData.timeData[tabId].title = tab.title;
      await chrome.storage.local.set({[todayKey]: dailyData});
    }
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await updateTimeSpent();
    isIdle = true; // Treat loss of focus as idle
  } else {
    isIdle = false;
    const [tab] = await chrome.tabs.query({ active: true, windowId: windowId });
    if (tab) {
        // This will trigger onActivated if the tab is different,
        // but we should manually set the active tab here to be safe.
        activeTabInfo = { id: tab.id, startTime: Date.now(), url: tab.url };
    }
  }
});

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === "active") {
    isIdle = false;
    // User is active again, restart timer
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) {
        activeTabInfo = { id: tab.id, startTime: Date.now(), url: tab.url };
    }
  } else {
    isIdle = true;
    await updateTimeSpent();
  }
});