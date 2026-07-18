/**
 * NoCap embeddable widget — drop on any hackathon submission page.
 *
 * Usage:
 *   <div data-nocap-owner="0x..." data-nocap-repoid="0x..." data-nocap-base=""></div>
 *   <script src="/widget.js" async></script>
 */
(function () {
  function mount(el) {
    var owner = el.getAttribute("data-nocap-owner");
    var repoId = el.getAttribute("data-nocap-repoid");
    var base = el.getAttribute("data-nocap-base") || "";
    if (!owner || !repoId) return;
    var iframe = document.createElement("iframe");
    iframe.src = base + "/embed/" + owner + "/" + repoId;
    iframe.width = el.getAttribute("data-width") || "360";
    iframe.height = el.getAttribute("data-height") || "120";
    iframe.style.border = "0";
    iframe.style.borderRadius = "12px";
    iframe.title = "NoCap build provenance badge";
    el.appendChild(iframe);
  }
  function run() {
    var nodes = document.querySelectorAll("[data-nocap-repoid]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
