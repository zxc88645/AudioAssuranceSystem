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
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      console.warn("[WS Streamer] 串流已在進行中");
      return;
    }

    console.log("[WS Streamer] 準備開始串流...");
    this.sockets = [
      this._createSocket(this.endpoints.recordingUrl, "Recording"),
      this._createSocket(this.endpoints.monitoringUrl, "Monitoring"),
    ];

    Promise.all(this.sockets.map((sw) => sw.connectionPromise))
      .then(() => {
        console.log(
          "[WS Streamer] 所有 WebSocket 已連接，準備啟動 MediaRecorder"
        );

        try {
          const options = { mimeType: "audio/webm;codecs=opus" };
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn(
              `[WS Streamer] 不支援 ${options.mimeType}，嘗試預設選項。`
            );
            delete options.mimeType;
          }
          this.mediaRecorder = new MediaRecorder(this.stream, options);
          console.log(
            `[WS Streamer] MediaRecorder 成功建立，使用 mimeType: ${this.mediaRecorder.mimeType}`
          );

          this.mediaRecorder.onstart = () => {
            console.log(
              "[WS Streamer] MediaRecorder 'start' 事件觸發，狀態:",
              this.mediaRecorder.state
            );
          };

          this.mediaRecorder.ondataavailable = (event) => {
            this.chunkCount++;
            console.log(
              `[WS Streamer] MediaRecorder 'dataavailable' 事件觸發 (第 ${this.chunkCount} 次)，數據大小: ${event.data.size} bytes`
            );

            if (event.data.size > 0) {
              this.sockets.forEach((socketWrapper) => {
                if (socketWrapper.socket.readyState === WebSocket.OPEN) {
                  socketWrapper.socket.send(event.data);
                }
              });
            }
          };

          this.mediaRecorder.onstop = () => {
            console.log(
              `[WS Streamer] MediaRecorder 'stop' 事件觸發，狀態: ${this.mediaRecorder.state}。總共觸發 dataavailable ${this.chunkCount} 次。`
            );
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
    if (
      this.mediaRecorder &&
      (this.mediaRecorder.state === "recording" ||
        this.mediaRecorder.state === "paused")
    ) {
      this.mediaRecorder.stop();
      console.log(
        "[WS Streamer] MediaRecorder 已停止，延遲 500ms 後關閉 WebSocket..."
      );

      // 延遲關閉，給予最後一塊音訊足夠的傳送時間
      setTimeout(() => {
        this.sockets.forEach((socketWrapper) => {
          if (socketWrapper.socket.readyState === WebSocket.OPEN) {
            socketWrapper.socket.close();
          }
        });
        this.sockets = [];
        console.log("[WS Streamer] WebSocket 連線已在延遲後關閉");
      }, 500); // 延遲 500 毫秒
    } else {
      console.warn(
        "[WS Streamer] stop() 被呼叫，但 MediaRecorder 未在錄製中。狀態:",
        this.mediaRecorder ? this.mediaRecorder.state : "null"
      );
      // 如果沒有在錄製，則直接關閉
      this.sockets.forEach((socketWrapper) => {
        if (socketWrapper.socket.readyState === WebSocket.OPEN) {
          socketWrapper.socket.close();
        }
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
          `[WS Streamer] ${name} WebSocket 已關閉. Code: ${event.code}, Reason: ${event.reason}`
        );
      };
    });
    return { socket, connectionPromise };
  }
}
