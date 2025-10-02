document.addEventListener("DOMContentLoaded", () => {
  // === 常數定義 ===
  const API_BASE_URL = "/api";
  
  const PROGRESS_SEQUENCE = [
    "waiting_for_call", "recording_started", "call_in_progress", "call_ended",
    "file_storage", "file_backup", "stt_processing", "cross_verification",
    "comparison", "result_complete", "verification_success", "verification_failed"
  ];

  const PROGRESS_LABELS = {
    waiting_for_call: "電話連線", recording_started: "電話系統", call_in_progress: "錄音系統",
    call_ended: "錄音檔存放", file_storage: "錄音檔備份", file_backup: "錄音檔核平台",
    stt_processing: "STT 轉換", cross_verification: "交互比對", comparison: "語意比對",
    result_complete: "檢核完成", verification_success: "驗證成功", verification_failed: "檢核失敗"
  };

  const FLOW_STEPS = [
    { id: "waiting_for_call", label: "待電話連線", row: 0, col: 0 },
    { id: "recording_started", label: "電話系統", row: 1, col: 0 },
    { id: "call_in_progress", label: "錄音系統", row: 2, col: 0 },
    { id: "call_ended", label: "錄音檔存放空間", row: 3, col: 0 },
    { id: "file_storage", label: "錄音檔備份空間", row: 4, col: 0 },
    { id: "file_backup", label: "錄音檔檢核平台", row: 2, col: 2, isMainPlatform: true },
    { id: "stt_processing", label: "STT轉換1", row: 1, col: 3, isSubProcess: true },
    { id: "cross_verification", label: "STT轉換2", row: 2, col: 3, isSubProcess: true },
    { id: "comparison", label: "STT轉換3", row: 3, col: 3, isSubProcess: true },
    { id: "result_complete", label: "交互比對", row: 2, col: 4, isSubProcess: true },
    { id: "verification_success", label: "驗證成功", row: 1, col: 6, isResult: true },
    { id: "verification_failed", label: "驗證失敗", row: 3, col: 6, isResult: true }
  ];

  const STATUS_LABELS = {
    success: "完成", error: "異常", processing: "處理中", pending: "等待中"
  };

  // === DOM 元素 ===
  const elements = {
    // 歷史報告相關
    listView: document.getElementById("list-view"),
    detailView: document.getElementById("detail-view"),
    reportsTbody: document.getElementById("reports-tbody"),
    refreshReportsBtn: document.getElementById("refresh-reports-btn"),
    noReportsMessage: document.getElementById("no-reports-message"),
    backToListBtn: document.getElementById("back-to-list-btn"),
    resetProgressBtn: document.getElementById("reset-progress-btn"),
    
    // 詳情視圖
    detailReportId: document.getElementById("detail-report-id"),
    detailSessionId: document.getElementById("detail-session-id"),
    detailAccuracyScore: document.getElementById("detail-accuracy-score"),
    detailSummary: document.getElementById("detail-summary"),
    detailReasoning: document.getElementById("detail-reasoning"),
    detailKeyDifferences: document.getElementById("detail-key-differences"),
    detailSuggestions: document.getElementById("detail-suggestions"),
    recordingAudioPlayer: document.getElementById("recording-audio-player"),
    monitoringAudioPlayer: document.getElementById("monitoring-audio-player"),
    recordingTranscript: document.getElementById("recording-transcript"),
    monitoringTranscript: document.getElementById("monitoring-transcript"),
    
    // 分頁與即時監控
    tabButtons: document.querySelectorAll(".tab-btn"),
    tabContents: document.querySelectorAll(".tab-content"),
    realtimeLog: document.getElementById("realtime-log"),
    progressContainer: document.getElementById("call-progress"),
    progressStatusText: document.getElementById("progress-status-text"),
    progressExtraMessage: document.getElementById("progress-extra-message"),
    progressBarFill: document.getElementById("progress-bar-fill"),
    progressCanvas: document.getElementById("progress-canvas")
  };

  const progressCtx = elements.progressCanvas?.getContext('2d');

  // === 狀態管理 ===
  let progressSessionId = null;
  let currentProgressStatus = "waiting_for_call";
  let realtimeState = { isFirstMessage: true, currentSessionId: null };
  let realtimeSocket = null;

  // === 工具函數 ===
  const utils = {
    truncateMessage: (message, maxLength = 140) => {
      if (!message) return "";
      const text = String(message);
      return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
    },

    getScoreClass: (score) => {
      if (typeof score !== "number" || Number.isNaN(score)) return "score-medium";
      if (score >= 95) return "score-high";
      if (score >= 80) return "score-medium";
      return "score-low";
    },

    getStatusClass: (status) => {
      switch ((status || "").toLowerCase()) {
        case "success": return "status-success";
        case "error": return "status-error";
        case "processing": return "status-processing";
        case "pending": return "status-pending";
        default: return "status-secondary";
      }
    },

    addFadeInAnimation: (element, delay = 0) => {
      if (!element) return;
      element.style.opacity = "0";
      element.style.transform = "translateY(18px)";
      element.style.transition = "all 0.45s ease";
      setTimeout(() => {
        element.style.opacity = "1";
        element.style.transform = "translateY(0)";
      }, delay);
    },

    showNotification: (message, type = "info") => {
      const notification = document.createElement("div");
      const notificationType = ["success", "error", "info"].includes(type) ? type : "info";
      const titleMap = { success: "成功", error: "提醒", info: "通知" };

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
        setTimeout(() => notification.remove(), 280);
      }, 3000);
    }
  };

  // === 畫布繪製 ===
  function drawProgressFlow(currentStep = "waiting_for_call", hasError = false) {
    if (!progressCtx || !elements.progressCanvas) return;
    
    const canvas = elements.progressCanvas;
    const ctx = progressCtx;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const { width, height } = rect;
    const stepWidth = width / 7;
    const stepHeight = height / 5;
    const boxWidth = 120;
    const boxHeight = 40;
    
    ctx.clearRect(0, 0, width, height);
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    
    const currentIndex = PROGRESS_SEQUENCE.indexOf(currentStep);
    
    // 繪製連接線
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [4, 5],
      [5, 6], [5, 7], [5, 8], [6, 9], [7, 9], [8, 9],
      [9, 10], [9, 11]
    ];
    
    connections.forEach(([fromIdx, toIdx]) => {
      const fromStep = FLOW_STEPS[fromIdx];
      const toStep = FLOW_STEPS[toIdx];
      const fromX = stepWidth * fromStep.col + stepWidth / 2;
      const fromY = stepHeight * fromStep.row + stepHeight / 2;
      const toX = stepWidth * toStep.col + stepWidth / 2;
      const toY = stepHeight * toStep.row + stepHeight / 2;
      
      const fromStepIndex = PROGRESS_SEQUENCE.indexOf(fromStep.id);
      const toStepIndex = PROGRESS_SEQUENCE.indexOf(toStep.id);
      const isActive = Math.min(fromStepIndex, toStepIndex) < currentIndex;
      
      ctx.strokeStyle = isActive ? '#14b8a6' : 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 4].includes(fromIdx) && toIdx === 5 ? [5, 5] : []);
      
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    });

    // 特殊90度連接
    const fromStep = FLOW_STEPS[0];
    const toStep = FLOW_STEPS[5];
    const fromX = stepWidth * fromStep.col + stepWidth / 2;
    const fromY = stepHeight * fromStep.row + stepHeight / 2;
    const toX = stepWidth * toStep.col + stepWidth / 2;
    const toY = stepHeight * toStep.row + stepHeight / 2;
    
    ctx.strokeStyle = currentIndex > 0 ? '#14b8a6' : 'rgba(148, 163, 184, 0.4)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // 從交互比對到完成的連接
    const resultStep = FLOW_STEPS[9];
    const resultX = stepWidth * resultStep.col + stepWidth / 2;
    const resultY = stepHeight * resultStep.row + stepHeight / 2;
    const successStep = FLOW_STEPS[10];
    const failStep = FLOW_STEPS[11];
    const successX = stepWidth * successStep.col + stepWidth / 2;
    const successY = stepHeight * successStep.row + stepHeight / 2;
    const failX = stepWidth * failStep.col + stepWidth / 2;
    const failY = stepHeight * failStep.row + stepHeight / 2;
    
    const resultIndex = PROGRESS_SEQUENCE.indexOf('result_complete');
    const isResultActive = resultIndex <= currentIndex || currentStep === 'verification_success' || currentStep === 'verification_failed';
    
    ctx.strokeStyle = isResultActive ? '#14b8a6' : 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    
    // 到成功的線
    ctx.beginPath();
    ctx.moveTo(resultX, resultY);
    ctx.lineTo(successX, successY);
    ctx.stroke();
    
    // 到失敗的線
    ctx.beginPath();
    ctx.moveTo(resultX, resultY);
    ctx.lineTo(failX, failY);
    ctx.stroke();
    
    // 繪製步驟框
    FLOW_STEPS.forEach((step) => {
      const x = stepWidth * step.col + stepWidth / 2;
      const y = stepHeight * step.row + stepHeight / 2;
      const stepIndex = PROGRESS_SEQUENCE.indexOf(step.id);
      
      const isActive = stepIndex === currentIndex;
      const isComplete = stepIndex < currentIndex;
      
      let currentBoxWidth = boxWidth;
      let currentBoxHeight = boxHeight;
      
      if (step.isMainPlatform) {
        currentBoxWidth = 140;
        currentBoxHeight = 80;
      } else if (step.isSubProcess) {
        currentBoxWidth = 100;
        currentBoxHeight = 35;
      } else if (step.isResult) {
        currentBoxWidth = 90;
        currentBoxHeight = 30;
      }
      
      // 設定樣式
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      
      if (isActive || isComplete) {
        if (hasError && isActive) {
          ctx.fillStyle = '#fef2f2';
          ctx.strokeStyle = '#ef4444';
        } else if (isActive) {
          ctx.fillStyle = '#dbeafe';
          ctx.strokeStyle = '#2563eb';
        } else if (isComplete) {
          ctx.fillStyle = '#d1fae5';
          ctx.strokeStyle = '#14b8a6';
        }
      }
      
      if (step.isMainPlatform && (isActive || isComplete)) {
        ctx.fillStyle = isActive ? '#e0f2fe' : '#f0f9ff';
        ctx.strokeStyle = isActive ? '#0891b2' : '#0284c7';
        ctx.lineWidth = 3;
      }
      
      ctx.fillRect(x - currentBoxWidth/2, y - currentBoxHeight/2, currentBoxWidth, currentBoxHeight);
      ctx.strokeRect(x - currentBoxWidth/2, y - currentBoxHeight/2, currentBoxWidth, currentBoxHeight);
      
      // 繪製文字
      ctx.fillStyle = '#475569';
      if (isActive || isComplete) {
        if (hasError && isActive) ctx.fillStyle = '#dc2626';
        else if (isActive) ctx.fillStyle = '#1d4ed8';
        else if (isComplete) ctx.fillStyle = '#059669';
      }
      
      if (step.isMainPlatform) {
        if (isActive || isComplete) ctx.fillStyle = '#0891b2';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(step.label, x, y - 10);
        ctx.font = '10px Inter, sans-serif';
        const statusText = isActive && currentStep === 'file_backup' ? '檢核中...' : 
                          isComplete ? '已完成' : '等待中...';
        ctx.fillStyle = isActive && currentStep === 'file_backup' ? '#0284c7' : 
                       isComplete ? '#059669' : '#475569';
        ctx.fillText(statusText, x, y + 8);
      } else {
        if (step.isSubProcess) ctx.font = '10px Inter, sans-serif';
        else if (step.isResult) ctx.font = '9px Inter, sans-serif';
        else ctx.font = '11px Inter, sans-serif';
        
        // 調整 STT轉換3 的標籤
        const displayLabel = step.id === 'comparison' ? 'STT轉換3' : step.label;
        ctx.fillText(displayLabel, x, y + 2);
      }
      
      ctx.font = '11px Inter, sans-serif';
    });
  }

  // === 進度管理 ===
  function resetProgressVisuals() {
    if (!elements.progressContainer) return;

    if (elements.progressBarFill) elements.progressBarFill.style.width = "0%";
    elements.progressContainer.classList.remove("has-error");

    if (elements.progressStatusText) {
      elements.progressStatusText.textContent = PROGRESS_LABELS.waiting_for_call;
      elements.progressStatusText.className = "status-chip-neutral";
    }

    if (elements.progressExtraMessage) elements.progressExtraMessage.textContent = "";
    drawProgressFlow("waiting_for_call", false);
    progressSessionId = null;
    currentProgressStatus = "waiting_for_call";
  }

  function updateProgress(status, sessionId = null, extra = {}) {
    if (!elements.progressContainer) return;

    const normalizedStatus = typeof status === "string" ? status : "";
    const extraMessage = extra?.message?.trim() || "";

    if (normalizedStatus === "waiting_for_call") {
      resetProgressVisuals();
      if (extraMessage && elements.progressExtraMessage) {
        elements.progressExtraMessage.textContent = utils.truncateMessage(extraMessage);
      }
      return;
    }

    if (sessionId) {
      if (progressSessionId && progressSessionId !== sessionId) resetProgressVisuals();
      progressSessionId = sessionId;
    }

    let targetStatus = normalizedStatus;
    let targetIndex;
    
    if (normalizedStatus === "verification_failed") {
      targetStatus = "verification_failed";
      targetIndex = PROGRESS_SEQUENCE.length - 1; // 設為最後一個位置
      elements.progressContainer.classList.add("has-error");
    } else if (normalizedStatus === "verification_success") {
      targetStatus = "verification_success";
      targetIndex = PROGRESS_SEQUENCE.length - 1; // 設為最後一個位置
      elements.progressContainer.classList.remove("has-error");
    } else {
      elements.progressContainer.classList.remove("has-error");
      targetIndex = PROGRESS_SEQUENCE.indexOf(targetStatus);
    }

    if (targetIndex === -1) {
      if (elements.progressStatusText) {
        elements.progressStatusText.textContent = PROGRESS_LABELS[normalizedStatus] || normalizedStatus;
      }
      if (elements.progressExtraMessage) {
        elements.progressExtraMessage.textContent = utils.truncateMessage(extraMessage);
      }
      currentProgressStatus = normalizedStatus;
      return;
    }

    const hasError = normalizedStatus === "verification_failed";
    drawProgressFlow(targetStatus, hasError);

    if (elements.progressBarFill) {
      const percent = (targetIndex / (PROGRESS_SEQUENCE.length - 1)) * 100;
      elements.progressBarFill.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
    }

    if (elements.progressStatusText) {
      elements.progressStatusText.textContent = PROGRESS_LABELS[normalizedStatus] || 
                                               PROGRESS_LABELS[targetStatus] || 
                                               normalizedStatus;

      elements.progressStatusText.className = `status-chip-${
        normalizedStatus === "verification_failed" ? "error" :
        normalizedStatus === "verification_success" ? "success" :
        normalizedStatus === "verifying" ? "warning" : "neutral"
      }`;
    }

    if (elements.progressExtraMessage) {
      elements.progressExtraMessage.textContent = normalizedStatus === "verification_failed" && extraMessage ?
        `失敗原因：${utils.truncateMessage(extraMessage)}` : utils.truncateMessage(extraMessage);
    }

    currentProgressStatus = normalizedStatus;
  }

  // === WebSocket 處理 ===
  function handleTranscriptPayload(payload) {
    if (!elements.realtimeLog) return;
    const text = payload?.text || payload?.transcript || "";
    if (!text) return;

    const sessionId = payload?.session_id;
    if (sessionId && realtimeState.currentSessionId && sessionId !== realtimeState.currentSessionId) {
      elements.realtimeLog.innerHTML = "";
      realtimeState.isFirstMessage = true;
    }

    if (sessionId) realtimeState.currentSessionId = sessionId;
    if (realtimeState.isFirstMessage) {
      elements.realtimeLog.innerHTML = "";
      realtimeState.isFirstMessage = false;
    }

    const p = document.createElement("p");
    p.textContent = text;
    p.style.cssText = "opacity: 0; transform: translateX(-20px); transition: all 0.3s ease";
    elements.realtimeLog.appendChild(p);

    setTimeout(() => {
      p.style.cssText = "opacity: 1; transform: translateX(0); transition: all 0.3s ease";
    }, 10);

    elements.realtimeLog.scrollTop = elements.realtimeLog.scrollHeight;
  }

  function handleStatusPayload(payload) {
    if (!payload?.status) return;

    const { status } = payload;
    const sessionId = payload.session_id || null;
    const extra = payload.extra || {};

    if (["recording_started", "call_in_progress", "call_ended"].includes(status) && sessionId) {
      if (progressSessionId && progressSessionId !== sessionId) resetProgressVisuals();
      realtimeState.currentSessionId = sessionId;
      realtimeState.isFirstMessage = true;
    }

    updateProgress(status, sessionId, extra);

    if (status === "waiting_for_call") {
      realtimeState.currentSessionId = null;
      realtimeState.isFirstMessage = true;
    }
  }

  function connectRealtimeMonitoring() {
    if (realtimeSocket?.readyState === WebSocket.OPEN) return;

    if (elements.realtimeLog) {
      elements.realtimeLog.innerHTML = "<p><i>目前等待通話開始...</i></p>";
    }
    resetProgressVisuals();
    realtimeState = { isFirstMessage: true, currentSessionId: null };

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/current-transcription`;
    realtimeSocket = new WebSocket(wsUrl);

    realtimeSocket.onopen = () => {
      if (elements.progressExtraMessage) elements.progressExtraMessage.textContent = "";
      if (elements.progressContainer) {
        elements.progressContainer.style.borderColor = "var(--success)";
        setTimeout(() => elements.progressContainer.style.borderColor = "", 2000);
      }
      utils.showNotification("即時監控連線已建立", "success");
    };

    realtimeSocket.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        handleTranscriptPayload({ text: event.data });
        return;
      }

      if (!payload || typeof payload !== "object") return;

      if (payload.type === "transcript") handleTranscriptPayload(payload);
      else if (payload.type === "status") handleStatusPayload(payload);
    };

    realtimeSocket.onclose = () => {
      updateProgress("waiting_for_call", null, {
        message: "即時連線已結束，可稍後重新整理或保持此頁以等待重連。"
      });

      if (elements.realtimeLog) {
        elements.realtimeLog.innerHTML = "<p><i>連線中斷，請稍候或重新整理頁面以重新啟動監控。</i></p>";
      }

      realtimeState = { isFirstMessage: true, currentSessionId: null };
      realtimeSocket = null;

      if (elements.progressContainer) {
        elements.progressContainer.style.borderColor = "var(--danger)";
        setTimeout(() => elements.progressContainer.style.borderColor = "", 3000);
      }

      utils.showNotification("即時監控連線中斷", "error");
    };

    realtimeSocket.onerror = () => {
      if (elements.progressExtraMessage) {
        elements.progressExtraMessage.textContent = "連線發生異常，系統稍後會再次嘗試。";
      }
      if (elements.realtimeLog) {
        elements.realtimeLog.innerHTML += "<p><em>監控連線異常，請確認伺服器狀態後再試。</em></p>";
      }
      utils.showNotification("即時監控發生錯誤", "error");
    };
  }

  // === 視圖管理 ===
  function switchView(viewName) {
    const historicalReportsTab = document.getElementById("historical-reports");
    if (!historicalReportsTab) return;

    if (viewName === "list") {
      historicalReportsTab.style.display = "block";
      if (elements.listView) elements.listView.style.display = "block";
      elements.detailView.classList.add("hidden");
    } else {
      historicalReportsTab.style.display = "block";
      if (elements.listView) elements.listView.style.display = "none";
      elements.detailView.classList.remove("hidden");
    }
  }

  function renderListItems(ulElement, items) {
    if (!ulElement) return;
    ulElement.innerHTML = "";
    if (items?.length) {
      items.forEach(item => {
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

  function renderReportsList(reports) {
    if (!elements.reportsTbody) return;
    elements.reportsTbody.innerHTML = "";

    if (!reports?.length) {
      if (elements.noReportsMessage) {
        elements.noReportsMessage.classList.remove("hidden");
        utils.addFadeInAnimation(elements.noReportsMessage);
      }
      return;
    }

    if (elements.noReportsMessage) elements.noReportsMessage.classList.add("hidden");

    reports
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .forEach((report, index) => {
        const tr = document.createElement("tr");
        const scoreValue = report?.llm_analysis?.accuracy_score;
        const hasScore = typeof scoreValue === "number" && !Number.isNaN(scoreValue);
        const score = hasScore ? scoreValue.toFixed(1) : "--";
        const scoreClass = hasScore ? utils.getScoreClass(scoreValue) : "";
        const status = (report.status || "").toLowerCase();
        const statusLabel = STATUS_LABELS[status] || report.status || "--";
        const dateSource = report.completed_at || report.created_at;
        const formattedDate = dateSource ?
          new Date(dateSource).toLocaleString("zh-TW", { hour12: false }) : "--";

        tr.innerHTML = `
          <td>${report.report_id ? `${report.report_id.slice(0, 12)}…` : "--"}</td>
          <td>${report.call_session_id || "--"}</td>
          <td><span class="status-badge ${utils.getStatusClass(status)}">${statusLabel}</span></td>
          <td class="score ${scoreClass}">${score}</td>
          <td>${formattedDate}</td>
          <td>
            <button class="btn btn-primary" data-report-id="${report.report_id}" ${status !== "success" ? "disabled" : ""}>
              檢視詳情
            </button>
          </td>
        `;

        elements.reportsTbody.appendChild(tr);
        utils.addFadeInAnimation(tr, index * 50);
      });
  }

  function populateDetailView(report) {
    if (!report) return;

    elements.detailReportId.textContent = report.report_id || "--";
    elements.detailSessionId.textContent = report.call_session_id || "--";

    if (report.llm_analysis) {
      const score = report.llm_analysis.accuracy_score;
      if (typeof score === "number" && !Number.isNaN(score)) {
        elements.detailAccuracyScore.textContent = score.toFixed(1);
        elements.detailAccuracyScore.className = `score-badge ${utils.getScoreClass(score)}`;
      } else {
        elements.detailAccuracyScore.textContent = "--";
        elements.detailAccuracyScore.className = "score-badge score-medium";
      }

      elements.detailSummary.textContent = report.llm_analysis.summary || "";
      elements.detailReasoning.textContent = report.llm_analysis.reasoning || "";
      renderListItems(elements.detailKeyDifferences, report.llm_analysis.key_differences);
      renderListItems(elements.detailSuggestions, report.llm_analysis.suggestions);
    } else {
      elements.detailAccuracyScore.textContent = "--";
      elements.detailAccuracyScore.className = "score-badge score-medium";
      elements.detailSummary.textContent = "尚未取得分析摘要";
      elements.detailReasoning.textContent = "";
      renderListItems(elements.detailKeyDifferences, []);
      renderListItems(elements.detailSuggestions, []);
    }

    elements.recordingAudioPlayer.src = report.recording_file_url || "";
    elements.monitoringAudioPlayer.src = report.monitoring_file_path || "";
    elements.recordingTranscript.textContent = report.recording_stt_result?.transcript || "暫無逐字稿";
    elements.monitoringTranscript.textContent = report.monitoring_stt_result?.transcript || "暫無逐字稿";

    switchView("detail");

    const cards = elements.detailView.querySelectorAll(".card");
    cards.forEach((card, index) => utils.addFadeInAnimation(card, index * 100));

    utils.showNotification("報告詳情載入完成", "success");
  }

  // === API 調用 ===
  async function fetchAllReports(options = {}) {
    const { showLoading = false } = options;
    let restoreLabel = null;
    let showFailureState = false;

    if (showLoading && elements.refreshReportsBtn) {
      const defaultLabel = elements.refreshReportsBtn.dataset.defaultLabel ||
                           elements.refreshReportsBtn.textContent.trim() || "重新整理";
      elements.refreshReportsBtn.dataset.defaultLabel = defaultLabel;
      restoreLabel = defaultLabel;
      elements.refreshReportsBtn.disabled = true;
      elements.refreshReportsBtn.textContent = "同步中…";
    }

    try {
      const response = await fetch(`${API_BASE_URL}/reports`);
      if (!response.ok) throw new Error("載入歷史報告失敗");
      const reports = await response.json();
      renderReportsList(reports);
    } catch (error) {
      console.error(error);
      if (elements.noReportsMessage) {
        elements.noReportsMessage.classList.remove("hidden");
        elements.noReportsMessage.querySelector("p").textContent = "無法取得歷史報告，請稍後再試。";
      }
      if (showLoading && elements.refreshReportsBtn) {
        elements.refreshReportsBtn.textContent = "重新整理失敗";
        showFailureState = true;
      }
    } finally {
      if (showLoading && elements.refreshReportsBtn) {
        const defaultLabel = restoreLabel || elements.refreshReportsBtn.dataset.defaultLabel || "重新整理";
        const finish = () => {
          elements.refreshReportsBtn.textContent = defaultLabel;
          elements.refreshReportsBtn.disabled = false;
        };
        showFailureState ? setTimeout(finish, 1200) : finish();
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

  // === 事件監聽器 ===
  elements.tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      elements.tabButtons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      const targetTabId = button.dataset.tab;
      elements.tabContents.forEach(content => content.style.display = "none");
      elements.detailView.classList.add("hidden");

      const targetTab = document.getElementById(targetTabId);
      if (targetTab) {
        targetTab.style.display = "block";
        utils.addFadeInAnimation(targetTab);
      }

      if (targetTabId === "historical-reports" && elements.listView) {
        elements.listView.style.display = "block";
      }

      if (targetTabId === "realtime-monitoring") {
        connectRealtimeMonitoring();
        utils.showNotification("已切換至即時監控", "success");
      } else if (realtimeSocket) {
        realtimeSocket.close();
      }
    });
  });

  elements.reportsTbody.addEventListener("click", event => {
    const target = event.target;
    if (target.matches("button[data-report-id]")) {
      fetchReportDetails(target.dataset.reportId);
    }
  });

  elements.backToListBtn.addEventListener("click", () => {
    elements.recordingAudioPlayer.pause();
    elements.monitoringAudioPlayer.pause();
    switchView("list");
  });

  if (elements.refreshReportsBtn) {
    elements.refreshReportsBtn.addEventListener("click", () => {
      fetchAllReports({ showLoading: true });
    });
  }

  if (elements.resetProgressBtn) {
    elements.resetProgressBtn.addEventListener("click", async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/reset-progress`, { method: "POST" });
        if (response.ok) {
          utils.showNotification("進度條已重置", "success");
        } else {
          throw new Error("重置失敗");
        }
      } catch (error) {
        console.error(error);
        utils.showNotification("重置進度條失敗", "error");
      }
    });
  }

  document.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case "1":
          event.preventDefault();
          elements.tabButtons[0]?.click();
          break;
        case "2":
          event.preventDefault();
          elements.tabButtons[1]?.click();
          break;
        case "r":
          event.preventDefault();
          elements.refreshReportsBtn?.click();
          utils.showNotification("已重新整理歷史報告", "info");
          break;
      }
    }
  });

  // === 初始化 ===
  resetProgressVisuals();
  connectRealtimeMonitoring();
  fetchAllReports();
  setInterval(fetchAllReports, 30000);

  // 處理畫布大小調整
  if (elements.progressCanvas) {
    const resizeObserver = new ResizeObserver(() => {
      drawProgressFlow(currentProgressStatus, elements.progressContainer?.classList.contains('has-error'));
    });
    resizeObserver.observe(elements.progressCanvas);
    setTimeout(() => drawProgressFlow("waiting_for_call", false), 100);
  }

  setTimeout(() => {
    utils.showNotification("錄音檔檢核平台 - 儀表板已就緒", "success");
  }, 900);
});