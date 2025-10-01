document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "/api";

  // --- 歷史報告與詳情視圖元素 ---
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
  const detailKeyDifferences = document.getElementById("detail-key-differences");
  const detailSuggestions = document.getElementById("detail-suggestions");
  const recordingAudioPlayer = document.getElementById("recording-audio-player");
  const monitoringAudioPlayer = document.getElementById("monitoring-audio-player");
  const recordingTranscript = document.getElementById("recording-transcript");
  const monitoringTranscript = document.getElementById("monitoring-transcript");

  // --- 分頁與即時監控元素 ---
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
    call_started: "通話進行中",
    call_ended: "通話已結束",
    verifying: "檢核中",
    verification_complete: "檢核完成",
    verification_failed: "檢核失敗",
  };

  const STATUS_LABELS = {
    success: "完成",
    error: "異常",
    processing: "處理中",
    pending: "等待中",
  };

  let progressSessionId = null;
  let currentProgressStatus = "waiting_for_call";
  let realtimeState = { isFirstMessage: true, currentSessionId: null };
  let realtimeSocket = null;

  const initialRealtimeLogMessage = "<p><i>目前等待通話開始...</i></p>";

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
      progressStatusText.classList.remove("status-chip-success", "status-chip-error", "status-chip-warning");
      progressStatusText.classList.add("status-chip-neutral");
    }

    if (progressExtraMessage) {
      progressExtraMessage.textContent = "";
    }

    progressSessionId = null;
    currentProgressStatus = "waiting_for_call";
  }

  function truncateMessage(message, maxLength = 140) {
    if (!message) return "";
    const text = String(message);
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
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

      progressStatusText.classList.remove(
        "status-chip-neutral",
        "status-chip-success",
        "status-chip-warning",
        "status-chip-error"
      );

      if (normalizedStatus === "verification_failed") {
        progressStatusText.classList.add("status-chip-error");
      } else if (normalizedStatus === "verification_complete") {
        progressStatusText.classList.add("status-chip-success");
      } else if (normalizedStatus === "verifying") {
        progressStatusText.classList.add("status-chip-warning");
      } else {
        progressStatusText.classList.add("status-chip-neutral");
      }
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
    const text = (payload && (payload.text || payload.transcript)) || "";
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
    p.style.opacity = "0";
    p.style.transform = "translateX(-20px)";
    p.style.transition = "all 0.3s ease";

    realtimeLog.appendChild(p);

    setTimeout(() => {
      p.style.opacity = "1";
      p.style.transform = "translateX(0)";
    }, 10);

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

  function switchView(viewName) {
    const historicalReportsTab = document.getElementById("historical-reports");
    if (!historicalReportsTab) return;

    if (viewName === "list") {
      historicalReportsTab.style.display = "block";
      if (listView) listView.style.display = "block";
      detailView.classList.add("hidden");
    } else {
      historicalReportsTab.style.display = "block";
      if (listView) listView.style.display = "none";
      detailView.classList.remove("hidden");
    }
  }

  function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    const notificationType = ["success", "error", "info"].includes(type)
      ? type
      : "info";
    const titleMap = {
      success: "成功",
      error: "提醒",
      info: "通知",
    };

    notification.className = `notification notification-${notificationType}`;
    notification.innerHTML = `
      <span class="notification-dot"></span>
      <div class="notification-body">
        <strong>${titleMap[notificationType]}</strong>
        <span>${message}</span>
      </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = "0";
      notification.style.transform = "translateX(12px)";
      setTimeout(() => {
        if (notification.parentElement) {
          notification.parentElement.removeChild(notification);
        }
      }, 280);
    }, 3000);
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      const targetTabId = button.dataset.tab;

      tabContents.forEach((content) => {
        content.style.display = "none";
      });

      detailView.classList.add("hidden");

      const targetTab = document.getElementById(targetTabId);
      if (targetTab) {
        targetTab.style.display = "block";
        addFadeInAnimation(targetTab);
      }

      if (targetTabId === "historical-reports" && listView) {
        listView.style.display = "block";
      }

      if (targetTabId === "realtime-monitoring") {
        connectRealtimeMonitoring();
        showNotification("已切換至即時監控", "success");
      } else if (realtimeSocket) {
        realtimeSocket.close();
      }
    });
  });

  function connectRealtimeMonitoring() {
    if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
      return;
    }

    if (realtimeLog) {
      realtimeLog.innerHTML = initialRealtimeLogMessage;
    }
    resetProgressVisuals();
    realtimeState = { isFirstMessage: true, currentSessionId: null };

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/current-transcription`;
    realtimeSocket = new WebSocket(wsUrl);

    realtimeSocket.onopen = () => {
      if (progressExtraMessage) {
        progressExtraMessage.textContent = "";
      }
      if (progressContainer) {
        progressContainer.style.borderColor = "var(--success)";
        setTimeout(() => {
          progressContainer.style.borderColor = "";
        }, 2000);
      }
      showNotification("即時監控連線已建立", "success");
    };

    realtimeSocket.onmessage = (event) => {
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
        console.debug("未處理的即時訊息：", payload);
      }
    };

    realtimeSocket.onclose = () => {
      updateProgress("waiting_for_call", null, {
        message: "即時連線已結束，可稍後重新整理或保持此頁以等待重連。",
      });

      if (realtimeLog) {
        realtimeLog.innerHTML =
          "<p><i>連線中斷，請稍候或重新整理頁面以重新啟動監控。</i></p>";
      }

      realtimeState = { isFirstMessage: true, currentSessionId: null };
      realtimeSocket = null;

      if (progressContainer) {
        progressContainer.style.borderColor = "var(--danger)";
        setTimeout(() => {
          progressContainer.style.borderColor = "";
        }, 3000);
      }

      showNotification("即時監控連線中斷", "error");
    };

    realtimeSocket.onerror = (error) => {
      console.error("即時監控 WebSocket 發生錯誤:", error);
      if (progressExtraMessage) {
        progressExtraMessage.textContent = "連線發生異常，系統稍後會再次嘗試。";
      }
      if (realtimeLog) {
        realtimeLog.innerHTML +=
          "<p><em>監控連線異常，請確認伺服器狀態後再試。</em></p>";
      }
      showNotification("即時監控發生錯誤", "error");
    };
  }

  function getScoreClass(score) {
    if (typeof score !== "number" || Number.isNaN(score)) {
      return "score-medium";
    }
    if (score >= 95) return "score-high";
    if (score >= 80) return "score-medium";
    return "score-low";
  }

  function getStatusClass(status) {
    switch ((status || "").toLowerCase()) {
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

  function addFadeInAnimation(element, delay = 0) {
    if (!element) return;
    element.style.opacity = "0";
    element.style.transform = "translateY(18px)";
    element.style.transition = "all 0.45s ease";

    setTimeout(() => {
      element.style.opacity = "1";
      element.style.transform = "translateY(0)";
    }, delay);
  }

  function renderReportsList(reports) {
    if (!reportsTbody) return;
    reportsTbody.innerHTML = "";

    if (!reports || reports.length === 0) {
      if (noReportsMessage) {
        noReportsMessage.classList.remove("hidden");
        addFadeInAnimation(noReportsMessage);
      }
      return;
    }

    if (noReportsMessage) {
      noReportsMessage.classList.add("hidden");
    }

    reports
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .forEach((report, index) => {
        const tr = document.createElement("tr");
        const scoreValue = report?.llm_analysis?.accuracy_score;
        const hasScore = typeof scoreValue === "number" && !Number.isNaN(scoreValue);
        const score = hasScore ? scoreValue.toFixed(1) : "--";
        const scoreClass = hasScore ? getScoreClass(scoreValue) : "";
        const status = (report.status || "").toLowerCase();
        const statusLabel = STATUS_LABELS[status] || report.status || "--";
        const dateSource = report.completed_at || report.created_at;
        const formattedDate = dateSource
          ? new Date(dateSource).toLocaleString("zh-TW", { hour12: false })
          : "--";

        tr.innerHTML = `
          <td>${report.report_id ? `${report.report_id.slice(0, 12)}…` : "--"}</td>
          <td>${report.call_session_id || "--"}</td>
          <td><span class="status-badge ${getStatusClass(status)}">${statusLabel}</span></td>
          <td class="score ${scoreClass}">${score}</td>
          <td>${formattedDate}</td>
          <td>
            <button class="btn btn-primary" data-report-id="${
              report.report_id
            }" ${status !== "success" ? "disabled" : ""}>
              檢視詳情
            </button>
          </td>
        `;

        reportsTbody.appendChild(tr);
        addFadeInAnimation(tr, index * 50);
      });
  }

  function renderListItems(ulElement, items) {
    if (!ulElement) return;
    ulElement.innerHTML = "";
    if (items && items.length) {
      items.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        ulElement.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "尚無資料";
      ulElement.appendChild(li);
    }
  }

  function populateDetailView(report) {
    if (!report) return;

    detailReportId.textContent = report.report_id || "--";
    detailSessionId.textContent = report.call_session_id || "--";

    if (report.llm_analysis) {
      const score = report.llm_analysis.accuracy_score;
      if (typeof score === "number" && !Number.isNaN(score)) {
        detailAccuracyScore.textContent = score.toFixed(1);
        detailAccuracyScore.className = `score-badge ${getScoreClass(score)}`;
      } else {
        detailAccuracyScore.textContent = "--";
        detailAccuracyScore.className = "score-badge score-medium";
      }

      detailSummary.textContent = report.llm_analysis.summary || "";
      detailReasoning.textContent = report.llm_analysis.reasoning || "";
      renderListItems(detailKeyDifferences, report.llm_analysis.key_differences);
      renderListItems(detailSuggestions, report.llm_analysis.suggestions);
    } else {
      detailAccuracyScore.textContent = "--";
      detailAccuracyScore.className = "score-badge score-medium";
      detailSummary.textContent = "尚未取得分析摘要";
      detailReasoning.textContent = "";
      renderListItems(detailKeyDifferences, []);
      renderListItems(detailSuggestions, []);
    }

    recordingAudioPlayer.src = report.recording_file_url || "";
    monitoringAudioPlayer.src = report.monitoring_file_path || "";

    recordingTranscript.textContent =
      report.recording_stt_result?.transcript || "暫無逐字稿";
    monitoringTranscript.textContent =
      report.monitoring_stt_result?.transcript || "暫無逐字稿";

    switchView("detail");

    const cards = detailView.querySelectorAll(".card");
    cards.forEach((card, index) => {
      addFadeInAnimation(card, index * 100);
    });

    showNotification("報告詳情載入完成", "success");
  }

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
      refreshReportsBtn.textContent = "同步中…";
    }

    try {
      const response = await fetch(`${API_BASE_URL}/reports`);
      if (!response.ok) throw new Error("載入歷史報告失敗");
      const reports = await response.json();
      renderReportsList(reports);
    } catch (error) {
      console.error(error);
      if (noReportsMessage) {
        noReportsMessage.classList.remove("hidden");
        noReportsMessage.querySelector("p").textContent =
          "無法取得歷史報告，請稍後再試。";
      }
      if (showLoading && refreshReportsBtn) {
        refreshReportsBtn.textContent = "重新整理失敗";
        showFailureState = true;
      }
    } finally {
      if (showLoading && refreshReportsBtn) {
        const defaultLabel =
          restoreLabel || refreshReportsBtn.dataset.defaultLabel || "重新整理";
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

  async function fetchReportDetails(reportId) {
    if (!reportId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/reports/${reportId}`);
      if (!response.ok) throw new Error("取得報告詳情失敗");
      const report = await response.json();
      populateDetailView(report);
    } catch (error) {
      console.error(error);
      alert("載入報告詳情時發生錯誤，請稍後再試。");
    }
  }

  reportsTbody.addEventListener("click", (event) => {
    const target = event.target;
    if (target.matches("button[data-report-id]")) {
      const reportId = target.dataset.reportId;
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

  connectRealtimeMonitoring();
  fetchAllReports();
  setInterval(fetchAllReports, 30000);

  setTimeout(() => {
    showNotification("錄音檔檢核平台 - 儀表板已就緒", "success");
  }, 900);

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case "1":
          event.preventDefault();
          tabButtons[0]?.click();
          break;
        case "2":
          event.preventDefault();
          tabButtons[1]?.click();
          break;
        case "r":
          event.preventDefault();
          refreshReportsBtn?.click();
          showNotification("已重新整理歷史報告", "info");
          break;
      }
    }
  });
});
