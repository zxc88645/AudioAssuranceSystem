document.addEventListener("DOMContentLoaded", () => {
  const API_ENDPOINT = "/api/recordings";

  const recordingsTbody = document.getElementById("recordings-tbody");
  const noDataMessage = document.getElementById("no-data-message");
  const searchInput = document.getElementById("search-input");
  const audioPlayer = document.getElementById("audio-player");
  const currentPlayingFile = document.getElementById("current-playing-file");
  const defaultPlayerLabel = currentPlayingFile.textContent;

  let allRecordings = [];
  let currentPlayingRow = null;
  let currentFilePath = "";

  function formatDuration(totalSeconds) {
    if (Number.isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function formatFileSize(bytes) {
    if (Number.isNaN(bytes) || bytes <= 0) return "0 B";
    const base = 1024;
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
    const value = bytes / Math.pow(base, exponent);
    return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 2)} ${units[exponent]}`;
  }

  function formatDateTime(isoString) {
    if (!isoString) return "--";
    try {
      return new Date(isoString).toLocaleString("zh-TW", { hour12: false });
    } catch (error) {
      console.warn("無法格式化日期：", isoString, error);
      return "--";
    }
  }

  function toRelativePath(permanentPath) {
    if (!permanentPath || typeof permanentPath !== "string") return "";
    const segments = permanentPath.split(/[/\\]+/).filter(Boolean);
    if (segments.length >= 3) {
      return `/${segments.slice(-3).join("/")}`;
    }
    return permanentPath.startsWith("/") ? permanentPath : `/${permanentPath}`;
  }

  function clearPlayingState({ resetLabel = false } = {}) {
    if (currentPlayingRow) {
      currentPlayingRow.classList.remove("is-playing");
      currentPlayingRow = null;
    }
    if (resetLabel) {
      currentFilePath = "";
      currentPlayingFile.textContent = defaultPlayerLabel;
      audioPlayer.pause();
      audioPlayer.removeAttribute("src");
    }
  }

  function renderTable(recordingsData, { filtered = false } = {}) {
    recordingsTbody.innerHTML = "";
    const rows = Array.isArray(recordingsData) ? recordingsData : [];
    const hasData = rows.length > 0;
    clearPlayingState({ resetLabel: !hasData });

    if (!hasData) {
      noDataMessage.classList.remove("hidden");
      const messageParagraph = noDataMessage.querySelector("p");
      if (messageParagraph) {
        messageParagraph.textContent = filtered
          ? "找不到符合的錄音結果，請嘗試其他關鍵字。"
          : "尚未取得錄音資料，請稍後或確認後端服務狀態。";
      }
      return;
    }

    noDataMessage.classList.add("hidden");

    rows.forEach((rec) => {
      const row = document.createElement("tr");
      const relativePath = toRelativePath(rec.permanent_path);
      const participants = Array.isArray(rec.participant_ids)
        ? rec.participant_ids.join(", ")
        : "--";

      row.innerHTML = `
        <td>${rec.call_session_id || "--"}</td>
        <td>${participants}</td>
        <td>${formatDuration(rec.duration_seconds)}</td>
        <td>${formatFileSize(rec.file_size_bytes)}</td>
        <td>${formatDateTime(rec.archived_at || rec.created_at)}</td>
        <td class="actions-cell">
          <button class="play-btn" data-file-path="${relativePath}" type="button">播放</button>
          <a href="${relativePath}" class="download-btn" download>下載</a>
        </td>
      `;

      if (relativePath && relativePath === currentFilePath) {
        row.classList.add("is-playing");
        currentPlayingRow = row;
      }

      recordingsTbody.appendChild(row);
    });
  }

  async function fetchRecordings() {
    try {
      const response = await fetch(API_ENDPOINT);
      if (!response.ok) {
        throw new Error(`HTTP 狀態 ${response.status}`);
      }
      const data = await response.json();
      allRecordings = Array.isArray(data)
        ? data
            .slice()
            .sort(
              (a, b) =>
                new Date(b.archived_at || b.created_at) -
                new Date(a.archived_at || a.created_at)
            )
        : [];
      renderTable(allRecordings);
    } catch (error) {
      console.error("載入錄音清單失敗：", error);
      allRecordings = [];
      renderTable(allRecordings);
    }
  }

  function handleSearch() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      renderTable(allRecordings);
      return;
    }

    const filtered = allRecordings.filter((rec) => {
      const sessionId = (rec.call_session_id || "").toLowerCase();
      const participants = Array.isArray(rec.participant_ids)
        ? rec.participant_ids.join(" ").toLowerCase()
        : "";
      return sessionId.includes(query) || participants.includes(query);
    });

    renderTable(filtered, { filtered: true });
  }

  function handleTableClick(event) {
    const target = event.target;
    if (!target.classList.contains("play-btn")) return;

    const filePath = target.dataset.filePath;
    if (!filePath) return;

    clearPlayingState();
    const row = target.closest("tr");
    if (row) {
      row.classList.add("is-playing");
      currentPlayingRow = row;
    }

    currentFilePath = filePath;
    audioPlayer.src = filePath;
    audioPlayer.play().catch((error) => {
      console.warn("音訊播放被阻擋或失敗：", error);
    });

    currentPlayingFile.textContent = `目前播放：${filePath.split("/").pop()}`;
  }

  audioPlayer.addEventListener("ended", () => clearPlayingState({ resetLabel: true }));

  fetchRecordings();
  searchInput.addEventListener("input", handleSearch);
  recordingsTbody.addEventListener("click", handleTableClick);
});
