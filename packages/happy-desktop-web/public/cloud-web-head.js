// The cloud web app's tab before the app loads: its server's name as the
// title, and the server picture it last showed as the icon, so a reload shows
// neither Happy's defaults first. The app keeps both records under the same
// keys (cloudWebTab.ts) and replaces them once the server says what they are now.
(function () {
    var name;
    try {
        name = window.localStorage.getItem("happy.title");
    } catch (error) {
        name = null;
    }
    document.title = name || window.location.hostname.split(".")[0];
    var cache;
    try {
        cache = JSON.parse(window.localStorage.getItem("happy.favicon") || "null");
    } catch (error) {
        return;
    }
    if (!cache || typeof cache.icon !== "string" || typeof cache.touch !== "string") return;
    var defaults = document.querySelectorAll('link[data-happy-icon="default"]');
    for (var index = 0; index < defaults.length; index++) {
        defaults[index].setAttribute("data-rel", defaults[index].rel);
        defaults[index].rel = "happy-default-icon";
    }
    var icon = document.createElement("link");
    icon.setAttribute("data-happy-icon", "server");
    icon.rel = "icon";
    icon.type = "image/png";
    icon.href = cache.icon;
    var touch = document.createElement("link");
    touch.setAttribute("data-happy-icon", "server");
    touch.rel = "apple-touch-icon";
    touch.href = cache.touch;
    document.head.appendChild(icon);
    document.head.appendChild(touch);
})();
