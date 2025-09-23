/**
 * AudioAssuranceSystem - WebRTC 客戶端處理器
 *
 * 這個類別封裝了所有與 WebRTC 相關的複雜邏輯，包括：
 * 1. 連接到信令伺服器。
 * 2. 建立和管理 RTCPeerConnection。
 * 3. 處理信令訊息 (offer, answer, ice-candidate)。
 * 4. 管理本地和遠端的音訊媒體串流。
 */
class WebRTCClient {
  /**
   * @param {string} signalingServerUrl - 信令伺服器的 WebSocket URL
   * @param {object} eventHandlers - 用於處理各種事件的回呼函式物件
   * @param {function} eventHandlers.onReady - 當信令伺服器連接成功時呼叫
   * @param {function} eventHandlers.onPeerJoined - 當有新成員加入房間時呼叫
   * @param {function} eventHandlers.onOffer - 當收到 offer 時呼叫，並將發送者 ID 傳遞出去
   * @param {function} eventHandlers.onPeerLeft - 當有成員離開房間時呼叫
   * @param {function} eventHandlers.onRemoteStream - 當收到遠端音訊串流時呼叫
   * @param {function} eventHandlers.onError - 當發生錯誤時呼叫
   */
  constructor(signalingServerUrl, eventHandlers) {
    this.signalingServerUrl = signalingServerUrl;
    this.eventHandlers = eventHandlers;
    this.ws = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;

    this.iceServers = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "guest",
          credential: "guest",
        },
      ],
    };
  }

  /**
   * 初始化並連接到信令伺服器
   */
  connect() {
    console.log(`[WebRTC] 正在連接到信令伺服器: ${this.signalingServerUrl}`);
    this.ws = new WebSocket(this.signalingServerUrl);

    this.ws.onopen = () => {
      console.log("[WebRTC] 信令伺服器已連接");
      if (this.eventHandlers.onReady) this.eventHandlers.onReady();
    };

    this.ws.onmessage = (message) => {
      const data = JSON.parse(message.data);
      console.log("[WebRTC] 收到信令訊息:", data);
      this.handleSignalingMessage(data);
    };

    this.ws.onclose = () => console.log("[WebRTC] 與信令伺服器的連線已關閉");

    this.ws.onerror = (error) => {
      console.error("[WebRTC] 信令伺服器發生錯誤:", error);
      if (this.eventHandlers.onError)
        this.eventHandlers.onError("無法連接到信令伺服器");
    };
  }

  /**
   * 處理從信令伺服器收到的訊息
   */
  handleSignalingMessage(message) {
    // 信令訊息現在應包含 'from' 欄位，以識別發送者
    const fromId = message.from;

    switch (message.type) {
      case "peer_joined":
        if (this.eventHandlers.onPeerJoined)
          this.eventHandlers.onPeerJoined(message.peer_id);
        break;
      case "offer":
        if (this.eventHandlers.onOffer)
          this.eventHandlers.onOffer(message, fromId);
        break;
      case "answer":
        this.handleAnswer(message);
        break;
      case "ice-candidate":
        this.addIceCandidate(message);
        break;
      case "peer_left":
        if (this.eventHandlers.onPeerLeft)
          this.eventHandlers.onPeerLeft(message.peer_id);
        this.closeConnection();
        break;
      default:
        console.warn("[WebRTC] 未知的信令訊息類型:", message.type);
    }
  }

  /**
   * 發送訊息到信令伺服器
   */
  sendSignalingMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error("[WebRTC] 信令伺服器未連接，無法發送訊息");
    }
  }

  /**
   * 創建 RTCPeerConnection，只負責建立連線物件和設定事件監聽
   */
  createPeerConnection() {
    if (this.peerConnection) return;

    this.peerConnection = new RTCPeerConnection(this.iceServers);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: "ice-candidate",
          candidate: event.candidate,
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.log("[WebRTC] 收到遠端音訊軌道");
      this.remoteStream = event.streams[0];
      if (this.eventHandlers.onRemoteStream) {
        this.eventHandlers.onRemoteStream(this.remoteStream);
      }
    };
  }

  /**
   * 一個專門用於將本地串流加入到連線中的方法
   */
  addLocalStreamToConnection() {
    if (this.localStream && this.peerConnection) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      console.log("[WebRTC] 已將本地音訊軌道加入 PeerConnection");
    } else {
      console.warn(
        "[WebRTC] 無法加入本地串流：localStream 或 peerConnection 不存在"
      );
    }
  }

  /**
   * 開始獲取本地麥克風音訊
   */
  async startLocalStream() {
    try {
      if (this.localStream) return this.localStream;
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      console.log("[WebRTC] 成功獲取本地麥克風音訊");
      return this.localStream;
    } catch (error) {
      console.error("[WebRTC] 獲取麥克風音訊失敗:", error);
      if (this.eventHandlers.onError)
        this.eventHandlers.onError("無法獲取麥克風權限，請檢查設定");
      throw error;
    }
  }

  /**
   * 發起方：建立並發送 Offer
   */
  async createOffer() {
    if (!this.peerConnection) {
      console.error("[WebRTC] createOffer 失敗: peerConnection 不存在");
      return;
    }
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    console.log("[WebRTC] 建立 Offer 並發送");
    this.sendSignalingMessage({ type: "offer", sdp: offer });
  }

  /**
   * 接收方：收到 Offer 後，建立並發送 Answer
   */
  async createAnswer(offerMessage) {
    if (!this.peerConnection) {
      console.error("[WebRTC] createAnswer 失敗: peerConnection 不存在");
      return;
    }
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(offerMessage.sdp)
    );
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    console.log("[WebRTC] 建立 Answer 並發送");
    this.sendSignalingMessage({ type: "answer", sdp: answer });
  }

  /**
   * 發起方：收到 Answer 後的處理
   */
  async handleAnswer(answerMessage) {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answerMessage.sdp)
      );
      console.log("[WebRTC] 成功設定遠端描述 (Answer)");
    }
  }

  /**
   * 將收到的 ICE candidate 加入到 PeerConnection 中
   */
  async addIceCandidate(candidateMessage) {
    if (this.peerConnection && candidateMessage.candidate) {
      try {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidateMessage.candidate)
        );
      } catch (error) {
        console.error("[WebRTC] 添加 ICE candidate 失敗:", error);
      }
    }
  }

  /**
   * 關閉所有連線並清理資源
   */
  closeConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log("[WebRTC] 所有連線已關閉");
  }
}
