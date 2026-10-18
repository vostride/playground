import XCTest

/// This target drives the already-installed candidate; it has no app build dependency.
@MainActor
final class CorkboardDragTests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "dev.vostride.playground")

    override func setUpWithError() throws {
        continueAfterFailure = false
        // Product state is session-only. A process restart restores the seeded board.
        app.terminate()
        app.launch()
        app.open(URL(string: "playground://tasks/board/board-1")!)
        XCTAssertTrue(card("CKB-001").waitForExistence(timeout: 20))
        waitUntil("The first backlog cards must be available for a real touch gesture") {
            self.card("CKB-001").isHittable && self.card("CKB-002").isHittable
        }
    }

    override func tearDownWithError() throws {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "Accessibility hierarchy"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
        app.terminate()
    }

    func testHeldDragReordersWithinColumnAndUndoRestoresOrder() {
        let first = card("CKB-001")
        let second = card("CKB-002")
        XCTAssertLessThan(first.frame.minY, second.frame.minY)
        XCTAssertEqual(first.frame.minX, second.frame.minX, accuracy: 2)

        // Move the second card upward, avoiding the bottom edge auto-scroll zone.
        // The initial 0.8-second hold and movement are one continuous native gesture.
        let source = second.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.22))
        let destination = first.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35))
        source.press(forDuration: 0.8, thenDragTo: destination)

        waitUntil("CKB-002 must visibly precede CKB-001 after the held drag") {
            second.frame.minY < first.frame.minY && abs(second.frame.minX - first.frame.minX) < 2
        }
        attachScreenshot("Within-column order changed by touch")

        undoLastChange()
        waitUntil("Undo must restore the original backlog order") {
            first.frame.minY < second.frame.minY && abs(second.frame.minX - first.frame.minX) < 2
        }
    }

    func testHeldDragMovesAcrossColumnsAndUndoRestoresStatus() {
        let source = card("CKB-001")
        let target = card("CKB-007")
        XCTAssertTrue(target.waitForExistence(timeout: 10))
        let originalX = source.frame.minX

        // On the CI iPhone 16, the next column is partially visible. Derive a point
        // from its actual card bounds and keep it outside the 40-point edge-scroll
        // activation band. There are no device-specific screen coordinates here.
        let reachable = target.frame.intersection(app.frame.insetBy(dx: 48, dy: 0))
        XCTAssertFalse(reachable.isNull, "The To do column must have a visible drop area")
        XCTAssertGreaterThan(reachable.width, 8)
        let dropPoint = CGPoint(x: reachable.midX, y: target.frame.minY + target.frame.height * 0.35)
        let windowOrigin = app.coordinate(withNormalizedOffset: .zero)
        let destination = windowOrigin.withOffset(
            CGVector(dx: dropPoint.x - app.frame.minX, dy: dropPoint.y - app.frame.minY)
        )
        source.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35))
            .press(forDuration: 0.8, thenDragTo: destination)

        waitUntil("The dragged card must move into the adjacent To do column") {
            source.frame.minX > originalX + 200 && abs(source.frame.minX - target.frame.minX) < 2
        }
        openSourceDetails()
        waitUntil("A touch drop must update the task's actual status to To do") {
            self.app.buttons["task-status-todo"].isSelected
        }
        XCTAssertFalse(app.buttons["task-status-backlog"].isSelected)
        attachScreenshot("Cross-column touch drop saved To do")

        app.buttons["Close CKB-001"].tap()
        undoLastChange()
        waitUntil("Undo must return the card to its original column") {
            abs(source.frame.minX - originalX) < 2
        }
        openSourceDetails()
        waitUntil("Undo must restore the task's Backlog status") {
            self.app.buttons["task-status-backlog"].isSelected
        }
        XCTAssertFalse(app.buttons["task-status-todo"].isSelected)
    }

    private func card(_ id: String) -> XCUIElement {
        app.buttons["task-card-\(id)"]
    }

    private func openSourceDetails() {
        let source = card("CKB-001")
        XCTAssertTrue(source.waitForExistence(timeout: 10))
        XCTAssertTrue(source.isHittable, "The moved card must be reachable without restarting the app")
        // The adjacent column is only partially visible. Tap its visible card
        // area without an automatic scroll, preserving the viewport and undo
        // history used by the assertions below. Deep links have a separate flow.
        let reachable = source.frame.intersection(app.frame.insetBy(dx: 8, dy: 8))
        XCTAssertFalse(reachable.isNull, "The moved card must intersect the app viewport")
        XCTAssertGreaterThan(reachable.width, 8)
        XCTAssertGreaterThan(reachable.height, 8)
        let point = CGPoint(x: reachable.midX, y: reachable.minY + reachable.height * 0.35)
        app.coordinate(withNormalizedOffset: .zero).withOffset(
            CGVector(dx: point.x - app.frame.minX, dy: point.y - app.frame.minY)
        ).tap()
        XCTAssertTrue(
            app.descendants(matching: .any).matching(identifier: "task-detail-title")
                .firstMatch.waitForExistence(timeout: 10)
        )
        let status = app.buttons["task-status-todo"]
        // Details can scroll on smaller screens. Only scroll its content after the
        // sheet is open; the drag assertions themselves never use status buttons.
        for _ in 0..<4 {
            if status.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(status.isHittable)
    }

    private func undoLastChange() {
        let undo = app.buttons["Undo last change"]
        XCTAssertTrue(undo.waitForExistence(timeout: 5))
        XCTAssertTrue(undo.isEnabled, "A successful drag must create an undo entry")
        undo.tap()
    }

    private func waitUntil(
        _ message: String,
        timeout: TimeInterval = 10,
        file: StaticString = #filePath,
        line: UInt = #line,
        condition: @escaping () -> Bool
    ) {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in condition() }, object: nil
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [expectation], timeout: timeout), .completed,
            message, file: file, line: line
        )
    }

    private func attachScreenshot(_ title: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = title
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
