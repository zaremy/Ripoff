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

        // Markup sidecars are attached to their image rather than listed.
        let snapshots = ordered.filter { $0.pathExtension == InspoShared.snapshotExtension }
        let images = ordered.filter { $0.pathExtension != InspoShared.snapshotExtension }

        func snapshot(for base: String) -> String? {
            guard
                let sidecar = snapshots.first(where: { $0.deletingPathExtension().lastPathComponent == base }),
                let data = try? Data(contentsOf: sidecar)
            else { return nil }
            return String(data: data, encoding: .utf8)
        }

        var items: [[String: String]] = []
        var claimed = Set<String>()

        for url in images {
            guard let data = try? Data(contentsOf: url) else { continue }
            let base = url.deletingPathExtension().lastPathComponent
            var item: [String: String] = [
                "id": url.lastPathComponent,
                "data": data.base64EncodedString(),
                "mime": InspoShared.mimeType(forExtension: url.pathExtension)
            ]
            if let markup = snapshot(for: base) {
                item["snapshot"] = markup
                claimed.insert(base)
            }
            items.append(item)
        }

        // A page shared from Safari has markup and no image at all; the app
        // draws its cover.
        for url in snapshots {
            let base = url.deletingPathExtension().lastPathComponent
            guard !claimed.contains(base), let data = try? Data(contentsOf: url) else { continue }
            guard let markup = String(data: data, encoding: .utf8) else { continue }
            items.append(["id": url.lastPathComponent, "snapshot": markup])
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
            let file = directory.appendingPathComponent(id)
            try? FileManager.default.removeItem(at: file)
            // The markup sidecar shares the image's name and goes with it.
            try? FileManager.default.removeItem(
                at: file.deletingPathExtension().appendingPathExtension(InspoShared.snapshotExtension)
            )
        }

        call.resolve()
    }
}
