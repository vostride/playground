import XCTest

/// Separate from the normal online scheme. Drives only the installed release candidate.
@MainActor
final class OfflineLaunchTests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "dev.vostride.playground")
    private enum SmokeError: Error { case missing(String), harness(String) }

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDownWithError() throws {
        attach("Offline final screen")
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "Offline accessibility hierarchy"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
        // Leave candidate cleanup to the workflow's simulator shutdown after PF
        // restoration; synchronous termination here consumed the blocked interval.
    }

    func testFreshLaunchEveryProductAndLocalWebViewWithoutNetwork() async throws {
        // The independent host harness verifies the real PF block before replying.
        // With no harness URL this test fails; running its scheme online cannot claim offline proof.
        try await control("begin")
        app.terminate()
        app.launch()
        try require(element("home-open-shop"), "Home product launcher")
        attach("Offline fresh launch")

        try tap("tab-shop")
        try require(element("shop-products-heading"), "Komazon products")
        try require(element("shop-product-FW-0001"), "Komazon seeded product")
        attach("Offline Komazon catalog")

        try tap("tab-flights")
        try require(app.staticTexts["Flight search"].firstMatch, "Looking search form")
        try require(element("flight-from-picker"), "Looking departure picker")
        attach("Offline Looking search")

        try tap("tab-tasks")
        try require(element("task-board-title"), "Brello board")
        try require(element("task-card-CKB-001"), "Brello seeded task")
        attach("Offline Brello board")

        try tap("tab-observability")
        try require(app.staticTexts["Production overview"].firstMatch, "PepaPog overview")
        try require(element("vigil-metric-request-rate"), "PepaPog rendered request metric")
        attach("Offline PepaPog overview")

        try tap("tab-home")
        try tap("button-a-quick-guide-to-the-playground")
        let web = app.webViews.firstMatch
        try require(web, "Local help WebView")
        // Require actual DOM text within the WebView, not the native sheet's Help heading.
        try require(web.staticTexts["Navigation"].firstMatch, "Local help HTML heading")
        try require(web.staticTexts[
            "Choose an app from Home or use the bottom tabs. Use the back button to return to the previous screen."
        ].firstMatch, "Local help HTML content")
        attach("Offline local WebView content")
        try await control("complete")
        // Completion only records a marker. The host still waits for XCTest to exit and
        // repeats blocked-network probes before restoring its own anchor/reference.
    }

    private func control(_ operation: String) async throws {
        guard let raw = ProcessInfo.processInfo.environment["PLAYGROUND_OFFLINE_CONTROL_URL"],
              let base = URL(string: raw), base.scheme == "http", base.host == "127.0.0.1",
              let port = base.port, port > 0,
              let url = URL(string: "\(raw)/\(operation)") else {
            throw SmokeError.harness("The independent CI offline harness is required.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = operation == "begin" ? 20 : 3
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              value["active"] as? Bool == true,
              let remaining = value["remainingMs"] as? Double, remaining > 0 else {
            throw SmokeError.harness("PF offline interval is not active: \(String(decoding: data, as: UTF8.self))")
        }
    }

    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func tap(_ id: String) throws {
        let target = element(id)
        try require(target, id)
        guard target.isHittable else { throw SmokeError.missing("Unhittable control: \(id)") }
        target.tap()
    }

    private func require(_ target: XCUIElement, _ description: String) throws {
        guard target.waitForExistence(timeout: 3) else { throw SmokeError.missing(description) }
    }

    private func attach(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
