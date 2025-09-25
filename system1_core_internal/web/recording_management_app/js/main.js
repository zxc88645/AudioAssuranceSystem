document.addEventListener("DOMContentLoaded", () => {
  const API_ENDPOINT = "/api/recordings";

  const recordingsTbody = document.getElementById("recordings-tbody");
  const noDataMessage = document.getElementById("no-data-message");
  const searchInput = document.getElementById("search-input");
  const audioPlayer = document.getElementById("audio-player");
  const currentPlayingFile = document.getElementById("current-playing-file");

  let allRecordings = []; // 用於儲存所有錄音資料，方便搜尋

  /**
   * 格式化秒數為 mm:ss 格式
   * @param {number} totalSeconds
   * @returns {string}
   */
  function formatDuration(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }

  /**
   * 格式化檔案大小
   * @param {number} bytes
   * @returns {string}
   */
  function formatFileSize(bytes) {
    if (isNaN(bytes) || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * 將 ISO 格式的日期時間字串格式化為本地可讀格式
   * @param {string} isoString
   * @returns {string}
   */
  function formatDateTime(isoString) {
    if (!isoString) return "N/A";
    try {
      return new Date(isoString).toLocaleString();
    } catch (e) {
      return "Invalid Date";
    }
  }

  /**
   * 渲染表格資料
   * @param {Array} recordingsData
   */
  function renderTable(recordingsData) {
    recordingsTbody.innerHTML = ""; // 清空現有內容

    if (!recordingsData || recordingsData.length === 0) {
      noDataMessage.classList.remove("hidden");
      return;
    }
    noDataMessage.classList.add("hidden");

    recordingsData.forEach((rec) => {
      const tr = document.createElement("tr");

      // 從完整的檔案路徑中提取相對路徑
      const filePathParts = rec.permanent_path.split("/");
      const relativePath = `/${filePathParts.slice(-3).join("/")}`;

      tr.innerHTML = `
        <td>${rec.call_session_id}</td>
        <td>${rec.participant_ids.join(", ")}</td>
        <td>${formatDuration(rec.duration_seconds)}</td>
        <td>${formatFileSize(rec.file_size_bytes)}</td>
        <td>${formatDateTime(rec.archived_at)}</td>
        <td class="actions-cell">
          <button class="play-btn" data-file-path="${relativePath}">播放</button>
          <a href="${relativePath}" class="download-btn" download>下載</a>
        </td>
      `;
      recordingsTbody.appendChild(tr);
    });
  }

  /**
   * 從後端獲取錄音資料
   */
  async function fetchRecordings() {
    try {
      const response = await fetch(API_ENDPOINT);
      if (!response.ok) {
        throw new Error(`HTTP 錯誤! 狀態: ${response.status}`);
      }
      const data = await response.json();
      allRecordings = data;
      renderTable(allRecordings);
    } catch (error) {
      console.error("無法獲取錄音資料:", error);
      allRecordings = [];
      renderTable([]); // 顯示無資料訊息
    }
  }

  /**
   * 處理搜尋輸入
   */
  function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
      renderTable(allRecordings);
      return;
    }

    const filteredData = allRecordings.filter((rec) => {
      const sessionIdMatch = rec.call_session_id.toLowerCase().includes(query);
      const participantsMatch = rec.participant_ids.some((id) =>
        id.toLowerCase().includes(query)
      );
      return sessionIdMatch || participantsMatch;
    });

    renderTable(filteredData);
  }

  /**
   * 處理點擊事件 (播放)
   * @param {Event} event
   */
  function handleTableClick(event) {
    if (event.target.classList.contains("play-btn")) {
      const filePath = event.target.dataset.filePath;
      if (filePath) {
        audioPlayer.src = filePath;
        audioPlayer.play();
        currentPlayingFile.textContent = `正在播放: ${filePath
          .split("/")
          .pop()}`;
      }
    }
  }

  // 初始化
  fetchRecordings();
  searchInput.addEventListener("input", handleSearch);
  recordingsTbody.addEventListener("click", handleTableClick);
});
