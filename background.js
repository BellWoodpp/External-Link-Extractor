function getStorageArea() {
  return chrome.storage.session ?? chrome.storage.local;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function runExtraction(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const highlightStyle =
        "outline: 3px solid #ff0000 !important; background: rgba(255, 255, 0, 0.3) !important; color: #000 !important; box-shadow: 0 0 10px rgba(255,0,0,0.5) !important; transition: all 0.3s;";
      const currentHost = window.location.hostname.replace(/^www\./, "");
      const links = document.querySelectorAll("a[href]");
      const external = [];
      const seen = new Set();

      function escapeCSV(str) {
        if (!str) return "";
        let s = String(str).replace(/"/g, '""');
        if (s.search(/("|,|\n|\r)/g) >= 0) s = `"${s}"`;
        return s;
      }

      function isVisible(elem) {
        return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
      }

      const csvRows = ["URL,锚文本/Alt,Rel属性,打开方式,可见性"];

      for (let i = 0; i < links.length; i++) {
        const a = links[i];
        try {
          const url = new URL(a.href, window.location.origin);
          if (!["http:", "https:"].includes(url.protocol)) continue;

          const linkHost = url.hostname.replace(/^www\./, "");
          if (linkHost === currentHost) continue;

          a.style.cssText += highlightStyle;

          let anchorText = (a.innerText || "").trim().replace(/[\r\n]+/g, " ");
          if (!anchorText && a.querySelector("img")) {
            const img = a.querySelector("img");
            anchorText = `[图片] ${img?.alt || "无Alt属性"}`;
          }
          anchorText = anchorText || "[无文字]";

          let rel = a.getAttribute("rel");
          if (rel == null || rel.trim() === "") rel = "dofollow";

          const target = a.getAttribute("target") || "_self";
          const visibility = isVisible(a) ? "可见" : "隐藏/不可见";

          if (!seen.has(url.href)) {
            seen.add(url.href);
            external.push({
              url: url.href,
              text: anchorText,
              rel,
              target,
              visible: visibility
            });
            csvRows.push(
              [escapeCSV(url.href), escapeCSV(anchorText), escapeCSV(rel), escapeCSV(target), escapeCSV(visibility)].join(
                ","
              )
            );
          }
        } catch {
          // ignore
        }
      }

      const csvString = "\uFEFF" + csvRows.join("\n");
      const filename = `External_Links_${currentHost}.csv`;

      return {
        currentHost,
        externalCount: external.length,
        external,
        csvString,
        filename
      };
    }
  });

  return result;
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab?.id) return;

    const data = await runExtraction(tab.id);
    const id = createId();

    const storageArea = getStorageArea();
    await storageArea.set({
      [id]: {
        createdAt: Date.now(),
        tabUrl: tab.url ?? "",
        ...data
      }
    });

    await chrome.action.setBadgeText({ tabId: tab.id, text: String(data.externalCount || "") });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#d32f2f" });

    await chrome.tabs.create({
      url: chrome.runtime.getURL(`report.html#${encodeURIComponent(id)}`)
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (tab?.id) await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    console.error("External Link Extractor failed:", message);
  }
});

