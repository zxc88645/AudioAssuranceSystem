/**
 * AudioAssuranceSystem - 通話介面主應用程式邏輯
 */
document.addEventListener("DOMContentLoaded", () => {
  // --- DOM 元素獲取 (維持不變) ---
  const setupSection = document.getElementById("setup-section");
  const callSection = document.getElementById("call-section");
  const incomingCallSection = document.getElementById("incoming-call-section");
  const roomIdInput = document.getElementById("roomId");
  const clientIdInput = document.getElementById("clientId");
  const joinBtn = document.getElementById("join-btn");
  const callBtn = document.getElementById("call-btn");
  const hangupBtn = document.getElementById("hangup-btn");
  const answerBtn = document.getElementById("answer-btn");
  const declineBtn = document.getElementById("decline-btn");
  const statusDisplay = document.getElementById("status-display");
  const remoteAudio = document.getElementById("remote-audio");
  const displayRoomId = document.getElementById("display-room-id");
  const displayClientId = document.getElementById("display-client-id");
  const callerIdDisplay = document.getElementById("caller-id");
  const callStatusDisplay = document.getElementById("call-status");

  // --- 應用程式狀態變數 (維持不變) ---
  let webrtcClient = null;
  let webSocketStreamer = null;
  let roomId = "";
  let clientId = "";
  let pendingOffer = null;

  // --- UI 更新函式 (維持不變) ---
  function logStatus(message) {
    const timestamp = new Date().toLocaleTimeString();
    statusDisplay.innerHTML =
      `[${timestamp}] ${message}\n` + statusDisplay.innerHTML;
    console.log(`[Status] ${message}`);
  }

  function updateCallStatus(status, text) {
    callStatusDisplay.textContent = text;
    callStatusDisplay.className = status;
  }

  function showIncomingCallUI(callerId) {
    callerIdDisplay.textContent = callerId || "未知用戶";
    setupSection.classList.add("hidden");
    callSection.classList.add("hidden");
    incomingCallSection.classList.remove("hidden");
  }

  function hideIncomingCallUI() {
    incomingCallSection.classList.add("hidden");
  }

  function showActiveCallUI() {
    hideIncomingCallUI();
    setupSection.classList.add("hidden");
    callSection.classList.remove("hidden");
    hangupBtn.disabled = false;
    callBtn.disabled = true;
  }

  function resetUI() {
    setupSection.classList.remove("hidden");
    callSection.classList.add("hidden");
    hideIncomingCallUI();
    callBtn.disabled = true;
    hangupBtn.disabled = true;
    joinBtn.disabled = false;
    remoteAudio.srcObject = null;
    updateCallStatus("waiting", "等待中...");
    logStatus("已重設介面，請重新加入房間。");
  }

  // --- 事件處理函式 ---

  function handleJoinRoom() {
    roomId = roomIdInput.value.trim();
    clientId = clientIdInput.value.trim();
    if (!roomId || !clientId) {
      alert("房間 ID 和您的 ID 均不可為空");
      return;
    }

    joinBtn.disabled = true;
    logStatus("正在嘗試加入房間...");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const signalingUrl = `${protocol}//${host}/ws/signaling/${roomId}/${clientId}`;

    const eventHandlers = {
      onReady: () => {
        logStatus(`成功加入房間 [${roomId}]`);
        displayRoomId.textContent = roomId;
        displayClientId.textContent = clientId;
        callSection.classList.remove("hidden");
        setupSection.classList.add("hidden");
        hangupBtn.disabled = false;
      },
      onPeerJoined: (peerId) => {
        logStatus(`對等方 [${peerId}] 已加入房間，可以發起通話`);
        callBtn.disabled = false;
      },
      onPeerLeft: (peerId) => {
        logStatus(`對等方 [${peerId}] 已離開房間`);
        handleHangup();
      },
      onOffer: (offerMessage, fromId) => {
        pendingOffer = offerMessage;
        logStatus(`收到來自 [${fromId}] 的通話請求`);
        showIncomingCallUI(fromId);
      },

      // --- *** 核心修改處 *** ---
      onRemoteStream: (stream) => {
        logStatus("收到遠端音訊串流，通話已連接！");
        updateCallStatus("active", "通話中");

        if (remoteAudio.srcObject !== stream) {
          remoteAudio.srcObject = stream;
        }

        // 嘗試播放音訊，並處理瀏覽器可能的回絕
        const playPromise = remoteAudio.play();
        if (playPromise !== undefined) {
          playPromise
            .then((_) => {
              logStatus("遠端音訊已成功播放。");
            })
            .catch((error) => {
              console.error("自動播放失敗:", error);
              logStatus("警告：瀏覽器阻止了音訊自動播放。請手動點擊播放按鈕。");
              // 您可以在此處顯示一個 UI 提示，讓使用者手動點擊
            });
        }
      },
      // --- *** 修改結束 *** ---

      onError: (errorMessage) => {
        logStatus(`發生錯誤: ${errorMessage}`);
        alert(`發生錯誤: ${errorMessage}`);
        resetUI();
      },
    };

    webrtcClient = new WebRTCClient(signalingUrl, eventHandlers);
    webrtcClient.connect();
  }

  // --- (其他 handle... 函式與 startStreaming 函式維持不變) ---
  async function handleStartCall() {
    if (!webrtcClient) return;
    callBtn.disabled = true;
    updateCallStatus("calling", "撥號中...");
    logStatus("--- 發起通話流程 ---");
    try {
      webrtcClient.createPeerConnection();
      const localStream = await webrtcClient.startLocalStream();
      webrtcClient.addLocalStreamToConnection();
      await webrtcClient.createOffer();
      startStreaming(localStream);
    } catch (error) {
      logStatus(`發起通話失敗: ${error.message}`);
      updateCallStatus("waiting", "發起失敗");
      callBtn.disabled = false;
    }
  }

  async function handleAnswerCall() {
    if (!webrtcClient || !pendingOffer) return;
    hideIncomingCallUI();
    showActiveCallUI();
    updateCallStatus("calling", "連接中...");
    logStatus("--- 接聽通話流程 ---");
    try {
      webrtcClient.createPeerConnection();
      const localStream = await webrtcClient.startLocalStream();
      webrtcClient.addLocalStreamToConnection();
      await webrtcClient.createAnswer(pendingOffer);
      startStreaming(localStream);
      pendingOffer = null;
    } catch (error) {
      logStatus(`回覆通話失敗: ${error.message}`);
      updateCallStatus("waiting", "接聽失敗");
    }
  }

  function handleDeclineCall() {
    logStatus("已拒絕來電");
    hideIncomingCallUI();
    pendingOffer = null;
  }

  function handleHangup() {
    if (webSocketStreamer) {
      webSocketStreamer.stop();
      webSocketStreamer = null;
    }
    if (webrtcClient) {
      webrtcClient.closeConnection();
    }
    webrtcClient = null;
    resetUI();
  }

  function startStreaming(stream) {
    logStatus("正在準備將音訊串流到後端...");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const endpoints = {
      recordingUrl: `${protocol}//${host}/ws/recording/${roomId}/${clientId}`,
      monitoringUrl: `${protocol}//${host}/ws/monitoring/${roomId}/${clientId}`,
    };
    webSocketStreamer = new WebSocketStreamer(stream, endpoints);
    webSocketStreamer.start();
  }

  // --- 綁定事件監聽器 (維持不變) ---
  joinBtn.addEventListener("click", handleJoinRoom);
  callBtn.addEventListener("click", handleStartCall);
  answerBtn.addEventListener("click", handleAnswerCall);
  declineBtn.addEventListener("click", handleDeclineCall);
  hangupBtn.addEventListener("click", handleHangup);
});
