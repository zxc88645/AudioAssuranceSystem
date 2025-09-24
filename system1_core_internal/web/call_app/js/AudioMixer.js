/**
 * AudioAssuranceSystem - Web Audio API 混音器
 */
class AudioMixer {
  constructor() {
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    this.destination = this.audioContext.createMediaStreamDestination();
    this.sources = [];
    console.log("[AudioMixer] 混音器已初始化");
  }

  addStream(stream) {
    if (!stream || !stream.getAudioTracks().length) {
      console.warn("[AudioMixer] 嘗試加入無效或無音訊軌道的串流");
      return;
    }
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.destination);
    this.sources.push(source);
    console.log(
      `[AudioMixer] 已成功加入一個音訊流，目前共 ${this.sources.length} 個來源。`
    );
  }

  getMixedStream() {
    return this.destination.stream;
  }

  close() {
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().then(() => {
        console.log("[AudioMixer] 音訊上下文已成功關閉");
      });
    }
  }
}
