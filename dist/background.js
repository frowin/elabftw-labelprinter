(()=>{chrome.action.onClicked.addListener(async e=>{if(e.id)try{await chrome.tabs.sendMessage(e.id,{action:"toggle-panel"})}catch{}});})();
//# sourceMappingURL=background.js.map
