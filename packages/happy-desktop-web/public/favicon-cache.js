// Puts back the server picture the cloud web app last showed as its tab icon,
// before the app loads, so a reload does not show Happy's icon first. The app
// keeps this record under the same key (cloudWebFavicon.ts) and replaces the
// icon once the server says what its picture is now.
(function () {
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
