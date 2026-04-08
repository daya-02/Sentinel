document.addEventListener('DOMContentLoaded', () => {
  // Set Chart.js defaults for dark theme
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = '#334155';
  
  chrome.storage.local.get(['sentinel_sources'], (result) => {
    const data = result.sentinel_sources || {};
    const sources = Object.keys(data);
    
    if (sources.length === 0) {
      document.getElementById('topSourcesList').innerHTML = '<div class="no-data">No data collected yet. Analyze some pages first.</div>';
      document.getElementById('tacticsBreakdownList').innerHTML = '<div class="no-data">No tactics data available.</div>';
      return;
    }

    // 1. Process sources for Top 3
    const sortedSources = sources.map(source => ({
      name: source,
      ...data[source]
    })).sort((a, b) => b.average_ems - a.average_ems);

    const top3 = sortedSources.slice(0, 3);
    const topSourcesList = document.getElementById('topSourcesList');
    topSourcesList.innerHTML = '';
    
    top3.forEach(source => {
      let className = 'low';
      if (source.average_ems > 80) className = 'high';
      else if (source.average_ems > 60) className = 'manip';
      else if (source.average_ems > 30) className = 'medium';
      
      const el = document.createElement('div');
      el.className = `source-item ${className}`;
      el.innerHTML = `
        <div class="name">${source.name}</div>
        <div class="score-container">
          <div class="score">${source.average_ems}</div>
          <div class="tier">${source.credibility_tier}</div>
        </div>
      `;
      topSourcesList.appendChild(el);
    });

    // 2. Aggregate Tactics
    const tacticCounts = {};
    let totalTactics = 0;
    
    sortedSources.forEach(source => {
      if (source.tactics) {
        source.tactics.forEach(tactic => {
          tacticCounts[tactic] = (tacticCounts[tactic] || 0) + 1;
          totalTactics++;
        });
      }
    });

    const sortedTactics = Object.keys(tacticCounts).map(t => ({
      name: t,
      count: tacticCounts[t],
      percentage: totalTactics > 0 ? Math.round((tacticCounts[t] / totalTactics) * 100) : 0
    })).sort((a, b) => b.count - a.count);

    const breakdownList = document.getElementById('tacticsBreakdownList');
    breakdownList.innerHTML = '';
    
    if (sortedTactics.length === 0) {
        breakdownList.innerHTML = '<div class="no-data">No specific tactics identified yet.</div>';
    } else {
        const top5Tactics = sortedTactics.slice(0, 5);
        top5Tactics.forEach(t => {
          const el = document.createElement('div');
          el.className = 'breakdown-item';
          el.innerHTML = `
            <div class="tactic">${t.name}</div>
            <div class="percentage">${t.percentage}%</div>
          `;
          breakdownList.appendChild(el);
        });
    }

    // 3. Bar Chart for Tactics
    const ctxBar = document.getElementById('tacticsBarChart').getContext('2d');
    const barChartNames = sortedTactics.slice(0, 7).map(t => t.name);
    const barChartData = sortedTactics.slice(0, 7).map(t => t.count);
    
    new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: barChartNames.length > 0 ? barChartNames : ['No Data'],
        datasets: [{
          label: 'Frequency',
          data: barChartData.length > 0 ? barChartData : [0],
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, suggestedMax: 5 }
        }
      }
    });

    // 4. Line Chart for EMS History
    const ctxLine = document.getElementById('emsLineChart').getContext('2d');
    
    let allScores = [];
    sortedSources.forEach(s => {
      if (s.scores) allScores.push(...s.scores);
    });
    
    const recentScores = allScores.slice(-50);
    const labels = recentScores.map((_, i) => `#${i + 1}`);

    new Chart(ctxLine, {
      type: 'line',
      data: {
        labels: labels.length > 0 ? labels : ['No Data'],
        datasets: [{
          label: 'EMS Score',
          data: recentScores.length > 0 ? recentScores : [0],
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100 }
        }
      }
    });

  });
});
