import Capacitor
import Foundation

/// Drains screenshots the Share Extension left in the App Group container.
///
/// Bytes cross the bridge as base64 rather than as a file path: the group
/// container is outside the webview's reachable filesystem, and a screenshot
/// is small enough that one copy per share costs nothing noticeable.
///
/// Add this file to the **App** target only.
@objc(ShareIntakePlugin)
public class ShareIntakePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareIntakePlugin"
    public let jsName = "ShareIntake"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingShares", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingShares", returnType: CAPPluginReturnPromise)
    ]

    @objc func getPendingShares(_ call: CAPPluginCall) {
        guard let directory = InspoShared.queueDirectory() else {
            call.resolve(["items": []])
            return
        }

        let contents = (try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.creationDateKey],
            options: [.skipsHiddenFiles]
        )) ?? []

        // Oldest first, so a burst of shares reaches the capture sheet in the
        // order they were taken.
        let ordered = contents.sorted { left, right in
            let leftDate = (try? left.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
            let rightDate = (try? right.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
            return leftDate < rightDate
        }

        var items: [[String: String]] = []
        for url in ordered {
            guard let data = try? Data(contentsOf: url) else { continue }
            items.append([
                "id": url.lastPathComponent,
                "data": data.base64EncodedString(),
                "mime": InspoShared.mimeType(forExtension: url.pathExtension)
            ])
        }

        call.resolve(["items": items])
    }

    @objc func clearPendingShares(_ call: CAPPluginCall) {
        guard let directory = InspoShared.queueDirectory() else {
            call.resolve()
            return
        }

        let ids = call.getArray("ids", String.self) ?? []
        for id in ids {
            // Never let a crafted id walk out of the queue folder.
            guard !id.contains("/"), !id.contains("..") else { continue }
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(id))
        }

        call.resolve()
    }
}
