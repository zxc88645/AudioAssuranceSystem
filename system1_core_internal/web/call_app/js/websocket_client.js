/**
 * AudioAssuranceSystem - WebSocket 音訊串流客戶端
 */
class WebSocketStreamer {
  constructor(stream, endpoints) {
    if (!stream) throw new Error("MediaStream 不可為空");
    if (!endpoints || !endpoints.recordingUrl || !endpoints.monitoringUrl) {
      throw new Error("必須提供錄音和監控的 WebSocket 端點");
    }
    this.stream = stream;
    this.endpoints = endpoints;
    this.mediaRecorder = null;
    this.sockets = [];
    this.timeslice = 250;
    this.chunkCount = 0;
  }

  start() {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") return;

    this.sockets = [
      this._createSocket(this.endpoints.recordingUrl, "Recording"),
      this._createSocket(this.endpoints.monitoringUrl, "Monitoring"),
    ];

    Promise.all(this.sockets.map((sw) => sw.connectionPromise))
      .then(() => {
        try {
          const options = { mimeType: "audio/webm;codecs=opus" };
          this.mediaRecorder = new MediaRecorder(this.stream, options);

          this.mediaRecorder.ondataavailable = (event) => {
            this.chunkCount++;
            if (event.data.size > 0) {
              this.sockets.forEach((socketWrapper) => {
                if (socketWrapper.socket.readyState === WebSocket.OPEN) {
                  socketWrapper.socket.send(event.data);
                }
              });
            }
          };

          this.mediaRecorder.onerror = (event) => {
            console.error(
              "[WS Streamer] MediaRecorder 'error' 事件觸發:",
              event.error
            );
          };

          this.mediaRecorder.start(this.timeslice);
        } catch (e) {
          console.error("[WS Streamer] 建立 MediaRecorder 失敗:", e);
        }
      })
      .catch((error) => {
        console.error("[WS Streamer] 無法建立 WebSocket 連線:", error);
      });
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.onstop = () => {
        const closingDelay = 3000;
        console.log(
          `[WS Streamer] MediaRecorder 'stop' 事件觸發，等待 ${closingDelay}ms 以確保最後的音訊塊已發送...`
        );
        setTimeout(() => {
          this.sockets.forEach((socketWrapper) => {
            if (socketWrapper.socket.readyState === WebSocket.OPEN) {
              socketWrapper.socket.close();
            }
          });
          this.sockets = [];
        }, closingDelay);
      };
      this.mediaRecorder.stop();
    } else {
      this.sockets.forEach((socketWrapper) => {
        if (socketWrapper.socket.readyState === WebSocket.OPEN)
          socketWrapper.socket.close();
      });
      this.sockets = [];
    }
  }

  _createSocket(url, name) {
    const socket = new WebSocket(url);
    socket.binaryType = "blob";
    const connectionPromise = new Promise((resolve, reject) => {
      socket.onopen = () => {
        console.log(`[WS Streamer] ${name} WebSocket 已連接到: ${url}`);
        resolve(socket);
      };
      socket.onerror = (error) => {
        console.error(`[WS Streamer] ${name} WebSocket 發生錯誤:`, error);
        reject(error);
      };
      socket.onclose = (event) => {
        console.log(
          `[WS Streamer] ${name} WebSocket 已關閉. Code: ${event.code}`
        );
      };
    });
    return { socket, connectionPromise };
  }
}
