document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "/api";

  // --- 歷史報告視圖元素 ---
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

  // --- 頁籤和即時監控視圖元素 ---
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  const realtimeLog = document.getElementById("realtime-log");
  let realtime_ws = null; // 用於即時監控的 WebSocket
  const initialRealtimeLogMessage = "<p><i>正在等待新的通話開始...</i></p>";

  /**
   * witchView 函式：切換歷史報告的列表和詳情視圖
   */
  function switchView(viewName) {
    const historicalReportsTab = document.getElementById("historical-reports");
    if (viewName === "list") {
      historicalReportsTab.style.display = "block";
      listView.style.display = "block"; // 確保 list-view 可見
      detailView.classList.add("hidden");
    } else {
      historicalReportsTab.style.display = "block";
      listView.style.display = "none"; // 隱藏 list-view
      detailView.classList.remove("hidden");
    }
  }

  // --- 頁籤切換邏輯 ---
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      // 移除所有按鈕的 active class
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      // 為當前點擊的按鈕加上 active class
      button.classList.add("active");

      const targetTabId = button.dataset.tab;

      // 隱藏所有 tab content
      tabContents.forEach((content) => {
        content.style.display = "none";
      });

      // 詳情頁是獨立於 tab content 的，也需要隱藏
      detailView.classList.add("hidden");

      const targetTab = document.getElementById(targetTabId);
      targetTab.style.display = "block";
      // 如果是歷史報告 tab，確保顯示的是列表
      if (targetTabId === "historical-reports") {
        listView.style.display = "block";
      }

      // 根據切換的頁籤，管理 WebSocket 連線
      if (targetTabId === "realtime-monitoring") {
        connectRealtimeMonitoring();
      } else {
        // 切換到任何其他頁籤時，都斷開即時監控的連線以節省資源
        if (realtime_ws) {
          realtime_ws.close();
        }
      }
    });
  });

  // --- 即時監控 WebSocket 邏輯 ---
  function connectRealtimeMonitoring() {
    // 如果已經連線，則不重複建立連線
    if (realtime_ws && realtime_ws.readyState === WebSocket.OPEN) {
      return;
    }

    // 重置日誌區域的內容
    realtimeLog.innerHTML = initialRealtimeLogMessage;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // 連接到後端新增的、無參數的通用結果推送端點
    const wsUrl = `${protocol}//${window.location.host}/ws/current-transcription`;
    realtime_ws = new WebSocket(wsUrl);

    let isFirstMessage = true;

    realtime_ws.onopen = () => {
      console.log("已連接到即時轉錄伺服器。");
    };

    realtime_ws.onmessage = (event) => {
      // 收到第一則訊息時，清空等待提示
      if (isFirstMessage) {
        realtimeLog.innerHTML = "";
        isFirstMessage = false;
      }
      // 將收到的轉錄結果顯示在畫面上
      const p = document.createElement("p");
      p.textContent = event.data;
      realtimeLog.appendChild(p);
      realtimeLog.scrollTop = realtimeLog.scrollHeight; // 自動滾動到底部
    };

    realtime_ws.onclose = () => {
      console.log("與即時轉錄伺服器的連線已中斷。");
      realtimeLog.innerHTML = `<p><i>連線已中斷。您可以切換頁籤後再切換回來以嘗試重連。</i></p>`;
      realtime_ws = null;
    };

    realtime_ws.onerror = (error) => {
      console.error("即時轉錄 WebSocket 發生錯誤:", error);
      realtimeLog.innerHTML += "<p><em>與伺服器的連線發生錯誤。</em></p>";
    };
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
    ulElement.innerHTML = "";
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
    recordingAudioPlayer.pause();
    monitoringAudioPlayer.pause();
    switchView("list");
  });

  // --- 初始化 ---
  // 預設啟動即時監控，並在背景載入歷史報告
  connectRealtimeMonitoring();
  fetchAllReports();
  setInterval(fetchAllReports, 30000);
});
