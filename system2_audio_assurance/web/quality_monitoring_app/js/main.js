document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "/api";

  // --- 歷史報告視圖元素 ---
  const listView = document.getElementById("list-view");
  const detailView = document.getElementById("detail-view");
  const reportsTbody = document.getElementById("reports-tbody");
  const refreshReportsBtn = document.getElementById("refresh-reports-btn");
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
  const progressContainer = document.getElementById("call-progress");
  const progressStatusText = document.getElementById("progress-status-text");
  const progressExtraMessage = document.getElementById("progress-extra-message");
  const progressBarFill = document.getElementById("progress-bar-fill");
  const progressSteps = progressContainer
    ? Array.from(progressContainer.querySelectorAll(".progress-step"))
    : [];
  const progressStepMap = progressSteps.reduce((acc, step) => {
    acc[step.dataset.status] = step;
    return acc;
  }, {});
  const PROGRESS_SEQUENCE = [
    "waiting_for_call",
    "call_started",
    "call_ended",
    "verifying",
    "verification_complete",
  ];
  const PROGRESS_LABELS = {
    waiting_for_call: "等待通話",
    call_started: "通話開始",
    call_ended: "通話結束",
    verifying: "驗證中",
    verification_complete: "驗證完成",
    verification_failed: "驗證失敗",
  };
  let progressSessionId = null;
  let currentProgressStatus = "waiting_for_call";
  let realtimeState = { isFirstMessage: true, currentSessionId: null };
  let realtime_ws = null; // 用於即時監控的 WebSocket
  const initialRealtimeLogMessage = "<p><i>正在等待新的通話開始...</i></p>";

  function resetProgressVisuals() {
    if (!progressContainer) return;
    progressSteps.forEach((step) => {
      step.classList.remove("is-complete", "is-active");
      step.classList.add("is-pending");
    });
    const waitingStep = progressStepMap["waiting_for_call"];
    if (waitingStep) {
      waitingStep.classList.add("is-active");
      waitingStep.classList.remove("is-pending");
    }
    if (progressBarFill) {
      progressBarFill.style.width = "0%";
    }
    progressContainer.classList.remove("has-error");
    if (progressStatusText) {
      progressStatusText.textContent = PROGRESS_LABELS.waiting_for_call;
    }
    if (progressExtraMessage) {
      progressExtraMessage.textContent = "";
    }
    progressSessionId = null;
    currentProgressStatus = "waiting_for_call";
  }

  function truncateMessage(message, maxLength = 120) {
    if (!message) return "";
    const text = String(message);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  function updateProgress(status, sessionId = null, extra = {}) {
    if (!progressContainer) return;

    const normalizedStatus = typeof status === "string" ? status : "";
    const extraMessage =
      extra && typeof extra.message === "string" ? extra.message.trim() : "";

    if (normalizedStatus === "waiting_for_call") {
      resetProgressVisuals();
      if (extraMessage && progressExtraMessage) {
        progressExtraMessage.textContent = truncateMessage(extraMessage);
      }
      return;
    }

    if (sessionId) {
      if (progressSessionId && progressSessionId !== sessionId) {
        resetProgressVisuals();
      }
      progressSessionId = sessionId;
    }

    let targetStatus = normalizedStatus;
    if (normalizedStatus === "verification_failed") {
      targetStatus = "verification_complete";
      progressContainer.classList.add("has-error");
    } else {
      progressContainer.classList.remove("has-error");
    }

    const targetIndex = PROGRESS_SEQUENCE.indexOf(targetStatus);
    if (targetIndex === -1) {
      if (progressStatusText) {
        progressStatusText.textContent =
          PROGRESS_LABELS[normalizedStatus] || normalizedStatus;
      }
      if (progressExtraMessage) {
        progressExtraMessage.textContent = truncateMessage(extraMessage);
      }
      currentProgressStatus = normalizedStatus;
      return;
    }

    progressSteps.forEach((step) => {
      const stepStatus = step.dataset.status;
      const stepIndex = PROGRESS_SEQUENCE.indexOf(stepStatus);
      if (stepIndex === -1) return;
      step.classList.toggle("is-complete", stepIndex < targetIndex);
      step.classList.toggle("is-active", stepIndex === targetIndex);
      step.classList.toggle("is-pending", stepIndex > targetIndex);
    });

    if (progressBarFill) {
      const denominator = PROGRESS_SEQUENCE.length - 1 || 1;
      const percent = (targetIndex / denominator) * 100;
      progressBarFill.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
    }

    if (progressStatusText) {
      progressStatusText.textContent =
        PROGRESS_LABELS[normalizedStatus] ||
        PROGRESS_LABELS[targetStatus] ||
        normalizedStatus;
    }

    if (progressExtraMessage) {
      if (normalizedStatus === "verification_failed" && extraMessage) {
        progressExtraMessage.textContent = `失敗原因：${truncateMessage(extraMessage)}`;
      } else {
        progressExtraMessage.textContent = truncateMessage(extraMessage);
      }
    }

    currentProgressStatus = normalizedStatus;
  }

  function handleTranscriptPayload(payload) {
    if (!realtimeLog) return;
    const text =
      (payload && (payload.text || payload.transcript)) || "";
    if (!text) return;

    const sessionId = payload && payload.session_id ? payload.session_id : null;

    if (
      sessionId &&
      realtimeState.currentSessionId &&
      sessionId !== realtimeState.currentSessionId
    ) {
      realtimeLog.innerHTML = "";
      realtimeState.isFirstMessage = true;
    }

    if (sessionId) {
      realtimeState.currentSessionId = sessionId;
    }

    if (realtimeState.isFirstMessage) {
      realtimeLog.innerHTML = "";
      realtimeState.isFirstMessage = false;
    }

    const p = document.createElement("p");
    p.textContent = text;
    realtimeLog.appendChild(p);
    realtimeLog.scrollTop = realtimeLog.scrollHeight;
  }

  function handleStatusPayload(payload) {
    if (!payload || typeof payload.status !== "string") {
      return;
    }

    const { status } = payload;
    const sessionId =
      typeof payload.session_id === "string" ? payload.session_id : null;
    const extra = payload.extra || {};

    if (status === "call_started" && sessionId) {
      if (progressSessionId && progressSessionId !== sessionId) {
        resetProgressVisuals();
      }
      realtimeState.currentSessionId = sessionId;
      realtimeState.isFirstMessage = true;
    }

    updateProgress(status, sessionId, extra);

    if (status === "waiting_for_call") {
      realtimeState.currentSessionId = null;
      realtimeState.isFirstMessage = true;
    }
  }

  resetProgressVisuals();


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
    if (realtime_ws && realtime_ws.readyState === WebSocket.OPEN) {
      return;
    }

    realtimeLog.innerHTML = initialRealtimeLogMessage;
    resetProgressVisuals();
    realtimeState = { isFirstMessage: true, currentSessionId: null };

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/current-transcription`;
    realtime_ws = new WebSocket(wsUrl);

    realtime_ws.onopen = () => {
      console.log("已連線至即時監控伺服器");
      if (progressExtraMessage) {
        progressExtraMessage.textContent = "";
      }
    };

    realtime_ws.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (parseError) {
        handleTranscriptPayload({ text: event.data });
        return;
      }

      if (!payload || typeof payload !== "object") {
        return;
      }

      if (payload.type === "transcript") {
        handleTranscriptPayload(payload);
      } else if (payload.type === "status") {
        handleStatusPayload(payload);
      } else {
        console.debug("收到未識別訊息", payload);
      }
    };

    realtime_ws.onclose = () => {
      console.log("即時監控伺服器連線已中斷");
      updateProgress("waiting_for_call", null, {
        message: "連線已中斷，稍後將自動重試。",
      });
      realtimeLog.innerHTML = `<p><i>連線中斷。切換回此頁面以重新連線。</i></p>`;
      realtimeState = { isFirstMessage: true, currentSessionId: null };
      realtime_ws = null;
    };

    realtime_ws.onerror = (error) => {
      console.error("即時轉錄 WebSocket 發生錯誤:", error);
      if (progressExtraMessage) {
        progressExtraMessage.textContent = "連線發生錯誤，請稍後再試。";
      }
      if (realtimeLog) {
        realtimeLog.innerHTML += "<p><em>連線發生錯誤，請稍後再試。</em></p>";
      }
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
  async function fetchAllReports(options = {}) {
    const { showLoading = false } = options;
    let restoreLabel = null;
    let showFailureState = false;

    if (showLoading && refreshReportsBtn) {
      const defaultLabel =
        refreshReportsBtn.dataset.defaultLabel ||
        refreshReportsBtn.textContent.trim() ||
        "重新整理";
      refreshReportsBtn.dataset.defaultLabel = defaultLabel;
      restoreLabel = defaultLabel;
      refreshReportsBtn.disabled = true;
      refreshReportsBtn.textContent = "刷新中...";
    }

    try {
      const response = await fetch(`${API_BASE_URL}/reports`);
      if (!response.ok) throw new Error("無法載入報告列表");
      const reports = await response.json();
      renderReportsList(reports);
    } catch (error) {
      console.error(error);
      noReportsMessage.classList.remove("hidden");
      if (showLoading && refreshReportsBtn) {
        refreshReportsBtn.textContent = "刷新失敗";
        showFailureState = true;
      }
    } finally {
      if (showLoading && refreshReportsBtn) {
        const defaultLabel =
          restoreLabel ||
          refreshReportsBtn.dataset.defaultLabel ||
          "重新整理";
        const finish = () => {
          refreshReportsBtn.textContent = defaultLabel;
          refreshReportsBtn.disabled = false;
        };
        if (showFailureState) {
          setTimeout(finish, 1200);
        } else {
          finish();
        }
      }
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

  if (refreshReportsBtn) {
    refreshReportsBtn.addEventListener("click", () => {
      fetchAllReports({ showLoading: true });
    });
  }

  // --- 初始化 ---
  // 預設啟動即時監控，並在背景載入歷史報告
  connectRealtimeMonitoring();
  fetchAllReports();
  setInterval(fetchAllReports, 30000);
});
