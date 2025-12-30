function getStorageArea() {
  return chrome.storage.session ?? chrome.storage.local;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function byId(id) {
  return document.getElementById(id);
}

async function main() {
  const errorEl = byId("error");
  const tableWrapEl = byId("tableWrap");
  const titleEl = byId("title");
  const metaEl = byId("meta");
  const downloadEl = byId("download");
  const tbodyEl = byId("tbody");

  const id = decodeURIComponent((location.hash || "").replace(/^#/, "").trim());
  if (!id) {
    errorEl.hidden = false;
    errorEl.textContent = "未找到报告 ID：请从扩展按钮重新生成。";
    downloadEl.hidden = true;
    return;
  }

  const storageArea = getStorageArea();
  const stored = await storageArea.get(id);
  const data = stored?.[id];
  if (!data) {
    errorEl.hidden = false;
    errorEl.textContent = "报告数据已过期或不存在：请从扩展按钮重新生成。";
    downloadEl.hidden = true;
    return;
  }

  await storageArea.remove(id);

  const host = data.currentHost || "(unknown)";
  const count = Number.isFinite(data.externalCount) ? data.externalCount : (data.external?.length ?? 0);
  titleEl.textContent = `外部链接报告：${count} 个（${host}）`;
  metaEl.textContent = `原页面：${data.tabUrl || "未知"}；已在原页面高亮外链。`;

  const blob = new Blob([data.csvString || ""], { type: "text/csv;charset=utf-8;" });
  const blobUrl = URL.createObjectURL(blob);
  downloadEl.href = blobUrl;
  downloadEl.download = data.filename || `External_Links_${host}.csv`;
  window.addEventListener("beforeunload", () => URL.revokeObjectURL(blobUrl), { once: true });

  const rows = Array.isArray(data.external) ? data.external : [];
  const html = rows
    .map((item) => {
      const rel = item?.rel ?? "";
      const tagClass = String(rel).includes("nofollow") ? "tag-nofollow" : "tag-follow";
      return `<tr>
        <td><a href="${escapeHTML(item?.url ?? "")}" target="_blank" rel="noreferrer noopener">${escapeHTML(
          item?.url ?? ""
        )}</a></td>
        <td>${escapeHTML(item?.text ?? "")}</td>
        <td><span class="tag ${tagClass}">${escapeHTML(rel)}</span></td>
        <td>${escapeHTML(item?.target ?? "")}</td>
        <td>${escapeHTML(item?.visible ?? "")}</td>
      </tr>`;
    })
    .join("");

  tbodyEl.innerHTML = html;
  tableWrapEl.hidden = false;
}

main().catch((e) => {
  const errorEl = byId("error");
  const downloadEl = byId("download");
  errorEl.hidden = false;
  errorEl.textContent = e instanceof Error ? e.message : String(e);
  downloadEl.hidden = true;
});

