import XCTest

/// Verifies URL delivery through Apple's direct-target UI automation API.
/// The installed candidate handles every URL; this test never injects product state.
@MainActor
final class NativeLinkTests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "dev.vostride.playground")
    private let bugLabel = "Deliberate bug: Quantity ignored in totals"

    override func setUpWithError() throws {
        continueAfterFailure = false
        // The product store and bug flags are process-local. Restart once, then
        // keep this same app session for every URL in the journey.
        app.terminate()
        app.launch()
        requireText("Make yourself at home.")
        XCTAssertFalse(app.staticTexts[bugLabel].exists)
    }

    override func tearDownWithError() throws {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "Native link final screen"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "Native link accessibility hierarchy"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
        app.terminate()
    }

    func testNativeURLsReachEveryProductAndPreserveWarmBugState() {
        visit("playground://home", named: "Home") {
            self.requireText("Make yourself at home.")
            self.requireElement(self.app.buttons["Open Fernwood"], "Home product launcher")
        }

        visit("playground://flights", named: "Wayline search") {
            self.requireText("A LITTLE FURTHER. A LITTLE FREER.")
            self.requireElement(self.app.buttons["Explore flights"], "Wayline navigation")
        }

        visit("playground://flights/bookings", named: "Wayline bookings") {
            self.requireElement(self.element("field-find-a-booking"), "Booking search field")
            self.requireText("Booking WL6P2K")
        }

        visit("playground://observability/logs", named: "Vigil logs") {
            self.requireText("Log explorer")
            self.requireElement(self.element("vigil-field-log-search-query"), "Log query field")
        }

        visit("playground://observability/monitors", named: "Vigil monitors") {
            self.requireElement(self.app.buttons["New monitor"], "New monitor action")
            self.requireElement(self.element("vigil-field-search-monitors"), "Monitor search field")
        }

        visit("playground://tasks", named: "Corkboard board") {
            self.requireElement(self.app.buttons["task-card-CKB-001"], "Seeded Corkboard card")
            self.requireText("Product launch")
        }

        visit("playground://tasks/task/CKB-001", named: "Corkboard task detail") {
            let title = self.element("task-detail-title")
            self.requireElement(title, "Task detail title")
            XCTAssertEqual(title.value as? String, "Explore a more useful empty state")
            self.requireElement(self.app.buttons["Close CKB-001"], "Correct task detail sheet")
        }
        // Close the actual sheet before leaving its product. No status/edit
        // action is used, keeping the seed unchanged for the routing assertions.
        app.buttons["Close CKB-001"].tap()
        waitUntil("The task detail sheet must close") {
            !self.app.buttons["Close CKB-001"].exists
        }

        visit("playground://shop?bug=cart-total", named: "Fernwood opt-in catalog") {
            self.requireText("THE EVERYDAY COLLECTION")
            self.requireElement(self.element("field-search-products"), "Catalog search field")
            self.requireText(self.bugLabel)
        }

        visit("playground://shop/cart", named: "Fernwood cart") {
            self.requireEmptyCart()
            self.requireText(self.bugLabel)
        }

        visit("playground://home", named: "Leave Fernwood without restarting") {
            self.requireText("Make yourself at home.")
            XCTAssertFalse(self.app.staticTexts[self.bugLabel].exists)
        }

        // No bug query on this URL: the visible label must come from the warm
        // app session retained across product unmounts and native URL delivery.
        visit("playground://shop/cart", named: "Warm cart retains opt-in flag") {
            self.requireEmptyCart()
            self.requireText(self.bugLabel)
        }
    }

    private func requireEmptyCart() {
        requireText("Your bag (0)")
        requireText("A little room for something good.")
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    private func requireText(
        _ label: String, file: StaticString = #filePath, line: UInt = #line
    ) {
        requireElement(app.staticTexts[label].firstMatch, label, file: file, line: line)
    }

    private func requireElement(
        _ element: XCUIElement,
        _ description: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(
            element.waitForExistence(timeout: 20),
            "Missing route landmark: \(description)", file: file, line: line
        )
    }

    private func visit(_ link: String, named title: String, verify: () -> Void) {
        XCTContext.runActivity(named: "\(title): \(link)") { activity in
            // This API selects the installed app by bundle identifier. Unlike
            // simctl openurl, it does not test the system scheme-chooser dialog.
            app.open(URL(string: link)!)
            verify()
            XCTAssertEqual(app.state, .runningForeground)
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = title
            screenshot.lifetime = .keepAlways
            activity.add(screenshot)
        }
    }

    private func waitUntil(_ message: String, condition: @escaping () -> Bool) {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in condition() }, object: nil
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [expectation], timeout: 10), .completed, message
        )
    }
}
