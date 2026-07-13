(() => {
  const styleId = "taric-layout-order-fix";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      main { display: flex; flex-direction: column; }
      main > nav { order: 0; }
      main > .top-drawer { order: 1; }
      main > .hero { order: 2; }
      main > .agent-panel { order: 3; }
      main > .result { order: 4; }
      main > .grid { order: 5; }
      main > footer { order: 6; }
    `;
    document.head.appendChild(style);
  }

  const syncBrowseLabel = () => {
    const nav = document.querySelector("main > nav");
    const browseButton = nav?.querySelector(".nav-actions > button:first-child");
    if (!browseButton) return;
    const huActive = nav.querySelector(".language > button:first-child")?.classList.contains("active");
    const expected = huActive ? "Tallózás" : "Browse";
    if (browseButton.textContent !== expected) browseButton.textContent = expected;
  };

  const start = () => {
    syncBrowseLabel();
    const observer = new MutationObserver(syncBrowseLabel);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
