(function(){
  "use strict";

  function polishControl(control){
    if(control.dataset.controlPolished === "1") return;
    var icon = control.querySelector(".btn-ico");
    var label = control.querySelector(".btn-text.optional");
    if(!icon || !label) return;
    var text = (label.textContent || "").trim();
    if(!text) return;
    control.dataset.controlPolished = "1";
    control.classList.add("admin-icon-only");
    if(!control.getAttribute("title")) control.setAttribute("title", text);
    if(!control.getAttribute("aria-label")) control.setAttribute("aria-label", text);
  }

  function init(){
    document.querySelectorAll("button, a.btn").forEach(polishControl);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
  else init();
})();
