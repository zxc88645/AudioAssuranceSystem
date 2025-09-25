document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "/api";

  const listView = document.getElementById("list-view");
  const detailView = document.getElementById("detail-view");

  const reportsTbody = document.getElementById("reports-tbody");
  const noReportsMessage = document.getElementById("no-reports-message");

  const backToListBtn = document.getElementById("back-to-list-btn");
  const detailReportId = document.getElementById("detail-report-id");
  const detailSessionId = document.getElementById("detail-session-id");
  const detailAccuracyScore = document.getElementById("detail-accuracy-score");
  const detailSummary = document.getElementById("detail-summary");
  const detailReasoning = document.getElementById("detail-reasoning");
  const detailKeyDifferences = document.getElementById(
    "detail-key-differences"
  );
  const detailSuggestions = document.getElementById("detail-suggestions");
  const recordingAudioPlayer = document.getElementById(
    "recording-audio-player"
  );
  const monitoringAudioPlayer = document.getElementById(
    "monitoring-audio-player"
  );
  const recordingTranscript = document.getElementById("recording-transcript");
  const monitoringTranscript = document.getElementById("monitoring-transcript");

  /**
   * 切換顯示列表或詳情視圖
   * @param {'list' | 'detail'} viewName
   */
  function switchView(viewName) {
    if (viewName === "list") {
      listView.classList.remove("hidden");
      detailView.classList.add("hidden");
    } else {
      listView.classList.add("hidden");
      detailView.classList.remove("hidden");
    }
  }

  /**
   * 根據分數返回對應的 CSS class
   * @param {number} score
   */
  function getScoreClass(score) {
    if (score >= 95) return "score-high";
    if (score >= 80) return "score-medium";
    return "score-low";
  }

  /**
   * 根據狀態返回對應的 CSS class for badge
   * @param {string} status
   */
  function getStatusClass(status) {
    switch (status.toLowerCase()) {
      case "success":
        return "status-success";
      case "error":
        return "status-error";
      case "processing":
        return "status-processing";
      case "pending":
        return "status-pending";
      default:
        return "status-secondary";
    }
  }

  /**
   * 渲染報告總覽列表
   * @param {Array} reports
   */
  function renderReportsList(reports) {
    reportsTbody.innerHTML = "";
    if (!reports || reports.length === 0) {
      noReportsMessage.classList.remove("hidden");
      return;
    }
    noReportsMessage.classList.add("hidden");

    // 依時間倒序排序
    reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    reports.forEach((report) => {
      const tr = document.createElement("tr");
      const score = report.llm_analysis
        ? report.llm_analysis.accuracy_score.toFixed(1)
        : "N/A";
      const scoreClass = report.llm_analysis ? getScoreClass(score) : "";

      tr.innerHTML = `
        <td>${report.report_id.substring(0, 12)}...</td>
        <td>${report.call_session_id}</td>
        <td><span class="status-badge ${getStatusClass(
          report.status
        )}">${report.status.toUpperCase()}</span></td>
        <td class="${scoreClass} score">${score}</td>
        <td>${new Date(
          report.completed_at || report.created_at
        ).toLocaleString()}</td>
        <td>
          <button class="btn btn-primary" data-report-id="${
            report.report_id
          }" ${report.status !== "success" ? "disabled" : ""}>
            檢視詳情
          </button>
        </td>
      `;
      reportsTbody.appendChild(tr);
    });
  }

  /**
   * 渲染列表項目
   * @param {HTMLElement} ulElement
   * @param {Array<string>} items
   */
  function renderListItems(ulElement, items) {
    ulElement.innerHTML = ""; // Clear previous items
    if (items && items.length > 0) {
      items.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        ulElement.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "無";
      ulElement.appendChild(li);
    }
  }

  /**
   * 填充詳情頁面的資料
   * @param {object} report
   */
  function populateDetailView(report) {
    detailReportId.textContent = report.report_id;
    detailSessionId.textContent = report.call_session_id;

    if (report.llm_analysis) {
      const score = report.llm_analysis.accuracy_score;
      detailAccuracyScore.textContent = `${score.toFixed(1)}`;
      detailAccuracyScore.className = `score-badge ${getStatusClass(
        "success"
      )}`;
      detailAccuracyScore.style.backgroundColor =
        score >= 95
          ? "var(--success-color)"
          : score >= 80
          ? "var(--warning-color)"
          : "var(--danger-color)";

      detailSummary.textContent = report.llm_analysis.summary;
      detailReasoning.textContent = report.llm_analysis.reasoning;
      renderListItems(
        detailKeyDifferences,
        report.llm_analysis.key_differences
      );
      renderListItems(detailSuggestions, report.llm_analysis.suggestions);
    }

    recordingAudioPlayer.src = report.recording_file_url || "";
    monitoringAudioPlayer.src = report.monitoring_file_path || "";

    recordingTranscript.textContent = report.recording_stt_result
      ? report.recording_stt_result.transcript
      : "轉錄失敗或無資料";
    monitoringTranscript.textContent = report.monitoring_stt_result
      ? report.monitoring_stt_result.transcript
      : "轉錄失敗或無資料";

    switchView("detail");
  }

  /**
   * 從後端獲取所有報告
   */
  async function fetchAllReports() {
    try {
      const response = await fetch(`${API_BASE_URL}/reports`);
      if (!response.ok) throw new Error("無法獲取報告列表");
      const reports = await response.json();
      renderReportsList(reports);
    } catch (error) {
      console.error(error);
      noReportsMessage.classList.remove("hidden");
    }
  }

  /**
   * 根據 ID 從後端獲取單一報告詳情
   * @param {string} reportId
   */
  async function fetchReportDetails(reportId) {
    try {
      const response = await fetch(`${API_BASE_URL}/reports/${reportId}`);
      if (!response.ok) throw new Error("無法獲取報告詳情");
      const report = await response.json();
      populateDetailView(report);
    } catch (error) {
      console.error(error);
      alert("載入報告詳情失敗！");
    }
  }

  // --- 事件監聽 ---
  reportsTbody.addEventListener("click", (event) => {
    if (event.target.matches("button[data-report-id]")) {
      const reportId = event.target.dataset.reportId;
      fetchReportDetails(reportId);
    }
  });

  backToListBtn.addEventListener("click", () => {
    // 停止播放音訊
    recordingAudioPlayer.pause();
    monitoringAudioPlayer.pause();
    switchView("list");
  });

  // --- 初始化 ---
  fetchAllReports();
  // 可以設定一個定時器來自動刷新列表
  setInterval(fetchAllReports, 30000); // 每 30 秒刷新一次
});
