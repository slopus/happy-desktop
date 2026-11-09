import { HAPPY_MOBILE_STORE_URLS } from "../DesktopMobileSetup";
import { QRCode } from "../QRCode";
import { Ionicon } from "../vectorIcons/VectorIcon";

/** The stores the phone app comes from, each code captioned with where it leads. */
const PHONE_STORES = [
    { name: "App Store", icon: "logo-apple-appstore", url: HAPPY_MOBILE_STORE_URLS.ios },
    { name: "Google Play", icon: "logo-google-playstore", url: HAPPY_MOBILE_STORE_URLS.android },
] as const;

/**
 * Chat UI `phone_app`: the two codes that download Happy on a phone, side by
 * side, flat on the chat. It takes no input.
 */
export function UiPhoneApp() {
    return (
        <div
            className="happy-chat-action happy-chat-action__phone"
            data-happy-desktop-ui="chat-ui-phone-app"
        >
            {PHONE_STORES.map((store) => (
                <div className="happy-chat-action__store" key={store.name}>
                    <QRCode data={store.url} label={`Happy on ${store.name}`} size={120} />
                    <span className="happy-chat-action__store-name">
                        <Ionicon name={store.icon} size={16} />
                        {store.name}
                    </span>
                </div>
            ))}
        </div>
    );
}
