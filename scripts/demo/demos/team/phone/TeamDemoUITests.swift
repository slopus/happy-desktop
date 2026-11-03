import ObjectiveC
import XCTest

/// XCUITest waits for the app to idle around every action, and home never
/// idles for it; as happy-ios's own direct UI tests do, the private wait goes.
private let skipsQuiescence: Bool = {
    guard let process = NSClassFromString("XCUIApplicationProcess") else { return false }
    var replaced = false
    let one: @convention(block) (AnyObject, Bool) -> Void = { _, _ in }
    let two: @convention(block) (AnyObject, Bool, Bool) -> Void = { _, _, _ in }
    for (name, block) in [
        ("waitForQuiescenceIncludingAnimationsIdle:", one as Any),
        ("waitForQuiescenceIncludingAnimationsIdle:isPreEvent:", two as Any),
    ] {
        guard let method = class_getInstanceMethod(process, NSSelectorFromString(name)) else { continue }
        method_setImplementation(method, imp_implementationWithBlock(block))
        replaced = true
    }
    return replaced
}()

/// Steve's half of the Happy team demo, on the real iPhone. Copied into
/// happy-ios's HappyDirectUITests by `phone/build.sh`; it is not part of
/// happy-ios. The desktop recorder starts each test and reads its marks:
/// every `TEAM_PHONE <mark> <epoch seconds>` line is one moment on the
/// phone, on the same wall clock as the desktop take.
@MainActor
final class TeamDemoUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = false
        // The recorder reads the marks while the test runs, not when it ends.
        setvbuf(stdout, nil, _IOLBF, 0)
        // Steve's phone in dark, like Kirill's desktop: the app's own theme
        // setting, given for this launch in the argument domain.
        app.launchArguments += ["-themePreference", "dark"]
        print("TEAM_PHONE quiescence-skipped \(skipsQuiescence)")
    }

    /// Pairs this phone with Happy Core as Steve. The recorder starts the
    /// pairing as Steve, hands its link over in `TEAM_PAIRING_URL`, and
    /// confirms the emoji on the daemon's side; this is Steve's thumb.
    func testPair() throws {
        let link = try XCTUnwrap(ProcessInfo.processInfo.environment["TEAM_PAIRING_URL"].flatMap(URL.init(string:)))
        app.launch()
        mark("pair-launched")
        app.open(link)
        let match = app.buttons["Emoji match"]
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deadline = Date().addingTimeInterval(120)
        while Date() < deadline, !match.exists {
            for alert in [app.alerts.firstMatch, springboard.alerts.firstMatch] where alert.buttons["Open"].exists {
                alert.buttons["Open"].tap()
            }
            _ = match.waitForExistence(timeout: 1)
        }
        XCTAssertTrue(match.exists, "pairing never showed its emoji")
        mark("pair-emoji")
        pause(1)
        match.tap()
        XCTAssertTrue(row("Team Servers").waitForExistence(timeout: 90), "Steve's sidebar never arrived")
        mark("paired")
        capture("paired")
    }

    /// The take. Steve's sidebar rests until Kirill's task arrives; he opens
    /// it, watches the preview land, and answers.
    func testTake() throws {
        let environment = ProcessInfo.processInfo.environment
        let task = environment["TEAM_TASK"] ?? "Voice waveform"
        let question = environment["TEAM_QUESTION"] ?? "how does it look?"
        let answer = environment["TEAM_ANSWER"] ?? "Love it. Narrower though, five bars max."
        app.launch()
        XCTAssertTrue(row("Team Servers").waitForExistence(timeout: 60), "Steve's sidebar never arrived")
        pause(1)
        mark("ready")
        let arrived = row(task)
        XCTAssertTrue(arrived.waitForExistence(timeout: 900), "Kirill's task never reached the phone")
        mark("task-arrived")
        pause(2.6)
        arrived.tap()
        mark("task-opened")
        let reply = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", question)).firstMatch
        XCTAssertTrue(reply.waitForExistence(timeout: 300), "the preview never reached the phone")
        mark("preview-seen")
        pause(3)
        let composer = app.textViews["composer"]
        XCTAssertTrue(composer.waitForExistence(timeout: 10))
        composer.tap()
        if app.buttons["Continue"].waitForExistence(timeout: 1) { app.buttons["Continue"].tap(); pause(0.5) }
        pause(0.8)
        mark("typing")
        for character in answer {
            composer.typeText(String(character))
        }
        mark("typed")
        pause(0.6)
        // Steve puts the keyboard away the way a thumb does: a short drag
        // down from just above the composer, which the transcript hands to
        // the keyboard (interactive dismissal), so the answer that follows
        // has the whole screen. Where it starts is measured before Send, so
        // the drag follows the send at once.
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let start = origin.withOffset(CGVector(dx: app.frame.midX, dy: composer.frame.minY - 44))
        let end = origin.withOffset(CGVector(dx: app.frame.midX, dy: app.frame.maxY - 6))
        app.buttons["Send"].tap()
        mark("sent")
        if app.buttons["Continue"].exists { app.buttons["Continue"].tap() }
        pause(0.3)
        for attempt in 0..<2 where attempt == 0 || app.keyboards.count > 0 {
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: 700, thenHoldForDuration: 0.05)
            pause(0.6)
        }
        mark(app.keyboards.count == 0 ? "keyboard-down" : "keyboard-stayed")
        pause(Double(environment["TEAM_TAIL_SECONDS"] ?? "8") ?? 8)
        mark("done")
    }

    private func row(_ label: String) -> XCUIElement {
        app.descendants(matching: .any)["row:space:\(label)"]
    }

    private func mark(_ name: String) {
        print(String(format: "TEAM_PHONE %@ %.3f", name, Date().timeIntervalSince1970))
    }

    private func pause(_ seconds: TimeInterval) {
        Thread.sleep(forTimeInterval: seconds)
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
