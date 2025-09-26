/**
 * AudioAssuranceSystem - 通話介面主應用程式邏輯
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

  let webrtcClient = null,
    webSocketStreamer = null,
    audioMixer = null;
  let roomId = "",
    clientId = "",
    pendingOffer = null,
    localStream = null;

  function logStatus(message) {
    const timestamp = new Date().toLocaleTimeString();
    statusDisplay.innerHTML =
      `[${timestamp}] ${message}\n` + statusDisplay.innerHTML;
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
    recordingIndicator.classList.add("hidden");
  }

  function handleJoinRoom() {
    roomId = roomIdInput.value.trim();
    clientId = clientIdInput.value.trim();
    if (!roomId || !clientId) return alert("房間 ID 和您的 ID 均不可為空");
    joinBtn.disabled = true;

    const signalingUrl = `${
      window.location.protocol === "https:" ? "wss:" : "ws:"
    }//${window.location.host}/ws/signaling/${roomId}/${clientId}`;

    webrtcClient = new WebRTCClient(signalingUrl, {
      onReady: () => {
        logStatus(`成功加入房間 [${roomId}]`);
        displayRoomId.textContent = roomId;
        displayClientId.textContent = clientId;
        callSection.classList.remove("hidden");
        setupSection.classList.add("hidden");
        hangupBtn.disabled = false;
      },
      onPeerJoined: (peerId) => {
        logStatus(`對等方 [${peerId}] 已加入，可以發起通話`);
        callBtn.disabled = false;
      },
      onPeerLeft: (peerId) => {
        logStatus(`對等方 [${peerId}] 已離開`);
        handleHangup();
      },
      onOffer: (offer, fromId) => {
        pendingOffer = offer;
        showIncomingCallUI(fromId);
      },
      onRemoteStream: (remoteStream) => {
        logStatus("收到遠端音訊串流，通話已連接！");
        updateCallStatus("active", "通話中");
        recordingIndicator.classList.remove("hidden");
        if (remoteAudio.srcObject !== remoteStream) {
          remoteAudio.srcObject = remoteStream;
          remoteAudio.play().catch((e) => console.warn("音訊自動播放被阻止"));
        }
        if (localStream && remoteStream) {
          logStatus("本地與遠端音訊均已就緒，開始數位混合並錄製...");
          audioMixer = new AudioMixer();
          audioMixer.addStream(localStream);
          audioMixer.addStream(remoteStream);
          startStreaming(audioMixer.getMixedStream());
        }
      },
      onError: (error) => {
        logStatus(`發生錯誤: ${error}`);
        resetUI();
      },
    });
    webrtcClient.connect();
  }

  async function handleStartCall() {
    if (!webrtcClient) return;
    callBtn.disabled = true;
    updateCallStatus("calling", "撥號中...");
    try {
      webrtcClient.createPeerConnection();
      localStream = await webrtcClient.startLocalStream();
      webrtcClient.addLocalStreamToConnection();
      await webrtcClient.createOffer();
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
    try {
      webrtcClient.createPeerConnection();
      localStream = await webrtcClient.startLocalStream();
      webrtcClient.addLocalStreamToConnection();
      await webrtcClient.createAnswer(pendingOffer);
      pendingOffer = null;
    } catch (error) {
      logStatus(`回覆通話失敗: ${error.message}`);
    }
  }

  function handleDeclineCall() {
    hideIncomingCallUI();
    pendingOffer = null;
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
});
