// /*global chrome*/
// import React, { useState, useEffect } from 'react';
// import './App.css';

// function App() {
//   const [stats, setStats] = useState({
//     tabsOpened: 0,
//     tabsClosed: 0,
//   });
//   const [rankedTabs, setRankedTabs] = useState([]);
//   const [activeTabCount, setActiveTabCount] = useState(0);

//   const getToday = () => new Date().toISOString().split('T')[0];

//   const formatTime = (ms) => {
//     if (!ms || ms < 1000) return "0s";
    
//     const totalSeconds = Math.floor(ms / 1000);
//     const hours = Math.floor(totalSeconds / 3600);
//     const minutes = Math.floor((totalSeconds % 3600) / 60);
//     const seconds = totalSeconds % 60;

//     let timeString = '';
//     if (hours > 0) timeString += `${hours}h `;
//     if (minutes > 0) timeString += `${minutes}m `;
//     if (seconds > 0 || (hours === 0 && minutes === 0)) timeString += `${seconds}s`;
    
//     return timeString.trim();
//   };
  
//   useEffect(() => {
//     const today = getToday();

//     const fetchData = () => {
//       // Fetch stored analytical data
//       if (chrome && chrome.storage && chrome.storage.local) {
//         chrome.storage.local.get(today, (result) => {
//           const dayData = result[today];
//           if (dayData) {
//             setStats({
//               tabsOpened: dayData.tabsOpened,
//               tabsClosed: dayData.tabsClosed,
//             });

//             const sortedTabs = Object.values(dayData.tabData)
//               .filter(tab => tab.timeSpent > 500) // Only show tabs with meaningful time
//               .sort((a, b) => b.timeSpent - a.timeSpent);
            
//             setRankedTabs(sortedTabs);
//           }
//         });
        
//         // Fetch current number of open tabs
//         chrome.tabs.query({}, (tabs) => {
//           setActiveTabCount(tabs.length);
//         });
//       }
//     };
    
//     fetchData();

//     // Set up a listener for storage changes to auto-update the UI
//     const listener = (changes, namespace) => {
//       if (namespace === 'local' && changes[today]) {
//         fetchData();
//       }
//     };
    
//     if (chrome && chrome.storage) {
//        chrome.storage.onChanged.addListener(listener);
//     }
    
//     // Cleanup listener on component unmount
//     return () => {
//         if (chrome && chrome.storage) {
//             chrome.storage.onChanged.removeListener(listener);
//         }
//     };

//   }, []);

//   return (
//     <div className="App">
//       <header className="header">
//         <h1>Tab Usage Dashboard</h1>
//         <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
//       </header>

//       <div className="stats-container">
//         <div className="stat-box">
//           <h2>Tabs Opened Today</h2>
//           <p>{stats.tabsOpened}</p>
//         </div>
//         <div className="stat-box">
//           <h2>Tabs Closed Today</h2>
//           <p>{stats.tabsClosed}</p>
//         </div>
//          <div className="stat-box">
//           <h2>Currently Open</h2>
//           <p>{activeTabCount}</p>
//         </div>
//       </div>
      
//       <h2 className="tab-list-header">Time Spent Per Tab (Today)</h2>
//       {rankedTabs.length > 0 ? (
//         <ul className="tab-list">
//           {rankedTabs.map((tab, index) => (
//             <li key={index + tab.url} className="tab-item">
//               <span className="tab-rank">{index + 1}</span>
//               <div className="tab-info">
//                  <a href={tab.url} target="_blank" rel="noopener noreferrer" title={tab.title}>
//                     {tab.title || "No Title"}
//                  </a>
//                  <small title={tab.url}>{tab.url}</small>
//               </div>
//               <span className="tab-time">{formatTime(tab.timeSpent)}</span>
//             </li>
//           ))}
//         </ul>
//       ) : (
//          <p className="no-data">No tab activity tracked yet for today. Start browsing to see your stats!</p>
//       )}

//     </div>
//   );
// }

// export default App;



/*global chrome*/
import React, { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import './App.css';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// --- Helper Functions ---
const getToday = () => new Date().toISOString().split('T')[0];
const getThisWeek = () => {
  const now = new Date();
  const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
  const pastDaysOfYear = (now - firstDayOfYear) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
};
const getThisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatTime = (ms) => {
  if (!ms || ms < 1000) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : '', s > 0 ? `${s}s` : '']
    .filter(Boolean).join(' ') || '0s';
};

function App() {
  const [view, setView] = useState('Daily'); // Daily, Weekly, or Monthly
  const [stats, setStats] = useState({ tabsOpened: 0, tabsClosed: 0 });
  const [rankedData, setRankedData] = useState([]);
  const [activeTabCount, setActiveTabCount] = useState(0);

  useEffect(() => {
    const fetchAndSetData = async () => {
      let key;
      if (view === 'Daily') key = getToday();
      else if (view === 'Weekly') key = getThisWeek();
      else key = getThisMonth();

      // Fetch data from storage
      chrome.storage.local.get(key, (result) => {
        const periodData = result[key];
        if (periodData) {
          setStats({
            tabsOpened: periodData.tabsOpened,
            tabsClosed: periodData.tabsClosed,
          });

          // Process data for ranking and chart
          let processedData;
          if (view === 'Daily') {
            // Daily data is by tabId, but we want to show it by URL
            processedData = Object.values(periodData.timeData)
                .filter(tab => tab.timeSpent > 500)
                .map(tab => ({ ...tab, key: tab.url }));
          } else {
            // Weekly/Monthly data is by domain
            processedData = Object.entries(periodData.timeData)
                .filter(([domain, time]) => time > 500)
                .map(([domain, time]) => ({ key: domain, url: `http://${domain}`, title: domain, timeSpent: time }));
          }

          const sortedData = processedData.sort((a, b) => b.timeSpent - a.timeSpent);
          setRankedData(sortedData);
        } else {
            // No data for this period yet
            setStats({ tabsOpened: 0, tabsClosed: 0 });
            setRankedData([]);
        }
      });

      // Get current active tab count
      chrome.tabs.query({}, (tabs) => setActiveTabCount(tabs.length));
    };
    
    fetchAndSetData();
    
    // Auto-update when storage changes
    const storageListener = (changes, namespace) => {
        if (namespace === 'local') {
            fetchAndSetData();
        }
    };
    chrome.storage.onChanged.addListener(storageListener);

    return () => chrome.storage.onChanged.removeListener(storageListener);

  }, [view]);

  // --- Chart Data and Options ---
  const chartData = {
    labels: rankedData.slice(0, 7).map(item => item.title),
    datasets: [{
      label: 'Time Spent',
      data: rankedData.slice(0, 7).map(item => item.timeSpent / 60000), // in minutes
      backgroundColor: 'rgba(24, 119, 242, 0.6)',
      borderColor: 'rgba(24, 119, 242, 1)',
      borderWidth: 1,
    }],
  };
  
  const chartOptions = {
    indexAxis: 'y',
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: true, text: `Top Sites by Time Spent (in minutes)` },
    },
    scales: { x: { beginAtZero: true } }
  };

  return (
    <div className="App">
      <header className="header">
        <h1>Tab Usage Dashboard</h1>
        <div className="view-switcher">
          <button onClick={() => setView('Daily')} className={view === 'Daily' ? 'active' : ''}>Daily</button>
          <button onClick={() => setView('Weekly')} className={view === 'Weekly' ? 'active' : ''}>Weekly</button>
          <button onClick={() => setView('Monthly')} className={view === 'Monthly' ? 'active' : ''}>Monthly</button>
        </div>
      </header>

      <div className="stats-container">
        <div className="stat-box"><h2>Tabs Opened</h2><p>{stats.tabsOpened}</p></div>
        <div className="stat-box"><h2>Tabs Closed</h2><p>{stats.tabsClosed}</p></div>
        <div className="stat-box"><h2>Currently Open</h2><p>{activeTabCount}</p></div>
      </div>

      <div className="data-container">
        <div className="chart-container">
          <h2 className="container-title">Activity Chart</h2>
          {rankedData.length > 0 ? <Bar options={chartOptions} data={chartData} /> : <p className="no-data">Not enough data to display chart.</p>}
        </div>
        <div className="list-container">
          <h2 className="container-title">{view === 'Daily' ? 'Time Spent Per Tab' : 'Time Spent Per Domain'}</h2>
          {rankedData.length > 0 ? (
            <ul className="tab-list">
              {rankedData.map((item, index) => (
                <li key={item.key + index} className="tab-item">
                  <span className="tab-rank">{index + 1}</span>
                  <div className="tab-info">
                    {view === 'Daily' ? 
                      <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.title}>{item.title}</a> :
                      <span>{item.title}</span>
                    }
                    <small>{item.key}</small>
                  </div>
                  <span className="tab-time">{formatTime(item.timeSpent)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="no-data">No activity tracked for this period.</p>}
        </div>
      </div>
    </div>
  );
}

export default App;