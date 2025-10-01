/**
 * AudioAssuranceSystem - 通話介面主控腳本
 */
document.addEventListener("DOMContentLoaded", () => {
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
  const recordingIndicator = document.getElementById("recording-indicator");
  const clearLogBtn = document.getElementById("clear-log-btn");

  const STATUS_CLASS_MAP = {
    waiting: "status-chip status-chip-info",
    calling: "status-chip status-chip-warning",
    active: "status-chip status-chip-success",
    error: "status-chip status-chip-error",
  };

  let webrtcClient = null;
  let webSocketStreamer = null;
  let audioMixer = null;
  let roomId = "";
  let clientId = "";
  let pendingOffer = null;
  let localStream = null;

  function logStatus(message) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement("p");
    entry.innerHTML = `<strong>${timestamp}</strong> ${message}`;
    statusDisplay.appendChild(entry);
    statusDisplay.scrollTop = statusDisplay.scrollHeight;
  }

  function clearStatusLog(showHint = true) {
    statusDisplay.innerHTML = "";
    if (showHint) {
      logStatus("紀錄已清除，新的事件會顯示於此。");
    }
  }

  function resetStatusLog() {
    clearStatusLog(false);
    logStatus("請輸入房間與客戶端 ID 後加入測試房間。");
  }

  function updateCallStatus(stateKey, text) {
    const normalizedKey = STATUS_CLASS_MAP[stateKey] ? stateKey : "waiting";
    callStatusDisplay.textContent = text;
    callStatusDisplay.className = STATUS_CLASS_MAP[normalizedKey];
  }

  function showIncomingCallUI(callerId) {
    callerIdDisplay.textContent = callerId || "未知來電";
    setupSection.classList.add("hidden");
    callSection.classList.add("hidden");
    incomingCallSection.classList.remove("hidden");
    updateCallStatus("calling", "對方來電中");
    logStatus(`收到來電，來源：<code>${callerId || "未知"}</code>`);
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
    updateCallStatus("waiting", "等待中");
    recordingIndicator.classList.add("hidden");
    logStatus("請重新加入房間以繼續測試。");
  }

  function handleJoinRoom() {
    roomId = roomIdInput.value.trim();
    clientId = clientIdInput.value.trim();
    if (!roomId || !clientId) {
      alert("房間 ID 與客戶端 ID 不可留空。");
      return;
    }

    joinBtn.disabled = true;

    const signalingUrl = `${
      window.location.protocol === "https:" ? "wss:" : "ws:"
    }//${window.location.host}/ws/signaling/${roomId}/${clientId}`;

    webrtcClient = new WebRTCClient(signalingUrl, {
      onReady: () => {
        logStatus(`成功加入房間 <code>${roomId}</code>`);
        displayRoomId.textContent = roomId;
        displayClientId.textContent = clientId;
        callSection.classList.remove("hidden");
        setupSection.classList.add("hidden");
        hangupBtn.disabled = false;
        updateCallStatus("waiting", "已加入，等待對方");
      },
      onPeerJoined: (peerId) => {
        logStatus(`對端 <code>${peerId}</code> 已加入，可發起通話。`);
        callBtn.disabled = false;
      },
      onPeerLeft: (peerId) => {
        logStatus(`對端 <code>${peerId}</code> 已離線。`);
        handleHangup();
      },
      onOffer: (offer, fromId) => {
        pendingOffer = offer;
        showIncomingCallUI(fromId);
      },
      onRemoteStream: (remoteStream) => {
        logStatus("收到遠端音訊串流，通話開始。");
        updateCallStatus("active", "通話中");
        recordingIndicator.classList.remove("hidden");
        if (remoteAudio.srcObject !== remoteStream) {
          remoteAudio.srcObject = remoteStream;
          remoteAudio.play().catch(() =>
            console.warn("自動播放被瀏覽器阻擋。")
          );
        }
        if (localStream && remoteStream) {
          logStatus("混音本地與遠端音訊，準備送往錄音管線。");
          audioMixer = new AudioMixer();
          audioMixer.addStream(localStream);
          audioMixer.addStream(remoteStream);
          startStreaming(audioMixer.getMixedStream());
        }
      },
      onError: (error) => {
        logStatus(`連線發生錯誤：${error}`);
        updateCallStatus("error", "連線錯誤");
        resetUI();
      },
    });

    webrtcClient.connect();
  }

  async function handleStartCall() {
    if (!webrtcClient) return;
    callBtn.disabled = true;
    updateCallStatus("calling", "撥號中");
    logStatus("發起通話，正在建立 WebRTC 連線...");
    try {
      webrtcClient.createPeerConnection();
      localStream = await webrtcClient.startLocalStream();
      webrtcClient.addLocalStreamToConnection();
      await webrtcClient.createOffer();
    } catch (error) {
      logStatus(`發起通話失敗：${error.message}`);
      updateCallStatus("waiting", "發起失敗");
      callBtn.disabled = false;
    }
  }

  async function handleAnswerCall() {
    if (!webrtcClient || !pendingOffer) return;
    hideIncomingCallUI();
    showActiveCallUI();
    updateCallStatus("calling", "連線中");
    logStatus("已接聽來電，開始建立連線。");
    try {
      webrtcClient.createPeerConnection();
      localStream = await webrtcClient.startLocalStream();
      webrtcClient.addLocalStreamToConnection();
      await webrtcClient.createAnswer(pendingOffer);
      pendingOffer = null;
    } catch (error) {
      logStatus(`接聽時發生錯誤：${error.message}`);
      updateCallStatus("error", "接聽失敗");
    }
  }

  function handleDeclineCall() {
    hideIncomingCallUI();
    pendingOffer = null;
    updateCallStatus("waiting", "已婉拒");
    logStatus("已婉拒此次來電。");
  }

  function handleHangup() {
    if (webSocketStreamer) {
      webSocketStreamer.stop();
      webSocketStreamer = null;
    }
    if (audioMixer) {
      audioMixer.close();
      audioMixer = null;
    }
    if (webrtcClient) {
      webrtcClient.closeConnection();
    }
    localStream = null;
    webrtcClient = null;
    logStatus("通話已結束，資源已釋放。");
    resetUI();
  }

  function startStreaming(stream) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const endpoints = {
      recordingUrl: `${protocol}//${window.location.host}/ws/recording/${roomId}/${clientId}`,
      monitoringUrl: `${protocol}//localhost:8005/ws/monitoring/${roomId}/${clientId}`,
      transcriptionUrl: `${protocol}//localhost:8005/ws/transcribe/${roomId}/${clientId}`,
    };
    webSocketStreamer = new WebSocketStreamer(stream, endpoints);
    webSocketStreamer.start();
  }

  joinBtn.addEventListener("click", handleJoinRoom);
  callBtn.addEventListener("click", handleStartCall);
  answerBtn.addEventListener("click", handleAnswerCall);
  declineBtn.addEventListener("click", handleDeclineCall);
  hangupBtn.addEventListener("click", handleHangup);

  if (clearLogBtn) {
    clearLogBtn.addEventListener("click", () => {
      clearStatusLog();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    switch (key) {
      case "j":
        event.preventDefault();
        if (!joinBtn.disabled) {
          handleJoinRoom();
        }
        break;
      case "d":
        event.preventDefault();
        if (!hangupBtn.disabled) {
          handleHangup();
        }
        break;
      case "l":
        event.preventDefault();
        clearStatusLog();
        break;
      default:
        break;
    }
  });

  resetStatusLog();
  updateCallStatus("waiting", "等待中");
});
